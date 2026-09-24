import { readFile } from 'node:fs/promises';

import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { SearchPublicationsUseCase } from '../application/SearchPublicationsUseCase.js';
import { PublicationQuery } from '../core/PublicationQuery.js';
import { ObserverLocalEncounterStore } from '../application/ObserverLocalEncounterStore.js';
import { LocalWorldEncounterMaterialSource } from '../application/LocalWorldEncounterMaterialSource.js';
import { WorldEncounterMaterialVerificationStatus } from '../application/WorldEncounterMaterialVerification.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { worldEncounterCanvasFiles, worldViewFiles } from './support/SourceFileGroups.js';

// 0.9.556 — Publication-to-World Return Journey Product Reassessment.
//
// TYPE: test-only product reassessment. Production changes: none.
//
// 0.9.552 through 0.9.555 built and then reassessed the observer-local
// encounter arc in ISOLATION: WALK -> DISCOVER -> observer-local encounter
// -> INSPECT -> (0.9.555) confirmed ephemeral retention is correct as-is.
// Every one of those milestones asked questions ABOUT the encounter itself.
// None of them asked the broader question this milestone's own brief poses:
// once a Wanderer has discovered and inspected a novel Publication this way,
// does that experience connect coherently to the REST of ForkBuild's
// Publication lifecycle (Repository, Editor, Search — the surfaces 0.9.532
// through 0.9.535 already audited for the OLDER, pre-encounter entry
// points), or does it dead-end?
//
// Ten lettered sections (A-J), mirroring the originating brief's own
// lettering. Every claim is checked against real, unmodified production
// source — the real WorldEncounterCanvas component driven through its own
// data/computed/methods/mounted/beforeUnmount (0.9.553/0.9.554/0.9.555's own
// established discipline), the real ObserverLocalEncounterStore, the real
// LocalWorldEncounterMaterialSource, and the real SearchPublicationsUseCase/
// PublicationQuery Repository search actually runs — never asserted from
// milestone history alone, and never from this file's own prose.
//
// A CONSTRAINT INHERITED FROM 0.9.535/0.9.550, RECONFIRMED FRESH BELOW —
// application/WorldNavigationSession.js's own first import
// (RenderWorldViewUseCase.js) transitively reaches renderer/Renderer.js,
// which imports 'three' — not installed in this Node-only harness (checked
// fresh: `node -e "import('three')"` still throws "Cannot find package
// 'three'"). ui/views/WorldView.js imports WorldNavigationSession, so it
// carries the same constraint one layer up. Neither is imported as a
// module anywhere in this file; wherever this milestone's own brief asks
// about WorldView/WorldNavigationSession-level facts (Sections B, D, E),
// this file reads the real, unmodified source as TEXT instead — the same
// technique 0.9.535 Section A already established for exactly this reason.
// WorldEncounterCanvas.js and ObserverLocalEncounterStore.js both import
// cleanly (checked fresh) and are exercised live throughout.
//
// FINDING (preview; see the verdict block at the end of this file for the
// full reasoning): mostly ALREADY_CORRECT / DELIBERATE_BOUNDARY, matching
// this arc's established restraint — continuity holds everywhere identity,
// session-scoping, and failure-isolation were already engineered on
// purpose. One genuine, narrow PRODUCT_GAP survives (Section D): the
// "return journey" the originating brief assumes ("open/explore existing
// Publication functionality") has no actual on-ramp from what a Wanderer
// sees during a World encounter — not because of any deliberate
// persistence boundary (that was 0.9.555's own question, answered), but
// because the identifiers the inspection panel shows (publicationId,
// contentHash) are not searchable through the one Repository mechanism
// that could get a Wanderer to Open/Fork/Explore. Not recommended for
// action in this milestone, per this arc's own established restraint
// (0.9.555 F/G, 0.9.553 H).

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

// Writes a plain Publication record directly into the SAME
// 'forkbuild-publications' storage key LocalDiscoveryProvider/
// LocalWorldEncounterMaterialSource/SearchPublicationsUseCase all read
// from — mirrors tests/ObserverLocalEncounterInspectionCapability.test.js's
// own knowPublicationLocally() exactly, duplicated here per this
// codebase's own established convention (each audit/implementation file
// owns its own harness).
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

// ===================================================================
// WorldEncounterCanvas real-component harness — mirrors tests/
// ObserverLocalEncounterInspectionCapability.test.js's own
// buildCanvasInstance()/mountCanvas()/unmountCanvas() exactly, duplicated
// here per this codebase's own established convention.
// ===================================================================

function buildCanvasInstance({ registry = null, observerLocalEncounterRegistry = null, materialSources = null, materialVerifier = null, decentralizedPublicationDiscoveryProvider = null } = {}) {
    const ctx = {
        registry,
        observerLocalEncounterRegistry,
        view: WorldEncounterCanvas.props.view.default(),
        materialSources,
        materialVerifier,
        decentralizedPublicationDiscoveryProvider
    };
    Object.assign(ctx, WorldEncounterCanvas.data.call(ctx));
    Object.assign(ctx, WorldEncounterCanvas.methods);
    for (const name of ['resolvedEncounterSelection', 'resolvedLead', 'observerLocalEncounterResolvedSelection']) {
        Object.defineProperty(ctx, name, {
            get() { return WorldEncounterCanvas.computed[name].call(ctx); }
        });
    }
    return ctx;
}

function mountCanvas(ctx) { WorldEncounterCanvas.mounted.call(ctx); }
function unmountCanvas(ctx) { WorldEncounterCanvas.beforeUnmount.call(ctx); }
function flush() { return new Promise((resolve) => setTimeout(resolve, 0)); }
function projectedObserverLocalEncountersOf(ctx) {
    return WorldEncounterCanvas.computed.projectedObserverLocalEncounters.call(ctx);
}

async function runTests() {
    console.log('Running Publication-to-World Return Journey Product Reassessment tests...\n');

    // ===============================================================
    // Section A — Publication identity continuity.
    //
    // encounter.publicationId === openedPublication.id, with no
    // reconstruction from contentHash, locator, documentId, or
    // discovery origin, ANYWHERE in the path a click on the
    // observer-local marker actually runs.
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const publicationId = 'pub-a-genuine-id';
        const contentHash = 'hash-a-shared';
        const documentId = 'doc-a-shared';
        const publication = new Publication({ id: publicationId, documentId, title: 'Section A Publication', contentReference: new ContentReference({ hash: contentHash }) });
        knowPublicationsLocally(storageProvider, [publication]);

        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const verifier = new MapVerifier({ [publicationId]: true });
        const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: verifier });

        ctx.selectObserverLocalEncounter({ publicationId, contentHash });
        await flush();

        assert(ctx.observerLocalEncounterResolvedSelection.objectId === publicationId, 'A1. The resolved selection carries the exact publicationId, unmodified.');
        assert(ctx.observerLocalEncounterInspection.loading.material.id === publicationId, 'A2. The loaded material IS the Publication whose .id === the encounter\'s own publicationId — never re-derived from contentHash or documentId.');
        assert(ctx.observerLocalEncounterInspection.loading.material.documentId === documentId, 'A3. Sanity: the SAME Publication instance, so its own documentId/contentHash travel with it as facts ABOUT the identified Publication, never as a substitute identity.');
        assert(verifier.calls.length === 1 && verifier.calls[0].objectId === publicationId, 'A4. Verification itself was asked about the exact publicationId — never contentHash or documentId substituted in its place.');

        // Structural: the ENTIRE observer-local encounter resolution chain
        // (selectObserverLocalEncounter -> observerLocalEncounterResolvedSelection
        // -> refreshObserverLocalEncounterInspection) never reads .documentId
        // or .contentHash off anything to construct an "identity" — it reads
        // exactly the two fields the marker itself already carried.
        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => rawSource(file)))).join('\n');
        const selectStart = canvasSource.indexOf('selectObserverLocalEncounter(marker) {');
        const resolvedStart = canvasSource.indexOf('observerLocalEncounterResolvedSelection() {');
        const selectBody = canvasSource.slice(selectStart, canvasSource.indexOf('},', selectStart));
        const resolvedBody = canvasSource.slice(resolvedStart, canvasSource.indexOf('},', resolvedStart));
        assert(selectBody.includes('marker.publicationId') && selectBody.includes('marker.contentHash'), 'A5. selectObserverLocalEncounter() stores exactly {publicationId, contentHash} off the marker — no other field.');
        assert(resolvedBody.includes('objectId: this.selectedObserverLocalEncounter.publicationId'), 'A6. observerLocalEncounterResolvedSelection\'s own objectId is, textually, selectedObserverLocalEncounter.publicationId — never a documentId or contentHash literal.');

        unmountCanvas(ctx);
        console.log('✓ A — Publication identity is exact and unsubstituted end to end: the marker\'s publicationId, the resolved selection\'s objectId, the loaded material\'s .id, and what the verifier was asked about are all the identical value, live and structurally.');
    }

    // ===============================================================
    // Section B — World session continuity across the actual "return"
    // trip: leaving WorldView (e.g. to open a Publication in the
    // Editor, or browse Repository) and coming back.
    //
    // WorldView.js's own comments already document that `session`
    // (application/WorldNavigationSession.js) and
    // `observerLocalEncounterStore` are each constructed fresh, once,
    // inside WorldView's own setup() — this section verifies that
    // documentation against the real source (never re-asserts it from
    // the comment's own prose) and establishes the precise, narrower
    // scope this milestone's own brief did not yet distinguish:
    // "returning to World" is not merely a RELOAD-shaped event
    // (0.9.555's own angle) — ANY route change away from WorldView,
    // including the ordinary "open what I found" trip this milestone
    // is about, produces the identical fresh-mount outcome, because
    // Vue Router destroys and reconstructs the WorldView component
    // instance for a different top-level route.
    // ===============================================================
    {
        const worldViewSource = (await Promise.all(worldViewFiles().map((file) => rawSource(file)))).join('\n');

        // B1. Exactly one construction site for each, and it is inside
        // setup() (this file has no module-level `const session =` or
        // `const observerLocalEncounterStore =` outside the function
        // body), so a NEW WorldView mount unavoidably means a NEW
        // session and a NEW store, not a shared, module-scoped one.
        const sessionConstructions = (worldViewSource.match(/const session = worldViewFactory\.createSession\(/g) || []).length;
        const storeConstructions = (worldViewSource.match(/new ObserverLocalEncounterStore\(\)/g) || []).length;
        assert(sessionConstructions === 1, 'B1. Exactly one `const session = worldViewFactory.createSession(...)` call in ui/views/WorldView.js — never a module-level singleton reused across mounts.');
        assert(storeConstructions === 1, 'B2. Exactly one `new ObserverLocalEncounterStore()` call in ui/views/WorldView.js — same "fresh per mount" shape as `session`.');

        // B3. The file's OWN comment, already present, states the scope
        // this section verifies structurally rather than merely quoting —
        // present so a future edit to this comment (without a
        // corresponding change to setup()'s own body) is caught by B1/B2
        // above rather than by this string match alone.
        assert(worldViewSource.includes('never surviving a remount or\n        // shared with any other Wanderer'), 'B3. WorldView.js\'s own 0.9.552 comment already documents "never surviving a remount" for observerLocalEncounterStore — reconfirmed structurally by B1/B2, not merely quoted.');

        // B4. session.dispose() is called unconditionally in
        // onBeforeUnmount() — leaving WorldView (for ANY reason, not
        // only a reload) tears the session down; there is no code path
        // that detaches and re-attaches the SAME session instance to a
        // later WorldView mount.
        const onBeforeUnmountStart = worldViewSource.indexOf('onBeforeUnmount(() => {');
        const onBeforeUnmountBody = worldViewSource.slice(onBeforeUnmountStart, onBeforeUnmountStart + 4000);
        assert(onBeforeUnmountBody.includes('session.dispose();'), 'B4. onBeforeUnmount() unconditionally calls session.dispose() — leaving WorldView by ANY route change (not only a reload) disposes the current session.');

        // B5. No position/orientation restoration mechanism exists
        // anywhere in this file — no "restore", "lastPosition", or
        // "spawn" concept tied to a PREVIOUS session's own avatar state.
        // A fresh mount is a fresh mount; whatever position a Wanderer
        // ends up at is this file's own DEFAULT placement logic, never a
        // continuation of where they stood before leaving.
        assert(!/restoreAvatarPosition|lastKnownPosition|persistAvatarPosition|resumeSession/i.test(worldViewSource), 'B5. No restoreAvatarPosition/lastKnownPosition/persistAvatarPosition/resumeSession concept exists in WorldView.js — position/orientation are not continuity-preserved across a leave-and-return trip; this is a fresh camera/session, not a resumed one.');

        console.log('✓ B — Confirmed, structurally and precisely: leaving WorldView by ANY route change (not only 0.9.555\'s own reload angle) tears down `session` and `observerLocalEncounterStore` unconditionally, and no mechanism restores a Wanderer\'s prior position/orientation on return — a documented, deliberate consequence of "fresh instance per mount," not an oversight.');
    }

    // ===============================================================
    // Section C — Observer-local encounter lifecycle across the same
    // "leave, then return" trip.
    //
    // 0.9.555 already proved this for a full session/reload boundary
    // (its own Sections A-D). This section re-runs the SAME shape
    // through the actual component lifecycle hooks (mounted/
    // beforeUnmount) that a router-driven remount invokes, rather than
    // relying on 0.9.555's own reload framing to cover it by
    // implication.
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const publicationId = 'pub-c-round-trip';
        const contentHash = 'hash-c-round-trip';
        const publication = new Publication({ id: publicationId, title: 'Section C Publication', contentReference: new ContentReference({ hash: contentHash }) });
        knowPublicationsLocally(storageProvider, [publication]);
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const verifier = new MapVerifier({ [publicationId]: true });

        // "Visit 1": a WorldView mount whose own ObserverLocalEncounterStore
        // records encounter X (mirroring what AutomaticSnapshotEncounterCascade's
        // real callback into the store would do on a genuine walk-based
        // discovery — see application/ObserverLocalEncounterStore.js's own
        // header for why `record()` is that callback's only writer).
        const storeVisit1 = new ObserverLocalEncounterStore();
        storeVisit1.record({ publicationId, contentHash, position: { x: 1, y: 0, z: 1 } });
        const ctxVisit1 = buildCanvasInstance({ observerLocalEncounterRegistry: storeVisit1, materialSources: { local: localSource }, materialVerifier: verifier });
        mountCanvas(ctxVisit1);
        assert(projectedObserverLocalEncountersOf(ctxVisit1).length === 1, 'C1. Visit 1: the encounter is present and projected.');
        ctxVisit1.selectObserverLocalEncounter({ publicationId, contentHash });
        await flush();
        assert(ctxVisit1.observerLocalEncounterInspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED, 'C2. Visit 1: fully inspectable and VERIFIED.');

        // The Wanderer now leaves — clicks something that opens the
        // Publication elsewhere (Editor/Repository), or simply navigates
        // away. Mirrors WorldView's own onBeforeUnmount() firing, then the
        // component/session/store all being discarded (Section B).
        unmountCanvas(ctxVisit1);

        // "Visit 2": a genuinely NEW WorldView mount — a NEW
        // ObserverLocalEncounterStore (per B1/B2's own structural proof),
        // empty by construction, because nothing about ctxVisit1's own
        // store instance is reused.
        const storeVisit2 = new ObserverLocalEncounterStore();
        const ctxVisit2 = buildCanvasInstance({ observerLocalEncounterRegistry: storeVisit2, materialSources: { local: localSource }, materialVerifier: verifier });
        mountCanvas(ctxVisit2);
        assert(projectedObserverLocalEncountersOf(ctxVisit2).length === 0, 'C3. Visit 2: encounter X is NOT present — it does not "come back" automatically merely because the Wanderer returned to the same World route; a fresh walk-based rediscovery (0.9.555 Section D\'s own finding) is what would repopulate it, not the return trip itself.');
        assert(ctxVisit2.selectedObserverLocalEncounter === null && ctxVisit2.observerLocalEncounterInspection === null, 'C4. Visit 2: no stale selection/inspection state leaks across the two mounts either — a brand-new component instance, not a rehydrated one.');

        // But the Publication itself — never the ephemeral encounter
        // record — is still genuinely there, and a fresh walk-triggered
        // record() (simulated directly here, mirroring 0.9.555 Section D's
        // own "fresh cascade instance reprocesses the same candidate from
        // scratch") reaches the exact same inspectable, VERIFIED outcome.
        storeVisit2.record({ publicationId, contentHash, position: { x: 1, y: 0, z: 1 } });
        ctxVisit2.selectObserverLocalEncounter({ publicationId, contentHash });
        await flush();
        assert(ctxVisit2.observerLocalEncounterInspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED, 'C5. Rediscovery on return reaches the identical VERIFIED outcome for the identical Publication — the underlying material was never actually lost, only the session-local ENCOUNTER RECORD of having already seen it once.');

        unmountCanvas(ctxVisit2);
        console.log('✓ C — The observer-local encounter itself does not survive a leave-and-return trip (a fresh, empty store greets every new WorldView mount, exactly as Section B predicts structurally) — but this is inspectability lost to REDISCOVERY COST, never to actual unavailability: the same Publication resolves and verifies identically the moment it is walked past again.');
    }

    // ===============================================================
    // Section D — Publication actions: does the existing Repository/
    // Editor functionality actually reach FROM what a Wanderer sees
    // during a World encounter?
    //
    // This is the flagship section. The originating brief assumed an
    // "Open/Explore existing Publication functionality" leg already
    // exists to audit for continuity. It does not — 0.9.555 Section F
    // already proved the inspection panel itself offers no such action.
    // This section goes one step further than 0.9.555 did: even set
    // aside any UI button, could a Wanderer who has SEEN the encounter's
    // own publicationId/contentHash use EITHER of them, by hand, through
    // the one Repository mechanism (search) that actually leads to
    // Open/Fork/Explore? Proven empirically against the real
    // SearchPublicationsUseCase/PublicationQuery, never asserted from
    // reading PublicationQuery.js's own comment alone.
    // ===============================================================
    {
        // D1/D2. AMENDED BY 0.9.558 — Known Publication Encounter
        // Continuation, mirroring this arc's own established amendment
        // precedent (0.9.552 amending 0.9.551, 0.9.554 amending 0.9.553,
        // for the identical situation each time). This section's own
        // finding was the named PRODUCT_GAP 0.9.557's audit then traced
        // to an EXISTING, already-resolved seam, and 0.9.558 wired: the
        // panel now DOES expose Open/Explore/Fork (gated on a genuine
        // AVAILABLE + VERIFIED resolution, never merely a "fully VERIFIED
        // encounter in front of them" fact alone) — reusing the SAME
        // Repository-independent seam D3-D6 below still show Repository
        // SEARCH itself can never reach.
        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => rawSource(file)))).join('\n');
        const panelStart = canvasSource.indexOf('world-encounter-observer-local-inspection-panel');
        const panelEnd = canvasSource.indexOf('0.9.183', panelStart);
        const panel = canvasSource.slice(panelStart, panelEnd);
        assert(panel.includes('>Open</button>') && panel.includes('>Explore</button>') && panel.includes('>Fork</button>'),
            'D1. AMENDED by 0.9.558: the observer-local inspection panel now DOES expose Open/Explore/Fork — reached through the already-resolved Publication object this section itself already found in hand, never through Repository/Catalog search.');
        assert(panel.includes('observerLocalEncounterActionablePublication.title'),
            'D2. AMENDED by 0.9.558: the panel now shows the Publication\'s own title (as the actions block\'s own heading) — the resolved material always carried it; only the template read publicationId/contentHash alone before this milestone.');

        // D3-D6. Empirically: can EITHER identifier the panel DOES show
        // (publicationId, contentHash) find this Publication through the
        // one Repository mechanism (PublicationCatalog's search, backed by
        // SearchPublicationsUseCase) that actually leads to Open/Fork/
        // Explore? Built with a REAL Publication, a REAL
        // LocalDiscoveryProvider, and the REAL SearchPublicationsUseCase —
        // never a stub standing in for search's own matching logic.
        const storageProvider = new InMemoryStorageProvider();
        const publicationId = 'pub-d-unreachable-by-id';
        const contentHash = 'hash-d-unreachable-by-hash';
        const publication = new Publication({ id: publicationId, title: 'Findable By Title Only', author: 'alice', contentReference: new ContentReference({ hash: contentHash }) });
        knowPublicationsLocally(storageProvider, [publication]);
        const discoveryProvider = new LocalDiscoveryProvider(storageProvider);
        const searchUseCase = new SearchPublicationsUseCase(discoveryProvider);

        const byPublicationId = searchUseCase.execute(new PublicationQuery({ text: publicationId }));
        const byContentHash = searchUseCase.execute(new PublicationQuery({ text: contentHash }));
        const byTitle = searchUseCase.execute(new PublicationQuery({ text: 'Findable By Title' }));

        assert(byPublicationId.items.length === 0, 'D3. Searching Repository by the EXACT publicationId the encounter panel showed returns ZERO results — the identifier is not a search key SearchPublicationsUseCase recognizes at all.');
        assert(byContentHash.items.length === 0, 'D4. Searching Repository by the EXACT contentHash the encounter panel showed returns ZERO results either.');
        assert(byTitle.items.length === 1 && byTitle.items[0].id === publicationId, 'D5. Sanity: Repository search DOES work — by title, which the encounter panel never shows.');

        // D6. Structural: confirm this is PublicationQuery's own genuine,
        // documented contract, not merely this one instance's behavior —
        // "text" matches only title/author(+opt-in description), by
        // design, never id or contentHash.
        const searchSource = await rawSource('application/SearchPublicationsUseCase.js');
        const matchesStart = searchSource.indexOf('_matches(publication');
        const matchesBody = searchSource.slice(matchesStart, searchSource.indexOf('\n    }', matchesStart));
        assert(!/\.id\b|contentHash/.test(matchesBody), 'D6. _matches() itself never reads .id or .contentHash on the candidate Publication — title/author/description are the ENTIRE match surface, by design, confirmed against the real source.');

        // D7. And there is no route addressed by publicationId anywhere —
        // Repository's own catalog actions (Open/Fork/Explore) are the
        // ONLY existing "continue with a Publication" functionality this
        // milestone's own brief asks about, and none of them are reachable
        // without already knowing the title/author.
        const catalogSource = await rawSource('ui/components/PublicationCatalog.js');
        assert(catalogSource.includes("router.push({ path: '/editor', query: { load: pub.documentId } })"), 'D7. Sanity: openPublication() is keyed by documentId (from a Publication object search already found), never a bare publicationId route — confirming there is no "/publication/:id"-shaped entry point this milestone could point a Wanderer toward either.');

        console.log('✓ D — PRODUCT_GAP (narrow, not recommended for action here, matching this arc\'s own established restraint): the "return journey" the originating brief assumed already exists does not. A Wanderer who fully inspects a novel Publication in World sees only publicationId/contentHash, and Repository\'s ONLY search mechanism cannot find a Publication by either — proven empirically, not merely read from a comment. This is a genuinely different, smaller finding than 0.9.555\'s own F/G (automatic admission, deliberately declined): this is about whether a HUMAN, doing the work themselves, can get from what they saw to Open/Fork/Explore, and today they cannot, unless they already separately know the title or author.');
    }

    // ===============================================================
    // Section E — Return navigation: does "opening what was found, then
    // returning" actually go through focusWorld(), or through something
    // else?
    // ===============================================================
    {
        const worldViewSource = (await Promise.all(worldViewFiles().map((file) => rawSource(file)))).join('\n');
        const catalogSource = await rawSource('ui/components/PublicationCatalog.js');

        // E1. focusWorld() itself: session.focusDocument() + router.replace +
        // refreshSpatialUI() — the mechanism 0.9.532 Section C already
        // named as the one shared "move camera + make active + sync route"
        // primitive for navigation INSIDE an already-mounted WorldView.
        const focusWorldStart = worldViewSource.indexOf('function focusWorld(documentId) {');
        const focusWorldBody = worldViewSource.slice(focusWorldStart, worldViewSource.indexOf('function focusSelection()', focusWorldStart));
        assert(focusWorldBody.includes('session.focusDocument(documentId)') && focusWorldBody.includes("router.replace({ path: `/world/${documentId}` })"), 'E1. focusWorld() itself is unchanged: session.focusDocument() + router.replace() + refreshSpatialUI().');

        // E2. But focusWorld() is a closure over THIS mount's OWN `session`
        // (Section B) — it can only ever be called from code running
        // inside an already-mounted WorldView. PublicationCatalog.js (the
        // Repository/Editor side of this milestone's own "return" journey)
        // is never inside a WorldView mount, so its own "Explore" action
        // cannot call focusWorld() even in principle — it uses a bare
        // router.push(), landing on a FRESH WorldView mount instead, the
        // same "cold entry" shape 0.9.532 Section C already established
        // for Repository's own router.push() from EditorView.
        assert(!catalogSource.includes('focusWorld'), 'E2. PublicationCatalog.js never references focusWorld() at all — confirming the "return to World" leg of this milestone\'s own journey is structurally a NEW WorldView mount (Section B/C\'s own "fresh instance" facts), never a live continuation of a still-running focusWorld()-capable session.');
        assert(catalogSource.includes("router.push({ path: `/world/${pub.documentId}` })"), "E3. viewWorld()'s own router.push() is exactly the pre-existing, already-audited (0.9.532 Section C) shape — no new World-return mechanism was introduced anywhere in this arc.");

        console.log('✓ E — "Returning to World" from Editor/Repository (this milestone\'s own \'return\' leg) reuses the exact, pre-existing router.push({path:`/world/${documentId}`}) entry 0.9.532 already audited — never a new mechanism, and, per Section B/E2, never actually a resumption of a still-live focusWorld()-capable session either: it is always a cold, fresh WorldView mount, by construction.');
    }

    // ===============================================================
    // Section F — Content/evidence continuity: does the SAME identity
    // survive from encounter to Publication to material?
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const publicationId = 'pub-f-evidence-chain';
        const contentHash = 'hash-f-evidence-chain';
        const documentId = 'doc-f-evidence-chain';
        const publication = new Publication({ id: publicationId, documentId, title: 'Evidence Chain Publication', contentReference: new ContentReference({ hash: contentHash }) });
        knowPublicationsLocally(storageProvider, [publication]);
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const verifier = new MapVerifier({ [publicationId]: true });
        const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: verifier });

        ctx.selectObserverLocalEncounter({ publicationId, contentHash });
        await flush();

        const encounterMaterial = ctx.observerLocalEncounterInspection.loading.material;
        // Separately, "elsewhere in ForkBuild" (Repository/Editor), the
        // SAME publicationId is looked up through the SAME underlying
        // repository (LocalDiscoveryProvider) any other surface already
        // uses — never a second, parallel Publication representation.
        const discoveryProvider = new LocalDiscoveryProvider(storageProvider);
        const repositorySideLookup = discoveryProvider.findById(publicationId);

        assert(encounterMaterial.id === repositorySideLookup.id, 'F1. World\'s own encounter material and Repository\'s own lookup resolve to the SAME publicationId.');
        assert(encounterMaterial.contentHash === repositorySideLookup.contentHash, 'F2. ...and the SAME contentHash.');
        assert(encounterMaterial.documentId === repositorySideLookup.documentId, 'F3. ...and the SAME documentId — no semantic discontinuity of the "World says X, Publication surface says a different identity/material" shape the originating brief warned about.');
        assert(ctx.observerLocalEncounterInspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED, 'F4. Sanity: the World-side verification that would read "Confirmed to match this Publication" (per this milestone\'s own brief, item F) is genuinely VERIFIED, for this exact Publication.');

        unmountCanvas(ctx);
        console.log('✓ F — Encounter -> Publication -> material -> verification all trace back to one identical Publication record, read from one underlying repository — no divergent identity/material anywhere in the chain.');
    }

    // ===============================================================
    // Section G — Failure/interruption isolation.
    // ===============================================================
    {
        // G1. A stale, in-flight inspection request that resolves AFTER
        // this WorldView mount has already been left (unmounted) is
        // discarded rather than corrupting a since-destroyed context —
        // mirrors 0.9.554 Section J's own guard, reconfirmed here for
        // the specific "unmount via leaving to open a Publication
        // elsewhere" trigger this milestone is actually about.
        const publicationId = 'pub-g-late-response';
        const contentHash = 'hash-g-late-response';
        let resolveLoad;
        const gatedSource = {
            load: () => new Promise((resolve) => { resolveLoad = resolve; })
        };
        const ctx = buildCanvasInstance({ materialSources: { local: gatedSource }, materialVerifier: new MapVerifier({ [publicationId]: true }) });
        mountCanvas(ctx);
        ctx.selectObserverLocalEncounter({ publicationId, contentHash });
        unmountCanvas(ctx); // the Wanderer leaves before the load ever resolves
        resolveLoad(new Publication({ id: publicationId, contentReference: new ContentReference({ hash: contentHash }) }));
        await flush();
        assert(ctx.observerLocalEncounterInspection === null, 'G1. A material load that resolves AFTER the Wanderer has already left (unmounted) never writes into observerLocalEncounterInspection — the stale-response guard (materialInspectionRequestId-style) holds across this exact "left to go do something else" trigger, not only across a same-session re-selection.');

        // G2. The reverse: a broken (asynchronously rejecting) materialSource
        // — standing in for "opening the Publication elsewhere failed" —
        // never corrupts unrelated World state, and (mirroring 0.9.554
        // Section I's own established shape exactly: a genuine rejection is
        // never silently swallowed into a fabricated result, it surfaces as
        // an unhandled rejection here, precisely as that section's own
        // I4a/I4b already proved for this same component) is contained to
        // this one selection alone.
        const brokenSource = { load: () => Promise.reject(new Error('simulated Publication-surface failure')) };
        const ctx2 = buildCanvasInstance({ materialSources: { local: brokenSource }, materialVerifier: new MapVerifier({}) });
        mountCanvas(ctx2);
        let observedRejection = null;
        const onUnhandledRejection = (err) => { observedRejection = err; };
        process.on('unhandledRejection', onUnhandledRejection);
        let threw = false;
        try {
            ctx2.selectObserverLocalEncounter({ publicationId: 'pub-g2', contentHash: 'hash-g2' });
        } catch (err) {
            threw = true;
        }
        assert(!threw, 'G2. selectObserverLocalEncounter() never throws synchronously even when the underlying material source itself will reject — a failure opening/loading a Publication surfaces only in the async inspection promise.');
        await flush();
        process.removeListener('unhandledRejection', onUnhandledRejection);
        assert(observedRejection !== null, 'G3. The broken destination\'s own failure genuinely propagates (as an unhandled rejection here, exactly 0.9.554 Section I\'s own established shape) rather than being silently swallowed into a fabricated result.');
        assert(ctx2.selectedObserverLocalEncounter !== null, 'G4. ...and the selection itself (what the Wanderer clicked) is left intact — only the derived inspection result is missing, exactly the same "selection survives; inspection alone is unavailable" shape 0.9.554 Section I already established for a broken collaborator.');

        unmountCanvas(ctx2);
        console.log('✓ G — Failure isolation holds specifically across the "left mid-inspection" and "the destination failed" shapes this milestone is about, not merely across the generic collaborator-failure shapes 0.9.554 already covered.');
    }

    // ===============================================================
    // Section H — Republished Publications: P1/P2 share a contentHash
    // (and, realistically, a documentId — both are Publications OF THE
    // SAME Document D) but have distinct publicationIds. Does opening
    // one from an encounter ever silently become the other?
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const sharedDocumentId = 'doc-h-shared';
        const sharedContentHash = 'hash-h-shared';
        const p1 = new Publication({ id: 'pub-h-p1', documentId: sharedDocumentId, title: 'Republished As P1', author: 'alice', contentReference: new ContentReference({ hash: sharedContentHash }) });
        const p2 = new Publication({ id: 'pub-h-p2', documentId: sharedDocumentId, title: 'Republished As P2', author: 'bob', contentReference: new ContentReference({ hash: sharedContentHash }) });
        assert(p1.contentHash === p2.contentHash && p1.documentId === p2.documentId && p1.id !== p2.id, 'H0. Sanity: the adversarial fixture itself is genuinely two distinct Publications of the same Document with the same bytes.');
        knowPublicationsLocally(storageProvider, [p1, p2]);

        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const verifier = new MapVerifier({ 'pub-h-p1': true, 'pub-h-p2': true });
        const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: verifier });

        ctx.selectObserverLocalEncounter({ publicationId: p1.id, contentHash: sharedContentHash });
        await flush();
        assert(ctx.observerLocalEncounterInspection.loading.material.id === p1.id, 'H1. Selecting P1\'s own marker resolves to P1 specifically.');
        assert(ctx.observerLocalEncounterInspection.loading.material.title === 'Republished As P1', 'H2. ...with P1\'s own title, never P2\'s.');

        ctx.selectObserverLocalEncounter({ publicationId: p2.id, contentHash: sharedContentHash });
        await flush();
        assert(ctx.observerLocalEncounterInspection.loading.material.id === p2.id, 'H3. Selecting P2\'s own marker (same contentHash!) resolves to P2 specifically — never silently collapsing to P1 merely because the bytes are identical.');
        assert(ctx.observerLocalEncounterInspection.loading.material.title === 'Republished As P2', 'H4. ...with P2\'s own title.');

        assert(verifier.calls[0].objectId === p1.id && verifier.calls[1].objectId === p2.id, 'H5. The verifier itself was asked about each distinct publicationId in turn — never asked about a shared contentHash or documentId key.');

        // H6. Separately, and deliberately NOT a Section H failure: World's
        // own navigation (viewWorld()/focusWorld(), Section E) is keyed by
        // documentId — P1 and P2, sharing a documentId, land in the SAME
        // World if "Explored" from Repository. That is Section E's own
        // pre-existing, DELIBERATE architectural fact (World is a
        // per-Document space, not a per-Publication one) and is never
        // conflated with the encounter/material identity this section
        // actually tests, which stays per-publicationId throughout.
        const catalogSource = await rawSource('ui/components/PublicationCatalog.js');
        assert(catalogSource.includes('viewWorld(pub) {') && catalogSource.includes('/world/${pub.documentId}'), 'H6. Confirmed structurally: Explore/viewWorld() is documentId-keyed by design — a fact about World\'s own scope, not a publicationId/contentHash identity collapse of the kind this section otherwise guards against.');

        unmountCanvas(ctx);
        console.log('✓ H — P1 vs. P2 identity holds exactly through the observer-local encounter path: distinct publicationIds resolve, verify, and display as distinct Publications despite an identical contentHash and documentId — while World\'s own SEPARATE, pre-existing per-Document navigation scope (Section E) is neither weakened nor mistaken for an identity gap here.');
    }

    // ===============================================================
    // Section I — Cross-Wanderer behavior.
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const publicationId = 'pub-i-shared-publication';
        const contentHash = 'hash-i-shared-publication';
        const publication = new Publication({ id: publicationId, title: 'Shared Publication', contentReference: new ContentReference({ hash: contentHash }) });
        knowPublicationsLocally(storageProvider, [publication]);
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const verifier = new MapVerifier({ [publicationId]: true });

        // Wanderer A: own store, own canvas mount, own selection.
        const storeA = new ObserverLocalEncounterStore();
        const ctxA = buildCanvasInstance({ observerLocalEncounterRegistry: storeA, materialSources: { local: localSource }, materialVerifier: verifier });
        mountCanvas(ctxA);
        storeA.record({ publicationId, contentHash });
        ctxA.selectObserverLocalEncounter({ publicationId, contentHash });
        await flush();
        assert(ctxA.observerLocalEncounterInspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED, 'I1. Wanderer A independently discovers, selects, and verifies the Publication.');

        // Wanderer B: a genuinely SEPARATE store/canvas — never
        // constructed from, or given a reference to, storeA/ctxA.
        const storeB = new ObserverLocalEncounterStore();
        const ctxB = buildCanvasInstance({ observerLocalEncounterRegistry: storeB, materialSources: { local: localSource }, materialVerifier: verifier });
        mountCanvas(ctxB);
        assert(storeB.list().length === 0, 'I2. Wanderer B\'s own store starts empty — A\'s own record() call has no path to reach it (no shared object between the two stores at all, per ObserverLocalEncounterStore.js\'s own constructor).');
        assert(ctxB.selectedObserverLocalEncounter === null, 'I3. B never inherits A\'s own selection/inspection state either.');

        // But B CAN independently discover the SAME Publication through
        // decentralized/local discovery — this is the one thing that
        // SHOULD converge across Wanderers (the Publication itself is a
        // shared fact); only the ENCOUNTER RECORD is Wanderer-local.
        storeB.record({ publicationId, contentHash });
        ctxB.selectObserverLocalEncounter({ publicationId, contentHash });
        await flush();
        assert(ctxB.observerLocalEncounterInspection.loading.material.id === publicationId, 'I4. B\'s own independent discovery of the identical Publication resolves to the identical Publication identity A already saw — the SHARED fact (the Publication) converges; the PER-WANDERER fact (having encountered it) never does.');

        unmountCanvas(ctxA);
        unmountCanvas(ctxB);
        console.log('✓ I — Cross-Wanderer isolation of the ephemeral encounter record holds by construction (no shared store reference exists), while independent discovery of the same underlying Publication converges correctly — exactly the two different things this section needed to keep apart.');
    }

    // ===============================================================
    // Section J — Product classification.
    // ===============================================================
    console.log('\n=== 0.9.556 VERDICT ===');
    console.log(`
Ten sections, checked against real, unmodified production source and real
object graphs throughout — never asserted from this arc's own prior
milestone history alone.

  A — ALREADY_CORRECT. Publication identity (publicationId) travels
      unsubstituted from marker -> resolved selection -> loaded material ->
      verifier call, live and structurally. No reconstruction from
      contentHash/documentId/locator anywhere in the path.

  B — DOCUMENTATION_GAP, now closed by this milestone. 0.9.555 examined
      retention across a RELOAD; this section establishes, structurally,
      that the identical fresh-instance outcome (session AND
      observerLocalEncounterStore both discarded, no position/orientation
      restoration of any kind) follows from ANY route change away from
      WorldView — including the ordinary "go open what I found" trip this
      milestone is actually about, which is a much more common event than
      a reload. The underlying behavior needed no change; the SCOPE of an
      already-true fact is now explicit.

  C — ALREADY_CORRECT, reconfirmed through the actual component lifecycle
      (mounted/beforeUnmount) rather than 0.9.555's reload framing alone.
      An encounter does not survive a leave-and-return trip, but the
      Publication it named remains fully, identically inspectable the
      moment a fresh discovery walks past it again — rediscovery cost, not
      data loss.

  D — PRODUCT_GAP, the one real finding, NOT recommended for action in
      this milestone (matching this arc's own established restraint —
      0.9.555 F/G, 0.9.553 H). The originating brief's own premise — "can a
      Wanderer naturally continue into existing Open/Explore/Fork
      functionality" — does not hold empirically: the inspection panel
      shows only publicationId/contentHash, and Repository's own search
      (the one path to Open/Fork/Explore) matches ONLY title/author/
      description, proven against the real SearchPublicationsUseCase, not
      merely read from PublicationQuery.js's own comment. This is
      distinct from 0.9.555's own F/G (declining AUTOMATIC Repository
      admission): this is about whether a Wanderer, doing the work
      themselves with what they can see, can get there at all — today,
      only if they already separately know the title or author.

  E — ALREADY_CORRECT. "Returning to World" from Editor/Repository reuses
      the pre-existing, already-audited (0.9.532 Section C) router.push
      entry — never a new mechanism — and is, structurally, always a cold
      WorldView mount rather than a resumed focusWorld()-capable session,
      consistent with Section B.

  F — ALREADY_CORRECT. Encounter, Repository lookup, and verification all
      trace to one identical Publication record from one underlying
      repository — no semantic discontinuity of the "World says X,
      Publication surface says something else" shape.

  G — ALREADY_CORRECT. Failure isolation (a stale response after leaving;
      a broken destination) holds specifically for the "left mid-
      inspection" / "destination failed" shapes this milestone is about,
      not only the generic collaborator-failure shapes 0.9.554 already
      proved.

  H — ALREADY_CORRECT. P1/P2 (shared contentHash AND documentId, distinct
      publicationId) resolve, verify, and display as genuinely distinct
      Publications through the observer-local path — while World's own,
      separate, pre-existing per-Document navigation scope (Explore is
      documentId-keyed) is correctly NOT treated as an identity collapse.

  I — ALREADY_CORRECT, holding by construction (ObserverLocalEncounterStore's
      own header already named this as falling out of "no shared object
      between two Wanderers' own stores," reconfirmed live here). The
      ephemeral encounter record never crosses Wanderers; independent
      discovery of the same underlying Publication correctly converges.

Per this milestone's own brief: continuity between the newly-completed
observer-local encounter arc (0.9.552-0.9.555) and the rest of the
Publication lifecycle (0.9.532-0.9.535's own earlier entry points) holds
almost everywhere it was already engineered to hold, on purpose. The one
survivor is Section D, and it is small and well-understood enough that
fixing it (if ever pursued) is either "show title/author in the
inspection panel" or "let Repository search match a publicationId/
contentHash" — never a new persistence concept, and never a re-opening of
0.9.555's own already-settled retention question. No production code
changes ship with this milestone.

Per the originating brief's own framing: this is a clean result. The
walking discovery -> observer-local encounter -> inspection -> rediscovery
line (0.9.552-0.9.556) is complete. The next milestone should come from a
genuinely different product surface, not from re-auditing World again
absent new evidence.
`);

    console.log('✅ All Publication-to-World Return Journey Product Reassessment tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All PublicationToWorldReturnJourneyProductReassessment tests passed');
}).catch((error) => {
    console.error('\n✗ PublicationToWorldReturnJourneyProductReassessment tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
