import { residentPoseAt, RESIDENT_MOTION } from '../../core/ResidentMotion.js';
import { isResidentWalkClear, RESIDENT_COLLISION_RADIUS } from '../../core/ResidentPath.js';
import { treeCollisionGeometryInRegion } from '../../core/TreeCollisionGeometry.js';
import { DEFAULT_WORLD_SEED } from '../../core/TerrainHeightField.js';
import { createSecureId } from '../../core/createId.js';

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

// Obstacles are gathered this far beyond the wander radius.
const OBSTACLE_MARGIN = 1;

// Where every World Resident in the loaded Worlds is right now — the one
// place the session asks, so the renderer draws a resident, and the
// avatar collides with it, in the same spot.
//
// Residents are World content (core/WorldResident.js), so nothing here is
// stored or synced: each resident is found in `loadedDocuments`, its home
// lifted into shared space by its document's position, and its pose
// computed by core/ResidentMotion.js from the clock. What this class adds
// is the World's geometry, as the `isClear` that motion needs: the brick
// boxes an avatar on the ground would bump into (`obstaclesNear`, usually
// AvatarMovementConstraint#obstaclesNear) and the trees, gathered once per
// resident around its home and refreshed every OBSTACLE_REFRESH_MS, with
// every answer memoized until then. Both only depend on World content, so
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
        this._paths = new Map(); // resident id -> { homeX, homeZ, gatheredAt, isClear }
        this._lastRefreshAt = -Infinity;
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
    // pose, plus the resident's id and World.
    poseOf(entry, timeSeconds) {
        const pose = residentPoseAt({ id: entry.id, home: entry.home }, timeSeconds, { isClear: this._isClearFor(entry) });
        return { id: entry.id, worldId: entry.worldId, documentId: entry.documentId, ...pose };
    }

    // The poses of residents within `radius` of `center` right now, nearest
    // first, at most `limit`. A resident is never farther than the wander
    // radius from home, so only those whose home is within reach are posed.
    posesNear(center, radius, timeSeconds, { limit = Infinity } = {}) {
        const reach = radius + RESIDENT_MOTION.wanderRadius;
        const poses = [];
        for (const entry of this.residents()) {
            if (flatDistance(entry.home, center) > reach) continue;
            const pose = this.poseOf(entry, timeSeconds);
            const distance = flatDistance(pose, center);
            if (distance > radius) continue;
            poses.push({ pose, distance });
        }
        poses.sort((a, b) => (a.distance - b.distance) || (a.pose.id < b.pose.id ? -1 : a.pose.id > b.pose.id ? 1 : 0));
        return poses.slice(0, limit).map(({ pose }) => pose);
    }

    // The nearest resident within `radius` of `center` right now, or null.
    nearest(center, radius, timeSeconds) {
        return this.posesNear(center, radius, timeSeconds, { limit: 1 })[0] || null;
    }

    // An id for a new resident homed at `home` (shared space) that, at
    // `timeSeconds`, is standing within `radius` of home: where a resident
    // walks is fixed by its id (core/ResidentMotion.js), so choosing the id
    // is how a resident added at your feet appears at your feet, instead of
    // wherever its day would otherwise have taken it. Tries up to `tries`
    // fresh ids and keeps the nearest standing one; one within `radius` is
    // found after a few dozen tries on open ground.
    newResidentIdNear(home, timeSeconds, { radius = 1.5, tries = 256, mintId = createSecureId } = {}) {
        const isClear = this._buildIsClear(home);
        let best = null;
        let bestDistance = Infinity;
        for (let i = 0; i < tries; i++) {
            const id = mintId();
            const pose = residentPoseAt({ id, home }, timeSeconds, { isClear });
            const distance = flatDistance(pose, home) + (pose.moving ? radius : 0);
            if (distance < bestDistance) {
                best = id;
                bestDistance = distance;
                if (distance <= radius) break;
            }
        }
        return best;
    }

    // Forget cached obstacles, e.g. after this session's own edit.
    invalidate() {
        this._paths.clear();
    }

    _isClearFor(entry) {
        const now = this._now();
        let path = this._paths.get(entry.id);
        const stale = path && now - path.gatheredAt >= OBSTACLE_REFRESH_MS
            // Gathering scans every brick of the Worlds nearby, so stale
            // residents take turns rather than all refreshing in one frame.
            && now - this._lastRefreshAt >= REFRESH_SPACING_MS;
        if (!path || path.homeX !== entry.home.x || path.homeZ !== entry.home.z || stale) {
            if (stale) this._lastRefreshAt = now;
            // Removed residents never ask again; keep the cache from growing.
            if (this._paths.size >= MAX_CACHED_PATHS) this._paths.clear();
            path = { homeX: entry.home.x, homeZ: entry.home.z, gatheredAt: now, isClear: this._buildIsClear(entry.home) };
            this._paths.set(entry.id, path);
        }
        return path.isClear;
    }

    _buildIsClear(home) {
        const reach = RESIDENT_MOTION.wanderRadius + OBSTACLE_MARGIN;
        const boxes = this._obstaclesNear({ x: home.x, y: 0, z: home.z }) || [];
        const circles = treeCollisionGeometryInRegion(this._seed, home.x - reach, home.z - reach, home.x + reach, home.z + reach);
        const seed = this._seed;
        const memo = new Map();
        return (from, to) => {
            const key = `${from.x},${from.z},${to.x},${to.z}`;
            let clear = memo.get(key);
            if (clear === undefined) {
                clear = isResidentWalkClear(seed, from, to, { boxes, circles, radius: RESIDENT_COLLISION_RADIUS });
                memo.set(key, clear);
            }
            return clear;
        };
    }
}

// The query radius an obstacle source should gather within, around a home:
// everything a resident's walks can reach.
export const RESIDENT_OBSTACLE_QUERY_RADIUS = RESIDENT_MOTION.wanderRadius + OBSTACLE_MARGIN;

function flatDistance(a, b) {
    return Math.hypot(a.x - b.x, a.z - b.z);
}
