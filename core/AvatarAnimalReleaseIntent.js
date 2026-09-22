// 0.9.700 — Avatar Animal Release Intent.
//
// The mirror image of core/AvatarAnimalCatchIntent.js, and the animal
// counterpart of core/AvatarVehicleDeployIntent.js: the one-shot "did
// the avatar just ask to let go of a carried animal" fact. Releasing is
// not deploying a vehicle — it acts on a different InventoryEntryKind
// and a different world entity — so it gets its own vocabulary rather
// than a third meaning bolted onto DEPLOY.
//
//   AvatarAnimalReleaseIntent.NONE    — no release requested right now.
//   AvatarAnimalReleaseIntent.RELEASE — the avatar just asked to let go
//                                       of a carried animal.
//
// Deliberately ONE-SHOT and NOT INVENTORY-AWARE, the identical restraint
// core/AvatarVehicleDeployIntent.js's own header already explains in
// full for its own DEPLOY.
function isRequested(value) {
    return Boolean(value);
}

export const AvatarAnimalReleaseIntent = Object.freeze({
    NONE: 'none',
    RELEASE: 'release'
});

export function isValidAvatarAnimalReleaseIntent(value) {
    return Object.values(AvatarAnimalReleaseIntent).includes(value);
}

export function deriveAvatarAnimalReleaseIntent({ releaseRequested = false } = {}) {
    return isRequested(releaseRequested)
        ? AvatarAnimalReleaseIntent.RELEASE
        : AvatarAnimalReleaseIntent.NONE;
}

// Deliberately not yet: any inventory awareness (see this file's own
// header); the actual release transition; catch (its own mirror-image
// file, core/AvatarAnimalCatchIntent.js); keyboard input handling;
// rendering; persistence; networking; randomness; the clock.
