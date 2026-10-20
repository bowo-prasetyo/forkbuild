import { PublicationKnowledgeSynchronizationCoordinator } from './PublicationKnowledgeSynchronizationCoordinator.js';

// 0.8.30 — Explicit Replica Knowledge Synchronization.
//
// Takes all three collaborators as parameters, constructing none of them
// — the identical shape application/
// CreatePublicationEvidenceDiscoveryCoordinatorUseCase.js (folded into its caller)'s own 0.8.16
// header already established, for the identical reason:
// `anchorDiscoveryCoordinator` and `placementDiscoveryCoordinator` each
// already exist (produced by application/
// CreatePublicationAnchorDiscoveryCoordinatorUseCase.js (folded into its caller)/application/
// CreatePublicationSnapshotPlacementDiscoveryCoordinatorUseCase.js (folded into its caller)) and
// `connectedPeerRegistry` already exists (application/
// PeerSessionManager.js#registry) — this replica has exactly one of
// each. ui/main.js is the one place all three are threaded together.
export class CreatePublicationKnowledgeSynchronizationCoordinatorUseCase {
    execute({ anchorDiscoveryCoordinator, placementDiscoveryCoordinator, connectedPeerRegistry } = {}) {
        const coordinator = new PublicationKnowledgeSynchronizationCoordinator(
            anchorDiscoveryCoordinator,
            placementDiscoveryCoordinator,
            connectedPeerRegistry
        );
        return { coordinator };
    }
}
