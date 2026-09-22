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
// 0.9.668 — MOTORCYCLE NOW HAS A BUILDER TOO. core/VehiclePlacement.js's
// own 0.9.668 update means a motorcycle can now actually exist in the
// World, so a `null` visual for it stopped being honest the moment it
// became reachable. buildMotorcycle() is the same "procedural placeholder,
// low-poly primitives" posture as buildBicycle() — bigger wheels, a
// single solid body volume standing in for a fuel tank/engine block
// rather than open frame tubes, and a distinct color — legible as "a
// motorcycle, not a bicycle" at a glance, never a loaded mesh/texture.
//
// 0.9.669 — CAR NOW HAS A BUILDER TOO. core/VehiclePlacement.js's own
// 0.9.669 update means a car can now actually exist in the World, closing
// the same gap for CAR that 0.9.668 already closed for MOTORCYCLE.
// buildCar() keeps the identical "procedural placeholder, low-poly
// primitives" posture — the one genuine geometric difference from
// buildBicycle()/buildMotorcycle() is FOUR wheels (front and rear axle)
// instead of two, since a car is not a single-track vehicle, plus a wide
// boxy body volume and a smaller cabin box on top, standing in for a
// chassis and passenger compartment, and its own distinct color — legible
// as "a car, not a bicycle or a motorcycle" at a glance, never a loaded
// mesh/texture. build() previously returned `null` for DRONE — see this
// file's own git history for why — until the spawn/mount plan
// (core/VehiclePlacement.js's own DRONE share) needed a real visual for
// it to become reachable at all, closing the same gap 0.9.668/0.9.669
// already closed for MOTORCYCLE/CAR. buildDrone() keeps the identical
// "procedural placeholder, low-poly primitives" posture: a small body
// box on short legs (so it reads as sitting on the ground while
// GROUNDED — see core/AvatarDroneVerticalState.js), two crossed arms,
// and four flat cylinder rotors, its own distinct color — legible as "a
// drone, not a bicycle/motorcycle/car" at a glance, never a loaded
// mesh/texture. Any VehicleType this renderer still has no builder for
// (none, currently — every VehicleType.NONE-excluded value now has one)
// still falls through to `null` rather than a fallback shape; a caller
// (renderer/VehicleFieldRenderer.js) treats `null` as "nothing to show
// for this vehicle yet," exactly the same graceful-degradation posture
// renderer/AvatarRenderer.js's own `buildUnknownAccessory()` takes for
// an accessory id it doesn't recognize.
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

// Motorcycle geometry — see this file's own 0.9.668 header. Bigger
// wheels than a bicycle's, and a solid body volume rather than open
// frame tubes, so the two read as visually distinct vehicles at a glance.
const MOTORCYCLE_WHEEL_RADIUS = 0.38;
const MOTORCYCLE_WHEEL_TUBE_RADIUS = 0.07;
const MOTORCYCLE_WHEEL_OFFSET_X = 0.55;
const MOTORCYCLE_WHEEL_Y = MOTORCYCLE_WHEEL_RADIUS;

const MOTORCYCLE_BODY_COLOR = new THREE.Color(0.12, 0.16, 0.42); // muted blue — distinct from the bicycle's red frame
const MOTORCYCLE_SEAT_COLOR = new THREE.Color(0.08, 0.08, 0.08);

function buildMotorcycleWheel() {
    const wheel = new THREE.Mesh(
        new THREE.TorusGeometry(MOTORCYCLE_WHEEL_RADIUS, MOTORCYCLE_WHEEL_TUBE_RADIUS, WHEEL_RADIAL_SEGMENTS, WHEEL_TUBULAR_SEGMENTS),
        new THREE.MeshStandardMaterial({ color: WHEEL_COLOR })
    );
    wheel.rotation.y = Math.PI / 2;
    return wheel;
}

function buildMotorcycle() {
    const group = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: MOTORCYCLE_BODY_COLOR });

    const rearWheel = buildMotorcycleWheel();
    rearWheel.position.set(-MOTORCYCLE_WHEEL_OFFSET_X, MOTORCYCLE_WHEEL_Y, 0);
    group.add(rearWheel);

    const frontWheel = buildMotorcycleWheel();
    frontWheel.position.set(MOTORCYCLE_WHEEL_OFFSET_X, MOTORCYCLE_WHEEL_Y, 0);
    group.add(frontWheel);

    // Body: one wide, low box spanning between the wheels, standing in
    // for a fuel tank + engine block.
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.24, 0.3), bodyMaterial);
    body.position.set(-0.05, MOTORCYCLE_WHEEL_Y + 0.3, 0);
    group.add(body);

    const seat = new THREE.Mesh(
        new THREE.BoxGeometry(0.36, 0.1, 0.26),
        new THREE.MeshStandardMaterial({ color: MOTORCYCLE_SEAT_COLOR })
    );
    seat.position.set(-0.32, MOTORCYCLE_WHEEL_Y + 0.46, 0);
    group.add(seat);

    // Front fork: connects the handlebar/body down to the front wheel
    // hub, so the front wheel doesn't read as floating and disconnected.
    const fork = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.05), bodyMaterial);
    fork.position.set(MOTORCYCLE_WHEEL_OFFSET_X - 0.05, MOTORCYCLE_WHEEL_Y + 0.2, 0);
    fork.rotation.z = 0.2;
    group.add(fork);

    const handlebar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.5), bodyMaterial);
    handlebar.position.set(MOTORCYCLE_WHEEL_OFFSET_X - 0.1, MOTORCYCLE_WHEEL_Y + 0.58, 0);
    group.add(handlebar);

    return group;
}

// Car geometry — see this file's own 0.9.669 header. Four wheels (front
// and rear axle, left and right) rather than two, since a car is not a
// single-track vehicle, plus a wide body box and a smaller cabin box on
// top, so it reads as visually distinct from both the bicycle and the
// motorcycle at a glance.
const CAR_WHEEL_RADIUS = 0.34;
const CAR_WHEEL_TUBE_RADIUS = 0.09;
const CAR_WHEEL_OFFSET_X = 0.75; // front/rear axle distance from center
const CAR_WHEEL_OFFSET_Z = 0.5; // left/right wheel distance from center
const CAR_WHEEL_Y = CAR_WHEEL_RADIUS;

const CAR_BODY_COLOR = new THREE.Color(0.14, 0.42, 0.16); // muted green — distinct from the bicycle's red and the motorcycle's blue
const CAR_CABIN_COLOR = new THREE.Color(0.08, 0.08, 0.1);

function buildCarWheel() {
    const wheel = new THREE.Mesh(
        new THREE.TorusGeometry(CAR_WHEEL_RADIUS, CAR_WHEEL_TUBE_RADIUS, WHEEL_RADIAL_SEGMENTS, WHEEL_TUBULAR_SEGMENTS),
        new THREE.MeshStandardMaterial({ color: WHEEL_COLOR })
    );
    wheel.rotation.y = Math.PI / 2;
    return wheel;
}

function buildCar() {
    const group = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: CAR_BODY_COLOR });

    for (const signX of [-1, 1]) {
        for (const signZ of [-1, 1]) {
            const wheel = buildCarWheel();
            wheel.position.set(signX * CAR_WHEEL_OFFSET_X, CAR_WHEEL_Y, signZ * CAR_WHEEL_OFFSET_Z);
            group.add(wheel);
        }
    }

    // Body: one wide, low box spanning all four wheels, standing in for
    // the chassis.
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.42, 0.95), bodyMaterial);
    body.position.set(0, CAR_WHEEL_Y + 0.36, 0);
    group.add(body);

    // Cabin: a smaller box sitting on top of the body, standing in for
    // the passenger compartment/windows.
    const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(0.95, 0.32, 0.85),
        new THREE.MeshStandardMaterial({ color: CAR_CABIN_COLOR })
    );
    cabin.position.set(-0.1, CAR_WHEEL_Y + 0.72, 0);
    group.add(cabin);

    return group;
}

// Drone geometry — see this file's own header above. A body box on four
// short legs (ground contact while GROUNDED), two crossed arms forming a
// "+" layout, and a flat cylinder rotor at each of the four arm ends.
const DRONE_BODY_SIZE = { x: 0.5, y: 0.22, z: 0.5 };
const DRONE_LEG_HEIGHT = 0.18; // how far the body sits above the ground plane
const DRONE_ARM_LENGTH = 0.9; // tip-to-tip, along one crossed arm
const DRONE_ARM_THICKNESS = 0.06;
const DRONE_ROTOR_RADIUS = 0.22;
const DRONE_ROTOR_HEIGHT = 0.03;

const DRONE_BODY_COLOR = new THREE.Color(0.2, 0.22, 0.26); // dark slate — distinct from the bicycle's red, the motorcycle's blue, and the car's green
const DRONE_ARM_COLOR = new THREE.Color(0.12, 0.12, 0.14);
const DRONE_ROTOR_COLOR = new THREE.Color(0.05, 0.05, 0.05);

function buildDrone() {
    const group = new THREE.Group();
    const bodyY = DRONE_LEG_HEIGHT + DRONE_BODY_SIZE.y / 2;

    const body = new THREE.Mesh(
        new THREE.BoxGeometry(DRONE_BODY_SIZE.x, DRONE_BODY_SIZE.y, DRONE_BODY_SIZE.z),
        new THREE.MeshStandardMaterial({ color: DRONE_BODY_COLOR })
    );
    body.position.set(0, bodyY, 0);
    group.add(body);

    const armMaterial = new THREE.MeshStandardMaterial({ color: DRONE_ARM_COLOR });
    const armAlongX = new THREE.Mesh(new THREE.BoxGeometry(DRONE_ARM_LENGTH, DRONE_ARM_THICKNESS, DRONE_ARM_THICKNESS), armMaterial);
    armAlongX.position.set(0, bodyY, 0);
    group.add(armAlongX);
    const armAlongZ = new THREE.Mesh(new THREE.BoxGeometry(DRONE_ARM_THICKNESS, DRONE_ARM_THICKNESS, DRONE_ARM_LENGTH), armMaterial);
    armAlongZ.position.set(0, bodyY, 0);
    group.add(armAlongZ);

    const rotorMaterial = new THREE.MeshStandardMaterial({ color: DRONE_ROTOR_COLOR });
    const rotorY = bodyY + DRONE_ARM_THICKNESS / 2 + DRONE_ROTOR_HEIGHT / 2;
    const rotorOffsets = [
        [DRONE_ARM_LENGTH / 2, 0], [-DRONE_ARM_LENGTH / 2, 0],
        [0, DRONE_ARM_LENGTH / 2], [0, -DRONE_ARM_LENGTH / 2]
    ];
    for (const [x, z] of rotorOffsets) {
        const rotor = new THREE.Mesh(
            new THREE.CylinderGeometry(DRONE_ROTOR_RADIUS, DRONE_ROTOR_RADIUS, DRONE_ROTOR_HEIGHT, 10),
            rotorMaterial
        );
        rotor.position.set(x, rotorY, z);
        group.add(rotor);
    }

    const legMaterial = new THREE.MeshStandardMaterial({ color: DRONE_ARM_COLOR });
    for (const signX of [-1, 1]) {
        for (const signZ of [-1, 1]) {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, DRONE_LEG_HEIGHT, 6), legMaterial);
            leg.position.set(signX * DRONE_BODY_SIZE.x * 0.35, DRONE_LEG_HEIGHT / 2, signZ * DRONE_BODY_SIZE.z * 0.35);
            group.add(leg);
        }
    }

    return group;
}

// A closed lookup, mirroring renderer/AvatarRenderer.js's own
// ACCESSORY_BUILDERS shape: one builder per KNOWN, supported vehicle
// type. core/VehicleType.js's own NONE is the only value with no
// builder here — an unmounted avatar has no vehicle to render at all.
const VEHICLE_BUILDERS = {
    [VehicleType.BICYCLE]: buildBicycle,
    [VehicleType.MOTORCYCLE]: buildMotorcycle,
    [VehicleType.CAR]: buildCar,
    [VehicleType.DRONE]: buildDrone
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
