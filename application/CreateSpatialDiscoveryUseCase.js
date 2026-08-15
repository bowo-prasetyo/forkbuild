import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalSpatialDiscoveryProvider } from '../discovery/LocalSpatialDiscoveryProvider.js';
import { LocalContentResolver } from '../discovery/LocalContentResolver.js';
import { DiscoverWorldAreaUseCase } from './DiscoverWorldAreaUseCase.js';
import { ResolvePublicationUseCase } from './ResolvePublicationUseCase.js';
import { PlacePublicationUseCase } from './PlacePublicationUseCase.js';
import { MoveWorldPlacementUseCase } from './MoveWorldPlacementUseCase.js';
import { RemoveWorldPlacementUseCase } from './RemoveWorldPlacementUseCase.js';
import { LoadPublicationDocumentUseCase } from './LoadPublicationDocumentUseCase.js';
import { CreateBrickRegistryUseCase } from './CreateBrickRegistryUseCase.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';

// Wires the spatial discovery and content resolution backend.
// Same DI pattern as CreatePlacementRegistryUseCase and
// CreateSpatialIndexUseCase.
//
// The LocalSpatialDiscoveryProvider delegates to SpatialIndexProvider
// for spatial queries and PlacementRegistry for record details.
// The LocalContentResolver delegates to PublisherProvider for
// snapshot retrieval.
//
// Swapping to IPFS/Arweave/blockchain means changing exactly this
// one file — the use cases and UI stay untouched.
export class CreateSpatialDiscoveryUseCase {
    execute(discoveryProvider = null, identityProvider = null) {
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

        const spatialDiscoveryProvider = new LocalSpatialDiscoveryProvider(
            spatialIndexProvider,
            placementRegistry
        );
        const contentResolver = new LocalContentResolver(publisherProvider);

        return {
            spatialDiscoveryProvider,
            contentResolver,
            placementRegistry,
            spatialIndexProvider,
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
                null,
                identityProvider
            ),
            removeWorldPlacementUseCase: new RemoveWorldPlacementUseCase(
                spatialIndexProvider,
                placementRegistry
            )
        };
    }
}
