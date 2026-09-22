// 0.9.700 — Deterministic Animal Identity.
//
// The direct structural twin of core/VehicleIdentity.js, applied to
// wildlife instead of vehicles: core/WildlifeField.js's own
// wildlifeInRegion() reconstructs every animal from nothing but (seed,
// x, z) on every call (the same "recomputed, never stored" discipline
// core/VehiclePlacement.js already established) — so the SAME
// conceptual rabbit is a different plain object on every query. Catching
// needs to name WHICH animal, independent of the object that happens to
// be carrying it around right now; this file is that name.
//
//   world seed ──▶ lattice cell ──▶ animalIdFor() ──▶ animal id
//
// animalIdFor(seed, cellX, cellZ) is a PURE function of exactly its own
// three arguments, deterministic and stable forever, including across a
// full world regeneration — identical contract to vehicleIdFor().
//
// THE LATTICE CELL, NOT THE JITTERED POSITION — same reasoning
// core/VehicleIdentity.js's own header already gives: the cell names the
// SLOT an animal was placed into, not the point in space it currently
// occupies, so an id stays meaningful even if a future milestone ever
// gives an animal a runtime position that can move.
//
// FORMAT: `animal:<seed>:<cellX>,<cellZ>` — the identical three-part,
// colon-separated shape core/VehicleIdentity.js uses, with its own
// `animal:` prefix so an animal id can never collide with, or be
// mistaken for, a vehicle id or any other id-shaped string already
// circulating in this codebase.
//
// Deliberately excluded, matching core/VehicleIdentity.js's own
// identical list: this file knows nothing about an avatar, proximity,
// catching, keyboard input, movement, rendering, physics, randomness, or
// persistence, and never validates that a given cell actually hosts an
// animal — core/WildlifeField.js's own ecology/density/river gates
// already answer that.

function isFiniteInteger(value) {
    return typeof value === 'number' && Number.isFinite(value) && Math.floor(value) === value;
}

export function animalIdFor(seed, cellX, cellZ) {
    if (!isFiniteInteger(seed)) {
        throw new Error(`animalIdFor requires an integer seed, got ${JSON.stringify(seed)}`);
    }
    if (!isFiniteInteger(cellX)) {
        throw new Error(`animalIdFor requires an integer cellX, got ${JSON.stringify(cellX)}`);
    }
    if (!isFiniteInteger(cellZ)) {
        throw new Error(`animalIdFor requires an integer cellZ, got ${JSON.stringify(cellZ)}`);
    }
    return `animal:${seed}:${cellX},${cellZ}`;
}
