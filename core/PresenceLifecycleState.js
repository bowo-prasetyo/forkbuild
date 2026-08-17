// 0.2.37 — the small, closed vocabulary a REMOTE presence observation
// can be in, derived purely from elapsed time since it was last heard
// from (see core/PresenceFreshness.js). Deliberately NOT a field on
// AvatarPresence or AvatarPresenceAdvertisement — see
// docs/Principles.md, "Presence Lifecycle State Is A Derived
// Observation, Not A Stored Fact": nothing about "is this avatar
// still around" is a fact a sender ever declares about itself: it's a
// judgment the RECEIVER makes, and it can change (PRESENT -> STALE ->
// ABSENT) without a single new message ever arriving.
export const PresenceLifecycleState = Object.freeze({
    PRESENT: 'present',
    STALE: 'stale',
    ABSENT: 'absent'
});

export function isValidPresenceLifecycleState(value) {
    return Object.values(PresenceLifecycleState).includes(value);
}
