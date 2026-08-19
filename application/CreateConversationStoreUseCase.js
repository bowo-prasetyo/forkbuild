import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { ConversationStore } from './ConversationStore.js';

// 0.2.69 — wires the concrete storage backend so ui/ never imports
// storage/ directly, the exact same shape as
// application/CreateChatOutboxUseCase.js/CreatePeerRelationshipUseCase.js,
// for the exact same reason: a durable conversation history is
// meaningless without a real backend behind it, and only this wiring
// boundary is allowed to know which one.
export class CreateConversationStoreUseCase {
    execute(identityProvider) {
        const storageProvider = new LocalStorageProvider();
        return new ConversationStore(storageProvider, identityProvider);
    }
}
