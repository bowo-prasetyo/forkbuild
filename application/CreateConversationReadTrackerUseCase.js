import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { ConversationReadTracker } from './ConversationReadTracker.js';

// 0.2.70 — wires the concrete storage backend so ui/ never imports
// storage/ directly, the exact same shape as
// application/CreateConversationStoreUseCase.js/CreateChatOutboxUseCase.js,
// for the exact same reason: a durable read marker is meaningless
// without a real backend behind it, and only this wiring boundary is
// allowed to know which one.
export class CreateConversationReadTrackerUseCase {
    execute(identityProvider) {
        const storageProvider = new LocalStorageProvider();
        return new ConversationReadTracker(storageProvider, identityProvider);
    }
}
