// 0.2.50 — how a PeerDiscoveryRecord (peer/PeerDiscoveryRecord.js) came to
// exist at all. Kept as its own small vocabulary, separate from the record
// itself, because the record's OWN shape never needs to change as new
// discovery mechanisms are added — only this enum grows.
//
// INVITATION is the only mechanism 0.2.50 actually implements (see
// peer/PeerInvitation.js and peer/LocalPeerDiscoveryProvider.js). LAN,
// RENDEZVOUS_SERVICE, and DHT are named here, unimplemented, purely so the
// application layer (application/DiscoverPeersUseCase.js) and any future UI
// never have to special-case "what kind of discovery was this" beyond
// reading this field — see docs/Roadmap.md's own "Peer Discovery & Transport
// Abstraction" for why none of those are built yet.
export const PeerDiscoverySource = Object.freeze({
    INVITATION: 'INVITATION'
});
