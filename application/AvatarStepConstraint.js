import { isStepClimbable, DEFAULT_MAX_STEP_HEIGHT } from '../core/BrickWalkability.js';
import { resolveWalkableSurfaceAt, walkableSurfaceKindFor } from '../core/WalkableSurface.js';

// The flat plane core/AvatarMovementSimulation.js has always walked on
// — see that file's own (pre-0.3.2) GROUND_Y constant. Deliberately
// NOT core/TerrainHeightField.js's real, hilly terrainHeightAt(): this
// class answers ONE question (is there a brick to step onto HERE?),
// never "what does the ground actually look like at this point" —
// that remains application/AvatarTerrainConstraint.js's own, entirely
// separate concern (slope-blocking a horizontal step against the REAL
// terrain height field, never snapping Y to it — see that class's own
// header). Folding real terrain height into the avatar's vertical
// snap-to-ground would be a much bigger, separate change (the avatar
// would need to start FOLLOWING hills it currently walks straight
// through) than this milestone's own scope: Step-Up Movement onto a
// brick, nothing more. See docs/Principles.md, "Step-Up Movement
// Builds On The Flat Walking Plane; It Does Not Replace It (0.3.2)."
const FLAT_GROUND_Y = 0;

// 0.3.2 — Step-Up Movement. The application-layer half of
// core/BrickWalkability.js, mirroring exactly the split
// application/AvatarMovementConstraint.js and
// application/AvatarTerrainConstraint.js already established: this
// class supplies the REAL loaded-world geometry (brick footprints,
// terrain height), core/BrickWalkability.js supplies the pure "is this
// a step or a climb" math applied to it.
//
// 0.3.3 — Walkable Structures. `supportHeightAt()`'s own per-brick
// height now comes from core/WalkableSurface.js#resolveWalkableSurfaceAt()
// rather than walkableTopAt() directly — see that file's own header for
// why a stair or a slope's own walkable height can never be an AABB
// question. Nothing in THIS class changed conceptually: it still
// answers "what is the highest walkable surface at this point," still
// takes the max across every currently-loaded brick plus the flat
// baseline, and an ordinary flat-topped brick still resolves to exactly
// the height it always did. Only the source of a non-flat brick's own
// height generalized.
//
// This is the THIRD and FINAL stage of the movement-constraint
// pipeline application/AvatarMovementController.js runs each tick —
// see that class's own header for the full order and why it matters:
// building collision (application/AvatarMovementConstraint.js) decides
// what blocks horizontal passage at all (with a LOW brick excluded
// from that decision entirely — see this class's own supportHeightAt()
// and AvatarMovementConstraint's 0.3.2 comment on why), terrain slope
// (application/AvatarTerrainConstraint.js) decides whether the
// remaining candidate step is too steep to climb, and THIS class
// decides the avatar's final Y — snapped onto whatever surface
// (terrain or a brick's own top) the resolved X/Z actually landed on —
// and, separately, whether stepping onto/off that surface at all is
// within reach.
//
// Deliberately NOT a physics climb — see docs/Principles.md, "Step-Up
// Movement Is A Deterministic Height Constraint, Never A Physics
// Climb (0.3.2)." A step within maxStepHeight is taken in full, in one
// tick, with no partial ascent; a step UP beyond it is simply not taken
// — the avatar stops at the edge, exactly like a too-steep terrain
// slope already stops it (core/TerrainWalkability.js).
//
// 0.3.4 — Vertical World Navigation. Stepping DOWN beyond maxStepHeight
// no longer shares that same "blocked, symmetric with stepping up"
// fate — see apply()'s own header below for the full reasoning. It was
// a deliberately named simplification through 0.3.3, never a claim
// that a ledge and a wall were the same kind of obstacle; this
// milestone is exactly the moment that simplification was named to
// wait for.
const DEFAULT_QUERY_RADIUS = 12; // world units — mirrors AvatarMovementConstraint's own reasoning
const MAX_DOCUMENT_SPAN_MARGIN = 64;

export class AvatarStepConstraint {
    // `groundHeight` is an injectable override for FLAT_GROUND_Y — a
    // plain number, purely so a test can exercise a non-zero baseline
    // without needing to fake terrain — never a real terrain lookup.
    constructor({
        groundHeight = FLAT_GROUND_Y,
        loadedDocuments,
        getWorldPosition,
        brickRegistry,
        queryRadius = DEFAULT_QUERY_RADIUS,
        maxStepHeight = DEFAULT_MAX_STEP_HEIGHT
    } = {}) {
        this._groundHeight = Number.isFinite(groundHeight) ? groundHeight : FLAT_GROUND_Y;
        this._loadedDocuments = loadedDocuments;
        this._getWorldPosition = getWorldPosition;
        this._brickRegistry = brickRegistry;
        this._queryRadius = queryRadius;
        this._maxStepHeight = maxStepHeight;
    }

    get maxStepHeight() {
        return this._maxStepHeight;
    }

    // The highest walkable surface directly beneath/at (x, z): the
    // flat walking plane's own height, or any currently-loaded brick's
    // own walkable surface (its flat top face, a stair tread, or a
    // slope's own ramp height — see core/WalkableSurface.js) whose
    // footprint contains the point — whichever is HIGHER. Taking the
    // max (rather than "the first brick found") is what makes standing
    // atop a stack of bricks well-defined: the ground beneath a stack
    // is never the relevant surface once something is sitting on top
    // of it. Public — this is also what
    // application/AvatarMovementController.js reads BEFORE simulating
    // a tick, to tell core/AvatarMovementSimulation.js what surface
    // the avatar is CURRENTLY standing on (its `groundHeight`).
    //
    // 0.3.3 — the per-brick height itself now comes from
    // core/WalkableSurface.js#resolveWalkableSurfaceAt() rather than
    // core/BrickWalkability.js#walkableTopAt() directly: an ordinary
    // flat-topped brick still resolves to EXACTLY the same top-face
    // height as before (that function still delegates straight back to
    // walkableTopAt() for the FLAT case — see its own header), while a
    // `core:stair`/`core:slope_45` brick now reports the tread/ramp
    // height under this specific (x, z), honoring the brick's own
    // rotation.
    supportHeightAt(x, z) {
        let height = this._groundHeight;
        if (!this._loadedDocuments || !this._getWorldPosition) {
            return height;
        }
        for (const [documentId, document] of this._loadedDocuments) {
            const worldPosition = this._getWorldPosition(documentId);
            if (!worldPosition) continue;
            if (flatDistance(worldPosition, x, z) > this._queryRadius + MAX_DOCUMENT_SPAN_MARGIN) continue;
            for (const building of document.world.getBuildings()) {
                for (const brick of building.getBricks()) {
                    const definition = this._brickRegistry ? this._brickRegistry.get(brick.definitionId) : null;
                    // Same "degrade gracefully, never throw" posture
                    // AvatarMovementConstraint's own obstacle collection
                    // follows for an unrecognized definitionId.
                    if (!definition) continue;
                    const surface = resolveWalkableSurfaceAt({
                        shapeKind: walkableSurfaceKindFor(brick.definitionId),
                        center: {
                            x: brick.position.x + worldPosition.x,
                            y: brick.position.y + worldPosition.y,
                            z: brick.position.z + worldPosition.z
                        },
                        width: definition.width,
                        height: definition.height,
                        depth: definition.depth,
                        rotationDegrees: brick.rotation
                    }, x, z);
                    if (surface !== null && surface.height > height) {
                        height = surface.height;
                    }
                }
            }
        }
        return height;
    }

    // `position` — the avatar's position BEFORE this tick's movement.
    // `desiredPosition` — where building collision + terrain slope
    // already agreed the avatar may go THIS tick — its X/Z is final by
    // this point, only its Y is still provisional. `grounded` — the
    // CURRENT tick's own simulation result: a step onto/off a brick
    // only ever applies while walking, never mid-jump or mid-fall — an
    // airborne avatar passes straight through unchanged, so a running
    // jump can still land on top of a tall brick from above, exactly
    // like landing on the ground already works.
    //
    // 0.3.4 — Vertical World Navigation. Before this milestone, ANY
    // height delta beyond `maxStepHeight` was treated identically,
    // whichever direction it went: blocked, X/Z reverted, exactly like
    // walking into a wall — see docs/Roadmap.md's own 0.3.3 note,
    // "falling off a ledge under gravity... a too-large step DOWN is
    // blocked, symmetric with a too-large step up." That symmetry was
    // always an explicit, named simplification, never a claim that
    // stepping off a ledge and stepping into a wall were the same kind
    // of event. They aren't: a wall in front of the avatar is real
    // geometry actively occupying that space; a ledge is the ABSENCE of
    // a supporting surface, which is exactly what gravity — already
    // sitting one layer down in core/AvatarMovementSimulation.js since
    // 0.2.36 — exists to answer. So the two directions now diverge:
    //
    //   toHeight - fromHeight >  maxStepHeight  -> still BLOCKED
    //       (a wall, a step too tall to climb — unchanged from 0.3.3)
    //   toHeight - fromHeight < -maxStepHeight  -> now FALLING
    //       (the surface ahead drops away — horizontal motion is
    //       accepted, Y is left UNSNAPPED, and `falling: true` tells
    //       the caller — application/AvatarMovementController.js — to
    //       flip `grounded` to false for the NEXT tick, so
    //       core/AvatarMovementSimulation.js's own existing gravity
    //       integration takes over from here)
    //
    // Landing still reads the exact same `supportHeightAt()` — the
    // SAME `WalkableSurface` abstraction 0.3.3 built, whether the
    // surface below is flat ground, a brick's flat top, a stair tread,
    // or a slope's own ramp. There is no second "falling surface"
    // concept anywhere in this codebase; see docs/Principles.md,
    // "Falling Still Asks WalkableSurface The Same Question Walking
    // Always Has (0.3.4)."
    apply(position, desiredPosition, { grounded = true } = {}) {
        if (!grounded) {
            return { position: desiredPosition, blocked: false, falling: false };
        }
        const fromHeight = this.supportHeightAt(position.x, position.z);
        const toHeight = this.supportHeightAt(desiredPosition.x, desiredPosition.z);
        if (isStepClimbable(fromHeight, toHeight, this._maxStepHeight)) {
            return {
                position: { x: desiredPosition.x, y: toHeight, z: desiredPosition.z },
                blocked: false,
                falling: false
            };
        }
        if (toHeight < fromHeight) {
            // The surface ahead drops away by more than a step can
            // bridge — an unsupported ledge, not a wall. X/Z proceed;
            // Y is passed through exactly as terrain/collision left
            // it (still resting on the OLD support height, one tick
            // behind — see AvatarMovementController's own 0.3.4 note
            // on why that one-tick lag is fine), and gravity takes
            // over starting next tick.
            return {
                position: { x: desiredPosition.x, y: desiredPosition.y, z: desiredPosition.z },
                blocked: false,
                falling: true
            };
        }
        // Stepping UP beyond maxStepHeight remains a genuine wall,
        // exactly as it was through 0.3.3 — falling only ever explains
        // a DROP, never a climb. Same "revert X/Z to where the avatar
        // already stood, Y still passes through from desiredPosition"
        // convention AvatarTerrainConstraint.apply() already documents
        // — a rejected step must never also cancel legitimate vertical
        // motion (a jump already in progress) already in flight.
        return {
            position: { x: position.x, y: desiredPosition.y, z: position.z },
            blocked: true,
            falling: false
        };
    }
}

function flatDistance(worldPosition, x, z) {
    const dx = worldPosition.x - x;
    const dz = worldPosition.z - z;
    return Math.sqrt(dx * dx + dz * dz);
}
