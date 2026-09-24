import { readFile } from 'node:fs/promises';

import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalWorldEncounterMaterialSource } from '../application/LocalWorldEncounterMaterialSource.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';

// 0.9.558 — Known Publication Encounter Continuation.
//
// TYPE: production implementation milestone. Modified:
// ui/components/WorldEncounterCanvas.js (three new command props —
// openPublicationCommand/forkPublicationCommand/explorePublicationCommand
// — plus a new observerLocalEncounterActionablePublication computed and
// the three action methods/commentary state that use it); ui/views/
// WorldView.js (three new thin command wrappers, reusing existing
// navigation, wired into WorldEncounterCanvas's own new props).
//
// 0.9.557 found EXISTING_RETURN_SEAM: a Wanderer's known Publication
// identity, from an observer-local encounter, already resolves — through
// the real, unmodified `selectObserverLocalEncounter() ->
// observerLocalEncounterResolvedSelection -> refreshObserverLocalEncounterInspection
// -> LocalWorldEncounterMaterialSource -> LocalDiscoveryProvider#findById()`
// chain — to the exact same Publication instance PublicationCatalog.js's
// own Open/Fork/Explore actions already need. This milestone activates
// that seam: it verifies the new Open/Explore/Fork/Comment continuation
// actually reaches, with the correct identity, using the ALREADY-RESOLVED
// object rather than a second lookup, and that none of it opens any path
// into Repository search or admission.
//
// Ten lettered sections (A-J), mirroring the originating brief's own
// acceptance-test lettering exactly.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
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

function knowPublicationsLocally(storageProvider, publications) {
    storageProvider.save('forkbuild-publications', publications.map((p) => p.toJSON()));
}

class MapVerifier {
    constructor(map) { this._map = map; this.calls = []; }
    async verifyIdentity(resolvedSelection, material) {
        this.calls.push({ objectId: resolvedSelection && resolvedSelection.objectId, materialId: material && material.id });
        return this._map[resolvedSelection && resolvedSelection.objectId] === true;
    }
}

// Mirrors tests/PublicationReturnPathProductBoundaryAudit.test.js's own
// buildCanvasInstance() exactly, extended with the THREE new 0.9.558
// computeds/command props this milestone adds — duplicated here per this
// codebase's own established per-file harness convention.
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

function mountCanvas(ctx) { WorldEncounterCanvas.mounted.call(ctx); }
function unmountCanvas(ctx) { WorldEncounterCanvas.beforeUnmount.call(ctx); }
function flush() { return new Promise((resolve) => setTimeout(resolve, 0)); }

function commandSpy() {
    const calls = [];
    const fn = (...args) => { calls.push(args); };
    fn.calls = calls;
    return fn;
}

async function runTests() {
    console.log('Running Known Publication Encounter Continuation tests...\n');

    // ===============================================================
    // Section A — Identity: clicking an action for encounter P1 acts on
    // exactly P1.
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

        const openPublicationCommand = commandSpy();
        const forkPublicationCommand = commandSpy();
        const explorePublicationCommand = commandSpy();
        const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: verifier, openPublicationCommand, forkPublicationCommand, explorePublicationCommand });

        ctx.selectObserverLocalEncounter({ publicationId, contentHash });
        await flush();

        assert(ctx.observerLocalEncounterActionablePublication && ctx.observerLocalEncounterActionablePublication.id === publicationId, 'A1. observerLocalEncounterActionablePublication resolves to exactly P1.');

        ctx.openObserverLocalEncounterPublication();
        ctx.forkObserverLocalEncounterPublication();
        ctx.exploreObserverLocalEncounterPublication();

        assert(openPublicationCommand.calls.length === 1 && openPublicationCommand.calls[0][0].id === publicationId, 'A2. openPublicationCommand was called exactly once, with an object whose .id is exactly P1.');
        assert(forkPublicationCommand.calls.length === 1 && forkPublicationCommand.calls[0][0].id === publicationId, 'A3. forkPublicationCommand likewise.');
        assert(explorePublicationCommand.calls.length === 1 && explorePublicationCommand.calls[0][0].id === publicationId, 'A4. explorePublicationCommand likewise.');
        assert(openPublicationCommand.calls[0][0].documentId === documentId, 'A5. The object handed to the command also carries the correct documentId — the same object, never a reshaped copy.');

        console.log('✓ A — every action, when clicked for encounter P1, acts on exactly P1 — the same object instance, identified by both id and documentId.');
    }

    // ===============================================================
    // Section B — Republish safety: P1 and P2 share document + hash;
    // an encounter for P1 can never accidentally operate on P2.
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const sharedDocumentId = 'doc-b-shared';
        const sharedContentHash = 'hash-b-shared';
        const p1 = new Publication({ id: 'pub-b-p1', documentId: sharedDocumentId, title: 'Republished As P1', author: 'alice', contentHash: sharedContentHash, contentReference: new ContentReference({ hash: sharedContentHash }) });
        const p2 = new Publication({ id: 'pub-b-p2', documentId: sharedDocumentId, title: 'Republished As P2', author: 'bob', contentHash: sharedContentHash, contentReference: new ContentReference({ hash: sharedContentHash }) });
        knowPublicationsLocally(storageProvider, [p1, p2]);
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const verifier = new MapVerifier({ 'pub-b-p1': true, 'pub-b-p2': true });

        const openPublicationCommand = commandSpy();
        const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: verifier, openPublicationCommand });

        ctx.selectObserverLocalEncounter({ publicationId: p1.id, contentHash: sharedContentHash });
        await flush();
        ctx.openObserverLocalEncounterPublication();

        assert(openPublicationCommand.calls.length === 1, 'B1. Exactly one call.');
        assert(openPublicationCommand.calls[0][0].id === p1.id, 'B2. The command was called with P1, never P2, despite the shared documentId/contentHash.');
        assert(openPublicationCommand.calls[0][0].title === 'Republished As P1', 'B3. Confirmed by an independent field (title): the resolved object really is P1\'s own instance, not P2\'s.');

        console.log('✓ B — republish safety holds: an encounter for P1 resolves and acts on P1 specifically, never on a content-identical P2.');
    }

    // ===============================================================
    // Section C — Existing action reuse: the four actions invoke the
    // existing production paths, never parallel implementations.
    // ===============================================================
    {
        const worldViewSource = await rawSource('ui/views/WorldView.js');
        const catalogSource = await rawSource('ui/components/PublicationCatalog.js');

        assert(worldViewSource.includes("router.push({ path: '/editor', query: { load: publication.documentId } });"), 'C1. openEncounteredPublicationCommand() in WorldView.js builds the IDENTICAL route PublicationCatalog.js\'s own openPublication(pub) builds.');
        assert(catalogSource.includes("router.push({ path: '/editor', query: { load: pub.documentId } });"), 'C2. Sanity: PublicationCatalog.js\'s own route, unmodified, for comparison.');

        assert(worldViewSource.includes("router.push({ path: '/editor', query: { fork: publication.documentId, publication: publication.id } });"), 'C3. forkEncounteredPublicationCommand() builds the IDENTICAL route forkPublication(pub) builds.');
        assert(catalogSource.includes("router.push({ path: '/editor', query: { fork: pub.documentId, publication: pub.id } });"), 'C4. Sanity: forkPublication(pub)\'s own route, unmodified.');

        assert(worldViewSource.includes('function exploreEncounteredPublicationCommand(publication) {\n            focusWorld(publication.documentId);\n        }'), 'C5. exploreEncounteredPublicationCommand() calls WorldView.js\'s own EXISTING focusWorld(documentId) — never a new navigation mechanism, never a parallel router.push().');

        assert(worldViewSource.includes(':openPublicationCommand="openEncounteredPublicationCommand"')
            && worldViewSource.includes(':forkPublicationCommand="forkEncounteredPublicationCommand"')
            && worldViewSource.includes(':explorePublicationCommand="exploreEncounteredPublicationCommand"'),
            'C6. All three wrappers are actually wired to WorldEncounterCanvas\'s own new props in the real template.');

        // C7. Comment reuses the SAME two 0.9.291 props/commands already
        // threaded through for the primary selection — never a new
        // commentary mechanism.
        const canvasSource = await rawSource('ui/components/WorldEncounterCanvas.js');
        assert(canvasSource.includes('this.getPublicationCommentariesCommand(this.observerLocalEncounterCommentaryPublicationId)'), 'C7. refreshObserverLocalEncounterCommentaries() calls the SAME injected getPublicationCommentariesCommand prop the primary panel\'s own refreshEncounterCommentaries() already calls.');
        assert(canvasSource.includes('this.addPublicationCommentaryCommand({ publicationId, content, commentaryId, createdAt });') && (canvasSource.match(/this\.addPublicationCommentaryCommand\(/g) || []).length === 2, 'C8. addPublicationCommentaryCommand is called with the identical shape, from exactly two call sites (primary + observer-local) — never a third, divergent commentary implementation.');

        console.log('✓ C — all four continuation actions invoke existing production paths (PublicationCatalog.js\'s own route shapes, WorldView.js\'s own focusWorld(), and the 0.9.291 commentary commands) — never a parallel implementation.');
    }

    // ===============================================================
    // Section D — No Repository dependency: the continuation path
    // performs zero Repository searches.
    // ===============================================================
    {
        const canvasSource = await rawSource('ui/components/WorldEncounterCanvas.js');
        assert(!canvasSource.includes('SearchPublicationsUseCase') && !canvasSource.includes('PublicationQuery'), 'D1. WorldEncounterCanvas.js still never imports or references SearchPublicationsUseCase/PublicationQuery — reconfirmed after this milestone\'s own changes.');

        // D2. Empirically: resolving and acting on an encounter never
        // calls findById() a second time — the object handed to a command
        // is the literal `loading.material` reference
        // refreshObserverLocalEncounterInspection() already wrote, never
        // a fresh lookup performed by the action methods themselves.
        const storageProvider = new InMemoryStorageProvider();
        const publicationId = 'pub-d-no-search';
        const contentHash = 'hash-d-no-search';
        const publication = new Publication({ id: publicationId, documentId: 'doc-d-no-search', title: 'D', author: 'alice', contentHash, contentReference: new ContentReference({ hash: contentHash }) });
        knowPublicationsLocally(storageProvider, [publication]);
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const verifier = new MapVerifier({ [publicationId]: true });
        const openPublicationCommand = commandSpy();
        const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: verifier, openPublicationCommand });

        ctx.selectObserverLocalEncounter({ publicationId, contentHash });
        await flush();
        const resolvedBeforeAction = ctx.observerLocalEncounterInspection.loading.material;
        ctx.openObserverLocalEncounterPublication();
        assert(openPublicationCommand.calls[0][0] === resolvedBeforeAction, 'D2. The exact object reference already sitting in observerLocalEncounterInspection.loading.material is what the command receives — no re-fetch, no re-derivation, no second lookup of any kind.');

        console.log('✓ D — the continuation path performs zero Repository searches, and acts on the literal already-resolved object reference rather than re-deriving it.');
    }

    // ===============================================================
    // Section E — Failure isolation: a missing/stale Publication
    // affects only that encounter/action.
    // ===============================================================
    {
        // E1. Still loading (no materialSources yet resolved this tick):
        // observerLocalEncounterActionablePublication is null, and firing
        // an action is a harmless no-op.
        {
            const storageProvider = new InMemoryStorageProvider();
            const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
            const openPublicationCommand = commandSpy();
            const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: new MapVerifier({}), openPublicationCommand });
            ctx.selectObserverLocalEncounter({ publicationId: 'unknown-pub-e', contentHash: 'unknown-hash-e' });
            // Before the async inspection resolves.
            assert(ctx.observerLocalEncounterActionablePublication === null, 'E1a. Not yet actionable while inspection is in flight.');
            ctx.openObserverLocalEncounterPublication();
            assert(openPublicationCommand.calls.length === 0, 'E1b. No-op: the command is never called for a not-yet-resolved encounter.');
            await flush();
            assert(ctx.observerLocalEncounterActionablePublication === null, 'E1c. Genuinely unknown locally: stays null even after resolution (honest UNAVAILABLE), never a fabricated object.');
        }

        // E2. Resolved but NOT verified (a REJECTED signature): actions
        // stay unreachable even though `loading.material` itself exists.
        {
            const storageProvider = new InMemoryStorageProvider();
            const publicationId = 'pub-e-unverified';
            const contentHash = 'hash-e-unverified';
            const publication = new Publication({ id: publicationId, documentId: 'doc-e-unverified', title: 'E', contentHash, contentReference: new ContentReference({ hash: contentHash }) });
            knowPublicationsLocally(storageProvider, [publication]);
            const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
            const rejectingVerifier = new MapVerifier({ [publicationId]: false });
            const forkPublicationCommand = commandSpy();
            const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: rejectingVerifier, forkPublicationCommand });
            ctx.selectObserverLocalEncounter({ publicationId, contentHash });
            await flush();
            assert(ctx.observerLocalEncounterInspection.loading.material !== null, 'E2a. Sanity: the material itself DID load.');
            assert(ctx.observerLocalEncounterInspection.verification.status === 'REJECTED', 'E2b. Sanity: verification failed.');
            assert(ctx.observerLocalEncounterActionablePublication === null, 'E2c. observerLocalEncounterActionablePublication stays null for a REJECTED verification, even though the material loaded — never actionable on unverified bytes.');
            ctx.forkObserverLocalEncounterPublication();
            assert(forkPublicationCommand.calls.length === 0, 'E2d. forkPublicationCommand is never called for an unverified resolution.');
        }

        // E3. This failure never corrupts the observer-local encounter
        // store or other encounters — mirrors 0.9.554 Section I4c exactly,
        // one milestone over.
        {
            const storageProvider = new InMemoryStorageProvider();
            const publicationId = 'pub-e-unrelated-ok';
            const contentHash = 'hash-e-unrelated-ok';
            const publication = new Publication({ id: publicationId, documentId: 'doc-e-unrelated-ok', title: 'Fine', contentHash, contentReference: new ContentReference({ hash: contentHash }) });
            knowPublicationsLocally(storageProvider, [publication]);
            const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
            const verifier = new MapVerifier({ [publicationId]: true });
            const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: verifier });

            // A broken action prop (throws) never corrupts inspection state.
            ctx.openPublicationCommand = () => { throw new Error('boom'); };
            ctx.selectObserverLocalEncounter({ publicationId, contentHash });
            await flush();
            let threw = false;
            try {
                ctx.openObserverLocalEncounterPublication();
            } catch {
                threw = true;
            }
            assert(threw, 'E3a. A throwing command propagates out of the click handler (never silently swallowed)...');
            assert(ctx.observerLocalEncounterInspection !== null && ctx.observerLocalEncounterInspection.loading.material.id === publicationId, 'E3b. ...but this component\'s OWN inspection state is left completely intact afterward — the failure is isolated to the one action invocation.');
        }

        console.log('✓ E — failure isolation holds: a still-loading, genuinely-unknown, or unverified encounter never actions, and a throwing command never corrupts this component\'s own inspection state.');
    }

    // ===============================================================
    // Section F — World lifecycle: leaving World still destroys the
    // session-local encounter store, unmodified by this milestone.
    // ===============================================================
    {
        const canvasSource = await rawSource('ui/components/WorldEncounterCanvas.js');
        // F1. None of this milestone's own new methods write to
        // observerLocalEncounterRegistry/observerLocalEncounters — the
        // store's own destruction lifecycle (0.9.555) is a fact about
        // WHO OWNS the store (ui/views/WorldView.js, per that milestone),
        // never about anything WorldEncounterCanvas.js itself does.
        const newMethodNames = ['openObserverLocalEncounterPublication', 'forkObserverLocalEncounterPublication', 'exploreObserverLocalEncounterPublication', 'toggleObserverLocalEncounterCommentary', 'refreshObserverLocalEncounterCommentaries', 'submitObserverLocalEncounterCommentary'];
        for (const name of newMethodNames) {
            const start = canvasSource.indexOf(`${name}(`);
            const bodyEnd = canvasSource.indexOf('\n        },', start);
            const body = canvasSource.slice(start, bodyEnd);
            assert(!body.includes('observerLocalEncounterRegistry') && !body.includes('this.observerLocalEncounters ='), `F1. ${name}() never writes to observerLocalEncounterRegistry/observerLocalEncounters.`);
        }
        console.log('✓ F — none of this milestone\'s own new methods touch the observer-local encounter store; 0.9.555\'s own World-lifecycle destruction of that store is unaffected.');
    }

    // ===============================================================
    // Section G — Return to World: no persistence introduced merely to
    // preserve the encounter across a Publication action.
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const publicationId = 'pub-g-no-persistence';
        const contentHash = 'hash-g-no-persistence';
        const publication = new Publication({ id: publicationId, documentId: 'doc-g-no-persistence', title: 'G', contentHash, contentReference: new ContentReference({ hash: contentHash }) });
        knowPublicationsLocally(storageProvider, [publication]);
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const verifier = new MapVerifier({ [publicationId]: true });
        const explorePublicationCommand = commandSpy();
        const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: verifier, explorePublicationCommand });

        const keysBefore = storageProvider.list();
        ctx.selectObserverLocalEncounter({ publicationId, contentHash });
        await flush();
        ctx.exploreObserverLocalEncounterPublication();
        const keysAfter = storageProvider.list();

        assert(keysAfter.length === keysBefore.length && keysAfter.every((k) => keysBefore.includes(k)), 'G1. Using the Explore action writes no new storage key of any kind — no persistence mechanism is introduced merely to preserve or re-anchor this encounter.');
        assert(explorePublicationCommand.calls.length === 1, 'G2. Sanity: the action did run.');

        console.log('✓ G — the continuation action itself introduces no persistence; a fresh World session\'s own encounter behavior is governed entirely by 0.9.555\'s existing, unmodified lifecycle.');
    }

    // ===============================================================
    // Section H — Existing Publication surfaces: Open/Explore/Fork/
    // Comment behave identically to the corresponding existing entry
    // points.
    // ===============================================================
    {
        // Already largely proven structurally in Section C (byte-identical
        // route construction). This section reconfirms behaviorally: the
        // SAME publication object fed to PublicationCatalog.js's own
        // openPublication()/forkPublication() literally, side by side with
        // this milestone's own commands, produces byte-identical route
        // objects.
        const publication = { id: 'pub-h', documentId: 'doc-h', title: 'H' };

        function openPublication(pub) { return { path: '/editor', query: { load: pub.documentId } }; }
        function forkPublication(pub) { return { path: '/editor', query: { fork: pub.documentId, publication: pub.id } }; }

        let openedRoute = null;
        let forkedRoute = null;
        const ctx = buildCanvasInstance({
            openPublicationCommand: (pub) => { openedRoute = openPublication(pub); },
            forkPublicationCommand: (pub) => { forkedRoute = forkPublication(pub); }
        });
        ctx.observerLocalEncounterInspection = { loading: { status: 'AVAILABLE', material: publication }, verification: { status: 'VERIFIED' } };
        // observerLocalEncounterActionablePublication requires
        // loading.material to be a real Publication instance — reconstruct
        // with the real class for this identity check.
        const realPublication = new Publication({ id: publication.id, documentId: publication.documentId, title: publication.title, contentReference: new ContentReference({ hash: 'h' }) });
        ctx.observerLocalEncounterInspection.loading.material = realPublication;

        ctx.openObserverLocalEncounterPublication();
        ctx.forkObserverLocalEncounterPublication();

        assert(openedRoute.path === '/editor' && openedRoute.query.load === realPublication.documentId, 'H1. The observer-local Open action produces the byte-identical route PublicationCatalog.js\'s own openPublication() would for the SAME object.');
        assert(forkedRoute.path === '/editor' && forkedRoute.query.fork === realPublication.documentId && forkedRoute.query.publication === realPublication.id, 'H2. Same for Fork.');

        console.log('✓ H — Open/Fork behavior, exercised through the new observer-local action methods, is identical to what the corresponding existing PublicationCatalog.js entry points already produce for the same object.');
    }

    // ===============================================================
    // Section I — Presentation: ordinary vocabulary, no raw identifiers
    // exposed as the primary affordance.
    // ===============================================================
    {
        const canvasSource = await rawSource('ui/components/WorldEncounterCanvas.js');
        const actionsBlockStart = canvasSource.indexOf('world-encounter-observer-local-actions');
        const actionsBlockEnd = canvasSource.indexOf('world-encounter-observer-local-commentary-panel');
        const actionsBlock = canvasSource.slice(actionsBlockStart, actionsBlockEnd);

        assert(actionsBlock.includes('>Open</button>') && actionsBlock.includes('>Explore</button>') && actionsBlock.includes('>Fork</button>'), 'I1. The three route actions are labeled with plain verbs — "Open"/"Explore"/"Fork" — never a raw field name or internal identifier.');
        // I2. Extract only the literal TEXT NODES the actions block would
        // actually render to the screen (the content between `>` and `<`
        // for each element) — deliberately excluding attribute bindings
        // (`v-if`, `@click`, `class`) and this milestone's own source
        // comments, which never render and legitimately do name these
        // fields for maintainers.
        const renderedTextNodes = actionsBlock.match(/>[^<>{]*(?:\{\{[^}]*\}\})?[^<>]*</g) || [];
        const renderedText = renderedTextNodes.join(' ');
        assert(!/publicationId|contentHash|\bdocumentId\b|\blocator\b/i.test(renderedText),
            'I2. No publicationId/contentHash/documentId/locator field is ever RENDERED as text in the actions block — only plain verbs and the resolved Publication\'s own .title.');
        assert(actionsBlock.includes("{{ observerLocalEncounterActionablePublication.title || 'This publication' }}"), 'I3. The block heading reads the resolved Publication\'s own .title in ordinary language, falling back to plain prose ("This publication") rather than ever falling back to an id.');

        const commentaryBlockStart = canvasSource.indexOf('world-encounter-observer-local-commentary-panel');
        const commentaryBlockEnd = canvasSource.indexOf('world-encounter-observer-local-inspection-close');
        const commentaryBlock = canvasSource.slice(commentaryBlockStart, commentaryBlockEnd);
        assert(commentaryBlock.includes(">Comment</button>") || commentaryBlock.includes("'Comment'"), 'I4. Comment is likewise labeled in plain language.');

        console.log('✓ I — the panel communicates each action in ordinary user vocabulary (Open/Explore/Fork/Comment, and the Publication\'s own title) without exposing publicationId/contentHash/documentId/locator as the primary affordance.');
    }

    // ===============================================================
    // Section J — Boundary: observer-local encounters remain a temporary
    // spatial presentation of a known Publication, never a second
    // Publication-management system.
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const publicationId = 'pub-j-boundary';
        const contentHash = 'hash-j-boundary';
        const publication = new Publication({ id: publicationId, documentId: 'doc-j-boundary', title: 'J', contentHash, contentReference: new ContentReference({ hash: contentHash }) });
        knowPublicationsLocally(storageProvider, [publication]);
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const verifier = new MapVerifier({ [publicationId]: true });

        let addCalls = 0;
        const discoveryProvider = { add: () => { addCalls += 1; } };
        const ctx = buildCanvasInstance({
            materialSources: { local: localSource },
            materialVerifier: verifier,
            decentralizedPublicationDiscoveryProvider: discoveryProvider,
            openPublicationCommand: commandSpy(),
            forkPublicationCommand: commandSpy(),
            explorePublicationCommand: commandSpy()
        });

        ctx.selectObserverLocalEncounter({ publicationId, contentHash });
        await flush();
        // AMENDED BY 0.9.595 — Admit Verified Observer-Local Publications
        // into Repository Discovery. At the time this section was written
        // (0.9.558), selecting/inspecting never admitted at all, so
        // addCalls was 0 even before any action. 0.9.595 added exactly one
        // admission call to refreshObserverLocalEncounterInspection()
        // itself — triggered by selectObserverLocalEncounter() above, NOT
        // by any of the three action methods below.
        assert(addCalls === 1, 'J1-pre. AMENDED BY 0.9.595: selecting/inspecting this AVAILABLE + VERIFIED encounter now admits it exactly once, via refreshObserverLocalEncounterInspection() — before any of the three actions below run at all.');
        ctx.openObserverLocalEncounterPublication();
        ctx.forkObserverLocalEncounterPublication();
        ctx.exploreObserverLocalEncounterPublication();

        assert(addCalls === 1, 'J1. AMENDED BY 0.9.595: none of the three new actions themselves EVER calls decentralizedPublicationDiscoveryProvider.add() — addCalls stays at exactly 1 (the one admission from selection/inspection, above) after all three actions run; this section\'s own original point (these actions never trigger a SECOND, independent Repository insertion of their own) still holds, unweakened.');

        const canvasSource = await rawSource('ui/components/WorldEncounterCanvas.js');
        const milestoneSectionStart = canvasSource.indexOf('// OBSERVER-LOCAL ENCOUNTERS.');
        const milestoneSectionEnd = canvasSource.indexOf('export default {');
        const milestoneHeader = canvasSource.slice(milestoneSectionStart, milestoneSectionEnd);
        assert(milestoneHeader.includes('NOT A FOURTH ACTION SET') && milestoneHeader.includes('never the Publication Catalog/Repository browser'), 'J2. Sanity: this milestone\'s own header documents the boundary it holds to — no fifth action, no catalog/search surface.');
        assert(!canvasSource.includes('function searchObserverLocalEncounters') && !canvasSource.includes('observerLocalEncounterCatalog'), 'J3. No catalog/search surface of any kind was introduced for observer-local encounters.');

        console.log('✓ J — AMENDED BY 0.9.595: observer-local encounters remain a temporary, session-local spatial presentation of an already-known Publication. Selecting/inspecting one now DOES admit it into Repository discovery (0.9.595, exactly once) — but none of the three continuation actions (Open/Fork/Explore) themselves ever triggers a second, independent insertion, and no catalog/search surface was introduced by this file.');
    }

    console.log('\n✅ All Known Publication Encounter Continuation tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All KnownPublicationEncounterContinuation tests passed');
}).catch((error) => {
    console.error('\n✗ KnownPublicationEncounterContinuation tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
