import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LoadPublicationDocumentUseCase } from './LoadPublicationDocumentUseCase.js';
import { WorldViewSession } from './WorldViewSession.js';

export class CreateWorldViewUseCase {
    execute() {
        const storageProvider = new LocalStorageProvider();
        const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(storageProvider);

        return {
            createSession(registry) {
                return new WorldViewSession({ registry, loadPublicationDocumentUseCase });
            }
        };
    }
}
