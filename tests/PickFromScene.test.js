import { World } from '../core/document/World.js';
import { Building } from '../core/building/Building.js';
import { Brick } from '../core/building/Brick.js';
import { Position } from '../core/document/Position.js';
import { EditorEvent } from '../core/events/EditorEvent.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { CreateEditorContextUseCase } from '../application/editor/CreateEditorContextUseCase.js';
import { CreateToolRegistryUseCase } from '../application/editor/CreateToolRegistryUseCase.js';
import { ToolManager } from '../application/editor/ToolManager.js';
import { PreviewUseCase } from '../application/editor/PreviewUseCase.js';
import { CompositionPreviewUseCase } from '../application/editor/CompositionPreviewUseCase.js';
import { CommandHistory } from '../application/editor/CommandHistory.js';
import { ToolId } from '../application/editor-state/ToolId.js';
import { pointerInputMethods } from '../application/editorSession/pointerInputMethods.js';
import { assert } from './support/Assert.js';

// Pick from the scene (docs/reviews/EditorPlacementUX-2026-10-27.md, "Beyond
// the fixes"): Alt-click a brick in the build to take up its type, colour,
// turn and tilt, with Place on, ready to place another.

function setup() {
    const registry = new CreateBrickRegistryUseCase().execute();
    const editorContext = new CreateEditorContextUseCase().execute();
    const world = new World({});
    const building = new Building({});
    const wall = new Brick({ definitionId: 'core:brick_1x4', position: new Position(3, 0.5, 2), rotation: 90, tilt: 0, color: 0xaa3333 });
    const plain = new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) });
    building.addBrick(wall);
    building.addBrick(plain);
    world.addBuilding(building);
    const commandHistory = new CommandHistory({ world });
    const toolContext = {
        registry, editorContext, world, commandHistory,
        previewUseCase: new PreviewUseCase(editorContext),
        compositionPreviewUseCase: new CompositionPreviewUseCase(editorContext),
        selectionUseCase: { clear() {} }
    };
    const toolManager = new ToolManager(new CreateToolRegistryUseCase().execute(), toolContext, editorContext);
    toolManager.start();
    const under = new Map([['10,10', wall], ['20,20', plain]]);
    const dispatched = [];
    const picked = [];
    editorContext.eventBus.subscribe(EditorEvent.BRICK_PICKED, ({ definitionId }) => picked.push(definitionId));
    const host = Object.assign({}, pointerInputMethods, {
        _editorContext: editorContext,
        _documentManager: { document: { world } },
        _toolManager: toolManager,
        _marqueeState: null, _placePress: null, _rowPress: null,
        _touchPointerIds: new Set(), _touchTap: null, _touchMultiSelect: false, _touchBoxSelect: false,
        _refreshGizmo() {},
        _session: { gizmoPointerDown: () => false, gizmoPointerMove: () => null, gizmoPointerUp: () => null, setControlsEnabled() {} },
        _inputDispatcher: {
            pickBrickAt: (x, y) => {
                const brick = under.get(`${x},${y}`);
                return brick ? { buildingId: building.id, brickId: brick.id } : null;
            },
            dispatchPointerMove: () => dispatched.push('move'),
            dispatchPointerDown: () => dispatched.push('down'),
            dispatchPointerUp: () => dispatched.push('up'),
            dispatchKeyDown: () => dispatched.push('key')
        }
    });
    return { host, editorContext, toolManager, building, dispatched, picked };
}
const altClick = (x, y, extra = {}) => ({ pointerType: 'mouse', pointerId: 1, clientX: x, clientY: y, button: 0, buttons: 1, altKey: true, ...extra });

// 1. From Select, Alt-click a brick: its type, colour, turn and tilt, with Place on.
{
    const { host, editorContext, toolManager, building, dispatched, picked } = setup();
    assert(editorContext.tool.activeTool === ToolId.SELECT, '1. starts in Select');
    host.onPointerDown(altClick(10, 10));
    assert(editorContext.activeBrick.definitionId === 'core:brick_1x4', '2. Alt-click takes up the brick\'s type');
    assert(editorContext.activeBrick.color === 0xaa3333, '3. and its colour');
    assert(editorContext.tool.activeTool === ToolId.PLACE, '4. and turns Place on');
    const tool = toolManager.activeToolInstance;
    assert(tool.pendingRotation === 90 && tool.pendingTilt === 0, '5. with the brick\'s turn and tilt for the next placement');
    assert(picked.join() === 'core:brick_1x4', '6. and says what was picked');
    host.onPointerUp({ ...altClick(10, 10), buttons: 0 });
    assert(dispatched.length === 0 && building.getBricks().length === 2, '7. it reaches no tool, so nothing is selected or placed');

    // The next click places a copy as it was.
    tool.onPointerMove({ worldPosition: { x: 8, y: 0, z: 8 }, pickedBrick: null, modifiers: {} });
    tool.onPointerDown({ worldPosition: { x: 8, y: 0, z: 8 }, pickedBrick: null, modifiers: {} });
    const copy = building.getBricks().find((b) => b.position.x === 8);
    assert(copy && copy.definitionId === 'core:brick_1x4' && copy.rotation === 90 && copy.color === 0xaa3333, '8. a click then places a copy of it, turned and coloured');
    console.log('✓ Alt-click takes up a brick from the build');
}

// 2. While placing, a plain brick resets the colour; empty ground does nothing.
{
    const { host, editorContext, toolManager, picked } = setup();
    host.onPointerDown(altClick(10, 10));
    host.onPointerDown(altClick(20, 20));
    assert(editorContext.activeBrick.definitionId === 'core:cube' && editorContext.activeBrick.color === null,
        '9. picking a brick in its own colour leaves no colour chosen');
    assert(toolManager.activeToolInstance.pendingRotation === 0, '10. and takes its turn, none');
    host.onPointerDown(altClick(500, 500));
    assert(editorContext.activeBrick.definitionId === 'core:cube' && picked.length === 2, '11. Alt-click on nothing picks nothing');
    console.log('✓ picking while placing, and on empty ground');
}

// 3. Only a plain Alt-click picks: with Shift, Ctrl or Cmd it is left to the rest.
{
    const { host, editorContext, picked } = setup();
    host.onPointerDown(altClick(10, 10, { ctrlKey: true }));
    host.onPointerUp({ ...altClick(10, 10, { ctrlKey: true }), buttons: 0 });
    assert(picked.length === 0 && editorContext.tool.activeTool === ToolId.SELECT, '12. Ctrl+Alt-click doesn\'t pick');
    host.onPointerDown(altClick(10, 10, { button: 2 }));
    assert(picked.length === 0, '13. nor does another button');
    console.log('✓ only a plain left Alt-click picks');
}

console.log('✅ All pick-from-the-scene tests passed.');
