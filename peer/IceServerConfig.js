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
// Application Server" (0.2.66). This module shipped NO default TURN
// server through 0.2.66, the same "never one baked-in authority"
// restraint peer/RendezvousConfig.js applies to the rendezvous bootstrap
// list — but a TURN relay never authenticates a PEER the way a
// rendezvous server never does either (see that same principle): it only
// ever relays already-established DataChannel bytes between two
// connections peer/PeerAuthenticationSession.js has already handshaked,
// so operator-issued credentials are safe to configure here directly.
//
// 0.3.2 — this deployment's own operator-issued TURN credentials, from
// its `forkbuild.metered.live` Metered TURN Server app. This is the
// per-credential username/credential pair Metered's dashboard shows for
// one issued credential — never the account Secret Key (which mints new
// credentials and must only ever live server-side; this app has no
// server, so it must never appear here at all). Metered routes traffic
// for every customer through the same shared `standard.relay.metered.ca`
// relay hostname; these credentials are what tie that traffic back to
// this app's own account/quota. Issued as a NON-expiring credential in
// the Metered dashboard, so — unlike a short-lived one — it keeps
// working indefinitely without a runtime refresh; if it's ever rotated
// or revoked, replace the `standard.relay.metered.ca` entries below with
// the new iceServers JSON Metered's dashboard shows for the new
// credential.
//
// 0.3.4 — removed the two `?transport=tcp` entries (TURN/80 and
// TURNS/443) 0.3.2 originally included. Diagnosed live via
// chrome://webrtc-internals against a real "Invite Someone" attempt:
// application/PeerSessionManager.js's own createInvitation() waits for
// iceGatheringState to reach 'complete' before it will hand back a
// local signal at all (no trickle ICE — see that file's own
// SIGNAL_TIMEOUT_MS comment), so ONE entry that never resolves —
// success OR failure — blocks gathering, and therefore every single
// invitation/publish, for the full 30-second timeout. The three
// remaining (UDP-based) Metered entries below all failed FAST
// (STUN/TURN error code 701, "host lookup received error," all within
// the same second) on the reporting network — harmless, since a fast
// failure still lets gathering complete — but the two `transport=tcp`
// entries never produced a candidate OR an error at all; a plain
// `http://standard.relay.metered.ca` browser request confirmed the
// same TCP connection attempt hangs indefinitely rather than failing,
// consistent with the destination silently dropping the TCP handshake
// (a "blackhole," typically ISP/routing-level) rather than refusing
// it. Left the three UDP-based entries in place — they cost nothing
// when they fail fast, and may well work from a different network's
// path to Metered's infrastructure even though they didn't from this
// one.
export const DEFAULT_ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.relay.metered.ca:80' },
    { urls: 'turn:standard.relay.metered.ca:80', username: '66ee7f7cc14c8806d21649b5', credential: 'goxC5WNaPGZLxddX' },
    { urls: 'turn:standard.relay.metered.ca:443', username: '66ee7f7cc14c8806d21649b5', credential: 'goxC5WNaPGZLxddX' }
];
