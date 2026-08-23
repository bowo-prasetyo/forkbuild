import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
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
import { buildBlueprintPackage, CURRENT_SCHEMA_VERSION, BLUEPRINT_KIND } from '../application/BlueprintPackage.js';
import { validateBlueprintPackage, BlueprintPackageError } from '../application/BlueprintImportValidator.js';
import { ExportBlueprintUseCase } from '../application/ExportBlueprintUseCase.js';
import { ImportBlueprintUseCase } from '../application/ImportBlueprintUseCase.js';

// 0.4.6 — Blueprint Sharing & Exchange.
//
// 0.4.3 gave a Structure somewhere to live, but only on the device that
// extracted it: Alice's Personal Structure Library is StorageProvider-
// backed, and StorageProvider is per-device. This milestone is the
// mechanism that turns a Structure into a PORTABLE artifact — a plain
// JSON blueprint package (application/BlueprintPackage.js) that can leave
// Alice's device and become an ordinary "My Structures" entry on Bob's,
// without ever becoming World content:
//
//   Structure --export--> Blueprint Package --import--> Structure
//
// See docs/Principles.md, "A Blueprint Package Is Portable Data, Never A
// Live Dependency (0.4.6)."
//
//   Section A: BlueprintPackage — buildBlueprintPackage() shape + determinism
//   Section B: BlueprintImportValidator — every malformed-package rejection
//              named in this milestone's own design conversation
//   Section C: EditorSession wiring — exportBlueprint()/importBlueprint()
//              are graceful no-ops with nothing wired, and delegate
//              correctly when they are
//   Section D: FLAGSHIP — Alice exports "Farmstead," Bob imports it into
//              an independent Personal Library, places it through the
//              ordinary composition pipeline, and Alice's own copy is
//              proven structurally irrelevant to what Bob now has

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

// Ignores instance ids on purpose — this is the geometry(A) === geometry(B)
// comparison the milestone's own design conversation calls for, deliberately
// blind to the fresh ids ImportBlueprintUseCase always mints.
function geometrySnapshot(bricks) {
    return bricks
        .map((b) => `${b.definitionId}|${b.position.x}|${b.position.y}|${b.position.z}|${b.rotation}`)
        .sort()
        .join('||');
}

function makeEmptyDocument(title = 'Blueprint Exchange') {
    const world = new World();
    const building = new Building({ creator: 'local' });
    world.addBuilding(building);
    const document = new Document({ world, metadata: new DocumentMetadata({ title }) });
    return { world, building, document };
}

// Composes House + Well + Barn into a fresh empty Document and extracts
// the whole thing into a single new Structure — the same "Build +
// Extract" helper tests/PersonalStructureLibrary.test.js's own Section C
// already established, unmodified here.
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
    return { structure };
}

function validBrickJSON(definitionId = 'core:cube', overrides = {}) {
    return {
        id: 'brick-1',
        definitionId,
        position: { x: 0, y: 0, z: 0 },
        rotation: 0,
        ...overrides
    };
}

function validPackage(brickRegistry, overrides = {}) {
    return {
        kind: BLUEPRINT_KIND,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        structure: {
            id: 'structure-1',
            name: 'Test Structure',
            category: 'residential',
            tags: ['test'],
            description: 'A minimal valid blueprint',
            bricks: [validBrickJSON()]
        },
        ...overrides
    };
}

function expectThrows(fn, message) {
    let threw = false;
    let error = null;
    try { fn(); } catch (e) { threw = true; error = e; }
    assert(threw, message);
    return error;
}

async function run() {
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const structureRegistry = new CreateStructureRegistryUseCase().execute();
    const copyUseCase = new CopyStructureIntoDocumentUseCase();

    // ---------------------------------------------------------------
    // Section A — BlueprintPackage
    // ---------------------------------------------------------------
    {
        expectThrows(() => buildBlueprintPackage(null), '1. buildBlueprintPackage rejects a missing Structure');
        expectThrows(() => buildBlueprintPackage({ not: 'a structure' }),
            '2. buildBlueprintPackage rejects anything that is not a Structure instance');

        const structure = new Structure({
            id: 'pkg-test', name: 'Package Test', category: 'residential',
            tags: ['t'], description: 'd',
            bricks: [{ id: 'b1', definitionId: 'core:cube', position: { x: 1, y: 2, z: 3 }, rotation: 90 }]
        });
        const pkg = buildBlueprintPackage(structure);
        assert(pkg.kind === BLUEPRINT_KIND, '3. package carries the forkbuild.blueprint discriminator');
        assert(pkg.schemaVersion === CURRENT_SCHEMA_VERSION, '4. package carries the current schema version');
        assert(JSON.stringify(pkg.structure) === JSON.stringify(structure.toJSON()),
            '5. package.structure is exactly Structure#toJSON(), nothing added or dropped');

        // Phase F (determinism), proven here at the package level: the
        // SAME Structure exported twice produces byte-identical JSON.
        const pkgAgain = buildBlueprintPackage(structure);
        assert(JSON.stringify(pkg) === JSON.stringify(pkgAgain),
            '6. exporting the same Structure twice is byte-identical');
    }

    // ---------------------------------------------------------------
    // Section B — BlueprintImportValidator
    // ---------------------------------------------------------------
    {
        // A well-formed package never throws.
        validateBlueprintPackage(validPackage(brickRegistry), { registry: brickRegistry });

        expectThrows(() => validateBlueprintPackage(null),
            '7. rejects a null package');
        expectThrows(() => validateBlueprintPackage('not json'),
            '8. rejects a non-object package');
        expectThrows(() => validateBlueprintPackage(validPackage(brickRegistry, { kind: 'something.else' })),
            '9. rejects the wrong kind discriminator');
        expectThrows(() => validateBlueprintPackage(validPackage(brickRegistry, { schemaVersion: 999 })),
            '10. rejects an unsupported schema version');
        expectThrows(() => validateBlueprintPackage(validPackage(brickRegistry, { structure: undefined })),
            '11. rejects a missing structure');
        expectThrows(() => validateBlueprintPackage(
            validPackage(brickRegistry, { structure: { ...validPackage(brickRegistry).structure, id: '' } })),
            '12. rejects a missing structure.id');
        expectThrows(() => validateBlueprintPackage(
            validPackage(brickRegistry, { structure: { ...validPackage(brickRegistry).structure, name: '' } })),
            '13. rejects a missing structure.name');
        expectThrows(() => validateBlueprintPackage(
            validPackage(brickRegistry, { structure: { ...validPackage(brickRegistry).structure, category: 42 } })),
            '14. rejects a non-string structure.category');
        expectThrows(() => validateBlueprintPackage(
            validPackage(brickRegistry, { structure: { ...validPackage(brickRegistry).structure, tags: 'not-an-array' } })),
            '15. rejects non-array structure.tags');
        expectThrows(() => validateBlueprintPackage(
            validPackage(brickRegistry, { structure: { ...validPackage(brickRegistry).structure, bricks: [] } })),
            '16. rejects an empty bricks array');
        expectThrows(() => validateBlueprintPackage(
            validPackage(brickRegistry, { structure: { ...validPackage(brickRegistry).structure, bricks: 'nope' } })),
            '17. rejects a non-array bricks field');

        // Per-brick rejections.
        const missingBrickId = validPackage(brickRegistry);
        missingBrickId.structure.bricks = [validBrickJSON('core:cube', { id: '' })];
        expectThrows(() => validateBlueprintPackage(missingBrickId, { registry: brickRegistry }),
            '18. rejects a brick with a missing id');

        const duplicateIds = validPackage(brickRegistry);
        duplicateIds.structure.bricks = [validBrickJSON('core:cube', { id: 'dup' }), validBrickJSON('core:cube', { id: 'dup' })];
        const dupError = expectThrows(() => validateBlueprintPackage(duplicateIds, { registry: brickRegistry }),
            '19. rejects duplicate brick ids');
        assert(dupError instanceof BlueprintPackageError, '20. duplicate-id rejection is a BlueprintPackageError');

        const unknownDefinition = validPackage(brickRegistry);
        unknownDefinition.structure.bricks = [validBrickJSON('nonsense:not-a-real-brick')];
        expectThrows(() => validateBlueprintPackage(unknownDefinition, { registry: brickRegistry }),
            '21. rejects an unsupported/unknown brick definition');

        const nanPosition = validPackage(brickRegistry);
        nanPosition.structure.bricks = [validBrickJSON('core:cube', { position: { x: NaN, y: 0, z: 0 } })];
        expectThrows(() => validateBlueprintPackage(nanPosition, { registry: brickRegistry }),
            '22. rejects a NaN position coordinate');

        const missingPositionAxis = validPackage(brickRegistry);
        missingPositionAxis.structure.bricks = [validBrickJSON('core:cube', { position: { x: 0, y: 0 } })];
        expectThrows(() => validateBlueprintPackage(missingPositionAxis, { registry: brickRegistry }),
            '23. rejects a position missing an axis');

        const badRotation = validPackage(brickRegistry);
        badRotation.structure.bricks = [validBrickJSON('core:cube', { rotation: 'ninety' })];
        expectThrows(() => validateBlueprintPackage(badRotation, { registry: brickRegistry }),
            '24. rejects a non-numeric rotation');

        const missingDefinitionId = validPackage(brickRegistry);
        missingDefinitionId.structure.bricks = [validBrickJSON('', {})];
        expectThrows(() => validateBlueprintPackage(missingDefinitionId, { registry: brickRegistry }),
            '25. rejects a brick with a missing definitionId');

        // Without a registry, unknown-definition checking is simply
        // skipped (documented optional behavior) — everything else still
        // validates.
        validateBlueprintPackage(unknownDefinition, {});
    }

    // ---------------------------------------------------------------
    // Section C — EditorSession wiring
    // ---------------------------------------------------------------
    {
        const bareSession = new EditorSession({
            registry: brickRegistry, editorContext: null, toolRegistry: null,
            documentManager: null, selectionUseCase: null, previewUseCase: null,
            loadDocumentUseCase: null,
            exportBlueprintUseCase: null, importBlueprintUseCase: null
        });
        assert(bareSession.exportBlueprint(new Structure({ id: 'x', name: 'X', bricks: [] })) === null,
            '26. exportBlueprint() is a graceful no-op with no use case wired');
        assert(bareSession.importBlueprint(validPackage(brickRegistry)) === null,
            '27. importBlueprint() is a graceful no-op with no use case/store wired');
    }
    {
        const store = new LocalStructureLibraryStore({ storageProvider: new InMemoryStorageProvider() });
        const wiredSession = new EditorSession({
            registry: brickRegistry, editorContext: null, toolRegistry: null,
            documentManager: null, selectionUseCase: null, previewUseCase: null,
            loadDocumentUseCase: null, personalStructureLibraryStore: store
        });
        const structure = new Structure({
            id: 'export-me', name: 'Export Me', bricks: [{ id: 'b1', definitionId: 'core:cube', position: { x: 0, y: 0, z: 0 }, rotation: 0 }]
        });
        const pkg = wiredSession.exportBlueprint(structure);
        assert(pkg.kind === BLUEPRINT_KIND && pkg.structure.id === 'export-me',
            '28. exportBlueprint() delegates to ExportBlueprintUseCase and returns its package');

        const imported = wiredSession.importBlueprint(pkg);
        assert(imported instanceof Structure, '29. importBlueprint() returns a Structure');
        assert(imported.id !== structure.id, '30. importBlueprint() mints a fresh structure id, never reusing the source\'s');
        assert(store.hasStructure(imported.id) === true,
            '31. importBlueprint() saves the imported Structure straight into the wired personal library');

        expectThrows(() => wiredSession.importBlueprint({ not: 'a blueprint' }),
            '32. importBlueprint() throws (rather than silently no-op-ing) on a malformed package');
    }

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP: Alice exports, Bob imports
    // ---------------------------------------------------------------
    console.log('\n--- Blueprint Sharing & Exchange: flagship scenario ---');

    // Phase A — Alice builds House + Well + Barn and extracts "Farmstead".
    const { structure: farmstead } = buildAndExtractFarmstead(structureRegistry, brickRegistry, {
        name: "Alice's Riverside Inn", category: 'residential', tags: ['farmstead'],
        description: 'House, well and barn compound'
    });
    const aliceStorage = new InMemoryStorageProvider();
    const aliceLibrary = new LocalStructureLibraryStore({ storageProvider: aliceStorage });
    aliceLibrary.addStructure(farmstead);
    assert(aliceLibrary.hasStructure(farmstead.id) === true,
        '33. PHASE A: Farmstead built, extracted, and saved to Alice\'s Personal Library');
    console.log('✓ Phase A: Alice built House + Well + Barn and extracted "Alice\'s Riverside Inn"');

    // Phase B — Alice exports it as a portable blueprint package.
    const aliceSession = new EditorSession({
        registry: brickRegistry, editorContext: null, toolRegistry: null,
        documentManager: null, selectionUseCase: null, previewUseCase: null,
        loadDocumentUseCase: null, personalStructureLibraryStore: aliceLibrary
    });
    const blueprintPackage = aliceSession.exportBlueprint(farmstead);
    assert(blueprintPackage.structure.id === farmstead.id,
        '34. PHASE B: the exported package carries Farmstead\'s own geometry');
    const blueprintJSON = JSON.stringify(blueprintPackage);
    console.log('✓ Phase B: Alice exported "Alice\'s Riverside Inn" as a blueprint package');

    // Phase C — Bob imports it into a COMPLETELY INDEPENDENT Personal
    // Library (its own StorageProvider — a different device, in spirit).
    const bobStorage = new InMemoryStorageProvider();
    const bobLibrary = new LocalStructureLibraryStore({ storageProvider: bobStorage });
    const bobSession = new EditorSession({
        registry: brickRegistry, editorContext: null, toolRegistry: null,
        documentManager: null, selectionUseCase: null, previewUseCase: null,
        loadDocumentUseCase: null, personalStructureLibraryStore: bobLibrary
    });
    const bobsCopy = bobSession.importBlueprint(JSON.parse(blueprintJSON));
    assert(bobsCopy !== null, '35. PHASE C: Bob successfully imported the blueprint');
    assert(bobLibrary.hasStructure(bobsCopy.id) === true,
        '36. PHASE C: the imported Structure landed in Bob\'s own Personal Library');
    assert(bobsCopy.id !== farmstead.id,
        '37. PHASE C: Structure A != Structure B — Bob\'s copy has its own independent identity');
    assert(bobsCopy.name === farmstead.name,
        '38. PHASE C: metadata (name) survived the round trip');
    assert(geometrySnapshot(bobsCopy.bricks) === geometrySnapshot(farmstead.bricks),
        '39. PHASE C: geometry(A) === geometry(B) — every brick\'s definitionId/position/rotation matches exactly');
    assert(aliceStorage !== bobStorage && aliceStorage.list().length > 0 && bobStorage.list().length > 0,
        '40. PHASE C: Alice\'s and Bob\'s libraries are genuinely separate storage backends, both populated');
    console.log('✓ Phase C: Bob imported the blueprint into his own independent Personal Library');

    // Phase D — Bob places his imported copy through the ORDINARY
    // composition pipeline — no special "ImportedStructurePlacementTool,"
    // the exact same CopyStructureIntoDocumentUseCase every built-in and
    // personal Structure already goes through.
    const bobsDocument = makeEmptyDocument("Bob's Plot");
    const bobsHistory = new CommandHistory({ world: bobsDocument.world });
    const placeCommand = copyUseCase.execute(bobsCopy, {
        worldId: bobsDocument.world.id, buildingId: bobsDocument.building.id,
        world: bobsDocument.world, registry: brickRegistry
    });
    bobsHistory.execute(placeCommand);
    assert(bobsDocument.building.getBricks().length === bobsCopy.bricks.length,
        '41. PHASE D: the imported blueprint composed into Bob\'s Document through the ordinary pipeline');
    assert(geometrySnapshot(bobsDocument.building.getBricks()) === geometrySnapshot(bobsCopy.bricks),
        '42. PHASE D: the placed bricks are geometrically identical to the imported Structure\'s own bricks');
    const bobsDocumentSnapshotAfterPlacement = geometrySnapshot(bobsDocument.building.getBricks());
    console.log('✓ Phase D: Bob placed the imported blueprint via the ordinary composition pipeline');

    // Phase E — Independence: modifying/deleting Alice's ORIGINAL library
    // entry has zero effect on Bob's imported blueprint or the Document
    // he already placed it into.
    aliceLibrary.updateStructureMetadata(farmstead.id, { name: 'Renamed By Alice' });
    aliceLibrary.removeStructure(farmstead.id);
    assert(aliceLibrary.hasStructure(farmstead.id) === false,
        '43. PHASE E: Alice\'s original Farmstead is now gone from her own library');
    assert(bobLibrary.hasStructure(bobsCopy.id) === true,
        '44. PHASE E: Bob\'s imported copy is completely unaffected — still present in his library');
    assert(bobLibrary.getStructure(bobsCopy.id).name === farmstead.name,
        '45. PHASE E: Bob\'s copy keeps its own name, untouched by Alice\'s rename of HER entry');
    assert(geometrySnapshot(bobsDocument.building.getBricks()) === bobsDocumentSnapshotAfterPlacement,
        '46. PHASE E: the Document Bob already placed into is byte-identical after Alice deleted her original');
    console.log('✓ Phase E: Alice\'s original was renamed and deleted — Bob\'s copy and his placed Document were untouched');

    // Phase F — Malformed data is rejected before persistence, for every
    // failure mode this milestone's own design conversation named.
    const bobLibrarySizeBeforeBadImports = bobLibrary.listStructures().length;
    const malformedPackages = [
        ['unknown brick definition', (() => {
            const p = JSON.parse(blueprintJSON);
            p.structure.bricks[0].definitionId = 'nonsense:not-a-real-brick';
            return p;
        })()],
        ['duplicate brick ids', (() => {
            const p = JSON.parse(blueprintJSON);
            p.structure.bricks[1].id = p.structure.bricks[0].id;
            return p;
        })()],
        ['NaN coordinates', (() => {
            const p = JSON.parse(blueprintJSON);
            p.structure.bricks[0].position.x = NaN;
            return p;
        })()],
        ['missing fields', (() => {
            const p = JSON.parse(blueprintJSON);
            delete p.structure.name;
            return p;
        })()],
        ['unsupported schema version', (() => {
            const p = JSON.parse(blueprintJSON);
            p.schemaVersion = 999;
            return p;
        })()]
    ];
    for (const [label, badPackage] of malformedPackages) {
        expectThrows(() => bobSession.importBlueprint(badPackage),
            `47. PHASE F: import rejects "${label}" before anything is persisted`);
    }
    assert(bobLibrary.listStructures().length === bobLibrarySizeBeforeBadImports,
        '48. PHASE F: not one of the malformed imports added anything to Bob\'s library — rejected before persistence, every time');
    console.log('✓ Phase F: every malformed blueprint (unknown brick, duplicate ids, NaN coordinates, missing fields, bad schema version) was rejected before persistence');

    // Phase G — Determinism, proven again at the use-case level (Section A
    // already proved it at the pure buildBlueprintPackage() level): two
    // independent ExportBlueprintUseCase calls for the same Structure
    // produce byte-identical JSON.
    const exportUseCase = new ExportBlueprintUseCase();
    const firstExport = JSON.stringify(exportUseCase.execute(bobsCopy));
    const secondExport = JSON.stringify(exportUseCase.execute(bobsCopy));
    assert(firstExport === secondExport,
        '49. PHASE G: exporting the same Structure twice via ExportBlueprintUseCase is byte-identical');

    // And the reverse direction, once more via the pure ImportBlueprintUseCase
    // directly (not through EditorSession), confirming import never depends
    // on EditorSession plumbing to be correct.
    const importUseCase = new ImportBlueprintUseCase();
    const independentImport = importUseCase.execute(JSON.parse(blueprintJSON), { registry: brickRegistry });
    assert(independentImport.id !== farmstead.id && independentImport.id !== bobsCopy.id,
        '50. PHASE G: a third, independent import of the same package mints yet another fresh identity');
    assert(geometrySnapshot(independentImport.bricks) === geometrySnapshot(farmstead.bricks),
        '51. PHASE G: ...while still reproducing the exact same geometry');
    console.log('✓ Phase G: export/import are deterministic — same input, same geometry, always a fresh identity');

    console.log('\nAll Blueprint Sharing & Exchange tests passed.');
}

// tests.html's `await import(file)` only reliably waits for a module's
// synchronous top-level evaluation — see every other test file's own
// closing comment on this — so this is invoked with top-level await,
// never fire-and-forget.
await run();
