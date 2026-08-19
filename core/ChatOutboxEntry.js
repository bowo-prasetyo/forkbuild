import { isValidChatMessage } from './ChatMessage.js';
import { ChatDeliveryState, isValidChatDeliveryState } from './ChatDeliveryState.js';

// 0.2.63 — Reliable Offline Messaging & Delivery State.
//
// The durable half of what a live core/ChatMessage.js (0.2.61) becomes
// once application/ChatUseCase.js#sendOrQueue() decides it is worth
// tracking until delivery is actually confirmed — see
// application/ChatOutbox.js's own header for the store this belongs
// to. Deliberately NOT a second copy of the message's own content or
// identity: `message` is carried verbatim, exactly the same
// core/ChatMessage.js shape 0.2.61 already validates and sends
// unmodified — this class adds only what the SENDER additionally
// needs to track locally: which peer identity it's addressed to (see
// this file's own header on "identity, never a connection"), what
// delivery state it's in, and when this device should give up.
//
// Immutable, like core/PeerRelationship.js and core/AvatarProfile.js —
// a state transition is always a NEW entry (`withState()`), never a
// mutation in place, and `application/ChatOutbox.js` is the only thing
// that ever calls the constructor or `withState()` for a message this
// device actually sent.
export const DEFAULT_OUTBOX_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — best-effort, not forever.

export class ChatOutboxEntry {
    constructor({
        message,
        peerIdentityId,
        state = ChatDeliveryState.QUEUED,
        queuedAt = new Date(),
        expiresAt,
        sentAt = null,
        deliveredAt = null
    } = {}) {
        if (!isValidChatMessage(message)) {
            throw new Error('ChatOutboxEntry: a valid ChatMessage is required');
        }
        // Never a connectionId, never an endpoint — see
        // application/ChatOutbox.js's own header, "A Durable Outbox Is
        // Addressed To An Identity, Never A Connection" (0.2.63).
        if (!peerIdentityId || typeof peerIdentityId !== 'string') {
            throw new Error('ChatOutboxEntry: peerIdentityId is required');
        }
        if (!isValidChatDeliveryState(state)) {
            throw new Error(`ChatOutboxEntry: unknown delivery state "${state}"`);
        }
        this._message = message;
        this._peerIdentityId = peerIdentityId;
        this._state = state;
        this._queuedAt = toDate(queuedAt);
        this._expiresAt = expiresAt !== undefined && expiresAt !== null
            ? toDate(expiresAt)
            : new Date(this._queuedAt.getTime() + DEFAULT_OUTBOX_TTL_MS);
        this._sentAt = sentAt ? toDate(sentAt) : null;
        this._deliveredAt = deliveredAt ? toDate(deliveredAt) : null;
    }

    get message() { return this._message; }
    get peerIdentityId() { return this._peerIdentityId; }
    get state() { return this._state; }
    get queuedAt() { return this._queuedAt; }
    get expiresAt() { return this._expiresAt; }
    get sentAt() { return this._sentAt; }
    get deliveredAt() { return this._deliveredAt; }

    // A DELIVERED entry never expires — its own job is already done,
    // and application/ChatOutbox.js#acknowledge() removes it from
    // storage the instant it gets there anyway (see that method's own
    // header) — this only matters for the brief window between a
    // decision being made and being persisted.
    isExpired(now = new Date()) {
        return this._state !== ChatDeliveryState.DELIVERED && now.getTime() > this._expiresAt.getTime();
    }

    withState(state, extra = {}) {
        return new ChatOutboxEntry({ ...this._fields(), state, ...extra });
    }

    _fields() {
        return {
            message: this._message,
            peerIdentityId: this._peerIdentityId,
            state: this._state,
            queuedAt: this._queuedAt,
            expiresAt: this._expiresAt,
            sentAt: this._sentAt,
            deliveredAt: this._deliveredAt
        };
    }

    toJSON() {
        return {
            message: this._message,
            peerIdentityId: this._peerIdentityId,
            state: this._state,
            queuedAt: this._queuedAt.toISOString(),
            expiresAt: this._expiresAt.toISOString(),
            sentAt: this._sentAt ? this._sentAt.toISOString() : null,
            deliveredAt: this._deliveredAt ? this._deliveredAt.toISOString() : null
        };
    }

    // Never throws — a corrupted or unrecognized stored record simply
    // isn't restored, the same "validate strictly on write, degrade
    // gracefully on read" split application/AvatarProfileUseCase.js's
    // own header already documents, and the exact same shape
    // core/PeerRelationship.js#fromJSON already uses one layer over in
    // application/PeerRelationshipUseCase.js#_loadAll's own
    // `.filter(Boolean)`.
    static fromJSON(json) {
        if (!json || typeof json !== 'object') {
            return null;
        }
        try {
            return new ChatOutboxEntry(json);
        } catch {
            return null;
        }
    }
}

function toDate(value) {
    return value instanceof Date ? value : new Date(value);
}
