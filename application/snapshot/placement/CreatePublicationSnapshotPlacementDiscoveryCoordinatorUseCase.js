import { PublicationSnapshotPlacementDiscoveryCoordinator } from './PublicationSnapshotPlacementDiscoveryCoordinator.js';

// 0.8.19 — Snapshot Placement Discovery & Peer Synchronization.
//
// Takes `peerExchange` as a parameter, constructing nothing else — the
// identical shape application/
// CreatePublicationAnchorDiscoveryCoordinatorUseCase.js's own 0.8.5
// header already established, for the identical reason: `peerExchange`
// already exists, produced by application/
// CreatePublicationSnapshotPlacementPeerExchangeUseCase.js, and this
// replica has exactly one instance of it (see ui/main.js). Reconstructing
// a second one here would give this coordinator its own, disconnected
// view of the wire a caller's real requestPlacements()/
// onPlacementReceived() calls never see.
export class CreatePublicationSnapshotPlacementDiscoveryCoordinatorUseCase {
    execute({ peerExchange } = {}) {
        const discoveryCoordinator = new PublicationSnapshotPlacementDiscoveryCoordinator(peerExchange);
        return { discoveryCoordinator };
    }
}
