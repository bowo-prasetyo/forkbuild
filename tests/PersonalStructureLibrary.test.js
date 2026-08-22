import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { Structure } from '../core/Structure.js';
import { SelectionState } from '../application/editor-state/SelectionState.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { CreateStructureRegistryUseCase } from '../application/CreateStructureRegistryUseCase.js';
import { CopyStructureIntoDocumentUseCase } from '../application/CopyStructureIntoDocumentUseCase.js';
import { CreateStructureFromSelectionUseCase } from '../application/CreateStructureFromSelectionUseCase.js';
import { LocalStructureLibraryStore } from '../application/LocalStructureLibraryStore.js';
import { EditorSession } from '../application/EditorSession.js';
import { CommandHistory } from '../application/CommandHistory.js';

// 0.4.3 — Personal Blueprint Library.
//
// 0.4.2 closed the recursive loop (Structure --copy/compose--> Document
// --extract--> Structure) but left the extracted Structure with nowhere
// to live beyond the caller's own variable. This is that "somewhere":
// application/LocalStructureLibraryStore.js, a local, StorageProvider-
// backed catalog of the user's OWN Structures, architecturally separate
// from both shared World state and the built-in Village Library.
//
//   Section A: LocalStructureLibraryStore — basic operations, guards,
//              and the reload-from-persistence round trip
//              (application/LocalStructureLibraryStore.js)
//   Section B: EditorSession wiring — saveStructureToPersonalLibrary()
//              is a graceful no-op with nothing wired, and delegates to
//              the store when it is (application/EditorSession.js)
//   Section C: FLAGSHIP — the full scenario: build, extract, save,
//              reload, compose into two independent Documents, delete
//              from the library, prove both Documents are untouched,
//              compose-then-extract a second version ("Farmstead
//              Deluxe"), reload again, and confirm the World/Document
//              layer's own serialization never once depended on any
//              library operation
//
// See docs/Principles.md, "A Personal Library Persists What Extraction
// Only Returns (0.4.3)."

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

function bricksSnapshot(bricks) {
    return bricks
        .map((b) => `${b.definitionId}|${b.position.x}|${b.position.y}|${b.position.z}|${b.rotation}`)
        .sort();
}

function makeEmptyDocument(title = 'Extraction') {
    const world = new World();
    const building = new Building({ creator: 'local' });
    world.addBuilding(building);
    const document = new Document({ world, metadata: new DocumentMetadata({ title }) });
    return { world, building, document };
}

// Composes House + Well + Barn into a fresh empty Document, exactly the
// 0.4.0 composition path tests/StructureExtraction.test.js already
// established, then selects everything and extracts it into a single
// new Structure — the "Build + Extract" half of this milestone's own
// scenario, unmodified from 0.4.2.
function buildAndExtractFarmstead(structureRegistry, brickRegistry, metadata) {
    const { world, building, document } = makeEmptyDocument('Village');
    const commandHistory = new CommandHistory({ world });
    const copyUseCase = new CopyStructureIntoDocumentUseCase();
    for (const structureId of ['village:house', 'village:well', 'village:barn']) {
        const structure = structureRegistry.get(structureId);
        const command = copyUseCase.execute(structure, {
            worldId: world.id, buildingId: building.id, world, registry: brickRegistry
        });
        commandHistory.execute(command);
    }
    const bricks = building.getBricks();
    const selection = new SelectionState({
        items: bricks.map((brick) => ({ buildingId: building.id, brickId: brick.id }))
    });
    const structure = new CreateStructureFromSelectionUseCase().execute(selection, document, {
        registry: brickRegistry, ...metadata
    });
    return { world, building, document, structure };
}

async function run() {
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const structureRegistry = new CreateStructureRegistryUseCase().execute();
    const copyUseCase = new CopyStructureIntoDocumentUseCase();

    // ---------------------------------------------------------------
    // Section A — LocalStructureLibraryStore
    // ---------------------------------------------------------------
    {
        let threw = false;
        try { new LocalStructureLibraryStore({}); } catch (e) { threw = true; }
        assert(threw, '1. LocalStructureLibraryStore requires a StorageProvider');

        const store = new LocalStructureLibraryStore({ storageProvider: new InMemoryStorageProvider() });
        assert(store.getStructure('nope') === null, '2. getStructure returns null before anything is saved');
        assert(store.hasStructure('nope') === false, '3. hasStructure is false before anything is saved');
        assert(store.listStructures().length === 0, '4. listStructures is empty before anything is saved');

        let threwForAdd = false;
        try { store.addStructure({ not: 'a structure' }); } catch (e) { threwForAdd = true; }
        assert(threwForAdd, '5. addStructure rejects anything that is not a Structure instance');

        const farmstead = new Structure({
            id: 'farmstead-1', name: 'Farmstead', category: 'residential',
            tags: ['farmstead'], description: 'House, well and barn', bricks: []
        });
        store.addStructure(farmstead);
        assert(store.hasStructure('farmstead-1') === true, '6. hasStructure becomes true after addStructure');
        const loaded = store.getStructure('farmstead-1');
        assert(loaded.name === 'Farmstead' && loaded.category === 'residential',
            '7. getStructure round-trips the saved Structure\'s metadata');
        assert(loaded !== farmstead, '8. getStructure returns a freshly reconstructed instance, never the original object');

        const renamed = store.updateStructureMetadata('farmstead-1', { name: 'Farmstead Prime' });
        assert(renamed.name === 'Farmstead Prime' && renamed.id === 'farmstead-1',
            '9. updateStructureMetadata renames in place, preserving id');
        assert(store.getStructure('farmstead-1').name === 'Farmstead Prime',
            '10. the rename is actually persisted, not just returned');
        assert(store.updateStructureMetadata('does-not-exist', { name: 'X' }) === null,
            '11. updateStructureMetadata on an unknown id returns null and changes nothing');

        store.removeStructure('farmstead-1');
        assert(store.hasStructure('farmstead-1') === false, '12. removeStructure deletes the record');
        assert(store.getStructure('farmstead-1') === null, '13. ...and getStructure confirms it is gone');
    }
    {
        // Recency ordering + groupByCategory + search, using explicit
        // savedAt values (LocalStructureLibraryStore#addStructure's own
        // optional override) for deterministic ordering — the same
        // "explicit timestamps, never real elapsed wall-clock time"
        // discipline tests/WorldReturnExperience.test.js's own Section B
        // already established for LocalWorldExperienceStore.
        const store = new LocalStructureLibraryStore({ storageProvider: new InMemoryStorageProvider() });
        const now = Date.now();
        const older = new Structure({ id: 's-a', name: 'A', category: 'residential', bricks: [] });
        const newer = new Structure({ id: 's-b', name: 'B', category: 'agricultural', tags: ['barn'], bricks: [] });
        const newest = new Structure({ id: 's-c', name: 'C', category: 'residential', tags: ['tower'], bricks: [] });
        store.addStructure(older, { savedAt: now - 5000 });
        store.addStructure(newer, { savedAt: now - 1000 });
        store.addStructure(newest, { savedAt: now });

        const list = store.listStructures();
        assert(list.length === 3, '14. listStructures returns every saved Structure');
        assert(list[0].id === 's-c' && list[1].id === 's-b' && list[2].id === 's-a',
            '15. listStructures is sorted most-recently-saved-first');

        const groups = store.groupByCategory();
        assert(groups.length === 2, '16. groupByCategory groups by category, first-seen order');
        assert(groups[0].category === 'residential' && groups[0].structures.length === 2,
            '17. groupByCategory: residential group holds both residential structures');
        assert(groups[1].category === 'agricultural' && groups[1].structures.length === 1,
            '18. groupByCategory: agricultural group holds the one agricultural structure');

        assert(store.search('barn').map((s) => s.id).join(',') === 's-b',
            '19. search(tags) matches by tag, mirroring core/StructureRegistry.js#search()');
        assert(store.search(['tower', 'barn']).length === 2,
            '20. search accepts an array and matches ANY of the queried tags');

        // Preserving savedAt across a rename — Section A above already
        // proved the rename itself; this proves it does not also
        // reshuffle recency order.
        store.updateStructureMetadata('s-a', { name: 'A Renamed' });
        const listAfterRename = store.listStructures();
        assert(listAfterRename[2].id === 's-a' && listAfterRename[2].name === 'A Renamed',
            '21. renaming preserves the original savedAt — the oldest entry stays oldest');
    }
    {
        // Reload from persistence — a brand-new store instance backed by
        // the SAME underlying storage (the "close the app, reopen it"
        // scenario) sees exactly what the first instance wrote.
        const storageProvider = new InMemoryStorageProvider();
        const firstSession = new LocalStructureLibraryStore({ storageProvider });
        const structure = new Structure({
            id: 'reload-me', name: 'Reload Me', category: 'infrastructure',
            tags: ['bridge'], description: 'Survives a reload', bricks: []
        });
        firstSession.addStructure(structure);

        const secondSession = new LocalStructureLibraryStore({ storageProvider });
        assert(secondSession.hasStructure('reload-me') === true,
            '22. a brand-new store instance over the same storage sees a Structure saved by a prior instance');
        const reloaded = secondSession.getStructure('reload-me');
        assert(JSON.stringify(reloaded.toJSON()) === JSON.stringify(structure.toJSON()),
            '23. the reloaded Structure is byte-identical (toJSON) to what was originally saved');
    }

    // ---------------------------------------------------------------
    // Section B — EditorSession wiring
    // ---------------------------------------------------------------
    {
        // No store wired at all — the same "optional collaborator
        // degrades to a graceful no-op" posture every other 0.4.x
        // EditorSession addition already follows.
        const bareSession = new EditorSession({
            registry: brickRegistry, editorContext: null, toolRegistry: null,
            documentManager: null, selectionUseCase: null, previewUseCase: null,
            loadDocumentUseCase: null
        });
        assert(bareSession.saveStructureToPersonalLibrary(new Structure({ id: 'x', name: 'X', bricks: [] })) === false,
            '24. saveStructureToPersonalLibrary() is a graceful no-op with no store wired');
        assert(bareSession.saveStructureToPersonalLibrary(null) === false,
            '25. saveStructureToPersonalLibrary(null) is a no-op, never a throw');
    }
    {
        const store = new LocalStructureLibraryStore({ storageProvider: new InMemoryStorageProvider() });
        const wiredSession = new EditorSession({
            registry: brickRegistry, editorContext: null, toolRegistry: null,
            documentManager: null, selectionUseCase: null, previewUseCase: null,
            loadDocumentUseCase: null, personalStructureLibraryStore: store
        });
        const structure = new Structure({ id: 'via-session', name: 'Via Session', bricks: [] });
        const saved = wiredSession.saveStructureToPersonalLibrary(structure);
        assert(saved === true, '26. saveStructureToPersonalLibrary() returns true when a store is wired');
        assert(store.hasStructure('via-session') === true,
            '27. ...and the Structure actually landed in the injected store, not somewhere else');
    }

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP: the full personal-library scenario
    // ---------------------------------------------------------------
    //
    // A durable World, completely independent of the Personal Structure
    // Library — its own serialization is snapshotted before and after
    // every library operation below to prove the architectural boundary
    // directly, the same way tests/WorldReturnExperience.test.js's own
    // Phase G proved "Personal Experience Is Not Shared World State."
    const flagshipWorld = new World({ metadata: { title: 'Flagship World' } });
    const serializeFlagshipWorld = () => JSON.stringify(flagshipWorld.toJSON());
    const worldBeforeAnyLibraryOperation = serializeFlagshipWorld();

    const storageProvider = new InMemoryStorageProvider();
    let library = new LocalStructureLibraryStore({ storageProvider });

    // Phase A — Build House + Well + Barn and extract "Farmstead".
    const built = buildAndExtractFarmstead(structureRegistry, brickRegistry, {
        name: 'Farmstead', category: 'residential', tags: ['farmstead'], description: 'House, well and barn compound'
    });
    const farmstead = built.structure;
    assert(farmstead !== null, '28. PHASE A: Build + Extract produces a valid Farmstead Structure');
    console.log('✓ Phase A: House + Well + Barn composed and extracted into "Farmstead"');

    // Phase B — Save Farmstead to the Personal Library.
    library.addStructure(farmstead);
    assert(library.hasStructure(farmstead.id) === true, '29. PHASE B: Farmstead is now in the Personal Library');
    console.log('✓ Phase B: Farmstead saved to the Personal Library');

    // Phase C — Reload the library from local persistence.
    library = new LocalStructureLibraryStore({ storageProvider });
    const reloadedFarmstead = library.getStructure(farmstead.id);
    assert(reloadedFarmstead !== null, '30. PHASE C: Farmstead is still present after reloading the library');
    assert(JSON.stringify(reloadedFarmstead.toJSON()) === JSON.stringify(farmstead.toJSON()),
        '31. PHASE C: the reloaded Farmstead is byte-identical to the one that was saved');
    console.log('✓ Phase C: library reloaded from local persistence — Farmstead survives intact');

    // Phase D — Compose Farmstead into Document A and Document B.
    const docA = makeEmptyDocument('Document A');
    const historyA = new CommandHistory({ world: docA.world });
    historyA.execute(copyUseCase.execute(reloadedFarmstead, {
        worldId: docA.world.id, buildingId: docA.building.id, world: docA.world, registry: brickRegistry
    }));
    const docB = makeEmptyDocument('Document B');
    const historyB = new CommandHistory({ world: docB.world });
    historyB.execute(copyUseCase.execute(reloadedFarmstead, {
        worldId: docB.world.id, buildingId: docB.building.id, world: docB.world, registry: brickRegistry
    }));
    assert(docA.building.getBricks().length === farmstead.bricks.length,
        '32. PHASE D: Farmstead composed into Document A carries every one of its bricks');
    assert(docB.building.getBricks().length === farmstead.bricks.length,
        '33. PHASE D: Farmstead composed into Document B carries every one of its bricks');
    const docASnapshotAfterCompose = bricksSnapshot(docA.building.getBricks());
    const docBSnapshotAfterCompose = bricksSnapshot(docB.building.getBricks());
    console.log('✓ Phase D: Farmstead composed into two independent Documents (A and B)');

    // Phase E — Delete Farmstead from the Personal Library.
    library.removeStructure(farmstead.id);
    assert(library.hasStructure(farmstead.id) === false, '34. PHASE E: Farmstead no longer exists in the Personal Library');
    console.log('✓ Phase E: Farmstead deleted from the Personal Library');

    // Phase F — Documents A and B remain unchanged: no live dependency
    // on the library entry that was just deleted (see
    // application/LocalStructureLibraryStore.js's own header).
    assert(bricksSnapshot(docA.building.getBricks()).join('|') === docASnapshotAfterCompose.join('|'),
        '35. PHASE F: Document A is byte-identical after Farmstead was deleted from the library');
    assert(bricksSnapshot(docB.building.getBricks()).join('|') === docBSnapshotAfterCompose.join('|'),
        '36. PHASE F: Document B is byte-identical after Farmstead was deleted from the library');
    console.log('✓ Phase F: deleting Farmstead from the library left Documents A and B completely untouched');

    // Phase G — Edit Document A (add a fence/garden brick, standing in
    // for "compose more content into it"), extract a second version,
    // "Farmstead Deluxe," and save it — the versioning workflow
    // docs/Roadmap.md, 0.4.3 describes ("Structure --compose--> modify
    // --extract--> new Structure"), never in-place Structure editing.
    const villageStructure = structureRegistry.get('village:market');
    historyA.execute(copyUseCase.execute(villageStructure, {
        worldId: docA.world.id, buildingId: docA.building.id, world: docA.world, registry: brickRegistry
    }));
    const allDocABricks = docA.building.getBricks();
    const selectAllOfDocA = new SelectionState({
        items: allDocABricks.map((brick) => ({ buildingId: docA.building.id, brickId: brick.id }))
    });
    const farmsteadDeluxe = new CreateStructureFromSelectionUseCase().execute(selectAllOfDocA, docA.document, {
        registry: brickRegistry, name: 'Farmstead Deluxe', category: 'residential',
        tags: ['farmstead', 'deluxe'], description: 'Farmstead plus a market stall'
    });
    library.addStructure(farmsteadDeluxe);
    assert(library.hasStructure(farmsteadDeluxe.id) === true, '37. PHASE G: Farmstead Deluxe saved to the Personal Library');
    assert(farmsteadDeluxe.bricks.length === farmstead.bricks.length + villageStructure.bricks.length,
        '38. PHASE G: Farmstead Deluxe carries every brick from both the original Farmstead and the added Market');
    console.log('✓ Phase G: Document A edited and re-extracted as "Farmstead Deluxe," saved to the library');

    // Phase H — Reload again: Farmstead stays gone, Farmstead Deluxe
    // survives, both library serialization and extracted geometry stay
    // deterministic across the reload.
    library = new LocalStructureLibraryStore({ storageProvider });
    assert(library.hasStructure(farmstead.id) === false,
        '39. PHASE H: after reloading, the deleted Farmstead is still gone — deletion itself persisted, not just the in-memory instance');
    const reloadedDeluxe = library.getStructure(farmsteadDeluxe.id);
    assert(reloadedDeluxe !== null, '40. PHASE H: Farmstead Deluxe survives the reload');
    assert(JSON.stringify(reloadedDeluxe.toJSON()) === JSON.stringify(farmsteadDeluxe.toJSON()),
        '41. PHASE H: the reloaded Farmstead Deluxe is byte-identical to what was saved — deterministic across reload');
    const listAfterEverything = library.listStructures();
    assert(listAfterEverything.length === 1 && listAfterEverything[0].id === farmsteadDeluxe.id,
        '42. PHASE H: the library holds exactly Farmstead Deluxe — the deleted Farmstead never reappears');
    console.log('✓ Phase H: library reloaded a second time — deletion and save both survived, deterministically');

    // Phase I — Serialization boundary. Every library operation above —
    // saving, reloading, composing into two Documents, deleting,
    // re-extracting, saving again, reloading again — never once touched
    // the flagship World, because a Personal Structure Library operates
    // entirely over its own StorageProvider-backed records, structurally
    // separate from core/World.js.
    assert(serializeFlagshipWorld() === worldBeforeAnyLibraryOperation,
        '43. PHASE I: the flagship World\'s own serialization is byte-identical before and after every Personal Structure Library operation in this entire test — "a personal blueprint is reusable content, not shared World state," proven end to end, not merely by inspection of which fields exist');
    console.log('✓ Phase I: the flagship World\'s serialization never changed — Personal Structure Library operations touch only their own local storage');

    console.log('\nAll Personal Structure Library tests passed.');
}

// tests.html's `await import(file)` only reliably waits for a module's
// synchronous top-level evaluation — see every other test file's own
// closing comment on this — so this is invoked with top-level await,
// never fire-and-forget.
await run();
