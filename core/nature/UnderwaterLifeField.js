import { terrainHeightAt } from './TerrainHeightField.js';
import { surfaceCategoryAt, SURFACE_CATEGORY } from './TerrainSurface.js';
import { LAKE_SURFACE_HEIGHT } from './Hydrology.js';

// Deterministic underwater life for lakes and the sea: seaweed rooted on the bed
// and small schools of fish circling in open water. Like trees and wildlife it
// is a pure function of (seed, region) on a jittered lattice, so every peer sees
// the same fish in the same place at the same moment, nothing is stored, and a
// region queried twice returns the same answer.
//
// Fish never leave the water: a school only forms where the water is deep over
// its whole circle, and each fish swims between the bed and the surface there.

export const UNDERWATER_LIFE_TYPE = Object.freeze({
    SEAWEED: 'SEAWEED',
    FISH_SCHOOL: 'FISH_SCHOOL'
});

export const SEAWEED_LATTICE_SPACING = 3;
export const FISH_SCHOOL_LATTICE_SPACING = 14;

const SEAWEED_MIN_DEPTH = 1.2;
const SEAWEED_THRESHOLD = 0.78; // share of eligible cells left bare
const SEAWEED_MIN_HEIGHT = 0.7;
const SEAWEED_MAX_HEIGHT = 2.6;
const SEAWEED_SURFACE_CLEARANCE = 0.4;

const FISH_MIN_DEPTH = 2.5;
const FISH_SCHOOL_THRESHOLD = 0.4;
const FISH_MIN_PER_SCHOOL = 4;
const FISH_MAX_PER_SCHOOL = 9;
export const FISH_MAX_ORBIT_RADIUS = 4.5;
const FISH_BED_CLEARANCE = 0.6;
const FISH_SURFACE_CLEARANCE = 0.7;
export const FISH_VARIANT_COUNT = 4;
export const SEAWEED_VARIANT_COUNT = 3;

const JITTER_MARGIN = 0.15;
const JITTER_RANGE = 1 - JITTER_MARGIN * 2;

// Seed offsets keep each decision independent of the others.
const SEAWEED_PRESENCE = 0x55575031; // 'UWP1'
const SEAWEED_JITTER_X = 0x55574a58;
const SEAWEED_JITTER_Z = 0x55574a5a;
const SEAWEED_HEIGHT = 0x55574854;
const SEAWEED_VARIANT = 0x55575641;
const SEAWEED_PHASE = 0x55575048;
const SCHOOL_PRESENCE = 0x55534350;
const SCHOOL_JITTER_X = 0x5553584a;
const SCHOOL_JITTER_Z = 0x55535a4a;
const SCHOOL_SIZE = 0x5553535a;
const SCHOOL_VARIANT = 0x55535641;
const SCHOOL_DIRECTION = 0x55534452;
const FISH_RADIUS = 0x55465244;
const FISH_SPEED = 0x55465350;
const FISH_PHASE = 0x55465048;
const FISH_HEIGHT = 0x55464854;
const FISH_SCALE = 0x5546534c;

function hash3(seed, a, b, c = 0) {
    let h = seed | 0;
    h = Math.imul(h ^ a, 0x27d4eb2d);
    h = Math.imul(h ^ (b + 0x9e3779b9), 0x165667b1);
    h = Math.imul(h ^ (c + 0x7f4a7c15), 0x2545f491);
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

// Depth of standing water at (x, z), 0 on land.
export function waterDepthAt(seed, x, z) {
    if (surfaceCategoryAt(seed, x, z) !== SURFACE_CATEGORY.WATER) return 0;
    return Math.max(0, LAKE_SURFACE_HEIGHT - terrainHeightAt(seed, x, z));
}

function seaweedForCell(seed, cellX, cellZ) {
    if (hash3(seed + SEAWEED_PRESENCE, cellX, cellZ) < SEAWEED_THRESHOLD) return null;
    const x = (cellX + JITTER_MARGIN + hash3(seed + SEAWEED_JITTER_X, cellX, cellZ) * JITTER_RANGE) * SEAWEED_LATTICE_SPACING;
    const z = (cellZ + JITTER_MARGIN + hash3(seed + SEAWEED_JITTER_Z, cellX, cellZ) * JITTER_RANGE) * SEAWEED_LATTICE_SPACING;
    const depth = waterDepthAt(seed, x, z);
    if (depth < SEAWEED_MIN_DEPTH) return null;
    const tallest = Math.min(SEAWEED_MAX_HEIGHT, depth - SEAWEED_SURFACE_CLEARANCE);
    const height = SEAWEED_MIN_HEIGHT + hash3(seed + SEAWEED_HEIGHT, cellX, cellZ) * Math.max(0, tallest - SEAWEED_MIN_HEIGHT);
    return Object.freeze({
        id: `seaweed:${cellX}:${cellZ}`,
        type: UNDERWATER_LIFE_TYPE.SEAWEED,
        x, z,
        y: LAKE_SURFACE_HEIGHT - depth,
        height,
        variant: Math.floor(hash3(seed + SEAWEED_VARIANT, cellX, cellZ) * SEAWEED_VARIANT_COUNT),
        swayPhase: hash3(seed + SEAWEED_PHASE, cellX, cellZ) * Math.PI * 2
    });
}

function schoolForCell(seed, cellX, cellZ) {
    if (hash3(seed + SCHOOL_PRESENCE, cellX, cellZ) < FISH_SCHOOL_THRESHOLD) return null;
    const x = (cellX + JITTER_MARGIN + hash3(seed + SCHOOL_JITTER_X, cellX, cellZ) * JITTER_RANGE) * FISH_SCHOOL_LATTICE_SPACING;
    const z = (cellZ + JITTER_MARGIN + hash3(seed + SCHOOL_JITTER_Z, cellX, cellZ) * JITTER_RANGE) * FISH_SCHOOL_LATTICE_SPACING;
    // The shallowest point under the school's circle bounds how deep it swims.
    let depth = waterDepthAt(seed, x, z);
    for (let i = 0; i < 8 && depth >= FISH_MIN_DEPTH; i++) {
        const angle = (i / 8) * Math.PI * 2;
        depth = Math.min(depth, waterDepthAt(
            seed,
            x + Math.cos(angle) * FISH_MAX_ORBIT_RADIUS,
            z + Math.sin(angle) * FISH_MAX_ORBIT_RADIUS
        ));
    }
    if (depth < FISH_MIN_DEPTH) return null;
    const lowest = LAKE_SURFACE_HEIGHT - depth + FISH_BED_CLEARANCE;
    const highest = LAKE_SURFACE_HEIGHT - FISH_SURFACE_CLEARANCE;
    const count = FISH_MIN_PER_SCHOOL
        + Math.floor(hash3(seed + SCHOOL_SIZE, cellX, cellZ) * (FISH_MAX_PER_SCHOOL - FISH_MIN_PER_SCHOOL + 1));
    const variant = Math.floor(hash3(seed + SCHOOL_VARIANT, cellX, cellZ) * FISH_VARIANT_COUNT);
    const direction = hash3(seed + SCHOOL_DIRECTION, cellX, cellZ) < 0.5 ? -1 : 1;
    // A school keeps to one band of the water column, as real schools do.
    const bandCenter = lerp(lowest, highest, hash3(seed + FISH_HEIGHT, cellX, cellZ));
    const fish = [];
    for (let i = 0; i < count; i++) {
        fish.push(Object.freeze({
            orbitRadius: 1.2 + hash3(seed + FISH_RADIUS, cellX, cellZ, i) * (FISH_MAX_ORBIT_RADIUS - 1.2),
            angularSpeed: direction * (0.35 + hash3(seed + FISH_SPEED, cellX, cellZ, i) * 0.35),
            phase: hash3(seed + FISH_PHASE, cellX, cellZ, i) * Math.PI * 2,
            y: clamp(bandCenter + (hash3(seed + FISH_HEIGHT, cellX, cellZ, i + 1) - 0.5) * 1.2, lowest, highest),
            scale: 0.8 + hash3(seed + FISH_SCALE, cellX, cellZ, i) * 0.5
        }));
    }
    return Object.freeze({
        id: `fish-school:${cellX}:${cellZ}`,
        type: UNDERWATER_LIFE_TYPE.FISH_SCHOOL,
        x, z,
        variant,
        fish: Object.freeze(fish)
    });
}

function cellsCovering(min, max, spacing) {
    return [Math.floor(min / spacing), Math.ceil(max / spacing)];
}

// Seaweed whose root lies in [minX, maxX) x [minZ, maxZ).
export function seaweedInRegion(seed, minX, minZ, maxX, maxZ) {
    const [cxMin, cxMax] = cellsCovering(minX, maxX, SEAWEED_LATTICE_SPACING);
    const [czMin, czMax] = cellsCovering(minZ, maxZ, SEAWEED_LATTICE_SPACING);
    const found = [];
    for (let cx = cxMin; cx < cxMax; cx++) {
        for (let cz = czMin; cz < czMax; cz++) {
            const weed = seaweedForCell(seed, cx, cz);
            if (weed && weed.x >= minX && weed.x < maxX && weed.z >= minZ && weed.z < maxZ) found.push(weed);
        }
    }
    return found;
}

// Fish schools whose centre lies in [minX, maxX) x [minZ, maxZ).
export function fishSchoolsInRegion(seed, minX, minZ, maxX, maxZ) {
    const [cxMin, cxMax] = cellsCovering(minX, maxX, FISH_SCHOOL_LATTICE_SPACING);
    const [czMin, czMax] = cellsCovering(minZ, maxZ, FISH_SCHOOL_LATTICE_SPACING);
    const found = [];
    for (let cx = cxMin; cx < cxMax; cx++) {
        for (let cz = czMin; cz < czMax; cz++) {
            const school = schoolForCell(seed, cx, cz);
            if (school && school.x >= minX && school.x < maxX && school.z >= minZ && school.z < maxZ) found.push(school);
        }
    }
    return found;
}

// Where one fish of `school` is at `timeSeconds`: circling the school's centre,
// facing the way it swims (heading in radians, forward = (sin, cos) as for
// avatars), bobbing gently.
export function fishPoseAt(school, fish, timeSeconds) {
    const t = Number.isFinite(timeSeconds) ? timeSeconds : 0;
    const angle = fish.phase + fish.angularSpeed * t;
    const vx = -Math.sin(angle) * fish.angularSpeed;
    const vz = Math.cos(angle) * fish.angularSpeed;
    return {
        x: school.x + Math.cos(angle) * fish.orbitRadius,
        y: fish.y + Math.sin(t * 1.3 + fish.phase) * 0.12,
        z: school.z + Math.sin(angle) * fish.orbitRadius,
        heading: Math.atan2(vx, vz)
    };
}

// How far seaweed leans, in radians, swaying in the current.
export function seaweedSwayAt(weed, timeSeconds) {
    const t = Number.isFinite(timeSeconds) ? timeSeconds : 0;
    return Math.sin(t * 0.8 + weed.swayPhase) * 0.18;
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
