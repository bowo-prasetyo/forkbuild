import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

import { composePublicationDistributionCommand } from '../application/PublicationDistributionCommandComposition.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';

// 0.9.381 — EditorView Distribution Result -> Repository Navigation.
//
// 0.9.380's own audit (test-only, BUILD_NEXT, RETARGETED) named a five-
// line scope: forward `publishedPublication.value.documentId` — already
// held by EditorView, never looked up — into a `router.push({ path:
// '/world/' + documentId })` call, placed at the end of the existing
// `<dl class="editor-post-publish-distribution-detail">`. Explicitly NOT
// a "View in Publication Center" link — that audit's own Section B/D
// proved `LocalPublicationCatalog` (the Publication Center's own catalog)
// structurally disjoint from this Publication type. This milestone builds
// exactly the corrected edge:
//
//   EditorView#publishedPublication.value   (existing, unmodified — the
//        │                                    EXACT just-published/
//        │                                    -distributed Publication)
//        │  user clicks "Explore"
//        ▼
//   EditorView#viewDistributedPublicationInRepository()   (NEW — reads
//        │                                                  ONLY
//        │                                                  publishedPublication
//        │                                                  .value.documentId)
//        ▼
//   router.push({ path: `/world/${documentId}` })   (the SAME shape
//                                                      PublicationCatalog.js's
//                                                      own "Explore" action,
//                                                      and this view's own
//                                                      backToWorld()/
//                                                      backFromForkFailure(),
//                                                      already use)
//
// Because ui/views/EditorView.js imports `vue`, this repo's plain
// `node tests/*.test.js` runner cannot `import` it directly — the SAME
// constraint tests/EditorViewPostPublishDistributionAction.test.js
// (0.9.377) and tests/DistributionResultPublicationCenterDeepLinkAudit.
// test.js (0.9.380) already document. This file uses the SAME established
// technique: extract the REAL, CURRENT 0.9.377/0.9.381 block out of
// EditorView.js by marker-to-marker slicing (never hand-retyped), wrap it
// in `new Function(...)` with fake `ref`/`inject` implementations plus a
// spy `router`, and execute it against real and spy collaborators.
//
//   Section A — Exact identity: the navigation target is built from
//               EXACTLY publishedPublication.value.documentId — never
//               title/author/contentHash/distribution-result position.
//   Section B — Successful distribution exposes the navigation action.
//   Section C — Explicit click navigates exactly once.
//   Section D — No automatic navigation: publish and distribution
//               completion never call router.push on their own.
//   Section E — Distribution failure never exposes a misleading
//               successful-result navigation.
//   Section F — Withdrawn/unpublished Publication: missing destination
//               degrades gracefully (no navigation, never a thrown error
//               or an invented error state).
//   Section G — Sequential Publications: Publication A's result cannot
//               navigate to Publication B's document.
//   Section H — Existing Repository route: the generated route is
//               exactly the existing /world/:documentId convention.
//   Section I — Cross-surface regression: OwnPublicationPanel and
//               WorldEncounterCanvas remain unchanged.
//   Section J — Architecture boundary: no Publication Center catalog
//               mutation, no new Publication lookup, no distribution
//               lifecycle modification, no distribution receipt, no
//               navigation abstraction, no automatic navigation, no
//               network request, no provider selection/fallback.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
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
    assert(start !== -1, `${label || startMarker}: start marker located in source`);
    const end = source.indexOf(endMarker, start);
    assert(end !== -1, `${label || startMarker}: end marker located after start`);
    return source.slice(start, end);
}

async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 5; i++) {
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
// LocalDiscoveryProvider — the exact shape ui/main.js's own real app-wide
// composition already uses (both read/write the SAME 'forkbuild-
// publications' storage key).
function realReplicaRig() {
    const storage = new InMemoryStorageProvider();
    const alice = new LocalIdentityProvider(storage);
    alice.login('alice');
    const publisherProvider = new LocalPublisherProvider(storage, new LocalContentStore(storage));
    const discoveryProvider = new LocalDiscoveryProvider(storage);
    const publishDocumentUseCase = new PublishDocumentUseCase(publisherProvider, alice);
    return { storage, alice, publisherProvider, discoveryProvider, publishDocumentUseCase };
}

function realAppWideDistributionCommand({ lifecycleStore, transactionId = 'RepositoryNavTransactionId123456', eventId = 'a'.repeat(64), gatewayHandler, relayHandler }) {
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
            discoveryTag: 'forkbuild-repository-navigation',
            publishImpl: async (relayUrl, eventTemplate) => relay(relayUrl, eventTemplate)
        }
    });
}

// -----------------------------------------------------------------
// Harness — extracts the REAL, CURRENT 0.9.377/0.9.381 block out of
// ui/views/EditorView.js (never hand-retyped) and executes it with fake
// `ref`/`inject` implementations plus a spy `router` object — the block
// itself references `router` as a bare identifier (closed over the outer
// setup() scope in production), so it is supplied here as an explicit
// third parameter to the Function constructor, exactly the way the block
// already receives `inject`/`ref` as parameters rather than true Vue
// imports.
// -----------------------------------------------------------------
function buildHarness(editorViewSource, { publicationDistributionCommand = null, router = { push: () => {} } } = {}) {
    const blockSource = extractRange(
        editorViewSource,
        "const publicationDistributionCommand = inject('publicationDistributionCommand', null);",
        '// ------------------------- 0.2.21 document lifecycle ------------',
        '0.9.377/0.9.381 post-publish distribution block'
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
        'inject', 'ref', 'router',
        `${blockSource}\nreturn {
            publicationDistributionCommand,
            distributeEditorPublication,
            publishedPublication,
            distributionExecuting,
            distributionError,
            distributionResult,
            onDocumentPublished,
            dismissPublishAction,
            distributePublishedDocument,
            viewDistributedPublicationInRepository
        };`
    );
    return factory(inject, ref, router);
}

async function run() {
    const editorViewSource = await readSource('ui/views/EditorView.js');
    const editorViewCodeOnly = codeOnlyLines(editorViewSource);
    const panelSource = await readSource('ui/components/OwnPublicationPanel.js');
    const canvasSource = await readSource('ui/components/WorldEncounterCanvas.js');

    // ---------------------------------------------------------------
    // Section A — Exact identity.
    // ---------------------------------------------------------------
    {
        const { publishDocumentUseCase } = realReplicaRig();
        const pushed = [];
        const router = { push: (target) => pushed.push(target) };
        const harness = buildHarness(editorViewSource, { publicationDistributionCommand: () => Promise.resolve(null), router });

        const publication = publishDocumentUseCase.execute({ document: makeDocument('Section A Manor') });
        harness.onDocumentPublished(publication);
        harness.viewDistributedPublicationInRepository();

        assert(pushed.length === 1, '1. clicking navigates exactly once');
        assert(pushed[0].path === `/world/${publication.documentId}`,
            '2. the navigation target is built from EXACTLY publishedPublication.value.documentId — the real Publication.documentId, never a reconstructed equivalent');
        assert(!('title' in pushed[0]) && !('author' in pushed[0]) && !('contentHash' in pushed[0]) && !('query' in pushed[0]),
            '3. the pushed target carries only { path } — no title, author, contentHash, or query-string identity of any kind');

        console.log('✓ Section A: the navigation target uses the exact Publication.documentId, never title/author/contentHash/distribution-result position.');
    }

    // ---------------------------------------------------------------
    // Section B — Successful distribution exposes the navigation action.
    // ---------------------------------------------------------------
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const rawCommand = realAppWideDistributionCommand({ lifecycleStore, eventId: 'b'.repeat(64) });
        const { publishDocumentUseCase } = realReplicaRig();
        const router = { push: () => {} };
        const harness = buildHarness(editorViewSource, { publicationDistributionCommand: rawCommand, router });

        const publication = publishDocumentUseCase.execute({ document: makeDocument('Section B Manor') });
        assert(publication.documentId, '4. a real publish produces a Publication carrying a real documentId');

        harness.onDocumentPublished(publication);
        // Before distributing, the action is reachable (Distribute now),
        // but there is no distributionResult yet — the "Explore" row is
        // template-gated on `publishedPublication` alone (see Section H's
        // own template assertion below), not on distributionResult, so
        // the navigation itself is available as soon as publishedPublication
        // is set — mirroring the fact that the Publication already exists
        // in the Repository the instant it is published, independent of
        // whether it has since been distributed.
        assert(harness.publishedPublication.value === publication,
            '5. before distributing, publishedPublication already holds the real, just-published Publication');

        harness.distributePublishedDocument();
        await flushMicrotasks();

        assert(harness.distributionError.value === null && harness.distributionResult.value !== null,
            '6. distribution succeeds through the real orchestrator/executor/lifecycle chain');
        assert(harness.publishedPublication.value === publication,
            '7. after a successful distribution, publishedPublication is still the exact same Publication — the navigation target is unaffected by distribution succeeding');

        console.log('✓ Section B: a successful publish (and, further, a successful distribution) leaves publishedPublication holding the real Publication the navigation action targets.');
    }

    // ---------------------------------------------------------------
    // Section C — Explicit click navigates exactly once.
    // ---------------------------------------------------------------
    {
        const { publishDocumentUseCase } = realReplicaRig();
        const pushed = [];
        const router = { push: (target) => pushed.push(target) };
        const harness = buildHarness(editorViewSource, { publicationDistributionCommand: () => Promise.resolve(null), router });

        const publication = publishDocumentUseCase.execute({ document: makeDocument('Section C Manor') });
        harness.onDocumentPublished(publication);

        harness.viewDistributedPublicationInRepository();
        harness.viewDistributedPublicationInRepository();
        harness.viewDistributedPublicationInRepository();

        assert(pushed.length === 3, '8. each explicit click navigates exactly once — three clicks produce three router.push calls, never deduplicated or debounced into fewer');
        assert(pushed.every((call) => call.path === `/world/${publication.documentId}`),
            '9. every one of those calls targets the exact same document — repeated clicks are idempotent in TARGET, not merged into a single navigation');

        console.log('✓ Section C: clicking the navigation action navigates exactly once per click, always to the exact same Publication.documentId.');
    }

    // ---------------------------------------------------------------
    // Section D — No automatic navigation.
    // ---------------------------------------------------------------
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const rawCommand = realAppWideDistributionCommand({ lifecycleStore, eventId: 'd'.repeat(64) });
        const { publishDocumentUseCase } = realReplicaRig();
        const pushed = [];
        const router = { push: (target) => pushed.push(target) };
        const harness = buildHarness(editorViewSource, { publicationDistributionCommand: rawCommand, router });

        const publication = publishDocumentUseCase.execute({ document: makeDocument('Section D Manor') });
        harness.onDocumentPublished(publication);
        assert(pushed.length === 0, '10. publishing alone never navigates — onDocumentPublished() calls router.push() zero times');

        harness.distributePublishedDocument();
        await flushMicrotasks();
        assert(harness.distributionResult.value !== null, '11. sanity: distribution actually completed');
        assert(pushed.length === 0, '12. a completed distribution never navigates automatically either — router.push() is called zero times until the user explicitly clicks the navigation action');

        harness.dismissPublishAction();
        assert(pushed.length === 0, '13. dismissing the action never navigates');

        console.log('✓ Section D: neither publishing nor a completed distribution ever calls router.push() on its own — navigation happens only on an explicit click.');
    }

    // ---------------------------------------------------------------
    // Section E — Distribution failure never exposes a misleading
    // successful-result navigation.
    // ---------------------------------------------------------------
    {
        const failingCommand = () => Promise.reject(new Error('distribution boom'));
        const { publishDocumentUseCase } = realReplicaRig();
        const pushed = [];
        const router = { push: (target) => pushed.push(target) };
        const harness = buildHarness(editorViewSource, { publicationDistributionCommand: failingCommand, router });

        const publication = publishDocumentUseCase.execute({ document: makeDocument('Section E Manor') });
        harness.onDocumentPublished(publication);
        harness.distributePublishedDocument();
        await flushMicrotasks();

        assert(harness.distributionError.value !== null && harness.distributionResult.value === null,
            '14. sanity: distribution genuinely failed — the existing generic failure vocabulary is preserved, untouched by this milestone');
        assert(pushed.length === 0, '15. a failed distribution never triggers navigation on its own — this milestone adds no auto-navigate-on-failure or auto-navigate-on-success behavior');

        // The navigation action itself is independent of distributionResult
        // — publishedPublication is still the real, valid Publication (it
        // was successfully PUBLISHED; only DISTRIBUTION failed), so a click
        // still resolves to the real Publication, never to a synthesized
        // "failed result" placeholder.
        harness.viewDistributedPublicationInRepository();
        assert(pushed.length === 1 && pushed[0].path === `/world/${publication.documentId}`,
            '16. a click after a failed DISTRIBUTION still navigates to the real, already-published Publication — publish success and distribution success are independent facts, and navigation only ever depends on the former');

        console.log('✓ Section E: a failed distribution neither auto-navigates nor exposes a misleading result — the existing generic failure vocabulary is untouched, and an explicit click still resolves to the real, already-published Publication.');
    }

    // ---------------------------------------------------------------
    // Section F — Withdrawn/unpublished: missing destination degrades
    // gracefully.
    // ---------------------------------------------------------------
    {
        const { publishDocumentUseCase, discoveryProvider, publisherProvider } = realReplicaRig();
        const pushed = [];
        const router = { push: (target) => pushed.push(target) };
        const harness = buildHarness(editorViewSource, { publicationDistributionCommand: () => Promise.resolve(null), router });

        const publication = publishDocumentUseCase.execute({ document: makeDocument('Section F Manor') });
        harness.onDocumentPublished(publication);

        assert(publisherProvider.unpublish(publication.id) === true,
            '17. live: LocalPublisherProvider#unpublish() — the real, production withdrawal path — removes the Publication this replica knows about');
        assert(discoveryProvider.findById(publication.id) === null,
            '18. live: the Repository can no longer resolve the withdrawn Publication by id');

        // The candidate rule this milestone follows: "documentId available
        // -> navigate; no usable destination -> no navigation action." The
        // Publication object itself (held in publishedPublication, never
        // re-fetched from the Repository) still carries its own documentId
        // verbatim — EditorView never re-resolves the Publication through
        // discoveryProvider before navigating, so navigation itself never
        // throws even though the destination page it lands on would now
        // show nothing for this Publication. This is the exact honest
        // characterization 0.9.380's own Section F drew: graceful inability
        // to resolve AT THE DESTINATION, never a thrown error IN the
        // navigation call itself.
        let threw = false;
        try {
            harness.viewDistributedPublicationInRepository();
        } catch (e) {
            threw = true;
        }
        assert(threw === false, '19. navigating after the Publication was withdrawn never throws');
        assert(pushed.length === 1 && pushed[0].path === `/world/${publication.documentId}`,
            '20. the navigation call itself still fires — it is pure routing built from already-held identity, with no re-resolution step that could fail; any "nothing here" outcome is the destination WorldView\'s own existing empty-state handling, not a new error state this milestone invents');

        // A publication with no documentId at all (defensive: every real
        // Publication carries one, but the guard exists precisely for a
        // malformed/partial object) produces no navigation action at all.
        const pushed2 = [];
        const router2 = { push: (target) => pushed2.push(target) };
        const harness2 = buildHarness(editorViewSource, { publicationDistributionCommand: () => Promise.resolve(null), router: router2 });
        harness2.onDocumentPublished({ documentId: null });
        harness2.viewDistributedPublicationInRepository();
        assert(pushed2.length === 0, '21. with no usable documentId, the navigation call is a silent no-op — never a thrown error, never an invented error state');

        console.log('✓ Section F: an unpublished/withdrawn Publication\'s navigation call still fires safely (pure routing, no re-resolution); a Publication with no usable documentId at all produces no navigation action, silently — never a thrown error or a new error state.');
    }

    // ---------------------------------------------------------------
    // Section G — Sequential Publications: A cannot navigate to B.
    // ---------------------------------------------------------------
    {
        const { publishDocumentUseCase } = realReplicaRig();
        const pushed = [];
        const router = { push: (target) => pushed.push(target) };
        const harness = buildHarness(editorViewSource, { publicationDistributionCommand: () => Promise.resolve(null), router });

        const publicationA = publishDocumentUseCase.execute({ document: makeDocument('Section G Manor A') });
        harness.onDocumentPublished(publicationA);
        harness.viewDistributedPublicationInRepository();
        assert(pushed.length === 1 && pushed[0].path === `/world/${publicationA.documentId}`,
            '22. Publication A\'s own result navigates to A\'s own documentId');

        const publicationB = publishDocumentUseCase.execute({ document: makeDocument('Section G Manor B') });
        harness.onDocumentPublished(publicationB);
        harness.viewDistributedPublicationInRepository();
        assert(pushed.length === 2 && pushed[1].path === `/world/${publicationB.documentId}`,
            '23. after publishing B, the SAME action now navigates to B\'s own documentId — a later publish replaces the target wholesale, exactly as onDocumentPublished()\'s own header already documents for distribution');
        assert(publicationA.documentId !== publicationB.documentId,
            '24. sanity: A and B are genuinely different documents');
        assert(pushed[0].path !== pushed[1].path,
            '25. Publication A\'s own earlier navigation call is never retroactively altered, and Publication B\'s navigation never reuses A\'s target — there is no "last document" global lookup involved');

        console.log('✓ Section G: each Publication\'s navigation targets exactly its own documentId; a later publish replaces the action\'s target wholesale, and an earlier click\'s already-recorded target is never mutated.');
    }

    // ---------------------------------------------------------------
    // Section H — Existing Repository route.
    // ---------------------------------------------------------------
    {
        const routerCode = await readSource('ui/router/index.js');
        assert(routerCode.includes("path: '/world/:documentId', name: 'world', component: WorldView"),
            '26. the generated route is exactly the existing, already-registered /world/:documentId convention — no new route is added anywhere');

        const publicationCatalogSource = await readSource('ui/components/PublicationCatalog.js');
        assert(publicationCatalogSource.includes('router.push({ path: `/world/${pub.documentId}` });'),
            '27. PublicationCatalog.js\'s own "Explore" action already uses the IDENTICAL { path: `/world/${documentId}` } shape this milestone\'s own viewDistributedPublicationInRepository() uses — one shared convention, not two independently invented ones');

        assert(editorViewCodeOnly.includes('function viewDistributedPublicationInRepository()'),
            '28. EditorView.js defines the new navigation function');
        assert(editorViewCodeOnly.includes('router.push({ path: `/world/${publication.documentId}` });'),
            '29. it pushes the exact `/world/${documentId}` shape, matching PublicationCatalog.js\'s own convention byte-for-byte in structure');

        // The template seam: the row lives inside the SAME
        // <dl class="editor-post-publish-distribution-detail">, immediately
        // after the existing Discovery row — never a new panel.
        const dlBlock = extractRange(editorViewSource,
            '<dl v-else-if="distributionResult" class="editor-post-publish-distribution-detail">',
            '</dl>',
            'editor-post-publish-distribution-detail dl');
        assert(dlBlock.includes('<dt>Discovery</dt>') && dlBlock.includes('viewDistributedPublicationInRepository'),
            '30. the navigation action is rendered inside the SAME <dl> the distribution result already renders in, after the existing Discovery row — no new panel or section was introduced');
        assert(!editorViewSource.includes('class="repository-navigation-panel"') && !editorViewSource.includes('<RepositoryNavigation'),
            '31. no new panel/dialog/component was introduced for this — the action is a plain button inside the existing result <dl>');

        console.log('✓ Section H: the generated route is exactly the existing /world/:documentId convention, reached through the SAME { path: `/world/${documentId}` } shape PublicationCatalog.js\'s own "Explore" action already uses, rendered inside the existing result <dl> with no new panel.');
    }

    // ---------------------------------------------------------------
    // Section I — Cross-surface regression.
    // ---------------------------------------------------------------
    {
        assert(!panelSource.includes('viewDistributedPublicationInRepository') && !panelSource.includes('/world/${'),
            '32. OwnPublicationPanel.js is completely unmodified by this milestone — no navigation edge was added there, consistent with 0.9.380\'s own Section E finding that this surface already lives at the destination');
        assert(!panelSource.includes('router.push') && !/useRouter|useRoute/.test(panelSource),
            '33. OwnPublicationPanel.js still carries no router dependency of any kind');

        assert(canvasSource.includes('PLAIN NOTICE') && canvasSource.includes('NEVER A RECLASSIFIED DOMAIN RESULT'),
            '34. WorldEncounterCanvas.js\'s own header still holds "PLAIN NOTICE — NEVER A RECLASSIFIED DOMAIN RESULT" — unchanged');
        assert(!canvasSource.includes('distributionResult') && !canvasSource.includes('viewDistributedPublicationInRepository'),
            '35. WorldEncounterCanvas.js declares no distributionResult and no navigation edge of any kind — unchanged');

        // Live regression: the existing Publication Distribution and
        // post-publish action test files still pass, run as real
        // subprocesses — never merely re-imported and trusted.
        const regressionFiles = [
            'tests/EditorViewPostPublishDistributionAction.test.js',
            'tests/EditorViewDistributionCommandChannelAudit.test.js',
            'tests/PostPublishDistributionActionConvergenceAudit.test.js',
            'tests/DistributionResultPublicationCenterDeepLinkAudit.test.js',
            'tests/PostDistributionProductEvolutionReassessment.test.js'
        ];
        for (const file of regressionFiles) {
            const result = execFileSync(process.execPath, [file], { cwd: SOURCE_ROOT.pathname, encoding: 'utf8' });
            assert(result.includes('✅'), `36+. live regression: ${file} still passes unmodified in behavior (only its own gap-confirming assertions were flipped to gap-closed, per this codebase's own established precedent — see 0.9.377's own identical treatment of 0.9.376)`);
        }

        console.log('✓ Section I: OwnPublicationPanel.js and WorldEncounterCanvas.js remain completely unchanged; five related existing test files still pass live, as real subprocesses.');
    }

    // ---------------------------------------------------------------
    // Section J — Architecture boundary.
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
            assert(hits.length === 0, `no "${term}" vocabulary exists anywhere in production — found: ${JSON.stringify(hits)}`);
        }

        // No Publication Center catalog mutation, no new Publication
        // lookup, no distribution lifecycle modification, no distribution
        // receipt: the navigation block itself never references
        // publicationCatalog/findPublicationUseCase/PublicationDistribution
        // Lifecycle-shaped collaborators.
        const navigationBlock = extractRange(
            editorViewCodeOnly,
            'function viewDistributedPublicationInRepository()',
            '\n        }',
            'viewDistributedPublicationInRepository() body'
        );
        assert(!navigationBlock.includes('publicationCatalog') && !navigationBlock.includes('.add('),
            'the navigation function never references publicationCatalog or calls .add() on anything — no Publication Center catalog mutation');
        assert(!navigationBlock.includes('findPublicationUseCase') && !navigationBlock.includes('discoveryProvider'),
            'the navigation function performs no new Publication lookup — it reads only the already-held publishedPublication.value');
        assert(!navigationBlock.includes('LifecycleStore') && !navigationBlock.includes('distributionRequestId'),
            'the navigation function never touches the distribution lifecycle or its own request-id staleness guard — those remain distributePublishedDocument()\'s concern alone');
        assert(navigationBlock.match(/router\.push/g).length === 1,
            'the navigation function performs exactly one router.push() call — no navigation abstraction/service wraps it');
        assert(!navigationBlock.includes('setTimeout') && !navigationBlock.includes('watch(') && !navigationBlock.includes('onMounted'),
            'no automatic navigation is wired anywhere — no timer, watcher, or mount hook triggers router.push() on its own');
        assert(!navigationBlock.includes('fetch(') && !navigationBlock.includes('await ') && !navigationBlock.includes('.then('),
            'the navigation function performs no network request and no async work of any kind — pure, synchronous routing');
        assert(!navigationBlock.includes('providerId') && !navigationBlock.includes('provider ='),
            'no provider selection or fallback logic exists in the navigation function');

        console.log('✓ Section J: no Publication Center catalog mutation, no new Publication lookup, no distribution lifecycle modification, no distribution receipt, no navigation abstraction, no automatic navigation, no network request, and no provider selection/fallback exist anywhere in the new navigation function.');
    }

    console.log('\n✅ All EditorView Distribution Result -> Repository Navigation tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
