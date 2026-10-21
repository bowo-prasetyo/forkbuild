// Deterministic wildlife MOTION for World View — where a wild animal is at a
// given moment, layered on top of core/nature/WildlifeField.js's own placement:
//
//   core/nature/WildlifeField.js  = "Where was this animal placed?"   f(seed, x, z)
//   core/nature/WildlifeMotion.js = "Where is it right now?"           f(seed, animal, time)
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
// Staying in the cell keeps core/nature/WildlifeField.js's partition guarantee —
// exactly one render tile owns each animal — true while it moves, so tile
// streaming, catch exclusion and core/nature/AnimalIdentity.js's cell-derived ids
// need no change. Staying within the wander radius bounds how far a
// region query must look beyond its own edges (MAX_WANDER_DISTANCE).
//
// AT NIGHT IT BEDS DOWN. From nightfall to dawn (core/nature/Nightfall.js, on
// the World's own clock) every waypoint is the spawn point: an animal walks
// back there in the dusk and lies down (IDLE_ACTION.REST) until morning,
// facing the way it came in.
//
// AN ANIMAL NEVER WADES ACROSS A RIVER. A waypoint outside the animal's own
// ecology zone, in a river channel, or whose walk out from the spawn point
// would cross one, is replaced by the spawn point, which always qualifies.
// So every waypoint can reach the spawn point dry-footed, and the walk from
// waypoint k to waypoint k+1 goes straight when that is dry too, and
// otherwise by way of the spawn point, with a turn there — the same scheme
// core/world/ResidentMotion.js uses to walk a resident around a wall. Each
// decision depends only on (seed, cell, k), so any moment can still be
// computed directly. A walk may still cut across the corner of a
// neighboring ecology zone.

import { WILDLIFE_LATTICE_SPACING, ANIMAL_SPECIES, wildlifeInRegion } from './WildlifeField.js';
import { terrainHeightAt } from './TerrainHeightField.js';
import { ecologyZoneAt } from './TerrainEcology.js';
import { isRiverAt } from './Hydrology.js';
import { isNightfallAt } from './Nightfall.js';
import { lerp, smoothstep } from '../../utils/interpolation.js';

// Per species: how far from its spawn point it roams, how fast it walks
// (average speed over a walk; the eased walk peaks at 1.5x this), how
// long one pause-then-walk segment lasts, and how much ground one stride
// covers (a deer's full step cycle, one rabbit hop). A segment is always
// long enough for the longest possible walk (twice the wander radius)
// plus a pause.
//
// `idleChances` is how often a pause is spent on each IDLE_ACTION (below);
// whatever is left over is spent simply standing.
export const ANIMAL_MOTION = Object.freeze({
    [ANIMAL_SPECIES.DEER]: Object.freeze({
        wanderRadius: 3, walkSpeed: 0.8, segmentSeconds: 14, strideLength: 1.0,
        idleChances: Object.freeze({ GRAZE: 0.55, ALERT: 0.25 })
    }),
    [ANIMAL_SPECIES.RABBIT]: Object.freeze({
        wanderRadius: 2, walkSpeed: 1.6, segmentSeconds: 7, strideLength: 0.5,
        idleChances: Object.freeze({ GRAZE: 0.5, ALERT: 0.3 })
    })
});

// What a standing animal is doing during a pause. How each one looks is
// the renderer's business (renderer/AnimalIdle.js); which one, and when,
// is decided here, so every replica sees the same deer grazing.
export const IDLE_ACTION = Object.freeze({
    NONE: 'NONE',     // just standing
    GRAZE: 'GRAZE',   // head down, eating
    ALERT: 'ALERT',   // head up (a rabbit sits up), looking around
    REST: 'REST'      // lying down for the night
});

// While an animal rests the night through, its idle window runs on across
// segment boundaries: it is reported as reaching this far before and after
// them, so the rest eases in at nightfall and out at dawn, never between.
const NIGHT_REST_CARRY_SECONDS = 1000;

// How far back to look for where a night's rest began.
const MAX_NIGHT_SEGMENTS = 1000;

// The segment a night's rest began in, per animal and segment: looking back
// for it costs a few dozen steps, and the same few segments are asked about
// on every frame.
const nightStartCache = new Map();
const MAX_CACHED_NIGHT_STARTS = 8192;

// The first segment of the night segment `k` belongs to, `restsIn(segment)`
// saying which segments are night; `key` names the animal.
function nightStartOf(key, k, restsIn) {
    const id = `${key}:${k}`;
    const kept = nightStartCache.get(id);
    if (kept !== undefined) return kept;
    let start = k;
    while (k - start < MAX_NIGHT_SEGMENTS && restsIn(start - 1)) start--;
    if (nightStartCache.size >= MAX_CACHED_NIGHT_STARTS) nightStartCache.clear();
    nightStartCache.set(id, start);
    return start;
}

// A pause too short to fit an action in, eased in and out, is spent standing.
const MIN_IDLE_SECONDS = 1.5;

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
// core/nature/WildlifeField.js, for the same decorrelation reason that file gives.
const PHASE_SEED_OFFSET = 0x4d504853;    // 'MPHS'
const ANGLE_SEED_OFFSET = 0x4d414e47;    // 'MANG'
const DISTANCE_SEED_OFFSET = 0x4d445354; // 'MDST'
const IDLE_SEED_OFFSET = 0x4d49444c;     // 'MIDL'

const TWO_PI = Math.PI * 2;

// Module-private hash, per this codebase's one-primitive-per-field habit
// (see core/nature/WildlifeField.js#hash2D): a 32-bit avalanche over three
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

// How far apart a walk is checked for river water.
const RIVER_SAMPLE_SPACING = 0.5;

// Whether the straight walk from `from` to `to` stays out of every river
// channel, ends included.
function isDryWalk(seed, from, to) {
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    const steps = Math.max(1, Math.ceil(length / RIVER_SAMPLE_SPACING));
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        if (isRiverAt(seed, from.x + (to.x - from.x) * t, from.z + (to.z - from.z) * t)) return false;
    }
    return true;
}

// Whether segment k of the animal in cell (cellX, cellZ) starts after
// nightfall, when it rests at its spawn point.
function restsAt(seed, cellX, cellZ, k, segmentSeconds) {
    return isNightfallAt((k - hash3D(seed + PHASE_SEED_OFFSET, cellX, cellZ, 0)) * segmentSeconds);
}

// Waypoint k of `animal`'s path. Spawn-relative, clamped into the spawn
// cell, and vetoed back to the spawn point off-zone, in a river, or when the
// walk out to it from the spawn point would cross one; the spawn point, too,
// for a segment that starts at night.
function waypoint(seed, animal, cellX, cellZ, k, wanderRadius, segmentSeconds) {
    if (restsAt(seed, cellX, cellZ, k, segmentSeconds)) return { x: animal.x, z: animal.z };
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
    const spawn = { x: animal.x, z: animal.z };
    if (ecologyZoneAt(seed, x, z) !== animal.zone || !isDryWalk(seed, spawn, { x, z })) {
        return spawn;
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

function samePoint(a, b) {
    return Math.hypot(b.x - a.x, b.z - a.z) <= SAME_POINT_DISTANCE;
}

// Segment k's walk, as computed once: `from` (waypoint k), `to` (waypoint
// k+1) and the legs between them — none when they coincide, one when the
// straight walk is dry, else two by way of the spawn point. A pure function
// of (seed, animal, k), so it is kept in a small cache: the same few
// segments are asked about on every frame, and the river check is the
// costly part.
const segmentCache = new Map();
const MAX_CACHED_SEGMENTS = 8192;

function segmentWalk(seed, animal, cellX, cellZ, k, motion) {
    const { wanderRadius, segmentSeconds } = motion;
    const key = `${seed}:${cellX},${cellZ}:${animal.x},${animal.z}:${wanderRadius}:${segmentSeconds}:${k}`;
    const cached = segmentCache.get(key);
    if (cached) return cached;
    const from = waypoint(seed, animal, cellX, cellZ, k, wanderRadius, segmentSeconds);
    const to = waypoint(seed, animal, cellX, cellZ, k + 1, wanderRadius, segmentSeconds);
    const spawn = { x: animal.x, z: animal.z };
    let legs;
    if (samePoint(from, to)) {
        legs = [];
    } else if (isDryWalk(seed, from, to)) {
        legs = [[from, to]];
    } else {
        legs = [[from, spawn], [spawn, to]].filter(([a, b]) => !samePoint(a, b));
    }
    const walk = { from, to, legs };
    if (segmentCache.size >= MAX_CACHED_SEGMENTS) segmentCache.clear();
    segmentCache.set(key, walk);
    return walk;
}

// Which IDLE_ACTION a uniform roll in [0, 1) lands on.
function idleActionFor(roll, chances) {
    if (roll < chances.GRAZE) return IDLE_ACTION.GRAZE;
    if (roll < chances.GRAZE + chances.ALERT) return IDLE_ACTION.ALERT;
    return IDLE_ACTION.NONE;
}

// How many earlier segments arrivalHeadingAt() looks back through.
const ARRIVAL_LOOKBACK_SEGMENTS = 4;

// The heading `animal` stands at on reaching waypoint k: that of the last
// leg of the last walk that actually moved it. A segment whose two
// waypoints coincide (both vetoed back to the spawn point) is no walk at
// all, so it looks further back; with no real walk in reach it falls back
// to the placement rotation.
function arrivalHeadingAt(seed, animal, cellX, cellZ, k, motion) {
    for (let back = 1; back <= ARRIVAL_LOOKBACK_SEGMENTS; back++) {
        const { legs } = segmentWalk(seed, animal, cellX, cellZ, k - back, motion);
        if (legs.length > 0) {
            const [a, b] = legs[legs.length - 1];
            return headingBetween(a, b);
        }
    }
    return animal.rotationY;
}

// Where `animal` — one record exactly as core/nature/WildlifeField.js#wildlifeInRegion()
// returns it — is at `timeSeconds` (any finite number; callers pass
// wall-clock seconds). Returns { x, y, z, rotationY, moving, gaitPhase }:
// y is the terrain height under the animal, rotationY is in [0, 2π),
// moving says whether it is walking rather than standing, and gaitPhase
// counts strides walked so far in the current leg of the walk — 0 when
// standing, rising to a whole number on reaching the end of the leg. Its
// fractional part is how far through the current stride the animal is;
// how that looks (a hop, a step) is the renderer's business
// (renderer/AnimalGait.js).
//
// A standing animal also reports idleAction (an IDLE_ACTION), idleSeconds
// (how far into it) and idleDuration (how long it lasts): one action per
// pause, lasting from arrival until the animal turns to set off again.
// While walking or turning, idleAction is NONE and both times are 0.
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

    const { from, legs } = segmentWalk(seed, animal, cellX, cellZ, k, motion);
    const legLengths = legs.map(([a, b]) => Math.hypot(b.x - a.x, b.z - a.z));
    const legSeconds = legLengths.map((length) => length / motion.walkSpeed);
    // Legs walk back to back, with a turn in place at the spawn point
    // between two of them.
    const walkSeconds = legSeconds.reduce((sum, seconds) => sum + seconds, 0)
        + Math.max(0, legs.length - 1) * TURN_SECONDS;
    const walkStart = motion.segmentSeconds - walkSeconds;

    let x = from.x;
    let z = from.z;
    let rotationY;
    let moving = false;
    let gaitPhase = 0;
    let idleAction = IDLE_ACTION.NONE;
    let idleSeconds = 0;
    let idleDuration = 0;
    let walking = false;
    if (legs.length > 0 && secondsIntoSegment >= walkStart) {
        walking = true;
        let t = secondsIntoSegment - walkStart;
        for (let i = 0; i < legs.length; i++) {
            const [a, b] = legs[i];
            if (t < legSeconds[i] || i === legs.length - 1) {
                const progress = smoothstep(Math.min(1, t / legSeconds[i]));
                x = lerp(a.x, b.x, progress);
                z = lerp(a.z, b.z, progress);
                rotationY = headingBetween(a, b);
                moving = true;
                // A whole number of strides per leg, so the last stride ends
                // exactly on arrival: gaitPhase runs from 0 to that whole
                // number, in step with the ground actually covered (the eased
                // walk's progress), so the gait never slides and never cuts
                // off mid-hop. Rounded down, so a stride is never shorter than
                // strideLength and the cadence never outruns the species' own
                // (a rabbit never flutters through tiny hops); a leg shorter
                // than one stride has none, and the animal just shuffles over.
                gaitPhase = progress * Math.floor(legLengths[i] / motion.strideLength);
                break;
            }
            t -= legSeconds[i];
            if (t < TURN_SECONDS) {
                // Standing at the spawn point, turning toward the next leg.
                const [c, d] = legs[i + 1];
                x = b.x;
                z = b.z;
                rotationY = lerpAngle(headingBetween(a, b), headingBetween(c, d), smoothstep(t / TURN_SECONDS));
                break;
            }
            t -= TURN_SECONDS;
        }
    }
    const resting = !walking && restsAt(seed, cellX, cellZ, k, motion.segmentSeconds);
    if (resting) {
        // Lying at the spawn point the night through, facing the way it came
        // in at nightfall. The rest runs on from the segment before and into
        // the one after while those are night too, so it eases in only at
        // nightfall and out only before the morning's first turn.
        const before = restsAt(seed, cellX, cellZ, k - 1, motion.segmentSeconds);
        const after = restsAt(seed, cellX, cellZ, k + 1, motion.segmentSeconds);
        const nightStart = nightStartOf(`${seed}:${cellX},${cellZ}:${motion.segmentSeconds}`, k,
            (segment) => restsAt(seed, cellX, cellZ, segment, motion.segmentSeconds));
        const bedHeading = arrivalHeadingAt(seed, animal, cellX, cellZ, nightStart, motion);
        rotationY = bedHeading;
        const carryIn = before ? NIGHT_REST_CARRY_SECONDS : 0;
        const restEnd = after ? motion.segmentSeconds + NIGHT_REST_CARRY_SECONDS : walkStart - TURN_SECONDS;
        if (after || secondsIntoSegment < restEnd) {
            idleAction = IDLE_ACTION.REST;
            idleSeconds = secondsIntoSegment + carryIn;
            idleDuration = restEnd + carryIn;
        }
        const turnProgress = (secondsIntoSegment - (walkStart - TURN_SECONDS)) / TURN_SECONDS;
        if (!after && turnProgress > 0) {
            // Morning: up, and turning toward the day's first walk (or the
            // way the day starts out facing).
            const nextHeading = legs.length > 0
                ? headingBetween(legs[0][0], legs[0][1])
                : arrivalHeadingAt(seed, animal, cellX, cellZ, k + 1, motion);
            rotationY = lerpAngle(bedHeading, nextHeading, smoothstep(Math.min(turnProgress, 1)));
        }
    } else if (!walking) {
        const arrivalHeading = arrivalHeadingAt(seed, animal, cellX, cellZ, k, motion);
        rotationY = arrivalHeading;
        // The idle window: from arrival until the animal starts turning
        // toward its next waypoint, so an idle action never overlaps a turn
        // or a walk. One action per pause, chosen by (seed, cell, segment).
        const idleEnd = walkStart - TURN_SECONDS;
        if (idleEnd >= MIN_IDLE_SECONDS && secondsIntoSegment < idleEnd) {
            idleAction = idleActionFor(hash3D(seed + IDLE_SEED_OFFSET, cellX, cellZ, k), motion.idleChances);
            idleSeconds = secondsIntoSegment;
            idleDuration = idleEnd;
        }
        const turnProgress = (secondsIntoSegment - (walkStart - TURN_SECONDS)) / TURN_SECONDS;
        if (turnProgress > 0) {
            // Walking next: face the way it is about to go. Staying put:
            // face the way the next segment starts out facing, which
            // differs only once the last real walk falls out of
            // arrivalHeadingAt()'s look-back — so that change turns too,
            // instead of snapping at the segment boundary.
            const nextHeading = legs.length > 0
                ? headingBetween(legs[0][0], legs[0][1])
                : arrivalHeadingAt(seed, animal, cellX, cellZ, k + 1, motion);
            rotationY = lerpAngle(arrivalHeading, nextHeading, smoothstep(Math.min(turnProgress, 1)));
        }
    }

    return {
        x,
        y: terrainHeightAt(seed, x, z),
        z,
        rotationY: normalizeAngle(rotationY),
        moving,
        gaitPhase,
        idleAction,
        idleSeconds,
        idleDuration
    };
}

// wildlifeInRegion() at a moment in time: every animal whose CURRENT
// position falls within [minX, maxX) x [minZ, maxZ), as the same records
// wildlifeInRegion() returns with x/y/z/rotationY replaced by the animal's
// pose at `timeSeconds`, plus `moving`, `gaitPhase`, the idle fields, `spawnX` and `spawnZ`. Sorted the
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
            .map((animal) => ({
                ...animal, moving: false, gaitPhase: 0,
                idleAction: IDLE_ACTION.NONE, idleSeconds: 0, idleDuration: 0,
                spawnX: animal.x, spawnZ: animal.z
            }));
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

// How long an animal that stays put takes to turn to a new heading.
const STATIONARY_TURN_SECONDS = 1.2;

// Module-private FNV-1a over a string's UTF-16 code units, for animals
// keyed by an id rather than a lattice cell.
function hashString(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    }
    return h | 0;
}

// The pose of an animal that never leaves its spot — a released animal
// (application/world/AnimalRuntimeInstances.js) or an AnimalDecoration.
// Both have an authoritative position, often on top of something a player
// built, so walking off it would leave the animal standing in mid-air; it
// only idles and turns in place. Returns { rotationY, moving, gaitPhase,
// idleAction, idleSeconds, idleDuration } in the same shape and meaning as
// animalPoseAt() (moving is always false; there is no x/y/z, since the
// position is the caller's own).
//
// Keyed by `animalKey` (its id) instead of a lattice cell: a decoration's
// id is part of the World document, so every replica that loads the World
// sees it doing the same thing at the same moment. Time runs in the same
// per-species segments as a wandering animal's: each one is a pause spent
// on one IDLE_ACTION, then a turn in place to a new heading; at night it
// lies down (IDLE_ACTION.REST) until morning.
export function stationaryAnimalPoseAt(seed, animalKey, species, timeSeconds) {
    if (typeof timeSeconds !== 'number' || !Number.isFinite(timeSeconds)) {
        throw new Error(`stationaryAnimalPoseAt requires a finite timeSeconds, got ${JSON.stringify(timeSeconds)}`);
    }
    const motion = motionFor(species);
    const key = hashString(String(animalKey));
    const segments = timeSeconds / motion.segmentSeconds + hash3D(seed + PHASE_SEED_OFFSET, key, 0, 0);
    const k = Math.floor(segments);
    const secondsIntoSegment = (segments - k) * motion.segmentSeconds;
    const headingAt = (segment) => hash3D(seed + ANGLE_SEED_OFFSET, key, 1, segment) * TWO_PI;
    const phase = hash3D(seed + PHASE_SEED_OFFSET, key, 0, 0);
    const restsIn = (segment) => isNightfallAt((segment - phase) * motion.segmentSeconds);

    const turnStart = motion.segmentSeconds - STATIONARY_TURN_SECONDS;
    let idleAction = IDLE_ACTION.NONE;
    let idleSeconds = 0;
    let idleDuration = 0;
    let rotationY;
    if (restsIn(k)) {
        // At night it lies down where it stands, facing the way it faced at
        // nightfall, the rest running on across segments as a wandering
        // animal's does (animalPoseAt()).
        const nightStart = nightStartOf(`${seed}:${key}:${motion.segmentSeconds}`, k, restsIn);
        rotationY = headingAt(nightStart);
        const carryIn = restsIn(k - 1) ? NIGHT_REST_CARRY_SECONDS : 0;
        const after = restsIn(k + 1);
        const restEnd = after ? motion.segmentSeconds + NIGHT_REST_CARRY_SECONDS : turnStart;
        if (after || secondsIntoSegment < restEnd) {
            idleAction = IDLE_ACTION.REST;
            idleSeconds = secondsIntoSegment + carryIn;
            idleDuration = restEnd + carryIn;
        }
        if (!after && secondsIntoSegment >= turnStart) {
            const progress = smoothstep((secondsIntoSegment - turnStart) / STATIONARY_TURN_SECONDS);
            rotationY = lerpAngle(rotationY, headingAt(k + 1), progress);
        }
    } else {
        rotationY = headingAt(k);
        if (secondsIntoSegment >= turnStart) {
            const progress = smoothstep((secondsIntoSegment - turnStart) / STATIONARY_TURN_SECONDS);
            rotationY = lerpAngle(rotationY, headingAt(k + 1), progress);
        }
        if (turnStart >= MIN_IDLE_SECONDS && secondsIntoSegment < turnStart) {
            idleAction = idleActionFor(hash3D(seed + IDLE_SEED_OFFSET, key, 1, k), motion.idleChances);
            idleSeconds = secondsIntoSegment;
            idleDuration = turnStart;
        }
    }

    return {
        rotationY: normalizeAngle(rotationY),
        moving: false,
        gaitPhase: 0,
        idleAction,
        idleSeconds,
        idleDuration
    };
}
