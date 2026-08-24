import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LibraryUsageHistoryStore } from './LibraryUsageHistoryStore.js';

// 0.6.4 — Blueprint Discovery, Search & Library Organization. Builds the
// "Recent" section's local persistence backend — the exact same shape
// application/CreatePersonalStructureLibraryUseCase.js already
// establishes for the Personal Structure Library itself: construct a
// concrete LocalStorageProvider, hand it to the store that knows what
// to do with it, so ui/ never imports storage/ directly. A fresh
// LocalStorageProvider instance here reads/writes the SAME underlying
// window.localStorage under the same 'forkbuild:' prefix every other
// LocalStorageProvider instance does — never a second, disconnected
// storage backend.
export class CreateLibraryUsageHistoryUseCase {
    execute() {
        const storageProvider = new LocalStorageProvider();
        return {
            libraryUsageHistoryStore: new LibraryUsageHistoryStore({ storageProvider })
        };
    }
}
