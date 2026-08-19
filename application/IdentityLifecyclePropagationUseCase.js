import { EventBus } from '../core/events/EventBus.js';
import { RemoteIdentityLifecycle } from '../core/RemoteIdentityLifecycle.js';
import {
    IdentityLifecycleGossipKind,
    toIdentityLifecycleGossipMessage,
    isValidIdentityLifecycleGossipMessage
} from '../core/IdentityLifecycleGossip.js';
import { isValidIdentityRevocationRecord } from '../core/IdentityRevocationEnvelope.js';
import { isValidIdentitySuccessionRecord } from '../core/IdentitySuccessionEnvelope.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';

const LIFECYCLE_CHANGED_EVENT = 'RemoteIdentityLifecycleChanged';
const STORAGE_KEY_PREFIX = 'remote-identity-lifecycle:';

// 0.2.68 — Identity Lifecycle Propagation.
//
// 0.2.67 gave `identity/LocalIdentityProvider.js` two signed, durable,
// self-attested lifecycle facts — revokeIdentity() and
// declareSuccessor() — and named, rather than hid, the gap it left
// open: both facts stayed on the revoking device only. This class
// closes that gap the same way application/FriendRelationshipUseCase.js
// closed 0.2.56's own "how does Bob learn Alice did something" gap —
// a namespaced peer/PeerMessageBus.js protocol
// ('forkbuild:identity-lifecycle'), never a modification to
// peer/PeerAuthenticationSession.js or any existing peer/ protocol.
//
// The one property that makes this class fundamentally DIFFERENT from
// FriendRelationshipUseCase, and worth stating plainly: a friendship
// advertisement is a FIRST-PERSON claim ("I, the identity that
// authenticated THIS connection, did X") — its ingestion boundary
// binds the claimed actor to the specific, already-authenticated
// connection the message arrived on (see that file's own header). An
// identity-lifecycle record is a THIRD-PARTY relay — Charlie, already
// connected to Bob, can legitimately hand Bob a revocation Alice
// signed, without Charlie being Alice or even ever having been
// directly connected to her. What makes a gossiped record trustworthy
// is never WHO relayed it — it is the record's OWN signature, exactly
// the same core/IdentityRevocationEnvelope.js /
// core/IdentitySuccessionEnvelope.js signature identity/
// LocalAuthorizationVerifier.js already knows how to verify, produced
// back in 0.2.67. See docs/Principles.md, "A Relayed Identity
// Lifecycle Record Is Trusted By Its Own Signature, Never By Who
// Relayed It" (0.2.68) — `_handleIncoming` below deliberately never
// reads `meta.connectedPeer.remoteIdentity` at all.
//
// The corresponding restraint on the SENDING side keeps this from
// becoming an uncontrolled flood/relay network: this class only ever
// broadcasts a record THIS device's own owner just produced
// (broadcastRevocation/broadcastSuccession, called once, right after
// identity/LocalIdentityProvider.js#revokeIdentity()/declareSuccessor()
// itself succeeds — see application/IdentityUseCase.js). It never
// re-broadcasts a record it merely received from someone else. Real,
// deliberately deferred future work — see docs/Roadmap.md, 0.2.68 —
// is letting a receiver ALSO relay onward to ITS OWN other peers
// (multi-hop gossip), which raises its own freshness/flood questions
// this milestone does not need to answer to prove the core property:
// a peer who already knows an identity can learn, cryptographically,
// that it was revoked or rotated.
//
// `knowsIdentity(identityId) => boolean` is the one injected relevance
// gate — mirrors application/FriendRelationshipUseCase.js's own
// `isBlocked` predicate contract exactly (a zero-arg-per-call
// function, consulted fresh on every incoming message, never cached).
// A record about an identity this device has never remembered as a
// core/PeerRelationship.js or core/FriendshipRecord.js is dropped
// before it is ever stored — see docs/Principles.md, "Propagation
// Reaches Identities This Device Already Knows, Never An Open
// Revocation Directory" (0.2.68): without this gate, any two
// authenticated peers could use this protocol to grow an unbounded
// cache of lifecycle facts about identities neither of them has ever
// otherwise interacted with. Defaults to `() => true` for a caller
// (a test, a REPL) that doesn't wire a real relationship/friendship
// store at all — see application/CreateIdentityLifecyclePropagationUseCase.js
// for the real gate ui/main.js actually wires.
export class IdentityLifecyclePropagationUseCase {
    constructor(storageProvider, identityProvider, {
        peerMessageBus,
        connectedPeerRegistry,
        verifier = new LocalAuthorizationVerifier(),
        protocol = IdentityLifecyclePropagationUseCase.DEFAULT_PROTOCOL,
        knowsIdentity = () => true
    } = {}) {
        if (!storageProvider) {
            throw new Error('IdentityLifecyclePropagationUseCase: storageProvider is required');
        }
        if (!identityProvider) {
            throw new Error('IdentityLifecyclePropagationUseCase: identityProvider is required');
        }
        if (!peerMessageBus || typeof peerMessageBus.send !== 'function' || typeof peerMessageBus.subscribe !== 'function' || typeof peerMessageBus.attach !== 'function') {
            throw new Error('IdentityLifecyclePropagationUseCase: a PeerMessageBus is required');
        }
        if (!connectedPeerRegistry || typeof connectedPeerRegistry.list !== 'function' || typeof connectedPeerRegistry.onChange !== 'function') {
            throw new Error('IdentityLifecyclePropagationUseCase: a ConnectedPeerRegistry is required');
        }
        this._storageProvider = storageProvider;
        this._identityProvider = identityProvider;
        this._bus = peerMessageBus;
        this._registry = connectedPeerRegistry;
        this._verifier = verifier;
        this._protocol = protocol;
        this._knowsIdentity = knowsIdentity;
        this._eventBus = new EventBus();

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

    // Every remote lifecycle fact this device currently holds, for the
    // current local owner, ordered by identityId for a stable render
    // order.
    listRemoteLifecycle() {
        return this._loadAll().sort((a, b) => a.identityId.localeCompare(b.identityId));
    }

    getRemoteLifecycle(identityId) {
        return this._loadAll().find((r) => r.identityId === identityId) || null;
    }

    // Alice's revocation, already produced and signed by
    // identity/LocalIdentityProvider.js#revokeIdentity() — this call's
    // ONLY job is handing it to every peer connection currently
    // AUTHENTICATED on this device, exactly the "refuse rather than
    // silently queue" transport discipline peer/PeerMessageBus.js#send()
    // already applies; a peer who is offline right now simply does not
    // receive it (see this class's own header — durable, retried
    // delivery to an offline peer is deliberately deferred future work,
    // unlike application/ChatOutbox.js's own reliable-delivery model).
    // Returns the number of peers it was actually sent to.
    broadcastRevocation(record) {
        if (!isValidIdentityRevocationRecord(record) || !record.signature) {
            throw new Error('IdentityLifecyclePropagationUseCase: broadcastRevocation requires a signed revocation record');
        }
        return this._broadcast(toIdentityLifecycleGossipMessage(IdentityLifecycleGossipKind.REVOCATION, record));
    }

    // The same, for a signed succession record from declareSuccessor()
    // (including the one revokeIdentity({ successorIdentityId }) itself
    // produces as a side effect) — see this class's own header.
    broadcastSuccession(record) {
        if (!isValidIdentitySuccessionRecord(record) || !record.signature) {
            throw new Error('IdentityLifecyclePropagationUseCase: broadcastSuccession requires a signed succession record');
        }
        return this._broadcast(toIdentityLifecycleGossipMessage(IdentityLifecycleGossipKind.SUCCESSION, record));
    }

    // Returns an unsubscribe function. Fires with the full current list
    // on every accepted incoming revocation/succession — mirrors
    // application/FriendRelationshipUseCase.js#onRelationshipsChanged's
    // own shape exactly.
    onRemoteLifecycleChanged(callback) {
        const subscription = this._eventBus.subscribe(
            LIFECYCLE_CHANGED_EVENT,
            ({ records }) => callback(records)
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
        // connectedPeerRegistry — both are shared, app-wide collaborators
        // this class never owns, exactly like application/
        // FriendRelationshipUseCase.js's own dispose().
    }

    _broadcast(message) {
        const authenticatedPeers = this._registry.list().filter((peer) => peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED);
        for (const peer of authenticatedPeers) {
            this._bus.send(peer, this._protocol, message);
        }
        return authenticatedPeers.length;
    }

    // The ingestion boundary. Every incoming gossip message passes
    // every one of these checks, IN ORDER, before it can change
    // anything this device stores:
    //   1. well-formed shape (core/IdentityLifecycleGossip.js)
    //   2. the record's OWN signature verifies (identity/
    //      LocalAuthorizationVerifier.js's verifyIdentityRevocation()/
    //      verifyIdentitySuccession() — REQUIRED, never tolerated
    //      unsigned, exactly like the records themselves have been
    //      since 0.2.67). Deliberately NEVER checks `meta.connectedPeer`
    //      against anything — see this class's own header on why the
    //      relaying connection's identity is irrelevant here, the
    //      direct opposite of application/FriendRelationshipUseCase.js's
    //      own actorIdentity-must-match-connection rule.
    //   3. relevance: `knowsIdentity(subjectIdentityId)` — a record
    //      about an identity this device has never remembered is
    //      dropped (see this class's own header).
    //   4. freshness/single-successor: a REVOCATION already on file for
    //      this identityId is permanent — a second one is a no-op,
    //      never overwritten (see core/RemoteIdentityLifecycle.js's own
    //      header). A SUCCESSION only replaces an existing one when its
    //      `declaredAt` is strictly newer — see core/
    //      RemoteIdentityLifecycle.js#withSuccession's own header on
    //      why this is STATE replacement, never an event log — which is
    //      also what keeps "one successor at a time" true on the
    //      RECEIVING side, the same single-slot invariant identity/
    //      LocalIdentityProvider.js already enforces on the declaring
    //      side.
    _handleIncoming(payload) {
        if (!isValidIdentityLifecycleGossipMessage(payload)) {
            return;
        }
        if (payload.kind === IdentityLifecycleGossipKind.REVOCATION) {
            this._handleRevocation(payload.record);
        } else {
            this._handleSuccession(payload.record);
        }
    }

    _handleRevocation(record) {
        if (!this._verifier.verifyIdentityRevocation(record).valid) {
            return;
        }
        if (!this._knowsIdentity(record.identityId)) {
            return;
        }
        const owner = this._currentUsernameOrNull();
        if (!owner) {
            return;
        }
        const all = this._loadAll();
        const existing = all.find((r) => r.identityId === record.identityId) || null;
        if (existing && existing.isRevoked) {
            return; // permanent, first-accepted-wins — see this file's own header
        }
        const next = (existing || new RemoteIdentityLifecycle({ identityId: record.identityId })).withRevocation(record);
        this._saveAll(owner, replaceById(all, next));
        this._publishChange();
    }

    _handleSuccession(record) {
        if (!this._verifier.verifyIdentitySuccession(record).valid) {
            return;
        }
        if (!this._knowsIdentity(record.predecessorIdentityId)) {
            return;
        }
        const owner = this._currentUsernameOrNull();
        if (!owner) {
            return;
        }
        const all = this._loadAll();
        const existing = all.find((r) => r.identityId === record.predecessorIdentityId) || null;
        if (existing && existing.succession && new Date(existing.succession.declaredAt) >= new Date(record.declaredAt)) {
            return; // not newer — see core/RemoteIdentityLifecycle.js#withSuccession's own header
        }
        const next = (existing || new RemoteIdentityLifecycle({ identityId: record.predecessorIdentityId })).withSuccession(record);
        this._saveAll(owner, replaceById(all, next));
        this._publishChange();
    }

    _loadAll() {
        const owner = this._currentUsernameOrNull();
        if (!owner) {
            return [];
        }
        const stored = this._storageProvider.load(STORAGE_KEY_PREFIX + owner) || [];
        return stored.map((json) => RemoteIdentityLifecycle.fromJSON(json)).filter(Boolean);
    }

    _saveAll(owner, records) {
        this._storageProvider.save(STORAGE_KEY_PREFIX + owner, records.map((r) => r.toJSON()));
    }

    _publishChange() {
        this._eventBus.publish(LIFECYCLE_CHANGED_EVENT, { records: this.listRemoteLifecycle() });
    }

    _currentUsernameOrNull() {
        const user = this._identityProvider.currentUser();
        return user ? user.username : null;
    }
}

// Deliberately the same protocol-name convention every peer/
// PeerMessageBus.js consumer uses (see application/
// FriendRelationshipUseCase.js's own DEFAULT_PROTOCOL) — namespaced so
// it can never collide with friendship/chat/presence/profile/
// interaction traffic multiplexed over the same connection.
IdentityLifecyclePropagationUseCase.DEFAULT_PROTOCOL = 'forkbuild:identity-lifecycle';

function replaceById(records, record) {
    const withoutExisting = records.filter((r) => r.identityId !== record.identityId);
    withoutExisting.push(record);
    return withoutExisting;
}
