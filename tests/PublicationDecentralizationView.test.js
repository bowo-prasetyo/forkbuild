import { derivePublicationEvidenceConvergence } from '../application/PublicationEvidenceConvergence.js';
import { publicationEvidenceConvergenceView } from '../application/PublicationEvidenceConvergenceView.js';
import { derivePublicationSnapshotPlacementConvergence } from '../application/PublicationSnapshotPlacementConvergence.js';
import { publicationSnapshotPlacementConvergenceView } from '../application/PublicationSnapshotPlacementConvergenceView.js';
import {
    describePublicationDecentralization, describeDecentralizationRelationshipContrast
} from '../application/PublicationDecentralizationView.js';
import { createVerificationObservation } from '../application/PublicationAnchorVerificationObservation.js';
import { AnchorVerificationOutcome } from '../application/AnchorVerificationOutcome.js';
import { createResolutionObservation } from '../application/SnapshotPlacementResolutionObservation.js';
import { SnapshotPlacementResolutionOutcome } from '../application/SnapshotPlacementResolutionOutcome.js';
import { LocalPublicationAnchorCatalog } from '../application/LocalPublicationAnchorCatalog.js';
import { PublicationAnchorExchange } from '../application/PublicationAnchorExchange.js';
import { PublicationAnchorPeerExchange } from '../application/PublicationAnchorPeerExchange.js';
import { PublicationAnchorDiscoveryCoordinator } from '../application/PublicationAnchorDiscoveryCoordinator.js';
import { LocalAnchorKnowledgeStore } from '../application/LocalAnchorKnowledgeStore.js';
import { AnchorAcquisitionKind } from '../application/AnchorAcquisitionKind.js';
import { ImportPackageAnchorsUseCase } from '../application/ImportPackageAnchorsUseCase.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { PublicationSnapshotPlacementExchange } from '../application/PublicationSnapshotPlacementExchange.js';
import { PublicationSnapshotPlacementPeerExchange } from '../application/PublicationSnapshotPlacementPeerExchange.js';
import { PublicationSnapshotPlacementDiscoveryCoordinator } from '../application/PublicationSnapshotPlacementDiscoveryCoordinator.js';
import { LocalPlacementKnowledgeStore } from '../application/LocalPlacementKnowledgeStore.js';
import { PlacementAcquisitionKind } from '../application/PlacementAcquisitionKind.js';
import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';
import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { buildBlueprintPackage } from '../application/BlueprintPackage.js';
import { validateBlueprintPackage } from '../application/BlueprintImportValidator.js';
import { Structure } from '../core/Structure.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';

// 0.8.27 — Unified Publication Decentralization View.
//
//   Section A: describePublicationDecentralization() argument handling —
//              requires a publicationId, degrades gracefully with no
//              convergence view supplied for either dimension, and never
//              recomputes anything already computed by the two
//              convergence views it combines.
//   Section B: the contrast sentence — fires when the two dimensions'
//              relationships DIVERGE (evidence conflicts while
//              placements agree, and the converse), stays null whenever
//              they agree with each other, and never appears when
//              either dimension is unknown.
//   Section C: FLAGSHIP — a four-replica scenario naming every
//              acquisition route this codebase has ever built, spread
//              across BOTH subsystems at once:
//
//                Alice — local publication; creates and signs Anchor A
//                        and Placement A herself (LOCAL/LOCAL)
//                Bob   — receives Anchor A and Placement A over a live
//                        peer ANNOUNCE from Alice (PEER/PEER); then
//                        independently verifies Anchor A and resolves
//                        Placement A
//                Carol — receives Anchor A through a Blueprint Package
//                        import (PACKAGE); independently creates her own
//                        Anchor B, claiming a DIFFERENT content hash
//                        (LOCAL), and her own second Placement, agreeing
//                        with Alice's (LOCAL)
//                Dave  — discovers EVERYTHING — Anchor A, Anchor B, both
//                        placements — from peers alone (PEER/PEER), then
//                        independently verifies Anchor A and resolves
//                        Placement A himself
//
//              Historical peer discovery converges all four replicas
//              onto the identical evidence set AND the identical
//              placement set. Every replica's own independently derived
//              application/PublicationDecentralizationView.js result is
//              byte-identical: evidence CONFLICTS (Anchor A vs. Anchor
//              B), placements AGREE (Alice's and Carol's placements
//              claim the same content hash) — the exact asymmetry
//              docs/Roadmap.md's own 0.8.27 design conversation named,
//              surfaced as the one contrast sentence this milestone
//              adds. Dave's own verification/resolution history is then
//              proven to change NOTHING about his derived decentraliza-
//              tion view, and his own acquisition provenance (all PEER)
//              is proven to never appear anywhere inside it.
//
// See docs/Principles.md, "Publication Decentralization Is Two Separate
// Dimensions, Never One Combined Verdict (0.8.27)."

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

function makeAnchorReplica() {
    const catalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
    const verifier = new LocalAuthorizationVerifier();
    const exchange = new PublicationAnchorExchange(catalog, verifier);
    const knowledgeStore = new LocalAnchorKnowledgeStore(new InMemoryStorageProvider());
    return { catalog, exchange, knowledgeStore };
}

function makePlacementReplica() {
    const catalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
    const verifier = new LocalAuthorizationVerifier();
    const exchange = new PublicationSnapshotPlacementExchange(catalog, verifier);
    const knowledgeStore = new LocalPlacementKnowledgeStore(new InMemoryStorageProvider());
    return { catalog, exchange, knowledgeStore };
}

function fakeConvergenceView({ anchorCount = 0, relationship = null, hasConflict = false, contentGroups = [] } = {}) {
    return { anchorCount, relationship, hasConflict, contentGroups };
}

function brick(definitionId, x, y, z) {
    return new Brick({ definitionId, position: new Position(x, y, z) });
}

function farmstead() {
    return new Structure({
        id: 'farmstead-decentralization', name: 'Farmstead', category: 'Architecture', description: 'A cozy farmstead.',
        bricks: [brick('core:wall_1x3', 0, 0, 0)]
    });
}

// Builds the full unified view for a replica's own two, already-
// converged catalogs — exactly the two-step sequence ui/views/
// DecentralizedPublicationsView.js's own recomputeConvergence()/
// recomputePlacementConvergence()/recomputeDecentralization() run,
// spelled out here explicitly rather than through the Vue component.
function deriveDecentralization(publicationId, { anchors, placements, verificationByAnchorId = {} }) {
    const evidenceConvergence = derivePublicationEvidenceConvergence({ publicationId, anchors, verificationByAnchorId });
    const evidenceConvergenceView = publicationEvidenceConvergenceView(evidenceConvergence);
    const placementConvergence = derivePublicationSnapshotPlacementConvergence({ publicationId, placements });
    const placementConvergenceView = publicationSnapshotPlacementConvergenceView(placementConvergence);
    return describePublicationDecentralization({ publicationId, evidenceConvergenceView, placementConvergenceView });
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — argument handling
    // ---------------------------------------------------------------
    {
        expectThrows(() => describePublicationDecentralization({}), '1. requires a publicationId');
        expectThrows(() => describePublicationDecentralization({ publicationId: '  ' }), '2. rejects a blank publicationId');

        const bare = describePublicationDecentralization({ publicationId: 'pub-bare' });
        assert(bare.evidence.known === false && bare.placements.known === false,
            '3. no views supplied -> both dimensions report known: false, never an error');
        assert(bare.evidence.anchorCount === 0 && bare.placements.placementCount === 0,
            '4. no views supplied -> zero counts, never a fabricated one');
        assert(bare.evidence.relationship === null && bare.placements.relationship === null,
            '5. no views supplied -> no relationship, never defaulted to "agreement"');

        const evidenceOnly = describePublicationDecentralization({
            publicationId: 'pub-evidence-only',
            evidenceConvergenceView: fakeConvergenceView({ anchorCount: 2, relationship: 'agreement', hasConflict: false })
        });
        assert(evidenceOnly.evidence.known === true && evidenceOnly.evidence.anchorCount === 2,
            '6. evidence view supplied alone is reported on its own dimension');
        assert(evidenceOnly.placements.known === false,
            '7. placements dimension stays known: false when no placement view was ever computed for this entry');

        assert(!('decentralizationScore' in bare) && !('confidence' in bare) && !('trustLevel' in bare)
            && !('preferredSource' in bare) && !('bestEvidence' in bare) && !('bestPlacement' in bare),
            '8. the combined view has no verdict field of any kind spanning the two dimensions');
    }
    console.log('✓ Section A: describePublicationDecentralization() argument handling — publicationId required, missing views degrade to known:false, no verdict field anywhere');

    // ---------------------------------------------------------------
    // Section B — the contrast sentence
    // ---------------------------------------------------------------
    {
        const evidenceConflicts = fakeConvergenceView({ anchorCount: 2, relationship: 'conflict', hasConflict: true });
        const placementsAgree = fakeConvergenceView({ anchorCount: 0, relationship: 'agreement', hasConflict: false });
        const divergentA = describePublicationDecentralization({
            publicationId: 'pub-divergent-a', evidenceConvergenceView: evidenceConflicts, placementConvergenceView: placementsAgree
        });
        const noteA = describeDecentralizationRelationshipContrast(divergentA);
        assert(typeof noteA === 'string' && /evidence/i.test(noteA) && /agree/i.test(noteA),
            '1. evidence conflicts, placements agree -> a contrast sentence naming the asymmetry');
        assert(!/correct|winner|trust|best|preferred/i.test(noteA),
            '2. the contrast sentence never says which dimension to believe');

        const placementsConflict = fakeConvergenceView({ anchorCount: 0, relationship: 'conflict', hasConflict: true });
        const evidenceAgrees = fakeConvergenceView({ anchorCount: 2, relationship: 'agreement', hasConflict: false });
        const divergentB = describePublicationDecentralization({
            publicationId: 'pub-divergent-b', evidenceConvergenceView: evidenceAgrees, placementConvergenceView: placementsConflict
        });
        const noteB = describeDecentralizationRelationshipContrast(divergentB);
        assert(typeof noteB === 'string' && /placement/i.test(noteB), '3. placements conflict, evidence agrees -> the converse sentence');
        assert(noteA !== noteB, '4. the two directions are worded distinctly, never a single symmetric template');

        const bothAgree = describePublicationDecentralization({
            publicationId: 'pub-both-agree', evidenceConvergenceView: evidenceAgrees, placementConvergenceView: placementsAgree
        });
        assert(describeDecentralizationRelationshipContrast(bothAgree) === null, '5. both dimensions agree -> no contrast to state');

        const bothConflict = describePublicationDecentralization({
            publicationId: 'pub-both-conflict', evidenceConvergenceView: evidenceConflicts, placementConvergenceView: placementsConflict
        });
        assert(describeDecentralizationRelationshipContrast(bothConflict) === null, '6. both dimensions conflict -> still no contrast to state (a shared property, not a divergence)');

        assert(describeDecentralizationRelationshipContrast(bare_or_null()) === null, '7. no view at all -> null, never a throw');
        function bare_or_null() { return null; }

        const oneUnknown = describePublicationDecentralization({ publicationId: 'pub-one-unknown', evidenceConvergenceView: evidenceConflicts });
        assert(describeDecentralizationRelationshipContrast(oneUnknown) === null, '8. one dimension unknown -> no contrast, never a guess');
    }
    console.log('✓ Section B: the contrast sentence — fires only when the two dimensions\' relationships diverge, worded distinctly per direction, silent whenever they agree, both conflict, or either is unknown');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP
    // ---------------------------------------------------------------
    {
        const network = new LocalPeerNetwork();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carol = makeIdentity('Carol');
        const dave = makeIdentity('Dave');

        const aliceTransport = new LocalPeerConnectionProvider('alice-decentralization', network);
        const bobTransport = new LocalPeerConnectionProvider('bob-decentralization', network);
        const carolTransport = new LocalPeerConnectionProvider('carol-decentralization', network);
        const daveTransport = new LocalPeerConnectionProvider('dave-decentralization', network);

        const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        const stopAliceListening = aliceConnect.listen();
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const stopBobListening = bobConnect.listen();
        const carolConnect = new ConnectToPeerUseCase({ peerConnectionProvider: carolTransport, identityProvider: carol });
        const stopCarolListening = carolConnect.listen();
        const daveConnect = new ConnectToPeerUseCase({ peerConnectionProvider: daveTransport, identityProvider: dave });

        // Deliberately only Bob<->Alice connects at this point — Carol
        // and Dave connect LATER, after Alice's live ANNOUNCE below, so
        // that ANNOUNCE (which broadcasts to every CURRENTLY
        // authenticated peer — see application/
        // PublicationAnchorPeerExchange.js#announce()'s own header)
        // reaches Bob alone. Carol and Dave's own acquisition of Anchor A
        // is proven to come from the PACKAGE import and historical
        // discovery below, never from this broadcast.
        const bobToAlice = bobConnect.connect({ candidateEndpoint: 'alice-decentralization' });

        await wait(30);
        assert(bobToAlice.getLifecycleState() === PeerLifecycleState.AUTHENTICATED,
            '1. setup: Bob<->Alice authenticates');

        function connectionTo(fromConnect, toIdentityProvider) {
            const remoteId = toIdentityProvider.getSigningIdentity().id;
            return fromConnect.registry.list().find((c) => c.remoteIdentity && c.remoteIdentity.identityId === remoteId);
        }
        const aliceToBob = connectionTo(aliceConnect, bob);

        // --- one identity, TWO independent subsystems, over the SAME
        // peer connections — a separate PeerMessageBus per subsystem
        // (anchors, placements), each attached to the identical
        // connectedPeerRegistry, exactly as ui/App.js's own production
        // wiring already composes multiple decentralization subsystems
        // over one peer connection set. ---
        const aliceAnchors = makeAnchorReplica();
        const aliceAnchorBus = new PeerMessageBus();
        const aliceAnchorPeerExchange = new PublicationAnchorPeerExchange(aliceAnchors.exchange, aliceAnchorBus, aliceConnect.registry, { knowledgeStore: aliceAnchors.knowledgeStore });
        const aliceAnchorCoordinator = new PublicationAnchorDiscoveryCoordinator(aliceAnchorPeerExchange);
        const alicePlacements = makePlacementReplica();
        const alicePlacementBus = new PeerMessageBus();
        const alicePlacementPeerExchange = new PublicationSnapshotPlacementPeerExchange(alicePlacements.exchange, alicePlacementBus, aliceConnect.registry, { knowledgeStore: alicePlacements.knowledgeStore });
        const alicePlacementCoordinator = new PublicationSnapshotPlacementDiscoveryCoordinator(alicePlacementPeerExchange);

        const bobAnchors = makeAnchorReplica();
        const bobAnchorBus = new PeerMessageBus();
        const bobAnchorPeerExchange = new PublicationAnchorPeerExchange(bobAnchors.exchange, bobAnchorBus, bobConnect.registry, { knowledgeStore: bobAnchors.knowledgeStore });
        const bobAnchorCoordinator = new PublicationAnchorDiscoveryCoordinator(bobAnchorPeerExchange);
        const bobPlacements = makePlacementReplica();
        const bobPlacementBus = new PeerMessageBus();
        const bobPlacementPeerExchange = new PublicationSnapshotPlacementPeerExchange(bobPlacements.exchange, bobPlacementBus, bobConnect.registry, { knowledgeStore: bobPlacements.knowledgeStore });
        const bobPlacementCoordinator = new PublicationSnapshotPlacementDiscoveryCoordinator(bobPlacementPeerExchange);

        const carolAnchors = makeAnchorReplica();
        const carolAnchorBus = new PeerMessageBus();
        const carolAnchorPeerExchange = new PublicationAnchorPeerExchange(carolAnchors.exchange, carolAnchorBus, carolConnect.registry, { knowledgeStore: carolAnchors.knowledgeStore });
        const carolAnchorCoordinator = new PublicationAnchorDiscoveryCoordinator(carolAnchorPeerExchange);
        const carolPlacements = makePlacementReplica();
        const carolPlacementBus = new PeerMessageBus();
        const carolPlacementPeerExchange = new PublicationSnapshotPlacementPeerExchange(carolPlacements.exchange, carolPlacementBus, carolConnect.registry, { knowledgeStore: carolPlacements.knowledgeStore });
        const carolPlacementCoordinator = new PublicationSnapshotPlacementDiscoveryCoordinator(carolPlacementPeerExchange);

        const daveAnchors = makeAnchorReplica();
        const daveAnchorBus = new PeerMessageBus();
        const daveAnchorPeerExchange = new PublicationAnchorPeerExchange(daveAnchors.exchange, daveAnchorBus, daveConnect.registry, { knowledgeStore: daveAnchors.knowledgeStore });
        const daveAnchorCoordinator = new PublicationAnchorDiscoveryCoordinator(daveAnchorPeerExchange);
        const davePlacements = makePlacementReplica();
        const davePlacementBus = new PeerMessageBus();
        const davePlacementPeerExchange = new PublicationSnapshotPlacementPeerExchange(davePlacements.exchange, davePlacementBus, daveConnect.registry, { knowledgeStore: davePlacements.knowledgeStore });
        const davePlacementCoordinator = new PublicationSnapshotPlacementDiscoveryCoordinator(davePlacementPeerExchange);

        const PUBLICATION_ID = 'pub-flagship-decentralization';
        const EXPECTED_HASH = 'hash-flagship-decentralization-h';
        const CONTRADICTING_HASH = 'hash-flagship-decentralization-h2';

        // Alice: local publication, one anchor, one placement — both
        // signed and cataloged/recorded by herself alone.
        const anchorA = signAnchor(alice, { publicationId: PUBLICATION_ID, contentHash: EXPECTED_HASH, anchorType: 'bitcoin-op-return', locator: 'bitcoin://tx/flagship-a' });
        const placementA = signPlacement(alice, { publicationId: PUBLICATION_ID, contentHash: EXPECTED_HASH, storage: 'ipfs', locator: 'ipfs://CID-flagship-a' });
        aliceAnchors.exchange.importAnchor(anchorA.toJSON());
        aliceAnchors.knowledgeStore.record(anchorA.id, AnchorAcquisitionKind.LOCAL);
        alicePlacements.exchange.importPlacement(placementA.toJSON());
        alicePlacements.knowledgeStore.record(placementA.id, PlacementAcquisitionKind.LOCAL);

        // Bob: receives BOTH over a live peer ANNOUNCE from Alice.
        aliceAnchorPeerExchange.announce(anchorA);
        alicePlacementPeerExchange.announce(placementA);
        await wait(20);
        assert(bobAnchors.catalog.has(anchorA.id) && bobPlacements.catalog.has(placementA.id),
            '2. setup: Bob acquires Anchor A and Placement A via a live peer ANNOUNCE');
        assert(bobAnchors.knowledgeStore.get(anchorA.id).acquisition.kind === AnchorAcquisitionKind.PEER
            && bobPlacements.knowledgeStore.get(placementA.id).acquisition.kind === PlacementAcquisitionKind.PEER,
            '3. setup: Bob\'s own knowledge store records PEER for both — Alice\'s own LOCAL acquisition never overwrites it');

        // NOW Carol and Dave join the network — after the broadcast
        // above, so neither receives Anchor A/Placement A through it.
        const carolToAlice = carolConnect.connect({ candidateEndpoint: 'alice-decentralization' });
        const carolToBob = carolConnect.connect({ candidateEndpoint: 'bob-decentralization' });
        const daveToAlice = daveConnect.connect({ candidateEndpoint: 'alice-decentralization' });
        const daveToBob = daveConnect.connect({ candidateEndpoint: 'bob-decentralization' });
        const daveToCarol = daveConnect.connect({ candidateEndpoint: 'carol-decentralization' });
        await wait(30);
        assert(carolToAlice.getLifecycleState() === PeerLifecycleState.AUTHENTICATED
            && carolToBob.getLifecycleState() === PeerLifecycleState.AUTHENTICATED
            && daveToAlice.getLifecycleState() === PeerLifecycleState.AUTHENTICATED
            && daveToBob.getLifecycleState() === PeerLifecycleState.AUTHENTICATED
            && daveToCarol.getLifecycleState() === PeerLifecycleState.AUTHENTICATED,
            '3b. setup: Carol and Dave join the network after the broadcast above — every remaining connection authenticates');
        const aliceToCarol = connectionTo(aliceConnect, carol);
        const aliceToDave = connectionTo(aliceConnect, dave);
        const bobToCarol = connectionTo(bobConnect, carol);
        const bobToDave = connectionTo(bobConnect, dave);
        const carolToDave = connectionTo(carolConnect, dave);
        assert(!carolAnchors.catalog.has(anchorA.id) && !carolPlacements.catalog.has(placementA.id),
            '3c. setup: Carol still knows NEITHER Anchor A nor Placement A — she joined too late to receive the earlier broadcast ANNOUNCE');

        // Carol: receives Anchor A through a Blueprint Package import;
        // independently creates her own Anchor B (a DIFFERENT content
        // hash) and her own second Placement (AGREEING content hash).
        const pkg = buildBlueprintPackage(farmstead(), { anchors: [anchorA] });
        validateBlueprintPackage(pkg);
        const carolImportPackageAnchors = new ImportPackageAnchorsUseCase(carolAnchors.exchange, carolAnchors.knowledgeStore);
        const packageResult = carolImportPackageAnchors.execute(pkg);
        assert(packageResult.importedAnchors.length === 1, '4. setup: Carol acquires Anchor A via a Blueprint Package import');
        assert(carolAnchors.knowledgeStore.get(anchorA.id).acquisition.kind === AnchorAcquisitionKind.PACKAGE,
            '5. setup: Carol\'s own knowledge store records PACKAGE for Anchor A');

        const anchorB = signAnchor(carol, { publicationId: PUBLICATION_ID, contentHash: CONTRADICTING_HASH, anchorType: 'transparency-log', locator: 'log://entry/flagship-b' });
        carolAnchors.exchange.importAnchor(anchorB.toJSON());
        carolAnchors.knowledgeStore.record(anchorB.id, AnchorAcquisitionKind.LOCAL);

        const placementC = signPlacement(carol, { publicationId: PUBLICATION_ID, contentHash: EXPECTED_HASH, storage: 'ipfs', locator: 'ipfs://CID-flagship-c' });
        carolPlacements.exchange.importPlacement(placementC.toJSON());
        carolPlacements.knowledgeStore.record(placementC.id, PlacementAcquisitionKind.LOCAL);

        assert(aliceAnchors.catalog.findByPublicationId(PUBLICATION_ID).length === 1, '6. setup: Alice starts knowing only Anchor A');
        assert(bobAnchors.catalog.findByPublicationId(PUBLICATION_ID).length === 1, '7. setup: Bob starts knowing only Anchor A');
        assert(carolAnchors.catalog.findByPublicationId(PUBLICATION_ID).length === 2, '8. setup: Carol starts knowing Anchor A and her own Anchor B');
        assert(davePlacements.catalog.findByPublicationId(PUBLICATION_ID).length === 0
            && daveAnchors.catalog.findByPublicationId(PUBLICATION_ID).length === 0,
            '9. setup: Dave starts knowing NOTHING — everything he ends up with must come from peers');

        // Historical discovery/synchronization for BOTH subsystems, two
        // rounds so transitively-learned knowledge (e.g. Dave learning
        // Anchor B, which only Carol has, by way of Carol) finishes
        // propagating — the identical technique the anchor-only and
        // placement-only flagships already use, run here for both
        // subsystems across all four replicas.
        const anchorLinks = {
            alice: [aliceToBob, aliceToCarol, aliceToDave].filter(Boolean),
            bob: [bobToAlice, bobToCarol, bobToDave].filter(Boolean),
            carol: [carolToAlice, carolToBob, carolToDave].filter(Boolean),
            dave: [daveToAlice, daveToBob, daveToCarol].filter(Boolean)
        };
        for (let round = 0; round < 2; round++) {
            await aliceAnchorCoordinator.discoverFromPeers(PUBLICATION_ID, anchorLinks.alice, { timeoutMs: 200 });
            await bobAnchorCoordinator.discoverFromPeers(PUBLICATION_ID, anchorLinks.bob, { timeoutMs: 200 });
            await carolAnchorCoordinator.discoverFromPeers(PUBLICATION_ID, anchorLinks.carol, { timeoutMs: 200 });
            await daveAnchorCoordinator.discoverFromPeers(PUBLICATION_ID, anchorLinks.dave, { timeoutMs: 200 });
            await alicePlacementCoordinator.discoverFromPeers(PUBLICATION_ID, anchorLinks.alice, { timeoutMs: 200 });
            await bobPlacementCoordinator.discoverFromPeers(PUBLICATION_ID, anchorLinks.bob, { timeoutMs: 200 });
            await carolPlacementCoordinator.discoverFromPeers(PUBLICATION_ID, anchorLinks.carol, { timeoutMs: 200 });
            await davePlacementCoordinator.discoverFromPeers(PUBLICATION_ID, anchorLinks.dave, { timeoutMs: 200 });
        }

        // --- NETWORK CONVERGENCE, both subsystems, all four replicas ---
        for (const [name, replica] of [['Alice', aliceAnchors], ['Bob', bobAnchors], ['Carol', carolAnchors], ['Dave', daveAnchors]]) {
            assert(replica.catalog.findByPublicationId(PUBLICATION_ID).length === 2, `10. NETWORK CONVERGENCE (evidence): ${name} converges on both anchors`);
        }
        for (const [name, replica] of [['Alice', alicePlacements], ['Bob', bobPlacements], ['Carol', carolPlacements], ['Dave', davePlacements]]) {
            assert(replica.catalog.findByPublicationId(PUBLICATION_ID).length === 2, `11. NETWORK CONVERGENCE (placements): ${name} converges on both placements`);
        }
        // Dave in particular acquired EVERYTHING from peers alone —
        // never his own creation, never a package.
        assert(daveAnchors.knowledgeStore.get(anchorA.id).acquisition.kind === AnchorAcquisitionKind.PEER
            && daveAnchors.knowledgeStore.get(anchorB.id).acquisition.kind === AnchorAcquisitionKind.PEER
            && davePlacements.knowledgeStore.get(placementA.id).acquisition.kind === PlacementAcquisitionKind.PEER
            && davePlacements.knowledgeStore.get(placementC.id).acquisition.kind === PlacementAcquisitionKind.PEER,
            '12. Dave\'s own acquisition provenance is PEER for every single claim he holds — he never created, imported, or received a package for any of them');

        function replicaDecentralization(replica) {
            return deriveDecentralization(PUBLICATION_ID, {
                anchors: replica.anchors.catalog.findByPublicationId(PUBLICATION_ID),
                placements: replica.placements.catalog.findByPublicationId(PUBLICATION_ID)
            });
        }
        const replicas = {
            alice: { anchors: aliceAnchors, placements: alicePlacements },
            bob: { anchors: bobAnchors, placements: bobPlacements },
            carol: { anchors: carolAnchors, placements: carolPlacements },
            dave: { anchors: daveAnchors, placements: davePlacements }
        };
        const decentralizationByReplica = Object.fromEntries(
            Object.entries(replicas).map(([name, replica]) => [name, replicaDecentralization(replica)])
        );

        const serializedViews = Object.values(decentralizationByReplica).map((view) => JSON.stringify(view));
        assert(serializedViews.every((s) => s === serializedViews[0]),
            '13. all FOUR replicas\' independently derived decentralization views are byte-identical — including Dave, who acquired every single claim from peers, never from the original publisher, a package, or his own local creation');

        const daveView = decentralizationByReplica.dave;
        assert(daveView.evidence.anchorCount === 2 && daveView.evidence.hasConflict === true,
            '14. Dave correctly derives: two anchors known, evidence CONFLICTS (Anchor A vs. Anchor B)');
        assert(daveView.placements.placementCount === 2 && daveView.placements.hasConflict === false,
            '15. Dave correctly derives: two placements known, placements AGREE — evidence conflict does NOT imply placement conflict');

        const daveContrast = describeDecentralizationRelationshipContrast(daveView);
        assert(typeof daveContrast === 'string' && /evidence/i.test(daveContrast) && /agree/i.test(daveContrast),
            '16. the one contrast sentence this milestone adds correctly names the asymmetry Dave derived: evidence conflicts while placements agree');

        const serialized = JSON.stringify(daveView);
        assert(!/authorit|trust|winner|consensus|correct|malicious|reject|best|preferred|confident|likely|canonical|score/i.test(serialized),
            '17. no adjudicating language or verdict field anywhere in Dave\'s derived decentralization view');
        assert(!/peer|package|acquisition|firstSeen|learned|verif|resolv|lifecycle/i.test(serialized),
            '18. no acquisition provenance and no lifecycle vocabulary anywhere in the decentralization view — both stay LOCAL, per-claim, and OUTSIDE this file entirely, exactly as this file\'s own header requires');

        // --- Dave now makes his OWN local observations: he verifies
        // Anchor A and resolves Placement A. Neither should move his
        // decentralization view by a single byte. ---
        const daveVerification = { [anchorA.id]: AnchorVerificationOutcome.VALID_PROOF_UNVERIFIED };
        createVerificationObservation({ anchorId: anchorA.id, outcome: AnchorVerificationOutcome.VALID_PROOF_UNVERIFIED }); // exercised for its own sake, mirroring the UI's own bookkeeping
        createResolutionObservation({ placementId: placementA.id, outcome: SnapshotPlacementResolutionOutcome.RESOLVED }); // ditto — placement convergence has no parameter for it at all

        const daveViewBefore = daveView;
        const daveViewAfterObservation = deriveDecentralization(PUBLICATION_ID, {
            anchors: daveAnchors.catalog.findByPublicationId(PUBLICATION_ID),
            placements: davePlacements.catalog.findByPublicationId(PUBLICATION_ID),
            verificationByAnchorId: daveVerification
        });
        assert(JSON.stringify(daveViewBefore) === JSON.stringify(daveViewAfterObservation),
            '19. INVARIANT: Dave\'s decentralization view is byte-identical before and after he independently verifies Anchor A and resolves Placement A — local observations never alter the derived view, exactly as this file\'s own header requires');

        aliceAnchorPeerExchange.dispose();
        alicePlacementPeerExchange.dispose();
        bobAnchorPeerExchange.dispose();
        bobPlacementPeerExchange.dispose();
        carolAnchorPeerExchange.dispose();
        carolPlacementPeerExchange.dispose();
        daveAnchorPeerExchange.dispose();
        davePlacementPeerExchange.dispose();
        stopAliceListening();
        stopBobListening();
        stopCarolListening();
        aliceTransport.dispose();
        bobTransport.dispose();
        carolTransport.dispose();
        daveTransport.dispose();
    }
    console.log('✓ Section C: FLAGSHIP — Alice/Bob/Carol/Dave, every acquisition route (LOCAL, live peer ANNOUNCE, Blueprint Package import) spread across BOTH anchors and placements at once; historical peer discovery converges all four replicas onto the identical evidence set AND placement set; Dave — who learned every single claim from peers alone — derives a decentralization view byte-identical to Alice\'s, Bob\'s, and Carol\'s own; evidence conflicts while placements agree, surfaced as the one contrast sentence this milestone adds; Dave\'s own subsequent verification/resolution never moves his decentralization view, and his own PEER-only provenance never appears inside it');

    console.log('\nAll Publication Decentralization View tests passed.');
}

run().catch((error) => {
    console.error('PublicationDecentralizationView.test.js FAILED:', error);
    process.exitCode = 1;
});
