// 0.2.73 — Authenticated Voice / Audio.
//
// The APPLICATION half of a voice call's state — deliberately independent
// of peer/PeerConnectionState.js and peer/PeerAuthenticationState.js, the
// same "transport state and authentication state are two different
// questions" discipline those two files already established for the
// connection itself, extended one layer further: "is a channel open" and
// "who is on it" say nothing at all about "is anyone currently talking."
//
//   IDLE -> CALLING -> CONNECTING -> ACTIVE -> ENDED -> IDLE
//        -> RINGING  -> CONNECTING -> ACTIVE -> ENDED -> IDLE
//                     -> ENDED (rejected before ever reaching CONNECTING)
//
// CALLING: this device sent a VoiceCallSignal INVITE and is waiting for
// the other side to accept or reject.
// RINGING: this device received an INVITE and is waiting for its own
// owner to accept or reject.
// CONNECTING: both sides agreed (ACCEPT exchanged); local media has been
// requested and SDP renegotiation (core/VoiceMediaSignal.js) is in
// flight — no audio is flowing yet.
// ACTIVE: a remote audio track has actually arrived (peer/
// WebRtcPeerConnection.js#onRemoteTrack) — audio is flowing in at least
// one direction.
// ENDED: a terminal, transient value — application/VoiceUseCase.js
// immediately resets to IDLE after publishing it once, exactly like
// peer/PeerAuthenticationState.js's own FAILED is terminal for ONE
// connection rather than a state anything lingers in. Unlike a peer
// connection, a NEW call can always follow — ENDED describes one call,
// never the peer relationship.
//
// See docs/Principles.md, "Voice Lifecycle Is Independent Of Peer
// Lifecycle" (0.2.73): nothing in this file, or in application/
// VoiceUseCase.js, ever closes a peer/PeerConnection.js, and nothing in
// peer/PeerLifecycleState.js ever reads this file. A peer can be
// AUTHENTICATED with voice IDLE, or (briefly, mid-teardown) voice ENDED
// with the peer still AUTHENTICATED — the two axes are never merged.
export const VoiceSessionState = Object.freeze({
    IDLE: 'IDLE',
    CALLING: 'CALLING',
    RINGING: 'RINGING',
    CONNECTING: 'CONNECTING',
    ACTIVE: 'ACTIVE',
    ENDED: 'ENDED'
});
