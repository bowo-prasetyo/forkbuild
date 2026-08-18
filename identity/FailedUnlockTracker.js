// Failed-unlock handling (0.2.47): a wrong passphrase must cost an
// attacker something beyond the PBKDF2 delay itself, or an offline copy
// of the encrypted record (see identity/KeyEncryption.js) is the only
// thing standing between a guessed passphrase and the key. Purely
// in-memory, per-identityId counters — never persisted, and deliberately
// so: a lockout that survived a page reload would need its own storage
// key and its own tamper story, for a protection whose real value is
// rate-limiting a live guessing loop within one running session, not
// surviving a restart. `now` is injectable so tests can advance time
// without a real clock or sleep.
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_COOLDOWN_MS = 30000;

export class FailedUnlockTracker {
    constructor({ maxAttempts = DEFAULT_MAX_ATTEMPTS, cooldownMs = DEFAULT_COOLDOWN_MS, now = () => new Date() } = {}) {
        this._maxAttempts = maxAttempts;
        this._cooldownMs = cooldownMs;
        this._now = now;
        this._attempts = new Map();
    }

    isLockedOut(identityId) {
        const entry = this._attempts.get(identityId);
        if (!entry || !entry.lockedUntil) {
            return false;
        }
        if (this._now().getTime() >= entry.lockedUntil.getTime()) {
            this._attempts.delete(identityId);
            return false;
        }
        return true;
    }

    remainingCooldownMs(identityId) {
        const entry = this._attempts.get(identityId);
        if (!entry || !entry.lockedUntil) {
            return 0;
        }
        return Math.max(0, entry.lockedUntil.getTime() - this._now().getTime());
    }

    remainingAttempts(identityId) {
        const entry = this._attempts.get(identityId);
        const used = entry ? entry.count : 0;
        return Math.max(0, this._maxAttempts - used);
    }

    // Records one failed unlock attempt and returns how many attempts
    // remain before a cooldown starts. Reaching zero starts the cooldown
    // immediately — the caller does not need a second call to enforce it.
    recordFailure(identityId) {
        const entry = this._attempts.get(identityId) || { count: 0, lockedUntil: null };
        entry.count += 1;
        if (entry.count >= this._maxAttempts) {
            entry.lockedUntil = new Date(this._now().getTime() + this._cooldownMs);
        }
        this._attempts.set(identityId, entry);
        return Math.max(0, this._maxAttempts - entry.count);
    }

    recordSuccess(identityId) {
        this._attempts.delete(identityId);
    }
}
