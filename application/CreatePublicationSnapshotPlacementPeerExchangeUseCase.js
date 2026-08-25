import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalPublicationSnapshotPlacementCatalog } from './LocalPublicationSnapshotPlacementCatalog.js';
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
// Unlike application/CreatePublicationAnchorPeerExchangeUseCase.js, this
// use case runs no restore-on-startup pass: application/
// LocalPublicationSnapshotPlacementCatalog.js already persists directly
// through its own `storageProvider` (0.8.18's own deliberate choice to
// skip the separate Store-class durability seam anchors only grew in
// 0.8.15), so there is nothing here to restore-and-re-verify at process
// start yet. A future milestone can add that hardening the same way
// 0.8.15 added it for anchors, without changing this use case's own
// public surface — see docs/Roadmap.md, 0.8.18, "Deliberately excluded."
export class CreatePublicationSnapshotPlacementPeerExchangeUseCase {
    execute({ peerMessageBus, connectedPeerRegistry } = {}) {
        const storageProvider = new LocalStorageProvider();
        const catalog = new LocalPublicationSnapshotPlacementCatalog(storageProvider);
        const verifier = new LocalAuthorizationVerifier();

        const exchange = new PublicationSnapshotPlacementExchange(catalog, verifier);
        const peerExchange = new PublicationSnapshotPlacementPeerExchange(exchange, peerMessageBus, connectedPeerRegistry);

        return { catalog, exchange, peerExchange, verifier };
    }
}
