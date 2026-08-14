import { CollaborationTransport } from './CollaborationTransport.js';
import { CollaborationEnvelope } from '../core/CollaborationEnvelope.js';

// A CollaborationTransport that routes all operations through a
// DocumentAuthority (0.2.9). This is the transport used when multiple
// clients need to safely edit the same document.
//
// The authority sits between clients:
//
//   Client A ──► AuthorityCollaborationTransport ──► DocumentAuthority
//   Client B ──► AuthorityCollaborationTransport ──► DocumentAuthority
//   Client C ──► AuthorityCollaborationTransport ──► DocumentAuthority
//
// When a client sends an operation:
//   1. The transport routes it to the DocumentAuthority.
//   2. The authority checks for conflicts.
//   3. If OK: the authority applies the command, broadcasts to all
//      OTHER clients, and sends an acknowledgement back.
//   4. If conflict: the authority sends a rejection back.
//
// The CollaborationSession is completely unchanged — it still
// sends/receives envelopes through the CollaborationTransport interface.
// The authority is transparent to the session.
export class AuthorityCollaborationTransport extends CollaborationTransport {
    constructor(authority) {
        super();
        this._authority = authority;
        this._callbacks = new Map(); // author -> callback
    }

    connect(documentId, author) {
        // Register with the authority. The authority will call our
    // callback when it has an operation to broadcast to THIS specific author.
        this._authority.connect(author, (envelope) => {
        const callback = this._callbacks.get(author);
        if (callback) {
            callback(envelope);
        }
        });
    }

    disconnect(author) {
        this._authority.disconnect(author);
        this._callbacks.delete(author);
    }

    subscribe(author, callback) {
        this._callbacks.set(author, callback);
    }

    unsubscribe(author) {
        this._callbacks.delete(author);
    }

    // Send an operation to the authority for processing.
    // The authority will either apply it (broadcasting to others)
    // or reject it. The response envelope is delivered to the
    // sender's callback.
    send(senderAuthor, envelope) {
        if (envelope.type === 'operation') {
            // Route through the authority.
            const response = this._authority.receiveOperation(envelope);
            // Deliver the response (acknowledge or reject) to the sender.
            const callback = this._callbacks.get(senderAuthor);
            if (callback) {
                callback(response);
            }
        } else {
            // Non-operation envelopes (join, leave, sync-request,
            // sync-response) are broadcast directly without authority
            // processing.
            this._broadcastDirect(senderAuthor, envelope);
        }
    }

    // Called by the authority when it has an operation to broadcast.
    _onAuthorityBroadcast(senderAuthor, envelope) {
        // Deliver to all clients except the sender.
        for (const [author, callback] of this._callbacks) {
            if (author !== senderAuthor) {
                callback(envelope);
            }
        }
    }

    // Direct broadcast for non-operation envelopes.
    _broadcastDirect(senderAuthor, envelope) {
        for (const [author, callback] of this._callbacks) {
            if (author !== senderAuthor) {
                callback(envelope);
            }
        }
    }
}
