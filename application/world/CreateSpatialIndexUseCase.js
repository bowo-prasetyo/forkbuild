import { LocalStorageProvider } from '../../storage/LocalStorageProvider.js';
import { LocalSpatialIndexProvider } from '../../spatial/LocalSpatialIndexProvider.js';
import { PlacePublicationUseCase } from '../placement/PlacePublicationUseCase.js';
import { MoveWorldPlacementUseCase } from '../placement/MoveWorldPlacementUseCase.js';
import { RemoveWorldPlacementUseCase } from '../placement/RemoveWorldPlacementUseCase.js';
import { DiscoverWorldsUseCase } from '../discovery/DiscoverWorldsUseCase.js';
import { LoadPublicationDocumentUseCase } from '../publication/LoadPublicationDocumentUseCase.js';
import { CreateBrickRegistryUseCase } from '../editor/CreateBrickRegistryUseCase.js';

// Wires the concrete spatial index backend and the use cases that
// depend on it. Same DI pattern as CreatePersistenceUseCase.
export class CreateSpatialIndexUseCase {
    execute(discoveryProvider) {
        const storageProvider = new LocalStorageProvider();
        const spatialIndexProvider = new LocalSpatialIndexProvider(storageProvider);
        const loadDocumentUseCase = new LoadPublicationDocumentUseCase(storageProvider);
        const brickRegistry = new CreateBrickRegistryUseCase().execute();

        return {
            spatialIndexProvider,
            placePublicationUseCase: new PlacePublicationUseCase(
                spatialIndexProvider, discoveryProvider, loadDocumentUseCase, brickRegistry
            ),
            moveWorldPlacementUseCase: new MoveWorldPlacementUseCase(spatialIndexProvider),
            removeWorldPlacementUseCase: new RemoveWorldPlacementUseCase(spatialIndexProvider),
            discoverWorldsUseCase: new DiscoverWorldsUseCase(spatialIndexProvider)
        };
    }
}
