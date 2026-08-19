import { EventBus } from '../core/events/EventBus.js';
import { PeerBlockRecord } from '../core/PeerBlockRecord.js';

const BLOCKS_CHANGED_EVENT = 'PeerBlocksChanged';
const STORAGE_KEY_PREFIX = 'peer-blocks:';

// 0.2.60 — Friendship Revocation, Blocking & Privacy Withdrawal.
//
// The local, unilateral counterpart to application/FriendRelationshipUseCase.js
// — see core/PeerBlockRecord.js's own header for the full reasoning on
// why blocking is a completely separate store rather than a third
// FriendshipState value. This class NEVER touches a peer/PeerMessageBus.js,
// NEVER sends or receives anything over the network, and NEVER imports
// application/ConnectedPeerRegistry.js — there is nothing for a block
// to transport, because the whole point is that the blocked identity
// is never told (see docs/Principles.md, "Blocking Is Silent — Never
// Announced To The Blocked Identity," 0.2.60). Structurally, this file
// is application/PeerRelationshipUseCase.js's own shape, reused for a
// second, independent local list: same per-owner storage key
// convention, same "resolve the current user fresh on every call,
// never captured once" discipline, same onChange event shape.
//
// This class answers exactly one question other collaborators need:
// isBlocked(identityId). Every sender-side gate (presence/
// PeerAvatarPresenceBroadcastProvider.js, application/FriendRelationshipUseCase.js's
// own send methods) and every receiver-side gate (application/
// PresenceTrustBoundary.js, application/AvatarProfileTrustBoundary.js,
// application/AvatarInteractionTrustBoundary.js, application/
// FriendRelationshipUseCase.js's own ingestion) consults ONLY that
// predicate — none of them import this class or core/PeerBlockRecord.js
// directly, the same "the transport/trust layer asks a predicate its
// caller closed over, it never reads a store itself" discipline
// application/CreateWorldViewUseCase.js's own isFriend/hasFriend
// wiring already established in 0.2.58/0.2.59.
export class PeerBlockUseCase {
    constructor(storageProvider, identityProvider) {
        if (!storageProvider) {
            throw new Error('PeerBlockUseCase: storageProvider is required');
        }
        if (!identityProvider) {
            throw new Error('PeerBlockUseCase: identityProvider is required');
        }
        this._storageProvider = storageProvider;
        this._identityProvider = identityProvider;
        this._eventBus = new EventBus();
    }

    // Every identity the current local user has blocked, ordered by
    // identityId for a stable render order — mirrors application/
    // FriendRelationshipUseCase.js#getRelationships()'s own ordering; a
    // UI wanting a friendly name cross-references application/
    // PeerRelationshipUseCase.js's own alias, exactly like the Friends
    // list already does.
    getBlocked() {
        return this._loadAll().sort((a, b) => a.identityId.localeCompare(b.identityId));
    }

    getBlock(identityId) {
        return this._loadAll().find((b) => b.identityId === identityId) || null;
    }

    isBlocked(identityId) {
        return this.getBlock(identityId) !== null;
    }

    // Alice's "Block" gesture. `identity` is anything carrying
    // identityId/publicKey[/algorithm] — a live, authenticated
    // peer/PeerIdentity.js, or an already-persisted core/PeerRelationship.js/
    // core/FriendshipRecord.js — see core/PeerBlockRecord.js#fromIdentity's
    // own header for why both are equally valid, unlike
    // PeerRelationshipUseCase#rememberPeer's stricter live-handshake
    // requirement. Idempotent: blocking an already-blocked identity is
    // a no-op that returns the existing record, never a second one and
    // never an error — the same "already known is not an error" posture
    // rememberPeer() itself established.
    block(identity) {
        const owner = this._requireCurrentUsername();
        const all = this._loadAll();
        const existing = all.find((b) => b.identityId === identity.identityId);
        if (existing) {
            return existing;
        }
        const record = PeerBlockRecord.fromIdentity(identity);
        this._saveAll(owner, [...all, record]);
        this._publishChange();
        return record;
    }

    // Deletes ONLY this device's local block record. Never touches, and
    // has no mechanism to touch, whatever core/FriendshipRecord.js this
    // owner may separately hold for the same identity — see this file's
    // own header: unblocking is the exact inverse of block(), nothing
    // more. In particular, unblocking NEVER restores or creates a
    // friendship — see docs/Principles.md, "Unblocking Restores Nothing
    // But The Ability To Be Heard Again" (0.2.60): friendship stays
    // whatever it actually, independently is.
    unblock(identityId) {
        const owner = this._requireCurrentUsername();
        const all = this._loadAll();
        if (!all.some((b) => b.identityId === identityId)) {
            throw new Error('PeerBlockUseCase: this identity is not blocked');
        }
        this._saveAll(owner, all.filter((b) => b.identityId !== identityId));
        this._publishChange();
    }

    // Returns an unsubscribe function. Fires with the full current
    // block list on every block()/unblock(), mirroring application/
    // PeerRelationshipUseCase.js#onRelationshipsChanged's own shape.
    onBlockedChanged(callback) {
        const subscription = this._eventBus.subscribe(
            BLOCKS_CHANGED_EVENT,
            ({ blocked }) => callback(blocked)
        );
        return () => subscription.unsubscribe();
    }

    _loadAll() {
        const owner = this._currentUsernameOrNull();
        if (!owner) {
            return [];
        }
        const stored = this._storageProvider.load(STORAGE_KEY_PREFIX + owner) || [];
        return stored.map((json) => PeerBlockRecord.fromJSON(json)).filter(Boolean);
    }

    _saveAll(owner, blocked) {
        this._storageProvider.save(STORAGE_KEY_PREFIX + owner, blocked.map((b) => b.toJSON()));
    }

    _publishChange() {
        this._eventBus.publish(BLOCKS_CHANGED_EVENT, { blocked: this.getBlocked() });
    }

    _requireCurrentUsername() {
        const owner = this._currentUsernameOrNull();
        if (!owner) {
            throw new Error('PeerBlockUseCase: no user is currently logged in');
        }
        return owner;
    }

    _currentUsernameOrNull() {
        const user = this._identityProvider.currentUser();
        return user ? user.username : null;
    }
}
