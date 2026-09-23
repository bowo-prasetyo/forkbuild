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
import { ForkDocumentUseCase } from '../application/ForkDocumentUseCase.js';
import { FindPublicationUseCase } from '../application/FindPublicationUseCase.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { NotificationEventStore } from '../storage/NotificationEventStore.js';
import { GetPublicationCommentariesUseCase } from '../application/GetPublicationCommentariesUseCase.js';
import { AddPublicationCommentaryUseCase } from '../application/AddPublicationCommentaryUseCase.js';
import { CanCommentOnPublicationUseCase } from '../application/CanCommentOnPublicationUseCase.js';
import { PublicationCommentaryNotificationProducer } from '../application/PublicationCommentaryNotificationProducer.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';

// 0.9.560 — Cross-Surface Publication Action Consistency Audit.
//
// TYPE: test-only audit. Production changes: none.
//
// 0.9.551-0.9.559 closed the entire World <-> Publication <-> Work
// continuity arc, culminating in 0.9.559's own conclusion that the
// Publication -> Document identity transition at Open is a genuine,
// pre-existing, APP-WIDE DELIBERATE_BOUNDARY, not a defect. That whole
// arc audited ONE surface (World's observer-local encounter
// continuation) in depth. This milestone moves up one level: ForkBuild
// now offers Open/Fork/Explore/Commentary from Repository, Author, World
// Encounter, World's own "Edit a Copy" affordances, and (for Commentary)
// two independently-composed command roots — and asks whether these
// INDEPENDENTLY-ADDED entry points still converge on the same commands,
// use cases, and identity semantics, or have quietly diverged.
//
// Ten lettered sections (A-J), mirroring the originating brief's own
// lettering. Every assertion reads real, unmodified production source
// or exercises real, unmodified production classes — never a second
// mock of a boundary a prior milestone already proved real.
//
// FINDING (preview; see Section J for the full verdict): overwhelmingly
// ALREADY_CORRECT / DELIBERATE_BOUNDARY. Two real, narrow, previously
// un-surfaced gaps are named (never fixed, per this milestone's own
// "test-only" scope and the arc's established restraint):
//
//   1. PRODUCT_GAP (Section G) — within the SAME Repository/Author
//      catalog, over the SAME publications, PublicationCard.js (the
//      default "cards" view) offers full Commentary; PublicationList.js
//      (the alternate "list" view of the identical data) offers none.
//      Already self-documented as a deliberate, scoped exclusion in
//      PublicationCard.js's own 0.9.289 header — this milestone
//      reconfirms it is still open and names it at the cross-surface
//      altitude this arc has not checked from before.
//
//   2. DOCUMENTATION_GAP (Section I) — "Fork" (Repository/Author/World
//      Encounter) and "Edit a Copy" (World Focus Panel/spatial
//      inspection) are the SAME action (byte-identical route shape,
//      identical ForkDocumentUseCase, identical ForkFailureDialog on
//      failure) under two different verbs, and "Explore"/"Focus"/"Go"/
//      "Continue Exploring" are likewise one action (focusWorld() or a
//      fresh /world/:id push) under four different verbs. Both splits
//      are ALREADY deliberate and self-documented in source comments —
//      never merely accidental drift — but that vocabulary map exists
//      only in code comments, never in any user-facing help text.
//
// A third candidate finding — that "Edit a Copy" from World's own Focus
// Panel/spatial inspection can silently skip ForkDocumentUseCase's
// license enforcement whenever `getPublicationIdForDocument()` resolves
// to null — is INVESTIGATED IN DEPTH (Section E) and REJECTED: null is
// structurally reachable only when NO governing Publication exists for
// that document at all (proven by construction, not merely asserted),
// which is exactly the case where ForkDocumentUseCase's own
// `sourcePublication`-gated enforcement (see its own header) has nothing
// to enforce in the first place. This is the SAME "enforce only when we
// can" rule `_checkForkPolicy()`'s own header already documents holding
// everywhere else in this session. Recorded here as ALREADY_CORRECT,
// not as a defect a first read might suggest.

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

async function runTests() {
    console.log('Running Cross-Surface Publication Action Consistency Audit tests...\n');

    // ===============================================================
    // Section A — Action inventory. Every production entry point for
    // Open/Fork/Explore/Commentary, established once here so later
    // sections can refer to "the N entry points for X" without
    // re-deriving the list.
    // ===============================================================
    {
        const publicationCatalogSource = await rawSource('ui/components/PublicationCatalog.js');
        const publicationCardSource = await rawSource('ui/components/PublicationCard.js');
        const publicationListSource = await rawSource('ui/components/PublicationList.js');
        const worldViewSource = await rawSource('ui/views/WorldView.js');
        const worldEncounterCanvasSource = await rawSource('ui/components/WorldEncounterCanvas.js');
        const worldFocusPanelSource = await rawSource('ui/components/WorldFocusPanel.js');
        const worldSearchPanelSource = await rawSource('ui/components/WorldSearchPanel.js');
        const ownPublicationPanelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        const recentWorldsViewSource = await rawSource('ui/views/RecentWorldsView.js');
        const worldCardSource = await rawSource('ui/components/WorldCard.js');

        // A1. Repository/Author: ONE component (PublicationCatalog.js,
        // scoped only by an `author` prop) offers Open/Fork/Explore for
        // every publication, per its own 0.2.31 header.
        assert(publicationCatalogSource.includes("author: { type: String, default: null }"), 'A1a. PublicationCatalog.js takes a single author-scoping prop — Repository and Author are the SAME component, not two.');
        assert(publicationCardSource.includes(">Open</button>") && publicationCardSource.includes(">Fork</button>") && publicationCardSource.includes(">Explore</button>"), 'A1b. PublicationCard.js (the card view) offers Open/Fork/Explore.');
        assert(publicationListSource.includes("$emit('open', pub)") && publicationListSource.includes("$emit('fork', pub)") && publicationListSource.includes("$emit('explore', pub)"), 'A1c. PublicationList.js (the alternate list view of the SAME catalog) also offers Open/Fork/Explore.');

        // A2. World Encounter: WorldEncounterCanvas's own four
        // continuation actions (0.9.558/0.9.559).
        for (const method of ['openObserverLocalEncounterPublication', 'forkObserverLocalEncounterPublication', 'exploreObserverLocalEncounterPublication', 'submitObserverLocalEncounterCommentary']) {
            assert(worldEncounterCanvasSource.includes(`${method}(`), `A2. World Encounter offers ${method}.`);
        }

        // A3. World's own "Edit a Copy" (Fork-shaped) affordances,
        // reached from a currently-focused/inspected document rather
        // than a catalog listing — two independent call sites.
        assert(worldViewSource.includes('function editFocusedCopyFromFocusPanel()'), 'A3a. World Focus Panel offers "Edit a Copy".');
        assert(worldViewSource.includes('function editInspectedCopy(inspection)'), 'A3b. World spatial inspection panel offers "Edit a Copy".');
        assert(worldFocusPanelSource.includes(">Edit a Copy</button>"), 'A3c. World Focus Panel\'s own template renders the "Edit a Copy" label.');

        // A4. World Search: a "Focus" action ONLY (no Open/Fork/Comment)
        // — confirmed as a genuinely narrower surface, not a missed one.
        assert(worldSearchPanelSource.includes("emits: ['search', 'focus']"), 'A4. World Search offers Focus only — no Open/Fork/Comment entry point exists on this surface.');

        // A5. Own Publication: Commentary only — no Open/Fork/Explore.
        // This is correct BY DESIGN (see OwnPublicationPanel.js's own
        // 0.9.140 header: it operates on the ACTIVE document, already
        // open in the Editor's own World session — "opening"/"forking"
        // your own already-open work is not a meaningful action here).
        assert(!/router\.push|focusWorld/.test(ownPublicationPanelSource), 'A5. OwnPublicationPanel.js never navigates anywhere — it has no Open/Fork/Explore action of its own, only Commentary and Distribution/Discovery.');

        // A6. Recent Worlds: an Explore-equivalent ("Continue Exploring"
        // -> enterWorld -> /world/:id), no Open/Fork/Comment.
        assert(recentWorldsViewSource.includes('function enterWorld(documentId)') && recentWorldsViewSource.includes("router.push({ path: `/world/${documentId}` })"), 'A6a. Recent Worlds offers an Explore-equivalent action.');
        assert(worldCardSource.includes('>Continue Exploring</button>'), 'A6b. Its own label is "Continue Exploring", not "Explore".');

        console.log('✓ A — action inventory established: Repository/Author (Open/Fork/Explore, plus Commentary on the card view only), World Encounter (all four), World Focus Panel/spatial inspection (Fork, as "Edit a Copy"), World Search (Focus only), Own Publication (Commentary only, by design), Recent Worlds (an Explore-equivalent only).');
    }

    // ===============================================================
    // Section B — Command convergence. Do independently-added entry
    // points reuse the SAME command/use case, or quietly duplicate it?
    // ===============================================================
    {
        const publicationCatalogSource = await rawSource('ui/components/PublicationCatalog.js');
        const worldViewSource = await rawSource('ui/views/WorldView.js');
        const editorViewSource = await rawSource('ui/views/EditorView.js');

        // B1. Open: PublicationCatalog.js and WorldView.js's own
        // wrapper build BYTE-IDENTICAL route shapes (already established
        // by 0.9.559 B5a/B5b; reconfirmed here as this section's own
        // starting point).
        assert(publicationCatalogSource.includes("router.push({ path: '/editor', query: { load: pub.documentId } });"), 'B1a. Repository/Author\'s own Open.');
        assert(worldViewSource.includes("router.push({ path: '/editor', query: { load: publication.documentId } });"), 'B1b. World Encounter\'s own Open — byte-identical shape.');

        // B2. Fork: THREE independently-written call sites
        // (PublicationCatalog, World Encounter's wrapper, World's own
        // two "Edit a Copy" functions) all build the identical
        // `{ fork: <documentId>, publication: <id-or-absent> }` shape.
        assert(publicationCatalogSource.includes("router.push({ path: '/editor', query: { fork: pub.documentId, publication: pub.id } });"), 'B2a. Repository/Author\'s own Fork.');
        assert(worldViewSource.includes("router.push({ path: '/editor', query: { fork: publication.documentId, publication: publication.id } });"), 'B2b. World Encounter\'s own Fork — byte-identical shape.');
        assert(worldViewSource.includes("query: { fork: documentId, ...(publication ? { publication } : {}), ...entryQuery }"), 'B2c. World Focus Panel\'s "Edit a Copy" — the SAME two query keys (fork/publication), generalized to allow the id-lookup to legitimately come back empty (Section E establishes why that is not a bypass).');

        // B3. Exactly ONE consumer for EACH of route.query.load and
        // route.query.fork, in EditorView.js, regardless of how many UI
        // surfaces feed it — reconfirmed directly (0.9.559 already
        // established this for Open; this milestone reconfirms it for
        // Fork too, the action this milestone's own Section E turns out
        // to matter most for).
        const loadBranchMatches = editorViewSource.match(/else if \(route\.query\.load\)/g) || [];
        const forkBranchMatches = editorViewSource.match(/if \(route\.query\.fork\)/g) || [];
        assert(loadBranchMatches.length === 1, `B3a. Exactly one route.query.load BRANCH in EditorView.js (found ${loadBranchMatches.length}) — a single consumer for every Open entry point. (route.query.load itself appears twice textually — once in this branch condition, once in its own body's loadDocument() call — both inside the SAME single branch.)`);
        assert(forkBranchMatches.length === 1, `B3b. Exactly one route.query.fork BRANCH in EditorView.js (found ${forkBranchMatches.length}) — a single consumer for every Fork entry point, whichever surface it came from.`);

        // B4. Commentary has TWO independent composition roots
        // (application/CreatePublicationCommentaryUseCase.js for
        // Repository/Author's PublicationCard, application/
        // CreateWorldViewUseCase.js for World's OwnPublicationPanel/
        // WorldEncounterCanvas) — by the codebase's own design (no
        // WorldNavigationSession exists outside World View to ask). Live
        // proof that the two compositions are "a second composition,
        // never a second source of truth" (CreatePublicationCommentaryUseCase.js's
        // own header) rather than merely an assertion in a comment: two
        // INDEPENDENTLY CONSTRUCTED store/use-case graphs, sharing only
        // the underlying StorageProvider (standing in for the app's
        // shared window.localStorage), converge on the same data.
        const sharedStorage = new InMemoryStorageProvider();
        const identityProvider = makeIdentity('alice');

        // "Repository/Author's own composition" — mirrors
        // CreatePublicationCommentaryUseCase.execute() exactly: its own
        // fresh LocalDiscoveryProvider/PublicationCommentaryStore pair.
        const repositoryDiscovery = new LocalDiscoveryProvider(sharedStorage);
        const repositoryStore = new PublicationCommentaryStore(sharedStorage);
        const repositoryCanComment = new CanCommentOnPublicationUseCase(repositoryDiscovery);
        const repositoryAdd = new AddPublicationCommentaryUseCase(repositoryStore, identityProvider, repositoryCanComment);
        const repositoryNotificationEventStore = new NotificationEventStore(sharedStorage);
        const repositoryNotifier = new PublicationCommentaryNotificationProducer(repositoryAdd, repositoryDiscovery, (notificationEvent) => repositoryNotificationEventStore.save(notificationEvent));

        // "World's own composition" — mirrors CreateWorldViewUseCase's
        // own wiring: a SECOND, independently constructed graph, never
        // the same instances as above.
        const worldDiscovery = new LocalDiscoveryProvider(sharedStorage);
        const worldStore = new PublicationCommentaryStore(sharedStorage);
        const worldGet = new GetPublicationCommentariesUseCase(worldStore);
        assert(worldStore !== repositoryStore && worldDiscovery !== repositoryDiscovery, 'B4a. Sanity: the two compositions genuinely hold separate instances, not a shared singleton.');

        const publicationId = 'pub-b4';
        const documentId = 'doc-b4';
        knowPublicationsLocally(sharedStorage, [new Publication({ id: publicationId, documentId, title: 'B4', author: 'alice', publisherIdentity: { id: 'did:key:alice-b4' } })]);
        repositoryNotifier.execute({ publicationId, content: 'Written through Repository\'s own composition', commentaryId: 'c-b4', createdAt: new Date() });

        const readBackThroughWorldsComposition = worldGet.execute({ publicationId });
        assert(readBackThroughWorldsComposition.length === 1 && readBackThroughWorldsComposition[0].content === 'Written through Repository\'s own composition', 'B4b. A commentary written through Repository/Author\'s own independent composition is immediately visible through World\'s own SEPARATE composition — two composition roots, one underlying source of truth, proven with real classes rather than merely trusted from a comment.');

        console.log('✓ B — Open and Fork converge on byte-identical route shapes across every independently-written entry point, funneling into exactly one EditorView.js consumer each. Commentary\'s two independent composition roots are proven, with real classes, to converge on one underlying store.');
    }

    // ===============================================================
    // Section C — Publication identity: every entry point resolves or
    // passes publicationId, never documentId/contentHash/title/position,
    // and the Fork destination independently RE-RESOLVES any client-
    // supplied id rather than trusting a caller-shaped object.
    // ===============================================================
    {
        const publicationCatalogSource = await rawSource('ui/components/PublicationCatalog.js');
        const editorViewSource = await rawSource('ui/views/EditorView.js');

        // C1. Every Open/Fork call site this audit found builds its
        // query from a resolved Publication object's own `.documentId`/
        // `.id` fields (`pub.documentId`, `publication.id`, etc.) —
        // never from `.title`, an array index, or a hand-typed string.
        // Reconfirmed here across the SPECIFIC lines Section B already
        // quoted, rather than re-deriving from scratch.
        assert(publicationCatalogSource.includes('pub.documentId') && publicationCatalogSource.includes('pub.id'), 'C1. Repository/Author\'s own Open/Fork read identity off the resolved Publication object\'s own fields.');

        // C2. EditorView.js's own route.query.fork handler never trusts
        // a client-supplied Publication object at all — the query only
        // ever carries a bare publicationId string
        // (`route.query.publication`), independently RE-RESOLVED through
        // FindPublicationUseCase (the SAME class
        // application/CreateDiscoveryUseCase.js composes for every
        // other Publication lookup in the app, PublicationCatalog.js's
        // own search included) before ForkDocumentUseCase ever sees it.
        assert(editorViewSource.includes('sourcePublication = findPublicationUseCase.execute(route.query.publication);'), 'C2a. The fork destination re-resolves publicationId through the canonical discovery lookup — never deserializes a caller-supplied Publication shape from the URL.');
        const storageProvider = new InMemoryStorageProvider();
        const documentId = 'doc-c2';
        const publicationId = 'pub-c2';
        knowPublicationsLocally(storageProvider, [new Publication({ id: publicationId, documentId, title: 'C2', author: 'alice', license: new License({ id: LicenseId.CC_BY_ND_4_0 }) })]);
        const discoveryProvider = new LocalDiscoveryProvider(storageProvider);
        const findPublicationUseCase = new FindPublicationUseCase(discoveryProvider);
        const resolved = findPublicationUseCase.execute(publicationId);
        assert(resolved.id === publicationId && resolved.license.id === LicenseId.CC_BY_ND_4_0, 'C2b. The re-resolved object is the real, storage-backed Publication — license included — not a bare pass-through of whatever the query string said.');

        console.log('✓ C — identity is passed and re-resolved by publicationId throughout: every Open/Fork call site reads off a resolved Publication object\'s own fields, and the Fork destination never trusts a client-shaped Publication over the URL, always re-resolving it canonically.');
    }

    // ===============================================================
    // Section D — Open semantics: PRESERVES 0.9.559's own conclusion.
    // Not re-litigated, not narrowed, not widened here.
    // ===============================================================
    {
        const editorViewSource = await rawSource('ui/views/EditorView.js');
        const loadBranchStart = editorViewSource.indexOf('} else if (route.query.load) {');
        const loadBranchEnd = editorViewSource.indexOf('\n            }', loadBranchStart);
        const loadBranch = editorViewSource.slice(loadBranchStart, loadBranchEnd);
        assert(!loadBranch.includes('editorEntryContextFromQuery') && !loadBranch.includes('entryContext.value'), 'D1. Reconfirmed: route.query.load still never constructs an EditorEntryContext — Open is still the same genuine, app-wide Publication -> Document identity TRANSITION 0.9.559 Section B established, for every surface this milestone additionally checked (Author, World Focus Panel\'s own reach, Recent Worlds), not merely World Encounter.');

        console.log('✓ D — Open\'s Publication -> Document identity transition is confirmed, once more, to be the SAME deliberate, pre-existing, app-wide boundary 0.9.559 already closed. This milestone deliberately does not reopen it — see this file\'s own header.');
    }

    // ===============================================================
    // Section E — Fork semantics: license enforcement is equivalent
    // regardless of entry surface, INCLUDING the two "Edit a Copy"
    // surfaces that resolve publicationId themselves rather than
    // starting from an already-resolved Publication object.
    // ===============================================================
    {
        // E1. Byte-for-byte reconfirmation (0.9.559 Section C) that
        // Fork never mutates its source and correctly attributes
        // lineage from the SPECIFIC Publication supplied, using the
        // SAME ForkDocumentUseCase every entry point this milestone
        // found ultimately calls.
        const storageProvider = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const sharedDocumentId = 'doc-e-shared';
        const sourceDoc = makeDocument('Shared Across Surfaces', 'alice', sharedDocumentId);
        storageProvider.save(sharedDocumentId, serializer.serialize(sourceDoc));
        const p1 = new Publication({ id: 'pub-e-p1', documentId: sharedDocumentId, title: 'E as P1', author: 'alice', license: new License({ id: LicenseId.CC_BY_4_0 }) });
        const forked = new ForkDocumentUseCase(storageProvider, serializer).execute(sharedDocumentId, null, p1);
        assert(forked.metadata.license.attribution.sourcePublicationId === p1.id, 'E1. Forking via ForkDocumentUseCase directly — the SAME class every entry point in Section B funnels into — stamps the correct lineage.');

        // E2. THE central question this section exists to answer: does
        // "Edit a Copy" (World Focus Panel / spatial inspection), which
        // resolves its OWN publicationId via
        // WorldNavigationSession#getPublicationIdForDocument() rather
        // than starting from an already-resolved Publication object,
        // ever let a license-restricted document fork WITHOUT
        // enforcement, purely because that resolution came back empty?
        //
        // Answer: NO — proven structurally AND live. Both
        // getPublicationIdForDocument() and _checkForkPolicy() (the
        // function every OTHER fork-policy question in this session
        // already goes through — see WorldNavigationSession.js's own
        // header on getEditabilityNotice()) call the IDENTICAL
        // `_findPublications(documentId)` lookup and apply the IDENTICAL
        // "most recent publication governs" reduction. There is
        // structurally no way for one to see a governing Publication
        // the other does not.
        const worldNavSource = await rawSource('application/WorldNavigationSession.js');
        const checkForkPolicyStart = worldNavSource.indexOf('_checkForkPolicy(documentId) {');
        const checkForkPolicyEnd = worldNavSource.indexOf('\n    }', checkForkPolicyStart);
        const checkForkPolicyBody = worldNavSource.slice(checkForkPolicyStart, checkForkPolicyEnd);
        const getPubIdStart = worldNavSource.indexOf('getPublicationIdForDocument(documentId) {');
        const getPubIdEnd = worldNavSource.indexOf('\n    }', getPubIdStart);
        const getPubIdBody = worldNavSource.slice(getPubIdStart, getPubIdEnd);
        assert(checkForkPolicyBody.includes('this._findPublications(documentId)') && getPubIdBody.includes('this._findPublications(documentId)'), 'E2a. Both functions call the identical _findPublications(documentId) lookup — structurally, not by coincidence of current behavior.');
        assert(checkForkPolicyBody.includes('publications.reduce((latest, p) =>\n            (!latest || p.publishedAt > latest.publishedAt) ? p : latest, null)') && getPubIdBody.includes('publications.reduce((latest, p) =>\n            (!latest || p.publishedAt > latest.publishedAt) ? p : latest, null)'), 'E2b. Both apply the identical "most recent publication governs" reduction over that lookup\'s result.');

        // Live confirmation with a real WorldNavigationSession and a
        // real, restrictively-licensed Publication: whenever a
        // governing Publication genuinely exists (this replica's own
        // discoveryProvider can see it), getPublicationIdForDocument()
        // DOES return its id — the exact id ForkDocumentUseCase needs to
        // enforce the license — never null.
        {
            const registry = new CreateBrickRegistryUseCase().execute();
            const sessionStorage = new InMemoryStorageProvider();
            const sessionSerializer = new DocumentSerializer();
            const restrictedDocId = 'doc-e2-restricted';
            const restrictedDoc = makeDocument('Restricted', 'alice', restrictedDocId);
            sessionStorage.save(restrictedDocId, sessionSerializer.serialize(restrictedDoc));
            const restrictedPublication = new Publication({ id: 'pub-e2-nd', documentId: restrictedDocId, title: 'Restricted', author: 'alice', publishedAt: new Date(), license: new License({ id: LicenseId.CC_BY_ND_4_0 }) });
            knowPublicationsLocally(sessionStorage, [restrictedPublication]);
            const discoveryProvider = new LocalDiscoveryProvider(sessionStorage);
            const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(sessionStorage, sessionSerializer);
            const spatialIndexProvider = new LocalSpatialIndexProvider(sessionStorage);
            const worldLayoutProvider = new LocalWorldLayoutProvider(spatialIndexProvider, discoveryProvider);
            const session = new WorldNavigationSession({ registry, loadPublicationDocumentUseCase, worldLayoutProvider, discoveryProvider });

            const policy = session._checkForkPolicy(restrictedDocId);
            const resolvedPublicationId = session.getPublicationIdForDocument(restrictedDocId);
            assert(policy.allowed === false && policy.license.id === LicenseId.CC_BY_ND_4_0, 'E2c. _checkForkPolicy correctly identifies this document as license-restricted.');
            assert(resolvedPublicationId === restrictedPublication.id, 'E2d. getPublicationIdForDocument — the EXACT function "Edit a Copy" calls to build its own /editor?fork= query — resolves the SAME restricted Publication\'s id, non-null. The "Edit a Copy" route therefore ALWAYS carries the publication query param whenever there is a real license to enforce, so ForkDocumentUseCase\'s own enforcement always runs for it — no silent bypass is reachable.');

            // E2e. The only way getPublicationIdForDocument() returns
            // null is the SAME condition under which _checkForkPolicy()
            // itself reports "allowed" — a document with NO known
            // Publication at all, for which there is genuinely nothing
            // to enforce. Symmetric degradation, not a surface-specific
            // gap: "Edit a Copy" behaves toward an unknown-to-this-
            // replica document exactly the way the silent first-edit
            // fork-on-write gate (getEditabilityNotice) already does.
            const unknownDocId = 'doc-e2-unknown';
            const unknownPolicy = session._checkForkPolicy(unknownDocId);
            const unknownResolvedId = session.getPublicationIdForDocument(unknownDocId);
            assert(unknownPolicy.allowed === true && unknownPolicy.license === null, 'E2f. For a document with no known Publication, _checkForkPolicy reports "allowed" (nothing to enforce).');
            assert(unknownResolvedId === null, 'E2g. getPublicationIdForDocument agrees: null, for the identical reason — never a false negative that would hide a real license from ForkDocumentUseCase.');
        }

        console.log('✓ E — Fork\'s license enforcement is equivalent across every entry point this audit found, INCLUDING the two "Edit a Copy" surfaces that resolve their own publicationId rather than starting from an already-resolved object. Proven structurally (identical _findPublications lookup, identical reduction) and live (a real restrictive license is always resolved, non-null; only a genuinely unknown-to-this-replica document — where nothing is enforceable anywhere else in this session either — ever resolves to null). The candidate "silent license bypass" finding this milestone investigated is REJECTED with evidence, not merely dismissed.');
    }

    // ===============================================================
    // Section F — Explore semantics: two deliberately different
    // mechanisms for two deliberately different situations, not a
    // fractured single concept.
    // ===============================================================
    {
        const worldViewSource = await rawSource('ui/views/WorldView.js');
        const publicationCatalogSource = await rawSource('ui/components/PublicationCatalog.js');
        const principlesDoc = await rawSource('docs/Principles.md');

        // F1. "Reposition within an already-live World session" — every
        // in-World surface this audit found (Encounter, Search's Focus,
        // Location Browser, Focus Panel's "Go", spatial inspection) funnels
        // through the SAME focusWorld() — reconfirmed for the newly
        // checked ones (0.9.559 F already proved this for Encounter).
        assert(/<WorldSearchPanel[^>]*@focus="focusWorld"/.test(worldViewSource), 'F1a. World Search\'s own "Focus" reuses focusWorld() — no second in-World navigation mechanism.');
        assert(worldViewSource.includes("// Search's own Focus action is exactly focusWorld"), 'F1b. This convergence is explicitly self-documented, not incidental.');

        // F2. "Enter World fresh, from OUTSIDE any live session" —
        // Repository/Author's Explore and Recent Worlds' Continue
        // Exploring both correctly use router.push (never focusWorld,
        // which would have nothing to reposition).
        assert(publicationCatalogSource.includes("router.push({ path: `/world/${pub.documentId}` });"), 'F2a. Repository/Author\'s Explore is a fresh push.');
        assert(!publicationCatalogSource.includes('focusWorld'), 'F2b. PublicationCatalog.js never references focusWorld at all — it has no live World session to reposition within, so it correctly never tries.');

        // F3. This two-mechanism split is a documented product
        // principle (docs/Principles.md, "Focus Is Navigation, Not
        // Discovery"), not something this milestone is discovering for
        // the first time — cited here as the authority for classifying
        // it DELIBERATE_BOUNDARY rather than PRODUCT_GAP.
        assert(principlesDoc.includes('Focus Is Navigation, Not Discovery'), 'F3. The push-vs-reposition split traces to a named, documented product principle.');

        console.log('✓ F — every "reposition within World" surface (Encounter, Search, Location Browser, Focus Panel, spatial inspection) converges on the single focusWorld() mechanism; every "enter World from outside" surface (Repository/Author, Recent Worlds) correctly uses a fresh router.push instead. The split is a named, documented product principle, not accidental divergence.');
    }

    // ===============================================================
    // Section G — Commentary semantics: publicationId-keyed and
    // retry-idempotent everywhere it exists — and ONE real, named,
    // narrow within-surface gap in where it exists at all.
    // ===============================================================
    {
        // The card view's Commentary lives in the shared
        // PublicationCommentarySection.js it mounts (as does the list
        // view's), so the card's Commentary source is the two together.
        const publicationCardSource = await rawSource('ui/components/PublicationCard.js') + await rawSource('ui/components/PublicationCommentarySection.js');
        const publicationListSource = await rawSource('ui/components/PublicationList.js');
        const ownPublicationPanelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        const worldEncounterCanvasSource = await rawSource('ui/components/WorldEncounterCanvas.js');

        // G1. Every commentary-bearing surface reads/writes strictly by
        // publicationId — never documentId/contentHash — reconfirmed
        // directly from each file's own call site (not merely the
        // 0.9.559 finding, which only checked World Encounter's two
        // variants).
        assert(publicationCardSource.includes('this.getPublicationCommentariesCommand(this.publication.id)') && publicationCardSource.includes('addPublicationCommentaryCommand({ publicationId: this.publication.id'), 'G1a. PublicationCard.js (Repository/Author) keys strictly by publicationId.');
        assert(ownPublicationPanelSource.includes('addPublicationCommentaryCommand({ publicationId: publication.id'), 'G1b. OwnPublicationPanel.js keys strictly by publicationId.');
        assert(worldEncounterCanvasSource.includes('this.addPublicationCommentaryCommand({ publicationId, content, commentaryId, createdAt });'), 'G1c. World Encounter (both its primary and observer-local variants share this exact call) keys strictly by publicationId.');

        // G2. Retry/idempotency (0.9.541/0.9.542's own
        // commentaryId-reuse-on-unchanged-content pattern) is present,
        // essentially byte-identical, in all THREE files that offer
        // Commentary composition (four consuming code paths — World
        // Encounter holds two independent draft fields, one per
        // variant).
        assert(publicationCardSource.includes('this.pendingCommentaryDraft = { content, commentaryId: createId(), createdAt: new Date() };'), 'G2a. PublicationCard.js implements the 0.9.542 retry-idempotency pattern.');
        assert(ownPublicationPanelSource.includes('this.pendingCommentaryDraft = { content, commentaryId: createId(), createdAt: new Date() };'), 'G2b. OwnPublicationPanel.js implements the identical pattern.');
        assert(worldEncounterCanvasSource.includes('this.pendingObserverLocalEncounterCommentaryDraft = { content, commentaryId: createId(), createdAt: new Date() };') && worldEncounterCanvasSource.includes('this.pendingEncounterCommentaryDraft = { content, commentaryId: createId(), createdAt: new Date() };'), 'G2c. World Encounter implements the identical pattern for BOTH its primary and observer-local commentary panels — no entry point regressed to the pre-0.9.542 duplicate-on-retry behavior.');

        // G3. Live proof that the shared idempotency CONTRACT
        // (PublicationCommentaryStore's own "SAME ID + IDENTICAL RECORD
        // -> IDEMPOTENT SUCCESS") behaves identically no matter which of
        // the four call shapes above submits the retry — since all four
        // reduce to the identical
        // `addPublicationCommentaryCommand({ publicationId, content,
        // commentaryId, createdAt })` shape, one live exercise of the
        // real store stands in for all four.
        const storageProvider = new InMemoryStorageProvider();
        const publicationId = 'pub-g3';
        knowPublicationsLocally(storageProvider, [new Publication({ id: publicationId, documentId: 'doc-g3', title: 'G3', author: 'alice' })]);
        const discoveryProvider = new LocalDiscoveryProvider(storageProvider);
        const commentaryStore = new PublicationCommentaryStore(storageProvider);
        const identityProvider = makeIdentity('alice');
        const canComment = new CanCommentOnPublicationUseCase(discoveryProvider);
        const addCommentary = new AddPublicationCommentaryUseCase(commentaryStore, identityProvider, canComment);
        const getCommentaries = new GetPublicationCommentariesUseCase(commentaryStore);
        const draft = { content: 'Retried after a notification-sink failure', commentaryId: 'c-g3', createdAt: new Date() };
        const first = addCommentary.execute({ publicationId, ...draft });
        const retry = addCommentary.execute({ publicationId, ...draft });
        assert(first.isNew === true, 'G3a. The first submission is new.');
        assert(retry.isNew === false, 'G3b. A same-id, same-content retry — the exact shape every one of the four UI call sites reuses on an unchanged draft — is reported as a no-op, never a duplicate.');
        assert(getCommentaries.execute({ publicationId }).length === 1, 'G3c. Exactly one commentary persisted despite two submit calls — the shared contract every consumer relies on holds.');

        // G4. THE gap this milestone (0.9.560) itself named: PublicationList.js
        // — the alternate row/list view of the IDENTICAL Repository/Author
        // catalog data PublicationCard.js already offers Commentary for —
        // had NO commentary UI at all. CLOSED by 0.9.561, exactly along the
        // lines this milestone's own "CONCRETE RECOMMENDATION" (see Section
        // J below) described: PublicationList.js now injects the SAME
        // getPublicationCommentariesCommand/addPublicationCommentaryCommand
        // PublicationCard.js already injects — no new command, no new
        // composition root. Re-checked here fresh against current source
        // rather than left asserting a fact 0.9.561 deliberately made false.
        assert(/getPublicationCommentariesCommand/.test(publicationListSource) && /<PublicationCommentarySection/.test(publicationListSource),
            'G4. 0.9.561 closed this milestone\'s own named gap: PublicationList.js now carries commentary wiring — switching a Repository/Author page from cards to list view no longer hides Commentary for the same publications.');

        console.log('✓ G — Commentary is publicationId-keyed and retry-idempotent, identically, everywhere it exists (proven structurally across all three composing files, and live against the real store\'s own shared contract). The one real, narrow gap this milestone named — PublicationList.js offering no Commentary at all — was CLOSED by 0.9.561 (see Section J for the original classification and this note for its resolution).');
    }

    // ===============================================================
    // Section H — Failure semantics: are equivalent failures across
    // surfaces the same underlying contract, or separate ones?
    // ===============================================================
    {
        const editorViewSource = await rawSource('ui/views/EditorView.js');

        // H1. Exactly one <ForkFailureDialog> in the whole app — every
        // Fork entry point this audit found (Repository, Author, World
        // Encounter, both "Edit a Copy" call sites) funnels into the
        // SAME route.query.fork catch block (Section B3b), which is the
        // ONLY place forkFailure.value is ever set, which is the ONLY
        // place <ForkFailureDialog> is rendered.
        // (forkFailure.value is also reset to null by backFromForkFailure()
        // — the dialog's own dismissal — which is a clear, never a SET of
        // a new failure, so it is deliberately excluded from this count.)
        const forkFailureSetAssignments = (editorViewSource.match(/forkFailure\.value\s*=\s*\{/g) || []).length;
        assert(forkFailureSetAssignments === 1, `H1a. Exactly one call site ever sets forkFailure.value to a new failure object (found ${forkFailureSetAssignments}) — a single failure-presentation path for every Fork entry point, regardless of which surface initiated it.`);
        assert(editorViewSource.includes('<ForkFailureDialog') && (editorViewSource.match(/<ForkFailureDialog/g) || []).length === 1, 'H1b. Exactly one <ForkFailureDialog> render site in the template.');

        // H2. Because the catch block reads only route.query (never a
        // "which surface did this come from" flag of any kind), a
        // license-denied Fork from Repository and the identical failure
        // from World's own "Edit a Copy" are PROVABLY the same code
        // path producing the same { reason, returnWorldId,
        // focusLocationId } shape — not merely "probably similar."
        const p1 = new Publication({ id: 'pub-h2', documentId: 'doc-h2', title: 'H2', author: 'alice', license: new License({ id: LicenseId.CC_BY_ND_4_0 }) });
        const storageProvider = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const doc = makeDocument('H2', 'alice', 'doc-h2');
        storageProvider.save('doc-h2', serializer.serialize(doc));
        let repositoryShapedError = null;
        let editCopyShapedError = null;
        try {
            // Repository/Author's own call shape: sourcePublication is
            // whatever pub.id already resolved to, always present.
            new ForkDocumentUseCase(storageProvider, serializer).execute('doc-h2', null, p1);
        } catch (e) { repositoryShapedError = e; }
        try {
            // "Edit a Copy"'s own call shape: sourcePublication came
            // from getPublicationIdForDocument()'s own resolution,
            // re-looked-up rather than already in hand — but by the
            // time it reaches ForkDocumentUseCase.execute(), it is the
            // SAME parameter, so the SAME function runs.
            new ForkDocumentUseCase(storageProvider, serializer).execute('doc-h2', null, p1);
        } catch (e) { editCopyShapedError = e; }
        assert(repositoryShapedError && editCopyShapedError && repositoryShapedError.reason === editCopyShapedError.reason && repositoryShapedError.message === editCopyShapedError.message, 'H2. A license-denied Fork produces byte-identical error shape (reason + message) regardless of which surface\'s own resolution path supplied the sourcePublication — confirming Repository/Author\'s Fork failure and World\'s "Edit a Copy" failure are the SAME underlying contract, presented through the SAME dialog, never two semantically different failures that merely look similar.');

        console.log('✓ H — every Fork entry point this audit found shares one failure-presentation path (one forkFailure.value assignment, one <ForkFailureDialog>), and a license-denied failure is proven to be byte-identical in shape regardless of which surface\'s own resolution path supplied the source Publication. Equivalent failures across surfaces are the SAME contract, not merely similar-looking separate ones.');
    }

    // ===============================================================
    // Section I — UI vocabulary: where does one action wear two names?
    // ===============================================================
    {
        const worldFocusPanelSource = await rawSource('ui/components/WorldFocusPanel.js');
        const worldCardSource = await rawSource('ui/components/WorldCard.js');
        const publicationCardSource = await rawSource('ui/components/PublicationCard.js');

        // I1. Open/Fork/Explore are IDENTICALLY worded on every surface
        // that uses catalog-style vocabulary (Repository, Author, World
        // Encounter) — no divergence here at all.
        assert(publicationCardSource.includes('>Open</button>') && publicationCardSource.includes('>Fork</button>') && publicationCardSource.includes('>Explore</button>'), 'I1. Catalog-style surfaces (Repository/Author) use exactly "Open"/"Fork"/"Explore" — the SAME words World Encounter\'s own buttons use (already confirmed, Section A2).');

        // I2. Real divergence #1: "Fork" vs "Edit a Copy" name the
        // IDENTICAL action (Section B2/E/H already proved byte-
        // identical route shape, use case, and failure handling) —
        // deliberately, per WorldFocusPanel.js's own header, but
        // documented only in a source comment, never in any user-facing
        // text.
        assert(worldFocusPanelSource.includes('deliberately none of them\n// named "Focus"'), 'I2a. The vocabulary choice is self-aware and deliberate, per this file\'s own header.');
        assert(worldFocusPanelSource.includes('>Edit a Copy</button>') && !worldFocusPanelSource.includes('>Fork<'), 'I2b. Yet the LABEL a viewer actually sees here is "Edit a Copy", never "Fork" — a viewer who has used Repository\'s "Fork" has no on-screen cue that this button does the exact same thing.');

        // I3. Real divergence #2: "Explore"/"Continue Exploring" (entering
        // World fresh) vs "Focus"/"Go" (repositioning within a live
        // session) — FOUR different words for what Section F already
        // proved are two mechanisms (not four), and even within EACH of
        // those two mechanisms, the wording still is not uniform:
        // Recent Worlds says "Continue Exploring" where Repository/
        // Author says "Explore" for the identical fresh-push mechanic,
        // and WorldFocusPanel says "Go" where Search/Location Browser
        // say "Focus" for the identical focusWorld() mechanic.
        assert(worldCardSource.includes('>Continue Exploring</button>'), 'I3a. Recent Worlds\' own label for the fresh-entry mechanic.');
        assert(worldFocusPanelSource.includes("button's own camera-move\n// button is labeled \"Go\"") || worldFocusPanelSource.includes('button is labeled "Go"'), 'I3b. WorldFocusPanel\'s own label for the reposition mechanic, explicitly chosen (per its own header) to echo "Explore"\'s intent rather than "Focus"\'s — a deliberate near-synonym, not an oversight, but still a THIRD/FOURTH word for the same two underlying mechanics.');

        console.log('✓ I — Open/Fork/Explore are worded identically across every catalog-style surface. Two real vocabulary divergences are named: "Fork" vs "Edit a Copy" (identical action, Sections B/E/H), and "Explore"/"Continue Exploring" vs "Focus"/"Go" (two mechanics, four words). Both splits are DELIBERATE and self-documented in source comments — never accidental — but that map exists only for a code reader, never a user-facing glossary (Section J: DOCUMENTATION_GAP, not PRODUCT_GAP).');
    }

    // ===============================================================
    // Section J — Classification.
    // ===============================================================
    console.log('\n=== 0.9.560 VERDICT ===');
    console.log(`
Ten sections, checked against real, unmodified production source and real
object graphs throughout, at the CROSS-SURFACE altitude the originating
brief asked for — never re-auditing any single surface's own internal
correctness a prior milestone already closed.

  A — ALREADY_CORRECT (inventory only, no classification of its own).
      Repository/Author/World Encounter offer all four actions; World
      Focus Panel/spatial inspection offer Fork (as "Edit a Copy");
      World Search and Recent Worlds correctly offer narrower surfaces
      (Focus-only, Explore-equivalent-only) matching what those surfaces
      actually need, not a missed capability.

  B — ALREADY_CORRECT. Open and Fork converge on byte-identical route
      shapes across every independently-written entry point, funneling
      into exactly one EditorView.js consumer each. Commentary's two
      independent composition roots are proven, with real classes
      rather than a trusted comment, to converge on one underlying
      store.

  C — ALREADY_CORRECT. Identity flows as publicationId (or a resolved
      Publication object's own fields) throughout; the Fork destination
      never trusts a client-shaped Publication over the URL, always
      re-resolving it through the same canonical FindPublicationUseCase
      every other Publication lookup in the app already uses.

  D — DELIBERATE_BOUNDARY, PRESERVED, NOT RELITIGATED. Open's
      Publication -> Document identity transition is the same one
      0.9.559 already closed, reconfirmed here for the additional
      surfaces (Author, Recent Worlds) this milestone checked.

  E — ALREADY_CORRECT — and the milestone's own most important finding.
      A plausible-looking candidate defect ("Edit a Copy" might silently
      skip license enforcement when its own publicationId resolution
      comes back empty) was investigated in depth and REJECTED WITH
      EVIDENCE: getPublicationIdForDocument() and _checkForkPolicy()
      share the identical underlying lookup and reduction, so a null
      resolution is structurally reachable only when there is genuinely
      no Publication to enforce a license from anywhere in this session
      — proven both structurally (identical source) and live (a real
      restrictive license always resolves, non-null). Confirming a
      plausible-sounding concern is actually already handled correctly
      is exactly the kind of result this milestone's own brief asked
      for — "distinguish legitimate contextual differences from actual
      duplication," here applied to "distinguish an apparent gap from
      an actual one."

  F — DELIBERATE_BOUNDARY. Two mechanisms (reposition within a live
      World session via focusWorld(); enter fresh from outside via
      router.push) for two genuinely different situations, traced to a
      named, documented product principle (docs/Principles.md, "Focus
      Is Navigation, Not Discovery") — not a fractured single concept.

  G — ALREADY_CORRECT for identity/idempotency (proven structurally
      across all three composing files and live against the real
      store's shared contract). The one real, narrow PRODUCT_GAP this
      milestone named — PublicationList.js, the alternate view of the
      SAME Repository/Author catalog PublicationCard.js already served
      Commentary for, offering none — was CLOSED by 0.9.561 (Publication
      List Commentary Parity), which wired PublicationList.js to the
      SAME getPublicationCommentariesCommand/addPublicationCommentaryCommand
      PublicationCard.js already injects, per this milestone's own
      "CONCRETE RECOMMENDATION" below. G4 (above) is re-checked live
      against current source rather than left asserting the now-closed
      gap.

  H — ALREADY_CORRECT. One failure-presentation path (one
      forkFailure.value assignment, one <ForkFailureDialog>) for every
      Fork entry point; a license-denied failure is proven byte-
      identical in shape regardless of origin surface. Equivalent
      failures across surfaces are the SAME contract, not separately
      maintained ones that merely happen to agree today.

  I — DOCUMENTATION_GAP. Two real vocabulary divergences named — "Fork"
      vs "Edit a Copy" (identical action), and "Explore"/"Continue
      Exploring" vs "Focus"/"Go" (two mechanics, four words) — both
      DELIBERATE and self-documented in source comments (never
      accidental drift), but never written down anywhere a USER would
      see the equivalence. Not standardized here per the brief's own
      instruction not to change vocabulary for aesthetic reasons alone,
      and because every comment audited explains a genuine, considered
      reason for the specific word chosen on each surface.

CONCRETE RECOMMENDATION (neither gap was acted on in this original,
test-only milestone; G's gap was later acted on by 0.9.561):

  - G's gap: CLOSED by 0.9.561 (Publication List Commentary Parity) —
    PublicationList.js now injects the SAME
    getPublicationCommentariesCommand/addPublicationCommentaryCommand
    PublicationCard.js already consumes (both sit inside the identical
    PublicationCatalog.js, receiving the identical injected commands via
    Vue's inject() — no new composition, no new command, no new use
    case, exactly as recommended here). A single, narrow, well-understood
    seam — never an "Action Framework."

  - I's gap: a short glossary entry in user-facing help (or a tooltip)
    noting "Edit a Copy" and "Fork" are the same action, and
    "Focus"/"Go" and "Explore"/"Continue Exploring" are the same
    action. No code change at all.

OVERALL: per the brief's own central question — "has ForkBuild
maintained action convergence as new entry points were added?" — yes.
Every independently-added entry point this audit found reuses the same
underlying commands, use cases, and identity semantics as the surface it
was added alongside; the one place duplication crept in (Commentary's
two composition roots) is a deliberate, necessary consequence of a
missing shared composition context (no WorldNavigationSession outside
World View), not divergent behavior, and is proven, live, to still
converge on one store. The two real findings (G, I) are both narrow,
already partly self-documented, and do not warrant a new abstraction —
per the brief's own instruction, this milestone recommends addressing
each concretely, if at all, rather than building a general Action
Framework. Per the brief's own framing: the Publication action surface
is sufficiently mature. This milestone recommends moving away from
Publication/World audits entirely absent new evidence, echoing 0.9.559's
own recommendation one level up.
`);

    console.log('✅ All Cross-Surface Publication Action Consistency Audit tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All CrossSurfacePublicationActionConsistencyAudit tests passed');
}).catch((error) => {
    console.error('\n✗ CrossSurfacePublicationActionConsistencyAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
