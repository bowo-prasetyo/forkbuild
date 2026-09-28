import { LocalStorageProvider } from '../../../storage/LocalStorageProvider.js';
import { LocalPublisherProvider } from '../../../publisher/LocalPublisherProvider.js';
import { FindOwnSharedPublicationUseCase } from './FindOwnSharedPublicationUseCase.js';

// Wires FindOwnSharedPublicationUseCase to this device's own publication
// records (the same storage CreatePublisherUseCase publishes into), so ui/
// never imports publisher/ or storage/ directly. `contentStore` is the one
// the catalog's envelopes point into (CreatePublicationResolverUseCase's).
export class CreateFindOwnSharedPublicationUseCase {
    execute({ contentStore } = {}) {
        const publisherProvider = new LocalPublisherProvider(new LocalStorageProvider());
        return new FindOwnSharedPublicationUseCase({ contentStore, publisherProvider });
    }
}
