import { SnapshotPlacementCreationCoordinator } from './SnapshotPlacementCreationCoordinator.js';

// 0.8.25 — Explicit Snapshot Placement Creation UX.
//
// Takes both collaborators as parameters, constructing neither — the
// identical shape application/
// CreatePublicationAnchorCreationCoordinatorUseCase.js's own header
// already established, for the identical reason:
// `createExternalSnapshotPlacementUseCase` and `storeRegistry` already
// exist, produced together by application/
// CreateSnapshotPlacementOrchestratorUseCase.js (0.8.18). Reconstructing
// either here would give this coordinator its own, disconnected view of
// which content stores are actually registered. ui/main.js is the one
// place both composition roots run together.
export class CreateSnapshotPlacementCreationCoordinatorUseCase {
    execute({ createExternalSnapshotPlacementUseCase, storeRegistry } = {}) {
        const coordinator = new SnapshotPlacementCreationCoordinator(createExternalSnapshotPlacementUseCase, storeRegistry);
        return { coordinator };
    }
}
