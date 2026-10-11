import * as THREE from 'three';
import {
    ARCH_OPENINGS, archOpening, archOpeningHeightAt, brickCollisionBoxes, isPassableDoor, localCollisionBoxes, passageFloorAt
} from '../core/BrickPassage.js';
import { DOOR_OPEN_ANGLE, DOOR_OPEN_RADIUS, doorSwingOffset, doorSwingTarget, stepDoorSwing } from '../core/DoorSwing.js';
import { AVATAR_COLLISION_HEIGHT, AVATAR_COLLISION_RADIUS, aabbsOverlap, avatarAabbAt, brickAabb } from '../core/AvatarCollision.js';
import { DEFAULT_MAX_STEP_HEIGHT } from '../core/BrickWalkability.js';
import { AvatarStepConstraint } from '../application/avatar/AvatarStepConstraint.js';
import { AvatarMovementConstraint } from '../application/avatar/AvatarMovementConstraint.js';
import { AvatarMovementController } from '../application/avatar/AvatarMovementController.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/avatar/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/avatar/AvatarPresenceSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { STARTER_STRUCTURE_ID } from '../application/home/FeaturedBuilds.js';
import { VillageLibrary } from '../core/library/VillageLibrary.js';
import { CollectionLibrary } from '../core/library/CollectionLibrary.js';
import { ShowcaseLibrary } from '../core/library/ShowcaseLibrary.js';
import { BrickInstanceRegistry } from '../renderer/BrickInstanceRegistry.js';
import { ThreeBrickFactory } from '../renderer/ThreeBrickFactory.js';
import { WorldRenderer } from '../renderer/WorldRenderer.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { StructurePlacement } from '../core/StructurePlacement.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Walking inside what you build: doors don't collide and swing open in World
// View, and an arch collides as the jambs and lintel it is drawn with, so an
// avatar can walk into the ready-made buildings (core/BrickPassage.js,
// core/DoorSwing.js; docs/reviews/CreativeDirection-2026-10-11.md, finding 1).

const brickRegistry = new CreateBrickRegistryUseCase().execute();
const definition = (id) => brickRegistry.get(id);
const near = (a, b, epsilon = 1e-9) => Math.abs(a - b) <= epsilon;

// A standing door collides as nothing; tilted onto its side it is a plank.
{
    for (const id of ['core:door', 'core:door_double']) {
        assert(isPassableDoor(definition(id)), `${id} is a door`);
        assert(localCollisionBoxes(id, definition(id)).length === 0, `${id} standing has no collision`);
        const tilted = brickCollisionBoxes({ x: 0, y: 0, z: 0 }, id, definition(id), 0, 90);
        assert(tilted.length === 1 && JSON.stringify(tilted[0]) === JSON.stringify(brickAabb({ x: 0, y: 0, z: 0 }, definition(id), 0, 90)),
            `${id} tilted collides as its one box`);
    }
    assert(!isPassableDoor(definition('core:shutter')) && !isPassableDoor(definition('core:cube')), 'only doors are doors');
    const cube = brickCollisionBoxes({ x: 1, y: 2, z: 3 }, 'core:cube', definition('core:cube'), 30);
    assert(cube.length === 1 && JSON.stringify(cube[0]) === JSON.stringify(brickAabb({ x: 1, y: 2, z: 3 }, definition('core:cube'), 30)),
        'every other brick collides exactly as before: its one box');
    console.log('✓ doors collide as nothing, other bricks as their one box');
}

// A standing doorway arch lets a walking avatar through its middle, with room
// to spare either side, and collides everywhere it is drawn solid.
{
    const id = 'core:arch';
    const arch = definition(id);
    const opening = archOpening(id);
    const boxes = localCollisionBoxes(id, arch);
    const bottom = -arch.height / 2;
    const whole = brickAabb({ x: 0, y: 0, z: 0 }, arch);
    assert(boxes.length > 2, 'jambs and a lintel');
    for (const box of boxes) {
        assert(box.min.x >= whole.min.x - 1e-9 && box.max.x <= whole.max.x + 1e-9 && box.min.y >= whole.min.y - 1e-9 && box.max.y <= whole.max.y + 1e-9,
            'every part lies within the arch');
    }
    for (const offset of [-0.15, -0.1, 0, 0.1, 0.15]) {
        const avatar = avatarAabbAt({ x: offset, y: bottom, z: 0 });
        assert(!boxes.some((box) => aabbsOverlap(avatar, box)), `an avatar ${offset} from the middle fits through the opening`);
    }
    assert(boxes.some((box) => aabbsOverlap(avatarAabbAt({ x: 0.5, y: bottom, z: 0 }), box)), 'an avatar half a unit off the middle bumps the side');
    // Points inside the drawn opening are in no box, and points in the drawn
    // masonry (the jambs, and over the curve) are in one. The lintel follows
    // the curve in steps that never cut into the masonry, so near the curve's
    // steep ends its underside is up to one step (0.2) lower than drawn.
    const inside = (x, y) => boxes.some((box) => x > box.min.x && x < box.max.x && y > box.min.y && y < box.max.y);
    for (let x = -opening.halfWidth + 0.01; x < opening.halfWidth; x += 0.05) {
        const top = archOpeningHeightAt(opening, x);
        assert(!inside(x, bottom + top - 0.2), `the opening is clear at x ${x.toFixed(2)}`);
        assert(inside(x, bottom + top + 0.02), `the masonry over the opening is solid at x ${x.toFixed(2)}`);
    }
    assert(inside(-0.9, 0) && inside(0.9, 0), 'the jambs are solid');
    assert(opening.sill === 0, 'the doorway arch has no sill to trip on');
    console.log('✓ the doorway arch collides as its jambs and lintel, with room to walk through');
}

// The small arch is a window: no avatar fits through it, whatever its collision.
{
    const id = 'core:arch_small';
    const boxes = localCollisionBoxes(id, definition(id));
    const bottom = -definition(id).height / 2;
    assert(boxes.some((box) => aabbsOverlap(avatarAabbAt({ x: 0, y: bottom, z: 0 }), box)), 'the small arch stops an avatar');
    assert(ARCH_OPENINGS[id].sill > 0, 'it keeps its sill');
    console.log('✓ the small arch is too low to walk through');
}

// An arch turned a quarter collides as its parts turned, exactly.
{
    const id = 'core:arch';
    const center = { x: 10, y: 1, z: -4 };
    const turned = brickCollisionBoxes(center, id, definition(id), 90);
    const local = localCollisionBoxes(id, definition(id));
    assert(turned.length === local.length, 'one box per part');
    for (let i = 0; i < local.length; i++) {
        // A quarter turn (rotationY = 90°) takes local x to world -z and local z to world x.
        assert(near(turned[i].min.z, center.z - local[i].max.x) && near(turned[i].max.z, center.z - local[i].min.x), 'x turns into -z');
        assert(near(turned[i].min.x, center.x + local[i].min.z) && near(turned[i].max.x, center.x + local[i].max.z), 'z turns into x');
        assert(near(turned[i].min.y, center.y + local[i].min.y), 'heights stay');
    }
    assert(brickCollisionBoxes(center, id, definition(id), 0, 90).length === 1, 'an arch tilted onto its side is one box');
    console.log('✓ a turned arch collides as its turned parts');
}

// What a passer-by stands on in a doorway: its floor, not its top.
{
    const door = definition('core:door');
    const center = { x: 0, y: 1.25, z: 0 };
    assert(passageFloorAt(center, 'core:door', door, 0, 0, 0.3, 0.02).height === 0.25, 'a door\'s floor is its bottom');
    assert(passageFloorAt(center, 'core:door', door, 0, 0, 0.3, 0.5) === null, 'beside it is not in the doorway');
    assert(passageFloorAt(center, 'core:door', door, 0, 90, 0.3, 0.02) === null, 'a tilted door is no doorway');
    const arch = definition('core:arch');
    assert(passageFloorAt(center, 'core:arch', arch, 0, 0, 0.2, 0) !== null, 'the arch\'s opening is a doorway');
    assert(passageFloorAt(center, 'core:arch', arch, 0, 0, 0.9, 0) === null, 'its jambs are not');
    assert(passageFloorAt(center, 'core:cube', definition('core:cube'), 0, 0, 0, 0) === null, 'a cube is no doorway');
    console.log('✓ a doorway\'s floor is what a passer-by stands on');
}

// The arch is drawn with the opening it collides with.
{
    const geometry = new ThreeBrickFactory().createGeometry('core:arch');
    geometry.computeBoundingBox();
    const size = new THREE.Vector3();
    geometry.boundingBox.getSize(size);
    assert(near(size.x, 2, 1e-6) && near(size.y, 2, 1e-6) && near(size.z, 0.5, 1e-6), 'it keeps its 2 × 2 × 0.5 size');
    // A ray along the arch's depth through the middle of the opening hits
    // nothing; one through a jamb hits it.
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const hits = (x, y) => new THREE.Raycaster(new THREE.Vector3(x, y, 5), new THREE.Vector3(0, 0, -1)).intersectObject(mesh).length > 0;
    assert(!hits(0, -0.9) && !hits(0, 0.7) && !hits(0.45, 0.7), 'the opening is open where an avatar walks');
    assert(hits(-0.9, 0) && hits(0, 0.97), 'the jambs and the lintel are drawn');
    console.log('✓ the arch is drawn with the opening it collides with');
}

// Doors swing away from whoever walks up, stay that way while they pass, and
// shut behind them; the hinge stays put.
{
    const door = { x: 0, y: 1, z: 0, rotationY: 0, width: 1, height: 2 };
    assert(doorSwingTarget(door, []) === 0, 'nobody near: shut');
    assert(doorSwingTarget(door, [{ x: 0, y: 0, z: DOOR_OPEN_RADIUS + 0.1 }]) === 0, 'too far: shut');
    assert(doorSwingTarget(door, [{ x: 0, y: 0, z: 1 }]) === DOOR_OPEN_ANGLE, 'someone on its +z side swings it toward -z');
    assert(doorSwingTarget(door, [{ x: 0, y: 0, z: -1 }]) === -DOOR_OPEN_ANGLE, 'and on its -z side toward +z');
    assert(doorSwingTarget(door, [{ x: 0, y: 6, z: 1 }]) === 0, 'someone on the floor above doesn\'t open it');
    const turned = { ...door, rotationY: Math.PI / 2 };
    assert(doorSwingTarget(turned, [{ x: 1, y: 0, z: 0 }]) === DOOR_OPEN_ANGLE, 'a turned door knows its sides');

    let angle = 0;
    for (let i = 0; i < 20; i++) angle = stepDoorSwing(angle, DOOR_OPEN_ANGLE, 1 / 60);
    assert(angle > 0 && angle === DOOR_OPEN_ANGLE, 'it opens in about a third of a second');
    assert(stepDoorSwing(angle, -DOOR_OPEN_ANGLE, 1 / 60) === DOOR_OPEN_ANGLE, 'walking through doesn\'t flap it back');
    assert(stepDoorSwing(angle, 0, 1) === 0, 'it shuts once nobody is near');
    assert(stepDoorSwing(0, -DOOR_OPEN_ANGLE, 1) === -DOOR_OPEN_ANGLE, 'a shut door opens whichever way is away');

    for (const rotationY of [0, Math.PI / 2, 1.1]) {
        for (const swing of [DOOR_OPEN_ANGLE, -DOOR_OPEN_ANGLE]) {
            // The hinge, the door's local (-width / 2, 0), in world space before
            // and after the swing.
            const hingeOf = (cx, cz, turn) => ({ x: cx + (-0.5) * Math.cos(turn), z: cz - (-0.5) * Math.sin(turn) });
            const offset = doorSwingOffset(1, rotationY, swing);
            const before = hingeOf(0, 0, rotationY);
            const after = hingeOf(offset.x, offset.z, rotationY + swing);
            assert(near(before.x, after.x) && near(before.z, after.z), 'the hinge stays where it was');
        }
    }
    console.log('✓ doors swing away from people, then shut, about their hinge');
}

// World View draws the swing, for a World's own doors and a placement's.
{
    const objects = new Set();
    const scene = { add: (object) => objects.add(object), remove: (object) => objects.delete(object) };
    const doorWorld = new World();
    const doorBuilding = new Building();
    doorWorld.addBuilding(doorBuilding);
    doorBuilding.addBrick(new Brick({ id: 'placed-door', definitionId: 'core:door', position: new Position(0, 1, 0) }));
    const resolver = { resolve: (documentId) => (documentId === 'door-doc' ? doorWorld : null) };
    const worldRenderer = new WorldRenderer(scene, brickRegistry, undefined, undefined, resolver);
    const world = new World();
    const building = new Building();
    world.addBuilding(building);
    building.addBrick(new Brick({ id: 'own-door', definitionId: 'core:door', position: new Position(0, 1, 0) }));
    building.addBrick(new Brick({ id: 'own-cube', definitionId: 'core:cube', position: new Position(3, 0.5, 0) }));
    world.addStructurePlacement(new StructurePlacement({ id: 'p1', documentId: 'door-doc', position: new Position(10, 0, 0) }));
    worldRenderer.addWorld(world, 'doc-1', { x: 0, y: 0, z: 0 });
    const instances = worldRenderer.brickInstances;
    const placedMesh = worldRenderer.placementMeshRegistry.getMeshes('p1')[0];
    const placedStart = placedMesh.position.clone();

    worldRenderer.animateDoors([{ x: 20, y: 0, z: 20 }], 1);
    assert(instances.getSwing('own-door') === 0 && placedMesh.position.equals(placedStart), 'with nobody near, doors stay shut');
    worldRenderer.animateDoors([{ x: 0, y: 0, z: 1 }, { x: 10, y: 0, z: -1 }], 1);
    assert(instances.getSwing('own-door') === DOOR_OPEN_ANGLE, 'a World\'s own door swings away from whoever walks up');
    assert(instances.getSwing('own-cube') === 0, 'a cube doesn\'t swing');
    assert(near(placedMesh.rotation.y, -DOOR_OPEN_ANGLE) && !placedMesh.position.equals(placedStart), 'so does a placement\'s door');
    const matrix = new THREE.Matrix4();
    const entry = instances._entries.get('own-door');
    entry.chunk.mesh.getMatrixAt(entry.index, matrix);
    const drawn = new THREE.Vector3().setFromMatrixPosition(matrix);
    const offset = doorSwingOffset(1, 0, DOOR_OPEN_ANGLE);
    assert(near(drawn.x, offset.x, 1e-6) && near(drawn.z, offset.z, 1e-6), 'the instance is drawn swung about its hinge');
    assert(instances.getPosition('own-door').x === 0, 'the brick itself hasn\'t moved');
    worldRenderer.animateDoors([], 1);
    assert(instances.getSwing('own-door') === 0 && near(placedMesh.rotation.y, 0) && placedMesh.position.distanceTo(placedStart) < 1e-9,
        'both shut again once nobody is near');
    console.log('✓ World View swings a World\'s doors and a placement\'s');
}

// Swinging survives an edit that redraws the brick.
{
    const registry = new BrickInstanceRegistry({ add() {}, remove() {} });
    registry.add('d', 'doc', 'b', { definitionId: 'core:door', x: 0, y: 1, z: 0, rotationY: 0, color: null });
    registry.setSwing('d', 0.5, 1);
    registry.update('d', { definitionId: 'core:door', x: 0, y: 1, z: 0, rotationY: 0, color: 0xff0000 });
    assert(registry.getSwing('d') === 0.5, 'a recolor keeps the swing');
    assert(registry.brickIdsOf('core:door').has('d'), 'doors are found by definition');
    registry.remove('d');
    assert(!registry.brickIdsOf('core:door').has('d'), 'and forgotten when removed');
    console.log('✓ a swing survives a redraw');
}

// End to end: with the real movement pipeline, an avatar walks straight
// through every ground-floor doorway in the ready-made builds, both ways.
{
    const templates = new AvatarTemplateRegistry();
    templates.register(CoreAvatarTemplateLibrary);
    const storage = new InMemoryStorageProvider();
    const identity = new LocalIdentityProvider(storage);
    identity.login('step-inside');
    const profile = new AvatarProfileUseCase(storage, identity, templates).getProfile();

    // Doors into solid towers, and the Stable's arches over stalls half a
    // step deep: there is nothing behind them to walk into.
    const facades = new Set([
        'village:silo|0,1,-1',
        'village:watchtower|0,1,-1',
        'collection:lighthouse|0,1,-1',
        'collection:keepers_lighthouse|0,1,-1',
        'showcase:castle|0,1.25,-0.05',
        'village:stable|-2,1,-1.25',
        'village:stable|0,1,-1.25',
        'village:stable|2,1,-1.25'
    ]);

    function walkThrough(structure, way) {
        const world = new World();
        const building = new Building({ creator: 'step-inside' });
        for (const brick of structure.bricks) building.addBrick(brick);
        world.addBuilding(building);
        const loadedDocuments = new Map([['doc', { world }]]);
        const getWorldPosition = () => ({ x: 0, y: 0, z: 0 });
        const turn = (way.rotation || 0) * (Math.PI / 180);
        const normal = { x: Math.sin(turn), z: Math.cos(turn) };
        const results = [];
        for (const side of [1, -1]) {
            const start = { x: way.position.x + normal.x * side * 2, z: way.position.z + normal.z * side * 2 };
            const movementConstraint = new AvatarMovementConstraint({ loadedDocuments, getWorldPosition, brickRegistry, maxStepHeight: DEFAULT_MAX_STEP_HEIGHT });
            const stepConstraint = new AvatarStepConstraint({ loadedDocuments, getWorldPosition, brickRegistry });
            const presence = new AvatarPresenceSession(profile);
            const heading = Math.atan2(-normal.x * side, -normal.z * side) * (180 / Math.PI);
            presence.update({ position: { ...start, y: stepConstraint.supportHeightAt(start.x, start.z, 0) }, rotation: { x: 0, y: heading, z: 0 } });
            const controller = new AvatarMovementController(presence, movementConstraint, null, stepConstraint);
            controller.keyDown('w');
            let through = false;
            for (let i = 0; i < 60 && !through; i++) {
                controller.tick(0.05);
                const { x, z } = presence.current.position;
                through = ((x - way.position.x) * normal.x + (z - way.position.z) * normal.z) * side < -0.6;
            }
            results.push(through);
        }
        return results;
    }

    let checked = 0;
    for (const library of [VillageLibrary, CollectionLibrary, ShowcaseLibrary]) {
        for (const structure of library.structures) {
            for (const way of structure.bricks) {
                const passable = isPassableDoor(definition(way.definitionId), way.tilt) || archOpening(way.definitionId, way.tilt);
                if (!passable || way.definitionId === 'core:arch_small') continue;
                const bottom = way.position.y - definition(way.definitionId).height / 2;
                if (bottom > DEFAULT_MAX_STEP_HEIGHT) continue; // a loft door, or an arch up on a roof
                const key = `${structure.id}|${way.position.x},${way.position.y},${way.position.z}`;
                if (facades.has(key)) continue;
                const [fromOneSide, fromTheOther] = walkThrough(structure, way);
                assert(fromOneSide && fromTheOther, `an avatar walks through ${way.definitionId} of ${key}, both ways`);
                checked++;
            }
        }
    }
    assert(checked >= 20, `every ground-floor doorway was walked through (${checked})`);
    assert(VillageLibrary.structures.some((structure) => structure.id === STARTER_STRUCTURE_ID), 'Home\'s starter house is among them');
    console.log(`✓ an avatar walks through all ${checked} ground-floor doorways in the ready-made builds, both ways`);
}

// The avatar's size is what the doorway arch was made for.
assert(AVATAR_COLLISION_RADIUS === 0.35 && AVATAR_COLLISION_HEIGHT === 1.8, 'the doorway arch\'s opening assumes a 0.7 × 1.8 avatar');
