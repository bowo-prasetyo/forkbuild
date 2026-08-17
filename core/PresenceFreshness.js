import { PresenceLifecycleState } from './PresenceLifecycleState.js';

// 0.2.37 — pure derivation: given only "when did we last actually
// hear from this avatar" (measured on the RECEIVER's own clock, at
// the moment of receipt — never a sender-claimed timestamp, which
// core/AvatarPresenceAdvertisement.js deliberately omits) and "what
// time is it now," decide PRESENT / STALE / ABSENT. No Three.js, no
// storage, no side effects — same "pure geometry, independently
// testable" split every other core/*.js derivation in this codebase
// already follows. `now` is an explicit parameter (not an internal
// `Date.now()` call) precisely so tests never need to actually wait —
// see tests/AvatarPresenceSync.test.js.
export function derivePresenceLifecycleState({ receivedAt, now = Date.now(), staleAfterMs, absentAfterMs }) {
    const elapsed = now - receivedAt;
    // Garbage or negative elapsed time (clock skew, a bad receivedAt)
    // degrades to "still present" rather than either crashing or
    // prematurely declaring someone gone — the same failure-isolation
    // posture applied everywhere else untrusted/uncertain input meets
    // this codebase.
    if (!Number.isFinite(elapsed) || elapsed < 0) {
        return PresenceLifecycleState.PRESENT;
    }
    if (elapsed >= absentAfterMs) {
        return PresenceLifecycleState.ABSENT;
    }
    if (elapsed >= staleAfterMs) {
        return PresenceLifecycleState.STALE;
    }
    return PresenceLifecycleState.PRESENT;
}
