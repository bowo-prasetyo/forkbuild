import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { Structure } from '../core/Structure.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { CreateStructureRegistryUseCase } from '../application/CreateStructureRegistryUseCase.js';
import { SelectionState } from '../application/editor-state/SelectionState.js';
import { EditorSession } from '../application/EditorSession.js';
import { EditorContext } from '../application/EditorContext.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { SelectionUseCase } from '../application/SelectionUseCase.js';
import { PreviewUseCase } from '../application/PreviewUseCase.js';
import { EditorActionRegistry, createStandardActions } from '../application/EditorActionRegistry.js';
import { EditorActionContext } from '../application/EditorActionContext.js';
import { LocalStructureLibraryStore } from '../application/LocalStructureLibraryStore.js';
import { ForkStructureToLibraryUseCase } from '../application/ForkStructureToLibraryUseCase.js';

// 0.6.3 — Blueprint Authoring & Versioning UX.
//
// 0.4.2/0.4.3 built extraction and the personal library; 0.6.2 gave the
// Editor a real Selection Inspector. What was still missing was
// AUTHORING and REVISION as an explicit, polished workflow — see
// docs/Roadmap.md, 0.6.3:
//
//   Build -> Select -> Create Blueprint -> My Structures -> Place ->
//   Modify -> Create Blueprint again
//
// Nothing in this milestone adds mutable Structure editing (0.4.3's own
// "Structures remain immutable values" stands unchanged) or a
// sourceStructureId/version/parentBlueprintId field on Structure itself
// — see application/ForkStructureToLibraryUseCase.js's own header, and
// docs/Roadmap.md, 0.6.3's "Deliberately excluded."
//
//   Section A: EditorActionRegistry — 'structure.createFromSelection'
//              is now labeled "Create Blueprint", tier 'advanced', and
//              prefers ui.openCreateBlueprintDialog() over the 0.4.2
//              ui.promptCreateStructure() fallback when both exist —
//              proving the dialog-first path AND the backward-
//              compatible fallback tests/EditorUX.test.js already
//              depends on both still hold.
//   Section B: application/ForkStructureToLibraryUseCase.js /
//              EditorSession#forkStructureToPersonalLibrary() — a
//              built-in Structure fork gets a fresh id and fresh brick
//              ids, preserves metadata, and never touches the built-in
//              Structure it came from; two forks of the same built-in
//              Structure are independent library entries.
//   Section C — CAPSTONE: the full authoring + versioning loop, plus
//              every independence/undo/serialization guarantee the
//              design conversation asked for.

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

function makeEmptyDocument(title) {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    world.addBuilding(building);
    const document = new Document({ world, metadata: new DocumentMetadata({ title, author: 'tester' }) });
    return { world, building, document };
}

// Mirrors tests/EditorUX.test.js#buildSession() — a headless EditorSession
// wired with its own CommandHistory (registered into
// _editorCommandHistories, same reason that file's own header explains)
// and a fresh, in-memory personal library.
function buildSession({ world, building }, { personalStructureLibraryStore } = {}) {
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const document = new Document({ world, metadata: new DocumentMetadata({ title: 'BlueprintAuthoringUX', author: 'tester' }) });
    const editorContext = new EditorContext();
    const documentManager = new DocumentManager();
    documentManager.load(document, world.id);

    const store = personalStructureLibraryStore || new LocalStructureLibraryStore({ storageProvider: new InMemoryStorageProvider() });

    const session = new EditorSession({
        registry: brickRegistry,
        editorContext,
        toolRegistry: null,
        documentManager,
        selectionUseCase: new SelectionUseCase(editorContext),
        previewUseCase: new PreviewUseCase(editorContext),
        loadDocumentUseCase: null,
        personalStructureLibraryStore: store
    });
    const commandHistory = new CommandHistory({ world });
    session._commandHistory = commandHistory;
    session._editorCommandHistories.set(world.id, commandHistory);

    return { session, editorContext, documentManager, document, brickRegistry, building, personalStructureLibraryStore: store, commandHistory };
}

function selectBricks(editorContext, building, brickIds) {
    editorContext.setSelection(new SelectionState({
        items: brickIds.map((brickId) => ({ type: 'brick', buildingId: building.id, brickId }))
    }));
}

async function run() {
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const structureRegistry = new CreateStructureRegistryUseCase().execute();

    // ---------------------------------------------------------------
    // A. EditorActionRegistry — Create Blueprint, dialog-first
    // ---------------------------------------------------------------
    {
        const actions = createStandardActions({ session: {}, feedback: { show() {} }, ui: {} });
        const action = actions.find((a) => a.id === 'structure.createFromSelection');
        assert(action.label === 'Create Blueprint', '1. label renamed from "Create Structure" to "Create Blueprint"');
        assert(action.tier === 'advanced', '2. tier is Advanced — a "what\'s next," not an always-visible button');

        const stubStructure = new Structure({ id: 'preview-1', name: 'X', bricks: [] });
        const session = {
            createStructureFromSelection: () => stubStructure,
            saveStructureToPersonalLibrary: () => true
        };
        const ctx = EditorActionContext.capture({ session, selectionCount: 1 });

        let dialogOpened = false;
        let promptCalled = false;
        const bothHooks = {
            openCreateBlueprintDialog: () => { dialogOpened = true; },
            promptCreateStructure: () => { promptCalled = true; return null; }
        };
        const registryWithDialog = new EditorActionRegistry(createStandardActions({ session, feedback: { show() {} }, ui: bothHooks }));
        assert(registryWithDialog.execute('structure.createFromSelection', ctx) === true, '3. executes with the dialog hook wired');
        assert(dialogOpened === true, '4. ui.openCreateBlueprintDialog() is called');
        assert(promptCalled === false, '5. ...and the window.prompt() fallback is never reached when the dialog hook exists');

        // 0.4.2/0.4.3 backward compatibility — tests/EditorUX.test.js's
        // own Section D depends on this exact fallback still working for
        // a surface (or a headless harness) with no dialog.
        const feedbackLog = [];
        let promptCalled2 = false;
        const promptOnly = {
            promptCreateStructure: () => { promptCalled2 = true; return { name: 'Cottage', category: 'test', description: '' }; }
        };
        const registryPromptOnly = new EditorActionRegistry(createStandardActions({ session, feedback: { show: (m) => feedbackLog.push(m) }, ui: promptOnly }));
        assert(registryPromptOnly.execute('structure.createFromSelection', ctx) === true, '6. executes without a dialog hook too');
        assert(promptCalled2 === true, '7. ...falling back to ui.promptCreateStructure(), unchanged');
        assert(feedbackLog.at(-1) === 'Saved "X" to My Structures', '8. ...and the exact 0.4.3 feedback message is unchanged');

        console.log('✓ A. EditorActionRegistry: Create Blueprint is labeled/tiered per the design conversation, and prefers the dialog hook without breaking the 0.4.2/0.4.3 fallback');
    }

    // ---------------------------------------------------------------
    // B. ForkStructureToLibraryUseCase / forkStructureToPersonalLibrary()
    // ---------------------------------------------------------------
    {
        const house = structureRegistry.get('village:house');
        const forkUseCase = new ForkStructureToLibraryUseCase();

        let threw = false;
        try { forkUseCase.execute(null); } catch (e) { threw = true; }
        assert(threw, '1. requires a valid Structure');

        const forkedA = forkUseCase.execute(house);
        assert(forkedA.id !== house.id, '2. the fork gets a fresh Structure id');
        assert(forkedA.name === house.name && forkedA.category === house.category && forkedA.description === house.description,
            '3. metadata (name/category/description) is preserved as-is');
        assert(forkedA.bricks.length === house.bricks.length, '4. every brick is carried over');
        assert(forkedA.bricks.every((brick, i) => brick.id !== house.bricks[i].id), '5. every brick gets a fresh id too');
        assert(bricksSnapshot(forkedA.bricks).join('|') === bricksSnapshot(house.bricks).join('|'),
            '6. geometry (definitionId/position/rotation) is byte-identical');

        // Mutating the fork's own Brick objects never reaches the
        // built-in Structure it came from — independent instances, not
        // references, the same guarantee ForkStructureUseCase/
        // ImportBlueprintUseCase already give one rung over.
        const originalRotation = house.bricks[0].rotation;
        forkedA.bricks[0].rotation = (originalRotation + 90) % 360;
        assert(house.bricks[0].rotation === originalRotation, '7. the built-in Structure is completely untouched by mutating the fork');

        // Forking the SAME built-in Structure twice produces two
        // independent entries — never a silent overwrite of one by the
        // other, the same "Structure A != Structure B" property
        // tests/BlueprintExchange.test.js already proves for import.
        const forkedB = forkUseCase.execute(house);
        assert(forkedB.id !== forkedA.id, '8. forking twice produces two independent ids');

        // EditorSession wiring — graceful degradation, then the real thing.
        const { world, building } = makeEmptyDocument('B');
        const bareSession = buildSession({ world, building }, { personalStructureLibraryStore: null }).session;
        bareSession._personalStructureLibraryStore = null;
        assert(bareSession.forkStructureToPersonalLibrary(house) === null, '9. returns null (no-op) with no library store wired');

        const { session, personalStructureLibraryStore } = buildSession(makeEmptyDocument('B2'));
        const saved = session.forkStructureToPersonalLibrary(house);
        assert(saved !== null, '10. forkStructureToPersonalLibrary() succeeds with a store wired');
        assert(personalStructureLibraryStore.hasStructure(saved.id) === true, '11. ...and the fork actually lands in the personal library');
        assert(personalStructureLibraryStore.getStructure(saved.id).name === house.name, '12. ...under the built-in Structure\'s own name (Rename handles renaming afterward)');

        console.log('✓ B. ForkStructureToLibraryUseCase: a built-in Structure forks into an independent personal Structure — fresh id, fresh brick ids, preserved metadata, source never touched');
    }

    // ---------------------------------------------------------------
    // C — CAPSTONE: Build -> Select -> Create Blueprint -> My
    //     Structures -> Place -> Modify -> Create Blueprint again ->
    //     Export -> Import -> Place imported copy, with every
    //     independence/undo/serialization guarantee proven along the
    //     way.
    // ---------------------------------------------------------------
    {
        const { world, building, document } = makeEmptyDocument('Capstone');
        const { session, editorContext, personalStructureLibraryStore, commandHistory } = buildSession({ world, building });

        // 1. Build: two ordinary bricks, placed by hand.
        const b1 = new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) });
        const b2 = new Brick({ definitionId: 'core:cube', position: new Position(1, 0.5, 0) });
        building.addBrick(b1);
        building.addBrick(b2);
        const originalSnapshot = bricksSnapshot(building.getBricks());

        // 2. Select -> Create Blueprint ("Farmstead").
        selectBricks(editorContext, building, [b1.id, b2.id]);
        const farmstead = session.createStructureFromSelection({ name: 'Farmstead', category: 'residential', description: 'Two bricks' });
        assert(farmstead !== null, '1. Create Blueprint (extraction) succeeds');
        assert(bricksSnapshot(building.getBricks()).join('|') === originalSnapshot.join('|'),
            '2. the source document\'s own bricks are byte-identical after extraction — copy, never move');
        assert(farmstead.bricks.every((brick, i) => brick.id !== [b1, b2][i].id),
            '3. the extracted Structure\'s bricks carry FRESH ids, never the source bricks\' own');

        // 3. -> My Structures.
        assert(session.saveStructureToPersonalLibrary(farmstead) === true, '4. saved to the personal library');
        assert(personalStructureLibraryStore.hasStructure(farmstead.id) === true, '5. Farmstead is now in My Structures');

        // 4. Place the blueprint into a SECOND, independent document.
        const { world: placeWorld, building: placeBuilding } = makeEmptyDocument('Placement');
        const { session: placeSession, commandHistory: placeHistory } = buildSession(
            { world: placeWorld, building: placeBuilding },
            { personalStructureLibraryStore }
        );
        const bricksBeforePlace = placeBuilding.getBricks().length;
        assert(placeSession.copyStructureIntoDocument(farmstead) === true, '6. Blueprint -> Place succeeds');
        assert(placeBuilding.getBricks().length === bricksBeforePlace + farmstead.bricks.length,
            '7. placing adds the blueprint\'s own bricks as independent content');
        assert(bricksSnapshot(farmstead.bricks).join('|') !== ''
            && personalStructureLibraryStore.getStructure(farmstead.id) !== null
            && bricksSnapshot(personalStructureLibraryStore.getStructure(farmstead.id).bricks).join('|') === bricksSnapshot(farmstead.bricks).join('|'),
            '8. placing a blueprint never mutates the blueprint itself — the library entry is unchanged');

        // 5. Modify the placed copy.
        const placedBricks = placeBuilding.getBricks();
        const placedCopy = placedBricks[placedBricks.length - 1];
        placedCopy.rotation = (placedCopy.rotation + 90) % 360;
        placedCopy.position = new Position(placedCopy.position.x, placedCopy.position.y, placedCopy.position.z + 5);
        assert(personalStructureLibraryStore.getStructure(farmstead.id).bricks.every((b) => b.rotation !== placedCopy.rotation || b.position.z !== placedCopy.position.z),
            '9. modifying the placed copy never reaches back into the library entry it came from');

        // 6. -> Select the modified bricks -> Create Blueprint again
        //    ("Farmstead Deluxe") — a second, independent revision.
        const modifiedIds = placedBricks.slice(placedBricks.length - farmstead.bricks.length).map((b) => b.id);
        const placeEditorContext = placeSession._editorContext;
        selectBricks(placeEditorContext, placeBuilding, modifiedIds);
        const deluxe = placeSession.createStructureFromSelection({ name: 'Farmstead Deluxe', category: 'residential', description: 'Revised' });
        assert(deluxe !== null, '10. Create Blueprint again succeeds on the modified copy');
        assert(deluxe.id !== farmstead.id, '11. the revision is a NEW, independent Structure id');
        assert(placeSession.saveStructureToPersonalLibrary(deluxe) === true, '12. the revision saves to the SAME personal library');
        assert(personalStructureLibraryStore.listStructures().length === 2,
            '13. two independent revisions now coexist in My Structures — Farmstead AND Farmstead Deluxe');
        assert(bricksSnapshot(personalStructureLibraryStore.getStructure(farmstead.id).bricks).join('|')
            === bricksSnapshot(farmstead.bricks).join('|'),
            '14. saving the revision never touched the original Farmstead entry');

        // 7. Export Farmstead Deluxe, import it into a wholly separate
        //    "device" (its own store), place the imported copy.
        const { ExportBlueprintUseCase } = await import('../application/ExportBlueprintUseCase.js');
        const { ImportBlueprintUseCase } = await import('../application/ImportBlueprintUseCase.js');
        const pkg = new ExportBlueprintUseCase().execute(deluxe);
        const otherDeviceStore = new LocalStructureLibraryStore({ storageProvider: new InMemoryStorageProvider() });
        const importedDeluxe = new ImportBlueprintUseCase().execute(pkg, { registry: brickRegistry });
        otherDeviceStore.addStructure(importedDeluxe);
        assert(importedDeluxe.id !== deluxe.id, '15. the imported copy has its own, fresh identity — export/import stays independent');
        assert(bricksSnapshot(importedDeluxe.bricks).join('|') === bricksSnapshot(deluxe.bricks).join('|'),
            '16. ...but is geometrically identical to what was exported');

        const { world: importWorld, building: importBuilding } = makeEmptyDocument('Imported');
        const { session: importSession } = buildSession({ world: importWorld, building: importBuilding }, { personalStructureLibraryStore: otherDeviceStore });
        assert(importSession.copyStructureIntoDocument(importedDeluxe) === true, '17. the imported blueprint places just like any other');
        assert(importBuilding.getBricks().length === importedDeluxe.bricks.length, '18. ...landing as ordinary, independent bricks');

        // 8. Undo/redo never touches library state.
        const librarySizeBeforeUndo = personalStructureLibraryStore.listStructures().length;
        placeHistory.undo(); // undoes the "place Farmstead" PasteBricksCommand from step 4
        assert(personalStructureLibraryStore.listStructures().length === librarySizeBeforeUndo,
            '19. undoing a Document command leaves the personal library completely untouched');
        assert(personalStructureLibraryStore.hasStructure(farmstead.id) && personalStructureLibraryStore.hasStructure(deluxe.id),
            '20. ...both revisions are still exactly where they were');
        placeHistory.redo();

        // 9. World/Document serialization is completely unaffected by
        //    any library operation — a Document never embeds, references,
        //    or even knows about My Structures.
        const documentJson = JSON.stringify(document.toJSON ? document.toJSON() : { world: world.toJSON() });
        assert(!documentJson.includes(farmstead.id) && !documentJson.includes(deluxe.id),
            '21. the source Document\'s own serialization never references a library Structure\'s id');

        console.log('✓ C. CAPSTONE: Build -> Select -> Create Blueprint -> My Structures -> Place -> Modify -> Create Blueprint again -> Export -> Import -> Place, with independence, undo, and serialization all holding');
    }

    console.log('\nAll Blueprint Authoring & Versioning UX tests passed.');
}

run().catch((error) => {
    console.error(error);
    throw error;
});
