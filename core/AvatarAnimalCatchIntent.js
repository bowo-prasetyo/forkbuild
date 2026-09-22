// 0.9.700 — Avatar Animal Catch Intent.
//
// The direct structural twin of core/AvatarVehicleInteractionIntent.js's
// own MOUNT, applied to animals: the one-shot "did the avatar just ask
// to catch whatever's nearby" fact, deliberately its own vocabulary
// rather than a third value on that file's NONE/MOUNT — catching a
// rabbit and mounting a bicycle only look like the same gesture
// (pressing a key near something); they act on entirely different world
// entities and this codebase's own precedent (core/AvatarVehicleDismountIntent.js's
// own header, "mounting and dismounting only LOOK like opposites") is
// explicit that shape alone is never a reason to share one enum.
//
//   AvatarAnimalCatchIntent.NONE  — no catch requested right now.
//   AvatarAnimalCatchIntent.CATCH — the avatar just asked to catch
//                                   whatever animal is in range.
//
// Deliberately ONE-SHOT (consumed the instant `catchRequested` stops
// being asserted, idempotent while held) and NOT ANIMAL-AWARE — this
// file carries no animal id, species, or candidate list, the identical
// restraint every sibling intent file in this codebase already applies.
function isRequested(value) {
    return Boolean(value);
}

export const AvatarAnimalCatchIntent = Object.freeze({
    NONE: 'none',
    CATCH: 'catch'
});

export function isValidAvatarAnimalCatchIntent(value) {
    return Object.values(AvatarAnimalCatchIntent).includes(value);
}

export function deriveAvatarAnimalCatchIntent({ catchRequested = false } = {}) {
    return isRequested(catchRequested)
        ? AvatarAnimalCatchIntent.CATCH
        : AvatarAnimalCatchIntent.NONE;
}

// Deliberately not yet: any animal awareness (see this file's own
// header); the actual catch transition; release (its own mirror-image
// file, core/AvatarAnimalReleaseIntent.js); keyboard input handling;
// rendering; persistence; networking; randomness; the clock.
