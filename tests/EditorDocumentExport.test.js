import { readFile } from 'node:fs/promises';

import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { Group } from '../core/Group.js';
import { License, LicenseId } from '../core/License.js';
import { DOCUMENT_SCHEMA_VERSION } from '../core/documentSchema.js';

import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { DocumentValidator } from '../serializer/DocumentValidator.js';
import { DocumentSchemaMigrator } from '../serializer/DocumentSchemaMigrator.js';

import { StorageProvider } from '../storage/StorageProvider.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { DocumentManifest } from '../application/DocumentManifest.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { LoadDocumentUseCase } from '../application/LoadDocumentUseCase.js';
import { ExportDocumentUseCase } from '../application/ExportDocumentUseCase.js';
import { editorViewFiles } from './support/SourceFileGroups.js';

// Deliberately does NOT import application/EditorSession.js: that class
// pulls in the renderer stack (ultimately `three`), which this repo only
// ever resolves through tests.html's browser import map, not plain
// `node`. EditorSession.exportDocument() is instead verified the same
// way the 0.9.640 audit verifies things it cannot cheaply instantiate —
// live, from its own real source (see Section B/D below) — while every
// runtime assertion here exercises the actual application-level command,
// ExportDocumentUseCase, that method delegates to.

// 0.9.641 — Editor Document Export.
//
// Implements the recommendation tests/EditorDocumentPortabilityBoundaryAudit
// .test.js (0.9.640) reached: Export is a thin, focused action —
// application/ExportDocumentUseCase.js — that reuses the existing
// DocumentSerializer.serialize() seam and nothing else. It is purely
// observational: no persistence, no manifest write, no Publication, no
// distribution, no change to Editor state. Import (fresh documentId,
// DocumentCloneService) is explicitly out of scope — see Section D.
//
//   Section A — real document export via the real serializer
//   Section B — serializer identity: Export calls the actual
//               DocumentSerializer.serialize(), not a second implementation
//   Section C — round-trip preparation: export -> deserialize with the
//               existing production serializer
//   Section D — no identity-preservation promise: Export is not Import
//   Section E — no local persistence side effect
//   Section F — export failure: no partial mutation
//   Section G — existing Save -> Load workflow regression
//   Section H — UI wiring: Toolbar/EditorView surface the action

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

const SOURCE_ROOT = new URL('../', import.meta.url);
async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}
function codeOnly(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

function createRichDocument({ title = 'Export Test World', brickCount = 5 } = {}) {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    for (let i = 0; i < brickCount; i++) {
        building.addBrick(new Brick({
            definitionId: 'core:cube',
            position: new Position(i * 2, 0.5, 0),
            rotation: i * 15
        }));
    }
    world.addBuilding(building);
    const groupBrickIds = building.getBricks().slice(0, 3).map((b) => b.id);
    world.addGroup(new Group({ name: 'ExportGroup', brickIds: groupBrickIds }));
    return new Document({
        world,
        metadata: new DocumentMetadata({
            title,
            description: 'A document built to exercise real Export.',
            author: 'alice',
            license: new License({ id: LicenseId.CC_BY_4_0 })
        })
    });
}

async function run() {
    // ===============================================================
    // Section A — real document export.
    // ===============================================================
    {
        const doc = createRichDocument();
        const documentManager = new DocumentManager(doc);

        const exported = new ExportDocumentUseCase().execute(documentManager.document);

        assert(exported !== null, '1. ExportDocumentUseCase.execute() returns something for a real document');
        assert(exported.schemaVersion === DOCUMENT_SCHEMA_VERSION, '2. exported artifact carries the schema envelope version');
        assert(exported.world.buildings.length === 1, '3. exported artifact contains the building');
        assert(exported.world.buildings[0].bricks.length === 5, '4. exported artifact contains every brick');
        assert(exported.world.groups.length === 1 && exported.world.groups[0].name === 'ExportGroup',
            '5. exported artifact contains the group');
        assert(exported.metadata.title === 'Export Test World', '6. exported artifact contains metadata (title)');
        assert(exported.metadata.author === 'alice', '7. exported artifact contains metadata (author)');
        assert(exported.metadata.license.id === LicenseId.CC_BY_4_0, '8. exported artifact contains metadata (license)');

        assert(JSON.stringify(exported) === JSON.stringify(doc.toJSON()),
            '9. exportDocument() produces EXACTLY document.toJSON() — no additional wrapping, no omitted content');

        console.log('✓ A: ExportDocumentUseCase.execute() — the command EditorSession.exportDocument() delegates to (Section B) — returns a complete, real document representation: buildings, bricks, groups, and every metadata field, produced by the real serializer.');
    }

    // ===============================================================
    // Section B — serializer identity.
    // ===============================================================
    {
        let serializeCalls = 0;
        class SpySerializer extends DocumentSerializer {
            serialize(document) {
                serializeCalls += 1;
                return super.serialize(document);
            }
        }
        const doc = createRichDocument({ title: 'Spy Test' });
        const useCase = new ExportDocumentUseCase(new SpySerializer());
        const result = useCase.execute(doc);

        assert(serializeCalls === 1, '10. ExportDocumentUseCase.execute() calls DocumentSerializer.serialize() exactly once');
        assert(JSON.stringify(result) === JSON.stringify(doc.toJSON()),
            '11. the result is exactly what the real serializer produced — no second serialization path');

        // Structural proof, from real source: ExportDocumentUseCase has no
        // serialization logic of its own — it only ever calls the
        // serializer it was given.
        const useCaseSource = codeOnly(await rawSource('application/ExportDocumentUseCase.js'));
        assert(/this\._documentSerializer\.serialize\(document\)/.test(useCaseSource),
            '12. ExportDocumentUseCase\'s own source calls documentSerializer.serialize() — the real seam, not a re-derived shortcut');
        assert(!/\.toJSON\(\)/.test(useCaseSource),
            '13. ExportDocumentUseCase never calls document.toJSON() directly — it always goes through the injected serializer');
        assert(/new DocumentSerializer\(\)/.test(codeOnly(await rawSource('application/ExportDocumentUseCase.js'))),
            '14. ExportDocumentUseCase defaults to the REAL, production DocumentSerializer, not a stub');

        // EditorSession.exportDocument() delegates rather than reimplementing.
        const editorSessionSource = codeOnly(await rawSource('application/EditorSession.js'));
        assert(/exportDocument\(\)\s*\{[\s\S]*?this\._exportDocumentUseCase\.execute\(this\._documentManager\.document\)/.test(editorSessionSource),
            '15. EditorSession.exportDocument() delegates straight to this._exportDocumentUseCase.execute() — it does not serialize anything itself');

        console.log('✓ B: Export calls the real DocumentSerializer.serialize() — proven live by call-counting a spy subclass — and both ExportDocumentUseCase and EditorSession are structurally confirmed to delegate rather than reimplement serialization.');
    }

    // ===============================================================
    // Section C — round-trip preparation (export -> deserialize).
    // ===============================================================
    {
        const doc = createRichDocument({ title: 'Round Trip', brickCount: 4 });
        const exported = new ExportDocumentUseCase().execute(doc);

        // Simulate leaving the process entirely (the eventual file).
        const roundTripped = JSON.parse(JSON.stringify(exported));

        const migrated = DocumentSchemaMigrator.migrate(roundTripped);
        const validation = DocumentValidator.validate(migrated);
        assert(validation.valid === true, '16. the exported artifact validates cleanly with the existing production validator');

        const restored = new DocumentSerializer().deserialize(roundTripped);
        assert(restored instanceof Document, '17. the exported artifact deserializes into a real Document with the existing production deserializer');

        assert(restored.world.getBuildings().length === doc.world.getBuildings().length,
            '18. building count survives export -> deserialize');
        const originalBricks = doc.world.getBuildings()[0].getBricks();
        const restoredBricks = restored.world.getBuildings()[0].getBricks();
        assert(restoredBricks.length === originalBricks.length, '19. brick count survives export -> deserialize');
        for (let i = 0; i < originalBricks.length; i++) {
            assert(restoredBricks[i].id === originalBricks[i].id, `20.${i} brick id survives (same-process round trip, no identity change yet)`);
            assert(restoredBricks[i].definitionId === originalBricks[i].definitionId, `21.${i} brick definitionId survives`);
            assert(restoredBricks[i].position.x === originalBricks[i].position.x
                && restoredBricks[i].position.y === originalBricks[i].position.y
                && restoredBricks[i].position.z === originalBricks[i].position.z, `22.${i} brick position survives`);
        }
        assert(restored.world.getGroups().length === doc.world.getGroups().length, '23. structure (groups) survives export -> deserialize');
        assert(restored.metadata.title === doc.metadata.title, '24. title survives export -> deserialize');
        assert(restored.metadata.license.id === doc.metadata.license.id, '25. license survives export -> deserialize');

        console.log('✓ C: Document -> export -> (leaves the process) -> DocumentSerializer.deserialize() -> equivalent Document content, using only the existing production migrate/validate/deserialize pipeline.');
    }

    // ===============================================================
    // Section D — no identity-preservation promise.
    // ===============================================================
    {
        const doc = createRichDocument({ title: 'Identity Is Not This Milestone\'s Job' });
        const exported = new ExportDocumentUseCase().execute(doc);
        const restored = new DocumentSerializer().deserialize(JSON.parse(JSON.stringify(exported)));

        // Export itself is a faithful mirror — it carries the SOURCE
        // document's own id forward, unchanged, exactly like
        // Document.toJSON() always has. This is expected and correct for
        // Export; it is NOT a promise about what a future Import will do
        // with that id.
        assert(exported.world.id === doc.world.id, '26. the exported artifact carries the source document\'s own world.id, unmodified');
        assert(restored.world.id === doc.world.id, '27. deserializing the exported artifact reproduces that same id — Export mints nothing new');

        // Structural proof that Export never reaches for the identity
        // mechanism Import will need (DocumentCloneService, per the
        // 0.9.640 audit's own Section D) — that decision is explicitly
        // deferred to a future Import milestone, not made here.
        const useCaseSource = codeOnly(await rawSource('application/ExportDocumentUseCase.js'));
        assert(!/DocumentCloneService/.test(useCaseSource),
            '28. ExportDocumentUseCase never references DocumentCloneService — minting a fresh identity is Import\'s decision, not Export\'s');

        console.log('✓ D: Export is a faithful mirror of the source document, including its own documentId — it makes no identity decision of any kind, and structurally never touches DocumentCloneService. Whether a future Import preserves, regenerates, or otherwise handles that id remains entirely open, exactly as the 0.9.640 audit\'s own Section D left it.');
    }

    // ===============================================================
    // Section E — no local persistence side effect.
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const documentManifest = new DocumentManifest(storageProvider);
        const doc = createRichDocument({ title: 'Observation Only' });
        const documentManager = new DocumentManager(doc);
        const exportDocumentUseCase = new ExportDocumentUseCase();

        const dirtyBefore = documentManager.state.dirty;
        const lastSavedBefore = documentManager.state.lastSaved;
        const buildingCountBefore = doc.world.getBuildings().length;
        const brickCountBefore = doc.world.getBuildings()[0].getBricks().length;

        exportDocumentUseCase.execute(documentManager.document);
        exportDocumentUseCase.execute(documentManager.document);
        exportDocumentUseCase.execute(documentManager.document);

        assert(storageProvider.list().length === 0, '29. Export never writes to storage — not even once, across multiple calls');
        assert(documentManifest.list().length === 0, '30. Export never creates a manifest entry');
        assert(documentManager.state.dirty === dirtyBefore, '31. Export never changes the dirty flag');
        assert(documentManager.state.lastSaved === lastSavedBefore, '32. Export never stamps lastSaved — that is Save\'s job, not Export\'s');
        assert(doc.world.getBuildings().length === buildingCountBefore, '33. Export never mutates the document\'s own building count');
        assert(doc.world.getBuildings()[0].getBricks().length === brickCountBefore, '34. Export never mutates the document\'s own brick count');

        // Structural proof: ExportDocumentUseCase cannot reach a
        // StorageProvider, a manifest, a publisher, discovery, or any
        // distribution transport — the same "structurally impossible,"
        // not merely "well-behaved," standard the 0.9.640 audit already
        // applied to the wider Export/Import composition.
        const useCaseSource = codeOnly(await rawSource('application/ExportDocumentUseCase.js'));
        assert(!/storageProvider|StorageProvider|DocumentManifest/.test(useCaseSource),
            '35. ExportDocumentUseCase has no reference to any StorageProvider or DocumentManifest anywhere in its own source');
        assert(!/from ['"].*publisher\//.test(useCaseSource) && !/from ['"].*\bdiscovery\//.test(useCaseSource)
            && !/from ['"].*\bnostr\//.test(useCaseSource) && !/from ['"].*\barweave\//.test(useCaseSource),
            '36. ExportDocumentUseCase imports nothing from publisher/, discovery/, nostr/, or arweave/');
        assert(!/PlacementRecord|PublicationSnapshot|announce/i.test(useCaseSource),
            '37. ExportDocumentUseCase never constructs a Publication, a PlacementRecord, or announces anything');

        console.log('✓ E: Export is purely observational — structurally unable to touch storage, the manifest, or any publish/announce path — and live-confirmed across repeated calls to leave the document, its dirty state, and its lastSaved stamp completely untouched.');
    }

    // ===============================================================
    // Section F — export failure: no partial mutation.
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();

        // Invalid input is rejected outright, before anything is touched.
        const invalidInputs = [null, undefined, {}, 'not a document', 42, []];
        for (const input of invalidInputs) {
            let threw = false;
            try {
                new ExportDocumentUseCase().execute(input);
            } catch (err) {
                threw = true;
            }
            assert(threw, `38. ExportDocumentUseCase.execute() throws rather than returning a partial result for input: ${JSON.stringify(input)}`);
        }
        assert(storageProvider.list().length === 0, '39. none of the failed export attempts above touched a storage probe (nothing was ever handed one)');

        // A serializer that fails mid-serialization: the failure
        // propagates cleanly, and the document/session are left exactly
        // as they were.
        class FailingSerializer extends DocumentSerializer {
            serialize() {
                throw new Error('simulated serialization failure');
            }
        }
        const doc = createRichDocument({ title: 'Failure Case' });
        const documentManager = new DocumentManager(doc);
        const failingExportUseCase = new ExportDocumentUseCase(new FailingSerializer());

        const dirtyBefore = documentManager.state.dirty;
        let exportThrew = false;
        try {
            failingExportUseCase.execute(documentManager.document);
        } catch (err) {
            exportThrew = true;
            assert(err.message === 'simulated serialization failure', '40. the underlying serializer failure surfaces to the caller, not a swallowed/generic error');
        }
        assert(exportThrew, '41. a failing serializer causes ExportDocumentUseCase.execute() to throw rather than return a partial artifact');
        assert(documentManager.state.dirty === dirtyBefore, '42. a failed export leaves the document\'s dirty state completely unchanged');
        assert(doc.world.getBuildings().length === 1, '43. a failed export leaves the document\'s own content completely unchanged');

        console.log('✓ F: malformed input and a mid-serialization failure both fail loudly (throw), never silently returning a partial artifact, and never mutating the document, its dirty state, or any storage probe.');
    }

    // ===============================================================
    // Section G — existing Save -> Load workflow regression.
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const doc = createRichDocument({ title: 'Save Load Still Works' });
        const documentManagerA = new DocumentManager(doc);
        const originalId = doc.world.id;

        const savedId = new SaveDocumentUseCase(storageProvider).execute(documentManagerA);
        assert(savedId === originalId, '44. Save still returns the document\'s own id, unaffected by Export existing');
        assert(documentManagerA.state.dirty === false, '45. Save still marks the document clean');

        const documentManagerB = new DocumentManager();
        const reopened = new LoadDocumentUseCase(storageProvider).execute(documentManagerB, originalId);
        assert(reopened.world.id === originalId, '46. Load still reopens the same document by id');
        assert(reopened.world.getBuildings()[0].getBricks().length === doc.world.getBuildings()[0].getBricks().length,
            '47. Load still restores every brick — Save/Load content fidelity is unaffected by adding Export');
        assert(reopened.metadata.title === doc.metadata.title, '48. Load still restores metadata');

        console.log('✓ G: the existing Save -> Load workflow is completely untouched — same ids, same content, same dirty-tracking behavior as before this milestone.');
    }

    // ===============================================================
    // Section H — UI wiring: Toolbar/EditorView surface the action.
    // ===============================================================
    {
        const toolbarSource = await rawSource('ui/components/Toolbar.js');
        assert(/class="toolbar-export"/.test(toolbarSource), '49. Toolbar.js renders an Export button');
        assert(/@click="\$emit\('export-document'\)"/.test(toolbarSource), '50. the Export button emits \'export-document\' — Toolbar itself performs no file I/O');
        assert(/'export-document'/.test(toolbarSource.match(/emits:\s*\[[^\]]*\]/)[0]),
            '51. \'export-document\' is declared in Toolbar\'s own emits list');

        const editorViewSource = (await Promise.all(editorViewFiles().map((file) => rawSource(file)))).join('\n');
        assert(/@export-document="exportDocument"/.test(editorViewSource), '52. EditorView.js wires Toolbar\'s export-document event to its own exportDocument() handler');
        const exportDocumentFnMatch = editorViewSource.match(/function exportDocument\(\)\s*\{[\s\S]*?\n    \}/);
        assert(exportDocumentFnMatch !== null, '53. EditorView.js defines an exportDocument() handler');
        const exportDocumentFnBody = exportDocumentFnMatch[0];
        assert(/editorSession\.exportDocument\(\)/.test(exportDocumentFnBody),
            '54. the handler calls editorSession.exportDocument() — the real application-level command, not a reimplementation');
        assert(/downloadJson\(`forkbuild-document-/.test(exportDocumentFnBody),
            '55. the handler names the downloaded file using the existing forkbuild-<kind>-<slug>.json convention, not a new extension');
        assert(!/documentManager\.document\.toJSON\(\)/.test(exportDocumentFnBody),
            '56. the handler never calls document.toJSON() itself — serialization stays inside the application layer, not the view');

        console.log('✓ H: the Export action is wired exactly where the 0.9.640 audit recommended (Toolbar.js, alongside Save/New/Recent/Publish), with Toolbar staying I/O-free and EditorView.js doing the one browser-download step by calling the real editorSession.exportDocument().');
    }

    console.log('\n✅ All 0.9.641 Editor Document Export tests passed.');
}

await run();
