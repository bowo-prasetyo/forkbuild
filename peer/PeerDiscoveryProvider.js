// Base class every peer discovery mechanism extends (0.2.50). Answers "how
// do I FIND a candidate endpoint for a peer?" — deliberately the narrowest
// possible interface, the same throwing-stubs/one-concrete-Local*-
// implementation-today shape as discovery/DiscoveryProvider.js and
// peer/PeerConnectionProvider.js.
//
// A PeerDiscoveryProvider never opens a connection and never authenticates
// anyone — see docs/Principles.md, "Discovery Finds A Candidate; It Never
// Authenticates One." It only ever answers "what endpoints are worth
// attempting?", as peer/PeerDiscoveryRecord.js instances. The application
// layer (application/DiscoverPeersUseCase.js) and, eventually, the UI never
// need to know whether an implementation found those endpoints via a
// portable invitation (today's peer/LocalPeerDiscoveryProvider.js), a LAN
// broadcast, a rendezvous service, or a DHT — every one of those is just
// another PeerDiscoveryProvider.
export class PeerDiscoveryProvider {
    // Validates and registers a peer/PeerInvitation.js, producing a
    // PeerDiscoveryRecord. Throws for a malformed or expired invitation —
    // an expired invitation is refused here, at discovery time, never
    // silently allowed through to become a connection attempt.
    importInvitation(invitation) {
        throw new Error('PeerDiscoveryProvider.importInvitation() must be implemented by a subclass');
    }

    // Every PeerDiscoveryRecord this provider currently knows about —
    // never an expired one; see peer/PeerDiscoveryRecord.js#isExpired().
    list() {
        throw new Error('PeerDiscoveryProvider.list() must be implemented by a subclass');
    }

    // 0.2.64 — "does this provider currently hold any candidate CLAIMING
    // to be this identity?" Deliberately named discover(), not find() or
    // lookup(): the result is exactly as untrusted as list()'s own
    // records, filtered by identityHint alone — a field this provider
    // never verified and never will (see peer/PeerDiscoveryRecord.js's own
    // header). A caller (application/FindPeerUseCase.js) treats every
    // returned record as "candidate found," never "identity found," and
    // still owes it a full connection + peer/PeerAuthenticationSession.js
    // handshake before that record means anything at all.
    discover(identityId) {
        throw new Error('PeerDiscoveryProvider.discover() must be implemented by a subclass');
    }

    // Discards one record. Forgetting a candidate has no effect on any
    // connection that may already have been made from it — a
    // PeerDiscoveryRecord and a live ConnectedPeer (application/
    // ConnectedPeer.js) are already two separate facts by the time a
    // connection exists at all.
    forget(peerDiscoveryId) {
        throw new Error('PeerDiscoveryProvider.forget() must be implemented by a subclass');
    }

    // Returns an unsubscribe function. Fires whenever a NEW
    // PeerDiscoveryRecord becomes known to this provider, whether that was
    // caused by a direct call (importInvitation) or, for a future
    // push-based mechanism (LAN, a rendezvous service), by something
    // arriving on its own. One event source regardless of mechanism is
    // what lets a UI subscribe once and never special-case how a peer was
    // found.
    onDiscovered(callback) {
        throw new Error('PeerDiscoveryProvider.onDiscovered() must be implemented by a subclass');
    }

    dispose() {
        throw new Error('PeerDiscoveryProvider.dispose() must be implemented by a subclass');
    }
}
