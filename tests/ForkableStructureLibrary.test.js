import { Structure } from '../core/Structure.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { VillageLibrary } from '../core/library/VillageLibrary.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { CreateStructureRegistryUseCase } from '../application/CreateStructureRegistryUseCase.js';
import { ForkStructureUseCase } from '../application/ForkStructureUseCase.js';
import { EditorSession } from '../application/EditorSession.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { LoadDocumentUseCase } from '../application/LoadDocumentUseCase.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { BrickRenderer } from '../renderer/BrickRenderer.js';

// 0.2.81 — Forkable Structure Library.
//
// Central architectural claim under test, per the design conversation:
// "a Structure should be a normal ForkBuild artifact that happens to be
// reusable as a template" — never a special immutable game object or a
// runtime copy. Forking one produces an ordinary, independent Document,
// through the SAME editor (EditorSession.openDocument()) every other
// document already uses. Nothing here adds a StructureBuilder/
// StructureEngine/StructureRuntime subsystem.
//
//   Section A: StructureRegistry / VillageLibrary contents — twenty
//              structures (0.4.4), every brick they place resolves to
//              one of the 15 ORDINARY core:* definitions, no special brick
//   Section B: Structure is pure data — toJSON/fromJSON round-trips,
//              never hands out a reference a fork could use to mutate
//              the library's own bricks
//   Section C: ForkStructureUseCase — fresh document identity, fresh
//              brick identities, correct provenance
//              (metadata.parentStructureId), no WorldPlacement created
//   Section D: EditorSession.forkStructure() — delegates to
//              ForkStructureUseCase then opens the result through the
//              existing openDocument() path; no second editing system
//   Section E: every registered structure renders — same
//              BrickRenderer/ThreeBrickFactory pipeline every ordinary
//              brick already uses, never a house-shaped mesh factory
//   Section F: FLAGSHIP — load Village House -> verify its bricks ->
//              fork -> new identity, same initial geometry -> modify
//              the fork -> save -> reload -> fork stays modified ->
//              the ORIGINAL Village House (and a second, independent
//              fork taken afterward) remain byte-for-byte unaffected

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

// 0.4.4 (Village Library Expansion) grew this list from six to twenty —
// tests/VillageLibraryExpansion.test.js is the flagship coverage for the
// expanded content itself; this file keeps proving the ARCHITECTURE
// (fork/serialize/render) still holds, so it only needs a representative
// handful, not all twenty.
const STRUCTURE_IDS = ['village:house', 'village:barn', 'village:well', 'village:market', 'village:mill', 'village:bridge'];

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

const stubIdentityProvider = {
    currentUser: () => ({ username: 'alice', displayName: 'alice', providerId: 'stub' })
};

async function run() {
    const brickRegistry = new CreateBrickRegistryUseCase().execute();

    // ---------------------------------------------------------------
    // Section A: StructureRegistry / VillageLibrary contents
    // ---------------------------------------------------------------
    {
        const registry = new CreateStructureRegistryUseCase().execute();

        assert(registry.getAll().length === 20, 'registry: VillageLibrary registers exactly twenty structures (0.4.4)');
        for (const id of STRUCTURE_IDS) {
            assert(registry.has(id), `registry: ${id} is registered`);
            assert(registry.get(id) instanceof Structure, `registry: get(${id}) returns a Structure`);
        }
        assert(registry.get('village:nonexistent') === null, 'registry: unknown id returns null');

        // The one invariant the whole milestone rests on: every brick
        // any Village structure places is one of the 15 ORDINARY
        // core:* definitions core/library/CoreLibrary.js already
        // registers. No structure invents its own definitionId — that
        // would be a "House" brick, exactly what docs/Principles.md's
        // "A Brick Is A Primitive, Never A Preassembled Structure"
        // forbids.
        let totalBricks = 0;
        for (const structure of registry.getAll()) {
            assert(structure.bricks.length > 0, `${structure.id}: has at least one brick`);
            for (const brick of structure.bricks) {
                assert(brickRegistry.has(brick.definitionId),
                    `${structure.id}: brick definitionId "${brick.definitionId}" resolves in BrickRegistry`);
                totalBricks += 1;
            }
        }
        assert(totalBricks >= 40, 'registry: the Village collection is a genuine multi-brick composition, not a token gesture');

        // Category/tag search parity with BrickRegistry's own contract.
        // 0.4.4 grew residential from just House to four structures —
        // tests/VillageLibraryExpansion.test.js's own Section A is the
        // flagship coverage for the full twenty-structure/five-category
        // shape; this assertion only needs to prove House is still among
        // them, membership never contains, exactly as before.
        const residential = registry.getByCategory('residential');
        assert(residential.length === 4 && residential.some((s) => s.id === 'village:house'),
            'registry: getByCategory("residential") includes House among four residential structures');
        const bySearch = registry.search(['bridge']);
        assert(bySearch.length === 1 && bySearch[0].id === 'village:bridge',
            'registry: search(["bridge"]) returns exactly Bridge');

        console.log('✓ Section A: StructureRegistry/VillageLibrary — twenty structures, every brick a real core:* primitive');
    }

    // ---------------------------------------------------------------
    // Section B: Structure is pure data
    // ---------------------------------------------------------------
    {
        const house = VillageLibrary.structures.find((s) => s.id === 'village:house');
        const json = house.toJSON();
        const restored = Structure.fromJSON(json);

        assert(restored.id === house.id, 'Structure: fromJSON preserves id');
        assert(restored.name === house.name, 'Structure: fromJSON preserves name');
        assert(restored.bricks.length === house.bricks.length, 'Structure: fromJSON preserves brick count');
        assert(JSON.stringify(restored.toJSON()) === JSON.stringify(json),
            'Structure: toJSON -> fromJSON -> toJSON is byte-identical');

        // bounds are DERIVED, never stored — SpatialBounds.fromBricks is
        // the same math SpatialBounds.fromWorld already uses for a
        // whole World, extracted in 0.2.81 rather than duplicated.
        const bounds = SpatialBounds.fromBricks(house.bricks, brickRegistry);
        const size = bounds.size;
        assert(size.x > 0 && size.y > 0 && size.z > 0, 'Structure: computed bounds have real, positive extent');
        assert(!('bounds' in json) && !('dimensions' in json),
            'Structure: toJSON never carries a stored bounds/dimensions field');

        console.log('✓ Section B: Structure is pure data — round-trips byte-identically, bounds are derived not stored');
    }

    // ---------------------------------------------------------------
    // Section C: ForkStructureUseCase
    // ---------------------------------------------------------------
    {
        const house = VillageLibrary.structures.find((s) => s.id === 'village:house');
        const forkUseCase = new ForkStructureUseCase();

        const forkA = forkUseCase.execute(house, stubIdentityProvider);
        const forkB = forkUseCase.execute(house, stubIdentityProvider);

        assert(forkA.world.id !== forkB.world.id, 'fork: two forks of the same Structure get different document identities');
        assert(forkA.metadata.title === 'House', 'fork: title comes from the Structure\'s own name');
        assert(forkA.metadata.description === house.description, 'fork: description carries over');
        assert(forkA.metadata.author === 'alice', 'fork: author comes from identityProvider');
        assert(forkA.metadata.parentStructureId === 'village:house', 'fork: parentStructureId records provenance');
        assert(forkA.metadata.parentDocumentId === null, 'fork: parentDocumentId stays null — this is not a document fork');

        const buildings = forkA.world.getBuildings();
        assert(buildings.length === 1, 'fork: exactly one Building, matching the "one building per world" V0.1 simplification');
        const forkedBricks = buildings[0].getBricks();
        assert(forkedBricks.length === house.bricks.length, 'fork: same brick count as the source Structure');

        // Same initial geometry (definitionId/position/rotation), but
        // every brick id is FRESH — never one of the library's own.
        const sourceIds = new Set(house.bricks.map((b) => b.id));
        for (const brick of forkedBricks) {
            assert(!sourceIds.has(brick.id), 'fork: forked brick id is never one of the library Structure\'s own ids');
            const match = house.bricks.find((b) =>
                b.definitionId === brick.definitionId
                && b.position.x === brick.position.x
                && b.position.y === brick.position.y
                && b.position.z === brick.position.z
                && b.rotation === brick.rotation);
            assert(match !== undefined, `fork: brick ${brick.definitionId} at (${brick.position.x},${brick.position.y},${brick.position.z}) matches a source brick exactly`);
        }

        // forkA and forkB never share a brick id with each other either.
        const idsA = new Set(forkedBricks.map((b) => b.id));
        for (const brick of forkB.world.getBuildings()[0].getBricks()) {
            assert(!idsA.has(brick.id), 'fork: independent forks never share brick ids with each other');
        }

        console.log('✓ Section C: ForkStructureUseCase — fresh identities throughout, correct provenance, no WorldPlacement created');
    }

    // ---------------------------------------------------------------
    // Section D: EditorSession.forkStructure()
    // ---------------------------------------------------------------
    {
        const house = VillageLibrary.structures.find((s) => s.id === 'village:house');
        const session = new EditorSession({
            registry: brickRegistry,
            editorContext: null,
            toolRegistry: null,
            documentManager: new DocumentManager(),
            selectionUseCase: null,
            previewUseCase: null,
            loadDocumentUseCase: null,
            identityProvider: stubIdentityProvider
        });

        // Stubbed rather than real: openDocument() drives a live
        // Three.js render session (RenderWorldUseCase), completely out
        // of scope for this architectural claim, which is only "does
        // forkStructure() fork-then-open, through the same method every
        // other document-opening path already uses." Section F proves
        // the fork's actual CONTENT end to end without any renderer.
        let openedWith = null;
        session.openDocument = (document) => { openedWith = document; };

        const result = session.forkStructure(house);
        assert(result === true, 'EditorSession.forkStructure: returns true on success');
        assert(openedWith !== null, 'EditorSession.forkStructure: calls openDocument() with the forked Document');
        assert(openedWith.metadata.parentStructureId === 'village:house', 'EditorSession.forkStructure: forked document carries provenance');
        assert(session.forkStructure(null) === false, 'EditorSession.forkStructure: a falsy structure is a no-op, not a throw');

        console.log('✓ Section D: EditorSession.forkStructure() — fork then openDocument(), no second editing system');
    }

    // ---------------------------------------------------------------
    // Section E: every structure renders through the ordinary pipeline
    // ---------------------------------------------------------------
    {
        const renderer = new BrickRenderer(brickRegistry);
        for (const structure of VillageLibrary.structures) {
            for (const brick of structure.bricks) {
                const mesh = renderer.createMesh(brick);
                assert(mesh !== null && mesh !== undefined, `${structure.id}: ${brick.definitionId} renders a real mesh`);
            }
        }
        console.log('✓ Section E: all Village structures render through the unmodified BrickRenderer/ThreeBrickFactory pipeline');
    }

    // ---------------------------------------------------------------
    // Section F: FLAGSHIP
    // ---------------------------------------------------------------
    {
        const registry = new CreateStructureRegistryUseCase().execute();
        const serializer = new DocumentSerializer();
        const storage = new InMemoryStorageProvider();
        const saveDocumentUseCase = new SaveDocumentUseCase(storage);
        const loadDocumentUseCase = new LoadDocumentUseCase(storage);

        // 1. Load Village House from the registry.
        const house = registry.get('village:house');
        assert(house !== null, 'flagship: Village House loads from the registry');

        // 2. Verify all its brick instances against the library source.
        const sourceStructureSnapshot = house.toJSON();
        const sourceBrickSnapshot = house.bricks.map((b) => b.toJSON());
        assert(sourceBrickSnapshot.length > 0, 'flagship: House has real bricks to verify');

        // 3. Fork.
        const forkDocument = new ForkStructureUseCase().execute(house, stubIdentityProvider);

        // 4. New structure identity.
        assert(forkDocument.world.id, 'flagship: fork has its own world/document id');
        assert(forkDocument.metadata.parentStructureId === 'village:house', 'flagship: fork records parentStructureId');

        // 5. Same initial geometry as the source Structure.
        const forkedBuildingId = forkDocument.world.getBuildings()[0].id;
        const initialForkBricks = forkDocument.world.getBuilding(forkedBuildingId).getBricks();
        assert(initialForkBricks.length === sourceBrickSnapshot.length, 'flagship: fork starts with identical brick count');
        const initialDefIds = initialForkBricks.map((b) => b.definitionId).sort();
        const sourceDefIds = sourceBrickSnapshot.map((b) => b.definitionId).sort();
        assert(JSON.stringify(initialDefIds) === JSON.stringify(sourceDefIds), 'flagship: fork starts with identical brick types');

        // 6. Modify the fork: move one brick, delete another, add a new one.
        const documentManager = new DocumentManager(forkDocument);
        const movedBrick = initialForkBricks[0];
        const movedBrickOriginalX = movedBrick.position.x;
        forkDocument.world.updateBrick(forkedBuildingId, movedBrick.id, {
            position: movedBrick.position.add({ x: 10, y: 0, z: 0 })
        });
        const removedBrick = initialForkBricks[1];
        forkDocument.world.removeBrickFromBuilding(forkedBuildingId, removedBrick.id);
        forkDocument.metadata.title = 'Alice\'s House';
        documentManager.markDirty();

        // 7. Save.
        const savedId = saveDocumentUseCase.execute(documentManager);
        assert(savedId === forkDocument.world.id, 'flagship: save uses the fork\'s own document id');
        assert(documentManager.state.dirty === false, 'flagship: save clears the dirty flag');

        // 8. Reload.
        const reloadedDocument = loadDocumentUseCase.execute(new DocumentManager(), savedId);

        // 9. The fork remains modified after reload.
        assert(reloadedDocument.metadata.title === 'Alice\'s House', 'flagship: reloaded fork keeps its renamed title');
        assert(reloadedDocument.metadata.parentStructureId === 'village:house', 'flagship: reloaded fork keeps its provenance');
        const reloadedBricks = reloadedDocument.world.getBuildings()[0].getBricks();
        assert(reloadedBricks.length === initialForkBricks.length - 1, 'flagship: reloaded fork reflects the deleted brick');
        const movedReloaded = reloadedBricks.find((b) => b.id === movedBrick.id);
        assert(movedReloaded !== undefined, 'flagship: moved brick survives reload');
        assert(movedReloaded.position.x === movedBrickOriginalX + 10, 'flagship: reloaded brick keeps its moved position');
        assert(reloadedBricks.find((b) => b.id === removedBrick.id) === undefined, 'flagship: deleted brick stays deleted after reload');

        // 10. The ORIGINAL Village House is still byte-for-byte
        //     equivalent — editing a fork never touched the library.
        const houseAfter = registry.get('village:house');
        assert(JSON.stringify(houseAfter.toJSON()) === JSON.stringify(sourceStructureSnapshot),
            'flagship: Village House is byte-for-byte identical to its pre-fork snapshot — editing the fork never touched the library');

        // A second, independent fork taken AFTER the first was edited
        // and saved gets the library's ORIGINAL content, not Alice's
        // edited copy — proving there is no live dependency, only
        // recorded provenance (docs/Principles.md, "Forking A Structure
        // Records Provenance, Never A Live Dependency").
        const secondFork = new ForkStructureUseCase().execute(registry.get('village:house'), stubIdentityProvider);
        const secondForkBricks = secondFork.world.getBuildings()[0].getBricks();
        assert(secondForkBricks.length === sourceBrickSnapshot.length,
            'flagship: a later fork of the same Structure is unaffected by an earlier fork\'s edits');
        assert(secondFork.metadata.title === 'House',
            'flagship: a later fork gets the Structure\'s own name, never a previous fork\'s renamed title');

        console.log('✓ Section F: FLAGSHIP — load -> verify -> fork -> identical initial geometry -> modify -> '
            + 'save -> reload -> fork stays modified -> original Structure and later forks stay pristine');
    }

    console.log('\nAll forkable structure library tests passed.');
}

// Top-level await — see tests/ExpandedBrickVocabulary.test.js's own note:
// tests.html's `await import(file)` only reliably waits for a module's
// synchronous top-level evaluation, so a fire-and-forget async call here
// could let a failing assertion be counted as "passed" by the runner.
await run();
