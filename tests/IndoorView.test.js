import * as THREE from 'three';
import {
    CUT_ABOVE_FEET, HEAD_HEIGHT, MIN_CAMERA_BACK, ceilingOver, clearCameraPosition, computeIndoorFraming,
    connectedBoxes, indoorCutaway, segmentEntersBox
} from '../core/IndoorView.js';
import { CutawayClipping } from '../renderer/CutawayClipping.js';
import { brickAabb, resolveHorizontalMovement } from '../core/AvatarCollision.js';
import { findBuildEntrance } from '../core/BuildEntrance.js';
import { READY_MADE_RESIDENT_AUTHOR, isReadyMadeHome, readyMadeResidentHome } from '../core/ReadyMadeHome.js';
import { CoreLibrary } from '../core/library/CoreLibrary.js';
import { VillageLibrary } from '../core/library/VillageLibrary.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { ForkStructureUseCase } from '../application/editor/ForkStructureUseCase.js';
import { structureWorld } from '../application/home/FeaturedBuilds.js';
import { assert } from './support/Assert.js';

// A room worth entering (docs/reviews/CreativeDirection-2026-10-12.md,
// finding 3 and 4): under a roof the build above your head is cut away and
// the camera comes in with you; the starter house is a furnished room with
// space to walk round; and the ready-made homes come lived in.

const registry = new CreateBrickRegistryUseCase().execute();
const definitions = new Map(CoreLibrary.definitions.map((definition) => [definition.id, definition]));
const structure = (id) => VillageLibrary.structures.find((candidate) => candidate.id === id);
const boxesOf = (bricks, offset = { x: 0, z: 0 }) => bricks.map((brick) => brickAabb(
    { x: brick.position.x + offset.x, y: brick.position.y, z: brick.position.z + offset.z },
    definitions.get(brick.definitionId), brick.rotation, brick.tilt
));
const HOUSE = structure('village:house');
const houseBoxes = boxesOf(HOUSE.bricks);
const FLOOR = 0.25;

// Whether anything not cut away stands between the camera and what it looks at.
function seesTarget(framing, boxes, cutHeight) {
    return boxes.every((box) => {
        if (box.min.y >= cutHeight) return true;
        const clipped = box.max.y > cutHeight ? { min: box.min, max: { ...box.max, y: cutHeight } } : box;
        const inside = framing.target.x > clipped.min.x && framing.target.x < clipped.max.x
            && framing.target.y > clipped.min.y && framing.target.y < clipped.max.y
            && framing.target.z > clipped.min.z && framing.target.z < clipped.max.z;
        return inside || segmentEntersBox(framing.target, framing.position, clipped) === null;
    });
}

// The geometry.
{
    const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } };
    assert(Math.abs(segmentEntersBox({ x: -1, y: 0.5, z: 0.5 }, { x: 2, y: 0.5, z: 0.5 }, box) - 1 / 3) < 1e-9, 'a line through a box enters it a third of the way');
    assert(segmentEntersBox({ x: -1, y: 2, z: 0.5 }, { x: 2, y: 2, z: 0.5 }, box) === null, 'one above it misses');
    assert(segmentEntersBox({ x: 0.5, y: 0.5, z: 0.5 }, { x: 3, y: 0.5, z: 0.5 }, box) === 0, 'one starting inside enters at once');

    const wall = { min: { x: -2, y: 0, z: -0.1 }, max: { x: 2, y: 3, z: 0.1 } };
    const target = { x: 0, y: 1, z: 2 };
    const pulled = clearCameraPosition(target, { x: 0, y: 1, z: -4 }, [wall]);
    assert(pulled.z > 0.1 && pulled.z < 2, `the camera stops in front of a wall (${pulled.z.toFixed(2)})`);
    const over = clearCameraPosition(target, { x: 0, y: 4, z: -4 }, [wall], { cutHeight: 1.5 });
    assert(over.z === -4, 'a wall cut down below the line of sight is no obstacle');
    const close = clearCameraPosition(target, { x: 0, y: 1, z: 1.95 }, [{ min: { x: -2, y: 0, z: 1.97 }, max: { x: 2, y: 3, z: 1.99 } }]);
    assert(Math.hypot(close.x - target.x, close.y - target.y, close.z - target.z) <= MIN_CAMERA_BACK + 1e-9, 'never past the target');
    const floor = { min: { x: -5, y: 0, z: -5 }, max: { x: 5, y: 0.25, z: 5 } };
    assert(clearCameraPosition({ x: 0, y: 1, z: 0 }, { x: 0, y: 4, z: -4 }, [floor]).y === 4, 'the floor below is no obstacle');

    const neighbour = boxesOf(HOUSE.bricks, { x: 20, z: 0 });
    const ceiling = ceilingOver({ x: 0, y: FLOOR, z: 0 }, houseBoxes);
    const build = connectedBoxes(ceiling, [...houseBoxes, ...neighbour]);
    assert(build.length === houseBoxes.length - houseBoxes.filter((b) => !connectedBoxes(ceiling, houseBoxes).includes(b)).length,
        'the build is the house, not its neighbour twenty along');
    assert(!build.some((b) => b.min.x > 10), 'nothing of the neighbour');
    console.log('✓ a camera stops in front of walls, and a build is what touches its roof');
}

// Inside the starter house: what is cut away, and where the camera stands.
{
    assert(indoorCutaway({ x: 0, y: 0, z: -8 }, houseBoxes) === null, 'outside, nothing is cut away');
    const spots = [{ x: 0, z: -2 }, { x: -1.5, z: 0 }, { x: 1.5, z: 1.5 }, { x: -1.5, z: -2.2 }];
    for (const spot of spots) {
        const feet = { x: spot.x, y: FLOOR, z: spot.z };
        const cutaway = indoorCutaway(feet, houseBoxes);
        assert(cutaway, `inside at ${spot.x}, ${spot.z}`);
        assert(cutaway.minX <= -3 && cutaway.maxX >= 3 && cutaway.minZ <= -3 && cutaway.maxZ >= 3, 'the whole house is cut, not part of it');
        assert(cutaway.y > feet.y + HEAD_HEIGHT && cutaway.y <= feet.y + CUT_ABOVE_FEET, `the cut is just above the head (${cutaway.y})`);
        assert(cutaway.y <= cutaway.ceiling, 'and never above the ceiling');
        for (const heading of [0, 90, 180, 270]) {
            const framing = computeIndoorFraming(feet, heading, houseBoxes, cutaway);
            assert(framing.position.y > cutaway.y, 'the camera looks down into the room over the cut');
            assert(seesTarget(framing, houseBoxes, cutaway.y), `and sees the avatar (${spot.x}, ${spot.z}, facing ${heading})`);
        }
    }
    console.log('✓ inside the starter house, its top is cut away and the camera sees in');
}

// Every ready-made home can be entered, and once in, is seen from inside.
{
    for (const home of VillageLibrary.structures.filter(isReadyMadeHome)) {
        const entrance = findBuildEntrance(home.bricks, registry);
        assert(entrance && entrance.kind === 'door', `${home.id} has a door`);
        const boxes = boxesOf(home.bricks);
        const inside = { x: entrance.door.x + entrance.inward.x * 1, y: FLOOR, z: entrance.door.z + entrance.inward.z * 1 };
        assert(indoorCutaway(inside, boxes), `${home.id} is cut away once you're through its door`);
    }
    console.log('✓ every ready-made home is seen from inside');
}

// The clipping planes cut what the GPU will: above the cut, inside the footprint.
{
    const clipping = new CutawayClipping();
    const material = clipping.apply(new THREE.MeshStandardMaterial());
    assert(material.clippingPlanes === clipping.planes && material.clipIntersection === true, 'a material is cut by all five planes together');
    assert(!clipping.clips(new THREE.Vector3(0, 10, 0)), 'with no cutaway nothing is clipped');
    clipping.set({ minX: -3, maxX: 3, minZ: -3, maxZ: 3, y: 2.35 });
    assert(clipping.clips(new THREE.Vector3(0, 4, 0)), 'the roof is clipped');
    assert(!clipping.clips(new THREE.Vector3(0, 1, 0)), 'the room below is not');
    assert(!clipping.clips(new THREE.Vector3(10, 4, 0)) && !clipping.clips(new THREE.Vector3(0, 4, -10)), 'nor the neighbour\'s roof');
    clipping.set(null);
    assert(!clipping.clips(new THREE.Vector3(0, 4, 0)) && clipping.cutaway === null, 'and all of it back when you leave');
    console.log('✓ the cutaway clips only the build you stand in, above your head');
}

// The starter house is a furnished room with room to walk round.
{
    const ids = new Set(HOUSE.bricks.map((brick) => brick.definitionId));
    for (const id of ['core:table', 'core:bed', 'core:hearth', 'core:shelf', 'core:bench', 'core:barrel']) assert(ids.has(id), `the house has a ${id}`);
    const xs = houseBoxes.flatMap((box) => [box.min.x, box.max.x]);
    assert(Math.max(...xs) - Math.min(...xs) >= 6, 'six across');
    const entrance = findBuildEntrance(HOUSE.bricks, registry);
    const furniture = HOUSE.bricks
        .map((brick, index) => ({ brick, box: houseBoxes[index] }))
        .filter(({ brick }) => ['core:table', 'core:bed', 'core:hearth', 'core:shelf', 'core:bench', 'core:barrel'].includes(brick.definitionId));
    for (const { brick, box } of furniture) {
        assert(box.min.y >= FLOOR - 1e-9 && box.max.x <= 3.0 && box.min.x >= -3.0 && box.max.z <= 3.0 && box.min.z >= -3.0, `${brick.definitionId} stands on the floor, inside the walls`);
    }
    // Walk in through the door: past the doorway, round nothing.
    const obstacles = houseBoxes.filter((box, index) => !['core:door', 'core:plate_2x2', 'core:plate_1x1'].includes(HOUSE.bricks[index].definitionId));
    const walked = resolveHorizontalMovement({ position: { x: entrance.stand.x, y: FLOOR, z: entrance.stand.z }, dx: 0, dz: -entrance.stand.z - 1, obstacles });
    assert(walked.z > -2, `you walk well inside (${walked.z.toFixed(2)})`);
    console.log('✓ the starter house is six across, furnished, with room to walk in');
}

// The ready-made homes come lived in.
{
    const fork = new ForkStructureUseCase({ brickRegistry: registry }).execute(HOUSE);
    const residents = fork.world.getResidents();
    assert(residents.length === 1 && residents[0].authorIdentityId === READY_MADE_RESIDENT_AUTHOR, 'a copy of the house has its resident');
    const home = readyMadeResidentHome(HOUSE, registry);
    assert(residents[0].position.x === home.x && residents[0].position.z === home.z, 'living where the house says');
    const entrance = findBuildEntrance(HOUSE.bricks, registry);
    assert(Math.hypot(home.x - entrance.stand.x, home.z - entrance.stand.z) >= 2, 'beside the door, clear of where a visitor arrives');
    assert(home.z < -3.2, 'outside, in front of the house');
    assert(new ForkStructureUseCase({ brickRegistry: registry }).execute(structure('village:mill')).world.getResidents().length === 0, 'a mill is no home');
    assert(structureWorld(HOUSE, registry).getResidents().length === 1 && structureWorld(HOUSE).getResidents().length === 0, 'the plaza\'s ready-made house is lived in too');
    assert(JSON.parse(JSON.stringify(fork.world.toJSON())).residents.length === 1, 'and the resident is saved with the build');
    console.log('✓ a copy of a ready-made home starts with someone living there');
}
