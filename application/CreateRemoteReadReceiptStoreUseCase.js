import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { RemoteReadReceiptStore } from './RemoteReadReceiptStore.js';

// 0.2.71 — wires the concrete storage backend so ui/ never imports
// storage/ directly, the exact same shape as
// application/CreateConversationReadOutboxUseCase.js and every other
// Create*UseCase in this codebase.
export class CreateRemoteReadReceiptStoreUseCase {
    execute(identityProvider) {
        const storageProvider = new LocalStorageProvider();
        return new RemoteReadReceiptStore(storageProvider, identityProvider);
    }
}
