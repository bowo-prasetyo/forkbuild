import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { PublishDocumentUseCase } from './PublishDocumentUseCase.js';

// Wires the concrete publishing backend and returns the use case, so ui/
// never imports publisher/ or storage/ directly. Same shape as
// CreatePersistenceUseCase and CreateIdentityProviderUseCase.
// Swapping to a Steem/Hive/Ethereum publisher later means changing
// exactly this one file — the use case and UI stay untouched.
export class CreatePublisherUseCase {
    execute(identityProvider) {
        const storageProvider = new LocalStorageProvider();
        const publisherProvider = new LocalPublisherProvider(storageProvider);
        return {
            publishDocumentUseCase: new PublishDocumentUseCase(publisherProvider, identityProvider)
        };
    }
}
