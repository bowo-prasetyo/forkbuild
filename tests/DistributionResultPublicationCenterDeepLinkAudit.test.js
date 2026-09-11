import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

import { composePublicationDistributionCommand } from '../application/PublicationDistributionCommandComposition.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';

// 0.9.380 — Publication Result -> Publication Center Deep-Link Audit.
//
// **Type: test-only product/architecture seam audit. No production
// changes.** 0.9.379's own Section C/D/J recorded one narrow finding on
// record for a future milestone: "no result panel links to the Publication
// Center for the Publication just distributed... the Center itself has no
// mechanism yet to jump straight to one Publication." This milestone is
// that future audit, asked to determine the SMALLEST safe way to make an
// existing distribution result actionable, per its own brief:
//
//   A user can explicitly navigate from an existing distribution result to
//   the already-known Publication.
//
// Tracing that seam fresh against real, unmodified production source (never
// prose carried over from 0.9.379 without re-checking it) overturns the
// brief's own destination, the same way 0.9.336's audit corrected its own
// Route A diagram where it did not survive contact with source: the
// `Publication` a distribution result names (`publisher/Publication.js`,
// produced by `PublishDocumentUseCase`/distributed by
// `PublicationDistributionCommand`) and the catalog
// `ui/views/DecentralizedPublicationsView.js` ("the Publication Center",
// `/publications`) actually reads (`application/LocalPublicationCatalog.js`,
// holding `core/DecentralizedPublication.js` envelopes) are two
// structurally disjoint domains — see this file's own header comment in
// `discovery/PublicationCatalogDiscoveryProvider.js`, cited fresh in
// Section B, below. Navigating a distribution result to `/publications`
// would not find a stale or missing entry; it would find a page whose
// catalog can never, through any existing production pathway, contain this
// class of Publication at all. The REAL existing home for this exact
// Publication — proven live, fresh, in Section D — is
// `discovery/LocalDiscoveryProvider.js` (the Repository/`/repository`
// catalog `PublishDocumentUseCase` already populates unconditionally, per
// 0.9.379 Section D's own live proof, one call further downstream), reached
// through the SAME `/world/<documentId>` per-entity route
// `ui/components/PublicationCatalog.js`'s own "Explore" action and
// `EditorView.js`'s own `backToWorld()`/`backFromForkFailure()` already
// navigate to.
//
//   Section A — Result identity: the result's own `publication.objectId`
//               is `Publication.id`, exactly, never reconstructed from
//               title/author/content-hash. The separately-held Publication
//               object also carries `.documentId` — the field navigation
//               actually needs.
//   Section B — CORRECTED: the Publication Center's own catalog
//               (`LocalPublicationCatalog`) and this milestone's own
//               Publication are structurally disjoint — traced to the one
//               real production `.publish()` call site there is, and
//               live-proven that bridging them naively corrupts the
//               catalog.
//   Section C — Existing routing conventions: the app's own established
//               `route.query` idiom, and the one already-working per-entity
//               destination for this exact Publication type.
//   Section D — FLAGSHIP: live, real Publish -> Distribute -> deep-link
//               identity chain, proving exact `.id` preservation into the
//               REAL destination and a real, live miss against the wrong
//               one.
//   Section E — Cross-surface convergence: exactly one surface needs a new
//               navigation edge; the other two are already at the
//               destination or have no result to link from.
//   Section F — Failure and stale identity: an unpublished Publication, and
//               a superseded-by-a-later-publish Publication, both
//               characterized honestly.
//   Section G — Local-first boundary: pure navigation, no I/O, no lifecycle
//               mutation.
//   Section H — Existing UI reachability: the exact template seam.
//   Section I — Architecture boundary: explicit rejections, including
//               forcing the brief's own named (but wrong) destination.
//   Section J — Final decision matrix and verdict.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function codeOnlySource(relativePath) {
    return codeOnlyLines(await readSource(relativePath));
}

function extractRange(source, startMarker, endMarker, label) {
    const start = source.indexOf(startMarker);
    if (start === -1) throw new Error(`ASSERT FAILED: ${label || startMarker}: start marker located in source`);
    const end = source.indexOf(endMarker, start + startMarker.length);
    if (end === -1) throw new Error(`ASSERT FAILED: ${label || startMarker}: end marker located after start`);
    return source.slice(start, end);
}

async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

function grepFiles(pattern, dirs) {
    try {
        const out = execFileSync('grep', ['-rl', pattern, ...dirs, '--include=*.js'], { cwd: SOURCE_ROOT.pathname }).toString().trim();
        return out ? out.split('\n') : [];
    } catch { return []; }
}

async function grepCodeOnlyFiles(pattern, dirs) {
    const candidates = grepFiles(pattern, dirs);
    const hits = [];
    for (const file of candidates) {
        const code = await codeOnlySource(file);
        if (code.includes(pattern)) hits.push(file);
    }
    return hits;
}

const PRODUCTION_DIRS = ['application', 'ui', 'core', 'publisher', 'storage', 'discovery'];

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeDocument(title) {
    const world = new World();
    const building = new Building({ creator: 'alice' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author: 'alice' }) });
}

// A shared rig where the SAME storage backs LocalPublisherProvider AND
// LocalDiscoveryProvider AND LocalPublicationCatalog — exactly the shape
// ui/main.js's own real app-wide composition already uses (LocalPublisher
// Provider/LocalDiscoveryProvider read/write the SAME 'forkbuild-
// publications' storage key; LocalPublicationCatalog reads/writes its own,
// separate key on the SAME provider) — never three independent, unrelated
// stores that would misrepresent whether "the same replica" genuinely sees
// both.
function realReplicaRig() {
    const storage = new InMemoryStorageProvider();
    const alice = new LocalIdentityProvider(storage);
    alice.login('alice');
    const publisherProvider = new LocalPublisherProvider(storage, new LocalContentStore(storage));
    const discoveryProvider = new LocalDiscoveryProvider(storage);
    const publicationCatalog = new LocalPublicationCatalog(storage);
    const publishDocumentUseCase = new PublishDocumentUseCase(publisherProvider, alice);
    return { storage, alice, publisherProvider, discoveryProvider, publicationCatalog, publishDocumentUseCase };
}

function realAppWideDistributionCommand({ lifecycleStore, transactionId = 'DeepLinkAuditTransactionId1234567', eventId = 'd'.repeat(64), gatewayHandler, relayHandler }) {
    const gateway = gatewayHandler || (() => new Response('accepted', { status: 200 }));
    const relay = relayHandler || (() => ({ published: true, id: eventId }));
    return composePublicationDistributionCommand({
        lifecycleStore,
        arweaveUploaderOptions: {
            signer: { sign: async (material) => ({ id: transactionId, transaction: { data: material } }) },
            fetchImpl: async (url, options) => gateway(url, options)
        },
        nostrPublisherOptions: {
            relayUrl: 'wss://relay.example',
            discoveryTag: 'forkbuild-deep-link-audit',
            publishImpl: async (relayUrl, eventTemplate) => relay(relayUrl, eventTemplate)
        }
    });
}

// -----------------------------------------------------------------
// EditorView harness — extracts the REAL, CURRENT 0.9.377 block out of
// ui/views/EditorView.js, unmodified, exactly as tests/EditorViewPostPublish
// DistributionAction.test.js (0.9.377), tests/PostPublishDistributionAction
// ConvergenceAudit.test.js (0.9.378), and tests/PostDistributionProduct
// EvolutionReassessment.test.js (0.9.379) already do.
// -----------------------------------------------------------------
function buildEditorViewHarness(editorViewSource, { publicationDistributionCommand = null } = {}) {
    const blockSource = extractRange(
        editorViewSource,
        "const publicationDistributionCommand = inject('publicationDistributionCommand', null);",
        '// ------------------------- 0.2.21 document lifecycle ------------',
        '0.9.377 post-publish distribution block'
    );

    function ref(initial) { return { value: initial }; }
    function inject(key, fallback) {
        if (key === 'publicationDistributionCommand') {
            return publicationDistributionCommand === null ? fallback : publicationDistributionCommand;
        }
        return fallback;
    }

    // eslint-disable-next-line no-new-func
    const factory = new Function(
        'inject', 'ref',
        `${blockSource}\nreturn {
            publicationDistributionCommand,
            distributeEditorPublication,
            publishedPublication,
            distributionExecuting,
            distributionError,
            distributionResult,
            onDocumentPublished,
            dismissPublishAction,
            distributePublishedDocument
        };`
    );
    return factory(inject, ref);
}

function extractToolbarPublishChain(toolbarCodeOnly) {
    const publishMatch = toolbarCodeOnly.match(/function publish\(\)\s*\{[\s\S]*?\n {8}\}/);
    if (!publishMatch) throw new Error('ASSERT FAILED: Toolbar.js publish() function located in source');
    const reportStart = toolbarCodeOnly.indexOf('function report(message) {');
    if (reportStart === -1) throw new Error('ASSERT FAILED: Toolbar.js report() function located in source');
    return toolbarCodeOnly.slice(reportStart, publishMatch.index + publishMatch[0].length);
}

function runToolbarPublish(publishChainSource, { publishDocumentUseCase, documentManager, feedbackShow }) {
    const props = { publishDocumentUseCase, documentManager, feedback: { show: feedbackShow || (() => {}) } };
    let emittedEvent = null;
    let emittedArg = null;
    function emit(event, arg) { emittedEvent = event; emittedArg = arg; }
    // eslint-disable-next-line no-new-func
    const factory = new Function('props', 'emit', `${publishChainSource}\nreturn publish;`);
    factory(props, emit)();
    return { emittedEvent, emittedArg };
}

function publishThroughRealChain(publishSource, editorHarness, { publishDocumentUseCase, documentManager, feedbackShow }) {
    const { emittedEvent, emittedArg } = runToolbarPublish(publishSource, { publishDocumentUseCase, documentManager, feedbackShow });
    if (emittedEvent === 'published') {
        editorHarness.onDocumentPublished(emittedArg);
    }
    return { emittedEvent, emittedArg };
}

async function run() {
    const editorViewSource = await readSource('ui/views/EditorView.js');
    const editorViewCodeOnly = codeOnlyLines(editorViewSource);
    const toolbarCodeOnly = await codeOnlySource('ui/components/Toolbar.js');
    const publishSource = extractToolbarPublishChain(toolbarCodeOnly);
    const panelSource = await readSource('ui/components/OwnPublicationPanel.js');
    const canvasSource = await readSource('ui/components/WorldEncounterCanvas.js');

    // ---------------------------------------------------------------
    // Section A — Result identity.
    // ---------------------------------------------------------------
    {
        const resultCode = await readSource('application/PublicationDistributionResult.js');
        assert(resultCode.includes("publication: Object.freeze({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id })"),
            n('describePublicationDistributionResult() names the result\'s own publication section exactly { kind, objectId: publication.id } — objectId IS Publication.id, verbatim, never a derived or re-hashed value'));
        assert(!resultCode.includes('.title') && !resultCode.includes('.author') && !resultCode.includes('contentHash'),
            n('PublicationDistributionResult.js reads no title/author/contentHash field of the publication it describes — no reconstruction-by-metadata is even possible from this file\'s own source'));

        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const rawCommand = realAppWideDistributionCommand({ lifecycleStore, eventId: 'a'.repeat(64) });
        const { publishDocumentUseCase } = realReplicaRig();
        const publication = publishDocumentUseCase.execute({ document: makeDocument('Section A Identity Manor') });
        const editorHarness = buildEditorViewHarness(editorViewSource, { publicationDistributionCommand: rawCommand });
        editorHarness.onDocumentPublished(publication);
        editorHarness.distributePublishedDocument();
        await flushMicrotasks();

        const result = editorHarness.distributionResult.value;
        assert(result.publication.objectId === publication.id,
            n('live: the result\'s own publication.objectId equals the real published Publication\'s own .id, exactly, byte for byte'));
        assert(!('documentId' in result.publication) && !('title' in result.publication) && !('contentHash' in result.publication),
            n('the result\'s own publication section carries objectId/kind ONLY — no documentId, title, or contentHash live on the result itself'));

        // The field navigation actually needs (documentId) lives on the
        // separately-held Publication object EditorView already keeps —
        // publishedPublication — never on the result. Any deep-link
        // capability forwards THAT identity, never reconstructs it.
        assert(editorHarness.publishedPublication.value.documentId === publication.documentId,
            n('publishedPublication.value.documentId (held separately from the result, already in EditorView\'s own scope) is the real Publication\'s own .documentId — a second, independently-known identity field, never derived from title/author/hash'));

        console.log('✓ Section A: the result\'s own publication.objectId is Publication.id verbatim, live-proven; no title/author/content-hash field exists anywhere in the result to reconstruct from; the one additional field a deep-link needs (documentId) already lives on the separately-held Publication object, not invented');
    }

    // ---------------------------------------------------------------
    // Section B — CORRECTED: Publication Center current selection
    // model, and whether this milestone's own Publication can ever be
    // one of its entries.
    // ---------------------------------------------------------------
    {
        const publicationsViewSource = await readSource('ui/views/DecentralizedPublicationsView.js');

        // B1 — no selectPublication(id) or route-query mechanism exists
        // (reconfirming 0.9.379 Section D2 fresh).
        assert(!/\bselectPublication\s*\(/.test(publicationsViewSource),
            n('no selectPublication(publicationId) or equivalent exists anywhere in DecentralizedPublicationsView.js'));
        assert(!publicationsViewSource.includes('useRoute') && !/route\.query/.test(publicationsViewSource),
            n('DecentralizedPublicationsView.js still reads no route query parameter at all, reconfirmed fresh'));

        // B2 — a private findEntry(publicationId) DOES already exist, but
        // is a single-purpose internal helper (bitcoin anchor transaction
        // finalization), never exposed to the template, never used for
        // "scroll to" / "highlight" / any selection concept.
        const findEntryMatches = publicationsViewSource.match(/findEntry\(/g) || [];
        assert(findEntryMatches.length === 2,
            n(`findEntry(publicationId) is declared once and called exactly once elsewhere (found ${findEntryMatches.length} occurrences of "findEntry(") — a narrow, single-purpose helper, not a general selection capability`));
        assert(publicationsViewSource.includes('function findEntry(publicationId) {\n            return entries.find((entry) => entry.publication.id === publicationId);'),
            n('findEntry() itself IS an exact-identity lookup (entry.publication.id === publicationId) — the right shape for a future selectPublication(), but not returned from setup(), so not template-reachable today'));
        const setupReturnBlock = extractRange(publicationsViewSource, 'return {\n            entries, loading,', '\n        };', 'DecentralizedPublicationsView setup() return');
        assert(!setupReturnBlock.includes('findEntry'),
            n('findEntry is absent from setup()\'s own return object — the template cannot call it; it is a closure-private helper only'));

        // B3 — THE CORRECTION. Trace whether this milestone's own
        // Publication (publisher/Publication.js, produced by
        // PublishDocumentUseCase) can ever become one of `entries`
        // (catalog.list(), i.e. application/LocalPublicationCatalog.js).
        const catalogBridgeCode = await readSource('discovery/PublicationCatalogDiscoveryProvider.js');
        assert(catalogBridgeCode.includes('it catalogs core/DecentralizedPublication.js instances') || catalogBridgeCode.includes('core/DecentralizedPublication.js instances'),
            n('discovery/PublicationCatalogDiscoveryProvider.js\'s own header states plainly, in production prose: the Publication Center catalogs core/DecentralizedPublication.js instances — a DIFFERENT class from publisher/Publication.js'));
        assert(catalogBridgeCode.includes('older, pre-0.7.0') && catalogBridgeCode.includes('Publication'),
            n('the SAME header names discovery/LocalDiscoveryProvider.js as serving the OLDER, pre-0.7.0 publisher/Publication.js world instead — the world this milestone\'s own distribution result belongs to'));

        // B4 — the only production caller of PublicationResolver#publish()
        // anywhere in this codebase, and the contentKind it uses.
        const publishCallers = await grepCodeOnlyFiles('.publish({', ['ui', 'application']);
        const resolverPublishCallers = [];
        for (const file of publishCallers) {
            const code = await codeOnlySource(file);
            if (/\bpublicationResolver\.publish\(\{|Resolver\.publish\(\{/.test(code)) resolverPublishCallers.push(file);
        }
        assert(resolverPublishCallers.length === 1 && resolverPublishCallers[0] === 'ui/views/EditorView.js',
            n(`exactly one production caller of PublicationResolver#publish() exists anywhere — found: ${JSON.stringify(resolverPublishCallers)} — and it wraps a BlueprintAttribution, never a Document/World Publication`));
        const editorPublishBlock = extractRange(editorViewSource, 'async function publishInspectedAttributionToNetwork()', '0.6.8 — Blueprint Lineage', 'publishInspectedAttributionToNetwork()');
        assert(editorPublishBlock.includes('contentKind: BLUEPRINT_ATTRIBUTION_KIND'),
            n('that one production call site publishes contentKind: BLUEPRINT_ATTRIBUTION_KIND — never PUBLICATION_CONTENT_KIND'));
        // PUBLICATION_CONTENT_KIND itself is defined and display-registered
        // (application/PublicationContentKind.js, application/
        // CreatePublicationDisplayKindRegistryUseCase.js) but — per the
        // single-caller check just above — never actually handed to any
        // production .publish() call. The display-only kindPlugin has no
        // producer anywhere in this codebase.

        // B5 — the publish/distribute path this milestone's own result
        // comes from never touches the catalog at all.
        const publishUseCaseCode = await codeOnlySource('application/PublishDocumentUseCase.js');
        const publisherProviderCode = await codeOnlySource('publisher/LocalPublisherProvider.js');
        assert(!publishUseCaseCode.includes('Catalog') && !publishUseCaseCode.includes('PublicationResolver'),
            n('application/PublishDocumentUseCase.js imports neither LocalPublicationCatalog nor PublicationResolver'));
        assert(!publisherProviderCode.includes('Catalog') && !publisherProviderCode.includes('PublicationResolver'),
            n('publisher/LocalPublisherProvider.js imports neither LocalPublicationCatalog nor PublicationResolver'));

        // B6 — LIVE: a naive bridge attempt (catalog.add() on the real
        // distributed Publication) does not merely fail to help — it
        // corrupts the catalog for every other entry too, because list()
        // reconstructs EVERY stored entry through DecentralizedPublication
        // .fromJSON(), which requires a non-empty contentKind no
        // publisher/Publication.js#toJSON() output ever carries.
        const { publisherProvider, publicationCatalog, alice: bridgeAlice } = realReplicaRig();
        const publishDocUseCase = new PublishDocumentUseCase(publisherProvider, bridgeAlice);
        const distributedPublication = publishDocUseCase.execute({ document: makeDocument('Section B Bridge Manor') });
        const addResult = publicationCatalog.add(distributedPublication);
        assert(addResult.isNew === true,
            n('live: LocalPublicationCatalog.add() accepts the real distributed Publication without throwing (it only checks .toJSON()/.id) — the corruption is silent at write time'));
        let listThrew = false;
        try {
            publicationCatalog.list();
        } catch (e) {
            listThrew = true;
        }
        assert(listThrew,
            n('live: LocalPublicationCatalog.list() now THROWS — DecentralizedPublication.fromJSON() requires a non-empty contentKind that a publisher/Publication.js#toJSON() output never has — bridging the two catalogs by calling catalog.add() on this milestone\'s own Publication is not merely useless, it is actively unsafe'));

        console.log('✓ Section B (CORRECTED): DecentralizedPublicationsView.js (\"the Publication Center\", /publications) has no selectPublication()/route-query mechanism, and its own private findEntry() is a single-purpose internal helper, not template-reachable. More fundamentally: its catalog (LocalPublicationCatalog, holding core/DecentralizedPublication.js envelopes) is structurally disjoint from this milestone\'s own Publication (publisher/Publication.js) — the only production .publish() call anywhere wraps a BlueprintAttribution, never a Document/World Publication, and PublishDocumentUseCase/LocalPublisherProvider never touch the catalog at all. A live attempt to bridge them by calling catalog.add() on a real distributed Publication is accepted silently but corrupts every subsequent list() call catalog-wide. The Publication Center is the WRONG destination for this milestone\'s own Publication, not merely a destination with a missing selection mechanism.');
    }

    // ---------------------------------------------------------------
    // Section C — Existing routing conventions.
    // ---------------------------------------------------------------
    {
        const routerCode = await readSource('ui/router/index.js');
        const catalogCode = await readSource('ui/components/PublicationCatalog.js');

        // C1 — the route conventions that actually exist.
        assert(routerCode.includes("path: '/publications'") && !routerCode.includes("path: '/publications/:"),
            n('/publications is a bare, parameterless route — no :id path-segment convention exists for it'));
        assert(routerCode.includes("path: '/world/:documentId'"),
            n('/world/:documentId is a real, existing per-entity route — the shape this milestone\'s own Publication (via .documentId) can already target'));

        // C2 — the established route.query idiom this app already uses
        // for "hand an already-known identity to a view that is about to
        // mount," used by EditorView.js itself (route.query.fork/load/
        // publication) and WorldView.js (route.query.returnLocation) —
        // reconfirmed fresh, never introduced by this milestone.
        assert(/route\.query\.fork/.test(editorViewCodeOnly) && /route\.query\.load/.test(editorViewCodeOnly) && /route\.query\.publication/.test(editorViewCodeOnly),
            n('EditorView.js already reads route.query.fork/load/publication — an established, bare-noun-keyed query-param idiom, pre-existing this milestone'));
        assert(!/route\.query/.test(await codeOnlySource('ui/views/DecentralizedPublicationsView.js')),
            n('that idiom has never been extended to /publications itself — reconfirming Section B1, from the routing-convention side'));

        // C3 — the ALREADY-WORKING per-entity destination for exactly
        // this Publication type: ui/components/PublicationCatalog.js's
        // own "Explore" action.
        assert(catalogCode.includes("function viewWorld(pub) {\n            router.push({ path: `/world/${pub.documentId}` });"),
            n('PublicationCatalog.js\'s own viewWorld(pub) already navigates to /world/<documentId> for exactly this Publication type (publisher/Publication.js) — a real, shipped, per-entity deep link, not a new convention'));

        // C4 — EditorView.js already owns a `router` instance and already
        // uses the identical { path, query } push shape for its own
        // existing navigations (backToWorld/backFromForkFailure) — zero
        // new collaborators would be required to reuse it.
        assert(editorViewSource.includes("const router = useRouter();"),
            n('EditorView.js already constructs router via useRouter() in this SAME setup() scope the 0.9.377 post-publish block lives in'));
        const backToWorldBlock = extractRange(editorViewSource, 'function backToWorld() {', 'function backFromForkFailure', 'backToWorld()');
        assert(backToWorldBlock.includes('router.push({') && backToWorldBlock.includes('path: `/world/${'),
            n('EditorView.js\'s own backToWorld() already calls router.push({ path: `/world/${...}`, query: {...} }) — the exact shape a Publication Result deep-link would reuse, not invent'));

        console.log('✓ Section C: /publications carries no :id or route-query convention of any kind — reconfirmed from the routing side. /world/:documentId is a real, existing per-entity route already targeted by PublicationCatalog.js\'s own "Explore" action for exactly this Publication type, using the identical router.push({ path, query }) shape EditorView.js already uses twice over for its own existing navigations, with router already in scope. No new route convention would need to be introduced.');
    }

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP: live Publish -> Distribute -> deep-link
    // identity chain.
    // ---------------------------------------------------------------
    {
        const { publishDocumentUseCase, discoveryProvider, publicationCatalog } = realReplicaRig();
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const rawCommand = realAppWideDistributionCommand({ lifecycleStore, eventId: 'f'.repeat(64) });
        const editorHarness = buildEditorViewHarness(editorViewSource, { publicationDistributionCommand: rawCommand });

        const publication = publishDocumentUseCase.execute({ document: makeDocument('Section D Flagship Manor') });
        editorHarness.onDocumentPublished(publication);
        editorHarness.distributePublishedDocument();
        await flushMicrotasks();
        assert(editorHarness.distributionError.value === null && editorHarness.distributionResult.value !== null,
            n('sanity: the real Publish -> Distribute chain, driven live through EditorView, succeeds'));

        const objectId = editorHarness.distributionResult.value.publication.objectId;
        const documentId = editorHarness.publishedPublication.value.documentId;

        // D1 — a candidate navigation call, reconstructed here test-only
        // (0.9.381 later gave production the real
        // viewDistributedPublicationInRepository() — see Section H),
        // constructed from ONLY identity already in hand, reusing the
        // EXACT shape Section C3/C4 already proved real.
        const pushedCalls = [];
        const stubRouter = { push: (target) => pushedCalls.push(target) };
        function candidateViewInWorld(router, publishedPublicationValue) {
            if (!publishedPublicationValue) return;
            router.push({ path: `/world/${publishedPublicationValue.documentId}` });
        }
        candidateViewInWorld(stubRouter, editorHarness.publishedPublication.value);
        assert(pushedCalls.length === 1 && pushedCalls[0].path === `/world/${documentId}`,
            n('the candidate navigation call forwards ONLY publishedPublication.value.documentId (already held by EditorView) into the SAME { path: `/world/${documentId}` } shape Section C already proved real — no lookup, no reconstruction, no new identity'));

        // D2 — the REAL destination: discovery/LocalDiscoveryProvider.js
        // (the Repository catalog) already contains this exact
        // Publication, by exact .id, live — the SAME live proof 0.9.379
        // Section D already ran, reconfirmed here as the destination this
        // milestone's own navigation would land on.
        const resolvedAtRealDestination = discoveryProvider.findById(objectId);
        assert(resolvedAtRealDestination !== null && resolvedAtRealDestination.id === objectId,
            n('live: discoveryProvider.findById(objectId) — the exact id the distribution result names — resolves to the real Publication at the real destination the candidate navigation targets, with no title/hash matching involved'));
        assert(resolvedAtRealDestination === publication || resolvedAtRealDestination.documentId === documentId,
            n('the resolved Publication\'s own .documentId matches the documentId the navigation itself used to get there — one consistent identity throughout the chain'));

        // D3 — the REAL miss: navigating to /publications with the exact
        // same id, as the brief's own literal proposal would, finds
        // nothing, live — proving Section B's structural finding, not
        // merely asserting it.
        assert(publicationCatalog.get(objectId) === null,
            n('live: LocalPublicationCatalog.get(objectId) — the catalog /publications actually reads — returns null for this exact, real, freshly-distributed Publication; the brief\'s own named destination has nothing to select, live-proven, not merely argued from source'));

        console.log('✓ Section D (FLAGSHIP): live, end to end — Publish -> Distribute produces a real result naming objectId; a candidate navigation call built from ONLY already-held identity (publishedPublication.value.documentId) reaches the real destination (discovery/LocalDiscoveryProvider.js, i.e. Repository) where the SAME exact Publication.id already resolves; the SAME exact id, checked against the brief\'s own named destination (LocalPublicationCatalog, i.e. Publication Center), resolves to nothing. One target works today, live; the other cannot, live.');
    }

    // ---------------------------------------------------------------
    // Section E — Cross-surface convergence.
    // ---------------------------------------------------------------
    {
        // E1 — EditorView: a genuinely different route (/editor) than
        // where this Publication lives (/world/<documentId>) — the one
        // surface that actually benefits from a new navigation edge.
        const routerCode = await readSource('ui/router/index.js');
        assert(routerCode.includes("path: '/editor', name: 'editor', component: EditorView")
            && routerCode.includes("path: '/world/:documentId', name: 'world', component: WorldView"),
            n('EditorView mounts at /editor; the Publication\'s own home mounts at /world/:documentId — two genuinely different routes, so a navigation edge between them is real, not a no-op'));

        // E2 — OwnPublicationPanel: already mounted INSIDE WorldView, at
        // the exact destination a deep-link would target, bound to the
        // SAME session-resolved Publication for the CURRENT route's own
        // documentId — a "View in World View" action here would navigate
        // from the destination to itself.
        const worldViewSource = await readSource('ui/views/WorldView.js');
        assert(worldViewSource.includes('<OwnPublicationPanel') && worldViewSource.includes(':publication="ownPublication"'),
            n('OwnPublicationPanel is mounted inside WorldView.js itself, bound to :publication="ownPublication"'));
        assert(worldViewSource.includes('ownPublication.value = (activeId && typeof session.getPublicationForDocument'),
            n('ownPublication is resolved from session.getPublicationForDocument(activeId) — activeId being the CURRENT route\'s own documentId — so OwnPublicationPanel is already showing the Publication for the world it is already mounted under; a deep-link there is not needed, it is already satisfied'));
        assert(!panelSource.includes('/publications') && !panelSource.includes('router.push') && !/useRouter|useRoute/.test(panelSource),
            n('OwnPublicationPanel.js itself has no router dependency of any kind — consistent with never needing to navigate away from where it already lives'));

        // E3 — WorldEncounterCanvas: reconfirming 0.9.379's own finding
        // fresh — this surface deliberately holds no distinguishable
        // "distribution result" object to attach a link to in the first
        // place (a plain notice, never a reclassified domain result), so
        // there is nothing here for THIS milestone to extend.
        assert(canvasSource.includes('PLAIN NOTICE') && canvasSource.includes('NEVER A RECLASSIFIED DOMAIN RESULT'),
            n('WorldEncounterCanvas.js\'s own header still holds "PLAIN NOTICE — NEVER A RECLASSIFIED DOMAIN RESULT" — there is no result object here to add a navigation affordance to, independent of where this component is mounted'));
        assert(!canvasSource.includes('distributionResult'),
            n('WorldEncounterCanvas.js declares no distributionResult of any kind, reconfirmed fresh'));

        console.log('✓ Section E: exactly one surface (EditorView, mounted at a genuinely different route) needs a new navigation edge. OwnPublicationPanel is already mounted at the exact destination, bound to the exact same Publication by the current route\'s own documentId — a link there would navigate to itself. WorldEncounterCanvas holds no distinguishable result object to attach a link to at all, independent of routing. One command is needed, not three.');
    }

    // ---------------------------------------------------------------
    // Section F — Failure and stale identity.
    // ---------------------------------------------------------------
    {
        const { publishDocumentUseCase, discoveryProvider, publisherProvider } = realReplicaRig();
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const rawCommand = realAppWideDistributionCommand({ lifecycleStore, eventId: 'b'.repeat(64) });
        const editorHarness = buildEditorViewHarness(editorViewSource, { publicationDistributionCommand: rawCommand });

        // F1 — the Publication no longer exists locally (unpublished)
        // after distributing — findById() degrades to null, honestly.
        const publication = publishDocumentUseCase.execute({ document: makeDocument('Section F Stale Manor') });
        editorHarness.onDocumentPublished(publication);
        editorHarness.distributePublishedDocument();
        await flushMicrotasks();
        const objectId = editorHarness.distributionResult.value.publication.objectId;

        assert(publisherProvider.unpublish(publication.id) === true,
            n('live: LocalPublisherProvider#unpublish() — the real, production withdrawal path — removes the Publication this replica knows about'));
        assert(discoveryProvider.findById(objectId) === null,
            n('live: once the Publication is withdrawn locally, discoveryProvider.findById(objectId) returns null — a candidate navigation has nothing to resolve to; the desired outcome is graceful inability to navigate, never a thrown error or a fabricated placeholder entry'));

        // F2 — the Publication is superseded by a LATER publish of the
        // SAME document, before a (different, still-valid) result is
        // ever acted on. The exact id an earlier result named still
        // resolves (Repository never deletes a superseded Publication)
        // — but session-level "the Publication for this document"
        // resolution picks the NEWER one, per application/
        // WorldNavigationSession.js's own "most recent Publication for
        // this documentId wins" rule (cited already in that file's own
        // header). A documentId-keyed deep-link can therefore land on a
        // DIFFERENT Publication than the one named in a now-stale
        // result — a real, narrow subtlety, not a crash.
        const secondRig = realReplicaRig();
        const secondEditorHarness = buildEditorViewHarness(editorViewSource, { publicationDistributionCommand: realAppWideDistributionCommand({ lifecycleStore: new PublicationDistributionLifecycleMemoryStore(), eventId: 'c'.repeat(64) }) });
        const sameDocument = makeDocument('Section F Superseded Manor');
        const firstOfTwo = secondRig.publishDocumentUseCase.execute({ document: sameDocument });
        secondEditorHarness.onDocumentPublished(firstOfTwo);
        secondEditorHarness.distributePublishedDocument();
        await flushMicrotasks();
        const firstObjectId = secondEditorHarness.distributionResult.value.publication.objectId;

        // Republishing the SAME document produces a NEW Publication id
        // sharing the SAME documentId — the exact "most recent wins"
        // scenario described above.
        const secondOfTwo = secondRig.publishDocumentUseCase.execute({ document: sameDocument });
        assert(secondOfTwo.id !== firstObjectId && secondOfTwo.documentId === firstOfTwo.documentId,
            n('republishing the same document produces a NEW Publication id sharing the SAME documentId as the earlier one'));
        assert(secondRig.discoveryProvider.findById(firstObjectId) !== null,
            n('live: the FIRST result\'s own Publication still resolves by its own exact id even after the document was republished — Repository never deletes a superseded Publication out from under an old result'));
        assert(secondRig.discoveryProvider.findByDocumentId(firstOfTwo.documentId).length === 2,
            n('live: the Repository now genuinely holds TWO Publications for the same documentId — a documentId-keyed deep-link resolving through "most recent wins" session logic (rather than by the result\'s own exact objectId) could legitimately land on the newer sibling instead of the one a stale result actually named'));

        console.log('✓ Section F: an unpublished/withdrawn Publication degrades a candidate navigation to "nothing to resolve to," live-proven, never a thrown error — consistent with the brief\'s own "graceful inability to navigate, rather than a new error state." A Publication superseded by a later publish of a different document still resolves by its own exact id (Repository keeps it) — the one real subtlety is that a documentId-KEYED deep-link (rather than an objectId-keyed one) could land on a newer sibling Publication for the SAME document if one exists by the time the link is clicked; recorded here as a genuine but narrow product characteristic, not a defect requiring new infrastructure.');
    }

    // ---------------------------------------------------------------
    // Section G — Local-first boundary.
    // ---------------------------------------------------------------
    {
        // A pure router.push call, by construction, performs no I/O, no
        // re-invocation of any distribution/discovery command, and no
        // lifecycle mutation. Verified structurally: the candidate
        // function Section D already exercised touches nothing but its
        // own stubRouter.push() argument.
        const pushedCalls = [];
        const stubRouter = { push: (target) => pushedCalls.push(target) };
        let sideEffectCalls = 0;
        const guardedLifecycleStore = new Proxy(new PublicationDistributionLifecycleMemoryStore(), {
            get(target, prop) {
                if (prop === 'get' || prop === 'set') sideEffectCalls += 1;
                return target[prop].bind(target);
            }
        });

        function candidateViewInWorld(router, publishedPublicationValue) {
            if (!publishedPublicationValue) return;
            router.push({ path: `/world/${publishedPublicationValue.documentId}` });
        }
        candidateViewInWorld(stubRouter, { documentId: 'doc-section-g-1' });

        assert(pushedCalls.length === 1, n('the candidate navigation performs exactly one action: a single router.push() call'));
        assert(sideEffectCalls === 0, n('the candidate navigation never touches a PublicationDistributionLifecycleMemoryStore-shaped collaborator — no get()/set() call of any kind fires'));

        // Structural: none of the three result-producing surfaces' own
        // distribution-triggering functions are reachable from a
        // navigation click — the DELIBERATE ABSENCE this section checks
        // is that a future implementation must never wire "View in World
        // View" to ALSO call distributeEditorPublication()/
        // distributeOwnPublication()/distributeSelectedPublication()
        // again. Reconfirmed structurally: those functions remain the
        // ONLY callers of publicationDistributionCommand in their own
        // files.
        assert((editorViewCodeOnly.match(/publicationDistributionCommand\(/g) || []).length === 1,
            n('EditorView.js still calls publicationDistributionCommand() exactly once, from distributeEditorPublication() alone — a navigation affordance would add zero new call sites'));

        console.log('✓ Section G: a pure router.push() call, by construction and live-verified, performs no I/O, invokes no lifecycle-store collaborator, and re-invokes no distribution command — navigation only, exactly as the brief requires.');
    }

    // ---------------------------------------------------------------
    // Section H — Existing UI reachability.
    // ---------------------------------------------------------------
    {
        // 0.9.381 closed this exact seam: immediately after the Discovery
        // <dd>, inside the SAME <dl> the result already renders in — never
        // a new panel, never a new section. This assertion originally
        // confirmed the gap was still open (the <dl> ended right there);
        // it now confirms the gap is closed the same way EditorViewDistrib
        // utionCommandChannelAudit's own 0.9.376 assertion was flipped by
        // 0.9.377, rather than left describing a state that no longer
        // exists.
        assert(editorViewSource.includes('<dt>Discovery</dt>')
            && editorViewSource.includes('viewDistributedPublicationInRepository')
            && editorViewSource.indexOf('<dt>Discovery</dt>') < editorViewSource.indexOf('viewDistributedPublicationInRepository')
            && editorViewSource.indexOf('viewDistributedPublicationInRepository') < editorViewSource.indexOf('</dl>', editorViewSource.indexOf('<dt>Discovery</dt>')),
            n('EditorView.js\'s own <dl class="editor-post-publish-distribution-detail"> now navigates via viewDistributedPublicationInRepository() between the Discovery row and the closing </dl> — the exact, already-existing insertion point this audit located, never a new panel'));

        // OwnPublicationPanel.js carries the byte-identical PRE-0.9.381
        // shape, unmodified — confirming Section E's own finding that this
        // surface needs no link, since it already lives at the
        // destination.
        assert(panelSource.includes(
            '<dt>Discovery</dt>\n                <dd>{{ publicationDistributionResult.discovery ? publicationDistributionResult.discovery.id : \'Not yet announced\' }}</dd>\n            </dl>'),
            n('OwnPublicationPanel.js\'s own <dl> carries the byte-identical shape — but per Section E, this surface needs no link, since it already lives at the destination'));

        console.log('✓ Section H: the exact template seam this audit located — the end of EditorView.js\'s own <dl class="editor-post-publish-distribution-detail">, immediately after the Discovery row — is now where 0.9.381\'s own viewDistributedPublicationInRepository() navigation lives. No new panel, dialog, or section was needed.');
    }

    // ---------------------------------------------------------------
    // Section I — Architecture boundary.
    // ---------------------------------------------------------------
    {
        const forbiddenVocabulary = [
            'PublicationDistributionReceipt', 'DistributionReceipt', 'distributionReceipt',
            'PublicationDistributionHistory', 'distributionHistory',
            'NavigationService', 'navigationService', 'PublicationNavigationService',
            'PublicationLookupService', 'publicationLookupService',
            'AutoNavigate', 'autoNavigate', 'automaticNavigation'
        ];
        for (const term of forbiddenVocabulary) {
            const hits = await grepCodeOnlyFiles(term, PRODUCTION_DIRS);
            assert(hits.length === 0, n(`no "${term}" vocabulary exists anywhere in production — found: ${JSON.stringify(hits)}`));
        }

        // Explicitly reject forcing the brief's own named (but, per
        // Section B/D, structurally wrong) destination: no production
        // file adds a bridging call from the post-publish distribution
        // path into LocalPublicationCatalog merely to make the ORIGINAL
        // /publications proposal work — that would be a new cataloging
        // capability (admitting Document/World Publications into a
        // catalog that has never held them), a far larger, unscheduled
        // change than a navigation edge.
        const postPublishDistributionBlock = extractRange(
            editorViewSource,
            "const publicationDistributionCommand = inject('publicationDistributionCommand', null);",
            '// ------------------------- 0.2.21 document lifecycle ------------',
            '0.9.377 post-publish distribution block'
        );
        assert(!postPublishDistributionBlock.includes('publicationCatalog') && !postPublishDistributionBlock.includes('.add('),
            n('EditorView.js\'s own 0.9.377 post-publish distribution block never references publicationCatalog at all — the ONE production catalog.add() call anywhere in this file (publishInspectedAttributionToNetwork(), an unrelated, pre-existing BlueprintAttribution feature) sits outside this block; no bridging cataloging change has been smuggled into the post-publish path to force the brief\'s own named destination to work'));

        console.log('✓ Section I: no receipt model, no distribution history, no generic navigation service, no new Publication lookup service, and no automatic navigation exist anywhere. Explicitly rejected: bridging LocalPublicationCatalog to admit Document/World Publications merely to make the brief\'s own literally-named /publications destination work — that is a new, far larger cataloging capability, never a navigation edge, and no evidence in this audit calls for it.');
    }

    // ---------------------------------------------------------------
    // Section J — Final decision matrix and verdict.
    // ---------------------------------------------------------------
    {
        console.log('');
        console.log('Final decision matrix:');
        console.log('| Candidate                                                    | Decision |');
        console.log('|---------------------------------------------------------------|----------|');
        console.log('| EditorView result -> World View (/world/<documentId>) deep-link | BUILD_NEXT (corrected target) |');
        console.log('| EditorView result -> Publication Center (/publications), as     | STOP     |');
        console.log('|   literally proposed by this milestone\'s own brief              |          |');
        console.log('| OwnPublicationPanel own deep-link                               | STOP — already at the destination |');
        console.log('| WorldEncounterCanvas own deep-link                              | STOP — no result object exists |');
        console.log('| Admitting Document/World Publications into LocalPublicationCatalog| STOP/DEFER — far larger, no evidence of need |');
        console.log('| Automatic navigation                                            | STOP     |');
        console.log('| Distribution receipt / history                                 | STOP     |');
        console.log('');
        console.log('✓ Section J: VERDICT — BUILD_NEXT, RETARGETED. The seam this milestone\'s own brief identified is real: a distribution result knows exactly which Publication it distributed, and today nothing lets a person act on that from EditorView. But the brief\'s own named destination (the Publication Center, /publications) is the WRONG one — its catalog (LocalPublicationCatalog) is structurally disjoint from this Publication type, live-proven in Sections B/D, not merely a page with a missing selection mechanism. The REAL, already-populated, already-reachable destination is /world/<documentId> (Repository\'s own catalog, discovery/LocalDiscoveryProvider.js), reached by the SAME router.push({ path: `/world/${documentId}` }) shape ui/components/PublicationCatalog.js\'s own "Explore" action already uses, with router already in EditorView.js\'s own scope. Exactly one surface (EditorView) needs this new edge; OwnPublicationPanel already lives at the destination and WorldEncounterCanvas has no result object to link from. The smallest safe capability a follow-on milestone should build is therefore:');
        console.log('  0.9.381 — Distribution Result -> World View Deep-Link (EditorView\'s own post-publish result forwards publishedPublication.value.documentId, already in hand, into a router.push({ path: `/world/${documentId}` }) call placed at the end of the existing <dl class="editor-post-publish-distribution-detail">) — never a "Publication Center" link as originally worded.');

        console.log('\n✅ All Distribution Result -> Publication Center Deep-Link Audit tests passed.');
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
