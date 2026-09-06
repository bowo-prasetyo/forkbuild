import { readFile } from 'node:fs/promises';

import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { EditorSession } from '../application/EditorSession.js';
import { EditorContext } from '../application/EditorContext.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { SelectionUseCase } from '../application/SelectionUseCase.js';
import { PreviewUseCase } from '../application/PreviewUseCase.js';
import { SelectionState } from '../application/editor-state/SelectionState.js';

// 0.9.214 — Editor Transform Gesture Feedback.
//
// 0.9.212 found the seam: SpatialEditingService.getGestureFeedback() is
// rebuilt correctly every gesture frame, TransformGizmoController reads
// it and returns it as `.feedback` on its pointer-event results, and
// EditorSession.onPointerMove()/onPointerUp() already forward the whole
// result (feedback included) once the gizmo consumes the event. But
// EditorView.js's own pointer handlers discarded that return value
// outright, and the purpose-built ui/components/TransformFeedback.js
// (0.1.47) was never imported or mounted.
//
// This milestone closes exactly that seam: EditorView.js now captures
// the return value of onPointerMove()/onPointerUp() into a local
// `transformFeedback` ref and mounts TransformFeedback.js, bound to it.
// No new transform math, no new gesture semantics, no second feedback
// shape — SpatialEditingService, TransformGizmoController, and
// EditorSession are all byte-for-byte unchanged (see
// tests/PostUndoRedoProductReassessment.test.js's own updated Section
// G1 for the structural confirmation of that).
//
// The gesture remains authoritative; the overlay merely observes it. The
// sections below exercise that lifecycle directly against a REAL
// EditorSession and a REAL SpatialEditingService/GizmoGestureRouter
// pair — the exact objects EditorView.js's pointer handlers call through
// — using a lightweight stub in place of the THREE.js/DOM-backed render
// session (application/RenderWorldUseCase.js), the same "stub the render
// session, keep everything else real" technique
// tests/WorldEditorContinuity.test.js's own stubRenderSession() already
// established. The stub reproduces the EXACT shape
// renderer/TransformGizmoController.js returns
// ({ consumed, hovered, feedback } / { consumed, committed, feedback })
// by driving the real gesture service through begin/preview/commit/
// cancelTransformGesture — it never reimplements gesture math (that is
// tests/TransformGizmo.test.js's own territory) and never touches
// CommandHistory directly.
//
// ui/components/TransformFeedback.js imports no Vue-external runtime
// (unlike ui/views/EditorView.js, which imports 'vue' and stays outside
// this repo's plain `node tests/*.test.js` sweep — see
// tests/EditorUndoRedoLabelMirrors.test.js's own header for the same
// note about CommandPalette.js) so Section C below evaluates its own
// computed properties directly, not a regex proxy for them.
//
//   Section A: Gesture start — feedback appears the instant a drag is
//              consumed, in the exact shape the overlay renders.
//   Section B: Live update — a second, different preview frame updates
//              the SAME feedback object; nothing is cached from frame 1.
//   Section C: Commit — the real mutation happens, exactly one history
//              entry exists, and the forwarded feedback returns to null
//              (the overlay's own idle state) — proven both on the raw
//              blob and through TransformFeedback's own computed
//              properties.
//   Section D: Cancel — Escape cancels the gesture inside the session
//              (the same path EditorView.js's keydown handler drives);
//              the brick reverts, no history entry is created, and the
//              forwarded feedback is what EditorView.js would clear to.
//   Section E: Undo/Redo convergence — committing, undoing, and redoing
//              a transform never touches gesture feedback at all; it
//              stays exactly the idle value the commit already left it.
//   Section F: Multiple gesture types — translate and rotate each
//              produce their own correctly-shaped feedback through the
//              identical begin/preview/commit lifecycle.
//   Section G: Structural boundary — EditorView.js's new lines only ever
//              assign `result.feedback`/null into the ref; they mount
//              TransformFeedback.js and clear the ref on Escape-cancel
//              and on SELECTION_CHANGED (document-switch isolation) —
//              and touch nothing named CommandHistory, Autosave,
//              Snapshot, Publication, or World placement.
//   Section H: Unmount hygiene — `transformFeedback` is declared with
//              ref(null) INSIDE setup(), not module-level state, so an
//              EditorView unmount/remount cannot carry a stale gesture
//              overlay from a previous mount into a new one.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function close(actual, expected, message) {
    assert(Math.abs(actual - expected) < 1e-9, `${message}: expected ${expected}, got ${actual}`);
}

function createWorldWithBrick(position = new Position(0, 0.5, 0)) {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    const brick = new Brick({ definitionId: 'core:cube', position, rotation: 0 });
    building.addBrick(brick);
    world.addBuilding(building);
    return { world, building, brickId: brick.id };
}

// Mirrors tests/EditorUndoRedoLabelMirrors.test.js's own buildSession():
// a REAL EditorSession with a REAL CommandHistory, session._commandHistory
// set directly (normally wired by EditorSession#start()/loadDocument(),
// unavailable headless here).
function buildSession({ world, building }) {
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const document = new Document({ world, metadata: new DocumentMetadata({ title: 'TransformGestureFeedback', author: 'tester' }) });
    const editorContext = new EditorContext();
    const documentManager = new DocumentManager();
    documentManager.load(document, 'transform-feedback-doc');

    const session = new EditorSession({
        registry: brickRegistry,
        editorContext,
        toolRegistry: null,
        documentManager,
        selectionUseCase: new SelectionUseCase(editorContext),
        previewUseCase: new PreviewUseCase(editorContext),
        loadDocumentUseCase: null
    });
    session._commandHistory = new CommandHistory({ world });
    session._editorCommandHistories.set(world.id, session._commandHistory);

    // The stub render session (in place of application/RenderWorldUseCase.js
    // — real THREE.js/a real <canvas> are not available here). Every
    // gizmoPointerDown/Move/Up/KeyDown call below drives the REAL
    // session._gizmoGestureRouter (constructed by EditorSession's own
    // constructor, unaffected by never calling _rebuild()/start()) through
    // the exact same begin/preview/commit/cancelTransformGesture contract
    // renderer/TransformGizmoController.js drives it through, and returns
    // results shaped exactly like that controller's own onPointerMove()/
    // onPointerUp() — see that file's own onPointerMove()/onPointerUp()
    // for the shape this mirrors.
    const router = session._gizmoGestureRouter;
    session._session = {
        pick() { return null; }, pickGround() { return null; }, pickPlacement() { return null; },
        pickRectangle() { return []; },
        setControlsEnabled() {},
        showGizmo() {}, hideGizmo() {},
        gizmoHitTest() { return true; },
        gizmoPointerDown(screenX, screenY, selection) {
            if (!selection || selection.isEmpty) {
                return false;
            }
            const mode = this._nextMode || 'translate';
            const axis = mode === 'rotate' ? 'y' : 'x';
            return !!router.beginTransformGesture(selection, { mode, axis });
        },
        gizmoPointerMove(screenX, screenY, selection, modifiers = null) {
            if (!session.isGestureActive()) {
                return { consumed: false, hovered: false, feedback: null };
            }
            const transform = this._nextMode === 'rotate'
                ? { rotation: screenX }
                : { translation: { x: screenX, y: 0, z: 0 } };
            router.previewTransformGesture(selection, transform, { modifiers });
            return { consumed: true, hovered: false, feedback: router.getGestureFeedback() };
        },
        gizmoPointerUp(screenX, screenY, selection, modifiers = null) {
            if (!session.isGestureActive()) {
                return null;
            }
            const transform = this._nextMode === 'rotate'
                ? { rotation: screenX }
                : { translation: { x: screenX, y: 0, z: 0 } };
            const committed = router.commitTransformGesture(selection, transform, { modifiers });
            return { consumed: true, committed: committed === true, feedback: null };
        },
        gizmoKeyDown(keyEvent, selection) {
            if (keyEvent.key === 'Escape' && session.isGestureActive()) {
                router.cancelTransformGesture(selection);
                return true;
            }
            return false;
        },
        cancelGizmoGesture() { router.cancelTransformGesture(null); },
        isGizmoDragging() { return session.isGestureActive(); },
        getCameraState() { return { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, zoom: 1 }; },
        setCameraState() {},
        dispose() {}
    };
    // Test-only lever: which mode the NEXT gizmoPointerDown() begins.
    // TransformGizmoController itself decides this from which handle was
    // hit (0.1.46) — irrelevant to what this milestone touches, so the
    // stub takes it as a direct instruction instead of reimplementing hit
    // testing.
    session._session._nextMode = 'translate';

    return { session, editorContext, documentManager, document, brickRegistry, building };
}

function selectBrick(editorContext, building, brickId) {
    editorContext.setSelection(new SelectionState({ buildingId: building.id, brickId }));
}

function pointerEvent(clientX, extra = {}) {
    return { button: 0, clientX, clientY: 0, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...extra };
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function extractArrowBody(source, name) {
    const match = source.match(new RegExp(`${name}\\s*=\\s*\\(event\\)\\s*=>\\s*\\{([\\s\\S]*?)\\n\\s{12}\\};`));
    return match ? match[1] : null;
}

// Manual evaluation of ui/components/TransformFeedback.js's own computed
// properties, in dependency order (title/lines read precise/invalid) —
// the same "instantiate the real definition object, call its own
// methods" technique tests/EditorUndoRedoLabelMirrors.test.js's own
// Section A already used for ui/components/CommandPalette.js.
function evaluateTransformFeedback(TransformFeedback, feedback) {
    const ctx = { feedback, formatNumber: TransformFeedback.methods.formatNumber, formatSigned: TransformFeedback.methods.formatSigned };
    ctx.visible = TransformFeedback.computed.visible.call(ctx);
    ctx.precise = TransformFeedback.computed.precise.call(ctx);
    ctx.invalid = TransformFeedback.computed.invalid.call(ctx);
    ctx.title = TransformFeedback.computed.title.call(ctx);
    ctx.lines = TransformFeedback.computed.lines.call(ctx);
    return ctx;
}

async function run() {
    const TransformFeedback = (await import('../ui/components/TransformFeedback.js')).default;

    // -------------------------------------------------------------
    // A. Gesture start — feedback appears.
    // -------------------------------------------------------------
    {
        const { world, building, brickId } = createWorldWithBrick();
        const { session, editorContext } = buildSession({ world, building });
        selectBrick(editorContext, building, brickId);

        assert(session.isGestureActive() === false, '1. no gesture active before any pointer interaction');
        const downResult = session.onPointerDown(pointerEvent(0));
        assert(downResult === null, '2. onPointerDown never itself carries feedback — no preview exists yet at grab time');
        assert(session.isGestureActive() === true, '3. the gizmo drag is now the SAME gesture SpatialEditingService tracks — begun by EditorSession\'s own pointer handler, exactly as the real controller would');

        const moveResult = session.onPointerMove(pointerEvent(2));
        assert(moveResult && moveResult.consumed === true, '4. a consumed drag frame is returned, exactly like TransformGizmoController.onPointerMove()');
        assert(moveResult.feedback !== null, '5. feedback is present the instant the drag is consumed');
        assert(moveResult.feedback.mode === 'translate' && moveResult.feedback.axis === 'x', '6. feedback correctly names the active operation and axis');
        close(moveResult.feedback.translation.x, 2, '7. feedback carries the live delta');

        const rendered = evaluateTransformFeedback(TransformFeedback, moveResult.feedback);
        assert(rendered.visible === true, '8. TransformFeedback.js renders this blob as visible');
        assert(/^Move X/.test(rendered.title), '9. ...with a title naming the operation and axis');
        assert(rendered.lines.some((line) => /\+2/.test(line)), '10. ...and a delta line matching the live translation');

        session.onKeyDown({ key: 'Escape' });
        console.log('✓ A. Gesture start — a consumed drag frame carries feedback in the exact shape EditorView.js\'s onPointerMove() forwards, and TransformFeedback.js renders it correctly.');
    }

    // -------------------------------------------------------------
    // B. Live update — a second, different frame updates the SAME
    //    feedback, never a stale or cached value from frame 1.
    // -------------------------------------------------------------
    {
        const { world, building, brickId } = createWorldWithBrick();
        const { session, editorContext } = buildSession({ world, building });
        selectBrick(editorContext, building, brickId);

        session.onPointerDown(pointerEvent(0));
        const first = session.onPointerMove(pointerEvent(1));
        close(first.feedback.translation.x, 1, '1. frame 1 carries delta 1');
        const second = session.onPointerMove(pointerEvent(5));
        close(second.feedback.translation.x, 5, '2. frame 2 carries the NEW delta, not frame 1\'s');
        assert(first.feedback !== second.feedback || first.feedback.translation.x !== second.feedback.translation.x, '3. the two frames are genuinely distinct values, not the same object read twice');

        const renderedSecond = evaluateTransformFeedback(TransformFeedback, second.feedback);
        assert(renderedSecond.lines.some((line) => /\+5/.test(line)), '4. TransformFeedback.js\'s own rendering tracks the live value, frame by frame');

        session.onKeyDown({ key: 'Escape' });
        console.log('✓ B. Live update — the SAME feedback surface follows the live gesture value frame by frame; nothing is cached from an earlier preview.');
    }

    // -------------------------------------------------------------
    // C. Commit — the real mutation happens, exactly one history entry
    //    exists, and forwarded feedback returns to the overlay's own
    //    idle state (null).
    // -------------------------------------------------------------
    {
        const { world, building, brickId } = createWorldWithBrick();
        const { session, editorContext } = buildSession({ world, building });
        selectBrick(editorContext, building, brickId);
        const history = session._commandHistory;

        session.onPointerDown(pointerEvent(0));
        session.onPointerMove(pointerEvent(3));
        assert(history.getExecutedCommands().length === 0, '1. preview alone creates no history entry — the gesture is still just a preview');

        const upResult = session.onPointerUp(pointerEvent(3));
        assert(upResult && upResult.consumed === true && upResult.committed === true, '2. release commits the gesture');
        assert(upResult.feedback === null, '3. the forwarded result reports feedback: null — the overlay\'s own idle state, set by the SAME object EditorView.js reads');
        close(building.findBrick(brickId).position.x, 3, '4. the normal document mutation actually happened — the brick moved');
        assert(history.getExecutedCommands().length === 1, '5. exactly one history entry exists — the feedback layer created no entry of its own, and did not duplicate the real one');
        assert(session.isGestureActive() === false, '6. the gesture is over');

        const rendered = evaluateTransformFeedback(TransformFeedback, upResult.feedback);
        assert(rendered.visible === false, '7. TransformFeedback.js renders feedback: null as not visible — the overlay disappears');

        console.log('✓ C. Commit — the normal document mutation and its one history entry happen exactly as they always did; the forwarded feedback returns to null (idle), and TransformFeedback.js renders that as invisible.');
    }

    // -------------------------------------------------------------
    // D. Cancel — Escape cancels the gesture inside the session (the
    //    same path EditorView.js's own keydown handler drives); no
    //    document mutation, no history entry.
    // -------------------------------------------------------------
    {
        const { world, building, brickId } = createWorldWithBrick();
        const { session, editorContext } = buildSession({ world, building });
        selectBrick(editorContext, building, brickId);
        const history = session._commandHistory;

        session.onPointerDown(pointerEvent(0));
        session.onPointerMove(pointerEvent(4));
        close(building.findBrick(brickId).position.x, 4, '1. the preview moved the brick, same as any other drag frame');

        // Exactly the path ui/views/EditorView.js's own keydown handler
        // takes: "if (editorSession.isGestureActive()) { editorSession.onKeyDown(event); ... }".
        assert(session.isGestureActive() === true, '2. sanity: a gesture is active before Escape');
        session.onKeyDown({ key: 'Escape' });
        assert(session.isGestureActive() === false, '3. Escape cancelled the gesture inside the session, exactly like a real gizmo drag');
        close(building.findBrick(brickId).position.x, 0, '4. cancel reverted the brick to its pre-gesture position — no partial commit');
        assert(history.getExecutedCommands().length === 0, '5. no history entry was created by the cancelled gesture');

        // EditorView.js's own onKeyDown branch has no return value to read
        // feedback from (unlike onPointerMove/onPointerUp) — it clears its
        // local ref directly once isGestureActive() goes false. The
        // session-level contract it depends on is exactly this: cancel
        // really does end the gesture, synchronously, with nothing left
        // to preview.
        assert(session._gestureService.getGestureFeedback() === null, '6. the underlying service\'s own feedback is null once cancelled — there is nothing left for a caller to read even without the pointerUp path\'s explicit feedback: null');

        console.log('✓ D. Cancel — Escape cancels the gesture inside the session (the same isGestureActive()-gated path EditorView.js\'s keydown handler drives); the brick reverts, no history entry appears, and there is no feedback left to show.');
    }

    // -------------------------------------------------------------
    // E. Undo/Redo convergence — a committed transform's undo/redo never
    //    touches gesture feedback; it was already idle and stays idle.
    // -------------------------------------------------------------
    {
        const { world, building, brickId } = createWorldWithBrick();
        const { session, editorContext } = buildSession({ world, building });
        selectBrick(editorContext, building, brickId);
        const history = session._commandHistory;

        session.onPointerDown(pointerEvent(0));
        session.onPointerMove(pointerEvent(3));
        session.onPointerUp(pointerEvent(3));
        close(building.findBrick(brickId).position.x, 3, '1. committed');
        assert(session._gestureService.getGestureFeedback() === null, '2. feedback already idle right after commit');

        history.undo();
        close(building.findBrick(brickId).position.x, 0, '3. undo reverts the brick — the SAME CommandHistory this arc has always used, untouched by this milestone');
        assert(session._gestureService.getGestureFeedback() === null, '4. undo did not resurrect or touch gesture feedback — purely observational, as the brief requires');

        history.redo();
        close(building.findBrick(brickId).position.x, 3, '5. redo reapplies the brick move');
        assert(session._gestureService.getGestureFeedback() === null, '6. redo likewise leaves gesture feedback untouched');

        console.log('✓ E. Undo/Redo convergence — Undo then Redo round-trip the SAME CommandHistory this arc has always used; gesture feedback stays exactly the idle value the commit left it at, confirming the overlay never interferes with history.');
    }

    // -------------------------------------------------------------
    // F. Multiple gesture types — translate and rotate each produce
    //    correctly-shaped feedback through the identical lifecycle;
    //    this milestone introduces no new operation.
    // -------------------------------------------------------------
    {
        const { world, building, brickId } = createWorldWithBrick();
        const { session, editorContext } = buildSession({ world, building });
        selectBrick(editorContext, building, brickId);

        session._session._nextMode = 'translate';
        session.onPointerDown(pointerEvent(0));
        const translateFeedback = session.onPointerMove(pointerEvent(2)).feedback;
        assert(translateFeedback.mode === 'translate', '1. translate gesture reports mode: translate');
        assert(/^Move/.test(evaluateTransformFeedback(TransformFeedback, translateFeedback).title), '2. ...rendered as a Move title');
        session.onKeyDown({ key: 'Escape' });

        session._session._nextMode = 'rotate';
        session.onPointerDown(pointerEvent(0));
        const rotateFeedback = session.onPointerMove(pointerEvent(45)).feedback;
        assert(rotateFeedback.mode === 'rotate', '3. rotate gesture reports mode: rotate — the SAME existing operation, not a new one');
        assert(/^Rotate/.test(evaluateTransformFeedback(TransformFeedback, rotateFeedback).title), '4. ...rendered as a Rotate title');
        session.onKeyDown({ key: 'Escape' });

        console.log('✓ F. Multiple gesture types — translate and rotate, the Editor\'s two existing gizmo operations, both surface correctly through the same overlay with no new operation introduced.');
    }

    // -------------------------------------------------------------
    // G. Structural boundary — EditorView.js's new lines only ever
    //    pass through result.feedback/null, mount TransformFeedback.js,
    //    and clear the ref on Escape-cancel and SELECTION_CHANGED
    //    (document-switch isolation) — never touching CommandHistory,
    //    Autosave, Snapshot, Publication, or World placement.
    // -------------------------------------------------------------
    {
        const editorViewSource = await rawSource('ui/views/EditorView.js');

        assert(/import TransformFeedback from '..\/components\/TransformFeedback\.js';/.test(editorViewSource), '1. EditorView.js imports TransformFeedback');
        assert(/<TransformFeedback :feedback="transformFeedback" \/>/.test(editorViewSource), '2. ...and mounts it bound to a transformFeedback ref');

        const onPointerMoveBody = extractArrowBody(editorViewSource, 'onPointerMove');
        const onPointerUpBody = extractArrowBody(editorViewSource, 'onPointerUp');
        assert(onPointerMoveBody && onPointerUpBody, '3. both handlers still exist in the expected arrow-function shape');
        for (const [name, body] of [['onPointerMove', onPointerMoveBody], ['onPointerUp', onPointerUpBody]]) {
            assert(/const result = editorSession\.on\w+\(event\);/.test(body), `4. ${name} captures editorSession's return value`);
            assert(/transformFeedback\.value = result\.feedback \|\| null;/.test(body), `5. ${name} assigns ONLY result.feedback (or null) into the ref — a bare passthrough, no reconstruction`);
            assert(!/CommandHistory|Autosave|Snapshot|Publication|updateBrick|\.execute\(/.test(body), `6. ${name} touches no history/autosave/snapshot/publication/world-mutation API directly — it only ever reads the forwarded feedback`);
        }

        // Escape-cancel: the gesture-active keydown branch clears the ref
        // once the session reports the gesture is no longer active —
        // Section D's own domain-level proof above shows that transition
        // really happens; this confirms the view actually reacts to it.
        const escapeBranchMatch = editorViewSource.match(/if \(editorSession\.isGestureActive\(\)\) \{([\s\S]*?)\n[ \t]*return;\n[ \t]*\}/);
        assert(escapeBranchMatch, '7. the gesture-active keydown branch still exists in the expected shape');
        assert(/clearTransformFeedback\(\)/.test(escapeBranchMatch[1]), '8. ...and now clears transformFeedback once isGestureActive() goes false after onKeyDown()');

        // Document-switch isolation: every _rebuild() (loadDocument/
        // openDocument/newDocument) clears the selection before anything
        // else, firing SELECTION_CHANGED — the one existing signal broad
        // enough to guarantee a gesture overlay from a previous document
        // can never bleed into a new one.
        const selectionChangedMatch = editorViewSource.match(/EditorEvent\.SELECTION_CHANGED,\s*\(\{ selection \}\) => \{([\s\S]*?)\n\s{16}\}\n\s{12}\);/);
        assert(selectionChangedMatch, '9. the SELECTION_CHANGED subscription still exists in the expected shape');
        assert(/clearTransformFeedback\(\)/.test(selectionChangedMatch[1]), '10. ...and now clears transformFeedback on every selection change, including the one _rebuild() always fires on a document switch');

        // TransformFeedback.js itself remains purely presentational — the
        // milestone's own "not a new transform system" boundary.
        const transformFeedbackSource = await rawSource('ui/components/TransformFeedback.js');
        assert(!/CommandHistory|Autosave|Snapshot|Publication|import\s/.test(transformFeedbackSource.replace(/\/\/.*$/gm, '')), '11. TransformFeedback.js still imports nothing and references no history/autosave/snapshot/publication machinery');

        console.log('✓ G. Structural boundary — EditorView.js\'s new lines are a bare passthrough of result.feedback, clear the overlay on Escape-cancel and on every SELECTION_CHANGED (document-switch isolation), and touch nothing outside the gesture-feedback seam itself.');
    }

    // -------------------------------------------------------------
    // H. Unmount hygiene — transformFeedback is local setup() state.
    // -------------------------------------------------------------
    {
        const editorViewSource = await rawSource('ui/views/EditorView.js');
        const setupBody = editorViewSource.slice(editorViewSource.indexOf('setup() {'), editorViewSource.lastIndexOf('return {'));
        assert(/const transformFeedback = ref\(null\);/.test(setupBody), '1. transformFeedback is declared with ref(null) INSIDE setup() — fresh on every mount, not shared module-level state');
        assert(!/^\s*(let|const)\s+transformFeedback\s*=/m.test(editorViewSource.slice(0, editorViewSource.indexOf('export default'))), '2. no module-level transformFeedback declaration exists above the component definition either');
        console.log('✓ H. Unmount hygiene — transformFeedback lives entirely inside setup(); an EditorView unmount/remount gets a fresh ref, so a stale gesture overlay cannot survive it.');
    }

    console.log('\n✅ All Editor Transform Gesture Feedback tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
