import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/DiscoverSnapshotCandidatesCommand.js';
import { executeResolveSelectedSnapshotCommand } from '../application/ResolveSelectedSnapshotCommand.js';
import { executeMaterializeSelectedSnapshotCommand } from '../application/MaterializeSelectedSnapshotCommand.js';
import { MaterializeSnapshotFromSelectedCandidateUseCase } from '../application/MaterializeSnapshotFromSelectedCandidateUseCase.js';
import { StoreSnapshotContentUseCase } from '../application/StoreSnapshotContentUseCase.js';
import { SnapshotCandidateMaterializationOutcome } from '../application/SnapshotCandidateMaterializationOutcome.js';
import { SnapshotMaterializationSourceKind } from '../application/SnapshotMaterializationSourceKind.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { ContentReference } from '../core/ContentReference.js';

// 0.9.158 — Selected Snapshot Materialization.
//
// 0.9.150 through 0.9.157 built and proved DISCOVER -> SELECT -> RESOLVE ->
// VERIFY -> ATTRIBUTE, entirely in memory: a verified Snapshot's bytes
// live only inside a resolveCandidate() result, never turned into local
// possession. This milestone adds exactly one seam beyond that pipeline —
// application/MaterializeSnapshotFromSelectedCandidateUseCase.js — which
// turns an ALREADY-RESOLVED, ALREADY-VERIFIED selected-candidate result
// into bytes actually held in this replica's own local content/
// ContentStore.js, through the SAME application/
// StoreSnapshotContentUseCase.js boundary every other explicit
// materialization source (PACKAGE/PLACEMENT/PEER) already shares.
//
//   Section A: MaterializeSnapshotFromSelectedCandidateUseCase constructor
//              validation, and execute() over a hand-built resolution
//              result for every DecentralizedSnapshotResolutionOutcome
//              value — RESOLVED -> STORED/ALREADY_AVAILABLE, and every
//              non-RESOLVED outcome reported VERBATIM, never remapped.
//   Section B: MaterializeSelectedSnapshotCommand — a pure assembly
//              boundary, synchronous validation, verbatim forwarding.
//   Section C — FLAGSHIP: a real composed runtime (real Nostr discovery,
//              real Arweave content store) — discover candidates, select
//              one, resolve it, materialize it, and confirm the bytes are
//              now genuinely retrievable from this replica's OWN local
//              content store, completely independent of the remote
//              Arweave store resolution itself used.
//   Section D: OwnPublicationPanel's own UI state machine — the guard/
//              requestId pattern, staleness resets on a new selection, a
//              fresh resolution attempt, and a Publication change, and
//              independence from `selectedSnapshotAttributionResult`.
//   Section E: materialization never touches attribution, a publication
//              catalog, or publicationId — behaviorally and structurally.
//   Section F: structural sweep — SnapshotMaterializationSourceKind.CANDIDATE
//              exists, no new algorithm duplicates resolveCandidate()'s or
//              StoreSnapshotContentUseCase's own hashing/verification, and
//              no attribution call site inside materializeSelectedSnapshot().

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
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
        return { id: `fake-materialization-tx-${counter}`, transaction: { id: `fake-materialization-tx-${counter}`, data: material } };
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

// One shared "host" — a real Arweave signer/gateway and a real Nostr
// network — composed exactly the way ui/main.js composes
// composeDiscoverSnapshotRuntime(), plus a SEPARATE, genuinely independent
// local content store this replica materializes INTO — never the same
// store the resolver retrieves FROM, exactly the two-store shape real
// materialization exists to bridge (a remote source, this replica's own
// local possession).
function makeHost(discoveryTag) {
    const gateway = makeFakeArweaveGateway();
    const signer = makeFakeArweaveSigner();
    const network = makeNostrNetwork();

    const { resolver, contentStore, queryService } = composeDiscoverSnapshotRuntime({
        arweaveContentStoreOptions: { signer, fetchImpl: gateway.fetchImpl },
        nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: network.queryImpl }
    });

    const announcer = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });

    const localContentStore = new LocalContentStore(new InMemoryStorageProvider());
    const storeSnapshotContentUseCase = new StoreSnapshotContentUseCase(localContentStore);
    const materializer = new MaterializeSnapshotFromSelectedCandidateUseCase(storeSnapshotContentUseCase);

    const discoverSnapshotCandidatesCommand = () => executeDiscoverSnapshotCandidatesCommand({
        discoveryTag, discoveryQueryService: queryService
    });
    const resolveSelectedSnapshotCommand = (candidate) => executeResolveSelectedSnapshotCommand({
        candidate, resolver, contentStore
    });
    const materializeSelectedSnapshotCommand = (resolution) => executeMaterializeSelectedSnapshotCommand({
        resolution, materializer
    });

    return {
        gateway, signer, network, discoveryTag, resolver, contentStore, queryService, announcer,
        localContentStore, storeSnapshotContentUseCase, materializer,
        discoverSnapshotCandidatesCommand, resolveSelectedSnapshotCommand, materializeSelectedSnapshotCommand
    };
}

async function placeAndAnnounce(host, bytes) {
    const reference = await host.contentStore.put(bytes);
    await host.announcer.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });
    return reference;
}

function panelCtx(overrides = {}) {
    return {
        publication: null,
        discoverSnapshotCandidatesCommand: null,
        resolveSelectedSnapshotCommand: null,
        materializeSelectedSnapshotCommand: null,
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
        selectedSnapshotMaterializationExecuting: false,
        selectedSnapshotMaterializationError: null,
        selectedSnapshotMaterializationResult: null,
        selectedSnapshotMaterializationRequestId: 0,
        discoverSnapshotCandidates: OwnPublicationPanel.methods.discoverSnapshotCandidates,
        selectSnapshotCandidate: OwnPublicationPanel.methods.selectSnapshotCandidate,
        resolveSelectedSnapshot: OwnPublicationPanel.methods.resolveSelectedSnapshot,
        attributeSelectedSnapshot: OwnPublicationPanel.methods.attributeSelectedSnapshot,
        materializeSelectedSnapshot: OwnPublicationPanel.methods.materializeSelectedSnapshot,
        ...overrides
    };
}

function resolvedResult({ bytes, candidate }) {
    return { outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes, candidates: [candidate], locator: candidate.locator, storage: candidate.storage, reason: null };
}

function failedResult(outcome, candidate = null, reason = 'a resolution failure') {
    return { outcome, bytes: null, candidates: candidate ? [candidate] : [], locator: candidate ? candidate.locator : null, storage: candidate ? candidate.storage : null, reason };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — MaterializeSnapshotFromSelectedCandidateUseCase
    // ---------------------------------------------------------------
    {
        let threw = false;
        try { new MaterializeSnapshotFromSelectedCandidateUseCase(null); } catch (e) { threw = true; }
        assert(threw, '1. constructor requires a StoreSnapshotContentUseCase');
        threw = false;
        try { new MaterializeSnapshotFromSelectedCandidateUseCase({}); } catch (e) { threw = true; }
        assert(threw, '2. constructor rejects an object with no execute()');

        const localContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const storeSnapshotContentUseCase = new StoreSnapshotContentUseCase(localContentStore);
        const materializer = new MaterializeSnapshotFromSelectedCandidateUseCase(storeSnapshotContentUseCase);

        let threwOnExecute = false;
        try { await materializer.execute(null); } catch (e) { threwOnExecute = true; }
        assert(threwOnExecute, '3. execute(null) rejects a caller contract violation, not a resolution outcome');
        threwOnExecute = false;
        try { await materializer.execute({}); } catch (e) { threwOnExecute = true; }
        assert(threwOnExecute, '4. execute({}) — no outcome field — also throws');

        // RESOLVED -> STORED, then ALREADY_AVAILABLE on a repeat.
        const bytes = 'Section A: real content behind a real resolution';
        const candidate = { contentHash: computeContentHash(bytes), locator: 'ar://section-a-locator', storage: 'ar' };
        const resolution = resolvedResult({ bytes, candidate });

        const first = await materializer.execute(resolution);
        assert(first.outcome === SnapshotCandidateMaterializationOutcome.STORED, '5. a fresh RESOLVED result materializes as STORED');
        assert(first.contentHash === candidate.contentHash, '6. contentHash is the candidate\'s own');
        assert(first.contentReference && first.contentReference.hash === candidate.contentHash, '7. a genuine contentReference is returned');
        assert(first.source.kind === SnapshotMaterializationSourceKind.CANDIDATE, '8. source.kind is CANDIDATE');
        assert((await localContentStore.has(new ContentReference({ hash: candidate.contentHash }))) === true, '9. the bytes are genuinely now in the LOCAL content store');

        const second = await materializer.execute(resolution);
        assert(second.outcome === SnapshotCandidateMaterializationOutcome.ALREADY_AVAILABLE, '10. materializing the identical resolution again reports ALREADY_AVAILABLE, never an error');

        // Every non-RESOLVED outcome is reported VERBATIM, never remapped.
        for (const outcome of [
            DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED,
            DecentralizedSnapshotResolutionOutcome.STORE_UNAVAILABLE,
            DecentralizedSnapshotResolutionOutcome.CONTENT_UNAVAILABLE,
            DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH
        ]) {
            const failure = failedResult(outcome, candidate, `reason for ${outcome}`);
            const result = await materializer.execute(failure);
            assert(result.outcome === outcome, `11. ${outcome} is reported verbatim, never remapped to a materialization-specific value`);
            assert(result.reason === `reason for ${outcome}`, `12. ${outcome}'s own reason is preserved unchanged`);
            assert(result.contentReference === null, `13. ${outcome} stores nothing`);
        }

        // NOT_DISCOVERED carries no candidate at all — contentHash is null.
        const notDiscovered = await materializer.execute(failedResult(DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED));
        assert(notDiscovered.contentHash === null, '14. with zero candidates, contentHash is null rather than fabricated');

        // No publicationId/publicationKnown of any kind on any result —
        // unlike its PLACEMENT/PEER siblings.
        assert(!('publicationId' in first) && !('publicationKnown' in first), '15. no publicationId/publicationKnown field exists on any result — a Nostr candidate carries no publicationId at all');
    }
    console.log('✓ Section A: MaterializeSnapshotFromSelectedCandidateUseCase — constructor validation, STORED/ALREADY_AVAILABLE, and every non-RESOLVED outcome passed through verbatim');

    // ---------------------------------------------------------------
    // Section B — MaterializeSelectedSnapshotCommand: pure assembly
    // ---------------------------------------------------------------
    {
        let threw = false;
        try { executeMaterializeSelectedSnapshotCommand({ resolution: {} }); } catch (e) { threw = true; }
        assert(threw, '1. a missing materializer throws synchronously');
        threw = false;
        try { executeMaterializeSelectedSnapshotCommand({ resolution: {}, materializer: {} }); } catch (e) { threw = true; }
        assert(threw, '2. a materializer with no execute() also throws synchronously');

        const calls = [];
        const fakeMaterializer = { execute(resolution) { calls.push(resolution); return Promise.resolve({ outcome: 'fake-outcome', marker: resolution }); } };
        const resolution = { outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: 'x', candidates: [] };
        const result = await executeMaterializeSelectedSnapshotCommand({ resolution, materializer: fakeMaterializer });
        assert(calls.length === 1 && calls[0] === resolution, '3. materializer.execute() is called exactly once, with the resolution forwarded verbatim, unreconstructed');
        assert(result.marker === resolution && result.outcome === 'fake-outcome', '4. the returned result is the materializer\'s own, passed through unchanged, never re-described');
    }
    console.log('✓ Section B: MaterializeSelectedSnapshotCommand is a pure assembly boundary — synchronous validation, verbatim forwarding, unchanged propagation');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP: real composed runtime, discover -> select ->
    // resolve -> materialize -> genuinely locally possessed.
    // ---------------------------------------------------------------
    {
        const host = makeHost('materialization-flagship');
        const bytes = JSON.stringify({ world: { buildings: [{ id: 'materialization-flagship-building', bricks: 5 }] } });
        const reference = await placeAndAnnounce(host, bytes);

        const ctx = panelCtx({
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand
        });

        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(ctx.snapshotCandidateDiscoveryResult.length === 1, '1. the real candidate was genuinely discovered');
        const candidate = ctx.snapshotCandidateDiscoveryResult[0];

        assert((await host.localContentStore.has(new ContentReference({ hash: reference.hash }))) === false,
            '2. before materialization, this replica\'s OWN local store does not yet hold the bytes');

        ctx.selectSnapshotCandidate(candidate);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotResolutionResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, '3. sanity: the selected candidate resolves');

        ctx.materializeSelectedSnapshot();
        assert(ctx.selectedSnapshotMaterializationExecuting === true, '4. materialization is genuinely in flight immediately after the click');
        await flushMicrotasks();

        assert(ctx.selectedSnapshotMaterializationExecuting === false, '5. materialization completes');
        assert(ctx.selectedSnapshotMaterializationError === null, '6. no error');
        assert(ctx.selectedSnapshotMaterializationResult.outcome === SnapshotCandidateMaterializationOutcome.STORED, '7. FLAGSHIP — a real, discovered, selected, resolved candidate materializes as STORED');

        const locallyHeld = await host.localContentStore.get(new ContentReference({ hash: reference.hash }));
        assert(locallyHeld === bytes, '8. FLAGSHIP — the exact retrieved bytes are now genuinely retrievable from this replica\'s OWN local content store, independent of the remote Arweave store the resolver used');

        // Materializing again reports ALREADY_AVAILABLE, never re-throws
        // or re-errors.
        ctx.materializeSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotMaterializationResult.outcome === SnapshotCandidateMaterializationOutcome.ALREADY_AVAILABLE, '9. clicking materialize again on the same resolution reports ALREADY_AVAILABLE');

        console.log('✓ Section C: FLAGSHIP — a real Nostr-discovered, explicitly selected, real-Arweave-resolved candidate is materialized into this replica\'s own independent local content store, and re-materializing is idempotent');
    }

    // ---------------------------------------------------------------
    // Section D — OwnPublicationPanel UI state machine
    // ---------------------------------------------------------------
    {
        const host = makeHost('materialization-ui-state');
        const bytesOne = 'Section D: first candidate';
        const bytesTwo = 'Section D: second candidate, genuinely different content';
        const referenceOne = await placeAndAnnounce(host, bytesOne);
        const referenceTwo = await placeAndAnnounce(host, bytesTwo);

        const ctx = panelCtx({
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand
        });

        // D1. a no-op with no resolution result yet.
        ctx.materializeSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotMaterializationResult === null, '1. materializing before any resolution exists is a safe no-op');

        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        const [candidateOne, candidateTwo] = ctx.snapshotCandidateDiscoveryResult;

        ctx.selectSnapshotCandidate(candidateOne);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        ctx.materializeSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotMaterializationResult.outcome === SnapshotCandidateMaterializationOutcome.STORED, '2. sanity: the first selection materializes');

        // D2. selecting a DIFFERENT candidate clears the stale
        // materialization result immediately — resolution and attribution
        // both already do this; materialization now does too.
        ctx.selectSnapshotCandidate(candidateTwo);
        assert(ctx.selectedSnapshotMaterializationResult === null, '3. selecting a different candidate clears the prior materialization result');
        assert(ctx.selectedSnapshotResolutionResult === null, '4. sanity: it also clears the prior resolution result (unchanged, 0.9.152)');

        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        ctx.materializeSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotMaterializationResult.outcome === SnapshotCandidateMaterializationOutcome.STORED, '5. materializing the NEW selection succeeds independently');

        // D3. re-resolving the CURRENT selection clears a stale
        // materialization result computed from the earlier resolution.
        ctx.resolveSelectedSnapshot();
        assert(ctx.selectedSnapshotMaterializationResult === null, '6. re-resolving the current selection immediately clears the stale materialization result');
        await flushMicrotasks();

        // D4. a Publication change resets the entire materialization
        // family, alongside every other family it already resets.
        ctx.materializeSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotMaterializationResult !== null, '7. sanity: a materialization result exists before the Publication changes');
        const publication = { id: 'pub-section-d', contentReference: null };
        OwnPublicationPanel.watch.publication.call(ctx, publication, null);
        ctx.publication = publication;
        assert(ctx.selectedSnapshotMaterializationResult === null, '8. a Publication change clears the materialization result');
        assert(ctx.selectedSnapshotMaterializationExecuting === false, '9. ...and its executing flag');
        assert(ctx.selectedSnapshotMaterializationError === null, '10. ...and its error');

        // D5. independence from attribution: materializing never writes
        // selectedSnapshotAttributionResult, and vice versa is already
        // proven by 0.9.154's own suite.
        ctx.selectSnapshotCandidate(candidateOne);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        ctx.materializeSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotMaterializationResult !== null, '11. sanity: materialization succeeded');
        assert(ctx.selectedSnapshotAttributionResult === null, '12. materializing never populates selectedSnapshotAttributionResult — the two are independent siblings, never a sequence');

        // D6. a stale in-flight materialization can never overwrite the
        // CURRENT selection's state — mirrors 0.9.153's own Section H-iii
        // for resolution, one sibling over.
        let resolveStale;
        const stallingCommand = () => new Promise((resolve) => { resolveStale = resolve; });
        const staleCtx = panelCtx({ selectedSnapshotResolutionResult: resolvedResult({ bytes: bytesOne, candidate: candidateOne }), materializeSelectedSnapshotCommand: stallingCommand });
        staleCtx.materializeSelectedSnapshot();
        assert(staleCtx.selectedSnapshotMaterializationExecuting === true, '13. sanity: the call is genuinely in flight');
        await Promise.resolve();
        await Promise.resolve();
        staleCtx.selectSnapshotCandidate(candidateTwo);
        assert(staleCtx.selectedSnapshotMaterializationExecuting === false, '14. selecting a different candidate resets executing state immediately, without waiting for the stale call');
        resolveStale({ outcome: SnapshotCandidateMaterializationOutcome.STORED, contentHash: candidateOne.contentHash, contentReference: null, reason: null, source: { kind: SnapshotMaterializationSourceKind.CANDIDATE } });
        await flushMicrotasks();
        assert(staleCtx.selectedSnapshotMaterializationResult === null, '15. FLAGSHIP — the stale materialization response never overwrites the current selection\'s state, even though it genuinely succeeded');

        console.log('✓ Section D: materializeSelectedSnapshot() follows the identical guard/requestId/staleness pattern every sibling action in this panel already holds, and stays fully independent of selectedSnapshotAttributionResult');
    }

    // ---------------------------------------------------------------
    // Section E — materialization never touches attribution or a
    // publication/publicationId of any kind.
    // ---------------------------------------------------------------
    {
        const host = makeHost('materialization-no-attribution');
        const bytes = 'Section E: materialization needs no Publication at all';
        const reference = await placeAndAnnounce(host, bytes);
        const candidate = { contentHash: reference.hash, locator: reference.uri, storage: reference.storage };

        // No `publication` prop at all — materialization still works.
        const ctx = panelCtx({
            publication: null,
            selectedSnapshotCandidate: candidate,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand
        });
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        ctx.materializeSelectedSnapshot();
        await flushMicrotasks();

        assert(ctx.selectedSnapshotMaterializationResult.outcome === SnapshotCandidateMaterializationOutcome.STORED,
            '1. materialization succeeds with no Publication supplied at all — unlike attributeSelectedSnapshot(), it needs no publication or contentReference');

        console.log('✓ Section E: materialization needs no Publication, no publicationId, and never touches attribution');
    }

    // ---------------------------------------------------------------
    // Section F — structural sweep
    // ---------------------------------------------------------------
    {
        const keys = Object.keys(SnapshotMaterializationSourceKind);
        assert(keys.length === 4 && keys.includes('CANDIDATE'), '1. SnapshotMaterializationSourceKind carries exactly PACKAGE/PLACEMENT/PEER/CANDIDATE');

        const outcomeKeys = Object.keys(SnapshotCandidateMaterializationOutcome);
        assert(outcomeKeys.length === 3
            && outcomeKeys.includes('STORED') && outcomeKeys.includes('ALREADY_AVAILABLE') && outcomeKeys.includes('HASH_MISMATCH'),
            '2. SnapshotCandidateMaterializationOutcome carries exactly its three own values');

        // materializeSelectedSnapshot()'s own method body never calls
        // resolveSnapshotPublicationAttribution() or touches a publication
        // catalog — proven by source inspection.
        const { readFile } = await import('node:fs/promises');
        const panelSource = await readFile(new URL('../ui/components/OwnPublicationPanel.js', import.meta.url), 'utf8');
        const bodyStart = panelSource.indexOf('materializeSelectedSnapshot()');
        const bodyEnd = panelSource.indexOf('\n    },', bodyStart);
        const body = panelSource.slice(bodyStart, bodyEnd);
        assert(!body.includes('resolveSnapshotPublicationAttribution'), '3. materializeSelectedSnapshot() never calls resolveSnapshotPublicationAttribution()');
        assert(!body.includes('publicationCatalog'), '4. materializeSelectedSnapshot() never touches a publication catalog');
        assert(body.includes('this.selectedSnapshotResolutionResult') && !body.includes('this.selectedSnapshotCandidate.contentHash'),
            '5. materializeSelectedSnapshot() reads the resolver\'s own resolution result, never the candidate\'s own declared contentHash');

        // MaterializeSnapshotFromSelectedCandidateUseCase never imports a
        // resolver, a query service, or a content store of its own — it
        // only ever consumes an already-computed resolution result.
        const useCaseSource = await readFile(new URL('../application/MaterializeSnapshotFromSelectedCandidateUseCase.js', import.meta.url), 'utf8');
        const useCaseImportLines = useCaseSource.split('\n').filter((line) => line.trim().startsWith('import '));
        assert(!useCaseImportLines.some((line) => /DecentralizedSnapshotResolver|NostrSnapshotDiscoveryQueryService|ArweaveContentStore|SnapshotPublicationAttribution/.test(line)),
            '6. MaterializeSnapshotFromSelectedCandidateUseCase imports no resolver, query service, remote content store, or attribution function of its own');

        console.log('✓ Section F: structural sweep — SnapshotMaterializationSourceKind.CANDIDATE and SnapshotCandidateMaterializationOutcome exist with exactly their own values, and materialization touches no attribution, publication catalog, or discovery/retrieval machinery of its own');
    }

    console.log('\n✅ All Selected Snapshot Materialization tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
