// 0.9.670 — Avatar Vehicle Store Intent.
//
// The store side of Avatar Inventory (core/AvatarInventory.js) needs the
// same one-shot "did the avatar just ask for this" fact
// core/AvatarVehicleDismountIntent.js already established for
// dismounting — its own header's reasoning applies verbatim here, so
// this file mirrors its exact shape rather than reusing or extending
// that vocabulary: storing is not dismounting (a stored vehicle leaves
// the world entirely, dismounting leaves it parked), so it gets its own
// name, not a third value bolted onto DISMOUNT.
//
//   AvatarVehicleStoreIntent.NONE  — no store request right now.
//   AvatarVehicleStoreIntent.STORE — the avatar just asked to put away
//                                    whatever it is currently mounted on.
//
// Deliberately ONE-SHOT and NOT MOUNT-STATE-AWARE, the identical
// discipline core/AvatarVehicleDismountIntent.js's own header already
// explains in full: `storeRequested: true` while nothing is mounted is
// not this file's problem to prevent — a future transition (see
// core/AvatarVehicleStoreTransition.js) decides whether a store request
// is meaningful given the avatar's actual mount state.
function isRequested(value) {
    return Boolean(value);
}

export const AvatarVehicleStoreIntent = Object.freeze({
    NONE: 'none',
    STORE: 'store'
});

export function isValidAvatarVehicleStoreIntent(value) {
    return Object.values(AvatarVehicleStoreIntent).includes(value);
}

export function deriveAvatarVehicleStoreIntent({ storeRequested = false } = {}) {
    return isRequested(storeRequested)
        ? AvatarVehicleStoreIntent.STORE
        : AvatarVehicleStoreIntent.NONE;
}

// Deliberately not yet: any vehicle or mount-state awareness (see this
// file's own header); the actual store transition; deploy (its own
// mirror-image file, core/AvatarVehicleDeployIntent.js); keyboard input
// handling; rendering; persistence; networking; randomness; the clock.
