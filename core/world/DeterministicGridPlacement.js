import { Position } from '../document/Position.js';
import { computeFnv1a32 } from '../../serializer/contentHash.js';
import { DEFAULT_WORLD_SEED } from '../nature/TerrainHeightField.js';
import { SURFACE_CATEGORY, surfaceCategoryAt } from '../nature/TerrainSurface.js';
import { HYDROLOGY_FEATURE, hydrologyFeatureAt } from '../nature/Hydrology.js';

// 0.2.24: a pure, replica-agnostic mapping from a stable id (a
// Publication's own id) to an absolute grid position in shared world
// space.
//
// Before this milestone, GridPlacementStrategy computed a position from
// `discoveryProvider.list().length` — how many publications THIS LOCAL
// NODE happened to already know about. That is locally-observed state,
// not a fact about the publication itself, and two replicas that
// haven't converged yet (the normal, ongoing condition in a
// decentralized system, not an edge case) can each see a different
// count when independently placing two different publications for the
// first time — or the same count when placing two DIFFERENT
// publications, landing both at the same slot. Either way, "same
// publication -> same placement algorithm -> same absolute coordinate
// on every replica" — the property a shared world coordinate system
// actually requires — did not hold.
//
// This function restores that property the only way it can be
// restored without a consensus protocol: by depending on nothing but
// the id itself. computeContentHash (serializer/contentHash.js,
// already used for document/publication integrity) is reused here
// purely as a stable string->integer function — no cryptographic
// property is needed, only that the same string always produces the
// same output everywhere, which it already guarantees.
//
// GRID_EXTENT bounds the spread so placements land within an
// explorable region near the origin rather than scattered across the
// entire hash range. Two different ids CAN still land on the same
// cell — this function makes no attempt to detect or avoid that.
// Resolving collisions between independently-chosen positions is a
// deliberate non-goal here (see docs/Roadmap.md, 0.2.25, "Spatial
// Allocation & Placement Collision Policy") — determinism is the only property this
// milestone establishes.
//
// 2026-10-21: a spot under water is passed over. The grid knew nothing of
// the World's ground, so about one build in sixteen was published into a
// lake, where nobody could walk in at its door. The id's own cell is kept
// when it is dry, so most ids land where they always did; else the cells
// hashed from `${id}#1`, `${id}#2`, … are tried in turn, still a function
// of the id and the World's seed alone, so every device agrees. Where a
// build is placed is the publisher's choice and is recorded when it is
// published (docs/Protocol.md), so builds already placed stay where they
// are. A Publication with no placement record is shown at this spot too
// (world-layout/LocalWorldLayoutProvider.js): one whose own cell is wet is
// now shown on dry ground, where a copy from before still shows it in the
// water.
const GRID_SPACING = 40;
const GRID_EXTENT = 64;
// How far round a spot must be dry: room for a house and the way to its door.
export const DRY_SPOT_REACH = 8;
const DRY_SAMPLE_STEP = 2;
// How many other cells are tried before the id's own is kept, wet or not.
const MAX_DRY_PROBES = 64;

export function computeDeterministicGridPosition(id, { seed = DEFAULT_WORLD_SEED } = {}) {
    if (!id) {
        return new Position(0, 0, 0);
    }
    const own = gridCellOf(String(id));
    if (isDrySpot(own.x, own.z, seed)) return new Position(own.x, 0, own.z);
    for (let probe = 1; probe <= MAX_DRY_PROBES; probe++) {
        const cell = gridCellOf(`${id}#${probe}`);
        if (isDrySpot(cell.x, cell.z, seed)) return new Position(cell.x, 0, cell.z);
    }
    return new Position(own.x, 0, own.z);
}

function gridCellOf(key) {
    const hash = parseInt(computeFnv1a32(key), 16);
    const col = hash % GRID_EXTENT;
    const row = Math.floor(hash / GRID_EXTENT) % GRID_EXTENT;
    return { x: col * GRID_SPACING, z: row * GRID_SPACING };
}

// Whether no water (a lake, the sea, a river or a pond) lies within
// DRY_SPOT_REACH of (x, z), sampled every DRY_SAMPLE_STEP.
export function isDrySpot(x, z, seed = DEFAULT_WORLD_SEED) {
    for (let dx = -DRY_SPOT_REACH; dx <= DRY_SPOT_REACH; dx += DRY_SAMPLE_STEP) {
        for (let dz = -DRY_SPOT_REACH; dz <= DRY_SPOT_REACH; dz += DRY_SAMPLE_STEP) {
            if (surfaceCategoryAt(seed, x + dx, z + dz) === SURFACE_CATEGORY.WATER) return false;
            if (hydrologyFeatureAt(seed, x + dx, z + dz) !== HYDROLOGY_FEATURE.NONE) return false;
        }
    }
    return true;
}
