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
//
// 0.9.123 — Vehicle Orientation. setHeading(headingDegrees) is the
// direct structural twin of setPosition() above: it ONLY EVER APPLIES a
// heading this class is handed — see core/VehicleInstance.js's own
// `heading` (degrees, 0 = facing +Z) and
// core/VehicleMovementHeading.js's own header — never computes one
// itself. This is the "renderer remains an observer" seam
// docs/Roadmap.md, 0.9.123 asks for explicitly: heading flows
// VehicleInstance -> VehicleVisual, never the reverse.
//
// THE -90° OFFSET IS A FACT ABOUT THIS PARTICULAR PROCEDURAL MODEL, NOT
// ABOUT HEADING ITSELF. renderer/VehicleRenderer.js's own buildBicycle()
// places the front wheel/handlebar at LOCAL +X (see that file's own
// header) — but heading 0 means "facing world +Z" (the same convention
// core/AvatarMovementSimulation.js's own rotationY already uses, and
// renderer/AvatarVisual.js's own `_applyFacing()` applies with NO offset,
// because an avatar's own body is modeled facing local +Z). Three.js's
// own right-handed Y-axis rotation maps local +X to world
// (cos(rotation.y), 0, -sin(rotation.y)) — setting `rotation.y =
// headingRadians - HALF_TURN_RADIANS` (a quarter turn, i.e. -90°) is the
// one constant correction that makes THIS model's own local +X forward
// track world (sin(heading), 0, cos(heading)) exactly, for every
// heading. A future, differently-modeled vehicle type would supply its
// own offset here; this constant is deliberately local to this file, not
// exported or treated as a general fact about headings.
const BICYCLE_MODEL_FORWARD_OFFSET_RADIANS = -Math.PI / 2;

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

    // 0.9.123 — see this file's own header, "the -90 offset is a fact
    // about this particular procedural model, not about heading itself."
    setHeading(headingDegrees) {
        this.root.rotation.y = headingDegrees * (Math.PI / 180) + BICYCLE_MODEL_FORWARD_OFFSET_RADIANS;
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
