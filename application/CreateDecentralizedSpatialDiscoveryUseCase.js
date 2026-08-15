import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalSpatialIndexStore } from '../spatial/LocalSpatialIndexStore.js';
import { SpatialIndexBuilder } from '../spatial/SpatialIndexBuilder.js';
import { DecentralizedSpatialDiscoveryProvider } from '../spatial/DecentralizedSpatialDiscoveryProvider.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalContentResolver } from '../discovery/LocalContentResolver.js';
import { DiscoverWorldAreaUseCase } from './DiscoverWorldAreaUseCase.js';
import { ResolvePublicationUseCase } from './ResolvePublicationUseCase.js';
import { PlacePublicationUseCase } from './PlacePublicationUseCase.js';
import { MoveWorldPlacementUseCase } from './MoveWorldPlacementUseCase.js';
import { RemoveWorldPlacementUseCase } from './RemoveWorldPlacementUseCase.js';
import { RebuildSpatialIndexUseCase } from './RebuildSpatialIndexUseCase.js';
import { LoadPublicationDocumentUseCase } from './LoadPublicationDocumentUseCase.js';
import { CreateBrickRegistryUseCase } from './CreateBrickRegistryUseCase.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';

// Wires the DECENTRALIZED spatial discovery stack (0.2.15), the
// counterpart of CreateSpatialDiscoveryUseCase (0.2.11's local
// stack). Same DI pattern, same exposed use cases — the only thing
// that changes is what answers "where are things?":
//
//   LocalSpatialDiscoveryProvider        (0.2.11, local scan)
//   DecentralizedSpatialDiscoveryProvider (0.2.15, cell manifests)
//
// Everything above this — DiscoverWorldAreaUseCase,
// ResolvePublicationUseCase, WorldViewStreamingSession, the UI —
// consumes the unchanged SpatialDiscoveryProvider interface and does
// not know which implementation it has. Swapping to IPFS/Arweave
// index stores later means changing exactly this one file.
export class CreateDecentralizedSpatialDiscoveryUseCase {
    execute(discoveryProvider = null, identityProvider = null, options = {}) {
        const storageProvider = new LocalStorageProvider();
        const spatialIndexProvider = new LocalSpatialIndexProvider(storageProvider);
        const placementRegistry = new LocalPlacementRegistry(
            storageProvider,
            spatialIndexProvider
        );
        const publisherProvider = new LocalPublisherProvider(storageProvider);
        const localDiscoveryProvider = discoveryProvider
            || new LocalDiscoveryProvider(storageProvider);
        const documentSerializer = new DocumentSerializer();
        const contentResolver = new LocalContentResolver(publisherProvider);

        // The 0.2.15 decentralized index plane.
        const spatialIndexStore = new LocalSpatialIndexStore(storageProvider);
        const spatialIndexBuilder = new SpatialIndexBuilder(spatialIndexStore, {
            cellSize: options.cellSize
        });
        const spatialDiscoveryProvider = new DecentralizedSpatialDiscoveryProvider({
            spatialIndexStore,
            placementRegistry
        });

        return {
            spatialDiscoveryProvider,
            contentResolver,
            placementRegistry,
            spatialIndexProvider,
            spatialIndexStore,
            spatialIndexBuilder,
            discoverWorldAreaUseCase: new DiscoverWorldAreaUseCase(
                spatialDiscoveryProvider
            ),
            resolvePublicationUseCase: new ResolvePublicationUseCase(
                contentResolver,
                localDiscoveryProvider,
                documentSerializer
            ),
            placePublicationUseCase: new PlacePublicationUseCase(
                spatialIndexProvider,
                localDiscoveryProvider,
                new LoadPublicationDocumentUseCase(storageProvider),
                new CreateBrickRegistryUseCase().execute(),
                placementRegistry,
                identityProvider
            ),
            moveWorldPlacementUseCase: new MoveWorldPlacementUseCase(
                spatialIndexProvider,
                placementRegistry,
                spatialIndexBuilder
            ),
            removeWorldPlacementUseCase: new RemoveWorldPlacementUseCase(
                spatialIndexProvider,
                placementRegistry
            ),
            rebuildSpatialIndexUseCase: new RebuildSpatialIndexUseCase(
                spatialIndexBuilder,
                placementRegistry
            )
        };
    }
}
