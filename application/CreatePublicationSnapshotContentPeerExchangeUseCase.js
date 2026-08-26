import { PublicationSnapshotContentPeerExchange } from './PublicationSnapshotContentPeerExchange.js';

// 0.8.37 — Explicit Peer Snapshot Content Transfer.
//
// Mirrors application/CreatePeerContentExchangeUseCase.js's (0.7.4) own
// composition-root shape, one axis over: `contentStore` is never
// constructed here — it already exists (see ui/main.js), and a caller
// reconstructing a SEPARATE instance would silently split this replica's
// content state into two halves nothing else in the app would ever see.
// `peerMessageBus`/`connectedPeerRegistry` are passed straight through for
// the identical reason application/
// CreatePublicationSnapshotPlacementPeerExchangeUseCase.js already
// documents: both are shared, app-wide collaborators this milestone does
// not own.
export class CreatePublicationSnapshotContentPeerExchangeUseCase {
    execute({ contentStore, peerMessageBus, connectedPeerRegistry } = {}) {
        const peerExchange = new PublicationSnapshotContentPeerExchange(contentStore, peerMessageBus, connectedPeerRegistry);
        return { peerExchange };
    }
}
