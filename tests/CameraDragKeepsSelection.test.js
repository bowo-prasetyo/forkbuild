import { World } from '../core/document/World.js';
import { Building } from '../core/building/Building.js';
import { Brick } from '../core/building/Brick.js';
import { Position } from '../core/document/Position.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { CreateEditorContextUseCase } from '../application/editor/CreateEditorContextUseCase.js';
import { CreateToolRegistryUseCase } from '../application/editor/CreateToolRegistryUseCase.js';
import { ToolManager } from '../application/editor/ToolManager.js';
import { InputDispatcher } from '../application/editor/InputDispatcher.js';
import { SelectionUseCase } from '../application/editor/SelectionUseCase.js';
import { SelectionState } from '../application/editor-state/SelectionState.js';
import { PreviewUseCase } from '../application/editor/PreviewUseCase.js';
import { CompositionPreviewUseCase } from '../application/editor/CompositionPreviewUseCase.js';
import { CommandHistory } from '../application/editor/CommandHistory.js';
import { pointerInputMethods } from '../application/editorSession/pointerInputMethods.js';
import { assert } from './support/Assert.js';

// A camera drag in Select keeps the selection (the open item of
// docs/reviews/EditorUsability-2026-10-29.md, after its P1 and P2 fixes):
// a mouse press reaches SelectionTool only once released as a click, so a
// drag that turns or pans the camera neither clears the selection nor
// selects the brick it began on. A click still selects, and a click on
// empty ground still clears. The real SelectionTool, behind the real
// InputDispatcher; only picking is faked, by screen point.

function setup() {
    const registry = new CreateBrickRegistryUseCase().execute();
    const editorContext = new CreateEditorContextUseCase().execute();
    const world = new World({});
    const building = new Building({});
    const a = new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) });
    const b = new Brick({ definitionId: 'core:cube', position: new Position(2, 0.5, 0) });
    building.addBrick(a);
    building.addBrick(b);
    world.addBuilding(building);
    const toolContext = {
        registry, editorContext, world, commandHistory: new CommandHistory({ world }),
        previewUseCase: new PreviewUseCase(editorContext),
        compositionPreviewUseCase: new CompositionPreviewUseCase(editorContext),
        selectionUseCase: new SelectionUseCase(editorContext)
    };
    const toolManager = new ToolManager(new CreateToolRegistryUseCase().execute(), toolContext, editorContext);
    toolManager.start();
    // Screen points: a at (10,10), b at (20,20), a placed build at (30,30), ground elsewhere.
    const bricks = new Map([['10,10', a], ['20,20', b]]);
    const pick = (x, y) => {
        const brick = bricks.get(`${x},${y}`);
        return brick ? { brickId: brick.id, buildingId: building.id } : null;
    };
    const pickPlacement = (x, y) => (x === 30 && y === 30 ? { placementId: 'p1', point: { x: 5, y: 0, z: 5 } } : null);
    const inputDispatcher = new InputDispatcher(toolManager, pick, () => ({ x: 0, y: 0, z: 0 }), pickPlacement);
    const downs = [];
    const dispatchPointerDown = inputDispatcher.dispatchPointerDown.bind(inputDispatcher);
    inputDispatcher.dispatchPointerDown = (event) => {
        downs.push(event.clientX);
        dispatchPointerDown(event);
    };
    const host = Object.assign({}, pointerInputMethods, {
        _editorContext: editorContext,
        _toolManager: toolManager,
        _inputDispatcher: inputDispatcher,
        _marqueeState: null, _placePress: null, _rowPress: null, _selectionPress: null, _selectPress: null,
        _touchPointerIds: new Set(), _touchTap: null, _touchMultiSelect: false, _touchBoxSelect: false,
        _refreshGizmo() {},
        _session: { gizmoPointerDown: () => false, gizmoPointerMove: () => null, gizmoPointerUp: () => null, setControlsEnabled() {} }
    });
    const selected = () => editorContext.selection.brickIds.map((id) => (id === a.id ? 'a' : 'b')).join(',');
    return { host, editorContext, selected, downs };
}
const mouse = (x, y, extra = {}) => ({ pointerType: 'mouse', pointerId: 1, clientX: x, clientY: y, button: 0, buttons: 1, ...extra });
const click = (host, x, y, extra = {}) => {
    host.onPointerDown(mouse(x, y, extra));
    host.onPointerUp(mouse(x, y, { ...extra, buttons: 0 }));
};
const drag = (host, x0, y0, x1, y1, extra = {}) => {
    host.onPointerDown(mouse(x0, y0, extra));
    host.onPointerMove(mouse((x0 + x1) / 2, (y0 + y1) / 2, extra));
    host.onPointerMove(mouse(x1, y1, extra));
    host.onPointerUp(mouse(x1, y1, { ...extra, buttons: 0 }));
};

// 1. A click selects; a drag from empty ground keeps the selection.
{
    const { host, selected } = setup();
    click(host, 10, 10);
    assert(selected() === 'a', `1. a click on a brick selects it (${selected()})`);
    drag(host, 300, 300, 200, 250);
    assert(selected() === 'a', `2. a drag from empty ground (the camera orbiting) keeps it (${selected()})`);
    drag(host, 300, 300, 200, 250, { button: 2, buttons: 2 });
    assert(selected() === 'a', '3. so does a right-drag (the camera panning)');
    click(host, 300, 300, { button: 2, buttons: 2 });
    assert(selected() === 'a', '4. and a right click on the ground');
    click(host, 300, 300);
    assert(selected() === '', '5. a click on empty ground still clears it');
    console.log('✓ a camera drag from empty ground keeps the selection; a click clears it');
}

// 2. A drag from another brick doesn't select it; a small wobble is still a click.
{
    const { host, selected } = setup();
    click(host, 10, 10);
    drag(host, 20, 20, 120, 60);
    assert(selected() === 'a', `6. a camera drag that begins on another brick doesn't switch to it (${selected()})`);
    click(host, 20, 20, { button: 2, buttons: 2 });
    assert(selected() === 'a', '7. nor does a right click on it');
    host.onPointerDown(mouse(20, 20));
    host.onPointerMove(mouse(23, 22));
    host.onPointerUp(mouse(20, 20, { buttons: 0 }));
    assert(selected() === 'b', `8. a click that wobbles a few pixels still selects (${selected()})`);
    click(host, 10, 10, { shiftKey: false, ctrlKey: true });
    assert(selected() === 'b,a', `9. Ctrl+click adds, on release as a click (${selected()})`);
    console.log('✓ a camera drag from a brick selects nothing; clicks still select');
}

// 3. The placed build already selected takes the press at once: dragging it moves it.
{
    const { host, editorContext, downs } = setup();
    editorContext.setSelection(new SelectionState({ items: [{ type: 'structure-placement', placementId: 'p1' }] }));
    assert(editorContext.selection.isStructurePlacementSelection, '(a placed build is selected)');
    host.onPointerDown(mouse(30, 30));
    assert(downs.join() === '30', `10. a press on it reaches SelectionTool at once, to drag it (${downs})`);
    host.onPointerUp(mouse(30, 30, { buttons: 0 }));
    downs.length = 0;
    host.onPointerDown(mouse(300, 300));
    assert(downs.length === 0, '11. a press anywhere else still waits');
    host.onPointerUp(mouse(300, 300, { buttons: 0 }));
    console.log('✓ the selected placed build still drags');
}

console.log('✅ All camera-drag selection tests passed.');
