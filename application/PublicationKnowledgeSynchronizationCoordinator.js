import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';

// 0.8.30 — Explicit Replica Knowledge Synchronization.
//
// Anchors (0.8.0-0.8.17) and placements (0.8.18-0.8.24) each already grew
// a COMPLETE peer discovery pipeline — application/
// PublicationAnchorPeerProtocol.js/application/
// PublicationAnchorPeerExchange.js/application/
// PublicationAnchorDiscoveryCoordinator.js on one side, application/
// PublicationSnapshotPlacementPeerProtocol.js/application/
// PublicationSnapshotPlacementPeerExchange.js/application/
// PublicationSnapshotPlacementDiscoveryCoordinator.js on the other,
// hand-mirrored down to the REQUEST/RESPONSE wire shape and the
// MAX_*_PER_RESPONSE ceiling. Both already answer "ask every candidate
// peer what it knows about this publicationId, and catalog whatever
// comes back" (0.8.5/0.8.19) — and both already answer it as a genuine
// DIFF in effect, never a raw dump: application/
// LocalPublicationAnchorCatalog.js#add()/application/
// LocalPublicationSnapshotPlacementCatalog.js#add() dedupe by the
// claim's own `id` (0.8.2/0.8.19-era), so a claim this replica already
// holds comes back from a RESPONSE and is silently absorbed as
// `isNew: false` — a caller never re-imports, re-verifies, or re-writes
// provenance for anything already known. See this milestone's own
// docs/Principles.md entry on why that is enough of a diff for a first
// milestone, and why hashes/Bloom filters/vector clocks/sequence numbers
// stay future work.
//
// The one thing missing was never a wire protocol — it was an explicit,
// SINGLE action a person can take that treats "what does this replica
// know about this publication?" as ONE question spanning both
// dimensions, rather than two separately-triggered discovery calls a
// person has to remember to run twice. Anchors already got their own
// application-facing wrapper for that at 0.8.16 (application/
// PublicationEvidenceDiscoveryCoordinator.js — "every currently
// AUTHENTICATED peer, in registry order"); application/
// CreatePublicationSnapshotPlacementDiscoveryCoordinatorUseCase.js's own
// 0.8.19 header named the identical wrapper for placements and
// deliberately left it unwired: "this milestone adds no such button
// itself." This class is that wrapper, applied to BOTH dimensions at
// once, over the SAME peer list, so a single "Synchronize with Peers"
// click asks every authenticated peer about anchors AND placements
// together rather than as two independently-timed operations that could
// see two different registry snapshots.
//
// THE CENTRAL DESIGN RULE: this class introduces no second trust
// boundary, no second wire protocol, and no third acquisition kind.
// Every anchor synchronize() turns up still crosses application/
// PublicationAnchorExchange.js#importAnchor()'s own validate -> construct
// -> verify-SIGNATURE boundary exactly as it always has, one layer down
// inside application/PublicationAnchorPeerExchange.js; every placement
// crosses the identical placement-side boundary. A claim synchronize()
// newly catalogs is recorded application/AnchorAcquisitionKind.js#PEER /
// application/PlacementAcquisitionKind.js#PEER — never a new `SYNC`
// kind — by the SAME `knowledgeStore` parameter those peer-exchange
// classes already accept, because a synchronized claim is, structurally,
// still "a peer told this replica about it." See docs/Principles.md,
// "Replica Synchronization Composes Existing Discovery, It Builds No
// Second Trust Boundary (0.8.30)."
//
// This class computes NO diff of its own, ranks NO peer, and picks NO
// "best" claim — it only ever runs the SAME two `discoverFromPeers()`
// calls (0.8.5/0.8.19, both unchanged) a caller could already run
// separately, against the same peer list, and reports both results side
// by side. It is a SYNTHESIS over two already-correct mechanisms, the
// identical restraint application/PublicationDecentralizationView.js
// (0.8.27) already holds one layer up, over the two convergence views
// this coordinator's own RESULT eventually feeds.
export class PublicationKnowledgeSynchronizationCoordinator {
    // `anchorDiscoveryCoordinator`: an application/
    // PublicationAnchorDiscoveryCoordinator.js instance (0.8.5).
    // `placementDiscoveryCoordinator`: an application/
    // PublicationSnapshotPlacementDiscoveryCoordinator.js instance
    // (0.8.19). Both are the LOW-LEVEL, caller-supplies-`peers`
    // coordinators — never application/
    // PublicationEvidenceDiscoveryCoordinator.js (0.8.16), which already
    // picks its own peer list internally and has no way to share that
    // choice with a second call. `connectedPeerRegistry`: this class's
    // own peer selection, exactly application/
    // PublicationEvidenceDiscoveryCoordinator.js's own "every currently
    // AUTHENTICATED peer, in registry order" policy (0.8.16), run ONCE
    // per synchronize() call and handed to both discoveries unchanged.
    constructor(anchorDiscoveryCoordinator, placementDiscoveryCoordinator, connectedPeerRegistry) {
        if (!anchorDiscoveryCoordinator || typeof anchorDiscoveryCoordinator.discoverFromPeers !== 'function') {
            throw new Error('PublicationKnowledgeSynchronizationCoordinator: a PublicationAnchorDiscoveryCoordinator is required');
        }
        if (!placementDiscoveryCoordinator || typeof placementDiscoveryCoordinator.discoverFromPeers !== 'function') {
            throw new Error('PublicationKnowledgeSynchronizationCoordinator: a PublicationSnapshotPlacementDiscoveryCoordinator is required');
        }
        if (!connectedPeerRegistry || typeof connectedPeerRegistry.list !== 'function') {
            throw new Error('PublicationKnowledgeSynchronizationCoordinator: a ConnectedPeerRegistry is required');
        }
        this._anchorDiscovery = anchorDiscoveryCoordinator;
        this._placementDiscovery = placementDiscoveryCoordinator;
        this._registry = connectedPeerRegistry;
    }

    // Asks every currently AUTHENTICATED peer what they know about
    // `publicationId` — anchors and placements together, in ONE explicit
    // call. Both discoveries run against the identical `peers` snapshot,
    // concurrently (application/PublicationAnchorDiscoveryCoordinator.js
    // and application/PublicationSnapshotPlacementDiscoveryCoordinator.js
    // talk over two independently namespaced protocols, 'forkbuild:anchor'
    // and 'forkbuild:snapshot-placement' — see application/
    // PublicationAnchorPeerExchange.js/application/
    // PublicationSnapshotPlacementPeerExchange.js's own DEFAULT_PROTOCOL
    // — so there is no shared mutable state for concurrent requests to
    // race over). `newlyImportedCount`/`alreadyKnownCount` per dimension
    // are a plain tally of that dimension's own `isNew` flags — this
    // method invents no new notion of "new," the identical restraint
    // application/PublicationEvidenceDiscoveryCoordinator.js#discover()
    // already holds. A publicationId with zero authenticated peers to ask
    // still resolves cleanly, with `attemptedPeers: []` — never an error.
    async synchronize(publicationId, options = {}) {
        if (!publicationId) {
            throw new Error('PublicationKnowledgeSynchronizationCoordinator: synchronize() requires a publicationId');
        }
        const peers = this._registry.list().filter((peer) => peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED);

        const [anchorResult, placementResult] = await Promise.all([
            this._anchorDiscovery.discoverFromPeers(publicationId, peers, options),
            this._placementDiscovery.discoverFromPeers(publicationId, peers, options)
        ]);

        return {
            publicationId,
            attemptedPeers: peers,
            anchors: tally(anchorResult.discovered),
            placements: tally(placementResult.discovered)
        };
    }
}

function tally(discovered) {
    let newlyImportedCount = 0;
    let alreadyKnownCount = 0;
    for (const { isNew } of discovered) {
        if (isNew) {
            newlyImportedCount += 1;
        } else {
            alreadyKnownCount += 1;
        }
    }
    return { discovered, newlyImportedCount, alreadyKnownCount };
}
