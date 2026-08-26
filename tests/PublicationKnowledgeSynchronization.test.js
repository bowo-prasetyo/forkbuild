import { PublicationKnowledgeSynchronizationCoordinator } from '../application/PublicationKnowledgeSynchronizationCoordinator.js';
import { CreatePublicationKnowledgeSynchronizationCoordinatorUseCase } from '../application/CreatePublicationKnowledgeSynchronizationCoordinatorUseCase.js';
import { PublicationKnowledgeSynchronizationUiState } from '../application/PublicationKnowledgeSynchronizationUiState.js';
import { describeSynchronizationAttempt, describeSynchronizationButtonLabel } from '../application/PublicationKnowledgeSynchronizationView.js';
import { LocalPublicationAnchorCatalog } from '../application/LocalPublicationAnchorCatalog.js';
import { PublicationAnchorExchange } from '../application/PublicationAnchorExchange.js';
import { PublicationAnchorPeerExchange } from '../application/PublicationAnchorPeerExchange.js';
import { PublicationAnchorDiscoveryCoordinator } from '../application/PublicationAnchorDiscoveryCoordinator.js';
import { LocalAnchorKnowledgeStore } from '../application/LocalAnchorKnowledgeStore.js';
import { AnchorAcquisitionKind } from '../application/AnchorAcquisitionKind.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { PublicationSnapshotPlacementExchange } from '../application/PublicationSnapshotPlacementExchange.js';
import { PublicationSnapshotPlacementPeerExchange } from '../application/PublicationSnapshotPlacementPeerExchange.js';
import { PublicationSnapshotPlacementDiscoveryCoordinator } from '../application/PublicationSnapshotPlacementDiscoveryCoordinator.js';
import { LocalPlacementKnowledgeStore } from '../application/LocalPlacementKnowledgeStore.js';
import { PlacementAcquisitionKind } from '../application/PlacementAcquisitionKind.js';
import { buildPublicationReplicaPackage } from '../application/PublicationReplicaPackage.js';
import { ImportPublicationReplicaPackageUseCase } from '../application/ImportPublicationReplicaPackageUseCase.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { PublicationExchange } from '../application/PublicationExchange.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { ContentReference } from '../core/ContentReference.js';
import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';
import { derivePublicationEvidenceConvergence } from '../application/PublicationEvidenceConvergence.js';
import { publicationEvidenceConvergenceView } from '../application/PublicationEvidenceConvergenceView.js';
import { ContentBindingSetRelationship } from '../application/ContentBindingSetRelationship.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';

// 0.8.30 — Explicit Replica Knowledge Synchronization.
//
//   Section A: constructor requirements.
//   Section B: PublicationKnowledgeSynchronizationCoordinator#synchronize()
//              against stub discovery coordinators — peer selection is
//              "every currently AUTHENTICATED peer, in registry order",
//              both dimensions are asked with the IDENTICAL peer array,
//              zero peers resolves cleanly, and newlyImportedCount/
//              alreadyKnownCount are a plain tally of each dimension's
//              own isNew flags.
//   Section C: describeSynchronizationAttempt()/
//              describeSynchronizationButtonLabel() — the five UI
//              states, worded so NO_NEW_CLAIMS is never confused with
//              "no claims exist" and UNAVAILABLE is never confused with
//              either.
//   Section D: FLAGSHIP — CONVERGENCE ACROSS BOTH DIMENSIONS IN ONE
//              CALL. Alice knows Anchor A/Placement X, Bob knows Anchor
//              B/Placement Y, Carol knows neither. Alice and Bob each
//              synchronize once against each other and fully converge on
//              both dimensions; Carol then synchronizes ONCE against Bob
//              alone and receives everything Bob independently knows —
//              including what Bob himself only just learned from Alice —
//              without ever talking to Alice directly. Re-synchronizing
//              reports zero new claims. Every claim Carol receives is
//              recorded PEER, never a new acquisition kind, and Carol's
//              own verification/resolution state for every claim starts
//              completely unestablished — synchronization transfers
//              claims, never observations about them.
//   Section E: INVARIANT — FIRST-SEEN-WINS holds across the package/sync
//              boundary through the NEW coordinator, exactly as it
//              already holds for the raw peer-exchange classes (0.8.17/
//              0.8.24/0.8.29): a claim Dave already holds via PACKAGE
//              stays PACKAGE after synchronize() re-delivers the
//              IDENTICAL claim over a live peer connection.
//   Section F: INVARIANT — conflicting claims land without adjudication.
//              Alice and Bob each independently sign a DIFFERENT anchor
//              naming the SAME publicationId but a DIFFERENT
//              contentHash. Synchronizing catalogs BOTH, symmetrically,
//              regardless of which replica initiates; each replica's own
//              convergence view independently reports CONFLICT — this
//              coordinator computes no diff, no ranking, and no
//              preference between them.
//
// See docs/Principles.md, "Replica Synchronization Composes Existing
// Discovery, It Builds No Second Trust Boundary (0.8.30)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, message);
}

async function expectRejects(promise, message) {
    let threw = false;
    try { await promise; } catch (e) { threw = true; }
    assert(threw, message);
}

function wait(ms = 30) {
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

function signAnchor(identityProvider, fields) {
    let anchor = new PublicationAnchor({ ...fields, anchorIdentity: identityProvider.getSigningIdentity().toJSON() });
    anchor = anchor.withSignature(identityProvider.signCanonical(anchor.getSigningDescriptor()));
    return anchor;
}

function signPlacement(identityProvider, fields) {
    let placement = new PublicationSnapshotPlacement({ ...fields, placerIdentity: identityProvider.getSigningIdentity().toJSON() });
    placement = placement.withSignature(identityProvider.signCanonical(placement.getSigningDescriptor()));
    return placement;
}

function signPublication(identityProvider, fields) {
    let publication = new DecentralizedPublication({ ...fields, publisherIdentity: identityProvider.getSigningIdentity().toJSON() });
    publication = publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
    return publication;
}

// A fully-wired "replica" for the flagship: its own catalogs, exchanges,
// knowledge stores, live peer-message buses (one per domain — the same
// two independently namespaced protocols application/
// PublicationAnchorPeerExchange.js/application/
// PublicationSnapshotPlacementPeerExchange.js already keep separate),
// and this milestone's own PublicationKnowledgeSynchronizationCoordinator
// sitting on top, all over the SAME `connectedPeerRegistry` a live
// ConnectToPeerUseCase produces.
function makeReplica(connectedPeerRegistry) {
    const anchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
    const anchorExchange = new PublicationAnchorExchange(anchorCatalog, new LocalAuthorizationVerifier());
    const anchorKnowledge = new LocalAnchorKnowledgeStore(new InMemoryStorageProvider());
    const anchorBus = new PeerMessageBus();
    const anchorPeerExchange = new PublicationAnchorPeerExchange(anchorExchange, anchorBus, connectedPeerRegistry, { knowledgeStore: anchorKnowledge });
    const anchorDiscovery = new PublicationAnchorDiscoveryCoordinator(anchorPeerExchange);

    const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
    const placementExchange = new PublicationSnapshotPlacementExchange(placementCatalog, new LocalAuthorizationVerifier());
    const placementKnowledge = new LocalPlacementKnowledgeStore(new InMemoryStorageProvider());
    const placementBus = new PeerMessageBus();
    const placementPeerExchange = new PublicationSnapshotPlacementPeerExchange(placementExchange, placementBus, connectedPeerRegistry, { knowledgeStore: placementKnowledge });
    const placementDiscovery = new PublicationSnapshotPlacementDiscoveryCoordinator(placementPeerExchange);

    const { coordinator: syncCoordinator } = new CreatePublicationKnowledgeSynchronizationCoordinatorUseCase().execute({
        anchorDiscoveryCoordinator: anchorDiscovery,
        placementDiscoveryCoordinator: placementDiscovery,
        connectedPeerRegistry
    });

    return {
        anchorCatalog, anchorExchange, anchorKnowledge, anchorPeerExchange,
        placementCatalog, placementExchange, placementKnowledge, placementPeerExchange,
        syncCoordinator,
        dispose() { anchorPeerExchange.dispose(); placementPeerExchange.dispose(); }
    };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — constructor requirements
    // ---------------------------------------------------------------
    {
        const fakeDiscovery = { discoverFromPeers: async () => ({ publicationId: 'x', attemptedPeers: [], discovered: [] }) };
        const fakeRegistry = { list: () => [] };
        expectThrows(() => new PublicationKnowledgeSynchronizationCoordinator(null, fakeDiscovery, fakeRegistry), '1. an anchorDiscoveryCoordinator is required');
        expectThrows(() => new PublicationKnowledgeSynchronizationCoordinator(fakeDiscovery, null, fakeRegistry), '2. a placementDiscoveryCoordinator is required');
        expectThrows(() => new PublicationKnowledgeSynchronizationCoordinator(fakeDiscovery, fakeDiscovery, null), '3. a connectedPeerRegistry is required');
        const coordinator = new PublicationKnowledgeSynchronizationCoordinator(fakeDiscovery, fakeDiscovery, fakeRegistry);
        await expectRejects(coordinator.synchronize(), '4. synchronize() requires a publicationId');
    }
    console.log('✓ Section A: constructor requirements');

    // ---------------------------------------------------------------
    // Section B — synchronize() against stub discovery coordinators
    // ---------------------------------------------------------------
    {
        function makePeer(id, authenticated) {
            return { id, getLifecycleState: () => (authenticated ? PeerLifecycleState.AUTHENTICATED : PeerLifecycleState.CONNECTING) };
        }
        const authPeer = makePeer('auth', true);
        const unauthPeer = makePeer('unauth', false);
        const registry = { list: () => [authPeer, unauthPeer] };

        const anchorCalls = [];
        const placementCalls = [];
        const anchorStub = {
            discoverFromPeers: async (publicationId, peers, options) => {
                anchorCalls.push({ publicationId, peers, options });
                return { publicationId, attemptedPeers: peers, discovered: [{ anchor: { id: 'a1' }, isNew: true }, { anchor: { id: 'a2' }, isNew: false }] };
            }
        };
        const placementStub = {
            discoverFromPeers: async (publicationId, peers, options) => {
                placementCalls.push({ publicationId, peers, options });
                return { publicationId, attemptedPeers: peers, discovered: [{ placement: { id: 'p1' }, isNew: false }] };
            }
        };

        const coordinator = new PublicationKnowledgeSynchronizationCoordinator(anchorStub, placementStub, registry);
        const result = await coordinator.synchronize('pub-1', { timeoutMs: 123 });

        assert(result.publicationId === 'pub-1', '1. result carries the requested publicationId');
        assert(result.attemptedPeers.length === 1 && result.attemptedPeers[0] === authPeer, '2. only the AUTHENTICATED peer is asked, never the unauthenticated one');
        assert(anchorCalls.length === 1 && anchorCalls[0].peers.length === 1 && anchorCalls[0].peers[0] === authPeer, '3. the anchor discovery coordinator is asked with the SAME peer list');
        assert(placementCalls.length === 1 && placementCalls[0].peers.length === 1 && placementCalls[0].peers[0] === authPeer, '4. the placement discovery coordinator is asked with the IDENTICAL peer list, never a second independent selection');
        assert(anchorCalls[0].options.timeoutMs === 123 && placementCalls[0].options.timeoutMs === 123, '5. options pass through to both dimensions unchanged');
        assert(result.anchors.newlyImportedCount === 1 && result.anchors.alreadyKnownCount === 1, '6. anchor tally is a plain count of isNew flags');
        assert(result.placements.newlyImportedCount === 0 && result.placements.alreadyKnownCount === 1, '7. placement tally is a plain count of isNew flags, independent of the anchor tally');

        const emptyRegistry = { list: () => [] };
        const emptyCoordinator = new PublicationKnowledgeSynchronizationCoordinator(anchorStub, placementStub, emptyRegistry);
        const emptyResult = await emptyCoordinator.synchronize('pub-2');
        assert(emptyResult.attemptedPeers.length === 0, '8. zero authenticated peers resolves cleanly, never throws');
    }
    console.log('✓ Section B: synchronize() asks both dimensions the SAME authenticated-peer list and reports independent, plain tallies');

    // ---------------------------------------------------------------
    // Section C — UI state
    // ---------------------------------------------------------------
    {
        const idle = describeSynchronizationAttempt();
        assert(idle.state === PublicationKnowledgeSynchronizationUiState.IDLE, '1. no attempt is IDLE');

        const inFlight = describeSynchronizationAttempt({ synchronizing: true });
        assert(inFlight.state === PublicationKnowledgeSynchronizationUiState.SYNCHRONIZING, '2. an in-flight attempt is SYNCHRONIZING');

        const failed = describeSynchronizationAttempt({ error: 'boom' });
        assert(failed.state === PublicationKnowledgeSynchronizationUiState.UNAVAILABLE, '3. a thrown error is UNAVAILABLE');

        const noPeers = describeSynchronizationAttempt({ result: { attemptedPeers: [], anchors: { newlyImportedCount: 0, alreadyKnownCount: 0 }, placements: { newlyImportedCount: 0, alreadyKnownCount: 0 } } });
        assert(noPeers.state === PublicationKnowledgeSynchronizationUiState.UNAVAILABLE, '4. zero attempted peers is also UNAVAILABLE, never confused with NO_NEW_CLAIMS');

        const newAnchorOnly = describeSynchronizationAttempt({ result: { attemptedPeers: ['p'], anchors: { newlyImportedCount: 2, alreadyKnownCount: 0 }, placements: { newlyImportedCount: 0, alreadyKnownCount: 1 } } });
        assert(newAnchorOnly.state === PublicationKnowledgeSynchronizationUiState.SYNCHRONIZED, '5. any new claim in EITHER dimension is SYNCHRONIZED');
        assert(newAnchorOnly.newAnchorCount === 2 && newAnchorOnly.newPlacementCount === 0, '6. per-dimension counts are reported separately');

        const nothingNew = describeSynchronizationAttempt({ result: { attemptedPeers: ['p'], anchors: { newlyImportedCount: 0, alreadyKnownCount: 3 }, placements: { newlyImportedCount: 0, alreadyKnownCount: 2 } } });
        assert(nothingNew.state === PublicationKnowledgeSynchronizationUiState.NO_NEW_CLAIMS, '7. no new claims in either dimension is NO_NEW_CLAIMS, never confused with "no claims exist"');
        assert(!/no claims exist/i.test(nothingNew.message), '8. wording never claims "no claims exist"');

        assert(describeSynchronizationButtonLabel({}) === 'Synchronize with Peers', '9. default label');
        assert(describeSynchronizationButtonLabel({ synchronizing: true }) === 'Asking Peers…', '10. in-flight label');
        assert(describeSynchronizationButtonLabel({ hasSynchronized: true }) === 'Synchronize Again', '11. post-attempt label');
    }
    console.log('✓ Section C: describeSynchronizationAttempt()/describeSynchronizationButtonLabel() — the five UI states');

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP: convergence across both dimensions in one
    // call, through an intermediary, with provenance and observation
    // boundaries intact
    // ---------------------------------------------------------------
    {
        const PUBLICATION_ID = 'pub-flagship-sync';
        const CONTENT_HASH = 'hash-flagship-sync';

        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carol = makeIdentity('Carol');

        const anchorA = signAnchor(alice, { publicationId: PUBLICATION_ID, contentHash: CONTENT_HASH, anchorType: 'bitcoin-op-return', locator: 'bitcoin://tx/a' });
        const placementX = signPlacement(alice, { publicationId: PUBLICATION_ID, contentHash: CONTENT_HASH, storage: 'ipfs', locator: 'ipfs://CID-x' });
        const anchorB = signAnchor(bob, { publicationId: PUBLICATION_ID, contentHash: CONTENT_HASH, anchorType: 'transparency-log', locator: 'log://entry/b' });
        const placementY = signPlacement(bob, { publicationId: PUBLICATION_ID, contentHash: CONTENT_HASH, storage: 'local', locator: 'local://Y' });

        const network = new LocalPeerNetwork();
        const aliceTransport = new LocalPeerConnectionProvider('alice-sync', network);
        const bobTransport = new LocalPeerConnectionProvider('bob-sync', network);
        const carolTransport = new LocalPeerConnectionProvider('carol-sync', network);
        const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const carolConnect = new ConnectToPeerUseCase({ peerConnectionProvider: carolTransport, identityProvider: carol });
        const stopAlice = aliceConnect.listen();
        const stopBob = bobConnect.listen();
        const stopCarol = carolConnect.listen();

        const aliceToBob = aliceConnect.connect({ candidateEndpoint: 'bob-sync' });
        await wait();
        assert(aliceToBob.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '1. setup: Alice<->Bob authenticates');

        const aliceReplica = makeReplica(aliceConnect.registry);
        const bobReplica = makeReplica(bobConnect.registry);

        aliceReplica.anchorExchange.importAnchor(anchorA.toJSON());
        aliceReplica.placementExchange.importPlacement(placementX.toJSON());
        bobReplica.anchorExchange.importAnchor(anchorB.toJSON());
        bobReplica.placementExchange.importPlacement(placementY.toJSON());

        const bobPeerOnAlice = aliceConnect.registry.list().find((peer) => peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED);
        const alicePeerOnBob = bobConnect.registry.list().find((peer) => peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED);

        // Alice pulls from Bob: gets Anchor B and Placement Y in ONE call.
        const aliceSync = await aliceReplica.syncCoordinator.synchronize(PUBLICATION_ID, { timeoutMs: 200 });
        assert(aliceSync.anchors.newlyImportedCount === 1 && aliceSync.placements.newlyImportedCount === 1,
            '2. Alice\'s single synchronize() call receives BOTH the missing anchor AND the missing placement');
        assert(aliceReplica.anchorCatalog.findByPublicationId(PUBLICATION_ID).length === 2, '3. Alice now knows both anchors');
        assert(aliceReplica.placementCatalog.findByPublicationId(PUBLICATION_ID).length === 2, '4. Alice now knows both placements');

        // Bob pulls from Alice: gets Anchor A and Placement X.
        const bobSync = await bobReplica.syncCoordinator.synchronize(PUBLICATION_ID, { timeoutMs: 200 });
        assert(bobSync.anchors.newlyImportedCount === 1 && bobSync.placements.newlyImportedCount === 1,
            '5. Bob\'s own single synchronize() call symmetrically receives what HE was missing');
        assert(bobReplica.anchorCatalog.findByPublicationId(PUBLICATION_ID).length === 2 && bobReplica.placementCatalog.findByPublicationId(PUBLICATION_ID).length === 2,
            '6. Alice and Bob have now fully converged on both dimensions, each having run the identical explicit action once');

        // Bob<->Carol connect. Carol has NEVER talked to Alice, and never
        // will in this test.
        const bobToCarol = bobConnect.connect({ candidateEndpoint: 'carol-sync' });
        await wait();
        assert(bobToCarol.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '7. setup: Bob<->Carol authenticates');

        const carolReplica = makeReplica(carolConnect.registry);
        const carolSync = await carolReplica.syncCoordinator.synchronize(PUBLICATION_ID, { timeoutMs: 200 });
        assert(carolSync.anchors.newlyImportedCount === 2 && carolSync.placements.newlyImportedCount === 2,
            '8. Carol receives BOTH anchors and BOTH placements from Bob alone, in ONE synchronize() call — everything Bob independently knows, including what Bob himself only just learned from Alice');
        assert(carolReplica.anchorCatalog.findByPublicationId(PUBLICATION_ID).length === 2 && carolReplica.placementCatalog.findByPublicationId(PUBLICATION_ID).length === 2,
            '9. Carol fully converges without ever connecting to Alice');

        // Re-synchronizing is stable: nothing new, nothing lost.
        const carolResync = await carolReplica.syncCoordinator.synchronize(PUBLICATION_ID, { timeoutMs: 200 });
        assert(carolResync.anchors.newlyImportedCount === 0 && carolResync.anchors.alreadyKnownCount === 2, '10. re-synchronizing reports zero new anchors');
        assert(carolResync.placements.newlyImportedCount === 0 && carolResync.placements.alreadyKnownCount === 2, '11. re-synchronizing reports zero new placements');
        assert(carolReplica.anchorCatalog.findByPublicationId(PUBLICATION_ID).length === 2, '12. the catalog never grows from a duplicate synchronize()');

        // PROVENANCE: every claim Carol received arrived through a live
        // peer connection — PEER, never a new "SYNC" kind.
        assert(carolReplica.anchorKnowledge.get(anchorA.id).acquisition.kind === AnchorAcquisitionKind.PEER, '13. Carol\'s knowledge store records PEER for Anchor A');
        assert(carolReplica.anchorKnowledge.get(anchorB.id).acquisition.kind === AnchorAcquisitionKind.PEER, '14. Carol\'s knowledge store records PEER for Anchor B');
        assert(carolReplica.placementKnowledge.get(placementX.id).acquisition.kind === PlacementAcquisitionKind.PEER, '15. Carol\'s knowledge store records PEER for Placement X');
        assert(carolReplica.placementKnowledge.get(placementY.id).acquisition.kind === PlacementAcquisitionKind.PEER, '16. Carol\'s knowledge store records PEER for Placement Y');

        // OBSERVATION BOUNDARY: synchronization never carries a
        // verification or resolution outcome. Nothing in this test ever
        // called application/ExternalAnchorVerifier.js or application/
        // SnapshotPlacementResolver.js for Carol — her own knowledge
        // store has no notion of verified/resolved at all, exactly as
        // application/LocalAnchorKnowledgeStore.js's own shape (LOCAL/
        // PACKAGE/PEER plus firstSeenAt only) already guarantees
        // structurally, never as a runtime check this coordinator has to
        // perform.
        assert(!('outcome' in carolReplica.anchorKnowledge.get(anchorA.id)) && !('verified' in carolReplica.anchorKnowledge.get(anchorA.id)),
            '17. Carol\'s knowledge record for a synchronized anchor carries no verification field of any kind');

        aliceReplica.dispose(); bobReplica.dispose(); carolReplica.dispose();
        stopAlice(); stopBob(); stopCarol();
        aliceTransport.dispose(); bobTransport.dispose(); carolTransport.dispose();
    }
    console.log('✓ Section D: FLAGSHIP — Alice and Bob each synchronize once against each other and fully converge on anchors AND placements together; Carol synchronizes once against Bob alone and converges without ever contacting Alice; re-synchronizing is stable; every received claim is recorded PEER with no verification/resolution observation attached');

    // ---------------------------------------------------------------
    // Section E — INVARIANT: FIRST-SEEN-WINS across the package/sync
    // boundary, through the NEW coordinator
    // ---------------------------------------------------------------
    {
        const PUBLICATION_ID = 'pub-first-seen-wins';
        const CONTENT_HASH = 'hash-first-seen-wins';
        const alice = makeIdentity('Alice-E');
        const bob = makeIdentity('Bob-E');
        const dave = makeIdentity('Dave-E');

        const publication = signPublication(alice, { id: PUBLICATION_ID, contentKind: 'forkbuild.structure', contentReference: new ContentReference({ hash: CONTENT_HASH }) });
        const anchorA = signAnchor(alice, { publicationId: PUBLICATION_ID, contentHash: CONTENT_HASH, anchorType: 'bitcoin-op-return', locator: 'bitcoin://tx/fsw' });

        // Alice packages her publication + anchor and hands it to Dave
        // entirely offline — no peer connection to Alice exists anywhere
        // in this test.
        const replicaPackage = buildPublicationReplicaPackage(publication, { anchors: [anchorA] });

        const davePublicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const daveAnchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
        const davePlacementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const daveAnchorKnowledge = new LocalAnchorKnowledgeStore(new InMemoryStorageProvider());
        const daveImporter = new ImportPublicationReplicaPackageUseCase(
            new PublicationExchange(davePublicationCatalog, new LocalAuthorizationVerifier()),
            new PublicationAnchorExchange(daveAnchorCatalog, new LocalAuthorizationVerifier()),
            new PublicationSnapshotPlacementExchange(davePlacementCatalog, new LocalAuthorizationVerifier()),
            { anchorKnowledgeStore: daveAnchorKnowledge }
        );
        daveImporter.execute(replicaPackage);
        assert(daveAnchorKnowledge.get(anchorA.id).acquisition.kind === AnchorAcquisitionKind.PACKAGE, '1. setup: Dave holds Anchor A via PACKAGE, offline, before any peer connection exists in this test');

        // Bob independently holds the IDENTICAL Anchor A (not a new one
        // — the same signed object Alice created). Dave now connects to
        // Bob live and runs this milestone's own combined
        // synchronize() — never the raw peer-exchange class directly.
        const network = new LocalPeerNetwork();
        const bobTransport = new LocalPeerConnectionProvider('bob-fsw', network);
        const daveTransport = new LocalPeerConnectionProvider('dave-fsw', network);
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const daveConnect = new ConnectToPeerUseCase({ peerConnectionProvider: daveTransport, identityProvider: dave });
        const stopBob = bobConnect.listen();
        const stopDave = daveConnect.listen();
        const daveToBob = daveConnect.connect({ candidateEndpoint: 'bob-fsw' });
        await wait();
        assert(daveToBob.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '2. setup: Dave<->Bob authenticates');

        const bobAnchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
        const bobAnchorExchange = new PublicationAnchorExchange(bobAnchorCatalog, new LocalAuthorizationVerifier());
        bobAnchorExchange.importAnchor(anchorA.toJSON());
        const bobReplica = makeReplica(bobConnect.registry);
        bobReplica.anchorExchange.importAnchor(anchorA.toJSON());

        const daveAnchorExchangeLive = new PublicationAnchorExchange(daveAnchorCatalog, new LocalAuthorizationVerifier());
        const daveAnchorDiscovery = new PublicationAnchorDiscoveryCoordinator(
            new PublicationAnchorPeerExchange(daveAnchorExchangeLive, new PeerMessageBus(), daveConnect.registry, { knowledgeStore: daveAnchorKnowledge })
        );
        const davePlacementDiscovery = new PublicationSnapshotPlacementDiscoveryCoordinator(
            new PublicationSnapshotPlacementPeerExchange(new PublicationSnapshotPlacementExchange(davePlacementCatalog, new LocalAuthorizationVerifier()), new PeerMessageBus(), daveConnect.registry)
        );
        const { coordinator: daveSyncCoordinator } = new CreatePublicationKnowledgeSynchronizationCoordinatorUseCase().execute({
            anchorDiscoveryCoordinator: daveAnchorDiscovery,
            placementDiscoveryCoordinator: davePlacementDiscovery,
            connectedPeerRegistry: daveConnect.registry
        });

        await daveSyncCoordinator.synchronize(PUBLICATION_ID, { timeoutMs: 200 });

        assert(daveAnchorCatalog.findByPublicationId(PUBLICATION_ID).length === 1, '3. Dave still knows exactly one anchor — Bob re-sent the SAME Anchor A, not a new one');
        assert(daveAnchorKnowledge.get(anchorA.id).acquisition.kind === AnchorAcquisitionKind.PACKAGE,
            '4. FIRST-SEEN-WINS: Dave\'s knowledge store STILL reports PACKAGE for Anchor A, never PEER — this milestone\'s own combined synchronize() crosses the IDENTICAL knowledgeStore.record() boundary application/PublicationAnchorPeerExchange.js already held itself to, never a second one');

        bobReplica.dispose();
        stopBob(); stopDave();
        bobTransport.dispose(); daveTransport.dispose();
    }
    console.log('✓ Section E: INVARIANT — FIRST-SEEN-WINS holds across the package/synchronize boundary through the new combined coordinator, exactly as it already holds for the raw peer-exchange classes');

    // ---------------------------------------------------------------
    // Section F — INVARIANT: conflicting claims land without
    // adjudication
    // ---------------------------------------------------------------
    {
        const PUBLICATION_ID = 'pub-conflict-sync';
        const alice = makeIdentity('Alice-F');
        const bob = makeIdentity('Bob-F');

        // Alice and Bob each independently sign an anchor for the SAME
        // publication naming a DIFFERENT contentHash — a genuine
        // conflicting claim, never touched by any preference logic.
        const anchorAlice = signAnchor(alice, { publicationId: PUBLICATION_ID, contentHash: 'hash-alice-version', anchorType: 'bitcoin-op-return', locator: 'bitcoin://tx/alice-version' });
        const anchorBob = signAnchor(bob, { publicationId: PUBLICATION_ID, contentHash: 'hash-bob-version', anchorType: 'transparency-log', locator: 'log://entry/bob-version' });

        const network = new LocalPeerNetwork();
        const aliceTransport = new LocalPeerConnectionProvider('alice-conflict', network);
        const bobTransport = new LocalPeerConnectionProvider('bob-conflict', network);
        const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const stopAlice = aliceConnect.listen();
        const stopBob = bobConnect.listen();
        aliceConnect.connect({ candidateEndpoint: 'bob-conflict' });
        await wait();

        const aliceReplica = makeReplica(aliceConnect.registry);
        const bobReplica = makeReplica(bobConnect.registry);
        aliceReplica.anchorExchange.importAnchor(anchorAlice.toJSON());
        bobReplica.anchorExchange.importAnchor(anchorBob.toJSON());

        await aliceReplica.syncCoordinator.synchronize(PUBLICATION_ID, { timeoutMs: 200 });
        await bobReplica.syncCoordinator.synchronize(PUBLICATION_ID, { timeoutMs: 200 });

        const aliceAnchors = aliceReplica.anchorCatalog.findByPublicationId(PUBLICATION_ID);
        const bobAnchors = bobReplica.anchorCatalog.findByPublicationId(PUBLICATION_ID);
        assert(aliceAnchors.length === 2 && bobAnchors.length === 2, '1. BOTH conflicting anchors land on BOTH replicas — synchronize() never rejects, ranks, or drops either claim');

        const aliceConvergence = publicationEvidenceConvergenceView(derivePublicationEvidenceConvergence({ publicationId: PUBLICATION_ID, anchors: aliceAnchors }));
        const bobConvergence = publicationEvidenceConvergenceView(derivePublicationEvidenceConvergence({ publicationId: PUBLICATION_ID, anchors: bobAnchors }));
        assert(aliceConvergence.relationship === ContentBindingSetRelationship.CONFLICT && aliceConvergence.hasConflict === true,
            '2. Alice\'s own convergence view, derived independently from what she now knows, reports CONFLICT');
        assert(bobConvergence.relationship === ContentBindingSetRelationship.CONFLICT && bobConvergence.hasConflict === true,
            '3. Bob\'s own convergence view, derived independently, reports CONFLICT too — symmetrically, regardless of who initiated which synchronize() call');
        assert(JSON.stringify(aliceConvergence.contentGroups.map((g) => g.contentHash).sort()) === JSON.stringify(bobConvergence.contentGroups.map((g) => g.contentHash).sort()),
            '4. both replicas converge on the IDENTICAL set of conflicting contentHash groups — neither replica ends up with a "winning" claim the other lacks');

        const resyncResult = await aliceReplica.syncCoordinator.synchronize(PUBLICATION_ID, { timeoutMs: 200 });
        const serializedResult = JSON.stringify({ anchors: resyncResult.anchors, placements: resyncResult.placements });
        assert(!/winner|preferred|best|canonical|trust|rank|score|authorit|resolve.?conflict/i.test(serializedResult),
            '5. synchronize()\'s own result carries no ranking, preference, or adjudication vocabulary of any kind');

        aliceReplica.dispose(); bobReplica.dispose();
        stopAlice(); stopBob();
        aliceTransport.dispose(); bobTransport.dispose();
    }
    console.log('✓ Section F: INVARIANT — conflicting claims land on both replicas without adjudication; each replica\'s own convergence view independently and symmetrically reports CONFLICT');

    console.log('\nAll Publication Knowledge Synchronization tests passed.');
}

run().catch((error) => {
    console.error('PublicationKnowledgeSynchronization.test.js FAILED:', error);
    process.exitCode = 1;
});
