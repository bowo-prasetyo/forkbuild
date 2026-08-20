import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { DeviceAuthorizationPropagationUseCase } from './DeviceAuthorizationPropagationUseCase.js';

// 0.2.79 — Multi-Device Social State Semantics.
//
// Wires the concrete storage backend so ui/ never imports storage/
// directly — same shape, and same reason, as application/
// CreateFriendRelationshipUseCase.js and application/
// CreateIdentityLifecyclePropagationUseCase.js. `peerMessageBus`/
// `connectedPeerRegistry` are passed straight through: both are shared,
// app-wide collaborators (see ui/main.js) that
// application/DeviceAuthorizationPropagationUseCase.js's own header
// documents as never owned by it.
//
// `peerRelationshipUseCase`/`friendRelationshipUseCase` are consulted
// only to derive the `knowsIdentity` relevance predicate — the IDENTICAL
// one-level-of-indirection application/CreateIdentityLifecyclePropagationUseCase.js
// already established for the structurally identical question: a
// device-authorization fact about an identity this device has never
// remembered as a Known Peer or a Friend is dropped, never cached — see
// application/DeviceAuthorizationPropagationUseCase.js's own header.
export class CreateDeviceAuthorizationUseCase {
    execute(identityProvider, { peerMessageBus, connectedPeerRegistry, peerRelationshipUseCase = null, friendRelationshipUseCase = null } = {}) {
        const storageProvider = new LocalStorageProvider();
        const knowsIdentity = (peerRelationshipUseCase || friendRelationshipUseCase)
            ? (identityId) => Boolean(
                (peerRelationshipUseCase && peerRelationshipUseCase.isKnown(identityId))
                || (friendRelationshipUseCase && friendRelationshipUseCase.getRelationship(identityId))
            )
            : undefined;
        return new DeviceAuthorizationPropagationUseCase(storageProvider, identityProvider, {
            peerMessageBus,
            connectedPeerRegistry,
            ...(knowsIdentity ? { knowsIdentity } : {})
        });
    }
}
