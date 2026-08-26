import {
    describePublicationReplicaKnowledgeDetail, describeAcquisitionBreakdown
} from '../application/PublicationReplicaKnowledgeDetailView.js';
import { createAnchorKnowledgeRecord } from '../application/AnchorKnowledgeRecord.js';
import { createSnapshotPlacementKnowledgeRecord } from '../application/SnapshotPlacementKnowledgeRecord.js';
import { AnchorAcquisitionKind } from '../application/AnchorAcquisitionKind.js';
import { PlacementAcquisitionKind } from '../application/PlacementAcquisitionKind.js';
import { AnchorVerificationOutcome } from '../application/AnchorVerificationOutcome.js';
import { createVerificationObservation } from '../application/PublicationAnchorVerificationObservation.js';
import { SnapshotPlacementResolutionOutcome } from '../application/SnapshotPlacementResolutionOutcome.js';
import { createResolutionObservation } from '../application/SnapshotPlacementResolutionObservation.js';
import { derivePublicationEvidenceConvergence } from '../application/PublicationEvidenceConvergence.js';
import { publicationEvidenceConvergenceView } from '../application/PublicationEvidenceConvergenceView.js';
import { derivePublicationSnapshotPlacementConvergence } from '../application/PublicationSnapshotPlacementConvergence.js';
import { publicationSnapshotPlacementConvergenceView } from '../application/PublicationSnapshotPlacementConvergenceView.js';
import { ContentBindingSetRelationship } from '../application/ContentBindingSetRelationship.js';
import { SnapshotPlacementRelationship } from '../application/SnapshotPlacementRelationship.js';
import { LocalPublicationAnchorCatalog } from '../application/LocalPublicationAnchorCatalog.js';
import { PublicationAnchorExchange } from '../application/PublicationAnchorExchange.js';
import { PublicationAnchorPeerExchange } from '../application/PublicationAnchorPeerExchange.js';
import { PublicationAnchorDiscoveryCoordinator } from '../application/PublicationAnchorDiscoveryCoordinator.js';
import { LocalAnchorKnowledgeStore } from '../application/LocalAnchorKnowledgeStore.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { PublicationSnapshotPlacementExchange } from '../application/PublicationSnapshotPlacementExchange.js';
import { PublicationSnapshotPlacementPeerExchange } from '../application/PublicationSnapshotPlacementPeerExchange.js';
import { PublicationSnapshotPlacementDiscoveryCoordinator } from '../application/PublicationSnapshotPlacementDiscoveryCoordinator.js';
import { LocalPlacementKnowledgeStore } from '../application/LocalPlacementKnowledgeStore.js';
import { PublicationKnowledgeSynchronizationCoordinator } from '../application/PublicationKnowledgeSynchronizationCoordinator.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { PublicationExchange } from '../application/PublicationExchange.js';
import { buildPublicationReplicaPackage } from '../application/PublicationReplicaPackage.js';
import { ImportPublicationReplicaPackageUseCase } from '../application/ImportPublicationReplicaPackageUseCase.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { ContentReference } from '../core/ContentReference.js';
import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';

// 0.8.31 — Replica Knowledge Provenance & Synchronization Inspection.
//
//   Section A: describePublicationReplicaKnowledgeDetail() argument
//              handling — composes application/
//              PublicationReplicaKnowledgeView.js (0.8.28, unchanged) for
//              the dimension-level counts/relationships, and application/
//              PublicationAnchorKnowledgeView.js/application/
//              PublicationAnchorVerificationLifecycleView.js (and their
//              placement-side siblings) for each claim row — never a new
//              derivation of any of those facts.
//   Section B: FLAGSHIP — Alice knows Anchor A/Placement X, Bob knows
//              Anchor B, Carol knows Placement Y, Dave starts knowing
//              nothing. Dave imports a Publication Replica Package from
//              Alice (entirely offline) for Anchor A/Placement X, then
//              connects LIVE to both Bob and Carol at once and runs ONE
//              PublicationKnowledgeSynchronizationCoordinator#synchronize()
//              call, receiving Anchor B from Bob and Placement Y from
//              Carol together. Dave's own replica knowledge detail view
//              then shows all four claims with their correct provenance
//              (A/X -> PACKAGE, B/Y -> PEER). Re-synchronizing changes
//              nothing (FIRST-SEEN-WINS). Restarting Dave (fresh
//              catalog/store instances over the identical underlying
//              storage) leaves the view byte-identical. Verifying Anchor A
//              and resolving Placement X afterward changes ONLY the
//              ephemeral verificationState/resolutionState fields for
//              those two claims — every durable fact (the claim set, its
//              relationship, and every claim's own acquisition/firstSeenAt)
//              stays byte-identical, proving provenance and lifecycle vary
//              completely independently of each other and of the claim set
//              itself.
//
// See docs/Principles.md, "Replica Knowledge Explains What Is Known And
// How It Was Acquired; It Does Not Judge What Should Be Trusted (0.8.31)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
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

// Rebuilds Dave's own full detail view straight from his own catalogs and
// knowledge stores — the exact sequence a real caller (ui/views/
// DecentralizedPublicationsView.js) runs.
function deriveDetail(publicationId, { hasPublication, anchorCatalog, anchorKnowledge, verificationObservationsByAnchorId = {}, placementCatalog, placementKnowledge, resolutionObservationsByPlacementId = {} }) {
    const anchors = anchorCatalog.findByPublicationId(publicationId);
    const placements = placementCatalog.findByPublicationId(publicationId);

    const evidenceConvergenceView = publicationEvidenceConvergenceView(derivePublicationEvidenceConvergence({ publicationId, anchors }));
    const placementConvergenceView = publicationSnapshotPlacementConvergenceView(derivePublicationSnapshotPlacementConvergence({ publicationId, placements }));

    const evidenceClaims = anchors.map((anchor) => ({
        anchorId: anchor.id,
        knowledgeRecord: anchorKnowledge.get(anchor.id),
        verificationObservations: verificationObservationsByAnchorId[anchor.id] || []
    }));
    const placementClaims = placements.map((placement) => ({
        placementId: placement.id,
        knowledgeRecord: placementKnowledge.get(placement.id),
        resolutionObservations: resolutionObservationsByPlacementId[placement.id] || []
    }));

    return describePublicationReplicaKnowledgeDetail({
        publicationId, hasPublication, evidenceConvergenceView, placementConvergenceView, evidenceClaims, placementClaims
    });
}

// Strips the two ephemeral fields off every claim row so the DURABLE
// remainder (claim id, acquisition, firstSeenAt) can be compared for
// byte-identity even after a verification/resolution attempt changes the
// ephemeral fields alone.
function stripLifecycle(view) {
    const clone = JSON.parse(JSON.stringify(view));
    for (const claim of clone.evidence.claims) { delete claim.verificationState; delete claim.verificationStateLabel; }
    for (const claim of clone.placements.claims) { delete claim.resolutionState; delete claim.resolutionStateLabel; }
    return clone;
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — argument handling
    // ---------------------------------------------------------------
    {
        expectThrows(() => describePublicationReplicaKnowledgeDetail({}), '1. still requires a publicationId (delegated to PublicationReplicaKnowledgeView)');

        const bare = describePublicationReplicaKnowledgeDetail({ publicationId: 'pub-bare' });
        assert(bare.publicationId === 'pub-bare', '2. publicationId passes through');
        assert(bare.publicationKnown === false, '3. publicationKnown defaults to false, mirroring hasPublication');
        assert(bare.evidence.count === 0 && bare.evidence.relationship === null && Array.isArray(bare.evidence.claims) && bare.evidence.claims.length === 0,
            '4. no claims, no convergence view -> an entirely empty, but never erroring, evidence dimension');
        assert(bare.placements.count === 0 && bare.placements.relationship === null && bare.placements.claims.length === 0,
            '5. same degrade for placements');

        const known = describePublicationReplicaKnowledgeDetail({
            publicationId: 'pub-known', hasPublication: true,
            evidenceConvergenceView: { anchorCount: 2, relationship: ContentBindingSetRelationship.AGREEMENT, hasConflict: false, contentGroups: [] }
        });
        assert(known.publicationKnown === true, '6. hasPublication: true passes through as publicationKnown');
        assert(known.evidence.count === 2 && known.evidence.relationship === ContentBindingSetRelationship.AGREEMENT,
            '7. dimension-level count/relationship come straight from the supplied convergence view, unmodified');
        assert(known.evidence.claims.length === 0, '8. a convergence view with a nonzero count still reports zero CLAIMS when none were supplied — this file never invents a claim row from a count alone');

        // A claim with no knowledge record at all — an entirely ordinary
        // result (see application/PublicationAnchorKnowledgeView.js's own
        // header), never an error.
        const noRecord = describePublicationReplicaKnowledgeDetail({
            publicationId: 'pub-no-record',
            evidenceClaims: [{ anchorId: 'anchor-x' }]
        });
        const rowNoRecord = noRecord.evidence.claims[0];
        assert(rowNoRecord.anchorId === 'anchor-x', '9. anchorId passes through');
        assert(rowNoRecord.acquisitionKind === null && rowNoRecord.acquisitionLabel === 'Local knowledge unavailable',
            '10. no knowledge record -> acquisitionKind null, understated label, never an error');
        assert(rowNoRecord.firstSeenAt === null, '11. no knowledge record -> no firstSeenAt');
        assert(rowNoRecord.verificationState === 'not-verified' && rowNoRecord.verificationStateLabel === 'Not yet verified',
            '12. no verification observations -> NOT_VERIFIED, worded identically to the existing per-anchor UI');

        // A real knowledge record, PEER, plus a real verification history.
        const peerRecord = createAnchorKnowledgeRecord({ anchorId: 'anchor-y', acquisitionKind: AnchorAcquisitionKind.PEER, firstSeenAt: new Date('2026-01-01T00:00:00.000Z') });
        const withPeer = describePublicationReplicaKnowledgeDetail({
            publicationId: 'pub-with-peer',
            evidenceClaims: [{
                anchorId: 'anchor-y',
                knowledgeRecord: peerRecord,
                verificationObservations: [createVerificationObservation({ anchorId: 'anchor-y', outcome: AnchorVerificationOutcome.VALID })]
            }]
        });
        const rowPeer = withPeer.evidence.claims[0];
        assert(rowPeer.acquisitionKind === AnchorAcquisitionKind.PEER, '13. acquisitionKind reflects the real record');
        assert(rowPeer.acquisitionLabel === 'Learned via peer exchange', '14. acquisitionLabel is the SAME understated wording application/PublicationAnchorKnowledgeView.js already established — no peer identity anywhere');
        assert(rowPeer.firstSeenAt === '2026-01-01T00:00:00.000Z', '15. firstSeenAt is the ISO string from the real record');
        assert(rowPeer.verificationState === 'verified' && rowPeer.verificationStateLabel === 'Verified', '16. a VALID observation lifts the state to VERIFIED');

        // The placement-side sibling, mirrored exactly.
        const placementRecord = createSnapshotPlacementKnowledgeRecord({ placementId: 'placement-z', acquisitionKind: PlacementAcquisitionKind.PACKAGE, firstSeenAt: new Date('2026-01-02T00:00:00.000Z') });
        const withPlacement = describePublicationReplicaKnowledgeDetail({
            publicationId: 'pub-with-placement',
            placementConvergenceView: { placementCount: 1, relationship: SnapshotPlacementRelationship.AGREEMENT, hasConflict: false, storageTypes: ['ipfs'], storageTypeCount: 1, locatorCount: 1, contentGroups: [] },
            placementClaims: [{
                placementId: 'placement-z',
                knowledgeRecord: placementRecord,
                resolutionObservations: [createResolutionObservation({ placementId: 'placement-z', outcome: SnapshotPlacementResolutionOutcome.CONTENT_UNAVAILABLE })]
            }]
        });
        const rowPlacement = withPlacement.placements.claims[0];
        assert(rowPlacement.placementId === 'placement-z', '17. placementId passes through');
        assert(rowPlacement.acquisitionKind === PlacementAcquisitionKind.PACKAGE && rowPlacement.acquisitionLabel === 'Learned via package import', '18. placement acquisition mirrors the anchor side');
        assert(rowPlacement.resolutionState === 'unavailable' && rowPlacement.resolutionStateLabel === 'Currently unavailable', '19. a CONTENT_UNAVAILABLE observation reports UNAVAILABLE, never "invalid"');
        assert(withPlacement.placements.count === 1 && withPlacement.placements.relationship === SnapshotPlacementRelationship.AGREEMENT, '20. dimension-level fields still come from the supplied convergence view');

        // describeAcquisitionBreakdown() — a plain, non-judgmental tally.
        const breakdown = describeAcquisitionBreakdown([
            { acquisitionKind: AnchorAcquisitionKind.PEER }, { acquisitionKind: AnchorAcquisitionKind.PACKAGE },
            { acquisitionKind: AnchorAcquisitionKind.PEER }, { acquisitionKind: null }, {}
        ]);
        assert(breakdown.peer === 2 && breakdown.package === 1 && breakdown.local === 0, '21. describeAcquisitionBreakdown() tallies exactly by acquisitionKind, ignoring rows with none');

        const serialized = JSON.stringify([bare, known, noRecord, withPeer, withPlacement]);
        assert(!/confidence|trust|score|preferredClaim|bestPlacement|reputation|authority|completeness|winner|canonical|rank/i.test(serialized),
            '22. no adjudicating or completeness-scoring vocabulary anywhere in this file\'s output');
        assert(!/alice|bob|carol|dave|"from"|peerIdentity/i.test(serialized), '23. no peer identity vocabulary anywhere — "Learned via peer exchange" never names who');

        assert(JSON.stringify(withPeer) === JSON.stringify(describePublicationReplicaKnowledgeDetail({
            publicationId: 'pub-with-peer',
            evidenceClaims: [{ anchorId: 'anchor-y', knowledgeRecord: peerRecord, verificationObservations: [createVerificationObservation({ anchorId: 'anchor-y', outcome: AnchorVerificationOutcome.VALID })] }]
        })), '24. PURITY: calling this twice with byte-identical arguments returns a byte-identical result');
    }
    console.log('✓ Section A: describePublicationReplicaKnowledgeDetail() argument handling — composes application/PublicationReplicaKnowledgeView.js for dimension-level facts and application/PublicationAnchorKnowledgeView.js/application/PublicationAnchorVerificationLifecycleView.js (and their placement-side siblings) for each claim row, with no new derivation, no adjudication vocabulary, and no peer identity anywhere');

    // ---------------------------------------------------------------
    // Section B — FLAGSHIP: four replicas, package + simultaneous
    // multi-peer synchronize, re-sync stability, restart, and the
    // durable/ephemeral independence proof
    // ---------------------------------------------------------------
    {
        const PUBLICATION_ID = 'pub-flagship-knowledge-detail';
        const CONTENT_HASH = 'hash-flagship-knowledge-detail';

        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carol = makeIdentity('Carol');
        const dave = makeIdentity('Dave');

        const publication = signPublication(alice, { id: PUBLICATION_ID, contentKind: 'forkbuild.structure', contentReference: new ContentReference({ hash: CONTENT_HASH }) });
        const anchorA = signAnchor(alice, { publicationId: PUBLICATION_ID, contentHash: CONTENT_HASH, anchorType: 'bitcoin-op-return', locator: 'bitcoin://tx/replica-detail-a' });
        const placementX = signPlacement(alice, { publicationId: PUBLICATION_ID, contentHash: CONTENT_HASH, storage: 'ipfs', locator: 'ipfs://CID-replica-detail-x' });
        const anchorB = signAnchor(bob, { publicationId: PUBLICATION_ID, contentHash: CONTENT_HASH, anchorType: 'transparency-log', locator: 'log://entry/replica-detail-b' });
        const placementY = signPlacement(carol, { publicationId: PUBLICATION_ID, contentHash: CONTENT_HASH, storage: 'local', locator: 'local://replica-detail-y' });

        // --- Dave: entirely offline import of Alice's package (Anchor A
        // + Placement X), exactly application/PublicationReplicaPackage.js's
        // own 0.8.29 transfer. No peer connection to Alice is ever
        // established anywhere in this test. ---
        const replicaPackage = buildPublicationReplicaPackage(publication, { anchors: [anchorA], placements: [placementX] });

        const davePublicationCatalogStorage = new InMemoryStorageProvider();
        const daveAnchorCatalogStorage = new InMemoryStorageProvider();
        const daveAnchorKnowledgeStorage = new InMemoryStorageProvider();
        const davePlacementCatalogStorage = new InMemoryStorageProvider();
        const davePlacementKnowledgeStorage = new InMemoryStorageProvider();

        let davePublicationCatalog = new LocalPublicationCatalog(davePublicationCatalogStorage);
        let daveAnchorCatalog = new LocalPublicationAnchorCatalog(daveAnchorCatalogStorage);
        let daveAnchorKnowledge = new LocalAnchorKnowledgeStore(daveAnchorKnowledgeStorage);
        let davePlacementCatalog = new LocalPublicationSnapshotPlacementCatalog(davePlacementCatalogStorage);
        let davePlacementKnowledge = new LocalPlacementKnowledgeStore(davePlacementKnowledgeStorage);

        const daveImporter = new ImportPublicationReplicaPackageUseCase(
            new PublicationExchange(davePublicationCatalog, new LocalAuthorizationVerifier()),
            new PublicationAnchorExchange(daveAnchorCatalog, new LocalAuthorizationVerifier()),
            new PublicationSnapshotPlacementExchange(davePlacementCatalog, new LocalAuthorizationVerifier()),
            { anchorKnowledgeStore: daveAnchorKnowledge, placementKnowledgeStore: davePlacementKnowledge }
        );
        daveImporter.execute(replicaPackage);
        assert(daveAnchorKnowledge.get(anchorA.id).acquisition.kind === AnchorAcquisitionKind.PACKAGE, '1. setup: Dave holds Anchor A via PACKAGE, entirely offline');
        assert(davePlacementKnowledge.get(placementX.id).acquisition.kind === PlacementAcquisitionKind.PACKAGE, '2. setup: Dave holds Placement X via PACKAGE, entirely offline');

        // --- Bob and Carol each independently catalog their own claim,
        // never each other's, and never Alice's. ---
        const bobAnchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
        const bobAnchorExchange = new PublicationAnchorExchange(bobAnchorCatalog, new LocalAuthorizationVerifier());
        bobAnchorExchange.importAnchor(anchorB.toJSON());

        const carolPlacementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const carolPlacementExchange = new PublicationSnapshotPlacementExchange(carolPlacementCatalog, new LocalAuthorizationVerifier());
        carolPlacementExchange.importPlacement(placementY.toJSON());

        // --- Dave connects LIVE to both Bob and Carol AT ONCE, and runs
        // ONE synchronize() call — the identical "every currently
        // authenticated peer, in registry order" policy application/
        // PublicationKnowledgeSynchronizationCoordinator.js (0.8.30)
        // already applies, now exercised against two peers who each know
        // something the OTHER does not. ---
        const network = new LocalPeerNetwork();
        const bobTransport = new LocalPeerConnectionProvider('bob-replica-detail', network);
        const carolTransport = new LocalPeerConnectionProvider('carol-replica-detail', network);
        const daveTransport = new LocalPeerConnectionProvider('dave-replica-detail', network);
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const carolConnect = new ConnectToPeerUseCase({ peerConnectionProvider: carolTransport, identityProvider: carol });
        const daveConnect = new ConnectToPeerUseCase({ peerConnectionProvider: daveTransport, identityProvider: dave });
        const stopBob = bobConnect.listen();
        const stopCarol = carolConnect.listen();
        const stopDave = daveConnect.listen();

        const daveToBob = daveConnect.connect({ candidateEndpoint: 'bob-replica-detail' });
        const daveToCarol = daveConnect.connect({ candidateEndpoint: 'carol-replica-detail' });
        await wait();
        assert(daveToBob.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '3. setup: Dave<->Bob authenticates');
        assert(daveToCarol.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '4. setup: Dave<->Carol authenticates');

        const bobAnchorPeerExchange = new PublicationAnchorPeerExchange(bobAnchorExchange, new PeerMessageBus(), bobConnect.registry, { knowledgeStore: new LocalAnchorKnowledgeStore(new InMemoryStorageProvider()) });
        const carolPlacementPeerExchange = new PublicationSnapshotPlacementPeerExchange(carolPlacementExchange, new PeerMessageBus(), carolConnect.registry, { knowledgeStore: new LocalPlacementKnowledgeStore(new InMemoryStorageProvider()) });
        // Bob/Carol each also need to be able to ANSWER the other
        // dimension's protocol (with nothing to offer) — the identical
        // "answers cleanly, offers nothing" shape a real peer with no
        // knowledge of a dimension already exhibits.
        const bobPlacementPeerExchange = new PublicationSnapshotPlacementPeerExchange(new PublicationSnapshotPlacementExchange(new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider()), new LocalAuthorizationVerifier()), new PeerMessageBus(), bobConnect.registry);
        const carolAnchorPeerExchange = new PublicationAnchorPeerExchange(new PublicationAnchorExchange(new LocalPublicationAnchorCatalog(new InMemoryStorageProvider()), new LocalAuthorizationVerifier()), new PeerMessageBus(), carolConnect.registry);

        let daveAnchorExchangeLive = new PublicationAnchorExchange(daveAnchorCatalog, new LocalAuthorizationVerifier());
        let davePlacementExchangeLive = new PublicationSnapshotPlacementExchange(davePlacementCatalog, new LocalAuthorizationVerifier());
        let daveAnchorPeerExchange = new PublicationAnchorPeerExchange(daveAnchorExchangeLive, new PeerMessageBus(), daveConnect.registry, { knowledgeStore: daveAnchorKnowledge });
        let davePlacementPeerExchange = new PublicationSnapshotPlacementPeerExchange(davePlacementExchangeLive, new PeerMessageBus(), daveConnect.registry, { knowledgeStore: davePlacementKnowledge });
        let daveAnchorDiscovery = new PublicationAnchorDiscoveryCoordinator(daveAnchorPeerExchange);
        let davePlacementDiscovery = new PublicationSnapshotPlacementDiscoveryCoordinator(davePlacementPeerExchange);
        let daveSyncCoordinator = new PublicationKnowledgeSynchronizationCoordinator(daveAnchorDiscovery, davePlacementDiscovery, daveConnect.registry);

        const firstSync = await daveSyncCoordinator.synchronize(PUBLICATION_ID, { timeoutMs: 200 });
        assert(firstSync.attemptedPeers.length === 2, '5. ONE synchronize() call asks both Bob and Carol together');
        assert(firstSync.anchors.newlyImportedCount === 1, '6. exactly Anchor B arrives as new (Bob is the only peer who has it)');
        assert(firstSync.placements.newlyImportedCount === 1, '7. exactly Placement Y arrives as new (Carol is the only peer who has it)');
        assert(daveAnchorCatalog.findByPublicationId(PUBLICATION_ID).length === 2, '8. Dave now knows both anchors');
        assert(davePlacementCatalog.findByPublicationId(PUBLICATION_ID).length === 2, '9. Dave now knows both placements');
        assert(daveAnchorKnowledge.get(anchorA.id).acquisition.kind === AnchorAcquisitionKind.PACKAGE, '10. Anchor A stays PACKAGE');
        assert(daveAnchorKnowledge.get(anchorB.id).acquisition.kind === AnchorAcquisitionKind.PEER, '11. Anchor B is recorded PEER');
        assert(davePlacementKnowledge.get(placementX.id).acquisition.kind === PlacementAcquisitionKind.PACKAGE, '12. Placement X stays PACKAGE');
        assert(davePlacementKnowledge.get(placementY.id).acquisition.kind === PlacementAcquisitionKind.PEER, '13. Placement Y is recorded PEER');

        let daveView = deriveDetail(PUBLICATION_ID, {
            hasPublication: davePublicationCatalog.has(PUBLICATION_ID),
            anchorCatalog: daveAnchorCatalog, anchorKnowledge: daveAnchorKnowledge,
            placementCatalog: davePlacementCatalog, placementKnowledge: davePlacementKnowledge
        });
        assert(daveView.publicationKnown === true, '14. Dave\'s detail view reports the publication as known');
        assert(daveView.evidence.count === 2 && daveView.evidence.relationship === ContentBindingSetRelationship.AGREEMENT, '15. two agreeing anchor claims');
        assert(daveView.placements.count === 2 && daveView.placements.relationship === SnapshotPlacementRelationship.AGREEMENT, '16. two agreeing placement claims');

        const evidenceById = Object.fromEntries(daveView.evidence.claims.map((c) => [c.anchorId, c]));
        assert(evidenceById[anchorA.id].acquisitionKind === AnchorAcquisitionKind.PACKAGE && evidenceById[anchorA.id].acquisitionLabel === 'Learned via package import', '17. Anchor A\'s claim row reports PACKAGE');
        assert(evidenceById[anchorB.id].acquisitionKind === AnchorAcquisitionKind.PEER && evidenceById[anchorB.id].acquisitionLabel === 'Learned via peer exchange', '18. Anchor B\'s claim row reports PEER, worded without naming Bob');
        assert(evidenceById[anchorA.id].verificationState === 'not-verified' && evidenceById[anchorB.id].verificationState === 'not-verified', '19. neither anchor has ever been verified by Dave — synchronization transfers claims, never observations');

        const placementsById = Object.fromEntries(daveView.placements.claims.map((c) => [c.placementId, c]));
        assert(placementsById[placementX.id].acquisitionKind === PlacementAcquisitionKind.PACKAGE, '20. Placement X\'s claim row reports PACKAGE');
        assert(placementsById[placementY.id].acquisitionKind === PlacementAcquisitionKind.PEER, '21. Placement Y\'s claim row reports PEER, worded without naming Carol');
        assert(placementsById[placementX.id].resolutionState === 'not-resolved' && placementsById[placementY.id].resolutionState === 'not-resolved', '22. neither placement has ever been resolved by Dave');

        const anchorBreakdown = describeAcquisitionBreakdown(daveView.evidence.claims);
        const placementBreakdown = describeAcquisitionBreakdown(daveView.placements.claims);
        assert(anchorBreakdown.package === 1 && anchorBreakdown.peer === 1, '23. the evidence acquisition breakdown reads 1 PACKAGE / 1 PEER');
        assert(placementBreakdown.package === 1 && placementBreakdown.peer === 1, '24. the placement acquisition breakdown reads 1 PACKAGE / 1 PEER');

        // --- Re-synchronize: FIRST-SEEN-WINS means nothing changes at
        // all, and the derived detail view is byte-identical. ---
        const resync = await daveSyncCoordinator.synchronize(PUBLICATION_ID, { timeoutMs: 200 });
        assert(resync.anchors.newlyImportedCount === 0 && resync.anchors.alreadyKnownCount === 1, '25. re-synchronizing reports zero new anchors (only Bob offers an anchor at all; Carol has none to report, and Anchor A is offered by no connected peer, so neither ever appears in a discovery response)');
        assert(resync.placements.newlyImportedCount === 0 && resync.placements.alreadyKnownCount === 1, '26. re-synchronizing reports zero new placements (only Carol offers a placement at all)');

        const daveViewAfterResync = deriveDetail(PUBLICATION_ID, {
            hasPublication: davePublicationCatalog.has(PUBLICATION_ID),
            anchorCatalog: daveAnchorCatalog, anchorKnowledge: daveAnchorKnowledge,
            placementCatalog: davePlacementCatalog, placementKnowledge: davePlacementKnowledge
        });
        assert(JSON.stringify(daveView) === JSON.stringify(daveViewAfterResync),
            '27. INVARIANT: re-synchronizing leaves Dave\'s replica knowledge detail view byte-identical — FIRST-SEEN-WINS holds through this milestone\'s own view exactly as it already holds through the underlying stores');

        daveAnchorPeerExchange.dispose();
        davePlacementPeerExchange.dispose();
        bobAnchorPeerExchange.dispose();
        bobPlacementPeerExchange.dispose();
        carolPlacementPeerExchange.dispose();
        carolAnchorPeerExchange.dispose();
        stopBob(); stopCarol(); stopDave();
        bobTransport.dispose(); carolTransport.dispose(); daveTransport.dispose();

        // --- Dave restarts: fresh catalog/store instances over the
        // IDENTICAL underlying storage. ---
        davePublicationCatalog = new LocalPublicationCatalog(davePublicationCatalogStorage);
        daveAnchorCatalog = new LocalPublicationAnchorCatalog(daveAnchorCatalogStorage);
        daveAnchorKnowledge = new LocalAnchorKnowledgeStore(daveAnchorKnowledgeStorage);
        davePlacementCatalog = new LocalPublicationSnapshotPlacementCatalog(davePlacementCatalogStorage);
        davePlacementKnowledge = new LocalPlacementKnowledgeStore(davePlacementKnowledgeStorage);

        const daveViewAfterRestart = deriveDetail(PUBLICATION_ID, {
            hasPublication: davePublicationCatalog.has(PUBLICATION_ID),
            anchorCatalog: daveAnchorCatalog, anchorKnowledge: daveAnchorKnowledge,
            placementCatalog: davePlacementCatalog, placementKnowledge: davePlacementKnowledge
        });
        assert(JSON.stringify(daveView) === JSON.stringify(daveViewAfterRestart),
            '28. INVARIANT: a full restart leaves Dave\'s replica knowledge detail view byte-identical — the claim set and every claim\'s own provenance survive; only ephemeral, per-process observation state could ever have changed, and none was ever established for Dave in this test to begin with');

        // --- Dave deliberately verifies Anchor A and resolves Placement
        // X. Only the EPHEMERAL verificationState/resolutionState fields
        // for those two specific claims may change; every durable fact —
        // the claim set, its relationship, and every claim's own
        // acquisition/firstSeenAt, INCLUDING Anchor B's and Placement Y's
        // own untouched verification/resolution state — must stay exactly
        // as it was. ---
        const verificationObservationsByAnchorId = { [anchorA.id]: [createVerificationObservation({ anchorId: anchorA.id, outcome: AnchorVerificationOutcome.VALID })] };
        const resolutionObservationsByPlacementId = { [placementX.id]: [createResolutionObservation({ placementId: placementX.id, outcome: SnapshotPlacementResolutionOutcome.RESOLVED })] };

        const daveViewAfterObservation = deriveDetail(PUBLICATION_ID, {
            hasPublication: davePublicationCatalog.has(PUBLICATION_ID),
            anchorCatalog: daveAnchorCatalog, anchorKnowledge: daveAnchorKnowledge, verificationObservationsByAnchorId,
            placementCatalog: davePlacementCatalog, placementKnowledge: davePlacementKnowledge, resolutionObservationsByPlacementId
        });

        const observedEvidenceById = Object.fromEntries(daveViewAfterObservation.evidence.claims.map((c) => [c.anchorId, c]));
        const observedPlacementsById = Object.fromEntries(daveViewAfterObservation.placements.claims.map((c) => [c.placementId, c]));
        assert(observedEvidenceById[anchorA.id].verificationState === 'verified', '29. Anchor A now reports VERIFIED');
        assert(observedEvidenceById[anchorB.id].verificationState === 'not-verified', '30. Anchor B is UNTOUCHED — verifying one claim never touches another\'s lifecycle');
        assert(observedPlacementsById[placementX.id].resolutionState === 'resolved', '31. Placement X now reports RESOLVED');
        assert(observedPlacementsById[placementY.id].resolutionState === 'not-resolved', '32. Placement Y is UNTOUCHED');

        assert(JSON.stringify(stripLifecycle(daveViewAfterRestart)) === JSON.stringify(stripLifecycle(daveViewAfterObservation)),
            '33. INVARIANT — THE FOUR-AXIS PROOF: with the ephemeral verificationState/resolutionState fields stripped from both views, EVERYTHING ELSE (publicationKnown, each dimension\'s count/relationship, and every claim\'s own anchorId/placementId/acquisitionKind/acquisitionLabel/firstSeenAt) is byte-identical before and after verifying Anchor A and resolving Placement X — claim and provenance are durable; verification and resolution are ephemeral; and neither axis leaks into the other');

        const serializedFinal = JSON.stringify(daveViewAfterObservation);
        assert(!/alice|bob|carol|"from"|peerIdentity|trust|confidence|score|reputation|authority|preferred|best[A-Z]|canonical/i.test(serializedFinal),
            '34. no peer identity and no adjudicating vocabulary anywhere in the final replica knowledge detail view');
    }
    console.log('✓ Section B: FLAGSHIP — Dave imports Anchor A/Placement X from an offline package (PACKAGE), then connects to Bob and Carol simultaneously and runs ONE synchronize() call to receive Anchor B/Placement Y (PEER) together; his replica knowledge detail view shows all four claims with correct provenance; re-synchronizing and a full restart both leave it byte-identical; and verifying Anchor A / resolving Placement X afterward changes ONLY the two ephemeral lifecycle fields for those two claims, proving claim/provenance stay durable while verification/resolution stay ephemeral and independent of every other claim');

    console.log('\nAll Publication Replica Knowledge Detail View tests passed.');
}

run().catch((error) => {
    console.error('PublicationReplicaKnowledgeDetailView.test.js FAILED:', error);
    process.exitCode = 1;
});
