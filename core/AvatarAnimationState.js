// The small, closed set of animation states an AvatarPresence can
// report (0.2.33). Deliberately just a vocabulary, not a state
// machine — WHICH animation is currently playing, and how transitions
// between them are driven (input, physics, blending), is 0.2.36's
// "Local Avatar Movement" concern. This milestone only needs a shared,
// typo-proof set of names so AvatarPresence.animation is never an
// arbitrary free-text string that a renderer has to guess at.
//
// Never part of any signed envelope — see core/AvatarPresence.js's own
// header for why presence in general is never signed at all.
export const AvatarAnimationState = Object.freeze({
    IDLE: 'idle',
    WALKING: 'walking',
    RUNNING: 'running',
    JUMPING: 'jumping'
});

export function isValidAnimationState(value) {
    return Object.values(AvatarAnimationState).includes(value);
}
