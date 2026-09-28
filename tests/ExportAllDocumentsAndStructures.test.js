import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { Structure } from '../core/Structure.js';
import { World } from '../core/World.js';
import { DocumentManager } from '../application/document/DocumentManager.js';
import { DocumentManifest } from '../application/document/DocumentManifest.js';
import { SaveDocumentUseCase } from '../application/document/SaveDocumentUseCase.js';
import {
    DOCUMENT_BUNDLE_KIND, ExportAllDocumentsUseCase, ImportDocumentBundleUseCase
} from '../application/document/DocumentBundle.js';
import { BLUEPRINT_BUNDLE_KIND } from '../application/blueprint/BlueprintBundle.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { EditorSession } from '../application/editor/EditorSession.js';
import { LocalStructureLibraryStore } from '../application/editor/LocalStructureLibraryStore.js';
import { useBlueprintExchange } from '../ui/views/editorView/useBlueprintExchange.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Export All Documents (Editor → Recent) and Export All (My Structures):
// one file each, imported back through the same Import buttons.

function makeDocument(title, brickCount = 2, id = undefined) {
    const world = new World({ id });
    const building = new Building({ creator: 'tester' });
    for (let i = 0; i < brickCount; i++) {
        building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(i, 0.5, 0), rotation: 0 }));
    }
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title }) });
}

function saveTo(storage, document) {
    new SaveDocumentUseCase(storage).execute(new DocumentManager(document));
    return document.world.id;
}

// Captures what useBlueprintExchange downloads.
const downloads = [];
globalThis.document = {
    createElement: () => ({
        click() {
            downloads.push({ name: this.download, data: JSON.parse(decodeURIComponent(this.href.slice(this.href.indexOf(',') + 1))) });
        }
    })
};

async function run() {
    // --- documents ------------------------------------------------------
    const source = new InMemoryStorageProvider();
    const houseId = saveTo(source, makeDocument('House'));
    const barnId = saveTo(source, makeDocument('Barn', 3));

    assert(await new ExportAllDocumentsUseCase(new InMemoryStorageProvider()).execute() === null, 'nothing saved, nothing to export');
    const bundle = await new ExportAllDocumentsUseCase(source).execute();
    assert(bundle.kind === DOCUMENT_BUNDLE_KIND && bundle.documents.length === 2, 'every saved document is in the bundle');

    const fresh = new InMemoryStorageProvider();
    const firstImport = await new ImportDocumentBundleUseCase(fresh).execute(JSON.parse(JSON.stringify(bundle)));
    assert(firstImport.added === 2 && firstImport.copied === 0, 'a new device gets every document');
    const freshIndex = new DocumentManifest(fresh).list();
    assert(freshIndex.map((e) => e.id).sort().join() === [houseId, barnId].sort().join(), 'documents keep their ids on a device that lacks them');
    assert(freshIndex.find((e) => e.id === houseId).title === 'House', 'the document list shows their titles');

    const again = await new ImportDocumentBundleUseCase(fresh).execute(bundle);
    assert(again.unchanged === 2 && again.added === 0 && again.copied === 0, 'importing the same bundle twice changes nothing');

    const edited = makeDocument('House, edited here', 5, houseId);
    const editedJson = JSON.parse(JSON.stringify(bundle));
    const diverged = new InMemoryStorageProvider();
    saveTo(diverged, makeDocument('Unrelated'));
    new SaveDocumentUseCase(diverged).execute(new DocumentManager(edited));
    const copied = await new ImportDocumentBundleUseCase(diverged).execute(editedJson);
    assert(copied.copied === 1 && copied.added === 1, 'a different version of a document here is imported as a copy');
    const divergedTitles = new DocumentManifest(diverged).list().map((e) => e.title).sort();
    assert(divergedTitles.filter((t) => t === 'House').length === 1 && divergedTitles.includes('House, edited here'),
        `both versions are kept (${divergedTitles.join(', ')})`);

    const withBad = { ...bundle, documents: [...bundle.documents, { not: 'a document' }] };
    const partly = await new ImportDocumentBundleUseCase(new InMemoryStorageProvider()).execute(withBad);
    assert(partly.added === 2 && partly.failed === 1, 'a bad document is counted and the rest still import');

    let refused = null;
    try { await new ImportDocumentBundleUseCase(fresh).execute({ ...bundle, formatVersion: 2 }); } catch (e) { refused = e; }
    assert(refused && /newer version/.test(refused.message), 'a bundle from a newer version is refused');
    console.log('✓ every saved document exports to one file and imports without duplicates');

    // --- structures -------------------------------------------------------
    const registry = new CreateBrickRegistryUseCase().execute();
    function makeLibrarySession() {
        const store = new LocalStructureLibraryStore({ storageProvider: new InMemoryStorageProvider() });
        const session = new EditorSession({
            registry, editorContext: null, toolRegistry: null, documentManager: null,
            selectionUseCase: null, previewUseCase: null, loadDocumentUseCase: null, personalStructureLibraryStore: store
        });
        return { store, session };
    }
    function exchangeFor({ store, session }, feedbackLog, extra = {}) {
        return useBlueprintExchange({
            blueprintAttributionExchange: null,
            blueprintAttributionUseCase: { summarize: () => ({ attributions: [] }) },
            blueprintLineageExchange: null,
            blueprintLineageUseCase: { claimsForBlueprint: () => [] },
            documentManager: null,
            editorSession: session,
            feedback: { show: (message) => feedbackLog.push(message) },
            refreshPersonalStructureGroups: () => {},
            personalStructureLibraryStore: store,
            ...extra
        });
    }

    const alice = makeLibrarySession();
    alice.store.addStructure(new Structure({ id: 's1', name: 'Tower', bricks: [{ id: 'b1', definitionId: 'core:cube', position: { x: 0, y: 0, z: 0 }, rotation: 0 }] }));
    alice.store.addStructure(new Structure({ id: 's2', name: 'Wall', bricks: [{ id: 'b2', definitionId: 'core:cube', position: { x: 1, y: 0, z: 0 }, rotation: 0 }] }));
    const aliceLog = [];
    exchangeFor(alice, aliceLog).exportAllStructures();
    const blueprintDownload = downloads.pop();
    assert(blueprintDownload.data.kind === BLUEPRINT_BUNDLE_KIND && blueprintDownload.data.blueprints.length === 2, 'every structure is in the bundle');
    assert(/^forkbuild-blueprints-/.test(blueprintDownload.name), 'the file is named as a blueprint bundle');

    const empty = makeLibrarySession();
    const emptyLog = [];
    exchangeFor(empty, emptyLog).exportAllStructures();
    assert(emptyLog[0] === 'My Structures is empty' && downloads.length === 0, 'an empty library exports nothing');

    const bob = makeLibrarySession();
    bob.store.addStructure(new Structure({ id: 'mine', name: 'Tower', bricks: [{ id: 'x', definitionId: 'core:cube', position: { x: 0, y: 0, z: 0 }, rotation: 0 }] }));
    const bobLog = [];
    const withBadBlueprint = { ...blueprintDownload.data, blueprints: [...blueprintDownload.data.blueprints, { kind: 'nonsense' }] };
    exchangeFor(bob, bobLog).importBlueprint(JSON.stringify(withBadBlueprint));
    assert(bob.store.listStructures().map((s) => s.name).sort().join() === 'Tower,Wall', 'a design already in My Structures is not added twice');
    assert(bobLog[0] === 'Imported 1 structure into My Structures, 1 already there, 1 could not be read', `the result is reported (${bobLog[0]})`);
    console.log('✓ every structure exports to one file and imports without duplicates');

    // --- the Editor's Export All Documents / Import --------------------------
    const editorLog = [];
    let revisions = 0;
    const editorExchange = exchangeFor(makeLibrarySession(), editorLog, {
        exportAllDocumentsUseCase: new ExportAllDocumentsUseCase(source),
        importDocumentBundleUseCase: new ImportDocumentBundleUseCase(new InMemoryStorageProvider()),
        onSavedDocumentsChanged: () => { revisions++; }
    });
    await editorExchange.exportAllDocuments();
    const documentsDownload = downloads.pop();
    assert(documentsDownload.data.documents.length === 2 && /^forkbuild-documents-/.test(documentsDownload.name), 'Export All Documents downloads the bundle');
    await editorExchange.importDocument(JSON.stringify(documentsDownload.data));
    assert(revisions === 1, 'the Recent list is told to read the documents again');
    assert(/^Imported 2 documents/.test(editorLog.at(-1)), `the import is reported (${editorLog.at(-1)})`);
    console.log('✓ the Editor exports and imports every document through its own buttons');
}

await run();
