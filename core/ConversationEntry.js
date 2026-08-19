import { isValidChatMessage } from './ChatMessage.js';
import { isValidChatDeliveryState } from './ChatDeliveryState.js';

// 0.2.69 — Reliable Offline Conversations.
//
// The durable half of what a live core/ChatMessage.js becomes once
// application/ChatUseCase.js decides to remember it past this session
// — see application/ConversationStore.js's own header for the store
// this belongs to, and application/LiveConversation.js's own header
// for the in-memory sibling this class is deliberately NOT: a
// ConversationEntry is written to survive a reload; a LiveConversation
// entry is written to be re-read THIS session, nothing more. The two
// are always kept in sync by application/ChatUseCase.js (never by
// either of them reaching into the other), the same "one class owns
// the write-through, the stores never talk to each other" discipline
// application/ChatOutbox.js and application/LiveConversation.js
// already kept separate in 0.2.63.
//
// Carries exactly what 0.2.61/0.2.63 already track per message —
// `message` (the core/ChatMessage.js itself, verbatim, never
// re-derived or re-validated here), `direction` (OUTGOING/INCOMING),
// and `deliveryState` (nullable, 0.2.63's own four-value vocabulary —
// null for every incoming message, exactly like
// application/LiveConversation.js#append already documents) — plus one
// field this store actually needs that a live-only transcript never
// did: `peerIdentityId`, so a stored entry is self-describing without
// depending on which per-peer slice it happens to be filed under, the
// same defensive redundancy core/ChatOutboxEntry.js already carries
// for the identical field.
//
// Immutable, like core/ChatOutboxEntry.js and core/PeerRelationship.js
// — a delivery-state transition is always a NEW entry
// (`withDeliveryState()`), never a mutation in place.
export const ChatMessageDirection = Object.freeze({
    OUTGOING: 'outgoing',
    INCOMING: 'incoming'
});

export function isValidChatMessageDirection(value) {
    return value === ChatMessageDirection.OUTGOING || value === ChatMessageDirection.INCOMING;
}

export class ConversationEntry {
    constructor({ message, peerIdentityId, direction, deliveryState = null, recordedAt = new Date() } = {}) {
        if (!isValidChatMessage(message)) {
            throw new Error('ConversationEntry: a valid ChatMessage is required');
        }
        if (!peerIdentityId || typeof peerIdentityId !== 'string') {
            throw new Error('ConversationEntry: peerIdentityId is required');
        }
        if (!isValidChatMessageDirection(direction)) {
            throw new Error(`ConversationEntry: unknown direction "${direction}"`);
        }
        if (deliveryState !== null && !isValidChatDeliveryState(deliveryState)) {
            throw new Error(`ConversationEntry: unknown delivery state "${deliveryState}"`);
        }
        this._message = message;
        this._peerIdentityId = peerIdentityId;
        this._direction = direction;
        this._deliveryState = deliveryState;
        this._recordedAt = recordedAt instanceof Date ? recordedAt : new Date(recordedAt);
    }

    get message() { return this._message; }
    get peerIdentityId() { return this._peerIdentityId; }
    get direction() { return this._direction; }
    get deliveryState() { return this._deliveryState; }
    get recordedAt() { return this._recordedAt; }

    withDeliveryState(deliveryState) {
        return new ConversationEntry({ ...this._fields(), deliveryState });
    }

    _fields() {
        return {
            message: this._message,
            peerIdentityId: this._peerIdentityId,
            direction: this._direction,
            deliveryState: this._deliveryState,
            recordedAt: this._recordedAt
        };
    }

    toJSON() {
        return {
            message: this._message,
            peerIdentityId: this._peerIdentityId,
            direction: this._direction,
            deliveryState: this._deliveryState,
            recordedAt: this._recordedAt.toISOString()
        };
    }

    // Never throws — a corrupted or unrecognized stored record simply
    // isn't restored, the same "validate strictly on write, degrade
    // gracefully on read" split core/ChatOutboxEntry.js#fromJSON already
    // uses one file over.
    static fromJSON(json) {
        if (!json || typeof json !== 'object') {
            return null;
        }
        try {
            return new ConversationEntry(json);
        } catch {
            return null;
        }
    }
}
