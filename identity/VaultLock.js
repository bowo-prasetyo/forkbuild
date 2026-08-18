// Is this identity's decrypted key material available to sign with RIGHT
// NOW? New in 0.2.47, deliberately a FOURTH concept alongside the three
// 0.2.46 already established:
//
//   LocalIdentity           "Which keys does this device hold?" — durable.
//   AuthenticationSession   "Is one of them the app's active user?" —
//                           transient, but persisted, so it survives a
//                           page reload.
//   VaultLock                "Is that identity's PRIVATE KEY currently
//                           decrypted in memory?" — transient AND
//                           deliberately NEVER persisted. An unprotected
//                           identity (no passphrase set) is trivially
//                           always UNLOCKED — there is nothing to lock.
//                           A protected identity starts every page load
//                           LOCKED, even if its AuthenticationSession is
//                           still AUTHENTICATED from before the reload:
//                           persisting "unlocked" would mean writing the
//                           decrypted seed (or a fact that unlocks it)
//                           to disk, which defeats the entire point of
//                           encrypting it there in the first place.
//
// This is what makes "identity exists / identity is unlocked /
// authenticated session is active" three genuinely independent facts,
// not three names for the same event: a protected identity can be
// AUTHENTICATED (the app is showing Alice as logged in) while its
// VaultLock is LOCKED (an idle timeout or an explicit lock() call
// evicted the decrypted seed from memory) — signing fails with a
// specific "identity is locked" reason distinct from "not logged in."
export const VaultLockState = Object.freeze({
    LOCKED: 'LOCKED',
    UNLOCKED: 'UNLOCKED'
});

export class VaultLock {
    constructor({ identityId, state = VaultLockState.LOCKED, unlockedAt = null } = {}) {
        if (!identityId || typeof identityId !== 'string') {
            throw new Error('VaultLock: identityId is required');
        }
        if (state === VaultLockState.UNLOCKED && !unlockedAt) {
            throw new Error('VaultLock: an UNLOCKED vault requires unlockedAt');
        }
        this._identityId = identityId;
        this._state = state;
        this._unlockedAt = state === VaultLockState.UNLOCKED ? new Date(unlockedAt) : null;
    }

    get identityId() { return this._identityId; }
    get state() { return this._state; }
    get unlockedAt() { return this._unlockedAt; }
    get isUnlocked() { return this._state === VaultLockState.UNLOCKED; }

    static locked(identityId) {
        return new VaultLock({ identityId, state: VaultLockState.LOCKED });
    }

    static unlocked(identityId, unlockedAt = new Date()) {
        return new VaultLock({ identityId, state: VaultLockState.UNLOCKED, unlockedAt });
    }
}
