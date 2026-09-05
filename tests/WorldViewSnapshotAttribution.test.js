import { readFile } from 'node:fs/promises';

import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { resolveSnapshotPublicationAttribution } from '../application/SnapshotPublicationAttribution.js';
import { SnapshotPublicationAttributionOutcome } from '../application/SnapshotPublicationAttributionOutcome.js';
import { executeSnapshotDistributionCommand } from '../application/SnapshotDistributionCommand.js';
import { executeDiscoverSnapshotCommand } from '../application/DiscoverSnapshotCommand.js';
import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { WorldEncounterMaterialLoadStatus } from '../application/WorldEncounterMaterialLoading.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';

// 0.9.144 — World View Snapshot Attribution Integration.
//
// 0.9.142 gave World View "Discover Snapshot"; 0.9.143 built
// `application/SnapshotPublicationAttribution.js#resolveSnapshotPublicationAttribution()`
// — the pure Q3 comparison — and deliberately stopped short of any UI
// wiring. This milestone is that wiring, at BOTH entry points 0.9.144's own
// design calls for:
//
//   Publication (local, OwnPublicationPanel)         Publication (selected, WorldEncounterCanvas)
//                  │                                                  │
//                  └───────────────────┬──────────────────────────────┘
//                                       ▼
//                          discoverOwnSnapshot(publication)   (ui/views/WorldView.js,
//                                       │                       the SAME function, reused verbatim)
//                                       ▼
//                          snapshotDiscoveryResult
//                                       │
//                                       ▼
//                          resolveSnapshotPublicationAttribution(publication, snapshotDiscoveryResult)
//                          (application/SnapshotPublicationAttribution.js, 0.9.143, unmodified)
//                                       │
//                                       ▼
//                          snapshotAttributionResult
//
// Section A: OwnPublicationPanel attribution wiring (unit) — a successful
//            discovery immediately produces a snapshotAttributionResult,
//            held as a field separate from snapshotDiscoveryResult.
// Section B: WorldEncounterCanvas attribution wiring (unit), for a
//            Wanderer-selected encounter — the same seam, one entry point
//            over.
// Section C: FLAGSHIP — zero peers, a real local Publication, distributed
//            and discovered through the real (unmodified) Arweave/Nostr
//            chain, attributed end to end through OwnPublicationPanel's own
//            action alone, reporting MATCH.
// Section D: NEGATIVE — a verified Snapshot whose own content differs from
//            the Publication being attributed reports NO_MATCH, at both
//            entry points, never silently treated as a match or an error.
// Section E: resolution failures (NOT_DISCOVERED, via the real chain, with
//            nothing ever announced) are passed through as-is — never
//            fabricated into NO_MATCH.
// Section F: UI state separation — snapshotDiscoveryResult and
//            snapshotAttributionResult never overwrite one another, and
//            both remain independently readable after a successful call.
// Section G: a changed Publication/selection invalidates a stale
//            attribution result exactly as it already invalidates the
//            discovery result it was computed from.
// Section H: a stale in-flight response can never write an attribution
//            result for a Publication/selection that has since moved on.
// Section I: architectural regression — neither UI file hashes bytes,
//            compares hashes, or constructs Arweave/Nostr/resolver
//            collaborators directly; both call
//            resolveSnapshotPublicationAttribution() from exactly one
//            place; both entry points share the exact same
//            discoverOwnSnapshot() function; Snapshot Distribution stays
//            entirely untouched by this milestone.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

function makeFakeArweaveGateway() {
    const network = new Map();
    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        if (options.method === 'POST' && parsed.pathname === '/tx') {
            const transaction = JSON.parse(options.body);
            network.set(transaction.id, transaction.data);
            return new Response('OK', { status: 200 });
        }
        const id = parsed.pathname.slice(1);
        if (!network.has(id)) return new Response('not found', { status: 404 });
        return new Response(network.get(id));
    }
    return { network, fetchImpl };
}

function makeFakeArweaveSigner() {
    let counter = 0;
    async function sign(material) {
        counter += 1;
        return { id: `fake-attribution-tx-${counter}`, transaction: { id: `fake-attribution-tx-${counter}`, data: material } };
    }
    return { sign };
}

function makeNostrNetwork() {
    const events = [];
    let counter = 0;
    async function publishImpl(relayUrl, eventTemplate) {
        counter += 1;
        const id = counter.toString(16).padStart(64, '0');
        events.push({ id, pubkey: 'fake-pubkey', kind: eventTemplate.kind, tags: eventTemplate.tags, content: eventTemplate.content, sig: 'fake-sig' });
        return { published: true, id };
    }
    async function queryImpl(relayUrl, filter) {
        const tagFilters = Object.entries(filter).filter(([key]) => key.startsWith('#'));
        return events
            .filter((event) => {
                if (Array.isArray(filter.kinds) && !filter.kinds.includes(event.kind)) return false;
                return tagFilters.every(([key, values]) => {
                    const tagName = key.slice(1);
                    return event.tags.some((tag) => tag[0] === tagName && values.includes(tag[1]));
                });
            })
            .slice(0, filter.limit);
    }
    return { events, publishImpl, queryImpl };
}

// The EXACT logic ui/views/WorldView.js's own discoverOwnSnapshot()
// implements, unmodified by this milestone, and — per this milestone —
// bound to BOTH OwnPublicationPanel's own discoverSnapshotCommand prop and
// WorldEncounterCanvas's new one. Reproduced here for the identical reason
// tests/WorldViewOwnPublicationSnapshotDiscovery.test.js's own copy is.
function makeDiscoverOwnSnapshotAction({ discoverSnapshotCommand }) {
    return (publication) => {
        if (!discoverSnapshotCommand || !publication || !publication.contentReference) {
            return Promise.reject(new Error('Snapshot discovery is not available.'));
        }
        return discoverSnapshotCommand(publication.contentReference.hash);
    };
}

function panelCtx(overrides = {}) {
    return {
        publication: null,
        discoverSnapshotCommand: null,
        snapshotDiscoveryExecuting: false,
        snapshotDiscoveryError: null,
        snapshotDiscoveryResult: null,
        snapshotDiscoveryRequestId: 0,
        snapshotAttributionResult: null,
        discoverOwnSnapshot: OwnPublicationPanel.methods.discoverOwnSnapshot,
        ...overrides
    };
}

// Mirrors tests/WorldViewSnapshotDistribution.test.js's own canvasCtx()
// exactly, extended with the 0.9.144 discovery/attribution fields.
function canvasCtx(overrides = {}) {
    const ctx = {
        selectedEncounter: null,
        materialInspection: null,
        distributionLifecycleStore: null,
        distributionCommand: null,
        distributionExecuting: false,
        distributionError: null,
        distributionRequestId: 0,
        snapshotDistributionCommand: null,
        snapshotDistributionExecuting: false,
        snapshotDistributionError: null,
        snapshotDistributionResult: null,
        snapshotDistributionRequestId: 0,
        discoverSnapshotCommand: null,
        snapshotDiscoveryExecuting: false,
        snapshotDiscoveryError: null,
        snapshotDiscoveryResult: null,
        snapshotDiscoveryRequestId: 0,
        snapshotAttributionResult: null,
        selectEncounter: WorldEncounterCanvas.methods.selectEncounter,
        refreshSelectionOutcome: WorldEncounterCanvas.methods.refreshSelectionOutcome,
        refreshMaterialInspection: WorldEncounterCanvas.methods.refreshMaterialInspection,
        refreshDecentralizedLeadOutcome: WorldEncounterCanvas.methods.refreshDecentralizedLeadOutcome,
        refreshDistributionLifecycle: WorldEncounterCanvas.methods.refreshDistributionLifecycle,
        stopSubscription: WorldEncounterCanvas.methods.stopSubscription,
        discoverSelectedSnapshot: WorldEncounterCanvas.methods.discoverSelectedSnapshot,
        registry: null,
        worldDiscoveryLeadRegistry: null,
        materialSources: null,
        materialVerifier: null,
        resolvedSelectionChoice: null,
        resolvedLeadChoice: null,
        decentralizedLeadOutcome: null,
        selectionOutcome: null,
        materialInspectionRequestId: 0,
        ...overrides
    };
    Object.defineProperty(ctx, 'distributablePublication', {
        get() { return WorldEncounterCanvas.computed.distributablePublication.call(ctx); }
    });
    return ctx;
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — OwnPublicationPanel attribution wiring (unit).
    // ---------------------------------------------------------------
    {
        const bytes = 'own-publication-attribution-bytes';
        const hash = computeContentHash(bytes);
        const publication = new Publication({ id: 'pub-attr-a', documentId: 'doc-attr-a', contentReference: new ContentReference({ hash, uri: 'ar://a', storage: 'ar' }) });
        const fakeResult = Object.freeze({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes, candidates: [], locator: 'ar://a', storage: 'ar', reason: null });
        const action = makeDiscoverOwnSnapshotAction({ discoverSnapshotCommand: () => Promise.resolve(fakeResult) });

        const ctx = panelCtx({ publication, discoverSnapshotCommand: action });
        ctx.discoverOwnSnapshot();
        await flushMicrotasks();

        assert(ctx.snapshotDiscoveryResult === fakeResult, '1. the discovery result is stored exactly as before — unaffected by this milestone');
        assert(ctx.snapshotAttributionResult !== null, '2. a successful discovery immediately produces an attribution result — no separate click required');
        assert(ctx.snapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.MATCH, '3. matching content reports MATCH');
        assert(ctx.snapshotAttributionResult !== ctx.snapshotDiscoveryResult, '4. attribution is held as its own, separate field, never a replacement of the discovery result');

        console.log('✓ Section A: OwnPublicationPanel computes an attribution verdict immediately after a successful discovery, as a field separate from the discovery result');
    }

    // ---------------------------------------------------------------
    // Section B — WorldEncounterCanvas attribution wiring (unit), for a
    // Wanderer-selected encounter.
    // ---------------------------------------------------------------
    {
        const bytes = 'world-encounter-attribution-bytes';
        const hash = computeContentHash(bytes);
        const publication = new Publication({ id: 'pub-attr-b', documentId: 'doc-attr-b', contentReference: new ContentReference({ hash, uri: 'ar://b', storage: 'ar' }) });
        const fakeResult = Object.freeze({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes, candidates: [], locator: 'ar://b', storage: 'ar', reason: null });
        const action = makeDiscoverOwnSnapshotAction({ discoverSnapshotCommand: () => Promise.resolve(fakeResult) });

        const ctx = canvasCtx({
            selectedEncounter: { kind: 'PUBLICATION', objectId: publication.id },
            materialInspection: { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, material: publication } },
            discoverSnapshotCommand: action
        });
        assert(ctx.distributablePublication === publication, '5. sanity: the selected encounter\'s own loaded Publication is distributable');

        ctx.discoverSelectedSnapshot();
        await flushMicrotasks();

        assert(ctx.snapshotDiscoveryResult === fakeResult, '6. the discovery result is stored verbatim, mirroring OwnPublicationPanel\'s own behavior one entry point over');
        assert(ctx.snapshotAttributionResult && ctx.snapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.MATCH,
            '7. the SAME attribution seam produces MATCH for a Wanderer-selected Publication, exactly as it already does for the local user\'s own');

        console.log('✓ Section B: WorldEncounterCanvas computes the same attribution verdict for a selected World Encounter, through the same seam OwnPublicationPanel already uses');
    }

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP: zero peers, a real local Publication,
    // distributed and discovered end to end, attributed to MATCH.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeArweaveGateway();
        const store = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: gateway.fetchImpl });
        const network = makeNostrNetwork();
        const discoveryTag = 'flagship-attribution-integration';
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });

        const snapshotJson = { world: { buildings: [{ id: 'flagship-attribution-building', bricks: 7 }] } };
        const bytes = JSON.stringify(snapshotJson);
        const expectedHash = computeContentHash(bytes);

        const distributed = await executeSnapshotDistributionCommand({ bytes, contentStore: store, discoveryPublisher: publisher });
        assert(distributed.announcement.published === true, 'C0. sanity: the Snapshot was genuinely distributed and announced');

        const publication = new Publication({
            id: 'pub-attr-flagship',
            documentId: 'doc-attr-flagship',
            contentReference: new ContentReference({ hash: expectedHash, uri: distributed.contentReference.uri, storage: 'ar' })
        });

        const discoveringRuntime = composeDiscoverSnapshotRuntime({
            arweaveContentStoreOptions: { signer: makeFakeArweaveSigner(), fetchImpl: gateway.fetchImpl },
            nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: network.queryImpl }
        });
        const discoverSnapshotCommand = (contentHash) => executeDiscoverSnapshotCommand({
            discoveryTag,
            contentHash,
            resolver: discoveringRuntime.resolver,
            contentStore: discoveringRuntime.contentStore
        });
        const discoverOwnSnapshotAction = makeDiscoverOwnSnapshotAction({ discoverSnapshotCommand });

        // Note what is deliberately ABSENT: no WorldDiscoverySourceRegistry,
        // no WorldEncounterCanvas, no selectedEncounter, no connected peer.
        const ctx = panelCtx({ publication, discoverSnapshotCommand: discoverOwnSnapshotAction });
        ctx.discoverOwnSnapshot();
        await flushMicrotasks();

        assert(ctx.snapshotDiscoveryError === null, 'C1. FLAGSHIP — a successful call leaves no error notice');
        assert(ctx.snapshotDiscoveryResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED,
            'C2. FLAGSHIP — the real Arweave/Nostr chain resolves the Snapshot fully');
        assert(ctx.snapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.MATCH,
            'C3. FLAGSHIP — the full pipeline (distribute -> discover -> retrieve -> verify -> attribute) ends in MATCH, driven entirely through OwnPublicationPanel\'s own UI-level action');
        assert(ctx.snapshotAttributionResult.publicationHash === expectedHash, 'C4. FLAGSHIP — the attribution result carries the Publication\'s own hash');
        assert(ctx.snapshotAttributionResult.snapshotHash === expectedHash, 'C5. FLAGSHIP — and the independently recomputed Snapshot hash, which agree');

        console.log('✓ Section C (FLAGSHIP): distribute -> Nostr discovery -> retrieve -> verify -> attribute, driven end to end through OwnPublicationPanel alone, reports MATCH');
    }

    // ---------------------------------------------------------------
    // Section D — NEGATIVE: a verified Snapshot whose content differs
    // from the Publication being attributed reports NO_MATCH, at both
    // entry points.
    // ---------------------------------------------------------------
    {
        const wrongBytes = 'this-is-not-the-publications-own-content';
        const wrongHash = computeContentHash(wrongBytes);
        const publicationHash = computeContentHash('the-publications-own-real-content');
        assert(wrongHash !== publicationHash, 'D0. sanity: the two hashes genuinely differ');

        // A resolved result reporting genuinely different, but internally
        // self-consistent, verified content — the scenario
        // application/SnapshotPublicationAttribution.js's own header names:
        // "a caller resolved resolvedSnapshot against some OTHER
        // contentHash... and is now asking whether that already-verified
        // Snapshot also happens to belong to THIS Publication."
        const fakeResult = Object.freeze({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: wrongBytes, candidates: [], locator: 'ar://wrong', storage: 'ar', reason: null });
        const action = makeDiscoverOwnSnapshotAction({ discoverSnapshotCommand: () => Promise.resolve(fakeResult) });

        // OwnPublicationPanel's own entry point.
        const publication = new Publication({ id: 'pub-attr-d', documentId: 'doc-attr-d', contentReference: new ContentReference({ hash: publicationHash, uri: 'ar://d', storage: 'ar' }) });
        const panel = panelCtx({ publication, discoverSnapshotCommand: action });
        panel.discoverOwnSnapshot();
        await flushMicrotasks();
        assert(panel.snapshotDiscoveryError === null, '8. an honest non-match is never treated as a call failure');
        assert(panel.snapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.NO_MATCH,
            '9. NEGATIVE — verified content that genuinely differs from the Publication\'s own hash reports NO_MATCH, never a fabricated MATCH');

        // WorldEncounterCanvas's own entry point — the identical
        // fixture, proving the negative holds at both entry points.
        const selectedPublication = new Publication({ id: 'pub-attr-d-selected', documentId: 'doc-attr-d-selected', contentReference: new ContentReference({ hash: publicationHash, uri: 'ar://d', storage: 'ar' }) });
        const canvas = canvasCtx({
            selectedEncounter: { kind: 'PUBLICATION', objectId: selectedPublication.id },
            materialInspection: { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, material: selectedPublication } },
            discoverSnapshotCommand: action
        });
        canvas.discoverSelectedSnapshot();
        await flushMicrotasks();
        assert(canvas.snapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.NO_MATCH,
            '10. NEGATIVE — the identical non-match holds through WorldEncounterCanvas\'s own action, the same seam one entry point over');

        console.log('✓ Section D: NEGATIVE — a verified Snapshot whose content genuinely differs from the Publication being attributed reports NO_MATCH at both entry points, distinguishing "verified the wrong content" from a resolution failure');
    }

    // ---------------------------------------------------------------
    // Section E — resolution failures are passed through unchanged,
    // never fabricated into NO_MATCH.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeArweaveGateway();
        const network = makeNostrNetwork();
        const discoveryTag = 'section-e-attribution-not-discovered';

        // Nothing is ever distributed under this contentHash/discoveryTag.
        const publication = new Publication({
            id: 'pub-attr-e',
            documentId: 'doc-attr-e',
            contentReference: new ContentReference({ hash: 'a-hash-nobody-ever-announced', uri: 'ar://irrelevant', storage: 'ar' })
        });

        const discoveringRuntime = composeDiscoverSnapshotRuntime({
            arweaveContentStoreOptions: { signer: makeFakeArweaveSigner(), fetchImpl: gateway.fetchImpl },
            nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: network.queryImpl }
        });
        const discoverSnapshotCommand = (contentHash) => executeDiscoverSnapshotCommand({
            discoveryTag, contentHash, resolver: discoveringRuntime.resolver, contentStore: discoveringRuntime.contentStore
        });
        const action = makeDiscoverOwnSnapshotAction({ discoverSnapshotCommand });

        const ctx = panelCtx({ publication, discoverSnapshotCommand: action });
        ctx.discoverOwnSnapshot();
        await flushMicrotasks();

        assert(ctx.snapshotDiscoveryResult.outcome === DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED, 'E0. sanity: discovery itself honestly reports NOT_DISCOVERED');
        assert(ctx.snapshotAttributionResult.outcome === DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED,
            '11. a resolution failure is passed through as its own outcome, verbatim — never reported as NO_MATCH');
        assert(ctx.snapshotAttributionResult.outcome !== SnapshotPublicationAttributionOutcome.NO_MATCH,
            '12. NOT_DISCOVERED is never confused with a definite content mismatch');

        console.log('✓ Section E: a discovery that never reaches RESOLVED produces an attribution result carrying that exact same failure outcome, never a fabricated NO_MATCH');
    }

    // ---------------------------------------------------------------
    // Section F — UI state separation: discovery and attribution never
    // overwrite one another.
    // ---------------------------------------------------------------
    {
        const bytes = 'section-f-separation-bytes';
        const hash = computeContentHash(bytes);
        const publication = new Publication({ id: 'pub-attr-f', documentId: 'doc-attr-f', contentReference: new ContentReference({ hash, uri: 'ar://f', storage: 'ar' }) });
        const fakeResult = Object.freeze({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes, candidates: [], locator: 'ar://f', storage: 'ar', reason: null });
        const action = makeDiscoverOwnSnapshotAction({ discoverSnapshotCommand: () => Promise.resolve(fakeResult) });

        const ctx = panelCtx({ publication, discoverSnapshotCommand: action });
        ctx.discoverOwnSnapshot();
        await flushMicrotasks();

        assert(ctx.snapshotDiscoveryResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, '13. Snapshot Discovery reports RESOLVED');
        assert(ctx.snapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.MATCH, '14. Snapshot Attribution independently reports MATCH');
        assert('outcome' in ctx.snapshotDiscoveryResult && 'outcome' in ctx.snapshotAttributionResult && ctx.snapshotDiscoveryResult.outcome !== ctx.snapshotAttributionResult.outcome,
            '15. the two outcomes are genuinely different values (RESOLVED vs MATCH) held in two different fields — never collapsed into one combined status');

        console.log('✓ Section F: Snapshot Discovery (RESOLVED) and Snapshot Attribution (MATCH) coexist as two independently readable facts');
    }

    // ---------------------------------------------------------------
    // Section G — a changed Publication/selection invalidates a stale
    // attribution result exactly as it already invalidates discovery.
    // ---------------------------------------------------------------
    {
        const bytes = 'section-g-bytes';
        const hash = computeContentHash(bytes);
        const publicationA = new Publication({ id: 'pub-attr-g-a', documentId: 'doc-attr-g-a', contentReference: new ContentReference({ hash, uri: 'ar://g-a', storage: 'ar' }) });
        const publicationB = new Publication({ id: 'pub-attr-g-b', documentId: 'doc-attr-g-b', contentReference: new ContentReference({ hash: computeContentHash('other'), uri: 'ar://g-b', storage: 'ar' }) });
        const fakeResult = Object.freeze({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes, candidates: [], locator: 'ar://g-a', storage: 'ar', reason: null });
        const action = makeDiscoverOwnSnapshotAction({ discoverSnapshotCommand: () => Promise.resolve(fakeResult) });

        // OwnPublicationPanel — publication watcher.
        const panel = panelCtx({ publication: publicationA, discoverSnapshotCommand: action });
        panel.discoverOwnSnapshot();
        await flushMicrotasks();
        assert(panel.snapshotAttributionResult !== null, '16. sanity: an attribution result exists before the Publication changes');

        OwnPublicationPanel.watch.publication.call(panel, publicationB, publicationA);
        panel.publication = publicationB;
        assert(panel.snapshotAttributionResult === null, '17. a changed Publication clears the prior attribution verdict, exactly as it already clears the discovery result');
        assert(panel.snapshotDiscoveryResult === null, '18. ...and the discovery result it was computed from');

        // WorldEncounterCanvas — a fresh selectEncounter() call.
        const canvas = canvasCtx({
            selectedEncounter: { kind: 'PUBLICATION', objectId: publicationA.id },
            materialInspection: { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, material: publicationA } },
            discoverSnapshotCommand: action
        });
        canvas.discoverSelectedSnapshot();
        await flushMicrotasks();
        assert(canvas.snapshotAttributionResult !== null, '19. sanity: an attribution result exists before a fresh selection');

        canvas.selectEncounter({ kind: 'PUBLICATION', objectId: 'some-other-object-id' });
        assert(canvas.snapshotAttributionResult === null, '20. a fresh selection clears any prior attribution verdict, mirroring OwnPublicationPanel\'s own restraint one entry point over');
        assert(canvas.snapshotDiscoveryResult === null, '21. ...and the discovery result it was computed from');

        console.log('✓ Section G: a changed Publication (OwnPublicationPanel) or a fresh selection (WorldEncounterCanvas) invalidates a stale attribution result exactly as it already invalidates discovery');
    }

    // ---------------------------------------------------------------
    // Section H — a stale in-flight response can never write an
    // attribution result for a Publication/selection that has since
    // moved on.
    // ---------------------------------------------------------------
    {
        let resolveFirst;
        const publicationA = new Publication({ id: 'pub-attr-h-a', documentId: 'doc-attr-h-a', contentReference: new ContentReference({ hash: 'hash-h-a', uri: 'ar://h-a', storage: 'ar' }) });
        const publicationB = new Publication({ id: 'pub-attr-h-b', documentId: 'doc-attr-h-b', contentReference: new ContentReference({ hash: 'hash-h-b', uri: 'ar://h-b', storage: 'ar' }) });
        const action = makeDiscoverOwnSnapshotAction({
            discoverSnapshotCommand: () => new Promise((resolve) => { resolveFirst = resolve; })
        });

        const panel = panelCtx({ publication: publicationA, discoverSnapshotCommand: action });
        panel.discoverOwnSnapshot();
        assert(panel.snapshotDiscoveryExecuting === true, '22. the call enters executing state synchronously');
        // Let the microtask queue actually reach discoverSnapshotCommand()
        // (called from inside a Promise.resolve().then(...)) so
        // resolveFirst is assigned before this section tries to use it.
        await Promise.resolve();
        await Promise.resolve();

        OwnPublicationPanel.watch.publication.call(panel, publicationB, publicationA);
        panel.publication = publicationB;
        assert(panel.snapshotAttributionResult === null && panel.snapshotDiscoveryResult === null, '23. switching the Publication clears state immediately, without waiting for the stale call');

        resolveFirst({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: 'stale-bytes', candidates: [], locator: 'ar://stale', storage: 'ar', reason: null });
        await flushMicrotasks();
        assert(panel.snapshotDiscoveryResult === null, '24. the stale call\'s own resolution never overwrites the new Publication\'s discovery state');
        assert(panel.snapshotAttributionResult === null, '25. ...nor does it fabricate an attribution result for a Publication the stale call was never actually run against');

        console.log('✓ Section H: a stale in-flight discovery response can never write an attribution result once the Publication has changed');
    }

    // ---------------------------------------------------------------
    // Section I — architectural regression.
    // ---------------------------------------------------------------
    {
        const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        const canvasCode = await codeOnlySource('ui/components/WorldEncounterCanvas.js');

        const forbiddenInUi = [
            'computeContentHash', 'TextDecoder',
            'window.arweaveWallet', 'window.nostr', 'WebSocket',
            'new ArweaveContentStore(', 'new NostrSnapshotDiscoveryQueryService(', 'new DecentralizedSnapshotResolver(',
            'composeDiscoverSnapshotRuntime(', 'executeDiscoverSnapshotCommand(',
            'ATTRIBUTED', 'OWNED', 'CONFIRMED'
        ];
        for (const term of forbiddenInUi) {
            assert(!panelCode.includes(term), `26. OwnPublicationPanel.js never references '${term}' — attribution stays entirely inside application/SnapshotPublicationAttribution.js`);
            assert(!canvasCode.includes(term), `27. WorldEncounterCanvas.js never references '${term}' either`);
        }

        // 0.9.154 — Selected Snapshot Attribution deliberately adds a
        // SECOND, independent call site over a genuinely different input
        // (selectedSnapshotResolutionResult, the browsed-and-selected
        // path) alongside this milestone's own original call site
        // (snapshotDiscoveryResult, the already-known-contentHash path).
        // Both converge on the SAME imported function — never a second,
        // parallel comparison implementation — so the invariant this
        // section actually protects is "exactly one call per path,"
        // never "exactly one call in the whole file."
        assert((panelCode.match(/resolveSnapshotPublicationAttribution\(/g) || []).length === 2,
            '28. OwnPublicationPanel.js calls resolveSnapshotPublicationAttribution() from exactly two places — discoverOwnSnapshot()\'s own (0.9.144) and attributeSelectedSnapshot()\'s own (0.9.154), never a third');
        assert((panelCode.match(/discoverOwnSnapshot\(\)\s*\{[\s\S]*?\n\s{8}\},/) || [''])[0].includes('resolveSnapshotPublicationAttribution('),
            '28b. discoverOwnSnapshot() still contains its own original call site, unchanged by this milestone');
        assert((panelCode.match(/attributeSelectedSnapshot\(\)\s*\{[\s\S]*?\n\s{8}\}/) || [''])[0].includes('resolveSnapshotPublicationAttribution('),
            '28c. attributeSelectedSnapshot() (0.9.154) contains its own, independent call site');
        assert((canvasCode.match(/resolveSnapshotPublicationAttribution\(/g) || []).length === 1,
            '29. WorldEncounterCanvas.js calls resolveSnapshotPublicationAttribution() from exactly one place');
        assert(panelCode.includes("from '../../application/SnapshotPublicationAttribution.js'") && canvasCode.includes("from '../../application/SnapshotPublicationAttribution.js'"),
            '30. both UI files import the SAME application-layer seam — no second, parallel comparison implementation');

        // Snapshot Distribution stays entirely untouched by this
        // milestone — no automatic attribution during distribution.
        assert((panelCode.match(/distributeOwnSnapshot\(\)\s*\{[\s\S]*?\n\s{8}\},/) || [''])[0].indexOf('resolveSnapshotPublicationAttribution') === -1,
            '31. distributeOwnSnapshot() never calls resolveSnapshotPublicationAttribution() — distribution and attribution stay independent');
        assert((canvasCode.match(/distributeSelectedSnapshot\(\)\s*\{[\s\S]*?\n\s{8}\},/) || [''])[0].indexOf('resolveSnapshotPublicationAttribution') === -1,
            '32. distributeSelectedSnapshot() never calls resolveSnapshotPublicationAttribution() either');

        const viewCode = await codeOnlySource('ui/views/WorldView.js');
        assert(/<WorldEncounterCanvas[\s\S]{0,600}:discoverSnapshotCommand="discoverOwnSnapshot"/.test(viewCode),
            '33. WorldEncounterCanvas is wired to the SAME discoverOwnSnapshot function OwnPublicationPanel already uses — one seam, two entry points');
        assert(/<OwnPublicationPanel[\s\S]{0,400}:discoverSnapshotCommand="discoverOwnSnapshot"/.test(viewCode),
            '34. OwnPublicationPanel\'s own existing wiring is unchanged');
        assert((viewCode.match(/function discoverOwnSnapshot\(/g) || []).length === 1,
            '35. there is exactly one discoverOwnSnapshot() function in WorldView.js — never forked into two near-identical copies for the two entry points');

        console.log('✓ Section I: architectural regression — neither UI file hashes bytes or constructs Arweave/Nostr/resolver collaborators directly, both call resolveSnapshotPublicationAttribution() from exactly one place each, both entry points share the exact same discoverOwnSnapshot() function, and Snapshot Distribution remains untouched');
    }

    console.log('\n✅ All World View Snapshot Attribution Integration tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
