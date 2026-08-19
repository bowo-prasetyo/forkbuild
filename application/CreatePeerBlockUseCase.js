import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { PeerBlockUseCase } from './PeerBlockUseCase.js';

// 0.2.60 — wires the concrete storage backend so ui/ never imports
// storage/ directly, the exact same shape as
// application/CreatePeerRelationshipUseCase.js, for the exact same
// reason.
export class CreatePeerBlockUseCase {
    execute(identityProvider) {
        const storageProvider = new LocalStorageProvider();
        return new PeerBlockUseCase(storageProvider, identityProvider);
    }
}
