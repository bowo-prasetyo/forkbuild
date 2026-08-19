import { MAX_CHAT_ID_LENGTH } from './ChatMessage.js';

// 0.2.63 — Reliable Offline Messaging & Delivery State.
//
// A tiny, SEPARATE wire vocabulary from core/ChatMessage.js — see
// application/ChatUseCase.js's own header, "Sent Is Not Delivered"
// (0.2.63): a delivery acknowledgement is never folded into
// ChatMessage's own shape, and never rides the `forkbuild:chat`
// protocol string, so the ingestion boundary that already exists for
// chat CONTENT (friendship, blocking, replay/sequence — see
// core/ChatMessage.js's own header) never has to distinguish content
// from acknowledgements by inspecting a payload's shape. It has its
// own protocol, `application/ChatUseCase.ACK_PROTOCOL`, and its own
// (much smaller) trust boundary — see
// application/ChatUseCase.js#_handleIncomingAck().
//
//   messageId         — which core/ChatMessage.js this acknowledges.
//   conversationId     — the SAME derivation core/ChatMessage.js's own
//                        deriveConversationId() already performs,
//                        re-derived and compared by the receiver of
//                        the ack, never trusted from the wire at face
//                        value — the identical discipline
//                        application/ChatUseCase.js#_handleIncoming()
//                        already applies to a ChatMessage itself.
//   recipientIdentity  — who is doing the acknowledging. Never trusted
//                        on its own: application/ChatUseCase.js's
//                        ingestion requires this to match the sending
//                        connection's own already-proven
//                        remoteIdentity, the same "claimed sender must
//                        match the proven connection" rule
//                        core/ChatMessage.js#senderIdentity already
//                        established for content.
//   acknowledgedAt     — the acknowledger's own clock, display
//                        metadata only — never a freshness or ordering
//                        mechanism, the same non-authoritative role
//                        core/ChatMessage.js#timestamp already plays.
export function toChatDeliveryAck({ messageId, conversationId, recipientIdentity, acknowledgedAt = Date.now() }) {
    if (!messageId || typeof messageId !== 'string') {
        throw new Error('toChatDeliveryAck: messageId is required');
    }
    if (!conversationId || typeof conversationId !== 'string') {
        throw new Error('toChatDeliveryAck: conversationId is required');
    }
    if (!recipientIdentity || typeof recipientIdentity !== 'string') {
        throw new Error('toChatDeliveryAck: recipientIdentity is required');
    }
    return { messageId, conversationId, recipientIdentity, acknowledgedAt };
}

export function isValidChatDeliveryAck(value) {
    return Boolean(value)
        && typeof value === 'object'
        && typeof value.messageId === 'string' && value.messageId.length > 0 && value.messageId.length <= MAX_CHAT_ID_LENGTH
        && typeof value.conversationId === 'string' && value.conversationId.length > 0 && value.conversationId.length <= MAX_CHAT_ID_LENGTH
        && typeof value.recipientIdentity === 'string' && value.recipientIdentity.length > 0
        && Number.isFinite(value.acknowledgedAt);
}
