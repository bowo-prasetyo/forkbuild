// Where a World Resident (core/world/WorldResident.js) is at a given moment —
// the humanoid counterpart of core/nature/WildlifeMotion.js, built the same way:
//
//   core/world/WorldResident.js  = "Where is this resident's home?"   (World content)
//   core/world/ResidentMotion.js = "Where is it right now?"           f(id, home, time, navigation)
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
// WHERE IT GOES, AND HOW IT GETS THERE. A resident has a few favourite
// spots of its own around home (RESIDENT_MOTION.spots of them, hashed from
// its id, within RESIDENT_MOTION.wanderRadius), and a waypoint is one of
// them, or home. It never walks through anything: the caller supplies the
// World's geometry as a navigation (core/world/ResidentNavigation.js), and a
// walk follows its quickest way, pulled tight, with a turn in place at each
// corner. So a resident steps out through its front door, round the corner
// of the house and down the lane to a spot it cannot see from home. Only a
// spot whose way from home takes at most half of what one segment allows is
// ever chosen, so the way between any two, at worst by way of home, fits in
// a segment. Each decision depends only on (id, k) and on the navigation,
// never on an earlier segment's outcome, which is what keeps "any moment
// directly" true.
//
// AT NIGHT IT GOES HOME. From nightfall to dawn (core/nature/Nightfall.js, on
// the World's own clock) every waypoint is home: a resident is seen walking
// home in the dusk and comes out again in the morning.
//
// Unlike an animal it never reacts to anyone: an avatar in its way does not
// make it stop or step aside, because that would make replicas disagree
// about where it is. How it turns to greet the viewer is purely visual and
// lives in renderer/ResidentReaction.js.

import { lerp, smoothstep } from '../../utils/interpolation.js';
import { isNightfallAt } from '../nature/Nightfall.js';
import { buildResidentNavigation } from './ResidentNavigation.js';

export const RESIDENT_MOTION = Object.freeze({
    // How far from home a resident's spots lie.
    wanderRadius: 6,
    // Average walking speed in world units (meters) per second: an easy
    // stroll, well under an avatar's own brisk walk.
    walkSpeed: 1.1,
    // One idle-then-walk cycle: long enough for a walk round a corner or
    // two and a pause worth having.
    segmentSeconds: 20,
    // How long a turn in place takes.
    turnSeconds: 0.9,
    // How many favourite spots a resident has around home.
    spots: 10,
    // How often a waypoint is home itself rather than a spot, by day.
    homeShare: 0.2
});

// A pause shorter than this is spent just standing, not idling.
const MIN_IDLE_SECONDS = 1.5;

// The longest walk a segment allows: all of it but the turn before setting
// off and a pause. A spot is chosen only when its way home takes at most
// REACH_SECONDS, so the way between any two, at worst by way of home (one
// more turn), fits in WALK_BUDGET_SECONDS.
const WALK_BUDGET_SECONDS = RESIDENT_MOTION.segmentSeconds - RESIDENT_MOTION.turnSeconds - MIN_IDLE_SECONDS;
export const RESIDENT_REACH_SECONDS = (WALK_BUDGET_SECONDS - RESIDENT_MOTION.turnSeconds) / 2;

// Waypoints closer than this are the same point.
const SAME_POINT_DISTANCE = 1e-6;

const TWO_PI = Math.PI * 2;

// Arbitrary but fixed forever, and apart from every seed offset in
// core/nature/WildlifeMotion.js, so a resident never moves in step with an animal.
const PHASE_SEED = 0x52504853;    // 'RPHS'
const ANGLE_SEED = 0x52414e47;    // 'RANG'
const DISTANCE_SEED = 0x52445354; // 'RDST'
const REST_SEED = 0x52525354;     // 'RRST'
const HOME_SEED = 0x52484f4d;     // 'RHOM'
const SPOT_SEED = 0x5253504f;     // 'RSPO'

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
// own convention (core/avatar/AvatarFacing.js).
function headingBetween(from, to) {
    return Math.atan2(to.x - from.x, to.z - from.z);
}

// Where segment `k` of the resident keyed `key` starts, in seconds.
function segmentStart(key, k) {
    return (k - hash3(PHASE_SEED, key, 0)) * RESIDENT_MOTION.segmentSeconds;
}

// Whether waypoint `k` is home whatever the World looks like: at night, and
// by day as often as homeShare says.
function waypointIsHome(key, k) {
    return isNightfallAt(segmentStart(key, k)) || hash3(HOME_SEED, key, k) < RESIDENT_MOTION.homeShare;
}

// Whether the resident `id` spends the segment under way at `timeSeconds`
// standing at home, idling and turning only: true whatever its World looks
// like, so it can be asked without one (application/world/ResidentRuntime.js
// uses it to choose the id of a resident added at the viewer's feet).
export function residentStaysHomeAt(id, timeSeconds) {
    const key = hashString(String(id));
    const k = Math.floor(timeSeconds / RESIDENT_MOTION.segmentSeconds + hash3(PHASE_SEED, key, 0));
    return waypointIsHome(key, k) && waypointIsHome(key, k + 1);
}

// How long walking `legs` takes: their length at walking speed, and a turn
// at each corner between two of them.
function walkSecondsOf(legs) {
    const { walkSpeed, turnSeconds } = RESIDENT_MOTION;
    let seconds = Math.max(0, legs.length - 1) * turnSeconds;
    for (const [a, b] of legs) seconds += Math.hypot(b.x - a.x, b.z - a.z) / walkSpeed;
    return seconds;
}

function legsThrough(points) {
    const legs = [];
    for (let i = 1; i < points.length; i++) {
        if (!samePoint(points[i - 1], points[i])) legs.push([points[i - 1], points[i]]);
    }
    return legs;
}

function reversedLegs(legs) {
    return legs.slice().reverse().map(([a, b]) => [b, a]);
}

// Everything residentPoseAt() needs about one resident in one navigation:
// home and its spots (nodes[0] is home, every node the centre of a cell),
// which spots it goes to, and the way between any two.
function buildPlan(resident, navigation) {
    const { wanderRadius, spots } = RESIDENT_MOTION;
    const key = hashString(String(resident.id));
    const home = navigation.home;
    const cells = [navigation.homeCell];
    for (let j = 0; j < spots; j++) {
        const angle = hash3(ANGLE_SEED, key, j) * TWO_PI;
        // sqrt spreads spots evenly over the disc.
        const distance = Math.sqrt(hash3(DISTANCE_SEED, key, j)) * wanderRadius;
        const cell = navigation.cellOf({ x: home.x + Math.sin(angle) * distance, z: home.z + Math.cos(angle) * distance });
        // A spot a resident cannot even stand on (in a wall, in water) is none.
        if (navigation.isOpen(cell) && !cells.includes(cell)) cells.push(cell);
    }
    const nodes = cells.map((cell) => (cell === navigation.homeCell ? { x: home.x, z: home.z } : navigation.pointOf(cell)));

    // The way out from home to each node, pulled tight; null where there is
    // none.
    const fromHome = cells.map((cell) => {
        const path = navigation.cellPath(navigation.homeCell, cell);
        return path ? legsThrough(navigation.smoothPath(path)) : null;
    });
    const reachable = [];
    for (let i = 1; i < nodes.length; i++) {
        if (fromHome[i] && walkSecondsOf(fromHome[i]) <= RESIDENT_REACH_SECONDS) reachable.push(i);
    }

    // The legs from node a to node b: the quickest way when it fits in a
    // segment, else out by way of home, which always does.
    const routes = new Map();
    const route = (a, b) => {
        if (a === b) return [];
        if (a === 0) return fromHome[b];
        if (b === 0) return reversedLegs(fromHome[a]);
        const id = a * nodes.length + b;
        let legs = routes.get(id);
        if (!legs) {
            const path = navigation.cellPath(cells[a], cells[b]);
            const direct = path ? legsThrough(navigation.smoothPath(path)) : null;
            legs = direct && walkSecondsOf(direct) <= WALK_BUDGET_SECONDS
                ? direct
                : [...reversedLegs(fromHome[a]), ...fromHome[b]];
            routes.set(id, legs);
        }
        return legs;
    };
    return { key, nodes, reachable, route };
}

// Plans kept per navigation, then per resident: a new navigation (the World
// changed) means new plans, and the old ones go with it.
const plans = new WeakMap();

function planFor(resident, navigation) {
    let byResident = plans.get(navigation);
    if (!byResident) {
        byResident = new Map();
        plans.set(navigation, byResident);
    }
    const id = String(resident.id);
    let plan = byResident.get(id);
    if (!plan) {
        plan = buildPlan(resident, navigation);
        byResident.set(id, plan);
    }
    return plan;
}

// Without a World: open, level ground round home, kept per home.
const openNavigations = new Map();
const MAX_OPEN_NAVIGATIONS = 64;

function openNavigationFor(home) {
    const id = `${home.x},${home.z}`;
    let navigation = openNavigations.get(id);
    if (!navigation) {
        if (openNavigations.size >= MAX_OPEN_NAVIGATIONS) openNavigations.clear();
        navigation = buildResidentNavigation({ home, reach: RESIDENT_MOTION.wanderRadius });
        openNavigations.set(id, navigation);
    }
    return navigation;
}

// Everything residentPoseAt() needs about one resident, bound once.
function residentPlan(resident, navigation) {
    const { key, nodes, reachable, route } = planFor(resident, navigation);

    // Waypoint k, as a node: home at night, and by day home or one of the
    // spots it can reach.
    const waypointNode = (k) => {
        if (reachable.length === 0 || waypointIsHome(key, k)) return 0;
        return reachable[Math.floor(hash3(SPOT_SEED, key, k) * reachable.length)];
    };

    // The walk from waypoint k to waypoint k+1: its legs, none when they are
    // the same point.
    const legsFor = (k) => {
        const from = waypointNode(k);
        const to = waypointNode(k + 1);
        return { from: nodes[from], to: nodes[to], legs: route(from, to) };
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

    return { key, legsFor, arrivalHeading };
}

// Where `resident` ({ id, home: { x, z } }) is at `timeSeconds`, finding its
// way by `navigation` (core/world/ResidentNavigation.js#buildResidentNavigation(),
// built round the same home out to RESIDENT_MOTION.wanderRadius; default:
// open, level ground).
//
// Returns { x, z, rotationY, moving, idleSeconds, idleDuration }: rotationY
// in radians in [0, 2π); moving whether it is walking; idleSeconds and
// idleDuration how far into its current pause it is and how long the pause
// lasts (both 0 while walking or turning), the same idle window
// core/nature/WildlifeMotion.js#animalPoseAt() reports.
export function residentPoseAt(resident, timeSeconds, { navigation = null } = {}) {
    if (typeof timeSeconds !== 'number' || !Number.isFinite(timeSeconds)) {
        throw new Error(`residentPoseAt requires a finite timeSeconds, got ${JSON.stringify(timeSeconds)}`);
    }
    const { segmentSeconds, walkSpeed, turnSeconds } = RESIDENT_MOTION;
    const plan = residentPlan(resident, navigation || openNavigationFor(resident.home));

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
