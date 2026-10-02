// East is on your right when you face North: the compass, the world map and
// every spoken direction agree with what the 3D view shows. Each check
// starts from the screen: the camera framed behind the avatar
// (core/CameraPerspective.js) and projected through a real Three.js camera.
// A yaw grows from +Z toward +X, which is the screen's left, so treating a
// yaw as a bearing once put East on the left and drew the map mirrored.
import * as THREE from 'three';
import { computeCameraFraming, CameraPerspective } from '../core/CameraPerspective.js';
import { computeCompassHeading, compassLabelBetween, compassBearingFromYaw } from '../core/CompassHeading.js';
import { createMapViewport, projectPosition } from '../core/WorldMapProjection.js';
import { directionLabelBetween } from '../core/GeographicPlaceNavigation.js';
import { simulateAvatarMovement } from '../core/AvatarMovementSimulation.js';
import { AvatarMovementState } from '../core/AvatarMovementState.js';
import { assert } from './support/Assert.js';

const avatar = { x: 0, y: 0, z: 0 };

// Where `point` lands across the screen of the third-person camera behind an
// avatar facing `yaw`: negative is left, positive is right.
function screenX(yaw, point) {
    const framing = computeCameraFraming(CameraPerspective.THIRD_PERSON, avatar, yaw);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(framing.position.x, framing.position.y, framing.position.z);
    camera.lookAt(framing.target.x, framing.target.y, framing.target.z);
    camera.updateMatrixWorld();
    return new THREE.Vector3(point.x, framing.target.y, point.z).project(camera).x;
}

// Facing North, the point the compass names East is on the right of the
// screen and West on the left.
{
    const framing = computeCameraFraming(CameraPerspective.THIRD_PERSON, avatar, 0);
    assert(computeCompassHeading(framing.position, framing.target).label === 'N', 'sanity: yaw 0 faces North');
    const onTheRight = { x: -10, z: 0 };
    const onTheLeft = { x: 10, z: 0 };
    assert(screenX(0, onTheRight) > 0 && screenX(0, onTheLeft) < 0, 'sanity: -X is on the right of the screen, +X on the left');
    assert(compassLabelBetween(avatar, onTheRight) === 'E', 'facing North, what is on your right is East');
    assert(compassLabelBetween(avatar, onTheLeft) === 'W', 'facing North, what is on your left is West');
    assert(directionLabelBetween(avatar, onTheRight) === 'E', 'places and residents name it East too');
    console.log('✓ facing North, East is on the right');
}

// Turning right (D) turns the compass clockwise: the bearing grows, through
// N, NE, E, as on a real compass.
{
    let yaw = 0;
    const seen = [];
    for (let i = 0; i < 6; i++) {
        yaw = simulateAvatarMovement({
            position: avatar, rotationY: yaw,
            movementState: new AvatarMovementState({ turnAxis: 1 }),
            deltaSeconds: 0.1
        }).rotationY;
        const framing = computeCameraFraming(CameraPerspective.THIRD_PERSON, avatar, yaw);
        seen.push(computeCompassHeading(framing.position, framing.target));
    }
    for (let i = 1; i < seen.length; i++) {
        assert(seen[i].bearing > seen[i - 1].bearing, `turning right, the bearing grows (${seen[i - 1].bearing} -> ${seen[i].bearing})`);
    }
    assert(Math.abs(seen[5].bearing - 90) < 1e-6 && seen[5].label === 'E', 'a quarter turn right from North faces East, bearing 90');
    console.log('✓ turning right turns the compass clockwise');
}

// The bearing is what the needle and the number show; it is always in [0, 360).
{
    for (const yaw of [0, 1, 89.5, 90, 180, 270, 359.9, 360, -90, 725]) {
        const bearing = compassBearingFromYaw(yaw);
        assert(bearing >= 0 && bearing < 360, `bearing for yaw ${yaw} is in [0, 360), got ${bearing}`);
        assert(Math.abs(((bearing + yaw) % 360 + 360) % 360) < 1e-9, `bearing for yaw ${yaw} is 360 - yaw`);
    }
    console.log('✓ bearings are normalized');
}

// The map is the World seen from above: with North up, East (what is on
// your right facing North) is drawn on the right, never mirrored.
{
    const viewport = createMapViewport({ centerX: 0, centerZ: 0, span: 200, width: 600, height: 600 });
    const center = projectPosition(avatar, viewport);
    for (const [label, point] of [['E', { x: -50, z: 0 }], ['W', { x: 50, z: 0 }], ['N', { x: 0, z: 50 }], ['S', { x: 0, z: -50 }]]) {
        assert(compassLabelBetween(avatar, point) === label, `sanity: the point is ${label}`);
        const drawn = projectPosition(point, viewport);
        const side = { E: drawn.x > center.x, W: drawn.x < center.x, N: drawn.y < center.y, S: drawn.y > center.y }[label];
        assert(side, `${label} is drawn on the ${label} side of the map`);
    }
    for (const yaw of [0, 30, 135, 250]) {
        const right = { x: -Math.cos(yaw * Math.PI / 180) * 20, z: Math.sin(yaw * Math.PI / 180) * 20 };
        assert(screenX(yaw, right) > 0, `facing yaw ${yaw}: sanity, the point is on the right of the screen`);
        const ahead = { x: Math.sin(yaw * Math.PI / 180) * 20, z: Math.cos(yaw * Math.PI / 180) * 20 };
        const drawnRight = projectPosition(right, viewport);
        const drawnAhead = projectPosition(ahead, viewport);
        // On the map, `right` is clockwise of `ahead` around the avatar, as it is
        // on screen: the 2D cross product of (ahead, right) is positive in map
        // space (x right, y down).
        const cross = (drawnAhead.x - center.x) * (drawnRight.y - center.y) - (drawnAhead.y - center.y) * (drawnRight.x - center.x);
        assert(cross > 0, `facing yaw ${yaw}: what is on your right is clockwise of what is ahead on the map too`);
    }
    console.log('✓ the map is not mirrored');
}
