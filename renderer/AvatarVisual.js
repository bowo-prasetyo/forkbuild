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
export class AvatarVisual {
    constructor(avatarRenderer = new AvatarRenderer()) {
        this._avatarRenderer = avatarRenderer;
        this.root = new THREE.Group();
        this._poseGroup = null;
        this._appearanceKey = null;
        this._lastAnimation = null;
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
            this._avatarRenderer.applyPose(this._poseGroup, this._lastAnimation);
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
        if (this._poseGroup) {
            this._avatarRenderer.applyPose(this._poseGroup, animation);
        }
    }

    dispose() {
        if (this._poseGroup) {
            this._avatarRenderer.dispose(this._poseGroup);
            this._poseGroup = null;
        }
        this._appearanceKey = null;
    }
}
