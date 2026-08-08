import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { ListPublicationsUseCase } from './ListPublicationsUseCase.js';
import { FindPublicationUseCase } from './FindPublicationUseCase.js';

// Builds the concrete discovery backend and the use cases that depend on
// it, so ui/ never imports discovery/ directly. Same shape as
// CreatePersistenceUseCase and CreatePublisherUseCase.
export class CreateDiscoveryUseCase {
    execute() {
        const storageProvider = new LocalStorageProvider();
        const discoveryProvider = new LocalDiscoveryProvider(storageProvider);
        return {
            discoveryProvider,
            listPublicationsUseCase: new ListPublicationsUseCase(discoveryProvider),
            findPublicationUseCase: new FindPublicationUseCase(discoveryProvider)
        };
    }
}
