import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { ConversationReadOutbox } from './ConversationReadOutbox.js';

// 0.2.71 — wires the concrete storage backend so ui/ never imports
// storage/ directly, the exact same shape as
// application/CreateChatOutboxUseCase.js/CreateConversationReadTrackerUseCase.js,
// for the exact same reason: a durable read-acknowledgement outbox is
// meaningless without a real backend behind it, and only this wiring
// boundary is allowed to know which one.
export class CreateConversationReadOutboxUseCase {
    execute(identityProvider) {
        const storageProvider = new LocalStorageProvider();
        return new ConversationReadOutbox(storageProvider, identityProvider);
    }
}
