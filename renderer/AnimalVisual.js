import * as THREE from 'three';
import { stationaryAnimalPoseAt } from '../core/WildlifeMotion.js';
import { idleOffsetsAt } from './AnimalIdle.js';
import { BODY_FRAME, NECK } from './AnimalRenderer.js';

// 0.9.701 — Released Animal Rendering.
//
// One released animal's live Three.js presence — the direct structural
// twin of renderer/VehicleVisual.js, smaller still: core/AnimalPresence.js
// carries no heading (see renderer/AnimalRenderer.js's own header for
// why), so there is no setHeading() counterpart here at all. Position is
// set by the caller; everything else — which way it faces, and grazing or
// looking around — comes from animateAt(), which never moves it off its
// spot (core/WildlifeMotion.js#stationaryAnimalPoseAt()).
//
// `root` is the ONE Object3D a caller (renderer/AnimalFieldRenderer.js)
// ever adds to or removes from the scene — created once, reused for the
// animal's entire tracked lifetime.
export class AnimalVisual {
    constructor(animalRenderer, species) {
        this.root = new THREE.Group();
        // May be `null` for a species this renderer has no visual for
        // yet — `isSupported` tells a caller not to bother tracking or
        // adding it to the scene at all, the identical
        // graceful-degradation posture VehicleVisual's own
        // `isSupported` already establishes.
        this._species = species;
        this._built = animalRenderer.build(species);
        this._bodyFrame = null;
        this._neck = null;
        if (this._built) {
            this.root.add(this._built);
            this._bodyFrame = this._built.getObjectByName(BODY_FRAME) || null;
            this._neck = this._built.getObjectByName(NECK) || null;
        }
    }

    get isSupported() {
        return this._built !== null;
    }

    setPosition(position) {
        this.root.position.set(position.x, position.y, position.z);
    }

    // Poses this animal as it is at `timeSeconds`: which way it faces, and
    // its idle action (renderer/AnimalIdle.js) — the same grazing and
    // looking around a wild animal does, without ever leaving its spot.
    // `animalKey` (its id) and `seed` pick its rhythm; the same key at the
    // same time always gives the same pose.
    animateAt(seed, animalKey, timeSeconds) {
        if (!this._built) {
            return;
        }
        const pose = stationaryAnimalPoseAt(seed, animalKey, this._species, timeSeconds);
        const offsets = idleOffsetsAt(this._species, pose.idleAction, pose.idleSeconds, pose.idleDuration);
        this.root.rotation.y = pose.rotationY;
        if (this._bodyFrame) {
            this._bodyFrame.position.y = offsets.lift;
            this._bodyFrame.rotation.x = offsets.bodyPitch;
        }
        if (this._neck) {
            this._neck.rotation.set(offsets.headPitch, offsets.headYaw, 0);
        }
    }

    // Disposes only the per-instance-CLONED materials
    // renderer/AnimalRenderer.js's own build() call created — never the
    // shared, module-level SPECIES_PRESET geometry those meshes also
    // reference. See that file's own header, "geometry is shared and
    // never disposed here," for why disposing it would corrupt every
    // other currently-visible animal of the same species.
    dispose() {
        this.root.traverse((object) => {
            if (object.material) {
                object.material.dispose();
            }
        });
    }
}
