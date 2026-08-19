import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { IdentityLifecyclePropagationUseCase } from './IdentityLifecyclePropagationUseCase.js';

// Wires the concrete storage backend so ui/ never imports storage/
// directly — same shape, and same reason, as application/
// CreateFriendRelationshipUseCase.js. `peerMessageBus`/
// `connectedPeerRegistry` are passed straight through: both are
// shared, app-wide collaborators (see ui/main.js) that
// IdentityLifecyclePropagationUseCase's own header documents as never
// owned by it.
//
// `peerRelationshipUseCase`/`friendRelationshipUseCase` are the SAME
// shared, app-wide collaborators, consulted here only to derive the
// `knowsIdentity` predicate — "has this device remembered this
// identity as a Known Peer or a Friend?" — never passed to
// IdentityLifecyclePropagationUseCase's constructor directly, the same
// one-level-of-indirection application/CreateFriendRelationshipUseCase.js
// already uses for `peerBlockUseCase` -> `isBlocked`.
export class CreateIdentityLifecyclePropagationUseCase {
    execute(identityProvider, { peerMessageBus, connectedPeerRegistry, peerRelationshipUseCase = null, friendRelationshipUseCase = null } = {}) {
        const storageProvider = new LocalStorageProvider();
        const knowsIdentity = (peerRelationshipUseCase || friendRelationshipUseCase)
            ? (identityId) => Boolean(
                (peerRelationshipUseCase && peerRelationshipUseCase.isKnown(identityId))
                || (friendRelationshipUseCase && friendRelationshipUseCase.getRelationship(identityId))
            )
            : undefined;
        return new IdentityLifecyclePropagationUseCase(storageProvider, identityProvider, {
            peerMessageBus,
            connectedPeerRegistry,
            ...(knowsIdentity ? { knowsIdentity } : {})
        });
    }
}
