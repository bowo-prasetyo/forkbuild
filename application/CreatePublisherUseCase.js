import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PublishDocumentUseCase } from './PublishDocumentUseCase.js';
import { PlacePublicationUseCase } from './PlacePublicationUseCase.js';
import { GridPlacementStrategy } from './InitialPlacementStrategy.js';
import { LoadPublicationDocumentUseCase } from './LoadPublicationDocumentUseCase.js';
import { CreateBrickRegistryUseCase } from './CreateBrickRegistryUseCase.js';
import { LocalContentStore } from '../content/LocalContentStore.js';

// Wires the concrete publishing backend and returns the use case, so ui/
// never imports publisher/ or storage/ directly. Same shape as
// CreatePersistenceUseCase and CreateIdentityProviderUseCase.
// Swapping to a Steem/Hive/Ethereum publisher later means changing
// exactly this one file — the use case and UI stay untouched.
//
// 0.2.23: wires the same placement stack CreateWorldViewUseCase does
// (LocalPlacementRegistry + PlacePublicationUseCase + a
// GridPlacementStrategy) into PublishDocumentUseCase, so a document
// published from the Editor gets an explicit initial placement exactly
// like one published from World View — one guarantee ("every publish
// gets a placement"), not two call sites that could drift apart.
export class CreatePublisherUseCase {
    execute(identityProvider) {
        const storageProvider = new LocalStorageProvider();
        const contentStore = new LocalContentStore(storageProvider);
        const publisherProvider = new LocalPublisherProvider(storageProvider, contentStore);

        const discoveryProvider = new LocalDiscoveryProvider(storageProvider);
        const spatialIndexProvider = new LocalSpatialIndexProvider(storageProvider);
        const placementRegistry = new LocalPlacementRegistry(storageProvider, spatialIndexProvider);
        const placePublicationUseCase = new PlacePublicationUseCase(
            spatialIndexProvider,
            discoveryProvider,
            new LoadPublicationDocumentUseCase(storageProvider),
            new CreateBrickRegistryUseCase().execute(),
            placementRegistry,
            identityProvider
        );
        const initialPlacementStrategy = new GridPlacementStrategy(discoveryProvider);

        return {
            publishDocumentUseCase: new PublishDocumentUseCase(
                publisherProvider,
                identityProvider,
                placePublicationUseCase,
                initialPlacementStrategy
            ),
            contentStore
        };
    }
}
