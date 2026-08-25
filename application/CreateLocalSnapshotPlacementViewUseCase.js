import { LocalSnapshotPlacementView } from '../content/LocalSnapshotPlacementView.js';

// 0.8.20 — Snapshot Placement Inspection & Explicit Resolution UX.
//
// The `local` sibling of application/
// CreateIpfsSnapshotPlacementViewUseCase.js — identical shape, no
// options, no network client to inject.
export class CreateLocalSnapshotPlacementViewUseCase {
    execute() {
        const localSnapshotPlacementView = new LocalSnapshotPlacementView();
        return { localSnapshotPlacementView };
    }
}
