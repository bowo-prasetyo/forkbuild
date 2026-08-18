// Base class every peer connection extends (0.2.49). Answers "how do I
// exchange messages with ONE specific remote endpoint?" — deliberately
// the narrowest possible interface, the same "throwing stubs, one
// concrete Local* implementation today, room for a real WebRTC/relay
// implementation later without anything above this interface changing"
// shape as discovery/DiscoveryProvider.js and presence/
// AvatarPresenceBroadcastProvider.js.
//
// A PeerConnection carries ONLY transport state
// (peer/PeerConnectionState.js) — "does a channel exist?" It never
// knows or cares who, cryptographically, is on the other end; that is
// peer/PeerAuthenticationSession.js's job, layered strictly on TOP of
// a connection rather than folded into it. Keeping these separate is
// what makes "the connection exists but nobody has proven who they
// are yet" and "the connection just died, so whatever authentication
// existed on it is gone too" both simple, mechanical facts instead of
// special cases inside one giant state machine — see docs/
// Principles.md, "Transport State And Authentication State Are Two
// Different Questions."
export class PeerConnection {
    get connectionId() {
        throw new Error('PeerConnection.connectionId must be implemented by a subclass');
    }

    get remoteAddress() {
        throw new Error('PeerConnection.remoteAddress must be implemented by a subclass');
    }

    get transportState() {
        throw new Error('PeerConnection.transportState must be implemented by a subclass');
    }

    // message: a plain, JSON-shaped object — a HELLO/PROOF from
    // core/PeerAuthenticationEnvelope.js today, any future protocol
    // message layered on top later. Fire-and-forget at this layer,
    // exactly like AvatarPresenceBroadcastProvider.advertise(): a
    // transport never acknowledges or retries, a protocol built on top
    // (peer/PeerAuthenticationSession.js) is responsible for whatever
    // ordering or reliability IT needs.
    send(message) {
        throw new Error('PeerConnection.send() must be implemented by a subclass');
    }

    // Returns an unsubscribe function, the same shape every EventBus
    // subscription in this codebase already returns.
    onMessage(callback) {
        throw new Error('PeerConnection.onMessage() must be implemented by a subclass');
    }

    onStateChange(callback) {
        throw new Error('PeerConnection.onStateChange() must be implemented by a subclass');
    }

    close() {
        throw new Error('PeerConnection.close() must be implemented by a subclass');
    }
}
