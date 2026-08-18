// 0.2.49 — the TRANSPORT half of a peer connection's state, and
// deliberately only that half. Answers "does a channel exist to the
// other endpoint at all?" — never "do we know who is on it," which is
// peer/PeerAuthenticationState.js's own, completely independent
// question. See peer/PeerConnection.js's own header for why these two
// state machines are never merged into one.
export const PeerConnectionState = Object.freeze({
    DISCONNECTED: 'DISCONNECTED',
    CONNECTING: 'CONNECTING',
    CONNECTED: 'CONNECTED',
    FAILED: 'FAILED',
    CLOSED: 'CLOSED'
});
