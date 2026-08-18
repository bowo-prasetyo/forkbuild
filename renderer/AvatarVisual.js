import * as THREE from 'three';
import { AvatarRenderer } from './AvatarRenderer.js';
import { getGesturePoseOverride } from '../core/AvatarGesturePoseOffsets.js';

// 0.2.35 — one avatar's live Three.js presence: a stable `root`
// object a caller adds to the scene ONCE, plus the bookkeeping that
// keeps it in sync with two independent, frequently-changing inputs:
//
//   setAppearance(template, appearance) — WHAT do I look like?
//   setPose(position, rotation)         — WHERE am I?  (+ setAnimation)
//
// Never rebuilds the mesh graph on setPose/setAnimation — those are
// cheap transform writes on an existing object graph. setAppearance
// DOES rebuild (dispose the old poseGroup, build a new one) but only
// when the appearance actually changed — a simple key comparison, not
// the "diff/rebuild visual components" optimization the design doc
// explicitly says is fine to defer: "If the first implementation
// simply rebuilds the avatar when its appearance changes, that's
// perfectly acceptable."
//
// 0.2.36 adds `tick(deltaSeconds)`: a continuous, ELAPSED-TIME gait
// clock so WALKING/RUNNING keep swinging even between presence
// updates (which only arrive when application/AvatarMovementController
// actually publishes a change — see its own header). This clock is
// PURELY a rendering-smoothness concern, deliberately never written
// to AvatarPresence — see docs/Principles.md, "Animation Is Driven By
// Elapsed Time, Never By Frame Count," and core/AvatarPoseOffsets.js's
// own header for why a receiver never needs to know the sender's
// local animation clock.
//
// 0.2.44 adds two more LOCAL-ONLY, rendering-only concerns, neither
// ever touching AvatarPresence or the wire:
//
//   setGesture(interactionKind)  — an upper-body GREET/WAVE/POINT
//                                  overlay (see
//                                  core/AvatarGesturePoseOffsets.js),
//                                  its own elapsed-time clock exactly
//                                  like the gait clock above.
//   setFacingOverride(yawDegrees) — a temporary yaw applied ON TOP OF
//                                  whatever setPose's rotation last
//                                  set, restored the moment it's
//                                  cleared (null) — see
//                                  core/AvatarFacing.js.
export class AvatarVisual {
    constructor(avatarRenderer = new AvatarRenderer()) {
        this._avatarRenderer = avatarRenderer;
        this.root = new THREE.Group();
        this._poseGroup = null;
        this._appearanceKey = null;
        this._lastAnimation = null;
        this._animationTime = 0;
        // 0.2.44 — see this file's own header above. `_lastRotationY`
        // is what setFacingOverride(null) restores to: the real,
        // presence-driven facing setPose most recently set, kept
        // around so "let go of the override" never needs a fresh
        // presence update to take effect.
        this._gestureKind = null;
        this._gestureTime = 0;
        this._facingOverrideDegrees = null;
        this._lastRotationY = 0;
    }

    setAppearance(template, appearance) {
        const key = template ? `${template.templateId}:${JSON.stringify(appearance)}` : null;
        if (key === this._appearanceKey) {
            return;
        }
        this._appearanceKey = key;

        if (this._poseGroup) {
            this.root.remove(this._poseGroup);
            this._avatarRenderer.dispose(this._poseGroup);
            this._poseGroup = null;
        }
        if (!template) {
            return;
        }

        const { poseGroup } = this._avatarRenderer.build(template, appearance);
        this._poseGroup = poseGroup;
        this.root.add(poseGroup);
        this._applyPose();
    }

    // Presence exclusively owns root's world position and facing —
    // see docs/Principles.md, "An Avatar's Location Comes From
    // Presence, Never From The Avatar Itself." rotation is the same
    // {x,y,z}-degrees shape WorldPlacement/PlacementRecord already
    // use (see renderer/BrickRenderer.js's own `* (Math.PI / 180)`) —
    // only the Y axis (facing) is applied; an avatar has no reason to
    // pitch or roll from a presence update in 0.2.35.
    //
    // 0.2.44 — no longer writes root.rotation.y directly: it records
    // the real facing and defers to _applyFacing(), which lets an
    // active setFacingOverride keep winning visually without this
    // method needing to know that override exists.
    setPose(position, rotation) {
        this.root.position.set(position.x, position.y, position.z);
        this._lastRotationY = rotation ? (rotation.y || 0) : 0;
        this._applyFacing();
    }

    setAnimation(animation) {
        if (animation === this._lastAnimation) {
            return;
        }
        this._lastAnimation = animation;
        // A fresh gait cycle always starts from phase zero — see
        // core/AvatarPoseOffsets.js: animationTimeSeconds = 0
        // reproduces the base pose exactly, so switching e.g. IDLE ->
        // WALKING never pops mid-stride.
        this._animationTime = 0;
        this._applyPose();
    }

    // 0.2.44 — see core/AvatarInteractionKind.js for the closed
    // vocabulary (GREET/WAVE/POINT); pass null (or NONE) to clear.
    // A fresh gesture always restarts its own elapsed-time clock from
    // zero, the same "no visible pop, no mid-cycle jump" reasoning
    // setAnimation above already follows for a locomotion change.
    setGesture(interactionKind) {
        const normalized = interactionKind && interactionKind !== 'none' ? interactionKind : null;
        if (normalized === this._gestureKind) {
            return;
        }
        this._gestureKind = normalized;
        this._gestureTime = 0;
        this._applyPose();
    }

    // 0.2.44 — a temporary, LOCAL-ONLY yaw override layered on top of
    // whatever AvatarPresence.rotation last set via setPose() —
    // never written back to AvatarPresence, never networked (see
    // application/WorldNavigationSession.js's avatar-facing behavior
    // for who calls this and when). `null` restores the avatar to its
    // real presence-driven facing immediately, using the rotation
    // setPose already remembered — no new presence update required to
    // "let go."
    setFacingOverride(yawDegrees) {
        this._facingOverrideDegrees = Number.isFinite(yawDegrees) ? yawDegrees : null;
        this._applyFacing();
    }

    _applyFacing() {
        const yaw = this._facingOverrideDegrees !== null ? this._facingOverrideDegrees : this._lastRotationY;
        this.root.rotation.y = THREE.MathUtils.degToRad(yaw);
    }

    _applyPose() {
        if (!this._poseGroup || !this._lastAnimation) {
            return;
        }
        const gestureOverride = this._gestureKind
            ? getGesturePoseOverride(this._gestureKind, this._gestureTime)
            : null;
        this._avatarRenderer.applyPose(this._poseGroup, this._lastAnimation, this._animationTime, gestureOverride);
    }

    // Called once per render frame (see renderer/Renderer.js's
    // per-frame listeners) regardless of whether a new presence
    // arrived this frame — this is what keeps WALKING/RUNNING
    // swinging smoothly between the (much less frequent) actual
    // AvatarPresence updates, and (0.2.44) an active gesture wobbling
    // smoothly too. A no-op whenever nothing is built yet or nothing
    // is currently playing.
    tick(deltaSeconds) {
        if (!this._poseGroup || !this._lastAnimation) {
            return;
        }
        const dt = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;
        this._animationTime += dt;
        if (this._gestureKind) {
            this._gestureTime += dt;
        }
        this._applyPose();
    }

    dispose() {
        if (this._poseGroup) {
            this._avatarRenderer.dispose(this._poseGroup);
            this._poseGroup = null;
        }
        this._appearanceKey = null;
        this._lastAnimation = null;
        this._animationTime = 0;
        this._gestureKind = null;
        this._gestureTime = 0;
        this._facingOverrideDegrees = null;
    }
}
