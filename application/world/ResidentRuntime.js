import { residentPoseAt, residentStaysHomeAt, RESIDENT_MOTION } from '../../core/world/ResidentMotion.js';
import { buildResidentNavigation } from '../../core/world/ResidentNavigation.js';
import { treeCollisionGeometryInRegion } from '../../core/nature/TreeCollisionGeometry.js';
import { DEFAULT_WORLD_SEED } from '../../core/nature/TerrainHeightField.js';
import { createSecureId } from '../../core/document/createId.js';

// How far from the viewer residents are drawn, as ANIMAL_RENDER_RADIUS is
// for animals: well beyond the range of any interaction.
export const RESIDENT_RENDER_RADIUS = 60;

// At most this many residents are drawn at once, the nearest first. A
// resident is a full avatar body (renderer/AvatarVisual.js), one mesh
// graph each, not an instanced tile like wildlife, so a World packed with
// residents never costs more than this many.
export const MAX_RENDERED_RESIDENTS = 16;

// How close an avatar must be to a resident's current position to remove
// it (application/worldNavigation/residentMethods.js).
export const RESIDENT_INTERACTION_RADIUS = 2;

// How often a resident's obstacles are gathered again, so an edit nearby
// (a wall built across its path) is taken into account.
const OBSTACLE_REFRESH_MS = 2000;

// At most one stale resident's obstacles are gathered again per this many
// milliseconds: next to a very large build one gathering takes a few
// milliseconds, so a crowd refreshing together would stall a frame.
const REFRESH_SPACING_MS = 50;

// A cap on cached residents, far above MAX_RENDERED_RESIDENTS.
const MAX_CACHED_PATHS = 512;

// How many ids newResidentIdNear() poses in the World when none of those
// it tried stays home: each pose plans the resident's ways, which asks
// about every pair of its spots.
const FALLBACK_TRIES = 8;

// Obstacles are gathered this far beyond the wander radius.
const OBSTACLE_MARGIN = 1;

// Where every World Resident in the loaded Worlds is right now — the one
// place the session asks, so the renderer draws a resident, and the
// avatar collides with it, in the same spot.
//
// Residents are World content (core/world/WorldResident.js), so nothing here is
// stored or synced: each resident is found in `loadedDocuments`, its home
// lifted into shared space by its document's position, and its pose
// computed by core/world/ResidentMotion.js from the clock. What this class adds
// is the World's geometry, as the navigation that motion needs
// (core/world/ResidentNavigation.js): the brick boxes an avatar on the ground
// would bump into (`obstaclesNear`, usually
// AvatarMovementConstraint#obstaclesNear) and the trees, gathered once per
// resident around its home and gathered again every OBSTACLE_REFRESH_MS; the
// navigation, and every way found in it, is kept until the bricks differ.
// Both only depend on World content, so
// every replica that has loaded the same Worlds walks each resident the
// same way. Right after an edit, replicas can briefly disagree, until
// both have the edit and have refreshed.
export class ResidentRuntime {
    constructor({
        loadedDocuments,
        getWorldPosition,
        obstaclesNear = () => [],
        seed = DEFAULT_WORLD_SEED,
        now = () => Date.now()
    } = {}) {
        this._loadedDocuments = loadedDocuments;
        this._getWorldPosition = getWorldPosition;
        this._obstaclesNear = obstaclesNear;
        this._seed = seed;
        this._now = now;
        this._paths = new Map(); // resident id -> { homeX, homeZ, gatheredAt, boxes, navigation }
        this._lastRefreshAt = -Infinity;
        // The moment last posed, and each resident's pose then.
        this._posedAt = null;
        this._poses = new Map(); // resident id -> { navigation, homeX, homeZ, pose }
    }

    // Every resident in every loaded World: { id, resident, worldId,
    // documentId, home: { x, z } } with `home` in shared world space.
    residents() {
        const entries = [];
        if (!this._loadedDocuments || !this._getWorldPosition) return entries;
        for (const [documentId, document] of this._loadedDocuments) {
            const world = document && document.world;
            if (!world || typeof world.getResidents !== 'function') continue;
            const offset = this._getWorldPosition(documentId);
            if (!offset) continue;
            for (const resident of world.getResidents()) {
                entries.push({
                    id: resident.id,
                    resident,
                    worldId: world.id,
                    documentId,
                    home: { x: resident.position.x + offset.x, z: resident.position.z + offset.z }
                });
            }
        }
        return entries;
    }

    // Where `entry` (from residents()) is at `timeSeconds`: residentPoseAt()'s
    // pose, plus the resident's id, World and home (shared space). The
    // renderer, the avatar's collision and the sounds all ask about the same
    // moment every frame, so each resident is posed once per moment.
    poseOf(entry, timeSeconds) {
        if (this._posedAt !== timeSeconds) {
            this._posedAt = timeSeconds;
            this._poses.clear();
        }
        const navigation = this._navigationFor(entry);
        let posed = this._poses.get(entry.id);
        if (!posed || posed.navigation !== navigation || posed.homeX !== entry.home.x || posed.homeZ !== entry.home.z) {
            posed = {
                navigation,
                homeX: entry.home.x,
                homeZ: entry.home.z,
                pose: residentPoseAt({ id: entry.id, home: entry.home }, timeSeconds, { navigation })
            };
            this._poses.set(entry.id, posed);
        }
        return { id: entry.id, worldId: entry.worldId, documentId: entry.documentId, home: { ...entry.home }, ...posed.pose };
    }

    // The poses of residents within `radius` of `center` right now, nearest
    // first, at most `limit`. A resident is never farther than the wander
    // radius from home, so only those whose home is within reach are posed,
    // nearest home first; with a `limit`, the search stops once no home left
    // could hold anyone nearer than the nearest `limit` found.
    posesNear(center, radius, timeSeconds, { limit = Infinity } = {}) {
        const wander = RESIDENT_MOTION.wanderRadius;
        const reach = radius + wander;
        const candidates = [];
        for (const entry of this.residents()) {
            const homeDistance = flatDistance(entry.home, center);
            if (homeDistance <= reach) candidates.push({ entry, homeDistance });
        }
        candidates.sort((a, b) => a.homeDistance - b.homeDistance);
        const poses = [];
        for (const { entry, homeDistance } of candidates) {
            if (poses.length >= limit) {
                poses.sort(byDistanceThenId);
                poses.length = limit;
                if (homeDistance - wander > poses[limit - 1].distance) break;
            }
            const pose = this.poseOf(entry, timeSeconds);
            const distance = flatDistance(pose, center);
            if (distance > radius) continue;
            poses.push({ pose, distance });
        }
        poses.sort(byDistanceThenId);
        return poses.slice(0, limit).map(({ pose }) => pose);
    }

    // The nearest resident within `radius` of `center` right now, or null.
    nearest(center, radius, timeSeconds) {
        return this.posesNear(center, radius, timeSeconds, { limit: 1 })[0] || null;
    }

    // An id for a new resident homed at `home` (shared space) that, at
    // `timeSeconds`, is standing within `radius` of home: where a resident
    // walks is fixed by its id (core/world/ResidentMotion.js), so choosing the id
    // is how a resident added at your feet appears at your feet, instead of
    // wherever its day would otherwise have taken it. An id that spends the
    // whole segment under way at home (residentStaysHomeAt()) needs no look at
    // the World at all, and one turns up within a few dozen tries by day (at
    // once at night); failing that, up to FALLBACK_TRIES of the ids tried are
    // posed in the World and the nearest standing one kept.
    newResidentIdNear(home, timeSeconds, { radius = 1.5, tries = 256, mintId = createSecureId } = {}) {
        const tried = [];
        for (let i = 0; i < tries; i++) {
            const id = mintId();
            if (residentStaysHomeAt(id, timeSeconds)) return id;
            if (tried.length < FALLBACK_TRIES) tried.push(id);
        }
        const navigation = this._buildNavigation(home);
        let best = null;
        let bestDistance = Infinity;
        for (const id of tried) {
            const pose = residentPoseAt({ id, home }, timeSeconds, { navigation });
            const distance = flatDistance(pose, home) + (pose.moving ? radius : 0);
            if (distance < bestDistance) {
                best = id;
                bestDistance = distance;
                if (distance <= radius) break;
            }
        }
        return best;
    }

    // Expire every resident's gathered obstacles, e.g. after this session's
    // own edit: the next resident asked about gathers again at once, the rest
    // on their turns, REFRESH_SPACING_MS apart as any stale ones are, so a
    // crowd never refreshes in one frame, and a resident whose bricks did not
    // change keeps its navigation.
    invalidate() {
        for (const path of this._paths.values()) path.gatheredAt = -Infinity;
        this._lastRefreshAt = -Infinity;
    }

    _navigationFor(entry) {
        const now = this._now();
        let path = this._paths.get(entry.id);
        const stale = path && now - path.gatheredAt >= OBSTACLE_REFRESH_MS
            // Gathering scans every brick of the Worlds nearby, so stale
            // residents take turns rather than all refreshing in one frame.
            && now - this._lastRefreshAt >= REFRESH_SPACING_MS;
        if (!path || path.homeX !== entry.home.x || path.homeZ !== entry.home.z || stale) {
            if (stale) this._lastRefreshAt = now;
            const boxes = this._boxesNear(entry.home);
            // The same bricks as before: keep the same navigation, so the
            // resident keeps the ways it has already found
            // (core/world/ResidentMotion.js keeps them per navigation).
            if (stale && path.homeX === entry.home.x && path.homeZ === entry.home.z && sameBoxes(path.boxes, boxes)) {
                path.gatheredAt = now;
                return path.navigation;
            }
            // Removed residents never ask again; keep the cache from growing.
            if (this._paths.size >= MAX_CACHED_PATHS) this._paths.clear();
            path = { homeX: entry.home.x, homeZ: entry.home.z, gatheredAt: now, boxes, navigation: this._buildNavigation(entry.home, boxes) };
            this._paths.set(entry.id, path);
        }
        return path.navigation;
    }

    _boxesNear(home) {
        return this._obstaclesNear({ x: home.x, y: 0, z: home.z }) || [];
    }

    // The way round everything near `home`: the bricks an avatar on the
    // ground would bump into, and the trees.
    _buildNavigation(home, boxes = this._boxesNear(home)) {
        const reach = RESIDENT_MOTION.wanderRadius + OBSTACLE_MARGIN;
        const circles = treeCollisionGeometryInRegion(this._seed, home.x - reach, home.z - reach, home.x + reach, home.z + reach);
        return buildResidentNavigation({ home, reach: RESIDENT_MOTION.wanderRadius, seed: this._seed, boxes, circles });
    }
}

// Whether two gatherings of obstacle boxes are the same boxes, in the same
// order (a gathering walks the same Worlds the same way every time). Heights
// count too: a brick raised over a resident's head, or lowered into its way
// (core/world/ResidentPath.js#isInResidentWay), opens or closes a way.
function sameBoxes(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        const p = a[i];
        const q = b[i];
        if (p.min.x !== q.min.x || p.min.y !== q.min.y || p.min.z !== q.min.z
            || p.max.x !== q.max.x || p.max.y !== q.max.y || p.max.z !== q.max.z) return false;
    }
    return true;
}

// The query radius an obstacle source should gather within, around a home:
// everything a resident's walks can reach.
export const RESIDENT_OBSTACLE_QUERY_RADIUS = RESIDENT_MOTION.wanderRadius + OBSTACLE_MARGIN;

function byDistanceThenId(a, b) {
    return (a.distance - b.distance) || (a.pose.id < b.pose.id ? -1 : a.pose.id > b.pose.id ? 1 : 0);
}

function flatDistance(a, b) {
    return Math.hypot(a.x - b.x, a.z - b.z);
}
