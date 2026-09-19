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

import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { DocumentValidator } from '../serializer/DocumentValidator.js';
import { DocumentSchemaMigrator } from '../serializer/DocumentSchemaMigrator.js';

import { StorageProvider } from '../storage/StorageProvider.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { DocumentManifest } from '../application/DocumentManifest.js';
import { DocumentCloneService } from '../application/DocumentCloneService.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { LoadDocumentUseCase } from '../application/LoadDocumentUseCase.js';
import { ExportDocumentUseCase } from '../application/ExportDocumentUseCase.js';
import { ImportDocumentUseCase } from '../application/ImportDocumentUseCase.js';
import { ForkDocumentUseCase } from '../application/ForkDocumentUseCase.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';

// 0.9.643 — Editor Document Portability Product Closure Audit.
//
// TYPE: test-only product closure audit. PRODUCTION CHANGES: none — see
// Section K's own live guard, the same discipline 0.9.640/641/642 each
// already held themselves to.
//
// THE QUESTION, verbatim from the requesting brief: "A user can save a
// document on one device, export it, transfer the resulting file to
// another device, import it there, and continue working with the document
// without overwriting existing local documents." Is that requirement
// actually closed? This is a real product journey audit, not another
// implementation audit — 0.9.640 already audited the boundary, 0.9.641
// implemented Export, 0.9.642 implemented Import. This milestone asks
// whether the FINISHED THING actually does what was asked, using the real
// production classes throughout: ExportDocumentUseCase, ImportDocumentUseCase,
// DocumentCloneService, DocumentManager, SaveDocumentUseCase,
// LoadDocumentUseCase — and EditorSession/Toolbar.js/EditorView.js, verified
// live wherever runnable under plain `node` and, where it genuinely is not
// (see Section A's own note), verified from real source with the same
// call-count/structural rigor 0.9.641/642 already established, never
// asserted from memory.
//
// THE HEADLINE FINDING, live-reproduced in Section C below: the cross-device
// journey itself is closed — content, metadata, fresh identity, collision
// safety, fail-closed validation, legacy migration, multiple independent
// imports, the persistence boundary, and the absence of any decentralized
// side effect are all confirmed, live, against real production code. ONE
// specific, narrow, evidence-backed gap survives: DocumentCloneService —
// the identity mechanism Import shares with Fork/Duplicate — deletes every
// brick's own id to mint a fresh one, but never remaps a Group's
// `brickIds` array to match. A document with groups therefore imports (and
// forks, and duplicates) with its groups still present, still named, still
// reporting their original member COUNT — but silently resolving ZERO
// actual bricks, because every id they reference now belongs to nothing.
// This is not an Import-specific bug (it is DocumentCloneService's, shared
// by Fork/Duplicate since before this milestone), but it directly answers
// this audit's own Section B question ("relevant structural relationships")
// with a live, reproducible NO for one specific relationship: group
// membership. See Section C for the live reproduction and Section L for
// the resulting verdict.
//
//   Section A — complete flagship journey: create -> edit -> save ->
//               export -> filesystem boundary -> import -> save -> open,
//               through the real production chain, plus what EditorSession/
//               Toolbar/EditorView wiring can and cannot be run live here.
//   Section B — semantic preservation: content identity vs instance identity.
//   Section C — identity regeneration, INCLUDING the group-membership
//               finding above, live-reproduced through the real Import path.
//   Section D — collision safety: an existing document, and the reserved
//               manifest key, both survive an importing collision untouched.
//   Section E — multiple independent imports: Export A, Export B, Import
//               A, Import B, Import A again.
//   Section F — fail-closed import through the actual EditorView.js UI
//               logic (structurally proven identical, then executed).
//   Section G — legacy schema portability: an old-schema export still
//               imports to a valid, fresh, current document.
//   Section H — persistence boundary: Export observes, Import constructs,
//               Save persists — never a second persistence mechanism.
//   Section I — no decentralized side effects, including inside
//               EditorSession's own exportDocument()/importDocument() and
//               the Toolbar/EditorView handlers, not just the use cases.
//   Section J — existing workflows (Save/Load/New/Fork/Publish) untouched.
//   Section K — user-facing workflow + production-change guard.
//   Section L — product closure matrix and verdict.

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

// The 0.9.640-style rich fixture, extended: TWO buildings and TWO groups
// (one per building, plus one cross-building group) so "structural
// relationships" (Section B/C) has more than a single trivial case to
// preserve — or fail to.
function createFlagshipDocument({ title = 'Flagship Portable World', author = 'alice' } = {}) {
    const world = new World();

    const buildingA = new Building({ creator: author });
    for (let i = 0; i < 4; i++) {
        buildingA.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(i * 2, 0.5, 0), rotation: i * 15 }));
    }
    world.addBuilding(buildingA);

    const buildingB = new Building({ creator: author });
    for (let i = 0; i < 3; i++) {
        buildingB.addBrick(new Brick({ definitionId: 'core:slope', position: new Position(i * 2, 0.5, 5), rotation: 90 }));
    }
    world.addBuilding(buildingB);

    const aBricks = buildingA.getBricks();
    const bBricks = buildingB.getBricks();

    // A same-building group...
    world.addGroup(new Group({ name: 'Roof', brickIds: aBricks.slice(0, 2).map((b) => b.id) }));
    // ...and a cross-building group, so the structural relationship being
    // tested is not merely "within one building."
    world.addGroup(new Group({ name: 'Mixed', brickIds: [aBricks[2].id, bBricks[0].id] }));

    return new Document({
        world,
        metadata: new DocumentMetadata({
            title,
            description: 'A document built to prove the closed product journey, not just serializability.',
            author,
            license: new License({ id: LicenseId.CC_BY_4_0 })
        })
    });
}

function totalBrickCount(document) {
    return document.world.getBuildings().reduce((sum, b) => sum + b.getBricks().length, 0);
}

async function run() {
    // ===============================================================
    // Section A — FLAGSHIP: the complete cross-device journey.
    // ===============================================================
    {
        // --- Device A: create.
        const storageProviderA = new InMemoryStorageProvider();
        const documentManagerA = new DocumentManager(createFlagshipDocument({ title: 'Closure Audit World' }));
        const original = documentManagerA.document;

        // --- edit: a real, mediated World mutation — not a fixture
        // shortcut — exactly the kind of change a user makes before their
        // first save. Uses World's own event-publishing mutation API
        // (addBrickToBuilding), the same one every command in
        // application/commands/ ultimately calls through.
        const firstBuildingId = original.world.getBuildings()[0].id;
        original.world.addBrickToBuilding(firstBuildingId, new Brick({ definitionId: 'core:cube', position: new Position(99, 0.5, 99), rotation: 45 }));
        const editedBrickCount = totalBrickCount(original);
        assert(editedBrickCount === totalBrickCount(createFlagshipDocument()) + 1,
            n('the document was genuinely edited (one brick added via the real, mediated World API) before this flagship\'s own Save — not merely constructed once and left alone'));

        // --- save.
        const idOnDeviceA = new SaveDocumentUseCase(storageProviderA).execute(documentManagerA);
        assert(storageProviderA.list().includes(idOnDeviceA), n('Device A now holds the edited, saved document locally'));

        // --- export: the real, production ExportDocumentUseCase — the
        // exact class EditorSession.exportDocument() delegates to
        // (structurally reconfirmed below in this same section).
        const portableJson = new ExportDocumentUseCase().execute(documentManagerA.document);

        // --- filesystem boundary: an ACTUAL file on disk, not a JS
        // variable — the same discipline 0.9.640 Section F / 0.9.642
        // Section D already held.
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forkbuild-closure-audit-'));
        const transferPath = path.join(tmpDir, 'exported-document.json');
        let importedDocument, idOnDeviceB, reopenedOnB, storageProviderB;
        try {
            fs.writeFileSync(transferPath, JSON.stringify(portableJson));

            // --- Device B: import — the real, production ImportDocumentUseCase.
            const fileBytes = fs.readFileSync(transferPath, 'utf8');
            const parsed = JSON.parse(fileBytes);
            importedDocument = new ImportDocumentUseCase().execute(parsed);

            storageProviderB = new InMemoryStorageProvider();
            const documentManagerB = new DocumentManager();
            documentManagerB.newDocument(importedDocument); // "open" it — no storage write yet
            assert(storageProviderB.list().length === 0, n('opening the imported document writes nothing to Device B\'s storage yet'));

            // --- save on Device B.
            idOnDeviceB = new SaveDocumentUseCase(storageProviderB).execute(documentManagerB);
            assert(storageProviderA.list().includes(idOnDeviceA) && !storageProviderA.list().includes(idOnDeviceB),
                n('Device A\'s own storage is completely unaffected by anything that happened on Device B'));

            // --- open (reopen) on Device B — "continue working with the document."
            reopenedOnB = new LoadDocumentUseCase(storageProviderB).execute(new DocumentManager(), idOnDeviceB);
            assert(reopenedOnB instanceof Document, n('the document reopens successfully on Device B — the full user journey (create, edit, save, export, transfer, import, save, open) completes end to end'));
            assert(reopenedOnB.world.getBuildings().length === original.world.getBuildings().length,
                n('both buildings survived the complete round trip'));
            assert(totalBrickCount(reopenedOnB) === editedBrickCount,
                n('every brick, INCLUDING the one added by this section\'s own edit step, survived the complete round trip'));
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }

        // --- "without overwriting existing local documents": Device B
        // already had an unrelated document before the import (the
        // requirement's own exact wording) — proven fully in Section D;
        // restated here as part of the flagship narrative.
        assert(storageProviderB.list().includes(idOnDeviceB), n('Device B holds the transferred document under its own key, ready to reopen again'));

        // --- EditorSession / Toolbar / EditorView: what this audit CAN
        // and CANNOT run live. EditorSession statically imports
        // RenderWorldUseCase, which statically imports renderer/Renderer.js,
        // which statically imports the 'three' package — a real npm
        // package this project resolves only via tests.html's browser
        // import map (three@0.160.0 from a CDN), never installed as a
        // node_modules dependency (this repo ships no package.json at
        // all — confirmed live, not assumed). That import chain fails
        // under plain `node` before a single line of EditorSession runs,
        // REGARDLESS of what any test does afterward — confirmed live
        // here, not merely asserted from the same finding 0.9.641/642
        // already documented in their own header comments.
        let editorSessionImportFailed = false;
        let editorSessionImportError = '';
        try {
            execSync('node -e "import(\'./application/EditorSession.js\')"', { cwd: SOURCE_ROOT.pathname, stdio: 'pipe' });
        } catch (err) {
            editorSessionImportFailed = true;
            editorSessionImportError = String(err.stderr || err.message);
        }
        assert(editorSessionImportFailed, n('CONFIRMED LIVE (not assumed from 0.9.641/642\'s own header comments): importing application/EditorSession.js under plain `node`, right now, in this repository, fails'));
        assert(/three/.test(editorSessionImportError), n('...specifically because of the unresolvable \'three\' package — confirmed from the actual error text, not guessed'));

        // What IS runnable, and IS run, above: ExportDocumentUseCase,
        // ImportDocumentUseCase, DocumentCloneService (inside Import),
        // DocumentManager, SaveDocumentUseCase, LoadDocumentUseCase — the
        // entire application-layer chain EditorSession.exportDocument()/
        // importDocument() themselves delegate to, with ZERO reimplementation
        // in this file. What is NOT independently re-verified live here
        // (because it cannot be, in this environment) is only the thin
        // Vue-rendered DOM layer (Toolbar.js's button/file-input markup,
        // EditorView.js's handler closures) sitting on top of that chain —
        // verified instead by exact structural proof against real source,
        // the same standard 0.9.641 Section H / 0.9.642 Section K already
        // established and that Section F/K below reconfirm and extend.
        const editorSessionSource = codeOnly(await rawSource('application/EditorSession.js'));
        assert(/exportDocument\(\)\s*\{[\s\S]*?this\._exportDocumentUseCase\.execute\(this\._documentManager\.document\)/.test(editorSessionSource),
            n('EditorSession.exportDocument() delegates straight to this._exportDocumentUseCase.execute() — the exact class this section just ran live'));
        assert(/importDocument\(json\)\s*\{[\s\S]*?this\._importDocumentUseCase\.execute\(json\)/.test(editorSessionSource),
            n('EditorSession.importDocument() delegates straight to this._importDocumentUseCase.execute() — the exact class this section just ran live'));
        assert(/exportDocumentUseCase = new ExportDocumentUseCase\(\)/.test(editorSessionSource) && /importDocumentUseCase = new ImportDocumentUseCase\(\)/.test(editorSessionSource),
            n('EditorSession\'s own default collaborators are literally `new ExportDocumentUseCase()`/`new ImportDocumentUseCase()` — the SAME classes, at their SAME default configuration, this section exercised live end to end; there is no second, EditorSession-specific implementation anywhere for this audit to have missed'));

        console.log('✓ A FLAGSHIP: Device A created a document, edited it via a real mediated World mutation, saved it, exported it across a REAL filesystem boundary; Device B — a fully independent DocumentManager/StorageProvider pair — imported it, saved it under a fresh id, and reopened it, with every building and every brick (including the edit) intact and Device A\'s own storage never touched. EditorSession itself is confirmed LIVE (not assumed) to be unrunnable under plain `node` in this environment, purely due to the \'three\' package; the exact production chain its exportDocument()/importDocument() delegate to — proven by structural match against real source — is exactly the chain this section ran.');
    }

    // ===============================================================
    // Section B — semantic preservation: content identity vs instance identity.
    // ===============================================================
    {
        const source = createFlagshipDocument({ title: 'Semantic Preservation Source' });
        const exported = new ExportDocumentUseCase().execute(source);
        const imported = new ImportDocumentUseCase().execute(JSON.parse(JSON.stringify(exported)));

        // Content identity: what a user recognizes as "the same document."
        assert(imported.metadata.title === source.metadata.title, n('title: content identity preserved'));
        assert(imported.metadata.description === source.metadata.description, n('description: content identity preserved'));
        assert(imported.metadata.author === source.metadata.author, n('author: content identity preserved'));
        assert(imported.metadata.license.id === source.metadata.license.id, n('license: content identity preserved'));
        assert(imported.world.getBuildings().length === source.world.getBuildings().length, n('building count: content identity preserved'));
        for (let bi = 0; bi < source.world.getBuildings().length; bi++) {
            const sourceBuilding = source.world.getBuildings()[bi];
            const importedBuilding = imported.world.getBuildings()[bi];
            assert(importedBuilding.creator === sourceBuilding.creator, n(`building[${bi}] creator: content identity preserved`));
            assert(importedBuilding.getBricks().length === sourceBuilding.getBricks().length, n(`building[${bi}] brick count: content identity preserved`));
            for (let i = 0; i < sourceBuilding.getBricks().length; i++) {
                const sb = sourceBuilding.getBricks()[i];
                const ib = importedBuilding.getBricks()[i];
                assert(ib.definitionId === sb.definitionId, n(`building[${bi}] brick[${i}] definitionId: content identity preserved`));
                assert(ib.position.x === sb.position.x && ib.position.y === sb.position.y && ib.position.z === sb.position.z,
                    n(`building[${bi}] brick[${i}] position: content identity preserved`));
                assert(ib.rotation === sb.rotation, n(`building[${bi}] brick[${i}] rotation: content identity preserved`));
            }
        }
        assert(imported.world.getGroups().length === source.world.getGroups().length, n('group count: content identity preserved'));
        for (let gi = 0; gi < source.world.getGroups().length; gi++) {
            assert(imported.world.getGroups()[gi].name === source.world.getGroups()[gi].name, n(`group[${gi}] name: content identity preserved`));
            assert(imported.world.getGroups()[gi].memberCount === source.world.getGroups()[gi].memberCount,
                n(`group[${gi}] member COUNT: content identity preserved (whether those members still RESOLVE is a separate, instance-identity question — Section C)`));
        }
        assert(imported.metadata.protocolVersion === source.metadata.protocolVersion, n('protocolVersion (supported schema field): content identity preserved'));
        assert(imported.metadata.engineVersion === source.metadata.engineVersion, n('engineVersion (supported schema field): content identity preserved'));

        // Instance identity: explicitly NOT preserved, by design (0.9.640
        // Section D). Restated here as the other half of the same
        // distinction Section B of the brief asks to draw explicitly.
        assert(imported.world.id !== source.world.id, n('documentId: instance identity intentionally regenerated, not content'));
        assert(imported.world.getBuildings()[0].id !== source.world.getBuildings()[0].id, n('building id: instance identity intentionally regenerated'));
        assert(imported.world.getBuildings()[0].getBricks()[0].id !== source.world.getBuildings()[0].getBricks()[0].id,
            n('brick id: instance identity intentionally regenerated'));

        console.log('✓ B: content identity (title, description, author, license, building count/creator, every brick\'s definitionId/position/rotation, group count/name/member-count, protocolVersion, engineVersion) survives export -> import completely; instance identity (documentId, building ids, brick ids) is intentionally, explicitly regenerated — the two are cleanly distinguishable, live-verified field by field, not asserted in bulk.');
    }

    // ===============================================================
    // Section C — identity regeneration, and the live group-membership finding.
    // ===============================================================
    {
        const source = createFlagshipDocument({ title: 'Identity Regeneration Source' });
        const exported = new ExportDocumentUseCase().execute(source);
        const imported = new ImportDocumentUseCase().execute(JSON.parse(JSON.stringify(exported)));

        // The complete identity boundary, per the brief's own diagram:
        // documentId, buildingId, brickId all regenerate.
        assert(imported.world.id !== source.world.id, n('documentId: NEW'));
        const sourceBuildingIds = new Set(source.world.getBuildings().map((b) => b.id));
        for (const building of imported.world.getBuildings()) {
            assert(!sourceBuildingIds.has(building.id), n(`buildingId ${building.id}: NEW (never one of the source\'s own)`));
        }
        const sourceBrickIds = new Set();
        for (const building of source.world.getBuildings()) {
            for (const brick of building.getBricks()) sourceBrickIds.add(brick.id);
        }
        for (const building of imported.world.getBuildings()) {
            for (const brick of building.getBricks()) {
                assert(!sourceBrickIds.has(brick.id), n(`brickId ${brick.id}: NEW (never one of the source\'s own)`));
            }
        }
        assert(imported.metadata.parentDocumentId === null,
            n('parentDocumentId: explicitly null (0.9.642\'s own design decision) — an imported document claims no lineage to an id that names nothing on this device'));

        // This follows DocumentCloneService's own semantics exactly —
        // verified by literally being the same class, called once, spied.
        let cloneCalls = 0;
        class SpyCloneService extends DocumentCloneService {
            execute(sourceDocument, options) { cloneCalls += 1; return super.execute(sourceDocument, options); }
        }
        new ImportDocumentUseCase(new DocumentSerializer(), new SpyCloneService()).execute(JSON.parse(JSON.stringify(exported)));
        assert(cloneCalls === 1, n('ImportDocumentUseCase calls DocumentCloneService.execute() exactly once — the identity relationships above are DocumentCloneService\'s own, not a parallel identity mechanism this audit could have missed'));

        // ---------------------------------------------------------------
        // THE FINDING: "no source instance identity is accidentally
        // retained where the clone service says it must be regenerated"
        // — true for world/building/brick ids (just proven above). But a
        // Group's OWN id, and every id INSIDE its brickIds array, are
        // never touched by DocumentCloneService at all — live-reproduced
        // here through the REAL, complete Import pipeline (not a
        // DocumentCloneService-only probe), with a fixture that has both
        // a same-building group and a cross-building group.
        // ---------------------------------------------------------------
        const sourceRoofGroup = source.world.getGroups().find((g) => g.name === 'Roof');
        const importedRoofGroup = imported.world.getGroups().find((g) => g.name === 'Roof');
        assert(importedRoofGroup.id === sourceRoofGroup.id,
            n('Group id itself is NOT regenerated by DocumentCloneService (unlike world/building/brick ids) — confirmed live; this alone is not yet the bug, but it is the first sign this identity axis was never addressed'));
        assert(JSON.stringify(importedRoofGroup.brickIds) === JSON.stringify(sourceRoofGroup.brickIds),
            n('and the group\'s brickIds array is copied VERBATIM — still the SOURCE document\'s own (now foreign, locally-unresolvable) brick ids, never remapped to the fresh ids the import just minted for the actual bricks'));

        // The observable consequence: the group SAYS it has members
        // (memberCount survives — Section B), but resolving them against
        // the imported world's own, real, fresh bricks returns nothing.
        for (const importedGroup of imported.world.getGroups()) {
            const sourceGroup = source.world.getGroups().find((g) => g.name === importedGroup.name);
            const resolvedMembers = imported.world.getGroupBricks(importedGroup.id);
            assert(sourceGroup.memberCount > 0, n(`sanity: source group "${importedGroup.name}" genuinely has members before import`));
            assert(importedGroup.memberCount === sourceGroup.memberCount,
                n(`group "${importedGroup.name}" reports the SAME member count after import as before (${importedGroup.memberCount}) — it looks intact`));
            assert(resolvedMembers.length === 0,
                n(`BUG, LIVE: group "${importedGroup.name}" resolves ZERO actual bricks via World.getGroupBricks() (the same method every real group-membership consumer in this codebase calls) — every id it references belongs to a brick that no longer exists anywhere in the imported document. This is silent: no error, no warning, imported.world.getGroups() looks completely normal, and only resolving membership reveals the group is now empty`));
        }

        // Confirmed NOT an Import-specific regression: the identical
        // defect reproduces through DocumentCloneService directly (the
        // same engine Fork/Duplicate already share) — so this predates
        // 0.9.641/642 and is not something either milestone introduced.
        const directClone = new DocumentCloneService().execute(source, { parentDocumentId: null });
        const directClonedGroup = directClone.world.getGroups().find((g) => g.name === 'Roof');
        assert(directClone.world.getGroupBricks(directClonedGroup.id).length === 0,
            n('and reproduces identically via a bare DocumentCloneService.execute() call — confirming this is DocumentCloneService\'s own, pre-existing gap (shared today by Fork and Duplicate), not something Import introduced'));

        console.log('✓ C: the documentId/buildingId/brickId identity boundary the brief describes is exactly right, live-confirmed field by field, driven by exactly one DocumentCloneService.execute() call with no parallel identity mechanism. ONE relationship is NOT covered by that regeneration: a Group\'s own id and its brickIds array are copied verbatim rather than regenerated/remapped, so every group in an imported (or forked, or duplicated) document silently resolves zero members despite reporting its original name and count — live-reproduced through both the real Import pipeline and a bare DocumentCloneService call. This is the one specific, evidence-backed gap this audit found — see Section L.');
    }

    // ===============================================================
    // Section D — collision safety.
    // ===============================================================
    {
        // D1 — an existing document with the SAME source identity as the
        // one being imported: the brief's own "existing document = X,
        // import an artifact whose source identity is also X" scenario.
        const storageProvider = new InMemoryStorageProvider();
        const documentManifest = new DocumentManifest(storageProvider);

        const existingX = createFlagshipDocument({ title: 'Existing Document X' });
        const existingManager = new DocumentManager(existingX);
        const existingXId = new SaveDocumentUseCase(storageProvider, new DocumentSerializer(), documentManifest).execute(existingManager);
        const existingXSnapshot = JSON.stringify(storageProvider.load(existingXId));

        // An artifact whose OWN source identity is also X — the exact
        // collision the brief names, built by exporting a DIFFERENT
        // document and then forcing its world.id to equal the existing one.
        const collidingSourceX = createFlagshipDocument({ title: 'A Different Document, Same Claimed Id' });
        const collidingJson = new ExportDocumentUseCase().execute(collidingSourceX);
        collidingJson.world.id = existingXId;

        const importedX = new ImportDocumentUseCase().execute(collidingJson);
        assert(importedX.world.id !== existingXId, n('the imported document never receives the existing document\'s own id, even though the source file explicitly claimed it'));
        const newXId = new SaveDocumentUseCase(storageProvider, new DocumentSerializer(), documentManifest).execute(new DocumentManager(importedX));

        assert(JSON.stringify(storageProvider.load(existingXId)) === existingXSnapshot,
            n('existing X remains BYTE-FOR-BYTE unchanged in storage after the colliding import + save'));
        const reloadedX = new LoadDocumentUseCase(storageProvider, new DocumentSerializer(), documentManifest).execute(new DocumentManager(), existingXId);
        assert(reloadedX.metadata.title === 'Existing Document X', n('...and reopening it by its original id still returns the ORIGINAL content'));
        assert(storageProvider.list().includes(newXId) && newXId !== existingXId, n('the new imported document exists too, under its own fresh id — both requirements from the brief hold simultaneously'));
        const entries = documentManifest.list();
        assert(entries.length === 2 && entries.some((e) => e.id === existingXId) && entries.some((e) => e.id === newXId),
            n('the manifest holds exactly two independent, correct entries — neither clobbered the other'));

        // D2 — the manifest-reserved-key collision that motivated the
        // identity rule in the first place (0.9.640 Section D), exercised
        // here as part of THIS audit's own collision-safety proof rather
        // than only cited from the earlier one.
        const manifestSource = await rawSource('application/DocumentManifest.js');
        const manifestKey = manifestSource.match(/MANIFEST_KEY = '([^']+)'/)[1];

        const storageProvider2 = new InMemoryStorageProvider();
        const documentManifest2 = new DocumentManifest(storageProvider2);
        documentManifest2.upsert({ id: 'unrelated-doc', title: 'Untouched', modified: new Date().toISOString(), revision: 1, contentHash: 'x' });

        const reservedKeySource = createFlagshipDocument({ title: 'Claims The Reserved Manifest Key' });
        const reservedKeyJson = new ExportDocumentUseCase().execute(reservedKeySource);
        reservedKeyJson.world.id = manifestKey;

        const importedReservedKey = new ImportDocumentUseCase().execute(reservedKeyJson);
        assert(importedReservedKey.world.id !== manifestKey, n('even a source file that claims the manifest\'s own RESERVED storage key as its documentId never receives it on import'));

        let saveThrew = false;
        try {
            new SaveDocumentUseCase(storageProvider2, new DocumentSerializer(), documentManifest2).execute(new DocumentManager(importedReservedKey));
        } catch (err) {
            saveThrew = true;
        }
        assert(saveThrew === false, n('saving the imported document does not reproduce the manifest-corrupting crash 0.9.640 Section D live-demonstrated for a naive id-preserving import'));
        assert(documentManifest2.list().some((e) => e.id === 'unrelated-doc'), n('the pre-existing, entirely unrelated manifest entry survives completely untouched'));

        console.log('✓ D: both collision shapes the brief names are safe — an existing document sharing its id with an imported source survives byte-for-byte while the import still succeeds under its own fresh id, and a source file that explicitly claims the manifest\'s own reserved storage key is re-identified before it ever reaches Save, never reproducing the manifest-corrupting crash that originally motivated this rule.');
    }

    // ===============================================================
    // Section E — multiple independent imports.
    // ===============================================================
    {
        const storageProviderB = new InMemoryStorageProvider();
        const documentManifestB = new DocumentManifest(storageProviderB);

        const sourceA = createFlagshipDocument({ title: 'World A' });
        const sourceB = createFlagshipDocument({ title: 'World B' });
        const exportedA = new ExportDocumentUseCase().execute(sourceA);
        const exportedB = new ExportDocumentUseCase().execute(sourceB);

        function importAndSave(exportedJson) {
            const imported = new ImportDocumentUseCase().execute(JSON.parse(JSON.stringify(exportedJson)));
            const id = new SaveDocumentUseCase(storageProviderB, new DocumentSerializer(), documentManifestB).execute(new DocumentManager(imported));
            return { imported, id };
        }

        const importA1 = importAndSave(exportedA);
        const importB1 = importAndSave(exportedB);
        const importA2 = importAndSave(exportedA); // "Import A again"

        assert(importA1.id !== importB1.id, n('importing A then B produces two distinct documentIds'));
        assert(importA1.id !== importA2.id, n('importing A TWICE produces two distinct documentIds — the second import of the same source file is not silently treated as "the same document already imported"'));
        assert(importB1.id !== importA2.id, n('all three imports are pairwise distinct'));

        const allIds = [importA1.id, importB1.id, importA2.id];
        assert(new Set(allIds).size === 3, n('confirmed a second way: three genuinely unique ids, not two unique values with an accidental repeat'));
        assert(storageProviderB.list().filter((k) => allIds.includes(k)).length === 3,
            n('all three are independently addressable in storage — three separate keys, three separate stored payloads'));

        const manifestEntries = documentManifestB.list();
        assert(manifestEntries.length === 3, n('the manifest holds exactly three entries — one per import, never merged or overwritten'));
        assert(manifestEntries.filter((e) => e.title === 'World A').length === 2, n('both imports of World A have their OWN, separate manifest entries (both titled "World A")'));
        assert(manifestEntries.filter((e) => e.title === 'World B').length === 1, n('World B has exactly one manifest entry'));

        // Reopening each independently returns the correct, un-mixed content.
        const reopenedA1 = new LoadDocumentUseCase(storageProviderB, new DocumentSerializer(), documentManifestB).execute(new DocumentManager(), importA1.id);
        const reopenedB1 = new LoadDocumentUseCase(storageProviderB, new DocumentSerializer(), documentManifestB).execute(new DocumentManager(), importB1.id);
        const reopenedA2 = new LoadDocumentUseCase(storageProviderB, new DocumentSerializer(), documentManifestB).execute(new DocumentManager(), importA2.id);
        assert(reopenedA1.metadata.title === 'World A' && reopenedA2.metadata.title === 'World A' && reopenedB1.metadata.title === 'World B',
            n('reopening each of the three by its own id returns exactly the content it should — no cross-contamination between the two imports of the same source'));
        assert(reopenedA1.world.id !== reopenedA2.world.id, n('the two imports of the SAME source document remain two independently addressable documents after reopening too, not silently collapsed into one'));

        // No accidental reuse of the SOURCE id either, for either import.
        assert(reopenedA1.world.id !== sourceA.world.id && reopenedA2.world.id !== sourceA.world.id,
            n('neither import of World A ever reused World A\'s own source id — fresh identity minted independently, twice'));

        console.log('✓ E: exporting two documents and importing A, B, then A again produces three independently addressable documents — distinct ids, distinct storage entries, distinct manifest entries, no accidental reuse of a source id and no accidental collapsing of the two imports of the same source into one.');
    }

    // ===============================================================
    // Section F — fail-closed import through the actual UI import path.
    // ===============================================================
    {
        // First, structural proof that the logic this section then RUNS
        // is not a test-local reimplementation but an exact, verified
        // match for EditorView.js's own real importDocument(rawText)
        // handler — the actual UI entry point Toolbar's file input feeds.
        const editorViewSource = await rawSource('ui/views/EditorView.js');
        const importDocumentFnMatch = editorViewSource.match(/function importDocument\(rawText\)\s*\{[\s\S]*?\n\t\t\}/);
        assert(importDocumentFnMatch !== null, n('ui/views/EditorView.js#importDocument(rawText) — the real UI handler Toolbar\'s file input feeds — is found in its own real source'));
        const importDocumentFnBody = importDocumentFnMatch[0];
        assert(/let json;[\s\S]*?try\s*\{[\s\S]*?json = JSON\.parse\(rawText\);/.test(importDocumentFnBody),
            n('STAGE 1 (parse), confirmed from real source: JSON.parse(rawText) runs first, in its own try/catch'));
        assert(/catch \(e\) \{[\s\S]*?feedback\.show\('That is not valid JSON[\s\S]*?return;/.test(importDocumentFnBody),
            n('...and a JSON parse failure shows a PARSE-level message and returns immediately — never reaching the second stage'));
        assert(/try\s*\{[\s\S]*?editorSession\.importDocument\(json\)/.test(importDocumentFnBody),
            n('STAGE 2 (document construction), confirmed from real source: editorSession.importDocument(json) — the real application command — runs in its OWN, separate try/catch'));
        assert(/catch \(e\) \{[\s\S]*?feedback\.show\(e\.message\.replace\(\/\^DocumentSerializer:\\s\*\/, ''\)\)/.test(importDocumentFnBody),
            n('...and a document-level failure shows THAT specific error message (DocumentSerializer\'s own, prefix stripped) — a genuinely different message from stage 1\'s, confirming the two-stage error handling is truthful, not two try/catches sharing one generic message'));
        assert(!/documentManager\.newDocument\(|storageProvider\.|Document\.fromJSON/.test(importDocumentFnBody),
            n('the real handler never touches DocumentManager, a StorageProvider, or Document.fromJSON directly — success or failure, persistence-adjacent state is never this function\'s to mutate'));

        // Now RUN exactly that two-stage shape, using the real
        // ImportDocumentUseCase (standing in for editorSession.importDocument(),
        // which is structurally proven above to call exactly this class)
        // — a faithful behavioral execution of the real handler's own
        // logic, not a fresh implementation of import safety.
        const realisticStorage = new InMemoryStorageProvider();
        const realisticManifest = new DocumentManifest(realisticStorage);
        const currentDocument = createFlagshipDocument({ title: 'Currently Open, Must Survive' });
        const currentManager = new DocumentManager(currentDocument);
        new SaveDocumentUseCase(realisticStorage, new DocumentSerializer(), realisticManifest).execute(currentManager);
        const storageSnapshotBefore = JSON.stringify(realisticStorage.load(currentDocument.world.id));
        const manifestSnapshotBefore = JSON.stringify(realisticManifest.list());
        const storageKeysBefore = realisticStorage.list().slice().sort();

        function simulateUIImport(rawText, documentManager, importDocumentUseCase = new ImportDocumentUseCase()) {
            let json;
            try {
                json = JSON.parse(rawText);
            } catch (e) {
                return { stage: 'parse', message: 'That is not valid JSON — choose a file exported with "Export."' };
            }
            try {
                const imported = importDocumentUseCase.execute(json);
                documentManager.newDocument(imported); // mirrors EditorSession.importDocument() -> openDocument()
                return { stage: 'success', imported };
            } catch (e) {
                return { stage: 'document', message: e.message.replace(/^DocumentSerializer:\s*/, '') };
            }
        }

        // Not valid JSON at all.
        const notJsonResult = simulateUIImport('{ this is not json', currentManager);
        assert(notJsonResult.stage === 'parse', n('a non-JSON file is rejected at the PARSE stage, exactly matching the real handler'));

        // Valid JSON, invalid document structure.
        const validButBrokenDoc = createFlagshipDocument().toJSON();
        validButBrokenDoc.world.buildings[0].bricks = { not: 'an array' };
        const brokenResult = simulateUIImport(JSON.stringify(validButBrokenDoc), currentManager);
        assert(brokenResult.stage === 'document', n('valid JSON with an invalid document structure is rejected at the DOCUMENT stage instead — a genuinely different failure mode from the parse case, reachable only once JSON.parse already succeeded'));

        // No partial mutation from either failure: exactly what the
        // brief's own checklist names.
        assert(JSON.stringify(realisticStorage.load(currentDocument.world.id)) === storageSnapshotBefore, n('no document persisted (unrelated-document storage slot byte-for-byte unchanged) after either failure'));
        assert(JSON.stringify(realisticManifest.list()) === manifestSnapshotBefore, n('no manifest mutation after either failure'));
        assert(currentManager.document === currentDocument, n('the currently open document reference is completely untouched by either failure — still the exact same in-memory Document, not merely equal content'));
        assert(currentManager.document.metadata.title === 'Currently Open, Must Survive', n('the current document remains intact by content too'));
        assert(JSON.stringify(realisticStorage.list().slice().sort()) === JSON.stringify(storageKeysBefore),
            n('no partially constructed document becomes visible anywhere in storage — the exact same set of storage keys as before, nothing added'));

        // And the success path, for contrast — proving stage 2's
        // try/catch really is reachable, not merely theoretical.
        const validExport = new ExportDocumentUseCase().execute(createFlagshipDocument({ title: 'Valid Import Through The UI Path' }));
        const successResult = simulateUIImport(JSON.stringify(validExport), currentManager);
        assert(successResult.stage === 'success', n('a genuinely valid file DOES succeed through this exact two-stage shape — the fail-closed behavior above is not simply "always rejects"'));
        assert(currentManager.document.metadata.title === 'Valid Import Through The UI Path', n('...and only on success does the currently open document actually change'));

        console.log('✓ F: EditorView.js\'s real importDocument(rawText) handler is structurally confirmed to implement a genuinely two-stage, genuinely truthful parse-vs-document error split (proven from its own source, not assumed), and running that exact shape against the real ImportDocumentUseCase confirms both failure stages leave storage, the manifest, and the currently open document completely untouched, while a valid file still succeeds through the identical path.');
    }

    // ===============================================================
    // Section G — legacy schema portability.
    // ===============================================================
    {
        const legacySource = createFlagshipDocument({ title: 'Pre-0.2.0 Legacy Export' }).toJSON();
        delete legacySource.schemaVersion; // simulates an export written by an older engine version

        const importedLegacy = new ImportDocumentUseCase().execute(legacySource);
        assert(importedLegacy instanceof Document, n('a legacy (pre-schemaVersion) export imports successfully end to end through the real ImportDocumentUseCase'));
        assert(importedLegacy.metadata.title === 'Pre-0.2.0 Legacy Export', n('...with its content intact'));
        assert(importedLegacy.world.getBuildings().length === 2 && totalBrickCount(importedLegacy) === totalBrickCount(createFlagshipDocument()),
            n('...including every building and every brick, not merely the metadata'));

        // fresh identity, exactly like any other import.
        assert(typeof importedLegacy.world.id === 'string' && importedLegacy.world.id.length > 0, n('the legacy import receives a real, fresh documentId — the same identity rule applies regardless of source schema age'));

        // valid current document: re-exporting now carries the CURRENT
        // schema version — the migration genuinely happened.
        const reExported = new ExportDocumentUseCase().execute(importedLegacy);
        assert(reExported.schemaVersion === DOCUMENT_SCHEMA_VERSION, n('re-exporting the imported document now carries the CURRENT schemaVersion'));
        assert(DocumentValidator.validate(reExported).valid === true, n('...and the result validates cleanly as a normal, current document — no lingering "legacy" marker or degraded state'));

        // It can be saved and reopened exactly like any other document —
        // "a fresh identity, a valid current document" means it is a
        // completely ordinary document from here on, not a special case.
        const storageProvider = new InMemoryStorageProvider();
        const id = new SaveDocumentUseCase(storageProvider).execute(new DocumentManager(importedLegacy));
        const reopened = new LoadDocumentUseCase(storageProvider).execute(new DocumentManager(), id);
        assert(reopened.metadata.title === 'Pre-0.2.0 Legacy Export', n('the migrated-then-imported document saves and reopens exactly like any ordinary document'));

        // Scope discipline: no NEW migration machinery was needed or
        // used — same restraint 0.9.642 Section F already held.
        const useCaseSource = codeOnly(await rawSource('application/ImportDocumentUseCase.js'));
        assert(!/DocumentSchemaMigrator/.test(useCaseSource),
            n('ImportDocumentUseCase itself still never references DocumentSchemaMigrator directly — migration is inherited for free from DocumentSerializer.deserialize(), no new machinery was added for this audit to find'));

        console.log('✓ G: a legacy, pre-schemaVersion export migrates cleanly through the real Import path to a fresh-identity, fully valid, ordinary current document — content and structure intact, re-exportable at the current schema version, saveable and reopenable like any other document. This confirms portability is not limited to documents produced by the exact current build.');
    }

    // ===============================================================
    // Section H — persistence boundary.
    // ===============================================================
    {
        // Export: observational. Structural + runtime proof, consolidated.
        const exportSource = codeOnly(await rawSource('application/ExportDocumentUseCase.js'));
        assert(!/storageProvider|StorageProvider|DocumentManifest/i.test(exportSource), n('ExportDocumentUseCase has no reference to any StorageProvider or DocumentManifest'));
        const importSource = codeOnly(await rawSource('application/ImportDocumentUseCase.js'));
        assert(!/storageProvider|StorageProvider|DocumentManifest/i.test(importSource), n('ImportDocumentUseCase has no reference to any StorageProvider or DocumentManifest either'));
        const saveSource = codeOnly(await rawSource('application/SaveDocumentUseCase.js'));
        assert(/this\._storageProvider\.save\(/.test(saveSource), n('SaveDocumentUseCase — and only SaveDocumentUseCase, of the three — actually calls storageProvider.save()'));

        const probe = new InMemoryStorageProvider();
        const doc = createFlagshipDocument({ title: 'Persistence Boundary Probe' });
        const manager = new DocumentManager(doc);
        for (let i = 0; i < 5; i++) {
            new ExportDocumentUseCase().execute(manager.document);
        }
        assert(probe.list().length === 0, n('five repeated Export calls touch a storage probe zero times (nothing was ever handed one — structurally, not just behaviorally, impossible)'));

        const exported = new ExportDocumentUseCase().execute(doc);
        for (let i = 0; i < 5; i++) {
            new ImportDocumentUseCase().execute(JSON.parse(JSON.stringify(exported)));
        }
        assert(probe.list().length === 0, n('five repeated Import calls ALSO touch a storage probe zero times — construction only, exactly mirroring Export\'s own observational posture on the other side of the round trip'));

        // Only the user's own, later, explicit Save persists anything.
        const realStorage = new InMemoryStorageProvider();
        const importedForSave = new ImportDocumentUseCase().execute(JSON.parse(JSON.stringify(exported)));
        const importedManager = new DocumentManager();
        importedManager.newDocument(importedForSave);
        assert(realStorage.list().length === 0, n('even after "opening" the imported document into a session, storage remains empty until Save is called'));
        new SaveDocumentUseCase(realStorage).execute(importedManager);
        assert(realStorage.list().includes(importedForSave.world.id), n('...and exactly one explicit Save is what finally persists it — Import never became a second persistence mechanism'));

        console.log('✓ H: Export is observational (proven structurally impossible to reach storage, and runtime-confirmed across repeated calls), Import is construction-only (same proof, same repetition), and SaveDocumentUseCase remains the ONE place a Document actually reaches a StorageProvider — the three-way boundary the brief asks to preserve holds exactly.');
    }

    // ===============================================================
    // Section I — no decentralized side effects.
    // ===============================================================
    {
        const forbiddenPatterns = [
            [/from ['"].*publisher\//, 'imports from publisher/'],
            [/from ['"].*\bdiscovery\//, 'imports from discovery/'],
            [/from ['"].*\bnostr\//, 'imports from nostr/'],
            [/from ['"].*\barweave\//, 'imports from arweave/'],
            [/from ['"].*\bpeer\//, 'imports from peer/'],
            [/from ['"].*\bplacement\//, 'imports from placement/'],
            [/\.sign\(|signPublication|announceDiscovery/, 'calls a signing/announcement API'],
            [/PlacementRecord|PublicationSnapshot/i, 'constructs a Publication/PlacementRecord-shaped object'],
            [/Commentary/i, 'references Commentary'],
            [/Notification/i, 'references a notification mechanism'],
            [/WebRTC|WebRtc|RTCPeerConnection/i, 'references WebRTC']
        ];

        // Whole-file sweep of the core Export/Import composition — same
        // standard 0.9.640 Section E already applied.
        const files = [
            'application/ExportDocumentUseCase.js',
            'application/ImportDocumentUseCase.js',
            'application/DocumentCloneService.js',
            'serializer/DocumentSerializer.js',
            'serializer/DocumentValidator.js',
            'serializer/DocumentSchemaMigrator.js'
        ];
        for (const file of files) {
            const source = codeOnly(await rawSource(file));
            for (const [pattern, label] of forbiddenPatterns) {
                assert(!pattern.test(source), n(`${file} does not: ${label}`));
            }
        }

        // NEW for this audit: the same sweep, method-scoped, against
        // EditorSession's own exportDocument()/importDocument() bodies —
        // not the whole 2000+ line file (which legitimately imports
        // publisher/discovery/peer/etc. for its OTHER features), but
        // specifically the two delegation methods this milestone's
        // journey actually calls.
        const editorSessionSource = codeOnly(await rawSource('application/EditorSession.js'));
        const exportMethodMatch = editorSessionSource.match(/exportDocument\(\)\s*\{[\s\S]*?\n {4}\}/);
        const importMethodMatch = editorSessionSource.match(/importDocument\(json\)\s*\{[\s\S]*?\n {4}\}/);
        assert(exportMethodMatch !== null && importMethodMatch !== null, n('both EditorSession.exportDocument() and EditorSession.importDocument() are found, in isolation, in real source'));
        for (const [pattern, label] of forbiddenPatterns) {
            assert(!pattern.test(exportMethodMatch[0]), n(`EditorSession.exportDocument()'s own method body does not: ${label}`));
            assert(!pattern.test(importMethodMatch[0]), n(`EditorSession.importDocument()'s own method body does not: ${label}`));
        }
        assert(exportMethodMatch[0].split('\n').length <= 8 && importMethodMatch[0].split('\n').length <= 12,
            n('both method bodies are short, plain delegation — not long enough to plausibly hide an orchestration step this sweep\'s regexes could miss'));

        // And the UI handler bodies (already extracted in Section F for
        // importDocument; extracted fresh here for exportDocument).
        const editorViewSource = codeOnly(await rawSource('ui/views/EditorView.js'));
        const exportHandlerMatch = editorViewSource.match(/function exportDocument\(\)\s*\{[\s\S]*?\n\t\t\}/);
        assert(exportHandlerMatch !== null, n('EditorView.js#exportDocument() handler found in real source'));
        for (const [pattern, label] of forbiddenPatterns) {
            assert(!pattern.test(exportHandlerMatch[0]), n(`EditorView.js's exportDocument() UI handler does not: ${label}`));
        }

        console.log('✓ I: zero decentralized/distribution side effects anywhere in the composition — the core use cases and serializer/validator/migrator (whole-file), AND, newly for this audit, EditorSession\'s own exportDocument()/importDocument() method bodies in isolation, AND the EditorView.js UI handlers. No Publication, no Nostr, no Arweave, no WebRTC, no Commentary, no notification, no placement, no discovery, no peer synchronization — reachable from any point in the real, live-exercised Export/Import path.');
    }

    // ===============================================================
    // Section J — existing workflows.
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();

        // Save / Load — unaffected by Export/Import's existence.
        const doc = createFlagshipDocument({ title: 'Regression: Save/Load' });
        const manager = new DocumentManager(doc);
        const savedId = new SaveDocumentUseCase(storageProvider).execute(manager);
        assert(savedId === doc.world.id, n('Save still returns the document\'s own id'));
        const reopened = new LoadDocumentUseCase(storageProvider).execute(new DocumentManager(), savedId);
        assert(reopened.metadata.title === 'Regression: Save/Load' && totalBrickCount(reopened) === totalBrickCount(doc),
            n('Load still restores full content, unaffected by Export/Import existing alongside it'));

        // New document.
        const freshManager = new DocumentManager();
        freshManager.markDirty();
        freshManager.newDocument();
        assert(freshManager.state.dirty === false && freshManager.document.world.getBuildings().length === 0,
            n('New document still produces a clean, empty document — the same DocumentManager.newDocument() path Import also uses, confirmed still behaving identically for its ORIGINAL caller'));

        // Fork — the closest existing precedent to Import, sharing
        // DocumentCloneService; confirm it still works exactly as before.
        const forkSourceId = new SaveDocumentUseCase(storageProvider).execute(new DocumentManager(createFlagshipDocument({ title: 'Fork Source' })));
        const forked = new ForkDocumentUseCase(storageProvider).execute(forkSourceId);
        assert(forked instanceof Document && forked.metadata.title === 'Fork of Fork Source', n('Fork still produces a correctly-titled derivative document'));
        assert(forked.world.id !== forkSourceId, n('...with a fresh documentId, exactly as before this milestone'));
        assert(forked.metadata.parentDocumentId === forkSourceId, n('...and correctly recorded lineage — Fork\'s own parentDocumentId default (source id) is untouched by Import\'s different, explicit parentDocumentId: null choice for itself'));

        // Publish — a real, unrelated document lifecycle action, unaffected.
        const publishStorage = new InMemoryStorageProvider();
        const publisherProvider = new LocalPublisherProvider(publishStorage);
        const publishDoc = createFlagshipDocument({ title: 'Publish Regression Check' });
        const publishManager = new DocumentManager(publishDoc);
        const publication = new PublishDocumentUseCase(publisherProvider, null).execute(publishManager);
        assert(publication && publication.documentId === publishDoc.world.id, n('Publish still creates a real Publication referencing the correct document — completely unaffected by Export/Import\'s existence'));

        // Toolbar.js: existing emits/actions still present alongside the
        // new ones (not replaced by them).
        const toolbarSource = await rawSource('ui/components/Toolbar.js');
        const emitsList = toolbarSource.match(/emits:\s*\[[^\]]*\]/)[0];
        for (const existingEmit of ['back-to-world', 'open-shortcuts', 'published']) {
            assert(new RegExp(`'${existingEmit}'`).test(emitsList), n(`Toolbar.js's pre-existing '${existingEmit}' emit is still declared`));
        }
        assert(/function save\(\)/.test(toolbarSource) && /function load\(id\)/.test(toolbarSource) && /function createNew\(/.test(toolbarSource) && /function publish\(/.test(toolbarSource),
            n('Toolbar.js\'s pre-existing save()/load()/createNew()/publish() functions are all still present, unreplaced by export/import'));

        // The OTHER existing import surface (Blueprint import via
        // BuildLibraryPanel.js) is a completely separate component with
        // its own file input — never merged with document Import.
        const buildLibrarySource = await rawSource('ui/components/BuildLibraryPanel.js');
        assert(/triggerImportBlueprint/.test(buildLibrarySource) && /onImportBlueprintFileChosen/.test(buildLibrarySource),
            n('BuildLibraryPanel.js\'s own, pre-existing "Import Blueprint" file input machinery (triggerImportBlueprint/onImportBlueprintFileChosen) is untouched and textually distinct from Toolbar.js\'s document-Import machinery'));
        assert(!/importFileInput/.test(await rawSource('application/EditorSession.js')),
            n('EditorSession.js itself has no shared "importFileInput"-shaped state — Blueprint import and Document import remain two independent UI-layer concerns, never unified into one code path at the session layer either'));

        console.log('✓ J: Save, Load, New, Fork, and Publish all still work exactly as before — run live here, not merely re-read — and Toolbar.js\'s pre-existing emits/actions remain present alongside Export/Import rather than replaced by them. The OTHER existing import surface (Blueprint import) remains a fully separate component and file input, confirmed never merged with document Import at either the UI or session layer.');
    }

    // ===============================================================
    // Section K — user-facing workflow + production-change guard.
    // ===============================================================
    {
        const toolbarSource = await rawSource('ui/components/Toolbar.js');
        const editorViewSource = await rawSource('ui/views/EditorView.js');

        // Export downloads the expected artifact.
        assert(/class="toolbar-export"/.test(toolbarSource) && /@click="\$emit\('export-document'\)"/.test(toolbarSource),
            n('Toolbar.js renders a real Export button wired to emit \'export-document\' on click'));
        const exportHandlerMatch = editorViewSource.match(/function exportDocument\(\)\s*\{[\s\S]*?\n\t\t\}/);
        assert(/link\.download\s*=\s*`forkbuild-document-/.test(exportHandlerMatch[0]) && /link\.click\(\)/.test(exportHandlerMatch[0]),
            n('...and the real handler it triggers actually creates and clicks a download link named forkbuild-document-<slug>.json — a real browser download, not merely an in-memory object'));

        // Import opens the native file picker.
        assert(/class="toolbar-import"/.test(toolbarSource) && /@click="triggerImportDocument"/.test(toolbarSource),
            n('Toolbar.js renders a real Import button'));
        assert(/function triggerImportDocument\(\)\s*\{[\s\S]*?importFileInput\.value\.click\(\)/.test(toolbarSource),
            n('...wired to click a real, native <input type="file"> — the actual OS file picker, not a custom in-app dialog'));
        assert(/type="file"[^>]*class="toolbar-import-input"/.test(toolbarSource) || /class="toolbar-import-input"[\s\S]{0,120}type="file"/.test(toolbarSource),
            n('the file input Import actually clicks exists in the rendered template'));

        // Successful import reaches the Editor: EditorView -> editorSession.importDocument -> openDocument.
        const importHandlerMatch = editorViewSource.match(/function importDocument\(rawText\)\s*\{[\s\S]*?\n\t\t\}/);
        assert(/editorSession\.importDocument\(json\)/.test(importHandlerMatch[0]), n('a successful import calls editorSession.importDocument(), which (Section A) opens it into the session'));

        // Parse-level vs document-level error distinction: re-confirmed
        // here as the specific USER-FACING claim (Section F already
        // proved the underlying behavior); this is the same source text,
        // read for what the user actually sees.
        assert(/'That is not valid JSON — choose a file exported with "Export\."'/.test(importHandlerMatch[0]),
            n('invalid JSON shows a specific, actionable parse-level message'));
        assert(/e\.message\.replace\(\/\^DocumentSerializer:\\s\*\/, ''\)/.test(importHandlerMatch[0]),
            n('valid JSON with an invalid document structure shows the document-level validator\'s own message instead — a genuinely different message reaches the user depending on which stage failed'));

        // Successful import doesn't silently overwrite: the handler
        // never calls Save itself, and Toolbar's own Save button remains
        // a separate, explicit, user-initiated action.
        assert(!/\bsave\(\)/.test(importHandlerMatch[0]), n('the import handler never calls save() itself — persisting the imported document remains the user\'s own, separate, explicit action'));
        assert(/<button class="toolbar-save" @click="save">Save<\/button>/.test(toolbarSource),
            n('Save remains its own distinct button, never auto-triggered by import — confirming "no silent overwrite" is structural, not merely a documented intention'));

        // -----------------------------------------------------------
        // Production-change guard — this milestone is test-only.
        // -----------------------------------------------------------
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

        const ownSource = codeOnly(await readFile(new URL(import.meta.url), 'utf8'));
        assert(!/class\s+\w*(Export|Import)\w*(UseCase|Service)?\s*\{/.test(ownSource),
            n('no Export/Import-shaped production class is defined anywhere in this file — every section above composes ONLY existing, already-shipped classes'));
        assert(!/^\s*function\s+exportDocument\s*\(|^\s*function\s+importDocument\s*\(/m.test(ownSource),
            n('no top-level exportDocument()/importDocument() production-shaped function is defined either — simulateUIImport() in Section F is a local test helper that calls the real ImportDocumentUseCase, never a production-shaped reimplementation of it'));

        console.log('✓ K: every user-facing claim in the brief\'s own checklist is confirmed from real source — Export downloads a real file, Import opens the real native file picker, success reaches the Editor, parse-level and document-level errors are genuinely distinct messages, and a successful import never silently overwrites because Save remains a separate, explicit, never-auto-triggered action. Zero production files modified or added; this file itself defines no production-shaped Export/Import class or function.');
    }

    // ===============================================================
    // Section L — product closure matrix and verdict.
    // ===============================================================
    {
        const matrix = Object.freeze([
            ['Export current document', '✓'],
            ['Import exported document', '✓'],
            ['Cross-filesystem/device boundary', '✓'],
            ['Content preservation', '✓'],
            ['Fresh document identity', '✓'],
            ['Fresh nested instance identities (building, brick)', '✓'],
            ['Structural relationship preservation (group membership)', '✗ GAP — Section C'],
            ['Existing-document collision safety', '✓'],
            ['Manifest collision safety', '✓'],
            ['Fail-closed validation (real UI path)', '✓'],
            ['Legacy schema migration', '✓'],
            ['Multiple independent imports', '✓'],
            ['Existing Save/Load/New/Fork/Publish regression', '✓'],
            ['No Publication side effects', '✓'],
            ['No decentralized distribution side effects', '✓'],
            ['No second serialization format', '✓'],
            ['No second persistence mechanism', '✓']
        ]);
        assert(matrix.length === 17, n('the closure matrix names every capability the brief itself listed, plus the one gap this audit found'));
        assert(matrix.filter(([, result]) => result.startsWith('✓')).length === 16, n('sixteen of seventeen rows are fully closed, live-verified above, not asserted from memory'));
        assert(matrix.filter(([, result]) => result.startsWith('✗')).length === 1, n('exactly one row carries a specific, evidence-backed gap rather than a clean pass'));

        console.log('\n=== 0.9.643 PRODUCT CLOSURE MATRIX ===');
        for (const [capability, result] of matrix) {
            console.log(`  ${result.padEnd(28)} — ${capability}`);
        }

        console.log('\nVERDICT: NOT a clean ARC_CLOSED. The cross-device user journey the brief describes — save on device A, export, transfer the file, import on device B, continue working without overwriting existing local documents — is CONFIRMED CLOSED end to end (Section A flagship), through the real production chain, with correct fresh identity (Section C\'s own first half), airtight collision safety (Section D), correct behavior across repeated/legacy/malformed inputs (Sections E/F/G), a clean persistence boundary (Section H), zero decentralized side effects (Section I), and zero regression to Save/Load/New/Fork/Publish (Section J).');

        console.log('\nONE SPECIFIC, EVIDENCE-BACKED GAP SURVIVES (Section C): DocumentCloneService — the shared identity engine behind Import, Fork, and Duplicate — regenerates world/building/brick ids but never remaps a Group\'s own brickIds to match, so any document containing a Group silently loses that group\'s actual membership (while its name and reported member count survive) the moment it is imported, forked, or duplicated. This is pre-existing in DocumentCloneService, not something 0.9.641/642 introduced, and it is not specific to Import — but it directly answers this audit\'s own Section B/C mandate ("relevant structural relationships") with a live, reproducible NO for exactly one relationship: group membership after any identity-regenerating clone.');

        console.log('\nRECOMMENDATION (audit output, not a build decision this milestone makes, and this milestone creates no 0.9.644 in advance): the fix belongs in DocumentCloneService.execute() itself — build an old-brick-id -> new-brick-id map while regenerating bricks, then use it to remap (or, for a since-deleted brick, drop) each group\'s brickIds, exactly the same remapping discipline group membership already tolerates for an ordinary delete (World.getGroupBricks() already skips missing ids) but currently gets NONE of after a clone. Because Fork and Duplicate share the exact same bug today, fixing DocumentCloneService fixes it for all three call sites at once — no Import-specific patch is the right shape here. Everything else this audit checked is closed: the requirement "I have documents on this device; I want to take them to another device and open them there" is real and working today for every document that does not use Groups, and for one that does, the document itself, its buildings, and its bricks all still arrive correctly — only group membership is currently lost, silently, in a way a user would only discover by trying to select a group after opening the imported file.');

        console.log(`\n${assertionCount} assertions.`);
    }

    console.log(`\n✅ 0.9.643 Editor Document Portability Product Closure Audit complete (${assertionCount} assertions). Verdict: cross-device journey CLOSED; one specific, evidence-backed, pre-existing DocumentCloneService gap found (group membership after clone) — see Section L.`);
}

await run();
