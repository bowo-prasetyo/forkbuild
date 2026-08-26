import { PublicationSnapshotPossessionPeerExchange } from './PublicationSnapshotPossessionPeerExchange.js';

// 0.8.40 — Snapshot Possession Observation Exchange.
//
// Mirrors application/CreatePublicationSnapshotContentPeerExchangeUseCase.js's
// (0.8.37) own composition-root shape, one axis over:
// `checkLocalSnapshotContentAvailabilityUseCase` is never constructed
// here — it already exists (see ui/main.js, 0.8.33), and a caller
// reconstructing a separate instance would risk it reading a different
// content/ContentStore.js than the rest of the app, silently splitting this
// replica's own notion of "what do I possess" into two. `peerMessageBus`/
// `connectedPeerRegistry` are passed straight through for the identical
// reason every sibling Create*PeerExchangeUseCase.js already documents:
// both are shared, app-wide collaborators this milestone does not own.
export class CreatePublicationSnapshotPossessionPeerExchangeUseCase {
    execute({ checkLocalSnapshotContentAvailabilityUseCase, peerMessageBus, connectedPeerRegistry } = {}) {
        const peerExchange = new PublicationSnapshotPossessionPeerExchange(
            checkLocalSnapshotContentAvailabilityUseCase, peerMessageBus, connectedPeerRegistry
        );
        return { peerExchange };
    }
}
