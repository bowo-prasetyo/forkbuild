import * as THREE from 'three';
import { VehicleType } from '../core/VehicleType.js';

// 0.9.115 — Vehicle Rendering.
//
// The renderer-side "dumb executor" for a VehicleType, the exact role
// renderer/AvatarRenderer.js already plays for an AvatarTemplate +
// appearance: it knows how to turn a closed vocabulary value
// (core/VehicleType.js) into actual Three.js geometry, and nothing else.
// It has no opinion on WHERE a vehicle is (that's
// renderer/VehicleVisual.js's job, reading a VehicleInstance's own
// `position`), WHICH vehicles currently exist (that's
// core/VehiclePlacement.js/core/VehicleInstance.js's job), or whether one
// should be visible right now (that's renderer/VehicleFieldRenderer.js's
// job). See docs/Roadmap.md, 0.9.115.
//
// DELIBERATELY A PROCEDURAL PLACEHOLDER, NOT A REAL ASSET — matching this
// milestone's own brief. Two torus wheels, three simple frame members, a
// seat post, and a handlebar: legible as "a bicycle" at a glance, built
// from the same low-poly primitives renderer/NaturalFeatureTileMesh.js's
// own trees and renderer/AvatarRenderer.js's own avatar bodies already
// use, never a loaded mesh/texture of any kind. Which concrete shape a
// real bicycle asset should eventually use is explicitly NOT decided
// here — see this milestone's own roadmap entry for why that decision
// stays downstream.
//
// ONLY VehicleType.BICYCLE HAS A BUILDER. build() returns `null` for
// every other VehicleType (MOTORCYCLE, CAR, DRONE) — this renderer has no
// meaningful representation for any of them yet, and deliberately does
// NOT fall back to the bicycle shape for an unrecognized/unsupported
// type: silently turning a DRONE into a bicycle would be a worse lie
// than rendering nothing at all. A caller (renderer/VehicleFieldRenderer.js)
// treats `null` as "nothing to show for this vehicle yet," exactly the
// same graceful-degradation posture renderer/AvatarRenderer.js's own
// `buildUnknownAccessory()` takes for an accessory id it doesn't
// recognize — except here there is no generic fallback marker at all,
// because the milestone brief is explicit: "Don't silently turn DRONE
// into a bicycle."
//
// NO POSITION, NO ANIMATION, NO STATE OF ANY KIND. Every mesh this class
// builds is centered on its own local origin, at the group's own local
// (0, 0, 0) — placing the result in the world is renderer/VehicleVisual.js's
// job alone, exactly the same "build() never touches position"
// discipline renderer/AvatarRenderer.js's own header already establishes
// for `build(template, appearance)`. This class holds no instance
// bookkeeping (no Map, no cache) and constructs a brand new Object3D
// graph on every call — cheap enough for a placeholder this small, and
// it never needs to be told when a vehicle "changes" because a
// VehicleInstance's own `type` never changes for the life of a vehicle
// (see core/VehicleInstance.js's own header, "identity never changes").
const WHEEL_RADIUS = 0.33;
const WHEEL_TUBE_RADIUS = 0.045;
const WHEEL_RADIAL_SEGMENTS = 8; // low-poly on purpose
const WHEEL_TUBULAR_SEGMENTS = 16;
const WHEEL_OFFSET_X = 0.42;
const WHEEL_Y = WHEEL_RADIUS; // wheel center sits exactly one radius above the ground plane

const FRAME_COLOR = new THREE.Color(0.72, 0.22, 0.16); // a muted, easy-to-spot red — distinct from tree/avatar palettes
const WHEEL_COLOR = new THREE.Color(0.1, 0.1, 0.1);
const SEAT_COLOR = new THREE.Color(0.22, 0.16, 0.12);

function buildWheel() {
    const wheel = new THREE.Mesh(
        new THREE.TorusGeometry(WHEEL_RADIUS, WHEEL_TUBE_RADIUS, WHEEL_RADIAL_SEGMENTS, WHEEL_TUBULAR_SEGMENTS),
        new THREE.MeshStandardMaterial({ color: WHEEL_COLOR })
    );
    // A torus is built flat in its own XY plane by default; standing it
    // upright so it reads as a wheel facing along Z means rotating it a
    // quarter turn around Y.
    wheel.rotation.y = Math.PI / 2;
    return wheel;
}

function buildBicycle() {
    const group = new THREE.Group();
    const frameMaterial = new THREE.MeshStandardMaterial({ color: FRAME_COLOR });

    const rearWheel = buildWheel();
    rearWheel.position.set(-WHEEL_OFFSET_X, WHEEL_Y, 0);
    group.add(rearWheel);

    const frontWheel = buildWheel();
    frontWheel.position.set(WHEEL_OFFSET_X, WHEEL_Y, 0);
    group.add(frontWheel);

    // Top tube: rear wheel hub toward the seat post.
    const topTube = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.05, 0.05), frameMaterial);
    topTube.position.set(-0.08, WHEEL_Y + 0.34, 0);
    topTube.rotation.z = -0.12;
    group.add(topTube);

    // Down tube: front wheel hub down to the pedal crank.
    const downTube = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.05, 0.05), frameMaterial);
    downTube.position.set(0.08, WHEEL_Y + 0.16, 0);
    downTube.rotation.z = 0.62;
    group.add(downTube);

    // Seat tube: pedal crank up to the seat post.
    const seatTube = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.05), frameMaterial);
    seatTube.position.set(-0.28, WHEEL_Y + 0.24, 0);
    seatTube.rotation.z = 1.15;
    group.add(seatTube);

    const seatPost = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.28, 6),
        new THREE.MeshStandardMaterial({ color: SEAT_COLOR })
    );
    seatPost.position.set(-WHEEL_OFFSET_X + 0.1, WHEEL_Y + 0.5, 0);
    group.add(seatPost);

    const handlebar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.36), frameMaterial);
    handlebar.position.set(WHEEL_OFFSET_X - 0.06, WHEEL_Y + 0.52, 0);
    group.add(handlebar);

    return group;
}

// A closed lookup, mirroring renderer/AvatarRenderer.js's own
// ACCESSORY_BUILDERS shape: one builder per KNOWN, supported vehicle
// type. core/VehicleType.js's own vocabulary is larger than this map —
// that gap is deliberate, see this file's own header above.
const VEHICLE_BUILDERS = {
    [VehicleType.BICYCLE]: buildBicycle
};

export class VehicleRenderer {
    // Returns a fresh THREE.Group for a supported `type`, or `null` for
    // any VehicleType this renderer has no visual for yet. Never throws
    // on an unsupported-but-valid VehicleType — only a value
    // core/VehicleType.js itself wouldn't recognize is this class's
    // caller's problem, not this method's.
    build(type) {
        const builder = VEHICLE_BUILDERS[type];
        return builder ? builder() : null;
    }
}
