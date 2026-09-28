import * as Ed25519 from '../identity/Ed25519.js';

// One identity this device's owner follows: a private, local note that they
// want to see what that identity publishes. It is never signed or sent, and
// it grants the followed identity nothing (docs/principles/peers.md,
// "Following Is A Local Subscription, Never A Relationship").
//
// Only a did:key is accepted, because a follow is matched against verified
// Publication signatures, and a did:key names the key that signs them.
// `name` is a label for showing the follow before any of their work has been
// seen here; it is whatever author name was on screen, never a claim.
export class FollowRecord {
    constructor({ identityId, name = null, followedAt = new Date() } = {}) {
        if (!isFollowableIdentityId(identityId)) {
            throw new Error('FollowRecord: identityId must be a did:key identity');
        }
        this._identityId = identityId;
        this._name = typeof name === 'string' && name.trim().length > 0 ? name.trim().slice(0, MAX_NAME_LENGTH) : null;
        this._followedAt = followedAt instanceof Date ? followedAt : new Date(followedAt);
        if (Number.isNaN(this._followedAt.getTime())) {
            throw new Error('FollowRecord: followedAt must be a valid date');
        }
    }

    get identityId() { return this._identityId; }
    get name() { return this._name; }
    get followedAt() { return this._followedAt; }

    withName(name) {
        return new FollowRecord({ identityId: this._identityId, name, followedAt: this._followedAt });
    }

    toJSON() {
        return {
            identityId: this._identityId,
            name: this._name,
            followedAt: this._followedAt.toISOString()
        };
    }

    // Null for anything that no longer validates, so one bad stored entry
    // never hides the rest of the list.
    static fromJSON(json) {
        if (!json || typeof json !== 'object') {
            return null;
        }
        try {
            return new FollowRecord(json);
        } catch {
            return null;
        }
    }
}

const MAX_NAME_LENGTH = 200;

export function isFollowableIdentityId(identityId) {
    return typeof identityId === 'string' && Ed25519.didKeyToPublicKey(identityId) !== null;
}
