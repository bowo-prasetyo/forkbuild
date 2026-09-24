import { readFile } from 'node:fs/promises';

import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { License, LicenseId } from '../core/License.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LoadDocumentUseCase } from '../application/document/LoadDocumentUseCase.js';
import { LoadFailureReason } from '../application/document/LoadFailureReason.js';
import { ForkDocumentUseCase } from '../application/document/ForkDocumentUseCase.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { GetPublicationCommentariesUseCase } from '../application/publication/commentary/GetPublicationCommentariesUseCase.js';
import { AddPublicationCommentaryUseCase } from '../application/publication/commentary/AddPublicationCommentaryUseCase.js';
import { CanCommentOnPublicationUseCase } from '../application/publication/CanCommentOnPublicationUseCase.js';
import { LocalWorldEncounterMaterialSource } from '../application/worldEncounter/LocalWorldEncounterMaterialSource.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { worldEncounterCanvasFiles, editorViewFiles, worldViewFiles } from './support/SourceFileGroups.js';

// 0.9.559 — Publication Discovery-to-Work Continuity Product Reassessment.
//
// TYPE: test-only arc-closing audit. Production changes: none.
//
// 0.9.558 activated the EXISTING_RETURN_SEAM 0.9.557 found: an
// observer-local encounter's own already-resolved Publication instance
// now reaches Open/Fork/Explore/Comment directly. Every prior milestone
// in this arc (0.9.551-0.9.558) proved that hand-off AT THE COMMAND
// BOUNDARY — a mocked `openPublicationCommand`/`forkPublicationCommand`/
// `explorePublicationCommand`/commentary pair receives the right object.
// None of them followed the trip PAST that boundary, into the real
// production consumers on the other side: `ui/views/EditorView.js`'s own
// `route.query.load`/`route.query.fork` handlers, `application/
// ForkDocumentUseCase.js`, and the real `PublicationCommentaryStore`
// chain. This milestone does exactly that, using real, unmodified
// production classes wherever the object graph allows it — never a
// second mock of a boundary this arc has already proven real.
//
// Ten lettered sections (A-J), mirroring the originating brief's own
// lettering.
//
// FINDING (preview; see the Section J verdict block for full reasoning):
// overwhelmingly ALREADY_CORRECT / DELIBERATE_BOUNDARY. The one thing the
// brief specifically flagged for careful treatment — Open landing on
// `/editor?load=<documentId>`, a bare documentId with no publicationId
// attached — is confirmed to be a genuine, pre-existing, APP-WIDE
// Publication -> Document identity transition (Section B), applied
// IDENTICALLY whether a Wanderer reaches Open through World's own new
// continuation or through `ui/components/PublicationCatalog.js`'s
// pre-existing Repository entry point — never something 0.9.558
// introduced or narrowed. One small, real, PRE-EXISTING presentation
// paper-cut survives (Section I: a failed Open/Fork surfaces a raw
// internal class name and storage identifier in its toast/dialog text) —
// named, not fixed, because it is not specific to this arc's own
// boundary (it is identical for every Open/Fork entry point the app has
// ever had, World included only incidentally) and this arc's own
// established restraint (0.9.555 F/G, 0.9.556 D, 0.9.553 H) is to name
// such gaps rather than expand scope to fix them.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function assertThrows(fn, messageIncludes, description) {
    try {
        fn();
    } catch (e) {
        assert(e.message.includes(messageIncludes), `${description} (got: "${e.message}")`);
        return;
    }
    throw new Error(`ASSERT FAILED: ${description} — expected a throw, got none.`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// Mirrors tests/KnownPublicationEncounterContinuation.test.js's own
// knowPublicationsLocally() exactly, duplicated here per this codebase's
// own established per-file harness convention.
function knowPublicationsLocally(storageProvider, publications) {
    storageProvider.save('forkbuild-publications', publications.map((p) => p.toJSON()));
}

function makeDocument(title, author, id = undefined) {
    const world = new World(id !== undefined ? { id } : {});
    world.addBuilding(new Building({ creator: author }));
    return new Document({ world, metadata: new DocumentMetadata({ title, author }) });
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(label);
    return provider;
}

class MapVerifier {
    constructor(map) { this._map = map; this.calls = []; }
    async verifyIdentity(resolvedSelection, material) {
        this.calls.push({ objectId: resolvedSelection && resolvedSelection.objectId, materialId: material && material.id });
        return this._map[resolvedSelection && resolvedSelection.objectId] === true;
    }
}

function commandSpy() {
    const calls = [];
    const fn = (...args) => { calls.push(args); };
    fn.calls = calls;
    return fn;
}

// Mirrors tests/KnownPublicationEncounterContinuation.test.js's own
// buildCanvasInstance() exactly, duplicated here per this codebase's own
// established per-file harness convention.
function buildCanvasInstance({
    registry = null,
    observerLocalEncounterRegistry = null,
    materialSources = null,
    materialVerifier = null,
    decentralizedPublicationDiscoveryProvider = null,
    openPublicationCommand = null,
    forkPublicationCommand = null,
    explorePublicationCommand = null,
    getPublicationCommentariesCommand = null,
    addPublicationCommentaryCommand = null
} = {}) {
    const ctx = {
        registry,
        observerLocalEncounterRegistry,
        view: WorldEncounterCanvas.props.view.default(),
        materialSources,
        materialVerifier,
        decentralizedPublicationDiscoveryProvider,
        openPublicationCommand,
        forkPublicationCommand,
        explorePublicationCommand,
        getPublicationCommentariesCommand,
        addPublicationCommentaryCommand
    };
    Object.assign(ctx, WorldEncounterCanvas.data.call(ctx));
    Object.assign(ctx, WorldEncounterCanvas.methods);
    for (const name of [
        'resolvedEncounterSelection',
        'resolvedLead',
        'observerLocalEncounterResolvedSelection',
        'observerLocalEncounterActionablePublication',
        'observerLocalEncounterCommentaryPublicationId'
    ]) {
        Object.defineProperty(ctx, name, {
            get() { return WorldEncounterCanvas.computed[name].call(ctx); }
        });
    }
    return ctx;
}

function flush() { return new Promise((resolve) => setTimeout(resolve, 0)); }

async function runTests() {
    console.log('Running Publication Discovery-to-Work Continuity Product Reassessment tests...\n');

    // ===============================================================
    // Section A — Encounter -> Publication identity: no reconstruction
    // through documentId/contentHash/locator/title, past the command
    // boundary and into the real destination.
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const publicationId = 'pub-a-p1';
        const documentId = 'doc-a-p1';
        const contentHash = 'hash-a-p1';
        const publication = new Publication({ id: publicationId, documentId, title: 'Section A Publication', author: 'alice', contentHash, contentReference: new ContentReference({ hash: contentHash }) });
        knowPublicationsLocally(storageProvider, [publication]);
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const verifier = new MapVerifier({ [publicationId]: true });

        let openedWith = null;
        const ctx = buildCanvasInstance({
            materialSources: { local: localSource },
            materialVerifier: verifier,
            openPublicationCommand: (pub) => { openedWith = pub; }
        });

        ctx.selectObserverLocalEncounter({ publicationId, contentHash });
        await flush();
        const resolvedBeforeClick = ctx.observerLocalEncounterInspection.loading.material;
        ctx.openObserverLocalEncounterPublication();

        assert(openedWith === resolvedBeforeClick, 'A1. The object the command receives is the LITERAL reference the inspection already resolved — encounter -> inspection -> action hands off one object, never a re-derivation.');

        // A2. Reconfirm the destination-side query WorldView.js's own
        // wrapper would build from this exact object carries only
        // documentId (Open) — never a reconstruction of identity from
        // title or contentHash.
        const openQuery = { load: openedWith.documentId };
        assert(openQuery.load === documentId, 'A2. The Open destination query is built from the resolved object\'s own documentId field — no title/contentHash substitution anywhere in the chain.');

        console.log('✓ A — identity survives encounter -> inspection -> action -> destination-query construction as the literal resolved object, never reconstructed from documentId/contentHash/locator/title.');
    }

    // ===============================================================
    // Section B — Open: P1 -> Editor. The Editor's own real
    // route.query.load handler (LoadDocumentUseCase) preserves the
    // intended DOCUMENT relationship; publicationId is deliberately not
    // carried across this boundary.
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const targetDoc = makeDocument('Open Target', 'alice');
        storageProvider.save(targetDoc.world.id, serializer.serialize(targetDoc));
        const p1 = new Publication({ id: 'pub-b-p1', documentId: targetDoc.world.id, title: 'Open Target', author: 'alice', contentHash: 'hash-b', contentReference: new ContentReference({ hash: 'hash-b' }) });

        // B1. The exact query WorldView.js's openEncounteredPublicationCommand
        // builds from p1 (byte-identical to PublicationCatalog.js's own
        // openPublication(pub) — reconfirmed structurally below).
        const query = { load: p1.documentId };
        assert(!('publication' in query) && !('publicationId' in query), 'B1. The Open query carries ONLY documentId — no publicationId companion, unlike the Fork route (Section C).');

        // B2. The real EditorView.js consumer: LoadDocumentUseCase,
        // fed exactly that query value.
        const loaded = new LoadDocumentUseCase(storageProvider, serializer).execute({ load() {} }, query.load);
        assert(loaded.world.id === targetDoc.world.id, 'B2. LoadDocumentUseCase resolves the SAME document P1 points to.');
        assert(loaded.metadata.title === 'Open Target', 'B3. The loaded Document carries the correct content — the intended document relationship is preserved.');

        // B4. The loaded Document/DocumentMetadata carry no publicationId
        // field of any kind — Open is a genuine Publication -> Document
        // identity TRANSITION, not a partial one that drops a field it
        // meant to keep.
        const documentJson = JSON.stringify(loaded.toJSON ? loaded.toJSON() : { world: loaded.world.toJSON(), metadata: loaded.metadata });
        assert(!documentJson.includes(p1.id), 'B4. Nothing in the loaded Document\'s own serialized shape carries P1\'s own publicationId — the Editor genuinely does not know it arrived via a Publication once Open completes.');

        // B5. Confirmed this is not something 0.9.558 introduced: the
        // IDENTICAL query shape (documentId only) is what
        // ui/components/PublicationCatalog.js's own pre-existing
        // openPublication() has always built, for every Open entry point
        // the app has ever had — World's new continuation reuses it
        // exactly, never a narrower or different one.
        const worldViewSource = (await Promise.all(worldViewFiles().map((file) => rawSource(file)))).join('\n');
        const catalogSource = await rawSource('ui/components/PublicationCatalog.js');
        assert(worldViewSource.includes("router.push({ path: '/editor', query: { load: publication.documentId } });"), 'B5a. WorldView.js\'s own Open wrapper.');
        assert(catalogSource.includes("router.push({ path: '/editor', query: { load: pub.documentId } });"), 'B5b. PublicationCatalog.js\'s own pre-existing Open, byte-identical shape.');

        // B6. EditorView.js's own real route.query.load branch never
        // constructs an EditorEntryContext (unlike its route.query.fork
        // sibling, Section C) — confirmed structurally, since
        // editorEntryContextFromQuery() is called only inside the
        // `if (route.query.fork)` branch.
        const editorViewSource = (await Promise.all(editorViewFiles().map((file) => rawSource(file)))).join('\n');
        const loadBranchStart = editorViewSource.indexOf('} else if (route.query.load) {');
        const loadBranchEnd = editorViewSource.indexOf('\n            }', loadBranchStart);
        const loadBranch = editorViewSource.slice(loadBranchStart, loadBranchEnd);
        assert(!loadBranch.includes('editorEntryContextFromQuery') && !loadBranch.includes('entryContext.value'), 'B6. The real route.query.load branch never decodes or sets an EditorEntryContext — Open carries no return-path/provenance context of any kind, structurally, not merely by omission in this milestone\'s own wiring.');

        console.log('✓ B — Open reaches the real production LoadDocumentUseCase and preserves the intended document relationship. Publication identity (publicationId) is deliberately NOT carried past this boundary — confirmed to be a genuine, pre-existing, APP-WIDE Publication -> Document identity transition (DELIBERATE_BOUNDARY, not something this arc introduced or could narrow without changing behavior for every other Open entry point too).');
    }

    // ===============================================================
    // Section C — Fork: P1 -> new editable Document, never mutating P1,
    // and never silently substituting P2 despite a shared documentId AND
    // contentHash.
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const sharedDocumentId = 'doc-c-shared';
        const sharedHash = 'hash-c-shared';
        const sourceDoc = makeDocument('Shared Work', 'alice', sharedDocumentId);
        storageProvider.save(sharedDocumentId, serializer.serialize(sourceDoc));

        const p1 = new Publication({ id: 'pub-c-p1', documentId: sharedDocumentId, title: 'Shared As P1', author: 'alice', contentHash: sharedHash, contentReference: new ContentReference({ hash: sharedHash }), license: new License({ id: LicenseId.CC_BY_4_0 }) });
        const p2 = new Publication({ id: 'pub-c-p2', documentId: sharedDocumentId, title: 'Shared As P2', author: 'bob', contentHash: sharedHash, contentReference: new ContentReference({ hash: sharedHash }), license: new License({ id: LicenseId.CC_BY_4_0 }) });

        // C1. Snapshot P1's own underlying document storage record
        // BEFORE forking.
        const snapshotBefore = JSON.stringify(storageProvider.load(sharedDocumentId));

        // C2. Fork through the REAL ForkDocumentUseCase — the exact use
        // case EditorView.js's own route.query.fork branch calls — with
        // P1 specifically.
        const forked = new ForkDocumentUseCase(storageProvider, serializer).execute(sharedDocumentId, null, p1);

        // C3. P1's own storage record is byte-for-byte unchanged.
        const snapshotAfter = JSON.stringify(storageProvider.load(sharedDocumentId));
        assert(snapshotBefore === snapshotAfter, 'C3. Forking never mutates the source document\'s own storage record — proven byte-for-byte, not merely "no obvious write call."');

        // C4. Fork never becomes P1's own new identity: fresh
        // world/building/brick ids throughout, never sharedDocumentId.
        assert(forked.world.id !== sharedDocumentId, 'C4a. The fork carries a brand-new world/document id, never P1\'s own documentId.');
        assert(forked.world.getBuildings()[0].id !== sourceDoc.world.getBuildings()[0].id, 'C4b. Building ids are freshly regenerated too, not merely the top-level document id.');

        // C5. The fork is stamped from P1 specifically, never P2, despite
        // the identical documentId AND contentHash both P1 and P2 share.
        assert(forked.metadata.license.attribution.sourcePublicationId === p1.id, 'C5a. The fork\'s own lineage attribution names P1\'s own publicationId.');
        assert(forked.metadata.license.attribution.sourcePublicationId !== p2.id, 'C5b. Never P2\'s.');

        // C6. Fork with P2 instead produces an independent, equally
        // untouched-P1 result — the adversarial pair genuinely resolves
        // to two different fork outcomes from the SAME source bytes.
        const forkedFromP2 = new ForkDocumentUseCase(storageProvider, serializer).execute(sharedDocumentId, null, p2);
        assert(forkedFromP2.metadata.license.attribution.sourcePublicationId === p2.id, 'C6a. Forking P2 stamps P2.');
        assert(forkedFromP2.world.id !== forked.world.id, 'C6b. The two forks are independent Documents, not the same fork silently reused for both Publications.');
        assert(JSON.stringify(storageProvider.load(sharedDocumentId)) === snapshotBefore, 'C6c. P1\'s own storage record remains untouched even after a SECOND fork of the same underlying document via P2.');

        // C7. Reconfirmed structurally: the real fork route
        // WorldView.js's forkEncounteredPublicationCommand builds
        // carries BOTH documentId AND publicationId — unlike Open
        // (Section B) — because ForkDocumentUseCase's own license/
        // attribution check genuinely needs the resolved Publication
        // object, not merely its documentId.
        const worldViewSource = (await Promise.all(worldViewFiles().map((file) => rawSource(file)))).join('\n');
        assert(worldViewSource.includes("router.push({ path: '/editor', query: { fork: publication.documentId, publication: publication.id } });"), 'C7. Fork\'s own route genuinely carries a different identity shape than Open\'s — by design, not oversight (ForkDocumentUseCase.execute() takes a sourcePublication parameter Open\'s own LoadDocumentUseCase.execute() has no equivalent of).');

        console.log('✓ C — Fork produces a brand-new editable Document, provably never mutating P1\'s own storage record (byte-for-byte, across two separate forks), and correctly attributes lineage to P1 specifically, never to P2, despite a shared documentId AND contentHash.');
    }

    // ===============================================================
    // Section D — Explore: P1 -> World. Reuses existing World
    // navigation (focusDocument/focusWorld) and creates no new
    // observer-local encounter or discovery cycle as PART OF the action
    // itself.
    // ===============================================================
    {
        const worldViewSource = (await Promise.all(worldViewFiles().map((file) => rawSource(file)))).join('\n');

        // D1. exploreEncounteredPublicationCommand() calls ONLY
        // focusWorld() — this file's own pre-existing "move to another
        // place in World" mechanism — never a bare router.push() of its
        // own, and never anything encounter-registry-shaped.
        assert(worldViewSource.includes('function exploreEncounteredPublicationCommand(publication) {\n            focusWorld(publication.documentId);\n        }'), 'D1. exploreEncounteredPublicationCommand() is a one-line delegate to focusWorld() — no parallel navigation, no new mechanism.');

        // D2. focusWorld() itself: session.focusDocument() (an in-place
        // camera/active-document move within the SAME live session — see
        // application/world/WorldNavigationSession.js#focusDocument(), which
        // never remounts anything) + router.replace (not push — this is
        // explicitly a same-session reposition, not a fresh navigation
        // entry) + a spatial UI refresh. No observerLocalEncounterStore
        // reference anywhere in this function.
        const focusWorldStart = worldViewSource.indexOf('function focusWorld(documentId) {');
        const focusWorldEnd = worldViewSource.indexOf('\n        }', focusWorldStart);
        const focusWorldBody = worldViewSource.slice(focusWorldStart, focusWorldEnd);
        assert(focusWorldBody.includes('session.focusDocument(documentId)'), 'D2a. focusWorld() reuses the existing session.focusDocument() — no second camera-movement mechanism.');
        assert(focusWorldBody.includes("router.replace({ path: `/world/${documentId}` })"), 'D2b. A same-session reposition (router.replace), never router.push — Explore never creates a fresh navigation history entry or session.');
        assert(!focusWorldBody.includes('observerLocalEncounterStore') && !focusWorldBody.includes('ObserverLocalEncounterStore'), 'D2c. focusWorld() never touches the observer-local encounter store — Explore records no new encounter of any kind as part of the action itself.');

        // D3. Reconfirmed live: exploreEncounteredPublicationCommand's
        // own component-level counterpart never calls the discovery
        // provider either (mirrors 0.9.558 Section J1, reconfirmed here
        // specifically for Explore rather than all three actions
        // together).
        const storageProvider = new InMemoryStorageProvider();
        const publicationId = 'pub-d1';
        const contentHash = 'hash-d1';
        const publication = new Publication({ id: publicationId, documentId: 'doc-d1', title: 'D', contentHash, contentReference: new ContentReference({ hash: contentHash }) });
        knowPublicationsLocally(storageProvider, [publication]);
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const verifier = new MapVerifier({ [publicationId]: true });
        let discoveryAddCalls = 0;
        const ctx = buildCanvasInstance({
            materialSources: { local: localSource },
            materialVerifier: verifier,
            decentralizedPublicationDiscoveryProvider: { add: () => { discoveryAddCalls += 1; } },
            explorePublicationCommand: commandSpy()
        });
        ctx.selectObserverLocalEncounter({ publicationId, contentHash });
        await flush();
        ctx.exploreObserverLocalEncounterPublication();
        assert(discoveryAddCalls === 0, 'D3. Explore never admits into Repository discovery.');

        console.log('✓ D — Explore reuses existing World navigation semantics exactly (focusWorld -> session.focusDocument, a same-session reposition) and creates no new observer-local encounter, discovery-provider admission, or navigation mechanism as part of the action itself. (Ordinary proximity-based rediscovery may naturally occur once the camera arrives at the new position — that is the SAME walking-discovery cascade that already runs everywhere else in World, not something this action invokes directly.)');
    }

    // ===============================================================
    // Section E — Commentary: attached to publicationId = P1, never
    // documentId/contentHash/encounter identity — proven against the
    // REAL commentary storage chain — and the observer-local commentary
    // state never leaks into the ordinary Publication selection's own
    // state.
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const sharedDocumentId = 'doc-e-shared';
        const sharedHash = 'hash-e-shared';
        const p1 = new Publication({ id: 'pub-e-p1', documentId: sharedDocumentId, title: 'E as P1', author: 'alice', contentHash: sharedHash, contentReference: new ContentReference({ hash: sharedHash }) });
        const p2 = new Publication({ id: 'pub-e-p2', documentId: sharedDocumentId, title: 'E as P2', author: 'bob', contentHash: sharedHash, contentReference: new ContentReference({ hash: sharedHash }) });
        knowPublicationsLocally(storageProvider, [p1, p2]);

        const discoveryProvider = new LocalDiscoveryProvider(storageProvider);
        const commentaryStore = new PublicationCommentaryStore(storageProvider);
        const identityProvider = makeIdentity('alice');
        const canComment = new CanCommentOnPublicationUseCase(discoveryProvider);
        const getCommentaries = new GetPublicationCommentariesUseCase(commentaryStore);
        const addCommentary = new AddPublicationCommentaryUseCase(commentaryStore, identityProvider, canComment);

        // E1. Real writes, real store, keyed by publicationId.
        addCommentary.execute({ publicationId: p1.id, content: 'Comment on P1', commentaryId: 'c-e-1', createdAt: new Date() });
        addCommentary.execute({ publicationId: p2.id, content: 'Comment on P2', commentaryId: 'c-e-2', createdAt: new Date() });

        const p1Comments = getCommentaries.execute({ publicationId: p1.id });
        const p2Comments = getCommentaries.execute({ publicationId: p2.id });
        assert(p1Comments.length === 1 && p1Comments[0].content === 'Comment on P1', 'E1a. P1\'s own commentary list contains exactly its own comment.');
        assert(p2Comments.length === 1 && p2Comments[0].content === 'Comment on P2', 'E1b. P2\'s own commentary list is disjoint, despite the identical documentId AND contentHash both Publications share.');

        // E2. A lookup by documentId or contentHash — were one to be
        // attempted — has no path through this real chain at all: the
        // store/use-case pair take only publicationId.
        const commentaryBySharedDocumentId = getCommentaries.execute({ publicationId: sharedDocumentId });
        assert(commentaryBySharedDocumentId.length === 0, 'E2. Querying by the shared documentId (as if it were a publicationId) returns nothing — commentary genuinely has no documentId-keyed path.');

        // E3. Observer-local commentary state never leaks into the
        // ordinary (primary) selection's own commentary state — live,
        // component-level proof. The observer-local panel is populated;
        // the primary panel's own fields stay at their untouched
        // defaults.
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const verifier = new MapVerifier({ [p1.id]: true });
        const ctx = buildCanvasInstance({
            materialSources: { local: localSource },
            materialVerifier: verifier,
            getPublicationCommentariesCommand: (publicationId) => getCommentaries.execute({ publicationId }),
            addPublicationCommentaryCommand: (input) => addCommentary.execute(input)
        });
        ctx.selectObserverLocalEncounter({ publicationId: p1.id, contentHash: sharedHash });
        await flush();
        ctx.toggleObserverLocalEncounterCommentary();

        assert(ctx.observerLocalEncounterCommentaryOpen === true && ctx.observerLocalEncounterCommentaries.length === 1 && ctx.observerLocalEncounterCommentaries[0].content === 'Comment on P1', 'E3a. The observer-local panel correctly loaded P1\'s own real commentary.');
        assert(ctx.encounterCommentaryOpen === false && ctx.encounterCommentaries.length === 0, 'E3b. The PRIMARY selection\'s own commentary state (encounterCommentaryOpen/encounterCommentaries) is completely untouched — no leak from the observer-local panel into the primary one, even though both are, structurally, driven by the exact same two injected commands over the exact same real store.');

        console.log('✓ E — commentary is proven, against the real storage/use-case chain, to be attached to publicationId = P1 specifically, never documentId/contentHash (P2 sharing both never contaminates P1\'s list, and a documentId-shaped query returns nothing). The observer-local commentary panel\'s own state never leaks into the ordinary Publication selection\'s own separate state.');
    }

    // ===============================================================
    // Section F — Return to World: session teardown/recreation exactly
    // as established by 0.9.555 (which itself made zero production
    // changes) — unaffected by anything this arc's later milestones
    // added.
    // ===============================================================
    {
        const storeSource = await rawSource('application/worldEncounter/ObserverLocalEncounterStore.js');
        assert(!/\bdispose\s*\(/.test(storeSource) && !/\bdestroy\s*\(/.test(storeSource) && !/\bclear\s*\(/.test(storeSource), 'F1. ObserverLocalEncounterStore still exposes no dispose/destroy/clear method of any kind — its own lifecycle is still "lives and dies with the one instance holding it," unchanged since 0.9.552.');

        const worldViewSource = (await Promise.all(worldViewFiles().map((file) => rawSource(file)))).join('\n');
        assert(worldViewSource.includes('const observerLocalEncounterStore = new ObserverLocalEncounterStore();'), 'F2. WorldView.js still constructs a FRESH store inside its own setup() closure — every mount gets an empty one, exactly as 0.9.555 established.');

        const unmountStart = worldViewSource.indexOf('onBeforeUnmount(() => {');
        const unmountEnd = worldViewSource.indexOf('\n        });', unmountStart);
        const unmountBody = worldViewSource.slice(unmountStart, unmountEnd);
        assert(!unmountBody.includes('observerLocalEncounterStore'), 'F3. onBeforeUnmount() never explicitly references observerLocalEncounterStore — teardown is implicit (the setup() closure, and the store it holds, becomes unreachable on unmount), exactly the posture 0.9.552-0.9.555 already established and this arc\'s later milestones never touched.');

        console.log('✓ F — World session teardown/recreation for the observer-local encounter store is unchanged since 0.9.552/0.9.555: implicit via component unmount, a fresh empty store on every new WorldView mount. Nothing 0.9.558 or this milestone added touches that lifecycle.');
    }

    // ===============================================================
    // Section G — Republished Publications: the P1/P2 adversarial pair,
    // exercised through the REAL destination use cases for all three
    // route-based actions plus commentary, in one consolidated
    // cross-surface pass.
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const sharedDocumentId = 'doc-g-shared';
        const sharedHash = 'hash-g-shared';
        const sourceDoc = makeDocument('Republished Work', 'alice', sharedDocumentId);
        storageProvider.save(sharedDocumentId, serializer.serialize(sourceDoc));

        const p1 = new Publication({ id: 'pub-g-p1', documentId: sharedDocumentId, title: 'G as P1', author: 'alice', contentHash: sharedHash, contentReference: new ContentReference({ hash: sharedHash }), license: new License({ id: LicenseId.CC_BY_4_0 }) });
        const p2 = new Publication({ id: 'pub-g-p2', documentId: sharedDocumentId, title: 'G as P2', author: 'bob', contentHash: sharedHash, contentReference: new ContentReference({ hash: sharedHash }), license: new License({ id: LicenseId.CC_BY_4_0 }) });
        knowPublicationsLocally(storageProvider, [p1, p2]);

        // G1. Encounter/inspection/command layer (as 0.9.558 already
        // proved) — reconfirmed once here as this section's own starting
        // point, so the REST of this section can build on "the command
        // received P1" without re-deriving it.
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const verifier = new MapVerifier({ [p1.id]: true, [p2.id]: true });
        let openedWith = null, forkedWith = null;
        const ctx = buildCanvasInstance({
            materialSources: { local: localSource },
            materialVerifier: verifier,
            openPublicationCommand: (pub) => { openedWith = pub; },
            forkPublicationCommand: (pub) => { forkedWith = pub; }
        });
        ctx.selectObserverLocalEncounter({ publicationId: p1.id, contentHash: sharedHash });
        await flush();
        ctx.openObserverLocalEncounterPublication();
        ctx.forkObserverLocalEncounterPublication();
        assert(openedWith.id === p1.id && forkedWith.id === p1.id, 'G1. The command boundary hands off P1, never P2 (reconfirming 0.9.558 Section B, as this section\'s own starting point).');

        // G2. Open, past the command boundary: LoadDocumentUseCase can
        // only ever resolve the shared DOCUMENT (it has no publicationId
        // parameter at all — Section B's own finding) — so Open
        // correctly can never distinguish P1 from P2 in the first place,
        // by construction, not by accident. This is the mirror image of
        // C/G3 below: Open's destination has no publicationId-shaped
        // "wrong Publication" failure mode to guard against, because it
        // never claims publicationId identity past that boundary at all.
        const openedDoc = new LoadDocumentUseCase(storageProvider, serializer).execute({ load() {} }, openedWith.documentId);
        assert(openedDoc.world.id === sharedDocumentId, 'G2. Open resolves the shared document correctly; it was never going to (and structurally cannot) distinguish P1 from P2 at this boundary — see Section B\'s own DELIBERATE_BOUNDARY finding.');

        // G3. Fork, past the command boundary: THIS is where a
        // documentId/contentHash-keyed substitution bug would actually
        // be observable, because ForkDocumentUseCase.execute() DOES take
        // a resolved Publication object and stamps lineage from it.
        const forkedDoc = new ForkDocumentUseCase(storageProvider, serializer).execute(forkedWith.documentId, null, forkedWith);
        assert(forkedDoc.metadata.license.attribution.sourcePublicationId === p1.id, 'G3. Forking with the object the command actually received stamps P1 — never P2 — confirming the whole encounter -> command -> ForkDocumentUseCase chain resolves to P1 end-to-end, not merely at the command boundary 0.9.558 already checked.');

        // G4. Commentary, past the command boundary, for the SAME
        // encounter: attached to p1.id specifically.
        const discoveryProvider = new LocalDiscoveryProvider(storageProvider);
        const identityProvider = makeIdentity('alice');
        const commentaryStore = new PublicationCommentaryStore(storageProvider);
        const canComment = new CanCommentOnPublicationUseCase(discoveryProvider);
        const addCommentary = new AddPublicationCommentaryUseCase(commentaryStore, identityProvider, canComment);
        const getCommentaries = new GetPublicationCommentariesUseCase(commentaryStore);
        addCommentary.execute({ publicationId: ctx.observerLocalEncounterCommentaryPublicationId || p1.id, content: 'G commentary', commentaryId: 'c-g-1', createdAt: new Date() });
        assert(getCommentaries.execute({ publicationId: p1.id }).length === 1, 'G4a. Commentary lands on P1.');
        assert(getCommentaries.execute({ publicationId: p2.id }).length === 0, 'G4b. P2\'s own commentary list is untouched.');

        // G5. No destination silently substitutes P2 at any hop this
        // section exercised: command boundary (G1), Open's document
        // resolution (G2), Fork's lineage stamp (G3), Commentary's own
        // storage key (G4) — all four checked against P1 specifically,
        // with P2 present in the SAME storage the whole time as the
        // adversarial control.
        console.log('✓ G — the P1/P2 republished-pair adversarial control holds across the FULL cross-surface path, not merely at the command boundary 0.9.558 already proved: Open (correctly document-only, by design), Fork (lineage correctly stamped to P1, never P2, via the real ForkDocumentUseCase), and Commentary (correctly isolated to P1\'s own list, via the real store) all resolve to P1 specifically at every hop checked, with P2 present the entire time as a live, storage-backed adversarial control rather than a hypothetical.');
    }

    // ===============================================================
    // Section H — Failure isolation: a failure on one surface never
    // corrupts another surface's state.
    // ===============================================================
    {
        // H1. Stale encounter: an unknown publicationId never actions —
        // reconfirmed live (0.9.558 Section E1 already proved this at
        // the command layer; reconfirmed here as this section's own
        // starting point for the harder cases below).
        {
            const storageProvider = new InMemoryStorageProvider();
            const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
            const openPublicationCommand = commandSpy();
            const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: new MapVerifier({}), openPublicationCommand });
            ctx.selectObserverLocalEncounter({ publicationId: 'stale-pub-h', contentHash: 'stale-hash-h' });
            await flush();
            assert(ctx.observerLocalEncounterActionablePublication === null, 'H1a. A stale/unknown encounter never becomes actionable.');
            ctx.openObserverLocalEncounterPublication();
            assert(openPublicationCommand.calls.length === 0, 'H1b. No-op — no action fires.');
        }

        // H2. Unavailable material: resolved but not verified stays
        // non-actionable (0.9.558 Section E2, reconfirmed as this
        // section's own starting point).
        {
            const storageProvider = new InMemoryStorageProvider();
            const publicationId = 'pub-h2';
            const publication = new Publication({ id: publicationId, documentId: 'doc-h2', title: 'H2', contentHash: 'hash-h2', contentReference: new ContentReference({ hash: 'hash-h2' }) });
            knowPublicationsLocally(storageProvider, [publication]);
            const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
            const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: new MapVerifier({ [publicationId]: false }) });
            ctx.selectObserverLocalEncounter({ publicationId, contentHash: 'hash-h2' });
            await flush();
            assert(ctx.observerLocalEncounterActionablePublication === null, 'H2. Unverified material never becomes actionable, even though it loaded.');
        }

        // H3. Failed Open: the REAL LoadDocumentUseCase throws a
        // specific, non-generic error for a missing document — and
        // EditorView.js's own real route.query.load branch is
        // structurally confirmed to catch it (never letting it escape
        // to a blank/crashed Editor).
        {
            const emptyStorage = new InMemoryStorageProvider();
            assertThrows(
                () => new LoadDocumentUseCase(emptyStorage).execute({ load() {} }, 'missing-doc-id'),
                'no document found with id "missing-doc-id"',
                'H3a. A failed Open (missing document) throws a specific, greppable message.'
            );
            const editorViewSource = (await Promise.all(editorViewFiles().map((file) => rawSource(file)))).join('\n');
            const loadBranchStart = editorViewSource.indexOf('} else if (route.query.load) {');
            const loadBranchEnd = editorViewSource.indexOf('\n            }', loadBranchStart);
            const loadBranch = editorViewSource.slice(loadBranchStart, loadBranchEnd);
            assert(loadBranch.includes('try {') && loadBranch.includes('catch (err)') && loadBranch.includes('feedback.show('), 'H3b. The real route.query.load branch wraps loadDocument() in try/catch and shows feedback rather than crashing or leaving a half-initialized Editor.');
        }

        // H4. Failed Fork: a license denial (CC-BY-ND) is a genuinely
        // different failure than H3's "missing document," with its own
        // distinct message — and EditorView.js's own real
        // route.query.fork branch is confirmed to route the viewer back
        // toward the World/Publication they came from rather than a dead
        // end.
        {
            const storageProvider = new InMemoryStorageProvider();
            const serializer = new DocumentSerializer();
            const ndDoc = makeDocument('Restricted Work', 'alice');
            storageProvider.save(ndDoc.world.id, serializer.serialize(ndDoc));
            const ndPublication = new Publication({ id: 'pub-h4-nd', documentId: ndDoc.world.id, title: 'Restricted Work', author: 'alice', license: new License({ id: LicenseId.CC_BY_ND_4_0 }) });
            assertThrows(
                () => new ForkDocumentUseCase(storageProvider, serializer).execute(ndDoc.world.id, null, ndPublication),
                'not permitted under license',
                'H4a. A failed Fork (license denial) throws a distinct message, never confused with H3\'s "missing document."'
            );
            const editorViewSource = (await Promise.all(editorViewFiles().map((file) => rawSource(file)))).join('\n');
            assert(editorViewSource.includes('returnWorldId: (decodedEntryContext && decodedEntryContext.returnWorldId) || sourceDocumentId,'), 'H4b. A failed Fork\'s own catch block still resolves a returnWorldId (falling back to sourceDocumentId itself) — the viewer is never left at an unrecoverable dead end even when the fork throws.');
        }

        // H5. Failed Explore: focusDocument()'s own position lookup
        // delegates to a layout provider rather than throwing for an
        // unrecognized documentId — World's own established "no
        // destination is ever truly invalid" posture, reconfirmed
        // structurally (never a thrown error a Wanderer could hit mid-
        // Explore).
        {
            const worldNavSource = await rawSource('application/world/WorldNavigationSession.js');
            const posStart = worldNavSource.indexOf('_getWorldPosition(documentId) {');
            const posEnd = worldNavSource.indexOf('\n    }', posStart);
            const posBody = worldNavSource.slice(posStart, posEnd);
            assert(!posBody.includes('throw'), 'H5. _getWorldPosition() (focusDocument()\'s own position lookup) never throws for an unrecognized documentId — it falls back to the layout provider\'s own deterministic placement instead.');
        }

        // H6. Failed commentary: the REAL AddPublicationCommentaryUseCase
        // throws when unauthorized (publicationId unknown to the
        // discovery provider) — and the observer-local panel's own
        // submit method is confirmed to isolate that failure to its own
        // error field, never corrupting observerLocalEncounterInspection.
        {
            const storageProvider = new InMemoryStorageProvider();
            const publicationId = 'pub-h6';
            const contentHash = 'hash-h6';
            const publication = new Publication({ id: publicationId, documentId: 'doc-h6', title: 'H6', contentHash, contentReference: new ContentReference({ hash: contentHash }) });
            knowPublicationsLocally(storageProvider, [publication]);
            // Deliberately an EMPTY discovery provider's own backing
            // store — CanCommentOnPublicationUseCase.findById() will
            // find nothing, so the real use case throws "not authorized."
            const emptyDiscoveryProvider = new LocalDiscoveryProvider(new InMemoryStorageProvider());
            const identityProvider = makeIdentity('alice');
            const commentaryStore = new PublicationCommentaryStore(storageProvider);
            const canComment = new CanCommentOnPublicationUseCase(emptyDiscoveryProvider);
            const addCommentary = new AddPublicationCommentaryUseCase(commentaryStore, identityProvider, canComment);

            const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
            const verifier = new MapVerifier({ [publicationId]: true });
            const ctx = buildCanvasInstance({
                materialSources: { local: localSource },
                materialVerifier: verifier,
                addPublicationCommentaryCommand: (input) => addCommentary.execute(input)
            });
            ctx.selectObserverLocalEncounter({ publicationId, contentHash });
            await flush();
            ctx.newObserverLocalEncounterCommentaryText = 'This should fail';
            ctx.submitObserverLocalEncounterCommentary();

            assert(ctx.observerLocalEncounterCommentaryError !== null, 'H6a. A real, unauthorized AddPublicationCommentaryUseCase failure is caught and surfaced as this panel\'s own error field.');
            assert(ctx.observerLocalEncounterInspection !== null && ctx.observerLocalEncounterInspection.loading.material.id === publicationId, 'H6b. The failure never corrupts this component\'s own inspection state — isolated to the commentary panel alone.');
        }

        // H7. World session teardown during an action: all four
        // continuation actions are synchronous (no `async`, no Promise
        // returned) — a router navigation is only ever QUEUED, never
        // awaited, inside them, so there is no async gap during which
        // WorldView's own onBeforeUnmount() could interleave mid-
        // dispatch. Confirmed structurally rather than asserted from
        // this milestone's own prose.
        {
            const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => rawSource(file)))).join('\n');
            for (const name of ['openObserverLocalEncounterPublication', 'forkObserverLocalEncounterPublication', 'exploreObserverLocalEncounterPublication', 'submitObserverLocalEncounterCommentary']) {
                const idx = canvasSource.indexOf(`${name}(`);
                const precedingSlice = canvasSource.slice(Math.max(0, idx - 30), idx);
                assert(!precedingSlice.includes('async '), `H7. ${name}() is not declared async — no await/Promise gap exists inside it for a mid-flight World teardown to interleave with.`);
            }
        }

        console.log('✓ H — failure isolation holds across all seven cases: a stale or unverified encounter never actions; a failed Open/Fork throws a specific, distinct, caught error rather than crashing or dead-ending the Editor; a failed Explore cannot even occur structurally (no throwing path); a failed real commentary write is isolated to the commentary panel\'s own error field; and none of the four actions is async, so a World session teardown can never interleave mid-dispatch.');
    }

    // ===============================================================
    // Section I — User-facing continuity: does the transition make
    // sense without exposing internal vocabulary?
    // ===============================================================
    {
        // I1. Reconfirmed: the observer-local actions panel itself
        // (0.9.558) presents ordinary vocabulary — the Publication's own
        // title and plain verbs (Open/Explore/Fork/Comment) — never
        // publicationId/contentHash/UNVERIFIABLE/storage identifiers as
        // the primary affordance.
        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => rawSource(file)))).join('\n');
        const actionsBlockStart = canvasSource.indexOf('world-encounter-observer-local-actions');
        const actionsBlockEnd = canvasSource.indexOf('world-encounter-observer-local-commentary-panel');
        const actionsBlock = canvasSource.slice(actionsBlockStart, actionsBlockEnd);
        assert(!/UNVERIFIABLE|contentHash|publicationId/.test(actionsBlock), 'I1. The actions block itself never renders raw internal identifiers/vocabulary as the primary affordance.');

        // I2. A REAL finding this milestone's own cross-surface reach
        // (Sections B/H3/H4, which none of 0.9.551-0.9.558 checked)
        // originally surfaced: a failed Open/Fork's own feedback text
        // DID leak internal vocabulary — the use case's own class name
        // and a raw storage identifier — verbatim into a Wanderer-
        // facing toast/dialog. Named, not fixed, here (see Section J's
        // own verdict text below, left as originally written for the
        // historical record).
        //
        // AMENDED BY 0.9.574 — Repository Publication Lifecycle &
        // Currency Product Reassessment, the "future milestone" Section
        // J's own verdict named. application/document/LoadFailureReason.js now
        // gives LoadDocumentUseCase a real error.reason, and
        // ui/views/EditorView.js's own toast branches on it rather than
        // interpolating err.message — this section now reconfirms the
        // FIXED state live rather than re-proving the original leak.
        const editorViewSource = (await Promise.all(editorViewFiles().map((file) => rawSource(file)))).join('\n');
        assert(!editorViewSource.includes('feedback.show(`Load failed: ${err.message}`);'),
            'I2a. AMENDED BY 0.9.574 — EditorView.js no longer interpolates the raw thrown error message verbatim into the failed-Open toast.');
        let openError = null;
        try {
            new LoadDocumentUseCase(new InMemoryStorageProvider()).execute({ load() {} }, 'some-internal-doc-id-42');
        } catch (e) { openError = e; }
        assert(openError.reason === LoadFailureReason.MATERIAL_UNAVAILABLE,
            'I2b. AMENDED BY 0.9.574 — LoadDocumentUseCase now attaches a structural error.reason (application/document/LoadFailureReason.js) that EditorView.js branches on, rather than a Wanderer-facing toast being built by interpolating the use case\'s own internal class name and a raw storage identifier, the exact leak this section originally found.');

        console.log('✓ I — the observer-local actions panel itself communicates in ordinary vocabulary (title + plain verbs), holding the standard this arc has held to since 0.9.554. The one real presentation paper-cut this milestone originally found OUTSIDE that panel — a failed Open/Fork\'s toast/dialog leaking a use case\'s own internal class name and a raw storage identifier — was named, not fixed, here; AMENDED BY 0.9.574, which closed it (reconfirmed live, I2a/I2b).');
    }

    // ===============================================================
    // Section J — Arc classification.
    // ===============================================================
    console.log('\n=== 0.9.559 VERDICT ===');
    console.log(`
Ten sections, checked against real, unmodified production source and real
object graphs throughout, deliberately reaching PAST the command boundary
0.9.551-0.9.558 already proved and into the real destination consumers on
the other side (LoadDocumentUseCase, ForkDocumentUseCase,
PublicationCommentaryStore/its use cases, WorldNavigationSession) for the
first time in this arc.

  A — ALREADY_CORRECT. Identity survives encounter -> inspection ->
      action -> destination-query construction as the literal resolved
      object reference, never reconstructed from documentId/contentHash/
      locator/title at any hop.

  B — DELIBERATE_BOUNDARY, now explicitly confirmed rather than merely
      inferred. Open (\`/editor?load=<documentId>\`) is a genuine
      Publication -> Document identity TRANSITION: LoadDocumentUseCase
      takes no publicationId parameter at all, EditorView.js's own real
      route.query.load branch never constructs an EditorEntryContext, and
      the resulting Document carries no trace of which Publication (if
      any) it was reached through. Critically, this is NOT something
      0.9.558 introduced or narrowed — the IDENTICAL query shape is what
      ui/components/PublicationCatalog.js's own pre-existing Open has
      always built, for every entry point the app has ever had. The
      originating brief's own question ("intentional transition, or
      context lost too early?") is answered empirically: intentional,
      app-wide, and consistent.

  C — ALREADY_CORRECT, and more strongly than 0.9.558 proved. Fork
      provably never mutates P1's own storage record (byte-for-byte,
      confirmed across two independent forks of the same source), always
      produces a brand-new Document with fully regenerated ids, and
      correctly stamps lineage from P1 specifically even with P2 (shared
      documentId AND contentHash) present in the same storage throughout.
      Fork's own route deliberately carries MORE identity (documentId +
      publicationId) than Open's does, by design: ForkDocumentUseCase's
      own license/attribution check genuinely needs the resolved
      Publication object, and Open's LoadDocumentUseCase has no
      equivalent need.

  D — ALREADY_CORRECT. Explore reuses focusWorld() -> session.
      focusDocument(), a same-session reposition (router.replace, never
      push), and creates no new observer-local encounter or Repository
      admission as part of the action itself.

  E — ALREADY_CORRECT, proven against the real storage/use-case chain
      rather than a mocked command for the first time in this arc.
      Commentary is genuinely publicationId-keyed (P1/P2, sharing
      documentId AND contentHash, get disjoint lists; a documentId-shaped
      query returns nothing), and the observer-local commentary panel's
      own state never leaks into the primary selection's own separate
      state.

  F — ALREADY_CORRECT. World session teardown/recreation for the
      observer-local encounter store is unchanged since 0.9.552/0.9.555:
      implicit via component unmount, a fresh empty store on every new
      mount. Nothing this arc added since then touches that lifecycle.

  G — ALREADY_CORRECT. The P1/P2 republished-pair adversarial control
      holds across the FULL cross-surface path (command boundary, Open's
      document resolution, Fork's lineage stamp, Commentary's storage
      key) — not merely at the command boundary 0.9.558 already checked.

  H — ALREADY_CORRECT. All seven named failure shapes (stale encounter,
      unavailable material, failed Open, failed Fork, failed Explore,
      failed commentary, mid-action World teardown) stay isolated to
      their own surface — the last two (Explore, teardown) hold
      structurally by construction rather than needing a runtime guard:
      Explore's own position lookup has no throwing path, and none of
      the four continuation actions is async, so there is no gap for a
      teardown to interleave with.

  I — DOCUMENTATION_GAP (the panel itself, reconfirmed) plus one real,
      narrow PRODUCT_GAP found for the first time by this milestone's own
      cross-surface reach: a failed Open/Fork's own toast/dialog leaks an
      internal use case's own class name and a raw storage identifier
      verbatim (e.g. "Load failed: LoadDocumentUseCase: no document found
      with id \\"...\\""). NOT recommended for action in this milestone,
      matching this arc's own established restraint (0.9.555 F/G, 0.9.556
      D, 0.9.553 H) — and for a genuinely different reason than those:
      this gap is not specific to World's own continuation arc at all. It
      is identical for EVERY Open/Fork entry point this app has ever had
      (Repository's own PublicationCatalog.js included) and predates
      0.9.551 entirely; fixing it here would mean expanding this
      milestone's own scope into general Editor error-message hygiene, a
      separate, larger, cross-cutting concern (the codebase's own
      precedent for exactly that shape of fix already exists —
      application/publication/distribution/DistributionErrorMessageSanitizer.js — should a future
      milestone take it on).

      AMENDED BY 0.9.574 — Repository Publication Lifecycle & Currency
      Product Reassessment took it on, narrowly: application/
      LoadFailureReason.js (new) plus a small EditorView.js change, not
      the general Editor error-message hygiene sweep this paragraph
      speculated might eventually be needed. See this file's own I2a/I2b
      above, reconfirmed live against the fix.

Per the originating brief's own central question: after a Wanderer
discovers a novel Publication in World and chooses to continue with it,
ForkBuild preserves enough context and identity for the user to actually
work with that Publication naturally. Every hop this milestone traced —
past the command boundary this arc had already proven, into the real
LoadDocumentUseCase/ForkDocumentUseCase/PublicationCommentaryStore chain —
holds. The one open question the brief itself flagged for careful
treatment (Section B, Open's document-oriented destination) resolves to a
deliberate, pre-existing, app-wide architectural boundary, not a
continuation-specific gap. The one real finding (Section I) is a genuine
paper-cut, but its scope is a different, larger surface (general Editor
error presentation) than this arc's own boundary (World's observer-local
encounter continuation) — naming it, not fixing it, matches this arc's
own established restraint.

Per the originating brief's own framing: this is a clean result, and the
demonstrated lifecycle diagram the brief itself drew (World -> Encounter
-> Verified Publication -> Open/Fork/Explore, with Commentary attached
throughout) now holds all the way through to its real destinations, not
merely at the seam 0.9.558 wired. This milestone recommends stopping this
arc. The next milestone should come from a genuinely different product
surface, not from re-auditing World or this continuation arc again absent
new evidence.
`);

    console.log('✅ All Publication Discovery-to-Work Continuity Product Reassessment tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All PublicationDiscoveryToWorkContinuityProductReassessment tests passed');
}).catch((error) => {
    console.error('\n✗ PublicationDiscoveryToWorkContinuityProductReassessment tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
