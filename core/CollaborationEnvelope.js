import { createId } from './createId.js';

// Pure data: the collaboration protocol envelope (0.2.7).
//
// Every message exchanged between collaboration participants is wrapped
// in this envelope. It is the wire format — the single artifact that
// crosses the boundary between clients.
//
// The envelope carries:
//   envelopeId   — unique identity for this specific message (dedup)
//   type         — what kind of collaboration message this is
//   documentId   — which document this targets
//   author       — who sent it
//   timestamp    — when it was created
//   payload      — type-specific data
//
// Envelope types:
//   'operation'      — a command to apply to the document
//   'acknowledge'    — confirmation that an operation was applied
//   'reject'         — an operation was rejected (with reason)
//   'join'           — a peer joined the collaboration
//   'leave'          — a peer left the collaboration
//   'sync-request'   — request operations since a revision
//   'sync-response'  — operations since a revision
//
// For 'operation' payloads:
//   operationId      — unique per logical operation (idempotency key)
//   sequenceNumber   — per-author monotonic counter (ordering)
//   baseRevision     — document revision this was created against
//   command          — serialized command JSON (via CommandRegistry)
//
// For 'acknowledge' payloads:
//   operationId      — which operation is acknowledged
//   appliedRevision  — the revision after applying
//
// For 'reject' payloads:
//   operationId      — which operation was rejected
//   reason           — human-readable rejection reason
//
// For 'sync-request' payloads:
//   sinceRevision    — "give me everything after this revision"
//
// For 'sync-response' payloads:
//   revision         — the current revision
//   commands         — array of serialized command JSONs
//
// This is a dependency-free data type in core/ because it is shared by
// collaboration/ and application/ — the same reasoning as
// DocumentRevision. It contains no command classes, no CommandHistory,
// no World — only plain JSON-safe data.
export class CollaborationEnvelope {
    constructor({
        envelopeId = createId(),
        type,
        documentId,
        author,
        timestamp = new Date(),
        payload = null
    } = {}) {
        if (!type || typeof type !== 'string') {
            throw new Error('CollaborationEnvelope: type is required');
        }
        if (!documentId || typeof documentId !== 'string') {
            throw new Error('CollaborationEnvelope: documentId is required');
        }
        if (!author || typeof author !== 'string') {
            throw new Error('CollaborationEnvelope: author is required');
        }
        this._envelopeId = envelopeId;
        this._type = type;
        this._documentId = documentId;
        this._author = author;
        this._timestamp = timestamp instanceof Date ? timestamp : new Date(timestamp);
        this._payload = payload;
    }

    get envelopeId() { return this._envelopeId; }
    get type() { return this._type; }
    get documentId() { return this._documentId; }
    get author() { return this._author; }
    get timestamp() { return this._timestamp; }
    get payload() { return this._payload; }

    toJSON() {
        return {
            envelopeId: this._envelopeId,
            type: this._type,
            documentId: this._documentId,
            author: this._author,
            timestamp: this._timestamp.toISOString(),
            payload: this._payload
        };
    }

    static fromJSON(json) {
        return new CollaborationEnvelope({
            envelopeId: json.envelopeId,
            type: json.type,
            documentId: json.documentId,
            author: json.author,
            timestamp: new Date(json.timestamp),
            payload: json.payload
        });
    }

    // Factory helpers for each envelope type.

    static operation({ documentId, author, operationId, sequenceNumber, baseRevision, command }) {
        return new CollaborationEnvelope({
            type: 'operation',
            documentId,
            author,
            payload: {
                operationId,
                sequenceNumber,
                baseRevision,
                command
            }
        });
    }

    static acknowledge({ documentId, author, operationId, appliedRevision }) {
        return new CollaborationEnvelope({
            type: 'acknowledge',
            documentId,
            author,
            payload: { operationId, appliedRevision }
        });
    }

    static reject({ documentId, author, operationId, reason }) {
        return new CollaborationEnvelope({
            type: 'reject',
            documentId,
            author,
            payload: { operationId, reason }
        });
    }

    static join({ documentId, author }) {
        return new CollaborationEnvelope({
            type: 'join',
            documentId,
            author,
            payload: null
        });
    }

    static leave({ documentId, author }) {
        return new CollaborationEnvelope({
            type: 'leave',
            documentId,
            author,
            payload: null
        });
    }

    static syncRequest({ documentId, author, sinceRevision }) {
        return new CollaborationEnvelope({
            type: 'sync-request',
            documentId,
            author,
            payload: { sinceRevision }
        });
    }

    static syncResponse({ documentId, author, revision, commands }) {
        return new CollaborationEnvelope({
            type: 'sync-response',
            documentId,
            author,
            payload: { revision, commands }
        });
    }
}
