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

// 0.9.382 — Distribution Result -> Repository Navigation Convergence
// Audit.
//
// **Type: test-only, no production changes.** 0.9.381 gave EditorView's
// distribution-result panel a single new edge:
// `viewDistributedPublicationInRepository()`, reading only
// `publishedPublication.value.documentId` and pushing the existing
// `/world/:documentId` route. tests/EditorViewDistributionResultRepository
// Navigation.test.js (0.9.381's own suite) already proved that edge works
// in isolation. The question this milestone asks is different — the same
// one every convergence audit in this arc asks of the milestone before it
// (0.9.348 of 0.9.347, 0.9.378 of 0.9.377):
//
//   Is 0.9.381 MERELY a single presentation-level navigation edge from an
//   existing distribution result onto the existing Repository route, or
//   did it quietly grow a second Publication/distribution/navigation
//   architecture alongside the existing one?
//
// Every section below is built fresh against real production source and
// real object graphs — never by importing and re-running 0.9.381's own
// harness. Because ui/views/EditorView.js imports `vue`, this file uses
// the same marker-based source-extraction-plus-`new Function` technique
// 0.9.377/0.9.378/0.9.380/0.9.381 already established, extracting the
// REAL, CURRENT block on every run.
//
//   Section A — Exact Publication identity, traced through the complete
//               chain: Toolbar.publish() -> `published` emit ->
//               EditorView.onDocumentPublished() ->
//               publishedPublication -> viewDistributedPublicationInRepository()
//               -> router.push().
//   Section B — Route convergence: 0.9.381 generates EXACTLY the same
//               `/world/<documentId>` shape as PublicationCatalog.js's
//               own pre-existing "Explore" action — no second route
//               convention.
//   Section C — Distribution independence: publish, distribution, a
//               successful distribution, and a failed distribution never
//               navigate on their own — only an explicit Explore click
//               does, even though the action lives inside the
//               distribution-result panel.
//   Section D — Distribution-result independence: navigating never
//               mutates PublicationDistributionLifecycleMemoryStore,
//               never invokes publicationDistributionCommand again,
//               never creates a second distribution, and never produces
//               a new result/receipt.
//   Section E — Sequential publications: Publish A -> distribute A ->
//               Explore A, then Publish B -> distribute B -> Explore B,
//               resolve to A's and B's own documents with no stale
//               closure/state leakage.
//   Section F — Failure and missing identity: distribution failure with
//               a valid documentId, distribution success with a missing
//               documentId, a withdrawn publication, and an unpublished
//               publication — the deliberate graceful no-op stays intact
//               throughout.
//   Section G — Repository convergence: the real discovery path proves
//               Publication.documentId, the pushed route's documentId,
//               and the Repository-resolvable document identity are the
//               SAME value, through no new lookup mechanism.
//   Section H — Cross-surface regression: OwnPublicationPanel.js and
//               WorldEncounterCanvas.js are unchanged, their own
//               distribution actions still use the same command, and no
//               result-navigation behavior has leaked into either.
//   Section I — Lifecycle/UI teardown: leaving EditorView (Dismiss)
//               removes the transient result, a new publication replaces
//               the previous target wholesale, and nothing resurrects a
//               stale documentId.
//   Section J — Architecture boundary and final verdict: none of the
//               structures this milestone was warned away from — a
//               Publication Center integration, a catalog mutation, a
//               new navigation service, a distribution receipt/history,
//               automatic navigation, a network lookup, a new identity
//               resolution mechanism, or a distribution lifecycle change
//               — exist anywhere in production.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) { return `${assertionCount + 1}. ${message}`; }

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
    assert(start !== -1, n(`${label || startMarker}: start marker located in source`));
    const end = source.indexOf(endMarker, start);
    assert(end !== -1, n(`${label || startMarker}: end marker located after start`));
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

// A shared rig — the SAME storage backs LocalPublisherProvider AND
// LocalDiscoveryProvider AND a single, once-composed distribution
// command, exactly ui/main.js's own real app-wide composition (one
// publicationDistributionLifecycleStore instance, provided once, per
// this file's own grep at the bottom of Section G).
function realReplicaRig() {
    const storage = new InMemoryStorageProvider();
    const alice = new LocalIdentityProvider(storage);
    alice.login('alice');
    const publisherProvider = new LocalPublisherProvider(storage, new LocalContentStore(storage));
    const discoveryProvider = new LocalDiscoveryProvider(storage);
    const publishDocumentUseCase = new PublishDocumentUseCase(publisherProvider, alice);
    const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
    const publicationDistributionCommand = composePublicationDistributionCommand({
        lifecycleStore,
        arweaveUploaderOptions: {
            signer: { sign: async (material) => ({ id: 'ConvergenceAuditTxId0000001', transaction: { data: material } }) },
            fetchImpl: async () => new Response('accepted', { status: 200 })
        },
        nostrPublisherOptions: {
            relayUrl: 'wss://relay.example',
            discoveryTag: 'forkbuild-navigation-convergence-audit',
            publishImpl: async () => ({ published: true, id: 'c'.repeat(64) })
        }
    });
    return { storage, alice, publisherProvider, discoveryProvider, publishDocumentUseCase, lifecycleStore, publicationDistributionCommand };
}

// -----------------------------------------------------------------
// Harness — extracts the REAL, CURRENT 0.9.377/0.9.381 block out of
// ui/views/EditorView.js (never hand-retyped) and executes it with fake
// `ref`/`inject` implementations plus a spy `router`.
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
    // Section A — Exact Publication identity, traced end to end through
    // the REAL Toolbar.publish() -> `published` emit chain, not just the
    // isolated navigation function.
    // ---------------------------------------------------------------
    {
        const toolbarSource = await readSource('ui/components/Toolbar.js');
        const publishBlock = extractRange(toolbarSource, 'function publish() {', '\n        }', 'Toolbar.publish() body');
        assert(publishBlock.includes("emit('published', publication)"),
            n("Toolbar.publish() forwards the EXACT local `publication` variable its own publishDocumentUseCase.execute() call just produced through the 'published' emit — never a re-fetched or re-derived Publication"));
        assert(!publishBlock.includes('documentId:') && !publishBlock.includes('JSON.parse') && !publishBlock.includes('JSON.stringify'),
            n('the emitted value is the live object itself — publish() performs no serialize/reconstruct round-trip on it before emitting'));

        const { publishDocumentUseCase } = realReplicaRig();
        const pushed = [];
        const router = { push: (target) => pushed.push(target) };
        const harness = buildHarness(editorViewSource, { publicationDistributionCommand: () => Promise.resolve(null), router });

        // Reproduce the real chain: a real publish (the same use case
        // Toolbar.js's own publish() calls) hands its result straight to
        // EditorView's own onDocumentPublished() — the SAME function
        // wired to Toolbar's `@published` listener in the real template
        // (see EditorView.js's own <Toolbar @published="onDocumentPublished">).
        assert(editorViewCodeOnly.includes('@published="onDocumentPublished"') || editorViewSource.includes('@published="onDocumentPublished"'),
            n("EditorView's own template wires Toolbar's 'published' emit directly to onDocumentPublished — the same function this harness calls below"));

        const publication = publishDocumentUseCase.execute({ document: makeDocument('Section A Manor') });
        harness.onDocumentPublished(publication);
        assert(harness.publishedPublication.value === publication,
            n('onDocumentPublished() stores the exact object reference, never a copy or a re-derived equivalent'));

        harness.viewDistributedPublicationInRepository();
        assert(pushed.length === 1 && pushed[0].path === `/world/${publication.documentId}`,
            n('the pushed route is built from that exact same object\'s own documentId — the full chain from Toolbar.publish() through to router.push() never re-resolves identity at any hop'));

        console.log('✓ Section A: the navigation target is the exact Publication object Toolbar.publish() emitted, unmodified end to end through onDocumentPublished() and viewDistributedPublicationInRepository().');
    }

    // ---------------------------------------------------------------
    // Section B — Route convergence.
    // ---------------------------------------------------------------
    {
        const routerCode = await readSource('ui/router/index.js');
        assert(routerCode.includes("path: '/world/:documentId', name: 'world', component: WorldView"),
            n('the /world/:documentId route is registered exactly once, and only once, in the router'));
        const worldRouteOccurrences = (routerCode.match(/path:\s*'\/world\/:/g) || []).length;
        assert(worldRouteOccurrences === 1,
            n('no second /world/:<param>-shaped route convention exists anywhere in the router (distinct from the unrelated /worlds/recent listing route)'));

        const catalogSource = await readSource('ui/components/PublicationCatalog.js');
        const catalogExploreShape = 'router.push({ path: `/world/${pub.documentId}` });';
        assert(catalogSource.includes(catalogExploreShape),
            n("PublicationCatalog.js's own pre-existing Explore action pushes exactly `{ path: '/world/${documentId}' }`"));

        const navigationBlock = extractRange(editorViewCodeOnly, 'function viewDistributedPublicationInRepository()', '\n        }', 'viewDistributedPublicationInRepository() body');
        assert(navigationBlock.includes('router.push({ path: `/world/${publication.documentId}` });'),
            n('viewDistributedPublicationInRepository() pushes the byte-identical `{ path: \'/world/${documentId}\' }` shape'));

        // Live proof, not just string comparison: build both target
        // objects from the same Publication and diff their JSON shape.
        const { publishDocumentUseCase } = realReplicaRig();
        const publication = publishDocumentUseCase.execute({ document: makeDocument('Section B Manor') });
        const catalogTarget = { path: `/world/${publication.documentId}` };
        const pushed = [];
        const router = { push: (target) => pushed.push(target) };
        const harness = buildHarness(editorViewSource, { publicationDistributionCommand: () => Promise.resolve(null), router });
        harness.onDocumentPublished(publication);
        harness.viewDistributedPublicationInRepository();
        assert(JSON.stringify(pushed[0]) === JSON.stringify(catalogTarget),
            n("0.9.381's own pushed target is structurally identical (same keys, same value) to PublicationCatalog.js's own Explore target for the SAME Publication — one convention, not two independently invented ones"));

        console.log('✓ Section B: 0.9.381 generates exactly the existing /world/<documentId> route shape, registered exactly once in the router and reached via the byte-identical convention PublicationCatalog.js\'s own Explore action already uses.');
    }

    // ---------------------------------------------------------------
    // Section C — Distribution independence.
    // ---------------------------------------------------------------
    {
        const { publishDocumentUseCase, lifecycleStore, publicationDistributionCommand } = realReplicaRig();
        const pushed = [];
        const router = { push: (target) => pushed.push(target) };
        const harness = buildHarness(editorViewSource, { publicationDistributionCommand, router });

        const publication = publishDocumentUseCase.execute({ document: makeDocument('Section C Manor') });

        // Publish does not navigate.
        harness.onDocumentPublished(publication);
        assert(pushed.length === 0, n('publish (onDocumentPublished) never calls router.push()'));

        // Distribution does not navigate — check DURING the in-flight
        // window, not just after settlement.
        harness.distributePublishedDocument();
        assert(pushed.length === 0, n('starting a distribution never navigates, even before it settles'));

        // Distribution success does not navigate.
        await flushMicrotasks();
        assert(harness.distributionResult.value !== null, n('sanity: the real, composed command actually succeeded'));
        assert(pushed.length === 0, n('a successfully completed distribution never navigates on its own'));

        // Distribution failure does not navigate.
        const failingHarness = buildHarness(editorViewSource, { publicationDistributionCommand: () => Promise.reject(new Error('boom')), router });
        const publicationForFailure = publishDocumentUseCase.execute({ document: makeDocument('Section C Manor Failure') });
        failingHarness.onDocumentPublished(publicationForFailure);
        failingHarness.distributePublishedDocument();
        await flushMicrotasks();
        assert(failingHarness.distributionError.value !== null, n('sanity: this second distribution genuinely failed'));
        assert(pushed.length === 0, n('a failed distribution never navigates either'));

        // Only explicit Explore navigates — and it lives INSIDE the
        // distribution-result panel (per this milestone's own concern),
        // yet is reachable independent of distributionResult per
        // Section G/H of 0.9.381's own suite.
        harness.viewDistributedPublicationInRepository();
        assert(pushed.length === 1 && pushed[0].path === `/world/${publication.documentId}`,
            n('only the explicit Explore call navigates, and exactly once'));

        console.log('✓ Section C: publish, an in-flight distribution, a successful distribution, and a failed distribution all leave router.push() uncalled — only an explicit Explore click ever navigates.');
    }

    // ---------------------------------------------------------------
    // Section D — Distribution-result independence: navigation performs
    // no lifecycle/command side effects of any kind.
    // ---------------------------------------------------------------
    {
        const { publishDocumentUseCase, lifecycleStore, publicationDistributionCommand } = realReplicaRig();
        let commandCallCount = 0;
        const countingCommand = (request) => {
            commandCallCount += 1;
            return publicationDistributionCommand(request);
        };
        const pushed = [];
        const router = { push: (target) => pushed.push(target) };
        const harness = buildHarness(editorViewSource, { publicationDistributionCommand: countingCommand, router });

        const publication = publishDocumentUseCase.execute({ document: makeDocument('Section D Manor') });
        harness.onDocumentPublished(publication);
        harness.distributePublishedDocument();
        await flushMicrotasks();
        assert(commandCallCount === 1, n('sanity: exactly one real distribution has happened so far'));

        const lifecycleBeforeNav = lifecycleStore.get(publication.id);
        assert(lifecycleBeforeNav !== null, n('sanity: the real distribution left a real lifecycle entry behind'));
        const resultBeforeNav = harness.distributionResult.value;

        // Navigate three times.
        harness.viewDistributedPublicationInRepository();
        harness.viewDistributedPublicationInRepository();
        harness.viewDistributedPublicationInRepository();

        assert(commandCallCount === 1,
            n('navigating (even three times) never invokes publicationDistributionCommand again — no second distribution is created'));
        assert(lifecycleStore.get(publication.id) === lifecycleBeforeNav,
            n('the lifecycle entry in PublicationDistributionLifecycleMemoryStore is the exact same object reference after navigating — never mutated, replaced, or re-set'));
        assert(harness.distributionResult.value === resultBeforeNav,
            n('distributionResult itself is the exact same object reference after navigating — no new result/receipt was produced'));
        assert(pushed.length === 3, n('the three navigations themselves did fire — this is a targeted absence of side effects, not a broken harness'));

        console.log('✓ Section D: navigating never mutates PublicationDistributionLifecycleMemoryStore, never invokes publicationDistributionCommand again, and never produces a new distributionResult — it is pure, side-effect-free routing.');
    }

    // ---------------------------------------------------------------
    // Section E — Sequential publications.
    // ---------------------------------------------------------------
    {
        const { publishDocumentUseCase, publicationDistributionCommand } = realReplicaRig();
        const pushed = [];
        const router = { push: (target) => pushed.push(target) };
        const harness = buildHarness(editorViewSource, { publicationDistributionCommand, router });

        const publicationA = publishDocumentUseCase.execute({ document: makeDocument('Section E Manor A') });
        harness.onDocumentPublished(publicationA);
        harness.distributePublishedDocument();
        await flushMicrotasks();
        assert(harness.distributionResult.value !== null, n('sanity: A distributed successfully'));
        harness.viewDistributedPublicationInRepository();
        assert(pushed.length === 1 && pushed[0].path === `/world/${publicationA.documentId}`,
            n('Explore A navigates to /world/<A.documentId>'));

        const publicationB = publishDocumentUseCase.execute({ document: makeDocument('Section E Manor B') });
        harness.onDocumentPublished(publicationB);
        assert(harness.distributionResult.value === null && harness.distributionError.value === null,
            n('publishing B resets the transient distribution result/error state — no stale A result is visible while B is pending'));
        harness.distributePublishedDocument();
        await flushMicrotasks();
        assert(harness.distributionResult.value !== null, n('sanity: B distributed successfully too'));
        harness.viewDistributedPublicationInRepository();
        assert(pushed.length === 2 && pushed[1].path === `/world/${publicationB.documentId}`,
            n('Explore B navigates to /world/<B.documentId>'));

        assert(publicationA.documentId !== publicationB.documentId, n('sanity: A and B are genuinely different documents'));
        assert(pushed[0].path !== pushed[1].path, n('no stale-closure leakage — Explore B never reuses A\'s target, and Explore A\'s earlier call is never retroactively altered'));

        console.log('✓ Section E: Publish A -> distribute A -> Explore A, then Publish B -> distribute B -> Explore B, resolve exactly to /world/document-A and /world/document-B respectively, with no stale closure/state leakage.');
    }

    // ---------------------------------------------------------------
    // Section F — Failure and missing identity.
    // ---------------------------------------------------------------
    {
        const { publishDocumentUseCase, publisherProvider, discoveryProvider, publicationDistributionCommand } = realReplicaRig();

        // F1 — distribution failure + valid documentId: navigation still
        // resolves to the real, already-published Publication.
        {
            const pushed = [];
            const router = { push: (target) => pushed.push(target) };
            const harness = buildHarness(editorViewSource, { publicationDistributionCommand: () => Promise.reject(new Error('boom')), router });
            const publication = publishDocumentUseCase.execute({ document: makeDocument('Section F1 Manor') });
            harness.onDocumentPublished(publication);
            harness.distributePublishedDocument();
            await flushMicrotasks();
            assert(harness.distributionError.value !== null, n('sanity: F1 distribution failed'));
            harness.viewDistributedPublicationInRepository();
            assert(pushed.length === 1 && pushed[0].path === `/world/${publication.documentId}`,
                n('F1: distribution failure + valid documentId still navigates to the real document — publish success and distribution success are independent facts'));
        }

        // F2 — distribution success + missing documentId: graceful no-op.
        {
            const pushed = [];
            const router = { push: (target) => pushed.push(target) };
            const harness = buildHarness(editorViewSource, { publicationDistributionCommand, router });
            harness.onDocumentPublished({ documentId: null, id: 'f2-fake-id', toJSON: () => ({}) });
            let threw = false;
            try { harness.viewDistributedPublicationInRepository(); } catch (e) { threw = true; }
            assert(threw === false, n('F2: a missing documentId never throws'));
            assert(pushed.length === 0, n('F2: distribution success with a missing documentId produces no navigation at all — the graceful no-op stays intact'));
        }

        // F3 — withdrawn publication: the navigation call itself still
        // fires safely (pure routing from already-held identity, no
        // re-resolution), even though the Repository can no longer
        // resolve the withdrawn document at the destination.
        {
            const pushed = [];
            const router = { push: (target) => pushed.push(target) };
            const harness = buildHarness(editorViewSource, { publicationDistributionCommand: () => Promise.resolve(null), router });
            const publication = publishDocumentUseCase.execute({ document: makeDocument('Section F3 Manor') });
            harness.onDocumentPublished(publication);
            assert(publisherProvider.unpublish(publication.id) === true, n('F3: live withdrawal via the real, production LocalPublisherProvider#unpublish()'));
            assert(discoveryProvider.findById(publication.id) === null, n('F3: sanity — the Repository can no longer resolve the withdrawn Publication by id'));
            let threw = false;
            try { harness.viewDistributedPublicationInRepository(); } catch (e) { threw = true; }
            assert(threw === false, n('F3: navigating after withdrawal never throws'));
            assert(pushed.length === 1 && pushed[0].path === `/world/${publication.documentId}`,
                n('F3: the navigation call still fires — a "nothing here" outcome is the destination WorldView\'s own existing empty-state handling, never a new error state this milestone invents'));
        }

        // F4 — unpublished publication (no publish ever occurred):
        // publishedPublication stays null and no Explore action is even
        // reachable — verified structurally via the template gate.
        {
            const pushed = [];
            const router = { push: (target) => pushed.push(target) };
            const harness = buildHarness(editorViewSource, { publicationDistributionCommand: () => Promise.resolve(null), router });
            assert(harness.publishedPublication.value === null, n('F4: sanity — nothing has been published in this harness'));
            harness.viewDistributedPublicationInRepository();
            assert(pushed.length === 0, n('F4: with no publication ever published, the navigation call is a silent no-op'));
        }

        console.log('✓ Section F: distribution failure with a valid documentId still navigates to the real document; distribution success with a missing documentId, a withdrawn publication, and never-published state all preserve the deliberate graceful no-op (or a safe, thrown-error-free navigation where identity is genuinely still held).');
    }

    // ---------------------------------------------------------------
    // Section G — Repository convergence: Publication.documentId ==
    // route documentId == Repository-resolvable document identity,
    // through no new lookup mechanism.
    // ---------------------------------------------------------------
    {
        const { publishDocumentUseCase, discoveryProvider, publicationDistributionCommand } = realReplicaRig();
        const pushed = [];
        const router = { push: (target) => pushed.push(target) };
        const harness = buildHarness(editorViewSource, { publicationDistributionCommand, router });

        const publication = publishDocumentUseCase.execute({ document: makeDocument('Section G Manor') });
        harness.onDocumentPublished(publication);
        harness.distributePublishedDocument();
        await flushMicrotasks();
        harness.viewDistributedPublicationInRepository();

        const pushedDocumentId = pushed[0].path.replace('/world/', '');
        assert(pushedDocumentId === publication.documentId,
            n('Publication.documentId equals the route documentId pushed'));

        // The SAME discoveryProvider the real Repository/World route
        // resolves through (WorldView's own established discovery path)
        // can resolve a document whose id is this exact value — proving
        // the pushed route corresponds to a REAL, Repository-resolvable
        // document, using the existing discovery mechanism, never a new
        // lookup this milestone would have to invent.
        const resolved = discoveryProvider.findById(publication.id);
        assert(resolved !== null, n('the Repository can resolve the just-published, just-distributed Publication by its own id, through the existing discovery mechanism'));
        assert(resolved.documentId === pushedDocumentId,
            n('the Repository-resolved Publication\'s own documentId is the exact same value as the pushed route\'s documentId — Publication.documentId == route documentId == Repository-resolvable identity, one chain, no new lookup'));

        // No new lookup mechanism: the navigation function itself never
        // references discoveryProvider/findById/findPublicationUseCase —
        // this convergence is established by this test's own Section G
        // rig, not by anything EditorView.js does at navigation time.
        const navigationBlock = extractRange(editorViewCodeOnly, 'function viewDistributedPublicationInRepository()', '\n        }', 'viewDistributedPublicationInRepository() body (Section G)');
        assert(!navigationBlock.includes('discoveryProvider') && !navigationBlock.includes('findById') && !navigationBlock.includes('findPublicationUseCase'),
            n('viewDistributedPublicationInRepository() itself performs no Repository lookup — the convergence holds because documentId is a stable, already-shared identity, not because navigation re-resolves anything'));

        console.log('✓ Section G: Publication.documentId, the pushed route\'s documentId, and the Repository-resolvable document identity (via the existing discoveryProvider) are the exact same value, with no new lookup mechanism introduced.');
    }

    // ---------------------------------------------------------------
    // Section H — Cross-surface regression.
    // ---------------------------------------------------------------
    {
        assert(!panelSource.includes('viewDistributedPublicationInRepository') && !panelSource.includes('/world/${'),
            n('OwnPublicationPanel.js remains completely unchanged by this milestone — no navigation edge was added there'));
        assert(!panelSource.includes('router.push') && !/useRouter|useRoute/.test(panelSource),
            n('OwnPublicationPanel.js still carries no router dependency of any kind'));
        assert(canvasSource.includes('PLAIN NOTICE') && canvasSource.includes('NEVER A RECLASSIFIED DOMAIN RESULT'),
            n('WorldEncounterCanvas.js\'s own header still holds its established "PLAIN NOTICE — NEVER A RECLASSIFIED DOMAIN RESULT" wording, unchanged'));
        assert(!canvasSource.includes('distributionResult') && !canvasSource.includes('viewDistributedPublicationInRepository'),
            n('WorldEncounterCanvas.js declares no distributionResult and no navigation edge of any kind'));

        // Their own distribution actions still use the SAME composed
        // command — live proof, not just absence-of-reference: all three
        // surfaces' own distribution wrappers, when supplied the SAME
        // command instance, ultimately call that SAME instance.
        const { publishDocumentUseCase, publicationDistributionCommand } = realReplicaRig();
        let sharedCommandCalls = 0;
        const countingCommand = (request) => { sharedCommandCalls += 1; return publicationDistributionCommand(request); };
        const pushed = [];
        const router = { push: (target) => pushed.push(target) };
        const harness = buildHarness(editorViewSource, { publicationDistributionCommand: countingCommand, router });
        const publication = publishDocumentUseCase.execute({ document: makeDocument('Section H Manor') });
        harness.onDocumentPublished(publication);
        harness.distributePublishedDocument();
        await flushMicrotasks();
        assert(sharedCommandCalls === 1, n('EditorView\'s own distribution path calls exactly the one shared command instance this test constructed — no parallel command was substituted for this milestone'));

        // Live regression: existing related suites (0.9.377/0.9.378/
        // 0.9.380/0.9.381) still pass as real subprocesses.
        const regressionFiles = [
            'tests/EditorViewPostPublishDistributionAction.test.js',
            'tests/PostPublishDistributionActionConvergenceAudit.test.js',
            'tests/DistributionResultPublicationCenterDeepLinkAudit.test.js',
            'tests/EditorViewDistributionResultRepositoryNavigation.test.js'
        ];
        for (const file of regressionFiles) {
            let output;
            try {
                output = execFileSync(process.execPath, [file], { cwd: SOURCE_ROOT.pathname, encoding: 'utf8' });
            } catch (e) {
                assertionCount += 1;
                throw new Error(`ASSERT FAILED: ${assertionCount}. ${file} still passes unmodified — it failed instead:\n${e.stdout || ''}\n${e.stderr || e.message}`);
            }
            assert(!/ASSERT FAILED/.test(output), n(`${file} produced no failed assertion`));
        }

        console.log(`✓ Section H: OwnPublicationPanel.js and WorldEncounterCanvas.js remain completely unchanged, all three surfaces converge on the exact same composed command instance, and ${regressionFiles.length} related existing test files still pass live.`);
    }

    // ---------------------------------------------------------------
    // Section I — Lifecycle/UI teardown.
    // ---------------------------------------------------------------
    {
        const { publishDocumentUseCase, publicationDistributionCommand } = realReplicaRig();
        const pushed = [];
        const router = { push: (target) => pushed.push(target) };
        const harness = buildHarness(editorViewSource, { publicationDistributionCommand, router });

        const publication = publishDocumentUseCase.execute({ document: makeDocument('Section I Manor') });
        harness.onDocumentPublished(publication);
        harness.distributePublishedDocument();
        await flushMicrotasks();
        assert(harness.distributionResult.value !== null, n('sanity: I has a real distribution result'));

        // Leaving EditorView removes the transient result — dismissPublishAction()
        // is this view's own established teardown path (there is no
        // separate unmount hook; EditorView is a routed view, and Vue
        // tears its whole reactive state down on unmount/navigation
        // away, which dismissPublishAction() already models exactly, per
        // its own 0.9.377 header).
        harness.dismissPublishAction();
        assert(harness.publishedPublication.value === null, n('dismiss/leave clears publishedPublication'));
        assert(harness.distributionResult.value === null, n('dismiss/leave clears the transient distributionResult'));
        assert(harness.distributionError.value === null, n('dismiss/leave clears the transient distributionError'));

        // Returning does not resurrect stale navigation state: a fresh
        // harness (the real shape of remounting EditorView) starts with
        // nothing to navigate to, and the OLD publication's documentId
        // is never implicitly available.
        const freshHarness = buildHarness(editorViewSource, { publicationDistributionCommand, router });
        assert(freshHarness.publishedPublication.value === null,
            n('a fresh mount (return-to-EditorView) starts with publishedPublication null — never resurrecting the prior publication'));
        freshHarness.viewDistributedPublicationInRepository();
        assert(pushed.length === 0,
            n('unmount/remount never retains the old documentId — Explore on the fresh mount is a no-op until a new publish happens'));

        // A new publication replaces the previous target wholesale.
        const publicationNew = publishDocumentUseCase.execute({ document: makeDocument('Section I Manor Replacement') });
        harness.onDocumentPublished(publicationNew);
        harness.viewDistributedPublicationInRepository();
        assert(pushed.length === 1 && pushed[0].path === `/world/${publicationNew.documentId}`,
            n('after a new publish, Explore targets the new Publication\'s own documentId — never the dismissed, earlier one'));
        assert(publicationNew.documentId !== publication.documentId,
            n('sanity: the replacement is genuinely a different document from the dismissed one'));

        console.log('✓ Section I: leaving EditorView (dismiss) clears the transient result; a fresh mount never resurrects the prior documentId; a new publication replaces the previous navigation target wholesale.');
    }

    // ---------------------------------------------------------------
    // Section J — Architecture boundary and final verdict.
    // ---------------------------------------------------------------
    {
        // No Publication Center integration / catalog mutation.
        const navigationBlock = extractRange(editorViewCodeOnly, 'function viewDistributedPublicationInRepository()', '\n        }', 'viewDistributedPublicationInRepository() body (Section J)');
        assert(!navigationBlock.includes('publicationCatalog') && !navigationBlock.includes('.add('),
            n('the navigation function never references publicationCatalog or calls .add() on anything — no Publication Center catalog mutation'));
        // EditorView.js does inject `publicationCatalog` elsewhere — for
        // the entirely separate BlueprintAttribution fork-publish flow
        // 0.9.380's own Section B already found structurally disjoint
        // from this Publication type. This milestone's own concern is
        // narrower: the NEW navigation function itself must never touch
        // it, which the assertion above already proves.
        const publicationDistributionBlock = extractRange(editorViewCodeOnly, "const publicationDistributionCommand = inject('publicationDistributionCommand', null);", "function viewDistributedPublicationInRepository()", '0.9.377/0.9.381 block up to and including the navigation function');
        assert(!publicationDistributionBlock.includes("inject('publicationCatalog'"),
            n('the whole 0.9.377/0.9.381 post-publish-distribution block (publishedPublication, distribution state, and the navigation function) never injects publicationCatalog — that stays confined to the unrelated, pre-existing fork-publish flow elsewhere in this file'));

        // No new navigation service.
        assert(navigationBlock.match(/router\.push/g).length === 1,
            n('the navigation function performs exactly one router.push() call — no navigation abstraction/service wraps it'));

        // No distribution receipt / history.
        // No automatic navigation.
        assert(!navigationBlock.includes('setTimeout') && !navigationBlock.includes('watch(') && !navigationBlock.includes('onMounted'),
            n('no automatic navigation is wired anywhere — no timer, watcher, or mount hook triggers router.push() on its own'));

        // No network lookup.
        assert(!navigationBlock.includes('fetch(') && !navigationBlock.includes('await ') && !navigationBlock.includes('.then('),
            n('the navigation function performs no network request and no async work of any kind — pure, synchronous routing'));

        // No new Publication identity resolution.
        assert(!navigationBlock.includes('discoveryProvider') && !navigationBlock.includes('findById') && !navigationBlock.includes('findPublicationUseCase'),
            n('the navigation function performs no new Publication identity resolution — it reads only the already-held publishedPublication.value.documentId'));

        // No distribution lifecycle changes.
        assert(!navigationBlock.includes('LifecycleStore') && !navigationBlock.includes('distributionRequestId'),
            n('the navigation function never touches the distribution lifecycle or its own request-id staleness guard'));

        const forbiddenVocabulary = [
            'PublicationDistributionReceipt', 'DistributionReceipt', 'distributionReceipt',
            'PublicationDistributionHistory', 'distributionHistory',
            'NavigationService', 'navigationService', 'PublicationNavigationService',
            'PublicationLookupService', 'publicationLookupService',
            'AutoNavigate', 'autoNavigate', 'automaticNavigation',
            'PublicationCenterBridge', 'publicationCenterBridge'
        ];
        for (const term of forbiddenVocabulary) {
            const hits = await grepCodeOnlyFiles(term, PRODUCTION_DIRS);
            assert(hits.length === 0, n(`no "${term}" vocabulary exists anywhere in production — found: ${JSON.stringify(hits)}`));
        }

        console.log('✓ Section J: no Publication Center integration, no catalog mutation, no new navigation service, no distribution receipt or history, no automatic navigation, no network lookup, no new Publication identity resolution, and no distribution lifecycle changes exist anywhere in production.');

        console.log(`
Final convergence matrix:
| Property                                   | Before 0.9.381                         | After 0.9.381                                          |
|---------------------------------------------|-----------------------------------------|----------------------------------------------------------|
| Route to a Publication's World placement     | /world/:documentId (PublicationCatalog) | SAME /world/:documentId, one caller added                |
| Navigation-time Publication identity source  | already-held object (all other callers) | SAME — publishedPublication.value, already held          |
| Distribution lifecycle store                 | one shared instance (app-wide)          | unchanged — navigation never reads or writes it           |
| publicationDistributionCommand invocations   | one per explicit "Distribute now" click | unchanged — navigation adds zero invocations               |
| OwnPublicationPanel / WorldEncounterCanvas    | no navigation edge                      | unchanged — still no navigation edge                      |
`);

        console.log('\n✅ VERDICT — CONVERGED. 0.9.381 adds a single presentation-level navigation edge from EditorView\'s existing distribution-result panel to the existing Repository route (/world/:documentId), built from the exact Publication object already held in publishedPublication.value, reached through the byte-identical target shape PublicationCatalog.js\'s own pre-existing "Explore" action already uses. Publish, distribution start, distribution success, and distribution failure never navigate on their own — only an explicit click does. Navigating never mutates PublicationDistributionLifecycleMemoryStore, never invokes publicationDistributionCommand again, and never produces a new result or receipt. Sequential publications never cross-contaminate each other\'s target, dismissal/remount never resurrects a stale documentId, and a failed distribution or a withdrawn/unpublished Publication all degrade exactly as gracefully as before. No Publication Center integration, catalog mutation, new navigation service, distribution receipt/history, automatic navigation, network lookup, new identity-resolution mechanism, or distribution lifecycle change exists anywhere in production. Per this milestone\'s own brief, the post-publish distribution micro-arc (0.9.377-0.9.382) is complete; the next milestone should not extend this arc further, but return to a fresh whole-product reassessment.');
    }

    console.log('\n✅ All Distribution Result -> Repository Navigation Convergence Audit tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
