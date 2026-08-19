import { createId } from './createId.js';

// 0.2.61 — Direct Peer Messaging & Live Chat. The wire shape for ONE
// chat message, carried as `peer/PeerMessage.js`'s own `payload` under
// a dedicated `forkbuild:chat` protocol — see application/ChatUseCase.js's
// own header for why chat is a protocol running OVER authenticated
// peers, never a feature folded into the peer transport itself.
//
// Deliberately small, mirroring core/AvatarInteractionAdvertisement.js's
// own "own file, own closed vocabulary, structurally validated" shape:
//
//   messageId       — a fresh UUID per message, existing ONLY for
//                      exact-duplicate suppression
//                      (core/ChatReplayWindow.js) — independent of
//                      `sequence`'s own ordering role, the same
//                      "message identity vs. sequence ordering vs.
//                      delivery ordering" split
//                      application/ChatUseCase.js's own header
//                      documents.
//   conversationId  — see deriveConversationId() below: a value BOTH
//                      participants compute identically and
//                      independently, never negotiated or carried as
//                      a claim to trust on its own — a receiver always
//                      re-derives its own expected conversationId from
//                      the already-AUTHENTICATED sender and compares,
//                      never accepts whatever the payload says at face
//                      value.
//   senderIdentity  — who the message CLAIMS to be from. Never trusted
//                      on its own — application/ChatUseCase.js's
//                      ingestion boundary requires this to match the
//                      sending connection's own already-proven
//                      remoteIdentity before accepting anything.
//   sequence        — a flat, per-(conversation, sender) monotonic
//                      counter — "is this newer than the last message
//                      I accepted FROM THIS SENDER in THIS
//                      conversation?" Deliberately does not assume a
//                      contiguous stream (no gap-filling, no
//                      renumbering) — WebRTC/DataChannel delivery is
//                      ordered today, but this field's only real job is
//                      rejecting a stale replay, never reconstructing
//                      an exact count of messages sent.
//   kind            — TEXT only, for 0.2.61. A closed, one-value
//                      vocabulary on purpose — see docs/Principles.md,
//                      "Chat Ships With One Message Kind, Not Four
//                      Half-Built Ones" (0.2.61): attachments, edits,
//                      reactions, and typing indicators are all later,
//                      additive work, never this milestone's.
//   body            — bounded UTF-8 text. Never HTML, never markdown,
//                      never anything a renderer would need to
//                      interpret — a chat UI always displays this as
//                      plain text.
//   timestamp       — the sender's own clock, carried as display
//                      metadata only, exactly the same non-authoritative
//                      role core/AvatarInteractionAdvertisement.js's own
//                      `timestamp` plays — never a freshness or
//                      ordering mechanism (that's `sequence`'s job).
export const ChatMessageKind = Object.freeze({
    TEXT: 'TEXT'
});

export function isValidChatMessageKind(value) {
    return value === ChatMessageKind.TEXT;
}

// Deliberately generous but finite — transport hygiene, not a real
// product limit, the same posture peer/PeerMessage.js's own
// MAX_PEER_MESSAGE_BYTES already applies one layer down (64KB), well
// above this bound.
export const MAX_CHAT_BODY_LENGTH = 4000;
export const MAX_CHAT_ID_LENGTH = 512;

// A conversationId BOTH sides of a direct chat compute identically and
// independently from the two participants' own identityIds — never
// assigned by either side alone, and never carried over the wire as
// something to trust without re-deriving it locally first (see this
// file's own header, and application/ChatUseCase.js's ingestion
// boundary). Order-independent (sorted) so it is exactly the same
// string on both devices regardless of who initiated.
export function deriveConversationId(identityIdA, identityIdB) {
    if (typeof identityIdA !== 'string' || !identityIdA || typeof identityIdB !== 'string' || !identityIdB) {
        throw new Error('deriveConversationId: two identityIds are required');
    }
    return [identityIdA, identityIdB].sort().join('|');
}

export function toChatMessage({ conversationId, senderIdentity, sequence, kind = ChatMessageKind.TEXT, body, timestamp = Date.now() }) {
    if (!conversationId || typeof conversationId !== 'string') {
        throw new Error('toChatMessage: conversationId is required');
    }
    if (!senderIdentity || typeof senderIdentity !== 'string') {
        throw new Error('toChatMessage: senderIdentity is required');
    }
    if (!Number.isInteger(sequence) || sequence <= 0) {
        throw new Error('toChatMessage: sequence must be a positive integer');
    }
    if (!body || typeof body !== 'string') {
        throw new Error('toChatMessage: body is required');
    }
    return {
        messageId: createId(),
        conversationId,
        senderIdentity,
        sequence,
        kind,
        body,
        timestamp
    };
}

// Structural validity ONLY — never anything about whether
// `senderIdentity` is who it claims to be, or whether `conversationId`
// is the one this receiver actually expects. Those are both trust-
// boundary questions application/ChatUseCase.js's own ingestion answers
// using facts THIS class has no access to (the connection's proven
// remoteIdentity, this device's own identityId) — the same "shape here,
// trust one layer up" division core/AvatarInteractionAdvertisement.js's
// own isValidAvatarInteractionAdvertisement() already draws.
export function isValidChatMessage(value) {
    return Boolean(value)
        && typeof value === 'object'
        && typeof value.messageId === 'string' && value.messageId.length > 0 && value.messageId.length <= MAX_CHAT_ID_LENGTH
        && typeof value.conversationId === 'string' && value.conversationId.length > 0 && value.conversationId.length <= MAX_CHAT_ID_LENGTH
        && typeof value.senderIdentity === 'string' && value.senderIdentity.length > 0
        && Number.isInteger(value.sequence) && value.sequence > 0
        && isValidChatMessageKind(value.kind)
        && typeof value.body === 'string' && value.body.trim().length > 0 && value.body.length <= MAX_CHAT_BODY_LENGTH
        && Number.isFinite(value.timestamp);
}
