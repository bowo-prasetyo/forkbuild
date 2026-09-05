import { readFile } from 'node:fs/promises';

import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { computeContentHash } from '../serializer/contentHash.js';

import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';
import { SnapshotPlacementStoreRegistry } from '../application/SnapshotPlacementStoreRegistry.js';
import { DecentralizedSnapshotResolver } from '../application/DecentralizedSnapshotResolver.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { executeResolveSelectedSnapshotCommand } from '../application/ResolveSelectedSnapshotCommand.js';

import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';

// 0.9.152 — Selected Snapshot Candidate Resolution.
//
// 0.9.151 gave World View a candidate browser that could DISCOVER and
// SELECT a candidate, but stopped deliberately short of resolving it —
// wiring `selectedSnapshotCandidate` into the pre-existing
// `resolve(discoveryTag, contentHash)` would silently let the resolver's
// own first-match rule pick a DIFFERENT candidate than the one the user
// selected, whenever more than one candidate shares a contentHash. This
// milestone closes that gap with a narrow, additive seam instead:
// `DecentralizedSnapshotResolver#resolveCandidate(candidate)`, resolving
// EXACTLY the candidate handed in — never a discovery search, never a
// re-selection.
//
//   Section A: the selected candidate is genuinely resolved
//   Section B: selection overrides discovery order — a later-discovered
//              candidate is resolved when it is the one selected, never
//              silently swapped for the first-discovered one
//   Section C: the candidate's exact locator reaches the ContentStore
//   Section D: verification — correct bytes produce RESOLVED
//   Section E: a false candidate — wrong bytes produce
//              CONTENT_HASH_MISMATCH
//   Section F: metadata cannot manufacture success — a candidate claiming
//              the right hash still fails when its own bytes disagree
//   Section G: resolve(discoveryTag, contentHash) is unchanged — still
//              first-match, still fully passing its own existing suite
//   Section H: no ranking — resolveCandidate() never looks at any
//              candidate other than the one supplied
//   Section I: no attribution — resolution never produces a
//              MATCH/NO_MATCH verdict of its own
//   Section J: UI state isolation — selected-candidate resolution never
//              overwrites candidate discovery or Check-Snapshot-Match/
//              attribution state, and vice versa
//   Section K: stale request protection — a changed publication/unmount
//              invalidates an in-flight selected-candidate resolution
//   Section L: application command boundary — throws synchronously for a
//              malformed resolver, forwards verbatim, propagates a
//              genuine rejection unchanged
//   Section M: architectural regression — one candidate->retrieval->
//              verification path, never two; the UI never substitutes a
//              bare contentHash for the candidate object

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch { threw = true; }
    assert(threw, message);
}

async function expectRejects(promiseFactory, message) {
    let threw = false;
    try { await promiseFactory(); } catch { threw = true; }
    assert(threw, message);
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
        return { id: `fake-selected-tx-${counter}`, transaction: { id: `fake-selected-tx-${counter}`, data: material } };
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

function makeScenario() {
    const gateway = makeFakeArweaveGateway();
    const signer = makeFakeArweaveSigner();
    const store = new ArweaveContentStore({ signer, fetchImpl: gateway.fetchImpl });
    const network = makeNostrNetwork();
    const registry = new SnapshotPlacementStoreRegistry();
    registry.register(store);
    const query = new NostrSnapshotDiscoveryQueryService({ queryImpl: network.queryImpl });
    const resolver = new DecentralizedSnapshotResolver(query);
    return { gateway, signer, store, network, registry, query, resolver };
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    const withoutHtmlComments = text.replace(/<!--[\s\S]*?-->/g, '');
    return withoutHtmlComments.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

function panelCtx(overrides = {}) {
    return {
        publication: null,
        discoverSnapshotCommand: null,
        discoverSnapshotCandidatesCommand: null,
        resolveSelectedSnapshotCommand: null,
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
        selectedSnapshotResolutionExecuting: false,
        selectedSnapshotResolutionError: null,
        selectedSnapshotResolutionResult: null,
        selectedSnapshotResolutionRequestId: 0,
        discoverOwnSnapshot: OwnPublicationPanel.methods.discoverOwnSnapshot,
        discoverSnapshotCandidates: OwnPublicationPanel.methods.discoverSnapshotCandidates,
        selectSnapshotCandidate: OwnPublicationPanel.methods.selectSnapshotCandidate,
        resolveSelectedSnapshot: OwnPublicationPanel.methods.resolveSelectedSnapshot,
        ...overrides
    };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — the selected candidate is genuinely resolved.
    // ---------------------------------------------------------------
    {
        const { store, registry, resolver } = makeScenario();
        const bytes = 'bytes belonging to the one candidate this call explicitly selects';
        const reference = await store.put(bytes);
        const candidate = { contentHash: reference.hash, locator: reference.uri, storage: reference.storage };

        const result = await resolver.resolveCandidate(candidate, { storeRegistry: registry });

        assert(result.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, '1a. resolveCandidate() resolves the exact candidate handed in');
        assert(result.bytes === bytes, '1b. the resolved bytes are exactly the selected candidate\'s own bytes');
        assert(result.locator === reference.uri, '1c. the reported locator is exactly the selected candidate\'s own locator');

        console.log('✓ A. resolveCandidate() genuinely retrieves and verifies the candidate handed in');
    }

    // ---------------------------------------------------------------
    // Section B — selection overrides discovery order.
    // ---------------------------------------------------------------
    {
        const { store, registry, network, query, resolver } = makeScenario();
        const discoveryTag = 'section-b-selection-overrides-order';

        // Two independent candidates share ONE contentHash — the exact
        // situation where resolve(contentHash) and resolveCandidate(one
        // of them) can diverge.
        const sharedBytes = 'bytes shared by two independently-placed candidates';
        const referenceA = await store.put(sharedBytes);
        const decoyBytesB = 'a SECOND, completely different placement, coincidentally announced under the same contentHash claim';
        const referenceB = await store.put(decoyBytesB);

        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });
        // A is announced FIRST — resolve(discoveryTag, contentHash) would
        // pick A. B is announced SECOND, claiming the same contentHash A
        // actually has (a false claim on B's own part), yet still exists
        // as a real, retrievable locator.
        await publisher.publish({ contentHash: referenceA.hash, locator: referenceA.uri, storage: referenceA.storage });
        await publisher.publish({ contentHash: referenceA.hash, locator: referenceB.uri, storage: referenceB.storage });

        const discovered = await query.search(discoveryTag);
        assert(discovered.length === 2, 'B0. sanity: both candidates were genuinely announced');

        const candidateA = { contentHash: discovered[0].contentHash, locator: discovered[0].locator, storage: discovered[0].storage };
        const candidateB = { contentHash: discovered[1].contentHash, locator: discovered[1].locator, storage: discovered[1].storage };
        assert(candidateA.locator === referenceA.uri, 'B0b. sanity: candidateA is the FIRST-discovered one — the one resolve() would pick');

        // The USER selects candidateB (the second-discovered one).
        // resolveCandidate() must resolve candidateB — never silently
        // substitute candidateA merely because it arrived first.
        const result = await resolver.resolveCandidate(candidateB, { storeRegistry: registry });

        assert(result.locator === referenceB.uri, '2a. the SELECTED candidate\'s own locator is the one attempted — never the first-discovered one');
        assert(result.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH,
            '2b. candidateB\'s own bytes do not actually match its claimed contentHash, so resolving it (rather than candidateA) genuinely produces a DIFFERENT, correct outcome — proof this call really reached candidateB\'s own locator, not candidateA\'s');

        // For contrast: resolving candidateA (the first-discovered one)
        // against the SAME resolver succeeds, proving the divergence
        // above is real and not an artifact of a broken store/registry.
        const controlResult = await resolver.resolveCandidate(candidateA, { storeRegistry: registry });
        assert(controlResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, '2c. control: the first-discovered candidate genuinely does resolve successfully');
        assert(controlResult.bytes === sharedBytes, '2d. control: and returns its own real bytes');

        console.log('✓ B. selecting the SECOND-discovered candidate resolves that one specifically — discovery order never overrides an explicit selection');
    }

    // ---------------------------------------------------------------
    // Section C — the candidate's exact locator reaches the ContentStore.
    // ---------------------------------------------------------------
    {
        const { registry, resolver } = makeScenario();
        let receivedReference = null;
        const spyStore = {
            storage: 'ar',
            async put() { throw new Error('put() must never be called by resolveCandidate()'); },
            async get(reference) {
                receivedReference = reference;
                return 'spied-bytes';
            }
        };
        const spyRegistry = new SnapshotPlacementStoreRegistry();
        spyRegistry.register(spyStore);

        const candidate = { contentHash: computeContentHash('spied-bytes'), locator: 'ar://exact-locator-under-test', storage: 'ar' };
        const result = await resolver.resolveCandidate(candidate, { storeRegistry: spyRegistry });

        assert(receivedReference !== null, '3a. the content store was genuinely consulted');
        assert(receivedReference.uri === 'ar://exact-locator-under-test', '3b. the EXACT candidate locator reaches the content store — never rewritten, normalized, or substituted');
        assert(receivedReference.hash === candidate.contentHash, '3c. the reference carries the candidate\'s own declared contentHash');
        assert(result.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, '3d. sanity: the spied call round-trips to a real RESOLVED outcome');

        console.log('✓ C. the selected candidate\'s exact locator (and declared contentHash) reaches the ContentStore, unmodified');
    }

    // ---------------------------------------------------------------
    // Section D — verification: correct bytes produce RESOLVED.
    // ---------------------------------------------------------------
    {
        const { store, registry, resolver } = makeScenario();
        const bytes = 'genuinely correct bytes for this candidate';
        const reference = await store.put(bytes);
        const candidate = { contentHash: reference.hash, locator: reference.uri, storage: reference.storage };

        const result = await resolver.resolveCandidate(candidate, { storeRegistry: registry });
        assert(result.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, '4a. correct bytes produce RESOLVED');
        assert(computeContentHash(result.bytes) === candidate.contentHash, '4b. the resolved bytes genuinely hash to the candidate\'s own declared contentHash');

        console.log('✓ D. correct bytes produce a genuinely verified RESOLVED outcome');
    }

    // ---------------------------------------------------------------
    // Section E — a false candidate: wrong bytes produce
    // CONTENT_HASH_MISMATCH.
    // ---------------------------------------------------------------
    {
        const { store, registry, resolver } = makeScenario();
        const decoyBytes = 'decoy bytes that really exist at their own real locator';
        const decoyReference = await store.put(decoyBytes);
        const claimedHash = computeContentHash('bytes that were never actually placed anywhere');

        const falseCandidate = { contentHash: claimedHash, locator: decoyReference.uri, storage: decoyReference.storage };
        const result = await resolver.resolveCandidate(falseCandidate, { storeRegistry: registry });

        assert(result.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH, '5a. a false candidate reports CONTENT_HASH_MISMATCH');
        assert(result.bytes === null, '5b. bytes is null on CONTENT_HASH_MISMATCH — the wrong bytes are never handed back as if they were the Snapshot');

        console.log('✓ E. a false candidate (real locator, wrong declared contentHash) reports CONTENT_HASH_MISMATCH, never RESOLVED');
    }

    // ---------------------------------------------------------------
    // Section F — metadata cannot manufacture success.
    // ---------------------------------------------------------------
    {
        const { registry, resolver } = makeScenario();
        // A candidate claiming a correct-LOOKING contentHash whose own
        // locator serves bytes that genuinely disagree with it.
        const spyStore = { storage: 'ar', async put() { throw new Error('unused'); }, async get() { return 'the actual bytes at this locator'; } };
        const attackRegistry = new SnapshotPlacementStoreRegistry();
        attackRegistry.register(spyStore);

        const candidate = {
            contentHash: computeContentHash('bytes the candidate CLAIMS are here, but are not'),
            locator: 'ar://a-locator-that-serves-something-else',
            storage: 'ar'
        };
        const result = await resolver.resolveCandidate(candidate, { storeRegistry: attackRegistry });

        assert(result.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH,
            '6a. a candidate\'s own declared contentHash is a claim, never evidence — disagreement with the actually-retrieved bytes is still caught');
        assert(result.bytes === null, '6b. no bytes are surfaced when the claim disagrees with reality');

        console.log('✓ F. a candidate\'s own claimed metadata never manufactures success when its actual bytes disagree');
    }

    // ---------------------------------------------------------------
    // Section G — resolve(discoveryTag, contentHash) is unchanged.
    // ---------------------------------------------------------------
    {
        const { store, registry, network, resolver } = makeScenario();
        const discoveryTag = 'section-g-resolve-unchanged';
        const bytes = 'bytes resolved through the pre-existing, first-match resolve() path';
        const reference = await store.put(bytes);
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });
        await publisher.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });

        const result = await resolver.resolve(discoveryTag, reference.hash, { storeRegistry: registry });
        assert(result.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, '7a. resolve() still succeeds exactly as before');
        assert(result.bytes === bytes, '7b. resolve() still returns the correct bytes');
        assert(Array.isArray(result.candidates) && result.candidates.length === 1, '7c. resolve() still reports the full discovered candidate set');

        const notDiscovered = await resolver.resolve(discoveryTag, 'a-hash-nobody-announced', { storeRegistry: registry });
        assert(notDiscovered.outcome === DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED, '7d. resolve() still reports NOT_DISCOVERED for an unannounced contentHash');

        console.log('✓ G. resolve(discoveryTag, contentHash) is behaviorally unchanged by adding resolveCandidate()');
    }

    // ---------------------------------------------------------------
    // Section H — no ranking: resolveCandidate() never looks at any
    // candidate other than the one supplied.
    // ---------------------------------------------------------------
    {
        const { store, registry, resolver } = makeScenario();
        const bytes = 'bytes for the no-ranking check';
        const reference = await store.put(bytes);
        const candidate = { contentHash: reference.hash, locator: reference.uri, storage: reference.storage };

        // No discoveryTag, no query service call of any kind is possible
        // here — resolveCandidate() takes no discoveryTag parameter at
        // all, so there is structurally nothing to rank or select among.
        const result = await resolver.resolveCandidate(candidate, { storeRegistry: registry });
        assert(result.candidates.length === 1 && result.candidates[0] === candidate, '8a. the result names exactly the one candidate supplied — never a set to choose among');

        const resolverCode = await codeOnlySource('application/DecentralizedSnapshotResolver.js');
        assert((resolverCode.match(/this\._queryService\.search\(/g) || []).length === 1,
            '8b. queryService.search() is still called from exactly one place (resolve()\'s own DISCOVERY step) — resolveCandidate() never calls it');

        console.log('✓ H. resolveCandidate() has no discovery/ranking step of its own — there is nothing to rank among');
    }

    // ---------------------------------------------------------------
    // Section I — no attribution.
    // ---------------------------------------------------------------
    {
        const { store, registry, resolver } = makeScenario();
        const bytes = 'bytes for the no-attribution check';
        const reference = await store.put(bytes);
        const candidate = { contentHash: reference.hash, locator: reference.uri, storage: reference.storage };

        const result = await resolver.resolveCandidate(candidate, { storeRegistry: registry });
        assert(!('attribution' in result), '9a. the result carries no attribution field of any kind');
        assert(result.outcome !== 'MATCH' && result.outcome !== 'NO_MATCH', '9b. the outcome is never MATCH/NO_MATCH — that vocabulary belongs to SnapshotPublicationAttribution alone');

        const resolverCode = await codeOnlySource('application/DecentralizedSnapshotResolver.js');
        const commandCode = await codeOnlySource('application/ResolveSelectedSnapshotCommand.js');
        for (const code of [resolverCode, commandCode]) {
            assert(!/\bMATCH\b|\bNO_MATCH\b|\bATTRIBUTION\b/.test(code), '9c. neither file references the uppercase MATCH/NO_MATCH/ATTRIBUTION outcome vocabulary — that belongs to SnapshotPublicationAttribution alone (lowercase prose like "does not match" is unaffected)');
        }

        console.log('✓ I. resolving a selected candidate never produces or implies a Publication-attribution verdict');
    }

    // ---------------------------------------------------------------
    // Section J — UI state isolation.
    // ---------------------------------------------------------------
    {
        const publication = new Publication({ id: 'pub-j', documentId: 'doc-j', contentReference: new ContentReference({ hash: 'hash-j', uri: 'ar://j', storage: 'ar' }) });
        const fakeResolution = Object.freeze({ outcome: 'RESOLVED', bytes: 'x', candidates: [], locator: 'ar://j', storage: 'ar', reason: null });
        const fakeCandidates = Object.freeze([{ contentHash: 'hash-j', locator: 'ar://j', storage: 'ar' }]);
        const fakeSelectedResolution = Object.freeze({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: 'y', candidates: [fakeCandidates[0]], locator: 'ar://j', storage: 'ar', reason: null });

        const ctx = panelCtx({
            publication,
            discoverSnapshotCommand: () => Promise.resolve(fakeResolution),
            discoverSnapshotCandidatesCommand: () => Promise.resolve(fakeCandidates),
            resolveSelectedSnapshotCommand: () => Promise.resolve(fakeSelectedResolution)
        });

        // Populate discovery/attribution first.
        ctx.discoverOwnSnapshot();
        await flushMicrotasks();
        assert(ctx.snapshotDiscoveryResult === fakeResolution, '10a. sanity: Check Snapshot Match completed');

        // Then candidate discovery + selection.
        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        ctx.selectSnapshotCandidate(fakeCandidates[0]);
        assert(ctx.selectedSnapshotCandidate === fakeCandidates[0], '10b. sanity: a candidate is selected');

        // Now resolve the selected candidate.
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();

        assert(ctx.selectedSnapshotResolutionResult === fakeSelectedResolution, '11. sanity: selected-candidate resolution completed');
        assert(ctx.snapshotDiscoveryResult === fakeResolution, '12. resolving the selected candidate never overwrites snapshotDiscoveryResult');
        assert(ctx.snapshotAttributionResult !== null, '13. resolving the selected candidate never clears the earlier attribution result');
        assert(ctx.snapshotCandidateDiscoveryResult === fakeCandidates, '14. resolving the selected candidate never overwrites the discovered candidate collection');
        assert(ctx.selectedSnapshotCandidate === fakeCandidates[0], '15. resolving the selected candidate never clears the selection itself');

        console.log('✓ J. selected-candidate resolution state is fully isolated from candidate discovery, Check Snapshot Match, and attribution state');
    }

    // ---------------------------------------------------------------
    // Section J2 — selecting a DIFFERENT candidate invalidates a prior
    // selected-candidate resolution result.
    // ---------------------------------------------------------------
    {
        const candidateA = Object.freeze({ contentHash: 'hash-a', locator: 'ar://a', storage: 'ar' });
        const candidateB = Object.freeze({ contentHash: 'hash-b', locator: 'ipfs://b', storage: 'ipfs' });
        const fakeResult = Object.freeze({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: 'a-bytes', candidates: [candidateA], locator: 'ar://a', storage: 'ar', reason: null });

        const ctx = panelCtx({
            selectedSnapshotCandidate: candidateA,
            resolveSelectedSnapshotCommand: () => Promise.resolve(fakeResult)
        });

        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotResolutionResult === fakeResult, '16. sanity: resolution of candidateA completed');

        ctx.selectSnapshotCandidate(candidateB);
        assert(ctx.selectedSnapshotResolutionResult === null, '17. selecting a DIFFERENT candidate clears the stale resolution result belonging to the old selection');
        assert(ctx.selectedSnapshotResolutionError === null, '18. and clears any stale error the same way');

        // Re-selecting the SAME candidate that is already selected is a
        // no-op — no needless reset while nothing actually changed.
        ctx.selectSnapshotCandidate(candidateB);
        ctx.selectedSnapshotResolutionResult = fakeResult; // simulate a result already computed for B
        ctx.selectSnapshotCandidate(candidateB);
        assert(ctx.selectedSnapshotResolutionResult === fakeResult, '19. re-selecting the SAME already-selected candidate never resets an existing resolution result');

        console.log('✓ J2. selecting a different candidate invalidates the prior selection\'s resolution result; re-selecting the same candidate does not');
    }

    // ---------------------------------------------------------------
    // Section K — stale request protection.
    // ---------------------------------------------------------------
    {
        let calls = 0;
        let resolveFirst;
        const candidate = Object.freeze({ contentHash: 'hash-k', locator: 'ar://k', storage: 'ar' });
        const publicationA = new Publication({ id: 'pub-k-a', documentId: 'doc-k-a' });
        const publicationB = new Publication({ id: 'pub-k-b', documentId: 'doc-k-b' });

        const ctx = panelCtx({
            publication: publicationA,
            selectedSnapshotCandidate: candidate,
            resolveSelectedSnapshotCommand: () => { calls += 1; return new Promise((resolve) => { resolveFirst = resolve; }); }
        });

        ctx.resolveSelectedSnapshot();
        assert(ctx.selectedSnapshotResolutionExecuting === true, '20. the first click enters executing state synchronously');
        ctx.resolveSelectedSnapshot();
        ctx.resolveSelectedSnapshot();
        await Promise.resolve();
        await Promise.resolve();
        assert(calls === 1, '21. clicking repeatedly while a call is in flight never starts a second, overlapping call');

        OwnPublicationPanel.watch.publication.call(ctx, publicationB, publicationA);
        ctx.publication = publicationB;
        assert(ctx.selectedSnapshotResolutionExecuting === false, '22. a fresh publication resets selected-candidate resolution executing state immediately');
        assert(ctx.selectedSnapshotResolutionError === null && ctx.selectedSnapshotResolutionResult === null,
            '23. a fresh publication also clears any prior selected-candidate resolution error/result');
        assert(ctx.selectedSnapshotCandidate === null, '24. a fresh publication also clears the selection itself, exactly as 0.9.151 already established');

        resolveFirst(Object.freeze({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: 'stale', candidates: [candidate], locator: 'ar://k', storage: 'ar', reason: null }));
        await flushMicrotasks();
        assert(ctx.selectedSnapshotResolutionExecuting === false, '25. the stale call\'s own resolution never re-enters executing state');
        assert(ctx.selectedSnapshotResolutionResult === null, '26. the stale call\'s own result never overwrites the new publication\'s state');

        let unmountCalls = 0;
        const unmountCtx = panelCtx({
            selectedSnapshotCandidate: candidate,
            resolveSelectedSnapshotCommand: () => { unmountCalls += 1; return new Promise(() => {}); }
        });
        unmountCtx.resolveSelectedSnapshot();
        assert(unmountCtx.selectedSnapshotResolutionExecuting === true, '27. sanity: a call is genuinely in flight before unmount');
        OwnPublicationPanel.beforeUnmount.call(unmountCtx);
        assert(unmountCtx.selectedSnapshotResolutionRequestId === 2, '28. beforeUnmount() invalidates the in-flight selected-candidate resolution request id');

        console.log('✓ K. a changed publication or an unmount invalidates an in-flight selected-candidate resolution exactly like every other action in this panel');
    }

    // ---------------------------------------------------------------
    // Section L — application command boundary.
    // ---------------------------------------------------------------
    {
        expectThrows(() => executeResolveSelectedSnapshotCommand({ candidate: {} }),
            '29. no resolver supplied — throws synchronously');
        expectThrows(() => executeResolveSelectedSnapshotCommand({ candidate: {}, resolver: {} }),
            '30. a resolver with no resolveCandidate() function — throws synchronously');

        let receivedCandidate = null;
        let receivedOptions = null;
        const fakeResult = Object.freeze({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: 'the-bytes', candidates: [], locator: 'ar://fake', storage: 'ar', reason: null });
        const resolver = {
            resolveCandidate(candidate, options) {
                receivedCandidate = candidate;
                receivedOptions = options;
                return Promise.resolve(fakeResult);
            }
        };
        const candidate = { contentHash: 'abc', locator: 'ar://abc', storage: 'ar' };
        const contentStore = { storage: 'ar' };
        const storeRegistry = { get() { return null; } };

        const result = await executeResolveSelectedSnapshotCommand({ candidate, resolver, contentStore, storeRegistry });
        assert(receivedCandidate === candidate, '31. the candidate object is forwarded verbatim — the exact same reference');
        assert(receivedOptions.contentStore === contentStore && receivedOptions.storeRegistry === storeRegistry, '32. contentStore/storeRegistry are forwarded verbatim');
        assert(result === fakeResult, '33. the resolver\'s own result is returned unchanged');

        const rejectingResolver = { resolveCandidate: () => Promise.reject(new Error('the resolver genuinely failed to resolve this candidate')) };
        await expectRejects(
            () => executeResolveSelectedSnapshotCommand({ candidate, resolver: rejectingResolver }),
            '34. a genuine rejection from the resolver propagates unchanged'
        );

        console.log('✓ L. executeResolveSelectedSnapshotCommand() is a pure assembly boundary — synchronous validation, verbatim forwarding, unchanged propagation');
    }

    // ---------------------------------------------------------------
    // Section M — architectural regression.
    // ---------------------------------------------------------------
    {
        const resolverCode = await codeOnlySource('application/DecentralizedSnapshotResolver.js');
        assert((resolverCode.match(/new ContentReference\(/g) || []).length === 1,
            '35. exactly ONE place constructs a ContentReference for retrieval — resolve() delegates to resolveCandidate() rather than duplicating that logic');
        assert((resolverCode.match(/\.verify\(bytes\)/g) || []).length === 1,
            '36. exactly ONE verification call site exists — one actual candidate->retrieval->verification path, never two');
        assert((resolverCode.match(/async resolveCandidate\(/g) || []).length === 1, '37. resolveCandidate() is defined exactly once');

        const commandCode = await codeOnlySource('application/ResolveSelectedSnapshotCommand.js');
        assert(!/^import /m.test(commandCode), '38. ResolveSelectedSnapshotCommand.js imports nothing — no resolver class, no ContentStore, no query service');
        assert(!/new ArweaveContentStore|new NostrSnapshotDiscoveryQueryService|new DecentralizedSnapshotResolver|executeDiscoverSnapshotCommand|executeDiscoverSnapshotCandidatesCommand/.test(commandCode),
            '39. ResolveSelectedSnapshotCommand.js never constructs infrastructure or calls the other discovery/resolution commands');
        assert((commandCode.match(/resolver\.resolveCandidate\(/g) || []).length === 1, '40. resolver.resolveCandidate() is called from exactly one place');

        const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        assert((panelCode.match(/this\.resolveSelectedSnapshotCommand\(/g) || []).length === 1, '41. resolveSelectedSnapshotCommand is called from exactly one place');
        assert(panelCode.includes('this.resolveSelectedSnapshotCommand(candidate)'),
            '42. OwnPublicationPanel.js calls resolveSelectedSnapshotCommand with the CANDIDATE OBJECT — never candidate.contentHash or any other derived string');
        assert(!/this\.resolveSelectedSnapshotCommand\([^)]*\.contentHash/.test(panelCode),
            '43. OwnPublicationPanel.js never extracts a bare contentHash before calling resolveSelectedSnapshotCommand');
        for (const term of ['new ArweaveContentStore(', 'new NostrSnapshotDiscoveryQueryService(', 'new DecentralizedSnapshotResolver(', 'executeResolveSelectedSnapshotCommand(']) {
            assert(!panelCode.includes(term), `44. OwnPublicationPanel.js never constructs/calls '${term}' directly`);
        }

        const viewCode = await codeOnlySource('ui/views/WorldView.js');
        assert(viewCode.includes("const resolveSelectedSnapshotCommand = inject('resolveSelectedSnapshotCommand', null);"),
            '45. WorldView.js injects the app-wide resolveSelectedSnapshotCommand');
        assert(/<OwnPublicationPanel[\s\S]{0,700}:resolveSelectedSnapshotCommand="resolveSelectedSnapshotCommand"/.test(viewCode),
            '46. OwnPublicationPanel is wired to the injected resolveSelectedSnapshotCommand');

        const mainCode = await codeOnlySource('ui/main.js');
        assert(mainCode.includes("app.provide('resolveSelectedSnapshotCommand', resolveSelectedSnapshotCommand)"),
            '47. ui/main.js provides resolveSelectedSnapshotCommand app-wide');
        assert((mainCode.match(/composeDiscoverSnapshotRuntime\(/g) || []).length === 1,
            '48. ui/main.js still composes the discovery runtime exactly once — selected-candidate resolution reuses the SAME resolver/content store, never a second composition call');
        assert(mainCode.includes('resolver: snapshotResolver') && (mainCode.match(/resolver: snapshotResolver/g) || []).length >= 1,
            '49. the selected-candidate command is wired to the SAME snapshotResolver instance discoverSnapshotCommand already uses');

        console.log('✓ M. architectural regression — one candidate->retrieval->verification path, never two; the UI always passes the candidate object itself, never a derived contentHash');
    }

    console.log('\n✅ All Selected Snapshot Candidate Resolution tests passed.');
}

await run();
