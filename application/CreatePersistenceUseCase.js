import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalRecoveryStore } from '../persistence/LocalRecoveryStore.js';
import { SaveDocumentUseCase } from './SaveDocumentUseCase.js';
import { LoadDocumentUseCase } from './LoadDocumentUseCase.js';
import { ForkDocumentUseCase } from './ForkDocumentUseCase.js';
import { AutosaveDocumentUseCase } from './AutosaveDocumentUseCase.js';
import { RecoverDocumentUseCase } from './RecoverDocumentUseCase.js';
import { DiscardRecoveryUseCase } from './DiscardRecoveryUseCase.js';
import { CheckRecoveryUseCase } from './CheckRecoveryUseCase.js';

// Builds the concrete storage backend AND the recovery stack, so ui/
// never imports storage/ or persistence/ directly. As of 0.2.6 the
// SaveDocumentUseCase is wired with the recovery store so an explicit
// save supersedes any pending checkpoint, and the four recovery use cases
// are exposed alongside the existing persistence use cases.
export class CreatePersistenceUseCase {
    execute() {
        const storageProvider = new LocalStorageProvider();
        const recoveryStore = new LocalRecoveryStore(storageProvider);
        return {
            storageProvider,
            recoveryStore,
            saveDocumentUseCase: new SaveDocumentUseCase(
                storageProvider, undefined, undefined, recoveryStore
            ),
            loadDocumentUseCase: new LoadDocumentUseCase(storageProvider),
            forkDocumentUseCase: new ForkDocumentUseCase(storageProvider),
            autosaveDocumentUseCase: new AutosaveDocumentUseCase(recoveryStore, storageProvider),
            recoverDocumentUseCase: new RecoverDocumentUseCase(recoveryStore),
            discardRecoveryUseCase: new DiscardRecoveryUseCase(recoveryStore),
            checkRecoveryUseCase: new CheckRecoveryUseCase(recoveryStore, storageProvider)
        };
    }
}
