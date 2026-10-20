import * as THREE from 'three';
import { World } from '../core/document/World.js';
import { Building } from '../core/building/Building.js';
import { Brick } from '../core/building/Brick.js';
import { Position } from '../core/document/Position.js';
import { EventBus } from '../core/events/EventBus.js';
import { EditorEvent } from '../core/events/EditorEvent.js';
import { DEFAULT_WORLD_SEED, terrainHeightAt } from '../core/nature/TerrainHeightField.js';
import { editorFloorHeight } from '../renderer/EditorFloor.js';
import { PickingService } from '../renderer/PickingService.js';
import { PreviewRenderer } from '../renderer/PreviewRenderer.js';
import { StructurePreviewRenderer } from '../renderer/StructurePreviewRenderer.js';
import { CompositionPreviewRenderer } from '../renderer/CompositionPreviewRenderer.js';
import { PreviewState } from '../application/editor-state/PreviewState.js';
import { StructurePreviewState } from '../application/editor-state/StructurePreviewState.js';
import { CompositionPreviewState } from '../application/editor-state/CompositionPreviewState.js';
import { PlacementPositionService } from '../application/editor/PlacementPositionService.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { TransformMath } from '../application/editor/TransformMath.js';
import { assert } from './support/Assert.js';

// The Editor's floor (renderer/EditorFloor.js): its bricks stand on the
// terrain height under the build's origin, so the ground a pointer is over,
// and every ghost, is on that floor too. Before, the ground was picked at
// y = 0 while bricks were drawn on the floor, so in a new build a brick
// landed behind the point under the pointer and was drawn about 110 pixels
// above it, and a click on that brick's top missed it.

const WIDTH = 1032;
const HEIGHT = 703;
const FLOOR = terrainHeightAt(DEFAULT_WORLD_SEED, 0, 0);
const registry = new CreateBrickRegistryUseCase().execute();

function camera() {
    // Like the Editor's opening view: above and in front, looking down at the plot.
    const cam = new THREE.PerspectiveCamera(60, WIDTH / HEIGHT, 0.1, 2000);
    cam.position.set(12, 14 + FLOOR, 12);
    cam.lookAt(0, FLOOR, 0);
    cam.updateMatrixWorld();
    return cam;
}

const domElement = { getBoundingClientRect: () => ({ left: 0, top: 0, width: WIDTH, height: HEIGHT }) };
const noBricks = { pickableObjects: () => [] };
const terrainRenderer = { add() {}, remove() {}, terrainHeightAt: (x, z) => terrainHeightAt(DEFAULT_WORLD_SEED, x, z) };

function toScreen(cam, point) {
    const v = new THREE.Vector3(point.x, point.y, point.z).project(cam);
    return { x: (v.x + 1) / 2 * WIDTH, y: (1 - v.y) / 2 * HEIGHT };
}

// The floor is the terrain under the origin, wherever the pointer is.
{
    assert(FLOOR > 1, `the default World's ground at the origin is above 0 (${FLOOR.toFixed(2)}), which is what made the gap`);
    assert(editorFloorHeight(terrainRenderer) === FLOOR, 'the Editor\'s floor is the terrain under the origin');
    assert(editorFloorHeight({ add() {}, remove() {} }) === 0 && editorFloorHeight(null) === 0, 'with no terrain, the floor is at 0');
    console.log(`✓ the Editor's floor is the terrain under the build's origin (${FLOOR.toFixed(2)} in the default World)`);
}

// A brick placed from the ground under the pointer is drawn under the pointer.
{
    const cam = camera();
    const picking = new PickingService(cam, domElement, noBricks, null, { groundHeight: () => editorFloorHeight(terrainRenderer) });
    const before = new PickingService(cam, domElement, noBricks);
    const positions = new PlacementPositionService(registry);
    for (const pointer of [{ x: WIDTH / 2, y: HEIGHT * 0.6 }, { x: 300, y: 500 }, { x: 800, y: 420 }]) {
        const ground = picking.pickGroundPosition(pointer.x, pointer.y);
        assert(Math.abs(ground.y - FLOOR) < 1e-9, 'the ground is picked on the floor');
        const onScreen = toScreen(cam, ground);
        assert(Math.hypot(onScreen.x - pointer.x, onScreen.y - pointer.y) < 0.01, 'the picked point is under the pointer');

        // A cube placed there (grid snapping off, to compare exactly) is drawn
        // standing on that point: its foot is under the pointer.
        const cube = positions.calculateGround(ground, 'core:cube', { gridSnapEnabled: false });
        const foot = toScreen(cam, { x: cube.x, y: cube.y - 0.5 + FLOOR, z: cube.z });
        assert(Math.hypot(foot.x - pointer.x, foot.y - pointer.y) < 0.01, `the cube's foot is drawn under the pointer (${foot.x.toFixed(1)}, ${foot.y.toFixed(1)})`);

        // Picking at y = 0, as before, put it behind the pointer and drew it far above.
        const old = before.pickGroundPosition(pointer.x, pointer.y);
        const oldFoot = toScreen(cam, { x: old.x, y: FLOOR, z: old.z });
        assert(pointer.y - oldFoot.y > 40, `before, the cube's foot was drawn ${(pointer.y - oldFoot.y).toFixed(0)}px above the pointer`);
    }
    console.log('✓ a brick placed from the ground under the pointer is drawn standing under it (before: tens of pixels above)');
}

// Every ghost stands on the floor, over a hill or a hollow.
{
    const hills = { add() {}, remove() {}, terrainHeightAt: (x, z) => (x === 0 && z === 0 ? 2.5 : 9) };
    const at = new Position(10, 0.5, 10);

    const brickGhosts = [];
    const brickPreview = new PreviewRenderer({ ...hills, add: (mesh) => brickGhosts.push(mesh) });
    const brickBus = new EventBus();
    brickPreview.subscribe(brickBus);
    brickBus.publish(EditorEvent.PREVIEW_CHANGED, { preview: new PreviewState({ visible: true, definitionId: 'core:cube', position: at }) });
    assert(Math.abs(brickGhosts[0].position.y - 3) < 1e-9, 'a brick\'s ghost stands on the floor');

    const world = new World({});
    const building = new Building({});
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    const structureGhosts = [];
    const structurePreview = new StructurePreviewRenderer({ ...hills, add: (mesh) => structureGhosts.push(mesh) }, { resolve: () => world }, TransformMath);
    const structureBus = new EventBus();
    structurePreview.subscribe(structureBus);
    structureBus.publish(EditorEvent.STRUCTURE_PREVIEW_CHANGED, { structurePreview: new StructurePreviewState({ visible: true, documentId: 'doc', position: new Position(10, 0, 10) }) });
    assert(structureGhosts.length === 1 && Math.abs(structureGhosts[0].position.y - 3) < 1e-9, `a structure's ghost stands on the floor, not the hill under it (${structureGhosts[0]?.position.y})`);

    const compositionGhosts = [];
    const compositionPreview = new CompositionPreviewRenderer({ ...hills, add: (mesh) => compositionGhosts.push(mesh) }, TransformMath);
    const compositionBus = new EventBus();
    compositionPreview.subscribe(compositionBus);
    compositionBus.publish(EditorEvent.COMPOSITION_PREVIEW_CHANGED, { compositionPreview: new CompositionPreviewState({
        visible: true, structure: { id: 'test:one', name: 'One', bricks: building.getBricks() }, position: new Position(10, 0, 10), rotation: 0, valid: true
    }) });
    assert(compositionGhosts.length === 1 && Math.abs(compositionGhosts[0].position.y - 3) < 1e-9, `a composition's ghost stands on the floor too (${compositionGhosts[0]?.position.y})`);
    console.log('✓ the ghosts of a brick, a structure and a composition stand on the floor, wherever the terrain under them is');
}
