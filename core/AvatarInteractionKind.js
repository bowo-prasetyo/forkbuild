// 0.2.44 — Local Avatar Interaction & Social Presence. The small,
// closed vocabulary of LOCAL gestures a user can choose to perform at
// their current avatar interaction target — see docs/Principles.md,
// "Observation Does Not Imply Authority, And Interaction Does Not
// Imply Control."
//
// Deliberately its OWN vocabulary, never folded into
// core/AvatarAnimationState.js: that one lives on AvatarPresence and
// is broadcast over the wire on every accepted movement (see
// core/AvatarPresenceAdvertisement.js's `animation` field). GREET/
// WAVE/POINT must never reach AvatarPresence.animation, or they would
// silently start being networked the moment this shipped — which is
// explicitly NOT this milestone's scope (see docs/Roadmap.md,
// "0.2.45 — Networked Ephemeral Avatar Interactions"). Keeping this a
// second, independent closed vocabulary is what makes "a gesture
// cannot accidentally reach the transport" true by construction
// rather than by convention — there is no code path that reads an
// AvatarInteractionKind value and writes it into an
// AvatarPresence/AvatarPresenceAdvertisement.
//
// "Invite to Follow," "Stop Following," and "Inspect" — the other
// three intents the 0.2.44 design doc names — are deliberately NOT
// entries here: they already exist as their own concrete session
// methods (followAvatarId/stopFollowingRemoteAvatar, and
// targetAvatar/pick's existing "open the Avatar Info panel" behavior
// from 0.2.39/0.2.43). This vocabulary only covers the genuinely NEW
// capability — a transient gesture with no other representation yet.
export const AvatarInteractionKind = Object.freeze({
    NONE: 'none',
    GREET: 'greet',
    WAVE: 'wave',
    POINT: 'point'
});

export function isValidInteractionKind(value) {
    return Object.values(AvatarInteractionKind).includes(value);
}
