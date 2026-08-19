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
    // header. Async as of 0.2.66 — see peer/RendezvousTransport.js's own
    // header on why a genuinely networked provider cannot answer
    // synchronously; `await`-ing a provider that still does (peer/
    // LocalPeerDiscoveryProvider.js) is a no-op beyond the microtask.
    async discover(identityId) {
        return this._provider.discover(identityId);
    }

    forgetDiscoveredPeer(peerDiscoveryId) {
        this._provider.forget(peerDiscoveryId);
    }

    // 0.2.66 — "make me findable," duck-typed past whatever the
    // underlying provider actually supports: a bare peer/
    // RendezvousDiscoveryProvider.js's own publish() (one publication
    // back), or — when this class was handed a peer/DiscoveryBootstrap.js
    // instead, the shape application/PeerSessionManager.js is actually
    // constructed with — its publishToAll() fan-out (see that file's own
    // header). A provider with NEITHER (peer/LocalPeerDiscoveryProvider.js,
    // this class's own default) simply has nothing to do here, and
    // publishToAll() reaching zero configured bootstrap providers (peer/
    // RendezvousConfig.js's own empty-by-default DEFAULT_RENDEZVOUS_URLS)
    // is the SAME "nothing to do" outcome, not a different one — both
    // resolve to `null`, deliberately never an empty-but-truthy array, so
    // a caller checking `Boolean(result)` (application/PeerSessionManager.js#publishSelf)
    // never mistakes "no rendezvous network is configured" for success.
    async publish(invitationInput, options) {
        if (typeof this._provider.publish === 'function') {
            return this._provider.publish(invitationInput, options);
        }
        if (typeof this._provider.publishToAll === 'function') {
            const published = await this._provider.publishToAll(invitationInput, options);
            return published.length > 0 ? published : null;
        }
        return null;
    }

    // Withdraws a publication — a bare peer/RendezvousDiscoveryProvider.js's
    // own unpublish(), or, when this class was handed a peer/
    // DiscoveryBootstrap.js instead, its unpublishFromAll() fan-out (see
    // that file's own header). Neither existing means "nothing to
    // withdraw" — same as publish() above, never an error.
    async unpublish(publicationId) {
        if (typeof this._provider.unpublish === 'function') {
            return this._provider.unpublish(publicationId);
        }
        if (typeof this._provider.unpublishFromAll === 'function') {
            await this._provider.unpublishFromAll();
            return true;
        }
        return false;
    }

    // Returns an unsubscribe function.
    onDiscovered(callback) {
        return this._provider.onDiscovered(callback);
    }
}
