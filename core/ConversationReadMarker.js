// 0.2.70 — Presence & Conversation Lifecycle.
//
// "Has THIS DEVICE'S OWNER actually seen this conversation?" — a
// genuinely different question from every other durable chat fact this
// codebase already tracks. `core/ChatDeliveryState.js` (0.2.63) answers
// "did the message reach the recipient's device" — a TRANSPORT fact,
// proven by a signed `core/ChatDeliveryAck.js` the recipient sends back
// automatically, the instant its own trust gates accept the message,
// whether or not anyone ever looks at a screen. A read marker answers
// something transport can never see: whether a human opened the
// conversation and looked. See docs/Principles.md, "A Read Marker Is A
// Local Note About What THIS Device Has Seen, Never A Receipt Sent To
// Anyone" (0.2.70) — this class is never signed, never sent to the
// peer, never carried over `peer/PeerMessageBus.js`, and never read by
// `application/ChatUseCase.js`'s own ingestion boundary. It exists
// purely so THIS device's own UI can compute an unread count; the other
// participant has no way to know, and no way to find out, that a
// message here was ever marked read. Read receipts — a signed,
// transmitted, application-level acknowledgment that the OTHER side
// actually saw a message — are a genuinely different, deliberately
// deferred milestone (see docs/Roadmap.md).
//
// `lastReadSequence` reuses `core/ChatMessage.js`'s own per-(conversation,
// sender) monotonic `sequence` field rather than inventing a second id
// scheme: since this is always a direct, two-party conversation, "every
// message FROM this peer" is already exactly one sender's own strictly-
// increasing counter (see that file's own header, and
// `core/ChatReplayWindow.js`, which already refuses to accept anything
// but a strictly newer sequence from the same sender). A read marker
// therefore needs to remember only ONE number per peer, never a set of
// message ids: "I have read every incoming message up through sequence
// N" is a complete, unambiguous statement, and an unread count is simply
// "how many stored incoming entries have a HIGHER sequence than that."
//
// Immutable, like every other durable value object in this codebase
// (`core/ChatOutboxEntry.js`, `core/ConversationEntry.js`,
// `core/PeerRelationship.js`) — `withLastReadSequence()` always returns a
// NEW marker, and always takes the MAX of the old and new value: marking
// read is a monotonic high-water mark, never a toggle, and never allowed
// to regress a conversation back to "less read" than it already was.
export class ConversationReadMarker {
    constructor({ peerIdentityId, lastReadSequence = 0, updatedAt = new Date() } = {}) {
        if (!peerIdentityId || typeof peerIdentityId !== 'string') {
            throw new Error('ConversationReadMarker: peerIdentityId is required');
        }
        if (!Number.isInteger(lastReadSequence) || lastReadSequence < 0) {
            throw new Error('ConversationReadMarker: lastReadSequence must be a non-negative integer');
        }
        this._peerIdentityId = peerIdentityId;
        this._lastReadSequence = lastReadSequence;
        this._updatedAt = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
    }

    get peerIdentityId() { return this._peerIdentityId; }
    get lastReadSequence() { return this._lastReadSequence; }
    get updatedAt() { return this._updatedAt; }

    // Never regresses — see this class's own header. A caller marking
    // read with a sequence at or below the current high-water mark gets
    // back a marker with the SAME lastReadSequence (only `updatedAt`
    // could ever move), never a step backward into "less read."
    withLastReadSequence(lastReadSequence, updatedAt = new Date()) {
        return new ConversationReadMarker({
            peerIdentityId: this._peerIdentityId,
            lastReadSequence: Math.max(this._lastReadSequence, lastReadSequence),
            updatedAt
        });
    }

    toJSON() {
        return {
            peerIdentityId: this._peerIdentityId,
            lastReadSequence: this._lastReadSequence,
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
            return new ConversationReadMarker(json);
        } catch {
            return null;
        }
    }
}
