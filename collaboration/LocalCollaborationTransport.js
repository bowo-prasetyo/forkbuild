import { CollaborationTransport } from './CollaborationTransport.js';
import { CollaborationEnvelope } from '../core/CollaborationEnvelope.js';

// The V0.1 concrete collaboration transport: an in-memory broadcast
// bus. All connected sessions share the same transport instance, and
// every envelope sent by one session is delivered to every OTHER
// connected session (echo prevention at the transport level).
//
// This exercises the exact interface a future WebSocketTransport or
// WebRTCTransport will use. No networking, no persistence — just a
// straightforward fan-out that proves the protocol shapes work.
//
// Rooms are keyed by documentId. A session connects to a specific
// document's room and only receives envelopes for that document.
export class LocalCollaborationTransport extends CollaborationTransport {
    constructor() {
        super();
        this._rooms = new Map();       // documentId -> Set of { author, callback }
        this._connections = new Map(); // author -> { documentId, callback }
    }

    connect(documentId, author) {
        if (!this._rooms.has(documentId)) {
            this._rooms.set(documentId, new Set());
        }
        const room = this._rooms.get(documentId);
        const entry = { author, callback: null };
        room.add(entry);
        this._connections.set(author, { documentId, entry });
    }

    disconnect(author) {
        const connection = this._connections.get(author);
        if (!connection) {
            return;
        }
        const { documentId, entry } = connection;
        const room = this._rooms.get(documentId);
        if (room) {
            room.delete(entry);
            if (room.size === 0) {
                this._rooms.delete(documentId);
            }
        }
        this._connections.delete(author);
    }

    subscribe(author, callback) {
        const connection = this._connections.get(author);
        if (connection) {
            connection.entry.callback = callback;
        }
    }

    unsubscribe(author) {
        const connection = this._connections.get(author);
        if (connection) {
            connection.entry.callback = null;
        }
    }

    // Broadcast an envelope to all OTHER participants in the same room.
    // The sender never receives its own envelope back (echo prevention
    // at the transport level, in addition to the session-level check).
    send(senderAuthor, envelope) {
        const json = envelope.toJSON();
        const documentId = json.documentId;
        const room = this._rooms.get(documentId);
        if (!room) {
            return;
        }
        // Acknowledgments and rejections should only go back to the sender
        if (json.type === 'acknowledge' || json.type === 'reject') {
            // In a local broadcast bus, simply broadcasting to everyone except 
            // the sender correctly routes the ack back to the original author.
            for (const entry of room) {
                // FIX: Changed === to !== so it routes to the OTHER peers (the original sender)
                if (entry.author !== senderAuthor && entry.callback) {
                    entry.callback(CollaborationEnvelope.fromJSON(json));
                }
            }
            return;
        }        
    }

    // Returns the number of connected participants for a document.
    getParticipantCount(documentId) {
        const room = this._rooms.get(documentId);
        return room ? room.size : 0;
    }

    // Returns the list of connected authors for a document.
    getParticipants(documentId) {
        const room = this._rooms.get(documentId);
        if (!room) {
            return [];
        }
        return Array.from(room).map((entry) => entry.author);
    }
}
