// 0.2.65 — the base class every rendezvous-network mechanism extends,
// exactly the same throwing-stubs/one-concrete-Local*-implementation-today
// shape as peer/PeerConnectionProvider.js and peer/PeerDiscoveryProvider.js.
//
// A deliberately tiny protocol — three verbs, nothing else:
//
//   PUBLISH   "here is where identityHint might be reachable, for a while"
//   LOOKUP    "what do you currently have published for identityId?"
//   REMOVE    "withdraw one specific publication"
//
// A RendezvousTransport never authenticates anyone and never verifies that
// whoever calls publish() for a given identityId is actually entitled to
// speak for it — see peer/RendezvousPublication.js's own header. It is
// exactly as untrusted as peer/PeerDiscoveryProvider.js's own list()/
// discover(): a network able to answer LOOKUP is a network able to lie on
// LOOKUP, and peer/RendezvousDiscoveryProvider.js built on top of this
// class is written accordingly — every result is a candidate, checked
// against reality only by peer/PeerAuthenticationSession.js's own
// handshake, never here.
//
// Today's one concrete implementation, peer/LocalRendezvousNetwork.js, is
// an in-memory stand-in for a real rendezvous SERVER (or, eventually, a
// DHT) — real, working code exercising the exact contract a future
// networked implementation will also have to satisfy.
export class RendezvousTransport {
    // Publishes `publication` (a peer/RendezvousPublication.js), replacing
    // whatever this transport last had published for the SAME identityId
    // — see peer/LocalRendezvousNetwork.js's own header on why the network
    // never accumulates history, only ever holds "where identityId is
    // reachable right now." Returns the stored publication.
    publish(publication) {
        throw new Error('RendezvousTransport.publish() must be implemented by a subclass');
    }

    // Every currently-fresh publication this transport has for
    // `identityId` — never an expired one. May throw when the transport
    // itself is unreachable; see peer/RendezvousDiscoveryProvider.js#discover
    // for how a caller is expected to degrade, not crash, when it does.
    lookup(identityId) {
        throw new Error('RendezvousTransport.lookup() must be implemented by a subclass');
    }

    // Withdraws one publication by its own publicationId. Returns true if
    // something was actually removed. Never implied by mere expiry — see
    // peer/RendezvousDiscoveryProvider.js#unpublish.
    remove(publicationId) {
        throw new Error('RendezvousTransport.remove() must be implemented by a subclass');
    }
}
