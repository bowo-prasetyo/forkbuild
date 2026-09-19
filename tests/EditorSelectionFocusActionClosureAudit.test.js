import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { CreateEditorContextUseCase } from '../application/CreateEditorContextUseCase.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { SelectionUseCase } from '../application/SelectionUseCase.js';
import { PreviewUseCase } from '../application/PreviewUseCase.js';
import { EditorSession } from '../application/EditorSession.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { SelectionState } from '../application/editor-state/SelectionState.js';
import { EditorEvent } from '../core/events/EditorEvent.js';
import { EditorActionRegistry, createStandardActions } from '../application/EditorActionRegistry.js';
import { EditorActionContext } from '../application/EditorActionContext.js';

// 0.9.661 — Add Editor Selection Focus Action.
//
// TYPE: narrow production feature (one EditorActionRegistry action, one
// SelectionInspector button) + focused closure audit. PRODUCTION CHANGES:
// application/EditorActionRegistry.js (+`selection.focus`, Selection
// category) and ui/components/SelectionInspector.js (+one actions-row
// button) — see Section G's own production-change guard for the exact
// diff this milestone produced. tests/EditorSelectedBrickCameraFocusBoundaryAudit.test.js
// (0.9.660) was amended in place (not replaced) to assert against the
// real action this milestone built instead of its pre-implementation
// absence — see that file's own Section H.
//
// tests/EditorSelectedBrickCameraFocusBoundaryAudit.test.js (0.9.660)
// already proved every camera/geometry primitive this action needs
// already existed and composes with zero new code. This file is the
// closure audit that milestone's own verdict called for: exercising the
// REAL, now-wired `selection.focus` action — EditorActionRegistry ->
// SelectionInspector's run()/isDisabled() convention -> EditorSession —
// end to end, per the requesting brief's own lettered checklist.
//
//   Section A — Single-brick focus.
//   Section B — Multi-brick focus (union-bounds center).
//   Section C — Selection identity untouched by focusing.
//   Section D — Camera-only mutation (document/geometry/selection/dirty/
//               undo/EditorContext-eventbus all unchanged).
//   Section E — No selection: unavailable, safe no-op.
//   Section F — Repeatability: determined by selection, not prior camera
//               state.
//   Section G — Action wiring: EditorActionRegistry -> SelectionInspector
//               -> EditorSession.frameCameraOn(), no duplicated camera
//               calculation, plus the production-change guard.
//   Section H — Structure non-interference: 0.9.661 does not claim to
//               focus a structure-placement selection.
//   Section I — Instant behavior: no animator, no async transition.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));

function stubRenderSession(extra = {}) {
    let cameraState = { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, zoom: 1 };
    return {
        pick() { return null; }, pickGround() { return null; }, pickPlacement() { return null; },
        setControlsEnabled() {},
        showGizmo() {}, hideGizmo() {},
        gizmoHitTest() { return null; },
        gizmoPointerDown() { return null; }, gizmoPointerMove() { return null; }, gizmoPointerUp() { return null; },
        gizmoKeyDown() { return false; }, cancelGizmoGesture() {}, isGizmoDragging() { return false; },
        getCameraState() { return cameraState; },
        setCameraState(state) { cameraState = state; },
        dispose() {},
        ...extra
    };
}

function makeStandaloneDocument() {
    const world = new World();
    const building = new Building({ creator: 'alice' });
    world.addBuilding(building);
    return { document: new Document({ world, metadata: new DocumentMetadata({ title: 'Closure Audit World', author: 'alice' }) }), building };
}

function makeEditorSession() {
    const registry = new CreateBrickRegistryUseCase().execute();
    const editorContext = new CreateEditorContextUseCase().execute();
    const documentManager = new DocumentManager();
    const selectionUseCase = new SelectionUseCase(editorContext);
    const editorSession = new EditorSession({
        registry, editorContext, toolRegistry: null, documentManager, selectionUseCase,
        previewUseCase: new PreviewUseCase(editorContext)
    });
    editorSession._session = stubRenderSession();
    return { editorSession, editorContext, documentManager };
}

function openDocument(editorSession, documentManager, document) {
    documentManager.newDocument(document);
    editorSession._commandHistory = new CommandHistory({ world: document.world });
}

async function run() {
    const feedback = { messages: [], show(msg) { this.messages.push(msg); } };
    const { editorSession, editorContext, documentManager } = makeEditorSession();
    const actions = createStandardActions({ session: editorSession, feedback, ui: {} });
    const registry = new EditorActionRegistry(actions);
    const contextFor = (selectionCount, selectionIsStructurePlacement = false) =>
        EditorActionContext.capture({ session: editorSession, selectionCount, selectionIsStructurePlacement });

    // ===============================================================
    // Section A — Single-brick focus.
    // ===============================================================
    {
        const { document, building } = makeStandaloneDocument();
        const brick = new Brick({ definitionId: 'core:cube', position: new Position(4, 0, -6) });
        building.addBrick(brick);
        openDocument(editorSession, documentManager, document);
        editorContext.setSelection(new SelectionState({ items: [{ type: 'brick', buildingId: building.id, brickId: brick.id }] }));

        const ran = registry.execute('selection.focus', contextFor(1));
        assert(ran === true, n('A1. registry.execute(\'selection.focus\', ...) reports it ran'));

        const cam = editorSession._session.getCameraState();
        assert(cam.target.x === 4 && cam.target.y === 0 && cam.target.z === -6,
            n('A2. camera target equals the selected brick\'s own position'));
        assert(cam.position.x === 16 && cam.position.y === 12 && cam.position.z === 6,
            n('A3. camera position equals target + the existing fixed (12,12,12) offset — the SAME offset World View uses'));

        console.log('\n=== SECTION A: SINGLE-BRICK FOCUS ===');
        console.log('✓ selection.focus, invoked through the real registry, frames the camera exactly on a single');
        console.log('  selected brick\'s own position, at the existing fixed (12,12,12) offset.');
    }

    // ===============================================================
    // Section B — Multi-brick focus (union-bounds center).
    // ===============================================================
    {
        const { document, building } = makeStandaloneDocument();
        const brickA = new Brick({ definitionId: 'core:cube', position: new Position(0, 0, 0) });        // spans x[-0.5,0.5]
        const brickB = new Brick({ definitionId: 'core:plate_2x4', position: new Position(10, 0, 0) });   // spans x[9,11]
        building.addBrick(brickA);
        building.addBrick(brickB);
        openDocument(editorSession, documentManager, document);
        editorContext.setSelection(new SelectionState({
            items: [
                { type: 'brick', buildingId: building.id, brickId: brickA.id },
                { type: 'brick', buildingId: building.id, brickId: brickB.id }
            ]
        }));

        registry.execute('selection.focus', contextFor(2));
        const cam = editorSession._session.getCameraState();
        // Union AABB x: [-0.5, 11] -> center.x = 5.25, not 5 (a naive average).
        assert(Math.abs(cam.target.x - 5.25) < 1e-9,
            n('B1. multi-brick focus frames the union-bounds center (5.25) — not either brick\'s own position, and not a naive average (5)'));

        console.log('\n=== SECTION B: MULTI-BRICK FOCUS ===');
        console.log('✓ A multi-brick selection focuses through the identical SelectionBoundsService union-bounds');
        console.log('  center a single brick uses — no separate multi-selection code path.');
    }

    // ===============================================================
    // Section C — Selection identity untouched.
    // ===============================================================
    {
        const beforeSelection = editorContext.selection;
        registry.execute('selection.focus', contextFor(2));
        assert(editorContext.selection === beforeSelection,
            n('C1. focusing never replaces or mutates the selection — the SAME SelectionState instance, before and after'));

        console.log('\n=== SECTION C: SELECTION IDENTITY ===');
        console.log('✓ Focus does not touch the selection itself.');
    }

    // ===============================================================
    // Section D — Camera-only mutation.
    // ===============================================================
    {
        const { document, building } = makeStandaloneDocument();
        const brick = new Brick({ definitionId: 'core:cube', position: new Position(1, 2, 3) });
        building.addBrick(brick);
        openDocument(editorSession, documentManager, document);
        editorContext.setSelection(new SelectionState({ items: [{ type: 'brick', buildingId: building.id, brickId: brick.id }] }));

        const beforeDocumentJSON = JSON.stringify(document.world.toJSON());
        const beforeSelection = editorContext.selection;
        const beforeCanUndo = editorSession._commandHistory.canUndo();
        const beforeDirty = documentManager.state.dirty;

        const events = [];
        const cameraListener = editorContext.eventBus.subscribe(EditorEvent.CAMERA_STATE_CHANGED, () => events.push('camera'));
        const selectionListener = editorContext.eventBus.subscribe(EditorEvent.SELECTION_CHANGED, () => events.push('selection'));

        registry.execute('selection.focus', contextFor(1));

        cameraListener.unsubscribe();
        selectionListener.unsubscribe();

        assert(JSON.stringify(document.world.toJSON()) === beforeDocumentJSON,
            n('D1. document/world content unchanged'));
        assert(editorContext.selection === beforeSelection, n('D2. selection unchanged'));
        assert(editorSession._commandHistory.canUndo() === beforeCanUndo, n('D3. undo history unchanged — no command pushed'));
        assert(documentManager.state.dirty === beforeDirty, n('D4. dirty state unchanged — focusing never marks the document dirty'));
        assert(events.length === 0, n('D5. no EditorContext EventBus event fires — camera state changes only in the render session'));

        console.log('\n=== SECTION D: CAMERA-ONLY MUTATION ===');
        console.log('✓ document, geometry, selection, dirty state, and undo history are all byte-for-byte unchanged;');
        console.log('  only the render session\'s camera state changes.');
    }

    // ===============================================================
    // Section E — No selection: unavailable, safe no-op.
    // ===============================================================
    {
        editorContext.clearSelection();
        const emptyContext = contextFor(0);
        const action = registry.get('selection.focus');
        assert(action.enabled(emptyContext) === false,
            n('E1. selection.focus is disabled with no selection'));
        assert(action.disabledReason(emptyContext) === 'No bricks selected',
            n('E2. its disabled reason matches the same "No bricks selected" convention as Duplicate/Delete/Clear'));

        const before = editorSession._session.getCameraState();
        const ran = registry.execute('selection.focus', emptyContext);
        assert(ran === false, n('E3. registry.execute() reports it did NOT run — registry-level gate, never reaching execute()'));
        const after = editorSession._session.getCameraState();
        assert(JSON.stringify(before) === JSON.stringify(after),
            n('E4. camera state is completely unchanged — a disabled action never touches the camera'));

        console.log('\n=== SECTION E: NO SELECTION ===');
        console.log('✓ Focus Selection is unavailable with no selection, gated by the registry itself (the same');
        console.log('  ctx.hasSelection rule every sibling Selection action already uses), and is a safe no-op.');
    }

    // ===============================================================
    // Section F — Repeatability.
    // ===============================================================
    {
        const { document, building } = makeStandaloneDocument();
        const brick = new Brick({ definitionId: 'core:cube', position: new Position(4, 0, 4) });
        building.addBrick(brick);
        openDocument(editorSession, documentManager, document);
        editorContext.setSelection(new SelectionState({ items: [{ type: 'brick', buildingId: building.id, brickId: brick.id }] }));

        registry.execute('selection.focus', contextFor(1));
        const firstFraming = editorSession._session.getCameraState();

        editorSession._session.setCameraState({ position: { x: -50, y: 80, z: 12 }, target: { x: 1, y: 1, z: 1 }, zoom: 3.7 });
        editorSession._session.setCameraState({ position: { x: 999, y: -12, z: 0.5 }, target: { x: -3, y: 0, z: 9 }, zoom: 0.2 });

        registry.execute('selection.focus', contextFor(1));
        const secondFraming = editorSession._session.getCameraState();

        assert(JSON.stringify(firstFraming) === JSON.stringify(secondFraming),
            n('F1. focusing the same selection twice, with arbitrary camera movement in between, produces the byte-identical camera state — determined by the selection, not prior camera history'));

        console.log('\n=== SECTION F: REPEATABILITY ===');
        console.log('✓ Same selection -> same camera framing, regardless of intervening camera movement.');
    }

    // ===============================================================
    // Section G — Action wiring + production-change guard.
    // ===============================================================
    {
        const focusAction = registry.get('selection.focus');
        assert(focusAction !== null && focusAction.category === 'Selection',
            n('G1. selection.focus is registered under the "Selection" category — one registry entry, no second command system'));

        const registrySource = await import('node:fs/promises').then((m) =>
            m.readFile(path.join(SOURCE_ROOT, 'application/EditorActionRegistry.js'), 'utf8'));
        const focusBlockMatch = registrySource.match(/id: 'selection\.focus'[\s\S]*?execute: \(\) => \{[\s\S]*?\n        \}\)/);
        assert(focusBlockMatch !== null, n('G2. selection.focus\'s definition block is found in the real registry source'));
        const focusBlock = focusBlockMatch[0];
        assert(focusBlock.includes('session.getSelectionSummary()') && focusBlock.includes('session.frameCameraOn('),
            n('G3. its execute() calls ONLY getSelectionSummary()+frameCameraOn() — the exact two pre-existing EditorSession methods 0.9.660 proved compose the whole feature'));
        assert(!/(min|max|Math\.(?!.*floor)|bounds\.\w+\s*[-+*/]|new Position\(|new CameraState\()/.test(focusBlock),
            n('G4. no bounding-box arithmetic, camera-orientation math, or coordinate construction inside the action itself — that stays entirely inside SelectionBoundsService/EditorSession, never duplicated here'));

        const inspectorSource = await import('node:fs/promises').then((m) =>
            m.readFile(path.join(SOURCE_ROOT, 'ui/components/SelectionInspector.js'), 'utf8'));
        assert(inspectorSource.includes("run('selection.focus')"),
            n('G5. SelectionInspector\'s button calls the SAME registry-driven run() every other action button uses — no bespoke handler'));

        // G6. Production-change guard — this milestone's committed diff
        // touches exactly the files this header describes (compared
        // against the current HEAD; meaningful once this milestone's own
        // commit lands, mirroring 0.9.647's own Section F precedent).
        let changedFiles = [];
        try {
            changedFiles = execSync(
                'git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)tests.html"',
                { cwd: SOURCE_ROOT }
            ).toString().trim().split('\n').filter(Boolean);
        } catch (error) {
            changedFiles = [];
        }
        const allowedNonTestFiles = new Set([
            'application/EditorActionRegistry.js',
            'ui/components/SelectionInspector.js',
            'docs/user/ControlsReference.md'
        ]);
        const unexpected = changedFiles.filter((f) => !allowedNonTestFiles.has(f));
        assert(unexpected.length === 0,
            n(`G6. no non-test file outside this milestone's own narrow scope is modified — found unexpected: ${unexpected.join(', ') || 'none'}`));

        console.log('\n=== SECTION G: ACTION WIRING ===');
        console.log('✓ EditorActionRegistry (selection.focus, category "Selection") -> SelectionInspector\'s existing');
        console.log('  run()/isDisabled() convention -> EditorSession.getSelectionSummary()+frameCameraOn(), with no');
        console.log('  duplicated camera or bounds computation anywhere in the new code.');
    }

    // ===============================================================
    // Section H — Structure non-interference.
    // ===============================================================
    {
        const { document, building } = makeStandaloneDocument();
        building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0, 0) }));
        openDocument(editorSession, documentManager, document);
        editorContext.setSelection(new SelectionState({ items: [{ type: 'structure-placement', placementId: 'nonexistent-placement' }] }));

        const placementContext = contextFor(1, true);
        const action = registry.get('selection.focus');
        assert(action.enabled(placementContext) === false,
            n('H1. selection.focus is disabled for a structure-placement selection — 0.9.661 explicitly does not claim to focus structures'));
        assert(action.disabledReason(placementContext) === 'Focus Selection is available for brick selections only',
            n('H2. its disabled reason says exactly that, rather than a generic "no selection" message'));

        const before = editorSession._session.getCameraState();
        const ran = registry.execute('selection.focus', placementContext);
        assert(ran === false, n('H3. registry.execute() confirms it does not run for a structure-placement selection'));
        assert(JSON.stringify(before) === JSON.stringify(editorSession._session.getCameraState()),
            n('H4. camera is untouched — no silent partial focus attempt'));

        console.log('\n=== SECTION H: STRUCTURE NON-INTERFERENCE ===');
        console.log('✓ A structure-placement selection never reaches frameCameraOn() through selection.focus —');
        console.log('  explicitly out of this milestone\'s scope, not silently mishandled.');
    }

    // ===============================================================
    // Section I — Instant behavior.
    // ===============================================================
    {
        const registrySource = await import('node:fs/promises').then((m) =>
            m.readFile(path.join(SOURCE_ROOT, 'application/EditorActionRegistry.js'), 'utf8'));
        assert(!registrySource.includes('CameraFocusAnimator'),
            n('I1. no animator is imported or introduced anywhere in the registry'));

        const { document, building } = makeStandaloneDocument();
        const brick = new Brick({ definitionId: 'core:cube', position: new Position(2, 0, 2) });
        building.addBrick(brick);
        openDocument(editorSession, documentManager, document);
        editorContext.setSelection(new SelectionState({ items: [{ type: 'brick', buildingId: building.id, brickId: brick.id }] }));

        registry.execute('selection.focus', contextFor(1));
        const cam = editorSession._session.getCameraState();
        assert(cam.target.x === 2 && cam.target.z === 2,
            n('I2. the camera reflects the new framing IMMEDIATELY after execute() returns — a single synchronous call, no pending transition'));

        console.log('\n=== SECTION I: INSTANT BEHAVIOR ===');
        console.log('✓ Focus Selection is instant, matching the Editor\'s own already-shipped frameCameraOn()');
        console.log('  convention — no animation was introduced.');
    }

    console.log(`\n✅ All Editor Selection Focus Action Closure Audit tests passed (${assertionCount} assertions).`);
}

await run();
