import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacePublicationUseCase } from './PlacePublicationUseCase.js';
import { MoveWorldPlacementUseCase } from './MoveWorldPlacementUseCase.js';
import { RemoveWorldPlacementUseCase } from './RemoveWorldPlacementUseCase.js';
import { DiscoverPlacementsUseCase } from './DiscoverPlacementsUseCase.js';
import { DiscoverWorldsUseCase } from './DiscoverWorldsUseCase.js';
import { LoadPublicationDocumentUseCase } from './LoadPublicationDocumentUseCase.js';
import { CreateBrickRegistryUseCase } from './CreateBrickRegistryUseCase.js';

// Wires the concrete placement registry backend and the use cases that
// depend on it. Same DI pattern as CreateSpatialIndexUseCase.
//
// The LocalPlacementRegistry writes to both the registry AND the
// spatial index, so the existing DiscoverWorldsUseCase continues to
// work unchanged.
export class CreatePlacementRegistryUseCase {
    execute(discoveryProvider, identityProvider = null) {
        const storageProvider = new LocalStorageProvider();
        const spatialIndexProvider = new LocalSpatialIndexProvider(storageProvider);
        const placementRegistry = new LocalPlacementRegistry(
            storageProvider,
            spatialIndexProvider
        );
        const loadDocumentUseCase = new LoadPublicationDocumentUseCase(storageProvider);
        const brickRegistry = new CreateBrickRegistryUseCase().execute();

        return {
            placementRegistry,
            spatialIndexProvider,
            placePublicationUseCase: new PlacePublicationUseCase(
                spatialIndexProvider,
                discoveryProvider,
                loadDocumentUseCase,
                brickRegistry,
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
            ),
            discoverPlacementsUseCase: new DiscoverPlacementsUseCase(placementRegistry),
            discoverWorldsUseCase: new DiscoverWorldsUseCase(spatialIndexProvider)
        };
    }
}
