import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { SnapshotPlacementStoreRegistry } from './SnapshotPlacementStoreRegistry.js';
import { SnapshotPlacementResolver } from './SnapshotPlacementResolver.js';
import { SnapshotPlacementResolutionCoordinator } from './SnapshotPlacementResolutionCoordinator.js';

// 0.8.20 — Snapshot Placement Inspection & Explicit Resolution UX.
//
// DELIBERATELY NOT application/CreateSnapshotPlacementOrchestratorUseCase.js
// (0.8.18) — that composition root also wires the CREATION half of this
// subsystem (`CreatePublicationSnapshotPlacementUseCase`/
// `CreateExternalSnapshotPlacementUseCase`), which needs a
// `publisher/Publication.js`-side `discoveryProvider`/`contentResolver`
// this replica has never wired into ui/main.js at all — 0.8.18's and
// 0.8.19's own "Deliberately excluded" lists both named "UX of any kind"
// and "wiring into ui/main.js" as future work, and this milestone is
// scoped narrowly to INSPECTION and RESOLUTION, exactly as 0.8.3 was for
// evidence before 0.8.11 gave anchors their own creation UX. Reaching
// for the heavier orchestrator here to get its `snapshotPlacementResolver`
// would smuggle a creation-pipeline dependency into a milestone that
// never asked for one.
//
// Instead, this use case wires exactly what resolution needs — the
// identical "generic pipeline, concrete plugin wired outside it" split
// application/CreateExternalAnchorVerifierUseCase.js already holds for
// evidence: a fresh `LocalAuthorizationVerifier`, a
// `SnapshotPlacementStoreRegistry` built from whichever concrete
// content/ContentStore.js instances a caller hands in (`stores` — e.g.
// the SAME content/LocalContentStore.js this replica's own publication
// pipeline already uses, and a real content/IpfsContentStore.js), a
// `SnapshotPlacementResolver` over both, and the
// `SnapshotPlacementResolutionCoordinator` this milestone adds on top,
// paired with `placementCatalog` (always caller-supplied — the SAME
// application/LocalPublicationSnapshotPlacementCatalog.js instance
// 0.8.18/0.8.19 already populate, never a second, disconnected one).
//
// Passing no `stores` still returns a perfectly usable coordinator:
// discover() works exactly as always, and resolve() honestly reports
// STORE_UNAVAILABLE for every storage, never a crash.
export class CreateSnapshotPlacementResolutionCoordinatorUseCase {
    execute({ placementCatalog, stores = [] } = {}) {
        const verifier = new LocalAuthorizationVerifier();
        const storeRegistry = new SnapshotPlacementStoreRegistry();
        for (const contentStore of stores) {
            storeRegistry.register(contentStore);
        }
        const snapshotPlacementResolver = new SnapshotPlacementResolver(verifier);
        const coordinator = new SnapshotPlacementResolutionCoordinator(placementCatalog, snapshotPlacementResolver, storeRegistry);

        return { coordinator, storeRegistry, snapshotPlacementResolver, verifier };
    }
}
