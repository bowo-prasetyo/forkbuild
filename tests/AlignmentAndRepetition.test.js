import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { Group } from '../core/Group.js';
import { EventBus } from '../core/events/EventBus.js';
import { SnapMath } from '../core/SnapMath.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { CreateCommandRegistryUseCase } from '../application/CreateCommandRegistryUseCase.js';
import { SpatialEditingService } from '../application/SpatialEditingService.js';
import { SpatialSelectionState } from '../application/spatial-state/SpatialSelectionState.js';
import { SelectionState } from '../application/editor-state/SelectionState.js';
import { CopySelectionUseCase } from '../application/CopySelectionUseCase.js';
import { PasteClipboardUseCase } from '../application/PasteClipboardUseCase.js';
import { RepeatSelectionUseCase } from '../application/RepeatSelectionUseCase.js';
import { RepetitionMath } from '../application/RepetitionMath.js';
import { CreateStructureFromSelectionUseCase } from '../application/CreateStructureFromSelectionUseCase.js';
import { CopyStructureIntoDocumentUseCase } from '../application/CopyStructureIntoDocumentUseCase.js';
import { ExportBlueprintUseCase } from '../application/ExportBlueprintUseCase.js';
import { ImportBlueprintUseCase } from '../application/ImportBlueprintUseCase.js';
import { EditorSession } from '../application/EditorSession.js';
import { EditorContext } from '../application/EditorContext.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { SelectionUseCase } from '../application/SelectionUseCase.js';
import { PreviewUseCase } from '../application/PreviewUseCase.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { ReplayDocumentUseCase } from '../application/ReplayDocumentUseCase.js';
import { RestoreHistoryStateUseCase } from '../application/RestoreHistoryStateUseCase.js';
import { WorldPosition } from '../core/WorldPosition.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';

// 0.4.9 — Alignment, Snapping & Repetition.
//
// Grid-DELTA snapping (application/TransformSnap.js) and selection
// alignment/distribution (application/TransformAlignment.js) already
// shipped in 0.1.47/0.1.48 — this milestone's own design conversation
// confirmed both exist and left them untouched. Two genuine gaps
// remained: (1) no way to snap a selection's ABSOLUTE position onto the
// world-space construction grid (as opposed to interpreting a live
// gesture delta), and (2) no way to create N copies of a selection as
// ONE atomic, collision-checked operation — ordinary duplication
// (0.4.7) never collision-checks at all. This milestone closes both,
// and nothing else: no new geometry system, no magnetic face/edge
// snapping (deliberately deferred — see docs/Roadmap.md's own 0.4.9
// section), no persistent "RepeatingStructure" World concept.
//
//   Section 1: core/SnapMath.js — deterministic absolute-position
//              snapping, in isolation
//   Section 2: SpatialEditingService#snapSelectionToGrid() — preserves a
//              multi-brick selection's own relative geometry, one
//              history entry, no-op discipline, collision-gated through
//              the SAME commit path 0.4.8 already established
//   Section 3: RepeatSelectionUseCase — deterministic per-copy offsets,
//              fresh identities, group-aware, in isolation
//   Section 4: atomicity — a mid-batch collision rejects the WHOLE
//              repetition; the World is provably untouched
//   Section 5: one history entry; undo removes the complete repeated
//              construction; redo reproduces it exactly
//   Section 6: EditorSession / WorldNavigationSession wiring — the same
//              two entry points duplicateSelection() already has
//   Section 7: collaboration — the composite command, reconstructed from
//              its own serialized JSON the way application/
//              WorldCommandPropagationUseCase.js's receiving side
//              already does, reproduces byte-identical state on an
//              independent replica
//   Section 8 — CAPSTONE: repeat -> select one copy -> extract -> export
//              -> import -> place — the full 0.4.x creation chain, one
//              more time, over freshly REPEATED content

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function close(actual, expected, message) {
    assert(Math.abs(actual - expected) < 1e-9, `${message}: expected ${expected}, got ${actual}`);
}

const stubLayoutProvider = {
    getPosition: () => new WorldPosition(0, 0, 0),
    findVisibleDocuments: () => []
};

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function createWorldWithBricks(specs, worldId, buildingId) {
    const world = new World(worldId ? { id: worldId } : undefined);
    const building = new Building(buildingId ? { id: buildingId } : { creator: 'tester' });
    const ids = [];
    for (const spec of specs) {
        const brick = new Brick({
            id: spec.id,
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

// ---------------------------------------------------------------------
// 1. core/SnapMath.js — deterministic absolute-position snapping
// ---------------------------------------------------------------------

{
    close(SnapMath.snap(12.03, 1), 12, '12.03 snaps down to 12 at grid size 1');
    close(SnapMath.snap(12.48, 1), 12, '12.48 snaps down to 12 at grid size 1');
    close(SnapMath.snap(12.52, 1), 13, '12.52 snaps up to 13 at grid size 1');
    close(SnapMath.snap(-1.6, 1), -2, 'negative values snap toward the nearest grid line too');
    close(SnapMath.snap(0.24, 0.5), 0, '0.24 snaps down to 0 at grid size 0.5');
    close(SnapMath.snap(0.26, 0.5), 0.5, '0.26 snaps up to 0.5 at grid size 0.5');
    close(SnapMath.snap(3, 2), 4, '3 snaps to the nearer of 2/4 at grid size 2');
    assert(SnapMath.snap(12.03, 0) === 12.03, 'gridSize 0 means "off": value passes through unchanged');
    assert(SnapMath.snap(12.03, -1) === 12.03, 'a negative gridSize is also treated as "off"');
    assert(Object.is(SnapMath.snap(-0.1, 1), 0), 'a value that rounds to zero never leaks a signed -0');

    // Determinism: the same input, called independently many times,
    // always produces the identical output — no hidden state.
    const samples = [12.03, 12.48, 12.52, -7.5, 0, 100.999];
    for (const value of samples) {
        const first = SnapMath.snap(value, 1);
        for (let i = 0; i < 5; i++) {
            assert(SnapMath.snap(value, 1) === first, `SnapMath.snap(${value}, 1) is deterministic across repeated calls`);
        }
    }

    // Rotation + snapping: a rotated brick's coordinate can arrive as
    // 1.9999999999999998 rather than exactly 2 (the exact float
    // core/SelectionTransformValidator.js's own header cites from
    // application/TransformMath.js's sin/cos output) — snapping that
    // value must still land cleanly on the grid line, not on some
    // drifted neighbor.
    const driftedFromRotation = 1.9999999999999998;
    close(SnapMath.snap(driftedFromRotation, 1), 2, 'trig-drifted coordinates still snap to the exact intended grid line');

    const position = SnapMath.snapPosition(12.03, 8.52, 1);
    close(position.x, 12, 'snapPosition snaps x');
    close(position.z, 9, 'snapPosition snaps z');
    assert(!('y' in position), 'snapPosition is deliberately X/Z-only — Y is a separate, un-snapped axis');

    console.log('✓ SnapMath: deterministic absolute-position snapping, negative values, drifted floats, gridSize<=0 is "off"');
}

// ---------------------------------------------------------------------
// 2. SpatialEditingService#snapSelectionToGrid()
// ---------------------------------------------------------------------

{
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const { world, building, ids: [a, b] } = createWorldWithBricks([
        { position: new Position(12.03, 0.5, 8.52) },
        { position: new Position(14.03, 0.5, 8.52) }
    ]);
    const document = new Document({ world });
    const session = { getDocument: (id) => (id === 'doc' ? document : null) };
    const histories = new Map([[world.id, new CommandHistory({ world })]]);
    const service = new SpatialEditingService(session, histories, brickRegistry);
    const selection = SpatialSelectionState.bricks({
        documentId: 'doc',
        items: [a, b].map((brickId) => ({ type: 'brick', buildingId: building.id, brickId }))
    });
    const history = histories.get(world.id);

    // Pivot (bounds center) is (13.03, 0.5, 8.52); snapping it to grid
    // size 1 targets (13, 0.5, 9) — every member shifts by the SAME
    // (x, z) delta, so the pair's own 2-unit spacing survives exactly.
    assert(service.snapSelectionToGrid(selection, 1) === true, 'snapping an unaligned selection commits');
    assert(history.getExecutedCommands().length === 1, 'snap-to-grid is exactly one history entry');
    close(building.findBrick(a).position.x, 12, 'A landed on the grid (x)');
    close(building.findBrick(a).position.z, 9, 'A landed on the grid (z)');
    close(building.findBrick(b).position.x, 14, 'B landed on the grid (x), preserving the 2-unit spacing to A');
    close(building.findBrick(b).position.z, 9, 'B landed on the grid (z)');
    close(building.findBrick(a).position.y, 0.5, 'Y is untouched by grid snapping');

    // Already grid-aligned: a no-op, zero new history entries.
    assert(service.snapSelectionToGrid(selection, 1) === false, 'an already-aligned selection is a no-op');
    assert(history.getExecutedCommands().length === 1, 'the no-op added no history entry');

    // Collision gate: the pivot is (13, 0.5, 9); snapping it to grid
    // size 5 targets (15, 0.5, 10), a (+2, +1) delta for every member —
    // landing A exactly on a third, non-member brick at (14, 0.5, 10).
    const obstacle = new Brick({ definitionId: 'core:cube', position: new Position(14, 0.5, 10) });
    building.addBrick(obstacle);
    assert(service.snapSelectionToGrid(selection, 5) === false, 'a colliding grid target is blocked, not partially applied');
    assert(history.getExecutedCommands().length === 1, 'the blocked snap added no history entry');
    close(building.findBrick(a).position.x, 12, 'A is exactly where the blocked snap found it (x)');
    close(building.findBrick(a).position.z, 9, 'A is exactly where the blocked snap found it (z)');
    close(building.findBrick(b).position.x, 14, 'B is exactly where the blocked snap found it (x)');

    console.log('✓ SpatialEditingService#snapSelectionToGrid: preserves relative geometry, one command, no-op discipline, collision-gated');
}

// ---------------------------------------------------------------------
// 3. RepeatSelectionUseCase — in isolation
// ---------------------------------------------------------------------

{
    // Pure math first: origin (0,0,0), offset (5,0,0), 3 copies.
    const anchors = RepetitionMath.generateAnchors({ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, 3);
    assert(anchors.length === 3, 'generateAnchors produces exactly `count` anchors');
    close(anchors[0].x, 5, 'copy 1 anchor');
    close(anchors[1].x, 10, 'copy 2 anchor');
    close(anchors[2].x, 15, 'copy 3 anchor');

    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const { world, building, ids: [a, b] } = createWorldWithBricks([
        { position: new Position(10, 0.5, 10) },
        { position: new Position(12, 0.5, 10) }
    ]);
    world.addGroup(new Group({ name: 'Pair', brickIds: [a, b] }));
    const document = new Document({ world });
    const history = new CommandHistory({ world });
    const selection = new SelectionState({
        items: [a, b].map((brickId) => ({ type: 'brick', buildingId: building.id, brickId }))
    });

    const useCase = new RepeatSelectionUseCase(brickRegistry);
    const command = useCase.execute(selection, document, { count: 3, offset: { x: 5, y: 0, z: 0 } });
    assert(command, 'a valid repetition produces a command');
    assert(command.type === 'composite', 'the whole repetition is one CompositeCommand');
    assert(command.commands.length === 3, 'one child paste-bricks command per copy');
    assert(command.commands.every((child) => child.type === 'paste-bricks'), 'each copy reuses PasteBricksCommand — no new command class');

    history.execute(command);
    assert(building.getBricks().length === 8, 'original 2 + 3 copies of 2 bricks each = 8');
    assert(world.getGroups().length === 4, 'the fully-covered Group travels with EVERY copy — original + 3 repeats');

    // Deterministic, uniform offsets: each copy's own A/B pair sits
    // exactly `i * offset` away from the ORIGINAL A/B pair, regardless
    // of where in the World the source selection started.
    const allBricks = building.getBricks();
    const originalAx = 10, originalBx = 12;
    for (let i = 1; i <= 3; i++) {
        const expectedAx = originalAx + 5 * i;
        const expectedBx = originalBx + 5 * i;
        assert(allBricks.some((brick) => Math.abs(brick.position.x - expectedAx) < 1e-9 && Math.abs(brick.position.z - 10) < 1e-9),
            `copy ${i} has a brick at the expected A position`);
        assert(allBricks.some((brick) => Math.abs(brick.position.x - expectedBx) < 1e-9 && Math.abs(brick.position.z - 10) < 1e-9),
            `copy ${i} has a brick at the expected B position`);
    }

    // Fresh identities: every created brick id is new, and the 3 copies
    // never collide with each other's or the original's ids.
    const allIds = allBricks.map((brick) => brick.id);
    assert(new Set(allIds).size === allIds.length, 'every brick across every copy has a unique identity');
    assert(allIds.includes(a) && allIds.includes(b), 'the original bricks are untouched and still present');

    console.log('✓ RepeatSelectionUseCase: deterministic per-copy offsets, fresh ids, group-aware, no new command class');
}

// ---------------------------------------------------------------------
// 4. Atomicity — a mid-batch collision rejects the WHOLE repetition
// ---------------------------------------------------------------------

{
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const { world, building, ids: [a] } = createWorldWithBricks([
        { position: new Position(0, 0.5, 0) }
    ]);
    // Copy anchors for offset (2,0,0): 2, 4, 6, 8, 10. Plant a blocker
    // exactly at copy 4's landing spot.
    const blocker = new Brick({ definitionId: 'core:cube', position: new Position(8, 0.5, 0) });
    building.addBrick(blocker);
    const document = new Document({ world });
    const history = new CommandHistory({ world });
    const selection = new SelectionState({ items: [{ type: 'brick', buildingId: building.id, brickId: a }] });
    const worldBeforeJSON = JSON.stringify(world.toJSON());

    const useCase = new RepeatSelectionUseCase(brickRegistry);
    const command = useCase.execute(selection, document, { count: 5, offset: { x: 2, y: 0, z: 0 } });
    assert(command === null, 'a repetition that would collide on ANY copy is rejected entirely — not just the colliding one');
    assert(JSON.stringify(world.toJSON()) === worldBeforeJSON, 'the World is byte-identical to before the rejected repetition — zero partial mutation');
    assert(building.getBricks().length === 2, 'only the original brick and the blocker exist — copies 1-3 were never created either');
    assert(history.getExecutedCommands().length === 0, 'a rejected repetition never reaches CommandHistory at all');

    console.log('✓ Atomicity: copy 4 of 5 colliding rejects the entire batch — copies 1-3 are never created, zero mutation');
}

// ---------------------------------------------------------------------
// 5. One history entry; undo/redo reproduce the repetition exactly
// ---------------------------------------------------------------------

{
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const { world, building, ids: [a] } = createWorldWithBricks([
        { position: new Position(0, 0.5, 0) }
    ]);
    const document = new Document({ world });
    const history = new CommandHistory({ world });
    const selection = new SelectionState({ items: [{ type: 'brick', buildingId: building.id, brickId: a }] });

    const useCase = new RepeatSelectionUseCase(brickRegistry);
    const command = useCase.execute(selection, document, { count: 4, offset: { x: 3, y: 0, z: 0 } });
    history.execute(command);
    assert(history.getCursor() === 1, 'a successful repetition of N copies is still exactly ONE history operation');
    assert(building.getBricks().length === 5, 'original + 4 copies');
    const idsAfterRepeat = building.getBricks().map((brick) => brick.id).sort();

    history.undo();
    assert(building.getBricks().length === 1, 'undo removes the COMPLETE repeated construction, not just the last copy');
    assert(building.getBricks()[0].id === a, 'undo leaves exactly the original brick');

    history.redo();
    const idsAfterRedo = building.getBricks().map((brick) => brick.id).sort();
    assert(building.getBricks().length === 5, 'redo recreates all 4 copies');
    assert(JSON.stringify(idsAfterRedo) === JSON.stringify(idsAfterRepeat), 'redo reproduces the EXACT SAME identities, not fresh ones');

    console.log('✓ One history entry per repetition; undo removes the complete construction; redo reproduces identical identities');
}

// ---------------------------------------------------------------------
// 6. EditorSession / WorldNavigationSession wiring
// ---------------------------------------------------------------------

{
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const { world, building, ids: [a, b] } = createWorldWithBricks([
        { position: new Position(0, 0.5, 0) },
        { position: new Position(2, 0.5, 0) }
    ]);
    const document = new Document({ world, metadata: new DocumentMetadata({ title: 'Repeat Wiring', author: 'tester' }) });
    const editorContext = new EditorContext();
    const documentManager = new DocumentManager();
    documentManager.load(document, 'editor-doc');

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
        repeatSelectionUseCase: new RepeatSelectionUseCase(brickRegistry)
    });
    session._commandHistory = new CommandHistory({ world });

    editorContext.setSelection(new SelectionState({
        items: [a, b].map((brickId) => ({ type: 'brick', buildingId: building.id, brickId }))
    }));

    assert(session.repeatSelection({ count: 2, offset: { x: 10, y: 0, z: 0 } }) === true, 'EditorSession#repeatSelection succeeds');
    assert(session.commandHistory.getExecutedCommands().length === 1, 'repeatSelection is one history entry through EditorSession too');
    assert(building.getBricks().length === 6, 'original 2 + 2 copies of 2 = 6');
    const activeSelection = editorContext.selection.brickIds;
    assert(activeSelection.length === 4, 'every brick from every copy becomes the new active selection (2 copies x 2 bricks)');
    assert(activeSelection.every((id) => id !== a && id !== b), 'the active selection is the repeats, not the originals');

    // Without a repeatSelectionUseCase wired in, the method degrades
    // gracefully — the same posture every other optional collaborator
    // here already follows (structureResolver, exportBlueprintUseCase, ...).
    const bareSession = new EditorSession({
        registry: brickRegistry,
        editorContext: new EditorContext(),
        toolRegistry: null,
        documentManager,
        selectionUseCase: new SelectionUseCase(editorContext),
        previewUseCase: new PreviewUseCase(editorContext),
        loadDocumentUseCase: null,
        copySelectionUseCase: new CopySelectionUseCase(brickRegistry),
        pasteClipboardUseCase: new PasteClipboardUseCase()
    });
    bareSession._commandHistory = new CommandHistory({ world });
    assert(bareSession.repeatSelection({ count: 2, offset: { x: 1, y: 0, z: 0 } }) === false, 'repeatSelection() degrades gracefully when the use case was never wired');

    console.log('✓ EditorSession#repeatSelection: same one-entry/active-selection contract as duplicateSelection(), graceful without the use case');
}

{
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const { world, building, ids: [a] } = createWorldWithBricks([{ position: new Position(0, 0.5, 0) }]);
    const document = new Document({ world, metadata: new DocumentMetadata({ title: 'World Repeat Test', author: 'tester' }) });
    storage.save(document.world.id, serializer.serialize(document));

    const worldRegistry = new CreateBrickRegistryUseCase().execute();
    const commandRegistry = new CreateCommandRegistryUseCase().execute();
    const replayUseCase = new ReplayDocumentUseCase(commandRegistry);
    const nav = new WorldNavigationSession({
        registry: worldRegistry,
        loadPublicationDocumentUseCase: new LoadPublicationDocumentUseCase(storage),
        worldLayoutProvider: stubLayoutProvider,
        saveDocumentUseCase: new SaveDocumentUseCase(storage),
        replayDocumentUseCase: replayUseCase,
        restoreHistoryStateUseCase: new RestoreHistoryStateUseCase(replayUseCase),
        documentCloneService: null,
        copySelectionUseCase: new CopySelectionUseCase(worldRegistry),
        pasteClipboardUseCase: new PasteClipboardUseCase(),
        repeatSelectionUseCase: new RepeatSelectionUseCase(worldRegistry)
    });
    nav._eventBus = new EventBus();
    nav._session = {
        addWorld: () => {}, removeWorld: () => {}, selectBricks: () => {},
        clearSelection: () => {}, clearHover: () => {}, hidePreview: () => {}
    };
    nav._loadWorld(document.world.id);
    nav._focusedDocumentId = document.world.id;

    const docId = document.world.id;
    const liveWorld = nav.getDocument(docId).world;
    const liveBuilding = liveWorld.getBuildings()[0];
    nav._setSpatialSelection(SpatialSelectionState.bricks({
        documentId: docId,
        items: [{ type: 'brick', buildingId: liveBuilding.id, brickId: a }]
    }));

    const history = nav._commandHistories.get(docId);
    assert(nav.repeatSelection({ count: 3, offset: { x: 4, y: 0, z: 0 } }) === true, 'World View repeatSelection succeeds');
    assert(history.getCursor() === 1, 'World View repetition is exactly ONE history entry');
    assert(liveBuilding.getBricks().length === 4, 'original + 3 copies');
    const newSelection = nav.getSpatialSelection();
    assert(newSelection.brickIds.length === 3, 'World View active selection becomes all 3 repeated bricks');

    nav.undo();
    assert(liveBuilding.getBricks().length === 1, 'World View undo removes the whole repetition');
    nav.redo();
    assert(liveBuilding.getBricks().length === 4, 'World View redo recreates it');

    const replayed = replayUseCase.execute(history);
    assert(JSON.stringify(replayed.toJSON()) === JSON.stringify(liveWorld.toJSON()), 'replay reproduces the repetition byte-for-byte');

    console.log('✓ WorldNavigationSession#repeatSelection: one entry, active selection is the repeats, undo/redo/replay exact');
}

// ---------------------------------------------------------------------
// 7. Collaboration — world-sync reconstructs the SAME repetition
// ---------------------------------------------------------------------
//
// application/WorldCommandPropagationUseCase.js's own contract (see its
// own header): the sender calls command.toJSON() exactly once, right
// after a real local execute(); the receiver reconstructs the command
// via CommandRegistry.fromJSON() and calls command.execute({ world })
// DIRECTLY — never through its own CommandHistory. This section proves
// a RepeatSelectionUseCase composite survives exactly that round trip:
// two independent World instances (Alice's and Bob's own replicas,
// never the same object), starting from identical content, converge to
// byte-identical state after Alice's repetition crosses the wire.

{
    const registry = new CreateBrickRegistryUseCase().execute();
    const commandRegistry = new CreateCommandRegistryUseCase().execute();

    const alice = createWorldWithBricks([
        { id: 'shared-a', position: new Position(0, 0.5, 0) },
        { id: 'shared-b', position: new Position(2, 0.5, 0) }
    ], 'shared-world', 'shared-building');
    const bob = createWorldWithBricks([
        { id: 'shared-a', position: new Position(0, 0.5, 0) },
        { id: 'shared-b', position: new Position(2, 0.5, 0) }
    ], 'shared-world', 'shared-building');
    assert(JSON.stringify(alice.world.toJSON()) === JSON.stringify(bob.world.toJSON()), 'Alice and Bob start from identical replicas');

    const aliceDocument = new Document({ world: alice.world });
    const aliceHistory = new CommandHistory({ world: alice.world });
    const selection = new SelectionState({
        items: ['shared-a', 'shared-b'].map((brickId) => ({ type: 'brick', buildingId: alice.building.id, brickId }))
    });
    const useCase = new RepeatSelectionUseCase(registry);
    const command = useCase.execute(selection, aliceDocument, { count: 2, offset: { x: 0, y: 0, z: 5 } });
    assert(command, 'Alice\'s repetition is valid');
    aliceHistory.execute(command);

    // The wire payload: exactly what WorldCommandPropagationUseCase's
    // broadcastCommand() sends — command.toJSON(), called once, after
    // the local execute() above already ran.
    const wirePayload = command.toJSON();
    const reconstructed = commandRegistry.fromJSON(wirePayload);
    reconstructed.execute({ world: bob.world });

    assert(JSON.stringify(alice.world.toJSON()) === JSON.stringify(bob.world.toJSON()),
        'Alice and Bob converge to byte-identical World state after the repetition crosses the wire');

    // Retransmitting the identical operation must not double-apply on a
    // THIRD, otherwise-untouched replica reconstructed from the same
    // payload twice would corrupt it — reconstructing and executing
    // fresh command instances from the SAME JSON is exactly what
    // WorldOperationEnvelope/ReplayGuard idempotency (application/
    // WorldCommandPropagationUseCase.js) exists to prevent in the real
    // network path; this section only proves the command itself is
    // side-effect-free to reconstruct (a fresh instance from the same
    // JSON creates the SAME recorded ids, never asks for new ones).
    const secondReconstruction = commandRegistry.fromJSON(wirePayload);
    const idsFromFirst = reconstructed.commands.flatMap((child) => child.executedBrickIds).sort();
    const idsFromSecond = secondReconstruction.commands.flatMap((child) => child.executedBrickIds).sort();
    assert(JSON.stringify(idsFromFirst) === JSON.stringify(idsFromSecond), 'reconstructing from the same payload always yields the same recorded identities');

    console.log('✓ Collaboration: a repetition command reconstructed from its own wire payload converges two independent replicas byte-identically');
}

// ---------------------------------------------------------------------
// 8 — CAPSTONE: repeat -> select -> extract -> export -> import -> place
// ---------------------------------------------------------------------

{
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    // A tiny 2-brick "house" to repeat.
    const { world, building, ids: [wallA, wallB] } = createWorldWithBricks([
        { position: new Position(0, 0.5, 0) },
        { position: new Position(1, 0.5, 0) }
    ]);
    const document = new Document({ world, metadata: new DocumentMetadata({ title: 'Capstone Repeat', author: 'alice' }) });

    const selection = new SelectionState({
        items: [wallA, wallB].map((brickId) => ({ type: 'brick', buildingId: building.id, brickId }))
    });
    const repeatUseCase = new RepeatSelectionUseCase(brickRegistry);
    const command = repeatUseCase.execute(selection, document, { count: 3, offset: { x: 3, y: 0, z: 0 } });
    const history = new CommandHistory({ world });
    history.execute(command);
    assert(building.getBricks().length === 8, 'original house + 3 repeated houses, 2 bricks each');

    // Select just the SECOND repeated copy (command.commands[1]) — a
    // fresh, independent selection touching only bricks the repetition
    // itself created.
    const secondCopyIds = command.commands[1].executedBrickIds;
    assert(secondCopyIds.length === 2, 'the second copy created exactly 2 bricks');
    const copySelection = new SelectionState({
        items: secondCopyIds.map((brickId) => ({ type: 'brick', buildingId: building.id, brickId }))
    });

    // Extract it into a reusable Structure — proves a repeated copy is
    // ordinary, independent World content, exactly the property 0.4.7's
    // own capstone already established for a plain duplicate.
    const structure = new CreateStructureFromSelectionUseCase().execute(copySelection, document, {
        registry: brickRegistry,
        name: 'Repeated Cottage'
    });
    assert(structure && structure.bricks.length === 2, 'the repeated copy extracts into a 2-brick Structure');
    assert(building.getBricks().length === 8, 'extraction never mutates the source Document');

    // Export -> import: a full round trip through the portable blueprint
    // package format, fresh ids on the way back in (0.4.6's own contract).
    const pkg = new ExportBlueprintUseCase().execute(structure);
    assert(pkg.kind === 'forkbuild.blueprint', 'export produces a real blueprint package');
    const imported = new ImportBlueprintUseCase().execute(pkg, { registry: brickRegistry });
    assert(imported.id !== structure.id, 'import mints a fresh Structure id');
    assert(imported.bricks.length === 2, 'import reproduces both bricks');
    assert(imported.bricks.every((brick) => !secondCopyIds.includes(brick.id)), 'import mints fresh brick ids, never reusing the repeated copy\'s own ids');

    // Place the IMPORTED structure back into the (now quite full)
    // Document — the final link back into ordinary World content.
    const placeCommand = new CopyStructureIntoDocumentUseCase().execute(imported, {
        worldId: world.id,
        buildingId: building.id,
        world,
        registry: brickRegistry
    });
    assert(placeCommand, 'CopyStructureIntoDocumentUseCase produces a command for the imported structure');
    history.execute(placeCommand);
    assert(building.getBricks().length === 10, 'the imported structure adds its own 2 bricks on top of everything already there');
    assert(history.getExecutedCommands().length === 2, 'repeat + place are two independent history entries, each atomic on its own');

    console.log('✓ CAPSTONE: repeat -> select one copy -> extract -> export -> import -> place — the full 0.4.x chain over freshly repeated content');
}

console.log('\nAll alignment and repetition tests passed.');
