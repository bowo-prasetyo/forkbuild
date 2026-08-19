// 0.2.71 — Explicit Read Acknowledgement.
//
// The durable half of one peer's pending read acknowledgement — see
// application/ConversationReadOutbox.js's own header for the store this
// belongs to. Deliberately NOT shaped like core/ChatOutboxEntry.js
// (0.2.63): that class holds one entry per MESSAGE, because every
// queued message is its own genuine event that must eventually be
// individually sent or individually expire. A read acknowledgement is
// the opposite kind of fact — "the latest known state," in the same
// sense a git ref or a high-water mark is — so this class holds at most
// ONE entry per peer, and a newer value COALESCES the old one rather
// than queuing alongside it. Ten `markRead` calls in a row while a peer
// is offline never produce ten things to send once they reconnect —
// they produce exactly one, the latest, because nine of the ten calls
// simply overwrite this same entry before it is ever transmitted.
//
// A two-state vocabulary, not four: PENDING (queued, not yet handed to
// the wire) and SENT (handed to a live, AUTHENTICATED connection).
// There is no DELIVERED here, and deliberately no replay/ack loop the
// way core/ChatDeliveryAck.js closes for core/ChatOutboxEntry.js: a
// read receipt is idempotent and monotonic on the RECEIVING side too
// (application/RemoteReadReceiptStore.js's own Math.max write), so a
// receipt genuinely lost in flight after being marked SENT self-heals
// the next time this device marks the same conversation read again —
// see application/ChatUseCase.js#sendReadReceipt()'s own header. There
// is also no EXPIRED/TTL: an outdated read acknowledgement is never
// wrong to deliver late, only redundant, so there is nothing here worth
// giving up on.
export const ReadReceiptOutboxState = Object.freeze({
    PENDING: 'PENDING',
    SENT: 'SENT'
});

export function isValidReadReceiptOutboxState(value) {
    return Object.values(ReadReceiptOutboxState).includes(value);
}

export class ConversationReadOutboxEntry {
    constructor({ peerIdentityId, readThroughSequence, state = ReadReceiptOutboxState.PENDING, updatedAt = new Date() } = {}) {
        if (!peerIdentityId || typeof peerIdentityId !== 'string') {
            throw new Error('ConversationReadOutboxEntry: peerIdentityId is required');
        }
        if (!Number.isInteger(readThroughSequence) || readThroughSequence <= 0) {
            throw new Error('ConversationReadOutboxEntry: readThroughSequence must be a positive integer');
        }
        if (!isValidReadReceiptOutboxState(state)) {
            throw new Error(`ConversationReadOutboxEntry: unknown state "${state}"`);
        }
        this._peerIdentityId = peerIdentityId;
        this._readThroughSequence = readThroughSequence;
        this._state = state;
        this._updatedAt = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
    }

    get peerIdentityId() { return this._peerIdentityId; }
    get readThroughSequence() { return this._readThroughSequence; }
    get state() { return this._state; }
    get updatedAt() { return this._updatedAt; }

    // The coalescing operation itself. A `sequence` at or below what is
    // already recorded is a genuine no-op — same value, same state,
    // never a "re-queue" — matching core/ConversationReadMarker.js's
    // own "never regresses" guarantee. A GENUINELY higher sequence
    // always returns to PENDING regardless of the entry's current
    // state: even an already-SENT entry has new information to
    // transmit, because SENT only ever meant "the PREVIOUS value was
    // handed to the wire," never "this peer is caught up forever."
    withReadThroughSequence(sequence, updatedAt = new Date()) {
        if (!Number.isInteger(sequence) || sequence <= this._readThroughSequence) {
            return this;
        }
        return new ConversationReadOutboxEntry({
            peerIdentityId: this._peerIdentityId,
            readThroughSequence: sequence,
            state: ReadReceiptOutboxState.PENDING,
            updatedAt
        });
    }

    // PENDING -> SENT once application/ChatUseCase.js has actually
    // handed this exact readThroughSequence to peer/PeerMessageBus.js#send()
    // over a live, AUTHENTICATED connection. `expectedSequence` guards
    // against marking a NEWER value (that arrived after the send was
    // already in flight) as sent by mistake — see
    // application/ConversationReadOutbox.js#markSent()'s own header.
    withState(state, updatedAt = new Date()) {
        return new ConversationReadOutboxEntry({
            peerIdentityId: this._peerIdentityId,
            readThroughSequence: this._readThroughSequence,
            state,
            updatedAt
        });
    }

    toJSON() {
        return {
            peerIdentityId: this._peerIdentityId,
            readThroughSequence: this._readThroughSequence,
            state: this._state,
            updatedAt: this._updatedAt.toISOString()
        };
    }

    // Never throws — a corrupted or unrecognized stored record simply
    // isn't restored, the same "validate strictly on write, degrade
    // gracefully on read" split every other core/*.js#fromJSON in this
    // codebase already uses.
    static fromJSON(json) {
        if (!json || typeof json !== 'object') {
            return null;
        }
        try {
            return new ConversationReadOutboxEntry(json);
        } catch {
            return null;
        }
    }
}
