import * as THREE from 'three';

// 0.9.115 — Vehicle Rendering.
//
// One vehicle's live Three.js presence — the renderer-side counterpart to
// renderer/AvatarVisual.js, but deliberately far smaller: this milestone's
// own brief excludes movement, animation, and appearance changes of any
// kind (see docs/Roadmap.md, 0.9.115, "Do not change movement yet"), so
// there is no gait clock, no pose group, no diff/rebuild-on-change
// lifecycle to manage. A VehicleInstance's own `type` never changes for
// the life of a vehicle (core/VehicleInstance.js's own header, "identity
// never changes") — so unlike AvatarVisual's setAppearance(), which can
// be called many times against a changing appearance, this class's
// geometry is built exactly ONCE, at construction, from the `type` it is
// handed then.
//
// `root` is the ONE Object3D a caller (renderer/VehicleFieldRenderer.js)
// ever adds to or removes from the scene — created once, reused for the
// vehicle's entire tracked lifetime, exactly the same "stable root object
// a caller owns" contract renderer/AvatarVisual.js's own header already
// establishes.
//
// setPosition(position) IS THE ONLY THING THAT EVER CHANGES AFTER
// CONSTRUCTION, AND IT NEVER READS spawnPosition. This class has no idea
// a VehicleInstance even has a `spawnPosition` field — it only ever sees
// whatever plain `{x, y, z}` its caller hands it, which
// renderer/VehicleFieldRenderer.js's own header guarantees is always
// `instance.position`, never `instance.spawnPosition`. Keeping this class
// ignorant of the distinction entirely is deliberate: the ONE seam that
// could get `position` vs. `spawnPosition` backwards is
// VehicleFieldRenderer#setVehicle(), and this milestone wants exactly one
// place capable of that mistake, not two.
export class VehicleVisual {
    constructor(vehicleRenderer, type) {
        this.root = new THREE.Group();
        // May be `null` for a VehicleType this renderer has no visual
        // for yet (see renderer/VehicleRenderer.js's own header) — `root`
        // is still a real, valid (if empty) Object3D either way, but
        // `isSupported` tells a caller not to bother tracking or adding
        // it to the scene at all.
        this._built = vehicleRenderer.build(type);
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

    dispose() {
        this.root.traverse((object) => {
            if (object.geometry) {
                object.geometry.dispose();
            }
            if (object.material) {
                object.material.dispose();
            }
        });
    }
}
