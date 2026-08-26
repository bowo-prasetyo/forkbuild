import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { IpfsContentStore } from '../content/IpfsContentStore.js';
import { computeContentHash } from '../serializer/contentHash.js';

import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { AddPublicationSnapshotPlacementUseCase } from '../application/AddPublicationSnapshotPlacementUseCase.js';
import { PublicationResolver } from '../application/PublicationResolver.js';
import { PublicationCatalogDiscoveryProvider } from '../discovery/PublicationCatalogDiscoveryProvider.js';
import { PublicationCatalogContentResolver } from '../discovery/PublicationCatalogContentResolver.js';
import { CreateSnapshotPlacementOrchestratorUseCase } from '../application/CreateSnapshotPlacementOrchestratorUseCase.js';
import { CreateSnapshotPlacementResolutionCoordinatorUseCase } from '../application/CreateSnapshotPlacementResolutionCoordinatorUseCase.js';

import { StoreSnapshotContentUseCase } from '../application/StoreSnapshotContentUseCase.js';
import { StoreSnapshotContentOutcome } from '../application/StoreSnapshotContentOutcome.js';
import { SnapshotMaterializationSourceKind } from '../application/SnapshotMaterializationSourceKind.js';
import { createSnapshotMaterializationAttempt } from '../application/SnapshotMaterializationAttempt.js';
import { appendSnapshotMaterializationHistoryEntry, describeSnapshotMaterializationSourceCounts } from '../application/SnapshotMaterializationHistory.js';
import { describeSnapshotMaterializationHistory, describeSnapshotMaterializationOutcomeLabel } from '../application/SnapshotMaterializationHistoryView.js';

import { BuildPublicationSnapshotTransferPackageUseCase } from '../application/BuildPublicationSnapshotTransferPackageUseCase.js';
import { ImportPublicationSnapshotTransferPackageUseCase } from '../application/ImportPublicationSnapshotTransferPackageUseCase.js';
import { SnapshotContentTransferOutcome } from '../application/SnapshotContentTransferOutcome.js';

import { MaterializeSnapshotFromPlacementUseCase } from '../application/MaterializeSnapshotFromPlacementUseCase.js';
import { SnapshotPlacementMaterializationOutcome } from '../application/SnapshotPlacementMaterializationOutcome.js';

import { MaterializeSnapshotFromPeerUseCase } from '../application/MaterializeSnapshotFromPeerUseCase.js';
import { PeerSnapshotMaterializationOutcome } from '../application/PeerSnapshotMaterializationOutcome.js';

import { CheckLocalSnapshotContentAvailabilityUseCase } from '../application/CheckLocalSnapshotContentAvailabilityUseCase.js';
import { LocalSnapshotContentAvailabilityOutcome } from '../application/LocalSnapshotContentAvailabilityOutcome.js';

// 0.8.38 — Snapshot Materialization History & Source Inspection.
//
//   Section A: application/SnapshotMaterializationAttempt.js's own new
//              `observedAt` field; application/
//              SnapshotMaterializationHistory.js's append-only,
//              non-mutating accumulation and non-judgmental source
//              counts; application/SnapshotMaterializationHistoryView.js's
//              own outcome labels and history narration — including that
//              none of the vocabulary ever ranks one source over another.
//   Section B — FLAGSHIP: Alice publishes a snapshot, holds it locally,
//              and creates a real IPFS placement for it. Three entirely
//              separate replicas — Bob, Carol, and Dave — each obtain the
//              IDENTICAL bytes through a DIFFERENT one of the three
//              explicit sources (PACKAGE, PLACEMENT, PEER). Each replica's
//              own materialization history names exactly the source it
//              actually used, all three report AVAILABLE through the
//              same, unchanged application/
//              CheckLocalSnapshotContentAvailabilityUseCase.js (0.8.33),
//              and a combined source-count tally over all three replicas'
//              histories is a plain 1/1/1 — never a ranking.
//   Section C: a single replica's history across MULTIPLE attempts, in
//              order, including a rejected one. Erin tries "Get Snapshot
//              from Peer" against a peer that never answers (UNAVAILABLE
//              — never recorded, since resolution never reached
//              application/StoreSnapshotContentUseCase.js at all), then
//              against a peer that answers with tampered bytes
//              (HASH_MISMATCH — recorded, and local availability still
//              reports NOT_AVAILABLE afterward), then finally against a
//              peer that answers correctly (STORED). Her own history ends
//              up holding exactly TWO entries, in that order — the
//              UNAVAILABLE attempt leaves no trace, exactly as designed.
//
// See docs/Principles.md, "Materialization History Describes Byte
// Acquisition, Not Source Trust (0.8.38)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, message);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

function fakeCid(text) {
    return 'bafyFAKE' + computeContentHash(text);
}

// The identical fake Kubo HTTP RPC API tests/SnapshotMaterializationUnification
// .test.js's own makeFakeIpfsNode() already established.
function makeFakeIpfsNode(network = new Map()) {
    async function fetchImpl(url, options) {
        const parsed = new URL(url);
        if (parsed.pathname === '/api/v0/add') {
            const blob = options.body.get('file');
            const text = await blob.text();
            const cid = fakeCid(text);
            network.set(cid, text);
            return new Response(JSON.stringify({ Hash: cid, Size: String(text.length) }), { status: 200 });
        }
        if (parsed.pathname === '/api/v0/cat') {
            const cid = parsed.searchParams.get('arg');
            if (!network.has(cid)) return new Response('not found', { status: 500 });
            return new Response(network.get(cid), { status: 200 });
        }
        return new Response('unknown route', { status: 404 });
    }
    return { network, fetchImpl };
}

function makePublicationCenter({ stores = [], identityProvider = makeIdentity('Alice') } = {}) {
    const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
    const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
    const publicationContentStore = new LocalContentStore(new InMemoryStorageProvider());
    const publicationResolver = new PublicationResolver(publicationContentStore, new LocalAuthorizationVerifier());

    const discoveryProvider = new PublicationCatalogDiscoveryProvider(publicationCatalog);
    const contentResolver = new PublicationCatalogContentResolver(publicationCatalog, publicationContentStore);

    const { createExternalSnapshotPlacementUseCase } = new CreateSnapshotPlacementOrchestratorUseCase().execute({
        discoveryProvider, contentResolver, placementCatalog, identityProvider, stores
    });

    return {
        publicationCatalog, placementCatalog, publicationContentStore, publicationResolver,
        identityProvider, createExternalSnapshotPlacementUseCase
    };
}

async function publishLocally(publicationResolver, publicationCatalog, identityProvider, content) {
    const publication = await publicationResolver.publish({ content, contentKind: 'forkbuild.structure', identityProvider });
    publicationCatalog.add(publication);
    return publication;
}

// A fresh replica's own "materialize from placement" pipeline, mirroring
// tests/SnapshotMaterializationUnification.test.js's own
// makeReplicaPlacementPipeline() exactly.
function makeReplicaPlacementPipeline(ipfsStore) {
    const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
    const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
    const contentStore = new LocalContentStore(new InMemoryStorageProvider());
    const storeSnapshotContentUseCase = new StoreSnapshotContentUseCase(contentStore);
    const { coordinator: resolutionCoordinator } = new CreateSnapshotPlacementResolutionCoordinatorUseCase().execute({
        placementCatalog, stores: [ipfsStore]
    });
    const materializeUseCase = new MaterializeSnapshotFromPlacementUseCase(resolutionCoordinator, storeSnapshotContentUseCase, publicationCatalog);
    return { publicationCatalog, placementCatalog, contentStore, storeSnapshotContentUseCase, materializeUseCase };
}

// A minimal fake application/PublicationSnapshotContentPeerExchange.js,
// mirroring tests/PeerSnapshotContentTransfer.test.js's own FakeExchange
// exactly — deterministic and scriptable, so this file's own focus (the
// HISTORY that accumulates around a materialization result) is never
// entangled with real peer transport timing.
class FakeExchange {
    constructor() {
        this._listeners = new Set();
        this.requests = [];
    }
    request(peer, { publicationId, contentHash }) {
        this.requests.push({ peer, publicationId, contentHash });
    }
    onContentReceived(callback) {
        this._listeners.add(callback);
        return () => this._listeners.delete(callback);
    }
    deliver(event) {
        for (const listener of Array.from(this._listeners)) listener(event);
    }
}

// The identical outer-to-inner outcome mapping ui/views/
// DecentralizedPublicationsView.js's own mapPackageOutcomeToStoreOutcome()/
// mapPlacementOutcomeToStoreOutcome()/mapPeerOutcomeToStoreOutcome()
// perform, reproduced here so this test can build a materialization
// history from each use case's own REAL result exactly as that view does.
function mapPackageOutcome(outcome) {
    switch (outcome) {
        case SnapshotContentTransferOutcome.STORED: return StoreSnapshotContentOutcome.STORED;
        case SnapshotContentTransferOutcome.ALREADY_STORED: return StoreSnapshotContentOutcome.ALREADY_AVAILABLE;
        case SnapshotContentTransferOutcome.CONTENT_HASH_MISMATCH: return StoreSnapshotContentOutcome.HASH_MISMATCH;
        default: return null;
    }
}
function mapPlacementOutcome(outcome) {
    switch (outcome) {
        case SnapshotPlacementMaterializationOutcome.STORED: return StoreSnapshotContentOutcome.STORED;
        case SnapshotPlacementMaterializationOutcome.ALREADY_AVAILABLE: return StoreSnapshotContentOutcome.ALREADY_AVAILABLE;
        case SnapshotPlacementMaterializationOutcome.HASH_MISMATCH: return StoreSnapshotContentOutcome.HASH_MISMATCH;
        default: return null;
    }
}
function mapPeerOutcome(outcome) {
    switch (outcome) {
        case PeerSnapshotMaterializationOutcome.STORED: return StoreSnapshotContentOutcome.STORED;
        case PeerSnapshotMaterializationOutcome.ALREADY_AVAILABLE: return StoreSnapshotContentOutcome.ALREADY_AVAILABLE;
        case PeerSnapshotMaterializationOutcome.HASH_MISMATCH: return StoreSnapshotContentOutcome.HASH_MISMATCH;
        default: return null;
    }
}

// Mirrors ui/views/DecentralizedPublicationsView.js's own
// recordMaterializationHistoryEntry() exactly: appends nothing when the
// mapped inner outcome is null (the outer outcome never reached
// application/StoreSnapshotContentUseCase.js at all).
function recordHistoryEntry(history, { sourceKind, outcome, publicationId, contentHash, contentReference }) {
    if (!sourceKind || !outcome) return history;
    const attempt = createSnapshotMaterializationAttempt({ sourceKind, outcome, contentReference, publicationId, contentHash });
    return appendSnapshotMaterializationHistoryEntry(history, attempt);
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — SnapshotMaterializationAttempt.observedAt,
    // SnapshotMaterializationHistory, SnapshotMaterializationHistoryView
    // ---------------------------------------------------------------
    {
        const attempt = createSnapshotMaterializationAttempt({
            sourceKind: SnapshotMaterializationSourceKind.PACKAGE, outcome: StoreSnapshotContentOutcome.STORED
        });
        assert(attempt.observedAt instanceof Date && !Number.isNaN(attempt.observedAt.getTime()),
            '1. createSnapshotMaterializationAttempt() stamps a default observedAt Date when none is given');

        const explicitDate = new Date('2026-01-01T00:00:00Z');
        const explicitAttempt = createSnapshotMaterializationAttempt({
            sourceKind: SnapshotMaterializationSourceKind.PEER, outcome: StoreSnapshotContentOutcome.HASH_MISMATCH, observedAt: explicitDate
        });
        assert(explicitAttempt.observedAt.getTime() === explicitDate.getTime(), '2. an explicit observedAt is carried through unchanged');

        expectThrows(() => createSnapshotMaterializationAttempt({
            sourceKind: SnapshotMaterializationSourceKind.PACKAGE, outcome: StoreSnapshotContentOutcome.STORED, observedAt: 'not-a-date'
        }), '3. an invalid observedAt is rejected');

        // appendSnapshotMaterializationHistoryEntry — append-only, never mutating.
        const empty = [];
        const withOne = appendSnapshotMaterializationHistoryEntry(empty, attempt);
        assert(Array.isArray(withOne) && withOne.length === 1 && withOne[0] === attempt, '4. appending to an empty history yields a one-entry array');
        assert(empty.length === 0, '5. INVARIANT: the original (empty) array passed in is never mutated');
        assert(Object.isFrozen(withOne), '6. the returned history is frozen');

        const second = createSnapshotMaterializationAttempt({
            sourceKind: SnapshotMaterializationSourceKind.PLACEMENT, outcome: StoreSnapshotContentOutcome.ALREADY_AVAILABLE
        });
        const withTwo = appendSnapshotMaterializationHistoryEntry(withOne, second);
        assert(withTwo.length === 2 && withTwo[0] === attempt && withTwo[1] === second, '7. a second append preserves order — oldest first');
        assert(withOne.length === 1, '8. INVARIANT: appending again never mutates the previous history array either');

        // describeSnapshotMaterializationSourceCounts — a plain tally, counting every attempt regardless of outcome.
        const mismatch = createSnapshotMaterializationAttempt({
            sourceKind: SnapshotMaterializationSourceKind.PACKAGE, outcome: StoreSnapshotContentOutcome.HASH_MISMATCH
        });
        const historyWithMismatch = appendSnapshotMaterializationHistoryEntry(withTwo, mismatch);
        const counts = describeSnapshotMaterializationSourceCounts(historyWithMismatch);
        assert(counts.package === 2 && counts.placement === 1 && counts.peer === 0,
            '9. counts tally EVERY recorded attempt per source, including a rejected HASH_MISMATCH one');
        assert(describeSnapshotMaterializationSourceCounts([]).package === 0, '10. an empty history counts zero everywhere');
        assert(describeSnapshotMaterializationSourceCounts(null).peer === 0, '11. a null history is handled the same as empty, never throws');

        // describeSnapshotMaterializationOutcomeLabel
        assert(describeSnapshotMaterializationOutcomeLabel(StoreSnapshotContentOutcome.STORED) === 'Snapshot stored locally', '12. STORED has its own label');
        assert(describeSnapshotMaterializationOutcomeLabel(StoreSnapshotContentOutcome.ALREADY_AVAILABLE) === 'Snapshot was already available', '13. ALREADY_AVAILABLE has its own, DIFFERENT label');
        assert(describeSnapshotMaterializationOutcomeLabel(StoreSnapshotContentOutcome.HASH_MISMATCH) === 'Content hash mismatch', '14. HASH_MISMATCH has its own label');
        assert(describeSnapshotMaterializationOutcomeLabel(null) === null, '15. an unrecognized outcome reports no label');

        // describeSnapshotMaterializationHistory — the full narration.
        const view = describeSnapshotMaterializationHistory(historyWithMismatch);
        assert(view.count === 3 && view.attempts.length === 3, '16. the view reports the correct count and one entry per attempt');
        assert(view.attempts[0].sourceLabel === 'Transfer package' && view.attempts[0].outcomeLabel === 'Snapshot stored locally' && view.attempts[0].possessed === true,
            '17. the first (oldest) attempt is narrated correctly, and reported possessed');
        assert(view.attempts[2].sourceLabel === 'Transfer package' && view.attempts[2].outcomeLabel === 'Content hash mismatch' && view.attempts[2].possessed === false,
            '18. the LAST attempt (the rejected one) is narrated correctly, and reported NOT possessed');
        assert(describeSnapshotMaterializationHistory(null).count === 0, '19. describeSnapshotMaterializationHistory() tolerates a null/absent history');
        assert(describeSnapshotMaterializationHistory([]).attempts.length === 0, '20. an empty history narrates zero attempts');

        // No adjective ever ranks one source or outcome over another.
        const forbiddenWords = ['preferred', 'best', 'trusted', 'primary', 'secondary', 'recommended', 'verified via', 'canonical', 'reliable'];
        const labels = ['Snapshot stored locally', 'Snapshot was already available', 'Content hash mismatch'];
        for (const label of labels) {
            for (const forbidden of forbiddenWords) {
                assert(!label.toLowerCase().includes(forbidden), `21. outcome label "${label}" never contains the forbidden word "${forbidden}"`);
            }
        }
    }
    console.log('✓ Section A: SnapshotMaterializationAttempt.observedAt, SnapshotMaterializationHistory (append-only, non-mutating, plain counts), SnapshotMaterializationHistoryView (factual narration, never a ranking)');

    // ---------------------------------------------------------------
    // Section B — FLAGSHIP: three independent replicas, three
    // independent explicit sources, byte-identical possession, three
    // independent one-entry histories
    // ---------------------------------------------------------------
    {
        const network = new Map();
        const { fetchImpl } = makeFakeIpfsNode(network);
        const aliceIpfs = new IpfsContentStore({ apiUrl: 'http://alice-history-node.test:5001', fetchImpl });

        const { publicationCatalog: alicePublicationCatalog, publicationContentStore: aliceContentStore, publicationResolver, identityProvider,
            createExternalSnapshotPlacementUseCase } = makePublicationCenter({ stores: [aliceIpfs] });

        const publication = await publishLocally(publicationResolver, alicePublicationCatalog, identityProvider, { flagship: '0.8.38' });
        const { placement } = await createExternalSnapshotPlacementUseCase.execute(publication.id, 'ipfs');
        const transferPackage = await new BuildPublicationSnapshotTransferPackageUseCase({
            publicationCatalog: alicePublicationCatalog, contentStore: aliceContentStore
        }).execute(publication.id);

        // --- Bob: obtains the snapshot via an offline transfer package (PACKAGE). ---
        let bobHistory = [];
        const bobContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const bobPublicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const bobImporter = new ImportPublicationSnapshotTransferPackageUseCase(new StoreSnapshotContentUseCase(bobContentStore), bobPublicationCatalog);
        const bobResult = await bobImporter.execute(transferPackage);
        assert(bobResult.outcome === SnapshotContentTransferOutcome.STORED, '1. Bob imports the transfer package — STORED');
        bobHistory = recordHistoryEntry(bobHistory, {
            sourceKind: bobResult.source.kind, outcome: mapPackageOutcome(bobResult.outcome),
            publicationId: bobResult.publicationId, contentHash: transferPackage.contentHash, contentReference: bobResult.contentReference
        });

        // --- Carol: obtains the snapshot via a resolved IPFS placement (PLACEMENT). ---
        let carolHistory = [];
        const carolIpfs = new IpfsContentStore({ apiUrl: 'http://carol-history-node.test:5001', fetchImpl });
        const carol = makeReplicaPlacementPipeline(carolIpfs);
        carol.publicationCatalog.add(publication);
        new AddPublicationSnapshotPlacementUseCase(carol.placementCatalog).execute(placement.toJSON());
        const carolResult = await carol.materializeUseCase.execute(placement);
        assert(carolResult.outcome === SnapshotPlacementMaterializationOutcome.STORED, '2. Carol materializes the placement — STORED');
        carolHistory = recordHistoryEntry(carolHistory, {
            sourceKind: carolResult.source.kind, outcome: mapPlacementOutcome(carolResult.outcome),
            publicationId: carolResult.publicationId, contentHash: carolResult.contentHash, contentReference: carolResult.contentReference
        });

        // --- Dave: obtains the snapshot via an explicitly selected peer (PEER). ---
        let daveHistory = [];
        const daveContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const davePublicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        davePublicationCatalog.add(publication);
        const daveExchange = new FakeExchange();
        const daveUseCase = new MaterializeSnapshotFromPeerUseCase(daveExchange, new StoreSnapshotContentUseCase(daveContentStore), davePublicationCatalog, { timeoutMs: 200 });
        const daveBytes = await aliceContentStore.get(publication.contentReference);
        const davePending = daveUseCase.execute({ peer: { connectionId: 'conn-eve' }, publicationId: publication.id, contentHash: publication.contentReference.hash });
        daveExchange.deliver({ publicationId: publication.id, contentHash: publication.contentReference.hash, bytes: daveBytes });
        const daveResult = await davePending;
        assert(daveResult.outcome === PeerSnapshotMaterializationOutcome.STORED, '3. Dave obtains the snapshot from an explicitly selected peer — STORED');
        daveHistory = recordHistoryEntry(daveHistory, {
            sourceKind: daveResult.source.kind, outcome: mapPeerOutcome(daveResult.outcome),
            publicationId: daveResult.publicationId, contentHash: daveResult.contentHash, contentReference: daveResult.contentReference
        });

        // --- Each replica's own history names exactly the source it used, and nothing else. ---
        assert(bobHistory.length === 1 && bobHistory[0].source.kind === SnapshotMaterializationSourceKind.PACKAGE, '4. Bob\'s own history holds exactly one PACKAGE entry');
        assert(carolHistory.length === 1 && carolHistory[0].source.kind === SnapshotMaterializationSourceKind.PLACEMENT, '5. Carol\'s own history holds exactly one PLACEMENT entry');
        assert(daveHistory.length === 1 && daveHistory[0].source.kind === SnapshotMaterializationSourceKind.PEER, '6. Dave\'s own history holds exactly one PEER entry');

        const bobView = describeSnapshotMaterializationHistory(bobHistory);
        const carolView = describeSnapshotMaterializationHistory(carolHistory);
        const daveView = describeSnapshotMaterializationHistory(daveHistory);
        assert(bobView.attempts[0].sourceLabel === 'Transfer package' && bobView.attempts[0].outcomeLabel === 'Snapshot stored locally',
            '7. Bob\'s own history narrates "Transfer package" / "Snapshot stored locally"');
        assert(carolView.attempts[0].sourceLabel === 'Placement' && carolView.attempts[0].outcomeLabel === 'Snapshot stored locally',
            '8. Carol\'s own history narrates "Placement" / "Snapshot stored locally"');
        assert(daveView.attempts[0].sourceLabel === 'Peer' && daveView.attempts[0].outcomeLabel === 'Snapshot stored locally',
            '9. Dave\'s own history narrates "Peer" / "Snapshot stored locally"');

        // --- All three independently report AVAILABLE, through the SAME unchanged 0.8.33 check. ---
        const bobAvailability = await new CheckLocalSnapshotContentAvailabilityUseCase(bobContentStore).execute(publication);
        const carolAvailability = await new CheckLocalSnapshotContentAvailabilityUseCase(carol.contentStore).execute(publication);
        const daveAvailability = await new CheckLocalSnapshotContentAvailabilityUseCase(daveContentStore).execute(publication);
        assert(bobAvailability.outcome === LocalSnapshotContentAvailabilityOutcome.AVAILABLE, '10. Bob\'s local availability check reports AVAILABLE');
        assert(carolAvailability.outcome === LocalSnapshotContentAvailabilityOutcome.AVAILABLE, '11. Carol\'s local availability check reports AVAILABLE');
        assert(daveAvailability.outcome === LocalSnapshotContentAvailabilityOutcome.AVAILABLE, '12. Dave\'s local availability check reports AVAILABLE');

        const bobBytes = await bobContentStore.get(bobResult.contentReference);
        const carolBytes = await carol.contentStore.get(carolResult.contentReference);
        const daveStoredBytes = await daveContentStore.get(daveResult.contentReference);
        assert(bobBytes === carolBytes && carolBytes === daveStoredBytes, '13. all three replicas hold BYTE-IDENTICAL content, obtained through three entirely different explicit sources');

        // --- A combined tally across all three replicas is a plain 1/1/1 — never a ranking. ---
        const combinedHistory = [...bobHistory, ...carolHistory, ...daveHistory];
        const combinedCounts = describeSnapshotMaterializationSourceCounts(combinedHistory);
        assert(combinedCounts.package === 1 && combinedCounts.placement === 1 && combinedCounts.peer === 1,
            '14. a combined source tally across all three replicas is exactly 1/1/1 — a historical fact, never evidence one mechanism is better');
    }
    console.log('✓ Section B: FLAGSHIP — Bob (package), Carol (placement), and Dave (peer) reach byte-identical local possession through three independent explicit sources, each with its own one-entry materialization history');

    // ---------------------------------------------------------------
    // Section C — one replica, multiple attempts over time: an
    // UNAVAILABLE attempt leaves no trace; a HASH_MISMATCH attempt is
    // recorded but never implies possession; a later STORED attempt
    // finally succeeds — the history narrates all of it, in order.
    // ---------------------------------------------------------------
    {
        const { publicationCatalog: authorCatalog, publicationContentStore: authorContentStore, publicationResolver, identityProvider } =
            makePublicationCenter({ identityProvider: makeIdentity('Erin-Author') });
        const publication = await publishLocally(publicationResolver, authorCatalog, identityProvider, { snapshot: 'grain-silo' });
        const realBytes = await authorContentStore.get(publication.contentReference);
        const realHash = publication.contentReference.hash;

        // Erin: a completely separate replica, who already knows the
        // publication (some other exchange delivered it) but starts with
        // an entirely EMPTY content store.
        const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        publicationCatalog.add(publication);
        const contentStore = new LocalContentStore(new InMemoryStorageProvider());
        const storeSnapshotContentUseCase = new StoreSnapshotContentUseCase(contentStore);

        let erinHistory = [];
        const exchange = new FakeExchange();
        const useCase = new MaterializeSnapshotFromPeerUseCase(exchange, storeSnapshotContentUseCase, publicationCatalog, { timeoutMs: 80 });
        const peer = { connectionId: 'conn-flaky' };

        // --- Attempt 1: nobody answers before the timeout — UNAVAILABLE. ---
        const first = await useCase.execute({ peer, publicationId: publication.id, contentHash: realHash });
        assert(first.outcome === PeerSnapshotMaterializationOutcome.UNAVAILABLE, '1. the first attempt times out — UNAVAILABLE');
        erinHistory = recordHistoryEntry(erinHistory, {
            sourceKind: first.source.kind, outcome: mapPeerOutcome(first.outcome),
            publicationId: first.publicationId, contentHash: first.contentHash, contentReference: first.contentReference
        });
        assert(erinHistory.length === 0, '2. INVARIANT: an UNAVAILABLE attempt (never reached application/StoreSnapshotContentUseCase.js) leaves NO trace in the history');

        // --- Attempt 2: the peer answers, but with tampered bytes — HASH_MISMATCH. ---
        const secondPending = useCase.execute({ peer, publicationId: publication.id, contentHash: realHash });
        exchange.deliver({ publicationId: publication.id, contentHash: realHash, bytes: '{"snapshot":"tampered"}' });
        const second = await secondPending;
        assert(second.outcome === PeerSnapshotMaterializationOutcome.HASH_MISMATCH, '3. the second attempt answers with the wrong bytes — HASH_MISMATCH');
        erinHistory = recordHistoryEntry(erinHistory, {
            sourceKind: second.source.kind, outcome: mapPeerOutcome(second.outcome),
            publicationId: second.publicationId, contentHash: second.contentHash, contentReference: second.contentReference
        });
        assert(erinHistory.length === 1 && erinHistory[0].outcome === StoreSnapshotContentOutcome.HASH_MISMATCH,
            '4. a HASH_MISMATCH attempt IS recorded — one entry now in the history');

        const availabilityAfterMismatch = await new CheckLocalSnapshotContentAvailabilityUseCase(contentStore).execute(publication);
        assert(availabilityAfterMismatch.outcome === LocalSnapshotContentAvailabilityOutcome.NOT_AVAILABLE,
            '5. INVARIANT: a rejected attempt in the history never implies possession — local availability still reports NOT_AVAILABLE');

        // --- Attempt 3: the peer answers correctly — STORED. ---
        const thirdPending = useCase.execute({ peer, publicationId: publication.id, contentHash: realHash });
        exchange.deliver({ publicationId: publication.id, contentHash: realHash, bytes: realBytes });
        const third = await thirdPending;
        assert(third.outcome === PeerSnapshotMaterializationOutcome.STORED, '6. the third attempt finally succeeds — STORED');
        erinHistory = recordHistoryEntry(erinHistory, {
            sourceKind: third.source.kind, outcome: mapPeerOutcome(third.outcome),
            publicationId: third.publicationId, contentHash: third.contentHash, contentReference: third.contentReference
        });

        assert(erinHistory.length === 2, '7. INVARIANT: the history now holds exactly TWO entries — the UNAVAILABLE attempt never left a third');
        assert(erinHistory[0].outcome === StoreSnapshotContentOutcome.HASH_MISMATCH && erinHistory[1].outcome === StoreSnapshotContentOutcome.STORED,
            '8. the two entries are in the exact order they happened — the rejection first, the success second');

        const view = describeSnapshotMaterializationHistory(erinHistory);
        assert(view.attempts[0].possessed === false && view.attempts[1].possessed === true,
            '9. the narrated history correctly marks the first entry as not-possessed and the second as possessed');

        const availabilityAfterStore = await new CheckLocalSnapshotContentAvailabilityUseCase(contentStore).execute(publication);
        assert(availabilityAfterStore.outcome === LocalSnapshotContentAvailabilityOutcome.AVAILABLE, '10. local availability now correctly reports AVAILABLE');
    }
    console.log('✓ Section C: one replica\'s history across multiple attempts over time — an UNAVAILABLE attempt leaves no trace, a HASH_MISMATCH attempt is recorded but never implies possession, and a later STORED attempt is recorded alongside it, in order');

    console.log('\n✅ All SnapshotMaterializationHistory tests passed');
}

run().catch((error) => {
    console.error('❌ SnapshotMaterializationHistory tests failed:', error);
    process.exitCode = 1;
});
