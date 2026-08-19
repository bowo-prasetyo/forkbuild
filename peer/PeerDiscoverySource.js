// 0.2.50 — how a PeerDiscoveryRecord (peer/PeerDiscoveryRecord.js) came to
// exist at all. Kept as its own small vocabulary, separate from the record
// itself, because the record's OWN shape never needs to change as new
// discovery mechanisms are added — only this enum grows.
//
// INVITATION was the only mechanism actually implemented through 0.2.64
// (see peer/PeerInvitation.js and peer/LocalPeerDiscoveryProvider.js) — a
// real candidate this device only ever learns about because a human
// relayed it out-of-band (copy/paste, a shared channel, a QR code).
// RENDEZVOUS_SERVICE joins it in 0.2.65 (see peer/
// RendezvousDiscoveryProvider.js): a real network PUBLISH/LOOKUP, never a
// local-only search. LAN and DISTRIBUTED remain named here, unimplemented,
// purely so the application layer (application/DiscoverPeersUseCase.js,
// application/FindPeerUseCase.js) and any future UI never have to
// special-case "what kind of discovery was this" beyond reading this
// field — see docs/Principles.md, "A Discovery Source Describes Provenance,
// Never Trustworthiness" (0.2.64): a record from RENDEZVOUS_SERVICE, or a
// hypothetical future LAN or DISTRIBUTED source, is not one bit more
// trusted than one from INVITATION — every source still produces nothing
// but an untrusted candidate, still required to pass peer/
// PeerAuthenticationSession.js's own handshake before it means anything.
export const PeerDiscoverySource = Object.freeze({
    INVITATION: 'INVITATION',
    LAN: 'LAN',
    RENDEZVOUS_SERVICE: 'RENDEZVOUS_SERVICE',
    DISTRIBUTED: 'DISTRIBUTED'
});
