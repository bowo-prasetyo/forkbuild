import { PublicationAnchorDiscoveryCoordinator } from './PublicationAnchorDiscoveryCoordinator.js';

// 0.8.5 — Historical Anchor Discovery & Synchronization.
//
// Takes `peerExchange` as a parameter, constructing nothing else — the
// identical shape application/
// CreatePeerContentRetrievalCoordinatorUseCase.js's own 0.7.6 header
// already established, for the identical reason: `peerExchange` already
// exists, produced by application/
// CreatePublicationAnchorPeerExchangeUseCase.js, and this replica has
// exactly one instance of it (see ui/main.js). Reconstructing a second
// one here would give this coordinator its own, disconnected view of the
// wire a caller's real requestAnchors()/onAnchorReceived() calls never
// see.
export class CreatePublicationAnchorDiscoveryCoordinatorUseCase {
    execute({ peerExchange } = {}) {
        const discoveryCoordinator = new PublicationAnchorDiscoveryCoordinator(peerExchange);
        return { discoveryCoordinator };
    }
}
