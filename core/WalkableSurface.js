import { brickAabb } from './AvatarCollision.js';
import { walkableTopAt } from './BrickWalkability.js';

// 0.3.3 — Walkable Structures. The generalization
// `core/BrickWalkability.js`'s own header named as its future seam:
// "walkableTopAt() is written as the seam a future non-box primitive
// would specialize, never as a claim that one exists yet." That future
// milestone is this one. See docs/Principles.md, "Walkability Is Not
// Collision (0.3.3)."
//
// The central distinction this file exists to protect:
//
//   Collision asks   "what occupies this space?"     (core/AvatarCollision.js)
//   Walkability asks "where may an avatar stand?"     (this file)
//
// core/SpatialBounds.js and core/AvatarCollision.js stay exactly what
// they were — conservative AABBs answering "do these two things
// overlap?" Nothing here reuses them for anything except the plain
// flat-topped-box case they've always handled (see FLAT below, which
// delegates straight back to core/BrickWalkability.js#walkableTopAt(),
// unchanged). A slope's or a stair's own walkable height is never an
// AABB question — an AABB has no opinion about what happens BETWEEN
// its min and max corners — so it is answered here instead, by a small,
// per-shape profile function over a brick's own LOCAL footprint.
//
// `WalkableSurface` is deliberately the minimal shape the design doc
// asked for — `{ height, normal, kind }` — nothing else. `normal` is
// carried for a future milestone to read (see docs/Roadmap.md's own
// "deliberately staged, not attempted here" list — slope-dependent
// movement speed is explicitly NOT this milestone); nothing in this
// codebase's movement pipeline consults it yet.
//
// Deliberately NOT physically simulated, exactly like every other
// walkability file this codebase already has — see
// core/BrickWalkability.js and core/TerrainWalkability.js's own
// headers. There is no momentum, no sliding down a slope, no
// slope-scaled walk speed. `resolveWalkableSurfaceAt()` answers one
// question only: "if an avatar's feet were at this (x, z), what height
// would they rest at, and on what kind of surface?" What a caller DOES
// with that answer (snap onto it, reject too large a change — see
// application/AvatarStepConstraint.js) stays entirely its own concern.

export const WalkableSurfaceKind = Object.freeze({
    FLAT: 'flat',
    SLOPE: 'slope',
    STEP: 'step'
});

// Mirrors renderer/ThreeBrickFactory.js's own stairMeshFactory() step
// count — hoisted here as the ONE shared authority both the rendered
// mesh and this walkable profile read, imported back by
// ThreeBrickFactory.js as its own default, so the treads a player SEES
// and the treads a player's avatar actually CLIMBS can never quietly
// drift apart into two different step counts.
export const DEFAULT_STAIR_STEP_COUNT = 4;

const UP_NORMAL = Object.freeze({ x: 0, y: 1, z: 0 });
const DEG_TO_RAD = Math.PI / 180;

// Which brick primitives carry a directional, non-flat walkable
// profile at all. Deliberately a small, explicit lookup table here —
// never a new field on core/BrickDefinition.js itself (that would be a
// schema/serialization change touching every existing document, for a
// concept only TWO primitives need so far) — the same "smallest useful
// concept" restraint 0.3.2 already applied to step height. Every
// definitionId NOT listed here (including any future/unrecognized one)
// resolves to FLAT — its own top face, exactly the behavior every
// brick in this codebase has always had.
const SHAPE_KIND_BY_DEFINITION_ID = new Map([
    ['core:stair', WalkableSurfaceKind.STEP],
    ['core:slope_45', WalkableSurfaceKind.SLOPE]
]);

export function walkableSurfaceKindFor(definitionId) {
    return SHAPE_KIND_BY_DEFINITION_ID.get(definitionId) || WalkableSurfaceKind.FLAT;
}

// `brickGeometry` — a plain, already-resolved description of ONE
// brick, entirely in WORLD space:
//
//   shapeKind         — a WalkableSurfaceKind (walkableSurfaceKindFor())
//   center             — the brick's own world-space CENTER (its
//                         Brick.position PLUS the document's own world
//                         offset — see application/AvatarStepConstraint.js)
//   width/height/depth — the brick's own BrickDefinition dimensions
//   rotationDegrees    — the brick's own Brick.rotation, honored ONLY
//                         for a directional shape (STEP/SLOPE) — see
//                         below
//   steps              — STEP only; defaults to DEFAULT_STAIR_STEP_COUNT
//
// Returns `{ height, normal, kind }` when (x, z) falls within the
// brick's own footprint, or `null` outside it — "no surface here,"
// never a surface at height zero, the same convention
// core/BrickWalkability.js#walkableTopAt() already established.
//
// FLAT footprint containment stays deliberately rotation-agnostic —
// the exact same "ignoring Brick.rotation" simplification
// core/AvatarCollision.js#brickAabb() already documents for collision,
// reused here rather than reinvented, by delegating straight to
// walkableTopAt() over the brick's own axis-aligned bounds. A
// DIRECTIONAL shape cannot make that same simplification — which way
// a stair climbs or a slope rises is the entire reason it's a stair or
// a slope, not a box — so STEP/SLOPE profiles are evaluated in the
// brick's own LOCAL space, rotated back out of `rotationDegrees` first.
export function resolveWalkableSurfaceAt(brickGeometry, x, z) {
    const { shapeKind, center, width, height, depth, rotationDegrees = 0, steps = DEFAULT_STAIR_STEP_COUNT } = brickGeometry || {};
    if (!center || !Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(depth)) {
        return null;
    }

    if (shapeKind === WalkableSurfaceKind.STEP) {
        return stepSurfaceAt(center, width, height, depth, rotationDegrees, steps, x, z);
    }
    if (shapeKind === WalkableSurfaceKind.SLOPE) {
        return slopeSurfaceAt(center, width, height, depth, rotationDegrees, x, z);
    }
    return flatSurfaceAt(center, width, height, depth, x, z);
}

function flatSurfaceAt(center, width, height, depth, x, z) {
    const worldAabb = brickAabb(center, { width, height, depth });
    const top = walkableTopAt(worldAabb, x, z);
    if (top === null) return null;
    return { height: top, normal: UP_NORMAL, kind: WalkableSurfaceKind.FLAT };
}

// Ascends along the brick's own LOCAL +X axis, in `steps` discrete
// treads — matching, tread for tread, renderer/ThreeBrickFactory.js's
// own stairMeshFactory() profile (a THREE.Shape built from (0,0) up to
// (width,height) in `steps` risers, then translated so the brick's
// own footprint is centered — see that factory's own header). The
// front face (LOCAL x = -width/2) is already ONE riser up (a real
// stair has no zero-height lip at its own front edge); the back face
// (LOCAL x = +width/2) is the full brick height, exactly `walkableTopAt()`
// would report for an ordinary flat-topped box of the same height.
function stepSurfaceAt(center, width, height, depth, rotationDegrees, steps, x, z) {
    const { localX, localZ } = toLocal(center, rotationDegrees, x, z);
    if (!withinFootprint(localX, localZ, width, depth)) return null;

    const stepWidth = width / steps;
    const stepHeight = height / steps;
    const forward = localX + width / 2; // 0 (front/low edge) .. width (back/high edge)
    const stepIndex = clamp(Math.floor(forward / stepWidth), 0, steps - 1);
    const localHeight = (stepIndex + 1) * stepHeight;

    return {
        height: center.y - height / 2 + localHeight,
        normal: UP_NORMAL, // each individual tread is itself flat
        kind: WalkableSurfaceKind.STEP
    };
}

// Ascends continuously along the brick's own LOCAL +X axis, from 0 at
// the front face (LOCAL x = -width/2) to the full brick height at the
// back face (LOCAL x = +width/2) — a rise/run of `height / width`,
// exactly 1 (45°) for `core:slope_45`'s own 1x1x1 dimensions, though
// this profile itself never hardcodes 45 — it always reads the actual
// brick geometry, so any future differently-proportioned slope
// primitive gets a correct ramp for free.
function slopeSurfaceAt(center, width, height, depth, rotationDegrees, x, z) {
    const { localX, localZ } = toLocal(center, rotationDegrees, x, z);
    if (!withinFootprint(localX, localZ, width, depth)) return null;

    const t = clamp((localX + width / 2) / width, 0, 1);
    const localHeight = t * height;
    const rise = height / width;
    const localNormal = normalizeVector({ x: -rise, y: 1, z: 0 });

    return {
        height: center.y - height / 2 + localHeight,
        normal: fromLocalDirection(rotationDegrees, localNormal),
        kind: WalkableSurfaceKind.SLOPE
    };
}

function withinFootprint(localX, localZ, width, depth) {
    return localX >= -width / 2 && localX <= width / 2 && localZ >= -depth / 2 && localZ <= depth / 2;
}

// World (x, z) -> the brick's own LOCAL (x, z), undoing exactly the
// rotation renderer/BrickRenderer.js applies going the other way
// (`mesh.rotation.y = brick.rotation * (Math.PI / 180)`) — so a
// profile written once, in local space, produces a world-space climb
// direction that always matches what the brick actually looks like,
// at any of the 90°-increment rotations the placement UI offers (and,
// since this is plain trigonometry rather than a lookup table, at any
// arbitrary angle too).
function toLocal(center, rotationDegrees, x, z) {
    const dx = x - center.x;
    const dz = z - center.z;
    const rad = (Number.isFinite(rotationDegrees) ? rotationDegrees : 0) * DEG_TO_RAD;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return { localX: dx * cos - dz * sin, localZ: dx * sin + dz * cos };
}

// The exact inverse transform of toLocal()'s own rotation, applied to
// a direction (never a position — no `center` offset) so a profile's
// own local normal can be reported back in world space.
function fromLocalDirection(rotationDegrees, localVector) {
    const rad = (Number.isFinite(rotationDegrees) ? rotationDegrees : 0) * DEG_TO_RAD;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
        x: localVector.x * cos + localVector.z * sin,
        y: localVector.y,
        z: -localVector.x * sin + localVector.z * cos
    };
}

function normalizeVector(v) {
    const length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1;
    return { x: v.x / length, y: v.y / length, z: v.z / length };
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
