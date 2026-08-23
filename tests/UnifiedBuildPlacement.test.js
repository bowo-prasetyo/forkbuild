import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { CreateStructureRegistryUseCase } from '../application/CreateStructureRegistryUseCase.js';
import { CreateEditorContextUseCase } from '../application/CreateEditorContextUseCase.js';
import { PreviewUseCase } from '../application/PreviewUseCase.js';
import { CompositionPreviewUseCase } from '../application/CompositionPreviewUseCase.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { PlacementTool } from '../application/tools/PlacementTool.js';
import { StructureCompositionTool } from '../application/tools/StructureCompositionTool.js';
import { CopyStructureIntoDocumentUseCase } from '../application/CopyStructureIntoDocumentUseCase.js';
import { ForkStructureUseCase } from '../application/ForkStructureUseCase.js';
import { transformStructureBricks } from '../application/StructureCompositionTransform.js';
import { EditorSession } from '../application/EditorSession.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { ToolId } from '../application/editor-state/ToolId.js';

// 0.4.5 — Unified Build Placement.
//
// docs/Principles.md now states it directly: "Buildable Things Share
// One Placement Experience." Bricks and Structures keep their own
// internal representations and commit semantics (a Brick is one
// PlaceBrickCommand; a Structure is one PasteBricksCommand via
// CopyStructureIntoDocumentUseCase), but selecting either from the
// Build Library now enters the SAME user-facing lifecycle: preview,
// transform (rotate), validate, commit. This file is the flagship proof
// of that shared contract, run headlessly against PlacementTool and
// StructureCompositionTool directly (no renderer/ import, same
// boundary tests/PlacementPreviewUX.test.js and
// tests/StructureCompositionPlacement.test.js already established) —
// the actual per-mechanism depth (rotation composition math, collision
// edge cases, serialization round-trips) already lives in those two
// files and tests/BuildLibraryUX.test.js; this file only asserts that
// the two mechanisms present ONE contract, not two.
//
//   Section A: Brick — select, preview, rotate, commit, undo
//   Section B: Structure — select, preview, rotate, commit, undo
//              (the SAME lifecycle shape as Section A, key for key)
//   Section C: Collision — an invalid preview refuses to commit for
//              BOTH a Brick and a Structure
//   Section D: Determinism — the same Structure/position/rotation
//              placed into two independent Documents produces
//              byte-identical resulting geometry
//   Section E: Fork stays separate — EditorSession.beginStructureComposition()
//              ("Place Structure", the unified entry point) never opens
//              or creates a Document; EditorSession.forkStructure()
//              ("Fork As New Document", still a distinct secondary
//              action) still does

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const stubIdentityProvider = {
    currentUser: () => ({ username: 'alice', displayName: 'alice', providerId: 'stub' })
};

function buildBrickTool({ occupied = [] } = {}) {
    const registry = new CreateBrickRegistryUseCase().execute();
    const editorContext = new CreateEditorContextUseCase().execute();
    const previewUseCase = new PreviewUseCase(editorContext);

    const world = new World();
    const building = new Building({ creator: 'local' });
    for (const position of occupied) {
        building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(position.x, position.y, position.z) }));
    }
    world.addBuilding(building);
    const commandHistory = new CommandHistory({ world });

    editorContext.setActiveBrick('core:cube');
    const context = { registry, editorContext, world, previewUseCase, commandHistory };
    const tool = new PlacementTool(context);
    return { tool, editorContext, world, building, commandHistory };
}

function buildStructureTool({ occupied = [] } = {}) {
    const registry = new CreateBrickRegistryUseCase().execute();
    const editorContext = new CreateEditorContextUseCase().execute();
    const compositionPreviewUseCase = new CompositionPreviewUseCase(editorContext);
    const copyStructureIntoDocumentUseCase = new CopyStructureIntoDocumentUseCase();

    const world = new World();
    const building = new Building({ creator: 'local' });
    for (const brick of occupied) {
        building.addBrick(brick);
    }
    world.addBuilding(building);
    const commandHistory = new CommandHistory({ world });

    const context = {
        world, registry, editorContext, commandHistory,
        structureResolver: null, compositionPreviewUseCase, copyStructureIntoDocumentUseCase
    };
    const tool = new StructureCompositionTool(context);
    return { tool, editorContext, world, building, commandHistory };
}

async function run() {
    const structureRegistry = new CreateStructureRegistryUseCase().execute();
    const house = structureRegistry.get('village:house');

    // ---------------------------------------------------------------
    // Section A: Brick — select, preview, rotate, commit, undo
    // ---------------------------------------------------------------
    {
        const { tool, editorContext, building, commandHistory } = buildBrickTool();

        tool.onPointerMove({ worldPosition: { x: 5, y: 0, z: 5 }, pickedBrick: null });
        assert(editorContext.preview.visible === true, '1. Brick: hovering after selection shows a visible ghost preview');
        assert(editorContext.preview.valid === true, '2. Brick: an empty position previews as valid');

        tool.onKeyDown({ key: 'r', modifiers: {} });
        assert(editorContext.preview.rotation === 90, '3. Brick: R rotates the pending placement by +90');

        tool.onPointerDown({});
        assert(building.getBricks().length === 1, '4. Brick: a valid click commits exactly one Brick');
        assert(building.getBricks()[0].rotation === 90, '5. Brick: the committed Brick carries exactly the rotation the preview showed');
        assert(commandHistory.getCursor() === 1, '6. Brick: commit produces exactly one history entry');
        assert(editorContext.preview.visible === false, '7. Brick: the preview hides after committing');

        commandHistory.undo();
        assert(building.getBricks().length === 0, '8. Brick: one undo removes the placed Brick completely');

        console.log('✓ Section A: Brick — select, preview, rotate, commit, undo');
    }

    // ---------------------------------------------------------------
    // Section B: Structure — the SAME lifecycle shape as Section A
    // ---------------------------------------------------------------
    {
        const { tool, editorContext, building, commandHistory } = buildStructureTool();

        editorContext.setActiveComposition(house);
        tool.activate();
        assert(editorContext.compositionPreview.visible === true,
            '9. Structure: selecting it and entering Place seeds a visible ghost preview — same lifecycle shape as a Brick');

        tool.onPointerMove({ worldPosition: { x: 30, y: 0, z: 30 } });
        assert(editorContext.compositionPreview.valid === true, '10. Structure: an empty position previews as valid');

        tool.onKeyDown({ key: 'r', modifiers: {} });
        assert(editorContext.compositionPreview.rotation === 90,
            '11. Structure: R rotates the pending placement by +90 — the exact same key and delta as Brick placement');

        const bricksBeforeCommit = building.getBricks().length;
        tool.onPointerDown();
        assert(building.getBricks().length === bricksBeforeCommit + house.bricks.length,
            '12. Structure: a valid click commits every one of the Structure\'s bricks');
        assert(commandHistory.getCursor() === 1,
            '13. Structure: commit produces exactly ONE history entry, mirroring a Brick\'s own single-command commit');
        assert(editorContext.compositionPreview.visible === false, '14. Structure: the preview hides after committing');
        assert(editorContext.activeComposition.isActive === false, '15. Structure: the active composition clears after committing');

        commandHistory.undo();
        assert(building.getBricks().length === bricksBeforeCommit,
            '16. Structure: one undo removes every placed brick completely — the same "one undo, one placement" contract as a Brick');

        console.log('✓ Section B: Structure — select, preview, rotate, commit, undo (same shape as a Brick)');
    }

    // ---------------------------------------------------------------
    // Section C: Collision — an invalid preview refuses to commit,
    // for BOTH a Brick and a Structure
    // ---------------------------------------------------------------
    {
        const { tool, editorContext, building, commandHistory } = buildBrickTool({ occupied: [{ x: 0, y: 0.5, z: 0 }] });
        tool.onPointerMove({ worldPosition: { x: 0, y: 0, z: 0 }, pickedBrick: null });
        assert(editorContext.preview.valid === false, '17. Brick: hovering an occupied position previews as invalid');
        tool.onPointerDown({});
        assert(building.getBricks().length === 1, '18. Brick: an invalid preview refuses to commit');
        assert(commandHistory.getCursor() === 0, '19. Brick: a refused click leaves history untouched');
    }
    {
        const blocker = new Brick({ definitionId: 'core:block_2x2', position: new Position(2, 1, 2) });
        const { tool, editorContext, building, commandHistory } = buildStructureTool({ occupied: [blocker] });
        editorContext.setActiveComposition(house);
        tool.activate();
        tool.onPointerMove({ worldPosition: { x: 2, y: 0, z: 2 } });
        assert(editorContext.compositionPreview.valid === false,
            '20. Structure: hovering the existing footprint previews as invalid — the SAME contract as a Brick');
        tool.onPointerDown();
        assert(building.getBricks().length === 1, '21. Structure: an invalid preview refuses to commit');
        assert(commandHistory.getCursor() === 0, '22. Structure: a refused click leaves history untouched');
    }
    console.log('✓ Section C: an invalid preview refuses to commit for both a Brick and a Structure');

    // ---------------------------------------------------------------
    // Section D: Determinism — the same Structure/position/rotation
    // placed into two independent Documents produces byte-identical
    // resulting geometry
    // ---------------------------------------------------------------
    {
        const transform = { position: { x: 12, y: 0, z: -4 }, rotation: 180 };
        const snapshot = (items) => JSON.stringify(
            items.map((i) => `${i.definitionId}|${i.position.x}|${i.position.y}|${i.position.z}|${i.rotation}`).sort()
        );

        const runA = transformStructureBricks(house, transform);
        const runB = transformStructureBricks(house, transform);
        assert(snapshot(runA) === snapshot(runB),
            '23. Determinism: two independent geometry computations of the same Structure/position/rotation are byte-identical');

        const brickRegistry = new CreateBrickRegistryUseCase().execute();
        const copyUseCase = new CopyStructureIntoDocumentUseCase();

        const worldA = new World();
        const buildingA = new Building({ creator: 'local' });
        worldA.addBuilding(buildingA);
        const commandA = copyUseCase.execute(house, { worldId: worldA.id, buildingId: buildingA.id, world: worldA, registry: brickRegistry, transform });
        commandA.execute({ world: worldA });

        const worldB = new World();
        const buildingB = new Building({ creator: 'local' });
        worldB.addBuilding(buildingB);
        const commandB = copyUseCase.execute(house, { worldId: worldB.id, buildingId: buildingB.id, world: worldB, registry: brickRegistry, transform });
        commandB.execute({ world: worldB });

        const bricksSnapshot = (bricks) => JSON.stringify(
            bricks.map((b) => `${b.definitionId}|${b.position.x}|${b.position.y}|${b.position.z}|${b.rotation}`).sort()
        );
        assert(bricksSnapshot(buildingA.getBricks()) === bricksSnapshot(buildingB.getBricks()),
            '24. Determinism: committing the same Structure/position/rotation into two independent Documents produces identical resulting geometry');

        console.log('✓ Section D: placement geometry is deterministic across independent executions and independent Documents');
    }

    // ---------------------------------------------------------------
    // Section E: Fork stays separate — Place Structure never opens or
    // creates a Document; Fork As New Document still does
    // ---------------------------------------------------------------
    {
        const brickRegistry = new CreateBrickRegistryUseCase().execute();
        const world = new World();
        const building = new Building({ creator: 'local' });
        world.addBuilding(building);
        const document = new Document({ world, metadata: new DocumentMetadata({ title: 'Unified Placement' }) });
        const documentManager = new DocumentManager(document);
        const editorContext = new CreateEditorContextUseCase().execute();

        const session = new EditorSession({
            registry: brickRegistry,
            editorContext,
            toolRegistry: null,
            documentManager,
            selectionUseCase: null,
            previewUseCase: null,
            loadDocumentUseCase: null,
            identityProvider: stubIdentityProvider,
            forkStructureUseCase: new ForkStructureUseCase(),
            copyStructureIntoDocumentUseCase: new CopyStructureIntoDocumentUseCase()
        });
        session._commandHistory = new CommandHistory({ world });

        let openedWith = null;
        session.openDocument = (doc) => { openedWith = doc; };

        // "Place House" — BuildLibraryPanel's unified click-to-place
        // entry point (emits 'place-structure', handled by
        // EditorSession#beginStructureComposition()) — never opens or
        // creates a Document.
        const started = session.beginStructureComposition(house);
        assert(started === true, '25. Fork stays separate: Place Structure begins successfully');
        assert(openedWith === null, '26. Fork stays separate: Place Structure never opens or creates a Document');
        assert(documentManager.document === document, '27. Fork stays separate: Place Structure never replaces the open Document');
        assert(editorContext.tool.activeTool === ToolId.COMPOSE_STRUCTURE,
            '28. Fork stays separate: Place Structure enters the shared Place lifecycle (COMPOSE_STRUCTURE)');

        // "Fork As New Document" — still a distinct, secondary action,
        // tucked into the Build Library's own "⋮" menu — DOES open a
        // brand-new Document.
        const forked = session.forkStructure(house);
        assert(forked === true, '29. Fork stays separate: Fork As New Document still succeeds');
        assert(openedWith !== null && openedWith !== document,
            '30. Fork stays separate: Fork As New Document opens a brand-new Document, unlike Place');
        assert(openedWith.metadata.parentStructureId === 'village:house',
            '31. Fork stays separate: the forked Document records its provenance');

        console.log('✓ Section E: Place Structure and Fork As New Document remain structurally independent operations');
    }

    console.log('\nAll unified build placement tests passed.');
}

await run();
