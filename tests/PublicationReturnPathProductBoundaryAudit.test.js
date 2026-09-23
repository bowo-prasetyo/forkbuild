import { readFile } from 'node:fs/promises';

import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { SearchPublicationsUseCase } from '../application/SearchPublicationsUseCase.js';
import { PublicationQuery } from '../core/PublicationQuery.js';
import { LocalWorldEncounterMaterialSource } from '../application/LocalWorldEncounterMaterialSource.js';
import { WorldEncounterMaterialVerificationStatus } from '../application/WorldEncounterMaterialVerification.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';

// 0.9.557 — Publication Return-Path Product Boundary Audit.
//
// TYPE: test-only product boundary audit. Production changes: none.
//
// 0.9.556 Section D found exactly one PRODUCT_GAP in the observer-local
// encounter arc: a Wanderer who fully inspects a novel Publication in
// World sees only publicationId/contentHash, and Repository's own
// free-text search (SearchPublicationsUseCase/PublicationQuery) cannot
// find a Publication by either. 0.9.556 deliberately did not act on this
// — per this arc's own established restraint (0.9.555 F/G, 0.9.553 H) —
// and named the obvious-looking fix ("let Repository search match a
// publicationId/contentHash") only as ONE possibility, not a
// recommendation.
//
// This milestone asks the narrower question that fix would otherwise
// skip past: does a legitimate "known Publication -> existing Publication
// action" seam ALREADY EXIST — one that never needs Repository's
// free-text search at all — or would closing 0.9.556 Section D genuinely
// require a NEW Repository lookup/navigation capability?
//
// Ten lettered sections (A-J), mirroring the originating brief's own
// lettering. Every claim is checked against real, unmodified production
// source and real object graphs — the real WorldEncounterCanvas
// component, the real LocalDiscoveryProvider, the real
// SearchPublicationsUseCase/PublicationQuery, and the real
// PublicationCatalog.js/Publication.js source — never asserted from
// 0.9.556's own prose alone, even where this file reconfirms one of its
// findings.
//
// FINDING (preview; see the verdict block at the end of this file for
// full reasoning): EXISTING_RETURN_SEAM. The Publication instance a
// Wanderer's own World encounter already resolves (`observerLocalEncounter
// Inspection.loading.material` — the exact same object
// `discovery/LocalDiscoveryProvider.js#findById()` hands out everywhere
// else in this codebase) already carries every field
// `ui/components/PublicationCatalog.js`'s own Open/Fork/Explore/Author
// actions read (`documentId`, `id`, `author`) — proven empirically, not
// merely by field name. Closing 0.9.556 Section D never needs a new
// Repository search capability at all; it needs the inspection panel to
// (a) show what it already holds and (b) call the same navigation
// functions Repository already has, with the object it already resolved.
// Separately, Section G below shows why the ORIGINALLY-NAMED alternative
// — a Repository search keyed on contentHash — would not even be safe:
// it would reintroduce exactly the republish ambiguity 0.9.556 Section H
// already tested for the encounter path itself.

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

// Mirrors tests/PublicationToWorldReturnJourneyProductReassessment.test.js's
// own knowPublicationsLocally() exactly, duplicated here per this
// codebase's own established per-file harness convention.
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

async function runTests() {
    console.log('Running Publication Return-Path Product Boundary Audit tests...\n');

    // ===============================================================
    // Section A — Inventory: existing Publication continuation paths,
    // and exactly what identity each one accepts.
    // ===============================================================
    {
        const catalogSource = await rawSource('ui/components/PublicationCatalog.js');
        const cardSource = await rawSource('ui/components/PublicationCard.js');

        // A1. Open/Fork/Explore each take a full `pub` object and read
        // only .documentId/.id off it — never a bare id string passed
        // through a search box.
        assert(catalogSource.includes("function openPublication(pub) {\n            router.push({ path: '/editor', query: { load: pub.documentId } });\n        }"),
            'A1. openPublication(pub) reads pub.documentId — accepts an already-in-hand Publication object, never an id string to search for.');
        assert(catalogSource.includes("function forkPublication(pub) {\n            router.push({ path: '/editor', query: { fork: pub.documentId, publication: pub.id } });\n        }"),
            'A2. forkPublication(pub) reads pub.documentId AND pub.id off the same object — the ONLY two fields it needs.');
        assert(catalogSource.includes("function viewWorld(pub) {\n            router.push({ path: `/world/${pub.documentId}` });\n        }"),
            'A3. viewWorld(pub) reads pub.documentId — same shape.');
        assert(catalogSource.includes('function viewAuthor(author) {'),
            'A4. viewAuthor(author) takes a bare author STRING, not a Publication object at all — the one continuation path that is genuinely a search/browse (by author), not an identity-carrying handoff.');

        // A5. Commentary (a fourth, independent continuation surface
        // this milestone's own brief did not name) is ALSO keyed
        // directly off an in-hand Publication object, never a search —
        // `this.publication.id`, read straight off the prop the card
        // was already given.
        const commentarySectionSource = await rawSource('ui/components/PublicationCommentarySection.js');
        assert(cardSource.includes('<PublicationCommentarySection') && cardSource.includes(':publication="publication"') && commentarySectionSource.includes('this.publication.id'),
            'A5. PublicationCard.js\'s own commentary actions (getPublicationCommentariesCommand/addPublicationCommentaryCommand, in the shared PublicationCommentarySection.js it mounts with its own `publication`) read publication.id directly off the already-in-hand `publication` prop — a fourth existing continuation surface, and it never goes through Repository search either.');

        // A6. Repository's OWN search entry point — the one thing that
        // actually accepts free text and returns Publication objects a
        // Wanderer did not already have.
        assert(catalogSource.includes('searchPublicationsUseCase.execute(buildQuery(page))'),
            'A6. Sanity: Repository/Author View\'s search (SearchPublicationsUseCase via PublicationQuery) is the ONE path here that starts from free text rather than an already-resolved object.');

        console.log('✓ A — Four existing continuation paths inventoried (Open, Fork, Explore, Comment), all four keyed by fields already present on an in-hand Publication object (documentId/id) — never by re-searching for it. Author navigation and Repository search are the only two paths that start from a STRING rather than an object; every other path is an object-in, route-out handoff.');
    }

    // ===============================================================
    // Section B — Trace the known Publication identity:
    // ObserverLocalPublicationEncounter -> publicationId -> resolved
    // Publication -> inspection, then ask whether that SAME resolved
    // instance already carries what Section A's object-in paths need.
    // ===============================================================
    let sharedPublicationId;
    let sharedMaterial;
    {
        const storageProvider = new InMemoryStorageProvider();
        const publicationId = 'pub-b-known-identity';
        const documentId = 'doc-b-known-identity';
        const contentHash = 'hash-b-known-identity';
        const publication = new Publication({ id: publicationId, documentId, title: 'Section B Publication', author: 'carol', contentHash, contentReference: new ContentReference({ hash: contentHash }) });
        knowPublicationsLocally(storageProvider, [publication]);
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const verifier = new MapVerifier({ [publicationId]: true });
        const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: verifier });

        ctx.selectObserverLocalEncounter({ publicationId, contentHash });
        await flush();

        const material = ctx.observerLocalEncounterInspection.loading.material;
        assert(material.id === publicationId, 'B1. The resolved material\'s .id is exactly the encounter\'s own publicationId.');
        assert(material.documentId === documentId && typeof material.documentId === 'string' && material.documentId.length > 0,
            'B2. The resolved material ALREADY carries a non-empty .documentId — the exact field openPublication()/forkPublication()/viewWorld() (Section A1-A3) each read.');
        assert(material.author === 'carol', 'B3. The resolved material ALREADY carries .author — the exact field viewAuthor() (Section A4) would need, if wired to it.');
        assert(material.title === 'Section B Publication', 'B4. ...and .title, presentation-only but likewise already in hand (see Section H).');

        sharedPublicationId = publicationId;
        sharedMaterial = material;
        unmountCanvas(ctx);
        console.log('✓ B — The known Publication identity resolves, through the real observer-local encounter chain, to a full Publication instance that already carries documentId/id/author/title — not merely publicationId/contentHash. The inspection panel\'s own TEMPLATE choosing to show only two of those fields (0.9.556 D1/D2) is a presentation decision, not a resolution limit — the underlying `material` object already holds the rest.');
    }

    // ===============================================================
    // Section C — Repository capability boundary: what CAN
    // PublicationQuery/SearchPublicationsUseCase search by, and is a
    // publicationId-keyed lookup capability genuinely absent from
    // Repository's own DISCOVERY layer, or only from its free-text
    // SEARCH widget?
    // ===============================================================
    {
        // C1-C2. Reconfirm 0.9.556 D3/D4/D6 fresh: free-text search
        // matches title/author/description only, never id/contentHash.
        const storageProvider = new InMemoryStorageProvider();
        const publicationId = 'pub-c-search-boundary';
        const contentHash = 'hash-c-search-boundary';
        const publication = new Publication({ id: publicationId, title: 'Findable By Title Only', author: 'alice', contentReference: new ContentReference({ hash: contentHash }) });
        knowPublicationsLocally(storageProvider, [publication]);
        const discoveryProvider = new LocalDiscoveryProvider(storageProvider);
        const searchUseCase = new SearchPublicationsUseCase(discoveryProvider);

        assert(searchUseCase.execute(new PublicationQuery({ text: publicationId })).items.length === 0,
            'C1. Reconfirmed: PublicationQuery/SearchPublicationsUseCase (the free-text widget RepositoryView/AuthorView mount) cannot find this Publication by its own publicationId.');
        assert(searchUseCase.execute(new PublicationQuery({ text: contentHash })).items.length === 0,
            'C2. ...nor by contentHash either.');

        // C3. But the DISCOVERY layer underneath that widget already
        // has an id-keyed lookup — the SAME findById() Section B's own
        // LocalWorldEncounterMaterialSource already calls, and the SAME
        // one PublicationCatalog.js's own enrichment step
        // (findByDocumentId/findByParentId, a sibling method on the
        // identical class) already depends on for OTHER fields. This is
        // not a new capability description — it is the existing
        // contract, read fresh.
        assert(discoveryProvider.findById(publicationId).id === publicationId,
            'C3. discoveryProvider.findById(publicationId) ALREADY resolves this exact Publication — LocalDiscoveryProvider\'s id-keyed lookup is not missing; it is simply not the method PublicationQuery\'s free-text widget calls.');

        const materialSourceSrc = await rawSource('application/LocalWorldEncounterMaterialSource.js');
        assert(materialSourceSrc.includes('this._discoveryProvider.findById(publicationId)'),
            'C4. Structural: LocalWorldEncounterMaterialSource — the exact class resolving World\'s own observer-local encounters — is ALREADY built on discoveryProvider.findById(), not on PublicationQuery/SearchPublicationsUseCase at all. World\'s own return-path candidate never needed the search widget in the first place.');
        assert(!materialSourceSrc.includes('SearchPublicationsUseCase') && !materialSourceSrc.includes('PublicationQuery'),
            'C5. Confirmed by absence: this file never imports or constructs SearchPublicationsUseCase/PublicationQuery — the encounter-resolution path and the free-text-search path are, and always have been, two genuinely separate mechanisms over the same underlying storage.');

        // C6. Sanity: PublicationQuery's own header explains WHY it is
        // shaped the way it is (a human free-text query: title/author/
        // opt-in description) — it documents a positive design for what
        // it DOES match, never a decision to exclude id/contentHash
        // (that pair is simply outside what a human ever types into a
        // search box). Read fresh, not inferred from 0.9.556's prose.
        const querySource = await rawSource('core/PublicationQuery.js');
        assert(!/publicationId|contentHash/.test(querySource),
            'C6. PublicationQuery.js\'s own source never mentions publicationId or contentHash at all — its documented scope (title/author scoping, "the ONLY difference between what RepositoryView and AuthorView ask for") never contemplated identifier-based lookup as an in-scope or excluded case; it is out of scope by construction, not by a documented refusal.');

        console.log('✓ C — The apparent "Repository can\'t look up a Publication by id" boundary lives ENTIRELY in the free-text search widget (PublicationQuery/SearchPublicationsUseCase), which was built for humans typing title/author text. The discovery layer underneath it (LocalDiscoveryProvider#findById()) already has exactly the id-keyed lookup capability 0.9.556\'s own brief worried was missing — and World\'s own encounter-resolution path (Section B) is ALREADY built on that same lookup, never on search. No new Repository capability is missing at the layer that would actually matter.');
    }

    // ===============================================================
    // Section D — Identity-semantic audit: publicationId ≠ documentId
    // ≠ contentHash, and would a content-hash-keyed lookup collapse
    // two distinct Publications?
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const sharedDocumentId = 'doc-d-shared';
        const sharedContentHash = 'hash-d-shared';
        const p1 = new Publication({ id: 'pub-d-p1', documentId: sharedDocumentId, title: 'Republished As P1', author: 'alice', contentHash: sharedContentHash, contentReference: new ContentReference({ hash: sharedContentHash }) });
        const p2 = new Publication({ id: 'pub-d-p2', documentId: sharedDocumentId, title: 'Republished As P2', author: 'bob', contentHash: sharedContentHash, contentReference: new ContentReference({ hash: sharedContentHash }) });
        assert(p1.id !== p2.id && p1.documentId === p2.documentId && p1.contentHash === p2.contentHash,
            'D1. Sanity fixture: two distinct Publications (distinct publicationId), of the same Document (same documentId), with identical bytes (same contentHash) — the three identities are independent dimensions, not aliases of one another.');
        knowPublicationsLocally(storageProvider, [p1, p2]);
        const discoveryProvider = new LocalDiscoveryProvider(storageProvider);

        // D2. The EXISTING, safe lookup (by publicationId) stays
        // unambiguous for either one.
        assert(discoveryProvider.findById(p1.id).id === p1.id && discoveryProvider.findById(p2.id).id === p2.id,
            'D2. findById(publicationId) — the lookup Section C found already exists — resolves each of P1/P2 to exactly itself, unambiguously, despite the shared documentId/contentHash.');

        // D3. A HYPOTHETICAL content-hash-keyed lookup (the ORIGINAL
        // brief's own second-named possibility, and 0.9.556's own
        // "or let Repository search match a ... contentHash") is
        // simulated here directly against real stored records — not
        // asserted from principle — and shown to be genuinely
        // ambiguous: it cannot return "the" Publication, only a set.
        const byContentHash = discoveryProvider.list().filter((p) => p.contentHash === sharedContentHash);
        assert(byContentHash.length === 2, 'D3. A contentHash-keyed lookup for this exact fixture returns BOTH P1 and P2 — proving, empirically rather than by assertion, that contentHash is not a safe stand-in identity for "the Publication a Wanderer encountered."');

        console.log('✓ D — publicationId, documentId, and contentHash are confirmed independent: two real Publications share the latter two while remaining distinct by the first. The EXISTING id-keyed lookup (Section C) stays safe under this exact adversarial fixture; a hypothetical contentHash-keyed lookup, simulated against the same fixture, is genuinely ambiguous — this is the concrete version of the risk 0.9.556\'s own brief named only abstractly.');
    }

    // ===============================================================
    // Section E — Existing direct-navigation seam: can the object
    // Section B already resolved reach Section A's existing actions
    // WITHOUT going through Repository search at all?
    // ===============================================================
    {
        // E1. Empirical: Section B's own resolved `material` already
        // has everything Section A1-A3's literal expressions read.
        assert(sharedMaterial.documentId && sharedMaterial.id,
            'E1. Reusing Section B\'s own resolved material: it already has non-empty .documentId AND .id — the complete set openPublication()/forkPublication()/viewWorld() need, simultaneously, off the ONE object already in hand.');

        // E2. Constructing the LITERAL route objects Section A1/A3 read
        // out of PublicationCatalog.js's own source, fed this exact
        // already-resolved object — never a search result, never a
        // second lookup of any kind.
        const openRoute = { path: '/editor', query: { load: sharedMaterial.documentId } };
        const forkRoute = { path: '/editor', query: { fork: sharedMaterial.documentId, publication: sharedMaterial.id } };
        const exploreRoute = { path: `/world/${sharedMaterial.documentId}` };
        assert(openRoute.query.load === 'doc-b-known-identity', 'E2. The Open route, built from the encounter-resolved object alone, is well-formed and correct — byte-identical to what openPublication(pub) would build from a Repository search RESULT, but built here with zero search calls.');
        assert(forkRoute.query.fork === 'doc-b-known-identity' && forkRoute.query.publication === sharedPublicationId, 'E3. Same for Fork.');
        assert(exploreRoute.path === '/world/doc-b-known-identity', 'E4. Same for Explore.');

        // E5. Structural: the resolution chain that produced
        // sharedMaterial (selectObserverLocalEncounter ->
        // observerLocalEncounterResolvedSelection ->
        // refreshObserverLocalEncounterInspection -> LocalWorldEncounter
        // MaterialSource#load()) never touches SearchPublicationsUseCase
        // or PublicationQuery anywhere in the canvas component itself
        // either — reconfirmed directly against the current source,
        // not merely inferred from Section C4/C5's own narrower file.
        const canvasSource = await rawSource('ui/components/WorldEncounterCanvas.js');
        assert(!canvasSource.includes('SearchPublicationsUseCase') && !canvasSource.includes('PublicationQuery'),
            'E5. ui/components/WorldEncounterCanvas.js itself never imports or references SearchPublicationsUseCase/PublicationQuery — the entire encounter -> resolved-material chain this milestone traces is, end to end, independent of Repository\'s free-text search.');

        console.log('✓ E — CONFIRMED: an existing seam already carries a known Publication\'s identity all the way to a fully resolved, route-ready object, with zero Repository search calls anywhere in that chain. Everything Section A\'s existing Open/Fork/Explore actions need is already sitting in `observerLocalEncounterInspection.loading.material` by the time a Wanderer opens the inspection panel — this is a wiring gap (no button calls these functions with this object) over already-resolved data, never a missing lookup capability.');
    }

    // ===============================================================
    // Section F — World -> Publication -> World: does using the
    // already-resolved seam (Section E) ever route back through
    // Repository search, even implicitly?
    // ===============================================================
    {
        const worldViewSource = await rawSource('ui/views/WorldView.js');
        const catalogSource = await rawSource('ui/components/PublicationCatalog.js');

        // F1. 0.9.556 Section E already proved "return to World" is a
        // cold router.push({path:`/world/${documentId}`}) — reconfirmed
        // fresh here — which is EXACTLY the exploreRoute Section E2/E4
        // just built from the encounter-resolved object directly. No
        // second mechanism is invoked merely because the object came
        // from an encounter rather than a search result.
        assert(worldViewSource.includes('function focusWorld(documentId) {'), 'F1. Sanity: focusWorld(documentId) exists, keyed by documentId — the same field Section E already confirmed the resolved material carries.');
        assert(catalogSource.includes("router.push({ path: `/world/${pub.documentId}` })"), 'F2. Sanity: Explore\'s own router.push is documentId-keyed, matching exactly what an encounter-sourced object already provides — no divergent "World-return" mechanism exists for an encounter-originated Publication versus a search-originated one.');

        console.log('✓ F — The full World -> Publication -> World round trip, whether the Publication in hand came from Repository search OR from a World encounter (Section E), goes through the identical documentId-keyed router mechanism. Using the encounter-resolved seam introduces no separate return path and no implicit re-entry into Repository search.');
    }

    // ===============================================================
    // Section G — Republish adversarial case: does the existing seam
    // (Section E) stay safe, and would the ORIGINALLY-NAMED alternative
    // (a contentHash-keyed Repository search) stay safe too?
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const sharedDocumentId = 'doc-g-shared';
        const sharedContentHash = 'hash-g-shared';
        const p1 = new Publication({ id: 'pub-g-p1', documentId: sharedDocumentId, title: 'Republished As P1', author: 'alice', contentHash: sharedContentHash, contentReference: new ContentReference({ hash: sharedContentHash }) });
        const p2 = new Publication({ id: 'pub-g-p2', documentId: sharedDocumentId, title: 'Republished As P2', author: 'bob', contentHash: sharedContentHash, contentReference: new ContentReference({ hash: sharedContentHash }) });
        knowPublicationsLocally(storageProvider, [p1, p2]);
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const verifier = new MapVerifier({ 'pub-g-p1': true, 'pub-g-p2': true });
        const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: verifier });

        // G1. encounter(P1) -> the existing seam -> P1, never P2, even
        // though both share contentHash/documentId — mirrors 0.9.556 H,
        // reconfirmed here as the premise this section builds on.
        ctx.selectObserverLocalEncounter({ publicationId: p1.id, contentHash: sharedContentHash });
        await flush();
        const resolvedViaSeam = ctx.observerLocalEncounterInspection.loading.material;
        assert(resolvedViaSeam.id === p1.id && resolvedViaSeam.title === 'Republished As P1',
            'G1. encounter(P1) -> the existing seam (publicationId-keyed) resolves to P1 specifically, never P2 — safe, because it is keyed on the one field (publicationId) Section D showed stays unambiguous.');
        const routeViaSeam = { path: '/editor', query: { load: resolvedViaSeam.documentId } };
        assert(routeViaSeam.query.load === sharedDocumentId, 'G2. The route built from the seam opens Document D — correctly attributed to the P1 Publication instance that was actually encountered, never silently substituted.');

        // G3. Contrast: the alternative 0.9.556's own prose named
        // ("let Repository search match a ... contentHash") applied to
        // the SAME fixture, using ONLY the contentHash the inspection
        // panel actually shows (never the publicationId a hypothetical
        // search box would have no reason to also receive) is genuinely
        // ambiguous — exactly Section D3's finding, now shown to bite
        // specifically in the republish scenario the originating brief
        // worried about.
        const discoveryProvider = new LocalDiscoveryProvider(storageProvider);
        const byContentHashAlone = discoveryProvider.list().filter((p) => p.contentHash === sharedContentHash);
        assert(byContentHashAlone.length === 2, 'G3. A contentHash-only lookup for this exact republish fixture cannot distinguish P1 from P2 — the SAME two Publications the seam (G1) told apart correctly become an unresolvable tie the moment identity is re-derived from contentHash instead of carried through as publicationId.');

        unmountCanvas(ctx);
        console.log('✓ G — The existing seam (publicationId-keyed, Section E) stays correct under the exact republish adversarial case this milestone\'s own brief named. The alternative approach 0.9.556 mentioned only in passing — a contentHash-keyed Repository search — is shown here, concretely, to reintroduce the P1/P2 ambiguity: further evidence that wiring the existing seam is not just simpler than adding that capability, but safer.');
    }

    // ===============================================================
    // Section H — Product-language audit.
    //
    // AMENDED BY 0.9.558 — Known Publication Encounter Continuation, in
    // place, exactly like this arc's own established precedent (0.9.552
    // amending 0.9.551's own D4, 0.9.554 amending 0.9.553's own F/G/L, for
    // the identical situation each time). H3/H4 originally reconfirmed
    // that NO available-action or navigation-destination information was
    // rendered — precisely the wiring gap this audit's own verdict named
    // as the only concrete work left. 0.9.558 closed exactly that gap, so
    // H3/H4 now confirm the OPPOSITE fact: the actions this audit found
    // already resolvable are now actually rendered.
    // ===============================================================
    {
        const canvasSource = await rawSource('ui/components/WorldEncounterCanvas.js');
        const panelStart = canvasSource.indexOf('world-encounter-observer-local-inspection-panel');
        const panelEnd = canvasSource.indexOf('0.9.183', panelStart);
        const panel = canvasSource.slice(panelStart, panelEnd);

        // H1. Reconfirm 0.9.556 D1/D2 fresh: the panel shows identity
        // information (publicationId/contentHash) and a coarse
        // retrievability signal (Material/Verification status labels).
        assert(panel.includes('<dt>Publication</dt>') && panel.includes('<dt>Content Hash</dt>'), 'H1. Identity information: publicationId and contentHash are shown, labeled plainly ("Publication", "Content Hash") rather than as raw technical field names.');
        assert(panel.includes('describeMaterialLoadStatusLabel') && panel.includes('describeMaterialVerificationStatusLabel'), 'H2. Retrievability information: Material/Verification status labels ARE shown — a Wanderer can already tell whether the material is available and verified.');
        // H3. AMENDED: 0.9.558 now renders exactly Open/Explore/Fork,
        // gated on observerLocalEncounterActionablePublication — see that
        // file's own "0.9.558" header.
        assert(panel.includes('>Open</button>') && panel.includes('>Explore</button>') && panel.includes('>Fork</button>') && panel.includes('observerLocalEncounterActionablePublication'),
            'H3. AMENDED by 0.9.558: available-action information IS now shown — Open/Explore/Fork buttons, gated on the already-resolved, AVAILABLE + VERIFIED observerLocalEncounterActionablePublication.');
        // H4. AMENDED: the resolved material's own .title is now rendered
        // as the actions block's own heading.
        assert(panel.includes('observerLocalEncounterActionablePublication.title'),
            'H4. AMENDED by 0.9.558: navigation-destination information IS now shown too — the resolved Publication\'s own .title, exactly the field Section B4 already proved was resolved but unrendered.');

        console.log('✓ H — AMENDED: the panel now communicates identity, retrievability, AND available-action/navigation-destination information. 0.9.558 closed the presentation gap this audit itself identified as the only concrete work remaining, using the exact seam (the already-resolved material object) this audit\'s own verdict named.');
    }

    // ===============================================================
    // Section I — Gap classification.
    // ===============================================================
    console.log('\n=== 0.9.557 CLASSIFICATION ===');
    console.log(`
  A — ALREADY_CORRECT. Four existing continuation paths (Open, Fork,
      Explore, Comment) all take an already-resolved Publication object,
      never a search result specifically.

  B — ALREADY_CORRECT. The known Publication identity (publicationId)
      already resolves, through the real encounter chain, to a full
      Publication instance carrying documentId/id/author/title.

  C — DELIBERATE_BOUNDARY (free-text search) + ALREADY_CORRECT
      (discovery layer). PublicationQuery/SearchPublicationsUseCase is
      correctly scoped to human free text; the underlying
      LocalDiscoveryProvider#findById() id-keyed lookup this milestone's
      own brief worried was missing ALREADY EXISTS and is already what
      World's own encounter-resolution path depends on.

  D — ALREADY_CORRECT (publicationId-keyed identity) with a genuine,
      demonstrated ARCHITECTURAL risk in the untaken alternative:
      contentHash is proven, empirically, to be an unsafe stand-in
      identity under a real republish fixture.

  E — PRODUCT_GAP, but a narrow, presentation/wiring one: the seam from
      a known Publication to an existing action already exists and
      already resolves everything needed; nothing calls it.

  F — ALREADY_CORRECT. Using the seam introduces no separate or implicit
      Repository-search re-entry anywhere in the World-return path.

  G — ALREADY_CORRECT (the seam) vs. a demonstrated risk (the
      contentHash alternative) — reconfirms D under the specific
      republish case this milestone's own brief named directly.

  H — DOCUMENTATION_GAP / PRODUCT_GAP (presentation only): identity and
      retrievability are communicated; available-action and
      navigation-destination are not, despite the underlying data
      already being resolved and in memory.
`);

    // ===============================================================
    // Section J — Decision boundary.
    // ===============================================================
    console.log('=== 0.9.557 VERDICT ===');
    console.log(`
EXISTING_RETURN_SEAM.

A Wanderer's known Publication identity (publicationId, from an
ObserverLocalPublicationEncounter) already resolves, through the real,
unmodified production chain (selectObserverLocalEncounter ->
observerLocalEncounterResolvedSelection ->
refreshObserverLocalEncounterInspection -> LocalWorldEncounterMaterialSource
-> LocalDiscoveryProvider#findById()), to the exact same Publication
object every other Repository-adjacent surface in this codebase already
works with. That object already carries documentId/id/author — every
field ui/components/PublicationCatalog.js's own Open/Fork/Explore actions
need — proven by literally constructing their route objects from it
(Section E) and confirming they match. This resolution chain never
touches SearchPublicationsUseCase/PublicationQuery at any point (Section
C4/C5, E5), so it was never actually blocked by Repository's free-text
search being unable to match an id — that limitation is real (0.9.556 D3/
D4, reconfirmed here as C1/C2) but irrelevant to this seam, because the
seam never needed search in the first place.

The alternative named only in passing by 0.9.556's own prose — adding a
contentHash-keyed Repository lookup — is shown here (Sections D, G) to
carry a genuine identity risk: a real republish fixture (P1/P2, shared
contentHash and documentId, distinct publicationId) is unambiguous under
the existing publicationId-keyed seam and GENUINELY AMBIGUOUS under a
contentHash-keyed one. This is independent evidence, not merely
restraint, against building that capability.

Per this milestone's own brief: NEW_PUBLICATION_RETURN_CAPABILITY_REQUIRED
does not hold. The only concrete work 0.9.556 Section D's finding
actually calls for — if and when a future milestone chooses to act on
it — is wiring the inspection panel to (a) render the title/author/
documentId the resolved material already carries, and (b) call
PublicationCatalog.js's own existing openPublication()/forkPublication()/
viewWorld() functions with that same object. No new Repository search
capability, no contentHash-keyed lookup, and no re-opening of 0.9.555's
own settled retention question are needed. No production code changes
ship with this milestone.
`);

    console.log('✅ All Publication Return-Path Product Boundary Audit tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All PublicationReturnPathProductBoundaryAudit tests passed');
}).catch((error) => {
    console.error('\n✗ PublicationReturnPathProductBoundaryAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
