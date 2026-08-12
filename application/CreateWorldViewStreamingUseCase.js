import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalSpatialDiscoveryProvider } from '../discovery/LocalSpatialDiscoveryProvider.js';
import { LocalContentResolver } from '../discovery/LocalContentResolver.js';
import { DiscoverWorldAreaUseCase } from './DiscoverWorldAreaUseCase.js';
import { ResolvePublicationUseCase } from './ResolvePublicationUseCase.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { PublicationContentCache } from '../world/PublicationContentCache.js';
import { WorldViewStreamingSession } from '../world/WorldViewStreamingSession.js';

// Wires the World View streaming backend.
//
// The PublicationContentCache is instantiated here and shared with
// the ResolvePublicationUseCase. This ensures that if the camera
// moves around and triggers multiple resolutions for the same
// publication, the network/storage I/O happens exactly once.
export class CreateWorldViewStreamingUseCase {
    execute(options = {}) {
        const storageProvider = new LocalStorageProvider();
        const spatialIndexProvider = new LocalSpatialIndexProvider(storageProvider);
        const placementRegistry = new LocalPlacementRegistry(storageProvider, spatialIndexProvider);
        const publisherProvider = new LocalPublisherProvider(storageProvider);
        const discoveryProvider = new LocalDiscoveryProvider(storageProvider);
        
        const spatialDiscoveryProvider = new LocalSpatialDiscoveryProvider(
            spatialIndexProvider,
            placementRegistry
        );
        const contentResolver = new LocalContentResolver(publisherProvider);
        const documentSerializer = new DocumentSerializer();
        const contentCache = new PublicationContentCache();

        const discoverWorldAreaUseCase = new DiscoverWorldAreaUseCase(spatialDiscoveryProvider);
        const resolvePublicationUseCase = new ResolvePublicationUseCase(
            contentResolver,
            discoveryProvider,
            documentSerializer,
            contentCache
        );

        return {
            contentCache,
            session: new WorldViewStreamingSession({
                discoverWorldAreaUseCase,
                resolvePublicationUseCase,
                loadRadius: options.loadRadius || 500,
                unloadRadius: options.unloadRadius || 700
            })
        };
    }
}
