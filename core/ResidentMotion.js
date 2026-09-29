// Where a World Resident (core/WorldResident.js) is at a given moment —
// the humanoid counterpart of core/WildlifeMotion.js, built the same way:
//
//   core/WorldResident.js  = "Where is this resident's home?"   (World content)
//   core/ResidentMotion.js = "Where is it right now?"           f(id, home, time, isClear)
//
// residentPoseAt() is a PURE function of exactly its arguments. Time is an
// argument, never read here, so two replicas whose clocks agree see the
// same resident in the same place without exchanging a single message,
// exactly as with wild animals (see docs/principles/vehicles.md, "A Wild
// Animal Wanders On A Path Sampled From Time, Never Simulated").
//
// HOW A RESIDENT MOVES. Time is cut into RESIDENT_MOTION.segmentSeconds
// segments, offset per resident so neighbors never move in step. Segment k
// starts with the resident standing at waypoint k, idling, turning toward
// where it is going next, and walking there so that it arrives exactly as
// segment k+1 begins. Every waypoint is hashed from (id, k), so any moment
// can be computed directly, without replaying earlier ones.
//
// A RESIDENT NEVER WALKS THROUGH ANYTHING. Unlike an animal, a resident
// lives among buildings, so where it may walk is not only a question of
// terrain. The caller supplies `isClear(from, to)`: can a resident walk
// straight from one point to the other (core/ResidentPath.js#isResidentWalkClear
// answers it from the World's own geometry). Then:
//
//   - a waypoint is kept only when the walk from HOME to it is clear;
//     otherwise it is home itself. Every waypoint can therefore always
//     reach home, and home reach it (a straight walk is clear both ways).
//   - the walk from waypoint k to waypoint k+1 goes straight when that is
//     clear, and otherwise by way of home: two walks already known to be
//     clear, with a turn in place at home between them.
//
// Each decision depends only on (id, k) and on isClear, never on an earlier
// segment's outcome, which is what keeps "any moment directly" true. It
// also bounds everything: a resident never strays farther than
// RESIDENT_MOTION.wanderRadius from home.
//
// Unlike an animal it never reacts to anyone: an avatar in its way does not
// make it stop or step aside, because that would make replicas disagree
// about where it is. How it turns to greet the viewer is purely visual and
// lives in renderer/ResidentReaction.js.

import { lerp, smoothstep } from '../utils/interpolation.js';

export const RESIDENT_MOTION = Object.freeze({
    // How far from home a resident strolls.
    wanderRadius: 6,
    // Average walking speed in world units (meters) per second: an easy
    // stroll, well under an avatar's own brisk walk.
    walkSpeed: 1.1,
    // One idle-then-walk cycle. Long enough for the longest walk (out to
    // the far edge by way of home, twice the radius), both turns, and a
    // pause worth having.
    segmentSeconds: 16,
    // How long a turn in place takes.
    turnSeconds: 0.9
});

// A pause shorter than this is spent just standing, not idling.
const MIN_IDLE_SECONDS = 1.5;

// Waypoints closer than this are the same point.
const SAME_POINT_DISTANCE = 1e-6;

const TWO_PI = Math.PI * 2;

// Arbitrary but fixed forever, and apart from every seed offset in
// core/WildlifeMotion.js, so a resident never moves in step with an animal.
const PHASE_SEED = 0x52504853;    // 'RPHS'
const ANGLE_SEED = 0x52414e47;    // 'RANG'
const DISTANCE_SEED = 0x52445354; // 'RDST'
const REST_SEED = 0x52525354;     // 'RRST'

// FNV-1a over a string's UTF-16 code units: a resident is keyed by its id.
function hashString(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    }
    return h | 0;
}

// A 32-bit avalanche over (seed, key, k), in [0, 1) — module-private, per
// this codebase's one-primitive-per-field habit.
function hash3(seed, key, k) {
    let h = seed | 0;
    h = Math.imul(h ^ (key | 0), 0x27d4eb2d);
    h = Math.imul(h ^ ((k | 0) + 0x9e3779b9), 0x165667b1);
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

function normalizeAngle(angle) {
    const wrapped = angle % TWO_PI;
    return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}

// Turns from `from` toward `to` the short way round, `t` in [0, 1].
export function lerpAngle(from, to, t) {
    let delta = (to - from) % TWO_PI;
    if (delta > Math.PI) delta -= TWO_PI;
    if (delta < -Math.PI) delta += TWO_PI;
    return from + delta * t;
}

function samePoint(a, b) {
    return Math.hypot(b.x - a.x, b.z - a.z) <= SAME_POINT_DISTANCE;
}

// Facing from `from` toward `to`: 0 faces +Z, π/2 faces +X, the avatar's
// own convention (core/AvatarFacing.js).
function headingBetween(from, to) {
    return Math.atan2(to.x - from.x, to.z - from.z);
}

// Everything residentPoseAt() needs about one resident, bound once.
function residentPlan(resident, isClear) {
    const key = hashString(String(resident.id));
    const home = { x: resident.home.x, z: resident.home.z };
    const radius = RESIDENT_MOTION.wanderRadius;

    // Waypoint k: somewhere within the wander radius, or home if the walk
    // there from home is not clear.
    const waypoint = (k) => {
        const angle = hash3(ANGLE_SEED, key, k) * TWO_PI;
        // sqrt spreads waypoints evenly over the disc.
        const distance = Math.sqrt(hash3(DISTANCE_SEED, key, k)) * radius;
        const candidate = { x: home.x + Math.sin(angle) * distance, z: home.z + Math.cos(angle) * distance };
        if (samePoint(home, candidate) || isClear(home, candidate)) return candidate;
        return home;
    };

    // The walks (legs) from waypoint k to waypoint k+1: none when they are
    // the same point, one when the straight walk is clear, else two by way
    // of home (a zero-length leg is dropped).
    const legsFor = (k) => {
        const from = waypoint(k);
        const to = waypoint(k + 1);
        if (samePoint(from, to)) return { from, to, legs: [] };
        if (isClear(from, to)) return { from, to, legs: [[from, to]] };
        const legs = [[from, home], [home, to]].filter(([a, b]) => !samePoint(a, b));
        return { from, to, legs };
    };

    // The facing a resident has on reaching waypoint k: that of the last
    // leg that brought it there, or, if it did not move, a resting facing
    // of its own for this segment.
    const arrivalHeading = (k) => {
        const { legs } = legsFor(k - 1);
        if (legs.length > 0) {
            const [a, b] = legs[legs.length - 1];
            return headingBetween(a, b);
        }
        return hash3(REST_SEED, key, k) * TWO_PI;
    };

    return { key, waypoint, legsFor, arrivalHeading };
}

// Where `resident` ({ id, home: { x, z } }, home in the same space as
// isClear's points) is at `timeSeconds`. `isClear(from, to)` says whether a
// straight walk is clear (default: everything is).
//
// Returns { x, z, rotationY, moving, idleSeconds, idleDuration }: rotationY
// in radians in [0, 2π); moving whether it is walking; idleSeconds and
// idleDuration how far into its current pause it is and how long the pause
// lasts (both 0 while walking or turning), the same idle window
// core/WildlifeMotion.js#animalPoseAt() reports.
export function residentPoseAt(resident, timeSeconds, { isClear = () => true } = {}) {
    if (typeof timeSeconds !== 'number' || !Number.isFinite(timeSeconds)) {
        throw new Error(`residentPoseAt requires a finite timeSeconds, got ${JSON.stringify(timeSeconds)}`);
    }
    const { segmentSeconds, walkSpeed, turnSeconds } = RESIDENT_MOTION;
    const plan = residentPlan(resident, isClear);

    const segments = timeSeconds / segmentSeconds + hash3(PHASE_SEED, plan.key, 0);
    const k = Math.floor(segments);
    const seconds = (segments - k) * segmentSeconds;

    const { from, legs } = plan.legsFor(k);
    const legSeconds = legs.map(([a, b]) => Math.hypot(b.x - a.x, b.z - a.z) / walkSpeed);
    // Legs walk back to back, with a turn in place between two of them.
    const walkSeconds = legSeconds.reduce((sum, s) => sum + s, 0) + Math.max(0, legs.length - 1) * turnSeconds;
    const walkStart = segmentSeconds - walkSeconds;

    if (legs.length > 0 && seconds >= walkStart) {
        let t = seconds - walkStart;
        for (let i = 0; i < legs.length; i++) {
            const [a, b] = legs[i];
            if (t < legSeconds[i] || i === legs.length - 1) {
                const progress = smoothstep(Math.min(1, t / legSeconds[i]));
                return pose(lerp(a.x, b.x, progress), lerp(a.z, b.z, progress), headingBetween(a, b), true);
            }
            t -= legSeconds[i];
            // Standing at the corner (home), turning toward the next leg.
            if (t < turnSeconds) {
                const [c, d] = legs[i + 1];
                const turn = smoothstep(t / turnSeconds);
                return pose(b.x, b.z, lerpAngle(headingBetween(a, b), headingBetween(c, d), turn), false);
            }
            t -= turnSeconds;
        }
    }

    // Standing at waypoint k: idle, then turn toward what comes next.
    const arrival = plan.arrivalHeading(k);
    const turnStart = walkStart - turnSeconds;
    if (seconds >= turnStart) {
        const next = legs.length > 0 ? headingBetween(legs[0][0], legs[0][1]) : plan.arrivalHeading(k + 1);
        const turn = smoothstep(Math.min(1, (seconds - turnStart) / turnSeconds));
        return pose(from.x, from.z, lerpAngle(arrival, next, turn), false);
    }
    const idle = turnStart >= MIN_IDLE_SECONDS ? { idleSeconds: seconds, idleDuration: turnStart } : null;
    return pose(from.x, from.z, arrival, false, idle);
}

function pose(x, z, rotationY, moving, idle = null) {
    return {
        x,
        z,
        rotationY: normalizeAngle(rotationY),
        moving,
        idleSeconds: idle ? idle.idleSeconds : 0,
        idleDuration: idle ? idle.idleDuration : 0
    };
}
