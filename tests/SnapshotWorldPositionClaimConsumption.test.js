import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import { resolveSnapshotWorldPositionClaim } from '../application/SnapshotWorldPositionClaim.js';
import { SnapshotWorldPositionClaimOutcome } from '../application/SnapshotWorldPositionClaimOutcome.js';
import { resolveSnapshotWorldPlacement } from '../application/SnapshotWorldPlacement.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/DiscoverSnapshotCandidatesCommand.js';
import { executeResolveSelectedSnapshotCommand } from '../application/ResolveSelectedSnapshotCommand.js';
import { executeMaterializeSelectedSnapshotCommand } from '../application/MaterializeSelectedSnapshotCommand.js';
import { MaterializeSnapshotFromSelectedCandidateUseCase } from '../application/MaterializeSnapshotFromSelectedCandidateUseCase.js';
import { StoreSnapshotContentUseCase } from '../application/StoreSnapshotContentUseCase.js';
import { SnapshotCandidateMaterializationOutcome } from '../application/SnapshotCandidateMaterializationOutcome.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { Position } from '../core/Position.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { computeContentHash } from '../serializer/contentHash.js';

// 0.9.172 — Decentralized Snapshot Position Claim Consumption.
//
// 0.9.171 taught a Snapshot discovery candidate to optionally CARRY a
// publisher's own `publicationId`/`claimedPosition` claim; nothing has ever
// CONSUMED one — `application/SnapshotWorldPlacement.js` (0.9.159) remained
// entirely unaware Nostr, or a position claim, exist at all. This suite
// proves the narrow seam that closes that gap: `application/
// SnapshotWorldPositionClaim.js#resolveSnapshotWorldPositionClaim()`, and
// `ui/components/OwnPublicationPanel.js`'s own new, EXPLICIT
// `useClaimedSnapshotPosition()` action.
//
//   Section A: resolveSnapshotWorldPositionClaim() — contract validation,
//              CLAIMED/ABSENT/MISMATCHED.
//   Section B: publication identity mismatch — the claim is never consumed.
//   Section C: FLAGSHIP — identical contentHash, two different
//              Publications, each claims its own position independently.
//   Section D: no claim — the existing local-placement path is preserved,
//              byte-for-byte.
//   Section E: a claim never alters content identity (contentHash/locator/
//              storage).
//   Section F: a claim never alters retrieval (resolution/materialization
//              are identical whether or not a claim is present).
//   Section G: a claim never constitutes verification — no
//              VERIFIED_POSITION state exists anywhere.
//   Section H: purity/immutability.
//   Section I: explicit consumption — discovery and selection alone never
//              place anything; only the explicit click sequence does.
//   Section J: existing local-placement regression (0.9.159's own flagship,
//              unmodified by this milestone).
//   Section K: structural sweep — deliberate exclusions.

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
        return { id: `fake-claim-tx-${counter}`, transaction: { id: `fake-claim-tx-${counter}`, data: material } };
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

// Mirrors tests/SelectedSnapshotWorldPlacement.test.js's own makeHost()
// exactly — a real Arweave signer/gateway and a real Nostr network,
// composed the way ui/main.js composes composeDiscoverSnapshotRuntime(),
// plus a genuinely separate local content store this replica materializes
// INTO.
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

// Publishes a real announcement, optionally carrying a position claim.
async function placeAndAnnounce(host, bytes, { publicationId, claimedPosition } = {}) {
    const reference = await host.contentStore.put(bytes);
    await host.announcer.publish({
        contentHash: reference.hash, locator: reference.uri, storage: reference.storage,
        publicationId, claimedPosition
    });
    return reference;
}

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
        selectedSnapshotWorldRegistrationResult: null,
        selectedSnapshotWorldPositionClaimResult: null,
        discoverSnapshotCandidates: OwnPublicationPanel.methods.discoverSnapshotCandidates,
        selectSnapshotCandidate: OwnPublicationPanel.methods.selectSnapshotCandidate,
        resolveSelectedSnapshot: OwnPublicationPanel.methods.resolveSelectedSnapshot,
        materializeSelectedSnapshot: OwnPublicationPanel.methods.materializeSelectedSnapshot,
        useClaimedSnapshotPosition: OwnPublicationPanel.methods.useClaimedSnapshotPosition,
        placeMaterializedSnapshot: OwnPublicationPanel.methods.placeMaterializedSnapshot,
        ...overrides
    };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — resolveSnapshotWorldPositionClaim() contract
    // ---------------------------------------------------------------
    {
        let threw = false;
        try { resolveSnapshotWorldPositionClaim(null, 'pub-1'); } catch (e) { threw = true; }
        assert(threw, '1. a missing candidate throws — a caller contract violation');

        threw = false;
        try { resolveSnapshotWorldPositionClaim({ contentHash: 'h', locator: 'l', storage: 's' }, ''); } catch (e) { threw = true; }
        assert(threw, '2. a missing/empty publicationId argument throws');

        threw = false;
        try { resolveSnapshotWorldPositionClaim({ contentHash: 'h', locator: 'l', storage: 's' }, null); } catch (e) { threw = true; }
        assert(threw, '3. a null publicationId argument throws');

        // ABSENT — the old, five-field candidate shape.
        const absent = resolveSnapshotWorldPositionClaim({ contentHash: 'h', locator: 'l', storage: 's' }, 'pub-1');
        assert(absent.outcome === SnapshotWorldPositionClaimOutcome.ABSENT, '4. a candidate with no publicationId/claimedPosition -> ABSENT');
        assert(absent.position === null, '5. ABSENT fabricates no position');

        // CLAIMED — candidate's own publicationId matches the target.
        const claimed = resolveSnapshotWorldPositionClaim(
            { contentHash: 'h', locator: 'l', storage: 's', publicationId: 'pub-1', claimedPosition: { x: 1, y: 2, z: 3 } },
            'pub-1'
        );
        assert(claimed.outcome === SnapshotWorldPositionClaimOutcome.CLAIMED, '6. a matching publicationId -> CLAIMED');
        assert(claimed.position.x === 1 && claimed.position.y === 2 && claimed.position.z === 3, '7. position is the candidate\'s own claimedPosition, verbatim');

        // MISMATCHED — candidate's own publicationId names a different Publication.
        const mismatched = resolveSnapshotWorldPositionClaim(
            { contentHash: 'h', locator: 'l', storage: 's', publicationId: 'pub-A', claimedPosition: { x: 9, y: 9, z: 9 } },
            'pub-B'
        );
        assert(mismatched.outcome === SnapshotWorldPositionClaimOutcome.MISMATCHED, '8. a non-matching publicationId -> MISMATCHED');
        assert(mismatched.position === null, '9. MISMATCHED fabricates no position — the claim is never consumed');

        // A malformed claimedPosition (present but not three finite numbers)
        // is a contract violation, never silently degraded to ABSENT — the
        // envelope layer (0.9.171) already guarantees real candidates never
        // reach this shape.
        threw = false;
        try {
            resolveSnapshotWorldPositionClaim(
                { contentHash: 'h', locator: 'l', storage: 's', publicationId: 'pub-1', claimedPosition: { x: 1, y: NaN, z: 3 } },
                'pub-1'
            );
        } catch (e) { threw = true; }
        assert(threw, '10. a claimedPosition with a non-finite coordinate throws rather than degrading to ABSENT');

        console.log('✓ Section A: resolveSnapshotWorldPositionClaim() — contract validation, CLAIMED/ABSENT/MISMATCHED');
    }

    // ---------------------------------------------------------------
    // Section B — publication identity mismatch, end to end
    // ---------------------------------------------------------------
    {
        const host = makeHost('claim-mismatch');
        const bytes = 'Section B: a Snapshot whose claim names a different Publication';
        await placeAndAnnounce(host, bytes, { publicationId: 'publication-A', claimedPosition: { x: 5, y: 5, z: 5 } });

        const targetPublication = { id: 'publication-B', contentReference: null };
        const ctx = panelCtx({
            publication: targetPublication,
            placementInfo: null,
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand
        });

        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        const candidate = ctx.snapshotCandidateDiscoveryResult[0];
        assert(candidate.publicationId === 'publication-A', '1. sanity: the discovered candidate carries the publisher\'s own claim, unchanged');

        ctx.selectSnapshotCandidate(candidate);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        ctx.materializeSelectedSnapshot();
        await flushMicrotasks();

        ctx.useClaimedSnapshotPosition();
        assert(ctx.selectedSnapshotWorldPositionClaimResult.outcome === SnapshotWorldPositionClaimOutcome.MISMATCHED,
            '2. the candidate claims publication-A while the target is publication-B -> MISMATCHED');

        ctx.placeMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldPlacementResult.outcome === SnapshotWorldPlacementOutcome.UNPLACED,
            '3. a mismatched claim is never consumed — placement falls back to placementInfo (null here) -> UNPLACED, never the claimed (5,5,5)');

        console.log('✓ Section B: a candidate\'s claim naming a different Publication is never consumed');
    }

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP: identical contentHash, two different
    // Publications, each independently claims its own position.
    // ---------------------------------------------------------------
    {
        const sharedBytes = 'Section C: two Publications independently publish the identical bytes';
        const contentHash = computeContentHash(sharedBytes);

        const candidateForA = { contentHash, locator: 'ar://claim-tx-A', storage: 'ar', publicationId: 'publication-A', claimedPosition: { x: 10, y: 0, z: 0 } };
        const candidateForB = { contentHash, locator: 'ar://claim-tx-B', storage: 'ar', publicationId: 'publication-B', claimedPosition: { x: -10, y: 0, z: 0 } };

        const claimA = resolveSnapshotWorldPositionClaim(candidateForA, 'publication-A');
        const claimB = resolveSnapshotWorldPositionClaim(candidateForB, 'publication-B');

        assert(claimA.outcome === SnapshotWorldPositionClaimOutcome.CLAIMED && claimB.outcome === SnapshotWorldPositionClaimOutcome.CLAIMED,
            '1. both candidates, sharing one contentHash, are independently CLAIMED against their OWN Publication');
        assert(claimA.position.x === 10 && claimB.position.x === -10,
            '2. FLAGSHIP — identical content, two Publications, two independently authoritative claimed positions; never merged, never averaged');

        // The system must never say "the content hash matches, therefore
        // use this position" — swapping the target Publication for either
        // candidate immediately fails the identity check, regardless of
        // the shared contentHash.
        const crossedA = resolveSnapshotWorldPositionClaim(candidateForA, 'publication-B');
        const crossedB = resolveSnapshotWorldPositionClaim(candidateForB, 'publication-A');
        assert(crossedA.outcome === SnapshotWorldPositionClaimOutcome.MISMATCHED && crossedB.outcome === SnapshotWorldPositionClaimOutcome.MISMATCHED,
            '3. neither candidate\'s claim is consumable by the OTHER Publication, despite the identical contentHash');

        console.log('✓ Section C: FLAGSHIP — identical Snapshot bytes, two Publications, each claims its own independent position');
    }

    // ---------------------------------------------------------------
    // Section D — no claim: the existing local-placement path is preserved
    // ---------------------------------------------------------------
    {
        const host = makeHost('claim-absent');
        const bytes = 'Section D: an old-style announcement with no position claim at all';
        await placeAndAnnounce(host, bytes); // no publicationId/claimedPosition

        const placementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
        const publicationId = 'publication-legacy';
        placeReal(placementRegistry, publicationId, new Position(7, 8, 9));
        const publication = { id: publicationId, contentReference: null };

        const ctx = panelCtx({
            publication,
            placementInfo: placementInfoFor(placementRegistry, publicationId),
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand
        });

        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        const candidate = ctx.snapshotCandidateDiscoveryResult[0];
        assert(!('publicationId' in candidate) && !('claimedPosition' in candidate), '1. sanity: the old-style candidate carries neither key');

        ctx.selectSnapshotCandidate(candidate);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        ctx.materializeSelectedSnapshot();
        await flushMicrotasks();

        ctx.useClaimedSnapshotPosition();
        assert(ctx.selectedSnapshotWorldPositionClaimResult.outcome === SnapshotWorldPositionClaimOutcome.ABSENT, '2. no claim -> ABSENT');

        ctx.placeMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldPlacementResult.outcome === SnapshotWorldPlacementOutcome.PLACED, '3. placement still succeeds, via the existing local placementInfo');
        assert(ctx.selectedSnapshotWorldPlacementResult.position.x === 7
            && ctx.selectedSnapshotWorldPlacementResult.position.y === 8
            && ctx.selectedSnapshotWorldPlacementResult.position.z === 9,
            '4. the position is the RECEIVER\'s own existing local placement — never (0,0,0), never fabricated');

        // Never clicking "Use Claimed Position" at all reaches the
        // identical result — the claim family is entirely optional.
        const ctxSkipped = panelCtx({
            publication,
            placementInfo: placementInfoFor(placementRegistry, publicationId),
            selectedSnapshotMaterializationResult: ctx.selectedSnapshotMaterializationResult
        });
        ctxSkipped.placeMaterializedSnapshot();
        assert(ctxSkipped.selectedSnapshotWorldPlacementResult.outcome === SnapshotWorldPlacementOutcome.PLACED
            && ctxSkipped.selectedSnapshotWorldPlacementResult.position.x === 7,
            '5. skipping useClaimedSnapshotPosition() entirely reaches the identical local placement — the action is optional, never required');

        console.log('✓ Section D: an old-style candidate with no claim preserves the existing local-placement path exactly');
    }

    // ---------------------------------------------------------------
    // Section E — a claim never alters content identity
    // ---------------------------------------------------------------
    {
        const contentHash = computeContentHash('Section E content');
        const withClaim = { contentHash, locator: 'ar://e', storage: 'ar', publicationId: 'pub-e', claimedPosition: { x: 1, y: 1, z: 1 } };
        const withoutClaim = { contentHash, locator: 'ar://e', storage: 'ar' };

        const claimResult = resolveSnapshotWorldPositionClaim(withClaim, 'pub-e');
        assert(!('contentHash' in claimResult) && !('locator' in claimResult) && !('storage' in claimResult),
            '1. resolveSnapshotWorldPositionClaim() never reports contentHash/locator/storage of any kind — a claim answers only a spatial question');
        assert(withClaim.contentHash === withoutClaim.contentHash, '2. sanity: the two candidates share identical content identity');
        assert(claimResult.outcome === SnapshotWorldPositionClaimOutcome.CLAIMED, '3. sanity: the claim was consumed');

        console.log('✓ Section E: a position claim carries no content-identity field of any kind, and never substitutes for one');
    }

    // ---------------------------------------------------------------
    // Section F — a claim never alters retrieval
    // ---------------------------------------------------------------
    {
        const bytes = 'Section F: retrieval must be identical with or without a position claim';
        const hostWithClaim = makeHost('claim-retrieval-with');
        const hostWithoutClaim = makeHost('claim-retrieval-without');
        const refWith = await placeAndAnnounce(hostWithClaim, bytes, { publicationId: 'pub-f', claimedPosition: { x: 3, y: 3, z: 3 } });
        const refWithout = await placeAndAnnounce(hostWithoutClaim, bytes);

        const resultWith = await hostWithClaim.resolveSelectedSnapshotCommand({ contentHash: refWith.hash, locator: refWith.uri, storage: refWith.storage, publicationId: 'pub-f', claimedPosition: { x: 3, y: 3, z: 3 } });
        const resultWithout = await hostWithoutClaim.resolveSelectedSnapshotCommand({ contentHash: refWithout.hash, locator: refWithout.uri, storage: refWithout.storage });

        assert(resultWith.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED && resultWithout.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED,
            '1. resolution succeeds identically regardless of a claim\'s presence');
        assert(resultWith.bytes === resultWithout.bytes, '2. the retrieved bytes are byte-for-byte identical — a claim never influences retrieval');

        const materializedWith = await hostWithClaim.materializeSelectedSnapshotCommand(resultWith);
        const materializedWithout = await hostWithoutClaim.materializeSelectedSnapshotCommand(resultWithout);
        assert(materializedWith.outcome === SnapshotCandidateMaterializationOutcome.STORED && materializedWithout.outcome === SnapshotCandidateMaterializationOutcome.STORED,
            '3. materialization succeeds identically regardless of a claim\'s presence');
        assert(materializedWith.contentHash === materializedWithout.contentHash, '4. the materialized contentHash never differs because of a claim');

        console.log('✓ Section F: a position claim never influences Arweave lookup, content-store selection, byte retrieval, or content verification');
    }

    // ---------------------------------------------------------------
    // Section G — a claim never constitutes verification
    // ---------------------------------------------------------------
    {
        const outcomeKeys = Object.keys(SnapshotWorldPositionClaimOutcome);
        assert(outcomeKeys.length === 3
            && outcomeKeys.includes('CLAIMED') && outcomeKeys.includes('ABSENT') && outcomeKeys.includes('MISMATCHED'),
            '1. SnapshotWorldPositionClaimOutcome carries exactly its three own values — no VERIFIED_POSITION, no TRUSTED, nothing else');

        const claimed = resolveSnapshotWorldPositionClaim(
            { contentHash: 'h', locator: 'l', storage: 's', publicationId: 'pub-g', claimedPosition: { x: 1, y: 2, z: 3 } },
            'pub-g'
        );
        assert(Object.keys(claimed).length === 2 && 'outcome' in claimed && 'position' in claimed,
            '2. a CLAIMED result carries exactly outcome/position — no verified/trusted/authentic field of any kind');

        console.log('✓ Section G: consuming a claim is structurally distinct from verifying one — no new verification vocabulary exists');
    }

    // ---------------------------------------------------------------
    // Section H — purity / immutability
    // ---------------------------------------------------------------
    {
        const candidate = Object.freeze({
            contentHash: 'h', locator: 'l', storage: 's',
            publicationId: 'pub-h', claimedPosition: Object.freeze({ x: 4, y: 5, z: 6 })
        });
        const before = JSON.stringify(candidate);
        const result = resolveSnapshotWorldPositionClaim(candidate, 'pub-h');
        assert(JSON.stringify(candidate) === before, '1. the candidate is never mutated');
        assert(result.position !== candidate.claimedPosition, '2. the returned position is a fresh object, never the input reference');
        let threw = false;
        try { result.position.x = 999; } catch (e) { threw = true; }
        assert(threw || result.position.x === 4, '3. the returned position is frozen');
        threw = false;
        try { result.outcome = 'tampered'; } catch (e) { threw = true; }
        assert(threw || result.outcome === SnapshotWorldPositionClaimOutcome.CLAIMED, '4. the returned result itself is frozen');

        // Calling twice with the same inputs produces the identical answer
        // — a pure function, no hidden state.
        const again = resolveSnapshotWorldPositionClaim(candidate, 'pub-h');
        assert(again.position.x === result.position.x && again.position.y === result.position.y && again.position.z === result.position.z,
            '5. repeated calls with identical inputs produce identical output');

        console.log('✓ Section H: resolveSnapshotWorldPositionClaim() is pure — no mutation, frozen output, deterministic');
    }

    // ---------------------------------------------------------------
    // Section I — explicit consumption
    // ---------------------------------------------------------------
    {
        const host = makeHost('claim-explicit');
        const bytes = 'Section I: explicit consumption only, never automatic';
        await placeAndAnnounce(host, bytes, { publicationId: 'pub-i', claimedPosition: { x: 11, y: 12, z: 13 } });

        const publication = { id: 'pub-i', contentReference: null };
        const ctx = panelCtx({
            publication,
            placementInfo: null,
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand
        });

        // I1. discovery alone places nothing.
        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotWorldPositionClaimResult === null, '1. discovery alone never computes a claim result');
        assert(ctx.selectedSnapshotWorldPlacementResult === null, '2. discovery alone never places anything');

        // I2. selection alone places nothing, and computes no claim result.
        const candidate = ctx.snapshotCandidateDiscoveryResult[0];
        ctx.selectSnapshotCandidate(candidate);
        assert(ctx.selectedSnapshotWorldPositionClaimResult === null, '3. selecting a candidate alone never computes a claim result');
        assert(ctx.selectedSnapshotWorldPlacementResult === null, '4. selecting a candidate alone never places anything');

        // I3. resolving and materializing alone still compute no claim
        // result and place nothing.
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        ctx.materializeSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotWorldPositionClaimResult === null, '5. materializing never automatically consumes a claim');
        assert(ctx.selectedSnapshotWorldPlacementResult === null, '6. materializing never automatically places anything');

        // I4. only the explicit click computes a claim result.
        ctx.useClaimedSnapshotPosition();
        assert(ctx.selectedSnapshotWorldPositionClaimResult !== null
            && ctx.selectedSnapshotWorldPositionClaimResult.outcome === SnapshotWorldPositionClaimOutcome.CLAIMED,
            '7. only the explicit useClaimedSnapshotPosition() click consumes the claim');
        assert(ctx.selectedSnapshotWorldPlacementResult === null, '8. consuming the claim alone still places nothing — placement remains its own separate click');

        // I5. only the explicit placement click applies it.
        ctx.placeMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldPlacementResult.outcome === SnapshotWorldPlacementOutcome.PLACED, '9. the explicit placement click applies the consumed claim');
        assert(ctx.selectedSnapshotWorldPlacementResult.position.x === 11
            && ctx.selectedSnapshotWorldPlacementResult.position.y === 12
            && ctx.selectedSnapshotWorldPlacementResult.position.z === 13,
            '10. the applied position is EXACTLY the publisher\'s own claimed position — the recovered stranger\'s Snapshot lands at the CLAIMED position, never a local one');

        console.log('✓ Section I: discovery and selection never place anything on their own — only the explicit consume-then-place click sequence does');
    }

    // ---------------------------------------------------------------
    // Section J — existing local-placement regression (0.9.159, unmodified)
    // ---------------------------------------------------------------
    {
        const host = makeHost('claim-regression');
        const bytes = JSON.stringify({ world: { buildings: [{ id: 'regression-building', bricks: 3 }] } });
        await placeAndAnnounce(host, bytes); // no claim at all — pre-0.9.171 shape

        const placementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
        const publicationId = 'flagship-regression-publication';
        placeReal(placementRegistry, publicationId, new Position(42, 3, -17));

        const ctx = panelCtx({
            publication: { id: publicationId, contentReference: null },
            placementInfo: placementInfoFor(placementRegistry, publicationId),
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand
        });

        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        const candidate = ctx.snapshotCandidateDiscoveryResult[0];
        ctx.selectSnapshotCandidate(candidate);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        ctx.materializeSelectedSnapshot();
        await flushMicrotasks();
        ctx.placeMaterializedSnapshot();

        assert(ctx.selectedSnapshotWorldPlacementResult.outcome === SnapshotWorldPlacementOutcome.PLACED,
            '1. REGRESSION — a real Nostr-discovered, resolved, materialized Snapshot with no claim is still placed using the real, independently-created WorldPlacement');
        assert(ctx.selectedSnapshotWorldPlacementResult.position.x === 42
            && ctx.selectedSnapshotWorldPlacementResult.position.y === 3
            && ctx.selectedSnapshotWorldPlacementResult.position.z === -17,
            '2. REGRESSION — the position is exactly the real PlacementRecord\'s own, borrowed verbatim, exactly as 0.9.159 already proved');

        console.log('✓ Section J: the pre-0.9.172 local-placement flagship path is preserved exactly');
    }

    // ---------------------------------------------------------------
    // Section K — structural sweep
    // ---------------------------------------------------------------
    {
        const { readFile } = await import('node:fs/promises');

        const claimSource = await readFile(new URL('../application/SnapshotWorldPositionClaim.js', import.meta.url), 'utf8');
        const claimImportLines = claimSource.split('\n').filter((line) => line.trim().startsWith('import '));
        assert(!claimImportLines.some((line) => /PlacementRegistry|SpatialIndex|ContentStore|WorldNavigationSession|NostrSnapshotDiscoveryQueryService|NostrSnapshotDiscoveryPublisher|Arweave|Renderer|WorldRenderer|SnapshotWorldPlacement/.test(line)),
            '1. resolveSnapshotWorldPositionClaim() imports no I/O machinery, and never imports application/SnapshotWorldPlacement.js itself (never Nostr, never a placement lookup)');
        assert(!claimSource.includes('fetch(') && !claimSource.includes('await '),
            '2. resolveSnapshotWorldPositionClaim() performs no network/async I/O — it is a plain synchronous function');

        // application/SnapshotWorldPlacement.js remains completely
        // unmodified/unaware of Nostr or a claim of any kind — the
        // milestone's own promise, "given a resolved placement input,"
        // never taught to understand Nostr.
        const placementSource = await readFile(new URL('../application/SnapshotWorldPlacement.js', import.meta.url), 'utf8');
        assert(!/nostr|claim|publicationid.*claimedposition/i.test(placementSource.replace(/\/\/.*$/gm, '').replace(/^\s*\*.*$/gm, '')),
            '3. application/SnapshotWorldPlacement.js remains entirely unaware of Nostr or a position claim — it is never modified by this milestone');

        // No new verification vocabulary anywhere in the new domain files.
        assert(!/verified|trusted|authentic/i.test(claimSource.replace(/\/\/.*$/gm, '').replace(/^\s*\*.*$/gm, '')),
            '4. no verified/trusted/authentic vocabulary appears in resolveSnapshotWorldPositionClaim()\'s own executable code');

        // useClaimedSnapshotPosition() never calls the resolution or
        // materialization command itself — it only reads
        // selectedSnapshotCandidate/publication, already computed by
        // separate clicks.
        const panelSource = await readFile(new URL('../ui/components/OwnPublicationPanel.js', import.meta.url), 'utf8');
        const bodyStart = panelSource.indexOf('useClaimedSnapshotPosition() {');
        const bodyEnd = panelSource.indexOf('\n        },', bodyStart);
        const body = panelSource.slice(bodyStart, bodyEnd);
        assert(!body.includes('resolveSelectedSnapshotCommand') && !body.includes('materializeSelectedSnapshotCommand'),
            '5. useClaimedSnapshotPosition() never calls the resolution or materialization command itself');
        assert(body.includes('resolveSnapshotWorldPositionClaim'), '6. useClaimedSnapshotPosition() is the one call site of resolveSnapshotWorldPositionClaim()');

        console.log('✓ Section K: structural sweep — no I/O, no cryptographic re-verification, application/SnapshotWorldPlacement.js untouched, no new verification vocabulary');
    }

    console.log('\n✅ All Decentralized Snapshot Position Claim Consumption tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
