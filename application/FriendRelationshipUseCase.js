import { EventBus } from '../core/events/EventBus.js';
import { FriendshipRecord } from '../core/FriendshipRecord.js';
import { FriendshipState } from '../core/FriendshipState.js';
import {
    FriendshipAction,
    toFriendshipAdvertisement,
    isValidFriendshipAdvertisement,
    getFriendshipSigningDescriptor
} from '../core/FriendshipAdvertisement.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';

const RELATIONSHIPS_CHANGED_EVENT = 'FriendRelationshipsChanged';
const STORAGE_KEY_PREFIX = 'friend-relationships:';

// 0.2.57 — Decentralized Friend Relationships & Mutual Consent.
//
// "How can Alice and Bob become friends without a central server
// deciding that they are?" — the question 0.2.56 named and explicitly
// declined to answer (docs/Principles.md, "Knowing Is Not Befriending").
// This class answers it with a signed REQUEST/ACCEPT exchange, carried
// directly over `peer/PeerMessageBus.js` between two already-
// AUTHENTICATED (0.2.49) peers, and two independently persisted
// `core/FriendshipRecord.js` halves — one on Alice's device, one on
// Bob's — that never require a third party to agree with each other.
// See docs/Principles.md, "A Friend Request Is Signed Evidence, Never A
// Server Record" (0.2.57).
//
// Deliberately its own class, never folded into
// application/PeerRelationshipUseCase.js: a `core/PeerRelationship.js`
// is a one-sided local note requiring nothing from Bob; a
// `core/FriendshipRecord.js` can only ever reach FRIEND once BOTH
// sides have produced a signature the other side can verify. Mixing
// the two storage keys, or the two status vocabularies, would quietly
// let "I remembered someone" and "we mutually agreed" drift toward
// looking like the same fact — see docs/Principles.md, "Friendship Is
// Mutual Consent, Never A Unilateral Claim."
//
// This class OWNS sending/receiving the friendship protocol itself —
// unlike PeerRelationshipUseCase (pure local storage, no network at
// all), a friend request only means anything once it has actually
// reached the other identity, so persistence and transport are one
// boundary here, not two. `peerMessageBus`/`connectedPeerRegistry` are
// shared, injected collaborators this class never owns or disposes
// (mirroring presence/PeerAvatarPresenceBroadcastProvider.js's own
// convention exactly) — a future protocol built on the same
// PeerMessageBus attaches to the identical set of peers, independently.
export class FriendRelationshipUseCase {
    constructor(storageProvider, identityProvider, {
        peerMessageBus,
        connectedPeerRegistry,
        verifier = new LocalAuthorizationVerifier(),
        protocol = FriendRelationshipUseCase.DEFAULT_PROTOCOL
    } = {}) {
        if (!storageProvider) {
            throw new Error('FriendRelationshipUseCase: storageProvider is required');
        }
        if (!identityProvider) {
            throw new Error('FriendRelationshipUseCase: identityProvider is required');
        }
        if (!peerMessageBus || typeof peerMessageBus.send !== 'function' || typeof peerMessageBus.subscribe !== 'function' || typeof peerMessageBus.attach !== 'function') {
            throw new Error('FriendRelationshipUseCase: a PeerMessageBus is required');
        }
        if (!connectedPeerRegistry || typeof connectedPeerRegistry.list !== 'function' || typeof connectedPeerRegistry.onChange !== 'function') {
            throw new Error('FriendRelationshipUseCase: a ConnectedPeerRegistry is required');
        }
        this._storageProvider = storageProvider;
        this._identityProvider = identityProvider;
        this._bus = peerMessageBus;
        this._registry = connectedPeerRegistry;
        this._verifier = verifier;
        this._protocol = protocol;
        this._eventBus = new EventBus();

        // Every peer already connected when this use case is built, and
        // every one that connects afterward, is attached to the shared
        // bus — attach() is idempotent per connectionId (see
        // peer/PeerMessageBus.js's own header) and self-detaches on
        // CLOSED/FAILED, so this never needs undoing by hand.
        for (const peer of this._registry.list()) {
            this._bus.attach(peer);
        }
        this._unsubscribeRegistry = this._registry.onChange((peers) => {
            for (const peer of peers) {
                this._bus.attach(peer);
            }
        });
        this._unsubscribeBus = this._bus.subscribe(this._protocol, (payload, meta) => this._handleIncoming(payload, meta));
    }

    // Every friendship record the current local user holds, ordered by
    // identityId for a stable render order — a UI wanting a friendly
    // name cross-references application/PeerRelationshipUseCase.js's
    // own alias, exactly the way ui/views/PeerConnectionsView.js's
    // "Known Peers" list already cross-references "My Peers" for live
    // connection status, never a second, duplicated alias field here.
    getRelationships() {
        return this._loadAll().sort((a, b) => a.identityId.localeCompare(b.identityId));
    }

    getRelationship(identityId) {
        return this._loadAll().find((r) => r.identityId === identityId) || null;
    }

    // Convenience read: FriendshipState.NONE for an identity with no
    // record at all, never null/undefined — a caller never needs a
    // separate null-check before comparing against the vocabulary.
    getState(identityId) {
        const record = this.getRelationship(identityId);
        return record ? record.status : FriendshipState.NONE;
    }

    // Alice's "Send Friend Request" gesture. `connectedPeer` MUST be a
    // real, currently AUTHENTICATED application/ConnectedPeer.js — see
    // this class's own header: a request that cannot actually be
    // delivered right now is refused rather than queued, the same
    // "refuse rather than silently queue" discipline
    // peer/PeerMessageBus.js#send() already applies one layer down.
    sendFriendRequest(connectedPeer) {
        const peerIdentity = this._requireAuthenticatedPeer(connectedPeer);
        const owner = this._requireCurrentUsername();
        const all = this._loadAll();
        const existing = all.find((r) => r.identityId === peerIdentity.identityId);
        if (existing && existing.status === FriendshipState.FRIEND) {
            throw new Error('FriendRelationshipUseCase: already friends with this identity');
        }
        if (existing && existing.outgoingAction) {
            throw new Error('FriendRelationshipUseCase: a friend request has already been sent to this identity');
        }
        const advertisement = this._signAction(FriendshipAction.REQUEST, peerIdentity.identityId);
        this._bus.send(connectedPeer, this._protocol, advertisement);
        const record = (existing || FriendshipRecord.fromPeerIdentity(peerIdentity)).withOutgoingAction(advertisement);
        this._saveAll(owner, replaceById(all, record));
        this._publishChange();
        return record;
    }

    // Bob's "Accept" gesture — answers an existing PENDING incoming
    // REQUEST from `connectedPeer`'s already-proven remoteIdentity.
    // Never creates a relationship out of nothing: refuses, with a
    // clear message, if no such request is on record — see docs/
    // Principles.md, "Friendship Is Mutual Consent, Never A Unilateral
    // Claim."
    acceptFriendRequest(connectedPeer) {
        const peerIdentity = this._requireAuthenticatedPeer(connectedPeer);
        const owner = this._requireCurrentUsername();
        const all = this._loadAll();
        const existing = all.find((r) => r.identityId === peerIdentity.identityId);
        if (!existing || !existing.incomingAction || existing.incomingAction.action !== FriendshipAction.REQUEST) {
            throw new Error('FriendRelationshipUseCase: no pending friend request from this identity');
        }
        if (existing.outgoingAction) {
            throw new Error('FriendRelationshipUseCase: already responded to this identity');
        }
        const advertisement = this._signAction(FriendshipAction.ACCEPT, peerIdentity.identityId);
        this._bus.send(connectedPeer, this._protocol, advertisement);
        const record = existing.withOutgoingAction(advertisement);
        this._saveAll(owner, replaceById(all, record));
        this._publishChange();
        return record;
    }

    // Returns an unsubscribe function. Fires with the full current
    // relationship list on every sent/accepted/received action —
    // mirroring application/PeerRelationshipUseCase.js#onRelationshipsChanged's
    // own shape exactly.
    onRelationshipsChanged(callback) {
        const subscription = this._eventBus.subscribe(
            RELATIONSHIPS_CHANGED_EVENT,
            ({ relationships }) => callback(relationships)
        );
        return () => subscription.unsubscribe();
    }

    dispose() {
        if (this._unsubscribeRegistry) {
            this._unsubscribeRegistry();
            this._unsubscribeRegistry = null;
        }
        if (this._unsubscribeBus) {
            this._unsubscribeBus();
            this._unsubscribeBus = null;
        }
        // Deliberately does NOT dispose the injected peerMessageBus or
        // connectedPeerRegistry — both are shared collaborators that
        // outlive this one protocol's use case, exactly like
        // presence/PeerAvatarPresenceBroadcastProvider.js's own
        // dispose().
    }

    // The ingestion boundary. Nothing arriving over the wire is trusted
    // structurally, let alone as evidence of consent, until every one
    // of these checks passes, IN ORDER:
    //   1. well-formed shape
    //   2. addressed to the identity currently signed in on THIS
    //      device (never a stale message meant for a different local
    //      identity, or for someone else entirely)
    //   3. the claimed actor really is who this specific, already-
    //      AUTHENTICATED connection proved during 0.2.49 handshake —
    //      never merely whatever the payload itself claims
    //   4. the signature verifies against that same actor's key
    //   5. (ACCEPT only) this device actually has a matching
    //      outgoing REQUEST on record — an unsolicited ACCEPT with
    //      nothing to answer proves nothing and is discarded
    // Only then is it stored as this relationship's incomingAction.
    _handleIncoming(payload, meta) {
        if (!isValidFriendshipAdvertisement(payload)) {
            return;
        }
        const owner = this._currentUsernameOrNull();
        if (!owner) {
            return;
        }
        let myIdentityId;
        try {
            myIdentityId = this._identityProvider.getSigningIdentity().id;
        } catch {
            return;
        }
        if (payload.subjectIdentity !== myIdentityId) {
            return;
        }
        const remoteIdentity = meta.connectedPeer && meta.connectedPeer.remoteIdentity;
        if (!remoteIdentity || remoteIdentity.identityId !== payload.actorIdentity) {
            return;
        }
        if (!this._verifier.verifyFriendshipAdvertisement(payload).valid) {
            return;
        }

        const all = this._loadAll();
        let record = all.find((r) => r.identityId === payload.actorIdentity);
        if (payload.action === FriendshipAction.ACCEPT
            && (!record || !record.outgoingAction || record.outgoingAction.action !== FriendshipAction.REQUEST)) {
            return;
        }
        record = (record || FriendshipRecord.fromPeerIdentity(remoteIdentity)).withIncomingAction(payload);
        this._saveAll(owner, replaceById(all, record));
        this._publishChange();
    }

    _signAction(action, subjectIdentity) {
        const signingIdentity = this._identityProvider.getSigningIdentity();
        const advertisement = toFriendshipAdvertisement({ actorIdentity: signingIdentity.id, subjectIdentity, action });
        const signature = this._identityProvider.signCanonical(getFriendshipSigningDescriptor(advertisement));
        return { ...advertisement, signature: signature.toJSON() };
    }

    _requireAuthenticatedPeer(connectedPeer) {
        if (!connectedPeer || typeof connectedPeer.getLifecycleState !== 'function') {
            throw new Error('FriendRelationshipUseCase: a ConnectedPeer is required');
        }
        if (connectedPeer.getLifecycleState() !== PeerLifecycleState.AUTHENTICATED || !connectedPeer.remoteIdentity) {
            throw new Error('FriendRelationshipUseCase: the peer must be an authenticated connection');
        }
        return connectedPeer.remoteIdentity;
    }

    _loadAll() {
        const owner = this._currentUsernameOrNull();
        if (!owner) {
            return [];
        }
        const stored = this._storageProvider.load(STORAGE_KEY_PREFIX + owner) || [];
        return stored.map((json) => FriendshipRecord.fromJSON(json)).filter(Boolean);
    }

    _saveAll(owner, relationships) {
        this._storageProvider.save(STORAGE_KEY_PREFIX + owner, relationships.map((r) => r.toJSON()));
    }

    _publishChange() {
        this._eventBus.publish(RELATIONSHIPS_CHANGED_EVENT, { relationships: this.getRelationships() });
    }

    _requireCurrentUsername() {
        const owner = this._currentUsernameOrNull();
        if (!owner) {
            throw new Error('FriendRelationshipUseCase: no user is currently logged in');
        }
        return owner;
    }

    _currentUsernameOrNull() {
        const user = this._identityProvider.currentUser();
        return user ? user.username : null;
    }
}

// Deliberately the same protocol-name convention every PeerMessageBus
// consumer uses (see presence/PeerAvatarPresenceBroadcastProvider.js's
// own DEFAULT_PROTOCOL) — one logical protocol identity, namespaced so
// it can never collide with presence/profile/interaction traffic
// multiplexed over the same connection.
FriendRelationshipUseCase.DEFAULT_PROTOCOL = 'forkbuild:friendship';

function replaceById(relationships, relationship) {
    const withoutExisting = relationships.filter((r) => r.identityId !== relationship.identityId);
    withoutExisting.push(relationship);
    return withoutExisting;
}
