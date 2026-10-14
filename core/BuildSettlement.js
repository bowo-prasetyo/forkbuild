import { computeFnv1a32 } from '../serializer/contentHash.js';
import { PLAZA_CENTER, PLAZA_VILLAGE_RADIUS } from './ChallengePlaza.js';
import { SURFACE_CATEGORY, surfaceCategoryAt } from './TerrainSurface.js';
import { HYDROLOGY_FEATURE, hydrologyFeatureAt } from './Hydrology.js';
import { DEFAULT_WORLD_SEED } from './TerrainHeightField.js';
import { naturalFeaturesInRegion } from './NaturalFeatureField.js';

// Where a newly published build settles in the shared World
// (docs/reviews/CreativeDirection-2026-10-12.md, finding 2): next to what it
// belongs with, so that builds have neighbours and the World can look like
// Home's village rather than one build alone in a field.
//
// - A remix stands in a ring round the build it remixes, so a family tree
//   becomes a street.
// - Anything else joins the village that grows round the challenge plaza,
//   ring by ring from the inside out, so builds published about the same
//   time stand together and the plaza is the village square.
//
// Pure: the caller says which spots are taken (by the placements it knows of)
// and this picks the first free one, starting from a slot the build's own id
// chooses, so two builders who don't know of each other rarely pick the same
// spot. A spot claims no land (docs/user/WorldViewAdvancedTools.md, "Why can
// two builds sit in the same spot?"); the chosen position becomes the build's
// signed placement, which everyone who finds the build adopts.

// The village's first ring, just outside the plaza's clearing and its
// ready-made builds (core/StarterVillage.js): close enough that a build on
// it sees the square, well inside World View's streaming radius.
export const VILLAGE_FIRST_RING_RADIUS = PLAZA_VILLAGE_RADIUS + 8;
// Between two rings, and between two neighbours on a ring: room for a
// house and its garden.
export const VILLAGE_RING_SPACING = 22;
export const VILLAGE_SLOT_SPACING = 20;
// How far out the village may grow before a build falls back to the grid.
export const VILLAGE_MAX_RINGS = 40;

// The rings round a remixed build: close enough to be one street.
export const REMIX_RING_RADII = Object.freeze([18, 36]);

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

// The village spot for a build: `{ x, y, z }`, or null when every ring up to
// VILLAGE_MAX_RINGS is taken or under water. `isTaken(x, z)` answers from
// the placements the caller knows of.
export function settleInVillage({ publicationId, isTaken = () => false, seed = DEFAULT_WORLD_SEED, center = PLAZA_CENTER }) {
    for (let ring = 0; ring < VILLAGE_MAX_RINGS; ring++) {
        const spot = firstFreeSpot(ringSpots(center, VILLAGE_FIRST_RING_RADIUS + ring * VILLAGE_RING_SPACING, VILLAGE_SLOT_SPACING), { publicationId, isTaken, seed });
        if (spot) return spot;
    }
    return null;
}

// The spot beside the build a remix comes from, standing at `source`, or
// null when its rings are full.
export function settleBeside({ source, publicationId, isTaken = () => false, seed = DEFAULT_WORLD_SEED }) {
    if (!source || !Number.isFinite(source.x) || !Number.isFinite(source.z)) return null;
    const center = { x: source.x, y: Number.isFinite(source.y) ? source.y : 0, z: source.z };
    for (const radius of REMIX_RING_RADII) {
        const spot = firstFreeSpot(ringSpots(center, radius, VILLAGE_SLOT_SPACING), { publicationId, isTaken, seed });
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
