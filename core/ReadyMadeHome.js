import { findBuildEntrance } from './BuildEntrance.js';
import { WorldResident } from './WorldResident.js';

// The ready-made homes come lived in (docs/reviews/CreativeDirection-2026-10-12.md,
// finding 4: on day one, nothing is alive). A copy of a ready-made house,
// cottage or other dwelling (a Structure tagged 'dwelling') starts with one
// World Resident whose home is just outside its front door, so it strolls
// round the house and greets whoever walks up. Like any resident it is part
// of the World: saved, published and copied with it, and its builder removes
// it with R in World View like any other (application/worldNavigation/
// residentMethods.js). It has no author of its own; it came with the
// ready-made build.
export const READY_MADE_RESIDENT_AUTHOR = 'ready-made';

export function isReadyMadeHome(structure) {
    return Boolean(structure && Array.isArray(structure.tags) && structure.tags.includes('dwelling'));
}

// How far to the side of the door, along the front, the resident's home is:
// near enough to greet whoever walks up, clear of the doorway and of where
// an arrival stands.
export const RESIDENT_BESIDE_DOOR = 2.5;

// Where a home's resident lives, `{ x, z }` in the structure's own
// coordinates: beside the spot in front of its door where an arrival stands
// (core/BuildEntrance.js). Null for anything that isn't a home, or has no
// way in.
export function readyMadeResidentHome(structure, registry) {
    if (!isReadyMadeHome(structure)) return null;
    const entrance = findBuildEntrance(structure.bricks, registry);
    if (!entrance || entrance.kind !== 'door' || !entrance.stand || !entrance.inward) return null;
    // Square to the way in, along the front.
    const side = { x: entrance.inward.z, z: -entrance.inward.x };
    return {
        x: entrance.stand.x + side.x * RESIDENT_BESIDE_DOOR,
        z: entrance.stand.z + side.z * RESIDENT_BESIDE_DOOR
    };
}

// Adds that resident to `world`, a fresh copy of `structure`; `createId`
// makes its id. Returns it, or null when the structure isn't a home.
export function moveInReadyMadeResident(world, structure, registry, createId) {
    const home = readyMadeResidentHome(structure, registry);
    if (!home || !world || typeof world.addResident !== 'function') return null;
    const resident = new WorldResident({
        id: createId(),
        worldId: world.id,
        authorIdentityId: READY_MADE_RESIDENT_AUTHOR,
        position: { x: home.x, y: 0, z: home.z }
    });
    world.addResident(resident);
    return resident;
}
