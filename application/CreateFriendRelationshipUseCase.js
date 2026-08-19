import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { FriendRelationshipUseCase } from './FriendRelationshipUseCase.js';

// Wires the concrete storage backend so ui/ never imports storage/
// directly — same shape, and same reason, as
// application/CreatePeerRelationshipUseCase.js. `peerMessageBus`/
// `connectedPeerRegistry` are passed straight through: this class does
// not construct either, since both are shared, app-wide collaborators
// (see ui/main.js) that FriendRelationshipUseCase's own header
// documents as never owned by it.
//
// 0.2.60 — `peerBlockUseCase` is the SAME shared, app-wide collaborator
// (see ui/main.js), passed straight through the same way: this class
// derives the `isBlocked` predicate FriendRelationshipUseCase's own
// constructor consults, never the store itself.
export class CreateFriendRelationshipUseCase {
    execute(identityProvider, { peerMessageBus, connectedPeerRegistry, peerBlockUseCase = null } = {}) {
        const storageProvider = new LocalStorageProvider();
        const isBlocked = peerBlockUseCase ? (identityId) => peerBlockUseCase.isBlocked(identityId) : undefined;
        return new FriendRelationshipUseCase(storageProvider, identityProvider, {
            peerMessageBus,
            connectedPeerRegistry,
            ...(isBlocked ? { isBlocked } : {})
        });
    }
}
