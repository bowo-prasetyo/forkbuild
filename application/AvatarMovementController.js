import { AvatarMovementState } from '../core/AvatarMovementState.js';
import { simulateAvatarMovement } from '../core/AvatarMovementSimulation.js';
import { deriveAvatarVerticalState } from '../core/AvatarVerticalState.js';

// 0.2.36 — the ONE place raw input becomes an AvatarPresence update.
// See docs/Principles.md, "Input Changes Presence; Presence Changes
// The Renderer": this class never touches a Three.js object, and
// renderer/AvatarVisual.js never reads a key state — the two only
// ever meet through AvatarPresenceSession, exactly the same
// separation 0.2.35 already drew between "what an avatar looks like"
// and "where it is."
//
//   keyDown/keyUp     — raw input, called by WorldNavigationSession's
//                        avatarKeyDown/avatarKeyUp (itself called by
//                        the UI only while Avatar Control Mode is on)
//   tick(deltaSeconds) — called once per render frame; runs the pure
//                        core/AvatarMovementSimulation.js step and,
//                        ONLY if something actually changed, publishes
//                        a new AvatarPresence
//
// `_verticalVelocity`/`_grounded` are this controller's own small bit
// of physics bookkeeping between ticks — deliberately NOT part of
// AvatarPresence (see core/AvatarMovementSimulation.js's own header:
// AvatarPresence is the RESULT of simulation, never the simulation
// itself; a future network peer receiving presence updates has no
// reason to know or care about the sender's mid-air vertical speed).
//
// 0.2.42 — `movementConstraint` (optional — see docs/Principles.md,
// the same "enforce/offer only when wired" posture every other
// optional collaborator in this codebase already follows) sits
// between the pure simulation step and the presence update: given
// where the avatar IS and where the simulation says it WOULD go, it
// returns where it's actually ALLOWED to go plus whether that was
// altered by collision — see application/AvatarMovementConstraint.js.
// This class still owns "when do we simulate a tick and publish
// presence"; it never touches a Brick, a Document, or a WorldPlacement
// itself.
//
// 0.2.77 — `terrainConstraint` (optional, same posture) sits right
// after `movementConstraint` in the same pipeline: given where the
// avatar IS and where it would go AFTER building collision already
// resolved, it returns whether that horizontal step is walkable —
// see application/AvatarTerrainConstraint.js. Applied second,
// deliberately: building collision decides what geometry blocks
// passage at all, terrain walkability decides whether the remaining
// candidate step is too steep to climb. Same reasoning that keeps
// `movementConstraint` optional applies here — a controller built
// without one behaves exactly as it did before this milestone.
//
// 0.3.2 — `stepConstraint` (optional, same posture again) sits LAST,
// after `terrainConstraint` — see application/AvatarStepConstraint.js's
// own header for the full pipeline reasoning. It also changes ONE
// thing earlier in this method: with a stepConstraint wired, this
// class reads the avatar's CURRENT support height (stepConstraint.
// supportHeightAt()) before simulating at all, and feeds it to both
// simulateAvatarMovement() (as `groundHeight`, so gravity/landing
// resolve against whatever surface the avatar already stands on, not
// an absolute Y=0 plane) and movementConstraint.apply() (as
// `supportHeight`, so a climbable low brick never blocks horizontal
// passage in the first place — see AvatarMovementConstraint's own
// 0.3.2 comment). A controller built without a stepConstraint computes
// none of this and behaves exactly as it did before this milestone.
//
// 0.3.4 — Vertical World Navigation. `stepConstraint.apply()` can now
// report `falling: true` — the resolved horizontal step walks the
// avatar off the edge of whatever it was standing on (see that class's
// own header). This is the ONE new thing `tick()` does: when that
// happens, `_grounded` is forced to `false` for the NEXT tick,
// regardless of what this tick's own `simulateAvatarMovement()` result
// said (it still said `grounded: true` — the avatar WAS standing on
// something when this tick began; it just walked past the edge of it
// during the tick). No other new bookkeeping — `_verticalVelocity` is
// already `0` at that moment (a grounded tick always zeroes it — see
// core/AvatarMovementSimulation.js), so the very next tick's gravity
// integration starts cleanly from rest, exactly like the top of any
// other fall.
//
// 0.9.63 — `treeConstraint` (optional, same "enforce/offer only when
// wired" posture as every other constraint here) is APPENDED last,
// both in this constructor's own parameter list and in tick()'s own
// pipeline below — the same append-only convention `stepConstraint`
// itself already followed relative to `terrainConstraint`, so no
// existing positional caller (test or otherwise) is disturbed by its
// addition. It runs on whatever position building collision, terrain
// slope, and step height have already produced, and only ever adjusts
// X/Z — see application/AvatarTreeConstraint.js's own header for why
// running it last is safe: tree collision never reads or writes Y, so
// it cannot undo any ground/brick snap `stepConstraint` already
// resolved. A controller built without a treeConstraint computes none
// of this and behaves exactly as it did before this milestone.
const EPSILON = 1e-6;

export class AvatarMovementController {
    constructor(avatarPresenceSession, movementConstraint = null, terrainConstraint = null, stepConstraint = null, treeConstraint = null) {
        this._avatarPresenceSession = avatarPresenceSession;
        this._movementConstraint = movementConstraint;
        this._terrainConstraint = terrainConstraint;
        this._stepConstraint = stepConstraint;
        this._treeConstraint = treeConstraint;
        this._keys = { forward: false, backward: false, left: false, right: false, running: false, jumpHeld: false };
        this._verticalVelocity = 0;
        this._grounded = true;
        // Transient, per-tick bookkeeping only — exactly like
        // _verticalVelocity/_grounded above, never part of
        // AvatarPresence itself (see docs/Principles.md, "Collided Is
        // Movement Information, Not An Animation Vocabulary").
        this._collided = false;
        // 0.2.77 — same transient, never-part-of-AvatarPresence
        // posture as `_collided` above, for the terrain-slope
        // equivalent.
        this._blockedBySlope = false;
        // 0.3.2 — same posture again, for the step-height equivalent.
        this._blockedByStepHeight = false;
        // 0.9.63 — same posture again, for the tree-collision
        // equivalent.
        this._collidedWithTree = false;
    }

    // Returns true when `key` is one this controller understands (so
    // a caller knows whether to preventDefault/swallow the event),
    // false for anything else — letting every other shortcut in the
    // app keep working normally even while Avatar Control Mode is on.
    // Deliberately just W/A/S/D/Shift/Space — no arrow-key aliases,
    // because the arrow keys already mean "nudge the selection" (see
    // application/EditorActionRegistry.js) and Avatar Control Mode
    // must never silently steal that binding.
    keyDown(key) {
        return this._setKey(key, true);
    }

    keyUp(key) {
        return this._setKey(key, false);
    }

    // Releases every held key without changing anything else. Called
    // whenever Avatar Control Mode is turned off, and on window blur
    // — so a key event the browser never delivered (alt-tab away
    // mid-stride, a DevTools breakpoint) can never leave the avatar
    // "stuck" walking forever. See the design doc's own concern:
    // typing/searching must never accidentally make the avatar walk
    // away.
    releaseAll() {
        this._keys = { forward: false, backward: false, left: false, right: false, running: false, jumpHeld: false };
    }

    // Runs one simulation step and, if the result is actually
    // different from the current presence, publishes it. Returns the
    // new AvatarPresence when it published one, or null when nothing
    // changed — an avatar standing still, already grounded, with no
    // keys held produces an EXACT no-op (see
    // core/AvatarMovementSimulation.js: zero input, zero drift), so
    // `sequence` only ever advances on an update a viewer would
    // actually notice, never once per render frame regardless of
    // motion.
    tick(deltaSeconds) {
        if (!this._avatarPresenceSession) {
            return null;
        }
        const movementState = this._currentMovementState();
        const current = this._avatarPresenceSession.current;
        const currentRotationY = current.rotation.y || 0;
        const currentPosition = { x: current.position.x, y: current.position.y, z: current.position.z };

        // 0.3.2 — read BEFORE simulating: "what surface is the avatar
        // CURRENTLY standing on," so simulateAvatarMovement()'s own
        // gravity/landing resolve against it rather than an absolute
        // Y=0 plane. `undefined` when no stepConstraint is wired —
        // simulateAvatarMovement() defaults `groundHeight` to its own
        // original flat-plane constant in that case, so behavior is
        // unchanged from before this milestone.
        const currentSupportHeight = this._stepConstraint
            ? this._stepConstraint.supportHeightAt(currentPosition.x, currentPosition.z)
            : undefined;

        const result = simulateAvatarMovement({
            position: currentPosition,
            rotationY: currentRotationY,
            verticalVelocity: this._verticalVelocity,
            grounded: this._grounded,
            movementState,
            deltaSeconds,
            groundHeight: currentSupportHeight
        });
        this._verticalVelocity = result.verticalVelocity;
        this._grounded = result.grounded;

        // 0.2.42 — the pure simulation result is only ever a PROPOSED
        // position; the movement constraint (when wired) is the one
        // place that can still adjust X/Z before anything reaches
        // AvatarPresence. See application/AvatarMovementConstraint.js.
        let finalPosition = result.position;
        this._collided = false;
        if (this._movementConstraint) {
            const constrained = this._movementConstraint.apply(currentPosition, result.position, {
                supportHeight: currentSupportHeight
            });
            finalPosition = constrained.position;
            this._collided = constrained.collided;
        }

        // 0.2.77 — applied AFTER building collision, on whatever
        // position collision already resolved to: building geometry
        // decides what blocks passage at all, terrain slope decides
        // whether the remaining candidate step is too steep to climb.
        this._blockedBySlope = false;
        if (this._terrainConstraint) {
            const terrainResult = this._terrainConstraint.apply(currentPosition, finalPosition);
            finalPosition = terrainResult.position;
            this._blockedBySlope = terrainResult.blocked;
        }

        // 0.3.2 — applied LAST: decides the avatar's final Y (snapped
        // onto whatever surface — terrain or a brick's own top — the
        // resolved X/Z actually landed on) and whether stepping onto/
        // off that surface is within reach at all. See
        // application/AvatarStepConstraint.js's own header for why
        // this runs after both collision and slope.
        this._blockedByStepHeight = false;
        if (this._stepConstraint) {
            const stepResult = this._stepConstraint.apply(currentPosition, finalPosition, {
                grounded: result.grounded
            });
            finalPosition = stepResult.position;
            this._blockedByStepHeight = stepResult.blocked;
            // 0.3.4 — the avatar just walked off the edge of whatever
            // it was standing on; the NEXT tick starts genuinely
            // airborne, whatever this tick's own simulation result
            // said about `grounded`.
            if (stepResult.falling) {
                this._grounded = false;
            }
        }

        // 0.9.63 — applied LAST, after building collision, terrain
        // slope, and step height have all already resolved `finalPosition`
        // (Y included): tree occupancy is a purely horizontal (X/Z)
        // constraint, orthogonal to every one of those, and never reads
        // or rewrites the Y they already settled — see
        // application/AvatarTreeConstraint.js's own header.
        this._collidedWithTree = false;
        if (this._treeConstraint) {
            const treeResult = this._treeConstraint.apply(currentPosition, finalPosition);
            finalPosition = treeResult.position;
            this._collidedWithTree = treeResult.collided;
        }

        const positionChanged = !samePosition(finalPosition, current.position);
        const rotationChanged = Math.abs(result.rotationY - currentRotationY) > EPSILON;
        const animationChanged = result.animation !== current.animation;
        if (!positionChanged && !rotationChanged && !animationChanged) {
            return null;
        }

        return this._avatarPresenceSession.update({
            position: finalPosition,
            rotation: { y: result.rotationY },
            animation: result.animation
        });
    }

    // 0.2.42 — whether the MOST RECENT tick's desired movement was
    // altered by world collision geometry. Transient — recomputed
    // fresh every tick, never persisted, never part of AvatarPresence
    // (see docs/Principles.md). A debug/UI surface, not something any
    // other internal logic reads.
    isCollided() {
        return this._collided;
    }

    // 0.2.77 — whether the MOST RECENT tick's desired movement was
    // altered because the candidate step's slope exceeded what's
    // walkable. Same posture as isCollided() above: transient,
    // recomputed fresh every tick, never persisted, never part of
    // AvatarPresence. A debug/UI surface, not something any other
    // internal logic reads.
    isBlockedBySlope() {
        return this._blockedBySlope;
    }

    // 0.3.2 — whether the MOST RECENT tick's desired movement was
    // altered because the candidate step's height change exceeded what
    // Step-Up Movement allows. Same posture as isCollided()/
    // isBlockedBySlope() above: transient, recomputed fresh every
    // tick, never persisted, never part of AvatarPresence. A debug/UI
    // surface, not something any other internal logic reads.
    isBlockedByStepHeight() {
        return this._blockedByStepHeight;
    }

    // 0.9.63 — whether the MOST RECENT tick's desired movement was
    // altered because it would have carried the avatar into a tree's
    // own collision circle. Same posture as isCollided()/
    // isBlockedBySlope()/isBlockedByStepHeight() above: transient,
    // recomputed fresh every tick, never persisted, never part of
    // AvatarPresence. A debug/UI surface, not something any other
    // internal logic reads.
    isCollidedWithTree() {
        return this._collidedWithTree;
    }

    // 0.3.4 — the avatar's CURRENT vertical motion state (SUPPORTED /
    // RISING / FALLING — core/AvatarVerticalState.js), derived fresh
    // from exactly the same `_grounded`/`_verticalVelocity` bookkeeping
    // this controller already carries between ticks. Same "debug/UI
    // surface, not something any other internal logic reads" posture
    // as isCollided()/isBlockedBySlope()/isBlockedByStepHeight() above
    // — application/WorldNavigationSession.js reads it to feed
    // core/WorldSpatialActivity.js#deriveWorldSpatialActivity()'s own
    // new JUMPING/FALLING cases, never anything that changes movement
    // itself.
    verticalState() {
        return deriveAvatarVerticalState({ grounded: this._grounded, verticalVelocity: this._verticalVelocity });
    }

    // 0.2.44 — whether the player is CURRENTLY holding any directional
    // key (forward/backward/left/right — turning included, since
    // turning is also an explicit facing choice the user is making,
    // never something a facing override should fight). Read by
    // WorldNavigationSession's avatar-facing behavior (see
    // core/AvatarFacing.js) to decide whether a temporary "look at
    // target" override is allowed to apply at all this frame — an
    // actively-moving player's own input always wins. Deliberately
    // ignores Shift/Space: running or jumping alone implies nothing
    // about facing.
    hasMovementInput() {
        return this._keys.forward || this._keys.backward || this._keys.left || this._keys.right;
    }

    _currentMovementState() {
        return new AvatarMovementState({
            forwardAxis: (this._keys.forward ? 1 : 0) - (this._keys.backward ? 1 : 0),
            turnAxis: (this._keys.right ? 1 : 0) - (this._keys.left ? 1 : 0),
            running: this._keys.running,
            jumpRequested: this._keys.jumpHeld
        });
    }

    _setKey(key, isDown) {
        switch (String(key || '').toLowerCase()) {
            case 'w': this._keys.forward = isDown; return true;
            case 's': this._keys.backward = isDown; return true;
            case 'a': this._keys.left = isDown; return true;
            case 'd': this._keys.right = isDown; return true;
            case 'shift': this._keys.running = isDown; return true;
            case ' ': case 'space': case 'spacebar': this._keys.jumpHeld = isDown; return true;
            default: return false;
        }
    }
}

function samePosition(a, b) {
    return Math.abs(a.x - b.x) <= EPSILON
        && Math.abs(a.y - b.y) <= EPSILON
        && Math.abs(a.z - b.z) <= EPSILON;
}
