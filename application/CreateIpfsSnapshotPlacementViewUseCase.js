import { IpfsSnapshotPlacementView } from '../content/IpfsSnapshotPlacementView.js';

// 0.8.20 — Snapshot Placement Inspection & Explicit Resolution UX.
//
// Mirrors application/CreateBitcoinAnchorEvidenceViewUseCase.js's own
// shape exactly, so ui/main.js gets a concrete IpfsSnapshotPlacementView
// without ever importing content/IpfsSnapshotPlacementView.js directly.
// A pure presentation transform with no network client to inject, so
// this use case takes no options at all.
export class CreateIpfsSnapshotPlacementViewUseCase {
    execute() {
        const ipfsSnapshotPlacementView = new IpfsSnapshotPlacementView();
        return { ipfsSnapshotPlacementView };
    }
}
