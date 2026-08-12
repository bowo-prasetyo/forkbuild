// Base class every collaboration transport extends. Answers "How do
// collaboration envelopes travel between participants?"
//
// The application layer never knows whether the transport is an
// in-memory broadcast, a WebSocket, WebRTC, or a relay server — the
// same adapter pattern as StorageProvider / DiscoveryProvider /
// PublisherProvider.
//
// Contract:
//   send(envelope)          — transmit an envelope to all peers
//   subscribe(callback)     — register a listener for incoming envelopes
//   unsubscribe(callback)   — remove a listener
//   connect(documentId, author) — join a collaboration room
//   disconnect()            — leave the collaboration room
//
// All methods throw by default — same discipline as StorageProvider:
// a transport must explicitly implement what it supports.
export class CollaborationTransport {
    send(envelope) {
        throw new Error('CollaborationTransport.send() must be implemented by a subclass');
    }

    subscribe(callback) {
        throw new Error('CollaborationTransport.subscribe() must be implemented by a subclass');
    }

    unsubscribe(callback) {
        throw new Error('CollaborationTransport.unsubscribe() must be implemented by a subclass');
    }

    connect(documentId, author) {
        throw new Error('CollaborationTransport.connect() must be implemented by a subclass');
    }

    disconnect() {
        throw new Error('CollaborationTransport.disconnect() must be implemented by a subclass');
    }
}
