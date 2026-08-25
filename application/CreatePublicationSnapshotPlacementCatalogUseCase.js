import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalPublicationSnapshotPlacementCatalog } from './LocalPublicationSnapshotPlacementCatalog.js';
import { AddPublicationSnapshotPlacementUseCase } from './AddPublicationSnapshotPlacementUseCase.js';

// 0.8.18 — Decentralized Snapshot Placement Foundation.
//
// Wires the concrete local catalog storage and returns an
// AddPublicationSnapshotPlacementUseCase over it, so ui/ never imports
// application/LocalPublicationSnapshotPlacementCatalog.js directly — the
// same composition-root shape application/
// CreatePublicationAnchorCatalogUseCase.js (0.8.2) already established
// for anchors. A caller that also wants to independently resolve a
// cataloged placement's bytes still composes this use case's own
// `catalog` alongside a separately constructed application/
// SnapshotPlacementResolver.js (via application/
// CreateSnapshotPlacementOrchestratorUseCase.js) — this class
// deliberately wires cataloging only, never resolution.
export class CreatePublicationSnapshotPlacementCatalogUseCase {
    execute() {
        const storageProvider = new LocalStorageProvider();
        const catalog = new LocalPublicationSnapshotPlacementCatalog(storageProvider);
        const addPlacement = new AddPublicationSnapshotPlacementUseCase(catalog);

        return { catalog, addPlacement };
    }
}
