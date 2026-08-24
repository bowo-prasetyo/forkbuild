// 0.8.5 — Historical Anchor Discovery & Synchronization.
//
// application/PublicationAnchorPeerExchange.js#requestAnchors() asks
// exactly one CALLER-CHOSEN peer for anchors it knows about a
// publicationId. This class is the multi-peer policy over that single
// call — application/PeerContentRetrievalCoordinator.js's own 0.7.6 shape,
// applied to anchor discovery instead of content retrieval:
//
//   DiscoveryCoordinator.discoverFromPeers(publicationId, peers, options)
//         │
//         ├── peers[0] ── requestAnchors() ── collect whatever arrives ──┐
//         │                                                              │
//         ├── peers[1] ── requestAnchors() ── collect whatever arrives ──┤
//         │                                                              │
//         ├── peers[2] ── requestAnchors() ── collect whatever arrives ──┘
//         │
//         └── { publicationId, attemptedPeers, discovered }
//
// THE ONE DELIBERATE DIFFERENCE from PeerContentRetrievalCoordinator.js's
// own retrieve(): that class stops at the FIRST candidate whose response
// verifies, because a content hash has exactly one right answer — the
// bytes either verify or they don't, and one success ends the search.
// Historical anchor discovery has no such single "right answer": Alice
// may hold Anchor A, Bob may hold Anchor A and Anchor B, and a REQUEST is
// never "give me THE anchor," always "give me every anchor you know."
// This class therefore never stops early — it asks EVERY candidate in
// `peers`, in order, and the result is the UNION of whatever each one
// offered, exactly as docs/Roadmap.md, 0.8.5, describes convergence: a
// late-joining replica does not pick a winner among peers, it accumulates
// what each one independently knows. Deduplication needs no code here
// either, for the identical reason application/
// PublicationAnchorPeerExchange.js#_handleResponse()'s own header already
// gives: application/LocalPublicationAnchorCatalog.js#add() already
// dedupes by the anchor's own id, so asking two peers who both know
// Anchor A converges to one cataloged entry regardless of how many times
// `discovered` below reports having seen it.
//
// Candidates are tried IN ORDER, sequentially, never concurrently — the
// identical restraint, for the identical reason, application/
// PeerContentRetrievalCoordinator.js's own header already states one
// domain over: this is not about trusting peer 1 more than peer 2, only
// about deterministic, easily-testable operational behavior. The direct,
// honest cost is the same one that class's own header names: asking N
// peers can take up to N times as long as asking one.
//
// EACH peer gets a full `timeoutMs` window, never an early exit the
// moment ONE anchor arrives — unlike content retrieval's single
// right-answer race, a peer's RESPONSE may legitimately be empty (it
// knows nothing) or may legitimately contain several anchors, and this
// class has no way to know "that peer is now done answering" other than
// letting its own window elapse. A caller impatient with that cost
// supplies a smaller `timeoutMs`.
//
// Returns an OPERATION result, deliberately never anything resembling
// application/PublicationResolutionOutcome.js — "what anchors did this
// discovery call turn up" is a different question from "is this
// publication resolved," the identical split docs/Principles.md, "Resolution
// Asks What; Retrieval Asks Whether (0.7.6)," already draws one layer
// over. `discovered` is `{ anchor, isNew }` entries, passed straight
// through from application/PublicationAnchorPeerExchange.js#
// onAnchorReceived() — this class computes no ranking, no "best" anchor,
// and no derived verdict over what it collected; see docs/Principles.md,
// "Evidence Set Convergence Does Not Imply Truth Convergence (0.8.5)."
export class PublicationAnchorDiscoveryCoordinator {
    constructor(publicationAnchorPeerExchange) {
        if (!publicationAnchorPeerExchange
            || typeof publicationAnchorPeerExchange.requestAnchors !== 'function'
            || typeof publicationAnchorPeerExchange.onAnchorReceived !== 'function') {
            throw new Error('PublicationAnchorDiscoveryCoordinator: a PublicationAnchorPeerExchange is required');
        }
        this._exchange = publicationAnchorPeerExchange;
    }

    // Asks each of `peers` (already-authenticated ConnectedPeer instances
    // — this class picks none of them, and applies no authentication
    // check of its own; that stays application/
    // PublicationAnchorPeerExchange.js#requestAnchors()'s own job,
    // unchanged) in order, waiting up to `timeoutMs` per candidate for
    // whatever anchors it offers back. `peers` may be empty — a caller
    // with no live peer to ask gets `{ publicationId, attemptedPeers: [],
    // discovered: [] }`, never an error, the identical "zero connected
    // peers is never an error" restraint application/
    // PublicationAnchorPeerExchange.js#announce() already applies one
    // call away.
    //
    // Never re-asks a candidate that already answered (or timed out)
    // within the same call, and never re-tries the whole list — a caller
    // that wants a second attempt (a peer reconnected, more time has
    // passed, new anchors may since have been created) calls
    // discoverFromPeers() again, exactly the "always safe, always
    // re-derives from scratch" posture application/
    // PublicationResolutionCoordinator.js's own header already holds
    // itself to.
    async discoverFromPeers(publicationId, peers, { timeoutMs = PublicationAnchorDiscoveryCoordinator.DEFAULT_TIMEOUT_MS } = {}) {
        if (!publicationId) {
            throw new Error('PublicationAnchorDiscoveryCoordinator: a publicationId is required');
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

    // Collects every `{ anchor, isNew }` event naming exactly
    // `publicationId` that arrives while `peer`'s own request is
    // outstanding, for up to `timeoutMs`. Filtering by `publicationId`
    // here (rather than trusting that everything onAnchorReceived() fires
    // during this window came from this one request) matters because
    // application/PublicationAnchorPeerExchange.js#onAnchorReceived() is
    // the SAME shared event this replica's live ANNOUNCE traffic already
    // fires on — an unrelated anchor arriving from ordinary gossip while
    // this call happens to be waiting is correctly excluded from this
    // discovery call's own result.
    _requestFrom(peer, publicationId, timeoutMs) {
        return new Promise((resolve) => {
            let settled = false;
            let timer = null;
            const collected = [];
            const unsubscribe = this._exchange.onAnchorReceived(({ anchor, isNew }) => {
                if (anchor.publicationId === publicationId) {
                    collected.push({ anchor, isNew });
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
                this._exchange.requestAnchors(peer, publicationId);
            } catch {
                finish();
            }
        });
    }
}

// A shorter default than application/PeerContentRetrievalCoordinator.js's
// own DEFAULT_TIMEOUT_MS (8000): a REQUEST/RESPONSE round-trip for anchor
// claims is one small JSON message each way, never a content-byte
// transfer, so a caller waiting out every candidate's full window pays a
// smaller cost per peer than the content-retrieval case already accepts.
PublicationAnchorDiscoveryCoordinator.DEFAULT_TIMEOUT_MS = 3000;
