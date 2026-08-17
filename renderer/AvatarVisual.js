import * as THREE from 'three';
import { AvatarRenderer } from './AvatarRenderer.js';

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
export class AvatarVisual {
    constructor(avatarRenderer = new AvatarRenderer()) {
        this._avatarRenderer = avatarRenderer;
        this.root = new THREE.Group();
        this._poseGroup = null;
        this._appearanceKey = null;
        this._lastAnimation = null;
        this._animationTime = 0;
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
        if (this._lastAnimation) {
            this._avatarRenderer.applyPose(this._poseGroup, this._lastAnimation, this._animationTime);
        }
    }

    // Presence exclusively owns root's world position and facing —
    // see docs/Principles.md, "An Avatar's Location Comes From
    // Presence, Never From The Avatar Itself." rotation is the same
    // {x,y,z}-degrees shape WorldPlacement/PlacementRecord already
    // use (see renderer/BrickRenderer.js's own `* (Math.PI / 180)`) —
    // only the Y axis (facing) is applied; an avatar has no reason to
    // pitch or roll from a presence update in 0.2.35.
    setPose(position, rotation) {
        this.root.position.set(position.x, position.y, position.z);
        this.root.rotation.y = THREE.MathUtils.degToRad(rotation ? rotation.y || 0 : 0);
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
        if (this._poseGroup) {
            this._avatarRenderer.applyPose(this._poseGroup, animation, this._animationTime);
        }
    }

    // Called once per render frame (see renderer/Renderer.js's
    // per-frame listeners) regardless of whether a new presence
    // arrived this frame — this is what keeps WALKING/RUNNING
    // swinging smoothly between the (much less frequent) actual
    // AvatarPresence updates. A no-op whenever nothing is built yet or
    // the current animation has no gait cycle of its own
    // (core/AvatarPoseOffsets.js already no-ops IDLE/JUMPING against
    // time, but skipping the call entirely here avoids even the
    // redundant re-application).
    tick(deltaSeconds) {
        if (!this._poseGroup || !this._lastAnimation) {
            return;
        }
        const dt = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;
        this._animationTime += dt;
        this._avatarRenderer.applyPose(this._poseGroup, this._lastAnimation, this._animationTime);
    }

    dispose() {
        if (this._poseGroup) {
            this._avatarRenderer.dispose(this._poseGroup);
            this._poseGroup = null;
        }
        this._appearanceKey = null;
        this._lastAnimation = null;
        this._animationTime = 0;
    }
}
