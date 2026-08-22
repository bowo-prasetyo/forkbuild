import { Position } from '../core/Position.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { CreateStructureRegistryUseCase } from '../application/CreateStructureRegistryUseCase.js';
import { CreateCommandRegistryUseCase } from '../application/CreateCommandRegistryUseCase.js';
import { CopyStructureIntoDocumentUseCase } from '../application/CopyStructureIntoDocumentUseCase.js';
import { ForkDocumentUseCase } from '../application/ForkDocumentUseCase.js';
import { EditorSession } from '../application/EditorSession.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.4.0 — Structure Composition & Blueprint Library.
//
// Central architectural claim under test: Copy composes a blueprint,
// Fork creates one — see docs/Principles.md, "Copying Composes A
// Blueprint; Forking Creates One (0.4.0)". Copying a library Structure
// into the currently open Document inserts its bricks as ONE atomic
// PasteBricksCommand (CopyStructureIntoDocumentUseCase reuses the
// existing 0.1.42 command rather than introducing a parallel one — see
// that use case's own header) — no new Document, no World mutation
// beyond ordinary bricks, one undo entry no matter how many bricks the
// Structure places.
//
//   Phase A: Copy House into an empty document — bricks inserted with
//            the Structure's own untranslated geometry (byte-identical
//            to what ForkStructureUseCase already produces for the same
//            Structure), as one history entry
//   Phase B: Copy Well alongside House — both present, no AABB overlap,
//            still one history entry each (composition, never merged)
//   Phase C: Undo/redo — each copy fully reverses and fully restores
//            as ONE command, including bringing back the SAME brick ids
//   Phase D: The command CopyStructureIntoDocumentUseCase produces is
//            an ordinary, already-registered 'paste-bricks' command —
//            round-trips through CommandRegistry with no special-casing,
//            so replication/replay/serialization need no new coverage
//            beyond what tests/DocumentCloning.test.js and
//            tests/Grouping.test.js already exercise for PasteBricksCommand
//   Phase E: Composition survives Fork — a Document composed from
//            multiple Structures is an ORDINARY Document; forking it
//            (ForkDocumentUseCase) reproduces every composed brick with
//            fresh identities, exactly like forking any other Document

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

    let session, world, building, documentManager;

    // ---------------------------------------------------------------
    // Phase A: Copy House into an empty document
    // ---------------------------------------------------------------
    {
        const built = makeEmptyDocument();
        world = built.world;
        building = built.building;
        documentManager = new DocumentManager(built.document);

        const editorSession = new EditorSession({
            registry: brickRegistry,
            editorContext: null,
            toolRegistry: null,
            documentManager,
            selectionUseCase: null,
            previewUseCase: null,
            loadDocumentUseCase: null,
            copyStructureIntoDocumentUseCase: new CopyStructureIntoDocumentUseCase()
        });
        // Simulate the post-start() state EditorView would have — see
        // tests/Grouping.test.js's own "Editor parity" section, same pattern.
        editorSession._commandHistory = new CommandHistory({ world });
        session = editorSession;

        assert(session.copyStructureIntoDocument(null) === false, 'copy: a falsy structure is a no-op, not a throw');
        assert(building.getBricks().length === 0, 'copy: the no-op made no change');

        const result = session.copyStructureIntoDocument(house);
        assert(result === true, 'copy: copying House into an empty document succeeds');
        assert(session.commandHistory.getCursor() === 1, 'copy: exactly one history entry, no matter how many bricks House has');

        const insertedBricks = building.getBricks();
        assert(insertedBricks.length === house.bricks.length, 'copy: every one of House\'s bricks was inserted');

        // Byte-identical geometry to the Structure's own local bricks —
        // an empty document applies NO offset, matching what
        // ForkStructureUseCase already produces for the same Structure
        // (docs/StructureLibrary.md's own "same initial geometry" claim,
        // one rung over: composition into an empty document and forking
        // both start from the Structure's own untranslated bricks).
        assert(
            JSON.stringify(bricksSnapshot(insertedBricks)) === JSON.stringify(bricksSnapshot(house.bricks)),
            'copy: House copied into an empty document keeps its own local geometry exactly'
        );

        // Fresh brick identities — never one of the library Structure's own.
        const sourceIds = new Set(house.bricks.map((b) => b.id));
        for (const brick of insertedBricks) {
            assert(!sourceIds.has(brick.id), 'copy: a copied brick never reuses the library Structure\'s own brick id');
        }

        console.log('✓ Phase A: Copy House into an empty document — one command, byte-identical geometry, fresh ids');
    }

    // ---------------------------------------------------------------
    // Phase B: Compose — copy Well alongside House
    // ---------------------------------------------------------------
    let houseBrickIds, wellBrickIds;
    {
        const beforeIds = new Set(building.getBricks().map((b) => b.id));
        const result = session.copyStructureIntoDocument(well);
        assert(result === true, 'copy: copying Well after House succeeds');
        assert(session.commandHistory.getCursor() === 2, 'copy: House and Well are two separate history entries, never merged');

        const allBricks = building.getBricks();
        assert(allBricks.length === house.bricks.length + well.bricks.length,
            'copy: the document now holds every brick from both House and Well');

        houseBrickIds = [...beforeIds];
        wellBrickIds = allBricks.map((b) => b.id).filter((id) => !beforeIds.has(id));
        assert(wellBrickIds.length === well.bricks.length, 'copy: Well contributed exactly its own brick count');

        // No AABB overlap: the second copy is placed strictly past the
        // first along X (CopyStructureIntoDocumentUseCase's own
        // composition-offset rule), so House's bricks and Well's bricks
        // never share footprint.
        const houseBricksNow = allBricks.filter((b) => houseBrickIds.includes(b.id));
        const wellBricksNow = allBricks.filter((b) => wellBrickIds.includes(b.id));
        const houseBounds = SpatialBounds.fromBricks(houseBricksNow, brickRegistry);
        const wellBounds = SpatialBounds.fromBricks(wellBricksNow, brickRegistry);
        assert(houseBounds.max.x <= wellBounds.min.x,
            'copy: House and Well occupy disjoint footprints along X after composition');

        console.log('✓ Phase B: Copy Well alongside House — both present, disjoint footprints, still two atomic commands');
    }

    // ---------------------------------------------------------------
    // Phase C: Undo/redo restores everything as ONE command
    // ---------------------------------------------------------------
    {
        session.commandHistory.undo();
        assert(building.getBricks().length === house.bricks.length,
            'undo: undoing the Well copy removes every one of its bricks in one step');
        assert(!building.getBricks().some((b) => wellBrickIds.includes(b.id)),
            'undo: none of Well\'s bricks remain after undo');

        session.commandHistory.redo();
        const redoneBricks = building.getBricks();
        assert(redoneBricks.length === house.bricks.length + well.bricks.length,
            'redo: redoing the Well copy restores every one of its bricks in one step');
        const redoneWellIds = redoneBricks.map((b) => b.id).filter((id) => !houseBrickIds.includes(id));
        assert(JSON.stringify(redoneWellIds.sort()) === JSON.stringify([...wellBrickIds].sort()),
            'redo: the SAME brick ids come back, not a fresh set — PasteBricksCommand\'s own redo contract (0.1.42)');

        session.commandHistory.undo();
        session.commandHistory.undo();
        assert(building.getBricks().length === 0, 'undo: undoing both copies empties the document again');

        session.commandHistory.redo();
        session.commandHistory.redo();
        assert(building.getBricks().length === house.bricks.length + well.bricks.length,
            'redo: redoing both copies fully restores the composed blueprint');

        console.log('✓ Phase C: Undo/redo — each copy reverses and restores as one atomic command');
    }

    // ---------------------------------------------------------------
    // Phase D: the produced command is an ordinary, already-registered
    // command — no new replication/serialization surface
    // ---------------------------------------------------------------
    {
        const commandRegistry = new CreateCommandRegistryUseCase().execute();
        const lastCommand = session.commandHistory.getExecutedCommands().slice(-1)[0];
        assert(lastCommand.type === 'paste-bricks',
            'serialization: CopyStructureIntoDocumentUseCase produces an ordinary paste-bricks command');

        const json = lastCommand.toJSON();
        const restored = commandRegistry.fromJSON(json);
        assert(restored.type === 'paste-bricks', 'serialization: the command round-trips through the shared CommandRegistry');
        assert(JSON.stringify(restored.toJSON()) === JSON.stringify(json),
            'serialization: toJSON -> fromJSON -> toJSON is byte-identical, same guarantee every other command gives');

        console.log('✓ Phase D: composition produces an ordinary, already-registered command — no new replication surface');
    }

    // ---------------------------------------------------------------
    // Phase E: composition survives an ordinary Document fork
    // ---------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const saveDocumentUseCase = new SaveDocumentUseCase(storage);
        const savedId = saveDocumentUseCase.execute(documentManager);
        assert(savedId === world.id, 'compose-then-fork: the composed document saves under its own id');

        const forkDocumentUseCase = new ForkDocumentUseCase(storage);
        const forked = forkDocumentUseCase.execute(world.id);

        const sourceBricks = building.getBricks();
        const forkedBuildingId = forked.world.getBuildings()[0].id;
        const forkedBricks = forked.world.getBuilding(forkedBuildingId).getBricks();

        assert(forkedBricks.length === sourceBricks.length,
            'compose-then-fork: the fork carries every composed brick from House and Well alike');
        assert(JSON.stringify(bricksSnapshot(forkedBricks)) === JSON.stringify(bricksSnapshot(sourceBricks)),
            'compose-then-fork: forked geometry matches the composed document exactly');

        const sourceIds = new Set(sourceBricks.map((b) => b.id));
        for (const brick of forkedBricks) {
            assert(!sourceIds.has(brick.id), 'compose-then-fork: forking mints fresh brick identities, same as any other Document fork');
        }

        console.log('✓ Phase E: a composed document is an ordinary Document — forking it reproduces every brick exactly, with fresh ids');
    }

    console.log('\nAll blueprint composition tests passed.');
}

// tests.html's `await import(file)` only reliably waits for a module's
// synchronous top-level evaluation — see every other test file's own
// closing comment on this — so this is invoked with top-level await,
// never fire-and-forget.
await run();
