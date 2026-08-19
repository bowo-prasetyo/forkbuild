// 0.2.66 — the ICE configuration peer/WebRtcPeerConnectionProvider.js's
// own `iceServers` constructor option has accepted since 0.2.51, made
// explicit and given somewhere real to live, exactly the way peer/
// RendezvousConfig.js does for a rendezvous bootstrap list one file over.
// See that file's own header for the shared principle: this module is
// configuration a deployment can override, never a hard-coded network
// this codebase is tied to.
//
// STUN is free, public, well-known Internet infrastructure — it answers
// "what is my own reflexive address," nothing more, and learning it
// leaks no more than any ordinary outbound connection already would. The
// two defaults below are long-standing public Google STUN servers,
// included only so a fresh checkout can attempt real NAT traversal
// without any setup — see docs/Principles.md, "Rendezvous Can Introduce
// An Endpoint; It Can Never Establish Identity" (0.2.66), which applies
// here too: nothing about WHICH STUN server answers ever affects who
// peer/PeerAuthenticationSession.js's handshake proves is on the other
// end.
//
// TURN is different in kind, not just in protocol: a TURN relay carries
// the actual DataChannel bytes when a direct path can't be found, and
// almost always requires operator-issued, time-limited credentials — see
// docs/Principles.md, "TURN Is Transport Infrastructure, Never A Trusted
// Application Server" (0.2.66). This module ships NO default TURN
// server, the same "never one baked-in authority" restraint peer/
// RendezvousConfig.js applies to the rendezvous bootstrap list: a real
// deployment configures its own, with its own credentials, by appending
// to (or replacing) DEFAULT_ICE_SERVERS below before constructing peer/
// WebRtcPeerConnectionProvider.js.
export const DEFAULT_ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
];
