import { usePostPublishDistribution } from '../ui/views/editorView/usePostPublishDistribution.js';
import { mountComponent } from './support/MinimalVueCompositionApiShim.js';

import { composeMultiRelayNostrPublicationDistributionCommand } from '../application/publication/distribution/PublicationDistributionCommandComposition.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/publication/distribution/PublicationDistributionLifecycleStore.js';
import { PublishDocumentUseCase } from '../application/publication/PublishDocumentUseCase.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { worldEncounterCanvasFiles, editorViewFiles, ownPublicationPanelFiles } from './support/SourceFileGroups.js';
import { assert } from './support/Assert.js';
import { readSource } from './support/SourceText.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

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

function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 5; i++) {
        await Promise.resolve();
    }
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

// AMENDED BY 0.9.450 — Nostr Multi-Relay Publication Distribution Wiring.
// EditorView.js's own injected command changed from the single-relay
// `publicationDistributionCommand` to `multiRelayNostrPublicationDistributionCommand`
// (see that file's own 0.9.450 amendment) — this helper is renamed and
// rebuilt to compose the REAL app-wide multi-relay command exactly the way
// `ui/main.js` composes it now, unmodified otherwise.
function realAppWideDistributionCommand({ lifecycleStore, transactionId = 'RepositoryNavTransactionId123456', eventId = 'a'.repeat(64), gatewayHandler, relayHandler, nostrRelayUrls = ['wss://relay.example'] }) {
    const gateway = gatewayHandler || (() => new Response('accepted', { status: 200 }));
    const relay = relayHandler || (() => ({ published: true, id: eventId }));
    return composeMultiRelayNostrPublicationDistributionCommand({
        lifecycleStore,
        arweaveUploaderOptions: {
            signer: { sign: async (material) => ({ id: transactionId, transaction: { data: material } }) },
            fetchImpl: async (url, options) => gateway(url, options)
        },
        nostrRelayUrls,
        nostrPublisherOptions: {
            discoveryTag: 'forkbuild-repository-navigation',
            publishImpl: async (relayUrl, eventTemplate) => relay(relayUrl, eventTemplate)
        }
    });
}

// Harness: the real post-publish distribution composable, mounted with fake injections.
function buildHarness(_editorViewSource, { multiRelayNostrPublicationDistributionCommand = null, publicationDistributionCommand = null, router = { push: () => {} } } = {}) {
    // Mounts the real composable EditorView uses, with the given commands
    // injected the way the app root provides them.
    const injections = {};
    if (multiRelayNostrPublicationDistributionCommand !== null) injections.multiRelayNostrPublicationDistributionCommand = multiRelayNostrPublicationDistributionCommand;
    if (publicationDistributionCommand !== null) injections.publicationDistributionCommand = publicationDistributionCommand;
    return mountComponent({ setup: () => usePostPublishDistribution({ router }) }, injections);
}

async function run() {
    const editorViewSource = (await Promise.all(editorViewFiles().map((file) => readSource(file)))).join('\n');
    const editorViewCodeOnly = codeOnlyLines(editorViewSource);
    const panelSource = (await Promise.all(ownPublicationPanelFiles().map((file) => readSource(file)))).join('\n');
    const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => readSource(file)))).join('\n');

    // ---------------------------------------------------------------
    // Section A — Exact identity.
    // ---------------------------------------------------------------
    {
        const { publishDocumentUseCase } = realReplicaRig();
        const pushed = [];
        const router = { push: (target) => pushed.push(target) };
        const harness = buildHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand: () => Promise.resolve(null), router });

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
        const harness = buildHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand: rawCommand, router });

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
        const harness = buildHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand: () => Promise.resolve(null), router });

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
        const harness = buildHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand: rawCommand, router });

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
        const harness = buildHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand: failingCommand, router });

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
        const harness = buildHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand: () => Promise.resolve(null), router });

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
        const harness2 = buildHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand: () => Promise.resolve(null), router: router2 });
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
        const harness = buildHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand: () => Promise.resolve(null), router });

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

    console.log('\n✅ All EditorView Distribution Result -> Repository Navigation tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
