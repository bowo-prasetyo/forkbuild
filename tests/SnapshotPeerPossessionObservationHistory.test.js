import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { derivePublicationSnapshotPlacementConvergence } from '../application/PublicationSnapshotPlacementConvergence.js';
import { CheckLocalSnapshotContentAvailabilityUseCase } from '../application/CheckLocalSnapshotContentAvailabilityUseCase.js';
import { LocalSnapshotContentAvailabilityOutcome } from '../application/LocalSnapshotContentAvailabilityOutcome.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { ConnectedPeerRegistry } from '../application/ConnectedPeerRegistry.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';

import { SnapshotPeerPossessionState } from '../application/SnapshotPeerPossessionState.js';
import { toSnapshotPeerPossessionObservation } from '../application/SnapshotPeerPossessionObservation.js';
import { PublicationSnapshotPossessionPeerExchange } from '../application/PublicationSnapshotPossessionPeerExchange.js';
import { ObservePeerSnapshotPossessionUseCase } from '../application/ObservePeerSnapshotPossessionUseCase.js';
import { SnapshotPeerPossessionCoordinator } from '../application/SnapshotPeerPossessionCoordinator.js';
import {
    appendSnapshotPeerPossessionObservationHistoryEntry,
    latestSnapshotPeerPossessionObservationsByPeer
} from '../application/SnapshotPeerPossessionObservationHistory.js';
import {
    describeSnapshotPeerPossessionComparison,
    describeSnapshotPeerPossessionStateLabel,
    describeSnapshotPeerPossessionObservationHistory
} from '../application/SnapshotPeerPossessionComparisonView.js';

// 0.8.41 — Peer Snapshot Possession Comparison & Observation History.
//
//   Section A: SnapshotPeerPossessionObservationHistory — append-only,
//              never-mutating accumulation (mirroring application/
//              SnapshotMaterializationHistory.js, 0.8.38); latest-per-peer
//              reduction, preserving first-seen order, honoring
//              publicationId/contentHash filtering, and correctly
//              resolving ties by chronological position.
//   Section B: SnapshotPeerPossessionComparisonView — a pure, factual
//              comparison: exact counts per state, no reordering, no
//              deduplication of its own, and, by direct assertion, no
//              ranking/preference/trust vocabulary anywhere in its
//              output.
//   Section C: SnapshotPeerPossessionCoordinator#observePeers() against a
//              scriptable fake exchange — a caller-supplied peer list,
//              asked in parallel, resolved back in THAT list's own
//              order regardless of response arrival order.
//   Section D: FLAGSHIP — real, live, authenticated connections. Alice
//              and Carol possess a snapshot's bytes, Bob does not, and
//              Dave never answers at all (no responding exchange
//              attached to that connection). A single replica,
//              Xavier, asks all four via observePeers() and gets
//              AVAILABLE/NOT_AVAILABLE/AVAILABLE/UNAVAILABLE. Those four
//              observations, plus a later, second check of Alice (after
//              her own bytes are deleted), accumulate into ONE ordered,
//              non-overwriting history; the FIRST Alice observation
//              never changes; the comparison view, recomputed from the
//              latest-per-peer reduction, reflects only the newest
//              answer. Throughout, a shared placement catalog's own
//              derived convergence is asserted byte-identical before and
//              after every observation, and Xavier's own content store
//              never receives a single byte.
//
// See docs/Principles.md, "Peer Possession Observations Describe What
// Peers Report; They Do Not Become Placement Claims (0.8.41)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function wait(ms = 20) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
    provider.login(label);
    return provider;
}

async function publishAndCatalog(identityProvider, catalog, contentStore, text) {
    const contentReference = await contentStore.put(text);
    let publication = new DecentralizedPublication({
        contentKind: 'forkbuild.test-content',
        contentReference,
        publisherIdentity: identityProvider.getSigningIdentity().toJSON()
    });
    publication = publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
    catalog.add(publication);
    return publication;
}

function stubPeer(connectionId, state) {
    return { connectionId, getLifecycleState: () => state };
}

function observationAt(peerId, state, isoTime) {
    return toSnapshotPeerPossessionObservation({
        peerId, publicationId: 'pub-1', contentHash: 'hash-a', state, observedAt: new Date(isoTime)
    });
}

// A minimal fake application/PublicationSnapshotPossessionPeerExchange.js,
// mirroring tests/PublicationSnapshotPossessionExchange.test.js's own
// FakeExchange exactly.
class FakeExchange {
    constructor() {
        this._listeners = new Set();
        this.requests = [];
    }
    requestPossession(peer, { publicationId, contentHash }) {
        this.requests.push({ peer, publicationId, contentHash });
    }
    onPossessionReceived(callback) {
        this._listeners.add(callback);
        return () => this._listeners.delete(callback);
    }
    deliver(event) {
        for (const listener of Array.from(this._listeners)) listener(event);
    }
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — SnapshotPeerPossessionObservationHistory
    // ---------------------------------------------------------------
    {
        const aliceFirst = observationAt('conn-alice', SnapshotPeerPossessionState.AVAILABLE, '2026-01-01T00:00:00Z');
        const empty = [];
        const withOne = appendSnapshotPeerPossessionObservationHistoryEntry(empty, aliceFirst);
        assert(Array.isArray(withOne) && withOne.length === 1 && withOne[0] === aliceFirst, '1. appending to an empty history yields a one-entry array');
        assert(empty.length === 0, '2. INVARIANT: the original (empty) array passed in is never mutated');
        assert(Object.isFrozen(withOne), '3. the returned history is frozen');

        const bobFirst = observationAt('conn-bob', SnapshotPeerPossessionState.NOT_AVAILABLE, '2026-01-01T00:00:01Z');
        const withTwo = appendSnapshotPeerPossessionObservationHistoryEntry(withOne, bobFirst);
        assert(withTwo.length === 2 && withTwo[0] === aliceFirst && withTwo[1] === bobFirst, '4. a second append preserves order — oldest first');
        assert(withOne.length === 1, '5. INVARIANT: appending again never mutates the previous history array either');

        // The SAME peer observed again — repeated observations are allowed, and BOTH are kept.
        const aliceSecond = observationAt('conn-alice', SnapshotPeerPossessionState.NOT_AVAILABLE, '2026-01-01T00:00:02Z');
        const withThree = appendSnapshotPeerPossessionObservationHistoryEntry(withTwo, aliceSecond);
        assert(withThree.length === 3, '6. a repeated observation of the same peer is APPENDED, never replaces the earlier one');
        assert(withThree[0] === aliceFirst, '7. the earlier Alice observation is still present, unmodified, at its original position');
        assert(withThree[0].state === SnapshotPeerPossessionState.AVAILABLE, '8. INVARIANT: the first Alice observation never changes to match the second');

        assert(appendSnapshotPeerPossessionObservationHistoryEntry(withThree, null).length === 3, '9. appending null/undefined is a harmless no-op that still returns a frozen copy');
        assert(appendSnapshotPeerPossessionObservationHistoryEntry(null, aliceFirst).length === 1, '10. a null/absent history is treated as empty, never throws');

        // latestSnapshotPeerPossessionObservationsByPeer — first-seen order, most-recent value.
        const latest = latestSnapshotPeerPossessionObservationsByPeer(withThree);
        assert(latest.length === 2, '11. two distinct peers were observed — the reduction holds exactly two entries');
        assert(latest[0].peerId === 'conn-alice' && latest[0].state === SnapshotPeerPossessionState.NOT_AVAILABLE,
            '12. Alice\'s entry is her MOST RECENT observation (NOT_AVAILABLE), not her first (AVAILABLE)');
        assert(latest[1].peerId === 'conn-bob', '13. Bob\'s entry is present, and order follows first-seen order (Alice before Bob), not observedAt order');

        assert(latestSnapshotPeerPossessionObservationsByPeer([]).length === 0, '14. an empty history reduces to an empty list');
        assert(latestSnapshotPeerPossessionObservationsByPeer(null).length === 0, '15. a null history is handled the same as empty, never throws');

        // publicationId/contentHash filtering.
        const otherPub = toSnapshotPeerPossessionObservation({
            peerId: 'conn-carol', publicationId: 'pub-2', contentHash: 'hash-b', state: SnapshotPeerPossessionState.AVAILABLE, observedAt: new Date('2026-01-01T00:00:03Z')
        });
        const mixed = appendSnapshotPeerPossessionObservationHistoryEntry(withThree, otherPub);
        const filtered = latestSnapshotPeerPossessionObservationsByPeer(mixed, { publicationId: 'pub-1', contentHash: 'hash-a' });
        assert(filtered.length === 2 && !filtered.some((o) => o.peerId === 'conn-carol'),
            '16. filtering by publicationId/contentHash excludes an observation for a different pair entirely');
        const filteredOther = latestSnapshotPeerPossessionObservationsByPeer(mixed, { publicationId: 'pub-2', contentHash: 'hash-b' });
        assert(filteredOther.length === 1 && filteredOther[0].peerId === 'conn-carol', '17. and correctly includes only the matching pair when asked for it');

        // Tie-breaking: an identical observedAt keeps the LATER entry in history (chronological position wins).
        const tieTime = '2026-01-01T00:00:05Z';
        const tieA = toSnapshotPeerPossessionObservation({ peerId: 'conn-dave', publicationId: 'pub-1', contentHash: 'hash-a', state: SnapshotPeerPossessionState.AVAILABLE, observedAt: new Date(tieTime) });
        const tieB = toSnapshotPeerPossessionObservation({ peerId: 'conn-dave', publicationId: 'pub-1', contentHash: 'hash-a', state: SnapshotPeerPossessionState.NOT_AVAILABLE, observedAt: new Date(tieTime) });
        let tieHistory = appendSnapshotPeerPossessionObservationHistoryEntry([], tieA);
        tieHistory = appendSnapshotPeerPossessionObservationHistoryEntry(tieHistory, tieB);
        const tieLatest = latestSnapshotPeerPossessionObservationsByPeer(tieHistory);
        assert(tieLatest[0].state === SnapshotPeerPossessionState.NOT_AVAILABLE, '18. a tied observedAt resolves to whichever entry appears later in history');
    }
    console.log('✓ Section A: SnapshotPeerPossessionObservationHistory — append-only, non-mutating, repeated observations of the same peer are all kept, latest-per-peer reduction preserves first-seen order and honors publicationId/contentHash filtering');

    // ---------------------------------------------------------------
    // Section B — SnapshotPeerPossessionComparisonView
    // ---------------------------------------------------------------
    {
        const aliceObs = observationAt('conn-alice', SnapshotPeerPossessionState.AVAILABLE, '2026-01-01T00:00:00Z');
        const bobObs = observationAt('conn-bob', SnapshotPeerPossessionState.NOT_AVAILABLE, '2026-01-01T00:00:01Z');
        const carolObs = observationAt('conn-carol', SnapshotPeerPossessionState.UNAVAILABLE, '2026-01-01T00:00:02Z');

        const comparison = describeSnapshotPeerPossessionComparison('pub-1', 'hash-a', [aliceObs, bobObs, carolObs]);
        assert(comparison.publicationId === 'pub-1' && comparison.contentHash === 'hash-a', '1. the comparison echoes publicationId/contentHash for correlation');
        assert(comparison.peers.length === 3, '2. every given observation becomes one row');
        assert(comparison.peers[0].peerId === 'conn-alice' && comparison.peers[0].state === SnapshotPeerPossessionState.AVAILABLE && comparison.peers[0].possessed === true,
            '3. Alice\'s row names her state and derived possessed flag correctly');
        assert(comparison.peers[1].peerId === 'conn-bob' && comparison.peers[1].possessed === false, '4. Bob\'s row correctly reports NOT possessed');
        assert(comparison.peers[2].peerId === 'conn-carol' && comparison.peers[2].state === SnapshotPeerPossessionState.UNAVAILABLE,
            '5. Carol\'s row correctly preserves UNAVAILABLE — never collapsed into NOT_AVAILABLE');
        assert(comparison.availableCount === 1 && comparison.notAvailableCount === 1 && comparison.unavailableCount === 1,
            '6. the three counts are a plain, exact tally — one of each');

        // Order is preserved exactly as given, never re-sorted by state.
        const reordered = describeSnapshotPeerPossessionComparison('pub-1', 'hash-a', [carolObs, aliceObs, bobObs]);
        assert(reordered.peers[0].peerId === 'conn-carol' && reordered.peers[1].peerId === 'conn-alice' && reordered.peers[2].peerId === 'conn-bob',
            '7. peers appear in exactly the order the caller supplied — never grouped or sorted by state');

        assert(describeSnapshotPeerPossessionComparison('pub-1', 'hash-a', []).peers.length === 0, '8. an empty observation list produces an empty comparison');
        const emptyComparison = describeSnapshotPeerPossessionComparison('pub-1', 'hash-a');
        assert(emptyComparison.availableCount === 0 && emptyComparison.notAvailableCount === 0 && emptyComparison.unavailableCount === 0,
            '9. a missing observations argument is tolerated — every count reads zero, never throws');

        // No ranking/preference/trust vocabulary anywhere in the shape or its values.
        const forbiddenKeys = ['bestPeer', 'preferredPeer', 'recommendedPeer', 'trustedPeer', 'reliability', 'confidence', 'score', 'rank'];
        for (const key of forbiddenKeys) {
            assert(!(key in comparison), `10. the comparison never carries a "${key}" field`);
            assert(!comparison.peers.some((peer) => key in peer), `11. no individual peer row ever carries a "${key}" field either (checked "${key}")`);
        }

        assert(describeSnapshotPeerPossessionStateLabel(SnapshotPeerPossessionState.AVAILABLE) === 'Available', '12. AVAILABLE has its own label');
        assert(describeSnapshotPeerPossessionStateLabel(SnapshotPeerPossessionState.NOT_AVAILABLE) === 'Not available', '13. NOT_AVAILABLE has its own, DIFFERENT label');
        assert(describeSnapshotPeerPossessionStateLabel(SnapshotPeerPossessionState.UNAVAILABLE) === 'Could not determine',
            '14. UNAVAILABLE reads "Could not determine" — deliberately NOT "Not available," preserving the three-way distinction');
        assert(describeSnapshotPeerPossessionStateLabel(null) === null, '15. an unrecognized state reports no label');

        // describeSnapshotPeerPossessionObservationHistory — full chronological narration, never deduplicated.
        const history = appendSnapshotPeerPossessionObservationHistoryEntry(
            appendSnapshotPeerPossessionObservationHistoryEntry([], aliceObs), bobObs
        );
        const historyView = describeSnapshotPeerPossessionObservationHistory(history);
        assert(historyView.count === 2 && historyView.observations.length === 2, '16. the history view reports the correct count and one entry per observation');
        assert(historyView.observations[0].peerId === 'conn-alice' && historyView.observations[0].stateLabel === 'Available',
            '17. the first (oldest) history entry is narrated correctly');
        assert(describeSnapshotPeerPossessionObservationHistory(null).count === 0, '18. describeSnapshotPeerPossessionObservationHistory() tolerates a null/absent history');
    }
    console.log('✓ Section B: SnapshotPeerPossessionComparisonView — factual peer rows and exact counts in caller-given order, no ranking/preference/trust vocabulary, three-way state labels preserved, full chronological history narration');

    // ---------------------------------------------------------------
    // Section C — SnapshotPeerPossessionCoordinator#observePeers(),
    // against a scriptable fake exchange
    // ---------------------------------------------------------------
    {
        const exchange = new FakeExchange();
        const useCase = new ObservePeerSnapshotPossessionUseCase(exchange, { timeoutMs: 100 });
        const coordinator = new SnapshotPeerPossessionCoordinator(useCase);

        const alice = stubPeer('conn-alice', PeerLifecycleState.AUTHENTICATED);
        const bob = stubPeer('conn-bob', PeerLifecycleState.AUTHENTICATED);
        const carol = stubPeer('conn-carol', PeerLifecycleState.AUTHENTICATED);

        assert((await coordinator.observePeers({ peers: [], publicationId: 'pub-1', contentHash: 'hash-a' })).length === 0,
            '1. an empty peer list resolves to an empty result, without ever calling requestPossession()');
        assert(exchange.requests.length === 0, '2. INVARIANT: no request was sent for an empty peer list');

        const pending = coordinator.observePeers({ peers: [alice, bob, carol], publicationId: 'pub-1', contentHash: 'hash-a' });
        await wait(5);
        assert(exchange.requests.length === 3, '3. exactly one request per caller-supplied peer was sent — never more, never fewer');
        assert(exchange.requests.every((r) => r.publicationId === 'pub-1' && r.contentHash === 'hash-a'), '4. every request names the same publicationId/contentHash');

        // Deliver out of order, and deliberately never answer Carol at all (she times out).
        exchange.deliver({ peerId: 'conn-bob', publicationId: 'pub-1', contentHash: 'hash-a', state: 'not-available' });
        exchange.deliver({ peerId: 'conn-alice', publicationId: 'pub-1', contentHash: 'hash-a', state: 'available' });
        const results = await pending;

        assert(results.length === 3, '5. observePeers() resolves once every peer has either answered or timed out');
        assert(results[0].peerId === 'conn-alice' && results[0].state === SnapshotPeerPossessionState.AVAILABLE,
            '6. results[0] corresponds to peers[0] (Alice) — INPUT order, not response-arrival order (Bob answered first on the wire)');
        assert(results[1].peerId === 'conn-bob' && results[1].state === SnapshotPeerPossessionState.NOT_AVAILABLE, '7. results[1] corresponds to peers[1] (Bob)');
        assert(results[2].peerId === 'conn-carol' && results[2].state === SnapshotPeerPossessionState.UNAVAILABLE,
            '8. results[2] corresponds to peers[2] (Carol), who never answered — an honest UNAVAILABLE, not a rejected promise');
    }
    console.log('✓ Section C: SnapshotPeerPossessionCoordinator#observePeers() — one request per caller-supplied peer, asked in parallel, results returned in INPUT order regardless of response-arrival order, a non-answering peer resolves to UNAVAILABLE rather than rejecting');

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP: real, live, authenticated connections
    // ---------------------------------------------------------------
    {
        const network = new LocalPeerNetwork();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carol = makeIdentity('Carol');
        const dave = makeIdentity('Dave');
        const xavier = makeIdentity('Xavier');

        // ONE shared registry + bus on Xavier's own side — mirroring
        // ui/main.js's own single, app-wide `connectedPeerRegistry`/
        // `peerMessageBus`/`publicationSnapshotPossessionPeerExchange`
        // exactly: a real replica has exactly ONE exchange handling
        // requests to, and responses from, however many peers it happens
        // to be connected to, never one exchange per remote peer.
        const xavierRegistry = new ConnectedPeerRegistry();
        const xavierBus = new PeerMessageBus();

        async function connectXavierTo(label, listenerIdentity) {
            const listenerTransport = new LocalPeerConnectionProvider(`${label}-comparison`, network);
            const xavierTransport = new LocalPeerConnectionProvider(`xavier-to-${label}-comparison`, network);
            const listen = new ConnectToPeerUseCase({ peerConnectionProvider: listenerTransport, identityProvider: listenerIdentity });
            const stopListening = listen.listen();
            const connect = new ConnectToPeerUseCase({ peerConnectionProvider: xavierTransport, identityProvider: xavier, registry: xavierRegistry });
            const peer = connect.connect({ candidateEndpoint: `${label}-comparison` });
            await wait(20);
            assert(peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, `setup: Xavier authenticates to ${label}`);
            return { listenerTransport, xavierTransport, listen, stopListening, peer };
        }

        const aliceLink = await connectXavierTo('alice', alice);
        const bobLink = await connectXavierTo('bob', bob);
        const carolLink = await connectXavierTo('carol', carol);
        const daveLink = await connectXavierTo('dave', dave);

        const aliceStorage = new InMemoryStorageProvider();
        const aliceContentStore = new LocalContentStore(aliceStorage);
        const bobContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const carolContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const xavierContentStore = new LocalContentStore(new InMemoryStorageProvider());

        const xavierCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        // Alice publishes and holds the bytes; Carol independently holds
        // the identical bytes too. Bob knows OF the publication but holds
        // nothing. Dave is never given an answering exchange at all —
        // "unreachable," from Xavier's own point of view, in exactly the
        // way a peer running no possession-exchange service would be.
        const publication = await publishAndCatalog(alice, xavierCatalog, aliceContentStore, '{"snapshot":"harbor-district"}');
        await carolContentStore.put('{"snapshot":"harbor-district"}');

        const aliceCheck = new CheckLocalSnapshotContentAvailabilityUseCase(aliceContentStore);
        const bobCheck = new CheckLocalSnapshotContentAvailabilityUseCase(bobContentStore);
        const carolCheck = new CheckLocalSnapshotContentAvailabilityUseCase(carolContentStore);

        const aliceBus = new PeerMessageBus();
        const bobBus = new PeerMessageBus();
        const carolBus = new PeerMessageBus();

        const aliceExchange = new PublicationSnapshotPossessionPeerExchange(aliceCheck, aliceBus, aliceLink.listen.registry);
        const bobExchange = new PublicationSnapshotPossessionPeerExchange(bobCheck, bobBus, bobLink.listen.registry);
        const carolExchange = new PublicationSnapshotPossessionPeerExchange(carolCheck, carolBus, carolLink.listen.registry);
        // Dave's own listening side deliberately gets NO
        // PublicationSnapshotPossessionPeerExchange attached — a REQUEST
        // reaches his connection and nothing ever answers it.

        // Xavier's own single, shared exchange — attached to `xavierRegistry`,
        // which by now holds all four of Xavier's own authenticated
        // connections (Alice, Bob, Carol, Dave).
        const xavierExchange = new PublicationSnapshotPossessionPeerExchange(
            new CheckLocalSnapshotContentAvailabilityUseCase(xavierContentStore), xavierBus, xavierRegistry
        );
        const useCase = new ObservePeerSnapshotPossessionUseCase(xavierExchange, { timeoutMs: 2000 });
        const coordinator = new SnapshotPeerPossessionCoordinator(useCase);

        // A real, shared placement catalog — never touched by anything in
        // this section — proving the "no automatic placement" invariant
        // concretely, not merely by the coordinator's own constructor
        // signature.
        const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        function currentConvergence() {
            return derivePublicationSnapshotPlacementConvergence({
                publicationId: publication.id, placements: placementCatalog.findByPublicationId(publication.id)
            });
        }
        const convergenceBefore = JSON.stringify(currentConvergence());

        let history = [];

        // --- Xavier asks all four via observePeers(), a single explicit action ---
        const firstRound = await coordinator.observePeers({
            peers: [aliceLink.peer, bobLink.peer, carolLink.peer, daveLink.peer],
            publicationId: publication.id, contentHash: publication.contentReference.hash
        });
        assert(firstRound.length === 4, '1. observePeers() returns exactly one result per caller-supplied peer');
        assert(firstRound[0].state === SnapshotPeerPossessionState.AVAILABLE, '2. Alice reports AVAILABLE');
        assert(firstRound[1].state === SnapshotPeerPossessionState.NOT_AVAILABLE, '3. Bob reports NOT_AVAILABLE');
        assert(firstRound[2].state === SnapshotPeerPossessionState.AVAILABLE, '4. Carol also reports AVAILABLE');
        assert(firstRound[3].state === SnapshotPeerPossessionState.UNAVAILABLE, '5. Dave, who never answers, resolves honestly to UNAVAILABLE rather than hanging or rejecting');

        for (const observation of firstRound) {
            history = appendSnapshotPeerPossessionObservationHistoryEntry(history, observation);
        }
        assert(history.length === 4, '6. all four observations accumulated into one ordered history');

        const firstComparison = describeSnapshotPeerPossessionComparison(
            publication.id, publication.contentReference.hash,
            latestSnapshotPeerPossessionObservationsByPeer(history, { publicationId: publication.id, contentHash: publication.contentReference.hash })
        );
        assert(firstComparison.availableCount === 2 && firstComparison.notAvailableCount === 1 && firstComparison.unavailableCount === 1,
            '7. the comparison\'s own counts read exactly 2 available / 1 not available / 1 could-not-determine');

        // --- Neither answer created a placement; nothing was transferred to Xavier ---
        assert(placementCatalog.list().length === 0, '8. no PublicationSnapshotPlacement was ever created as a side effect of any answer');
        assert(JSON.stringify(currentConvergence()) === convergenceBefore, '9. the derived placement convergence is byte-identical to before the first round of observations');
        const xavierCheckAfterFirstRound = await new CheckLocalSnapshotContentAvailabilityUseCase(xavierContentStore).execute(publication);
        assert(xavierCheckAfterFirstRound.outcome === LocalSnapshotContentAvailabilityOutcome.NOT_AVAILABLE,
            '10. Xavier\'s own local possession remains NOT_AVAILABLE — observing four peers never transferred a single byte to him');

        // --- Alice's own bytes are now deleted; a SECOND, later check of her alone is made ---
        aliceStorage.remove('content:' + publication.contentReference.hash);
        await wait(5);
        const [secondAliceObservation] = await coordinator.observePeers({
            peers: [aliceLink.peer], publicationId: publication.id, contentHash: publication.contentReference.hash
        });
        assert(secondAliceObservation.state === SnapshotPeerPossessionState.NOT_AVAILABLE, '11. a fresh check of Alice now honestly reports NOT_AVAILABLE');
        history = appendSnapshotPeerPossessionObservationHistoryEntry(history, secondAliceObservation);

        assert(history.length === 5, '12. the history now holds FIVE entries — the second Alice observation was appended, not substituted for the first');
        assert(history[0].peerId === aliceLink.peer.connectionId && history[0].state === SnapshotPeerPossessionState.AVAILABLE,
            '13. INVARIANT: Alice\'s FIRST observation, still at its original position, still reads AVAILABLE — a frozen fact about the past');

        const secondComparison = describeSnapshotPeerPossessionComparison(
            publication.id, publication.contentReference.hash,
            latestSnapshotPeerPossessionObservationsByPeer(history, { publicationId: publication.id, contentHash: publication.contentReference.hash })
        );
        assert(secondComparison.availableCount === 1 && secondComparison.notAvailableCount === 2 && secondComparison.unavailableCount === 1,
            '14. the RECOMPUTED comparison now reflects Alice\'s NEWEST answer (1 available / 2 not available / 1 could-not-determine) — the current display is derived from the latest observation per peer, not the first');

        // --- Still no placement, still byte-identical convergence, still nothing transferred ---
        assert(placementCatalog.list().length === 0, '15. still no placement exists after the second observation either');
        assert(JSON.stringify(currentConvergence()) === convergenceBefore, '16. the derived placement convergence remains byte-identical even after Alice\'s possession changed and was re-observed');
        const xavierCheckAfterSecondRound = await new CheckLocalSnapshotContentAvailabilityUseCase(xavierContentStore).execute(publication);
        assert(xavierCheckAfterSecondRound.outcome === LocalSnapshotContentAvailabilityOutcome.NOT_AVAILABLE, '17. Xavier\'s own local possession is STILL NOT_AVAILABLE — five accumulated observations, zero bytes obtained');

        aliceExchange.dispose(); bobExchange.dispose(); carolExchange.dispose();
        xavierExchange.dispose();
        for (const link of [aliceLink, bobLink, carolLink, daveLink]) {
            link.stopListening();
            link.listenerTransport.dispose();
            link.xavierTransport.dispose();
        }
    }
    console.log('✓ Section D: FLAGSHIP — Xavier asks Alice, Bob, Carol, and Dave via observePeers() over real live connections (AVAILABLE/NOT_AVAILABLE/AVAILABLE/UNAVAILABLE), accumulates a non-overwriting five-entry history across two rounds, the recomputed comparison always reflects only the latest observation per peer, while placement convergence stays byte-identical throughout and Xavier\'s own content store never receives a single byte');

    console.log('\nAll Peer Snapshot Possession Comparison & Observation History tests passed.');
}

run().catch((error) => {
    console.error('SnapshotPeerPossessionObservationHistory.test.js FAILED:', error);
    process.exitCode = 1;
});
