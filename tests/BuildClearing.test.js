import { BUILD_CLEARING, isTreeDisplaced } from '../core/nature/TreeDisplacement.js';
import { allTreeForms, treeShapeOf } from '../core/nature/TreeForm.js';
import { treeCollisionGeometryInRegion } from '../core/nature/TreeCollisionGeometry.js';
import { ENTRANCE_STAND_DISTANCES } from '../core/world/BuildEntrance.js';
import { DEFAULT_WORLD_SEED } from '../core/nature/TerrainHeightField.js';
import { arrivalMethods, ARRIVAL_CAMERA_BACK } from '../application/worldNavigation/arrivalMethods.js';
import { AvatarMovementConstraint } from '../application/avatar/AvatarMovementConstraint.js';
import { TreeDisplacement, TREE_OBSTACLE_QUERY_RADIUS } from '../application/world/TreeDisplacement.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { STARTER_STRUCTURE_ID } from '../application/home/FeaturedBuilds.js';
import { VillageLibrary } from '../core/library/VillageLibrary.js';
import { World } from '../core/document/World.js';
import { Building } from '../core/building/Building.js';
import { assert } from './support/Assert.js';

// Every build stands in a clearing (core/nature/TreeDisplacement.js; docs/Pillars.md,
// "The World is a diorama, not a simulation"): no tree grows within
// BUILD_CLEARING of its bricks, so "Walk inside it" sees the door with no
// trunk or crown between the camera and it, wherever the build stands.

const registry = new CreateBrickRegistryUseCase().execute();

// How far a tree's crown can reach sideways from its trunk, worked out from
// the trees' own shapes: the widest leaf or branch of any form, at the
// widest a tree is drawn (core/nature/TreeForm.js#treeShapeOf(), the largest
// scale NaturalFeatureField gives), plus the most a tall one leans.
function widestCrownReach() {
    let reach = 0;
    let height = 0;
    for (const form of allTreeForms()) {
        height = Math.max(height, form.height);
        for (const leaf of form.leaves) reach = Math.max(reach, Math.hypot(leaf.x, leaf.z) + (leaf.size || 0) / 2);
        for (const branch of form.branches) {
            for (const point of branch.points || []) reach = Math.max(reach, Math.hypot(point.x ?? point[0] ?? 0, point.z ?? point[2] ?? 0));
        }
    }
    let width = 0;
    let tall = 0;
    let lean = 0;
    for (let i = 0; i < 4000; i += 1) {
        const shape = treeShapeOf({ x: i * 3.7, z: i * 1.3, scale: 1.3 });
        width = Math.max(width, shape.widthScale);
        tall = Math.max(tall, shape.heightScale);
        lean = Math.max(lean, Math.hypot(shape.leanX, shape.leanZ));
    }
    return reach * width + Math.sin(lean) * height * tall;
}

const CROWN_REACH = widestCrownReach();

// Wide enough, by the trees' and the camera's own numbers.
{
    const furthestCamera = Math.max(...ENTRANCE_STAND_DISTANCES) + ARRIVAL_CAMERA_BACK;
    assert(CROWN_REACH > 3 && CROWN_REACH < BUILD_CLEARING, `a crown reaches about ${CROWN_REACH.toFixed(1)} from its trunk`);
    assert(BUILD_CLEARING >= furthestCamera + CROWN_REACH,
        `the clearing (${BUILD_CLEARING}) is wider than the arrival camera's distance from the door (${furthestCamera}) and a crown's reach (${CROWN_REACH.toFixed(2)})`);
    assert(TREE_OBSTACLE_QUERY_RADIUS > BUILD_CLEARING, 'and a tree is asked about every brick that could clear it');
    console.log(`✓ the clearing, ${BUILD_CLEARING} units, keeps every crown off the arrival camera's view (${furthestCamera} + ${CROWN_REACH.toFixed(2)})`);
}

// Which trees give way: any whose trunk comes within the clearing.
{
    const box = { min: { x: 0, z: 0 }, max: { x: 6, z: 6 } };
    const at = (x, z) => ({ center: { x, z }, radius: 0.3 });
    assert(isTreeDisplaced(at(6 + BUILD_CLEARING, 3), [box], BUILD_CLEARING), 'a trunk just inside the clearing gives way');
    assert(!isTreeDisplaced(at(6 + BUILD_CLEARING + 0.31, 3), [box], BUILD_CLEARING), 'one just outside it stands');
    assert(isTreeDisplaced(at(-BUILD_CLEARING + 1, -BUILD_CLEARING + 1), [box], BUILD_CLEARING) === Math.hypot(BUILD_CLEARING - 1, BUILD_CLEARING - 1) < BUILD_CLEARING + 0.3,
        'round a corner it is the distance that counts');
    assert(!isTreeDisplaced(at(6 + 2, 3), [box]) && isTreeDisplaced(at(6 + 2, 3), [box], 3), 'with no clearing given, only a trunk overlapping a brick');
    assert(!isTreeDisplaced(at(10, 3), [box], -5), 'a clearing below nothing is none');
    console.log('✓ a tree gives way when its trunk comes within the clearing of a brick');
}

// Wherever the House stands, arriving at its door: no standing tree's crown
// reaches between the camera and the door, and none stands in the clearing.
{
    const house = VillageLibrary.structures.find((structure) => structure.id === STARTER_STRUCTURE_ID).bricks;
    let cleared = 0;
    let plots = 0;
    const blocked = [];
    for (let x = 0; x < 2560; x += 160) {
        for (let z = 0; z < 2560; z += 160) {
            const plot = { x, y: 0, z };
            const world = new World();
            const building = new Building({ creator: 'clearing' });
            for (const brick of house) building.addBrick(brick);
            world.addBuilding(building);
            const loadedDocuments = new Map([['doc', { world }]]);
            const getWorldPosition = () => plot;
            const obstacles = new AvatarMovementConstraint({ loadedDocuments, getWorldPosition, brickRegistry: registry, queryRadius: TREE_OBSTACLE_QUERY_RADIUS, maxStepHeight: 0 });
            const displacement = new TreeDisplacement({ obstaclesNear: (position) => obstacles.obstaclesNear(position, { avatarRadius: 0 }) });
            const unclearedDisplacement = new TreeDisplacement({ obstaclesNear: (position) => obstacles.obstaclesNear(position, { avatarRadius: 0 }), clearing: 0 });
            let camera = null;
            const host = {
                ...arrivalMethods, _registry: registry, _loadedDocuments: loadedDocuments, _getWorldPosition: getWorldPosition,
                _avatarPresenceSession: null, _standingTrees: (circles) => displacement.standing(circles), getWorldSeed: () => DEFAULT_WORLD_SEED,
                focusDocument() {}, _beginCameraFocus(focus) { camera = focus; }, updateSpatialView() {}, _arrival: null
            };
            host.arriveAtEntrance('doc');
            if (!camera) continue;
            plots += 1;
            const around = treeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, x - 40, z - 40, x + 40, z + 40);
            const standing = displacement.standing(around);
            cleared += unclearedDisplacement.standing(around).length - standing.length;
            for (const tree of standing) {
                const reach = distanceToSegment(tree.center, camera.position, camera.target);
                if (reach <= CROWN_REACH) blocked.push(`(${x}, ${z}): a tree ${reach.toFixed(1)} from the view`);
            }
        }
    }
    assert(plots > 200, `the House arrived at on ${plots} plots`);
    assert(cleared > 100, `where trees stood near it, they gave way to the clearing (${cleared})`);
    assert(blocked.length === 0, `no crown between the arrival camera and the door; ${blocked.slice(0, 5).join('; ')}`);
    console.log(`✓ arriving at the House on ${plots} plots, the camera sees the door with no tree in between (${cleared} cleared)`);
}

function distanceToSegment(point, a, b) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared > 0 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSquared)) : 0;
    return Math.hypot(point.x - (a.x + t * dx), point.z - (a.z + t * dz));
}

console.log('✅ All build clearing tests passed.');
