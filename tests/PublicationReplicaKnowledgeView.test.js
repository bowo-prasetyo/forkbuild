import { derivePublicationEvidenceConvergence } from '../application/PublicationEvidenceConvergence.js';
import { publicationEvidenceConvergenceView } from '../application/PublicationEvidenceConvergenceView.js';
import { derivePublicationSnapshotPlacementConvergence } from '../application/PublicationSnapshotPlacementConvergence.js';
import { publicationSnapshotPlacementConvergenceView } from '../application/PublicationSnapshotPlacementConvergenceView.js';
import {
    describePublicationReplicaKnowledge, describeDecentralizationRelationshipContrast
} from '../application/PublicationReplicaKnowledgeView.js';
import { AnchorVerificationOutcome } from '../application/AnchorVerificationOutcome.js';
import { createVerificationObservation } from '../application/PublicationAnchorVerificationObservation.js';
import { SnapshotPlacementResolutionOutcome } from '../application/SnapshotPlacementResolutionOutcome.js';
import { createResolutionObservation } from '../application/SnapshotPlacementResolutionObservation.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { PublicationExchange } from '../application/PublicationExchange.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { ContentReference } from '../core/ContentReference.js';
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
import { ImportPackageSnapshotPlacementsUseCase } from '../application/ImportPackageSnapshotPlacementsUseCase.js';
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

// 0.8.28 — Offline Publication Reconstruction & Replica Knowledge.
//
//   Section A: describePublicationReplicaKnowledge() argument handling —
//              delegates to application/PublicationDecentralizationView.js
//              unchanged for the evidence/placement dimensions, adds
//              exactly one new fact (`hasPublication`), coerces whatever
//              it is handed to a plain boolean, and defaults to false
//              (never true) when omitted.
//   Section B: FLAGSHIP — Alice creates a publication, an anchor, and a
//              placement, then goes offline FOR GOOD — no peer
//              connection to her is ever established anywhere in this
//              test. Bob starts knowing nothing, imports a Blueprint
//              Package plus a hand-delivered publication envelope while
//              COMPLETELY OFFLINE, and reconstructs a full replica
//              knowledge view without Alice, without Bitcoin, without
//              IPFS, and without a single peer connection. His knowledge
//              then grows: he connects to Carol (who separately knows a
//              second, agreeing anchor and placement) and discovers both.
//              External systems are then simulated unavailable — Bob
//              observes UNAVAILABLE for both an anchor verification and a
//              placement resolution — and his replica knowledge view is
//              proven byte-identical before and after: KNOWN and
//              AVAILABLE are different axes. Finally Bob "restarts"
//              (fresh catalog/store instances over the identical
//              underlying storage) and his replica knowledge view comes
//              back byte-identical to what it was before the restart.
//
// See docs/Principles.md, "Replica Knowledge Describes What This Replica
// Possesses, Not What The World Has Proven (0.8.28)."

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

function signPublication(identityProvider, fields) {
    let publication = new DecentralizedPublication({ ...fields, publisherIdentity: identityProvider.getSigningIdentity().toJSON() });
    publication = publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
    return publication;
}

function brick(definitionId, x, y, z) {
    return new Brick({ definitionId, position: new Position(x, y, z) });
}

function farmstead() {
    return new Structure({
        id: 'farmstead-replica-knowledge', name: 'Farmstead', category: 'Architecture', description: 'A cozy farmstead.',
        bricks: [brick('core:wall_1x3', 0, 0, 0)]
    });
}

function fakeConvergenceView({ anchorCount = 0, relationship = null, hasConflict = false, contentGroups = [] } = {}) {
    return { anchorCount, relationship, hasConflict, contentGroups };
}

// Rebuilds a full replica knowledge view straight from a replica's own
// catalogs — the exact two-convergence-then-combine sequence a real
// caller (e.g. a future ui/views/ counterpart) would run.
function deriveReplicaKnowledge(publicationId, { hasPublication, anchors, placements }) {
    const evidenceConvergence = derivePublicationEvidenceConvergence({ publicationId, anchors });
    const evidenceConvergenceView = publicationEvidenceConvergenceView(evidenceConvergence);
    const placementConvergence = derivePublicationSnapshotPlacementConvergence({ publicationId, placements });
    const placementConvergenceView = publicationSnapshotPlacementConvergenceView(placementConvergence);
    return describePublicationReplicaKnowledge({ publicationId, hasPublication, evidenceConvergenceView, placementConvergenceView });
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — argument handling
    // ---------------------------------------------------------------
    {
        const bare = describePublicationReplicaKnowledge({ publicationId: 'pub-bare' });
        assert(bare.hasPublication === false, '1. hasPublication defaults to false when omitted');
        assert(bare.evidence.known === false && bare.placements.known === false,
            '2. no convergence views supplied -> both dimensions degrade exactly as application/PublicationDecentralizationView.js already does');

        expectThrows(() => describePublicationReplicaKnowledge({}), '3. still requires a publicationId (delegated to PublicationDecentralizationView)');

        const known = describePublicationReplicaKnowledge({ publicationId: 'pub-known', hasPublication: true });
        assert(known.hasPublication === true, '4. hasPublication: true passes through as true');

        const coerced = describePublicationReplicaKnowledge({ publicationId: 'pub-coerced', hasPublication: { some: 'truthy record' } });
        assert(coerced.hasPublication === true, '5. any truthy value (e.g. a caller\'s own publication record) coerces to true, never stored as-is');

        const falsy = describePublicationReplicaKnowledge({ publicationId: 'pub-falsy', hasPublication: null });
        assert(falsy.hasPublication === false, '6. null coerces to false, same as omitting the field entirely');

        const withEvidence = describePublicationReplicaKnowledge({
            publicationId: 'pub-with-evidence',
            hasPublication: true,
            evidenceConvergenceView: fakeConvergenceView({ anchorCount: 3, relationship: 'agreement' })
        });
        assert(withEvidence.evidence.known === true && withEvidence.evidence.anchorCount === 3,
            '7. evidence dimension is reported exactly as application/PublicationDecentralizationView.js would report it, unmodified');
        assert(withEvidence.placements.known === false, '8. placements dimension is independently known:false — hasPublication never leaks into it');

        assert(!('decentralizationScore' in bare) && !('confidence' in bare) && !('completeness' in bare) && !('trustLevel' in bare),
            '9. no numeric or verdict field of any kind — hasPublication is the ONLY new field this view adds over 0.8.27\'s own shape');

        assert(describeDecentralizationRelationshipContrast(withEvidence) === null,
            '10. the re-exported contrast helper still works unmodified over a replica knowledge view (one dimension unknown -> no contrast)');
    }
    console.log('✓ Section A: describePublicationReplicaKnowledge() argument handling — hasPublication coerces to a plain boolean, defaults to false, and is the only field added over application/PublicationDecentralizationView.js\'s own shape');

    // ---------------------------------------------------------------
    // Section B — FLAGSHIP: offline reconstruction, growth, outage,
    // restart
    // ---------------------------------------------------------------
    {
        const PUBLICATION_ID = 'pub-flagship-replica-knowledge';
        const CONTENT_HASH = 'hash-flagship-replica-knowledge';

        // --- Alice: creates everything, then is NEVER online again. No
        // peer transport is ever constructed for her anywhere in this
        // test — everything Bob ends up with came from a package and a
        // hand-delivered envelope, both plain JSON, both already sitting
        // on disk before this test's own network (constructed only for
        // Bob<->Carol, further below) exists at all. ---
        const alice = makeIdentity('Alice');
        const structure = farmstead();
        const publication = signPublication(alice, {
            id: PUBLICATION_ID,
            contentKind: 'forkbuild.structure',
            contentReference: new ContentReference({ hash: CONTENT_HASH })
        });
        const anchorA = signAnchor(alice, { publicationId: PUBLICATION_ID, contentHash: CONTENT_HASH, anchorType: 'bitcoin-op-return', locator: 'bitcoin://tx/replica-a' });
        const placementA = signPlacement(alice, { publicationId: PUBLICATION_ID, contentHash: CONTENT_HASH, storage: 'ipfs', locator: 'ipfs://CID-replica-a' });

        const alicePublicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const alicePublicationExchange = new PublicationExchange(alicePublicationCatalog, new LocalAuthorizationVerifier());
        const publicationJson = alicePublicationExchange.exportPublication(publication);

        const pkg = buildBlueprintPackage(structure, { anchors: [anchorA], placements: [placementA] });
        validateBlueprintPackage(pkg);

        // --- Bob: starts knowing NOTHING, and imports the package and
        // the publication envelope entirely offline — no network object
        // of any kind exists in this block. ---
        const bobPublicationCatalogStorage = new InMemoryStorageProvider();
        const bobAnchorCatalogStorage = new InMemoryStorageProvider();
        const bobAnchorKnowledgeStorage = new InMemoryStorageProvider();
        const bobPlacementCatalogStorage = new InMemoryStorageProvider();
        const bobPlacementKnowledgeStorage = new InMemoryStorageProvider();

        let bobPublicationCatalog = new LocalPublicationCatalog(bobPublicationCatalogStorage);
        let bobAnchorCatalog = new LocalPublicationAnchorCatalog(bobAnchorCatalogStorage);
        let bobAnchorKnowledge = new LocalAnchorKnowledgeStore(bobAnchorKnowledgeStorage);
        let bobPlacementCatalog = new LocalPublicationSnapshotPlacementCatalog(bobPlacementCatalogStorage);
        let bobPlacementKnowledge = new LocalPlacementKnowledgeStore(bobPlacementKnowledgeStorage);

        assert(bobPublicationCatalog.has(PUBLICATION_ID) === false && bobAnchorCatalog.findByPublicationId(PUBLICATION_ID).length === 0
            && bobPlacementCatalog.findByPublicationId(PUBLICATION_ID).length === 0,
            '1. setup: Bob starts knowing nothing at all about this publication');

        let bobAnchorExchange = new PublicationAnchorExchange(bobAnchorCatalog, new LocalAuthorizationVerifier());
        let bobPlacementExchange = new PublicationSnapshotPlacementExchange(bobPlacementCatalog, new LocalAuthorizationVerifier());
        let bobPublicationExchange = new PublicationExchange(bobPublicationCatalog, new LocalAuthorizationVerifier());

        bobPublicationExchange.importPublication(publicationJson);
        assert(bobPublicationCatalog.has(PUBLICATION_ID) === true, '2. Bob catalogs the hand-delivered publication envelope, entirely offline');

        const anchorImporter = new ImportPackageAnchorsUseCase(bobAnchorExchange, bobAnchorKnowledge);
        const anchorImportResult = anchorImporter.execute(pkg);
        assert(anchorImportResult.importedAnchors.length === 1, '3. Bob imports Anchor A from the Blueprint Package, entirely offline');
        assert(bobAnchorKnowledge.get(anchorA.id).acquisition.kind === AnchorAcquisitionKind.PACKAGE, '4. Bob\'s own knowledge store records PACKAGE for Anchor A');

        const placementImporter = new ImportPackageSnapshotPlacementsUseCase(bobPlacementExchange, bobPlacementKnowledge);
        const placementImportResult = placementImporter.execute(pkg);
        assert(placementImportResult.importedPlacements.length === 1, '5. Bob imports Placement A from the same Blueprint Package, entirely offline');
        assert(bobPlacementKnowledge.get(placementA.id).acquisition.kind === PlacementAcquisitionKind.PACKAGE, '6. Bob\'s own knowledge store records PACKAGE for Placement A');

        let bobView = deriveReplicaKnowledge(PUBLICATION_ID, {
            hasPublication: bobPublicationCatalog.has(PUBLICATION_ID),
            anchors: bobAnchorCatalog.findByPublicationId(PUBLICATION_ID),
            placements: bobPlacementCatalog.findByPublicationId(PUBLICATION_ID)
        });
        assert(bobView.hasPublication === true, '7. Bob\'s replica knowledge view reports the publication as known, offline, before any network object in this test exists');
        assert(bobView.evidence.known === true && bobView.evidence.anchorCount === 1 && bobView.evidence.hasConflict === false,
            '8. Bob knows exactly one anchor claim, no conflict — a single known claim never conflicts with itself');
        assert(bobView.placements.known === true && bobView.placements.placementCount === 1 && bobView.placements.hasConflict === false,
            '9. Bob knows exactly one placement claim, no conflict');
        const serializedBobEarly = JSON.stringify(bobView);
        assert(!/verif|resolv|lifecycle|acquisition|peer|package|firstSeen/i.test(serializedBobEarly),
            '10. no verification/resolution/acquisition/lifecycle vocabulary anywhere in the replica knowledge view — Bob\'s PACKAGE provenance stays entirely outside it');

        // --- Bob's knowledge grows: he connects to Carol, who
        // independently knows a second, agreeing anchor and placement,
        // and discovers both from her over a live peer connection. Alice
        // is never involved in this step, and is never connected to
        // anyone at any point in this test. ---
        const carol = makeIdentity('Carol');
        const anchorB = signAnchor(carol, { publicationId: PUBLICATION_ID, contentHash: CONTENT_HASH, anchorType: 'transparency-log', locator: 'log://entry/replica-b' });
        const placementB = signPlacement(carol, { publicationId: PUBLICATION_ID, contentHash: CONTENT_HASH, storage: 'local', locator: 'local://replica-b' });

        // Bob never needed a signing identity of his own until this
        // point — every earlier step in this test is pure import of
        // someone else's signed claims. He mints one now purely to
        // authenticate a peer connection with Carol.
        const bob = makeIdentity('Bob');
        const network = new LocalPeerNetwork();
        const bobTransport = new LocalPeerConnectionProvider('bob-replica-knowledge', network);
        const carolTransport = new LocalPeerConnectionProvider('carol-replica-knowledge', network);
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const stopBobListening = bobConnect.listen();
        const carolConnect = new ConnectToPeerUseCase({ peerConnectionProvider: carolTransport, identityProvider: carol });
        const stopCarolListening = carolConnect.listen();

        const bobToCarol = bobConnect.connect({ candidateEndpoint: 'carol-replica-knowledge' });
        await wait(30);
        assert(bobToCarol.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '11. setup: Bob<->Carol authenticates');

        {
            const carolAnchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
            const carolAnchorExchange = new PublicationAnchorExchange(carolAnchorCatalog, new LocalAuthorizationVerifier());
            carolAnchorExchange.importAnchor(anchorB.toJSON());

            const carolPlacementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
            const carolPlacementExchange = new PublicationSnapshotPlacementExchange(carolPlacementCatalog, new LocalAuthorizationVerifier());
            carolPlacementExchange.importPlacement(placementB.toJSON());

            const bobAnchorBus = new PeerMessageBus();
            const bobAnchorPeerExchange = new PublicationAnchorPeerExchange(bobAnchorExchange, bobAnchorBus, bobConnect.registry, { knowledgeStore: bobAnchorKnowledge });
            const bobAnchorCoordinator = new PublicationAnchorDiscoveryCoordinator(bobAnchorPeerExchange);
            const carolAnchorBus = new PeerMessageBus();
            const carolAnchorPeerExchange = new PublicationAnchorPeerExchange(carolAnchorExchange, carolAnchorBus, carolConnect.registry, { knowledgeStore: new LocalAnchorKnowledgeStore(new InMemoryStorageProvider()) });

            const bobPlacementBus = new PeerMessageBus();
            const bobPlacementPeerExchange = new PublicationSnapshotPlacementPeerExchange(bobPlacementExchange, bobPlacementBus, bobConnect.registry, { knowledgeStore: bobPlacementKnowledge });
            const bobPlacementCoordinator = new PublicationSnapshotPlacementDiscoveryCoordinator(bobPlacementPeerExchange);
            const carolPlacementBus = new PeerMessageBus();
            const carolPlacementPeerExchange = new PublicationSnapshotPlacementPeerExchange(carolPlacementExchange, carolPlacementBus, carolConnect.registry, { knowledgeStore: new LocalPlacementKnowledgeStore(new InMemoryStorageProvider()) });

            const bobToCarolLink = [bobToCarol];
            await bobAnchorCoordinator.discoverFromPeers(PUBLICATION_ID, bobToCarolLink, { timeoutMs: 200 });
            await bobPlacementCoordinator.discoverFromPeers(PUBLICATION_ID, bobToCarolLink, { timeoutMs: 200 });

            assert(bobAnchorCatalog.findByPublicationId(PUBLICATION_ID).length === 2, '12. Bob discovers Anchor B from Carol over a live peer connection');
            assert(bobPlacementCatalog.findByPublicationId(PUBLICATION_ID).length === 2, '13. Bob discovers Placement B from Carol over the same peer connection');
            assert(bobAnchorKnowledge.get(anchorB.id).acquisition.kind === AnchorAcquisitionKind.PEER, '14. Bob\'s knowledge store records PEER for Anchor B — distinct from Anchor A\'s PACKAGE');
            assert(bobPlacementKnowledge.get(placementB.id).acquisition.kind === PlacementAcquisitionKind.PEER, '15. Bob\'s knowledge store records PEER for Placement B');

            bobAnchorPeerExchange.dispose();
            carolAnchorPeerExchange.dispose();
            bobPlacementPeerExchange.dispose();
            carolPlacementPeerExchange.dispose();
        }

        bobView = deriveReplicaKnowledge(PUBLICATION_ID, {
            hasPublication: bobPublicationCatalog.has(PUBLICATION_ID),
            anchors: bobAnchorCatalog.findByPublicationId(PUBLICATION_ID),
            placements: bobPlacementCatalog.findByPublicationId(PUBLICATION_ID)
        });
        assert(bobView.evidence.anchorCount === 2 && bobView.evidence.hasConflict === false,
            '16. Bob\'s knowledge expands to two agreeing anchor claims (Anchor A and Anchor B, same content hash)');
        assert(bobView.placements.placementCount === 2 && bobView.placements.hasConflict === false,
            '17. Bob\'s knowledge expands to two agreeing placement claims (Placement A and Placement B)');
        assert(bobView.hasPublication === true, '18. hasPublication is unaffected by the growth in evidence/placements — it is an independent fact');

        stopBobListening();
        stopCarolListening();
        bobTransport.dispose();
        carolTransport.dispose();

        // --- External systems disappear: Bob makes his own local
        // observations — an anchor verification and a placement
        // resolution, BOTH reporting the external system unreachable —
        // and his replica knowledge view is proven unmoved. Known and
        // available are different axes. ---
        createVerificationObservation({ anchorId: anchorA.id, outcome: AnchorVerificationOutcome.PROOF_UNAVAILABLE });
        createResolutionObservation({ placementId: placementA.id, outcome: SnapshotPlacementResolutionOutcome.CONTENT_UNAVAILABLE });

        const bobViewBeforeOutage = bobView;
        const bobViewDuringOutage = deriveReplicaKnowledge(PUBLICATION_ID, {
            hasPublication: bobPublicationCatalog.has(PUBLICATION_ID),
            anchors: bobAnchorCatalog.findByPublicationId(PUBLICATION_ID),
            placements: bobPlacementCatalog.findByPublicationId(PUBLICATION_ID)
        });
        assert(JSON.stringify(bobViewBeforeOutage) === JSON.stringify(bobViewDuringOutage),
            '19. INVARIANT: Bob\'s replica knowledge view is byte-identical whether or not the external systems his own claims name are reachable — KNOWN + UNAVAILABLE changes nothing about what this replica knows');

        // --- Bob restarts: fresh catalog/store instances over the
        // IDENTICAL underlying storage (nothing new is ever save()d in
        // this block) — the same technique tests/
        // PersistentPublicationAnchorCatalog.test.js's own flagship
        // restart section uses. ---
        bobPublicationCatalog = new LocalPublicationCatalog(bobPublicationCatalogStorage);
        bobAnchorCatalog = new LocalPublicationAnchorCatalog(bobAnchorCatalogStorage);
        bobAnchorKnowledge = new LocalAnchorKnowledgeStore(bobAnchorKnowledgeStorage);
        bobPlacementCatalog = new LocalPublicationSnapshotPlacementCatalog(bobPlacementCatalogStorage);
        bobPlacementKnowledge = new LocalPlacementKnowledgeStore(bobPlacementKnowledgeStorage);

        assert(bobPublicationCatalog.has(PUBLICATION_ID) === true, '20. after restart: the publication survives, unchanged, over the same storage');
        assert(bobAnchorCatalog.findByPublicationId(PUBLICATION_ID).length === 2, '21. after restart: both anchors survive');
        assert(bobPlacementCatalog.findByPublicationId(PUBLICATION_ID).length === 2, '22. after restart: both placements survive');
        assert(bobAnchorKnowledge.get(anchorA.id).acquisition.kind === AnchorAcquisitionKind.PACKAGE
            && bobAnchorKnowledge.get(anchorB.id).acquisition.kind === AnchorAcquisitionKind.PEER,
            '23. after restart: each anchor\'s own acquisition provenance survives exactly as it was');
        assert(bobPlacementKnowledge.get(placementA.id).acquisition.kind === PlacementAcquisitionKind.PACKAGE
            && bobPlacementKnowledge.get(placementB.id).acquisition.kind === PlacementAcquisitionKind.PEER,
            '24. after restart: each placement\'s own acquisition provenance survives exactly as it was');

        const bobViewAfterRestart = deriveReplicaKnowledge(PUBLICATION_ID, {
            hasPublication: bobPublicationCatalog.has(PUBLICATION_ID),
            anchors: bobAnchorCatalog.findByPublicationId(PUBLICATION_ID),
            placements: bobPlacementCatalog.findByPublicationId(PUBLICATION_ID)
        });
        assert(JSON.stringify(bobViewBeforeOutage) === JSON.stringify(bobViewAfterRestart),
            '25. INVARIANT: Bob\'s replica knowledge view is byte-identical across a full restart — the claims and the publication survive; nothing about this derived view ever depended on the process that computed it earlier still running');

        const serializedFinal = JSON.stringify(bobViewAfterRestart);
        assert(!/authorit|trust|winner|consensus|correct|malicious|reject|best|preferred|confident|likely|canonical|score|decentralizationScore|completeness/i.test(serializedFinal),
            '26. no adjudicating or completeness-scoring language anywhere in the final replica knowledge view');
        assert(!/peer|package|acquisition|firstSeen|learned|verif|resolv|lifecycle|alice|carol|bob/i.test(serializedFinal),
            '27. no acquisition provenance, no lifecycle vocabulary, and no identity name anywhere in the replica knowledge view — every one of those facts stayed exactly where it already lived, entirely outside this file');
    }
    console.log('✓ Section B: FLAGSHIP — Bob reconstructs a full replica knowledge view from a Blueprint Package and a hand-delivered publication envelope while completely offline (Alice is never connected to anyone, anywhere in this test); his knowledge then grows via a live peer connection to Carol; an external outage (both PROOF_UNAVAILABLE and CONTENT_UNAVAILABLE observations) leaves his replica knowledge view byte-identical; and a full restart (fresh catalog/store instances over the identical underlying storage) leaves it byte-identical again — the publication, its evidence, and its placements all survive; only ephemeral, per-process observation state ever could have changed, and it was never part of this view to begin with');

    console.log('\nAll Publication Replica Knowledge View tests passed.');
}

run().catch((error) => {
    console.error('PublicationReplicaKnowledgeView.test.js FAILED:', error);
    process.exitCode = 1;
});
