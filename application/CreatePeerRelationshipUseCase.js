import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { PeerRelationshipUseCase } from './PeerRelationshipUseCase.js';

// Wires the concrete storage backend so ui/ never imports storage/
// directly — same shape, and same reason, as
// application/CreateAvatarProfileUseCase.js. Takes the already-wired
// identityProvider as a parameter rather than constructing its own,
// matching CreateAvatarProfileUseCase's own convention: a peer
// relationship is meaningless without knowing whose local relationship
// list it belongs to, and the app already has exactly one shared
// identityProvider instance (see ui/main.js) every other use case is
// wired against.
export class CreatePeerRelationshipUseCase {
    execute(identityProvider) {
        const storageProvider = new LocalStorageProvider();
        return new PeerRelationshipUseCase(storageProvider, identityProvider);
    }
}
