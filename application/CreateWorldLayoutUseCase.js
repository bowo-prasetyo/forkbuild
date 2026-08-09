import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';

// Builds the concrete world layout backend, so ui/ never imports
// world-layout/ or discovery/ directly. Same shape as
// CreatePersistenceUseCase and CreatePublisherUseCase.
export class CreateWorldLayoutUseCase {
    execute() {
        const storageProvider = new LocalStorageProvider();
        const discoveryProvider = new LocalDiscoveryProvider(storageProvider);
        const worldLayoutProvider = new LocalWorldLayoutProvider(discoveryProvider);
        return { worldLayoutProvider };
    }
}
