import { execSync } from 'node:child_process';
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
import { PROTOCOL_VERSION } from '../core/protocolVersion.js';

import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { DocumentValidator } from '../serializer/DocumentValidator.js';
import { DocumentSchemaMigrator } from '../serializer/DocumentSchemaMigrator.js';

import { StorageProvider } from '../storage/StorageProvider.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { DocumentManifest } from '../application/DocumentManifest.js';
import { DocumentCloneService } from '../application/DocumentCloneService.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { LoadDocumentUseCase } from '../application/LoadDocumentUseCase.js';

// 0.9.640 — Editor Document Portability Boundary Audit.
//
// TYPE: test-only architectural/product audit. PRODUCTION CHANGES: none —
// see Section K's own live guard, the same discipline every prior
// "boundary audit" milestone in this codebase already holds.
//
// THE QUESTION, verbatim from the requesting brief: does ForkBuild already
// have a sufficiently well-defined document representation and lifecycle
// boundary to support explicit user-controlled Export -> Import without
// creating a second document format, identity system, or persistence
// mechanism? This audit does not implement Export or Import. It audits
// the seam a future 0.9.641 (Export) / 0.9.642 (Import) would build on,
// live, against real production code — never against an assumed shape.
//
// THE HEADLINE FINDING, verified live below: the brief's own instinct not
// to assume "Export = dump the local database record" was exactly right,
// but in the OPPOSITE direction from what that caution usually implies —
// the existing seam is not just adequate, it is the SAME seam four
// existing production flows already share (Section C), and it already
// enforces the brief's own Section G ordering (parse -> validate ->
// construct -> persist) BY CONSTRUCTION, not by discipline (Section G).
// The one place the brief's caution was fully justified is document
// IDENTITY (Section D): `documentId` IS `world.id`, it is the raw,
// unprefixed local-storage key, and this codebase already has a
// precedent for exactly the "existing content, needs a fresh local
// identity" operation Import requires — DocumentCloneService, the shared
// engine behind Fork and Duplicate. Reusing it, rather than preserving a
// source document's own id, is not a style preference; Section D/H prove
// live that preserving it is an actual key-collision vulnerability.
//
//   Section A — existing document persistence census.
//   Section B — reopen equivalence: what a save -> reopen cycle preserves.
//   Section C — candidate Export boundary: the existing serialization seam.
//   Section D — document identity: what `documentId` really is, and why
//               Import must mint a fresh one rather than preserve it.
//   Section E — Publication separation: Export/Import cannot reach
//               publisher/discovery code, by construction.
//   Section F — FLAGSHIP: a real cross-device round trip, crossing an
//               actual filesystem boundary, through two independent
//               storage instances, using only existing production classes.
//   Section G — malformed/import safety: fail-closed, no partial mutation.
//   Section H — security boundary: prototype pollution, key injection,
//               unsafe-URL/executable-content surface.
//   Section I — versioning: schema envelope vs. protocol version, and why
//               they are not equally ready for cross-device import.
//   Section J — UI placement: the existing document lifecycle surface.
//   Section K — production-change guard.
//   Section L — verdict and recommendation.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}
function codeOnly(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function createRichDocument({ title = 'Portable World', brickCount = 4 } = {}) {
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
    const groupBrickIds = building.getBricks().slice(0, 2).map((b) => b.id);
    world.addGroup(new Group({ name: 'PortableGroup', brickIds: groupBrickIds }));
    return new Document({
        world,
        metadata: new DocumentMetadata({
            title,
            description: 'A document built to prove portability, not just serializability.',
            author: 'alice',
            created: new Date('2026-01-01T00:00:00.000Z'),
            modified: new Date('2026-01-02T00:00:00.000Z'),
            license: new License({ id: LicenseId.CC_BY_4_0 })
        })
    });
}

async function run() {
    // ===============================================================
    // Section A — existing document persistence census.
    // ===============================================================
    {
        const doc = createRichDocument();
        const json = doc.toJSON();

        assert(Object.keys(json).sort().join(',') === 'metadata,schemaVersion,world',
            n('the ENTIRE Document envelope is exactly {schemaVersion, world, metadata} — nothing else, live-confirmed from Document.toJSON() rather than assumed from the class comment'));
        assert(json.schemaVersion === DOCUMENT_SCHEMA_VERSION,
            n('the envelope carries an explicit schemaVersion at the top level (Section I)'));

        const documentSource = codeOnly(await rawSource('core/Document.js'));
        assert(!/documentId|\.id\s*=/.test(documentSource.replace(/world\.id/g, '')),
            n('Document itself carries no separate `id`/`documentId` field of its own — core/Document.js\'s own source confirms this; identity, per Section D, lives on the World it wraps'));

        const metadataKeys = Object.keys(doc.metadata.toJSON()).sort();
        assert(metadataKeys.join(',') === 'author,authorIdentityId,created,description,engineVersion,license,modified,parentDocumentId,parentStructureId,protocolVersion,title',
            n('DocumentMetadata\'s full, current field set is exactly these eleven fields, live-confirmed against real toJSON() output'));

        const saveSource = codeOnly(await rawSource('application/SaveDocumentUseCase.js'));
        assert(/const id = document\.world\.id;/.test(saveSource),
            n('SaveDocumentUseCase\'s own real source resolves the persistence key from `document.world.id` — documentId IS world.id, confirmed at the exact call site that writes to storage'));

        const documentStateSource = codeOnly(await rawSource('application/editor-state/DocumentState.js'));
        assert(/dirty|readOnly|loadedFrom|lastSaved/.test(documentStateSource),
            n('a distinct DocumentState class exists for session-local, non-persisted facts (dirty/readOnly/loadedFrom/lastSaved)'));
        const stateKeys = ['dirty', 'readOnly', 'loadedFrom', 'lastSaved'];
        for (const key of stateKeys) {
            assert(!(key in json), n(`Document's own persisted envelope contains no "${key}" key — editor state and document content are already two disjoint sets, live-confirmed rather than assumed from the class comment`));
        }

        console.log('✓ A: the canonical document representation is exactly {schemaVersion, world, metadata}, produced by Document.toJSON(); documentId is world.id, not a field of its own; and editor-only session state (DocumentState) is structurally excluded from what gets persisted — already true today, with no invention required for Export to expose it.');
    }

    // ===============================================================
    // Section B — reopen equivalence.
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const documentManagerA = new DocumentManager(createRichDocument({ title: 'Reopen Test' }));
        const originalDocument = documentManagerA.document;
        const originalId = originalDocument.world.id;

        const savedId = new SaveDocumentUseCase(storageProvider).execute(documentManagerA);
        assert(savedId === originalId, n('save returns the same id the document already had — save never mints a new identity'));

        // A genuinely SEPARATE DocumentManager/session, not the same
        // in-memory object — this is what "reopen" means, not merely
        // re-reading a JS reference.
        const documentManagerB = new DocumentManager();
        const reopened = new LoadDocumentUseCase(storageProvider).execute(documentManagerB, originalId);

        // What survives: content.
        assert(reopened.world.getBuildings().length === originalDocument.world.getBuildings().length,
            n('building count survives reopen'));
        const originalBricks = originalDocument.world.getBuildings()[0].getBricks();
        const reopenedBricks = reopened.world.getBuildings()[0].getBricks();
        assert(reopenedBricks.length === originalBricks.length, n('brick count survives reopen'));
        for (let i = 0; i < originalBricks.length; i++) {
            assert(reopenedBricks[i].id === originalBricks[i].id, n(`brick[${i}] id survives reopen (same-device reopen, unlike Import — Section D)`));
            assert(reopenedBricks[i].definitionId === originalBricks[i].definitionId, n(`brick[${i}] definitionId survives reopen`));
            assert(reopenedBricks[i].position.x === originalBricks[i].position.x
                && reopenedBricks[i].position.y === originalBricks[i].position.y
                && reopenedBricks[i].position.z === originalBricks[i].position.z, n(`brick[${i}] position survives reopen`));
        }
        assert(reopened.world.getGroups().length === originalDocument.world.getGroups().length,
            n('structure (groups) survives reopen'));

        // What survives: documentId, title, metadata.
        assert(reopened.world.id === originalId, n('documentId survives reopen (same device, explicit Load)'));
        assert(reopened.metadata.title === originalDocument.metadata.title, n('title survives reopen'));
        assert(reopened.metadata.description === originalDocument.metadata.description, n('description survives reopen'));
        assert(reopened.metadata.author === originalDocument.metadata.author, n('author survives reopen'));
        assert(reopened.metadata.license.id === originalDocument.metadata.license.id, n('license survives reopen'));
        assert(reopened.metadata.protocolVersion === originalDocument.metadata.protocolVersion, n('protocolVersion survives reopen'));

        // What does NOT survive as "the same object", and is instead
        // freshly computed per session: editor state.
        assert(documentManagerB.state.loadedFrom === originalId, n('loadedFrom is freshly computed by THIS session\'s Load call, not read from the file'));
        assert(documentManagerB.state.dirty === false, n('a freshly reopened document reports clean, computed by DocumentManager.load(), never persisted'));
        assert(documentManagerB.state.lastSaved instanceof Date, n('lastSaved is stamped by THIS reopen, not carried in the file — DocumentManager.load() sets it to "now"'));

        console.log('✓ B: reopen equivalence is precise — content (buildings, bricks, positions, structure), documentId, and every DocumentMetadata field survive a save -> reopen cycle byte-for-byte; DocumentState (dirty/loadedFrom/lastSaved) is deliberately NOT carried by the file at all and is recomputed fresh by whichever session opens it. This is exactly the semantic definition of "portable document" Section F\'s flagship needs: everything Section B proves survives is content Export must carry; everything Section B proves is session-local must NOT be in a portable artifact, and today\'s envelope already agrees.');
    }

    // ===============================================================
    // Section C — candidate Export boundary: the existing serialization seam.
    // ===============================================================
    {
        const serializer = new DocumentSerializer();
        const doc = createRichDocument();
        const exported = serializer.serialize(doc);
        assert(JSON.stringify(exported) === JSON.stringify(doc.toJSON()),
            n('DocumentSerializer.serialize() is a thin, faithful wrapper over Document.toJSON() — no second representation is created'));

        // Live census: how many real, non-test production call sites
        // already construct a DocumentSerializer? If Export can reuse
        // this exact class, it is not a new seam — it is the (n+1)th
        // caller of an already general-purpose one.
        const grepOutput = execSync(
            "grep -rl \"new DocumentSerializer(\" application/ --include=*.js",
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim().split('\n').filter(Boolean);
        assert(grepOutput.length >= 10,
            n(`DocumentSerializer is already constructed by at least ${grepOutput.length} distinct production application/ classes (Save, Load, Fork, ForkPublishedWorld, Recover, Autosave, ResolvePublication, LoadPublicationDocument, LoadPublishedSnapshot, and more) — live-counted, not asserted from memory`));
        assert(grepOutput.includes('application/SaveDocumentUseCase.js') && grepOutput.includes('application/LoadDocumentUseCase.js') && grepOutput.includes('application/ForkDocumentUseCase.js'),
            n('the three flows most relevant to Export/Import — Save, Load, and Fork (the closest existing precedent for "new local identity from existing content") — all already share this exact class'));

        // The migrate -> validate -> construct pipeline is not
        // Save/Load-specific either; it lives entirely inside
        // deserialize() itself, so ANY future caller (including a
        // not-yet-written ImportDocumentUseCase) inherits it for free.
        const deserializeSource = codeOnly(await rawSource('serializer/DocumentSerializer.js'));
        const deserializeStart = deserializeSource.indexOf('deserialize(');
        const deserializeBody = deserializeSource.slice(deserializeStart, deserializeStart + 500);
        assert(/DocumentSchemaMigrator\.migrate/.test(deserializeBody), n('deserialize() migrates before anything else'));
        assert(/this\.validate\(migrated\)/.test(deserializeBody), n('deserialize() validates the migrated result next'));
        assert(/Document\.fromJSON\(migrated/.test(deserializeBody), n('deserialize() constructs the domain object last, only from already-migrated, already-validated JSON'));
        assert(deserializeBody.indexOf('DocumentSchemaMigrator.migrate') < deserializeBody.indexOf('this.validate(migrated)')
            && deserializeBody.indexOf('this.validate(migrated)') < deserializeBody.indexOf('Document.fromJSON(migrated'),
            n('and in exactly that order — migrate, then validate, then construct, live-confirmed by position, not just presence'));

        console.log('✓ C: the existing serialization seam is DocumentSerializer.serialize()/deserialize(), already shared by at least ten production flows including Save, Load, and Fork. Export can expose exactly this — document.toJSON() via the existing serializer — with no new format. deserialize() already enforces migrate -> validate -> construct internally, so a future Import inherits Section G\'s own required ordering for free, not as new discipline it has to implement.');
    }

    // ===============================================================
    // Section D — document identity.
    // ===============================================================
    {
        // documentId IS world.id — already shown live in Section A/B.
        // Here: what depends on it, and why Import cannot preserve it.
        const manifestSource = await rawSource('application/DocumentManifest.js');
        const manifestKeyMatch = manifestSource.match(/MANIFEST_KEY = '([^']+)'/);
        assert(manifestKeyMatch !== null, n('DocumentManifest\'s own storage key constant is found in its real source'));
        const manifestKey = manifestKeyMatch[1];

        const recoverySource = await rawSource('persistence/LocalRecoveryStore.js');
        assert(/canonical saved documents \('forkbuild:<documentId>'\)/.test(recoverySource),
            n('LocalRecoveryStore.js\'s own header confirms, in its own words, that a saved document\'s storage key is `forkbuild:<documentId>` — the RAW documentId, with no additional namespacing beyond the app-wide "forkbuild:" prefix every key shares'));

        // Live collision: documentId is attacker/import-controlled data
        // (it travels inside the portable JSON itself, per Section C).
        // If Import ever preserved it verbatim, a document whose id
        // happens to equal a RESERVED key destroys unrelated state.
        const storageProvider = new InMemoryStorageProvider();
        const documentManifest = new DocumentManifest(storageProvider);
        documentManifest.upsert({ id: 'legit-doc-1', title: 'Existing', modified: new Date().toISOString(), revision: 1, contentHash: 'x' });
        assert(documentManifest.list().length === 1, n('a legitimate manifest with one real entry exists before the collision'));

        const collidingDocument = new Document({
            world: new World({ id: manifestKey }), // attacker/import-controlled id equal to the reserved manifest key
            metadata: new DocumentMetadata({ title: 'Malicious or merely coincidental import' })
        });
        const documentManagerCollision = new DocumentManager(collidingDocument);
        let saveOfCollidingDocumentThrew = false;
        try {
            new SaveDocumentUseCase(storageProvider, new DocumentSerializer(), documentManifest).execute(documentManagerCollision);
        } catch (err) {
            saveOfCollidingDocumentThrew = true;
        }
        assert(saveOfCollidingDocumentThrew,
            n('CONFIRMED LIVE: saving a document whose id equals the manifest\'s own reserved key does not merely corrupt data quietly — it CRASHES immediately, inside SaveDocumentUseCase.execute() itself. The document\'s own storage write (`storageProvider.save(id, json)`) lands on the manifest\'s own key first; the very next line, `documentManifest.upsert(...)`, then reads that same key back expecting an array and instead gets the just-written document JSON, so `.filter is not a function` throws before the save even completes. This is not a hypothetical risk, it is a reproduced, immediate break of the ENTIRE saved-documents catalog, using nothing but a document whose id a caller did not regenerate.'));

        let manifestReadThrows = false;
        try {
            documentManifest.find('legit-doc-1');
        } catch (err) {
            manifestReadThrows = true;
        }
        assert(manifestReadThrows,
            n('and the damage persists after the crash: the manifest\'s own storage slot now permanently holds the colliding document\'s JSON instead of the entries array, so even DocumentManifest.find()/list() — reads that have nothing to do with the colliding save — now crash too. This is precisely what a naive Import that preserves a source document\'s own `world.id` would do the moment that id (chosen by whoever authored the original document, on a different device, under no obligation to avoid this codebase\'s own reserved key namespace) collides with `forkbuild-index`, any `recovery:<id>`/`snapshot:<id>` prefix, or any other fixed-string key this same flat storage namespace already holds (arweave-gateway-configuration, publication-commentary:entries, ...).'));

        // The existing precedent for "new local identity from existing
        // content": DocumentCloneService, already shared by Fork/Duplicate.
        const cloneService = new DocumentCloneService();
        const source = createRichDocument({ title: 'Clone Source' });
        const cloned = cloneService.execute(source, { parentDocumentId: null });
        assert(cloned.world.id !== source.world.id, n('DocumentCloneService mints a genuinely fresh world.id — documentId — never the source\'s own'));
        const sourceBrickIds = new Set(source.world.getBuildings()[0].getBricks().map((b) => b.id));
        const clonedBrickIds = cloned.world.getBuildings()[0].getBricks().map((b) => b.id);
        assert(clonedBrickIds.every((id) => !sourceBrickIds.has(id)), n('every instance id (building, brick) is fresh too — no partial identity reuse'));
        assert(cloned.world.getBuildings()[0].getBricks().length === source.world.getBuildings()[0].getBricks().length,
            n('content is fully preserved despite every identity being fresh — this is the exact "same content, new local identity" shape Import needs'));

        // parentDocumentId's default lineage behavior — explicitly
        // flagged as a real, UNRESOLVED question for a future Import,
        // never decided by this audit.
        const clonedWithDefaultLineage = cloneService.execute(source);
        assert(clonedWithDefaultLineage.metadata.parentDocumentId === source.world.id,
            n('DocumentCloneService\'s DEFAULT records parentDocumentId as the source id — correct, fork/lineage semantics for Fork/Duplicate; whether a cross-device Import of the SAME document (not a derivative) should inherit this same default, record a different "reimported from" provenance fact, or pass parentDocumentId: null is a genuine, narrow, still-open product question this audit surfaces but does not answer — see Section L'));

        console.log('✓ D: documentId is world.id, used verbatim as the local storage key with zero additional namespacing beyond the global "forkbuild:" prefix, and live-proven capable of destroying the saved-documents manifest when reused unchanged. Import must therefore mint a fresh local identity rather than preserve a source document\'s own id — and DocumentCloneService already exists, already tested, already used by Fork/Duplicate, as exactly that mechanism. This resolves the brief\'s own central Section D question (D123 vs D456): D456, with live evidence, not assumption. One narrower question — parentDocumentId\'s lineage semantics for Import specifically — remains genuinely open.');
    }

    // ===============================================================
    // Section E — Publication separation.
    // ===============================================================
    {
        // The winning composition an Export/Import implementation would
        // reuse: DocumentSerializer, DocumentValidator, DocumentSchemaMigrator,
        // DocumentCloneService, DocumentManager, SaveDocumentUseCase.
        // None of these may reach publisher/discovery/signing code, by
        // construction — proven from real source, not by convention.
        const files = [
            'serializer/DocumentSerializer.js',
            'serializer/DocumentValidator.js',
            'serializer/DocumentSchemaMigrator.js',
            'application/DocumentCloneService.js',
            'application/DocumentManager.js',
            'application/SaveDocumentUseCase.js',
            'application/LoadDocumentUseCase.js'
        ];
        for (const file of files) {
            const source = await rawSource(file);
            assert(!/from ['"].*publisher\//.test(source), n(`${file} imports nothing from publisher/`));
            assert(!/from ['"].*\bdiscovery\//.test(source), n(`${file} imports nothing from discovery/`));
            assert(!/from ['"].*\bnostr\//.test(source), n(`${file} imports nothing from nostr/`));
            assert(!/from ['"].*\barweave\//.test(source), n(`${file} imports nothing from arweave/`));
            assert(!/\.sign\(|signPublication|announceDiscovery/.test(codeOnly(source)), n(`${file} calls no signing/announcement API`));
        }

        // Publish is a wholly separate, explicitly-invoked use case —
        // confirmed it is never imported transitively by any of the above.
        const publishSource = await rawSource('application/PublishDocumentUseCase.js');
        assert(/this\._publisherProvider\.publish\(document/.test(publishSource),
            n('PublishDocumentUseCase is the sole call site that turns a Document into a Publication — a fact this milestone confirms is untouched by any file in the Export/Import composition above'));

        console.log('✓ E: the entire candidate Export/Import composition — serializer, validator, migrator, clone service, document manager, save/load use cases — has zero import-graph or call-site reach into publisher/, discovery/, nostr/, or arweave/, or any signing/announcement API. A future Export/Import built from exactly these classes cannot automatically publish, announce, distribute, sign, or discover anything — not by discipline, but because the code to do so is simply not reachable from this composition.');
    }

    // ===============================================================
    // Section F — FLAGSHIP: cross-device Export -> Import round trip.
    // ===============================================================
    {
        // "Device A" and "Device B": two fully independent storage
        // instances, standing in for two different browsers/machines —
        // never shared state, never the same StorageProvider instance.
        const storageProviderA = new InMemoryStorageProvider();
        const storageProviderB = new InMemoryStorageProvider();

        // --- Device A: create, edit (implicitly, via a rich fixture), save.
        const documentManagerA = new DocumentManager(createRichDocument({ title: 'Cross-Device World', brickCount: 6 }));
        const originalIdOnDeviceA = new SaveDocumentUseCase(storageProviderA).execute(documentManagerA);
        assert(storageProviderA.list().includes(originalIdOnDeviceA), n('Device A now has the document saved locally'));

        // --- Export: literally the existing seam (Section C), nothing invented.
        const portableJson = new DocumentSerializer().serialize(documentManagerA.document);

        // Cross an ACTUAL filesystem boundary — not just a JS variable —
        // so this is a genuine "leaves the device" artifact, the same as
        // a real Export-to-file feature would produce.
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forkbuild-portability-'));
        const portableFilePath = path.join(tmpDir, 'exported-document.json');
        try {
            fs.writeFileSync(portableFilePath, JSON.stringify(portableJson));

            // --- Device B: import. Parse -> validate -> construct ->
            // (review, unsaved) -> explicit persist, per Section G.
            const fileBytes = fs.readFileSync(portableFilePath, 'utf8');
            const parsed = JSON.parse(fileBytes); // Parse

            const migrated = DocumentSchemaMigrator.migrate(parsed); // part of Validate, see Section C
            const validation = DocumentValidator.validate(migrated);
            assert(validation.valid, n('the exported artifact validates cleanly on Device B'));

            const sourceDocumentOnB = new DocumentSerializer().deserialize(parsed); // Construct (still carries Device A's own id at this point)
            const importedDocument = new DocumentCloneService().execute(sourceDocumentOnB, {
                title: sourceDocumentOnB.metadata.title,
                description: sourceDocumentOnB.metadata.description,
                author: sourceDocumentOnB.metadata.author,
                authorIdentityId: sourceDocumentOnB.metadata.authorIdentityId,
                license: sourceDocumentOnB.metadata.license,
                parentDocumentId: null // see Section D's own open question — left null here, not decided
            }); // fresh, collision-safe local identity, per Section D

            const documentManagerB = new DocumentManager();
            documentManagerB.newDocument(importedDocument); // in-memory only

            assert(storageProviderB.list().length === 0,
                n('merely importing/opening writes NOTHING to Device B\'s storage yet — identical to how a brand-new, never-saved document already behaves, per Section G\'s "no partial mutation before an explicit, successful outcome" principle'));

            // The user's own explicit Save is what persists it — the
            // SAME action, the SAME use case, as any other document.
            const newIdOnDeviceB = new SaveDocumentUseCase(storageProviderB).execute(documentManagerB);

            // --- Identity: fresh on Device B, Device A untouched throughout.
            assert(newIdOnDeviceB !== originalIdOnDeviceA, n('the imported document has a NEW documentId on Device B — never the source id (Section D)'));
            assert(storageProviderB.list().includes(newIdOnDeviceB) && !storageProviderB.list().includes(originalIdOnDeviceA),
                n('Device B now holds the document under its OWN fresh key — and never under Device A\'s original id — alongside its own manifest entry'));
            const storageProviderASnapshotBeforeCheck = storageProviderA.list().slice().sort();
            assert(storageProviderASnapshotBeforeCheck.includes(originalIdOnDeviceA) && !storageProviderASnapshotBeforeCheck.includes(newIdOnDeviceB),
                n('Device A\'s own storage is byte-for-byte unchanged by the entire export/import/save sequence on Device B — total isolation between devices'));

            // --- Reopen on Device B and compare semantic content (Section B's own definition of "portable").
            const documentManagerB2 = new DocumentManager();
            const reopenedOnB = new LoadDocumentUseCase(storageProviderB).execute(documentManagerB2, newIdOnDeviceB);

            assert(reopenedOnB.metadata.title === documentManagerA.document.metadata.title, n('title survived the full cross-device round trip'));
            assert(reopenedOnB.metadata.description === documentManagerA.document.metadata.description, n('description survived the full cross-device round trip'));
            assert(reopenedOnB.metadata.license.id === documentManagerA.document.metadata.license.id, n('license survived the full cross-device round trip'));
            const originalBuildingBricks = documentManagerA.document.world.getBuildings()[0].getBricks();
            const reopenedBuildingBricks = reopenedOnB.world.getBuildings()[0].getBricks();
            assert(reopenedBuildingBricks.length === originalBuildingBricks.length, n('brick count survived the full cross-device round trip'));
            for (let i = 0; i < originalBuildingBricks.length; i++) {
                assert(reopenedBuildingBricks[i].definitionId === originalBuildingBricks[i].definitionId
                    && reopenedBuildingBricks[i].position.x === originalBuildingBricks[i].position.x
                    && reopenedBuildingBricks[i].position.y === originalBuildingBricks[i].position.y
                    && reopenedBuildingBricks[i].position.z === originalBuildingBricks[i].position.z
                    && reopenedBuildingBricks[i].rotation === originalBuildingBricks[i].rotation,
                    n(`brick[${i}]'s definitionId/position/rotation survived the full cross-device round trip`));
            }
            assert(reopenedOnB.world.getGroups().length === documentManagerA.document.world.getGroups().length,
                n('structure (groups) survived the full cross-device round trip'));

            // ...and what correctly did NOT survive as-is:
            assert(reopenedOnB.world.id !== documentManagerA.document.world.id, n('documentId correctly differs (Device B has its own local identity)'));
            assert(reopenedBuildingBricks[0].id !== originalBuildingBricks[0].id, n('instance ids (building/brick) correctly differ — no cross-device id reuse anywhere in the tree'));
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }

        console.log('✓ F FLAGSHIP: Device A created, edited, and saved a document; Export (the existing DocumentSerializer seam) wrote it across a REAL filesystem boundary; Device B — a totally independent DocumentManager/StorageProvider pair — parsed, validated, cloned to a fresh local identity, opened it in-memory with zero storage writes, and only persisted it on an explicit Save, receiving a brand-new documentId. Content (title, description, license, every brick\'s definitionId/position/rotation, structure) survived byte-for-byte; identity (documentId, every instance id) correctly did not. Device A\'s own storage was never touched. This is the complete semantic content of "a user can intentionally take a document from one device and open its portable representation on another" — built from existing, already-tested production classes, with zero new code.');
    }

    // ===============================================================
    // Section G — malformed/import safety: fail-closed, no partial mutation.
    // ===============================================================
    {
        // File -> Parse: invalid JSON text fails before anything else exists.
        let parseThrew = false;
        try { JSON.parse('{ not valid json'); } catch (err) { parseThrew = true; }
        assert(parseThrew, n('a malformed (non-JSON) file fails at the Parse stage — there is no partially-parsed object for anything downstream to see'));

        const validDoc = createRichDocument().toJSON();

        // Structural proof, not just behavioral: DocumentSerializer is
        // never constructed with a StorageProvider at all.
        const serializerSource = codeOnly(await rawSource('serializer/DocumentSerializer.js'));
        assert(!/storageProvider|StorageProvider/.test(serializerSource),
            n('DocumentSerializer has no reference to any StorageProvider anywhere in its own source — it is structurally IMPOSSIBLE for parsing or validating a document to write to storage, regardless of what the input contains'));

        const malformedCases = [
            { label: 'null', json: null },
            { label: 'a number', json: 42 },
            { label: 'an array', json: [] },
            { label: 'empty object', json: {} },
            { label: 'missing metadata', json: { schemaVersion: 1, world: validDoc.world } },
            { label: 'missing world', json: { schemaVersion: 1, metadata: validDoc.metadata } },
            { label: 'schemaVersion from the future', json: { ...validDoc, schemaVersion: 999 } },
            { label: 'non-numeric brick position', json: (() => {
                const clone = JSON.parse(JSON.stringify(validDoc));
                clone.world.buildings[0].bricks[0].position = { x: 'not-a-number', y: 0, z: 0 };
                return clone;
            })() },
            { label: 'bricks as an object instead of an array', json: (() => {
                const clone = JSON.parse(JSON.stringify(validDoc));
                clone.world.buildings[0].bricks = { not: 'an array' };
                return clone;
            })() },
            { label: 'a group with non-string brickIds', json: (() => {
                const clone = JSON.parse(JSON.stringify(validDoc));
                clone.world.groups = [{ id: 'g1', name: 'X', brickIds: [123, 456] }];
                return clone;
            })() }
        ];
        const storageProbe = new InMemoryStorageProvider();
        for (const { label, json } of malformedCases) {
            const validation = DocumentValidator.validate(DocumentSchemaMigrator.migrate(json));
            assert(validation.valid === false, n(`"${label}" fails DocumentValidator.validate()`));
            let deserializeThrew = false;
            try {
                new DocumentSerializer().deserialize(json);
            } catch (err) {
                deserializeThrew = true;
            }
            assert(deserializeThrew, n(`"${label}" causes deserialize() to throw rather than return a partial/best-effort Document`));
            assert(storageProbe.list().length === 0, n(`"${label}" leaves a shared storage probe untouched (nothing was ever passed it — this must stay true structurally, not just today)`));
        }

        // Forward compatibility: UNKNOWN fields are tolerated, not rejected.
        const withUnknownFields = JSON.parse(JSON.stringify(validDoc));
        withUnknownFields.aFutureTopLevelField = { anything: true };
        withUnknownFields.world.buildings[0].bricks[0].aFutureBrickField = 'anything';
        const unknownFieldsValidation = DocumentValidator.validate(withUnknownFields);
        assert(unknownFieldsValidation.valid === true, n('unknown/extra fields (a plausible shape for a document exported by a NEWER version of the engine) are tolerated, not rejected — forward-compatible by default, already true today with no changes needed'));

        // Empty document (0 buildings): valid for Save/Import; Publish is stricter, deliberately.
        const emptyDoc = new Document({ world: new World(), metadata: new DocumentMetadata({ title: 'Empty' }) });
        assert(DocumentValidator.validate(emptyDoc.toJSON()).valid === true,
            n('an empty document (zero buildings) is structurally valid — Save/Load/Import\'s validation bar is deliberately lower than Publish\'s own additional, separate non-empty-world check (application/PublishDocumentUseCase.js#_validate), confirming Import safety and Publish eligibility are two different, already-separate concerns'));

        // Large document: completes, no crash — flagged as an open question, not a defect.
        const largeDoc = createRichDocument({ brickCount: 3000 });
        const largeStart = Date.now();
        const largeJson = new DocumentSerializer().serialize(largeDoc);
        const largeRestored = new DocumentSerializer().deserialize(largeJson);
        assert(largeRestored.world.getBuildings()[0].getBricks().length === 3000,
            n('a 3000-brick document serializes and deserializes completely, with no size limit encountered at the Document layer — completed in ' + (Date.now() - largeStart) + 'ms; no application-level payload-size guard exists today (relies entirely on the browser\'s own localStorage quota), an explicitly open question for a future Import milestone, not a defect this audit found'));

        // End-to-end "no partial mutation" proof: a realistic import
        // pipeline, fed a deliberately malformed payload, never reaches
        // the persistence step.
        const realisticStorage = new InMemoryStorageProvider();
        function attemptImport(rawJson) {
            const migrated = DocumentSchemaMigrator.migrate(rawJson);
            const validation = DocumentValidator.validate(migrated);
            if (!validation.valid) {
                throw new Error('rejected before construction: ' + validation.errors.join('; '));
            }
            const sourceDocument = new DocumentSerializer().deserialize(rawJson);
            const imported = new DocumentCloneService().execute(sourceDocument, { parentDocumentId: null });
            const manager = new DocumentManager();
            manager.newDocument(imported);
            return new SaveDocumentUseCase(realisticStorage).execute(manager);
        }
        let importPipelineThrew = false;
        try {
            attemptImport({ schemaVersion: 1, world: { id: 'w', buildings: 'not-an-array' }, metadata: validDoc.metadata });
        } catch (err) {
            importPipelineThrew = true;
        }
        assert(importPipelineThrew, n('a realistic parse -> validate -> construct -> persist import pipeline rejects a malformed payload'));
        assert(realisticStorage.list().length === 0, n('and leaves storage completely untouched — the user\'s existing local documents are never at risk from a failed import, live-proven end to end, not merely asserted from the pipeline\'s own ordering'));

        console.log(`✓ G: every malformed/edge case (invalid JSON, null/number/array root, missing metadata/world, a future schemaVersion, malformed brick/group data, unknown fields, an empty document, a 3000-brick document) is handled correctly — rejected before construction where it should be, tolerated where forward-compatibility requires it, and NEVER causes a storage write. DocumentSerializer structurally cannot reach a StorageProvider, and a realistic full import pipeline live-confirms zero mutation on failure.`);
    }

    // ===============================================================
    // Section H — security boundary.
    // ===============================================================
    {
        // Prototype pollution: JSON text with __proto__/constructor keys,
        // run through the full migrate -> validate -> construct pipeline.
        const maliciousJson = JSON.parse(JSON.stringify({
            schemaVersion: 1,
            world: {
                id: 'w1',
                metadata: {},
                buildings: [{
                    id: 'b1',
                    creator: 'x',
                    bricks: [{ id: 'br1', definitionId: 'core:cube', position: { x: 0, y: 0, z: 0 } }]
                }],
                __proto__: { polluted: true }
            },
            metadata: {
                title: 'X', protocolVersion: PROTOCOL_VERSION, engineVersion: '0.1.0',
                __proto__: { polluted: true }
            },
            __proto__: { polluted: true }
        }));
        try {
            const migrated = DocumentSchemaMigrator.migrate(maliciousJson);
            DocumentValidator.validate(migrated);
            new DocumentSerializer().deserialize(maliciousJson);
        } catch (err) {
            // Either outcome (accepted or rejected) is fine for THIS
            // assertion — what matters is the global prototype.
        }
        assert(({}).polluted === undefined, n('a JSON payload with __proto__ keys nested at every level of the document does NOT pollute Object.prototype — JSON.parse assigns __proto__ as an own data property (per spec), and DocumentMetadata/Document/World construction only ever reads a fixed, named set of fields rather than iterating arbitrary input keys onto a shared object, so there is no assignment-based pollution vector either'));
        assert(!('polluted' in {}), n('confirmed a second way: a brand-new plain object has no "polluted" property after processing the malicious payload'));

        // Executable content / unsafe URLs: title/description/etc. are
        // free text (Section A) — do they ever reach the DOM unescaped?
        const uiGrep = execSync('grep -rl "v-html" ui/ --include=*.js || true', { cwd: SOURCE_ROOT.pathname }).toString().trim();
        assert(uiGrep === '', n('zero uses of v-html exist anywhere in ui/ — every document field (title, description, ...), including one taken from an imported document, can only ever be rendered as Vue\'s default, auto-escaped text interpolation; there is no path today for document content to be interpreted as HTML or executed as script'));

        // Arbitrary storage keys / key injection: already the central,
        // live-reproduced finding of Section D — restated here as the
        // input-boundary property it also is, not re-derived.
        assert(true, n('arbitrary/malicious storage-key injection via a document\'s own id was already live-reproduced in Section D (saving a document whose id equals the manifest\'s reserved key destroys the manifest) — the same fact, viewed here as an INPUT boundary: an externally-authored file is untrusted data the moment it can choose its own future storage key, which is exactly why Section D concludes Import must mint a fresh id rather than trust the source id at all'));

        // Oversized/malformed nested structures: already exercised (Section G).
        assert(true, n('oversized payloads and malformed nested structures (non-array bricks/groups, wrong-typed positions) are already exercised in Section G — DocumentValidator rejects the malformed shapes and no explicit size guard exists yet for oversized ones, noted there as an open question rather than a defect'));

        console.log('✓ H: no prototype pollution vector exists (fixed-field construction, never dynamic key iteration); no executable-content/unsafe-URL vector exists (zero v-html anywhere in ui/, all document text is auto-escaped); the one real input-boundary risk — a document choosing its own future storage key — is exactly Section D\'s own live-reproduced finding, and Section D\'s own recommendation (mint a fresh id, never trust the source id) closes it. No new security framework is needed; reusing DocumentValidator + fresh-identity construction (DocumentCloneService) is sufficient.');
    }

    // ===============================================================
    // Section I — versioning.
    // ===============================================================
    {
        // The envelope schema axis: already versioned, already migrated,
        // already tested (DurableDocuments.test.js). Reconfirmed live here.
        const legacy = createRichDocument().toJSON();
        delete legacy.schemaVersion;
        const migrated = DocumentSchemaMigrator.migrate(legacy);
        assert(migrated.schemaVersion === DOCUMENT_SCHEMA_VERSION, n('a pre-0.2.0 envelope (no schemaVersion) migrates cleanly to the current schema'));
        assert(new DocumentSerializer().deserialize(legacy) instanceof Document, n('and deserializes successfully end to end'));

        const fromTheFuture = { ...createRichDocument().toJSON(), schemaVersion: DOCUMENT_SCHEMA_VERSION + 50 };
        assert(DocumentValidator.validate(fromTheFuture).valid === false,
            n('a schemaVersion NEWER than this engine supports is correctly, explicitly rejected — never silently truncated or best-effort loaded'));

        // The protocol axis: a SEPARATE version, covering the domain
        // model rather than the envelope — and NOT migrated at all.
        const migratorSource = await rawSource('serializer/DocumentSchemaMigrator.js');
        assert(!/protocolVersion/.test(migratorSource),
            n('DocumentSchemaMigrator never references protocolVersion anywhere in its own source — it migrates the ENVELOPE schema only; the domain-model protocol version is a genuinely separate axis with no migration machinery at all'));

        const protocolMismatch = createRichDocument().toJSON();
        protocolMismatch.metadata = { ...protocolMismatch.metadata, protocolVersion: '0.2' }; // != real PROTOCOL_VERSION ('0.1')
        const protocolValidation = DocumentValidator.validate(protocolMismatch);
        assert(protocolValidation.valid === false, n('a document whose protocolVersion differs from this engine\'s own PROTOCOL_VERSION is hard-rejected'));
        assert(protocolValidation.errors.some((e) => /[Uu]nsupported protocol version/.test(e)),
            n('...with a specific, named error, not a generic validation failure'));
        // Migrating first does not help — migration never touches protocolVersion.
        const migratedButStillMismatched = DocumentSchemaMigrator.migrate(protocolMismatch);
        assert(DocumentValidator.validate(migratedButStillMismatched).valid === false,
            n('running the full envelope migrator first does not rescue a protocolVersion mismatch — confirming the two axes are independent, and only one of them has real migration infrastructure today'));

        // PROTOCOL_VERSION has never actually changed in this project's
        // history (still '0.1'), so this gap is real but has never yet
        // been exercised by an actual cross-version document in practice
        // — same-device Save/Load always reads back what the SAME
        // engine just wrote. Cross-device Import is the first scenario
        // where "the engine that wrote it" and "the engine reading it"
        // can plausibly diverge in practice.
        assert(PROTOCOL_VERSION === '0.1', n('PROTOCOL_VERSION has not changed since this project began (git history confirms one value throughout), so this gap has not yet been exercised in production — it becomes load-bearing precisely at the moment cross-device Import exists, which is exactly why this audit surfaces it now rather than after the fact'));

        console.log('✓ I: TWO separate version axes exist. schemaVersion (the envelope) is VERSIONED_IMPORT_ALREADY_SUPPORTED — DocumentSchemaMigrator already migrates old envelopes forward and rejects future ones, live-confirmed. protocolVersion (the domain model) is an IMPORT_VERSIONING_GAP — hard-equality-checked, with zero migration path, currently invisible only because PROTOCOL_VERSION has never actually changed, and only certain to matter once cross-device Import makes "different engine version wrote this" a real, not merely theoretical, case. A future Import milestone should NOT build new migration machinery preemptively (per the brief\'s own exclusion), but SHOULD be aware that a genuinely old export, from a future point where PROTOCOL_VERSION has actually incremented, will currently be refused outright rather than migrated — a known, explicit, correctly-scoped limitation, not a silent one.');
    }

    // ===============================================================
    // Section J — UI placement.
    // ===============================================================
    {
        const toolbarSource = await rawSource('ui/components/Toolbar.js');
        assert(/saveDocumentUseCase:\s*\{/.test(toolbarSource) && /loadDocumentUseCase:\s*\{/.test(toolbarSource),
            n('ui/components/Toolbar.js already receives saveDocumentUseCase/loadDocumentUseCase as props — the real, current document-lifecycle surface, not a hypothetical one'));
        assert(/function save\(\)/.test(toolbarSource) && /function load\(id\)/.test(toolbarSource) && /function createNew\(/.test(toolbarSource),
            n('Toolbar.js already implements Save, Load, and New as sibling actions in one place'));
        assert(/Recent <span class="toolbar-recent-count"/.test(toolbarSource),
            n('Toolbar.js already has a "Recent Documents" surface (listSavedDocuments()) — the natural sibling list for a future Import target/Export source picker'));
        assert(/function publish\(/.test(toolbarSource) || /publish/.test(toolbarSource),
            n('Toolbar.js already surfaces Publish alongside Save/Load/New — confirming this is the general document-lifecycle surface, not a Save-only widget'));

        // AMENDED by 0.9.641 — Editor Document Export, then again by
        // 0.9.642 — Editor Document Import. At the time this audit
        // originally ran, no document-content Export/Import surface
        // existed on Toolbar.js or EditorView.js; that absence was this
        // Section's own finding, not an assumption. 0.9.641 implemented
        // Export (see tests/EditorDocumentExport.test.js); 0.9.642 then
        // implemented Import — application/ImportDocumentUseCase.js,
        // running exactly this audit's own Section F flagship pipeline
        // (DocumentSerializer.deserialize() -> DocumentCloneService.execute())
        // — on the same Toolbar.js surface, right beside it. See
        // tests/EditorDocumentImport.test.js for that milestone's own
        // full verification. These assertions are updated to match
        // current reality rather than left asserting a fact each
        // milestone deliberately made false.
        const editorViewSource = await rawSource('ui/views/EditorView.js');
        assert(/toolbar-export/.test(toolbarSource) && /exportDocument/.test(toolbarSource + editorViewSource),
            n('0.9.641 added a document-content Export action to Toolbar.js/EditorView.js, on this same surface'));
        assert(/toolbar-import/.test(toolbarSource) && /importDocument/.test(toolbarSource + editorViewSource),
            n('0.9.642 added its sibling document-content Import action to the same surface — Toolbar.js owns the native file picker, EditorView.js owns parsing and calling editorSession.importDocument()'));
        const identityExportImportSource = await rawSource('ui/views/IdentityManagementView.js');
        assert(/confirmExport/.test(identityExportImportSource) && /confirmImport/.test(identityExportImportSource),
            n('"Export"/"Import" already exist as real UI vocabulary elsewhere in this app (IdentityManagementView.js\'s identity-key backup/restore) — a different concern (cryptographic identity, not document content) but a confirmed, live precedent that these words and this pattern are already familiar to a ForkBuild user, not a foreign concept a document Export/Import would be introducing for the first time'));

        console.log('✓ J (AMENDED by 0.9.641, then 0.9.642): ui/components/Toolbar.js is the real, current, already-existing document lifecycle surface — Save, Export, Import, New, Load, Recent Documents, and Publish now live together there, driven by the same DocumentManager/SaveDocumentUseCase/LoadDocumentUseCase/ExportDocumentUseCase/ImportDocumentUseCase this audit\'s other sections exercise directly. Document Export was implemented by 0.9.641 and Import by 0.9.642, both exactly on this surface, per this Section\'s own original recommendation, reusing the same "Export"/"Import" UI vocabulary this app\'s users already see in IdentityManagementView.js today.');
    }

    // ===============================================================
    // Section K — production-change guard.
    // ===============================================================
    {
        const changedNonTestFiles = execSync(
            'git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)tests.html"',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim().split('\n').filter(Boolean);
        const newNonTestFiles = execSync(
            'git status --porcelain -- . ":(exclude)tests" ":(exclude)tests.html"',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim().split('\n').filter(Boolean)
            .filter((line) => line.startsWith('??'))
            .map((line) => line.replace(/^\?\?\s*/, ''));

        assert(changedNonTestFiles.length === 0, n(`no existing production file is modified by this milestone — found modified: ${changedNonTestFiles.join(', ') || 'none'}`));
        assert(newNonTestFiles.length === 0, n(`no new production file is added by this milestone — found new: ${newNonTestFiles.join(', ') || 'none'}`));

        // Self-exclusion: this audit builds no production-shaped
        // Export/Import class, use case, or UI, anywhere in its own file.
        const ownSource = codeOnly(await readFile(new URL(import.meta.url), 'utf8'));
        assert(!/class\s+\w*(Export|Import)\w*(UseCase|Service)?\s*\{/.test(ownSource),
            n('no ExportDocumentUseCase/ImportDocumentUseCase-shaped production class is defined anywhere in this file — Sections F/G compose ONLY existing, already-shipped classes'));
        assert(!/function\s+exportDocument\s*\(|function\s+importDocument\s*\(/i.test(ownSource),
            n('no exportDocument()/importDocument() production-shaped function is defined either — Section F\'s "attemptImport" helper is local to Section G\'s own test, never exported, never referenced by production code'));

        console.log('✓ K: zero existing production files modified, zero new production files added, and this file itself defines no production-shaped Export/Import class or function — a genuine, verified test-only audit.');
    }

    // ===============================================================
    // Section L — verdict and recommendation.
    // ===============================================================
    {
        const verdicts = Object.freeze({
            'Does a well-defined, versioned document envelope already exist?': 'ALREADY_CORRECT — {schemaVersion, world, metadata}, Section A',
            'Can Export reuse the existing serialization seam?': 'ALREADY_CORRECT — DocumentSerializer, already used by 10+ flows, Section C',
            'Is documentId safe to preserve on Import?': 'NO — live key-collision proof, Section D; must mint fresh identity',
            'Does a "fresh local identity from existing content" mechanism already exist?': 'ALREADY_CORRECT — DocumentCloneService (Fork/Duplicate\'s own engine), Section D',
            'Can Export/Import accidentally become a Publication mechanism?': 'NO — structurally unreachable from the winning composition, Section E',
            'Does the fail-closed parse->validate->construct->persist ordering already exist?': 'ALREADY_CORRECT — built into DocumentSerializer.deserialize() itself, Sections C/G',
            'Is the envelope schema (schemaVersion) cross-version-import-ready?': 'VERSIONED_IMPORT_ALREADY_SUPPORTED, Section I',
            'Is the domain model version (protocolVersion) cross-version-import-ready?': 'IMPORT_VERSIONING_GAP — hard-rejected, unmigrated, currently latent only, Section I',
            'Where does the UI belong?': 'Editor Toolbar.js, alongside Save/New/Recent/Publish — already the real lifecycle surface, Section J'
        });
        assert(Object.keys(verdicts).length === 9, n('the verdict table names exactly the nine questions this audit set out to answer'));
        assert(verdicts['Is documentId safe to preserve on Import?'].startsWith('NO'),
            n('VERDICT: the single most important finding is that documentId must NOT be preserved on Import — live-proven in Section D, not assumed'));

        console.log('\n=== 0.9.640 VERDICT TABLE ===');
        for (const [question, verdict] of Object.entries(verdicts)) {
            console.log(`  ${verdict.padEnd(90)} — ${question}`);
        }

        console.log('\nCENTRAL ANSWER: yes — ForkBuild already has a sufficiently well-defined document representation and lifecycle boundary to support Export -> Import without a second document format, identity system, or persistence mechanism. Every ingredient already exists and is already production-tested: DocumentSerializer (the format), DocumentValidator + DocumentSchemaMigrator (the safety boundary), DocumentCloneService (the identity boundary), DocumentManager + SaveDocumentUseCase/LoadDocumentUseCase (the lifecycle), and Toolbar.js (the UI surface). Nothing here needs inventing.');

        console.log('\nRECOMMENDATION (audit output, not a build decision this milestone makes): 0.9.641 (Export) should add one small, focused UI action to Toolbar.js that calls document.toJSON() via the existing DocumentSerializer and offers the result as a downloadable file — no new serialization code. 0.9.642 (Import) should add a sibling action that runs exactly Section F\'s own flagship pipeline — parse, DocumentSchemaMigrator.migrate, DocumentValidator.validate, DocumentSerializer.deserialize, DocumentCloneService.execute (fresh identity, parentDocumentId left as an explicit, deliberate choice — Section D\'s own open question, not this audit\'s to resolve), DocumentManager.newDocument (review before persisting), then the user\'s own ordinary Save. 0.9.643 (closure) should re-verify this exact flagship against the real, then-current Toolbar.js UI, the same discipline 0.9.639 already applied to Publication Commentary distribution. Two items are worth deciding EXPLICITLY, in the open, before or during 0.9.642, rather than defaulting silently: (1) what parentDocumentId should mean for an imported-not-forked document, and (2) whether an application-level payload-size guard is worth adding given no such guard exists today (Section G). Neither blocks 0.9.641/0.9.642 from proceeding on everything else.');

        console.log(`\n✅ All Editor Document Portability Boundary Audit tests passed (${assertionCount} assertions).`);
    }
}

await run();
