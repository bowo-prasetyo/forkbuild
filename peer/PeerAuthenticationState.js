// 0.2.49 — the AUTHENTICATION half of a peer connection's state,
// deliberately independent of peer/PeerConnectionState.js's transport
// half. Answers "do we currently know, cryptographically, who is on
// the other end of this connection?" — never "does a channel exist at
// all," which a connection can answer entirely on its own.
export const PeerAuthenticationState = Object.freeze({
    // No handshake has been started on this connection yet.
    IDLE: 'IDLE',
    // start() has run: our own HELLO is out, and we are waiting on the
    // peer's PROOF (and may still be answering their own HELLO too).
    AUTHENTICATING: 'AUTHENTICATING',
    // The peer's PROOF verified: remoteIdentity is a real, proven
    // PeerIdentity for the lifetime of THIS connection.
    AUTHENTICATED: 'AUTHENTICATED',
    // A HELLO/PROOF failed validation — malformed, wrong session,
    // wrong challenge, mismatched identity/key, or a signature that
    // does not verify. Terminal for this connection: a session that
    // has FAILED is never retried in place, exactly like a
    // PeerConnection that has CLOSED is never reopened — see peer/
    // PeerConnection.js's own header.
    FAILED: 'FAILED'
});
