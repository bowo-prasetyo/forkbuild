import { PeerInvitation } from '../peer/PeerInvitation.js';

// 0.2.50 — thin delegation over a peer/PeerDiscoveryProvider.js, exactly
// the same division application/IdentityUseCase.js already keeps between
// "UI-facing surface" and "where the actual logic lives." Nothing here
// decides whether a candidate is trustworthy — that question belongs
// entirely to peer/PeerAuthenticationSession.js, layered on top of
// whatever connection application/ConnectToPeerUseCase.js opens to a
// record this class returns.
export class DiscoverPeersUseCase {
    constructor(peerDiscoveryProvider) {
        if (!peerDiscoveryProvider) {
            throw new Error('DiscoverPeersUseCase: peerDiscoveryProvider is required');
        }
        this._provider = peerDiscoveryProvider;
    }

    // Alice's side of "create invitation." `identityProvider`, when given
    // and currently authenticated, supplies its own identityId as the
    // invitation's identityHint — a courtesy for the receiving side's UI,
    // never anything peer/PeerAuthenticationSession.js relies on. An
    // anonymous or omitted identityProvider simply produces a hint-less
    // invitation.
    createInvitation({ endpoint, identityProvider = null, ttlMs } = {}) {
        let identityHint = null;
        if (identityProvider && typeof identityProvider.isAuthenticated === 'function' && identityProvider.isAuthenticated()) {
            try {
                identityHint = identityProvider.getSigningIdentity().id;
            } catch {
                identityHint = null;
            }
        }
        return PeerInvitation.create({ endpoint, identityHint, ...(ttlMs ? { ttlMs } : {}) });
    }

    // Bob's side of "import/accept it." Throws for a malformed or expired
    // invitation — see peer/LocalPeerDiscoveryProvider.js.
    importInvitation(invitation) {
        return this._provider.importInvitation(invitation);
    }

    listDiscoveredPeers() {
        return this._provider.list();
    }

    // 0.2.64 — "search what this device has already discovered for a
    // specific identity." Pure delegation, exactly like every other
    // method here: this class has no opinion about how the underlying
    // provider answers, only that whatever it returns is a candidate,
    // never a proof — see peer/PeerDiscoveryProvider.js#discover's own
    // header.
    discover(identityId) {
        return this._provider.discover(identityId);
    }

    forgetDiscoveredPeer(peerDiscoveryId) {
        this._provider.forget(peerDiscoveryId);
    }

    // Returns an unsubscribe function.
    onDiscovered(callback) {
        return this._provider.onDiscovered(callback);
    }
}
