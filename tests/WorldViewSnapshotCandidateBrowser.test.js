import { readFile } from 'node:fs/promises';

import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/DiscoverSnapshotCandidatesCommand.js';
import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';

// 0.9.151 — World View Snapshot Candidate Browser.
//
// 0.9.150 built `application/DiscoverSnapshotCandidatesCommand.js` —
// `discoveryTag -> candidate[]`, browsing-oriented and unranked — and
// deliberately stopped short of any UI (see that file's own header, "a UI
// candidate browser of any kind... a later, unscheduled UI milestone").
// This is that UI: `OwnPublicationPanel`'s own new "Discover Snapshots"
// action and candidate list, wired the identical way "Check Snapshot
// Match" (renamed from "Discover Snapshot" by this same milestone) and
// "Distribute Snapshot" already are.
//
// Section A: candidate discovery action — UI -> command -> discoveryTag,
//            proven through the real composed runtime, exactly the shape
//            ui/main.js itself wires.
// Section B: candidate collection presentation — every candidate the
//            command returns is stored/displayed.
// Section C: ordering — relay/application order survives into
//            presentation verbatim.
// Section D: empty discovery — [] is a legitimate, distinct result, never
//            an error.
// Section E: discovery failure — displayed without manufacturing a
//            Snapshot resolution/attribution result.
// Section F: state isolation — candidate discovery never overwrites
//            snapshotDiscoveryResult/snapshotAttributionResult, and
//            Check Snapshot Match never overwrites candidate state.
// Section G: selection — selecting a candidate changes only
//            selectedSnapshotCandidate.
// Section H: no implicit resolution — discovering or selecting a
//            candidate never calls DecentralizedSnapshotResolver.resolve().
// Section I: stale request protection — a changed publication/unmount
//            invalidates an in-flight candidate discovery call exactly
//            like the existing discovery/attribution actions.
// Section J: structural boundary — OwnPublicationPanel.js never touches
//            Nostr/ContentStore/crypto/Arweave directly, and
//            WorldView.js/ui/main.js wire the new command the same way
//            every sibling capability in this family already is.

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

// The EXACT shape ui/main.js's own wiring produces — a nullary function,
// discoveryTag baked in by composition, reusing whichever queryService
// composeDiscoverSnapshotRuntime() itself already built. Reproduced here
// for the identical reason tests/WorldViewOwnPublicationSnapshotDiscovery.test.js's
// own makeDiscoverOwnSnapshotAction() already is.
function makeDiscoverSnapshotCandidatesAction({ discoveryTag, discoveryQueryService }) {
    return () => executeDiscoverSnapshotCandidatesCommand({ discoveryTag, discoveryQueryService });
}

function panelCtx(overrides = {}) {
    return {
        publication: null,
        discoverSnapshotCommand: null,
        discoverSnapshotCandidatesCommand: null,
        snapshotDiscoveryExecuting: false,
        snapshotDiscoveryError: null,
        snapshotDiscoveryResult: null,
        snapshotDiscoveryRequestId: 0,
        snapshotAttributionResult: null,
        snapshotCandidateDiscoveryExecuting: false,
        snapshotCandidateDiscoveryError: null,
        snapshotCandidateDiscoveryResult: null,
        snapshotCandidateDiscoveryRequestId: 0,
        selectedSnapshotCandidate: null,
        discoverOwnSnapshot: OwnPublicationPanel.methods.discoverOwnSnapshot,
        discoverSnapshotCandidates: OwnPublicationPanel.methods.discoverSnapshotCandidates,
        selectSnapshotCandidate: OwnPublicationPanel.methods.selectSnapshotCandidate,
        ...overrides
    };
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    // Strips both `//` line comments and `<!-- -->` template comments —
    // OwnPublicationPanel.js's own template literal carries the latter,
    // and this file's own explanatory prose (both kinds) legitimately
    // names the very vocabulary this milestone forbids from actual
    // behavior/markup, e.g. "never labels a candidate 'best'."
    const withoutHtmlComments = text.replace(/<!--[\s\S]*?-->/g, '');
    return withoutHtmlComments.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — candidate discovery action: UI -> command ->
    // discoveryTag, through the real composed runtime.
    // ---------------------------------------------------------------
    {
        const network = makeNostrNetwork();
        const discoveryTag = 'section-a-candidate-browser';
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });
        await publisher.publish({ contentHash: 'hash-a', locator: 'ar://a', storage: 'ar' });

        const runtime = composeDiscoverSnapshotRuntime({
            arweaveContentStoreOptions: {},
            nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: network.queryImpl }
        });
        const action = makeDiscoverSnapshotCandidatesAction({ discoveryTag, discoveryQueryService: runtime.queryService });

        const ctx = panelCtx({ discoverSnapshotCandidatesCommand: action });
        ctx.discoverSnapshotCandidates();
        assert(ctx.snapshotCandidateDiscoveryExecuting === true, '1. the action enters executing state synchronously on click');

        await flushMicrotasks();

        assert(ctx.snapshotCandidateDiscoveryExecuting === false, '2. execution returns to idle once the command resolves');
        assert(ctx.snapshotCandidateDiscoveryError === null, '3. a successful call leaves no error notice');
        assert(Array.isArray(ctx.snapshotCandidateDiscoveryResult) && ctx.snapshotCandidateDiscoveryResult.length === 1,
            '4. the real discoveryTag reaches the real query service, and the announced candidate comes back');
        assert(ctx.snapshotCandidateDiscoveryResult[0].contentHash === 'hash-a', '5. the returned candidate is the one genuinely announced under this discoveryTag');

        // Sanity: the action needs no publication-shaped argument at all —
        // this call never supplied one.
        assert(ctx.publication === null, '6. sanity: candidate discovery completed with no publication in scope whatsoever');

        console.log('✓ Section A: the candidate discovery action reaches the real composed query service, keyed by discoveryTag alone — no publication required');
    }

    // ---------------------------------------------------------------
    // Section B — candidate collection presentation: every candidate is
    // stored/displayed.
    // ---------------------------------------------------------------
    {
        const fakeCandidates = Object.freeze([
            Object.freeze({ contentHash: 'hash-1', locator: 'ar://1', storage: 'ar' }),
            Object.freeze({ contentHash: 'hash-2', locator: 'ipfs://2', storage: 'ipfs' }),
            Object.freeze({ contentHash: 'hash-3', locator: 'ar://3', storage: 'ar' })
        ]);
        const action = () => Promise.resolve(fakeCandidates);
        const ctx = panelCtx({ discoverSnapshotCandidatesCommand: action });

        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();

        assert(ctx.snapshotCandidateDiscoveryResult === fakeCandidates, '7. the command\'s own result is stored verbatim — the exact same reference');
        assert(ctx.snapshotCandidateDiscoveryResult.length === 3, '8. every candidate the command returned is present — none dropped');

        console.log('✓ Section B: every candidate the command returns is stored/displayed, unmodified');
    }

    // ---------------------------------------------------------------
    // Section C — ordering: relay/application order survives into
    // presentation verbatim.
    // ---------------------------------------------------------------
    {
        const arrivalOrder = Object.freeze([
            { contentHash: 'hash-third', locator: 'ar://third', storage: 'ar' },
            { contentHash: 'hash-first', locator: 'ar://first', storage: 'ar' },
            { contentHash: 'hash-second', locator: 'ar://second', storage: 'ar' }
        ]);
        const ctx = panelCtx({ discoverSnapshotCandidatesCommand: () => Promise.resolve(arrivalOrder) });

        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();

        assert(ctx.snapshotCandidateDiscoveryResult[0].contentHash === 'hash-third' &&
            ctx.snapshotCandidateDiscoveryResult[1].contentHash === 'hash-first' &&
            ctx.snapshotCandidateDiscoveryResult[2].contentHash === 'hash-second',
            '9. arrival order survives into presentation verbatim — no alphabetical, hash, or any other sort is introduced by this UI');

        const panelSource = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        assert(!panelSource.includes('.sort(') , '10. OwnPublicationPanel.js never sorts the candidate collection');

        console.log('✓ Section C: relay/application order survives into presentation verbatim — the UI introduces no ranking of its own');
    }

    // ---------------------------------------------------------------
    // Section D — empty discovery: [] is a legitimate, distinct result.
    // ---------------------------------------------------------------
    {
        const emptyResult = Object.freeze([]);
        const ctx = panelCtx({ discoverSnapshotCandidatesCommand: () => Promise.resolve(emptyResult) });

        assert(ctx.snapshotCandidateDiscoveryResult === null, '11. sanity: before any call, the result is null — "never run," distinct from "ran, found nothing"');

        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();

        assert(ctx.snapshotCandidateDiscoveryResult === emptyResult, '12. an empty candidate array is stored as-is, never substituted with null/undefined');
        assert(ctx.snapshotCandidateDiscoveryError === null, '13. zero candidates is never reported as an error');

        console.log('✓ Section D: an empty discovery result ([]) is a legitimate, distinct state — never an error, never collapsed into "not yet run"');
    }

    // ---------------------------------------------------------------
    // Section E — discovery failure: displayed without manufacturing a
    // Snapshot resolution/attribution result.
    // ---------------------------------------------------------------
    {
        const ctx = panelCtx({
            discoverSnapshotCandidatesCommand: () => Promise.reject(new Error('the query service genuinely failed'))
        });

        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();

        assert(ctx.snapshotCandidateDiscoveryError !== null, '14. a genuine failure is surfaced as an error');
        assert(ctx.snapshotCandidateDiscoveryResult === null, '15. a failed call never fabricates a candidate collection');
        assert(ctx.snapshotDiscoveryResult === null, '16. a candidate discovery failure never manufactures a Snapshot resolution result');
        assert(ctx.snapshotAttributionResult === null, '17. a candidate discovery failure never manufactures a Snapshot attribution result');

        console.log('✓ Section E: a candidate discovery failure is displayed on its own field, without manufacturing any resolution/attribution result');
    }

    // ---------------------------------------------------------------
    // Section F — state isolation: the two families never overwrite one
    // another.
    // ---------------------------------------------------------------
    {
        const publication = new Publication({ id: 'pub-f', documentId: 'doc-f', contentReference: new ContentReference({ hash: 'hash-f', uri: 'ar://f', storage: 'ar' }) });
        const fakeResolution = Object.freeze({ outcome: 'RESOLVED', bytes: 'x', candidates: [], locator: 'ar://f', storage: 'ar', reason: null });
        const fakeCandidates = Object.freeze([{ contentHash: 'hash-f', locator: 'ar://f', storage: 'ar' }]);

        const ctx = panelCtx({
            publication,
            discoverSnapshotCommand: () => Promise.resolve(fakeResolution),
            discoverSnapshotCandidatesCommand: () => Promise.resolve(fakeCandidates)
        });

        // Check Snapshot Match first — must never touch candidate state.
        ctx.discoverOwnSnapshot();
        await flushMicrotasks();
        assert(ctx.snapshotDiscoveryResult === fakeResolution, '18. sanity: Check Snapshot Match completed');
        assert(ctx.snapshotCandidateDiscoveryResult === null, '19. Check Snapshot Match never writes snapshotCandidateDiscoveryResult');
        assert(ctx.snapshotCandidateDiscoveryExecuting === false, '20. Check Snapshot Match never touches snapshotCandidateDiscoveryExecuting');

        // Now Discover Snapshots — must never touch discovery/attribution
        // state that Check Snapshot Match already populated.
        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(ctx.snapshotCandidateDiscoveryResult === fakeCandidates, '21. sanity: Discover Snapshots completed');
        assert(ctx.snapshotDiscoveryResult === fakeResolution, '22. Discover Snapshots never overwrites the already-settled snapshotDiscoveryResult');
        assert(ctx.snapshotAttributionResult !== null && ctx.snapshotAttributionResult.outcome !== undefined,
            '23. sanity: snapshotAttributionResult, computed by Check Snapshot Match earlier, is still intact');

        console.log('✓ Section F: candidate discovery state and Check-Snapshot-Match/attribution state never overwrite one another, in either order');
    }

    // ---------------------------------------------------------------
    // Section G — selection changes only selection state.
    // ---------------------------------------------------------------
    {
        const candidateA = Object.freeze({ contentHash: 'hash-a', locator: 'ar://a', storage: 'ar' });
        const candidateB = Object.freeze({ contentHash: 'hash-b', locator: 'ipfs://b', storage: 'ipfs' });
        const ctx = panelCtx({ discoverSnapshotCandidatesCommand: () => Promise.resolve([candidateA, candidateB]) });

        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        const resultBefore = ctx.snapshotCandidateDiscoveryResult;

        assert(ctx.selectedSnapshotCandidate === null, '24. sanity: nothing is selected before a click');

        ctx.selectSnapshotCandidate(candidateB);

        assert(ctx.selectedSnapshotCandidate === candidateB, '25. selecting a candidate stores exactly that candidate');
        assert(ctx.snapshotCandidateDiscoveryResult === resultBefore, '26. selection never mutates the discovered candidate collection itself');
        assert(ctx.snapshotCandidateDiscoveryExecuting === false && ctx.snapshotCandidateDiscoveryError === null,
            '27. selection never re-enters an executing/error state — it performs no I/O of its own');

        ctx.selectSnapshotCandidate(candidateA);
        assert(ctx.selectedSnapshotCandidate === candidateA, '28. selecting a different candidate simply replaces the selection');

        console.log('✓ Section G: selecting a candidate changes only selectedSnapshotCandidate — nothing else');
    }

    // ---------------------------------------------------------------
    // Section H — no implicit resolution: discovering or selecting a
    // candidate never calls DecentralizedSnapshotResolver.resolve().
    // ---------------------------------------------------------------
    {
        let resolveCalls = 0;
        const network = makeNostrNetwork();
        const discoveryTag = 'section-h-no-implicit-resolution';
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });
        await publisher.publish({ contentHash: 'hash-h', locator: 'ar://h', storage: 'ar' });

        const runtime = composeDiscoverSnapshotRuntime({
            arweaveContentStoreOptions: {},
            nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: network.queryImpl }
        });
        // Wrap the REAL resolver this same runtime produced, spying on its
        // own resolve() — proving the candidate browser never reaches it,
        // not merely that this test never happened to call it.
        const originalResolve = runtime.resolver.resolve.bind(runtime.resolver);
        runtime.resolver.resolve = (...args) => {
            resolveCalls += 1;
            return originalResolve(...args);
        };

        const action = makeDiscoverSnapshotCandidatesAction({ discoveryTag, discoveryQueryService: runtime.queryService });
        const ctx = panelCtx({ discoverSnapshotCandidatesCommand: action });

        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();

        assert(ctx.snapshotCandidateDiscoveryResult.length === 1, 'H0. sanity: discovery genuinely found the announced candidate');
        assert(resolveCalls === 0, 'H1. discovering candidates never calls DecentralizedSnapshotResolver.resolve()');

        ctx.selectSnapshotCandidate(ctx.snapshotCandidateDiscoveryResult[0]);
        assert(resolveCalls === 0, 'H2. selecting a discovered candidate never calls DecentralizedSnapshotResolver.resolve() either');

        console.log('✓ Section H: neither discovering nor selecting a candidate ever calls DecentralizedSnapshotResolver.resolve() — verified against the real resolver instance');
    }

    // ---------------------------------------------------------------
    // Section I — stale request protection.
    // ---------------------------------------------------------------
    {
        let calls = 0;
        let resolveFirst;
        const publicationA = new Publication({ id: 'pub-i-a', documentId: 'doc-i-a' });
        const publicationB = new Publication({ id: 'pub-i-b', documentId: 'doc-i-b' });
        const ctx = panelCtx({
            publication: publicationA,
            discoverSnapshotCandidatesCommand: () => { calls += 1; return new Promise((resolve) => { resolveFirst = resolve; }); }
        });

        ctx.discoverSnapshotCandidates();
        assert(ctx.snapshotCandidateDiscoveryExecuting === true, '29. the first click enters executing state synchronously');
        ctx.discoverSnapshotCandidates();
        ctx.discoverSnapshotCandidates();
        await Promise.resolve();
        await Promise.resolve();
        assert(calls === 1, '30. clicking repeatedly while a call is in flight never starts a second, overlapping call');

        // Mirrors the existing publication watcher exactly, one operation
        // over — see tests/WorldViewOwnPublicationSnapshotDiscovery.test.js's
        // own Section F.
        OwnPublicationPanel.watch.publication.call(ctx, publicationB, publicationA);
        ctx.publication = publicationB;
        assert(ctx.snapshotCandidateDiscoveryExecuting === false, '31. a fresh publication resets executing state immediately, without waiting for the stale call');
        assert(ctx.snapshotCandidateDiscoveryError === null && ctx.snapshotCandidateDiscoveryResult === null,
            '32. a fresh publication also clears any prior candidate error/result');
        assert(ctx.selectedSnapshotCandidate === null, '33. a fresh publication also clears any prior selection');

        resolveFirst(Object.freeze([{ contentHash: 'stale', locator: 'ar://stale', storage: 'ar' }]));
        await flushMicrotasks();
        assert(ctx.snapshotCandidateDiscoveryExecuting === false, '34. the stale call\'s own resolution never re-enters executing state');
        assert(ctx.snapshotCandidateDiscoveryResult === null, '35. the stale call\'s own result never overwrites the new publication\'s state');

        // beforeUnmount() invalidates an in-flight call exactly like the
        // publication watcher does.
        let unmountCalls = 0;
        const unmountCtx = panelCtx({
            discoverSnapshotCandidatesCommand: () => { unmountCalls += 1; return new Promise(() => {}); }
        });
        unmountCtx.discoverSnapshotCandidates();
        assert(unmountCtx.snapshotCandidateDiscoveryExecuting === true, '36. sanity: a call is genuinely in flight before unmount');
        OwnPublicationPanel.beforeUnmount.call(unmountCtx);
        assert(unmountCtx.snapshotCandidateDiscoveryRequestId === 2, '37. beforeUnmount() invalidates the in-flight candidate discovery request id, mirroring the existing distribution/discovery invalidation');

        console.log('✓ Section I: a changed publication or an unmount invalidates an in-flight candidate discovery call exactly like the existing discovery/attribution actions');
    }

    // ---------------------------------------------------------------
    // Section J — structural boundary.
    // ---------------------------------------------------------------
    {
        const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        const forbiddenConstruction = [
            "from '../../content/ArweaveContentStore.js'",
            "from '../../application/NostrSnapshotDiscoveryQueryService.js'",
            "from '../../application/DecentralizedSnapshotResolver.js'",
            "from '../../application/DiscoverSnapshotCommand.js'",
            "from '../../application/DiscoverSnapshotCandidatesCommand.js'",
            "from '../../application/DiscoverSnapshotRuntimeComposition.js'",
            'new ArweaveContentStore(', 'new NostrSnapshotDiscoveryQueryService(', 'new DecentralizedSnapshotResolver(',
            'executeDiscoverSnapshotCommand(', 'executeDiscoverSnapshotCandidatesCommand(', 'composeDiscoverSnapshotRuntime(',
            'window.arweaveWallet', 'window.nostr', 'WebSocket', 'crypto.'
        ];
        for (const term of forbiddenConstruction) {
            assert(!panelCode.includes(term), `38. OwnPublicationPanel.js never imports or constructs '${term}'`);
        }
        assert((panelCode.match(/this\.discoverSnapshotCandidatesCommand\(/g) || []).length === 1,
            '39. discoverSnapshotCandidatesCommand is called from exactly one place');

        // No derived preference/ranking vocabulary over candidates.
        const forbiddenVocab = ['best', 'trusted', 'recommended', 'fastest', 'official', 'most reliable', 'rank', 'score'];
        const lowerPanelCode = panelCode.toLowerCase();
        for (const term of forbiddenVocab) {
            assert(!lowerPanelCode.includes(term), `40. OwnPublicationPanel.js introduces no "${term}" candidate-preference vocabulary`);
        }
        assert(!panelCode.includes('.filter(') && !panelCode.includes('new Set('),
            '41. OwnPublicationPanel.js performs no filtering or deduplication of the discovered candidate collection');

        const viewCode = await codeOnlySource('ui/views/WorldView.js');
        assert(viewCode.includes("const discoverSnapshotCandidatesCommand = inject('discoverSnapshotCandidatesCommand', null);"),
            '42. WorldView.js injects the app-wide discoverSnapshotCandidatesCommand');
        assert(/<OwnPublicationPanel[\s\S]{0,600}:discoverSnapshotCandidatesCommand="discoverSnapshotCandidatesCommand"/.test(viewCode),
            '43. OwnPublicationPanel is wired to the injected discoverSnapshotCandidatesCommand, mirroring the existing :discoverSnapshotCommand wiring');

        const mainCode = await codeOnlySource('ui/main.js');
        assert(mainCode.includes("app.provide('discoverSnapshotCandidatesCommand', discoverSnapshotCandidatesCommand)"),
            '44. ui/main.js provides discoverSnapshotCandidatesCommand app-wide');
        assert((mainCode.match(/composeDiscoverSnapshotRuntime\(/g) || []).length === 1,
            '45. ui/main.js composes the discovery runtime exactly once — the candidate command reuses that SAME composed queryService, never a second composition call');
        assert(mainCode.includes('queryService: snapshotDiscoveryQueryService'),
            '46. ui/main.js destructures the composed queryService by name, proving it is the same instance discoverSnapshotCommand\'s own resolver already wraps');

        console.log('✓ Section J: OwnPublicationPanel.js never touches Nostr/ContentStore/crypto/Arweave directly, introduces no candidate-preference vocabulary, and WorldView.js/ui/main.js wire the new command through the existing application seam alone');
    }

    console.log('\n✅ All World View Snapshot Candidate Browser tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
