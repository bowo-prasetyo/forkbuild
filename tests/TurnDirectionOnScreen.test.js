// Turning right goes to the right of the screen. Each turn is checked the
// way a player sees it: the camera framed behind the avatar
// (core/CameraPerspective.js), and the new facing projected through a real
// Three.js camera. rotationY grows from +Z toward +X, which is the screen's
// left from behind, so a sign mix-up here once made D turn left.
import * as THREE from 'three';
import { computeCameraFraming, CameraPerspective } from '../core/CameraPerspective.js';
import { simulateAvatarMovement } from '../core/AvatarMovementSimulation.js';
import { AvatarMovementState } from '../core/AvatarMovementState.js';
import { resolveVehicleMovementDirectionFromSteering } from '../core/VehicleSteeringSimulation.js';
import { VehicleSteeringIntent } from '../core/VehicleSteeringIntent.js';
import { resolveAvatarVehicleMovementCapability } from '../core/AvatarVehicleMovementCapability.js';
import { VehicleType } from '../core/VehicleType.js';
import { assert } from './support/Assert.js';

const HEADINGS = [0, 30, 90, 135, 180, 270, 350];

// Where a point straight ahead of `newHeading` lands across the screen of a
// camera framed for `cameraHeading`: negative is left, positive is right.
function screenX(perspective, cameraHeading, newHeading) {
    const avatar = { x: 0, y: 0, z: 0 };
    const framing = computeCameraFraming(perspective, avatar, cameraHeading);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(framing.position.x, framing.position.y, framing.position.z);
    camera.lookAt(framing.target.x, framing.target.y, framing.target.z);
    camera.updateMatrixWorld();
    const radians = newHeading * (Math.PI / 180);
    const ahead = new THREE.Vector3(Math.sin(radians) * 5, framing.target.y, Math.cos(radians) * 5);
    return ahead.project(camera).x;
}

function turnedHeading(heading, turnAxis, steeringRate) {
    return simulateAvatarMovement({
        position: { x: 0, y: 0, z: 0 },
        rotationY: heading,
        movementState: new AvatarMovementState({ forwardAxis: 1, turnAxis }),
        deltaSeconds: 0.1,
        steeringRate
    }).rotationY;
}

const PERSPECTIVES = [CameraPerspective.THIRD_PERSON, CameraPerspective.FIRST_PERSON];
const vehicleSteeringRate = resolveAvatarVehicleMovementCapability(VehicleType.CAR).steering.steeringRate;

// D / joystick right and A / joystick left, on foot (fixed turn rate) and
// riding (rate-limited steering).
for (const perspective of PERSPECTIVES) {
    for (const heading of HEADINGS) {
        for (const [label, rate] of [['on foot', undefined], ['riding', vehicleSteeringRate]]) {
            assert(screenX(perspective, heading, turnedHeading(heading, 1, rate)) > 0,
                `${perspective}, ${label}, facing ${heading}: turning right (D) goes to the right of the screen`);
            assert(screenX(perspective, heading, turnedHeading(heading, -1, rate)) < 0,
                `${perspective}, ${label}, facing ${heading}: turning left (A) goes to the left of the screen`);
        }
    }
}
console.log('✓ A/D turn the way they say, on foot and riding');

// The ← / → steering pulses (and the touch pad's ↶ / ↷, which send them).
for (const perspective of PERSPECTIVES) {
    for (const heading of HEADINGS) {
        const right = resolveVehicleMovementDirectionFromSteering({ previousHeading: heading, steeringIntent: VehicleSteeringIntent.right() });
        const left = resolveVehicleMovementDirectionFromSteering({ previousHeading: heading, steeringIntent: VehicleSteeringIntent.left() });
        assert(screenX(perspective, heading, right) > 0, `${perspective}, facing ${heading}: steering right (→) goes to the right of the screen`);
        assert(screenX(perspective, heading, left) < 0, `${perspective}, facing ${heading}: steering left (←) goes to the left of the screen`);
    }
}
console.log('✓ ←/→ steer the way they say');
