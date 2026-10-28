import { World } from '../core/document/World.js';
import { Building } from '../core/building/Building.js';
import { Brick } from '../core/building/Brick.js';
import { Position } from '../core/document/Position.js';
import { brickRow, MAX_ROW_LENGTH } from '../core/building/BrickRow.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { CreateEditorContextUseCase } from '../application/editor/CreateEditorContextUseCase.js';
import { PreviewUseCase } from '../application/editor/PreviewUseCase.js';
import { CompositionPreviewUseCase } from '../application/editor/CompositionPreviewUseCase.js';
import { CommandHistory } from '../application/editor/CommandHistory.js';
import { PlacementTool } from '../application/tools/PlacementTool.js';
import { ToolId } from '../application/editor-state/ToolId.js';
import { pointerInputMethods } from '../application/editorSession/pointerInputMethods.js';
import { assert } from './support/Assert.js';

// Drag to lay a row (docs/reviews/EditorPlacementUX-2026-10-27.md, "Beyond
// the fixes"): placing a brick, Shift+drag lays a straight row of it, edge to
// edge, as one undo step.

const at = (x, y, z) => new Position(x, y, z);
const xz = (positions) => positions.map((p) => `${p.x},${p.z}`).join(' ');

// 1. The row's positions.
{
    const anchor = at(0, 0.5, 0);
    assert(xz(brickRow(anchor, at(0.2, 0.5, 0.1), { stepX: 1, stepZ: 1 })) === '0,0', '1. the pointer still on the anchor: one brick');
    assert(xz(brickRow(anchor, at(3, 0.5, 1), { stepX: 1, stepZ: 1 })) === '0,0 1,0 2,0 3,0', '2. dragged mostly along x: a row along x');
    assert(xz(brickRow(anchor, at(-1, 0.5, -2.6), { stepX: 1, stepZ: 1 })) === '0,0 0,-1 0,-2 0,-3', '3. mostly along -z: a row along -z');
    assert(xz(brickRow(anchor, at(4.6, 0.5, 0), { stepX: 2, stepZ: 1 })) === '0,0 2,0 4,0', '4. bricks two wide sit two apart, edge to edge');
    assert(brickRow(anchor, at(5, 0.5, 0), { stepX: 2, stepZ: 1 }).every((p) => p.y === 0.5), '5. all at the anchor\'s height');
    assert(brickRow(anchor, at(1000, 0.5, 0), { stepX: 1, stepZ: 1 }).length === MAX_ROW_LENGTH, '6. a drag to the horizon stops at the longest row');
    assert(xz(brickRow(at(0.5, 0, 0), at(1.4, 0, 0), { stepX: 0.25, stepZ: 0.25 })) === '0.5,0 0.75,0 1,0 1.25,0 1.5,0', '7. quarter steps land on the grid');
    console.log('✓ the row runs along x or z, edge to edge, at the anchor\'s height');
}

function buildTool({ occupied = [] } = {}) {
    const registry = new CreateBrickRegistryUseCase().execute();
    const editorContext = new CreateEditorContextUseCase().execute();
    const world = new World({});
    const building = new Building({});
    for (const p of occupied) building.addBrick(new Brick({ definitionId: 'core:cube', position: at(p.x, p.y, p.z) }));
    world.addBuilding(building);
    const commandHistory = new CommandHistory({ world });
    const blocked = [];
    editorContext.notePlacementBlocked = (kind) => blocked.push(kind);
    const context = {
        registry, editorContext, world, commandHistory,
        previewUseCase: new PreviewUseCase(editorContext),
        compositionPreviewUseCase: new CompositionPreviewUseCase(editorContext)
    };
    editorContext.setActiveBrick('core:cube');
    return { tool: new PlacementTool(context), editorContext, building, commandHistory, blocked };
}
const ground = (x, z, shift = false) => ({ worldPosition: { x, y: 0, z }, pickedBrick: null, modifiers: { shift } });
const bricksAt = (building) => building.getBricks().map((b) => `${b.position.x},${b.position.z}`).sort().join(' ');

// 2. Shift+drag lays a row as one undo step, in the brick's colour.
{
    const { tool, editorContext, building, commandHistory } = buildTool();
    editorContext.setActiveBrickColor(0xff0000);
    tool.onPointerMove(ground(0, 0));
    tool.onPointerDown(ground(0, 0, true));
    assert(tool.layingRow && !editorContext.preview.visible, '8. Shift+press starts a row, in place of the single ghost');
    tool.onPointerMove(ground(3.2, 0.4, true));
    const ghost = editorContext.compositionPreview;
    assert(ghost.visible && ghost.valid && ghost.structure.bricks.length === 4, '9. the row shows as one ghost of four bricks, clear');
    assert(ghost.structure.bricks.every((b) => b.color === 0xff0000 && b.definitionId === 'core:cube'), '10. in the brick\'s colour');
    assert(building.getBricks().length === 0, '11. nothing is placed while dragging');
    tool.onPointerUp(ground(3.2, 0.4, true));
    assert(bricksAt(building) === '0,0 1,0 2,0 3,0', `12. releasing places the row (${bricksAt(building)})`);
    assert(building.getBricks().every((b) => b.color === 0xff0000), '13. every brick in the colour');
    assert(commandHistory.getCursor() === 1, '14. as one undo step');
    assert(!tool.layingRow && !editorContext.compositionPreview.visible && editorContext.preview.visible, '16. then the single ghost follows the pointer again');
    commandHistory.undo();
    assert(building.getBricks().length === 0, '17. one Undo takes the whole row away');
    console.log('✓ Shift+drag lays a row as one undo step');
}

// 3. A turned brick steps by its turned footprint.
{
    const { tool, editorContext, building } = buildTool();
    editorContext.setActiveBrick('core:brick_1x4');
    tool.onPointerMove(ground(0, 0));
    tool.onKeyDown({ key: 'r', modifiers: {} });
    tool.onPointerDown(ground(0, 0, true));
    tool.onPointerMove(ground(5, 0, true));
    tool.onPointerUp(ground(5, 0, true));
    const xs = building.getBricks().map((b) => b.position.x).sort((a, b) => a - b);
    assert(xs.length === 6 && xs.every((x, i) => i === 0 || x - xs[i - 1] === 1), `18. a 1x4 turned to run along z steps one apart along x (${xs})`);
    assert(building.getBricks().every((b) => b.rotation === 90), '19. every brick turned');
    console.log('✓ a turned brick steps by its turned footprint');
}

// 4. Blocked, Escape, and a Shift+click.
{
    const blockedRow = buildTool({ occupied: [{ x: 2, y: 0.5, z: 0 }] });
    blockedRow.tool.onPointerMove(ground(0, 0));
    blockedRow.tool.onPointerDown(ground(0, 0, true));
    blockedRow.tool.onPointerMove(ground(4, 0, true));
    assert(blockedRow.editorContext.compositionPreview.valid === false, '20. a row across a taken spot shows red');
    blockedRow.tool.onPointerUp(ground(4, 0, true));
    assert(blockedRow.building.getBricks().length === 1 && blockedRow.blocked.join() === 'brick', '21. and places nothing, saying so');

    const escaped = buildTool();
    escaped.tool.onPointerMove(ground(0, 0));
    escaped.tool.onPointerDown(ground(0, 0, true));
    escaped.tool.onPointerMove(ground(3, 0, true));
    escaped.tool.onKeyDown({ key: 'Escape', modifiers: {} });
    assert(!escaped.tool.layingRow && !escaped.editorContext.compositionPreview.visible && escaped.editorContext.preview.visible, '22. Escape drops the row');
    escaped.tool.onPointerUp(ground(3, 0, true));
    assert(escaped.building.getBricks().length === 0, '23. and the release places nothing');

    const clicked = buildTool();
    clicked.tool.onPointerMove(ground(1, 1));
    clicked.tool.onPointerDown(ground(1, 1, true));
    clicked.tool.onPointerUp(ground(1, 1, true));
    assert(bricksAt(clicked.building) === '1,1' && clicked.commandHistory.getCursor() === 1, '24. a Shift+click places one brick, as a click');
    console.log('✓ blocked rows, Escape and Shift+click');
}

// 5. The session hands Shift+drag to the tool while placing a brick, with the
// camera held still; with any other tool it is still the selection box.
function makeHost(activeTool) {
    const dispatched = [];
    const controls = [];
    const marquees = [];
    const host = Object.assign({}, pointerInputMethods, {
        _editorContext: { selection: null, tool: { activeTool } },
        _marqueeState: null, _placePress: null, _rowPress: null,
        _touchPointerIds: new Set(), _touchTap: null, _touchMultiSelect: false, _touchBoxSelect: false,
        _refreshGizmo() {},
        marqueeSelect(rect) { marquees.push(rect); return true; },
        _session: {
            gizmoPointerDown: () => false, gizmoPointerMove: () => null, gizmoPointerUp: () => null,
            setControlsEnabled: (enabled) => controls.push(enabled)
        },
        _inputDispatcher: {
            dispatchPointerMove: (e) => dispatched.push(`move:${e.clientX}`),
            dispatchPointerDown: (e) => dispatched.push(`down:${e.clientX}`),
            dispatchPointerUp: (e) => dispatched.push(`up:${e.clientX}`),
            dispatchKeyDown: (e) => dispatched.push(`key:${e.key}`)
        }
    });
    return { host, dispatched, controls, marquees };
}
const mouse = (x, shift = true) => ({ pointerType: 'mouse', pointerId: 1, clientX: x, clientY: 100, button: 0, buttons: 1, shiftKey: shift });
{
    const { host, dispatched, controls } = makeHost(ToolId.PLACE);
    host.onPointerDown(mouse(100));
    assert(host.isRowActive() && controls.join() === 'false', '25. placing a brick, Shift+press starts a row and holds the camera still');
    host.onPointerMove(mouse(160));
    host.onPointerUp(mouse(160));
    assert(dispatched.join() === 'down:100,move:160,up:160', `26. the press, the drag and the release reach the tool (${dispatched})`);
    assert(!host.isRowActive() && controls.join() === 'false,true', '27. and the camera is free again');

    const cancelled = makeHost(ToolId.PLACE);
    cancelled.host.onPointerDown(mouse(100));
    cancelled.host.cancelRow();
    assert(!cancelled.host.isRowActive() && cancelled.dispatched.join() === 'down:100,key:Escape' && cancelled.controls.join() === 'false,true',
        '28. cancelling drops the row (Escape to the tool) and frees the camera');

    const selecting = makeHost(ToolId.SELECT);
    selecting.host.onPointerDown(mouse(100));
    selecting.host.onPointerMove(mouse(160));
    selecting.host.onPointerUp(mouse(160));
    assert(!selecting.host.isRowActive() && selecting.marquees.length === 1, '29. in Select, Shift+drag still draws a selection box');
    console.log('✓ the session hands Shift+drag to Place as a row');
}

console.log('✅ All brick row tests passed.');
