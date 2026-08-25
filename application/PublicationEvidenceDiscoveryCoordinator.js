import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';

// 0.8.16 — Evidence Synchronization UX & Explicit Historical Discovery.
//
// application/PublicationAnchorDiscoveryCoordinator.js (0.8.5) already
// answers "which anchors became known as a result of asking these
// peers?" for a caller-supplied `peers` list — it has never picked those
// peers itself, the same restraint application/
// PublicationResolutionCoordinator.js's own header established one
// milestone earlier. This class is the thin, application-facing layer
// ABOVE that coordinator this milestone's own design calls for: it picks
// no anchor, ranks no peer, and adds no policy of its own beyond
// answering ONE question a UI can call directly — "ask every peer this
// replica is currently authenticated with what they know about this
// publication, and tell me what came back." See docs/Roadmap.md, 0.8.16.
//
// Peer selection is deliberately the SAME "every currently AUTHENTICATED
// peer, in registry order" policy application/
// PublicationAnchorPeerExchange.js#announce() already bakes in one call
// away (0.8.4) — never "nearest," "fastest," "most reliable," or "most
// anchors." This class asks a collective question ("what do these peers
// know?"), never a selection question ("which peer should I trust?") —
// see this milestone's own docs/Principles.md entry.
//
// discover() NEVER calls application/ExternalAnchorVerifier.js, ranks the
// `discovered` anchors, picks a "best" one, or retries on its own — a
// caller who wants a second attempt (a peer reconnected, more time has
// passed) calls discover() again, exactly the same "always safe, always
// re-derives from scratch" posture application/
// PublicationAnchorDiscoveryCoordinator.js's own header already holds
// itself to, one layer down.
export class PublicationEvidenceDiscoveryCoordinator {
    constructor(anchorDiscoveryCoordinator, connectedPeerRegistry) {
        if (!anchorDiscoveryCoordinator || typeof anchorDiscoveryCoordinator.discoverFromPeers !== 'function') {
            throw new Error('PublicationEvidenceDiscoveryCoordinator: a PublicationAnchorDiscoveryCoordinator is required');
        }
        if (!connectedPeerRegistry || typeof connectedPeerRegistry.list !== 'function') {
            throw new Error('PublicationEvidenceDiscoveryCoordinator: a ConnectedPeerRegistry is required');
        }
        this._discoveryCoordinator = anchorDiscoveryCoordinator;
        this._registry = connectedPeerRegistry;
    }

    // Asks every currently AUTHENTICATED peer on the injected registry
    // what they know about `publicationId`, through application/
    // PublicationAnchorDiscoveryCoordinator.js#discoverFromPeers()
    // UNCHANGED, and reports the result. `newlyImportedCount`/
    // `alreadyKnownCount` are a plain tally of that call's own `discovered`
    // — `isNew` is already computed, per anchor, by application/
    // LocalPublicationAnchorCatalog.js#add() at import time (0.8.2); this
    // method invents no new notion of "new." A publicationId with zero
    // authenticated peers to ask still resolves cleanly, with
    // `attemptedPeers: []` — never an error, the identical "zero
    // connected peers is never an error" restraint every sibling
    // peer-facing class in this codebase already applies.
    async discover(publicationId, options = {}) {
        if (!publicationId) {
            throw new Error('PublicationEvidenceDiscoveryCoordinator: discover() requires a publicationId');
        }
        const peers = this._registry.list().filter((peer) => peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED);
        const { attemptedPeers, discovered } = await this._discoveryCoordinator.discoverFromPeers(publicationId, peers, options);
        let newlyImportedCount = 0;
        let alreadyKnownCount = 0;
        for (const { isNew } of discovered) {
            if (isNew) {
                newlyImportedCount += 1;
            } else {
                alreadyKnownCount += 1;
            }
        }
        return { publicationId, attemptedPeers, discovered, newlyImportedCount, alreadyKnownCount };
    }
}
