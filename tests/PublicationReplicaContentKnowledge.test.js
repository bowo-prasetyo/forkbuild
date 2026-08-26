import { describePublicationReplicaKnowledge } from '../application/PublicationReplicaKnowledgeView.js';
import { derivePublicationEvidenceConvergence } from '../application/PublicationEvidenceConvergence.js';
import { publicationEvidenceConvergenceView } from '../application/PublicationEvidenceConvergenceView.js';
import { derivePublicationSnapshotPlacementConvergence } from '../application/PublicationSnapshotPlacementConvergence.js';
import { publicationSnapshotPlacementConvergenceView } from '../application/PublicationSnapshotPlacementConvergenceView.js';
import { describePublicationSnapshotPossession, isSnapshotPossessed } from '../application/PublicationSnapshotPossessionView.js';
import { describePublicationReplicaContentKnowledge } from '../application/PublicationReplicaContentKnowledgeView.js';

import { CheckLocalSnapshotContentAvailabilityUseCase } from '../application/CheckLocalSnapshotContentAvailabilityUseCase.js';
import { LocalSnapshotContentAvailabilityOutcome } from '../application/LocalSnapshotContentAvailabilityOutcome.js';

import { buildPublicationReplicaPackage } from '../application/PublicationReplicaPackage.js';
import { ImportPublicationReplicaPackageUseCase } from '../application/ImportPublicationReplicaPackageUseCase.js';
import { BuildPublicationSnapshotTransferPackageUseCase } from '../application/BuildPublicationSnapshotTransferPackageUseCase.js';
import { ImportPublicationSnapshotTransferPackageUseCase } from '../application/ImportPublicationSnapshotTransferPackageUseCase.js';
import { SnapshotContentTransferOutcome } from '../application/SnapshotContentTransferOutcome.js';

import { CreateSnapshotPlacementOrchestratorUseCase } from '../application/CreateSnapshotPlacementOrchestratorUseCase.js';
import { CreateSnapshotPlacementResolutionCoordinatorUseCase } from '../application/CreateSnapshotPlacementResolutionCoordinatorUseCase.js';
import { MaterializeSnapshotFromPlacementUseCase } from '../application/MaterializeSnapshotFromPlacementUseCase.js';
import { SnapshotPlacementMaterializationOutcome } from '../application/SnapshotPlacementMaterializationOutcome.js';
import { PublicationResolver } from '../application/PublicationResolver.js';
import { PublicationCatalogDiscoveryProvider } from '../discovery/PublicationCatalogDiscoveryProvider.js';
import { PublicationCatalogContentResolver } from '../discovery/PublicationCatalogContentResolver.js';

import { MaterializeSnapshotFromPeerUseCase } from '../application/MaterializeSnapshotFromPeerUseCase.js';
import { PeerSnapshotMaterializationOutcome } from '../application/PeerSnapshotMaterializationOutcome.js';

import { StoreSnapshotContentUseCase } from '../application/StoreSnapshotContentUseCase.js';
import { StoreSnapshotContentOutcome } from '../application/StoreSnapshotContentOutcome.js';
import { createSnapshotMaterializationAttempt } from '../application/SnapshotMaterializationAttempt.js';
import { appendSnapshotMaterializationHistoryEntry } from '../application/SnapshotMaterializationHistory.js';

import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { LocalPublicationAnchorCatalog } from '../application/LocalPublicationAnchorCatalog.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { PublicationExchange } from '../application/PublicationExchange.js';
import { PublicationAnchorExchange } from '../application/PublicationAnchorExchange.js';
import { PublicationSnapshotPlacementExchange } from '../application/PublicationSnapshotPlacementExchange.js';

import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { IpfsContentStore } from '../content/IpfsContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { computeContentHash } from '../serializer/contentHash.js';

// 0.8.39 — Local Snapshot Possession & Replica Content Knowledge.
//
// FLAGSHIP: Alice publishes a publication P, anchors it externally, places
// a snapshot of it on IPFS, and holds the bytes locally. She builds ONE
// Publication Replica Package (0.8.29) bundling P's own anchor and
// placement claims — no bytes — and hands it to four entirely separate
// replicas: Bob, Carol, Dave, and Eve. Each imports the IDENTICAL replica
// package, so each ends up with IDENTICAL replica knowledge (0.8.28):
// `hasPublication: true`, one known anchor, one known placement. From
// there the four diverge:
//
//   Bob   — imports a Publication Snapshot Transfer Package (0.8.32) on
//           top of the replica package: hasValidSnapshot TRUE.
//   Carol — materializes the snapshot from the placement (0.8.35): also
//           hasValidSnapshot TRUE, through a completely different
//           mechanism than Bob's.
//   Dave  — does nothing further: hasValidSnapshot FALSE, and his own
//           materialization history is EMPTY — he never attempted anything.
//   Eve   — attempts "Get Snapshot from Peer" (0.8.37) against a peer that
//           answers with the WRONG bytes: a HASH_MISMATCH entry lands in
//           HER OWN materialization history (0.8.38), yet her current
//           possession still reports NOT_AVAILABLE — hasValidSnapshot
//           FALSE, identical to Dave's.
//
// The flagship proves the exact claim this milestone exists to make:
// replica knowledge, materialization history, and current content
// possession are THREE INDEPENDENT FACTS. Dave and Eve arrive at the
// IDENTICAL `hasValidSnapshot: false` through DIFFERENT histories (empty
// vs. one rejected attempt) — proving history never determines current
// possession. Bob and Carol arrive at the IDENTICAL `hasValidSnapshot: true`
// through DIFFERENT sources (PACKAGE vs. PLACEMENT) — proving current
// possession never reveals, or depends on, which mechanism supplied it.
// And all four report the IDENTICAL replica knowledge regardless of any
// of this — proving that dimension never moves in response to either of
// the other two.
//
// See docs/Principles.md, "Current Snapshot Possession Is A Local
// Observation, Not A Distributed Claim (0.8.39)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
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
    return anchor.withSignature(identityProvider.signCanonical(anchor.getSigningDescriptor()));
}

function fakeCid(text) {
    return 'bafyFAKE' + computeContentHash(text);
}

// The identical fake Kubo HTTP RPC API tests/SnapshotMaterializationHistory
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

// A minimal fake application/PublicationSnapshotContentPeerExchange.js,
// mirroring tests/SnapshotMaterializationHistory.test.js's own FakeExchange
// exactly — deterministic and scriptable.
class FakeExchange {
    constructor() { this._listeners = new Set(); }
    request() {}
    onContentReceived(callback) { this._listeners.add(callback); return () => this._listeners.delete(callback); }
    deliver(event) { for (const listener of Array.from(this._listeners)) listener(event); }
}

// A fresh replica's own three catalogs plus the exchanges that import a
// Publication Replica Package into them — mirroring tests/
// LocalSnapshotContentAvailability.test.js's own per-replica setup exactly.
function makeReplica() {
    const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
    const anchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
    const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
    const contentStore = new LocalContentStore(new InMemoryStorageProvider());

    const publicationExchange = new PublicationExchange(publicationCatalog, new LocalAuthorizationVerifier());
    const anchorExchange = new PublicationAnchorExchange(anchorCatalog, new LocalAuthorizationVerifier());
    const placementExchange = new PublicationSnapshotPlacementExchange(placementCatalog, new LocalAuthorizationVerifier());
    const replicaImporter = new ImportPublicationReplicaPackageUseCase(publicationExchange, anchorExchange, placementExchange);

    return { publicationCatalog, anchorCatalog, placementCatalog, contentStore, replicaImporter };
}

// The identical outer-to-inner outcome mapping ui/views/
// DecentralizedPublicationsView.js's own mapPackageOutcomeToStoreOutcome()/
// mapPlacementOutcomeToStoreOutcome()/mapPeerOutcomeToStoreOutcome()
// perform, reused here so this flagship builds each replica's own
// materialization history from real use-case results exactly as that view
// does.
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
function recordHistoryEntry(history, { sourceKind, outcome, publicationId, contentHash, contentReference }) {
    if (!sourceKind || !outcome) return history;
    const attempt = createSnapshotMaterializationAttempt({ sourceKind, outcome, contentReference, publicationId, contentHash });
    return appendSnapshotMaterializationHistoryEntry(history, attempt);
}

// Alice's own publication center — mirrors tests/
// SnapshotMaterializationHistory.test.js's own makePublicationCenter()
// exactly, so a real, signed IPFS placement can be created through the
// SAME orchestrator every other flagship test in this codebase already
// uses, rather than this file guessing at a hand-built placement's own
// field shape.
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

async function run() {
    const network = new Map();
    const { fetchImpl } = makeFakeIpfsNode(network);
    const SNAPSHOT_CONTENT = { flagship: '0.8.39' };

    // --- Alice: publishes P, holds S locally, anchors it externally,
    // places it on IPFS, and builds ONE replica package + ONE transfer
    // package to hand to every downstream replica. ---
    const aliceIdentity = makeIdentity('Alice-ContentKnowledge');
    const aliceIpfs = new IpfsContentStore({ apiUrl: 'http://alice-content-knowledge-node.test:5001', fetchImpl });
    const { publicationCatalog: alicePublicationCatalog, publicationContentStore: aliceContentStore, publicationResolver,
        identityProvider, createExternalSnapshotPlacementUseCase } = makePublicationCenter({ stores: [aliceIpfs], identityProvider: aliceIdentity });

    const publication = await publicationResolver.publish({ content: SNAPSHOT_CONTENT, contentKind: 'forkbuild.structure', identityProvider });
    alicePublicationCatalog.add(publication);
    const PUBLICATION_ID = publication.id;
    const contentReference = publication.contentReference;

    const anchor = signAnchor(identityProvider, {
        publicationId: PUBLICATION_ID, contentHash: contentReference.hash,
        anchorType: 'bitcoin-op-return', locator: 'https://example.test/tx/flagship-0839'
    });
    const { placement } = await createExternalSnapshotPlacementUseCase.execute(PUBLICATION_ID, 'ipfs');

    const replicaPackage = buildPublicationReplicaPackage(publication, { anchors: [anchor], placements: [placement] });
    const transferPackage = await new BuildPublicationSnapshotTransferPackageUseCase({
        publicationCatalog: alicePublicationCatalog, contentStore: aliceContentStore
    }).execute(PUBLICATION_ID);

    // --- Every replica below starts from the IDENTICAL replica package. ---
    const bob = makeReplica();
    bob.replicaImporter.execute(replicaPackage);
    const carol = makeReplica();
    carol.replicaImporter.execute(replicaPackage);
    const dave = makeReplica();
    dave.replicaImporter.execute(replicaPackage);
    const eve = makeReplica();
    eve.replicaImporter.execute(replicaPackage);

    // --- Replica knowledge (0.8.28) is IDENTICAL across all four — none
    // of what follows ever touches a publication, anchor, or placement
    // catalog again. ---
    function replicaKnowledgeFor(replica) {
        const anchors = replica.anchorCatalog.findByPublicationId(PUBLICATION_ID);
        const placements = replica.placementCatalog.findByPublicationId(PUBLICATION_ID);
        const evidenceConvergenceView = publicationEvidenceConvergenceView(
            derivePublicationEvidenceConvergence({ publicationId: PUBLICATION_ID, expectedContentHash: contentReference.hash, anchors })
        );
        const placementConvergenceView = publicationSnapshotPlacementConvergenceView(
            derivePublicationSnapshotPlacementConvergence({ publicationId: PUBLICATION_ID, placements })
        );
        return describePublicationReplicaKnowledge({
            publicationId: PUBLICATION_ID,
            hasPublication: replica.publicationCatalog.has(PUBLICATION_ID),
            evidenceConvergenceView,
            placementConvergenceView
        });
    }
    const bobKnowledgeBefore = replicaKnowledgeFor(bob);
    const carolKnowledgeBefore = replicaKnowledgeFor(carol);
    const daveKnowledge = replicaKnowledgeFor(dave);
    const eveKnowledgeBefore = replicaKnowledgeFor(eve);
    assert(bobKnowledgeBefore.hasPublication && carolKnowledgeBefore.hasPublication && daveKnowledge.hasPublication && eveKnowledgeBefore.hasPublication,
        '1. all four replicas know the publication — the identical replica package delivered the identical envelope to each');
    assert(bob.anchorCatalog.findByPublicationId(PUBLICATION_ID).length === 1 && bob.placementCatalog.findByPublicationId(PUBLICATION_ID).length === 1,
        '2. Bob knows exactly one anchor and one placement claim, from the replica package alone');
    assert(dave.anchorCatalog.findByPublicationId(PUBLICATION_ID).length === 1 && dave.placementCatalog.findByPublicationId(PUBLICATION_ID).length === 1,
        '3. Dave — who will NEVER obtain the snapshot bytes — knows the identical one anchor and one placement claim as Bob');

    // --- Bob: imports the transfer package on top of his replica package (PACKAGE). ---
    let bobHistory = [];
    const bobResult = await new ImportPublicationSnapshotTransferPackageUseCase(
        new StoreSnapshotContentUseCase(bob.contentStore), bob.publicationCatalog
    ).execute(transferPackage);
    assert(bobResult.outcome === SnapshotContentTransferOutcome.STORED, '4. Bob imports the transfer package — STORED');
    bobHistory = recordHistoryEntry(bobHistory, {
        sourceKind: bobResult.source.kind, outcome: mapPackageOutcome(bobResult.outcome),
        publicationId: bobResult.publicationId, contentHash: transferPackage.contentHash, contentReference: bobResult.contentReference
    });

    // --- Carol: materializes the snapshot from the placement she already
    // knows about (PLACEMENT), resolving against Alice's real IPFS node. ---
    const carolIpfsForRetrieval = new IpfsContentStore({ apiUrl: 'http://alice-content-knowledge-node.test:5001', fetchImpl });
    const { coordinator: carolResolutionCoordinator } = new CreateSnapshotPlacementResolutionCoordinatorUseCase().execute({
        placementCatalog: carol.placementCatalog, stores: [carolIpfsForRetrieval]
    });
    const carolMaterializeUseCase = new MaterializeSnapshotFromPlacementUseCase(
        carolResolutionCoordinator, new StoreSnapshotContentUseCase(carol.contentStore), carol.publicationCatalog
    );
    let carolHistory = [];
    const carolResult = await carolMaterializeUseCase.execute(placement);
    assert(carolResult.outcome === SnapshotPlacementMaterializationOutcome.STORED, '5. Carol materializes the snapshot from the placement — STORED');
    carolHistory = recordHistoryEntry(carolHistory, {
        sourceKind: carolResult.source.kind, outcome: mapPlacementOutcome(carolResult.outcome),
        publicationId: carolResult.publicationId, contentHash: carolResult.contentHash, contentReference: carolResult.contentReference
    });

    // --- Dave: does nothing further. His materialization history stays
    // empty — he never attempted anything. ---
    const daveHistory = [];

    // --- Eve: attempts "Get Snapshot from Peer" against a peer that
    // answers with the WRONG bytes (HASH_MISMATCH) — recorded in HER OWN
    // history, but never stored (0.8.36's own StoreSnapshotContentUseCase
    // rejects mismatched bytes outright). ---
    let eveHistory = [];
    const eveExchange = new FakeExchange();
    const eveUseCase = new MaterializeSnapshotFromPeerUseCase(
        eveExchange, new StoreSnapshotContentUseCase(eve.contentStore), eve.publicationCatalog, { timeoutMs: 200 }
    );
    const evePending = eveUseCase.execute({ peer: { connectionId: 'conn-mallory' }, publicationId: PUBLICATION_ID, contentHash: contentReference.hash });
    eveExchange.deliver({ publicationId: PUBLICATION_ID, contentHash: contentReference.hash, bytes: '{"tampered":"by Mallory"}' });
    const eveResult = await evePending;
    assert(eveResult.outcome === PeerSnapshotMaterializationOutcome.HASH_MISMATCH, '6. Eve\'s peer answers with the wrong bytes — HASH_MISMATCH');
    eveHistory = recordHistoryEntry(eveHistory, {
        sourceKind: eveResult.source.kind, outcome: mapPeerOutcome(eveResult.outcome),
        publicationId: eveResult.publicationId, contentHash: eveResult.contentHash, contentReference: eveResult.contentReference
    });

    // --- Materialization history (0.8.38): Bob and Carol each hold
    // exactly one SUCCESSFUL entry, through different sources. Dave holds
    // NONE. Eve holds exactly one REJECTED entry. ---
    assert(bobHistory.length === 1 && carolHistory.length === 1 && daveHistory.length === 0 && eveHistory.length === 1,
        '7. Bob and Carol each have a one-entry history; Dave\'s is empty; Eve\'s holds exactly one (rejected) entry');
    assert(eveHistory[0].outcome === StoreSnapshotContentOutcome.HASH_MISMATCH, '8. Eve\'s one history entry is a rejection, not a success');

    // --- Current possession (0.8.33, wrapped by this milestone's own
    // 0.8.39 possession view): Bob and Carol are AVAILABLE; Dave and Eve
    // are BOTH NOT_AVAILABLE, despite their completely different histories. ---
    const bobPossession = describePublicationSnapshotPossession(await new CheckLocalSnapshotContentAvailabilityUseCase(bob.contentStore).execute(bob.publicationCatalog.get(PUBLICATION_ID)));
    const carolPossession = describePublicationSnapshotPossession(await new CheckLocalSnapshotContentAvailabilityUseCase(carol.contentStore).execute(carol.publicationCatalog.get(PUBLICATION_ID)));
    const davePossession = describePublicationSnapshotPossession(await new CheckLocalSnapshotContentAvailabilityUseCase(dave.contentStore).execute(dave.publicationCatalog.get(PUBLICATION_ID)));
    const evePossession = describePublicationSnapshotPossession(await new CheckLocalSnapshotContentAvailabilityUseCase(eve.contentStore).execute(eve.publicationCatalog.get(PUBLICATION_ID)));

    assert(bobPossession.possession.state === LocalSnapshotContentAvailabilityOutcome.AVAILABLE, '9. Bob currently possesses the snapshot');
    assert(carolPossession.possession.state === LocalSnapshotContentAvailabilityOutcome.AVAILABLE, '10. Carol currently possesses the snapshot — through a completely different mechanism than Bob');
    assert(davePossession.possession.state === LocalSnapshotContentAvailabilityOutcome.NOT_AVAILABLE, '11. Dave does not currently possess the snapshot');
    assert(evePossession.possession.state === LocalSnapshotContentAvailabilityOutcome.NOT_AVAILABLE,
        '12. INVARIANT: Eve does not currently possess the snapshot EITHER — her own HASH_MISMATCH history entry never implied possession, exactly as 0.8.38 already established, now reconfirmed from the 0.8.39 possession angle');
    assert(davePossession.possession.state === evePossession.possession.state,
        '13. Dave (empty history) and Eve (one rejected history entry) land on the IDENTICAL current possession state — proving history length/content never determines current possession');

    // --- Replica content knowledge (THIS milestone): the final, tiny
    // composed view for all four replicas. ---
    const bobContentKnowledge = describePublicationReplicaContentKnowledge({ publicationId: PUBLICATION_ID, hasPublication: bob.publicationCatalog.has(PUBLICATION_ID), possession: bobPossession });
    const carolContentKnowledge = describePublicationReplicaContentKnowledge({ publicationId: PUBLICATION_ID, hasPublication: carol.publicationCatalog.has(PUBLICATION_ID), possession: carolPossession });
    const daveContentKnowledge = describePublicationReplicaContentKnowledge({ publicationId: PUBLICATION_ID, hasPublication: dave.publicationCatalog.has(PUBLICATION_ID), possession: davePossession });
    const eveContentKnowledge = describePublicationReplicaContentKnowledge({ publicationId: PUBLICATION_ID, hasPublication: eve.publicationCatalog.has(PUBLICATION_ID), possession: evePossession });

    assert(bobContentKnowledge.hasPublication && bobContentKnowledge.hasValidSnapshot, '14. Bob: publication known, snapshot available');
    assert(carolContentKnowledge.hasPublication && carolContentKnowledge.hasValidSnapshot, '15. Carol: publication known, snapshot available');
    assert(daveContentKnowledge.hasPublication && !daveContentKnowledge.hasValidSnapshot, '16. Dave: publication known, snapshot NOT available');
    assert(eveContentKnowledge.hasPublication && !eveContentKnowledge.hasValidSnapshot, '17. Eve: publication known, snapshot NOT available — identical outward knowledge to Dave, despite her own distinct (and unsuccessful) materialization attempt');

    assert(isSnapshotPossessed(bobPossession) && isSnapshotPossessed(carolPossession) && !isSnapshotPossessed(davePossession) && !isSnapshotPossessed(evePossession),
        '18. isSnapshotPossessed() agrees with hasValidSnapshot for every one of the four replicas');

    // --- Replica knowledge (0.8.28), re-derived AFTER every materialization
    // attempt above, is STILL identical for all four — evidence/placement
    // discovery never moved because a snapshot was, or was not, possessed. ---
    const bobKnowledgeAfter = replicaKnowledgeFor(bob);
    const eveKnowledgeAfter = replicaKnowledgeFor(eve);
    assert(bobKnowledgeAfter.evidence.anchorCount === 1 && bobKnowledgeAfter.placements.placementCount === 1
        && daveKnowledge.evidence.anchorCount === 1 && daveKnowledge.placements.placementCount === 1,
        '19a. both Bob (snapshot possessed) and Dave (snapshot not possessed) show exactly one known anchor and one known placement');
    assert(bobKnowledgeAfter.evidence.anchorCount === daveKnowledge.evidence.anchorCount && bobKnowledgeAfter.placements.placementCount === daveKnowledge.placements.placementCount,
        '19b. INVARIANT: Bob\'s (snapshot possessed) replica knowledge counts are IDENTICAL to Dave\'s (snapshot not possessed) — possession never changes the distributed-claim dimension');
    assert(eveKnowledgeAfter.evidence.anchorCount === eveKnowledgeBefore.evidence.anchorCount && eveKnowledgeAfter.placements.placementCount === eveKnowledgeBefore.placements.placementCount,
        '20. Eve\'s own replica knowledge is unchanged before and after her rejected materialization attempt');

    console.log('  21. Four replicas, one publication: Bob and Carol possess the snapshot through two different mechanisms; Dave and Eve do not, through two different histories (none vs. one rejection) — replica knowledge, materialization history, and current content possession vary completely independently of one another');
    console.log('✓ FLAGSHIP: replica knowledge, materialization history, and current snapshot possession are three independent facts');

    console.log('\n✅ All PublicationReplicaContentKnowledge tests passed');
}

run().catch((error) => {
    console.error('❌ PublicationReplicaContentKnowledge tests failed:', error);
    process.exitCode = 1;
});
