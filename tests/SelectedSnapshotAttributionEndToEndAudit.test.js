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

// 0.9.155 — Selected Snapshot Attribution End-to-End Audit.
//
// 0.9.154 gave OwnPublicationPanel.js `attributeSelectedSnapshot()`, and its
// own tests/SelectedSnapshotAttribution.test.js already gives thorough,
// exhaustive unit-level coverage of that method in isolation — hand-built
// `resolvedResult(...)` fixtures, never a real resolver, a real content
// store, or a real Nostr discovery round trip. This is a test-only audit,
// exactly the shape tests/SelectedSnapshotResolutionEndToEndAudit.test.js
// (0.9.153) already gave the seam one step below — ZERO new production
// code. Its job is different from 0.9.154's own suite: prove that the
// COMPLETE, EXPLICIT path now composes end to end, through the REAL
// composed runtime (composeDiscoverSnapshotRuntime, a real
// ArweaveContentStore, a real NostrSnapshotDiscoveryPublisher/
// NostrSnapshotDiscoveryQueryService pair) and the REAL OwnPublicationPanel
// UI actions — never a second, faster, weaker imitation of what 0.9.154's
// own suite already verified precisely.
//
//   DISCOVER -> SELECT -> RESOLVE EXACT CANDIDATE -> VERIFY -> ATTRIBUTE
//
// THE PARTICULARLY IMPORTANT PROPERTY THIS AUDIT EXISTS TO PROVE: the
// user's own explicit selection can MATERIALLY DETERMINE the final
// attribution verdict — not merely relabel an unchanged result. Selecting
// a different, real, independently placed candidate — over the identical,
// unchanged Publication — flips MATCH to NO_MATCH and back, and a
// candidate whose real bytes fail verification never reaches an
// attribution verdict at all.
//
// Section A: FLAGSHIP MATCH — Publication -> candidate discovery -> select
//            the matching candidate -> resolveCandidate() -> verified
//            bytes -> attributeSelectedSnapshot() -> MATCH, entirely
//            through the real composed runtime and the real UI actions.
// Section B: FLAGSHIP NO_MATCH — two real, independently placed, valid
//            Snapshots under one discoveryTag; selecting the one that is
//            NOT the Publication's own content resolves (RESOLVED) and
//            then attributes NO_MATCH — a successfully resolved Snapshot
//            never implies attribution.
// Section C: SELECTION MATERIALLY CHANGES ATTRIBUTION — the strongest
//            proof of why resolveCandidate() was necessary: over the
//            SAME, unchanged Publication, selecting candidate A yields
//            MATCH and selecting candidate B yields NO_MATCH; only the
//            explicit candidate selection changed.
// Section D: FALSE CANDIDATE / LYING METADATA — a candidate that CLAIMS
//            the Publication's own contentHash but whose real locator
//            serves different bytes fails resolution
//            (CONTENT_HASH_MISMATCH) before attribution is ever reached —
//            through the real resolver and content store, never a
//            fabricated MATCH. The converse is also proven: a candidate
//            whose DECLARED contentHash differs from its own real bytes'
//            hash fails resolution under the identical rule even when
//            those real bytes happen to equal the Publication's own
//            content — resolution is governed by the resolver's own
//            declared-vs-actual verification, never by any relationship to
//            the Publication's hash.
// Section E: EXACT LOCATOR PRESERVATION — a content-store spy proves the
//            complete chain (select -> resolveCandidate ->
//            attributeSelectedSnapshot) is driven end to end by the
//            SELECTED candidate's own locator alone, regardless of
//            discovery order, and the reported snapshotHash is an
//            independent recomputation of the bytes actually retrieved
//            from THAT locator — never reconstructed from
//            publication.contentReference.hash, a candidate's own declared
//            contentHash field, or discovery order.
// Section F: TWO ATTRIBUTION PATHS CONVERGE — the already-known-contentHash
//            path (discoverOwnSnapshot()) and the browsed-and-selected path
//            (select -> resolve -> attributeSelectedSnapshot()), run
//            side by side against the identical real candidate and
//            Publication, produce identical verdicts and hashes — both
//            genuinely invoke resolveSnapshotPublicationAttribution(),
//            never two parallel comparison implementations — while their
//            own UI state (snapshotAttributionResult vs
//            selectedSnapshotAttributionResult) stays fully independent.
// Section G: STATE ISOLATION — candidate discovery state, the selected
//            candidate, selected-resolution state, selected-attribution
//            state, and the OTHER path's own existing attribution state
//            all stay independent through the real composed runtime:
//            selecting a different candidate clears resolution and
//            attribution but never the candidate list; re-resolving the
//            current selection clears a stale attribution immediately; a
//            Publication change clears the entire selected-candidate
//            family at once.
// Section H: FAILURE PRESERVATION — STORE_UNAVAILABLE, CONTENT_UNAVAILABLE,
//            and CONTENT_HASH_MISMATCH each remain resolution outcomes,
//            reported verbatim by attributeSelectedSnapshot() through the
//            real selected-resolution/-attribution UI path — never folded
//            into NO_MATCH, which means something much more specific.
// Section I: NO IMPLICIT ACTIONS — selectSnapshotCandidate() never
//            resolves, resolveSelectedSnapshot() never attributes, and
//            attributeSelectedSnapshot() never (re-)resolves — proven both
//            structurally (source inspection) and behaviorally (call-count
//            spies over the real injected commands).
// Section J: FULL REAL-RUNTIME FLAGSHIP — three real, independently placed
//            candidates announced under one shared discoveryTag: one
//            matching the Publication, one a genuinely different valid
//            Snapshot, and one a deliberately invalid/mismatched
//            announcement. Selecting each in turn, through the real UI,
//            proves the complete outcome changes accordingly: MATCH,
//            NO_MATCH, and CONTENT_HASH_MISMATCH.

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
        return { id: `fake-selected-attribution-audit-tx-${counter}`, transaction: { id: `fake-selected-attribution-audit-tx-${counter}`, data: material } };
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
// queried en route to an attribution verdict, rather than merely trusting
// the returned result's own fields.
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
// composeDiscoverSnapshotRuntime(), with all application-command seams
// (resolve-by-hash, browse candidates, resolve selected candidate) wired
// over the SAME resolver/contentStore/queryService instances — never
// independent compositions coincidentally agreeing.
function makeSharedHostRuntime(discoveryTag) {
    const gateway = makeFakeArweaveGateway();
    const signer = makeFakeArweaveSigner();
    const network = makeNostrNetwork();

    const { resolver, contentStore, queryService } = composeDiscoverSnapshotRuntime({
        arweaveContentStoreOptions: { signer, fetchImpl: gateway.fetchImpl },
        nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: network.queryImpl }
    });

    const announcer = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });

    const discoverSnapshotCommand = (publication) => executeDiscoverSnapshotCommand({
        discoveryTag, contentHash: publication.contentReference.hash, resolver, contentStore
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
    // Section A — FLAGSHIP MATCH, entirely through the real composed
    // runtime and the real UI actions.
    // ===============================================================
    {
        const host = makeSharedHostRuntime('audit-155-section-a');
        const bytes = 'Section A: the Publication\'s own real, distributed content';
        const reference = await placeAndAnnounce(host, bytes);
        const publication = new Publication({ id: 'pub-audit-155-a', documentId: 'doc-audit-155-a', contentReference: new ContentReference({ hash: reference.hash }) });

        const ctx = panelCtx({
            publication,
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand
        });

        // DISCOVER.
        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(ctx.snapshotCandidateDiscoveryResult.length === 1, 'A1. sanity: the candidate was genuinely discovered');
        const candidate = ctx.snapshotCandidateDiscoveryResult[0];

        // SELECT.
        ctx.selectSnapshotCandidate(candidate);
        assert(ctx.selectedSnapshotCandidate === candidate, 'A2. sanity: the candidate is now selected');
        assert(ctx.selectedSnapshotAttributionResult === null, 'A3. sanity: selection alone never attributes');

        // RESOLVE EXACT CANDIDATE + VERIFY.
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotResolutionResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'A4. the selected candidate resolves and verifies');
        assert(ctx.selectedSnapshotAttributionResult === null, 'A5. sanity: a successful resolution never automatically attributes');

        // ATTRIBUTE.
        ctx.attributeSelectedSnapshot();
        assert(ctx.selectedSnapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.MATCH,
            'A6. FLAGSHIP — discover -> select -> resolveCandidate -> verify -> attribute reports MATCH for a genuinely matching Snapshot, entirely through the real composed runtime');
        assert(ctx.selectedSnapshotAttributionResult.publicationHash === reference.hash, 'A7. publicationHash is the real Publication content\'s own hash');
        assert(ctx.selectedSnapshotAttributionResult.snapshotHash === reference.hash, 'A8. snapshotHash is the recomputed hash of the actually-retrieved bytes');

        console.log('✓ Section A: the complete DISCOVER -> SELECT -> RESOLVE -> VERIFY -> ATTRIBUTE path reports MATCH, driven end to end through the real composed runtime and the real UI actions');
    }

    // ===============================================================
    // Section B — FLAGSHIP NO_MATCH: a successfully resolved Snapshot
    // does not imply attribution.
    // ===============================================================
    {
        const host = makeSharedHostRuntime('audit-155-section-b');
        const ownBytes = 'Section B: the Publication\'s own real content';
        const otherBytes = 'Section B: a different, genuinely valid Snapshot, unrelated to the Publication';
        const ownReference = await placeAndAnnounce(host, ownBytes);
        const otherReference = await placeAndAnnounce(host, otherBytes);
        assert(ownReference.hash !== otherReference.hash, 'B0. sanity: the two Snapshots are genuinely different content');

        const publication = new Publication({ id: 'pub-audit-155-b', documentId: 'doc-audit-155-b', contentReference: new ContentReference({ hash: ownReference.hash }) });

        const ctx = panelCtx({
            publication,
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand
        });
        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(ctx.snapshotCandidateDiscoveryResult.length === 2, 'B1. sanity: both candidates were discovered');

        const otherCandidate = ctx.snapshotCandidateDiscoveryResult.find((c) => c.contentHash === otherReference.hash);
        assert(otherCandidate, 'B2. sanity: the unrelated candidate is among the discovered set');

        // Explicitly select the candidate that is NOT the Publication's own.
        ctx.selectSnapshotCandidate(otherCandidate);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotResolutionResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED,
            'B3. resolveCandidate(B) -> RESOLVED — the unrelated Snapshot is genuinely retrieved and verified as itself');

        ctx.attributeSelectedSnapshot();
        assert(ctx.selectedSnapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.NO_MATCH,
            'B4. FLAGSHIP — attribution(B) -> NO_MATCH: a successfully resolved and verified Snapshot does not, by itself, imply it belongs to this Publication');

        console.log('✓ Section B: a Snapshot that resolves successfully (RESOLVED) still reports NO_MATCH when it genuinely is not the Publication\'s own content — resolution success and attribution success are two different facts');
    }

    // ===============================================================
    // Section C — SELECTION MATERIALLY CHANGES ATTRIBUTION. The
    // flagship behavioral proof: over the SAME, unchanged Publication,
    // only the explicit candidate selection changes, and the final
    // outcome changes with it.
    // ===============================================================
    {
        const host = makeSharedHostRuntime('audit-155-section-c');
        const matchingBytes = 'Section C: the matching Snapshot';
        const unrelatedBytes = 'Section C: an unrelated Snapshot, announced under the same discoveryTag';
        const matchingReference = await placeAndAnnounce(host, matchingBytes);
        const unrelatedReference = await placeAndAnnounce(host, unrelatedBytes);

        const publication = new Publication({ id: 'pub-audit-155-c', documentId: 'doc-audit-155-c', contentReference: new ContentReference({ hash: matchingReference.hash }) });
        const publicationHashBeforeAnything = publication.contentReference.hash;

        const ctx = panelCtx({
            publication,
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand
        });
        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        const candidateA = ctx.snapshotCandidateDiscoveryResult.find((c) => c.contentHash === matchingReference.hash);
        const candidateB = ctx.snapshotCandidateDiscoveryResult.find((c) => c.contentHash === unrelatedReference.hash);
        assert(candidateA && candidateB, 'C0. sanity: both candidates are genuinely present');

        // select A -> resolve -> attribute -> MATCH.
        ctx.selectSnapshotCandidate(candidateA);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        ctx.attributeSelectedSnapshot();
        assert(ctx.selectedSnapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.MATCH, 'C1. selecting A reports MATCH');

        // select B -> resolve -> attribute -> NO_MATCH. The Publication
        // object itself is never touched between the two selections.
        ctx.selectSnapshotCandidate(candidateB);
        assert(ctx.publication === publication && ctx.publication.contentReference.hash === publicationHashBeforeAnything,
            'C2. sanity: the Publication is completely unchanged between selections');
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        ctx.attributeSelectedSnapshot();
        assert(ctx.selectedSnapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.NO_MATCH,
            'C3. FLAGSHIP — selecting B instead, over the IDENTICAL unchanged Publication, reports NO_MATCH — only the explicit selection changed');

        // And symmetrically, re-selecting A again flips it straight back.
        ctx.selectSnapshotCandidate(candidateA);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        ctx.attributeSelectedSnapshot();
        assert(ctx.selectedSnapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.MATCH,
            'C4. re-selecting A flips the verdict straight back to MATCH — the verdict tracks the selection, both directions, over the same Publication');

        console.log('✓ Section C: FLAGSHIP — over one unchanged Publication, only the explicit candidate selection changes, and the final attribution verdict changes with it, in both directions — proving why resolveCandidate() over an explicit selection is necessary, not merely convenient');
    }

    // ===============================================================
    // Section D — FALSE CANDIDATE / LYING METADATA, and its converse.
    // ===============================================================
    {
        // D-i. The critical attack scenario: candidate.contentHash equals
        // the Publication's own hash, but the candidate's real locator
        // serves DIFFERENT bytes. Resolution must refuse it before
        // attribution is ever reached — never fabricating MATCH from a
        // metadata coincidence alone.
        {
            const host = makeSharedHostRuntime('audit-155-section-d-lying-hash');
            const publicationBytes = 'Section D-i: the real Publication content';
            const publicationHash = computeContentHash(publicationBytes);
            const publication = new Publication({ id: 'pub-audit-155-d1', documentId: 'doc-audit-155-d1', contentReference: new ContentReference({ hash: publicationHash }) });

            // A locator that genuinely holds DIFFERENT bytes than the
            // Publication's own — but the candidate LIES about it,
            // claiming the Publication's own hash.
            const actualBytesAtLocator = 'Section D-i: content this locator actually, really holds — NOT the Publication\'s own';
            const reference = await host.contentStore.put(actualBytesAtLocator);
            const lyingCandidate = { contentHash: publicationHash, locator: reference.uri, storage: reference.storage };
            await host.announcer.publish(lyingCandidate);

            const ctx = panelCtx({
                publication,
                discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
                resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand
            });
            ctx.discoverSnapshotCandidates();
            await flushMicrotasks();
            const candidate = ctx.snapshotCandidateDiscoveryResult[0];
            assert(candidate.contentHash === publicationHash, 'D0. sanity: the discovered candidate genuinely claims the Publication\'s own hash');

            ctx.selectSnapshotCandidate(candidate);
            ctx.resolveSelectedSnapshot();
            await flushMicrotasks();
            assert(ctx.selectedSnapshotResolutionResult.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH,
                'D1. FLAGSHIP — a candidate lying about the Publication\'s own hash is refused at resolution, through the real resolver and content store');

            ctx.attributeSelectedSnapshot();
            assert(ctx.selectedSnapshotAttributionResult.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH,
                'D2. attribution passes the resolution failure through unchanged');
            assert(ctx.selectedSnapshotAttributionResult.outcome !== SnapshotPublicationAttributionOutcome.MATCH,
                'D3. attribution never fabricates MATCH merely because candidate.contentHash === publication.contentReference.hash — the real resolver\'s own verification against the real, retrieved bytes governs');
            assert(ctx.selectedSnapshotAttributionResult.snapshotHash === null, 'D4. no snapshotHash is ever computed for a resolution that never reached RESOLVED');

            console.log('✓ Section D-i: a candidate claiming the Publication\'s own hash, whose real locator serves different bytes, is refused at resolution through the real infrastructure and never fabricates a MATCH verdict');
        }

        // D-ii. The converse: a candidate whose DECLARED contentHash
        // differs from its own actual bytes' hash still fails resolution
        // under the identical rule — even when those actual bytes happen
        // to be byte-identical to the Publication's own content.
        // Resolution is governed by the resolver's own declared-vs-actual
        // verification rule, never by any relationship to the
        // Publication's hash.
        {
            const host = makeSharedHostRuntime('audit-155-section-d-converse');
            const sharedBytes = 'Section D-ii: content that genuinely IS the Publication\'s own — but the candidate misdeclares its own hash anyway';
            const realReference = await host.contentStore.put(sharedBytes);
            const publication = new Publication({ id: 'pub-audit-155-d2', documentId: 'doc-audit-155-d2', contentReference: new ContentReference({ hash: realReference.hash }) });

            const misdeclaredHash = computeContentHash('Section D-ii: a wholly different string, never placed anywhere');
            assert(misdeclaredHash !== realReference.hash, 'D5. sanity: the misdeclared hash is genuinely neither the real content\'s hash nor anything placed');
            const misdeclaredCandidate = { contentHash: misdeclaredHash, locator: realReference.uri, storage: realReference.storage };
            await host.announcer.publish(misdeclaredCandidate);

            const ctx = panelCtx({
                publication,
                discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
                resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand
            });
            ctx.discoverSnapshotCandidates();
            await flushMicrotasks();
            const candidate = ctx.snapshotCandidateDiscoveryResult[0];
            ctx.selectSnapshotCandidate(candidate);
            ctx.resolveSelectedSnapshot();
            await flushMicrotasks();

            assert(ctx.selectedSnapshotResolutionResult.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH,
                'D6. FLAGSHIP (converse) — a candidate whose declared contentHash disagrees with its own real bytes fails resolution EVEN THOUGH those real bytes genuinely equal the Publication\'s own content — the resolver\'s declared-vs-actual rule governs, never any relationship to the Publication');

            ctx.attributeSelectedSnapshot();
            assert(ctx.selectedSnapshotAttributionResult.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH,
                'D7. attribution is never reached as MATCH here either, despite the underlying bytes genuinely belonging to this Publication — a candidate that lies about its own content is refused before that fact could ever be observed');

            console.log('✓ Section D-ii: a candidate whose own declared contentHash disagrees with its own real bytes fails resolution under the resolver\'s own verification rule alone, regardless of whether those real bytes happen to match the Publication');
        }
    }

    // ===============================================================
    // Section E — EXACT LOCATOR PRESERVATION.
    // ===============================================================
    {
        for (const order of ['first-then-second', 'second-then-first']) {
            const host = makeSharedHostRuntime(`audit-155-section-e-${order}`);
            const recordingStore = makeRecordingContentStore(host.contentStore);
            const resolveSelectedSnapshotCommand = (candidate) => executeResolveSelectedSnapshotCommand({
                candidate, resolver: host.resolver, contentStore: recordingStore
            });

            // Two genuinely DIFFERENT Snapshots (never sharing a
            // contentHash), so that a correct hash proves precisely which
            // locator's bytes were actually used.
            const firstBytes = `Section E (${order}): the first-placed Snapshot`;
            const secondBytes = `Section E (${order}): the second-placed, genuinely different Snapshot`;
            const firstReference = await placeAndAnnounce(host, firstBytes);
            const secondReference = await placeAndAnnounce(host, secondBytes);

            const publication = new Publication({ id: `pub-audit-155-e-${order}`, documentId: `doc-audit-155-e-${order}`, contentReference: new ContentReference({ hash: secondReference.hash }) });

            const ctx = panelCtx({ publication, discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand, resolveSelectedSnapshotCommand });
            ctx.discoverSnapshotCandidates();
            await flushMicrotasks();
            assert(ctx.snapshotCandidateDiscoveryResult.length === 2, `E0 (${order}). sanity: both candidates discovered`);

            const discovered = order === 'first-then-second'
                ? ctx.snapshotCandidateDiscoveryResult
                : [...ctx.snapshotCandidateDiscoveryResult].reverse();
            const selected = discovered[1]; // deliberately NOT the first one discovery would default to
            const secondCandidate = ctx.snapshotCandidateDiscoveryResult.find((c) => c.contentHash === secondReference.hash);

            ctx.selectSnapshotCandidate(selected);
            ctx.resolveSelectedSnapshot();
            await flushMicrotasks();
            ctx.attributeSelectedSnapshot();

            assert(recordingStore.queriedLocators.length === 1 && recordingStore.queriedLocators[0] === selected.locator,
                `E1 (${order}). FLAGSHIP — exactly one content-store query was made, against the SELECTED candidate's own locator alone — regardless of discovery order`);

            const expectedOutcome = selected === secondCandidate ? SnapshotPublicationAttributionOutcome.MATCH : SnapshotPublicationAttributionOutcome.NO_MATCH;
            assert(ctx.selectedSnapshotAttributionResult.outcome === expectedOutcome,
                `E2 (${order}). the attribution verdict corresponds exactly to whichever candidate was actually selected, never to discovery order`);

            const selectedRealBytes = selected === secondCandidate ? secondBytes : firstBytes;
            assert(ctx.selectedSnapshotAttributionResult.snapshotHash === computeContentHash(selectedRealBytes),
                `E3 (${order}). the reported snapshotHash is an independent recomputation of the bytes genuinely retrieved from the SELECTED candidate's own locator — never reconstructed from publication.contentReference.hash, from a candidate's own declared contentHash field, or from discovery order`);

            console.log(`✓ Section E (${order}): the complete chain (select -> resolveCandidate -> attribute) is driven end to end by the selected candidate's own locator alone, proven by an external content-store spy — never reconstructed from the Publication's hash, a candidate's declared metadata, or discovery order`);
        }
    }

    // ===============================================================
    // Section F — TWO ATTRIBUTION PATHS CONVERGE.
    // ===============================================================
    {
        const host = makeSharedHostRuntime('audit-155-section-f');
        const bytes = 'Section F: content shared by both the already-known-contentHash path and the browsed-and-selected path';
        const reference = await placeAndAnnounce(host, bytes);
        const publication = new Publication({ id: 'pub-audit-155-f', documentId: 'doc-audit-155-f', contentReference: new ContentReference({ hash: reference.hash }) });

        const ctx = panelCtx({
            publication,
            discoverSnapshotCommand: host.discoverSnapshotCommand,
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand
        });

        // Path 1: "Check Snapshot Match" — the already-known-contentHash
        // path, computed inline by discoverOwnSnapshot() itself (0.9.144).
        ctx.discoverOwnSnapshot();
        await flushMicrotasks();
        assert(ctx.snapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.MATCH, 'F1. Path 1 (Check Snapshot Match) reports MATCH');

        // Path 2: browse -> select -> resolve -> attribute.
        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        const candidate = ctx.snapshotCandidateDiscoveryResult[0];
        ctx.selectSnapshotCandidate(candidate);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        ctx.attributeSelectedSnapshot();
        assert(ctx.selectedSnapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.MATCH, 'F2. Path 2 (browse/select/resolve/attribute) ALSO reports MATCH');

        // Both paths must agree on both hashes — the identical comparison
        // function, applied to the identical real bytes.
        assert(ctx.snapshotAttributionResult.publicationHash === ctx.selectedSnapshotAttributionResult.publicationHash,
            'F3. both paths report the identical publicationHash');
        assert(ctx.snapshotAttributionResult.snapshotHash === ctx.selectedSnapshotAttributionResult.snapshotHash,
            'F4. both paths report the identical snapshotHash — the same real bytes, verified twice via two independent entry points');

        // Yet the two results remain genuinely separate objects/fields —
        // never aliased, never sharing state.
        assert(ctx.snapshotAttributionResult !== ctx.selectedSnapshotAttributionResult,
            'F5. the two paths\' own results are genuinely separate objects, never the same reference');

        // Structural: both call sites genuinely invoke the SAME imported
        // function — never two parallel comparison implementations.
        const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        const importLines = panelCode.match(/import\s*\{\s*resolveSnapshotPublicationAttribution\s*\}/g) || [];
        assert(importLines.length === 1, 'F6. resolveSnapshotPublicationAttribution is imported exactly once, from application/SnapshotPublicationAttribution.js — never reimplemented for either path');
        const callSites = panelCode.match(/resolveSnapshotPublicationAttribution\(/g) || [];
        assert(callSites.length === 2, 'F7. exactly two call sites exist in this file — discoverOwnSnapshot()\'s own (0.9.144) and attributeSelectedSnapshot()\'s own (0.9.154) — both invoking the identical imported function, per resolveSnapshotPublicationAttribution() itself (application/SnapshotPublicationAttribution.js), rather than a second, independent comparison');

        console.log('✓ Section F: the already-known-contentHash path and the browsed-and-selected path converge on the identical resolveSnapshotPublicationAttribution() call, producing identical verdicts and hashes for the identical real bytes, while keeping fully independent UI-state fields');
    }

    // ===============================================================
    // Section G — STATE ISOLATION, through the real composed runtime.
    // ===============================================================
    {
        const host = makeSharedHostRuntime('audit-155-section-g');
        const bytesOne = 'Section G: first candidate';
        const bytesTwo = 'Section G: second candidate, genuinely different content';
        const referenceOne = await placeAndAnnounce(host, bytesOne);
        const referenceTwo = await placeAndAnnounce(host, bytesTwo);
        const publication = new Publication({ id: 'pub-audit-155-g', documentId: 'doc-audit-155-g', contentReference: new ContentReference({ hash: referenceOne.hash }) });

        const ctx = panelCtx({
            publication,
            discoverSnapshotCommand: host.discoverSnapshotCommand,
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand
        });

        // The OTHER path's own attribution state, set independently —
        // must never be touched by anything the selected-candidate family
        // below does.
        ctx.discoverOwnSnapshot();
        await flushMicrotasks();
        assert(ctx.snapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.MATCH, 'G0. sanity: the other path\'s own attribution result is set');
        const otherPathAttributionBefore = ctx.snapshotAttributionResult;

        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(ctx.snapshotCandidateDiscoveryResult.length === 2, 'G1. sanity: both candidates discovered');
        const [candidateOne, candidateTwo] = ctx.snapshotCandidateDiscoveryResult;

        // G-i. select One, resolve, attribute -> then select a DIFFERENT
        // candidate: resolution AND attribution clear immediately; the
        // candidate list and the OTHER path's own attribution are both
        // untouched.
        ctx.selectSnapshotCandidate(candidateOne);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        ctx.attributeSelectedSnapshot();
        assert(ctx.selectedSnapshotAttributionResult !== null, 'G2. sanity: the first selection genuinely attributed');

        ctx.selectSnapshotCandidate(candidateTwo);
        assert(ctx.selectedSnapshotResolutionResult === null, 'G3. selecting a DIFFERENT candidate clears the stale resolution result');
        assert(ctx.selectedSnapshotAttributionResult === null, 'G4. ...and the stale attribution result computed from it, immediately');
        assert(ctx.snapshotCandidateDiscoveryResult.length === 2 && ctx.snapshotCandidateDiscoveryResult[0] === candidateOne,
            'G5. the discovered candidate list itself is completely untouched');
        assert(ctx.snapshotAttributionResult === otherPathAttributionBefore,
            'G6. the OTHER path\'s own attribution result is completely untouched by selecting/clearing the selected-candidate family');

        // G-ii. resolve the new selection, attribute it, then RE-RESOLVE
        // the SAME (current) selection: attribution clears immediately,
        // synchronously, before the fresh resolution even settles.
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        ctx.attributeSelectedSnapshot();
        assert(ctx.selectedSnapshotAttributionResult !== null, 'G7. sanity: the new selection genuinely attributed');

        let resolveStale;
        ctx.resolveSelectedSnapshotCommand = () => new Promise((resolve) => { resolveStale = resolve; });
        ctx.resolveSelectedSnapshot();
        assert(ctx.selectedSnapshotAttributionResult === null,
            'G8. FLAGSHIP — re-resolving the CURRENT selection clears the prior attribution result immediately, synchronously, before the fresh resolution call even settles');
        assert(ctx.selectedSnapshotCandidate === candidateTwo, 'G9. the current selection itself is untouched by starting a fresh resolution of it');
        await Promise.resolve(); // let the microtask that invokes resolveSelectedSnapshotCommand() run, so resolveStale is assigned
        await Promise.resolve();
        resolveStale({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: bytesTwo, candidates: [candidateTwo], locator: referenceTwo.uri, storage: 'ar', reason: null });
        await flushMicrotasks();

        // G-iii. a Publication change clears the ENTIRE selected-candidate
        // family together — selection, resolution, and attribution.
        const newPublication = new Publication({ id: 'pub-audit-155-g-new', documentId: 'doc-audit-155-g-new' });
        OwnPublicationPanel.watch.publication.call(ctx, newPublication, ctx.publication);
        ctx.publication = newPublication;
        assert(ctx.selectedSnapshotCandidate === null, 'G10. a Publication change clears the selected candidate');
        assert(ctx.selectedSnapshotResolutionResult === null, 'G11. ...and its resolution result');
        assert(ctx.selectedSnapshotAttributionResult === null, 'G12. ...and its attribution result, all together');
        assert(ctx.snapshotAttributionResult === null, 'G13. the OTHER path\'s own attribution result is ALSO reset by a Publication change — the identical lifecycle-safety reset, one family over');

        console.log('✓ Section G: candidate discovery state, the selected candidate, selected-resolution state, selected-attribution state, and the other path\'s own existing attribution state all stay independent — a new selection or a fresh resolution clears only what has genuinely gone stale, and a Publication change resets the entire family at once');
    }

    // ===============================================================
    // Section H — FAILURE PRESERVATION, through the real selected-
    // resolution/-attribution UI path.
    // ===============================================================
    {
        const observedOutcomes = new Set();

        // H-i. STORE_UNAVAILABLE — a candidate genuinely announced, but no
        // Arweave capability is composed to resolve its locator.
        {
            const network = makeNostrNetwork();
            const discoveryTag = 'audit-155-section-h-store-unavailable';
            const announcer = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });
            const hash = computeContentHash('Section H-i: a candidate genuinely announced, with no store composed to fetch it');
            const candidate = { contentHash: hash, locator: 'ar://section-h1-locator', storage: 'ar' };
            await announcer.publish(candidate);

            const { resolver } = composeDiscoverSnapshotRuntime({
                arweaveContentStoreOptions: {}, // no signer — contentStore stays null
                nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: network.queryImpl }
            });
            const resolveSelectedSnapshotCommand = (c) => executeResolveSelectedSnapshotCommand({ candidate: c, resolver, contentStore: null });
            const publication = new Publication({ id: 'pub-audit-155-h1', documentId: 'doc-audit-155-h1', contentReference: new ContentReference({ hash }) });

            const ctx = panelCtx({ publication, selectedSnapshotCandidate: candidate, resolveSelectedSnapshotCommand });
            ctx.resolveSelectedSnapshot();
            await flushMicrotasks();
            ctx.attributeSelectedSnapshot();
            assert(ctx.selectedSnapshotAttributionResult.outcome === DecentralizedSnapshotResolutionOutcome.STORE_UNAVAILABLE,
                'H1. STORE_UNAVAILABLE is reported verbatim by attributeSelectedSnapshot(), through the real selected-resolution UI path');
            observedOutcomes.add(ctx.selectedSnapshotAttributionResult.outcome);
        }

        // H-ii. CONTENT_UNAVAILABLE — a real store exists, but the
        // candidate's own locator was never actually placed there.
        {
            const host = makeSharedHostRuntime('audit-155-section-h-content-unavailable');
            const neverPlacedHash = computeContentHash('Section H-ii: content announced but never actually placed anywhere');
            const candidate = { contentHash: neverPlacedHash, locator: 'ar://section-h2-never-placed-tx', storage: 'ar' };
            const publication = new Publication({ id: 'pub-audit-155-h2', documentId: 'doc-audit-155-h2', contentReference: new ContentReference({ hash: neverPlacedHash }) });

            const ctx = panelCtx({ publication, selectedSnapshotCandidate: candidate, resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand });
            ctx.resolveSelectedSnapshot();
            await flushMicrotasks();
            ctx.attributeSelectedSnapshot();
            assert(ctx.selectedSnapshotAttributionResult.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_UNAVAILABLE,
                'H2. CONTENT_UNAVAILABLE is reported verbatim by attributeSelectedSnapshot(), through the real selected-resolution UI path');
            observedOutcomes.add(ctx.selectedSnapshotAttributionResult.outcome);
        }

        // H-iii. CONTENT_HASH_MISMATCH — Section D's own scenario,
        // confirmed here as part of the complete failure-vocabulary sweep.
        {
            const host = makeSharedHostRuntime('audit-155-section-h-hash-mismatch');
            const reference = await host.contentStore.put('Section H-iii: real bytes at a real locator');
            const claimedHash = computeContentHash('Section H-iii: content this locator does not actually hold');
            const candidate = { contentHash: claimedHash, locator: reference.uri, storage: reference.storage };
            const publication = new Publication({ id: 'pub-audit-155-h3', documentId: 'doc-audit-155-h3', contentReference: new ContentReference({ hash: claimedHash }) });

            const ctx = panelCtx({ publication, selectedSnapshotCandidate: candidate, resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand });
            ctx.resolveSelectedSnapshot();
            await flushMicrotasks();
            ctx.attributeSelectedSnapshot();
            assert(ctx.selectedSnapshotAttributionResult.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH,
                'H3. CONTENT_HASH_MISMATCH is reported verbatim by attributeSelectedSnapshot(), through the real selected-resolution UI path');
            observedOutcomes.add(ctx.selectedSnapshotAttributionResult.outcome);
        }

        assert(observedOutcomes.size === 3, 'H4. all three failure outcomes were genuinely distinct and genuinely reached through attributeSelectedSnapshot()');
        assert(!observedOutcomes.has(SnapshotPublicationAttributionOutcome.NO_MATCH),
            'H5. FLAGSHIP — none of these three resolution failures is ever reported as NO_MATCH, which means something much more specific: a Snapshot that was successfully resolved and verified, but whose content does not correspond to the Publication');

        console.log('✓ Section H: STORE_UNAVAILABLE, CONTENT_UNAVAILABLE, and CONTENT_HASH_MISMATCH each remain resolution outcomes, reported verbatim by attributeSelectedSnapshot() through the real selected-resolution UI path — none is ever folded into NO_MATCH');
    }

    // ===============================================================
    // Section I — NO IMPLICIT ACTIONS, structural and behavioral.
    // ===============================================================
    {
        const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');

        // I-i. Structural: selectSnapshotCandidate() never resolves.
        const selectSnapshotCandidateBody = (panelCode.match(/selectSnapshotCandidate\(candidate\)\s*\{[\s\S]*?\n\s{8}\},/) || [''])[0];
        assert(selectSnapshotCandidateBody.length > 0, 'I1. sanity: selectSnapshotCandidate() body was found');
        assert(!selectSnapshotCandidateBody.includes('resolveSelectedSnapshotCommand') && !selectSnapshotCandidateBody.includes('resolveSnapshotPublicationAttribution'),
            'I2. selectSnapshotCandidate() never calls resolveSelectedSnapshotCommand or resolveSnapshotPublicationAttribution — selecting never resolves and never attributes');

        // I-ii. Structural: resolveSelectedSnapshot() never attributes.
        const resolveSelectedSnapshotBody = (panelCode.match(/resolveSelectedSnapshot\(\)\s*\{[\s\S]*?\n\s{8}\},/) || [''])[0];
        assert(resolveSelectedSnapshotBody.length > 0, 'I3. sanity: resolveSelectedSnapshot() body was found');
        assert(!resolveSelectedSnapshotBody.includes('resolveSnapshotPublicationAttribution'),
            'I4. resolveSelectedSnapshot() never calls resolveSnapshotPublicationAttribution() — resolving never attributes');

        // I-iii. Structural: attributeSelectedSnapshot() never (re-)resolves.
        const attributeSelectedSnapshotBody = (panelCode.match(/attributeSelectedSnapshot\(\)\s*\{[\s\S]*?\n\s{8}\}/) || [''])[0];
        assert(attributeSelectedSnapshotBody.length > 0, 'I5. sanity: attributeSelectedSnapshot() body was found');
        assert(!attributeSelectedSnapshotBody.includes('resolveSelectedSnapshotCommand') && !attributeSelectedSnapshotBody.includes('this.resolveSelectedSnapshot('),
            'I6. attributeSelectedSnapshot() never calls resolveSelectedSnapshotCommand or resolveSelectedSnapshot() itself — attributing never (re-)resolves');

        // I-iv. Behavioral, through the real composed runtime: selecting a
        // candidate never calls the injected resolveSelectedSnapshotCommand,
        // and attributing (once, or repeatedly) never calls it either.
        const host = makeSharedHostRuntime('audit-155-section-i-behavioral');
        const bytes = 'Section I: behavioral no-implicit-action fixture content';
        const reference = await placeAndAnnounce(host, bytes);
        const publication = new Publication({ id: 'pub-audit-155-i', documentId: 'doc-audit-155-i', contentReference: new ContentReference({ hash: reference.hash }) });

        let resolveCalls = 0;
        const countingResolveSelectedSnapshotCommand = (candidate) => {
            resolveCalls += 1;
            return host.resolveSelectedSnapshotCommand(candidate);
        };

        const ctx = panelCtx({
            publication,
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: countingResolveSelectedSnapshotCommand
        });
        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        const candidate = ctx.snapshotCandidateDiscoveryResult[0];

        ctx.selectSnapshotCandidate(candidate);
        assert(resolveCalls === 0, 'I7. selecting a candidate never calls the injected resolveSelectedSnapshotCommand');

        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        assert(resolveCalls === 1, 'I8. sanity: resolving calls it exactly once');

        ctx.attributeSelectedSnapshot();
        ctx.attributeSelectedSnapshot();
        assert(resolveCalls === 1, 'I9. FLAGSHIP — calling attributeSelectedSnapshot(), even repeatedly, never calls resolveSelectedSnapshotCommand again — attributing never triggers a fresh resolution');

        console.log('✓ Section I: selectSnapshotCandidate() never resolves, resolveSelectedSnapshot() never attributes, and attributeSelectedSnapshot() never (re-)resolves — proven both structurally and by a real call-count spy over the injected command');
    }

    // ===============================================================
    // Section J — FULL REAL-RUNTIME FLAGSHIP: three real candidates,
    // one matching, one valid-but-unrelated, one deliberately
    // invalid/mismatched — selecting each in turn changes the complete
    // outcome accordingly.
    // ===============================================================
    {
        const host = makeSharedHostRuntime('audit-155-section-j-flagship');

        // Candidate A: matches the Publication.
        // Candidate B: a genuinely different, valid Snapshot.
        // Candidate C: a deliberately invalid/mismatched announcement —
        //              its declared contentHash does not correspond to
        //              the actual bytes its own locator serves.
        const bytesA = JSON.stringify({ world: { buildings: [{ id: 'flagship-a-building', bricks: 3 }] } });
        const bytesB = JSON.stringify({ world: { buildings: [{ id: 'flagship-b-building', bricks: 7 }] } });
        const referenceA = await placeAndAnnounce(host, bytesA);
        const referenceB = await placeAndAnnounce(host, bytesB);

        const bytesAtLocatorC = JSON.stringify({ world: { buildings: [{ id: 'flagship-c-actual-content', bricks: 99 }] } });
        const referenceC = await host.contentStore.put(bytesAtLocatorC);
        const declaredHashC = computeContentHash(JSON.stringify({ world: { buildings: [{ id: 'flagship-c-declared-but-never-real', bricks: 13 }] } }));
        const candidateCAnnouncement = { contentHash: declaredHashC, locator: referenceC.uri, storage: referenceC.storage };
        await host.announcer.publish(candidateCAnnouncement);

        assert(new Set([referenceA.hash, referenceB.hash, declaredHashC]).size === 3, 'J0. sanity: all three candidates carry genuinely distinct contentHash values');

        const publication = new Publication({ id: 'pub-audit-155-flagship', documentId: 'doc-audit-155-flagship', contentReference: new ContentReference({ hash: referenceA.hash }) });

        const ctx = panelCtx({
            publication,
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand
        });

        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(ctx.snapshotCandidateDiscoveryResult.length === 3, 'J1. all three candidates were discovered under the shared discoveryTag');

        const candidateA = ctx.snapshotCandidateDiscoveryResult.find((c) => c.contentHash === referenceA.hash);
        const candidateB = ctx.snapshotCandidateDiscoveryResult.find((c) => c.contentHash === referenceB.hash);
        const candidateC = ctx.snapshotCandidateDiscoveryResult.find((c) => c.contentHash === declaredHashC);
        assert(candidateA && candidateB && candidateC, 'J2. sanity: all three candidates are individually identifiable in the discovered set');

        // select A -> RESOLVED -> MATCH.
        ctx.selectSnapshotCandidate(candidateA);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotResolutionResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'J3. selecting A resolves');
        ctx.attributeSelectedSnapshot();
        assert(ctx.selectedSnapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.MATCH, 'J4. selecting A attributes MATCH');

        // select B -> RESOLVED -> NO_MATCH.
        ctx.selectSnapshotCandidate(candidateB);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotResolutionResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'J5. selecting B also resolves — it is a genuinely valid Snapshot, just not this Publication\'s own');
        ctx.attributeSelectedSnapshot();
        assert(ctx.selectedSnapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.NO_MATCH, 'J6. selecting B attributes NO_MATCH');

        // select C -> CONTENT_HASH_MISMATCH -> never MATCH or NO_MATCH.
        ctx.selectSnapshotCandidate(candidateC);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotResolutionResult.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH,
            'J7. selecting the deliberately invalid/mismatched candidate C is refused at resolution, never RESOLVED');
        ctx.attributeSelectedSnapshot();
        assert(ctx.selectedSnapshotAttributionResult.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH,
            'J8. FLAGSHIP — attribution for C reports CONTENT_HASH_MISMATCH verbatim, never MATCH and never NO_MATCH');

        // Selecting A again, last, proves the whole sequence is genuinely
        // reversible and stateless across selections — never a one-way
        // ratchet or an accumulating side effect from B or C.
        ctx.selectSnapshotCandidate(candidateA);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        ctx.attributeSelectedSnapshot();
        assert(ctx.selectedSnapshotAttributionResult.outcome === SnapshotPublicationAttributionOutcome.MATCH,
            'J9. selecting A once more, after B and C, still reports MATCH — the complete pipeline is deterministic in the selected candidate alone, with no accumulated state from prior selections');

        console.log('✓ Section J: FULL FLAGSHIP — three real, independently placed candidates (matching, valid-but-unrelated, deliberately invalid) discovered under one shared discoveryTag; selecting each in turn, through the real composed runtime and the real UI actions, changes the complete outcome accordingly: MATCH, NO_MATCH, and CONTENT_HASH_MISMATCH');
    }

    console.log('\n✅ All Selected Snapshot Attribution End-to-End Audit tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
