import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import { resolveSnapshotWorldPlacement } from '../application/SnapshotWorldPlacement.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/DiscoverSnapshotCandidatesCommand.js';
import { executeResolveSelectedSnapshotCommand } from '../application/ResolveSelectedSnapshotCommand.js';
import { executeMaterializeSelectedSnapshotCommand } from '../application/MaterializeSelectedSnapshotCommand.js';
import { MaterializeSnapshotFromSelectedCandidateUseCase } from '../application/MaterializeSnapshotFromSelectedCandidateUseCase.js';
import { StoreSnapshotContentUseCase } from '../application/StoreSnapshotContentUseCase.js';
import { StoreSnapshotContentOutcome } from '../application/StoreSnapshotContentOutcome.js';
import { SnapshotCandidateMaterializationOutcome } from '../application/SnapshotCandidateMaterializationOutcome.js';
import { SnapshotMaterializationSourceKind } from '../application/SnapshotMaterializationSourceKind.js';
import { SnapshotPlacementMaterializationOutcome } from '../application/SnapshotPlacementMaterializationOutcome.js';
import { PeerSnapshotMaterializationOutcome } from '../application/PeerSnapshotMaterializationOutcome.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { Position } from '../core/Position.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { ContentReference } from '../core/ContentReference.js';

// 0.9.159 — Selected Snapshot World Placement.
//
// 0.9.150 through 0.9.158 built and proved DISCOVER -> SELECT -> RESOLVE ->
// VERIFY -> ATTRIBUTE -> MATERIALIZE. Every one of those seams answers a
// question about BYTES; none of them ever answers a question about SPACE.
// This milestone adds exactly one small seam over materialization's own
// output — application/SnapshotWorldPlacement.js#resolveSnapshotWorldPlacement()
// — which composes an already-materialized Snapshot with this replica's
// PRE-EXISTING spatial authority for the relevant Publication (core/
// WorldPlacement.js, reached through WorldNavigationSession#getPlacementInfo()'s
// own already-computed shape) into a placement fact, without ever looking
// up a PlacementRegistry itself, without ever inventing a new spatial
// algorithm, and without ever rendering anything.
//
//   Section A: resolveSnapshotWorldPlacement() — constructor/contract
//              validation, PLACED, UNPLACED, and every non-terminal
//              materialization outcome (drawn from all three per-source
//              vocabularies: CANDIDATE/PLACEMENT/PEER) passed through
//              verbatim, never remapped to UNPLACED.
//   Section B: identity preservation — contentHash is retained unchanged;
//              position/placementId/publicationId appear ONLY on PLACED;
//              a locator/contentReference/eventId is never substituted for
//              contentHash.
//   Section C: OwnPublicationPanel's own UI state machine — guard/no-op,
//              staleness resets on a new selection, a fresh resolution, a
//              fresh materialization, and a Publication change;
//              independence from attribution and materialization; never
//              automatic.
//   Section D — FLAGSHIP: a real composed runtime (real Nostr discovery,
//              real Arweave resolution, real local materialization) PLUS a
//              real, independently-created WorldPlacement (via a real
//              LocalPlacementRegistry — the SAME registry
//              WorldNavigationSession#getPlacementInfo() itself reads)
//              composed together for the first time.
//   Section E: multiple materialized Snapshots, for different
//              Publications, coexist at their own independently
//              authoritative positions — no cross-contamination.
//   Section F: structural sweep — deliberate exclusions. No I/O (no
//              PlacementRegistry/spatial-index/network import), no
//              rendering vocabulary, no fabricated position from a
//              locator/discovery order/candidate, and
//              SnapshotWorldPlacementOutcome carries exactly its two
//              values.

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
        return { id: `fake-placement-tx-${counter}`, transaction: { id: `fake-placement-tx-${counter}`, data: material } };
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

// One shared "host" — mirrors tests/SelectedSnapshotMaterialization.test.js's
// own makeHost() exactly, for the identical reason: a real Arweave signer/
// gateway and a real Nostr network, composed the way ui/main.js composes
// composeDiscoverSnapshotRuntime(), plus a genuinely separate local content
// store this replica materializes INTO.
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

// Builds a `placementInfo`-shaped object from a REAL LocalPlacementRegistry —
// field for field the same projection WorldNavigationSession#getPlacementInfo()
// itself performs (application/WorldNavigationSession.js, `_resolvePlacementRecord()`
// + `getPlacementInfo()`): find every PlacementRecord for `publicationId`,
// pick the most-recently-updated one, and flatten its own `position` to a
// plain `{x,y,z}`. Never a new projection of this test's own invention —
// this mirrors that exact, already-existing, already-shipped logic, using
// the SAME `LocalPlacementRegistry` class that session reads.
function placementInfoFor(placementRegistry, publicationId) {
    const records = placementRegistry.findByPublicationId(publicationId);
    if (records.length === 0) return null;
    const record = records.reduce((latest, r) => (!latest || r.updatedAt > latest.updatedAt) ? r : latest, null);
    return {
        placementId: record.placementId,
        publicationId: record.publicationId,
        position: { x: record.position.x, y: record.position.y, z: record.position.z },
        rotation: record.rotation,
        revision: record.revision,
        owner: record.owner,
        movable: true,
        overlapCount: 0
    };
}

function placeReal(placementRegistry, publicationId, position, owner = 'alice') {
    const record = new PlacementRecord({ publicationId, position, owner });
    placementRegistry.add(record);
    return record;
}

function panelCtx(overrides = {}) {
    return {
        publication: null,
        placementInfo: null,
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
        selectedSnapshotWorldPlacementResult: null,
        discoverSnapshotCandidates: OwnPublicationPanel.methods.discoverSnapshotCandidates,
        selectSnapshotCandidate: OwnPublicationPanel.methods.selectSnapshotCandidate,
        resolveSelectedSnapshot: OwnPublicationPanel.methods.resolveSelectedSnapshot,
        attributeSelectedSnapshot: OwnPublicationPanel.methods.attributeSelectedSnapshot,
        materializeSelectedSnapshot: OwnPublicationPanel.methods.materializeSelectedSnapshot,
        placeMaterializedSnapshot: OwnPublicationPanel.methods.placeMaterializedSnapshot,
        ...overrides
    };
}

function storedMaterialization(contentHash) {
    return { outcome: SnapshotCandidateMaterializationOutcome.STORED, contentHash, contentReference: new ContentReference({ hash: contentHash }), reason: null, source: { kind: SnapshotMaterializationSourceKind.CANDIDATE } };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — resolveSnapshotWorldPlacement()
    // ---------------------------------------------------------------
    {
        let threw = false;
        try { resolveSnapshotWorldPlacement(null); } catch (e) { threw = true; }
        assert(threw, '1. a missing materialization result throws — a caller contract violation');
        threw = false;
        try { resolveSnapshotWorldPlacement({}); } catch (e) { threw = true; }
        assert(threw, '2. a materialization result with no outcome field also throws');

        const contentHash = computeContentHash('Section A content');
        const materialization = storedMaterialization(contentHash);

        threw = false;
        try { resolveSnapshotWorldPlacement(materialization, { placementId: 'p1' }); } catch (e) { threw = true; }
        assert(threw, '3. a malformed placementInfo (missing position/publicationId) throws');
        threw = false;
        try { resolveSnapshotWorldPlacement(materialization, { placementId: 'p1', publicationId: 'pub-1', position: { x: 1, y: NaN, z: 3 } }); } catch (e) { threw = true; }
        assert(threw, '4. a placementInfo with a non-finite coordinate throws');

        // UNPLACED — materialization succeeded, no placementInfo at all.
        const unplaced = resolveSnapshotWorldPlacement(materialization, null);
        assert(unplaced.outcome === SnapshotWorldPlacementOutcome.UNPLACED, '5. no placementInfo -> UNPLACED');
        assert(unplaced.contentHash === contentHash, '6. contentHash is retained even when UNPLACED');
        assert(unplaced.position === null && unplaced.placementId === null && unplaced.publicationId === null, '7. UNPLACED fabricates nothing');

        // Same result when placementInfo is simply omitted (default null).
        const unplacedDefaulted = resolveSnapshotWorldPlacement(materialization);
        assert(unplacedDefaulted.outcome === SnapshotWorldPlacementOutcome.UNPLACED, '8. omitting placementInfo defaults to UNPLACED, identical to passing null');

        // PLACED — materialization succeeded, a real placementInfo exists.
        const placementInfo = { placementId: 'placement-1', publicationId: 'pub-1', position: { x: 10, y: 0, z: -20 } };
        const placed = resolveSnapshotWorldPlacement(materialization, placementInfo);
        assert(placed.outcome === SnapshotWorldPlacementOutcome.PLACED, '9. an existing placementInfo -> PLACED');
        assert(placed.position.x === 10 && placed.position.y === 0 && placed.position.z === -20, '10. position is placementInfo\'s own, borrowed verbatim');
        assert(placed.placementId === 'placement-1' && placed.publicationId === 'pub-1', '11. placementId/publicationId are placementInfo\'s own');

        // Every non-terminal outcome, drawn from all THREE per-source
        // materialization vocabularies, is reported VERBATIM, never
        // remapped to UNPLACED — this function is agnostic to WHICH
        // source produced the materialization result.
        const nonTerminalCases = [
            { outcome: DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED, contentHash: null, reason: 'not discovered' },
            { outcome: DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH, contentHash, reason: 'hash mismatch upstream' },
            { outcome: SnapshotCandidateMaterializationOutcome.HASH_MISMATCH, contentHash, reason: 'candidate hash mismatch' },
            { outcome: SnapshotPlacementMaterializationOutcome.INVALID_PLACEMENT, contentHash, reason: 'invalid placement envelope' },
            { outcome: SnapshotPlacementMaterializationOutcome.UNAVAILABLE, contentHash, reason: 'store unavailable' },
            { outcome: PeerSnapshotMaterializationOutcome.UNAVAILABLE, contentHash, reason: 'peer did not respond' }
        ];
        for (const failure of nonTerminalCases) {
            const result = resolveSnapshotWorldPlacement(failure, placementInfo);
            assert(result.outcome === failure.outcome, `12. ${failure.outcome} is reported verbatim, never remapped to UNPLACED, even with a placementInfo available`);
            assert(result.reason === failure.reason, `13. ${failure.outcome}'s own reason is preserved unchanged`);
            assert(result.position === null && result.placementId === null && result.publicationId === null, `14. ${failure.outcome} never carries a position — placement was never attempted`);
        }

        // ALREADY_AVAILABLE (the shared StoreSnapshotContentOutcome value
        // every materialization source's own success value equals) also
        // reaches PLACED/UNPLACED, not just STORED.
        const alreadyAvailable = { outcome: StoreSnapshotContentOutcome.ALREADY_AVAILABLE, contentHash, reason: null };
        assert(resolveSnapshotWorldPlacement(alreadyAvailable, placementInfo).outcome === SnapshotWorldPlacementOutcome.PLACED, '15. ALREADY_AVAILABLE also reaches PLACED, identically to STORED');
        assert(resolveSnapshotWorldPlacement(alreadyAvailable, null).outcome === SnapshotWorldPlacementOutcome.UNPLACED, '16. ALREADY_AVAILABLE with no placementInfo -> UNPLACED');
    }
    console.log('✓ Section A: resolveSnapshotWorldPlacement() — contract validation, PLACED, UNPLACED, and every non-terminal outcome (across all three materialization vocabularies) passed through verbatim');

    // ---------------------------------------------------------------
    // Section B — identity preservation
    // ---------------------------------------------------------------
    {
        const contentHash = computeContentHash('Section B content');
        const materialization = {
            outcome: SnapshotCandidateMaterializationOutcome.STORED,
            contentHash,
            contentReference: new ContentReference({ hash: contentHash }),
            reason: null,
            source: { kind: SnapshotMaterializationSourceKind.CANDIDATE }
        };
        const placementInfo = { placementId: 'placement-b', publicationId: 'pub-b', position: { x: 1, y: 2, z: 3 } };
        const result = resolveSnapshotWorldPlacement(materialization, placementInfo);

        assert(result.contentHash === contentHash, '1. contentHash is the materialized Snapshot\'s own, unchanged');
        assert(result.contentHash !== placementInfo.placementId, '2. contentHash is never the placementId');
        assert(result.contentHash !== placementInfo.publicationId, '3. contentHash is never the publicationId');
        assert(!('locator' in result) && !('storage' in result) && !('contentReference' in result),
            '4. no locator/storage/contentReference field of any kind on the result — a World position is not a retrieval location');

        // A pass-through failure never substitutes the reason for a
        // fabricated position, and never invents a contentHash out of
        // thin air.
        const notDiscovered = resolveSnapshotWorldPlacement(
            { outcome: DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED, contentHash: null, reason: 'no candidates' },
            placementInfo
        );
        assert(notDiscovered.contentHash === null, '5. with no candidate at all, contentHash stays null rather than fabricated');
    }
    console.log('✓ Section B: identity preservation — contentHash is retained unchanged; position/placementId/publicationId appear only on PLACED; no retrieval-location field of any kind');

    // ---------------------------------------------------------------
    // Section C — OwnPublicationPanel UI state machine
    // ---------------------------------------------------------------
    {
        const host = makeHost('placement-ui-state');
        const bytesOne = 'Section C: first candidate';
        const bytesTwo = 'Section C: second candidate, genuinely different content';
        await placeAndAnnounce(host, bytesOne);
        await placeAndAnnounce(host, bytesTwo);

        const placementInfo = { placementId: 'placement-c', publicationId: 'pub-c', position: { x: 5, y: 5, z: 5 } };
        const ctx = panelCtx({
            placementInfo,
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand
        });

        // C1. a no-op with no materialization result yet.
        ctx.placeMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldPlacementResult === null, '1. placing before any materialization exists is a safe no-op');

        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        const [candidateOne, candidateTwo] = ctx.snapshotCandidateDiscoveryResult;

        ctx.selectSnapshotCandidate(candidateOne);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        ctx.materializeSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotMaterializationResult.outcome === SnapshotCandidateMaterializationOutcome.STORED, '2. sanity: the first selection materializes');

        // C2. placing is synchronous — the result exists immediately, no
        // await needed.
        ctx.placeMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldPlacementResult !== null, '3. placeMaterializedSnapshot() is synchronous — the result exists immediately after the call');
        assert(ctx.selectedSnapshotWorldPlacementResult.outcome === SnapshotWorldPlacementOutcome.PLACED, '4. PLACED, using the supplied placementInfo');
        assert(ctx.selectedSnapshotWorldPlacementResult.position.x === 5, '5. the position is placementInfo\'s own');

        // C3. selecting a DIFFERENT candidate clears the stale placement
        // result immediately — resolution/attribution/materialization all
        // already do this; placement now does too.
        ctx.selectSnapshotCandidate(candidateTwo);
        assert(ctx.selectedSnapshotWorldPlacementResult === null, '6. selecting a different candidate clears the prior placement result');
        assert(ctx.selectedSnapshotMaterializationResult === null, '7. sanity: it also clears the prior materialization result (unchanged, 0.9.158)');

        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        ctx.materializeSelectedSnapshot();
        await flushMicrotasks();
        ctx.placeMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldPlacementResult.outcome === SnapshotWorldPlacementOutcome.PLACED, '8. placing the NEW selection succeeds independently');

        // C4. re-resolving the CURRENT selection clears a stale placement
        // result computed from the earlier materialization.
        ctx.resolveSelectedSnapshot();
        assert(ctx.selectedSnapshotWorldPlacementResult === null, '9. re-resolving the current selection immediately clears the stale placement result');
        await flushMicrotasks();

        // C5. re-materializing the CURRENT resolution clears a stale
        // placement result computed from the earlier materialization —
        // NEW at this milestone, one layer under 0.9.158's own resolution
        // staleness rule.
        ctx.materializeSelectedSnapshot();
        await flushMicrotasks();
        ctx.placeMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldPlacementResult !== null, '10. sanity: a placement result exists before re-materializing');
        ctx.materializeSelectedSnapshot();
        assert(ctx.selectedSnapshotWorldPlacementResult === null, '11. re-materializing the current resolution immediately clears the stale placement result');
        await flushMicrotasks();

        // C6. a Publication change resets the entire placement family too.
        ctx.placeMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldPlacementResult !== null, '12. sanity: a placement result exists before the Publication changes');
        const publication = { id: 'pub-section-c', contentReference: null };
        OwnPublicationPanel.watch.publication.call(ctx, publication, null);
        ctx.publication = publication;
        assert(ctx.selectedSnapshotWorldPlacementResult === null, '13. a Publication change clears the placement result');

        // C7. independence: placing never touches materialization,
        // resolution, or attribution results, and clicking materialize
        // never places anything on its own.
        ctx.selectSnapshotCandidate(candidateOne);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        ctx.materializeSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotWorldPlacementResult === null, '14. materializing never automatically places anything — only a separate click does');
        assert(ctx.selectedSnapshotAttributionResult === null, '15. sanity: materializing never populates attribution either (0.9.158, unchanged)');
        const materializationBeforePlacing = ctx.selectedSnapshotMaterializationResult;
        ctx.placeMaterializedSnapshot();
        assert(ctx.selectedSnapshotMaterializationResult === materializationBeforePlacing, '16. placing never mutates or replaces the materialization result it read');

        // C8. UNPLACED when no placementInfo is supplied at all.
        const unplacedCtx = panelCtx({
            placementInfo: null,
            selectedSnapshotMaterializationResult: ctx.selectedSnapshotMaterializationResult
        });
        unplacedCtx.placeMaterializedSnapshot();
        assert(unplacedCtx.selectedSnapshotWorldPlacementResult.outcome === SnapshotWorldPlacementOutcome.UNPLACED, '17. with no placementInfo, placing reports UNPLACED rather than a fabricated position');

        console.log('✓ Section C: placeMaterializedSnapshot() follows the identical guard/staleness pattern every sibling action in this panel already holds, is synchronous, and stays fully independent of attribution/materialization');
    }

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP: a real composed runtime (real Nostr discovery,
    // real Arweave resolution, real local materialization) PLUS a real,
    // independently-created WorldPlacement.
    // ---------------------------------------------------------------
    {
        const host = makeHost('placement-flagship');
        const bytes = JSON.stringify({ world: { buildings: [{ id: 'placement-flagship-building', bricks: 7 }] } });
        await placeAndAnnounce(host, bytes);

        // A REAL, independently-created spatial authority — the SAME
        // LocalPlacementRegistry class WorldNavigationSession#getPlacementInfo()
        // itself reads, entirely unmodified. Created with no knowledge of
        // Nostr, Arweave, or any candidate — proving this milestone
        // composes two pre-existing, independent subsystems for the first
        // time, rather than building a new one.
        const placementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
        const publicationId = 'flagship-publication';
        const realPosition = new Position(42, 3, -17);
        placeReal(placementRegistry, publicationId, realPosition);

        const ctx = panelCtx({
            placementInfo: placementInfoFor(placementRegistry, publicationId),
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand
        });

        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(ctx.snapshotCandidateDiscoveryResult.length === 1, '1. the real candidate was genuinely discovered');
        const candidate = ctx.snapshotCandidateDiscoveryResult[0];

        ctx.selectSnapshotCandidate(candidate);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotResolutionResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, '2. sanity: the selected candidate resolves');

        ctx.materializeSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotMaterializationResult.outcome === SnapshotCandidateMaterializationOutcome.STORED, '3. sanity: the resolved candidate materializes');

        ctx.placeMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldPlacementResult.outcome === SnapshotWorldPlacementOutcome.PLACED,
            '4. FLAGSHIP — a real Nostr-discovered, resolved, materialized Snapshot is placed using a real, independently-created WorldPlacement');
        assert(ctx.selectedSnapshotWorldPlacementResult.position.x === 42
            && ctx.selectedSnapshotWorldPlacementResult.position.y === 3
            && ctx.selectedSnapshotWorldPlacementResult.position.z === -17,
            '5. FLAGSHIP — the reported position is EXACTLY the real PlacementRecord\'s own position, borrowed verbatim, never recomputed');
        assert(ctx.selectedSnapshotWorldPlacementResult.contentHash === candidate.contentHash, '6. the placement\'s own contentHash is the materialized Snapshot\'s own');
        assert(ctx.selectedSnapshotWorldPlacementResult.publicationId === publicationId, '7. the placement names WHICH Publication\'s own placement supplied the position');

        console.log('✓ Section D: FLAGSHIP — a real Nostr-discovered, resolved, and materialized Snapshot is placed using a real, independently-created WorldPlacement, composed for the first time');
    }

    // ---------------------------------------------------------------
    // Section E — multiple materialized Snapshots coexist at their own
    // independently authoritative positions.
    // ---------------------------------------------------------------
    {
        const host = makeHost('placement-multiple');
        const bytesAlpha = 'Section E: Publication Alpha\'s own Snapshot content';
        const bytesBeta = 'Section E: Publication Beta\'s own Snapshot content, genuinely different';
        await placeAndAnnounce(host, bytesAlpha);
        await placeAndAnnounce(host, bytesBeta);

        const placementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
        placeReal(placementRegistry, 'publication-alpha', new Position(100, 0, 0));
        placeReal(placementRegistry, 'publication-beta', new Position(-100, 0, 0));

        const ctx = panelCtx({
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand
        });
        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        const [candidateAlpha, candidateBeta] = ctx.snapshotCandidateDiscoveryResult;

        // Materialize and place candidateAlpha against publication-alpha.
        ctx.placementInfo = placementInfoFor(placementRegistry, 'publication-alpha');
        ctx.selectSnapshotCandidate(candidateAlpha);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        ctx.materializeSelectedSnapshot();
        await flushMicrotasks();
        ctx.placeMaterializedSnapshot();
        const placementAlpha = ctx.selectedSnapshotWorldPlacementResult;

        // Materialize and place candidateBeta against publication-beta —
        // an entirely separate selection/resolution/materialization/
        // placement cycle.
        ctx.placementInfo = placementInfoFor(placementRegistry, 'publication-beta');
        ctx.selectSnapshotCandidate(candidateBeta);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        ctx.materializeSelectedSnapshot();
        await flushMicrotasks();
        ctx.placeMaterializedSnapshot();
        const placementBeta = ctx.selectedSnapshotWorldPlacementResult;

        assert(placementAlpha.outcome === SnapshotWorldPlacementOutcome.PLACED && placementBeta.outcome === SnapshotWorldPlacementOutcome.PLACED,
            '1. both Snapshots are independently PLACED');
        assert(placementAlpha.position.x === 100 && placementBeta.position.x === -100,
            '2. each Snapshot carries its OWN Publication\'s own position — never averaged, never one overwriting the other');
        assert(placementAlpha.contentHash !== placementBeta.contentHash, '3. sanity: the two Snapshots are genuinely different content');
        assert(placementAlpha.publicationId === 'publication-alpha' && placementBeta.publicationId === 'publication-beta',
            '4. neither placement borrows the other\'s publicationId');

        console.log('✓ Section E: multiple materialized Snapshots, for different Publications, coexist at their own independently authoritative positions with no cross-contamination');
    }

    // ---------------------------------------------------------------
    // Section F — structural sweep
    // ---------------------------------------------------------------
    {
        const outcomeKeys = Object.keys(SnapshotWorldPlacementOutcome);
        assert(outcomeKeys.length === 2 && outcomeKeys.includes('PLACED') && outcomeKeys.includes('UNPLACED'),
            '1. SnapshotWorldPlacementOutcome carries exactly its two own values');

        // resolveSnapshotWorldPlacement() performs no I/O of any kind — no
        // PlacementRegistry, spatial index, content store, network, or
        // rendering import.
        const { readFile } = await import('node:fs/promises');
        const domainSource = await readFile(new URL('../application/SnapshotWorldPlacement.js', import.meta.url), 'utf8');
        const domainImportLines = domainSource.split('\n').filter((line) => line.trim().startsWith('import '));
        assert(!domainImportLines.some((line) => /PlacementRegistry|SpatialIndex|ContentStore|WorldNavigationSession|NostrSnapshotDiscovery|Arweave|Renderer|WorldRenderer/.test(line)),
            '2. resolveSnapshotWorldPlacement() imports no PlacementRegistry, spatial index, content store, discovery, or rendering machinery of its own');
        assert(!domainSource.includes('fetch(') && !domainSource.includes('await '),
            '3. resolveSnapshotWorldPlacement() performs no network/async I/O — it is a plain synchronous function');

        // placeMaterializedSnapshot() never calls resolveSnapshotPublicationAttribution()
        // or the materialization command — it only reads results already
        // computed by other, separate clicks.
        const panelSource = await readFile(new URL('../ui/components/OwnPublicationPanel.js', import.meta.url), 'utf8');
        const bodyStart = panelSource.indexOf('placeMaterializedSnapshot() {');
        const bodyEnd = panelSource.indexOf('\n    }', bodyStart);
        const body = panelSource.slice(bodyStart, bodyEnd);
        assert(!body.includes('resolveSnapshotPublicationAttribution'), '4. placeMaterializedSnapshot() never calls resolveSnapshotPublicationAttribution()');
        assert(!body.includes('materializeSelectedSnapshotCommand') && !body.includes('resolveSelectedSnapshotCommand'),
            '5. placeMaterializedSnapshot() never calls the materialization or resolution command itself — it only reads their already-computed results');
        assert(body.includes('this.selectedSnapshotMaterializationResult') && body.includes('this.placementInfo'),
            '6. placeMaterializedSnapshot() reads the materialization result and placementInfo, exactly as documented');

        // No viewport/visibility/camera/rendering vocabulary anywhere in
        // the new domain file — placement is deliberately silent on
        // whether a placed Snapshot is currently on screen.
        assert(!/viewport|visible|camera|render|mesh|scene/i.test(domainSource.replace(/\/\/.*$/gm, '').replace(/^\s*\*.*$/gm, '')),
            '7. no viewport/visibility/camera/rendering vocabulary appears in resolveSnapshotWorldPlacement()\'s own executable code');

        console.log('✓ Section F: structural sweep — SnapshotWorldPlacementOutcome carries exactly its own two values, resolveSnapshotWorldPlacement() performs no I/O and touches no rendering/visibility concern, and placeMaterializedSnapshot() only reads already-computed results');
    }

    console.log('\n✅ All Selected Snapshot World Placement tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
