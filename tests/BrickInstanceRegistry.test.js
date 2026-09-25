import * as THREE from 'three';
import { BrickInstanceRegistry, CHUNK_SIZE } from '../renderer/BrickInstanceRegistry.js';
import { WorldRenderer } from '../renderer/WorldRenderer.js';
import { PickingService } from '../renderer/PickingService.js';
import { SelectionRenderer } from '../renderer/SelectionRenderer.js';
import { SpatialSelectionRenderer } from '../renderer/SpatialSelectionRenderer.js';
import { RemoteSpatialPresenceRenderer } from '../renderer/RemoteSpatialPresenceRenderer.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { EventBus } from '../core/events/EventBus.js';
import { DomainEvent } from '../core/events/Event.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { assert } from './support/Assert.js';

// Bricks are drawn as instances of one InstancedMesh per definition and
// CHUNK_SIZE cube of space (renderer/BrickInstanceRegistry.js), not one
// mesh each. These check the batching itself, that every instance keeps
// its own transform, color and highlight through adds, moves and
// removals, and that picking, marquee selection, highlighting and
// presence outlines still resolve to the right brick.

function fakeScene() {
    const objects = new Set();
    return { objects, add: (object) => objects.add(object), remove: (object) => objects.delete(object) };
}

const cube = (x, y, z, extra = {}) => ({ definitionId: 'core:cube', x, y, z, rotationY: 0, color: 0x336699, ...extra });

// The instance's matrix, color and highlight as stored in its chunk.
function instanceState(registry, brickId) {
    const entry = registry._entries.get(brickId);
    const { mesh } = entry.chunk;
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(entry.index, matrix);
    const position = new THREE.Vector3().setFromMatrixPosition(matrix);
    const color = new THREE.Color();
    mesh.getColorAt(entry.index, color);
    const emissive = new THREE.Color().fromArray(mesh.geometry.getAttribute('instanceEmissive').array, entry.index * 3);
    return { position, color: color.getHex(), emissive: emissive.getHex(), mesh };
}

// Bricks of one definition in one chunk share one InstancedMesh; other
// definitions and other chunks get their own.
{
    const scene = fakeScene();
    const registry = new BrickInstanceRegistry(scene);
    for (let x = 0; x < 10; x++) {
        for (let z = 0; z < 10; z++) {
            for (let y = 0; y < 10; y++) {
                registry.add(`b-${x}-${y}-${z}`, 'doc', 'building', cube(x, y + 0.5, z));
            }
        }
    }
    assert(registry.size === 1000 && registry.chunkCount === 1 && scene.objects.size === 1,
        '1000 cubes in one chunk are one InstancedMesh in the scene');
    const [mesh] = scene.objects;
    assert(mesh.isInstancedMesh && mesh.count === 1000, 'the mesh draws all 1000 instances');
    assert(mesh.instanceMatrix.count >= 1000, 'the chunk grew past its initial capacity');
    const state = instanceState(registry, 'b-3-4-5');
    assert(state.position.x === 3 && state.position.y === 4.5 && state.position.z === 5 && state.color === 0x336699,
        'every instance keeps its transform and color through the chunk growing');

    registry.add('far', 'doc', 'building', cube(CHUNK_SIZE * 3 + 1, 0.5, 0));
    registry.add('plate', 'doc', 'building', { ...cube(1, 0.5, 1), definitionId: 'core:plate_2x4' });
    assert(registry.chunkCount === 3 && scene.objects.size === 3, 'another region of space, or another definition, is another chunk');
    console.log('✓ bricks are batched per definition and region of space');
}

// Removing a brick moves the chunk's last instance into its slot; every
// brick keeps its own transform, color and highlight.
{
    const scene = fakeScene();
    const registry = new BrickInstanceRegistry(scene);
    registry.add('a', 'doc', 'b', cube(0, 0.5, 0, { color: 0xff0000 }));
    registry.add('b', 'doc', 'b', cube(1, 0.5, 0, { color: 0x00ff00 }));
    registry.add('c', 'doc', 'b', cube(2, 0.5, 0, { color: 0x0000ff }));
    registry.setHighlight('c', 0x4488ff);
    registry.remove('a');
    const c = instanceState(registry, 'c');
    assert(c.position.x === 2 && c.color === 0x0000ff && c.emissive === 0x4488ff && registry.getHighlight('c') === 0x4488ff,
        'the moved instance keeps its position, color and highlight');
    assert(instanceState(registry, 'b').position.x === 1 && c.mesh.count === 2, 'the others are untouched and the count drops');
    assert(!registry.has('a') && registry.getPosition('a') === null, 'the removed brick is gone');
    registry.remove('b');
    registry.remove('c');
    assert(registry.chunkCount === 0 && scene.objects.size === 0, 'an empty chunk leaves the scene');
    registry.remove('missing');
    console.log('✓ removals keep every other instance intact');
}

// update() moves, rotates and recolors in place, moves a brick to another
// chunk when it crosses a boundary, and keeps its highlight.
{
    const scene = fakeScene();
    const registry = new BrickInstanceRegistry(scene);
    registry.add('a', 'doc', 'b', cube(1, 0.5, 1));
    registry.setHighlight('a', 0xffaa00);
    registry.update('a', cube(2, 0.5, 1, { rotationY: Math.PI / 2, color: 0x123456 }));
    let a = instanceState(registry, 'a');
    assert(a.position.x === 2 && a.color === 0x123456 && registry.getRotationY('a') === Math.PI / 2, 'moved, rotated and recolored in place');
    registry.update('a', cube(CHUNK_SIZE * 2 + 1, 0.5, 1));
    a = instanceState(registry, 'a');
    assert(registry.chunkCount === 1 && a.position.x === CHUNK_SIZE * 2 + 1, 'crossing a chunk boundary moves it to the other chunk');
    assert(a.emissive === 0xffaa00 && registry.getHighlight('a') === 0xffaa00, '...still highlighted');
    registry.add('a', 'doc2', 'b2', cube(0, 0.5, 0));
    assert(registry.size === 1 && registry.getDocumentId('a') === 'doc2' && registry.chunkCount === 1,
        'adding an id already present replaces it, leaving no orphan');
    const bounds = registry.getBounds('a');
    assert(bounds.min.x === -0.5 && bounds.max.x === 0.5 && bounds.min.y === 0 && bounds.max.y === 1, 'getBounds() is the brick\'s world box');
    console.log('✓ updates move bricks between chunks and keep their highlight');
}

// WorldRenderer draws a world's bricks through the registry, with the
// document's layout offset, and follows brick events.
{
    const scene = fakeScene();
    const registry = new CreateBrickRegistryUseCase().execute();
    const worldRenderer = new WorldRenderer(scene, registry);
    const world = new World();
    const building = new Building();
    world.addBuilding(building);
    for (let x = 0; x < 50; x++) {
        for (let z = 0; z < 50; z++) {
            building.addBrick(new Brick({ id: `w-${x}-${z}`, definitionId: 'core:cube', position: new Position(x, 0.5, z) }));
        }
    }
    worldRenderer.addWorld(world, 'doc-1', { x: 100, y: 0, z: 200 });
    const instances = worldRenderer.brickInstances;
    assert(instances.size === 2500, 'every brick is drawn');
    assert(scene.objects.size === instances.chunkCount && scene.objects.size <= 16,
        `2,500 bricks cost ${scene.objects.size} draw calls, not 2,500`);
    const p = instances.getPosition('w-3-4');
    assert(p.x === 103 && p.y === 0.5 && p.z === 204 && instances.getDocumentId('w-3-4') === 'doc-1' && instances.getBuildingId('w-3-4') === building.id,
        'positions include the document\'s layout offset; ids resolve back');
    worldRenderer.removeWorld(world, 'doc-1');
    assert(instances.size === 0 && scene.objects.size === 0, 'removeWorld() removes them all');

    const eventBus = new EventBus();
    const liveRenderer = new WorldRenderer(scene, registry);
    liveRenderer.subscribe(eventBus);
    const brick = new Brick({ id: 'live', definitionId: 'core:cube', position: new Position(1, 0.5, 1) });
    eventBus.publish(DomainEvent.BRICK_ADDED, { buildingId: 'bld', brick });
    brick.position = new Position(5, 0.5, 1);
    brick.rotation = 90;
    brick.color = 0xabcdef;
    eventBus.publish(DomainEvent.BRICK_UPDATED, { buildingId: 'bld', brick });
    const live = liveRenderer.brickInstances;
    assert(live.getPosition('live').x === 5 && Math.abs(live.getRotationY('live') - Math.PI / 2) < 1e-12 && live.getColor('live') === 0xabcdef,
        'BRICK_UPDATED moves, rotates and recolors the instance');
    brick.color = null;
    eventBus.publish(DomainEvent.BRICK_UPDATED, { buildingId: 'bld', brick });
    assert(live.getColor('live') === registry.get('core:cube').color, 'clearing the color falls back to the definition\'s');
    eventBus.publish(DomainEvent.BRICK_REMOVED, { brick });
    assert(!live.has('live') && scene.objects.size === 0, 'BRICK_REMOVED removes it');
    let thrown = null;
    try {
        eventBus.publish(DomainEvent.BRICK_ADDED, { buildingId: 'bld', brick: new Brick({ definitionId: 'core:nope', position: new Position() }) });
    } catch (error) { thrown = error; }
    assert(thrown && /Unknown brick definition/.test(thrown.message), 'an unknown definition still fails loudly');
    liveRenderer.unsubscribe();
    console.log('✓ WorldRenderer draws bricks as instances and follows brick events');
}

// Picking resolves a ray hit on an instance to its brick, with the hit
// face's normal including the instance's rotation; marquee selection
// uses brick positions.
{
    const scene = new THREE.Scene();
    const registry = new BrickInstanceRegistry(scene);
    // A rotated brick: a ray from +x hits its local +z face, whose world
    // normal is +x only once the instance's rotation is applied.
    registry.add('rotated', 'doc', 'bld', cube(0, 0.5, 0, { rotationY: Math.PI / 2 }));
    registry.add('behind', 'doc', 'bld', cube(-3, 0.5, 0));
    scene.updateMatrixWorld();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(10, 0.5, 0);
    camera.lookAt(0, 0.5, 0);
    camera.updateMatrixWorld();
    const domElement = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) };
    const picking = new PickingService(camera, domElement, registry);
    const hit = picking.pickRich(50, 50);
    assert(hit && hit.brickId === 'rotated' && hit.documentId === 'doc' && hit.buildingId === 'bld', 'the nearest instance is picked');
    assert(hit.normal.x === 1 && hit.normal.y === 0 && hit.normal.z === 0, 'the face normal includes the instance\'s rotation');
    assert(Math.abs(hit.point.x - 0.5) < 1e-9, 'the hit point is on the brick\'s surface');
    assert(picking.pick(0, 0) === null, 'empty space picks nothing');

    const inRect = picking.pickInRectangle(0, 0, 100, 100).map((h) => h.brickId).sort();
    assert(inRect.join() === 'behind,rotated', 'a marquee over the view contains both bricks');
    assert(picking.pickInRectangle(0, 0, 10, 10).length === 0, 'a marquee in a corner contains neither');
    console.log('✓ picking and marquee selection resolve instances to bricks');
}

// Selection highlights are instance highlights, and presence outlines
// use the brick's bounds.
{
    const registry = new BrickInstanceRegistry(fakeScene());
    registry.add('one', 'doc', 'bld', cube(0, 0.5, 0));
    registry.add('two', 'doc', 'bld', cube(1, 0.5, 0));
    const editorBus = new EventBus();
    const selectionRenderer = new SelectionRenderer(registry);
    selectionRenderer.subscribe(editorBus);
    editorBus.publish('SelectionChanged', { selection: { isEmpty: false, isStructurePlacementSelection: false, brickIds: ['one', 'gone'] } });
    assert(registry.getHighlight('one') !== 0 && registry.getHighlight('two') === 0, 'the Editor highlights the selected brick only');
    selectionRenderer.clear();
    assert(registry.getHighlight('one') === 0, 'clear() removes it');

    const spatial = new SpatialSelectionRenderer(registry);
    spatial.selectMany(['one', 'two'], 'two');
    spatial.hover('one');
    const [selectedHovered, primary] = [registry.getHighlight('one'), registry.getHighlight('two')];
    assert(selectedHovered !== 0 && primary !== 0 && selectedHovered !== primary, 'World View distinguishes selected+hovered from primary');
    spatial.clear();
    assert(registry.getHighlight('one') === 0 && registry.getHighlight('two') === 0, 'clear() removes both');

    const presence = new RemoteSpatialPresenceRenderer(registry);
    const entry = { group: new THREE.Group(), outline: null };
    presence._applySelectionOutline(entry, { isEmpty: false, kind: 'brick', brickId: 'two' }, 0xff00ff);
    assert(entry.outline && entry.outline.box.min.x === 0.5 && entry.outline.box.max.x === 1.5, 'a remote participant\'s brick selection is outlined at its bounds');
    presence._applySelectionOutline(entry, { isEmpty: false, kind: 'brick', brickId: 'unknown' }, 0xff00ff);
    assert(entry.outline === null, 'an unknown brick gets no outline');
    console.log('✓ selection highlights and presence outlines work on instances');
}
