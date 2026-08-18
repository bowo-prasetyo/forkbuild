// Automatic vault expiration (0.2.47), stated honestly for what it is: a
// fixed maximum duration since a protected identity's vault was last
// unlocked, not real user-activity tracking. Wiring "reset the timer on
// every keystroke/click" would mean threading an activity hook through
// every UI surface in the app for a security property that a bounded
// unlock lifetime already delivers — leave a tab open and unattended,
// and its vault re-locks on its own regardless of what it's doing. A
// genuine idle-vs-active distinction is real future work if it's ever
// actually needed (see docs/Roadmap.md), not attempted here.
//
// Deliberately a pure function over (unlockedAt, now, timeoutMs), never
// a stored "isExpired" flag anywhere — the same "computed, not stored"
// discipline docs/Principles.md already applies to document lifecycle
// status and spatial overlap. identity/VaultLock.js's UNLOCKED state
// stays valid in storage terms for as long as its holder (the provider's
// in-memory cache) keeps it; this function is what that cache consults
// on every read to decide whether the entry is still good.
export const DEFAULT_VAULT_TIMEOUT_MS = 15 * 60 * 1000;

export function isVaultExpired(unlockedAt, now, timeoutMs = DEFAULT_VAULT_TIMEOUT_MS) {
    if (!unlockedAt) {
        return false;
    }
    return (now.getTime() - unlockedAt.getTime()) >= timeoutMs;
}
