import { readFile } from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
import { DocumentManager } from '../application/document/DocumentManager.js';
import { DocumentManifest } from '../application/document/DocumentManifest.js';
import { DocumentCloneService } from '../application/document/DocumentCloneService.js';
import { SaveDocumentUseCase } from '../application/document/SaveDocumentUseCase.js';
import { LoadDocumentUseCase } from '../application/document/LoadDocumentUseCase.js';
import { ExportDocumentUseCase } from '../application/document/ExportDocumentUseCase.js';
import { ImportDocumentUseCase } from '../application/document/ImportDocumentUseCase.js';
import { editorViewFiles } from './support/SourceFileGroups.js';

// Deliberately does NOT import application/editor/EditorSession.js — same reason
// tests/EditorDocumentExport.test.js gives: that class pulls in the
// renderer stack (`three`), only resolvable through tests.html's browser
// import map, not plain `node`. EditorSession.importDocument() is instead
// verified live from its own real source (Section I) exactly the way
// EditorDocumentExport.test.js's own Section B verifies exportDocument(),
// while every runtime assertion here exercises the actual
// application-level command, ImportDocumentUseCase, that method delegates
// to.

// 0.9.642 — Editor Document Import.
//
// Implements the recommendation the 0.9.640 audit's own Section L reached
// and 0.9.641 (Export) left open: Import runs exactly the audit's own
// Section F flagship pipeline — DocumentSerializer.deserialize()
// (migrate -> validate -> construct) then DocumentCloneService.execute()
// (fresh local identity) — via application/document/ImportDocumentUseCase.js, with
// no new document format, no new identity mechanism, and no new
// persistence path.
//
// THE non-negotiable identity rule, live-reproduced here exactly as the
// audit's own Section D first reproduced it: an imported document ALWAYS
// receives a fresh documentId. It never reuses the source file's own
// world.id, whatever that id happens to be — including when it collides
// with an existing local document's id, or with a reserved storage key.
//
//   Section A — valid rich document import: semantic equivalence
//   Section B — fresh identity: exported.id !== imported.id, everywhere
//   Section C — existing ID collision: import never overwrites
//   Section D — FLAGSHIP: full Export -> Import round trip, real
//               production classes, a real filesystem boundary
//   Section E — malformed inputs: fail-closed, no partial mutation
//   Section F — migration: an old-schema export still imports cleanly
//   Section G — existing, unrelated documents are never touched
//   Section H — Editor lifecycle: Import invents no new dirty-guard policy
//   Section I — structural delegation: ImportDocumentUseCase/EditorSession
//               never reimplement migrate/validate/clone
//   Section J — no persistence side effect from the use case alone
//   Section K — UI wiring: Toolbar/EditorView surface the action

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
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

function createRichDocument({ title = 'Import Test World', brickCount = 5 } = {}) {
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
    world.addGroup(new Group({ name: 'ImportGroup', brickIds: groupBrickIds }));
    return new Document({
        world,
        metadata: new DocumentMetadata({
            title,
            description: 'A document built to exercise real Import.',
            author: 'alice',
            license: new License({ id: LicenseId.CC_BY_4_0 })
        })
    });
}

async function run() {
    // ===============================================================
    // Section A — valid rich document import: semantic equivalence.
    // ===============================================================
    {
        const source = createRichDocument({ title: 'Rich Source', brickCount: 6 });
        const exportedJson = new ExportDocumentUseCase().execute(source);

        // Simulate leaving the process entirely (the eventual file).
        const fileJson = JSON.parse(JSON.stringify(exportedJson));

        const imported = new ImportDocumentUseCase().execute(fileJson);

        assert(imported instanceof Document, n('ImportDocumentUseCase.execute() returns a real Document'));
        assert(imported.world.getBuildings().length === source.world.getBuildings().length,
            n('building count survives import'));
        const sourceBricks = source.world.getBuildings()[0].getBricks();
        const importedBricks = imported.world.getBuildings()[0].getBricks();
        assert(importedBricks.length === sourceBricks.length, n('brick count survives import'));
        for (let i = 0; i < sourceBricks.length; i++) {
            assert(importedBricks[i].definitionId === sourceBricks[i].definitionId, n(`brick[${i}] definitionId survives import`));
            assert(importedBricks[i].position.x === sourceBricks[i].position.x
                && importedBricks[i].position.y === sourceBricks[i].position.y
                && importedBricks[i].position.z === sourceBricks[i].position.z, n(`brick[${i}] position survives import`));
            assert(importedBricks[i].rotation === sourceBricks[i].rotation, n(`brick[${i}] rotation survives import`));
        }
        assert(imported.world.getGroups().length === source.world.getGroups().length, n('group count survives import'));
        assert(imported.world.getGroups()[0].name === source.world.getGroups()[0].name, n('group name survives import'));
        assert(imported.world.getGroups()[0].brickIds.length === source.world.getGroups()[0].brickIds.length,
            n('group membership size survives import'));

        assert(imported.metadata.title === source.metadata.title, n('title survives import'));
        assert(imported.metadata.description === source.metadata.description, n('description survives import'));
        assert(imported.metadata.author === source.metadata.author, n('author survives import'));
        assert(imported.metadata.license.id === source.metadata.license.id, n('license survives import'));

        console.log('✓ A: ImportDocumentUseCase.execute() reconstructs a semantically equivalent Document — buildings, bricks (definitionId/position/rotation), groups, and every metadata field (title/description/author/license) survive a real export -> import cycle.');
    }

    // ===============================================================
    // Section B — fresh identity.
    // ===============================================================
    {
        const source = createRichDocument({ title: 'Identity Source' });
        const exportedJson = new ExportDocumentUseCase().execute(source);
        const imported = new ImportDocumentUseCase().execute(JSON.parse(JSON.stringify(exportedJson)));

        assert(exportedJson.world.id === source.world.id, n('the exported artifact still carries the SOURCE document\'s own id (Export mints nothing new, per 0.9.641)'));
        assert(imported.world.id !== exportedJson.world.id, n('CORE INVARIANT: the imported document receives a fresh documentId — it never equals the source/exported id'));
        assert(typeof imported.world.id === 'string' && imported.world.id.length > 0, n('the fresh documentId is itself a real, non-empty string'));

        // Every instance id is fresh too — no partial identity reuse.
        const sourceBrickIds = new Set(source.world.getBuildings()[0].getBricks().map((b) => b.id));
        const importedBrickIds = imported.world.getBuildings()[0].getBricks().map((b) => b.id);
        assert(importedBrickIds.every((id) => !sourceBrickIds.has(id)), n('every brick id is fresh — no cross-document instance id reuse'));
        const sourceBuildingId = source.world.getBuildings()[0].id;
        assert(imported.world.getBuildings()[0].id !== sourceBuildingId, n('the building id is fresh too'));

        // The 0.9.642 design decision: parentDocumentId is explicitly
        // null, never the source's own (now-foreign, locally-unresolvable)
        // world.id — see ImportDocumentUseCase's own header.
        assert(imported.metadata.parentDocumentId === null,
            n('imported.metadata.parentDocumentId is explicitly null — an imported document does not claim lineage to an id that names nothing on this device'));
        assert(imported.metadata.parentStructureId === null,
            n('imported.metadata.parentStructureId is also null — Import is not a Structure fork'));

        // Content, despite every identity being fresh, is unaffected —
        // restated from Section A as an explicit before/after pair on the
        // SAME imported instance this section's identity assertions use.
        assert(imported.world.getBuildings()[0].getBricks().length === source.world.getBuildings()[0].getBricks().length,
            n('content is fully preserved despite every identity being fresh'));

        console.log('✓ B: import mints a completely fresh local identity — documentId, every building id, every brick id — while leaving content untouched, and explicitly records no lineage to a source document that exists nowhere on this device.');
    }

    // ===============================================================
    // Section C — existing ID collision: import never overwrites.
    // ===============================================================
    {
        // C1 — the exact "Device A exports documentId=ABC, Device B
        // already has documentId=ABC" scenario from the brief, reproduced
        // literally: a REAL local document is saved, THEN a source
        // document whose own world.id equals that exact local id is
        // imported. The existing document must survive, byte-for-byte.
        const storageProvider = new InMemoryStorageProvider();
        const documentManifest = new DocumentManifest(storageProvider);

        const existingDocument = createRichDocument({ title: 'Already On This Device', brickCount: 2 });
        const existingManager = new DocumentManager(existingDocument);
        const existingId = new SaveDocumentUseCase(storageProvider, new DocumentSerializer(), documentManifest).execute(existingManager);
        assert(storageProvider.list().includes(existingId), n('a real, unrelated document is already saved locally under its own real id'));

        const collidingSource = createRichDocument({ title: 'Imported — Same Id As Existing', brickCount: 9 });
        // Force the SOURCE document's own world.id to equal the existing
        // local document's id — exactly the D123-vs-D456 collision the
        // brief names, built from a real generated id rather than a toy
        // string.
        const collidingJson = new ExportDocumentUseCase().execute(collidingSource);
        collidingJson.world.id = existingId;

        const imported = new ImportDocumentUseCase().execute(collidingJson);
        assert(imported.world.id !== existingId, n('the imported document\'s fresh id differs from the existing local document\'s id, even though the SOURCE FILE explicitly claimed that exact id'));

        // Saving the imported document must not touch the existing one.
        const importedManager = new DocumentManager(imported);
        const newId = new SaveDocumentUseCase(storageProvider, new DocumentSerializer(), documentManifest).execute(importedManager);
        assert(newId !== existingId, n('the imported document is saved under its OWN fresh id, never the existing one'));

        const reloadedExisting = new LoadDocumentUseCase(storageProvider, new DocumentSerializer(), documentManifest).execute(new DocumentManager(), existingId);
        assert(reloadedExisting.metadata.title === 'Already On This Device',
            n('CRITICAL: reloading the existing document by its original id still returns the ORIGINAL content — the import did NOT overwrite it merely because the imported JSON claimed the same id'));
        assert(reloadedExisting.world.getBuildings()[0].getBricks().length === 2,
            n('the existing document\'s own brick count is unchanged — the 9-brick imported document never landed on top of it'));

        const manifestEntries = documentManifest.list();
        assert(manifestEntries.length === 2, n('the manifest now holds exactly two independent entries — the pre-existing one and the newly imported one, never one clobbering the other'));
        assert(manifestEntries.some((e) => e.id === existingId && e.title === 'Already On This Device'), n('the existing manifest entry is intact'));
        assert(manifestEntries.some((e) => e.id === newId && e.title === 'Imported — Same Id As Existing'), n('the imported document has its own, separate manifest entry'));

        // C2 — the audit's own reproduced manifest-KEY collision (Section
        // D): a source document whose id equals DocumentManifest's own
        // RESERVED storage key. A naive "preserve the source id" Import
        // would crash SaveDocumentUseCase and permanently corrupt the
        // catalog, exactly as the audit live-proved. Confirm this
        // implementation is immune, using the manifest's own real
        // constant, not a guessed string.
        const manifestSource = await rawSource('application/document/DocumentManifest.js');
        const manifestKeyMatch = manifestSource.match(/MANIFEST_KEY = '([^']+)'/);
        assert(manifestKeyMatch !== null, n('DocumentManifest\'s own reserved storage key constant is found in its real source'));
        const manifestKey = manifestKeyMatch[1];

        const maliciousSource = createRichDocument({ title: 'Reserved Key Collision Attempt' });
        const maliciousJson = new ExportDocumentUseCase().execute(maliciousSource);
        maliciousJson.world.id = manifestKey; // the source file claims the RESERVED key as its own documentId

        const storageProviderC2 = new InMemoryStorageProvider();
        const documentManifestC2 = new DocumentManifest(storageProviderC2);
        documentManifestC2.upsert({ id: 'unrelated-doc', title: 'Untouched', modified: new Date().toISOString(), revision: 1, contentHash: 'x' });

        const importedMalicious = new ImportDocumentUseCase().execute(maliciousJson);
        assert(importedMalicious.world.id !== manifestKey, n('even when the source file itself claims the manifest\'s own reserved key as its documentId, the imported document never receives it'));

        let saveThrew = false;
        try {
            new SaveDocumentUseCase(storageProviderC2, new DocumentSerializer(), documentManifestC2).execute(new DocumentManager(importedMalicious));
        } catch (err) {
            saveThrew = true;
        }
        assert(saveThrew === false, n('saving the imported document does NOT reproduce the audit\'s own live-demonstrated manifest-corrupting crash — because Import never hands the reserved key to Save in the first place'));
        assert(documentManifestC2.list().some((e) => e.id === 'unrelated-doc'), n('the pre-existing, unrelated manifest entry survives completely untouched'));

        console.log('✓ C: importing a document whose own file claims an existing local document\'s id — including the exact reserved manifest key the 0.9.640 audit live-proved crashes a naive Save — never overwrites, corrupts, or otherwise touches that existing entry. Fresh identity is enforced regardless of what the source file itself claims.');
    }

    // ===============================================================
    // Section D — FLAGSHIP: full Export -> Import round trip.
    // ===============================================================
    {
        const storageProviderA = new InMemoryStorageProvider();
        const storageProviderB = new InMemoryStorageProvider();

        // --- Device A: create, save.
        const documentManagerA = new DocumentManager(createRichDocument({ title: 'Cross-Device Import World', brickCount: 7 }));
        const originalIdOnDeviceA = new SaveDocumentUseCase(storageProviderA).execute(documentManagerA);
        assert(storageProviderA.list().includes(originalIdOnDeviceA), n('Device A has the document saved locally'));

        // --- Export: the real production use case, nothing invented.
        const portableJson = new ExportDocumentUseCase().execute(documentManagerA.document);

        // Cross an ACTUAL filesystem boundary.
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forkbuild-import-'));
        const portableFilePath = path.join(tmpDir, 'exported-document.json');
        try {
            fs.writeFileSync(portableFilePath, JSON.stringify(portableJson));

            // --- Device B: read the file, parse (the boundary a real
            // FileReader crosses), then Import — the real production
            // use case this milestone adds.
            const fileBytes = fs.readFileSync(portableFilePath, 'utf8');
            const parsed = JSON.parse(fileBytes);

            const importedDocument = new ImportDocumentUseCase().execute(parsed);

            const documentManagerB = new DocumentManager();
            documentManagerB.newDocument(importedDocument); // in-memory only — the Editor "opening" it

            assert(storageProviderB.list().length === 0,
                n('merely importing/opening writes NOTHING to Device B\'s storage yet — identical to a brand-new, never-saved document'));

            // The user's own explicit Save persists it.
            const newIdOnDeviceB = new SaveDocumentUseCase(storageProviderB).execute(documentManagerB);

            assert(newIdOnDeviceB !== originalIdOnDeviceA, n('the imported document has a NEW documentId on Device B'));
            assert(storageProviderB.list().includes(newIdOnDeviceB) && !storageProviderB.list().includes(originalIdOnDeviceA),
                n('Device B holds the document under its OWN fresh key, never Device A\'s original id'));
            assert(storageProviderA.list().includes(originalIdOnDeviceA) && !storageProviderA.list().includes(newIdOnDeviceB),
                n('Device A\'s own storage is completely unchanged by the entire export/import/save sequence on Device B'));

            // --- Reopen on Device B, compare content.
            const reopenedOnB = new LoadDocumentUseCase(storageProviderB).execute(new DocumentManager(), newIdOnDeviceB);
            assert(reopenedOnB.metadata.title === documentManagerA.document.metadata.title, n('title survived the full round trip'));
            assert(reopenedOnB.metadata.description === documentManagerA.document.metadata.description, n('description survived the full round trip'));
            assert(reopenedOnB.metadata.license.id === documentManagerA.document.metadata.license.id, n('license survived the full round trip'));
            const originalBricks = documentManagerA.document.world.getBuildings()[0].getBricks();
            const reopenedBricks = reopenedOnB.world.getBuildings()[0].getBricks();
            assert(reopenedBricks.length === originalBricks.length, n('brick count survived the full round trip'));
            for (let i = 0; i < originalBricks.length; i++) {
                assert(reopenedBricks[i].definitionId === originalBricks[i].definitionId
                    && reopenedBricks[i].position.x === originalBricks[i].position.x
                    && reopenedBricks[i].position.y === originalBricks[i].position.y
                    && reopenedBricks[i].position.z === originalBricks[i].position.z
                    && reopenedBricks[i].rotation === originalBricks[i].rotation,
                    n(`brick[${i}]'s definitionId/position/rotation survived the full round trip`));
            }
            assert(reopenedOnB.world.getGroups().length === documentManagerA.document.world.getGroups().length,
                n('structure (groups) survived the full round trip'));
            assert(reopenedOnB.world.id !== documentManagerA.document.world.id, n('documentId correctly differs — fresh local identity'));
            assert(reopenedBricks[0].id !== originalBricks[0].id, n('instance ids correctly differ too'));
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }

        console.log('✓ D FLAGSHIP: Device A created and saved a document; Export wrote it across a REAL filesystem boundary; Device B — an independent DocumentManager/StorageProvider pair — imported it via the real ImportDocumentUseCase, opened it in-memory with zero storage writes, and only persisted it on an explicit Save, receiving a brand-new documentId. Content survived byte-for-byte; identity correctly did not. Device A\'s storage was never touched. This is the actual production Export/Import path, not a reimplementation of either side.');
    }

    // ===============================================================
    // Section E — malformed inputs: fail-closed, no partial mutation.
    // ===============================================================
    {
        const validDoc = createRichDocument().toJSON();
        const importUseCase = new ImportDocumentUseCase();

        const malformedCases = [
            { label: 'null', json: null },
            { label: 'a number', json: 42 },
            { label: 'an array', json: [] },
            { label: 'empty object', json: {} },
            { label: 'missing metadata', json: { schemaVersion: 1, world: validDoc.world } },
            { label: 'missing world', json: { schemaVersion: 1, metadata: validDoc.metadata } },
            { label: 'schemaVersion from the future', json: { ...validDoc, schemaVersion: 999 } },
            { label: 'incompatible protocol version', json: (() => {
                const clone = JSON.parse(JSON.stringify(validDoc));
                clone.metadata.protocolVersion = '99.0';
                return clone;
            })() },
            { label: 'invalid nested structure (non-numeric brick position)', json: (() => {
                const clone = JSON.parse(JSON.stringify(validDoc));
                clone.world.buildings[0].bricks[0].position = { x: 'not-a-number', y: 0, z: 0 };
                return clone;
            })() },
            { label: 'invalid nested structure (bricks as an object)', json: (() => {
                const clone = JSON.parse(JSON.stringify(validDoc));
                clone.world.buildings[0].bricks = { not: 'an array' };
                return clone;
            })() },
            { label: 'invalid nested structure (group with non-string brickIds)', json: (() => {
                const clone = JSON.parse(JSON.stringify(validDoc));
                clone.world.groups = [{ id: 'g1', name: 'X', brickIds: [123, 456] }];
                return clone;
            })() },
            { label: 'invalid identity (world.id not a string)', json: (() => {
                const clone = JSON.parse(JSON.stringify(validDoc));
                clone.world.id = 12345;
                return clone;
            })() },
            { label: 'malformed metadata (missing protocolVersion)', json: (() => {
                const clone = JSON.parse(JSON.stringify(validDoc));
                delete clone.metadata.protocolVersion;
                return clone;
            })() },
            { label: 'prototype-pollution attempt', json: JSON.parse(JSON.stringify({
                schemaVersion: 1,
                world: { id: 'w1', metadata: {}, buildings: [], __proto__: { polluted: true } },
                metadata: { title: 'X', __proto__: { polluted: true } },
                __proto__: { polluted: true }
            })) },
            { label: 'key injection (world.id equal to a reserved-looking key)', json: (() => {
                const clone = JSON.parse(JSON.stringify(validDoc));
                clone.world.id = 'forkbuild-index';
                return clone;
            })() }
        ];

        const storageProbe = new InMemoryStorageProvider();
        for (const { label, json } of malformedCases) {
            if (label === 'key injection (world.id equal to a reserved-looking key)') {
                // This one is structurally VALID (a syntactically fine
                // world.id) — Section C already proves it imports safely
                // with a fresh id rather than being rejected. Included
                // here as an explicit, named member of the adversarial
                // corpus rather than silently absent from it.
                const importedKeyInjection = importUseCase.execute(json);
                assert(importedKeyInjection.world.id !== 'forkbuild-index',
                    n(`"${label}" is accepted but never receives the injected key as its own id — fresh identity, not rejection, is the correct defense here`));
                continue;
            }
            let threw = false;
            try {
                importUseCase.execute(json);
            } catch (err) {
                threw = true;
            }
            assert(threw, n(`"${label}" causes ImportDocumentUseCase.execute() to throw rather than return a partial/best-effort Document`));
            assert(storageProbe.list().length === 0, n(`"${label}" leaves a shared storage probe untouched (Import never receives one to write to)`));
        }
        assert(({}).polluted === undefined, n('none of the prototype-pollution attempts above polluted Object.prototype'));

        // Empty/incomplete document: valid, not rejected — matches
        // Save/Load's own bar (Publish is the stricter one, separately).
        const emptyDoc = new Document({ world: new World(), metadata: new DocumentMetadata({ title: 'Empty' }) }).toJSON();
        const importedEmpty = importUseCase.execute(emptyDoc);
        assert(importedEmpty instanceof Document, n('an empty document (zero buildings) imports successfully rather than being rejected'));
        assert(importedEmpty.world.getBuildings().length === 0, n('...and correctly has zero buildings, not a fabricated default one'));

        // Structural proof: ImportDocumentUseCase can never reach a
        // StorageProvider or DocumentManifest, exactly the "structurally
        // impossible, not merely well-behaved" standard the 0.9.640 audit
        // and EditorDocumentExport.test.js both already hold Export to.
        const useCaseSource = codeOnly(await rawSource('application/document/ImportDocumentUseCase.js'));
        assert(!/storageProvider|StorageProvider|DocumentManifest/.test(useCaseSource),
            n('ImportDocumentUseCase has no reference to any StorageProvider or DocumentManifest anywhere in its own source'));
        assert(!/from ['"].*publisher\//.test(useCaseSource) && !/from ['"].*\bdiscovery\//.test(useCaseSource)
            && !/from ['"].*\bnostr\//.test(useCaseSource) && !/from ['"].*\barweave\//.test(useCaseSource),
            n('ImportDocumentUseCase imports nothing from publisher/, discovery/, nostr/, or arweave/'));

        console.log(`✓ E: every malformed/adversarial case in the corpus (invalid JSON root shapes, missing metadata/world, a future schemaVersion, an incompatible protocol version, malformed nested brick/group data, an invalid identity type, malformed metadata, a prototype-pollution attempt, and reserved-key injection) is handled correctly — rejected before construction where it should be, or accepted-but-reidentified where fresh identity is the correct defense — and NEVER causes a storage write or a mutated Object.prototype. An empty document imports successfully, matching Save/Load's own validation bar.`);
    }

    // ===============================================================
    // Section F — migration: an old-schema export still imports cleanly.
    // ===============================================================
    {
        const legacy = createRichDocument({ title: 'Pre-0.2.0 Export' }).toJSON();
        delete legacy.schemaVersion; // simulates a document exported by an older engine version

        const migratedStandalone = DocumentSchemaMigrator.migrate(JSON.parse(JSON.stringify(legacy)));
        assert(migratedStandalone.schemaVersion === DOCUMENT_SCHEMA_VERSION,
            n('sanity check: DocumentSchemaMigrator itself still migrates a legacy envelope to the current schema'));

        const importedLegacy = new ImportDocumentUseCase().execute(legacy);
        assert(importedLegacy instanceof Document, n('a legacy (pre-schemaVersion) export imports successfully end to end, not just at the standalone migrator step'));
        assert(importedLegacy.metadata.title === 'Pre-0.2.0 Export', n('...with its content intact'));
        assert(new ExportDocumentUseCase().execute(importedLegacy).schemaVersion === DOCUMENT_SCHEMA_VERSION,
            n('...and re-exporting the imported document now carries the CURRENT schemaVersion — the migration genuinely happened, not merely tolerated'));

        // Structural proof: Import invents no second migration mechanism
        // of its own — DocumentSchemaMigrator remains the only one.
        const useCaseSource = codeOnly(await rawSource('application/document/ImportDocumentUseCase.js'));
        assert(!/DocumentSchemaMigrator/.test(useCaseSource),
            n('ImportDocumentUseCase never references DocumentSchemaMigrator directly — it inherits migration for free from DocumentSerializer.deserialize(), exactly like every other caller of that method'));

        console.log('✓ F: an old-schema export migrates cleanly through Import, using only the existing DocumentSchemaMigrator machinery already wired inside DocumentSerializer.deserialize() — no second migration mechanism was created for this milestone.');
    }

    // ===============================================================
    // Section G — existing, unrelated documents are never touched.
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const documentManifest = new DocumentManifest(storageProvider);

        const unrelatedIds = [];
        const unrelatedSnapshots = [];
        for (let i = 0; i < 3; i++) {
            const doc = createRichDocument({ title: `Unrelated Document ${i}`, brickCount: i + 1 });
            const manager = new DocumentManager(doc);
            const id = new SaveDocumentUseCase(storageProvider, new DocumentSerializer(), documentManifest).execute(manager);
            unrelatedIds.push(id);
            unrelatedSnapshots.push(JSON.stringify(storageProvider.load(id)));
        }
        const manifestBefore = JSON.stringify(documentManifest.list().slice().sort((a, b) => a.id.localeCompare(b.id)));

        const source = createRichDocument({ title: 'The One Being Imported', brickCount: 4 });
        const importedDocument = new ImportDocumentUseCase().execute(new ExportDocumentUseCase().execute(source));
        new SaveDocumentUseCase(storageProvider, new DocumentSerializer(), documentManifest).execute(new DocumentManager(importedDocument));

        for (let i = 0; i < unrelatedIds.length; i++) {
            assert(JSON.stringify(storageProvider.load(unrelatedIds[i])) === unrelatedSnapshots[i],
                n(`unrelated document ${i}'s own stored content is byte-for-byte unchanged after importing and saving a completely different document`));
        }
        const manifestAfterUnrelatedOnly = documentManifest.list().filter((e) => unrelatedIds.includes(e.id));
        assert(JSON.stringify(manifestAfterUnrelatedOnly.slice().sort((a, b) => a.id.localeCompare(b.id))) === manifestBefore,
            n('every pre-existing manifest entry for the unrelated documents is unchanged — same title, modified, revision, contentHash'));
        assert(documentManifest.list().length === unrelatedIds.length + 1,
            n('the manifest gained exactly ONE new entry — the imported document\'s own — nothing else moved'));

        console.log('✓ G: importing and saving a document leaves every other, unrelated document — and its own manifest entry — completely untouched.');
    }

    // ===============================================================
    // Section H — Editor lifecycle: no invented dirty-guard policy.
    // ===============================================================
    {
        // This milestone deliberately does not invent an auto-save or
        // confirmation policy for "you have unsaved changes, import
        // anyway?" — it reuses whatever the existing Editor lifecycle
        // already does for New/Load/Fork, which today is: proceed
        // immediately, no confirmation. Verified structurally, from real
        // source, on both sides of that claim.
        const toolbarSource = codeOnly(await rawSource('ui/components/Toolbar.js'));
        assert(!/confirm\(/.test(toolbarSource), n('Toolbar.js\'s own New/Load actions carry no confirm()-based dirty guard today — the existing baseline this milestone must not silently diverge from'));

        const editorSessionSource = codeOnly(await rawSource('application/editor/EditorSession.js'));
        const importDocumentFnMatch = editorSessionSource.match(/importDocument\(json\)\s*\{[\s\S]*?\n {4}\}/);
        assert(importDocumentFnMatch !== null, n('EditorSession#importDocument() is found in its own real source'));
        const importDocumentFnBody = importDocumentFnMatch[0];
        assert(!/confirm\(|window\.confirm/.test(importDocumentFnBody),
            n('EditorSession#importDocument() introduces no confirm()-based dirty guard of its own — Import follows the SAME lifecycle semantics New/Load/Fork already use, rather than inventing a new policy in this one call path'));
        assert(/this\.openDocument\(importedDocument\)/.test(importDocumentFnBody),
            n('importDocument() hands off to openDocument() — the exact same entry point forkStructure() already uses to bring a freshly-constructed Document into the session'));

        // openDocument()'s own, pre-existing behavior: DocumentManager.newDocument()
        // resets DocumentState to a clean baseline — no separate "was the
        // previous document dirty" branch exists there either, confirmed
        // live rather than merely from source text.
        const managerBefore = new DocumentManager(createRichDocument());
        managerBefore.markDirty();
        assert(managerBefore.state.dirty === true, n('setup: a document can genuinely be dirty before a New/Load/Fork/Import-shaped transition'));
        managerBefore.newDocument(createRichDocument({ title: 'Replacement' }));
        assert(managerBefore.state.dirty === false, n('DocumentManager.newDocument() — the same call openDocument() makes for Import, exactly as it already does for Fork/New — resets dirty state unconditionally; Import does not need to, and does not, add a new rule here'));

        console.log('✓ H: Import invents no new dirty-guard or confirmation policy — it reuses the exact same openDocument()/DocumentManager.newDocument() lifecycle New, Load, and Fork already use today, live-confirmed rather than assumed.');
    }

    // ===============================================================
    // Section I — structural delegation: no reimplementation.
    // ===============================================================
    {
        let deserializeCalls = 0;
        let cloneCalls = 0;
        class SpySerializer extends DocumentSerializer {
            deserialize(json, eventBus) {
                deserializeCalls += 1;
                return super.deserialize(json, eventBus);
            }
        }
        class SpyCloneService extends DocumentCloneService {
            execute(sourceDocument, options) {
                cloneCalls += 1;
                return super.execute(sourceDocument, options);
            }
        }
        const source = createRichDocument({ title: 'Spy Test' });
        const json = new ExportDocumentUseCase().execute(source);
        const useCase = new ImportDocumentUseCase(new SpySerializer(), new SpyCloneService());
        const result = useCase.execute(json);

        assert(deserializeCalls === 1, n('ImportDocumentUseCase.execute() calls DocumentSerializer.deserialize() exactly once'));
        assert(cloneCalls === 1, n('ImportDocumentUseCase.execute() calls DocumentCloneService.execute() exactly once'));
        assert(result instanceof Document, n('...and the result is a real Document produced by that real pipeline'));

        const useCaseSource = codeOnly(await rawSource('application/document/ImportDocumentUseCase.js'));
        assert(/this\._documentSerializer\.deserialize\(json\)/.test(useCaseSource),
            n('ImportDocumentUseCase\'s own source calls documentSerializer.deserialize() — the real seam, not a re-derived shortcut'));
        assert(/this\._documentCloneService\.execute\(sourceDocument/.test(useCaseSource),
            n('...and documentCloneService.execute() — the real identity mechanism, not a hand-rolled id generator'));
        assert(/new DocumentSerializer\(\)/.test(useCaseSource) && /new DocumentCloneService\(\)/.test(useCaseSource),
            n('ImportDocumentUseCase defaults to the REAL, production DocumentSerializer and DocumentCloneService, not stubs'));
        assert(!/Document\.fromJSON|new World\(|createId\(/.test(useCaseSource),
            n('ImportDocumentUseCase never constructs a Document/World or mints an id directly — every domain object it returns came from the injected collaborators'));

        // EditorSession.importDocument() delegates rather than reimplementing.
        const editorSessionSource = codeOnly(await rawSource('application/editor/EditorSession.js'));
        assert(/importDocument\(json\)\s*\{[\s\S]*?this\._importDocumentUseCase\.execute\(json\)/.test(editorSessionSource),
            n('EditorSession.importDocument() delegates straight to this._importDocumentUseCase.execute() — it does not deserialize or clone anything itself'));
        assert(!/this\._loadDocumentUseCase\.execute\(this\._documentManager, json/.test(editorSessionSource),
            n('EditorSession.importDocument() never routes an imported file through loadDocumentUseCase/storage — Load and Import remain two structurally separate paths'));

        console.log('✓ I: Import calls the real DocumentSerializer.deserialize() and DocumentCloneService.execute() exactly once each — proven live by spying — and ImportDocumentUseCase/EditorSession are both structurally confirmed to delegate rather than reimplement deserialization, migration, validation, or identity minting.');
    }

    // ===============================================================
    // Section J — no persistence side effect from the use case alone.
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const documentManifest = new DocumentManifest(storageProvider);
        const source = createRichDocument({ title: 'Construction Only' });
        const json = new ExportDocumentUseCase().execute(source);
        const importUseCase = new ImportDocumentUseCase();

        importUseCase.execute(JSON.parse(JSON.stringify(json)));
        importUseCase.execute(JSON.parse(JSON.stringify(json)));
        importUseCase.execute(JSON.parse(JSON.stringify(json)));

        assert(storageProvider.list().length === 0, n('ImportDocumentUseCase.execute() alone never writes to storage — not even once, across multiple calls'));
        assert(documentManifest.list().length === 0, n('...and never creates a manifest entry — persistence only happens through the user\'s own, later, explicit Save'));

        console.log('✓ J: ImportDocumentUseCase is pure construction — parse/migrate/validate/clone in, a Document out, zero storage or manifest side effects, exactly mirroring ExportDocumentUseCase\'s own observational posture on the other side of the round trip.');
    }

    // ===============================================================
    // Section K — UI wiring: Toolbar/EditorView surface the action.
    // ===============================================================
    {
        const toolbarSource = await rawSource('ui/components/Toolbar.js');
        assert(/class="toolbar-import"/.test(toolbarSource), n('Toolbar.js renders an Import button'));
        assert(/type="file"/.test(toolbarSource) && /toolbar-import-input/.test(toolbarSource),
            n('Toolbar.js owns a hidden native file input for Import — the same shape BuildLibraryPanel.js\'s own "Import Blueprint" already established'));
        assert(/'import-document'/.test(toolbarSource.match(/emits:\s*\[[^\]]*\]/)[0]),
            n('\'import-document\' is declared in Toolbar\'s own emits list'));
        assert(/emit\('import-document', String\(reader\.result/.test(toolbarSource),
            n('Toolbar emits the raw file text it read — it never parses JSON or calls editorSession.importDocument() itself'));

        const editorViewSource = (await Promise.all(editorViewFiles().map((file) => rawSource(file)))).join('\n');
        assert(/@import-document="importDocument"/.test(editorViewSource), n('EditorView.js wires Toolbar\'s import-document event to its own importDocument() handler'));
        const importDocumentFnMatch = editorViewSource.match(/function importDocument\(rawText\)\s*\{[\s\S]*?\n    \}/);
        assert(importDocumentFnMatch !== null, n('EditorView.js defines an importDocument(rawText) handler'));
        const importDocumentFnBody = importDocumentFnMatch[0];
        assert(/JSON\.parse\(rawText\)/.test(importDocumentFnBody), n('the handler parses the raw file text itself — Toolbar never does'));
        assert(/editorSession\.importDocument\(json\)/.test(importDocumentFnBody),
            n('the handler calls editorSession.importDocument() — the real application-level command, not a reimplementation'));
        assert(!/documentManager\.newDocument\(|storageProvider\.|Document\.fromJSON/.test(importDocumentFnBody),
            n('the handler never touches DocumentManager, a StorageProvider, or Document.fromJSON directly — that all stays inside the application layer'));

        console.log('✓ K: the Import action is wired exactly where the 0.9.640 audit recommended (Toolbar.js, right beside Export), with Toolbar owning only the native file picker and EditorView.js doing the one JSON.parse + editorSession.importDocument() step.');
    }

    console.log(`\n✅ All 0.9.642 Editor Document Import tests passed (${assertionCount} assertions).`);
}

await run();
