// Deterministic wildlife MOTION for World View — where a wild animal is at a
// given moment, layered on top of core/WildlifeField.js's own placement:
//
//   core/WildlifeField.js  = "Where was this animal placed?"   f(seed, x, z)
//   core/WildlifeMotion.js = "Where is it right now?"           f(seed, animal, time)
//
// animalPoseAt() and wildlifeInRegionAt() are PURE functions of exactly
// their own arguments. Time is an argument, never read here: no Date.now,
// no Math.random, no per-animal state. That keeps wildlife "sampled, never
// stored" in time as well as space — two replicas whose clocks agree see
// the same animal in the same place without exchanging a single message,
// and walking away from a region and coming back finds each animal exactly
// where the formula says it is by now, not where it was left.
//
// HOW AN ANIMAL MOVES. Time is cut into fixed-length segments per species,
// offset per animal so a herd never moves in lockstep. Segment k starts
// with the animal standing at waypoint k, pausing (and, just before
// setting off, turning toward its next waypoint), then walking to
// waypoint k+1 so that it arrives exactly as segment k+1 begins. Every
// waypoint is a hash of (seed, cell, k), so the path is continuous and any
// moment of it can be computed directly, without replaying earlier ones.
//
// AN ANIMAL NEVER LEAVES ITS OWN LATTICE CELL. Each waypoint lies within
// the species' wander radius of the spawn point and is clamped inside the
// cell the animal was placed in. Disc and cell are both convex, so every
// point on the straight walk between two waypoints stays inside both too.
// Staying in the cell keeps core/WildlifeField.js's partition guarantee —
// exactly one render tile owns each animal — true while it moves, so tile
// streaming, catch exclusion and core/AnimalIdentity.js's cell-derived ids
// need no change. Staying within the wander radius bounds how far a
// region query must look beyond its own edges (MAX_WANDER_DISTANCE).
//
// A waypoint outside the animal's own ecology zone, or in a river channel,
// is replaced by the spawn point, which always qualifies. The straight
// walk between two valid waypoints is not re-checked, so an animal can
// briefly cut across the corner of a neighboring zone.

import { WILDLIFE_LATTICE_SPACING, ANIMAL_SPECIES, wildlifeInRegion } from './WildlifeField.js';
import { terrainHeightAt } from './TerrainHeightField.js';
import { ecologyZoneAt } from './TerrainEcology.js';
import { isRiverAt } from './Hydrology.js';
import { lerp, smoothstep } from '../utils/interpolation.js';

// Per species: how far from its spawn point it roams, how fast it walks
// (average speed over a walk; the eased walk peaks at 1.5x this), and how
// long one pause-then-walk segment lasts. A segment is always long enough
// for the longest possible walk (twice the wander radius) plus a pause.
export const ANIMAL_MOTION = Object.freeze({
    [ANIMAL_SPECIES.DEER]: Object.freeze({ wanderRadius: 3, walkSpeed: 0.8, segmentSeconds: 14 }),
    [ANIMAL_SPECIES.RABBIT]: Object.freeze({ wanderRadius: 2, walkSpeed: 1.6, segmentSeconds: 7 })
});

// The farthest any animal can ever be from its spawn point.
export const MAX_WANDER_DISTANCE = Math.max(...Object.values(ANIMAL_MOTION).map((motion) => motion.wanderRadius));

// Waypoints keep this far inside their cell's edges.
const CELL_EDGE_MARGIN = 0.5;

// How long before setting off an animal turns toward its next waypoint.
const TURN_SECONDS = 0.8;

// Waypoints closer than this are treated as the same point: no walk, and
// no heading can be derived from them.
const SAME_POINT_DISTANCE = 1e-6;

// Arbitrary but fixed forever, and far from every seed offset in
// core/WildlifeField.js, for the same decorrelation reason that file gives.
const PHASE_SEED_OFFSET = 0x4d504853;    // 'MPHS'
const ANGLE_SEED_OFFSET = 0x4d414e47;    // 'MANG'
const DISTANCE_SEED_OFFSET = 0x4d445354; // 'MDST'

const TWO_PI = Math.PI * 2;

// Module-private hash, per this codebase's one-primitive-per-field habit
// (see core/WildlifeField.js#hash2D): a 32-bit avalanche over three
// integers, returning [0, 1).
function hash3D(seed, a, b, c) {
    let h = seed | 0;
    h = Math.imul(h ^ (a | 0), 0x27d4eb2d);
    h = Math.imul(h ^ ((b | 0) + 0x9e3779b9), 0x165667b1);
    h = Math.imul(h ^ ((c | 0) + 0x7f4a7c15), 0x85ebca6b);
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

function motionFor(species) {
    return ANIMAL_MOTION[species] ?? ANIMAL_MOTION[ANIMAL_SPECIES.RABBIT];
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function normalizeAngle(angle) {
    const wrapped = angle % TWO_PI;
    return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}

// Turns from `from` toward `to` the short way round, `t` in [0, 1].
function lerpAngle(from, to, t) {
    let delta = (to - from) % TWO_PI;
    if (delta > Math.PI) delta -= TWO_PI;
    if (delta < -Math.PI) delta += TWO_PI;
    return from + delta * t;
}

// Waypoint k of `animal`'s path. Spawn-relative, clamped into the spawn
// cell, and vetoed back to the spawn point off-zone or in a river.
function waypoint(seed, animal, cellX, cellZ, k, wanderRadius) {
    const angle = hash3D(seed + ANGLE_SEED_OFFSET, cellX, cellZ, k) * TWO_PI;
    // sqrt spreads waypoints evenly over the disc instead of bunching them
    // at its center.
    const distance = Math.sqrt(hash3D(seed + DISTANCE_SEED_OFFSET, cellX, cellZ, k)) * wanderRadius;
    const minX = cellX * WILDLIFE_LATTICE_SPACING + CELL_EDGE_MARGIN;
    const minZ = cellZ * WILDLIFE_LATTICE_SPACING + CELL_EDGE_MARGIN;
    const maxX = (cellX + 1) * WILDLIFE_LATTICE_SPACING - CELL_EDGE_MARGIN;
    const maxZ = (cellZ + 1) * WILDLIFE_LATTICE_SPACING - CELL_EDGE_MARGIN;
    const x = clamp(animal.x + Math.sin(angle) * distance, minX, maxX);
    const z = clamp(animal.z + Math.cos(angle) * distance, minZ, maxZ);
    if (ecologyZoneAt(seed, x, z) !== animal.zone || isRiverAt(seed, x, z)) {
        return { x: animal.x, z: animal.z };
    }
    return { x, z };
}

// Heading that points local +Z (where renderer/WildlifeTileMesh.js puts
// the head) from `from` toward `to`, or null when they coincide.
function headingBetween(from, to) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    if (Math.hypot(dx, dz) <= SAME_POINT_DISTANCE) return null;
    return Math.atan2(dx, dz);
}

// How many earlier segments arrivalHeadingAt() looks back through.
const ARRIVAL_LOOKBACK_SEGMENTS = 4;

// The heading `animal` stands at on reaching waypoint k (`from`): that of
// the last walk that actually moved it. A segment whose two waypoints
// coincide (both vetoed back to the spawn point) is no walk at all, so it
// looks further back; with no real walk in reach it falls back to the
// placement rotation.
function arrivalHeadingAt(seed, animal, cellX, cellZ, k, from, wanderRadius) {
    let to = from;
    for (let back = 1; back <= ARRIVAL_LOOKBACK_SEGMENTS; back++) {
        const previous = waypoint(seed, animal, cellX, cellZ, k - back, wanderRadius);
        const heading = headingBetween(previous, to);
        if (heading !== null) return heading;
        to = previous;
    }
    return animal.rotationY;
}

// Where `animal` — one record exactly as core/WildlifeField.js#wildlifeInRegion()
// returns it — is at `timeSeconds` (any finite number; callers pass
// wall-clock seconds). Returns { x, y, z, rotationY, moving }: y is the
// terrain height under the animal, rotationY is in [0, 2π), and moving
// says whether it is walking rather than standing.
export function animalPoseAt(seed, animal, timeSeconds) {
    if (typeof timeSeconds !== 'number' || !Number.isFinite(timeSeconds)) {
        throw new Error(`animalPoseAt requires a finite timeSeconds, got ${JSON.stringify(timeSeconds)}`);
    }
    const motion = motionFor(animal.species);
    const cellX = Math.floor(animal.x / WILDLIFE_LATTICE_SPACING);
    const cellZ = Math.floor(animal.z / WILDLIFE_LATTICE_SPACING);

    const segments = timeSeconds / motion.segmentSeconds + hash3D(seed + PHASE_SEED_OFFSET, cellX, cellZ, 0);
    const k = Math.floor(segments);
    const secondsIntoSegment = (segments - k) * motion.segmentSeconds;

    const from = waypoint(seed, animal, cellX, cellZ, k, motion.wanderRadius);
    const to = waypoint(seed, animal, cellX, cellZ, k + 1, motion.wanderRadius);
    const departureHeading = headingBetween(from, to);
    const walkSeconds = departureHeading === null
        ? 0
        : Math.hypot(to.x - from.x, to.z - from.z) / motion.walkSpeed;
    const walkStart = motion.segmentSeconds - walkSeconds;

    let x;
    let z;
    let rotationY;
    let moving = false;
    if (departureHeading !== null && secondsIntoSegment >= walkStart) {
        const progress = smoothstep((secondsIntoSegment - walkStart) / walkSeconds);
        x = lerp(from.x, to.x, progress);
        z = lerp(from.z, to.z, progress);
        rotationY = departureHeading;
        moving = true;
    } else {
        x = from.x;
        z = from.z;
        const arrivalHeading = arrivalHeadingAt(seed, animal, cellX, cellZ, k, from, motion.wanderRadius);
        rotationY = arrivalHeading;
        const turnProgress = (secondsIntoSegment - (walkStart - TURN_SECONDS)) / TURN_SECONDS;
        if (turnProgress > 0) {
            // Walking next: face the way it is about to go. Staying put:
            // face the way the next segment starts out facing, which
            // differs only once the last real walk falls out of
            // arrivalHeadingAt()'s look-back — so that change turns too,
            // instead of snapping at the segment boundary.
            const nextHeading = departureHeading
                ?? arrivalHeadingAt(seed, animal, cellX, cellZ, k + 1, to, motion.wanderRadius);
            rotationY = lerpAngle(arrivalHeading, nextHeading, smoothstep(Math.min(turnProgress, 1)));
        }
    }

    return {
        x,
        y: terrainHeightAt(seed, x, z),
        z,
        rotationY: normalizeAngle(rotationY),
        moving
    };
}

// wildlifeInRegion() at a moment in time: every animal whose CURRENT
// position falls within [minX, maxX) x [minZ, maxZ), as the same records
// wildlifeInRegion() returns with x/y/z/rotationY replaced by the animal's
// pose at `timeSeconds`, plus `moving`, `spawnX` and `spawnZ`. Sorted the
// same way (by x, then z).
//
// Looks MAX_WANDER_DISTANCE beyond every edge for placements, since an
// animal placed just outside the region can have walked into it (and one
// placed inside can have walked out).
//
// `timeSeconds` null or undefined returns the animals at their placed
// positions — wildlifeInRegion() with the same added fields — for callers
// that have no clock.
export function wildlifeInRegionAt(seed, minX, minZ, maxX, maxZ, timeSeconds = null) {
    if (timeSeconds === null || timeSeconds === undefined) {
        return wildlifeInRegion(seed, minX, minZ, maxX, maxZ)
            .map((animal) => ({ ...animal, moving: false, spawnX: animal.x, spawnZ: animal.z }));
    }
    const animals = [];
    const placed = wildlifeInRegion(
        seed,
        minX - MAX_WANDER_DISTANCE,
        minZ - MAX_WANDER_DISTANCE,
        maxX + MAX_WANDER_DISTANCE,
        maxZ + MAX_WANDER_DISTANCE
    );
    for (const animal of placed) {
        const pose = animalPoseAt(seed, animal, timeSeconds);
        if (pose.x < minX || pose.x >= maxX || pose.z < minZ || pose.z >= maxZ) continue;
        animals.push({ ...animal, ...pose, spawnX: animal.x, spawnZ: animal.z });
    }
    animals.sort((a, b) => (a.x - b.x) || (a.z - b.z));
    return animals;
}
