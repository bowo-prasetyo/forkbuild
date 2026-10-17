import { computeFnv1a32 } from '../serializer/contentHash.js';
import { PLAZA_CENTER, PLAZA_VILLAGE_RADIUS } from './ChallengePlaza.js';
import { SURFACE_CATEGORY, surfaceCategoryAt } from './TerrainSurface.js';
import { HYDROLOGY_FEATURE, hydrologyFeatureAt } from './Hydrology.js';
import { DEFAULT_WORLD_SEED } from './TerrainHeightField.js';
import { naturalFeaturesInRegion } from './NaturalFeatureField.js';

// The rings round the challenge plaza where a week's entries are shown, as
// exhibits, while someone visits it (core/PlazaEntrySpots.js). Nothing is
// placed here: a published build takes its spot on the id-keyed grid
// (application/placement/StandingPlacementStrategy.js), so it has room round
// it. Builds published while builds still settled here (from 2026-10-12)
// were placed on these rings, and keep those spots.
//
// Pure: the caller says which spots are taken and this picks the first free
// one, starting from a slot the entry's own id chooses, so every device that
// knows the same entries lays them out the same way.

// The first ring, just outside the plaza's clearing and its ready-made
// builds (core/StarterVillage.js): close enough that an entry on it sees the
// square, well inside World View's streaming radius.
export const VILLAGE_FIRST_RING_RADIUS = PLAZA_VILLAGE_RADIUS + 8;
// Between two rings, and between two neighbours on a ring: room for a
// house and its garden.
export const VILLAGE_RING_SPACING = 22;
export const VILLAGE_SLOT_SPACING = 20;
// How far out the rings may go.
export const VILLAGE_MAX_RINGS = 40;

// Two builds closer than this are taken to share a spot.
export const SETTLEMENT_TAKEN_RADIUS = VILLAGE_SLOT_SPACING * 0.75;

// No tree may grow this close to a spot: room for a house of six across and
// the path to its door (the World's trees are a function of its seed,
// core/NaturalFeatureField.js, so every device agrees where they are).
export const SETTLEMENT_TREE_CLEARANCE = 7;

// Whether a build can stand at x, z: dry, walkable ground with no river or
// lake and no tree in the way, outside the village's ready-made builds.
export function isSettleableGround(x, z, seed = DEFAULT_WORLD_SEED) {
    const dx = x - PLAZA_CENTER.x;
    const dz = z - PLAZA_CENTER.z;
    if (dx * dx + dz * dz < PLAZA_VILLAGE_RADIUS * PLAZA_VILLAGE_RADIUS) return false;
    const surface = surfaceCategoryAt(seed, x, z);
    if (surface === SURFACE_CATEGORY.WATER || surface === SURFACE_CATEGORY.ROCK) return false;
    if (hydrologyFeatureAt(seed, x, z) !== HYDROLOGY_FEATURE.NONE) return false;
    const r = SETTLEMENT_TREE_CLEARANCE;
    return !naturalFeaturesInRegion(seed, x - r, z - r, x + r, z + r)
        .some((tree) => Math.hypot(tree.x - x, tree.z - z) < r);
}

// The spots on a ring of `radius` round `center`, `spacing` apart, starting
// due north and going clockwise as seen from above.
export function ringSpots(center, radius, spacing) {
    const count = Math.max(1, Math.floor((2 * Math.PI * radius) / spacing));
    const spots = [];
    for (let index = 0; index < count; index++) {
        const angle = -Math.PI / 2 + (2 * Math.PI * index) / count;
        spots.push(Object.freeze({ x: round(center.x + radius * Math.cos(angle)), y: center.y || 0, z: round(center.z + radius * Math.sin(angle)) }));
    }
    return spots;
}

// The village spot for an entry: `{ x, y, z }`, or null when every ring up to
// VILLAGE_MAX_RINGS is taken or under water. `isTaken(x, z)` answers from
// the placements the caller knows of.
export function settleInVillage({ publicationId, isTaken = () => false, seed = DEFAULT_WORLD_SEED, center = PLAZA_CENTER }) {
    for (let ring = 0; ring < VILLAGE_MAX_RINGS; ring++) {
        const spot = firstFreeSpot(ringSpots(center, VILLAGE_FIRST_RING_RADIUS + ring * VILLAGE_RING_SPACING, VILLAGE_SLOT_SPACING), { publicationId, isTaken, seed });
        if (spot) return spot;
    }
    return null;
}

// Walks a ring from the slot the id chooses; the first spot that is good
// ground and not taken.
function firstFreeSpot(spots, { publicationId, isTaken, seed }) {
    const start = parseInt(computeFnv1a32(String(publicationId || '')), 16) % spots.length;
    for (let step = 0; step < spots.length; step++) {
        const spot = spots[(start + step) % spots.length];
        if (!isSettleableGround(spot.x, spot.z, seed)) continue;
        let taken = false;
        try {
            taken = Boolean(isTaken(spot.x, spot.z));
        } catch {
            taken = false;
        }
        if (!taken) return spot;
    }
    return null;
}

function round(value) {
    return Math.round(value * 100) / 100;
}
