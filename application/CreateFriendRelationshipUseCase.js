import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { FriendRelationshipUseCase } from './FriendRelationshipUseCase.js';

// Wires the concrete storage backend so ui/ never imports storage/
// directly — same shape, and same reason, as
// application/CreatePeerRelationshipUseCase.js. `peerMessageBus`/
// `connectedPeerRegistry` are passed straight through: this class does
// not construct either, since both are shared, app-wide collaborators
// (see ui/main.js) that FriendRelationshipUseCase's own header
// documents as never owned by it.
export class CreateFriendRelationshipUseCase {
    execute(identityProvider, { peerMessageBus, connectedPeerRegistry } = {}) {
        const storageProvider = new LocalStorageProvider();
        return new FriendRelationshipUseCase(storageProvider, identityProvider, { peerMessageBus, connectedPeerRegistry });
    }
}
