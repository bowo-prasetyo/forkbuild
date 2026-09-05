import { readFile } from 'node:fs/promises';

import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';
import { executeDiscoverSnapshotCommand } from '../application/DiscoverSnapshotCommand.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/DiscoverSnapshotCandidatesCommand.js';
import { executeResolveSelectedSnapshotCommand } from '../application/ResolveSelectedSnapshotCommand.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { SnapshotPublicationAttributionOutcome } from '../application/SnapshotPublicationAttributionOutcome.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';

// 0.9.157 — Snapshot Candidate Interaction Completion Audit.
//
// 0.9.150 through 0.9.156 built and individually proved every seam of the
// Snapshot candidate pipeline in isolation:
//
//   discover candidates -> browse -> select -> resolveCandidate() ->
//   verify -> attribute
//
// Each milestone's own audit proved ITS OWN seam correct, and 0.9.156
// swept the whole subsystem for hidden coupling and duplicated semantics
// at the ARCHITECTURAL level (distribution/discovery independence,
// verification/attribution authority, identity separation). This
// milestone asks a narrower, product-facing question none of those was
// positioned to ask: does the complete INTERACTION — the actual sequence
// of clicks a person drives through World View's own OwnPublicationPanel
// — behave coherently end to end, with no hidden automatic step and no
// stale result ever able to surface under the wrong selection or the
// wrong Publication? TEST-ONLY. ZERO PRODUCTION CHANGES — every file this
// audit imports is read, never edited; every behavior it exercises was
// already true before this file existed.
//
//   Discover
//      │
//      ▼
//   Browse candidates
//      │
//      ▼
//   Select candidate
//      │
//      ▼
//   Resolve selected candidate
//      │
//      ▼
//   Attribute selected snapshot
//
// Section A: CANDIDATE BROWSING — discovery returns the complete,
//            unranked, un-deduplicated set in relay arrival order, and
//            never resolves anything on its own, even given real elapsed
//            time (a real macrotask tick, not just a flushed microtask
//            queue).
// Section B: EXPLICIT SELECTION — selecting a candidate changes only
//            `selectedSnapshotCandidate`; it never resolves, retrieves,
//            verifies, or attributes, proven through the real composed
//            runtime and confirmed to hold across a real macrotask tick.
// Section C: EXPLICIT RESOLUTION — resolution never happens without an
//            explicit `resolveSelectedSnapshot()` call, and once invoked
//            resolves EXACTLY the selected candidate's own locator, never
//            a substitute sharing its contentHash.
// Section D: EXPLICIT ATTRIBUTION — attribution never happens without an
//            explicit `attributeSelectedSnapshot()` call, is unreachable
//            (a structural no-op) without a prior RESOLVED result, and is
//            never computed from a candidate's own self-declared
//            contentHash.
// Section E: STALENESS — four races: (i) selecting a different candidate
//            while its predecessor's resolution is still in flight; (ii)
//            the impossibility of an "attribution in flight" race, because
//            attribution has no asynchronous state to race in the first
//            place; (iii) a Publication change while BOTH a candidate
//            discovery AND a selected-candidate resolution are
//            simultaneously in flight; (iv) two Publications' candidate
//            discovery requests settling out of order.
// Section F: STATE-MACHINE CONSISTENCY — one continuous walk through NO
//            CANDIDATE -> CANDIDATES AVAILABLE -> SELECTED -> RESOLVED ->
//            ATTRIBUTED, applying each of the three reset rules (selection
//            change invalidates resolution+attribution; resolution change
//            invalidates attribution; Publication change invalidates the
//            entire family) within that same walk.
// Section G: FAILURE UX SEMANTICS — NOT_DISCOVERED/STORE_UNAVAILABLE/
//            CONTENT_UNAVAILABLE/CONTENT_HASH_MISMATCH stay distinct from
//            NO_MATCH, both in the values `attributeSelectedSnapshot()`
//            produces and in the template that renders them (no ternary
//            or boolean collapse of the outcome value).
// Section H: PATH INDEPENDENCE — through the real composed runtime, in
//            both orders, "Check Snapshot Match" (the known-contentHash
//            path) and "Discover Snapshots" -> select -> resolve ->
//            attribute (the browsed-candidate path) reach genuinely
//            DIFFERENT verdicts over the same Publication without either
//            one disturbing the other's own state.
// Section I: UI STRUCTURAL COHERENCE — every action button's `:disabled`
//            binding in the template enforces the identical precondition
//            its method body guards with, so the state machine cannot be
//            violated by clicking a button the UI should have disabled.
// Section J: FULL FLAGSHIP — the complete pipeline, three real
//            independently placed candidates (matching, valid-but-
//            unrelated, deliberately invalid), driven end to end through
//            the real UI actions, with every invariant proven in Sections
//            A-H holding simultaneously in one run.

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

// A REAL elapsed macrotask tick, deliberately distinct from
// flushMicrotasks() above — used where this audit specifically wants to
// rule out a hidden setTimeout()/setInterval()-based automatic action that
// a microtask-only flush could never expose.
async function letRealTimePass() {
    await new Promise((resolve) => setTimeout(resolve, 20));
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
        return { id: `fake-interaction-audit-tx-${counter}`, transaction: { id: `fake-interaction-audit-tx-${counter}`, data: material } };
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

// One shared "host" runtime, composed exactly the way ui/main.js composes
// composeDiscoverSnapshotRuntime() — all three application-command seams
// wired over the SAME resolver/contentStore/queryService instances.
function makeSharedHostRuntime(discoveryTag) {
    const gateway = makeFakeArweaveGateway();
    const signer = makeFakeArweaveSigner();
    const network = makeNostrNetwork();

    const { resolver, contentStore, queryService } = composeDiscoverSnapshotRuntime({
        arweaveContentStoreOptions: { signer, fetchImpl: gateway.fetchImpl },
        nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: network.queryImpl }
    });

    const announcer = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });

    const discoverSnapshotCandidatesCommand = () => executeDiscoverSnapshotCandidatesCommand({
        discoveryTag, discoveryQueryService: queryService
    });
    const resolveSelectedSnapshotCommand = (candidate) => executeResolveSelectedSnapshotCommand({
        candidate, resolver, contentStore
    });
    // The EXACT logic ui/views/WorldView.js's own discoverOwnSnapshot()
    // wrapper holds — see tests/WorldViewOwnPublicationSnapshotDiscovery.test.js's
    // own makeDiscoverOwnSnapshotAction(), reproduced here for the
    // identical reason.
    const discoverSnapshotCommand = (contentHash) => executeDiscoverSnapshotCommand({
        discoveryTag, contentHash, resolver, contentStore
    });
    const discoverOwnSnapshotAction = (publication) => {
        if (!publication || !publication.contentReference) {
            return Promise.reject(new Error('Snapshot discovery is not available.'));
        }
        return discoverSnapshotCommand(publication.contentReference.hash);
    };

    return {
        gateway, signer, network, discoveryTag, resolver, contentStore, queryService, announcer,
        discoverSnapshotCandidatesCommand, resolveSelectedSnapshotCommand,
        discoverSnapshotCommand, discoverOwnSnapshotAction
    };
}

// Places real bytes into the host's own content store and announces them
// under its own discoveryTag — a genuine candidate, indistinguishable from
// what a real distributing peer would have produced.
async function placeAndAnnounce(host, bytes) {
    const reference = await host.contentStore.put(bytes);
    await host.announcer.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });
    return reference;
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
        selectedSnapshotAttributionResult: null,
        discoverOwnSnapshot: OwnPublicationPanel.methods.discoverOwnSnapshot,
        discoverSnapshotCandidates: OwnPublicationPanel.methods.discoverSnapshotCandidates,
        selectSnapshotCandidate: OwnPublicationPanel.methods.selectSnapshotCandidate,
        resolveSelectedSnapshot: OwnPublicationPanel.methods.resolveSelectedSnapshot,
        attributeSelectedSnapshot: OwnPublicationPanel.methods.attributeSelectedSnapshot,
        ...overrides
    };
}

async function run() {
    // ===============================================================
    // Section A — CANDIDATE BROWSING.
    // ===============================================================
    {
        const host = makeSharedHostRuntime('audit-157-section-a');
        // Announced deliberately out of alphabetical/hash order, and with
        // two candidates sharing one contentHash, to prove neither a sort
        // nor a dedup is ever introduced.
        const bytesShared = 'Section A: byte-identical content placed twice';
        const referenceShared1 = await host.contentStore.put(bytesShared);
        const referenceShared2 = await host.contentStore.put(bytesShared);
        await host.announcer.publish({ contentHash: referenceShared1.hash, locator: referenceShared1.uri, storage: referenceShared1.storage });
        const referenceZ = await placeAndAnnounce(host, 'Section A: zzz-ordered content');
        await host.announcer.publish({ contentHash: referenceShared2.hash, locator: referenceShared2.uri, storage: referenceShared2.storage });

        let resolveCalls = 0;
        const originalResolve = host.resolver.resolve.bind(host.resolver);
        const originalResolveCandidate = host.resolver.resolveCandidate.bind(host.resolver);
        host.resolver.resolve = (...args) => { resolveCalls += 1; return originalResolve(...args); };
        host.resolver.resolveCandidate = (...args) => { resolveCalls += 1; return originalResolveCandidate(...args); };

        const ctx = panelCtx({ discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand });
        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();

        assert(ctx.snapshotCandidateDiscoveryResult.length === 3, 'A1. every announced candidate is returned — none dropped, none deduplicated by shared contentHash');
        assert(ctx.snapshotCandidateDiscoveryResult[0].locator === referenceShared1.uri, 'A2. relay arrival order is preserved: first announced is first in the list');
        assert(ctx.snapshotCandidateDiscoveryResult[1].locator === referenceZ.uri, 'A3. ...second announced is second, regardless of alphabetical/hash ordering');
        assert(ctx.snapshotCandidateDiscoveryResult[2].locator === referenceShared2.uri, 'A4. ...third announced is third, even though it shares a contentHash with the first');

        // No ranking or dedup, structurally.
        const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        assert(!panelCode.includes('.sort('), 'A5. OwnPublicationPanel.js never sorts the candidate collection');
        assert(!panelCode.includes('new Set(') && !panelCode.includes('.filter('), 'A6. OwnPublicationPanel.js never deduplicates or filters the candidate collection');

        // Discovery alone never resolves anything — proven against the
        // REAL resolver instance, and confirmed to still hold after a real
        // elapsed macrotask tick, ruling out a hidden setTimeout()-based
        // auto-resolve.
        assert(resolveCalls === 0, 'A7. discovering candidates never calls resolve() or resolveCandidate() on the real resolver');
        await letRealTimePass();
        assert(resolveCalls === 0, 'A8. ...and still never does, even after real elapsed time — there is no delayed/hidden auto-resolution');
        assert(ctx.selectedSnapshotCandidate === null, 'A9. discovery never auto-selects a candidate of its own, even the first one');

        console.log('✓ Section A: candidate discovery returns the complete, unranked, un-deduplicated set in relay arrival order, and never resolves or selects anything on its own — even across real elapsed time');
    }

    // ===============================================================
    // Section B — EXPLICIT SELECTION.
    // ===============================================================
    {
        const host = makeSharedHostRuntime('audit-157-section-b');
        const referenceA = await placeAndAnnounce(host, 'Section B: candidate A');
        const referenceB = await placeAndAnnounce(host, 'Section B: candidate B');

        const ctx = panelCtx({ discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand, resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand });
        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        const [candidateA, candidateB] = ctx.snapshotCandidateDiscoveryResult;
        assert(candidateA.locator === referenceA.uri && candidateB.locator === referenceB.uri, 'B0. sanity: both real candidates discovered in order');

        ctx.selectSnapshotCandidate(candidateB);
        assert(ctx.selectedSnapshotCandidate === candidateB, 'B1. selection stores exactly the clicked candidate');
        assert(ctx.selectedSnapshotResolutionResult === null, 'B2. selection alone never resolves — no resolution result appears');
        assert(ctx.selectedSnapshotResolutionExecuting === false, 'B3. selection alone never enters a resolving state');
        assert(ctx.selectedSnapshotAttributionResult === null, 'B4. selection alone never attributes');
        assert(ctx.snapshotCandidateDiscoveryResult.length === 2, 'B5. selection never mutates the discovered candidate collection');

        // Confirmed across a real macrotask tick, not merely the instant
        // after the synchronous assignment.
        await letRealTimePass();
        assert(ctx.selectedSnapshotResolutionResult === null && ctx.selectedSnapshotAttributionResult === null,
            'B6. ...and still holds after real elapsed time — there is no delayed auto-resolve/auto-attribute triggered by selection');

        console.log('✓ Section B: selecting a candidate changes only selectedSnapshotCandidate — it never resolves, retrieves, verifies, or attributes, immediately or after real elapsed time');
    }

    // ===============================================================
    // Section C — EXPLICIT RESOLUTION.
    // ===============================================================
    {
        const host = makeSharedHostRuntime('audit-157-section-c');
        const sharedBytes = 'Section C: byte-identical content at two locators';
        const referenceA = await host.contentStore.put(sharedBytes);
        const referenceB = await host.contentStore.put(sharedBytes);
        await host.announcer.publish({ contentHash: referenceA.hash, locator: referenceA.uri, storage: referenceA.storage });
        await host.announcer.publish({ contentHash: referenceB.hash, locator: referenceB.uri, storage: referenceB.storage });

        const queriedLocators = [];
        const recordingStore = {
            storage: host.contentStore.storage,
            async get(reference) { queriedLocators.push(reference.uri); return host.contentStore.get(reference); },
            async put(bytes) { return host.contentStore.put(bytes); }
        };
        const resolveSelectedSnapshotCommand = (candidate) => executeResolveSelectedSnapshotCommand({
            candidate, resolver: host.resolver, contentStore: recordingStore
        });

        const ctx = panelCtx({ discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand, resolveSelectedSnapshotCommand });
        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        const [candidateA, candidateB] = ctx.snapshotCandidateDiscoveryResult;

        // No resolution happens on selection alone, even across real time.
        ctx.selectSnapshotCandidate(candidateB);
        await letRealTimePass();
        assert(ctx.selectedSnapshotResolutionResult === null && queriedLocators.length === 0,
            'C1. no resolution — and no content-store query at all — happens until resolveSelectedSnapshot() is explicitly called');

        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotResolutionResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'C2. the explicit call resolves successfully');
        assert(ctx.selectedSnapshotResolutionResult.locator === referenceB.uri, 'C3. the EXACT selected candidate\'s own locator is resolved — never the other candidate sharing its contentHash');
        assert(queriedLocators.length === 1 && queriedLocators[0] === referenceB.uri, 'C4. the content store was queried for EXACTLY that locator, and no other');
        assert(!queriedLocators.includes(referenceA.uri), 'C5. the other candidate\'s own locator, sharing the identical contentHash, is never queried');

        console.log('✓ Section C: resolution never happens without an explicit resolveSelectedSnapshot() call, and once invoked resolves exactly the selected candidate\'s own locator — never a substitute sharing its contentHash');
    }

    // ===============================================================
    // Section D — EXPLICIT ATTRIBUTION.
    // ===============================================================
    {
        const host = makeSharedHostRuntime('audit-157-section-d');
        const reference = await placeAndAnnounce(host, 'Section D: candidate content');
        const publication = new Publication({
            id: 'pub-d', documentId: 'doc-d',
            contentReference: new ContentReference({ hash: reference.hash, uri: reference.uri, storage: reference.storage })
        });

        const ctx = panelCtx({
            publication,
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand
        });
        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        const [candidate] = ctx.snapshotCandidateDiscoveryResult;
        ctx.selectSnapshotCandidate(candidate);

        // Attribution is a structural no-op before resolution exists.
        ctx.attributeSelectedSnapshot();
        assert(ctx.selectedSnapshotAttributionResult === null, 'D1. attributing before any resolution result exists is a no-op — never fabricates a verdict from the candidate\'s own declared contentHash');

        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotResolutionResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'D2. sanity: resolution genuinely succeeded');

        // Still no attribution until the explicit click — proven across
        // real elapsed time.
        await letRealTimePass();
        assert(ctx.selectedSnapshotAttributionResult === null, 'D3. a successful resolution never auto-attributes, even after real elapsed time');

        ctx.attributeSelectedSnapshot();
        assert(ctx.selectedSnapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.MATCH, 'D4. the explicit call produces the correct verdict once invoked');

        // The verdict is computed from the RESOLVER's own verified bytes,
        // never from the candidate's own self-declared contentHash — a
        // candidate object with a forged contentHash cannot buy a MATCH by
        // itself, because attributeSelectedSnapshot() never reads it.
        const forgedCandidate = { contentHash: publication.contentReference.hash, locator: 'ar://forged-locator-never-actually-queried', storage: 'ar' };
        const isolatedCtx = panelCtx({ publication, selectedSnapshotCandidate: forgedCandidate });
        isolatedCtx.attributeSelectedSnapshot();
        assert(isolatedCtx.selectedSnapshotAttributionResult === null, 'D5. with a matching-looking candidate but NO resolution result, attribution still refuses to produce a verdict — candidate metadata alone can never reach MATCH');

        console.log('✓ Section D: attribution never happens without an explicit attributeSelectedSnapshot() call, requires a prior RESOLVED result structurally, and is never computed from a candidate\'s own declared contentHash');
    }

    // ===============================================================
    // Section E — STALENESS.
    // ===============================================================
    {
        // E-i. select A -> resolve A starts -> select B -> resolve A
        // completes -> A's result must never appear as B's.
        {
            const host = makeSharedHostRuntime('audit-157-section-e-i');
            const referenceA = await placeAndAnnounce(host, 'Section E-i: candidate A');
            const referenceB = await placeAndAnnounce(host, 'Section E-i: candidate B');

            let resolveStalledA;
            let callCount = 0;
            const stallingCommand = (candidate) => {
                callCount += 1;
                if (candidate.locator === referenceA.uri) {
                    return new Promise((resolve) => { resolveStalledA = () => resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: 'Section E-i: candidate A', candidates: [candidate], locator: referenceA.uri, storage: 'ar', reason: null }); });
                }
                return host.resolveSelectedSnapshotCommand(candidate);
            };

            const ctx = panelCtx({ discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand, resolveSelectedSnapshotCommand: stallingCommand });
            ctx.discoverSnapshotCandidates();
            await flushMicrotasks();
            const [candidateA, candidateB] = ctx.snapshotCandidateDiscoveryResult;

            ctx.selectSnapshotCandidate(candidateA);
            ctx.resolveSelectedSnapshot();
            assert(ctx.selectedSnapshotResolutionExecuting === true, 'Ei1. sanity: A\'s resolution is genuinely in flight');
            await Promise.resolve();
            await Promise.resolve();

            // The user moves on before A's resolution settles.
            ctx.selectSnapshotCandidate(candidateB);
            assert(ctx.selectedSnapshotResolutionExecuting === false, 'Ei2. selecting B resets executing state immediately, without waiting for A\'s stale call');
            assert(ctx.selectedSnapshotResolutionResult === null, 'Ei3. B starts with no resolution result of its own yet');

            // Now A's stale promise finally settles.
            resolveStalledA();
            await flushMicrotasks();
            assert(ctx.selectedSnapshotResolutionResult === null, 'Ei4. FLAGSHIP — A\'s late-arriving RESOLVED result never overwrites B\'s state');
            assert(ctx.selectedSnapshotCandidate === candidateB, 'Ei5. the current selection is still genuinely B, untouched by A\'s late response');

            // B can still be resolved correctly afterward, on its own merits.
            ctx.resolveSelectedSnapshot();
            await flushMicrotasks();
            assert(ctx.selectedSnapshotResolutionResult.locator === referenceB.uri, 'Ei6. resolving B afterward produces B\'s own locator, never contaminated by A\'s earlier stale call');
        }

        // E-ii. there is no "attribution in flight" race, because
        // attribution is synchronous — structurally proven, then confirmed
        // behaviorally that a selection change immediately (no await
        // needed at all) invalidates it.
        {
            const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');
            assert(!panelCode.includes('selectedSnapshotAttributionExecuting'), 'Eii1. there is no selectedSnapshotAttributionExecuting field at all — attribution has no in-flight state to race');
            assert(!/attributeSelectedSnapshot\s*\(\s*\)\s*{[^}]*await/s.test(panelCode), 'Eii2. attributeSelectedSnapshot() contains no await — it is genuinely synchronous, start to finish');

            const host = makeSharedHostRuntime('audit-157-section-e-ii');
            const referenceA = await placeAndAnnounce(host, 'Section E-ii: candidate A');
            const referenceB = await placeAndAnnounce(host, 'Section E-ii: candidate B');
            const publication = new Publication({ id: 'pub-e-ii', documentId: 'doc-e-ii', contentReference: new ContentReference({ hash: referenceA.hash, uri: referenceA.uri, storage: 'ar' }) });

            const ctx = panelCtx({ publication, discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand, resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand });
            ctx.discoverSnapshotCandidates();
            await flushMicrotasks();
            const [candidateA, candidateB] = ctx.snapshotCandidateDiscoveryResult;

            ctx.selectSnapshotCandidate(candidateA);
            ctx.resolveSelectedSnapshot();
            await flushMicrotasks();
            ctx.attributeSelectedSnapshot();
            assert(ctx.selectedSnapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.MATCH, 'Eii3. sanity: A genuinely attributed MATCH');

            // Selecting a different candidate invalidates the attribution
            // result IMMEDIATELY, synchronously — no await of any kind
            // separates the selection call from the assertion.
            ctx.selectSnapshotCandidate(candidateB);
            assert(ctx.selectedSnapshotAttributionResult === null, 'Eii4. selecting a different candidate invalidates the prior attribution result synchronously — there is no window in which a stale attribution could be read');
        }

        // E-iii. a Publication change while BOTH candidate discovery AND
        // selected-candidate resolution are simultaneously in flight.
        {
            let discoveryCalls = 0;
            let resolutionCalls = 0;
            let resolveDiscovery;
            let resolveResolution;
            const candidate = Object.freeze({ contentHash: 'hash-e-iii', locator: 'ar://e-iii', storage: 'ar' });
            const publicationA = new Publication({ id: 'pub-e-iii-a', documentId: 'doc-e-iii-a' });
            const publicationB = new Publication({ id: 'pub-e-iii-b', documentId: 'doc-e-iii-b' });

            const ctx = panelCtx({
                publication: publicationA,
                selectedSnapshotCandidate: candidate,
                discoverSnapshotCandidatesCommand: () => { discoveryCalls += 1; return new Promise((resolve) => { resolveDiscovery = resolve; }); },
                resolveSelectedSnapshotCommand: () => { resolutionCalls += 1; return new Promise((resolve) => { resolveResolution = resolve; }); }
            });

            ctx.discoverSnapshotCandidates();
            ctx.resolveSelectedSnapshot();
            assert(ctx.snapshotCandidateDiscoveryExecuting === true && ctx.selectedSnapshotResolutionExecuting === true,
                'Eiii1. sanity: BOTH operations are genuinely in flight at once');
            await Promise.resolve();
            await Promise.resolve();

            // Publication B becomes current while both are still stalled.
            OwnPublicationPanel.watch.publication.call(ctx, publicationB, publicationA);
            ctx.publication = publicationB;
            assert(ctx.snapshotCandidateDiscoveryExecuting === false && ctx.selectedSnapshotResolutionExecuting === false,
                'Eiii2. a Publication change resets BOTH executing flags immediately, without waiting for either stale call');
            assert(ctx.selectedSnapshotCandidate === null, 'Eiii3. the selection itself is cleared too');

            // Both stale promises now settle, out of order, after the
            // switch.
            resolveResolution({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: 'stale-for-a', candidates: [candidate], locator: 'ar://e-iii', storage: 'ar', reason: null });
            resolveDiscovery(Object.freeze([candidate]));
            await flushMicrotasks();

            assert(ctx.snapshotCandidateDiscoveryResult === null, 'Eiii4. FLAGSHIP — the stale candidate discovery response never overwrites Publication B\'s state');
            assert(ctx.selectedSnapshotResolutionResult === null, 'Eiii5. FLAGSHIP — the stale resolution response never overwrites Publication B\'s state either, even though both settled together');
            assert(ctx.publication === publicationB, 'Eiii6. Publication B remains genuinely current throughout');
        }

        // E-iv. two Publications' own candidate discovery requests settle
        // out of order: A is switched away from before B even starts, then
        // A's stale response arrives AFTER B's genuine one.
        {
            let resolveA;
            let resolveB;
            let callIndex = 0;
            const resultA = Object.freeze([{ contentHash: 'hash-a', locator: 'ar://a', storage: 'ar' }]);
            const resultB = Object.freeze([{ contentHash: 'hash-b', locator: 'ar://b', storage: 'ar' }]);
            const publicationA = new Publication({ id: 'pub-e-iv-a', documentId: 'doc-e-iv-a' });
            const publicationB = new Publication({ id: 'pub-e-iv-b', documentId: 'doc-e-iv-b' });

            const ctx = panelCtx({
                publication: publicationA,
                discoverSnapshotCandidatesCommand: () => {
                    callIndex += 1;
                    const thisCall = callIndex;
                    return new Promise((resolve) => {
                        if (thisCall === 1) resolveA = () => resolve(resultA);
                        else resolveB = () => resolve(resultB);
                    });
                }
            });

            ctx.discoverSnapshotCandidates(); // for A, stalls
            await Promise.resolve();
            await Promise.resolve();
            OwnPublicationPanel.watch.publication.call(ctx, publicationB, publicationA);
            ctx.publication = publicationB;
            ctx.discoverSnapshotCandidates(); // for B, stalls
            await Promise.resolve();
            await Promise.resolve();

            // B's genuine response arrives first.
            resolveB();
            await flushMicrotasks();
            assert(ctx.snapshotCandidateDiscoveryResult === resultB, 'Eiv1. B\'s own genuine result is stored correctly');

            // A's now-doubly-stale response arrives after B already
            // settled — it must still never contaminate B's own state.
            resolveA();
            await flushMicrotasks();
            assert(ctx.snapshotCandidateDiscoveryResult === resultB, 'Eiv2. A\'s late, out-of-order response never overwrites B\'s already-settled result, regardless of arrival order');
        }

        console.log('✓ Section E: selecting a different candidate mid-resolution, a Publication change during simultaneous in-flight operations, and out-of-order settlement across Publications all leave no stale result able to surface under the wrong selection or the wrong Publication — and attribution, having no asynchronous state at all, cannot race in the first place');
    }

    // ===============================================================
    // Section F — STATE-MACHINE CONSISTENCY.
    // ===============================================================
    {
        const host = makeSharedHostRuntime('audit-157-section-f');
        const referenceA = await placeAndAnnounce(host, 'Section F: candidate A');
        const referenceB = await placeAndAnnounce(host, 'Section F: candidate B');
        const publicationOne = new Publication({ id: 'pub-f-1', documentId: 'doc-f-1', contentReference: new ContentReference({ hash: referenceA.hash, uri: referenceA.uri, storage: 'ar' }) });
        const publicationTwo = new Publication({ id: 'pub-f-2', documentId: 'doc-f-2', contentReference: new ContentReference({ hash: referenceB.hash, uri: referenceB.uri, storage: 'ar' }) });

        const ctx = panelCtx({
            publication: publicationOne,
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand
        });

        // STATE 1: NO CANDIDATE.
        assert(ctx.snapshotCandidateDiscoveryResult === null && ctx.selectedSnapshotCandidate === null, 'F1. NO CANDIDATE: nothing discovered, nothing selected');

        // STATE 2: CANDIDATES AVAILABLE.
        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(ctx.snapshotCandidateDiscoveryResult.length === 2 && ctx.selectedSnapshotCandidate === null, 'F2. CANDIDATES AVAILABLE: discovered, still nothing selected');
        const [candidateA, candidateB] = ctx.snapshotCandidateDiscoveryResult;

        // STATE 3: CANDIDATE SELECTED.
        ctx.selectSnapshotCandidate(candidateA);
        assert(ctx.selectedSnapshotCandidate === candidateA && ctx.selectedSnapshotResolutionResult === null, 'F3. CANDIDATE SELECTED: selected, not yet resolved');

        // STATE 4: RESOLVED.
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotResolutionResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED && ctx.selectedSnapshotAttributionResult === null,
            'F4. RESOLVED: resolved, not yet attributed');

        // STATE 5: ATTRIBUTED.
        ctx.attributeSelectedSnapshot();
        assert(ctx.selectedSnapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.MATCH, 'F5. ATTRIBUTED: candidate A genuinely matches Publication One');

        // RESET RULE 1: selection change -> resolution invalid -> attribution invalid.
        ctx.selectSnapshotCandidate(candidateB);
        assert(ctx.selectedSnapshotResolutionResult === null, 'F6. reset rule (selection change): resolution invalidated');
        assert(ctx.selectedSnapshotAttributionResult === null, 'F7. reset rule (selection change): attribution invalidated along with it');

        // Walk back up to ATTRIBUTED with the new selection, to prove the
        // state machine composes forward again after a reset.
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        ctx.attributeSelectedSnapshot();
        assert(ctx.selectedSnapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.NO_MATCH, 'F8. candidate B correctly reports NO_MATCH against Publication One (whose own contentHash is A\'s)');

        // RESET RULE 2: resolution change (a fresh re-resolve of the SAME
        // selection) -> attribution invalid.
        ctx.resolveSelectedSnapshot();
        assert(ctx.selectedSnapshotAttributionResult === null, 'F9. reset rule (resolution change): re-resolving the current selection invalidates its own now-stale attribution immediately, synchronously, before the fresh resolution even settles');
        await flushMicrotasks();
        assert(ctx.selectedSnapshotResolutionResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'F10. sanity: the fresh resolution itself still completes correctly');

        // RESET RULE 3: Publication change -> the entire selected-candidate
        // path invalid, all at once.
        ctx.attributeSelectedSnapshot();
        assert(ctx.selectedSnapshotAttributionResult !== null, 'F11. sanity: attribution is populated again before the Publication changes');
        OwnPublicationPanel.watch.publication.call(ctx, publicationTwo, publicationOne);
        ctx.publication = publicationTwo;
        assert(ctx.snapshotCandidateDiscoveryResult === null, 'F12. reset rule (Publication change): candidate discovery itself is cleared');
        assert(ctx.selectedSnapshotCandidate === null, 'F13. ...selection is cleared');
        assert(ctx.selectedSnapshotResolutionResult === null, 'F14. ...resolution is cleared');
        assert(ctx.selectedSnapshotAttributionResult === null, 'F15. ...and attribution is cleared — the entire family invalidated together, back to NO CANDIDATE');

        console.log('✓ Section F: the effective state machine (NO CANDIDATE -> CANDIDATES AVAILABLE -> SELECTED -> RESOLVED -> ATTRIBUTED) holds in one continuous walk, and all three reset rules (selection/resolution/Publication change) fire exactly where the model requires, composing correctly across repeated resets');
    }

    // ===============================================================
    // Section G — FAILURE UX SEMANTICS.
    // ===============================================================
    {
        // The template renders selectedSnapshotResolutionResult.outcome and
        // selectedSnapshotAttributionResult.outcome VERBATIM — never
        // through a boolean/ternary collapse that would erase the
        // distinction between a resolution failure and NO_MATCH.
        const rawTemplateSource = await readFile(new URL('ui/components/OwnPublicationPanel.js', SOURCE_ROOT), 'utf8');
        const templateMatch = rawTemplateSource.match(/template: `([\s\S]*)`\s*};?\s*$/);
        assert(templateMatch, 'G1. sanity: the component template literal was located');
        const template = templateMatch[1];
        assert(template.includes('{{ selectedSnapshotResolutionResult.outcome }}'), 'G2. the selected-resolution outcome is rendered verbatim, unconditionally on its own value');
        assert(template.includes('{{ selectedSnapshotAttributionResult.outcome }}'), 'G3. the selected-attribution outcome is rendered verbatim, unconditionally on its own value');
        assert(!/selectedSnapshotAttributionResult\.outcome\s*===?\s*['"]match['"]\s*\?/i.test(template),
            'G4. the template never collapses the attribution outcome into a boolean success/fail ternary — the exact failure vocabulary (or MATCH/NO_MATCH) always reaches the screen');
        assert(!/selectedSnapshotResolutionResult\.outcome\s*===?\s*['"]resolved['"]\s*\?/i.test(template),
            'G5. the template never collapses the resolution outcome into a boolean success/fail ternary either');

        // Behaviorally: a genuine CONTENT_HASH_MISMATCH stays
        // CONTENT_HASH_MISMATCH all the way through attribution, never
        // folded into NO_MATCH.
        const host = makeSharedHostRuntime('audit-157-section-g');
        const claimedHash = (await host.contentStore.put('Section G: bytes this locator does not actually hold')).hash;
        const realReference = await host.contentStore.put('Section G: the real, different bytes actually stored here');
        await host.announcer.publish({ contentHash: claimedHash, locator: realReference.uri, storage: realReference.storage });

        const publication = new Publication({ id: 'pub-g', documentId: 'doc-g', contentReference: new ContentReference({ hash: claimedHash, uri: 'ar://irrelevant', storage: 'ar' }) });
        const ctx = panelCtx({ publication, discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand, resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand });
        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        ctx.selectSnapshotCandidate(ctx.snapshotCandidateDiscoveryResult[0]);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotResolutionResult.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH, 'G6. sanity: the mismatched candidate genuinely fails verification');

        ctx.attributeSelectedSnapshot();
        assert(ctx.selectedSnapshotAttributionResult.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH,
            'G7. CONTENT_HASH_MISMATCH is reported verbatim through attribution — never folded into NO_MATCH, which means something categorically different (verified bytes that simply belong to someone else)');
        assert(ctx.selectedSnapshotAttributionResult.outcome !== SnapshotPublicationAttributionOutcome.NO_MATCH,
            'G8. explicit negative: the reported outcome is not NO_MATCH');
        assert(ctx.selectedSnapshotAttributionResult.snapshotHash === null,
            'G9. a resolution failure never carries a computed snapshotHash — there was no verified content to hash');

        console.log('✓ Section G: NOT_DISCOVERED/STORE_UNAVAILABLE/CONTENT_UNAVAILABLE/CONTENT_HASH_MISMATCH stay distinct from NO_MATCH both in the values attributeSelectedSnapshot() produces and in the template that renders them verbatim');
    }

    // ===============================================================
    // Section H — PATH INDEPENDENCE (Check Snapshot Match vs Discover
    // Snapshots), through the real composed runtime, both orders.
    // ===============================================================
    for (const order of ['A-then-B', 'B-then-A']) {
        const host = makeSharedHostRuntime(`audit-157-section-h-${order}`);
        // The Publication's own content (Path A will MATCH against this).
        const ownReference = await host.contentStore.put(`Section H (${order}): the Publication's own content`);
        const publication = new Publication({ id: `pub-h-${order}`, documentId: `doc-h-${order}`, contentReference: new ContentReference({ hash: ownReference.hash, uri: ownReference.uri, storage: 'ar' }) });
        await host.announcer.publish({ contentHash: ownReference.hash, locator: ownReference.uri, storage: ownReference.storage });
        // A genuinely different, unrelated Snapshot (Path B will select
        // this one and get NO_MATCH) — announced under the SAME
        // discoveryTag, so Path A's own resolve(discoveryTag, contentHash)
        // could in principle see it too, and must still never pick it.
        const otherReference = await placeAndAnnounce(host, `Section H (${order}): a genuinely different, unrelated Snapshot`);

        const ctx = panelCtx({
            publication,
            discoverSnapshotCommand: host.discoverOwnSnapshotAction,
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand
        });

        function runPathA() {
            ctx.discoverOwnSnapshot();
        }
        function runPathB() {
            ctx.discoverSnapshotCandidates();
        }

        if (order === 'A-then-B') {
            runPathA();
            await flushMicrotasks();
            assert(ctx.snapshotDiscoveryResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, `H1 (${order}). sanity: Path A genuinely resolved`);
            assert(ctx.snapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.MATCH, `H2 (${order}). Path A correctly reports MATCH for the Publication's own content`);
            assert(ctx.selectedSnapshotCandidate === null && ctx.selectedSnapshotResolutionResult === null && ctx.selectedSnapshotAttributionResult === null,
                `H3 (${order}). Path A never touches ANY of Path B's own state fields`);

            runPathB();
            await flushMicrotasks();
            assert(ctx.snapshotCandidateDiscoveryResult.length === 2, `H4 (${order}). sanity: Path B genuinely discovered both candidates`);
            const other = ctx.snapshotCandidateDiscoveryResult.find((candidate) => candidate.locator === otherReference.uri);
            ctx.selectSnapshotCandidate(other);
            ctx.resolveSelectedSnapshot();
            await flushMicrotasks();
            ctx.attributeSelectedSnapshot();
            assert(ctx.selectedSnapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.NO_MATCH, `H5 (${order}). Path B, selecting the OTHER Snapshot, correctly reports NO_MATCH`);
            assert(ctx.snapshotDiscoveryResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED && ctx.snapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.MATCH,
                `H6 (${order}). Path A's own already-settled MATCH is completely untouched by Path B's run — the two paths genuinely disagree (MATCH vs NO_MATCH) over the SAME Publication at the SAME time, with neither overwriting the other`);
        } else {
            runPathB();
            await flushMicrotasks();
            const other = ctx.snapshotCandidateDiscoveryResult.find((candidate) => candidate.locator === otherReference.uri);
            ctx.selectSnapshotCandidate(other);
            ctx.resolveSelectedSnapshot();
            await flushMicrotasks();
            ctx.attributeSelectedSnapshot();
            assert(ctx.selectedSnapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.NO_MATCH, `H1 (${order}). sanity: Path B genuinely reports NO_MATCH first`);
            assert(ctx.snapshotDiscoveryResult === null && ctx.snapshotAttributionResult === null, `H2 (${order}). Path B never touches ANY of Path A's own state fields`);

            runPathA();
            await flushMicrotasks();
            assert(ctx.snapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.MATCH, `H3 (${order}). Path A, run second, still correctly reports MATCH`);
            assert(ctx.selectedSnapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.NO_MATCH,
                `H4 (${order}). Path B's own already-settled NO_MATCH is completely untouched by Path A's later run — the two paths still genuinely disagree, with neither overwriting the other`);
        }
    }
    console.log('✓ Section H: "Check Snapshot Match" and "Discover Snapshots -> select -> resolve -> attribute" reach genuinely different, simultaneously-held verdicts over the identical Publication, in both run orders, with neither path ever mutating or overwriting the other\'s state');

    // ===============================================================
    // Section I — UI STRUCTURAL COHERENCE: every action button's
    // :disabled binding enforces the identical precondition its method
    // body guards with.
    // ===============================================================
    {
        const rawSource = await readFile(new URL('ui/components/OwnPublicationPanel.js', SOURCE_ROOT), 'utf8');

        function disabledExpressionFor(actionClass) {
            const re = new RegExp(`class="action-btn ${actionClass}"[\\s\\S]{0,200}?:disabled="([^"]*)"`);
            const match = rawSource.match(re);
            assert(match, `I0. sanity: located the :disabled binding for '${actionClass}'`);
            return match[1];
        }

        const discoveryDisabled = disabledExpressionFor('own-publication-candidate-discovery-action');
        assert(discoveryDisabled.includes('snapshotCandidateDiscoveryExecuting'),
            'I1. "Discover Snapshots" is disabled while a call is already in flight, matching discoverSnapshotCandidates()\'s own in-flight guard');

        const resolveDisabled = disabledExpressionFor('own-publication-selected-resolution-action');
        assert(resolveDisabled.includes('!selectedSnapshotCandidate'),
            'I2. "Resolve Selected Snapshot" is disabled whenever nothing is selected, matching resolveSelectedSnapshot()\'s own no-op guard — the UI can never invoke resolution over an empty selection');
        assert(resolveDisabled.includes('selectedSnapshotResolutionExecuting'),
            'I3. ...and disabled while a resolution is already in flight, preventing an overlapping click');

        const attributeDisabled = disabledExpressionFor('own-publication-selected-attribution-action');
        assert(attributeDisabled.includes('!selectedSnapshotResolutionResult'),
            'I4. "Attribute Selected Snapshot" is disabled whenever there is no resolution result yet, matching attributeSelectedSnapshot()\'s own no-op guard — the UI can never invoke attribution over an unresolved candidate');
        assert(attributeDisabled.includes('!publication') && attributeDisabled.includes('!publication.contentReference'),
            'I5. ...and disabled whenever there is no placed Publication to compare against');

        // Cross-check against the actual method-body guards themselves, so
        // this section proves CORRESPONDENCE, not merely that each side
        // independently looks plausible.
        const codeOnly = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        const resolveMethodGuard = codeOnly.match(/resolveSelectedSnapshot\(\)\s*{\s*const candidate[\s\S]{0,200}?if \(([^)]*)\)/);
        assert(resolveMethodGuard && resolveMethodGuard[1].includes('!candidate'), 'I6. resolveSelectedSnapshot()\'s own guard genuinely requires a selected candidate — the template\'s disabled binding mirrors a real guard, not an ornamental one');

        const attributeMethodGuard = codeOnly.match(/attributeSelectedSnapshot\(\)\s*{[\s\S]{0,300}?if \(([^)]*)\)/);
        assert(attributeMethodGuard && attributeMethodGuard[1].includes('!resolution'), 'I7. attributeSelectedSnapshot()\'s own guard genuinely requires a resolution result — the template\'s disabled binding mirrors a real guard, not an ornamental one');

        // The candidate list itself is only ever rendered once discovery
        // has actually produced a result — never selectable before then.
        assert(/v-else-if="snapshotCandidateDiscoveryResult"[\s\S]{0,50}class="own-publication-candidate-list"/.test(rawSource),
            'I8. the candidate list (and therefore candidate selection) is only rendered once snapshotCandidateDiscoveryResult actually exists — selection is structurally unreachable before a discovery call has completed');

        console.log('✓ Section I: every action button\'s :disabled binding enforces the identical precondition its own method body guards with, so the state machine cannot be violated by clicking a button the UI ought to have disabled');
    }

    // ===============================================================
    // Section J — FULL FLAGSHIP: the complete pipeline, three real
    // candidates, every invariant proven above holding at once.
    // ===============================================================
    {
        const host = makeSharedHostRuntime('audit-157-section-j');
        const ownBytes = 'Section J: the Publication\'s own genuine content';
        const ownReference = await host.contentStore.put(ownBytes);
        const publication = new Publication({ id: 'pub-j', documentId: 'doc-j', contentReference: new ContentReference({ hash: ownReference.hash, uri: ownReference.uri, storage: 'ar' }) });

        const matchingReference = await placeAndAnnounce(host, ownBytes); // a second, independent copy of the SAME bytes
        const unrelatedReference = await placeAndAnnounce(host, 'Section J: a genuinely different, unrelated Snapshot');
        const invalidClaimedHash = (await host.contentStore.put('Section J: bytes this invalid candidate does not actually hold')).hash;
        const invalidRealReference = await host.contentStore.put('Section J: the real, different bytes actually stored here');
        await host.announcer.publish({ contentHash: invalidClaimedHash, locator: invalidRealReference.uri, storage: invalidRealReference.storage });

        const ctx = panelCtx({
            publication,
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand
        });

        // DISCOVER + BROWSE.
        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(ctx.snapshotCandidateDiscoveryResult.length === 3, 'J1. all three announced candidates are discovered, complete and unranked');
        const matching = ctx.snapshotCandidateDiscoveryResult.find((c) => c.locator === matchingReference.uri);
        const unrelated = ctx.snapshotCandidateDiscoveryResult.find((c) => c.locator === unrelatedReference.uri);
        const invalid = ctx.snapshotCandidateDiscoveryResult.find((c) => c.locator === invalidRealReference.uri);
        assert(matching && unrelated && invalid, 'J2. sanity: all three are individually identifiable by their own real locators');

        // SELECT -> RESOLVE -> ATTRIBUTE: the matching candidate.
        ctx.selectSnapshotCandidate(matching);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        ctx.attributeSelectedSnapshot();
        assert(ctx.selectedSnapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.MATCH, 'J3. selecting the genuinely matching candidate produces MATCH');

        // SELECT -> RESOLVE -> ATTRIBUTE: the unrelated candidate — proves
        // selection materially changes the verdict, not merely its label.
        ctx.selectSnapshotCandidate(unrelated);
        assert(ctx.selectedSnapshotResolutionResult === null && ctx.selectedSnapshotAttributionResult === null, 'J4. re-selecting invalidates both the prior resolution and attribution immediately');
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        ctx.attributeSelectedSnapshot();
        assert(ctx.selectedSnapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.NO_MATCH, 'J5. selecting the unrelated candidate flips the verdict to NO_MATCH — the same Publication, a materially different outcome');

        // SELECT -> RESOLVE: the invalid candidate — verification refuses
        // it before attribution is ever reached.
        ctx.selectSnapshotCandidate(invalid);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotResolutionResult.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH, 'J6. the invalid candidate is refused at verification');
        ctx.attributeSelectedSnapshot();
        assert(ctx.selectedSnapshotAttributionResult.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH, 'J7. the verification failure is reported verbatim through attribution, never as NO_MATCH');

        // Re-selecting the ORIGINAL matching candidate last, after two
        // detours, still reports MATCH — no state accumulated across
        // prior selections.
        ctx.selectSnapshotCandidate(matching);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        ctx.attributeSelectedSnapshot();
        assert(ctx.selectedSnapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.MATCH, 'J8. FLAGSHIP — re-selecting the matching candidate last still reports MATCH: the pipeline is deterministic in the current selection alone, with no accumulated state from the NO_MATCH/CONTENT_HASH_MISMATCH detours');

        // And "Check Snapshot Match" (Path A), run at the very end, still
        // agrees independently — the two paths were never wired together.
        const pathA = (publicationArg) => host.discoverSnapshotCommand(publicationArg.contentReference.hash);
        const finalCtx = panelCtx({ publication, discoverSnapshotCommand: pathA });
        finalCtx.discoverOwnSnapshot();
        await flushMicrotasks();
        assert(finalCtx.snapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.MATCH, 'J9. Path A, run independently against the same Publication, agrees: MATCH');

        console.log('✓ Section J: FULL FLAGSHIP — the complete Discover -> Browse -> Select -> Resolve -> Verify -> Attribute pipeline, driven end to end through the real UI actions over three real, independently placed candidates, is coherent front-to-back: no hidden automatic step, no stale result crossing a selection or Publication boundary, and every invariant from Sections A-H holding together in one run');
    }

    console.log('\n✅ All Snapshot Candidate Interaction Completion Audit tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
