import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { StructurePlacement } from '../core/StructurePlacement.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { SelectionState } from '../application/editor-state/SelectionState.js';
import { CopySelectionUseCase } from '../application/CopySelectionUseCase.js';
import { PasteClipboardUseCase } from '../application/PasteClipboardUseCase.js';
import { RepeatSelectionUseCase } from '../application/RepeatSelectionUseCase.js';
import { EditorSession } from '../application/EditorSession.js';
import { EditorContext } from '../application/EditorContext.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { SelectionUseCase } from '../application/SelectionUseCase.js';
import { PreviewUseCase } from '../application/PreviewUseCase.js';
import { EditorActionRegistry, createStandardActions } from '../application/EditorActionRegistry.js';
import { EditorActionContext } from '../application/EditorActionContext.js';
import { LocalStructureLibraryStore } from '../application/LocalStructureLibraryStore.js';

// 0.6.2 — Editor UX Consolidation.
//
// The 0.4.x/0.5.x milestones built a genuinely powerful editing kernel
// (placement, structures, extraction, duplication, transforms, snapping,
// repetition, collision detection, blueprints) whose UX grew up
// incrementally around it. This milestone doesn't add a new domain
// concept — it consolidates the surface: a Primary/Common/Advanced
// action hierarchy on the SAME EditorActionRegistry (0.1.50), a live
// Selection Inspector for a brick selection (the counterpart
// StructureInstancePanel already gave a placement selection since
// 0.2.91), and a real UI entry point for RepeatSelectionUseCase (0.4.9),
// which has existed, fully wired and fully tested, since that milestone
// but never had a button.
//
// Per the design conversation, this file's job is proving CONTRACTS
// BETWEEN EXISTING SYSTEMS compose correctly — not re-deriving algorithms
// tests/AlignmentAndRepetition.test.js, tests/StructureInstanceEditing.test.js,
// and tests/WorldEditorContinuity.test.js already cover in isolation.
//
//   Section A: EditorActionRegistry — every standard action carries a
//              tier, and the design conversation's own bucket
//              assignments hold (Rotate/Move = primary, Duplicate/
//              Delete/Copy/Paste = common, Align/Distribute/Repeat/
//              Group = advanced)
//   Section B: EditorSession#getSelectionSummary() — the new brick-
//              selection counterpart to getSelectedPlacementInfo():
//              null/count+bounds/null-for-a-placement-selection
//   Section C: transform.repeat — the registry action 0.4.9 never
//              built, wired to the SAME repeatSelection() 0.4.9 already
//              fully tested; and the live summary tracking a real
//              repeat's result
//   Section D — CAPSTONE: Brick -> Select -> Duplicate -> Rotate ->
//              Repeat -> Extract -> Save to My Structures -> Place the
//              blueprint back as independent bricks -> a separate
//              StructurePlacement selection stays on its OWN inspector
//              path (getSelectedPlacementInfo, never getSelectionSummary)
//              through the identical Duplicate/Delete registry actions
//              — the same one-brick-selection, one-instance-selection
//              split every prior milestone already established, now
//              proven to hold through this milestone's own additions.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function createWorldWithBricks(specs) {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    const ids = [];
    for (const spec of specs) {
        const brick = new Brick({
            definitionId: spec.definitionId || 'core:cube',
            position: spec.position,
            rotation: spec.rotation || 0
        });
        building.addBrick(brick);
        ids.push(brick.id);
    }
    world.addBuilding(building);
    return { world, building, ids };
}

function buildSession({ world, building }) {
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const document = new Document({ world, metadata: new DocumentMetadata({ title: 'EditorUX', author: 'tester' }) });
    const editorContext = new EditorContext();
    const documentManager = new DocumentManager();
    documentManager.load(document, 'editor-ux-doc');

    const personalStructureLibraryStore = new LocalStructureLibraryStore({ storageProvider: new InMemoryStorageProvider() });

    const session = new EditorSession({
        registry: brickRegistry,
        editorContext,
        toolRegistry: null,
        documentManager,
        selectionUseCase: new SelectionUseCase(editorContext),
        previewUseCase: new PreviewUseCase(editorContext),
        loadDocumentUseCase: null,
        copySelectionUseCase: new CopySelectionUseCase(brickRegistry),
        pasteClipboardUseCase: new PasteClipboardUseCase(),
        repeatSelectionUseCase: new RepeatSelectionUseCase(brickRegistry),
        personalStructureLibraryStore
    });
    session._commandHistory = new CommandHistory({ world });
    // rotateSelection()/moveSelection() route through SpatialEditingService,
    // which looks its history up from `_editorCommandHistories` rather
    // than `_commandHistory` alone — see
    // tests/MultiBrickTransformCollision.test.js's own header on why
    // (normally wired together by EditorSession#start(), unavailable
    // headless). Needed here because Section D chains a keyboard Rotate
    // together with Duplicate/Repeat in the same session, unlike
    // tests/AlignmentAndRepetition.test.js's own Section 6, which this
    // harness otherwise mirrors.
    session._editorCommandHistories.set(world.id, session._commandHistory);

    return { session, editorContext, documentManager, document, brickRegistry, building, personalStructureLibraryStore };
}

function selectBricks(editorContext, building, brickIds) {
    editorContext.setSelection(new SelectionState({
        items: brickIds.map((brickId) => ({ type: 'brick', buildingId: building.id, brickId }))
    }));
}

// ---------------------------------------------------------------------
// A. EditorActionRegistry — the Primary/Common/Advanced action hierarchy
// ---------------------------------------------------------------------
{
    const feedbackLog = [];
    const feedback = { show(message) { feedbackLog.push(message); } };
    const actions = createStandardActions({ session: {}, feedback, ui: {} });

    assert(actions.length > 0, '1. createStandardActions() still produces the full standard set');
    for (const action of actions) {
        assert(['primary', 'common', 'advanced'].includes(action.tier),
            `2. action "${action.id}" carries a valid tier, got "${action.tier}"`);
    }

    const tierOf = (id) => actions.find((a) => a.id === id).tier;
    assert(tierOf('transform.rotateClockwise') === 'primary', '3. Rotate is Primary');
    assert(tierOf('transform.rotateCounterClockwise') === 'primary', '4. Rotate (CCW) is Primary');
    assert(tierOf('transform.nudgeRight') === 'primary', '5. Move (nudge) is Primary');
    assert(tierOf('selection.duplicate') === 'common', '6. Duplicate is Common');
    assert(tierOf('selection.delete') === 'common', '7. Delete is Common');
    assert(tierOf('clipboard.copy') === 'common', '8. Copy is Common');
    assert(tierOf('group.create') === 'common', '9. the group entry point (Create) is Common');
    assert(tierOf('transform.alignLeft') === 'advanced', '10. Align is Advanced');
    assert(tierOf('transform.distributeX') === 'advanced', '11. Distribute is Advanced');
    assert(tierOf('transform.repeat') === 'advanced', '12. Repeat is Advanced');
    assert(tierOf('group.rename') === 'advanced', '13. every other group operation is Advanced');
    assert(tierOf('group.duplicate') === 'advanced' && tierOf('group.delete') === 'advanced'
        && tierOf('group.addSelection') === 'advanced' && tierOf('group.removeSelection') === 'advanced',
        '14. the rest of Groups is Advanced too');

    // tier is display-only — never consulted by enabled()/execute().
    // Confirm a tiered action's enablement rule is completely unchanged
    // from its pre-0.6.2 shape: still gated on selection, nothing else.
    const rotate = actions.find((a) => a.id === 'transform.rotateClockwise');
    const emptyCtx = EditorActionContext.capture({ selectionCount: 0 });
    const oneSelectedCtx = EditorActionContext.capture({ selectionCount: 1 });
    assert(rotate.enabled(emptyCtx) === false, '15. tier never changes enablement: still disabled with no selection');
    assert(rotate.enabled(oneSelectedCtx) === true, '16. ...still enabled with one');

    console.log('✓ A. EditorActionRegistry: every standard action carries a tier, and the design conversation\'s own bucket assignments hold');
}

// ---------------------------------------------------------------------
// B. EditorSession#getSelectionSummary()
// ---------------------------------------------------------------------
{
    const { world, building, ids } = createWorldWithBricks([
        { position: new Position(0, 0.5, 0) },
        { position: new Position(4, 0.5, 0) }
    ]);
    const { session, editorContext } = buildSession({ world, building });

    assert(session.getSelectionSummary() === null, '1. an empty selection summarizes to null');

    selectBricks(editorContext, building, [ids[0]]);
    let summary = session.getSelectionSummary();
    assert(summary !== null, '2. a one-brick selection produces a summary');
    assert(summary.count === 1, '3. count reflects one brick');
    assert(summary.bounds.center.x === 0 && summary.bounds.center.z === 0,
        '4. bounds.center matches the single brick\'s own position');

    selectBricks(editorContext, building, ids);
    summary = session.getSelectionSummary();
    assert(summary.count === 2, '5. a two-brick selection reports count 2');
    assert(summary.bounds.center.x === 2, '6. bounds.center is the UNION of both bricks (0 and 4 average to 2)');

    // A StructurePlacement selection is deliberately a DIFFERENT
    // question — getSelectedPlacementInfo() answers it, never this
    // method, so a UI never accidentally wires a placement's editable
    // position target to bricks-shaped read-only bounds data.
    const placement = new StructurePlacement({ documentId: 'some-doc', position: new Position(10, 0, 10), rotation: 0 });
    world.addStructurePlacement(placement);
    editorContext.setSelection(new SelectionState({ items: [{ type: 'structure-placement', placementId: placement.id }] }));
    assert(session.getSelectionSummary() === null, '7. a StructurePlacement selection summarizes to null here — see getSelectedPlacementInfo() instead');
    assert(session.getSelectedPlacementInfo() !== null, '8. ...and getSelectedPlacementInfo() is exactly where it DOES answer');

    console.log('✓ B. EditorSession#getSelectionSummary(): empty/bricks/placement, live bounds match SelectionBoundsService');
}

// ---------------------------------------------------------------------
// C. transform.repeat — the UI entry point 0.4.9 never built
// ---------------------------------------------------------------------
{
    const { world, building, ids } = createWorldWithBricks([
        { position: new Position(0, 0.5, 0) },
        { position: new Position(2, 0.5, 0) }
    ]);
    const { session, editorContext } = buildSession({ world, building });
    selectBricks(editorContext, building, ids);

    const feedbackLog = [];
    const feedback = { show(message) { feedbackLog.push(message); } };
    let focused = false;
    const ui = { focusRepeat: () => { focused = true; } };
    const registry = new EditorActionRegistry(createStandardActions({ session, feedback, ui }));
    const ctx = () => EditorActionContext.capture({ session, selectionCount: editorContext.selection.items.length });

    assert(registry.execute('transform.repeat', ctx()) === true, '1. transform.repeat executes when a selection exists');
    assert(focused === true, '2. ...and calls ui.focusRepeat(), never repeating anything itself (count/offset are user-tunable, not zero-arg)');
    assert(feedbackLog.at(-1) === 'Repeat panel ready', '3. feedback names what just happened');

    // Without ui.focusRepeat wired (an older/bare surface), the SAME
    // graceful-degradation posture every other ui.* hook in this
    // registry already has.
    const bareRegistry = new EditorActionRegistry(createStandardActions({ session, feedback, ui: {} }));
    bareRegistry.execute('transform.repeat', ctx());
    assert(feedbackLog.at(-1) === 'Repeat panel is not available on this surface', '4. degrades to feedback, never throws, when the hook is missing');

    // Now the real thing: RepeatPanel's own host callback
    // (ui/views/EditorView.js#repeatSelection()) is nothing but this
    // routing hop into EditorSession#repeatSelection() — proven already
    // by tests/AlignmentAndRepetition.test.js's own Section 6. What's
    // NEW here is that SelectionInspector's live summary tracks the
    // result without any extra wiring, because refreshSelectionSummary()
    // reads the exact same post-repeat selection duplicateSelection()
    // and repeatSelection() already leave active.
    assert(session.repeatSelection({ count: 1, offset: { x: 10, y: 0, z: 0 } }) === true, '5. repeatSelection() succeeds');
    const summary = session.getSelectionSummary();
    assert(summary.count === 2, '6. the repeat\'s own 2 bricks become the new selection (count 2, not 4 — the originals are no longer selected)');
    assert(summary.bounds.center.x === 11, '7. the live summary reflects the REPEATED copy\'s position (originals were at 0/2, offset +10 -> 10/12, center 11)');

    console.log('✓ C. transform.repeat: focuses the panel (never repeats itself), degrades gracefully without the hook, and a real repeat\'s result is immediately visible through getSelectionSummary()');
}

// ---------------------------------------------------------------------
// D — CAPSTONE: Brick -> Select -> Duplicate -> Rotate -> Repeat ->
//     Extract -> Save to My Structures -> Place as independent bricks,
//     and a StructurePlacement selection staying on its own path
//     throughout.
// ---------------------------------------------------------------------
{
    const { world, building, ids } = createWorldWithBricks([
        { position: new Position(0, 0.5, 0) }
    ]);
    const { session, editorContext, personalStructureLibraryStore } = buildSession({ world, building });
    const feedbackLog = [];
    const feedback = { show(message) { feedbackLog.push(message); } };

    let promptedMetadata = null;
    let libraryRefreshed = false;
    const ui = {
        promptCreateStructure: () => ({ name: 'Capstone Cottage', category: 'test', description: '' }),
        onPersonalLibraryChanged: () => { libraryRefreshed = true; }
    };
    const registry = new EditorActionRegistry(createStandardActions({ session, feedback, ui }));
    const ctx = () => EditorActionContext.capture({
        session,
        selectionCount: editorContext.selection.items.length,
        selectionIsStructurePlacement: editorContext.selection.isStructurePlacementSelection
    });

    // 1. Place -> Select (a brick "placed" directly on the World, same
    //    end state BuildLibraryPanel's own click-to-place produces).
    selectBricks(editorContext, building, ids);
    assert(session.getSelectionSummary().count === 1, '1. Brick -> Select: one brick, summarized');

    // 2. Select -> Duplicate -> Select copy (registry-driven, the same
    //    path SelectionInspector's own Duplicate button now calls).
    assert(registry.execute('selection.duplicate', ctx()) === true, '2. Select -> Duplicate executes');
    assert(feedbackLog.at(-1) === 'Copy created — R to rotate, drag to move', '3. ...with the 0.6.2 "what happens next" hint');
    assert(building.getBricks().length === 2, '4. the World now has the original plus its copy');
    assert(session.getSelectionSummary().count === 1, '5. the COPY becomes the new selection (still one brick, not the original)');

    // 3. Select -> Rotate -> collision gate (rotating one brick around
    //    its own pivot never collides with anything else here — the
    //    gate itself, and what happens when it DOES block, is
    //    tests/MultiBrickTransformCollision.test.js's own flagship;
    //    this just proves Rotate is reachable through the SAME
    //    registry path the new tier metadata now labels Primary).
    const beforeRotationSummary = session.getSelectionSummary();
    assert(registry.execute('transform.rotateClockwise', ctx()) === true, '6. Select -> Rotate executes');
    assert(session.getSelectionSummary().bounds.center.x === beforeRotationSummary.bounds.center.x,
        '7. rotating a single brick around its own pivot leaves its center in place');

    // 4. Select -> Repeat -> one history entry.
    const historyBefore = session.commandHistory.getExecutedCommands().length;
    assert(session.repeatSelection({ count: 2, offset: { x: 3, y: 0, z: 0 } }) === true, '8. Select -> Repeat succeeds');
    assert(session.commandHistory.getExecutedCommands().length === historyBefore + 1, '9. Repeat is exactly ONE history entry regardless of count');
    assert(building.getBricks().length === 4, '10. original + first copy + 2 repeated copies = 4 bricks total');

    // 5. Select -> Extract -> Blueprint, saved to My Structures — the
    //    repeated selection extracts into a Structure exactly like any
    //    other brick selection (0.4.2/0.4.3 unchanged).
    assert(registry.execute('structure.createFromSelection', ctx()) === true, '11. Select -> Extract executes');
    assert(feedbackLog.at(-1) === 'Saved "Capstone Cottage" to My Structures', '12. feedback names the save, not just the extraction');
    assert(libraryRefreshed === true, '13. ui.onPersonalLibraryChanged() fires so a live UI would refresh its list');

    // 6. Blueprint -> Place -> independent bricks. copyStructureIntoDocument()
    //    is the "place a Structure" path (as opposed to placeDocument(),
    //    which creates a StructurePlacement REFERENCE to a whole other
    //    Document) — its own bricks land as ordinary, independently
    //    editable World content, never a live link back to the
    //    Structure they were extracted from.
    const structure = personalStructureLibraryStore.listStructures().find((s) => s.name === 'Capstone Cottage');
    assert(structure, '14. the saved Structure is actually findable in the personal library');
    const bricksBeforePlace = building.getBricks().length;
    assert(session.copyStructureIntoDocument(structure) === true, '15. Blueprint -> Place succeeds');
    assert(building.getBricks().length === bricksBeforePlace + structure.bricks.length,
        '16. placing adds the blueprint\'s own bricks as independent World content');
    const placedBrick = building.getBricks()[building.getBricks().length - 1];
    placedBrick.rotation = 45;
    assert(structure.bricks.every((b) => b.rotation !== 45),
        '17. mutating the placed copy never reaches back into the Structure it came from — independent, not a reference');

    // 7. A StructurePlacement selection stays on its OWN path
    //    (getSelectedPlacementInfo, never getSelectionSummary) through
    //    the IDENTICAL Duplicate/Delete registry actions used above —
    //    the one place this milestone's new brick-selection inspector
    //    must never leak into the instance case StructureInstancePanel
    //    already owns.
    const placement = new StructurePlacement({ documentId: 'other-doc', position: new Position(20, 0, 20), rotation: 0 });
    world.addStructurePlacement(placement);
    editorContext.setSelection(new SelectionState({ items: [{ type: 'structure-placement', placementId: placement.id }] }));
    assert(session.getSelectionSummary() === null, '18. Forked document / instance selection: getSelectionSummary() stays null');
    assert(session.getSelectedPlacementInfo() !== null, '19. ...while getSelectedPlacementInfo() is exactly where this selection IS answered');

    assert(registry.execute('selection.duplicate', ctx()) === true, '20. the SAME selection.duplicate action duplicates an instance, not bricks');
    assert(world.getStructurePlacements().length === 2, '21. a second placement now exists');
    assert(registry.execute('selection.delete', ctx()) === true, '22. the SAME selection.delete action removes the (now selected) duplicate instance');
    assert(world.getStructurePlacements().length === 1, '23. exactly one placement remains — the delete targeted the instance, not any brick');

    console.log('✓ D. CAPSTONE: Place -> Select -> Duplicate -> Rotate -> Repeat -> Extract -> Save -> Place as independent bricks, and a StructurePlacement selection never crosses into the brick-selection inspector path');
}

console.log('\nAll Editor UX Consolidation tests passed.');
