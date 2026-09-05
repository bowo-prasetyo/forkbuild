import { readFile } from 'node:fs/promises';

import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';
import { executeDiscoverSnapshotCommand } from '../application/DiscoverSnapshotCommand.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/DiscoverSnapshotCandidatesCommand.js';
import { executeResolveSelectedSnapshotCommand } from '../application/ResolveSelectedSnapshotCommand.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { resolveSnapshotPublicationAttribution } from '../application/SnapshotPublicationAttribution.js';
import { SnapshotPublicationAttributionOutcome } from '../application/SnapshotPublicationAttributionOutcome.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';

// 0.9.153 — Selected Snapshot Resolution End-to-End Audit.
//
// 0.9.150 (browsing-oriented candidate discovery), 0.9.151 (the candidate
// browser + selection), and 0.9.152 (resolveCandidate() + its command/UI
// wiring) each proved their own seam in isolation — 0.9.152's own
// tests/SelectedSnapshotCandidateResolution.test.js in particular already
// gives thorough, exhaustive unit-level coverage of resolveCandidate()
// itself (a bare DecentralizedSnapshotResolver + SnapshotPlacementStoreRegistry)
// and of OwnPublicationPanel's own state machine (driven by hand-written
// fake command functions, never real Nostr/Arweave infrastructure). This
// is a test-only audit, exactly the shape tests/SnapshotAttributionEndToEndAudit.test.js
// (0.9.145) and tests/SnapshotDistributionAudit.test.js (0.9.135) already
// gave their own subsystems — ZERO new production code. Its job is
// different from 0.9.152's own suite: prove the complete chain now
// composes end to end, through the REAL composed runtime
// (composeDiscoverSnapshotRuntime, a real ArweaveContentStore, a real
// NostrSnapshotDiscoveryPublisher/NostrSnapshotDiscoveryQueryService pair)
// and the REAL OwnPublicationPanel UI action — never a second, faster,
// weaker imitation of what 0.9.152 already verified precisely.
//
// TWO INTENTIONAL ENTRY PATHS, CONVERGING AT EXACTLY ONE RETRIEVAL/
// VERIFICATION IMPLEMENTATION — the central architectural claim under
// audit:
//
//   contentHash                          selected candidate
//        │                                { contentHash, locator, storage }
//        ▼                                       │
//   resolve(discoveryTag, contentHash)            │
//        │                                       │
//        ├── discover                            │
//        ├── first-match selection                │
//        │                                       │
//        └──────────► resolveCandidate() ◄────────┘
//                            │
//                            ├── LOCATION
//                            ├── RETRIEVAL
//                            └── VERIFICATION
//
// Section A: explicit selection is authoritative — two candidates sharing
//            ONE contentHash, discovered in both orders, resolved through
//            the real composed runtime and OwnPublicationPanel's own
//            action; a spy content store proves the EXPLICITLY SELECTED
//            candidate's own locator is the one actually queried, and the
//            other candidate's locator is never queried at all.
// Section B: exact candidate identity survives UI selection ->
//            ResolveSelectedSnapshotCommand -> resolver.resolveCandidate()
//            -> contentStore.get() unreconstructed, and stays distinct
//            from every other identity in this subsystem (Publication
//            contentHash, Arweave transaction id, Nostr event id).
// Section C: resolveCandidate() bypasses discovery entirely — a
//            queryService whose search() would throw if called is
//            plugged into the SAME resolver instance the selected-
//            resolution command uses, and selected resolution still
//            succeeds, driven through the real UI action.
// Section D: verification remains authoritative — a candidate whose real
//            locator serves bytes disagreeing with its own declared
//            contentHash is refused (CONTENT_HASH_MISMATCH), through the
//            real composed runtime and UI, never RESOLVED.
// Section E: selected resolution never attributes — resolveSelectedSnapshot()
//            reports RESOLVED, never MATCH; only a separate, explicit call
//            to resolveSnapshotPublicationAttribution() produces MATCH.
// Section F: resolve(discoveryTag, contentHash) remains semantically
//            unchanged by this milestone's own seam — still discover,
//            still first-match, still delegates to resolveCandidate().
// Section G: structural sweep — no duplicated contentStore.get()/content
//            hashing/verification logic outside DecentralizedSnapshotResolver.js,
//            and no new SELECTED_CANDIDATE_FAILED-style outcome vocabulary.
// Section H: UI state isolation, through the real composed runtime —
//            selecting a different candidate clears a stale resolution;
//            a changed Publication clears the selection and its
//            resolution; a stale in-flight resolution can never overwrite
//            the current selection's state.
// Section I: failure preservation — STORE_UNAVAILABLE, CONTENT_UNAVAILABLE,
//            and CONTENT_HASH_MISMATCH each reported verbatim through the
//            real selected-resolution UI path.
// Section J: the full flagship path — three real, independently placed
//            candidates (A, B, C) discovered under one shared
//            discoveryTag; A and B deliberately point at two DIFFERENT
//            valid Snapshots. The user selects B; the resolved bytes are
//            genuinely B's own, never A's; attribution against a
//            Publication whose hash is B's own reports MATCH, while the
//            identical resolved Snapshot attributed against A's hash
//            reports NO_MATCH — proving selection materially changes the
//            answer, not merely the label on an unchanged result.

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
        return { id: `fake-selected-resolution-audit-tx-${counter}`, transaction: { id: `fake-selected-resolution-audit-tx-${counter}`, data: material } };
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

// Wraps a real ContentStore, recording the exact locator (`reference.uri`)
// every `get()` call was made against — never altering behavior. Used to
// prove, from OUTSIDE the resolver, which candidate's locator was actually
// queried, rather than merely trusting the returned result's own fields.
function makeRecordingContentStore(realStore) {
    const queriedLocators = [];
    return {
        storage: realStore.storage,
        queriedLocators,
        async get(reference) {
            queriedLocators.push(reference.uri);
            return realStore.get(reference);
        },
        async put(bytes) {
            return realStore.put(bytes);
        }
    };
}

// One shared "host" — a single Arweave signer/gateway and a single Nostr
// network — composed exactly the way ui/main.js composes
// composeDiscoverSnapshotRuntime(), with all three application-command
// seams (resolve-by-hash, browse candidates, resolve selected candidate)
// wired over the SAME resolver/contentStore/queryService instances —
// never three independent compositions coincidentally agreeing.
function makeSharedHostRuntime(discoveryTag) {
    const gateway = makeFakeArweaveGateway();
    const signer = makeFakeArweaveSigner();
    const network = makeNostrNetwork();

    const { resolver, contentStore, queryService } = composeDiscoverSnapshotRuntime({
        arweaveContentStoreOptions: { signer, fetchImpl: gateway.fetchImpl },
        nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: network.queryImpl }
    });

    const announcer = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });

    const discoverSnapshotCommand = (contentHash) => executeDiscoverSnapshotCommand({
        discoveryTag, contentHash, resolver, contentStore
    });
    const discoverSnapshotCandidatesCommand = () => executeDiscoverSnapshotCandidatesCommand({
        discoveryTag, discoveryQueryService: queryService
    });
    const resolveSelectedSnapshotCommand = (candidate) => executeResolveSelectedSnapshotCommand({
        candidate, resolver, contentStore
    });

    return {
        gateway, signer, network, discoveryTag, resolver, contentStore, queryService, announcer,
        discoverSnapshotCommand, discoverSnapshotCandidatesCommand, resolveSelectedSnapshotCommand
    };
}

// Places real bytes into the host's own content store and announces them
// under its own discoveryTag — a genuine candidate, indistinguishable
// from what a real distributing peer would have produced.
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
        discoverOwnSnapshot: OwnPublicationPanel.methods.discoverOwnSnapshot,
        discoverSnapshotCandidates: OwnPublicationPanel.methods.discoverSnapshotCandidates,
        selectSnapshotCandidate: OwnPublicationPanel.methods.selectSnapshotCandidate,
        resolveSelectedSnapshot: OwnPublicationPanel.methods.resolveSelectedSnapshot,
        ...overrides
    };
}

async function run() {
    // ===============================================================
    // Section A — explicit selection is authoritative, through the real
    // composed runtime and OwnPublicationPanel's own UI action.
    // ===============================================================
    {
        for (const order of ['A-then-B', 'B-then-A']) {
            const host = makeSharedHostRuntime(`audit-153-section-a-${order}`);
            const recordingStore = makeRecordingContentStore(host.contentStore);
            const resolveSelectedSnapshotCommand = (candidate) => executeResolveSelectedSnapshotCommand({
                candidate, resolver: host.resolver, contentStore: recordingStore
            });

            // Two candidates, genuinely different locators, sharing ONE
            // contentHash — the exact shape 0.9.152's own header names as
            // the reason resolve(candidate.contentHash) cannot substitute
            // for resolveCandidate(candidate). Two independently placed
            // copies of BYTE-IDENTICAL content legitimately share a real
            // contentHash while living at two different locators (e.g. two
            // separate uploads of the same Snapshot) — no forgery involved.
            const sharedBytes = `Section A: byte-identical content placed twice, order ${order}`;
            const referenceA = await host.contentStore.put(sharedBytes);
            const referenceB = await host.contentStore.put(sharedBytes);
            assert(referenceA.hash === referenceB.hash, 'A0. sanity: both placements share one real contentHash');
            assert(referenceA.uri !== referenceB.uri, 'A0b. sanity: the two placements genuinely have different locators');

            const candidateA = { contentHash: referenceA.hash, locator: referenceA.uri, storage: referenceA.storage };
            const candidateB = { contentHash: referenceB.hash, locator: referenceB.uri, storage: referenceB.storage };
            const discovered = order === 'A-then-B' ? [candidateA, candidateB] : [candidateB, candidateA];
            for (const candidate of discovered) {
                await host.announcer.publish(candidate);
            }

            const ctx = panelCtx({ discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand, resolveSelectedSnapshotCommand });
            ctx.discoverSnapshotCandidates();
            await flushMicrotasks();
            assert(ctx.snapshotCandidateDiscoveryResult.length === 2, `A1 (${order}). sanity: both candidates were genuinely discovered`);

            // Explicitly select the SECOND-discovered candidate — the one
            // discovery order alone (first-match) would never pick.
            const secondDiscovered = ctx.snapshotCandidateDiscoveryResult[1];
            ctx.selectSnapshotCandidate(secondDiscovered);
            ctx.resolveSelectedSnapshot();
            await flushMicrotasks();

            assert(ctx.selectedSnapshotResolutionResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED,
                `A2 (${order}). the explicitly selected candidate resolves`);
            assert(ctx.selectedSnapshotResolutionResult.locator === secondDiscovered.locator,
                `A3 (${order}). the reported locator is exactly the SELECTED candidate's own — never the first-discovered one`);
            assert(recordingStore.queriedLocators.length === 1 && recordingStore.queriedLocators[0] === secondDiscovered.locator,
                `A4 (${order}). FLAGSHIP — the content store was queried EXACTLY ONCE, against the selected candidate's own locator; the other, un-selected candidate's locator was never queried at all`);

            console.log(`✓ Section A (${order}): the explicitly selected candidate's own locator is the one genuinely queried against the content store — proven by an external spy, not merely by the returned result's own fields — regardless of discovery order`);
        }
    }

    // ===============================================================
    // Section B — exact candidate identity survives the application
    // layers, and stays distinct from every other identity in this
    // subsystem.
    // ===============================================================
    {
        const host = makeSharedHostRuntime('audit-153-section-b');
        const bytes = 'Section B: identity-preservation fixture content';
        const reference = await placeAndAnnounce(host, bytes);

        const ctx = panelCtx({ discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand, resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand });
        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        const candidate = ctx.snapshotCandidateDiscoveryResult[0];

        // UI selection -> ResolveSelectedSnapshotCommand -> resolver.resolveCandidate()
        // -> contentStore.get(candidate.locator) — the candidate object
        // handed to selectSnapshotCandidate() is the SAME reference the
        // discovery command produced, never rebuilt or copied.
        ctx.selectSnapshotCandidate(candidate);
        assert(ctx.selectedSnapshotCandidate === candidate, 'B1. selection holds the exact candidate reference discovery produced, never a reconstruction');

        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();

        const result = ctx.selectedSnapshotResolutionResult;
        assert(result.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'B2. sanity: the candidate resolves');
        assert(result.candidates.length === 1 && result.candidates[0] === candidate, 'B3. the result\'s own candidates[] carries the EXACT candidate object selected, never a copy');
        assert(result.locator === candidate.locator, 'B4. the reported locator is the candidate\'s own locator, unreconstructed');
        assert(result.storage === candidate.storage, 'B5. the reported storage is the candidate\'s own storage, unreconstructed');
        assert(candidate.contentHash === reference.hash, 'B6. the candidate\'s own contentHash is the real, independently placed content\'s hash');

        // Identity separation: publication contentHash / snapshot
        // contentHash / snapshot locator / Arweave transaction id / Nostr
        // event id / Nostr relay filter tag value all stay distinct — none
        // silently substitutes for another.
        const publication = new Publication({ id: 'pub-audit-153-b', documentId: 'doc-audit-153-b', contentReference: new ContentReference({ hash: reference.hash }) });
        const attribution = resolveSnapshotPublicationAttribution(publication, result);
        const arweaveTransactionId = reference.uri.replace('ar://', '');
        const nostrEventId = host.network.events[0].id;

        assert(attribution.publicationHash !== publication.id, 'B7. publicationHash is never publication.id');
        assert(attribution.publicationHash !== arweaveTransactionId, 'B8. publicationHash is never the Arweave transaction id');
        assert(attribution.snapshotHash !== arweaveTransactionId, 'B9. snapshotHash is never the Arweave transaction id');
        assert(attribution.publicationHash !== nostrEventId, 'B10. publicationHash is never the Nostr event id');
        assert(attribution.snapshotHash !== nostrEventId, 'B11. snapshotHash is never the Nostr event id');
        assert(attribution.publicationHash !== result.locator && attribution.snapshotHash !== result.locator, 'B12. neither hash is ever the resolved locator URI');
        assert(candidate.locator !== candidate.contentHash, 'B13. sanity: a candidate\'s own locator and contentHash are genuinely different strings');

        console.log('✓ Section B: exact candidate identity (contentHash/locator/storage) survives UI selection -> command -> resolver -> content store unreconstructed, and stays distinct from Publication id, Arweave transaction id, and Nostr event id');
    }

    // ===============================================================
    // Section C — selected candidate resolution bypasses discovery
    // entirely: a queryService whose search() throws is wired into the
    // SAME resolver instance the selected-resolution command uses, and
    // selected resolution still succeeds, driven through the real UI.
    // ===============================================================
    {
        const host = makeSharedHostRuntime('audit-153-section-c');
        const bytes = 'Section C: resolving a selected candidate never triggers a discovery search of its own';
        const reference = await placeAndAnnounce(host, bytes);
        const candidate = { contentHash: reference.hash, locator: reference.uri, storage: reference.storage };

        let searchCalls = 0;
        const originalSearch = host.queryService.search.bind(host.queryService);
        host.queryService.search = (...args) => {
            searchCalls += 1;
            throw new Error('Section C: resolveCandidate() must never reach this — it performs no discovery of its own');
        };

        const ctx = panelCtx({
            selectedSnapshotCandidate: candidate,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand
        });
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();

        assert(searchCalls === 0, 'C1. FLAGSHIP — resolveCandidate(), driven through the real UI action and the real resolver instance, never calls queryService.search() even once');
        assert(ctx.selectedSnapshotResolutionError === null, 'C2. sanity: no error surfaced (a call to the poisoned search() would have thrown/rejected)');
        assert(ctx.selectedSnapshotResolutionResult && ctx.selectedSnapshotResolutionResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED,
            'C3. selected resolution completes successfully with zero discovery, zero ranking, zero candidate selection of its own');

        host.queryService.search = originalSearch; // restore, tidiness only

        console.log('✓ Section C: resolving an explicitly selected candidate never discovers, ranks, or selects among candidates of its own — proven by a queryService whose search() would throw if ever reached');
    }

    // ===============================================================
    // Section D — verification remains authoritative, through the real
    // composed runtime and UI.
    // ===============================================================
    {
        const host = makeSharedHostRuntime('audit-153-section-d');
        const realBytes = 'Section D: the real content actually retrievable at this locator';
        const reference = await host.contentStore.put(realBytes);

        // A candidate claiming a DIFFERENT contentHash than the bytes its
        // own locator actually serves — a false claim, never announced by
        // this test as the truth about the locator (announcement is
        // irrelevant here; resolveCandidate() never reads it).
        const claimedHash = computeContentHash('Section D: content this locator never actually holds');
        assert(claimedHash !== reference.hash, 'D0. sanity: the claimed and real hashes genuinely differ');
        const falseCandidate = { contentHash: claimedHash, locator: reference.uri, storage: reference.storage };

        const ctx = panelCtx({
            selectedSnapshotCandidate: falseCandidate,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand
        });
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();

        assert(ctx.selectedSnapshotResolutionResult.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH,
            'D1. FLAGSHIP — a candidate whose declared contentHash disagrees with its own locator\'s real bytes is refused, never RESOLVED');
        assert(ctx.selectedSnapshotResolutionResult.outcome !== DecentralizedSnapshotResolutionOutcome.RESOLVED, 'D2. sanity: never RESOLVED');

        console.log('✓ Section D: the candidate\'s own declared metadata never manufactures success — verification against the real, retrieved bytes remains authoritative for a selected candidate exactly as for a discovered-and-first-matched one');
    }

    // ===============================================================
    // Section E — selected resolution does not attribute.
    // ===============================================================
    {
        const host = makeSharedHostRuntime('audit-153-section-e');
        const bytes = 'Section E: a Snapshot that will genuinely match its own Publication';
        const reference = await placeAndAnnounce(host, bytes);
        const candidate = { contentHash: reference.hash, locator: reference.uri, storage: reference.storage };
        const publication = new Publication({ id: 'pub-audit-153-e', documentId: 'doc-audit-153-e', contentReference: new ContentReference({ hash: reference.hash }) });

        const ctx = panelCtx({
            publication,
            selectedSnapshotCandidate: candidate,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand
        });
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();

        assert(ctx.selectedSnapshotResolutionResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED,
            'E1. selected resolution reports RESOLVED');
        assert(ctx.selectedSnapshotResolutionResult.outcome !== SnapshotPublicationAttributionOutcome.MATCH,
            'E2. FLAGSHIP — RESOLVED is never spelled MATCH, even though the bytes genuinely do belong to this exact Publication');
        assert(ctx.snapshotAttributionResult === null, 'E3. resolveSelectedSnapshot() never populates snapshotAttributionResult — that field stays discoverOwnSnapshot()\'s own, untouched');

        // Only a SEPARATE, explicit call to attribution answers the
        // different question — RESOLUTION and ATTRIBUTION stay two
        // distinct steps, never automatically chained.
        const attribution = resolveSnapshotPublicationAttribution(publication, ctx.selectedSnapshotResolutionResult);
        assert(attribution.outcome === SnapshotPublicationAttributionOutcome.MATCH,
            'E4. attribution, called explicitly and separately over the resolved result, correctly reports MATCH');

        // Structural: resolveSelectedSnapshot() itself never calls
        // resolveSnapshotPublicationAttribution — the method body contains
        // no such call.
        const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        const resolveSelectedSnapshotBody = panelCode.slice(panelCode.indexOf('resolveSelectedSnapshot('), panelCode.indexOf('}', panelCode.lastIndexOf('selectedSnapshotResolutionExecuting = false;')));
        assert(!resolveSelectedSnapshotBody.includes('resolveSnapshotPublicationAttribution'),
            'E5. structural: resolveSelectedSnapshot()\'s own method body never calls resolveSnapshotPublicationAttribution() — only discoverOwnSnapshot() does');

        console.log('✓ Section E: resolveCandidate()/resolveSelectedSnapshot() report RESOLVED, never MATCH — RESOLUTION and ATTRIBUTION stay two explicitly separate steps, even for a Snapshot that genuinely does belong to the current Publication');
    }

    // ===============================================================
    // Section F — resolve(discoveryTag, contentHash) remains
    // semantically unchanged: still discover, still first-match, still
    // delegates to resolveCandidate() — through the real composed
    // runtime. (Exhaustive behavioral coverage of resolve() itself
    // already lives in tests/DecentralizedSnapshotResolution.test.js and
    // tests/SelectedSnapshotCandidateResolution.test.js's own Section G;
    // this is a convergence check, not a re-derivation.)
    // ===============================================================
    {
        const host = makeSharedHostRuntime('audit-153-section-f');
        const sharedBytes = 'Section F: resolve() still performs first-match selection over multiple candidates';
        const referenceFirst = await host.contentStore.put(sharedBytes);
        const referenceSecond = await host.contentStore.put(sharedBytes);
        assert(referenceFirst.hash === referenceSecond.hash, 'F0. sanity: two independently placed copies share one contentHash');

        await host.announcer.publish({ contentHash: referenceFirst.hash, locator: referenceFirst.uri, storage: referenceFirst.storage });
        await host.announcer.publish({ contentHash: referenceSecond.hash, locator: referenceSecond.uri, storage: referenceSecond.storage });

        const result = await host.discoverSnapshotCommand(referenceFirst.hash);
        assert(result.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'F1. resolve() still resolves successfully');
        assert(result.locator === referenceFirst.uri, 'F2. resolve() still picks the FIRST-discovered candidate, never the second — first-match selection is unchanged');
        assert(result.candidates.length === 2, 'F3. resolve() still reports the FULL discovered candidate set, not just the one attempted');

        // resolve()'s own source still performs discovery + first-match
        // selection, then delegates — it never became a second explicit-
        // selection API of its own.
        const resolverCode = await codeOnlySource('application/DecentralizedSnapshotResolver.js');
        assert(resolverCode.includes('async resolve(discoveryTag, contentHash') && resolverCode.includes('this._queryService.search(discoveryTag)'),
            'F4. structural: resolve() still performs its own DISCOVERY step');
        assert(resolverCode.includes('candidates[0]') && resolverCode.includes('this.resolveCandidate(selected'),
            'F5. structural: resolve() still selects candidates[0] (first-match) and delegates to resolveCandidate() — never a second, independent retrieval/verification sequence');

        console.log('✓ Section F: resolve(discoveryTag, contentHash) is unchanged by this milestone\'s own resolveCandidate() seam — still discover, still first-match, still one delegated retrieval/verification path');
    }

    // ===============================================================
    // Section G — structural sweep: one retrieval/verification path,
    // and no new outcome vocabulary.
    // ===============================================================
    {
        // G1. ResolveSelectedSnapshotCommand.js contains no location,
        // retrieval, verification, or hashing logic of its own.
        {
            const code = await codeOnlySource('application/ResolveSelectedSnapshotCommand.js');
            assert(!/\.get\(|computeContentHash\(|\.verify\(|storeRegistry\.get\(|new ContentReference\(/.test(code),
                'G1. application/ResolveSelectedSnapshotCommand.js never retrieves, hashes, verifies, or constructs a ContentReference itself — it calls resolver.resolveCandidate() exactly once and returns the result verbatim');
            const callSites = code.match(/resolver\.resolveCandidate\(/g) || [];
            assert(callSites.length === 1, 'G1b. resolver.resolveCandidate() is called exactly once in this file — never a second, independent call site');
        }

        // G2. OwnPublicationPanel.js's own selected-resolution family
        // contains no duplicated retrieval/hashing/verification logic —
        // it only ever calls the injected resolveSelectedSnapshotCommand.
        {
            const code = await codeOnlySource('ui/components/OwnPublicationPanel.js');
            assert(!/\.get\(reference\)|computeContentHash\(|new ContentReference\(|storeRegistry\.get\(|new DecentralizedSnapshotResolver\(/.test(code),
                'G2. ui/components/OwnPublicationPanel.js never retrieves, hashes, verifies, or constructs a resolver/ContentReference itself');
        }

        // G3. No new SELECTED_CANDIDATE_FAILED-style outcome vocabulary
        // anywhere in this seam — selected resolution preserves the
        // resolver's existing outcome vocabulary unchanged.
        {
            const commandCode = await codeOnlySource('application/ResolveSelectedSnapshotCommand.js');
            const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');
            const resolverCode = await codeOnlySource('application/DecentralizedSnapshotResolver.js');
            const forbidden = /SELECTED_CANDIDATE_FAILED|SELECTION_FAILED|CANDIDATE_REJECTED|SELECTED_CONTENT_HASH_MISMATCH/;
            assert(!forbidden.test(commandCode) && !forbidden.test(panelCode) && !forbidden.test(resolverCode),
                'G3. no new "selected candidate failed"-shaped outcome vocabulary was introduced anywhere in this seam');
        }

        // G4. DecentralizedSnapshotResolutionOutcome's own vocabulary is
        // exactly what it already was — this milestone adds no new value.
        {
            const keys = Object.keys(DecentralizedSnapshotResolutionOutcome);
            assert(keys.length === 5 && keys.includes('RESOLVED') && keys.includes('NOT_DISCOVERED')
                && keys.includes('STORE_UNAVAILABLE') && keys.includes('CONTENT_UNAVAILABLE') && keys.includes('CONTENT_HASH_MISMATCH'),
                'G4. DecentralizedSnapshotResolutionOutcome carries exactly its five pre-existing values — no sixth value was added for selected resolution');
        }

        console.log('✓ Section G: structural sweep — resolveCandidate() inside application/DecentralizedSnapshotResolver.js is the ONLY retrieval/verification implementation; the command and UI layers contain no duplicate of it, and no new outcome vocabulary was introduced');
    }

    // ===============================================================
    // Section H — UI state isolation, through the real composed runtime.
    // ===============================================================
    {
        const host = makeSharedHostRuntime('audit-153-section-h');
        const bytesOne = 'Section H: first candidate';
        const bytesTwo = 'Section H: second candidate, genuinely different content';
        const referenceOne = await placeAndAnnounce(host, bytesOne);
        const referenceTwo = await placeAndAnnounce(host, bytesTwo);

        const ctx = panelCtx({ discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand, resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand });
        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(ctx.snapshotCandidateDiscoveryResult.length === 2, 'H0. sanity: both candidates discovered');
        const [candidateOne, candidateTwo] = ctx.snapshotCandidateDiscoveryResult;

        // H-i. select B, resolve B, then select a DIFFERENT candidate — the
        // prior resolution result disappears, candidate discovery itself
        // is untouched.
        ctx.selectSnapshotCandidate(candidateOne);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotResolutionResult && ctx.selectedSnapshotResolutionResult.locator === referenceOne.uri,
            'H1. sanity: the first selection genuinely resolved');

        ctx.selectSnapshotCandidate(candidateTwo);
        assert(ctx.selectedSnapshotResolutionResult === null, 'H2. selecting a DIFFERENT candidate clears the previous resolution result immediately');
        assert(ctx.snapshotCandidateDiscoveryResult.length === 2 && ctx.snapshotCandidateDiscoveryResult[0] === candidateOne,
            'H3. the discovered candidate collection itself is completely untouched by selection/resolution');

        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotResolutionResult.locator === referenceTwo.uri, 'H4. resolving the new selection produces the NEW candidate\'s own locator, never the stale one');

        // H-ii. a Publication change clears both the selection and its
        // resolution state.
        const publication = new Publication({ id: 'pub-audit-153-h', documentId: 'doc-audit-153-h' });
        OwnPublicationPanel.watch.publication.call(ctx, publication, null);
        ctx.publication = publication;
        assert(ctx.selectedSnapshotCandidate === null, 'H5. a Publication change clears the selected candidate');
        assert(ctx.selectedSnapshotResolutionResult === null, 'H6. ...and its resolution result along with it');

        // H-iii. a stale in-flight resolution can never overwrite the
        // CURRENT selection's state.
        let resolveStale;
        const stallingCommand = () => new Promise((resolve) => { resolveStale = resolve; });
        const staleCtx = panelCtx({ selectedSnapshotCandidate: candidateOne, resolveSelectedSnapshotCommand: stallingCommand });
        staleCtx.resolveSelectedSnapshot(); // stalls
        assert(staleCtx.selectedSnapshotResolutionExecuting === true, 'H7. sanity: the call is genuinely in flight');
        await Promise.resolve(); // let the microtask that invokes stallingCommand() run, so resolveStale is assigned
        await Promise.resolve();

        // The user moves on to a different selection before the stale call
        // settles.
        staleCtx.selectSnapshotCandidate(candidateTwo);
        assert(staleCtx.selectedSnapshotResolutionExecuting === false, 'H8. selecting a different candidate resets executing state immediately, without waiting for the stale call');

        resolveStale({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: bytesOne, candidates: [candidateOne], locator: referenceOne.uri, storage: 'ar', reason: null });
        await flushMicrotasks();
        assert(staleCtx.selectedSnapshotResolutionResult === null, 'H9. FLAGSHIP — the stale response (for the OLD selection) never overwrites the current selection\'s state, even though it genuinely resolved to RESOLVED');
        assert(staleCtx.selectedSnapshotCandidate === candidateTwo, 'H10. the current selection itself is completely untouched by the stale response');

        console.log('✓ Section H: candidate discovery state, the selected candidate, and selected-resolution state stay fully independent — a new selection clears only the stale resolution, a Publication change clears both, and a stale in-flight resolution never touches the current selection');
    }

    // ===============================================================
    // Section I — failure preservation, through the real selected-
    // resolution UI path.
    // ===============================================================
    {
        const failureOutcomes = new Set();

        // I1. STORE_UNAVAILABLE — a candidate was genuinely announced (and
        // is discoverable), but no Arweave capability is composed to
        // resolve its locator.
        {
            const network = makeNostrNetwork();
            const discoveryTag = 'audit-153-section-i-store-unavailable';
            const announcer = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });
            const hash = computeContentHash('Section I1: a candidate genuinely announced, with no store composed to fetch it');
            const candidate = { contentHash: hash, locator: 'ar://section-i1-locator', storage: 'ar' };
            await announcer.publish(candidate);

            const { resolver } = composeDiscoverSnapshotRuntime({
                arweaveContentStoreOptions: {}, // no signer — contentStore stays null
                nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: network.queryImpl }
            });
            const resolveSelectedSnapshotCommand = (c) => executeResolveSelectedSnapshotCommand({ candidate: c, resolver, contentStore: null });

            const ctx = panelCtx({ selectedSnapshotCandidate: candidate, resolveSelectedSnapshotCommand });
            ctx.resolveSelectedSnapshot();
            await flushMicrotasks();
            assert(ctx.selectedSnapshotResolutionResult.outcome === DecentralizedSnapshotResolutionOutcome.STORE_UNAVAILABLE,
                'I1. STORE_UNAVAILABLE is reported verbatim through the real selected-resolution UI path');
            failureOutcomes.add(ctx.selectedSnapshotResolutionResult.outcome);
        }

        // I2. CONTENT_UNAVAILABLE — a real store exists, but the candidate's
        // own locator was never actually placed there.
        {
            const host = makeSharedHostRuntime('audit-153-section-i-content-unavailable');
            const neverPlacedHash = computeContentHash('Section I2: content announced but never actually placed anywhere');
            const candidate = { contentHash: neverPlacedHash, locator: 'ar://section-i2-never-placed-tx', storage: 'ar' };

            const ctx = panelCtx({ selectedSnapshotCandidate: candidate, resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand });
            ctx.resolveSelectedSnapshot();
            await flushMicrotasks();
            assert(ctx.selectedSnapshotResolutionResult.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_UNAVAILABLE,
                'I2. CONTENT_UNAVAILABLE is reported verbatim through the real selected-resolution UI path');
            failureOutcomes.add(ctx.selectedSnapshotResolutionResult.outcome);
        }

        // I3. CONTENT_HASH_MISMATCH — Section D's own scenario, confirmed
        // here as part of the complete failure-vocabulary sweep.
        {
            const host = makeSharedHostRuntime('audit-153-section-i-hash-mismatch');
            const reference = await host.contentStore.put('Section I3: real bytes at a real locator');
            const claimedHash = computeContentHash('Section I3: content this locator does not actually hold');
            const candidate = { contentHash: claimedHash, locator: reference.uri, storage: reference.storage };

            const ctx = panelCtx({ selectedSnapshotCandidate: candidate, resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand });
            ctx.resolveSelectedSnapshot();
            await flushMicrotasks();
            assert(ctx.selectedSnapshotResolutionResult.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH,
                'I3. CONTENT_HASH_MISMATCH is reported verbatim through the real selected-resolution UI path');
            failureOutcomes.add(ctx.selectedSnapshotResolutionResult.outcome);
        }

        assert(failureOutcomes.size === 3, 'I4. all three failure outcomes were genuinely distinct and genuinely reached through the selected-resolution UI path');
        assert(!failureOutcomes.has('SELECTED_CANDIDATE_FAILED'), 'I5. no new, invented failure outcome was ever produced — only the resolver\'s own pre-existing vocabulary');

        console.log('✓ Section I: STORE_UNAVAILABLE, CONTENT_UNAVAILABLE, and CONTENT_HASH_MISMATCH are each reached and reported verbatim through the real selected-resolution UI path — selected resolution introduces no new failure vocabulary of its own');
    }

    // ===============================================================
    // Section J — the full flagship path: three real candidates, two of
    // which point at genuinely different valid Snapshots; selection
    // materially changes the answer.
    // ===============================================================
    {
        const host = makeSharedHostRuntime('audit-153-section-j-flagship');

        // Candidate A and Candidate B: two DIFFERENT, genuinely valid
        // Snapshots, each independently placed and announced under the
        // SAME shared discoveryTag — the realistic "several publishers
        // announced under one campaign marker" shape. Candidate C: a
        // third, unrelated candidate, present purely to prove the browser
        // and resolution stay correct with more than two candidates on
        // screen.
        const bytesA = JSON.stringify({ world: { buildings: [{ id: 'flagship-a-building', bricks: 3 }] } });
        const bytesB = JSON.stringify({ world: { buildings: [{ id: 'flagship-b-building', bricks: 7 }] } });
        const bytesC = JSON.stringify({ world: { buildings: [{ id: 'flagship-c-building', bricks: 11 }] } });
        const referenceA = await placeAndAnnounce(host, bytesA);
        const referenceB = await placeAndAnnounce(host, bytesB);
        const referenceC = await placeAndAnnounce(host, bytesC);
        assert(new Set([referenceA.hash, referenceB.hash, referenceC.hash]).size === 3, 'J0. sanity: all three candidates are genuinely, independently distinct Snapshots');

        // Own Publication — its real content is exactly Candidate B's own.
        const publication = new Publication({ id: 'pub-audit-153-flagship', documentId: 'doc-audit-153-flagship', contentReference: new ContentReference({ hash: referenceB.hash }) });

        const ctx = panelCtx({
            publication,
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand
        });

        // Discover candidates.
        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(ctx.snapshotCandidateDiscoveryResult.length === 3, 'J1. all three candidates were discovered under the shared discoveryTag');

        const candidateB = ctx.snapshotCandidateDiscoveryResult.find((c) => c.contentHash === referenceB.hash);
        assert(candidateB, 'J2. sanity: Candidate B is genuinely among the discovered set');

        // User selects B.
        ctx.selectSnapshotCandidate(candidateB);
        assert(ctx.selectedSnapshotCandidate === candidateB, 'J3. sanity: B is the current selection');

        // ResolveSelectedSnapshotCommand -> resolveCandidate(B) -> exact B
        // locator -> retrieve -> verify -> resolved snapshot.
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        const resolved = ctx.selectedSnapshotResolutionResult;
        assert(resolved.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'J4. B resolves successfully');
        assert(resolved.locator === referenceB.uri, 'J5. the resolved locator is exactly B\'s own, never A\'s or C\'s');
        assert(resolved.bytes === bytesB, 'J6. FLAGSHIP — the retrieved bytes are genuinely B\'s own content, never A\'s or C\'s — selection actually determined which Snapshot came back');

        // Resolution -> attribution, against the CURRENT Publication (whose
        // own content is B's).
        const attributionForB = resolveSnapshotPublicationAttribution(publication, resolved);
        assert(attributionForB.outcome === SnapshotPublicationAttributionOutcome.MATCH, 'J7. attributing the resolved (selected B) Snapshot against the Publication whose own content is B\'s reports MATCH');

        // The DEEPER proof that selection materially mattered: the
        // IDENTICAL resolved Snapshot, attributed instead against a
        // Publication whose own content is A's, reports NO_MATCH — the
        // verdict genuinely depends on WHICH candidate was selected and
        // resolved, not merely on "something resolved successfully."
        const publicationForA = new Publication({ id: 'pub-audit-153-flagship-a', documentId: 'doc-audit-153-flagship-a', contentReference: new ContentReference({ hash: referenceA.hash }) });
        const attributionAgainstA = resolveSnapshotPublicationAttribution(publicationForA, resolved);
        assert(attributionAgainstA.outcome === SnapshotPublicationAttributionOutcome.NO_MATCH,
            'J8. FLAGSHIP — the SAME resolved-B Snapshot attributed against a Publication whose own content is A\'s reports NO_MATCH — selection genuinely changed which Snapshot was retrieved, which changes the attribution verdict');

        // And, symmetrically, had the user selected A instead, resolution
        // would have produced A's own bytes, which WOULD attribute MATCH
        // against publicationForA — proving the asymmetry is about
        // selection, not some quirk of B or A specifically.
        const candidateA = ctx.snapshotCandidateDiscoveryResult.find((c) => c.contentHash === referenceA.hash);
        ctx.selectSnapshotCandidate(candidateA);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        const resolvedA = ctx.selectedSnapshotResolutionResult;
        assert(resolvedA.bytes === bytesA, 'J9. selecting A instead genuinely retrieves A\'s own bytes');
        const attributionAForA = resolveSnapshotPublicationAttribution(publicationForA, resolvedA);
        assert(attributionAForA.outcome === SnapshotPublicationAttributionOutcome.MATCH,
            'J10. ...and DOES attribute MATCH against the Publication whose own content is A\'s — the verdict tracks the SELECTION, symmetrically, in both directions');

        console.log('✓ Section J: the full flagship path — three real, independently placed candidates discovered under one shared discoveryTag; selecting Candidate B resolves EXACTLY B\'s own bytes (never A\'s or C\'s), and the attribution verdict genuinely tracks which candidate was selected, in both directions — proving selection actually matters, not merely relabels an unchanged result');
    }

    console.log('\n✅ All Selected Snapshot Resolution End-to-End Audit tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
