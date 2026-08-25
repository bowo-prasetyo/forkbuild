// 0.8.19 — Snapshot Placement Discovery & Peer Synchronization.
//
// application/PublicationSnapshotPlacementPeerExchange.js#
// requestPlacements() asks exactly one CALLER-CHOSEN peer for placements
// it knows about a publicationId. This class is the multi-peer policy
// over that single call — application/
// PublicationAnchorDiscoveryCoordinator.js's own 0.8.5 shape, applied to
// placement discovery instead of anchor discovery:
//
//   DiscoveryCoordinator.discoverFromPeers(publicationId, peers, options)
//         │
//         ├── peers[0] ── requestPlacements() ── collect whatever arrives ──┐
//         │                                                                 │
//         ├── peers[1] ── requestPlacements() ── collect whatever arrives ──┤
//         │                                                                 │
//         ├── peers[2] ── requestPlacements() ── collect whatever arrives ──┘
//         │
//         └── { publicationId, attemptedPeers, discovered }
//
// THE ONE DELIBERATE DIFFERENCE from application/
// PeerContentRetrievalCoordinator.js's own retrieve(): historical
// placement discovery has no single "right answer" the way a content
// hash does. Alice may hold a placement on IPFS, Bob may hold that one
// AND a second one on a different storage backend, and a REQUEST is
// never "give me THE placement," always "give me every placement you
// know." This class therefore never stops early — it asks EVERY
// candidate in `peers`, in order, and the result is the UNION of
// whatever each one offered. Deduplication needs no code here either,
// for the identical reason application/
// PublicationSnapshotPlacementPeerExchange.js#_handleResponse()'s own
// header already gives: application/
// LocalPublicationSnapshotPlacementCatalog.js#add() already dedupes by
// the placement's own id, so asking two peers who both know the same
// placement converges to one cataloged entry regardless of how many
// times `discovered` below reports having seen it.
//
// Candidates are tried IN ORDER, sequentially, never concurrently — the
// identical restraint, for the identical reason, application/
// PublicationAnchorDiscoveryCoordinator.js's own header already states
// one domain over: this is not about trusting peer 1 more than peer 2,
// only about deterministic, easily-testable operational behavior.
//
// EACH peer gets a full `timeoutMs` window, never an early exit the
// moment ONE placement arrives — a peer's RESPONSE may legitimately be
// empty (it knows nothing) or may legitimately contain several
// placements, and this class has no way to know "that peer is now done
// answering" other than letting its own window elapse.
//
// Returns an OPERATION result, deliberately never anything resembling
// application/SnapshotPlacementResolutionOutcome.js — "what placements
// did this discovery call turn up" is a different question from "can
// this placement resolve," the identical split docs/Principles.md,
// "Resolution Asks What; Retrieval Asks Whether (0.7.6)," already draws
// one layer over. `discovered` is `{ placement, isNew }` entries, passed
// straight through from application/
// PublicationSnapshotPlacementPeerExchange.js#onPlacementReceived() —
// this class computes no ranking, no "best" placement, and no derived
// verdict over what it collected.
export class PublicationSnapshotPlacementDiscoveryCoordinator {
    constructor(placementPeerExchange) {
        if (!placementPeerExchange
            || typeof placementPeerExchange.requestPlacements !== 'function'
            || typeof placementPeerExchange.onPlacementReceived !== 'function') {
            throw new Error('PublicationSnapshotPlacementDiscoveryCoordinator: a PublicationSnapshotPlacementPeerExchange is required');
        }
        this._exchange = placementPeerExchange;
    }

    // Asks each of `peers` (already-authenticated ConnectedPeer instances
    // — this class picks none of them, and applies no authentication
    // check of its own; that stays application/
    // PublicationSnapshotPlacementPeerExchange.js#requestPlacements()'s
    // own job, unchanged) in order, waiting up to `timeoutMs` per
    // candidate for whatever placements it offers back. `peers` may be
    // empty — a caller with no live peer to ask gets `{ publicationId,
    // attemptedPeers: [], discovered: [] }`, never an error.
    //
    // Never re-asks a candidate that already answered (or timed out)
    // within the same call, and never re-tries the whole list — a caller
    // that wants a second attempt calls discoverFromPeers() again,
    // exactly the "always safe, always re-derives from scratch" posture
    // application/PublicationAnchorDiscoveryCoordinator.js's own header
    // already holds itself to.
    async discoverFromPeers(publicationId, peers, { timeoutMs = PublicationSnapshotPlacementDiscoveryCoordinator.DEFAULT_TIMEOUT_MS } = {}) {
        if (!publicationId) {
            throw new Error('PublicationSnapshotPlacementDiscoveryCoordinator: a publicationId is required');
        }
        const candidates = Array.isArray(peers) ? peers.filter(Boolean) : [];
        const attemptedPeers = [];
        const discovered = [];

        for (const peer of candidates) {
            attemptedPeers.push(peer);
            const results = await this._requestFrom(peer, publicationId, timeoutMs);
            discovered.push(...results);
        }

        return { publicationId, attemptedPeers, discovered };
    }

    // Collects every `{ placement, isNew }` event naming exactly
    // `publicationId` that arrives while `peer`'s own request is
    // outstanding, for up to `timeoutMs`. Filtering by `publicationId`
    // here matters because application/
    // PublicationSnapshotPlacementPeerExchange.js#onPlacementReceived()
    // is the SAME shared event this replica's live ANNOUNCE traffic
    // already fires on — an unrelated placement arriving from ordinary
    // gossip while this call happens to be waiting is correctly excluded
    // from this discovery call's own result.
    _requestFrom(peer, publicationId, timeoutMs) {
        return new Promise((resolve) => {
            let settled = false;
            let timer = null;
            const collected = [];
            const unsubscribe = this._exchange.onPlacementReceived(({ placement, isNew }) => {
                if (placement.publicationId === publicationId) {
                    collected.push({ placement, isNew });
                }
            });
            const finish = () => {
                if (settled) return;
                settled = true;
                if (timer) clearTimeout(timer);
                unsubscribe();
                resolve(collected);
            };
            timer = setTimeout(finish, timeoutMs);
            try {
                this._exchange.requestPlacements(peer, publicationId);
            } catch {
                finish();
            }
        });
    }
}

// The identical, deliberately shorter default application/
// PublicationAnchorDiscoveryCoordinator.js's own DEFAULT_TIMEOUT_MS
// already established: a REQUEST/RESPONSE round-trip for placement
// claims is one small JSON message each way, never a content-byte
// transfer.
PublicationSnapshotPlacementDiscoveryCoordinator.DEFAULT_TIMEOUT_MS = 3000;
