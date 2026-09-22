// 0.9.670 — Avatar Vehicle Deploy Intent.
//
// The mirror image of core/AvatarVehicleStoreIntent.js: the one-shot
// "did the avatar just ask to bring out a carried vehicle" fact, the
// deploy-side counterpart of core/AvatarVehicleInteractionIntent.js's
// own MOUNT. Deploying is not mounting — mounting acts on a vehicle
// already present in the world; deploying is what makes one exist in
// the first place, from Avatar Inventory (core/AvatarInventory.js) — so
// it gets its own vocabulary rather than a new value on either existing
// intent.
//
//   AvatarVehicleDeployIntent.NONE   — no deploy request right now.
//   AvatarVehicleDeployIntent.DEPLOY — the avatar just asked to bring out
//                                      whatever vehicle it is carrying.
//
// Deliberately ONE-SHOT and NOT INVENTORY-AWARE, the same discipline
// core/AvatarVehicleInteractionIntent.js's own header already explains:
// `deployRequested: true` while nothing is carried is not this file's
// problem to prevent — a future transition (see
// core/AvatarVehicleDeployTransition.js) decides whether a deploy
// request is meaningful given the avatar's actual inventory.
function isRequested(value) {
    return Boolean(value);
}

export const AvatarVehicleDeployIntent = Object.freeze({
    NONE: 'none',
    DEPLOY: 'deploy'
});

export function isValidAvatarVehicleDeployIntent(value) {
    return Object.values(AvatarVehicleDeployIntent).includes(value);
}

export function deriveAvatarVehicleDeployIntent({ deployRequested = false } = {}) {
    return isRequested(deployRequested)
        ? AvatarVehicleDeployIntent.DEPLOY
        : AvatarVehicleDeployIntent.NONE;
}

// Deliberately not yet: any vehicle, mount-state, or inventory awareness
// (see this file's own header); the actual deploy transition; store (its
// own mirror-image file, core/AvatarVehicleStoreIntent.js); id minting or
// VehicleInstance construction (an application-layer job — see
// application/AvatarVehicleInteractionController.js); keyboard input
// handling; rendering; persistence; networking; randomness; the clock.
