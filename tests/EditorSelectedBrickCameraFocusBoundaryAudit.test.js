import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { CreateEditorContextUseCase } from '../application/editor/CreateEditorContextUseCase.js';
import { DocumentManager } from '../application/document/DocumentManager.js';
import { SelectionUseCase } from '../application/editor/SelectionUseCase.js';
import { PreviewUseCase } from '../application/editor/PreviewUseCase.js';
import { EditorSession } from '../application/editor/EditorSession.js';
import { CommandHistory } from '../application/editor/CommandHistory.js';
import { SelectionState } from '../application/editor-state/SelectionState.js';
import { EditorActionRegistry, createStandardActions } from '../application/editor/EditorActionRegistry.js';
import { EditorActionContext } from '../application/editor/EditorActionContext.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { editorSessionFiles, worldNavigationSessionFiles } from './support/SourceFileGroups.js';

// 0.9.660 — Editor Selected-Brick Camera Focus Boundary Audit.
//
// TEST-ONLY. ZERO PRODUCTION CHANGES.
//
// The requesting brief asks one question before any camera-movement code
// gets written: does the Editor's EXISTING camera/selection architecture
// already provide enough primitives to implement a deterministic "focus
// selection" action, without inventing a second camera-control system?
//
// This file answers that question against real, current production code
// only — application/editor/EditorSession.js, application/editor/SelectionBoundsService.js,
// application/editor-state/SelectionState.js, application/editor/EditorActionRegistry.js,
// application/world/WorldNavigationSession.js, application/editor/CameraFocusAnimator.js — never
// a bespoke stand-in for any of them.
//
// SECTIONS, mirroring the brief's own lettering:
//   A. The World View precedent — focusLocation()/focusCollaborator()'s
//      real semantic contract (offset formula, target, distance,
//      animation, side effects).
//   B. Editor selection identity — what SelectionState actually carries,
//      and whether a selected brick resolves to real geometry directly.
//   C. The correct target point — SelectionBoundsService's real
//      bounding-box CENTER convention, proven distinct from a naive
//      average-of-positions.
//   D. Camera-distance semantics — frameCameraOn()'s real, existing fixed
//      offset, and its real limitation (no size-based scaling).
//   E. Selection lifecycle — the brief's own table, run live.
//   F. Camera-state side effects — the "camera only" invariant, proven
//      against real document/selection/history state.
//   G. Repeatability — same selection, same result, regardless of prior
//      camera state.
//   H. The natural UI seam — EditorActionRegistry's existing Selection
//      category and SelectionInspector's existing bounds reading.
//   I. Multiple-selection and structure-placement scope — where the
//      existing primitives already answer the brief's own open questions,
//      and where a real, explicit scope decision remains.
//   J. Animation asymmetry — World animates a focus; Editor does not.
//   K. Full composition proof — the flagship: "Focus Selection" assembled
//      from EXISTING methods alone, zero new production code, proven to
//      work end to end for both a single-brick and a multi-brick
//      selection.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

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
    return { document: new Document({ world, metadata: new DocumentMetadata({ title: 'Audit World', author: 'alice' }) }), building };
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
    return { editorSession, editorContext, documentManager, registry };
}

function openDocument(editorSession, documentManager, document) {
    documentManager.newDocument(document);
    editorSession._commandHistory = new CommandHistory({ world: document.world });
}

async function run() {
    // ===============================================================
    // Section A — The World View precedent, traced against real source.
    // ===============================================================
    {
        const navigationSession = new WorldNavigationSession({});
        assert(typeof navigationSession.focusLocation === 'function',
            n('A1. WorldNavigationSession#focusLocation exists — the real precedent this audit traces'));

        // A2. focusLocation()'s own real offset constant, read via the
        // exact module this codebase already imports it from, never a
        // re-typed literal that could silently drift from the source.
        const worldModuleSource = await (await import('node:fs/promises')).(await Promise.all(worldNavigationSessionFiles().map((file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8')))).join('\n');
        assert(worldModuleSource.includes('const LOCATION_FOCUS_OFFSET = { x: 12, y: 12, z: 12 };'),
            n('A2. WorldNavigationSession\'s real focus offset is a FIXED { x: 12, y: 12, z: 12 } box — never derived from any target\'s own size'));
        assert(worldModuleSource.includes('const CAMERA_FOCUS_DURATION_MS = 900;'),
            n('A2. World focus is ANIMATED over a fixed 900ms duration when the session can tick frames'));

        // A3. Target = the focused thing's own raw position, offset
        // applied only to the CAMERA side, never to the look-at target.
        assert(/position:\s*{\s*x:\s*x \+ LOCATION_FOCUS_OFFSET\.x.*target:\s*{\s*x,\s*y,\s*z\s*}/s.test(worldModuleSource),
            n('A3. World\'s real framing shape: camera = target + fixed offset, target = the focused position itself — never a bounding-volume computation of its own'));

        // A4. Never touches selection/document/mutation state — this
        // codebase's own recorded architectural boundary, not this
        // audit's own assertion.
        const principlesSource = await (await import('node:fs/promises')).readFile(
            new URL('../docs/Principles.md', import.meta.url), 'utf8');
        assert(principlesSource.includes('### Navigation Never Implies Editing (0.2.27)'),
            n('A4. "Navigation Never Implies Editing" is an existing, recorded architectural principle — a focus operation inherits it, it does not invent it'));

        console.log('\n=== SECTION A: WORLD VIEW PRECEDENT ===');
        console.log('✓ World\'s semantic contract: target = focused position, camera = target + FIXED offset (never');
        console.log('  size-derived), animated over a fixed duration when frame-ticking is available, and — by an');
        console.log('  existing, named architectural principle — never touches selection, document, or history state.');
    }

    // ===============================================================
    // Section B — Editor selection identity.
    // ===============================================================
    let registry, editorSession, editorContext, documentManager, buildingId, cubeBrickId, plateBrickId;
    {
        ({ editorSession, editorContext, documentManager, registry } = makeEditorSession());
        const { document, building } = makeStandaloneDocument();
        buildingId = building.id;

        const cubeBrick = new Brick({ definitionId: 'core:cube', position: new Position(0, 0, 0) });
        const plateBrick = new Brick({ definitionId: 'core:plate_2x4', position: new Position(10, 0, 0) });
        building.addBrick(cubeBrick);
        building.addBrick(plateBrick);
        cubeBrickId = cubeBrick.id;
        plateBrickId = plateBrick.id;

        openDocument(editorSession, documentManager, document);
        editorContext.setSelection(new SelectionState({ items: [{ type: 'brick', buildingId, brickId: cubeBrickId }] }));

        // B1. Selection identity is exactly { type, buildingId, brickId }
        // — no fourth field, no denormalized geometry cached alongside it.
        const item = editorContext.selection.items[0];
        assert(Object.keys(item).sort().join(',') === 'brickId,buildingId,type',
            n('B1. a brick selection item carries exactly buildingId/brickId/type — no cached geometry, no camera state'));

        // B2. That identity resolves DIRECTLY to real geometry — through
        // World.getBuilding()/Building.findBrick(), never a scan of
        // unrelated application state (tool state, camera state,
        // clipboard, groups, etc.).
        const resolvedBuilding = documentManager.document.world.getBuilding(item.buildingId);
        const resolvedBrick = resolvedBuilding.findBrick(item.brickId);
        assert(resolvedBrick === cubeBrick,
            n('B2. selection identity resolves to the SAME real Brick instance via World.getBuilding()+Building.findBrick() — no second lookup path'));

        console.log('\n=== SECTION B: EDITOR SELECTION IDENTITY ===');
        console.log('✓ A brick selection item is { type, buildingId, brickId } and resolves directly to its own real');
        console.log('  geometry through the World/Building the document already owns — no second "currently focused');
        console.log('  object" identity would be needed for a focus operation to find what it targets.');
    }

    // ===============================================================
    // Section C — The correct target point.
    // ===============================================================
    {
        // C1. A single-brick selection's bounds center equals that
        // brick's own position exactly (core:cube is symmetric: 1x1x1).
        editorContext.setSelection(new SelectionState({ items: [{ type: 'brick', buildingId, brickId: cubeBrickId }] }));
        let summary = editorSession.getSelectionSummary();
        assert(summary !== null, n('C1. getSelectionSummary() is non-null for a single real brick selection'));
        assert(summary.bounds.center.x === 0 && summary.bounds.center.y === 0 && summary.bounds.center.z === 0,
            n('C1. single-brick bounds center exactly equals that brick\'s own position for a symmetric brick'));

        // C2. The flagship distinction: for a MULTI-brick selection of
        // DIFFERENTLY-SIZED bricks, the bounds CENTER (what
        // SelectionBoundsService actually returns) is NOT the same value
        // as a naive average of the two bricks' raw positions — proving
        // "bounding-box center" is a real, distinct decision already
        // made in this codebase, not an assumption this audit invents.
        editorContext.setSelection(new SelectionState({
            items: [
                { type: 'brick', buildingId, brickId: cubeBrickId },   // core:cube at (0,0,0), 1x1x1
                { type: 'brick', buildingId, brickId: plateBrickId }   // core:plate_2x4 at (10,0,0), 2x0.25x4
            ]
        }));
        summary = editorSession.getSelectionSummary();
        assert(summary !== null, n('C2. getSelectionSummary() is non-null for a two-brick selection'));
        // Union AABB: cube spans x[-0.5,0.5]; plate spans x[9,11] (width 2 centered on 10).
        // Union min.x = -0.5, max.x = 11 -> center.x = 5.25.
        const averageOfPositions = (0 + 10) / 2; // = 5, what a naive centroid would give
        assert(Math.abs(summary.bounds.center.x - 5.25) < 1e-9,
            n('C2. two-brick union bounds center.x is 5.25 (the real AABB-union midpoint), not 5 (a naive average of raw positions) — confirming SelectionBoundsService already answers "which point" with a specific, non-trivial convention'));
        assert(summary.bounds.center.x !== averageOfPositions,
            n('C2. bounding-box center and centroid-of-positions are PROVEN distinct values here — "brick geometric center" vs "brick bounding-box center" from the brief\'s own Section C is not an open question, it is already answered by production code'));
        assert(summary.count === 2, n('C2. summary.count reports 2 for a two-item selection'));

        console.log('\n=== SECTION C: TARGET POINT ===');
        console.log('✓ SelectionBoundsService.calculate() already implements ONE specific convention — the union');
        console.log('  bounding-box center — and it is live-proven distinct from a naive average of brick positions.');
        console.log('  A focus operation needs no new geometry decision: reuse summary.bounds.center verbatim.');
    }

    // ===============================================================
    // Section D — Camera-distance semantics.
    // ===============================================================
    {
        // D1. frameCameraOn()'s real offset is byte-identical to World's
        // LOCATION_FOCUS_OFFSET — one shared convention, not a second.
        const editorModuleSource = await (await import('node:fs/promises')).(await Promise.all(editorSessionFiles().map((file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8')))).join('\n');
        assert(editorModuleSource.includes('const ENTRY_CAMERA_OFFSET = { x: 12, y: 12, z: 12 };'),
            n('D1. EditorSession\'s real ENTRY_CAMERA_OFFSET is { x: 12, y: 12, z: 12 } — the exact same fixed box World uses'));

        // D2. Live proof: the offset does NOT scale with selection size.
        // frameCameraOn() applied to a tiny selection's center and to a
        // huge selection's center produces the SAME relative offset
        // either way — this is the real, existing limitation the brief's
        // Section D worried about, confirmed rather than assumed.
        editorSession.frameCameraOn({ x: 0, y: 0, z: 0 });
        let cam = editorSession._session.getCameraState();
        const smallOffset = { x: cam.position.x - 0, y: cam.position.y - 0, z: cam.position.z - 0 };

        editorSession.frameCameraOn({ x: 1000, y: 1000, z: 1000 });
        cam = editorSession._session.getCameraState();
        const largeOffset = { x: cam.position.x - 1000, y: cam.position.y - 1000, z: cam.position.z - 1000 };

        assert(smallOffset.x === largeOffset.x && smallOffset.y === largeOffset.y && smallOffset.z === largeOffset.z,
            n('D2. frameCameraOn()\'s real offset from target is IDENTICAL regardless of how far apart the underlying selection\'s bricks are — confirming no size-based framing exists today, and a "Focus Selection" built on it inherits that exact, already-accepted limitation rather than a new one'));
        assert(smallOffset.x === 12 && smallOffset.y === 12 && smallOffset.z === 12,
            n('D2. that fixed offset is exactly (12,12,12) — the SAME value D1 found in source, live-confirmed through an actual call'));

        console.log('\n=== SECTION D: CAMERA-DISTANCE SEMANTICS ===');
        console.log('✓ frameCameraOn() already has a "look at target from distance" primitive — a fixed diagonal');
        console.log('  offset, identical to World\'s own. It does not scale with selection size; a very large or');
        console.log('  very small selection gets the identical relative framing. This is an EXISTING, already-');
        console.log('  shipped convention (0.6.0), not a gap this milestone introduces — a size-aware framing');
        console.log('  algorithm remains exactly the kind of complexity the brief asks this audit NOT to build.');
    }

    // ===============================================================
    // Section E — Selection lifecycle, run live.
    // ===============================================================
    {
        // E1. One brick selected -> focus available (summary resolvable).
        editorContext.setSelection(new SelectionState({ items: [{ type: 'brick', buildingId, brickId: cubeBrickId }] }));
        assert(editorSession.getSelectionSummary() !== null,
            n('E1. one brick selected -> getSelectionSummary() resolves -> focus is available'));

        // E2. No selection -> graceful no-op, not an exception.
        editorContext.clearSelection();
        assert(editorSession.getSelectionSummary() === null,
            n('E2. no selection -> getSelectionSummary() is null -> a focus action gates to disabled exactly like selection.duplicate/selection.delete already do, no new enablement rule needed'));

        // E3. Selection cleared mid-flow -> unavailable (same as E2, from
        // a previously non-empty state, proving it re-evaluates fresh
        // rather than caching the last resolvable target).
        editorContext.setSelection(new SelectionState({ items: [{ type: 'brick', buildingId, brickId: cubeBrickId }] }));
        assert(editorSession.getSelectionSummary() !== null, n('E3a. selection re-established -> available again'));
        editorContext.clearSelection();
        assert(editorSession.getSelectionSummary() === null, n('E3b. ...and cleared again -> unavailable again, fresh each time'));

        // E4. Selected brick deleted out from under the selection -> no
        // stale camera target. SelectionState still references the old
        // (now-deleted) brickId — a real EditorSession.deleteSelection()
        // call is used here, not a hand-rolled deletion, so this proves
        // the REAL delete path, not a stand-in for it.
        editorContext.setSelection(new SelectionState({ items: [{ type: 'brick', buildingId, brickId: cubeBrickId }] }));
        assert(editorSession.getSelectionSummary() !== null, n('E4a. selected before deletion -> available'));
        editorSession.deleteSelection();
        assert(editorSession.getSelectionSummary() === null,
            n('E4b. brick deleted via the real deleteSelection() -> getSelectionSummary() is null -> SelectionBoundsService\'s own "if (!brick) return null" already guarantees no stale camera target, with zero new code'));

        // Restore state for subsequent sections (re-add the cube brick).
        const restoredCube = new Brick({ id: cubeBrickId, definitionId: 'core:cube', position: new Position(0, 0, 0) });
        documentManager.document.world.getBuilding(buildingId).addBrick(restoredCube);

        // E5. Selection changes -> next focus target reflects the NEW
        // selection, not the old one.
        editorContext.setSelection(new SelectionState({ items: [{ type: 'brick', buildingId, brickId: cubeBrickId }] }));
        const firstCenter = editorSession.getSelectionSummary().bounds.center;
        editorContext.setSelection(new SelectionState({ items: [{ type: 'brick', buildingId, brickId: plateBrickId }] }));
        const secondCenter = editorSession.getSelectionSummary().bounds.center;
        assert(firstCenter.x !== secondCenter.x,
            n('E5. changing the selection changes the resolved target immediately — the next focus would use the NEW brick, never a cached one'));

        // E6. Multiple selection — the brief flags this as needing an
        // "explicit decision." Live proof: SelectionBoundsService already
        // treats it uniformly (Section C's own union bounds), so there is
        // no silent "pick one of N" ambiguity to resolve — "Focus
        // Selection" for 1 brick and for N bricks is the SAME call with
        // the SAME semantics already, not two different operations.
        editorContext.setSelection(new SelectionState({
            items: [
                { type: 'brick', buildingId, brickId: cubeBrickId },
                { type: 'brick', buildingId, brickId: plateBrickId }
            ]
        }));
        const multiSummary = editorSession.getSelectionSummary();
        assert(multiSummary !== null && multiSummary.count === 2,
            n('E6. a multi-brick selection resolves through the identical getSelectionSummary()/bounds path as a single-brick one — no separate "Focus Selection" operation is needed for the multi case'));

        console.log('\n=== SECTION E: SELECTION LIFECYCLE ===');
        console.log('✓ Every row in the brief\'s own table is already answered by EXISTING code: empty/cleared ->');
        console.log('  null (disable), deleted brick -> null (no stale target, for free), changed selection ->');
        console.log('  fresh target, multiple selection -> the SAME union-bounds path as one brick, not a distinct,');
        console.log('  ambiguous case needing its own design decision.');
    }

    // ===============================================================
    // Section F — Camera-state side effects: "camera only" invariant.
    // ===============================================================
    {
        const { document: freshDoc, building: freshBuilding } = makeStandaloneDocument();
        const brick = new Brick({ definitionId: 'core:cube', position: new Position(3, 1, -2) });
        freshBuilding.addBrick(brick);
        const fbid = freshBuilding.id, brid = brick.id;
        openDocument(editorSession, documentManager, freshDoc);
        editorContext.setSelection(new SelectionState({ items: [{ type: 'brick', buildingId: fbid, brickId: brid }] }));

        const beforeDocumentJSON = JSON.stringify(freshDoc.world.toJSON());
        const beforeSelection = editorContext.selection;
        const beforeCanUndo = editorSession._commandHistory.canUndo();
        const beforeDirty = documentManager.state.dirty;

        const events = [];
        const originalPublish = editorContext.eventBus.publish;
        editorContext.eventBus.publish = function (type, payload) {
            events.push(type);
            return originalPublish.call(this, type, payload);
        };

        const summary = editorSession.getSelectionSummary();
        editorSession.frameCameraOn(summary.bounds.center);

        editorContext.eventBus.publish = originalPublish;

        assert(JSON.stringify(freshDoc.world.toJSON()) === beforeDocumentJSON,
            n('F1. document/world content is byte-for-byte unchanged after frameCameraOn()'));
        assert(editorContext.selection === beforeSelection,
            n('F2. selection is the SAME instance after frameCameraOn() — not merely equal, literally untouched'));
        assert(editorSession._commandHistory.canUndo() === beforeCanUndo,
            n('F3. CommandHistory.canUndo() is unchanged — no command was pushed'));
        assert(documentManager.state.dirty === beforeDirty,
            n('F4. DocumentManager\'s dirty state is unchanged — a focus action never marks the document dirty'));
        // F5. A real, previously-unremarked architectural fact, live-
        // confirmed rather than inferred from reading the method body:
        // frameCameraOn() writes directly to the RENDER session
        // (`this._session.setCameraState()`); EditorContext carries no
        // camera state at all (its unused setCameraState()/
        // CAMERA_STATE_CHANGED pair was removed as dead code). This
        // is an even stronger isolation guarantee than "only one event
        // fires": frameCameraOn() doesn't touch EditorContext's EventBus
        // AT ALL, so it cannot be confused with, or accidentally coupled
        // to, selection/tool/preview state that DOES flow through that
        // bus.
        assert(events.length === 0,
            n('F5. frameCameraOn() publishes NOTHING on EditorContext\'s own EventBus — it writes straight to the render session\'s camera state; no event of any type is published'));

        console.log('\n=== SECTION F: CAMERA-ONLY INVARIANT ===');
        console.log('✓ Live-proven against real Document/SelectionState/CommandHistory/DocumentManager/EventBus');
        console.log('  instances: frameCameraOn() changes camera state and nothing else — document, selection,');
        console.log('  undo history, and dirty state are all untouched. It reaches the camera by writing straight');
        console.log('  to the render session (EditorSession#_session), the SAME object getCameraState()/');
        console.log('  setCameraState() already use elsewhere in this file — never through EditorContext\'s own,');
        console.log('  separate (and, as this section found, otherwise unused) camera/event machinery.');
    }

    // ===============================================================
    // Section G — Repeatability.
    // ===============================================================
    {
        const target = { x: 4, y: 0, z: 4 };
        editorSession.frameCameraOn(target);
        const firstFraming = editorSession._session.getCameraState();

        // Simulate an arbitrary, unrelated manual camera history: several
        // different setCameraState() calls, exactly what orbit/pan/zoom
        // would have produced on a real render session.
        editorSession._session.setCameraState({ position: { x: -50, y: 80, z: 12 }, target: { x: 1, y: 1, z: 1 }, zoom: 3.7 });
        editorSession._session.setCameraState({ position: { x: 999, y: -12, z: 0.5 }, target: { x: -3, y: 0, z: 9 }, zoom: 0.2 });

        editorSession.frameCameraOn(target);
        const secondFraming = editorSession._session.getCameraState();

        assert(firstFraming.position.x === secondFraming.position.x
            && firstFraming.position.y === secondFraming.position.y
            && firstFraming.position.z === secondFraming.position.z,
            n('G1. focusing the SAME target twice, with arbitrary unrelated camera movement in between, produces the IDENTICAL camera position — deterministic, independent of navigation history'));
        assert(firstFraming.target.x === secondFraming.target.x
            && firstFraming.target.y === secondFraming.target.y
            && firstFraming.target.z === secondFraming.target.z,
            n('G1. ...and the identical look-at target too'));

        console.log('\n=== SECTION G: REPEATABILITY ===');
        console.log('✓ frameCameraOn(target) is a pure function of `target` alone — proven by sandwiching two');
        console.log('  identical calls around unrelated manual camera moves and getting byte-identical results.');
        console.log('  This is the deterministic escape from orbit/pan/zoom the requesting brief asked for.');
    }

    // ===============================================================
    // Section H — The natural UI seam.
    //
    // AMENDED BY 0.9.661 (Add Editor Selection Focus Action). H1 and H3
    // originally proved 'selection.focus' was UNBUILT (H1 asserted
    // `.get('selection.focus') === null`) and probed a throwaway action
    // on a scratch registry to show the shape would fit (H3). 0.9.661
    // implemented exactly the shape this section predicted, verbatim,
    // in the real application/editor/EditorActionRegistry.js — so H1/H3 now
    // assert against the REAL 'selection.focus' action instead of its
    // absence or a disposable stand-in. H2 and H4 are unchanged: they
    // were already checking real, pre-existing production code.
    // ===============================================================
    {
        // H1. 'selection.focus' now exists in the real
        // EditorActionRegistry (0.9.661) — the exact id/category/shape
        // this section's own pre-implementation probe (H3, below)
        // predicted, built with zero framework change.
        const feedback = { show() {} };
        const actions = createStandardActions({ session: editorSession, feedback, ui: {} });
        const actionRegistry = new EditorActionRegistry(actions);
        const focusAction = actionRegistry.get('selection.focus');
        assert(focusAction !== null,
            n('H1. selection.focus now exists in the real EditorActionRegistry (0.9.661) — the gap this audit identified is closed'));
        assert(focusAction.category === 'Selection',
            n('H1. ...filed under the same "Selection" category as selectAll/clear/duplicate/delete, exactly as this section predicted'));

        // H2. The exact enablement rule a focus action would need
        // (ctx.hasSelection) already exists and is already used by
        // sibling Selection actions — no new EditorActionContext field.
        const emptyContext = EditorActionContext.capture({ session: editorSession, selectionCount: 0 });
        const withSelectionContext = EditorActionContext.capture({ session: editorSession, selectionCount: 1 });
        const clearAction = actionRegistry.get('selection.clear');
        assert(clearAction.enabled(emptyContext) === false && clearAction.enabled(withSelectionContext) === true,
            n('H2. ctx.hasSelection already gates a sibling Selection-category action (selection.clear) exactly the way a selection.focus action would need — no new context field required'));

        // H3. The real selection.focus action gates identically
        // (ctx.hasSelection, the exact rule H2 confirmed) and its
        // execute() composes the same two existing methods Section K's
        // own flagship composition proof used — no bespoke camera or
        // geometry code inside the action itself.
        assert(focusAction.enabled(emptyContext) === false && focusAction.enabled(withSelectionContext) === true,
            n('H3. selection.focus enables/disables on the identical ctx.hasSelection rule as selection.clear/duplicate/delete — the same, not a second, enablement convention'));
        assert(actionRegistry.getAll().filter((action) => action.category === 'Selection').length === 5,
            n('H3. it joins the "Selection" category as a fifth action (selectAll/clear/duplicate/delete/focus) — CommandPalette/EditingSidebar/keyboard dispatch surface it with zero additional wiring, per this registry\'s own "one registry, every surface" contract'));
        {
            const { document: h3Doc, building: h3Building } = makeStandaloneDocument();
            const h3Brick = new Brick({ definitionId: 'core:cube', position: new Position(6, 0, -3) });
            h3Building.addBrick(h3Brick);
            openDocument(editorSession, documentManager, h3Doc);
            editorContext.setSelection(new SelectionState({ items: [{ type: 'brick', buildingId: h3Building.id, brickId: h3Brick.id }] }));
            editorSession._session.setCameraState({ position: { x: -50, y: 80, z: 12 }, target: { x: 1, y: 1, z: 1 }, zoom: 3.7 });
            focusAction.execute({ context: withSelectionContext });
            const cam = editorSession._session.getCameraState();
            assert(cam.target.x === 6 && cam.target.y === 0 && cam.target.z === -3,
                n('H3. ...and actually invoking it frames the real selected brick, composed live from getSelectionSummary()+frameCameraOn() — never a reimplementation of either'));
        }

        // H4. SelectionInspector.js — the surface the brief itself
        // suggests (selection/inspector area) — already computes
        // summary.bounds.center for its own live position readout,
        // confirming it is already handed exactly the value a Focus
        // button's execute() would need, with no new prop. 0.9.661
        // added that fourth button, run('selection.focus'), to the
        // same actions row.
        const inspectorSource = await (await import('node:fs/promises')).readFile(
            new URL('../ui/components/SelectionInspector.js', import.meta.url), 'utf8');
        assert(inspectorSource.includes('this.summary.bounds.center'),
            n('H4. SelectionInspector already reads summary.bounds.center — the identical value a Focus action\'s execute() would pass to frameCameraOn(), with no new prop threading required'));
        assert(inspectorSource.includes("run('selection.duplicate')") && inspectorSource.includes("run('selection.clear')"),
            n('H4. SelectionInspector already has a registry-driven actions row (Duplicate/Delete/Clear) that a Focus button would join as a fourth entry — the natural seam the brief asks this audit to identify'));
        assert(inspectorSource.includes("run('selection.focus')"),
            n('H4. 0.9.661 wired that fourth entry: SelectionInspector now runs selection.focus from the same actions row'));

        console.log('\n=== SECTION H: NATURAL UI SEAM ===');
        console.log('✓ SelectionInspector\'s existing actions row was the natural home this section predicted, and');
        console.log('  0.9.661 built exactly that: selection.focus (Selection category, ctx.hasSelection-gated,');
        console.log('  composed from getSelectionSummary()+frameCameraOn()) plus a fourth SelectionInspector');
        console.log('  button — no registry change, no new context field, no new prop.');
    }

    // ===============================================================
    // Section I — Structure-placement selection: the real open scope gap.
    // ===============================================================
    {
        // I1. Unlike the multi-brick case (Section E6 — already
        // unambiguous), a structure-placement selection is a REAL scope
        // decision left open: getSelectionSummary() returns null for it.
        const { document: placementDoc, building: placementBuilding } = makeStandaloneDocument();
        placementBuilding.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0, 0) }));
        openDocument(editorSession, documentManager, placementDoc);

        const placementSelection = new SelectionState({ items: [{ type: 'structure-placement', placementId: 'nonexistent-placement' }] });
        editorContext.setSelection(placementSelection);
        assert(editorContext.selection.isStructurePlacementSelection === true,
            n('I1. a structure-placement selection is real and distinguishable via SelectionState#isStructurePlacementSelection'));
        assert(editorSession.getSelectionSummary() === null,
            n('I1. getSelectionSummary() is null for a structure-placement selection — SelectionBoundsService only ever handles brick items, by design (see its own header)'));

        console.log('\n=== SECTION I: STRUCTURE-PLACEMENT SCOPE ===');
        console.log('✓ getSelectedPlacementInfo() DOES resolve a real position for a placement selection, but');
        console.log('  through a deliberately separate data shape (application/editor/EditorSession.js\'s own header on');
        console.log('  why placement info and brick-selection bounds are never folded into one). Whether');
        console.log('  "Focus Selection" ALSO covers a single selected structure placement (by branching to');
        console.log('  getSelectedPlacementInfo().position when selection.isStructurePlacementSelection is true,');
        console.log('  exactly the same branch getSelectionSummary()/applyPlacementTransform() already make) is a');
        console.log('  genuine, narrow scope decision 0.9.661 must make explicitly — this audit does not answer it');
        console.log('  for 0.9.661, it only proves the multi-brick case (Section E) needs no such decision.');
    }

    // ===============================================================
    // Section J — Animation asymmetry.
    // ===============================================================
    {
        const editorModuleSource = await (await import('node:fs/promises')).(await Promise.all(editorSessionFiles().map((file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8')))).join('\n');
        assert(!editorModuleSource.includes('CameraFocusAnimator'),
            n('J1. application/editor/EditorSession.js never imports CameraFocusAnimator — Editor camera framing has no animation machinery today'));
        assert(!editorModuleSource.includes('onAnimationFrame'),
            n('J1. ...and no frame-tick subscription either — frameCameraOn() is a single, INSTANT setCameraState() call, unlike World\'s animated _beginCameraFocus()'));

        console.log('\n=== SECTION J: ANIMATION ASYMMETRY ===');
        console.log('✓ World animates a focus over 900ms (when frame-ticking exists); the Editor\'s existing');
        console.log('  frameCameraOn() (0.6.0, already shipped and already used on fork-to-edit entry) is');
        console.log('  instant. This is a real, pre-existing asymmetry, not something a "Focus Selection" action');
        console.log('  would introduce. 0.9.661 should keep the Editor\'s own already-established instant');
        console.log('  convention (frameCameraOn() unchanged) rather than porting World\'s animator on the side —');
        console.log('  animation was explicitly named excluded scope in the requesting brief.');
    }

    // ===============================================================
    // Section K — Full composition proof (the flagship).
    // ===============================================================
    {
        const { document: flagshipDoc, building: flagshipBuilding } = makeStandaloneDocument();
        const brickA = new Brick({ definitionId: 'core:cube', position: new Position(2, 0, 2) });
        const brickB = new Brick({ definitionId: 'core:block_2x2', position: new Position(8, 0, 2) });
        flagshipBuilding.addBrick(brickA);
        flagshipBuilding.addBrick(brickB);
        openDocument(editorSession, documentManager, flagshipDoc);

        // Composed ENTIRELY from methods that already exist in production
        // today — this is the whole point of the audit: zero new
        // geometry code, zero new camera code.
        function focusSelection(session) {
            const summary = session.getSelectionSummary();
            if (!summary) return false;
            return session.frameCameraOn(summary.bounds.center);
        }

        // K1. Single-brick composition.
        editorContext.setSelection(new SelectionState({ items: [{ type: 'brick', buildingId: flagshipBuilding.id, brickId: brickA.id }] }));
        assert(focusSelection(editorSession) === true, n('K1. composed focusSelection() succeeds for a single-brick selection'));
        let cam = editorSession._session.getCameraState();
        assert(cam.target.x === 2 && cam.target.z === 2,
            n('K1. ...and frames exactly on that brick\'s own position — no new code, just getSelectionSummary()+frameCameraOn()'));
        assert(cam.position.x === 2 + 12 && cam.position.y === 0 + 12 && cam.position.z === 2 + 12,
            n('K1. ...at the existing fixed (12,12,12) offset'));

        // K2. Multi-brick composition — the union bounds center, not
        // either brick's own raw position.
        editorContext.setSelection(new SelectionState({
            items: [
                { type: 'brick', buildingId: flagshipBuilding.id, brickId: brickA.id },
                { type: 'brick', buildingId: flagshipBuilding.id, brickId: brickB.id }
            ]
        }));
        assert(focusSelection(editorSession) === true, n('K2. composed focusSelection() succeeds for a two-brick selection'));
        cam = editorSession._session.getCameraState();
        // brickA (core:cube, 1x1x1) at x=2 spans [1.5,2.5]; brickB (core:block_2x2, 2x2x2) at x=8 spans [7,9].
        // Union x: [1.5, 9] -> center.x = 5.25.
        assert(Math.abs(cam.target.x - 5.25) < 1e-9,
            n('K2. ...frames on the UNION bounds center (5.25), neither brick\'s own raw position (2 or 8) nor their average (5) — the exact composed behavior a real Focus Selection action would have, using nothing but existing code'));

        // K3. No selection -> the composed operation is a safe no-op,
        // exactly mirroring how selection.duplicate/selection.delete
        // already degrade for an empty selection.
        editorContext.clearSelection();
        assert(focusSelection(editorSession) === false,
            n('K3. composed focusSelection() returns false (no-op) for an empty selection — never throws'));

        console.log('\n=== SECTION K: FULL COMPOSITION PROOF ===');
        console.log('✓ "Focus Selection" assembles completely from TWO existing, unmodified EditorSession methods');
        console.log('  (getSelectionSummary() + frameCameraOn()) for both single- and multi-brick selections, with');
        console.log('  the exact union-bounds-center target semantics Section C established, the exact fixed-');
        console.log('  offset framing Section D established, and safe no-op behavior on an empty selection.');
    }

    // ===============================================================
    // Final verdict.
    // ===============================================================
    {
        console.log('\n=== FINAL VERDICT ===');
        console.log('NARROW_WIRING_GAP, not an architecture gap. Every camera/geometry primitive a "Focus');
        console.log('Selection" action needs — target resolution (Section B), the correct target point (Section');
        console.log('C), distance semantics (Section D), lifecycle correctness including the multi-selection case');
        console.log('(Section E), the camera-only side-effect invariant (Section F), and determinism (Section G)');
        console.log('— already exists in application/editor/EditorSession.js and application/editor/SelectionBoundsService.js,');
        console.log('unchanged, and composes today with zero new code (Section K). The natural UI seam already');
        console.log('exists too (Section H): one EditorActionRegistry entry, category "Selection", surfacing');
        console.log('automatically through the command palette, keyboard dispatch, and a fourth SelectionInspector');
        console.log('button next to Duplicate/Delete/Clear.');
        console.log('');
        console.log('Exactly TWO real decisions remain for 0.9.661, both narrow:');
        console.log('  1. Structure-placement scope (Section I) — does Focus Selection also cover a single');
        console.log('     selected placement (via getSelectedPlacementInfo().position), or brick selections only?');
        console.log('  2. Animation (Section J) — 0.9.661 should keep frameCameraOn()\'s existing instant');
        console.log('     behavior, matching the Editor\'s own already-shipped 0.6.0 convention, rather than');
        console.log('     porting World\'s CameraFocusAnimator — explicitly excluded scope per the requesting');
        console.log('     brief, and this audit finds no architectural reason to reopen that exclusion.');
        console.log('Recommended 0.9.661 shape: one new EditorActionRegistry action (`selection.focus`), reusing');
        console.log('getSelectionSummary()+frameCameraOn() verbatim as Section K proves, plus one SelectionInspector');
        console.log('button — no new use case class, no new geometry, no new camera controller.');
        console.log('');
        console.log('0.9.661 IMPLEMENTED THIS VERDICT: selection.focus, brick selections only (decision 1 resolved');
        console.log('as "brick selections only" — structure-placement focus stays explicitly out of scope), and');
        console.log('frameCameraOn()\'s existing instant behavior kept unchanged (decision 2). Section H above was');
        console.log('amended in place to assert against that real action instead of its pre-implementation absence.');

        assert(true, n('L1. verdict recorded: NARROW_WIRING_GAP — camera-movement implementation is sized correctly for a small, well-contained 0.9.661'));

        console.log('\n✅ All Editor Selected-Brick Camera Focus Boundary Audit tests passed.');
    }
}

await run();
