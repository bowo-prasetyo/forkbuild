// 0.9.74 — Deterministic Vehicle Identity.
//
// 0.9.71 gave a vehicle a type and a position (core/VehiclePresence.js).
// 0.9.72 gave the World View a way to produce real ones, deterministically,
// from a seed and a lattice cell (core/VehiclePlacement.js). 0.9.73 gave an
// avatar a way to know when it is close enough to one. None of that answers
// a question mounting cannot avoid: WHICH vehicle. A position is not a
// reliable answer — two vehicles can share a type, and this codebase has
// never guaranteed a VehiclePresence's own position stays fixed forever
// (0.9.71's own header already reserves "move this vehicle" as future
// work). JavaScript object identity is not an answer either — a
// vehiclePresenceInRegion() call reconstructs its VehiclePresence
// instances from nothing every time it runs (0.9.72's own header,
// "recomputed, never stored"), so the SAME conceptual bicycle is a
// different object on every query, exactly like core/NaturalFeatureField.js's
// own trees. This file is the missing fact: a stable, deterministic name
// for a particular vehicle, independent of the object that happens to be
// carrying it around right now.
//
//   world seed ──▶ lattice cell ──▶ vehicleIdFor() ──▶ vehicle id
//
// vehicleIdFor(seed, cellX, cellZ) is a PURE function of exactly its own
// three arguments — no Math.random, no Date.now, no persisted state,
// nothing that depends on when or how many times it has been called
// before. The same (seed, cellX, cellZ) always produces the same id,
// forever, including across a full world regeneration — the identical
// "content-addressed by geography" discipline core/VehiclePlacement.js's
// own header already established for the bicycle's POSITION, applied here
// to the bicycle's IDENTITY instead.
//
// DELIBERATELY THE LATTICE CELL, NOT THE JITTERED POSITION.
// core/VehiclePlacement.js places at most one bicycle per lattice cell —
// (seed, cellX, cellZ) already uniquely names a candidate slot, and the
// cell coordinates are integers decided BEFORE jitter, density, or the
// ground gate ever run. Deriving the id from the jittered (x, y, z)
// instead would tie identity to a value this file's own header already
// says must be free to change later ("a future 'move this vehicle' means
// constructing a new VehiclePresence" — core/VehiclePresence.js, 0.9.71)
// — exactly the coupling this milestone exists to avoid. The id names the
// SLOT a vehicle was placed into, not the point in space it currently
// occupies.
//
// NOT A UUID. core/createId.js's own createId() is the right tool for an
// entity that has no other way to be told apart — a World, a Building, a
// Brick a person just placed by hand — because nothing about those is
// reconstructible from a formula. A procedurally-placed bicycle is the
// opposite case: its entire existence already IS a formula, the same one
// core/VehiclePlacement.js already evaluates to decide whether a bicycle
// exists there at all. Minting a random id for it would make two
// separately-computed views of the same world (two peers, or the same
// client before and after a reload) disagree about a bicycle's own name
// even though they agree it is the very same bicycle — the one property a
// deterministic id exists to prevent.
//
// A PLAIN STRING, not an object, not a class — matching every other
// lightweight identifier already used as a VehiclePresence field
// (`type` is a plain string from core/VehicleType.js) rather than
// introducing a new wrapper type for a value that is only ever compared
// for equality and serialized as-is.
//
// FORMAT: `vehicle:<seed>:<cellX>,<cellZ>` — a fixed, three-part,
// colon-separated string, the same "plain, readable, delimiter-joined
// key" convention core/TerrainTiling.js's own tileKey() already
// established for an identical shape of fact (a pair of integer lattice
// coordinates, named as one string). The leading `vehicle:` segment
// exists only so a vehicle id can never collide with, or be mistaken
// for, any other id-shaped string already circulating in this codebase
// (a WorldPlacement id, a Publication id, an avatar id) — it carries no
// further meaning and this file never parses it back apart.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. This file knows nothing
// about, and never imports, an avatar, proximity, mounting, keyboard or
// controller input, movement, rendering, physics, randomness, the clock,
// or persistence. It does not decide WHERE a vehicle's own lattice cell
// comes from (core/VehiclePlacement.js's own BICYCLE_LATTICE_SPACING
// already answers that) — it only names the cell it is handed. It does
// not validate that a given cell actually hosts a vehicle (that is
// core/VehiclePlacement.js's own ground/density gates) — vehicleIdFor()
// is happy to name a cell that turns out to host nothing; a caller simply
// never asks for the id of a cell it never placed a VehiclePresence into.
// It exports no equality helper — two ids are just strings, and `===`
// already answers "is this the same vehicle" exactly as well as a
// dedicated `vehicleIdsMatch()` would, without this file inventing a
// second way to ask the same question.

function isFiniteInteger(value) {
    return typeof value === 'number' && Number.isFinite(value) && Math.floor(value) === value;
}

// The one entry point: a deterministic, stable id for the vehicle slot at
// lattice cell (cellX, cellZ) under world seed `seed`. See this file's
// own header for the exact format and the reasoning behind every
// deliberate choice in it.
export function vehicleIdFor(seed, cellX, cellZ) {
    if (!isFiniteInteger(seed)) {
        throw new Error(`vehicleIdFor requires an integer seed, got ${JSON.stringify(seed)}`);
    }
    if (!isFiniteInteger(cellX)) {
        throw new Error(`vehicleIdFor requires an integer cellX, got ${JSON.stringify(cellX)}`);
    }
    if (!isFiniteInteger(cellZ)) {
        throw new Error(`vehicleIdFor requires an integer cellZ, got ${JSON.stringify(cellZ)}`);
    }
    return `vehicle:${seed}:${cellX},${cellZ}`;
}
