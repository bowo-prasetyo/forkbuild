import { brickAabb, translateAabb } from '../core/AvatarCollision.js';
import { walkableTopAt, isStepClimbable, DEFAULT_MAX_STEP_HEIGHT } from '../core/BrickWalkability.js';

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
// tick, with no partial ascent; a step beyond it is simply not taken —
// the avatar stops at the edge, exactly like a too-steep terrain slope
// already stops it (core/TerrainWalkability.js). Stepping DOWN off a
// tall ledge is symmetrically blocked, not a fall — genuine gravity-
// driven falling off an edge remains explicitly out of scope for this
// milestone (see core/BrickWalkability.js#isStepClimbable's own
// header), the same way climbing full staircases and sloped brick
// geometry are named, in docs/Roadmap.md, as later work.
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
    // top face whose horizontal footprint contains the point —
    // whichever is HIGHER. Taking the max (rather than "the first
    // brick found") is what makes standing atop a stack of bricks
    // well-defined: the ground beneath a stack is never the relevant
    // surface once something is sitting on top of it. Public — this is
    // also what application/AvatarMovementController.js reads BEFORE
    // simulating a tick, to tell core/AvatarMovementSimulation.js what
    // surface the avatar is CURRENTLY standing on (its `groundHeight`).
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
                    const worldAabb = translateAabb(brickAabb(brick.position, definition), worldPosition);
                    const top = walkableTopAt(worldAabb, x, z);
                    if (top !== null && top > height) {
                        height = top;
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
    apply(position, desiredPosition, { grounded = true } = {}) {
        if (!grounded) {
            return { position: desiredPosition, blocked: false };
        }
        const fromHeight = this.supportHeightAt(position.x, position.z);
        const toHeight = this.supportHeightAt(desiredPosition.x, desiredPosition.z);
        if (isStepClimbable(fromHeight, toHeight, this._maxStepHeight)) {
            return {
                position: { x: desiredPosition.x, y: toHeight, z: desiredPosition.z },
                blocked: false
            };
        }
        // Same "revert X/Z to where the avatar already stood, Y still
        // passes through from desiredPosition" convention
        // AvatarTerrainConstraint.apply() already documents — a
        // rejected step must never also cancel legitimate vertical
        // motion (a jump/fall) already in progress.
        return {
            position: { x: position.x, y: desiredPosition.y, z: position.z },
            blocked: true
        };
    }
}

function flatDistance(worldPosition, x, z) {
    const dx = worldPosition.x - x;
    const dz = worldPosition.z - z;
    return Math.sqrt(dx * dx + dz * dz);
}
