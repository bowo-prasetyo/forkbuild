import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { CreateStructureRegistryUseCase } from '../application/CreateStructureRegistryUseCase.js';
import { CreateCommandRegistryUseCase } from '../application/CreateCommandRegistryUseCase.js';
import { CreateEditorContextUseCase } from '../application/CreateEditorContextUseCase.js';
import { CopyStructureIntoDocumentUseCase } from '../application/CopyStructureIntoDocumentUseCase.js';
import { CompositionPreviewUseCase } from '../application/CompositionPreviewUseCase.js';
import { StructureCompositionTool } from '../application/tools/StructureCompositionTool.js';
import { transformStructureBricks } from '../application/StructureCompositionTransform.js';
import { StructureDocumentResolver } from '../application/StructureDocumentResolver.js';
import { EditorSession } from '../application/EditorSession.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { EditorEvent } from '../core/events/EditorEvent.js';
import { ToolId } from '../application/editor-state/ToolId.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.4.1 — Interactive Structure Composition UX.
//
// docs/Roadmap.md's own 0.4.0 "Deliberately excluded" section named
// this exact gap: "An interactive ghost-preview placement flow for
// Copy — drag, rotate, and click-to-commit before the bricks land."
// This file is that flow's flagship coverage, fully headless (core/ +
// application/ only, no renderer/ import anywhere —
// StructureCompositionTool never touches Three.js, exactly like
// application/tools/StructurePlacementTool.js's own tests/StructurePlacement.test.js
// note). The rendering half (the ghost mesh math) lives in
// tests/StructureCompositionRendering.test.js.
//
// Central architectural claim under test: composing a Structure
// interactively is STILL Copy, never a third mechanism — the tool only
// changes HOW the transform passed to
// CopyStructureIntoDocumentUseCase#execute() is chosen (interactively,
// via a preview) rather than always the deterministic auto-offset
// (0.4.0). Preview and commit resolve through the exact same
// transformStructureBricks() pipeline, so what the ghost shows IS what
// gets committed, never an approximation of it.
//
//   Section A: transformStructureBricks() — the pure rotate+translate
//              function, deterministic across every 90-degree turn
//   Section B: CopyStructureIntoDocumentUseCase — defaultTransform()
//              matches the 0.4.0 auto-offset exactly; an explicit
//              transform overrides it without disturbing the
//              non-interactive call shape
//   Section C: EditorContext — ActiveComposition/CompositionPreview
//              state round-trips through their own events
//   Section D-J: StructureCompositionTool — FLAGSHIP: ghost appears at
//              the deterministic auto position, moving the preview
//              mutates no Document state, rotating is deterministic,
//              an occupied position is invalid and refuses to commit,
//              a clear position commits exactly ONE PasteBricksCommand
//              whose geometry matches the preview exactly, undo/redo
//              restores the SAME bricks, Escape cancels with zero
//              Document mutation, and the composition preview
//              contributes nothing to Document/command serialization

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() {
        super();
        this._data = new Map();
    }
    save(name, data) {
        this._data.set(name, JSON.parse(JSON.stringify(data)));
    }
    load(name) {
        if (!this._data.has(name)) return null;
        return JSON.parse(JSON.stringify(this._data.get(name)));
    }
    remove(name) {
        this._data.delete(name);
    }
    list() {
        return Array.from(this._data.keys());
    }
}

function makeEmptyDocument() {
    const world = new World();
    const building = new Building({ creator: 'local' });
    world.addBuilding(building);
    const document = new Document({ world, metadata: new DocumentMetadata({ title: 'Composition' }) });
    return { world, building, document };
}

function bricksSnapshot(bricks) {
    return bricks
        .map((b) => `${b.definitionId}|${b.position.x}|${b.position.y}|${b.position.z}|${b.rotation}`)
        .sort();
}

async function run() {
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const structureRegistry = new CreateStructureRegistryUseCase().execute();
    const house = structureRegistry.get('village:house');
    const well = structureRegistry.get('village:well');
    const copyUseCase = new CopyStructureIntoDocumentUseCase();

    // ---------------------------------------------------------------
    // Section A: transformStructureBricks() — pure geometry
    // ---------------------------------------------------------------
    {
        const identity = transformStructureBricks(house, { position: { x: 0, y: 0, z: 0 }, rotation: 0 });
        assert(
            JSON.stringify(identity.map((i) => `${i.definitionId}|${i.position.x}|${i.position.y}|${i.position.z}|${i.rotation}`).sort())
            === JSON.stringify(bricksSnapshot(house.bricks)),
            '1. rotation 0 + zero translation reproduces the Structure\'s own local geometry exactly'
        );

        const translated = transformStructureBricks(house, { position: { x: 10, y: 0, z: -5 }, rotation: 0 });
        for (let i = 0; i < translated.length; i++) {
            assert(translated[i].position.x === house.bricks[i].position.x + 10, '2. translation applies to every brick\'s x');
            assert(translated[i].position.z === house.bricks[i].position.z - 5, '3. translation applies to every brick\'s z');
            assert(translated[i].rotation === house.bricks[i].rotation, '4. translation alone never changes brick rotation');
        }

        // A single 1x1 brick at local (2, 0.5, 0), rotated +90 around the
        // structure's own origin: (x, z) -> (-z, x) by the same formula
        // application/TransformMath.js uses everywhere else in this
        // codebase (x' = cos*dx - sin*dz, z' = sin*dx + cos*dz).
        const singleBrickStructure = { id: 'test:single', name: 'Single', bricks: [
            new Brick({ definitionId: 'core:cube', position: new Position(2, 0.5, 0), rotation: 0 })
        ] };
        const rotated90 = transformStructureBricks(singleBrickStructure, { position: { x: 0, y: 0, z: 0 }, rotation: 90 });
        assert(Math.abs(rotated90[0].position.x) < 1e-9 && Math.abs(rotated90[0].position.z - 2) < 1e-9,
            '5. rotating a local (2,0,0) brick +90 around the origin moves it to (0,0,2), matching TransformMath\'s convention');
        assert(rotated90[0].rotation === 90, '6. the brick\'s own rotation gains the transform\'s rotation too');

        const rotated270plus180 = transformStructureBricks(
            { id: 'test:rot', name: 'Rot', bricks: [new Brick({ definitionId: 'core:cube', position: new Position(0, 0, 0), rotation: 270 })] },
            { position: { x: 0, y: 0, z: 0 }, rotation: 180 }
        );
        assert(rotated270plus180[0].rotation === 90,
            '7. rotation composes and wraps deterministically: 270 + 180 -> 90, never 450');

        const rotatedThenTranslated = transformStructureBricks(singleBrickStructure, { position: { x: 5, y: 0, z: 5 }, rotation: 90 });
        assert(Math.abs(rotatedThenTranslated[0].position.x - 5) < 1e-9 && Math.abs(rotatedThenTranslated[0].position.z - 7) < 1e-9,
            '8. rotation is applied around the LOCAL origin first, translation second — never the other order');

        console.log('✓ Section A: transformStructureBricks() — deterministic rotate-then-translate geometry');
    }

    // ---------------------------------------------------------------
    // Section B: CopyStructureIntoDocumentUseCase — defaultTransform()
    // and explicit transform override
    // ---------------------------------------------------------------
    {
        const { world, building } = makeEmptyDocument();

        const emptyDefault = copyUseCase.defaultTransform(house, world, brickRegistry);
        assert(emptyDefault.position.x === 0 && emptyDefault.position.z === 0 && emptyDefault.rotation === 0,
            '9. defaultTransform() on an empty document is the untranslated, unrotated origin');

        building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
        const worldBounds = SpatialBounds.fromWorld(world, brickRegistry);
        const nextDefault = copyUseCase.defaultTransform(house, world, brickRegistry);
        assert(nextDefault.rotation === 0, '10. defaultTransform() never rotates — the deterministic AUTOMATIC placement stays axis-aligned');
        assert(nextDefault.position.x > worldBounds.max.x - 0.001,
            '11. defaultTransform() appends past the document\'s current occupied footprint along +X, exactly like 0.4.0\'s own offset rule');

        // An explicit transform overrides defaultTransform() entirely —
        // the interactive tool's own commit path (Section D-J below).
        const command = copyUseCase.execute(house, {
            worldId: world.id, buildingId: building.id, world, registry: brickRegistry,
            transform: { position: { x: 50, y: 0, z: 50 }, rotation: 90 }
        });
        assert(command.type === 'paste-bricks', '12. an explicit transform still produces an ordinary paste-bricks command');
        const items = command.items;
        const expected = transformStructureBricks(house, { position: { x: 50, y: 0, z: 50 }, rotation: 90 });
        assert(JSON.stringify(items.map((i) => `${i.position.x}|${i.position.z}|${i.rotation}`))
            === JSON.stringify(expected.map((i) => `${i.position.x}|${i.position.z}|${i.rotation}`)),
            '13. the command built from an explicit transform matches transformStructureBricks() exactly — one geometry pipeline, not two');

        console.log('✓ Section B: CopyStructureIntoDocumentUseCase — defaultTransform() and explicit-transform override');
    }

    // ---------------------------------------------------------------
    // Section C: EditorContext — ActiveComposition / CompositionPreview
    // ---------------------------------------------------------------
    {
        const editorContext = new CreateEditorContextUseCase().execute();
        assert(editorContext.activeComposition.isActive === false, '14. no active composition by default');
        assert(editorContext.compositionPreview.visible === false, '15. composition preview hidden by default');

        let lastActiveEvent = null;
        const unsubA = editorContext.eventBus.subscribe(EditorEvent.ACTIVE_COMPOSITION_CHANGED, (payload) => { lastActiveEvent = payload; });
        editorContext.setActiveComposition(house);
        assert(editorContext.activeComposition.isActive === true && editorContext.activeComposition.structure === house,
            '16. setActiveComposition() stores the Structure instance');
        assert(lastActiveEvent && lastActiveEvent.structure === house, '17. setActiveComposition() publishes ACTIVE_COMPOSITION_CHANGED');
        unsubA.unsubscribe();

        let lastPreviewEvent = null;
        const unsubB = editorContext.eventBus.subscribe(EditorEvent.COMPOSITION_PREVIEW_CHANGED, (payload) => { lastPreviewEvent = payload; });
        const compositionPreviewUseCase = new CompositionPreviewUseCase(editorContext);
        compositionPreviewUseCase.show(house, new Position(4, 0, 4), 90, true);
        assert(editorContext.compositionPreview.visible === true && editorContext.compositionPreview.structure === house
            && editorContext.compositionPreview.rotation === 90 && editorContext.compositionPreview.valid === true,
            '18. CompositionPreviewUseCase#show() sets every field');
        assert(lastPreviewEvent && lastPreviewEvent.compositionPreview.visible === true,
            '19. show() publishes COMPOSITION_PREVIEW_CHANGED');
        compositionPreviewUseCase.hide();
        assert(editorContext.compositionPreview.visible === false, '20. hide() clears visibility');
        unsubB.unsubscribe();

        console.log('✓ Section C: EditorContext — ActiveComposition/CompositionPreview state and events');
    }

    // ---------------------------------------------------------------
    // Sections D-J: StructureCompositionTool — FLAGSHIP
    // ---------------------------------------------------------------
    {
        const { world, building, document } = makeEmptyDocument();
        // An existing building occupies (0..4, 0..4) in the document —
        // composing House must be refused there.
        const preExistingBrick = new Brick({ definitionId: 'core:block_2x2', position: new Position(2, 1, 2) });
        building.addBrick(preExistingBrick);

        const commandHistory = new CommandHistory({ world });
        const editorContext = new CreateEditorContextUseCase().execute();
        const compositionPreviewUseCase = new CompositionPreviewUseCase(editorContext);
        const storage = new InMemoryStorageProvider();
        const structureResolver = new StructureDocumentResolver(storage);

        const context = {
            world, registry: brickRegistry, editorContext, commandHistory,
            structureResolver, compositionPreviewUseCase, copyStructureIntoDocumentUseCase: copyUseCase
        };
        const tool = new StructureCompositionTool(context);

        // ---- Phase A: activate() seeds the ghost at the deterministic
        // automatic composition position — "Copy Into Document" always
        // previews exactly where the non-interactive 0.4.0 path would
        // have placed it (docs/Roadmap.md, 0.4.1, "Add 'Place Here'
        // Semantics").
        editorContext.setActiveComposition(well);
        tool.activate();
        const seeded = editorContext.compositionPreview;
        const expectedDefault = copyUseCase.defaultTransform(well, world, brickRegistry);
        assert(seeded.visible === true && seeded.structure === well, '21. activate() shows a visible ghost for the active composition');
        assert(seeded.position.x === expectedDefault.position.x && seeded.rotation === 0,
            '22. Phase A: the seeded preview position is the SAME deterministic default copyStructureIntoDocument() would have used');

        // ---- Phase B: moving the preview mutates NO Document state.
        const bricksBeforeMove = building.getBricks().length;
        tool.onPointerMove({ worldPosition: { x: 6, y: 0, z: 6 } });
        assert(editorContext.compositionPreview.position.x === 6 && editorContext.compositionPreview.position.z === 6,
            '23. Phase B: the preview tracks the pointer\'s ground-snapped position');
        assert(building.getBricks().length === bricksBeforeMove,
            '24. Phase B: moving the preview never inserts, removes, or otherwise mutates a single Document brick');
        assert(commandHistory.getCursor() === 0, '25. Phase B: moving the preview creates no history entry');

        // ---- Phase C: rotating is deterministic.
        tool.onKeyDown({ key: 'r', modifiers: {} });
        assert(editorContext.compositionPreview.rotation === 90, '26. Phase C: R rotates the preview by exactly +90');
        tool.onKeyDown({ key: 'r', modifiers: {} });
        assert(editorContext.compositionPreview.rotation === 180, '27. Phase C: rotation accumulates deterministically across repeated presses');
        tool.onKeyDown({ key: 'r', modifiers: { shift: true } });
        assert(editorContext.compositionPreview.rotation === 90, '28. Phase C: Shift+R rotates back exactly -90, the same convention as StructurePlacementTool');

        // ---- Phase D: moving onto the existing building is invalid.
        tool.onKeyDown({ key: 'r', modifiers: {} }); // back to 180 so the geometry below is easy to reason about
        tool.onPointerMove({ worldPosition: { x: 2, y: 0, z: 2 } });
        assert(editorContext.compositionPreview.valid === false,
            '29. Phase D: hovering over the existing building\'s footprint shows an invalid preview');
        const countBeforeBlockedClick = building.getBricks().length;
        tool.onPointerDown();
        assert(building.getBricks().length === countBeforeBlockedClick, '30. Phase D: clicking an invalid preview commits nothing');
        assert(commandHistory.getCursor() === 0, '31. Phase D: a refused click leaves history untouched');
        assert(editorContext.tool.activeTool !== ToolId.SELECT || editorContext.compositionPreview.visible === true,
            '32. Phase D: a refused click keeps the tool in composition mode (never silently exits)');

        // ---- Phase E: moving to a clear position is valid again.
        tool.onPointerMove({ worldPosition: { x: 20, y: 0, z: 20 } });
        assert(editorContext.compositionPreview.valid === true, '33. Phase E: a clear position is valid again');

        // ---- Phase F: commit produces exactly ONE PasteBricksCommand,
        // matching the preview's own last position/rotation exactly.
        const previewBeforeCommit = editorContext.compositionPreview;
        const expectedItems = transformStructureBricks(well, { position: previewBeforeCommit.position, rotation: previewBeforeCommit.rotation });
        tool.onPointerDown();
        assert(commandHistory.getCursor() === 1, '34. Phase F: commit produces exactly one history entry, no matter how many bricks Well has');
        const composedBricks = building.getBricks().filter((b) => b.id !== preExistingBrick.id);
        assert(composedBricks.length === well.bricks.length,
            '35. Phase F: every one of Well\'s bricks landed, alongside the pre-existing brick, untouched');
        const committedSnapshot = bricksSnapshot(composedBricks);
        const expectedSnapshot = expectedItems.map((i) => `${i.definitionId}|${i.position.x}|${i.position.y}|${i.position.z}|${i.rotation}`).sort();
        assert(JSON.stringify(committedSnapshot) === JSON.stringify(expectedSnapshot),
            '36. Phase F: the committed bricks match EXACTLY what the preview last showed — preview is a visualization of the command, never an approximation');
        assert(editorContext.compositionPreview.visible === false, '37. Phase F: the preview hides after committing');
        assert(editorContext.activeComposition.isActive === false, '38. Phase F: the active composition clears after committing');
        assert(editorContext.tool.activeTool === ToolId.SELECT, '39. Phase F: composing is one-shot — committing returns to Select, unlike StructurePlacementTool');

        const wellBrickIds = composedBricks.map((b) => b.id);

        // ---- Phase G: undo removes every inserted brick in one step,
        // leaving the pre-existing brick untouched.
        commandHistory.undo();
        assert(building.getBricks().length === 1 && building.getBricks()[0].id === preExistingBrick.id,
            '40. Phase G: undo removes every composed brick in one atomic step, leaving the pre-existing brick alone');

        // ---- Phase H: redo brings back the SAME brick ids and the
        // SAME serialized geometry — PasteBricksCommand's own 0.1.42
        // redo contract, inherited for free.
        commandHistory.redo();
        const redoneBricks = building.getBricks().filter((b) => b.id !== preExistingBrick.id);
        assert(redoneBricks.length === well.bricks.length, '41. Phase H: redo restores every brick');
        assert(JSON.stringify(redoneBricks.map((b) => b.id).sort()) === JSON.stringify([...wellBrickIds].sort()),
            '42. Phase H: redo brings back the SAME brick ids, not a fresh set');
        assert(JSON.stringify(bricksSnapshot(redoneBricks)) === JSON.stringify(expectedSnapshot),
            '43. Phase H: redo reproduces the exact same geometry');

        console.log('✓ Sections D-J (part 1): ghost preview, move, rotate, collision-blocked click, valid commit, undo/redo');
    }

    // ---------------------------------------------------------------
    // Escape cancels with zero Document mutation
    // ---------------------------------------------------------------
    {
        const { world, building } = makeEmptyDocument();
        const commandHistory = new CommandHistory({ world });
        const editorContext = new CreateEditorContextUseCase().execute();
        const compositionPreviewUseCase = new CompositionPreviewUseCase(editorContext);
        const context = {
            world, registry: brickRegistry, editorContext, commandHistory,
            structureResolver: null, compositionPreviewUseCase, copyStructureIntoDocumentUseCase: copyUseCase
        };
        const tool = new StructureCompositionTool(context);

        editorContext.setActiveComposition(house);
        editorContext.setActiveTool(ToolId.COMPOSE_STRUCTURE);
        tool.activate();
        tool.onPointerMove({ worldPosition: { x: 5, y: 0, z: 5 } });
        assert(editorContext.compositionPreview.visible === true, '44. a composition is in progress before Escape');

        tool.onKeyDown({ key: 'Escape', modifiers: {} });
        assert(editorContext.compositionPreview.visible === false, '45. Escape hides the preview');
        assert(editorContext.activeComposition.isActive === false, '46. Escape clears the active composition');
        assert(editorContext.tool.activeTool === ToolId.SELECT, '47. Escape returns to Select');
        assert(building.getBricks().length === 0, '48. Escape leaves the Document completely untouched — zero bricks, zero commands');
        assert(commandHistory.getCursor() === 0, '49. Escape creates no history entry to undo');

        console.log('✓ Escape cancels a composition with zero Document mutation');
    }

    // ---------------------------------------------------------------
    // Composition preview contributes ZERO bytes to serialization —
    // it is pure Editor State, never Document/command data.
    // ---------------------------------------------------------------
    {
        const { world, building } = makeEmptyDocument();
        const commandHistory = new CommandHistory({ world });
        const editorContext = new CreateEditorContextUseCase().execute();
        const compositionPreviewUseCase = new CompositionPreviewUseCase(editorContext);
        const context = {
            world, registry: brickRegistry, editorContext, commandHistory,
            structureResolver: null, compositionPreviewUseCase, copyStructureIntoDocumentUseCase: copyUseCase
        };
        const tool = new StructureCompositionTool(context);

        editorContext.setActiveComposition(house);
        tool.activate();
        tool.onPointerMove({ worldPosition: { x: 3, y: 0, z: 3 } });
        tool.onPointerDown();

        const commandRegistry = new CreateCommandRegistryUseCase().execute();
        const lastCommand = commandHistory.getExecutedCommands().slice(-1)[0];
        const json = lastCommand.toJSON();
        assert(JSON.stringify(json).toLowerCase().includes('preview') === false,
            '50. the committed command\'s own serialized form carries no trace of "preview" — the ghost never leaked into command data');
        const restored = commandRegistry.fromJSON(json);
        assert(restored.type === 'paste-bricks' && JSON.stringify(restored.toJSON()) === JSON.stringify(json),
            '51. the committed command round-trips through the shared CommandRegistry with no special-casing, exactly like 0.4.0\'s own command');

        // Replicate the SAME command to a second, independent World (the
        // "Bob" scenario) — bricks land identically, proving the
        // interactive path produces the exact same replicable command
        // shape as the non-interactive 0.4.0 path always did.
        const bobWorld = new World({ id: world.id });
        const bobBuilding = new Building({ id: building.id, creator: 'local' });
        bobWorld.addBuilding(bobBuilding);
        const bobCommand = commandRegistry.fromJSON(json);
        bobCommand.execute({ world: bobWorld });
        assert(JSON.stringify(bricksSnapshot(bobBuilding.getBricks())) === JSON.stringify(bricksSnapshot(building.getBricks())),
            '52. replicating the committed command to an independent World produces an identical Document');

        console.log('✓ Composition preview contributes zero bytes to serialization; the committed command replicates identically');
    }

    // ---------------------------------------------------------------
    // EditorSession.beginStructureComposition() wiring
    // ---------------------------------------------------------------
    {
        const { world, building, document } = makeEmptyDocument();
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
            copyStructureIntoDocumentUseCase: copyUseCase
        });
        session._commandHistory = new CommandHistory({ world });

        assert(session.beginStructureComposition(null) === false, '53. beginStructureComposition: a falsy structure is a no-op');
        assert(editorContext.tool.activeTool !== ToolId.COMPOSE_STRUCTURE, '54. beginStructureComposition: a no-op never switches tools');

        const started = session.beginStructureComposition(house);
        assert(started === true, '55. beginStructureComposition: succeeds against a document with a building');
        assert(editorContext.activeComposition.structure === house, '56. beginStructureComposition: sets the active composition to the given Structure');
        assert(editorContext.tool.activeTool === ToolId.COMPOSE_STRUCTURE, '57. beginStructureComposition: switches to COMPOSE_STRUCTURE');
        assert(building.getBricks().length === 0, '58. beginStructureComposition: never touches the Document itself — only the tool\'s eventual commit does');

        // copyStructureIntoDocument() (0.4.0) remains the separate,
        // still-immediate verb — the two coexist, exactly as
        // docs/Principles.md's "Copying Composes A Blueprint; Forking
        // Creates One" already establishes for Copy vs. Fork.
        editorContext.setActiveTool(ToolId.SELECT);
        const copiedImmediately = session.copyStructureIntoDocument(well);
        assert(copiedImmediately === true, '59. copyStructureIntoDocument() still copies immediately, unchanged since 0.4.0');
        assert(building.getBricks().length === well.bricks.length, '60. the immediate copy path still lands bricks synchronously, with no preview step');

        console.log('✓ EditorSession.beginStructureComposition() — interactive and immediate composition entry points coexist');
    }

    console.log('\nAll structure composition placement tests passed.');
}

await run();
