import { EventBus } from '../core/events/EventBus.js';
import { DeviceAuthority } from '../core/DeviceAuthority.js';
import {
    DeviceAuthorizationGossipKind,
    toDeviceAuthorizationGossipMessage,
    isValidDeviceAuthorizationGossipMessage
} from '../core/DeviceAuthorizationGossip.js';
import { isValidDeviceAuthorizationGrant, isValidDeviceAuthorizationRevocation } from '../core/DeviceAuthorizationEnvelope.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import * as Ed25519 from '../identity/Ed25519.js';

const AUTHORITY_CHANGED_EVENT = 'DeviceAuthorityChanged';
const STORAGE_KEY_PREFIX = 'device-authority:';

// 0.2.78 — Multi-Device Identity Semantics.
//
// identity/LocalIdentityProvider.js's own authorizeDevice()/
// revokeDeviceAuthorization() (this milestone) gave a PARENT identity a
// signed, durable way to declare which device keys act on its behalf —
// but, exactly like 0.2.67's revokeIdentity()/declareSuccessor() before
// this class's own direct precedent (application/
// IdentityLifecyclePropagationUseCase.js) closed the same gap for
// identity lifecycle, that fact stayed on the authorizing device only.
// This class closes it the identical way: a namespaced
// peer/PeerMessageBus.js protocol ('forkbuild:device-authorization'),
// never a modification to peer/PeerAuthenticationSession.js or any
// existing peer/ protocol — see this file's own header on why NOTHING
// about how a live connection authenticates changes because of this
// milestone at all.
//
// Structurally this is application/IdentityLifecyclePropagationUseCase.js
// again, one layer over: a gossiped record is trusted by its OWN
// signature alone, never by who relayed it (`_handleIncoming` below
// never reads `meta.connectedPeer` — see that file's own header for the
// full argument, unchanged here), and `knowsIdentity(identityId)` is
// the identical injected relevance gate, consulted fresh on every
// incoming message, so this device never grows an unbounded cache of
// device facts about identities it has no other relationship with.
//
// The one genuinely new question this class answers, that identity
// lifecycle propagation never needed to: core/DeviceAuthority.js is
// keyed by the PAIR (identityId, deviceIdentityId), never merely
// identityId — because the entire point of a device authorization is
// telling MULTIPLE devices of the same identity apart from each other
// (see docs/Roadmap.md, 0.2.78's own security flagship: Device A and
// Device B are both legitimately Alice's; Device C is not, even though
// all three are, individually, perfectly valid cryptographic keys).
//
// resolvePeerAuthority() is the one method this milestone deliberately
// adds as the answer to "once Bob has a live, authenticated connection
// to something, does it represent identityId?" — DIRECT (the connection
// IS identityId's own key, exactly as every peer connection has always
// worked since 0.2.49) or DEVICE (the connection is a DIFFERENT key
// this device has independently verified identityId authorized, and
// that authorization has not since been superseded by a revocation) —
// deliberately the same DIRECT/DELEGATED vocabulary identity/
// DelegationVerifier.js already uses for a completely different
// question (publication ownership delegation), reused here on purpose
// as the same architectural shape, never the same code path. See
// docs/Principles.md, "A Connection Represents An Identity Either
// Directly Or Through One Verified Device Authorization, Never By
// Assumption" (0.2.78).
//
// Deliberately, explicitly does NOT wire this resolution into
// application/ConnectedPeer.js, application/PeerRelationshipUseCase.js,
// application/ChatUseCase.js, application/VoiceUseCase.js, or any
// presence/profile sync — see docs/Roadmap.md, 0.2.78, "Deliberately
// not in 0.2.78." This milestone establishes what a device IS and
// proves the authorization chain is sound; teaching every existing
// social/voice/presence feature to actually CONSULT resolvePeerAuthority()
// is real, substantial, deliberately deferred future work.
export class DeviceAuthorizationPropagationUseCase {
    constructor(storageProvider, identityProvider, {
        peerMessageBus,
        connectedPeerRegistry,
        verifier = new LocalAuthorizationVerifier(),
        protocol = DeviceAuthorizationPropagationUseCase.DEFAULT_PROTOCOL,
        knowsIdentity = () => true
    } = {}) {
        if (!storageProvider) {
            throw new Error('DeviceAuthorizationPropagationUseCase: storageProvider is required');
        }
        if (!identityProvider) {
            throw new Error('DeviceAuthorizationPropagationUseCase: identityProvider is required');
        }
        if (!peerMessageBus || typeof peerMessageBus.send !== 'function' || typeof peerMessageBus.subscribe !== 'function' || typeof peerMessageBus.attach !== 'function') {
            throw new Error('DeviceAuthorizationPropagationUseCase: a PeerMessageBus is required');
        }
        if (!connectedPeerRegistry || typeof connectedPeerRegistry.list !== 'function' || typeof connectedPeerRegistry.onChange !== 'function') {
            throw new Error('DeviceAuthorizationPropagationUseCase: a ConnectedPeerRegistry is required');
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
        this._unsubscribeBus = this._bus.subscribe(this._protocol, (payload) => this._handleIncoming(payload));
    }

    // identityId's own signed grant/revocation, already produced by
    // identity/LocalIdentityProvider.js#authorizeDevice()/
    // revokeDeviceAuthorization() — this call's only job is handing it
    // to every peer connection currently AUTHENTICATED on this device,
    // exactly the transport discipline application/
    // IdentityLifecyclePropagationUseCase.js#broadcastRevocation()
    // already applies. Returns the number of peers it was actually sent
    // to.
    broadcastAuthorization(record) {
        if (!isValidDeviceAuthorizationGrant(record) || !record.signature) {
            throw new Error('DeviceAuthorizationPropagationUseCase: broadcastAuthorization requires a signed device authorization grant');
        }
        return this._broadcast(toDeviceAuthorizationGossipMessage(DeviceAuthorizationGossipKind.GRANT, record));
    }

    broadcastRevocation(record) {
        if (!isValidDeviceAuthorizationRevocation(record) || !record.signature) {
            throw new Error('DeviceAuthorizationPropagationUseCase: broadcastRevocation requires a signed device authorization revocation');
        }
        return this._broadcast(toDeviceAuthorizationGossipMessage(DeviceAuthorizationGossipKind.REVOCATION, record));
    }

    // Every (identityId, deviceIdentityId) fact the current local owner
    // has learned and verified, for one parent identity — most-recently-
    // updated first.
    listDeviceAuthorities(identityId) {
        return this._loadAll()
            .filter((a) => a.identityId === identityId)
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }

    getDeviceAuthority(identityId, deviceIdentityId) {
        return this._loadAll().find((a) => a.identityId === identityId && a.deviceIdentityId === deviceIdentityId) || null;
    }

    // "Once I have a live, authenticated connection, does it represent
    // identityId?" — see this file's own header. Never mutates
    // anything; a pure query over already-verified local state.
    resolvePeerAuthority(connectedPeer, identityId) {
        const remote = connectedPeer && connectedPeer.remoteIdentity;
        if (!remote) {
            return { authorized: false, mode: null };
        }
        if (remote.identityId === identityId) {
            return { authorized: true, mode: 'DIRECT' };
        }
        const authority = this.getDeviceAuthority(identityId, remote.identityId);
        if (authority && authority.isAuthorized) {
            return { authorized: true, mode: 'DEVICE', deviceIdentityId: remote.identityId };
        }
        return { authorized: false, mode: null };
    }

    // 0.2.79 — Multi-Device Social State Semantics.
    //
    // "Given a live, authenticated connection, what SOCIAL identity should
    // friendship/chat/voice/blocking treat it as?" The counterpart query
    // to resolvePeerAuthority() above, which needs a CANDIDATE identityId
    // already in mind ("does this connection represent Alice specifically?")
    // — this one instead answers, from scratch, "who IS this connection,
    // socially?" DIRECT (the connection's own proven key stays exactly
    // what every social use case has always assumed it is) or DEVICE (this
    // device has independently verified the connected key is a currently-
    // authorized device of some OTHER, parent identity) — see
    // docs/Principles.md, "Device Authorization Changes Peer Authority,
    // Never Social Identity" (0.2.79). A pure query, safe to call on every
    // single incoming or outgoing social message; never mutates anything.
    //
    // Always returns a full, self-sufficient identity shape —
    // `{ identityId, publicKey, algorithm, mode, deviceIdentityId }` —
    // never merely a boolean/mode pair the way resolvePeerAuthority()
    // returns, a deliberate divergence from that method's own leaner shape:
    // a caller here (application/FriendRelationshipUseCase.js,
    // application/ChatUseCase.js, application/VoiceUseCase.js) generally
    // needs to construct a NEW core/FriendshipRecord.js/core/
    // PeerBlockRecord.js for the resolved parent identity, which requires
    // its publicKey — recoverable directly from its did:key identityId
    // (see identity/Ed25519.js#didKeyToPublicKey), never a second lookup.
    // `deviceIdentityId` is always the RAW connected key, regardless of
    // mode — the device-provenance fact a caller wanting to show "sent
    // from Alice's Phone" alongside "from Alice" reads directly, without
    // branching on `mode` first.
    //
    // Ambiguous is refused, not guessed at: if this device has somehow
    // independently verified currently-ACTIVE grants from MORE than one
    // distinct parent identity for the very same device key (a genuinely
    // pathological case no single honest parent ever produces, since a
    // keypair belongs to one device — this would mean two UNRELATED
    // identities each, honestly, claiming the same device key as their
    // own), this resolves DIRECT rather than picking either parent
    // arbitrarily — a named, deliberately conservative edge case, not
    // silently handled either way.
    resolveConnectionIdentity(connectedPeer) {
        const remote = connectedPeer && connectedPeer.remoteIdentity;
        if (!remote) {
            return null;
        }
        const parents = this._loadAll().filter((a) => a.deviceIdentityId === remote.identityId && a.isAuthorized);
        if (parents.length === 1) {
            const publicKeyBytes = Ed25519.didKeyToPublicKey(parents[0].identityId);
            if (publicKeyBytes) {
                return {
                    identityId: parents[0].identityId,
                    publicKey: Ed25519.bytesToHex(publicKeyBytes),
                    algorithm: 'Ed25519',
                    mode: 'DEVICE',
                    deviceIdentityId: remote.identityId
                };
            }
        }
        return {
            identityId: remote.identityId,
            publicKey: remote.publicKey,
            algorithm: remote.algorithm,
            mode: 'DIRECT',
            deviceIdentityId: remote.identityId
        };
    }

    // Returns an unsubscribe function. Fires with every accepted
    // (identityId, deviceIdentityId) fact this owner currently holds on
    // every accepted incoming grant/revocation, mirroring application/
    // IdentityLifecyclePropagationUseCase.js#onRemoteLifecycleChanged's
    // own shape exactly.
    onDeviceAuthorityChanged(callback) {
        const subscription = this._eventBus.subscribe(
            AUTHORITY_CHANGED_EVENT,
            ({ authorities }) => callback(authorities)
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
        // IdentityLifecyclePropagationUseCase.js's own dispose().
    }

    _broadcast(message) {
        const authenticatedPeers = this._registry.list().filter((peer) => peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED);
        for (const peer of authenticatedPeers) {
            this._bus.send(peer, this._protocol, message);
        }
        return authenticatedPeers.length;
    }

    // The ingestion boundary. Every incoming gossip message passes every
    // one of these checks, IN ORDER, before it can change anything this
    // device stores:
    //   1. well-formed shape (core/DeviceAuthorizationGossip.js)
    //   2. the record's OWN signature verifies (identity/
    //      LocalAuthorizationVerifier.js's verifyDeviceAuthorizationGrant()/
    //      verifyDeviceAuthorizationRevocation() — REQUIRED, never
    //      tolerated unsigned). Deliberately NEVER checks
    //      `meta.connectedPeer` against anything — see this class's own
    //      header on why the relaying connection's identity is
    //      irrelevant here, mirroring application/
    //      IdentityLifecyclePropagationUseCase.js exactly.
    //   3. relevance: `knowsIdentity(record.identityId)` — a fact about
    //      an identity this device has never remembered is dropped.
    //   4. freshness: a grant only replaces an existing one when its
    //      `authorizedAt` is strictly newer; a revocation only replaces
    //      an existing one when its `revokedAt` is strictly newer — see
    //      core/DeviceAuthority.js's own header on why BOTH slots are
    //      independently "newer wins," never "permanent, first-wins"
    //      the way identity revocation itself is.
    _handleIncoming(payload) {
        if (!isValidDeviceAuthorizationGossipMessage(payload)) {
            return;
        }
        if (payload.kind === DeviceAuthorizationGossipKind.GRANT) {
            this._handleGrant(payload.record);
        } else {
            this._handleRevocation(payload.record);
        }
    }

    _handleGrant(record) {
        if (!this._verifier.verifyDeviceAuthorizationGrant(record).valid) {
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
        const existing = all.find((a) => a.identityId === record.identityId && a.deviceIdentityId === record.deviceIdentityId) || null;
        if (existing && existing.grant && new Date(existing.grant.authorizedAt).getTime() >= new Date(record.authorizedAt).getTime()) {
            return; // not newer — see core/DeviceAuthority.js's own header
        }
        const base = existing || new DeviceAuthority({ identityId: record.identityId, deviceIdentityId: record.deviceIdentityId });
        this._saveAll(owner, replaceByPair(all, base.withGrant(record)));
        this._publishChange();
    }

    _handleRevocation(record) {
        if (!this._verifier.verifyDeviceAuthorizationRevocation(record).valid) {
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
        const existing = all.find((a) => a.identityId === record.identityId && a.deviceIdentityId === record.deviceIdentityId) || null;
        if (existing && existing.revocation && new Date(existing.revocation.revokedAt).getTime() >= new Date(record.revokedAt).getTime()) {
            return; // not newer
        }
        const base = existing || new DeviceAuthority({ identityId: record.identityId, deviceIdentityId: record.deviceIdentityId });
        this._saveAll(owner, replaceByPair(all, base.withRevocation(record)));
        this._publishChange();
    }

    _loadAll() {
        const owner = this._currentUsernameOrNull();
        if (!owner) {
            return [];
        }
        const stored = this._storageProvider.load(STORAGE_KEY_PREFIX + owner) || [];
        return stored.map((json) => DeviceAuthority.fromJSON(json)).filter(Boolean);
    }

    _saveAll(owner, authorities) {
        this._storageProvider.save(STORAGE_KEY_PREFIX + owner, authorities.map((a) => a.toJSON()));
    }

    _publishChange() {
        this._eventBus.publish(AUTHORITY_CHANGED_EVENT, { authorities: this._loadAll() });
    }

    _currentUsernameOrNull() {
        const user = this._identityProvider.currentUser();
        return user ? user.username : null;
    }
}

// Namespaced so it can never collide with friendship/chat/presence/
// profile/interaction/identity-lifecycle traffic multiplexed over the
// same connection — see application/IdentityLifecyclePropagationUseCase.js's
// own DEFAULT_PROTOCOL.
DeviceAuthorizationPropagationUseCase.DEFAULT_PROTOCOL = 'forkbuild:device-authorization';

function replaceByPair(authorities, authority) {
    const withoutExisting = authorities.filter((a) => !(a.identityId === authority.identityId && a.deviceIdentityId === authority.deviceIdentityId));
    withoutExisting.push(authority);
    return withoutExisting;
}
