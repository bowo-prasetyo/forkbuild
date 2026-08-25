import { PublicationEvidenceDiscoveryCoordinator } from './PublicationEvidenceDiscoveryCoordinator.js';

// 0.8.16 — Evidence Synchronization UX & Explicit Historical Discovery.
//
// Takes both collaborators as parameters, constructing neither — the
// identical shape application/
// CreatePublicationAnchorDiscoveryCoordinatorUseCase.js's own 0.8.5
// header already established, for the identical reason:
// `anchorDiscoveryCoordinator` already exists (produced by that same use
// case) and `connectedPeerRegistry` already exists
// (application/PeerSessionManager.js#registry) — this replica has
// exactly one of each. ui/main.js is the one place both are threaded
// together.
export class CreatePublicationEvidenceDiscoveryCoordinatorUseCase {
    execute({ anchorDiscoveryCoordinator, connectedPeerRegistry } = {}) {
        const coordinator = new PublicationEvidenceDiscoveryCoordinator(anchorDiscoveryCoordinator, connectedPeerRegistry);
        return { coordinator };
    }
}
