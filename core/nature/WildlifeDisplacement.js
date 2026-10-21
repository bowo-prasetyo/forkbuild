// Where people have built, wild animals keep away: a deer never grazes in
// someone's living room or walks through a wall. Whether a wild animal
// (core/nature/WildlifeField.js) is displaced by what is built near it.
//
// An animal never leaves the ground it can reach: its own lattice cell, and
// within its species' wander radius of where it was placed
// (core/nature/WildlifeMotion.js). So rather than steer it round a build, an
// animal whose reachable ground, grown by its body, touches the footprint
// of a brick it could not walk under is simply not there. Its motion is
// unchanged, still a pure function of the seed and the time, and every
// replica that has loaded the same Worlds leaves out the same animals, the
// same posture a World Resident's paths take (core/world/ResidentPath.js).
// Building over a meadow sends its rabbit away; removing the build brings it
// back.
//
// Pure: animals and boxes in, a yes or no out. Which boxes stand near an
// animal is the caller's question (application/world/WildlifeDisplacement.js).

import { WILDLIFE_LATTICE_SPACING, ANIMAL_SPECIES, wildlifeInRegion } from './WildlifeField.js';
import { ANIMAL_MOTION } from './WildlifeMotion.js';
import { ANIMAL_COLLISION_RADIUS } from './WildlifeCollisionGeometry.js';

// A brick whose underside is at least this high above the ground (a bridge
// deck, an upper floor, a roof's eaves) leaves room for an animal beneath.
export const ANIMAL_HEADROOM = 2;

const ANIMAL_ID = /^animal:(-?\d+):(-?\d+),(-?\d+)$/;

// The lattice cell a wild animal's id names, or null for any other id (a
// released animal's, which is a fresh UUID).
export function animalCellOf(id) {
    const match = typeof id === 'string' ? ANIMAL_ID.exec(id) : null;
    if (!match) return null;
    return { seed: Number(match[1]), cellX: Number(match[2]), cellZ: Number(match[3]) };
}

// The wild animal `id` names in a World of `seed`, exactly as
// wildlifeInRegion() places it, or null when there is none.
export function wildAnimalById(seed, id) {
    const cell = animalCellOf(id);
    if (!cell || cell.seed !== (seed | 0)) return null;
    const minX = cell.cellX * WILDLIFE_LATTICE_SPACING;
    const minZ = cell.cellZ * WILDLIFE_LATTICE_SPACING;
    return wildlifeInRegion(seed, minX, minZ, minX + WILDLIFE_LATTICE_SPACING, minZ + WILDLIFE_LATTICE_SPACING)
        .find((animal) => animal.id === id) || null;
}

// The ground `animal` (a wildlifeInRegion() record) can ever cover, body
// included: { minX, minZ, maxX, maxZ }.
export function animalRangeOf(animal) {
    const motion = ANIMAL_MOTION[animal.species] ?? ANIMAL_MOTION[ANIMAL_SPECIES.RABBIT];
    const body = (ANIMAL_COLLISION_RADIUS[animal.species] ?? ANIMAL_COLLISION_RADIUS[ANIMAL_SPECIES.RABBIT])
        * (Number.isFinite(animal.scale) ? animal.scale : 1);
    const cellX = Math.floor(animal.x / WILDLIFE_LATTICE_SPACING);
    const cellZ = Math.floor(animal.z / WILDLIFE_LATTICE_SPACING);
    const r = motion.wanderRadius;
    return {
        minX: Math.max(animal.x - r, cellX * WILDLIFE_LATTICE_SPACING) - body,
        minZ: Math.max(animal.z - r, cellZ * WILDLIFE_LATTICE_SPACING) - body,
        maxX: Math.min(animal.x + r, (cellX + 1) * WILDLIFE_LATTICE_SPACING) + body,
        maxZ: Math.min(animal.z + r, (cellZ + 1) * WILDLIFE_LATTICE_SPACING) + body
    };
}

// Whether `animal` is displaced by any of `boxes` ({ min: {x, y, z}, max:
// {x, y, z} } each, a brick's collision box in shared space, y measured from
// the ground): one whose footprint overlaps the animal's range and whose
// underside is lower than ANIMAL_HEADROOM. Touching edges do not count.
export function isAnimalDisplaced(animal, boxes) {
    if (!animal || !boxes || boxes.length === 0) return false;
    const range = animalRangeOf(animal);
    for (const box of boxes) {
        if (!box || !box.min || !box.max) continue;
        if (Number.isFinite(box.min.y) && box.min.y >= ANIMAL_HEADROOM) continue;
        if (box.max.x <= range.minX || box.min.x >= range.maxX) continue;
        if (box.max.z <= range.minZ || box.min.z >= range.maxZ) continue;
        return true;
    }
    return false;
}
