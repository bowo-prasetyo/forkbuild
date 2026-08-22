import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalStructureLibraryStore } from './LocalStructureLibraryStore.js';

// Builds the Personal Structure Library's local persistence backend —
// the exact same shape application/CreatePersistenceUseCase.js and
// application/CreateWorldViewUseCase.js already establish for their own
// local-only stores: construct a concrete LocalStorageProvider, then
// hand it to the store that knows what to do with it, so ui/ never
// imports storage/ directly. A fresh LocalStorageProvider instance here
// is never a second, disconnected storage backend — every instance
// reads/writes the SAME underlying window.localStorage under the same
// 'forkbuild:' prefix (see storage/LocalStorageProvider.js), the same
// way CreatePersistenceUseCase and CreateWorldViewUseCase already
// construct their own LocalStorageProvider independently rather than
// sharing one passed down.
export class CreatePersonalStructureLibraryUseCase {
    execute() {
        const storageProvider = new LocalStorageProvider();
        return {
            personalStructureLibraryStore: new LocalStructureLibraryStore({ storageProvider })
        };
    }
}
