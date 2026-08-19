import { MAX_CHAT_ID_LENGTH } from './ChatMessage.js';

// 0.2.71 — Explicit Read Acknowledgement.
//
// A tiny, SEPARATE wire vocabulary from core/ChatMessage.js AND from
// core/ChatDeliveryAck.js — the exact same "own protocol, own trust
// boundary" precedent application/ChatUseCase.js's own header already
// set for 0.2.63's delivery ack ("Sent Is Not Delivered"): a read
// acknowledgement never rides the `forkbuild:chat` protocol string,
// never rides `forkbuild:chat-delivery-ack` either, and never gets
// folded into either payload's shape, so the ingestion boundaries that
// already exist for content and for delivery acks never have to
// distinguish a third kind of payload by inspecting it. It has its own
// protocol, `application/ChatUseCase.READ_PROTOCOL`, and its own
// (equally small) trust boundary — see
// application/ChatUseCase.js#_handleIncomingRead().
//
// This is a NETWORK fact — "Alice is telling Bob what she has seen" —
// and is deliberately never derived from, or a transmission of,
// core/ConversationReadMarker.js (0.2.70's LOCAL, unsigned, never-sent
// note about what THIS device has seen). See docs/Principles.md, "A
// Read Receipt Is Computed Independently From The Local Read Marker,
// Never Transmitted From It" (0.2.71) — the sender recomputes "the
// highest incoming sequence I currently hold for this peer" itself
// (application/ChatUseCase.js#sendReadReceipt(), from its own live
// conversation), the exact same computation
// application/PeerPresenceUseCase.js#markRead() independently performs
// against application/ConversationStore.js for the LOCAL marker. Two
// independent computations of one underlying fact, feeding two
// genuinely different stores, is deliberate: it is what makes it
// structurally true, not merely documented, that this milestone never
// "simply transmits" the local marker.
//
//   conversationId      — the SAME derivation core/ChatMessage.js's own
//                          deriveConversationId() already performs,
//                          re-derived and compared by the receiver,
//                          never trusted from the wire at face value —
//                          identical to core/ChatDeliveryAck.js's own
//                          rule.
//   readerIdentity       — who is doing the acknowledging. Never trusted
//                          on its own: application/ChatUseCase.js's
//                          ingestion requires this to match the sending
//                          connection's own already-proven
//                          remoteIdentity, the same "claimed sender must
//                          match the proven connection" rule
//                          core/ChatMessage.js#senderIdentity and
//                          core/ChatDeliveryAck.js#recipientIdentity
//                          already established.
//   readThroughSequence  — a monotonic high-water mark, in the SAME
//                          per-(conversation, sender) sequence space
//                          core/ChatMessage.js#sequence already defines:
//                          "the reader has now seen every message THE
//                          RECIPIENT OF THIS RECEIPT sent up through
//                          this number." Deliberately never a list of
//                          individual message ids — see
//                          application/ConversationReadOutbox.js's own
//                          header on why a high-water mark needs no
//                          replay window at all: an out-of-order or
//                          duplicate delivery of a LOWER or EQUAL value
//                          is harmless by construction (Math.max), never
//                          something a receiver needs to detect and
//                          reject as a replay.
//   acknowledgedAt       — the reader's own clock, display metadata
//                          only — never a freshness or ordering
//                          mechanism, the same non-authoritative role
//                          core/ChatMessage.js#timestamp and
//                          core/ChatDeliveryAck.js#acknowledgedAt
//                          already play.
export function toChatReadReceipt({ conversationId, readerIdentity, readThroughSequence, acknowledgedAt = Date.now() }) {
    if (!conversationId || typeof conversationId !== 'string') {
        throw new Error('toChatReadReceipt: conversationId is required');
    }
    if (!readerIdentity || typeof readerIdentity !== 'string') {
        throw new Error('toChatReadReceipt: readerIdentity is required');
    }
    if (!Number.isInteger(readThroughSequence) || readThroughSequence <= 0) {
        throw new Error('toChatReadReceipt: readThroughSequence must be a positive integer');
    }
    return { conversationId, readerIdentity, readThroughSequence, acknowledgedAt };
}

export function isValidChatReadReceipt(value) {
    return Boolean(value)
        && typeof value === 'object'
        && typeof value.conversationId === 'string' && value.conversationId.length > 0 && value.conversationId.length <= MAX_CHAT_ID_LENGTH
        && typeof value.readerIdentity === 'string' && value.readerIdentity.length > 0
        && Number.isInteger(value.readThroughSequence) && value.readThroughSequence > 0
        && Number.isFinite(value.acknowledgedAt);
}
