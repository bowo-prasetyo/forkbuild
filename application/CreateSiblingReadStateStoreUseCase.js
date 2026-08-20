import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { SiblingReadStateStore } from './SiblingReadStateStore.js';

// 0.2.83 — wires the concrete storage backend so ui/ never imports
// storage/ directly, the exact same shape as
// application/CreateConversationReadTrackerUseCase.js/
// CreateRemoteReadReceiptStoreUseCase.js.
export class CreateSiblingReadStateStoreUseCase {
    execute(identityProvider) {
        const storageProvider = new LocalStorageProvider();
        return new SiblingReadStateStore(storageProvider, identityProvider);
    }
}
