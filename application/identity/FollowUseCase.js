import { EventBus } from '../../core/events/EventBus.js';
import { FollowRecord, isFollowableIdentityId } from '../../core/FollowRecord.js';
import { resolveSigningIdentityId } from '../../identity/resolveSigningIdentityId.js';
import { UserFacingError } from '../../core/UserFacingError.js';
import { message } from '../../core/Message.js';

const FOLLOWING_CHANGED_EVENT = 'FollowingChanged';
const STORAGE_KEY_PREFIX = 'follows:';

// The identities the signed-in identity follows. Entirely local, like
// PeerBlockUseCase: nothing is sent, the followed identity is never told, and
// following needs no connection, since what it matches is Publication
// signatures this device already verifies. The list is kept per signing
// identity, so switching identity switches lists.
export class FollowUseCase {
    constructor(storageProvider, identityProvider, { now = () => new Date() } = {}) {
        if (!storageProvider) {
            throw new Error('FollowUseCase: storageProvider is required');
        }
        if (!identityProvider) {
            throw new Error('FollowUseCase: identityProvider is required');
        }
        this._storageProvider = storageProvider;
        this._identityProvider = identityProvider;
        this._now = now;
        this._eventBus = new EventBus();
    }

    // Most recently followed first.
    getFollowing() {
        return this._loadAll().sort((a, b) => b.followedAt - a.followedAt || a.identityId.localeCompare(b.identityId));
    }

    getFollow(identityId) {
        return this._loadAll().find((record) => record.identityId === identityId) || null;
    }

    isFollowing(identityId) {
        return this.getFollow(identityId) !== null;
    }

    isSignedIn() {
        return resolveSigningIdentityId(this._identityProvider) !== null;
    }

    // Whether follow(identityId) would be accepted: someone is signed in, the id
    // is a did:key, and it isn't the signed-in identity itself.
    canFollow(identityId) {
        const owner = resolveSigningIdentityId(this._identityProvider);
        return Boolean(owner) && isFollowableIdentityId(identityId) && identityId !== owner;
    }

    // Idempotent. Following again keeps the original date and only fills in a
    // name when there was none.
    follow(identityId, { name = null } = {}) {
        const owner = this._requireOwner();
        if (!isFollowableIdentityId(identityId)) {
            throw new UserFacingError(message('refusal.onlyADidKeyIdentity'), { detail: 'FollowUseCase: only a did:key identity can be followed' });
        }
        if (identityId === owner) {
            throw new UserFacingError(message('refusal.youCannotFollowYourself'), { detail: 'FollowUseCase: you cannot follow yourself' });
        }
        const all = this._loadAll();
        const existing = all.find((record) => record.identityId === identityId);
        if (existing) {
            if (existing.name || !name) {
                return existing;
            }
            const named = existing.withName(name);
            this._saveAll(owner, all.map((record) => (record === existing ? named : record)));
            this._publishChange();
            return named;
        }
        const record = new FollowRecord({ identityId, name, followedAt: this._now() });
        this._saveAll(owner, [...all, record]);
        this._publishChange();
        return record;
    }

    // Returns whether anything was removed; unfollowing someone you don't
    // follow is not an error.
    unfollow(identityId) {
        const owner = this._requireOwner();
        const all = this._loadAll();
        const remaining = all.filter((record) => record.identityId !== identityId);
        if (remaining.length === all.length) {
            return false;
        }
        this._saveAll(owner, remaining);
        this._publishChange();
        return true;
    }

    // Returns an unsubscribe function. Fires with the full list on every change.
    onFollowingChanged(callback) {
        const subscription = this._eventBus.subscribe(FOLLOWING_CHANGED_EVENT, ({ following }) => callback(following));
        return () => subscription.unsubscribe();
    }

    _loadAll() {
        const owner = resolveSigningIdentityId(this._identityProvider);
        if (!owner) {
            return [];
        }
        let stored;
        try {
            stored = this._storageProvider.load(STORAGE_KEY_PREFIX + owner);
        } catch {
            return [];
        }
        return Array.isArray(stored) ? stored.map((json) => FollowRecord.fromJSON(json)).filter(Boolean) : [];
    }

    _saveAll(owner, records) {
        this._storageProvider.save(STORAGE_KEY_PREFIX + owner, records.map((record) => record.toJSON()));
    }

    _publishChange() {
        this._eventBus.publish(FOLLOWING_CHANGED_EVENT, { following: this.getFollowing() });
    }

    _requireOwner() {
        const owner = resolveSigningIdentityId(this._identityProvider);
        if (!owner) {
            throw new UserFacingError(message('refusal.signInToFollowPeople'), { detail: 'FollowUseCase: sign in to follow people' });
        }
        return owner;
    }
}
