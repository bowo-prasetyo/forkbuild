import { SnapshotPlacementViewRegistry } from './SnapshotPlacementViewRegistry.js';

// 0.8.20 — Snapshot Placement Inspection & Explicit Resolution UX.
//
// Mirrors application/CreateExternalAnchorEvidenceViewRegistryUseCase.js's
// own `evidenceViews` composition exactly, one axis over: a caller
// (ui/main.js) hands in whichever concrete application/
// SnapshotPlacementViewRegistry.js plugins it has — e.g. `new
// CreateIpfsSnapshotPlacementViewUseCase().execute().ipfsSnapshotPlacementView`
// — without this use case ever importing content/
// IpfsSnapshotPlacementView.js or any other concrete adapter itself.
// Passing none still returns a perfectly usable, empty registry: every
// storage simply has no storage-specific presentation, and application/
// PublicationSnapshotPlacementDetailView.js's own generic shape is all a
// caller ever sees.
export class CreateSnapshotPlacementViewRegistryUseCase {
    execute({ placementViews = [] } = {}) {
        const placementViewRegistry = new SnapshotPlacementViewRegistry();
        for (const placementView of placementViews) {
            placementViewRegistry.register(placementView);
        }
        return { placementViewRegistry };
    }
}
