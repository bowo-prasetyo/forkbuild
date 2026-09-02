// 0.9.72 — Deterministic Vehicle Placement.
// Extended by 0.9.74 — Deterministic Vehicle Identity: presenceForCell()
// now also mints each VehiclePresence's own `id` via
// core/VehicleIdentity.js's own vehicleIdFor(seed, cellX, cellZ), using
// the SAME (cellX, cellZ) this file already computes to decide the cell's
// jittered position — never a separately-tracked counter or the jittered
// position itself (see core/VehicleIdentity.js's own header for why the
// pre-jitter cell, not the post-jitter point, is the identity-bearing
// fact). This file still only PLACES; deriving what an id looks like
// remains core/VehicleIdentity.js's own job alone.
//
// 0.9.70 named what a vehicle IS (core/VehicleType.js). 0.9.71 named what
// it means for one to exist somewhere (core/VehiclePresence.js) — but left
// "how does the World View obtain actual VehiclePresence instances"
// explicitly open, refusing to guess between procedural placement,
// explicit placement, player creation, and network discovery. This
// milestone answers that question for exactly one origin: procedural,
// seeded placement, the same origin core/NaturalFeatureField.js already
// established for trees. It does not close off the other candidate
// origins — a future explicitly-placed or player-created vehicle can
// still exist alongside whatever this file produces — it only builds the
// first one, because "does a bicycle exist anywhere to interact with" is
// the concrete product need motivating this milestone.
//
// vehiclePresenceInRegion(seed, minX, minZ, maxX, maxZ) is a PURE function
// of exactly its own arguments — no Math.random, no Date.now, no
// persisted state, nothing that depends on which region happened to be
// queried first or in what order. Two replicas (or the same replica
// revisiting a region after roaming thousands of units away) that query
// the same region always get back the exact same array of bicycles,
// because both are recomputing the identical deterministic lattice from
// nothing but (seed, x, z) — the exact "content-addressed by geography"
// discipline core/NaturalFeatureField.js already established, reused here
// as a PATTERN (candidate lattice → per-cell jitter → zone/density gate →
// bounds filter → deterministic sort), never by importing or subclassing
// that file's own implementation. Vehicles and trees are unrelated
// concerns that happen to share a placement shape; this file has its own
// module-private hash lattice, its own seed offsets, and its own
// threshold, wired to none of NaturalFeatureField's internals.
//
// Deliberately ONE candidate lattice cell per TERRAIN_TILE_SIZE unit
// (BICYCLE_LATTICE_SPACING === TERRAIN_TILE_SIZE, core/TerrainTiling.js)
// rather than a finer grid: a bicycle is a rare, individually-noticed
// object, not ground cover, so it never needs sub-tile candidate density
// the way TREE_LATTICE_SPACING's finer 4-unit lattice needs for a forest
// to read as dense. Choosing an exact multiple of TERRAIN_TILE_SIZE keeps
// the same "no lattice cell straddles a tile boundary" property
// core/NaturalFeatureField.js's own header establishes the reasoning for,
// so a future tile-based World View query never double-counts or drops a
// bicycle at a shared tile edge — even though no such consumer exists
// yet.
//
// A jittered candidate then survives two independent gates, applied in
// this order:
//
//   1. Ground gate — core/TerrainEcology.js's own ecologyZoneAt() must
//      report anything other than WATER, and core/Hydrology.js's own
//      isRiverAt() must be false. A bicycle standing in open water or a
//      river channel is wrong regardless of how rare bicycles are; unlike
//      NaturalFeatureField's own zone restriction (only FOREST/GRASSLAND
//      host a tree), this milestone does not yet model roads, paths, or
//      any other "where a bicycle plausibly stands" concept beyond "on
//      dry, unmoving ground" — see this file's own "Deliberately not yet"
//      note below for why a road/path network is future work, not a gap.
//   2. Density gate — a broad, continuous, decorrelated noise field
//      thresholded far more restrictively than either of
//      core/NaturalFeatureField.js's own FOREST/GRASSLAND thresholds, so
//      that a bicycle is a genuinely rare find over a wide area rather
//      than ground cover. Density is intentionally uniform across every
//      qualifying zone — there is no plausible reason yet for a bicycle
//      to prefer FIELD over HIGHLAND over BEACH, unlike a tree's real
//      ecological reason to prefer FOREST over GRASSLAND — so this file
//      does not invent a per-zone threshold table the way
//      core/NaturalFeatureField.js's densityThresholdFor() does.

import { Position } from './Position.js';
import { VehicleType } from './VehicleType.js';
import { VehiclePresence } from './VehiclePresence.js';
import { vehicleIdFor } from './VehicleIdentity.js';
import { terrainHeightAt } from './TerrainHeightField.js';
import { ecologyZoneAt, ECOLOGY_ZONE } from './TerrainEcology.js';
import { isRiverAt } from './Hydrology.js';
import { TERRAIN_TILE_SIZE } from './TerrainTiling.js';

// One candidate cell per terrain tile — see this file's own header for
// why this stays an exact multiple of TERRAIN_TILE_SIZE rather than a
// finer lattice.
export const BICYCLE_LATTICE_SPACING = TERRAIN_TILE_SIZE;

// Jitter is confined to the middle 70% of each cell, the identical
// fraction (and identical reasoning) as core/NaturalFeatureField.js's own
// JITTER_MARGIN: enough to break up an obviously-gridded look, never so
// much that a jittered position could cross into a neighboring cell's own
// territory.
const JITTER_MARGIN = 0.15;
const JITTER_RANGE = 1 - JITTER_MARGIN * 2;

// How likely a qualifying lattice cell is to host a bicycle, in [0, 1) —
// deliberately more restrictive than either of
// core/NaturalFeatureField.js's own density thresholds (0.42 for FOREST,
// 0.80 for GRASSLAND), and applied against a smoothed (bilinearly-
// interpolated) noise field whose values cluster far more tightly around
// 0.5 than a raw per-cell random draw would — so 0.90 already means only
// a small fraction of qualifying cells pass: a bicycle is a rare,
// individually-placed object, a forest is dense cover.
const DENSITY_THRESHOLD = 0.90;

// Arbitrary but fixed forever, and deliberately far from every seed
// offset already in use across core/TerrainHeightField.js,
// core/TerrainSurface.js, core/TerrainEcology.js, and
// core/NaturalFeatureField.js — this file's own hash lattice must never
// visibly track any of theirs, the same "own tiny hash lattice,
// decorrelated by a seed offset" discipline every deterministic field in
// this codebase already follows independently.
const DENSITY_SEED_OFFSET = 0x42434449;  // 'BCDI'
const JITTER_X_SEED_OFFSET = 0x42434a58; // 'BCJX'
const JITTER_Z_SEED_OFFSET = 0x42434a5a; // 'BCJZ'

function smoothstep(t) {
    return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

// A small, fast, deterministic 32-bit avalanche hash — independently
// reimplemented per core/NaturalFeatureField.js's own header precedent:
// every noise/jitter field in this codebase gets its own module-private
// primitive rather than a shared one.
function hash2D(seed, latticeX, latticeZ) {
    let h = seed | 0;
    h = Math.imul(h ^ latticeX, 0x27d4eb2d);
    h = Math.imul(h ^ (latticeZ + 0x9e3779b9), 0x165667b1);
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

function valueNoise2D(seed, x, z) {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const tx = smoothstep(x - x0);
    const tz = smoothstep(z - z0);

    const v00 = hash2D(seed, x0, z0);
    const v10 = hash2D(seed, x0 + 1, z0);
    const v01 = hash2D(seed, x0, z0 + 1);
    const v11 = hash2D(seed, x0 + 1, z0 + 1);

    const top = lerp(v00, v10, tx);
    const bottom = lerp(v01, v11, tx);
    return lerp(top, bottom, tz);
}

// Broad and continuous, decorrelated from core/NaturalFeatureField.js's
// own forestDensityAt() by construction (different seed offset, different
// frequency) — a wide, slow-moving field so a bicycle's rarity does not
// itself look gridded.
const DENSITY_FREQUENCY = 1 / 22;

// How likely a lattice cell is to host a bicycle, in [0, 1) — the ONE
// input vehiclePresenceInRegion() thresholds against. Exported, matching
// core/NaturalFeatureField.js's own forestDensityAt(), so a caller or test
// can evaluate the field directly without reconstructing a whole region
// query.
export function bicycleDensityAt(seed, x, z) {
    return valueNoise2D(seed + DENSITY_SEED_OFFSET, x * DENSITY_FREQUENCY, z * DENSITY_FREQUENCY);
}

// Every VehiclePresence this file can ever produce for one lattice cell,
// or null if the cell hosts nothing — factored out of
// vehiclePresenceInRegion() so both it and tests/tools can evaluate a
// single cell in isolation, mirroring core/NaturalFeatureField.js's own
// featureForCell().
function presenceForCell(seed, cellX, cellZ) {
    const jitterX = hash2D(seed + JITTER_X_SEED_OFFSET, cellX, cellZ);
    const jitterZ = hash2D(seed + JITTER_Z_SEED_OFFSET, cellX, cellZ);
    const x = (cellX + JITTER_MARGIN + jitterX * JITTER_RANGE) * BICYCLE_LATTICE_SPACING;
    const z = (cellZ + JITTER_MARGIN + jitterZ * JITTER_RANGE) * BICYCLE_LATTICE_SPACING;

    // Ground gate — see this file's own header, "Ground gate."
    if (ecologyZoneAt(seed, x, z) === ECOLOGY_ZONE.WATER) return null;
    if (isRiverAt(seed, x, z)) return null;

    // Density gate — see this file's own header, "Density gate."
    if (bicycleDensityAt(seed, x, z) < DENSITY_THRESHOLD) return null;

    const y = terrainHeightAt(seed, x, z);
    return new VehiclePresence({
        id: vehicleIdFor(seed, cellX, cellZ),
        type: VehicleType.BICYCLE,
        position: new Position(x, y, z)
    });
}

// The one public entry point: every VehiclePresence whose position falls
// within [minX, maxX) x [minZ, maxZ) — a half-open interval, the identical
// convention core/NaturalFeatureField.js's own naturalFeaturesInRegion()
// uses so tile-aligned adjacent queries partition the world with no gap
// and no overlap. Returned in a fixed, deterministic order (sorted by
// position x then z) so two callers querying the same region always get
// an identical ARRAY, element for element — never merely an identical set
// in Map/object iteration order.
export function vehiclePresenceInRegion(seed, minX, minZ, maxX, maxZ) {
    const cellMinX = Math.floor(minX / BICYCLE_LATTICE_SPACING);
    const cellMaxX = Math.ceil(maxX / BICYCLE_LATTICE_SPACING);
    const cellMinZ = Math.floor(minZ / BICYCLE_LATTICE_SPACING);
    const cellMaxZ = Math.ceil(maxZ / BICYCLE_LATTICE_SPACING);

    const presences = [];
    for (let cellX = cellMinX; cellX < cellMaxX; cellX++) {
        for (let cellZ = cellMinZ; cellZ < cellMaxZ; cellZ++) {
            const presence = presenceForCell(seed, cellX, cellZ);
            if (!presence) continue;
            const { x, z } = presence.position;
            if (x < minX || x >= maxX || z < minZ || z >= maxZ) continue;
            presences.push(presence);
        }
    }
    presences.sort((a, b) => (a.position.x - b.position.x) || (a.position.z - b.position.z));
    return presences;
}

// Deliberately not yet: any vehicle type other than BICYCLE (this
// milestone's own brief names bicycle as the sole first vehicle — see
// docs/Roadmap.md, 0.9.72); roads, paths, parking areas, garages, or any
// other structured "where a vehicle plausibly stands" concept beyond dry,
// non-river ground (see this file's own header); vehicle rendering;
// avatar-proximity or interaction detection; mounting/dismounting;
// vehicle movement, speed, heading, or any physics; persisting a placed
// bicycle anywhere (every bicycle here is recomputed, never stored, the
// same discipline core/NaturalFeatureField.js already established for
// trees — see docs/Principles.md, "Natural Features Are Sampled, Never
// Stored"); collision between a bicycle and anything else; two bicycles
// ever colliding with or overlapping each other (the density threshold
// makes this astronomically unlikely, but this file makes no explicit
// guarantee against it); ownership; ordering vehicles by distance from
// any point; and any non-procedural placement origin (explicit placement,
// player creation, network discovery) — see this file's own header for
// why those are left open, not closed off, by building this one.
