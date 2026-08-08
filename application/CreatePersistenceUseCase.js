import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { SaveDocumentUseCase } from './SaveDocumentUseCase.js';
import { LoadDocumentUseCase } from './LoadDocumentUseCase.js';
import { ForkDocumentUseCase } from './ForkDocumentUseCase.js';

// Builds the concrete storage backend and the two use cases that depend
// on it, so ui/ never imports storage/ directly — the dependency
// direction rule stated since the core/application/renderer/ui reorg
// (application -> storage/publisher/identity/serializer) applies to ui/
// too: ui/ only ever talks to application/, and that includes reaching
// infrastructure adapters through it, not around it. Swapping storage
// backends later (IndexedDB, filesystem) means changing exactly this one
// file — SaveDocumentUseCase/LoadDocumentUseCase themselves stay
// storage-agnostic, as designed in 0.1.20A.
export class CreatePersistenceUseCase {
    execute() {
        const storageProvider = new LocalStorageProvider();
        return {
            saveDocumentUseCase: new SaveDocumentUseCase(storageProvider),
            loadDocumentUseCase: new LoadDocumentUseCase(storageProvider),
            forkDocumentUseCase: new ForkDocumentUseCase(storageProvider)
        };
    }
}
