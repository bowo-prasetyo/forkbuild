import { brickAabb, translateAabb, resolveHorizontalMovement, AVATAR_COLLISION_RADIUS } from '../core/AvatarCollision.js';

// 0.2.42 — the application-layer half of avatar/world collision: this
// class supplies "the world geometry currently available to this
// replica," core/AvatarCollision.js supplies the pure math applied to
// it. See that file's own header for why the split exists at all.
//
// "Currently available" is load-bearing, not a performance shortcut —
// see docs/Principles.md, "The Local Avatar Is Constrained By
// Collision Geometry Currently Available To This Replica, Never By
// The Entire World." `loadedDocuments` is WorldNavigationSession's
// OWN `_loadedDocuments` Map, passed BY REFERENCE — the exact same
// streaming set `updateSpatialView()` already loads/unloads by
// STREAMING_RADIUS (world-layout/LocalWorldLayoutProvider.js). A
// building outside that radius was never asked for and cannot
// suddenly become a collision obstacle; a building that streams OUT
// (camera moves away) stops obstructing on the very next tick, with
// no separate unload step of its own — this class never caches
// anything, it re-reads the live Map every call.
//
// Collision geometry is entirely DERIVED, never persisted — see
// docs/Principles.md, "Collision Is Derived From Document + Placement,
// Never A Third Relationship." Nothing here writes to a Document, a
// WorldPlacement, or any storage; every AABB is recomputed fresh, on
// demand, from a brick's own position plus its BrickRegistry
// dimensions plus the document's own world-layout offset — the same
// `getWorldPosition(documentId)` WorldNavigationSession already uses
// for spawning, focusing, and forking (see its own `_getWorldPosition`),
// passed in here rather than re-derived, so a lazily-forked document's
// local position override (`_localPositions`) is honored identically
// for collision as for everything else.
//
// Deliberately axis-aligned per-brick, ignoring `Brick.rotation` — the
// same simplification core/AvatarCollision.js's own `brickAabb()`
// documents; "start simple," per the design doc.
const DEFAULT_QUERY_RADIUS = 12; // world units — see below

export class AvatarMovementConstraint {
    // `queryRadius` bounds how far this class bothers looking for
    // obstacles at all, on BOTH the per-document and per-brick
    // broad-phase check below — deliberately much smaller than
    // STREAMING_RADIUS (150): "loaded" and "worth iterating every
    // single movement tick" are different concerns. A single tick can
    // move the avatar at most MAX_STEP_PER_TICK (2 world units —
    // core/AvatarMovementSimulation.js); 12 leaves ample margin
    // without forcing every frame to walk every brick of every
    // streamed-in building, however far away.
    constructor({ loadedDocuments, getWorldPosition, brickRegistry, queryRadius = DEFAULT_QUERY_RADIUS } = {}) {
        this._loadedDocuments = loadedDocuments;
        this._getWorldPosition = getWorldPosition;
        this._brickRegistry = brickRegistry;
        this._queryRadius = queryRadius;
    }

    // `position` — the avatar's position BEFORE this tick's movement.
    // `desiredPosition` — where core/AvatarMovementSimulation.js's
    // pure kinematics would place it if nothing existed to collide
    // with. Y is trusted exactly as given back unchanged: vertical
    // ground/gravity stays entirely the simulation's own concern (see
    // core/AvatarCollision.js's own header) — only X/Z are ever
    // constrained here.
    apply(position, desiredPosition) {
        const obstacles = this._collectObstacles(position);
        if (obstacles.length === 0) {
            return { position: desiredPosition, collided: false };
        }
        const resolved = resolveHorizontalMovement({
            position,
            dx: desiredPosition.x - position.x,
            dz: desiredPosition.z - position.z,
            obstacles
        });
        return {
            position: { x: resolved.x, y: desiredPosition.y, z: resolved.z },
            collided: resolved.collided
        };
    }

    _collectObstacles(position) {
        const obstacles = [];
        if (!this._loadedDocuments || !this._getWorldPosition) {
            return obstacles;
        }
        for (const [documentId, document] of this._loadedDocuments) {
            const worldPosition = this._getWorldPosition(documentId);
            if (!worldPosition) continue;
            // Per-document broad phase: a document whose own
            // placement is nowhere near the avatar contributes no
            // obstacles at all, without ever looking at its bricks.
            if (flatDistance(worldPosition, position) > this._queryRadius + MAX_DOCUMENT_SPAN_MARGIN) continue;
            for (const building of document.world.getBuildings()) {
                for (const brick of building.getBricks()) {
                    const definition = this._brickRegistry ? this._brickRegistry.get(brick.definitionId) : null;
                    // An unrecognized definitionId degrades to "not an
                    // obstacle" rather than throwing — the same
                    // "degrade gracefully on read" posture this
                    // codebase applies to every other unrecognized-id
                    // case (docs/Principles.md), never a crash that
                    // would take down movement entirely over one bad
                    // or future-versioned brick.
                    if (!definition) continue;
                    const worldAabb = translateAabb(brickAabb(brick.position, definition), worldPosition);
                    if (flatAabbDistance(worldAabb, position) > this._queryRadius) continue;
                    obstacles.push(worldAabb);
                }
            }
        }
        return obstacles;
    }
}

// A generous per-document margin added to the query radius before
// even bothering to look at a document's bricks — accounts for a
// document whose OWN placement origin is far from the avatar but
// whose bricks (built out from that origin) might still reach into
// range. Deliberately generous rather than exact: this is a broad
// phase, not the actual collision test — see core/AvatarCollision.js
// for the real, precise geometry.
const MAX_DOCUMENT_SPAN_MARGIN = 64;

function flatDistance(a, b) {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
}

function flatAabbDistance(aabb, point) {
    const dx = Math.max(aabb.min.x - point.x, 0, point.x - aabb.max.x);
    const dz = Math.max(aabb.min.z - point.z, 0, point.z - aabb.max.z);
    return Math.sqrt(dx * dx + dz * dz) - AVATAR_COLLISION_RADIUS;
}
