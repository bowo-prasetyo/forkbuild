import * as THREE from 'three';

// 0.9.701 — Released Animal Rendering.
//
// One released animal's live Three.js presence — the direct structural
// twin of renderer/VehicleVisual.js, smaller still: core/AnimalPresence.js
// carries no heading (see renderer/AnimalRenderer.js's own header for
// why), so there is no setHeading() counterpart here at all — position
// is the only thing that ever changes after construction.
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
        this._built = animalRenderer.build(species);
        if (this._built) {
            this.root.add(this._built);
        }
    }

    get isSupported() {
        return this._built !== null;
    }

    setPosition(position) {
        this.root.position.set(position.x, position.y, position.z);
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
