import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { CreatePublicationSnapshotPlacementUseCase } from './CreatePublicationSnapshotPlacementUseCase.js';
import { CreateExternalSnapshotPlacementUseCase } from './CreateExternalSnapshotPlacementUseCase.js';
import { SnapshotPlacementStoreRegistry } from './SnapshotPlacementStoreRegistry.js';
import { SnapshotPlacementResolver } from './SnapshotPlacementResolver.js';

// 0.8.18 — Decentralized Snapshot Placement Foundation.
//
// Wires the concrete authorization verifier, the generic creation use
// case, a SnapshotPlacementStoreRegistry, and a SnapshotPlacementResolver
// together, and returns a CreateExternalSnapshotPlacementUseCase — so
// ui/ never imports identity/LocalAuthorizationVerifier.js, application/
// CreatePublicationSnapshotPlacementUseCase.js, or any concrete
// content/ContentStore.js directly. The identical composition-root shape
// application/CreateExternalPublicationAnchorOrchestratorUseCase.js
// (0.8.10) already established for anchors, mirrored here for placement.
//
// `discoveryProvider`, `contentResolver`, and `placementCatalog` are
// always caller-supplied — this use case wires signing/orchestration
// only, never storage, exactly as application/
// CreatePublicationSnapshotPlacementCatalogUseCase.js already wires
// storage only and never signing. A caller obtains these from its own
// existing composition roots (discovery/LocalDiscoveryProvider.js,
// discovery/LocalContentResolver.js, application/
// CreatePublicationSnapshotPlacementCatalogUseCase.js) and passes the
// SAME instances here — never a second, disconnected set.
//
// `stores` is where a caller plugs in whichever real content/
// ContentStore.js instances it wants available — e.g. a real
// content/IpfsContentStore.js — without this use case ever importing
// that concrete adapter itself. Passing none still returns a perfectly
// usable, empty SnapshotPlacementStoreRegistry; every storage name
// simply has no registered store, and `execute()` refuses to proceed for
// any of them, exactly as it would for a single missing store.
export class CreateSnapshotPlacementOrchestratorUseCase {
    execute({ discoveryProvider, contentResolver, placementCatalog, identityProvider, stores = [] } = {}) {
        const verifier = new LocalAuthorizationVerifier();
        const createPublicationSnapshotPlacementUseCase = new CreatePublicationSnapshotPlacementUseCase(
            discoveryProvider, identityProvider, verifier, placementCatalog
        );
        const storeRegistry = new SnapshotPlacementStoreRegistry();
        for (const contentStore of stores) {
            storeRegistry.register(contentStore);
        }
        const createExternalSnapshotPlacementUseCase = new CreateExternalSnapshotPlacementUseCase(
            discoveryProvider, contentResolver, storeRegistry, createPublicationSnapshotPlacementUseCase
        );
        const snapshotPlacementResolver = new SnapshotPlacementResolver(verifier);

        return {
            createExternalSnapshotPlacementUseCase,
            createPublicationSnapshotPlacementUseCase,
            storeRegistry,
            snapshotPlacementResolver,
            verifier
        };
    }
}
