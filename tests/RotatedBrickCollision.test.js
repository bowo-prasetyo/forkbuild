import { brickAabb, footprintHalfExtents } from '../core/AvatarCollision.js';
import { resolveWalkableSurfaceAt, walkableSurfaceKindFor } from '../core/WalkableSurface.js';
import { AvatarMovementConstraint } from '../application/avatar/AvatarMovementConstraint.js';
import { AvatarStepConstraint } from '../application/avatar/AvatarStepConstraint.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { DEFAULT_MAX_STEP_HEIGHT } from '../core/BrickWalkability.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { StructurePlacement } from '../core/StructurePlacement.js';
import { assert } from './support/Assert.js';

// A brick collides and is walked on where it is drawn: its footprint turns
// with it. Before, every box ignored Brick.rotation, so a wall turned to
// run along Z blocked as a row of thin X-slabs an avatar could slip
// between, and a turned plate was walked on where it wasn't drawn.

const brickRegistry = new CreateBrickRegistryUseCase().execute();
const ORIGIN = () => ({ x: 0, y: 0, z: 0 });

function approx(actual, expected, message) {
    assert(Math.abs(actual - expected) < 1e-9, `${message} (got ${actual}, expected ${expected})`);
}

function worldWith(bricks) {
    const world = new World();
    const building = new Building({ creator: 'rotation-test' });
    for (const brick of bricks) building.addBrick(brick);
    world.addBuilding(building);
    return world;
}

function brick(definitionId, x, y, z, rotation = 0) {
    return new Brick({ definitionId, position: new Position(x, y, z), rotation });
}

// Walks from `from` toward `to` in small ticks through the real movement
// and step constraints, and returns where the avatar ends up.
function walk(loadedDocuments, from, to, structureResolver = null) {
    const options = { loadedDocuments, getWorldPosition: ORIGIN, brickRegistry, structureResolver };
    const movement = new AvatarMovementConstraint({ ...options, maxStepHeight: DEFAULT_MAX_STEP_HEIGHT });
    const step = new AvatarStepConstraint(options);
    let position = { ...from };
    for (let tick = 0; tick < 400; tick++) {
        const dx = to.x - position.x;
        const dz = to.z - position.z;
        const distance = Math.hypot(dx, dz);
        if (distance < 1e-6) break;
        const stride = Math.min(0.05, distance);
        const desired = { x: position.x + (dx / distance) * stride, y: position.y, z: position.z + (dz / distance) * stride };
        const moved = movement.apply(position, desired, { supportHeight: position.y });
        position = step.apply(position, moved.position, { grounded: true }).position;
    }
    return position;
}

// The box itself: a quarter turn swaps width and depth exactly, any whole
// number of turns (negative too) is the same as its remainder, and other
// angles enclose the turned footprint.
{
    const wall = brickRegistry.get('core:wall_1x3');
    const center = { x: 2, y: 1.5, z: -1 };
    for (const rotation of [90, 270, -90, 450]) {
        const box = brickAabb(center, wall, rotation);
        approx(box.max.x - box.min.x, wall.depth, `wall turned ${rotation}° is ${wall.depth} across X`);
        approx(box.max.z - box.min.z, wall.width, `wall turned ${rotation}° is ${wall.width} along Z`);
        approx(box.max.y - box.min.y, wall.height, `wall turned ${rotation}° keeps its height`);
    }
    for (const rotation of [0, 180, -180, 360]) {
        const box = brickAabb(center, wall, rotation);
        approx(box.max.x - box.min.x, wall.width, `wall turned ${rotation}° is ${wall.width} across X`);
        approx(box.max.z - box.min.z, wall.depth, `wall turned ${rotation}° is ${wall.depth} along Z`);
    }
    const unturned = brickAabb(center, wall);
    approx(unturned.max.x - unturned.min.x, wall.width, 'no rotation given is unturned, as before');

    const diagonal = footprintHalfExtents(2, 0, 45);
    approx(diagonal.halfX, Math.SQRT2 / 2, 'a 2-long footprint at 45° reaches √2/2 along X');
    approx(diagonal.halfZ, Math.SQRT2 / 2, 'and √2/2 along Z');
    console.log('✓ brickAabb turns the footprint with the brick');
}

// Walking on a flat top: a plate turned 90° is 4 along X and 2 along Z.
{
    const plate = brickRegistry.get('core:plate_2x4');
    const geometry = (rotationDegrees) => ({
        shapeKind: walkableSurfaceKindFor('core:plate_2x4'),
        center: { x: 0, y: plate.height / 2, z: 0 },
        width: plate.width,
        height: plate.height,
        depth: plate.depth,
        rotationDegrees
    });
    assert(resolveWalkableSurfaceAt(geometry(90), 1.8, 0) !== null, 'turned 90°, the plate reaches x = 1.8');
    assert(resolveWalkableSurfaceAt(geometry(90), 0, 1.8) === null, 'turned 90°, the plate no longer reaches z = 1.8');
    assert(resolveWalkableSurfaceAt(geometry(0), 0, 1.8) !== null, 'unturned, it reaches z = 1.8');
    assert(resolveWalkableSurfaceAt(geometry(0), 1.8, 0) === null, 'unturned, it does not reach x = 1.8');
    approx(resolveWalkableSurfaceAt(geometry(90), 1.8, 0).height, plate.height, 'the turned top is at the plate\'s height');

    // At 45° the footprint is the turned rectangle itself, not the box
    // around it: 1.9 out along the plate's long side is on it, 1.9 out
    // along its short side is off it, though both are inside that box.
    const r = 1.9 * Math.SQRT1_2;
    assert(resolveWalkableSurfaceAt(geometry(45), r, r) !== null, 'at 45°, 1.9 out along the long side is on the plate');
    assert(resolveWalkableSurfaceAt(geometry(45), r, -r) === null, 'at 45°, 1.9 out along the short side is off it');
    console.log('✓ a flat top is walked on where the turned brick is drawn');
}

// A wall running along Z, built from 1x3 segments turned 90°, blocks an
// avatar walking across it. Before, each segment blocked as a 1 x 0.25
// slab along X, leaving 0.75 gaps between them that a 0.7-wide avatar
// walked straight through.
{
    const bricks = [];
    for (const z of [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5]) {
        bricks.push(brick('core:wall_1x3', 0, 1.5, z, 90));
    }
    const loadedDocuments = new Map([['wall', { world: worldWith(bricks) }]]);
    for (const z of [-1, 0, 1]) {
        const end = walk(loadedDocuments, { x: -2, y: 0, z }, { x: 2, y: 0, z });
        assert(end.x < -0.1, `walking across the turned wall at z = ${z} stops at it (stopped at x = ${end.x.toFixed(3)})`);
        approx(end.x, -0.125 - 0.35 - 1e-4, `at z = ${z} the avatar rests against the wall's real face`);
    }
    // And it no longer blocks where it isn't: alongside the wall, 0.4 off
    // its face, there is room to walk its whole length.
    const alongside = walk(loadedDocuments, { x: -0.6, y: 0, z: -3.5 }, { x: -0.6, y: 0, z: 3.5 });
    approx(alongside.z, 3.5, 'walking alongside the turned wall is not blocked by it');
    console.log('✓ a turned wall blocks across its real face, and only there');
}

// A turned floor plate carries an avatar along its real length: walking
// onto it from a stair-height landing, the avatar stays up the whole way.
{
    const plate = brickRegistry.get('core:plate_2x4');
    const loadedDocuments = new Map([['floor', { world: worldWith([
        brick('core:plate_2x4', 0, 0.5 - plate.height / 2, 0, 90)
    ]) }]]);
    const end = walk(loadedDocuments, { x: -1.9, y: 0.5, z: 0 }, { x: 1.9, y: 0.5, z: 0 });
    approx(end.x, 1.9, 'the avatar walks the whole turned plate');
    approx(end.y, 0.5, 'and stays on its top, never falling through where it is drawn');
    console.log('✓ a turned floor plate is walked on along its real length');
}

// A placed Structure turned 90° turns its bricks' boxes with it: an
// unturned wall segment inside it now runs along Z and blocks there.
{
    const structureWorld = worldWith([brick('core:wall_1x3', 0, 1.5, 0)]);
    const hostWorld = new World();
    hostWorld.addStructurePlacement(new StructurePlacement({ documentId: 'segment', position: new Position(0, 0, 0), rotation: 90 }));
    const loadedDocuments = new Map([['host', { world: hostWorld }]]);
    const structureResolver = { resolve: (documentId) => (documentId === 'segment' ? structureWorld : null) };
    // At z = 0.6 the avatar (0.25..0.95) misses the unturned segment
    // (z ±0.125) but meets the turned one (z ±0.5).
    const blocked = walk(loadedDocuments, { x: -2, y: 0, z: 0.6 }, { x: 2, y: 0, z: 0.6 }, structureResolver);
    assert(blocked.x < -0.1, `a placement turned 90° blocks at its turned wall (stopped at x = ${blocked.x.toFixed(3)})`);
    const clear = walk(loadedDocuments, { x: -2, y: 0, z: 1.2 }, { x: 2, y: 0, z: 1.2 }, structureResolver);
    approx(clear.x, 2, 'past the turned wall\'s end, the way is clear');
    console.log('✓ a turned placement turns its bricks\' collision boxes too');
}
