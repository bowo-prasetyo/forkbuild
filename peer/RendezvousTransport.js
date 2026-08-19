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
// 0.2.65 shipped one concrete implementation, peer/LocalRendezvousNetwork.js
// — an in-memory stand-in for a real rendezvous SERVER, real working code
// exercising the exact contract a future networked implementation would
// also have to satisfy, but synchronous throughout, because an in-process
// Map never needs to await anything.
//
// 0.2.66 adds the networked implementation that comment was written for —
// peer/WebSocketRendezvousTransport.js — and a real network round trip
// cannot be synchronous. Every method below is therefore now ASYNC:
// publish()/lookup()/remove() each return a Promise, resolving exactly to
// what they always returned (a stored publication, an array of fresh
// publications, a boolean), rejecting exactly where they always threw (the
// transport is unreachable). peer/LocalRendezvousNetwork.js's own
// implementation stays entirely synchronous internally — wrapping an
// already-resolved value in a Promise costs it nothing and changes no
// externally-visible behavior beyond requiring `await` at every call
// site. See peer/RendezvousDiscoveryProvider.js#discover/#publish/#unpublish
// and peer/DiscoveryBootstrap.js#discover/#publishToAll for how the
// `await` propagates upward exactly one layer at a time, same as it
// already did for peer/WebRtcPeerConnectionProvider.js's own async
// signaling.
export class RendezvousTransport {
    // Publishes `publication` (a peer/RendezvousPublication.js), replacing
    // whatever this transport last had published for the SAME identityId
    // — see peer/LocalRendezvousNetwork.js's own header on why the network
    // never accumulates history, only ever holds "where identityId is
    // reachable right now." Resolves to the stored publication.
    async publish(publication) {
        throw new Error('RendezvousTransport.publish() must be implemented by a subclass');
    }

    // Every currently-fresh publication this transport has for
    // `identityId` — never an expired one. May reject when the transport
    // itself is unreachable; see peer/RendezvousDiscoveryProvider.js#discover
    // for how a caller is expected to degrade, not crash, when it does.
    async lookup(identityId) {
        throw new Error('RendezvousTransport.lookup() must be implemented by a subclass');
    }

    // Withdraws one publication by its own publicationId. Resolves to true
    // if something was actually removed. Never implied by mere expiry —
    // see peer/RendezvousDiscoveryProvider.js#unpublish.
    async remove(publicationId) {
        throw new Error('RendezvousTransport.remove() must be implemented by a subclass');
    }
}
