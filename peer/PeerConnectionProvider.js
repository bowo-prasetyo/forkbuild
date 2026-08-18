// Base class every peer transport provider extends (0.2.49). Answers
// "how do I OPEN a connection to a remote endpoint?" — the same
// adapter-boundary role DiscoveryProvider/PublisherProvider/
// CollaborationTransport already play for their own concerns.
//
// Deliberately NOT committed to any real network transport yet — see
// docs/Roadmap.md's own "Peer Discovery & Transport Abstraction"
// entry. A `remoteAddress` here is intentionally opaque at this layer:
// today's LocalPeerConnectionProvider treats it as an in-process
// registry key, a future WebRTCPeerConnectionProvider might treat it
// as a signaling-server-issued peer id — nothing above this interface
// needs to know which.
export class PeerConnectionProvider {
    // Returns a PeerConnection (peer/PeerConnection.js) already in, or
    // moving toward, CONNECTED transport state. Establishing a
    // transport connection is the ENTIRE job here — it proves nothing
    // about who is on the other end; that is what
    // peer/PeerAuthenticationSession.js is for, layered on top of
    // whatever this returns.
    connect(remoteAddress) {
        throw new Error('PeerConnectionProvider.connect() must be implemented by a subclass');
    }

    // Returns an unsubscribe function. Fires once per PeerConnection
    // this provider receives from a remote endpoint calling connect()
    // against this provider's own address — the passive half of
    // connect()'s active half.
    onIncomingConnection(callback) {
        throw new Error('PeerConnectionProvider.onIncomingConnection() must be implemented by a subclass');
    }

    dispose() {
        throw new Error('PeerConnectionProvider.dispose() must be implemented by a subclass');
    }
}
