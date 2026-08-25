import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';
import { Structure } from '../core/Structure.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { derivePublicationSnapshotPlacementConvergence } from '../application/PublicationSnapshotPlacementConvergence.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { PublicationSnapshotPlacementExchange } from '../application/PublicationSnapshotPlacementExchange.js';
import { PublicationSnapshotPlacementPeerExchange } from '../application/PublicationSnapshotPlacementPeerExchange.js';
import { PublicationSnapshotPlacementDiscoveryCoordinator } from '../application/PublicationSnapshotPlacementDiscoveryCoordinator.js';
import { AddPublicationSnapshotPlacementUseCase } from '../application/AddPublicationSnapshotPlacementUseCase.js';
import { ImportPackageSnapshotPlacementsUseCase } from '../application/ImportPackageSnapshotPlacementsUseCase.js';
import { buildBlueprintPackage } from '../application/BlueprintPackage.js';
import { validateBlueprintPackage } from '../application/BlueprintImportValidator.js';
import { createResolutionObservation } from '../application/SnapshotPlacementResolutionObservation.js';
import { SnapshotPlacementResolutionOutcome } from '../application/SnapshotPlacementResolutionOutcome.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';

// 0.8.23 — Multi-Placement Convergence & Relationship UX.
//
//   Section A: derivePublicationSnapshotPlacementConvergence() argument
//              handling — requires a publicationId, tolerates no
//              placements, ignores placements naming a DIFFERENT
//              publicationId, dedups by placement id, and is
//              order-independent (same set -> byte-identical result
//              regardless of input order)
//   Section B: complete agreement, conflicting content binding, storage
//              diversity, locator diversity, and duplicate placement
//              knowledge
//   Section C: FLAGSHIP — Alice creates a Publication P (hash H) and
//              three signed placements (IPFS/CID-A, IPFS/CID-B,
//              Local/local-X, all claiming H). Bob acquires the three
//              through THREE DIFFERENT ROUTES — a live peer ANNOUNCE, a
//              Blueprint Package import, and a direct local add — while
//              Carol independently creates a FOURTH placement claiming a
//              DIFFERENT content hash. Historical peer discovery then
//              converges all three replicas onto the identical
//              four-placement set (NETWORK CONVERGENCE, mirroring
//              0.8.5/0.8.6's own three-replica anchor flagship, one
//              domain over); every replica's own derived convergence
//              reports the SAME conflict — {A,B,C} vs. D, honestly 3-vs-1
//              — WITHOUT any of them ever deciding Alice's three claims
//              beat Carol's one (EVIDENCE NON-ADJUDICATION). A second act
//              then proves the milestone's other central claim: Bob
//              resolves all four placements to four DIFFERENT outcomes
//              (RESOLVED, STORE_UNAVAILABLE, CONTENT_HASH_MISMATCH, and
//              one left unresolved), and his derived convergence result
//              is byte-identical before and after — RESOLUTION
//              OBSERVATION NEVER REACHES CONVERGENCE AT ALL (this file
//              has no parameter for it in the first place).
//
// See docs/Principles.md, "Evidence Relationships Are Derived, Never
// Adjudicated (0.8.6)," and "Multi-Placement Convergence Is Independent
// Of Resolution Observation (0.8.23)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, message);
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
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

function signPlacement(identityProvider, fields) {
    let placement = new PublicationSnapshotPlacement({
        ...fields,
        placerIdentity: identityProvider.getSigningIdentity().toJSON()
    });
    placement = placement.withSignature(identityProvider.signCanonical(placement.getSigningDescriptor()));
    return placement;
}

function makePlacementReplica() {
    const catalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
    const verifier = new LocalAuthorizationVerifier();
    const exchange = new PublicationSnapshotPlacementExchange(catalog, verifier);
    return { catalog, exchange };
}

function fakePlacement(id, publicationId, contentHash, storage, locator) {
    return { id, publicationId, contentHash, storage, locator };
}

function brick(definitionId, x, y, z) {
    return new Brick({ definitionId, position: new Position(x, y, z) });
}

function farmstead() {
    return new Structure({
        id: 'farmstead-1', name: 'Farmstead', category: 'Architecture', description: 'A cozy farmstead.',
        bricks: [brick('core:wall_1x3', 0, 0, 0)]
    });
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — argument handling
    // ---------------------------------------------------------------
    {
        expectThrows(() => derivePublicationSnapshotPlacementConvergence({}), '1. requires a publicationId');
        expectThrows(() => derivePublicationSnapshotPlacementConvergence({ publicationId: '  ' }), '2. rejects a blank publicationId');

        const empty = derivePublicationSnapshotPlacementConvergence({ publicationId: 'pub-empty' });
        assert(empty.placementCount === 0, '3. no placements supplied -> placementCount is 0');
        assert(empty.storageTypes.length === 0 && empty.placements.length === 0, '4. no placements supplied -> empty arrays, never an error');
        assert(empty.locatorCount === 0, '5. no placements -> no locators');
        assert(empty.contentBindingConflict === false, '6. no placements -> no conflict');

        const mixed = derivePublicationSnapshotPlacementConvergence({
            publicationId: 'pub-target',
            placements: [
                fakePlacement('p1', 'pub-target', 'hash-x', 'ipfs', 'cid-a'),
                fakePlacement('p2', 'pub-other', 'hash-y', 'ipfs', 'cid-b')
            ]
        });
        assert(mixed.placementCount === 1 && mixed.placements[0].placementId === 'p1',
            '7. a placement naming a DIFFERENT publicationId is silently excluded, never counted');

        const duplicated = derivePublicationSnapshotPlacementConvergence({
            publicationId: 'pub-dup',
            placements: [
                fakePlacement('p1', 'pub-dup', 'hash-x', 'ipfs', 'cid-a'),
                fakePlacement('p1', 'pub-dup', 'hash-x', 'ipfs', 'cid-a')
            ]
        });
        assert(duplicated.placementCount === 1, '8. the same placement id appearing twice in the input is counted once — one placement identity, not two pieces of knowledge');

        const forward = derivePublicationSnapshotPlacementConvergence({
            publicationId: 'pub-order',
            placements: [fakePlacement('z', 'pub-order', 'h', 'ipfs', 'cid-z'), fakePlacement('a', 'pub-order', 'h', 'ipfs', 'cid-a')]
        });
        const reversed = derivePublicationSnapshotPlacementConvergence({
            publicationId: 'pub-order',
            placements: [fakePlacement('a', 'pub-order', 'h', 'ipfs', 'cid-a'), fakePlacement('z', 'pub-order', 'h', 'ipfs', 'cid-z')]
        });
        assert(JSON.stringify(forward) === JSON.stringify(reversed),
            '9. the identical underlying set produces a byte-identical result regardless of input order');
        assert(forward.placements[0].placementId === 'a' && forward.placements[1].placementId === 'z',
            '10. the placements array is sorted by placementId, never by input/arrival order');
    }
    console.log('✓ Section A: derivePublicationSnapshotPlacementConvergence() argument handling — publicationId required, empty input tolerated, cross-publication placements excluded, duplicates deduped, order-independent');

    // ---------------------------------------------------------------
    // Section B — named scenarios
    // ---------------------------------------------------------------
    {
        // Scenario A — complete agreement: three placements, all bound to
        // the same publicationId/contentHash. No conflict.
        const agreement = derivePublicationSnapshotPlacementConvergence({
            publicationId: 'pub-agree',
            placements: [
                fakePlacement('a', 'pub-agree', 'hash-h', 'ipfs', 'cid-a'),
                fakePlacement('b', 'pub-agree', 'hash-h', 'ipfs', 'cid-b'),
                fakePlacement('c', 'pub-agree', 'hash-h', 'local', 'local-x')
            ]
        });
        assert(agreement.placementCount === 3, '1. Scenario A: three independent placements counted');
        assert(agreement.contentBindingConflict === false, '2. Scenario A: no binding conflict when every placement agrees');
        assert(agreement.contentHashGroups.length === 1 && agreement.contentHashGroups[0].placementIds.length === 3,
            '3. Scenario A: a single content-hash group containing all three placements');

        // Scenario B — conflicting content binding: two placements, two
        // different contentHash values. Conflict IS detected. Neither
        // placement is ever declared correct or incorrect.
        const conflict = derivePublicationSnapshotPlacementConvergence({
            publicationId: 'pub-conflict',
            placements: [
                fakePlacement('a', 'pub-conflict', 'hash-h1', 'ipfs', 'cid-a'),
                fakePlacement('b', 'pub-conflict', 'hash-h2', 'local', 'local-b')
            ]
        });
        assert(conflict.contentBindingConflict === true, '4. Scenario B: a conflict IS detected between two disagreeing placements');
        assert(conflict.contentHashGroups.length === 2, '5. Scenario B: two distinct content-hash groups reported');
        assert(!('correct' in conflict) && !('winner' in conflict) && !('invalid' in conflict),
            '6. Scenario B: the result contains no field naming either placement correct or incorrect');

        // Scenario C — storage diversity: three placements, all agreeing,
        // spread across three DIFFERENT storage backends — a fact with no
        // natural equivalent on the anchor side.
        const storageDiversity = derivePublicationSnapshotPlacementConvergence({
            publicationId: 'pub-storage',
            placements: [
                fakePlacement('a', 'pub-storage', 'hash-h', 'ipfs', 'cid-a'),
                fakePlacement('b', 'pub-storage', 'hash-h', 'arweave', 'ar-tx-b'),
                fakePlacement('c', 'pub-storage', 'hash-h', 'local', 'local-c')
            ]
        });
        assert(storageDiversity.storageTypes.length === 3, '7. Scenario C: three distinct storage backends reported');
        assert(JSON.stringify(storageDiversity.storageTypes) === JSON.stringify([...storageDiversity.storageTypes].sort()),
            '8. Scenario C: storageTypes is a plain sorted list, never an ordered ranking');

        // Scenario D — locator diversity: two placements on the SAME
        // storage backend but different locators — a second, independent
        // axis from storage diversity.
        const locatorDiversity = derivePublicationSnapshotPlacementConvergence({
            publicationId: 'pub-locator',
            placements: [
                fakePlacement('a', 'pub-locator', 'hash-h', 'ipfs', 'cid-a'),
                fakePlacement('b', 'pub-locator', 'hash-h', 'ipfs', 'cid-b')
            ]
        });
        assert(locatorDiversity.storageTypes.length === 1, '9. Scenario D: one storage backend');
        assert(locatorDiversity.locatorCount === 2, '10. Scenario D: two distinct locators on that one storage backend');

        // Scenario E — duplicate placement knowledge: the identical
        // placement known via two different routes collapses to ONE
        // entry, not two.
        const placementInstance = fakePlacement('dup-1', 'pub-dup-placement', 'hash-h', 'ipfs', 'cid-dup');
        const duplicateKnowledge = derivePublicationSnapshotPlacementConvergence({
            publicationId: 'pub-dup-placement',
            placements: [placementInstance, { ...placementInstance }]
        });
        assert(duplicateKnowledge.placementCount === 1, '11. Scenario E: one placement identity known through two routes is one placement, never two pieces of knowledge');
    }
    console.log('✓ Section B: named scenarios — complete agreement, conflicting content binding (detected, never adjudicated), storage diversity, locator diversity, duplicate placement knowledge (collapses to one)');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP
    // ---------------------------------------------------------------
    {
        const network = new LocalPeerNetwork();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carol = makeIdentity('Carol');

        const aliceTransport = new LocalPeerConnectionProvider('alice-placement', network);
        const bobTransport = new LocalPeerConnectionProvider('bob-placement', network);
        const carolTransport = new LocalPeerConnectionProvider('carol-placement', network);

        const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        const stopAliceListening = aliceConnect.listen();
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const stopBobListening = bobConnect.listen();
        const bobToAlice = bobConnect.connect({ candidateEndpoint: 'alice-placement' });
        const carolConnect = new ConnectToPeerUseCase({ peerConnectionProvider: carolTransport, identityProvider: carol });
        const carolToAlice = carolConnect.connect({ candidateEndpoint: 'alice-placement' });
        const carolToBob = carolConnect.connect({ candidateEndpoint: 'bob-placement' });

        await wait(20);
        assert(bobToAlice.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '1. setup: Bob<->Alice authenticates');
        assert(carolToAlice.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '2. setup: Carol<->Alice authenticates');
        assert(carolToBob.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '3. setup: Carol<->Bob authenticates');

        const bobIdentityId = bob.getSigningIdentity().id;
        const carolIdentityId = carol.getSigningIdentity().id;
        const aliceToBob = aliceConnect.registry.list().find((c) => c.remoteIdentity && c.remoteIdentity.identityId === bobIdentityId);
        const aliceToCarol = aliceConnect.registry.list().find((c) => c.remoteIdentity && c.remoteIdentity.identityId === carolIdentityId);
        const bobToCarol = bobConnect.registry.list().find((c) => c.remoteIdentity && c.remoteIdentity.identityId === carolIdentityId);

        const { catalog: aliceCatalog, exchange: aliceExchange } = makePlacementReplica();
        const aliceBus = new PeerMessageBus();
        const alicePeerExchange = new PublicationSnapshotPlacementPeerExchange(aliceExchange, aliceBus, aliceConnect.registry);
        const aliceCoordinator = new PublicationSnapshotPlacementDiscoveryCoordinator(alicePeerExchange);

        const { catalog: bobCatalog, exchange: bobExchange } = makePlacementReplica();
        const bobBus = new PeerMessageBus();
        const bobPeerExchange = new PublicationSnapshotPlacementPeerExchange(bobExchange, bobBus, bobConnect.registry);
        const bobCoordinator = new PublicationSnapshotPlacementDiscoveryCoordinator(bobPeerExchange);

        const { catalog: carolCatalog, exchange: carolExchange } = makePlacementReplica();
        const carolBus = new PeerMessageBus();
        const carolPeerExchange = new PublicationSnapshotPlacementPeerExchange(carolExchange, carolBus, carolConnect.registry);
        const carolCoordinator = new PublicationSnapshotPlacementDiscoveryCoordinator(carolPeerExchange);

        const PUBLICATION_ID = 'pub-flagship-placement';
        const EXPECTED_HASH = 'hash-flagship-h';
        const CONTRADICTING_HASH = 'hash-flagship-h2';

        // Alice creates three placements for her own publication — two
        // on IPFS (different CIDs), one local — all claiming the exact
        // same content hash.
        const placementA = signPlacement(alice, { publicationId: PUBLICATION_ID, contentHash: EXPECTED_HASH, storage: 'ipfs', locator: 'ipfs://CID-A' });
        const placementB = signPlacement(alice, { publicationId: PUBLICATION_ID, contentHash: EXPECTED_HASH, storage: 'ipfs', locator: 'ipfs://CID-B' });
        const placementC = signPlacement(alice, { publicationId: PUBLICATION_ID, contentHash: EXPECTED_HASH, storage: 'local', locator: 'local://snapshot-x' });
        // Carol independently creates a FOURTH placement claiming a
        // DIFFERENT content hash — structurally inconsistent with A/B/C,
        // never treated as forged or malicious.
        const placementD = signPlacement(carol, { publicationId: PUBLICATION_ID, contentHash: CONTRADICTING_HASH, storage: 'ipfs', locator: 'ipfs://CID-D' });

        aliceExchange.importPlacement(placementA.toJSON());

        // --- Bob acquires A, B, and C through THREE DIFFERENT ROUTES ---
        // Route 1: a live peer ANNOUNCE, exactly as application/
        // PublicationSnapshotPlacementPeerExchange.js#announce() already
        // works (0.8.19, unchanged).
        alicePeerExchange.announce(placementA);
        await wait(20);
        assert(bobCatalog.has(placementA.id), '4. setup: Bob acquires Placement A via a live peer ANNOUNCE');
        // announce() broadcasts to EVERY currently authenticated peer
        // (this class's own header, unchanged since 0.8.19) — Carol,
        // also connected to Alice, receives A the identical way. That is
        // exactly as legitimate an acquisition route as Bob's; this
        // flagship's own point is that ALL of A/B/C/D end up known to
        // all three replicas regardless of which route first delivered
        // each one, never that any one route is reserved for any one
        // replica.
        assert(carolCatalog.has(placementA.id), '4b. setup: Carol, also connected to Alice, receives Placement A via the identical broadcast ANNOUNCE');

        // Route 2: a Blueprint Package import, exactly as application/
        // ImportPackageSnapshotPlacementsUseCase.js already works
        // (0.8.22, unchanged).
        const pkg = buildBlueprintPackage(farmstead(), { placements: [placementB] });
        validateBlueprintPackage(pkg);
        const bobImportPackagePlacements = new ImportPackageSnapshotPlacementsUseCase(bobExchange);
        const packageResult = bobImportPackagePlacements.execute(pkg);
        assert(packageResult.importedPlacements.length === 1, '5. setup: Bob acquires Placement B via a Blueprint Package import');

        // Route 3: a direct local add — application/
        // AddPublicationSnapshotPlacementUseCase.js (0.8.18, unchanged),
        // the "already trusted some other way" path, never a peer or
        // package boundary at all.
        const bobAddLocally = new AddPublicationSnapshotPlacementUseCase(bobCatalog);
        bobAddLocally.execute(placementC.toJSON());
        assert(bobCatalog.has(placementC.id), '6. setup: Bob acquires Placement C via a direct local add');

        // Carol creates her own, independently — no route needed beyond
        // her own local knowledge.
        carolExchange.importPlacement(placementD.toJSON());

        assert(aliceCatalog.findByPublicationId(PUBLICATION_ID).length === 1, '7. setup: Alice starts knowing only A');
        assert(bobCatalog.findByPublicationId(PUBLICATION_ID).length === 3, '8. setup: Bob starts knowing A, B, and C');
        assert(carolCatalog.findByPublicationId(PUBLICATION_ID).length === 2, '9. setup: Carol starts knowing A (via broadcast ANNOUNCE) and D (her own)');

        // Historical discovery/synchronization — 0.8.19's own mechanism,
        // completely unchanged. Each replica asks every peer it has, in
        // two rounds so knowledge that only propagates transitively in
        // round one (e.g. Carol learning B/C through Bob) finishes
        // spreading in round two.
        await aliceCoordinator.discoverFromPeers(PUBLICATION_ID, [aliceToBob, aliceToCarol].filter(Boolean), { timeoutMs: 200 });
        await bobCoordinator.discoverFromPeers(PUBLICATION_ID, [bobToAlice, bobToCarol].filter(Boolean), { timeoutMs: 200 });
        await carolCoordinator.discoverFromPeers(PUBLICATION_ID, [carolToAlice, carolToBob].filter(Boolean), { timeoutMs: 200 });
        await aliceCoordinator.discoverFromPeers(PUBLICATION_ID, [aliceToBob, aliceToCarol].filter(Boolean), { timeoutMs: 200 });
        await bobCoordinator.discoverFromPeers(PUBLICATION_ID, [bobToAlice, bobToCarol].filter(Boolean), { timeoutMs: 200 });
        await carolCoordinator.discoverFromPeers(PUBLICATION_ID, [carolToAlice, carolToBob].filter(Boolean), { timeoutMs: 200 });

        // --- NETWORK CONVERGENCE ---
        // all three replicas now hold the identical SET of four claims.
        assert(aliceCatalog.findByPublicationId(PUBLICATION_ID).length === 4
            && bobCatalog.findByPublicationId(PUBLICATION_ID).length === 4
            && carolCatalog.findByPublicationId(PUBLICATION_ID).length === 4,
            '10. NETWORK CONVERGENCE: all three replicas converge on the identical set of four placements, regardless of which of the three acquisition routes first brought each one in');

        const aliceView = derivePublicationSnapshotPlacementConvergence({
            publicationId: PUBLICATION_ID,
            placements: aliceCatalog.findByPublicationId(PUBLICATION_ID)
        });
        const bobView = derivePublicationSnapshotPlacementConvergence({
            publicationId: PUBLICATION_ID,
            placements: bobCatalog.findByPublicationId(PUBLICATION_ID)
        });
        const carolView = derivePublicationSnapshotPlacementConvergence({
            publicationId: PUBLICATION_ID,
            placements: carolCatalog.findByPublicationId(PUBLICATION_ID)
        });

        // Each replica derives the SAME structural picture from its own
        // converged catalog — a pure function of the (now identical)
        // placement set, so all three agree byte-for-byte with no
        // coordination between them.
        assert(JSON.stringify(aliceView) === JSON.stringify(bobView)
            && JSON.stringify(bobView) === JSON.stringify(carolView),
            '11. all three replicas\' independently derived convergence results are byte-identical — a pure function of the converged set, computed with no coordination between them');
        assert(aliceView.placementCount === 4, '12. four independent placements known');
        assert(JSON.stringify(aliceView.storageTypes) === JSON.stringify(['ipfs', 'local']), '13. two distinct storage backends, none ranked over the other');
        assert(aliceView.locatorCount === 4, '14. four distinct locators, one per placement');

        // --- EVIDENCE NON-ADJUDICATION (AGREEMENT? NO. CONFLICT? YES.) ---
        assert(aliceView.contentBindingConflict === true,
            '15. the content-binding conflict between {A,B,C} and D IS detected by every replica — AGREEMENT? NO. CONFLICT? YES.');
        assert(aliceView.contentHashGroups.length === 2, '16. two distinct content-hash groups reported');
        const majorityGroup = aliceView.contentHashGroups.find((g) => g.contentHash === EXPECTED_HASH);
        const minorityGroup = aliceView.contentHashGroups.find((g) => g.contentHash === CONTRADICTING_HASH);
        assert(majorityGroup.placementIds.length === 3 && minorityGroup.placementIds.length === 1,
            '17. the true, honest group sizes are reported (three vs. one) — never rounded, hidden, or reframed');
        // Carol's single placement is never dropped, quarantined, or
        // excluded from placementCount for disagreeing with Alice's
        // three, and Alice's three are never declared "the" answer
        // merely for outnumbering Carol's one.
        assert(aliceView.placements.some((entry) => entry.placementId === placementD.id),
            '18. Placement D remains a first-class member of the known-placement set despite the conflict it participates in');
        const serialized = JSON.stringify(aliceView);
        assert(!/authorit|trust|winner|consensus|correct|malicious|reject|best|preferred|confident|likely|canonical/i.test(serialized),
            '19. no adjudicating language or field anywhere in the derived result — no authority, trust, winner, consensus, correctness, rejection, "best," "preferred," "confident," "likely," or "canonical" verdict — Alice\'s three claims never declared to beat Carol\'s one');

        // --- A SECOND ACT: resolution observations never reach
        // convergence at all. ---
        // Bob independently resolves all four placements to four
        // DIFFERENT outcomes — this milestone's own design conversation
        // named exactly this spread.
        const bobConvergenceBeforeResolution = derivePublicationSnapshotPlacementConvergence({
            publicationId: PUBLICATION_ID,
            placements: bobCatalog.findByPublicationId(PUBLICATION_ID)
        });
        const resolutionObservations = {
            [placementA.id]: createResolutionObservation({ placementId: placementA.id, outcome: SnapshotPlacementResolutionOutcome.RESOLVED }),
            [placementB.id]: createResolutionObservation({ placementId: placementB.id, outcome: SnapshotPlacementResolutionOutcome.STORE_UNAVAILABLE }),
            [placementC.id]: createResolutionObservation({ placementId: placementC.id, outcome: SnapshotPlacementResolutionOutcome.CONTENT_HASH_MISMATCH })
            // Placement D deliberately left unresolved — NOT_RESOLVED,
            // never forced into an outcome it never received.
        };
        assert(Object.keys(resolutionObservations).length === 3
            && !(placementD.id in resolutionObservations),
            '20. setup: three placements resolved to three different outcomes, one (D) deliberately left unresolved');

        // Recomputing convergence over the IDENTICAL placement set — this
        // milestone's own derivation function has no parameter capable
        // of accepting `resolutionObservations` at all, so the only way
        // this assertion could ever fail is if some future change smuggled
        // a resolution-shaped input into it.
        const bobConvergenceAfterResolution = derivePublicationSnapshotPlacementConvergence({
            publicationId: PUBLICATION_ID,
            placements: bobCatalog.findByPublicationId(PUBLICATION_ID)
        });
        assert(JSON.stringify(bobConvergenceBeforeResolution) === JSON.stringify(bobConvergenceAfterResolution),
            '21. INVARIANT: the convergence result is byte-identical before and after Bob resolves every placement he knows — RESOLVED, STORE_UNAVAILABLE, CONTENT_HASH_MISMATCH, and one left unresolved change nothing about the structural relationship among the underlying claims');
        assert(bobConvergenceAfterResolution.contentBindingConflict === true,
            '22. the conflict finding itself is unaffected by resolution — Bob resolving Placement A to RESOLVED never demotes Placement D\'s conflicting claim, and Bob resolving Placement C to CONTENT_HASH_MISMATCH never retroactively excludes it from the content-hash group it structurally belongs to');

        alicePeerExchange.dispose();
        bobPeerExchange.dispose();
        carolPeerExchange.dispose();
        stopAliceListening();
        stopBobListening();
        aliceTransport.dispose();
        bobTransport.dispose();
        carolTransport.dispose();
    }
    console.log('✓ Section C: FLAGSHIP — Alice creates three agreeing placements; Bob acquires them via three different routes (live peer ANNOUNCE, Blueprint Package import, direct local add) while Carol independently creates a fourth, conflicting placement; historical peer discovery converges all three replicas onto the identical four-placement set (NETWORK CONVERGENCE); every replica independently derives the same honest 3-vs-1 conflict with no winner declared (EVIDENCE NON-ADJUDICATION); Bob then resolves all four placements to four different outcomes and his derived convergence result stays byte-identical throughout (RESOLUTION OBSERVATION NEVER REACHES CONVERGENCE)');

    console.log('\nAll Publication Snapshot Placement Convergence tests passed.');
}

run().catch((error) => {
    console.error('PublicationSnapshotPlacementConvergence.test.js FAILED:', error);
    process.exitCode = 1;
});
