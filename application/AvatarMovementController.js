import { AvatarMovementState } from '../core/AvatarMovementState.js';
import { simulateAvatarMovement } from '../core/AvatarMovementSimulation.js';

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
const EPSILON = 1e-6;

export class AvatarMovementController {
    constructor(avatarPresenceSession, movementConstraint = null) {
        this._avatarPresenceSession = avatarPresenceSession;
        this._movementConstraint = movementConstraint;
        this._keys = { forward: false, backward: false, left: false, right: false, running: false, jumpHeld: false };
        this._verticalVelocity = 0;
        this._grounded = true;
        // Transient, per-tick bookkeeping only — exactly like
        // _verticalVelocity/_grounded above, never part of
        // AvatarPresence itself (see docs/Principles.md, "Collided Is
        // Movement Information, Not An Animation Vocabulary").
        this._collided = false;
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

        const result = simulateAvatarMovement({
            position: currentPosition,
            rotationY: currentRotationY,
            verticalVelocity: this._verticalVelocity,
            grounded: this._grounded,
            movementState,
            deltaSeconds
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
            const constrained = this._movementConstraint.apply(currentPosition, result.position);
            finalPosition = constrained.position;
            this._collided = constrained.collided;
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
