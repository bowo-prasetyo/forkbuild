import { AnimalPresence } from './AnimalPresence.js';
import { withinRadiusXZ } from './AvatarVehicleProximity.js';
import { AvatarAnimalCatchIntent } from './AvatarAnimalCatchIntent.js';
import { isFiniteCoordinate, isFiniteXZPosition } from './FiniteCoordinates.js';

// 0.9.700 — Avatar Animal Catch Target Resolution.
//
// The direct structural twin of core/AvatarVehicleInteractionTarget.js,
// applied to animals: given a live CATCH request and a candidate list,
// which single animal — if any — does it actually target?
//
//   resolveAvatarAnimalCatchTarget({
//       avatarPosition, animals, catchIntent
//   }) -> { targetAnimalId }
//
// PURE, and the identical ordered policy that file's own header already
// documents in full: no CATCH intent -> no target; candidates outside
// ANIMAL_INTERACTION_RADIUS excluded entirely; among the rest, nearest
// by squared X/Z distance wins; an exact tie breaks on ascending lexical
// id order, for the same "never depend on candidate array order"
// determinism that file's own tests already prove for vehicles. Y is
// ignored for the identical reason core/AvatarVehicleProximity.js's own
// header gives: an animal's Y is a terrain sample, not a meaningful
// interaction boundary.
//
// REUSES withinRadiusXZ() — core/AvatarVehicleProximity.js's own header
// already names exactly this as the reason that primitive, not merely
// its constant, was kept generic: "a future proximity check against
// some other object kind ... should be able to reuse this primitive
// without this file growing a second, near-identical distance check."
// ANIMAL_INTERACTION_RADIUS is its own, separately-tuned policy number —
// never VEHICLE_INTERACTION_RADIUS reused — since an animal is a
// different-sized thing to reach than a bicycle.
//
// RETURNS AN ID, NEVER THE AnimalPresence ITSELF — the identical
// "0.9.74-shaped stable name, not a disposable object reference"
// reasoning core/AvatarVehicleInteractionTarget.js's own header gives,
// restated here for core/AnimalIdentity.js's own ids.
export const ANIMAL_INTERACTION_RADIUS = 1.5;

function squaredDistanceXZ(a, b) {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return dx * dx + dz * dz;
}

export function resolveAvatarAnimalCatchTarget({ avatarPosition, animals, catchIntent } = {}) {
    if (!isFiniteXZPosition(avatarPosition)) {
        throw new Error('resolveAvatarAnimalCatchTarget requires an avatarPosition with finite numeric x and z');
    }
    if (!Array.isArray(animals)) {
        throw new Error('resolveAvatarAnimalCatchTarget requires an animals array');
    }
    for (const animal of animals) {
        if (!(animal instanceof AnimalPresence)) {
            throw new Error('resolveAvatarAnimalCatchTarget requires every entry in animals to be an AnimalPresence instance');
        }
    }

    if (catchIntent !== AvatarAnimalCatchIntent.CATCH) {
        return { targetAnimalId: null };
    }

    let best = null;
    let bestDistance = Infinity;
    for (const animal of animals) {
        if (!withinRadiusXZ(avatarPosition, animal.position, ANIMAL_INTERACTION_RADIUS)) {
            continue;
        }
        const distance = squaredDistanceXZ(avatarPosition, animal.position);
        if (
            best === null
            || distance < bestDistance
            || (distance === bestDistance && animal.id < best.id)
        ) {
            best = animal;
            bestDistance = distance;
        }
    }

    return { targetAnimalId: best === null ? null : best.id };
}

// Deliberately not yet: facing/directional disambiguation; persistent
// target state on either an avatar or an animal; catching as an actual
// world effect; a per-species interaction radius (one shared
// ANIMAL_INTERACTION_RADIUS, exactly like vehicles share one); keyboard
// input; rendering; movement; collision; persistence; networking;
// randomness; the clock.
