import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { ChatOutbox } from './ChatOutbox.js';

// 0.2.63 — wires the concrete storage backend so ui/ never imports
// storage/ directly, the exact same shape as
// application/CreatePeerRelationshipUseCase.js/CreatePeerBlockUseCase.js,
// for the exact same reason: a durable local outbox is meaningless
// without a real backend behind it, and only this wiring boundary is
// allowed to know which one.
export class CreateChatOutboxUseCase {
    execute(identityProvider) {
        const storageProvider = new LocalStorageProvider();
        return new ChatOutbox(storageProvider, identityProvider);
    }
}
