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
// 2026-10 — the tone pass (docs/Pillars.md): the three motorised looks
// gave way to the village's own. MOTORCYCLE is drawn as a penny-farthing,
// CAR as a hay wagon and DRONE as a hot-air balloon. Only the look changed:
// the ids (sent to peers and kept in inventories) and how each one moves
// are as before.
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
    // A torus is built in its own XY plane, axle along Z: with Y up that is
    // already an upright wheel rolling along X, the way every model here
    // faces, so it needs no rotation. (A quarter turn around Y once stood
    // every wheel sideways to the direction of travel.)
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
// Spokes for a wheel of `radius` in its own plane (local X/Y, the axle
// being local Z, as for every torus wheel here): `pairs` thin boxes through
// the hub. Boxes, never tori, so a spoke is never counted as a wheel.
function buildSpokes(radius, pairs, material) {
    const spokes = new THREE.Group();
    for (let i = 0; i < pairs; i++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(radius * 2, 0.025, 0.025), material);
        spoke.rotation.z = (i * Math.PI) / pairs;
        spokes.add(spoke);
    }
    return spokes;
}

// A thin rod from `from` to `to` (both {x, y, z}, local), for frames and ropes.
function buildRod(from, to, radius, material) {
    const start = new THREE.Vector3(from.x, from.y, from.z);
    const end = new THREE.Vector3(to.x, to.y, to.z);
    const length = start.distanceTo(end);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 6), material);
    rod.position.copy(start).add(end).multiplyScalar(0.5);
    rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize());
    return rod;
}

// MOTORCYCLE is drawn as a penny-farthing (docs/Pillars.md, "the look"):
// the village's quick two-wheeler, a big front wheel and a small one
// behind, clearly not the bicycle. Same id and handling as before.
const PENNY_FRONT_WHEEL_RADIUS = 0.62;
const PENNY_REAR_WHEEL_RADIUS = 0.2;
const PENNY_FRONT_WHEEL_X = 0.18;
const PENNY_REAR_WHEEL_X = -0.72;

const PENNY_FRAME_COLOR = new THREE.Color(0.16, 0.3, 0.22); // bottle green
const PENNY_BRASS_COLOR = new THREE.Color(0.72, 0.56, 0.24);
const PENNY_SADDLE_COLOR = new THREE.Color(0.3, 0.18, 0.1);
const PENNY_SPOKE_COLOR = new THREE.Color(0.68, 0.68, 0.64);

function buildPennyFarthing() {
    const group = new THREE.Group();
    const frameMaterial = new THREE.MeshStandardMaterial({ color: PENNY_FRAME_COLOR });
    const brassMaterial = new THREE.MeshStandardMaterial({ color: PENNY_BRASS_COLOR });
    const spokeMaterial = new THREE.MeshStandardMaterial({ color: PENNY_SPOKE_COLOR });

    const front = new THREE.Mesh(
        new THREE.TorusGeometry(PENNY_FRONT_WHEEL_RADIUS, 0.04, WHEEL_RADIAL_SEGMENTS, 24),
        new THREE.MeshStandardMaterial({ color: WHEEL_COLOR })
    );
    front.position.set(PENNY_FRONT_WHEEL_X, PENNY_FRONT_WHEEL_RADIUS, 0);
    group.add(front);
    const frontSpokes = buildSpokes(PENNY_FRONT_WHEEL_RADIUS, 6, spokeMaterial);
    frontSpokes.position.copy(front.position);
    group.add(frontSpokes);

    const rear = new THREE.Mesh(
        new THREE.TorusGeometry(PENNY_REAR_WHEEL_RADIUS, 0.035, WHEEL_RADIAL_SEGMENTS, WHEEL_TUBULAR_SEGMENTS),
        new THREE.MeshStandardMaterial({ color: WHEEL_COLOR })
    );
    rear.position.set(PENNY_REAR_WHEEL_X, PENNY_REAR_WHEEL_RADIUS, 0);
    group.add(rear);
    const rearSpokes = buildSpokes(PENNY_REAR_WHEEL_RADIUS, 3, spokeMaterial);
    rearSpokes.position.copy(rear.position);
    group.add(rearSpokes);

    // The backbone, curving from the small wheel up over the big one.
    const top = { x: PENNY_FRONT_WHEEL_X - 0.08, y: PENNY_FRONT_WHEEL_RADIUS * 2 + 0.06, z: 0 };
    const knee = { x: -0.4, y: 0.95, z: 0 };
    group.add(buildRod({ x: PENNY_REAR_WHEEL_X, y: PENNY_REAR_WHEEL_RADIUS, z: 0 }, knee, 0.03, frameMaterial));
    group.add(buildRod(knee, top, 0.03, frameMaterial));
    // The fork, from the hub up to the handlebar.
    group.add(buildRod({ x: PENNY_FRONT_WHEEL_X, y: PENNY_FRONT_WHEEL_RADIUS, z: 0.06 }, { x: top.x + 0.06, y: top.y + 0.08, z: 0.06 }, 0.022, frameMaterial));
    group.add(buildRod({ x: PENNY_FRONT_WHEEL_X, y: PENNY_FRONT_WHEEL_RADIUS, z: -0.06 }, { x: top.x + 0.06, y: top.y + 0.08, z: -0.06 }, 0.022, frameMaterial));

    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.16), new THREE.MeshStandardMaterial({ color: PENNY_SADDLE_COLOR }));
    saddle.position.set(top.x - 0.12, top.y + 0.04, 0);
    group.add(saddle);

    const handlebar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.5), brassMaterial);
    handlebar.position.set(top.x + 0.08, top.y + 0.1, 0);
    group.add(handlebar);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 8), brassMaterial);
    hub.rotation.x = Math.PI / 2;
    hub.position.copy(front.position);
    group.add(hub);

    return group;
}

// CAR is drawn as a hay wagon: four spoked wooden wheels, a plank bed with
// low side boards, a load of hay and a draw pole at the front. Same id and
// handling as before.
const WAGON_WHEEL_RADIUS = 0.42;
const WAGON_WHEEL_TUBE_RADIUS = 0.06;
const WAGON_WHEEL_OFFSET_X = 0.72; // front/rear axle distance from center
const WAGON_WHEEL_OFFSET_Z = 0.62; // left/right wheel distance from center
const WAGON_WHEEL_Y = WAGON_WHEEL_RADIUS;
const WAGON_BED_Y = 0.66;

const WAGON_WHEEL_COLOR = new THREE.Color(0.34, 0.22, 0.12); // dark oak
const WAGON_WOOD_COLOR = new THREE.Color(0.58, 0.4, 0.23);
const WAGON_HAY_COLOR = new THREE.Color(0.86, 0.74, 0.4);
const WAGON_HAY_SHADE_COLOR = new THREE.Color(0.76, 0.64, 0.32);

function buildHayWagon() {
    const group = new THREE.Group();
    const woodMaterial = new THREE.MeshStandardMaterial({ color: WAGON_WOOD_COLOR });
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: WAGON_WHEEL_COLOR });

    for (const signX of [-1, 1]) {
        for (const signZ of [-1, 1]) {
            const wheel = new THREE.Mesh(
                new THREE.TorusGeometry(WAGON_WHEEL_RADIUS, WAGON_WHEEL_TUBE_RADIUS, WHEEL_RADIAL_SEGMENTS, WHEEL_TUBULAR_SEGMENTS),
                wheelMaterial
            );
            wheel.position.set(signX * WAGON_WHEEL_OFFSET_X, WAGON_WHEEL_Y, signZ * WAGON_WHEEL_OFFSET_Z);
            group.add(wheel);
            const spokes = buildSpokes(WAGON_WHEEL_RADIUS, 3, wheelMaterial);
            spokes.position.copy(wheel.position);
            group.add(spokes);
        }
    }

    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.1, 1.1), woodMaterial);
    bed.position.set(0, WAGON_BED_Y, 0);
    group.add(bed);
    for (const signZ of [-1, 1]) {
        const side = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.22, 0.06), woodMaterial);
        side.position.set(0, WAGON_BED_Y + 0.16, signZ * 0.52);
        group.add(side);
    }
    for (const signX of [-1, 1]) {
        const end = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 1.1), woodMaterial);
        end.position.set(signX * 0.95, WAGON_BED_Y + 0.16, 0);
        group.add(end);
    }

    // The load: two uneven bales' worth of hay heaped on the bed.
    const hay = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.34, 0.9), new THREE.MeshStandardMaterial({ color: WAGON_HAY_COLOR }));
    hay.position.set(-0.18, WAGON_BED_Y + 0.22, 0);
    group.add(hay);
    const heap = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.22, 0.7), new THREE.MeshStandardMaterial({ color: WAGON_HAY_SHADE_COLOR }));
    heap.position.set(-0.32, WAGON_BED_Y + 0.48, 0.04);
    heap.rotation.y = 0.12;
    group.add(heap);

    // The draw pole, reaching forward from the front axle.
    group.add(buildRod({ x: WAGON_WHEEL_OFFSET_X, y: WAGON_WHEEL_Y + 0.05, z: 0 }, { x: WAGON_WHEEL_OFFSET_X + 0.8, y: WAGON_WHEEL_Y - 0.05, z: 0 }, 0.035, woodMaterial));

    return group;
}

// DRONE is drawn as a hot-air balloon: a wicker basket the rider stands in,
// ropes up to a burner and a striped envelope above the rider's head. It
// hovers and climbs as the drone always has (core/AvatarDroneVerticalState.js).
const BALLOON_BASKET_SIZE = { x: 0.9, y: 0.72, z: 0.9 };
const BALLOON_BURNER_Y = 2.3;
const BALLOON_ENVELOPE_RADIUS = 1.15;
const BALLOON_ENVELOPE_Y = 3.55;

const BALLOON_WICKER_COLOR = new THREE.Color(0.62, 0.45, 0.25);
const BALLOON_RIM_COLOR = new THREE.Color(0.42, 0.28, 0.15);
const BALLOON_ROPE_COLOR = new THREE.Color(0.78, 0.72, 0.58);
const BALLOON_ENVELOPE_COLOR = new THREE.Color(0.72, 0.3, 0.24); // brick red
const BALLOON_STRIPE_COLOR = new THREE.Color(0.93, 0.87, 0.72); // cream
const BALLOON_BURNER_COLOR = new THREE.Color(0.25, 0.25, 0.27);

function buildHotAirBalloon() {
    const group = new THREE.Group();

    const basket = new THREE.Mesh(
        new THREE.BoxGeometry(BALLOON_BASKET_SIZE.x, BALLOON_BASKET_SIZE.y, BALLOON_BASKET_SIZE.z),
        new THREE.MeshStandardMaterial({ color: BALLOON_WICKER_COLOR })
    );
    basket.position.set(0, BALLOON_BASKET_SIZE.y / 2, 0);
    group.add(basket);
    const rim = new THREE.Mesh(
        new THREE.BoxGeometry(BALLOON_BASKET_SIZE.x + 0.08, 0.08, BALLOON_BASKET_SIZE.z + 0.08),
        new THREE.MeshStandardMaterial({ color: BALLOON_RIM_COLOR })
    );
    rim.position.set(0, BALLOON_BASKET_SIZE.y, 0);
    group.add(rim);

    const ropeMaterial = new THREE.MeshStandardMaterial({ color: BALLOON_ROPE_COLOR });
    const corner = BALLOON_BASKET_SIZE.x / 2 - 0.04;
    for (const signX of [-1, 1]) {
        for (const signZ of [-1, 1]) {
            group.add(buildRod(
                { x: signX * corner, y: BALLOON_BASKET_SIZE.y, z: signZ * corner },
                { x: signX * 0.5, y: BALLOON_ENVELOPE_Y - BALLOON_ENVELOPE_RADIUS * 0.9, z: signZ * 0.5 },
                0.015,
                ropeMaterial
            ));
        }
    }

    const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.22, 10), new THREE.MeshStandardMaterial({ color: BALLOON_BURNER_COLOR }));
    burner.position.set(0, BALLOON_BURNER_Y, 0);
    group.add(burner);

    // The envelope: a tall sphere over a tapering skirt, with a cream band.
    const envelope = new THREE.Mesh(
        new THREE.SphereGeometry(BALLOON_ENVELOPE_RADIUS, 14, 10),
        new THREE.MeshStandardMaterial({ color: BALLOON_ENVELOPE_COLOR })
    );
    envelope.scale.set(1, 1.15, 1);
    envelope.position.set(0, BALLOON_ENVELOPE_Y, 0);
    group.add(envelope);
    const band = new THREE.Mesh(
        new THREE.CylinderGeometry(BALLOON_ENVELOPE_RADIUS * 1.05, BALLOON_ENVELOPE_RADIUS * 1.05, 0.34, 14, 1, true),
        new THREE.MeshStandardMaterial({ color: BALLOON_STRIPE_COLOR, side: THREE.DoubleSide })
    );
    band.position.set(0, BALLOON_ENVELOPE_Y, 0);
    group.add(band);
    const skirt = new THREE.Mesh(
        new THREE.CylinderGeometry(BALLOON_ENVELOPE_RADIUS * 0.62, 0.3, 0.6, 14, 1, true),
        new THREE.MeshStandardMaterial({ color: BALLOON_ENVELOPE_COLOR, side: THREE.DoubleSide })
    );
    skirt.position.set(0, BALLOON_ENVELOPE_Y - BALLOON_ENVELOPE_RADIUS * 1.05, 0);
    group.add(skirt);

    return group;
}

const VEHICLE_BUILDERS = {
    [VehicleType.BICYCLE]: buildBicycle,
    [VehicleType.MOTORCYCLE]: buildPennyFarthing,
    [VehicleType.CAR]: buildHayWagon,
    [VehicleType.DRONE]: buildHotAirBalloon
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
