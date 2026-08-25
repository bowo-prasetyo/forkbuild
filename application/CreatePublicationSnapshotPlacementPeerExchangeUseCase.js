import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalPublicationSnapshotPlacementCatalog } from './LocalPublicationSnapshotPlacementCatalog.js';
import { LocalPublicationSnapshotPlacementStore } from './LocalPublicationSnapshotPlacementStore.js';
import { RestorePublicationSnapshotPlacementCatalogUseCase } from './RestorePublicationSnapshotPlacementCatalogUseCase.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { PublicationSnapshotPlacementExchange } from './PublicationSnapshotPlacementExchange.js';
import { PublicationSnapshotPlacementPeerExchange } from './PublicationSnapshotPlacementPeerExchange.js';

// 0.8.19 — Snapshot Placement Discovery & Peer Synchronization.
//
// Wires the concrete local catalog storage and a live
// PublicationSnapshotPlacementPeerExchange over it, so ui/ never imports
// application/LocalPublicationSnapshotPlacementCatalog.js, application/
// PublicationSnapshotPlacementExchange.js, or identity/
// LocalAuthorizationVerifier.js directly — the exact composition-root
// shape application/CreatePublicationAnchorPeerExchangeUseCase.js (0.8.4)
// already established for anchors.
//
// Returns its own `catalog` rather than reusing application/
// CreatePublicationSnapshotPlacementCatalogUseCase.js's (0.8.18) — that
// use case pairs a catalog with `AddPublicationSnapshotPlacementUseCase`
// (structural-only, no signature check), while this one pairs the SAME
// kind of catalog with `PublicationSnapshotPlacementExchange` (structural
// AND signature verification, the discipline a claim arriving from a
// stranger over a peer connection actually needs). A caller wiring the
// running app together (see ui/main.js) uses THIS use case's own
// `catalog` as the one LocalPublicationSnapshotPlacementCatalog instance
// the replica uses anywhere — mirroring the same "one instance, threaded
// everywhere" discipline application/
// CreatePublicationAnchorPeerExchangeUseCase.js already holds for
// `catalog`.
//
// `peerMessageBus`/`connectedPeerRegistry` are passed straight through,
// never constructed here — both are shared, app-wide collaborators (see
// ui/main.js) application/PublicationSnapshotPlacementPeerExchange.js's
// own header already documents as never owned by it.
//
// 0.8.21 — Persistent Snapshot Placement Catalog & Restart Recovery.
//
// Now also constructs the durable application/
// LocalPublicationSnapshotPlacementStore.js `catalog` delegates to, and
// runs application/RestorePublicationSnapshotPlacementCatalogUseCase.js
// over it — ONCE, synchronously, before `exchange`/`peerExchange` are
// ever handed to a caller — so any record left over from a PRIOR process
// that no longer re-validates or re-verifies is pruned before this
// replica's UI can ever read it through `catalog`. Returns the restore
// pass's own result (`restoredPlacements`/`rejectedPlacements`)
// alongside everything this use case already returned, purely
// informational — see that class's own header for what each field
// means. This supersedes this file's own pre-0.8.21 header note ("this
// use case runs no restore-on-startup pass") — that gap is exactly what
// this milestone closes, the same way 0.8.15 closed it for
// application/CreatePublicationAnchorPeerExchangeUseCase.js.
export class CreatePublicationSnapshotPlacementPeerExchangeUseCase {
    execute({ peerMessageBus, connectedPeerRegistry } = {}) {
        const storageProvider = new LocalStorageProvider();
        const catalog = new LocalPublicationSnapshotPlacementCatalog(storageProvider);
        const store = new LocalPublicationSnapshotPlacementStore(storageProvider);
        const verifier = new LocalAuthorizationVerifier();

        const restoreResult = new RestorePublicationSnapshotPlacementCatalogUseCase(store, verifier).execute();

        const exchange = new PublicationSnapshotPlacementExchange(catalog, verifier);
        const peerExchange = new PublicationSnapshotPlacementPeerExchange(exchange, peerMessageBus, connectedPeerRegistry);

        return { catalog, exchange, peerExchange, verifier, restoreResult };
    }
}
