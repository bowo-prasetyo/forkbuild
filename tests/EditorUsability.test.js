import * as THREE from 'three';
import { Brick } from '../core/building/Brick.js';
import { Building } from '../core/building/Building.js';
import { Document } from '../core/document/Document.js';
import { DocumentMetadata } from '../core/document/DocumentMetadata.js';
import { Position } from '../core/document/Position.js';
import { World } from '../core/document/World.js';
import { CommandHistory } from '../application/editor/CommandHistory.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { CreateEditorContextUseCase } from '../application/editor/CreateEditorContextUseCase.js';
import { SelectionState } from '../application/editor-state/SelectionState.js';
import { CopySelectionUseCase } from '../application/editor/CopySelectionUseCase.js';
import { PasteClipboardUseCase } from '../application/editor/PasteClipboardUseCase.js';
import { EditorSession } from '../application/editor/EditorSession.js';
import { EditorContext } from '../application/editor/EditorContext.js';
import { DocumentManager } from '../application/document/DocumentManager.js';
import { SelectionUseCase } from '../application/editor/SelectionUseCase.js';
import { PreviewUseCase } from '../application/editor/PreviewUseCase.js';
import { EditorActionRegistry, createStandardActions } from '../application/editor/EditorActionRegistry.js';
import { EditorActionContext } from '../application/editor/EditorActionContext.js';
import { InputRouter } from '../application/editor/InputRouter.js';
import { ToolId } from '../application/editor-state/ToolId.js';
import { pointerInputMethods } from '../application/editorSession/pointerInputMethods.js';
import { EDITOR_MAX_POLAR_ANGLE } from '../application/world/RenderWorldUseCase.js';
import { TransformGizmoController } from '../renderer/TransformGizmoController.js';
import { TransformMath } from '../application/editor/TransformMath.js';
import { historyButtons } from '../ui/views/editorView/historyButtons.js';
import { displayText, t } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';

// The P1 findings of docs/reviews/EditorUsability-2026-10-29.md, below the
// view: the Selection card shows the selection's colour (P1-2), the toolbar's
// Undo and Redo say what they do (P1-3), See the Whole Build frames the build
// (P1-4), and a drag that starts on a selected brick moves the selection
// (P1-4). tests/EditorUsabilityBrowser.test.js covers the sidebar.

function buildSession(specs) {
    const registry = new CreateBrickRegistryUseCase().execute();
    const world = new World();
    const building = new Building({ creator: 'tester' });
    const ids = specs.map((spec) => {
        const brick = new Brick({ definitionId: spec.definitionId || 'core:cube', position: spec.position, color: spec.color ?? null });
        building.addBrick(brick);
        return brick.id;
    });
    world.addBuilding(building);
    const document = new Document({ world, metadata: new DocumentMetadata({ title: 'Usability', author: 'tester' }) });
    const editorContext = new EditorContext();
    const documentManager = new DocumentManager();
    documentManager.load(document, 'usability-doc');
    const session = new EditorSession({
        registry,
        editorContext,
        toolRegistry: null,
        documentManager,
        selectionUseCase: new SelectionUseCase(editorContext),
        previewUseCase: new PreviewUseCase(editorContext),
        loadDocumentUseCase: null,
        copySelectionUseCase: new CopySelectionUseCase(registry),
        pasteClipboardUseCase: new PasteClipboardUseCase()
    });
    session._commandHistory = new CommandHistory({ world });
    session._editorCommandHistories.set(world.id, session._commandHistory);
    const select = (brickIds) => editorContext.setSelection(new SelectionState({
        items: brickIds.map((brickId) => ({ type: 'brick', buildingId: building.id, brickId }))
    }));
    return { session, editorContext, building, ids, registry, select };
}

function registryFor(session) {
    const feedback = { messages: [], show(message) { this.messages.push(displayText(message)); } };
    return { registry: new EditorActionRegistry(createStandardActions({ session, feedback, ui: {} })), feedback };
}

// 1. The selection's colour: shared, the kind's own, or none when they differ (P1-2).
{
    const { session, ids, registry, select } = buildSession([
        { position: new Position(0, 0.5, 0) },
        { position: new Position(1, 0.5, 0) },
        { position: new Position(2, 0.5, 0), color: 0xa63a3a }
    ]);
    const cube = registry.get('core:cube').color;
    select([ids[0], ids[1]]);
    assert(session.getSelectionSummary().color === cube, '1. two bricks in their kind\'s own colour share it');
    select([ids[0], ids[2]]);
    assert(session.getSelectionSummary().color === null, '2. bricks of different colours have none');
    session.recolorSelection(0xa63a3a);
    assert(session.getSelectionSummary().color === 0xa63a3a, '3. after painting them, the colour they were painted');
    select([ids[2]]);
    assert(session.getSelectionSummary().color === 0xa63a3a, '4. one painted brick, its own colour');
    console.log('✓ the selection summary carries the colour its bricks share');
}

// 2. The toolbar's Undo and Redo name what they will do, or why they can't (P1-3).
{
    const { session, ids, select } = buildSession([{ position: new Position(0, 0.5, 0) }, { position: new Position(1, 0.5, 0) }]);
    const { registry } = registryFor(session);
    let buttons = historyButtons(registry, EditorActionContext.capture({ session }));
    assert(!buttons.undo.enabled && buttons.undo.title === displayText(t('editorActionReason.nothingToUndo')),
        `5. with nothing done, Undo is off and says why (${buttons.undo.title})`);
    assert(!buttons.redo.enabled, '6. and so is Redo');
    select(ids);
    session.recolorSelection(0x3a6ea5);
    buttons = historyButtons(registry, EditorActionContext.capture({ session }));
    assert(buttons.undo.enabled && buttons.undo.title === 'Undo Recolor 2 Bricks (Ctrl/Cmd+Z)', `7. Undo names the step and its key (${buttons.undo.title})`);
    registry.execute('history.undo', EditorActionContext.capture({ session }));
    buttons = historyButtons(registry, EditorActionContext.capture({ session }));
    assert(!buttons.undo.enabled && buttons.redo.enabled && buttons.redo.title === 'Redo Recolor 2 Bricks (Ctrl/Cmd+Shift+Z)',
        `8. after it, Redo names it (${buttons.redo.title})`);
    console.log('✓ Undo and Redo say what they will do');
}

// 3. See the Whole Build: Home, in the palette, framing the build or the starting view (P1-4).
{
    const { session } = buildSession([{ position: new Position(0, 0.5, 0) }, { position: new Position(8, 0.5, 4) }]);
    const camera = { states: [], resets: 0 };
    session._session = {
        setCameraState: (state) => camera.states.push(state),
        resetCameraView: () => { camera.resets++; },
        floorHeight: () => 0
    };
    const { registry } = registryFor(session);
    const ctx = EditorActionContext.capture({ session });
    const action = registry.resolveShortcut(InputRouter.toNormalizedKeyEvent({ key: 'Home' }));
    assert(action && action.id === 'camera.wholeBuild', '9. Home is See the Whole Build');
    assert(registry.findMatching('camera', (label) => displayText(t(label))).some((a) => a.id === 'camera.wholeBuild'),
        '10. the palette finds it by "camera"');
    registry.execute('camera.wholeBuild', ctx);
    const framed = camera.states[0];
    assert(framed && framed.target.x > 0 && framed.target.x < 8, '11. it frames the build, aimed between its ends');
    assert(camera.resets === 0, '12. without resetting the view');

    const empty = buildSession([]);
    const emptyCamera = { states: 0, resets: 0 };
    empty.session._session = { setCameraState: () => { emptyCamera.states++; }, resetCameraView: () => { emptyCamera.resets++; }, floorHeight: () => 0 };
    assert(empty.session.showWholeBuild() === true && emptyCamera.resets === 1 && emptyCamera.states === 0,
        '13. an empty build goes back to the starting view');
    assert(EDITOR_MAX_POLAR_ANGLE < Math.PI / 2 - 0.1 && EDITOR_MAX_POLAR_ANGLE > Math.PI / 3,
        '14. the Editor\'s camera stops short of the ground');
    console.log('✓ See the Whole Build frames the build');
}

// 4. A drag that starts on a selected brick moves the selection; a click stays a click (P1-4).
function pointerHost({ tool = ToolId.SELECT, selectedIds = ['a'], placement = false } = {}) {
    const editorContext = new CreateEditorContextUseCase().execute();
    if (tool !== ToolId.SELECT) editorContext.setActiveTool(tool);
    if (placement) {
        editorContext.setSelection(new SelectionState({ items: [{ type: 'structure-placement', placementId: 'p1' }] }));
    } else if (selectedIds.length) {
        editorContext.setSelection(new SelectionState({ items: selectedIds.map((brickId) => ({ type: 'brick', buildingId: 'b', brickId })) }));
    }
    const calls = [];
    const under = new Map([['100,100', 'a'], ['200,200', 'b2']]);
    const host = Object.assign({}, pointerInputMethods, {
        _editorContext: editorContext,
        _marqueeState: null, _placePress: null, _rowPress: null, _selectionPress: null,
        _touchPointerIds: new Set(), _touchTap: null, _touchMultiSelect: false, _touchBoxSelect: false,
        _refreshGizmo() {},
        _session: {
            gizmoPointerDown: () => false,
            gizmoSelectionPointerDown: () => { calls.push('arm'); return true; },
            gizmoPointerMove: () => { calls.push('gizmo-move'); return { consumed: calls.includes('arm') && !calls.includes('cancel') }; },
            gizmoPointerUp: () => { calls.push('gizmo-up'); return { consumed: true, committed: true }; },
            cancelGizmoGesture: () => { calls.push('cancel'); return true; },
            setControlsEnabled() {}
        },
        _inputDispatcher: {
            pickBrickAt: (x, y) => (under.has(`${x},${y}`) ? { buildingId: 'b', brickId: under.get(`${x},${y}`) } : null),
            dispatchPointerMove: () => calls.push('tool-move'),
            dispatchPointerDown: () => calls.push('tool-down'),
            dispatchPointerUp: () => calls.push('tool-up')
        }
    });
    return { host, calls };
}
const mouse = (x, y, extra = {}) => ({ pointerType: 'mouse', pointerId: 1, clientX: x, clientY: y, button: 0, buttons: 1, ...extra });

{
    const { host, calls } = pointerHost();
    host.onPointerDown(mouse(100, 100));
    assert(calls.join() === 'arm', `15. a press on a selected brick arms a drag of the selection, and reaches no tool (${calls})`);
    host.onPointerMove(mouse(103, 102));
    assert(calls.join() === 'arm', '16. a few pixels of wobble move nothing yet');
    host.onPointerMove(mouse(140, 90));
    assert(calls.at(-1) === 'gizmo-move', '17. past the click threshold, the drag moves it');
    host.onPointerUp(mouse(140, 90, { buttons: 0 }));
    assert(calls.at(-1) === 'gizmo-up' && !calls.includes('tool-down'), '18. letting go commits the move, and selects nothing');
    console.log('✓ dragging a selected brick moves the selection');
}

{
    const { host, calls } = pointerHost();
    host.onPointerDown(mouse(100, 100));
    host.onPointerMove(mouse(102, 101));
    host.onPointerUp(mouse(102, 101, { buttons: 0 }));
    assert(calls.join() === 'arm,cancel,tool-down,tool-up', `19. a click on it lets the drag go and is the click it was (${calls})`);
    console.log('✓ a click on a selected brick is still a click');
}

{
    const cases = [
        ['an unselected brick', pointerHost(), mouse(200, 200)],
        ['empty ground', pointerHost(), mouse(300, 300)],
        ['Shift', pointerHost(), mouse(100, 100, { shiftKey: true })],
        ['Ctrl', pointerHost(), mouse(100, 100, { ctrlKey: true })],
        ['the right button', pointerHost(), mouse(100, 100, { button: 2 })],
        ['Place', pointerHost({ tool: ToolId.PLACE }), mouse(100, 100)],
        ['a placed build', pointerHost({ placement: true }), mouse(100, 100)]
    ];
    assert(cases.at(-1)[1].host._editorContext.selection.isStructurePlacementSelection, '20. (a placed build is selected)');
    for (const [name, { host, calls }, event] of cases) {
        host.onPointerDown(event);
        assert(!calls.includes('arm'), `20. a press on ${name} doesn't drag the selection (${calls})`);
    }
    console.log('✓ only a plain left press on a selected brick, in Select, drags it');
}

// 5. The real gizmo controller: a press on the selection starts its free
// (centre) handle's drag, over the ground, and hands the camera back after.
{
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(10, 10, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const domElement = { style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }) };
    const gestures = [];
    const gestureService = {
        beginTransformGesture: (selection, options) => { gestures.push(['begin', options]); return { pivot: { x: 0, y: 0.5, z: 0 } }; },
        previewTransformGesture: (selection, transform) => gestures.push(['preview', transform]),
        commitTransformGesture: (selection, transform) => { gestures.push(['commit', transform]); return true; },
        cancelTransformGesture: () => gestures.push(['cancel']),
        getGestureFeedback: () => null
    };
    const controls = [];
    const gizmoRenderer = { visible: true, setActive() {}, setHover() {}, setPivot() {}, getHandleMeshes: () => [] };
    const controller = new TransformGizmoController({
        camera, domElement, gizmoRenderer, gestureService,
        controlsEnabler: { setEnabled: (enabled) => controls.push(enabled) },
        transformMath: TransformMath
    });
    const selection = new SelectionState({ items: [{ type: 'brick', buildingId: 'b', brickId: 'a' }] });
    assert(controller.onPointerDown(200, 200, selection) === false, '21. a press off every handle is not the gizmo\'s');
    assert(controller.onSelectionPointerDown(200, 200, selection) === true, '22. a press on the selection starts a drag');
    const [, options] = gestures[0];
    assert(options.mode === 'translate' && options.axis === null, '23. a free move, as the centre handle\'s');
    assert(controls.join() === 'false', '24. the camera is held still while it drags');
    controller.onPointerMove(260, 230, selection);
    const preview = gestures.find(([kind]) => kind === 'preview')[1];
    assert(preview.translation && preview.translation.y === 0 && Math.hypot(preview.translation.x, preview.translation.z) > 0.1,
        '25. it moves over the ground, never up or down');
    controller.onPointerUp(260, 230, selection);
    assert(gestures.at(-1)[0] === 'commit' && controls.at(-1) === true, '26. letting go commits it and gives the camera back');
    assert(controller.onSelectionPointerDown(200, 200, new SelectionState({ items: [] })) === false, '27. with nothing selected there is nothing to drag');
    gizmoRenderer.visible = false;
    assert(controller.onSelectionPointerDown(200, 200, selection) === false, '28. nor while the gizmo is hidden');
    console.log('✓ the gizmo drags the selection from a press on it');
}

console.log('✅ All Editor usability tests passed.');
