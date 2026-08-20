import { isValidChatMessage } from './ChatMessage.js';
import { isValidChatMessageDirection } from './ConversationEntry.js';
import { isValidChatDeliveryState } from './ChatDeliveryState.js';

// 0.2.83 — Multi-Device Conversation & Read-State Synchronization.
//
// The wire vocabulary for `application/DeviceConversationSyncUseCase.js`'s
// own protocol (`forkbuild:device-conversation-sync`) — deliberately a
// SEPARATE protocol from `forkbuild:chat`/`forkbuild:chat-delivery-ack`/
// `forkbuild:chat-read`, never a new message kind riding one of those.
// See that file's own header, and docs/Principles.md, "Conversation
// Synchronization Is A Protocol Between A Device And Itself, Never A
// Wider Chat Feature" (0.2.83): this vocabulary only ever travels between
// two connections `application/DeviceAuthorizationPropagationUseCase.js`
// independently resolves to the SAME parent identity — it carries no
// authority over Bob's own copy of anything, and Bob's ChatUseCase never
// subscribes to it at all.
//
// Two closed kinds, exactly like core/DeviceAuthorizationGossip.js's own
// GRANT/REVOCATION split:
//
//   MESSAGES   — a bounded batch of one sending device's own
//                application/ConversationStore.js entries for ONE
//                conversation bucket (`peerIdentityId` — the THIRD
//                party, e.g. Bob; never the sibling this envelope is
//                addressed to). Each entry is a verbatim
//                core/ChatMessage.js plus its own `direction`/
//                `deliveryState`, never re-derived or reconstructed —
//                see this file's own header on why message IDENTITY
//                (`messageId`, a fresh UUID per core/ChatMessage.js#toChatMessage)
//                already needed no redesign for this milestone: it was
//                already globally unique, independent of which device
//                produced it.
//   READ_STATE — one sending device's own LOCAL read marker
//                (application/ConversationReadTracker.js#getLastReadSequence)
//                for one peer — never a claim about what the RECEIVING
//                device has read, and never merged INTO the receiver's
//                own local marker (see application/SiblingReadStateStore.js's
//                own header on why a sibling's report is tracked
//                separately, never overwriting this device's own).
//
// Bounded the same way core/ChatMessage.js's own MAX_CHAT_ID_LENGTH
// already bounds identity strings, and batched at a size well under
// peer/PeerMessage.js's own MAX_PEER_MESSAGE_BYTES (64KB) — a full
// conversation history sync sends several envelopes in sequence rather
// than one unbounded one.
export const ConversationSyncKind = Object.freeze({
    MESSAGES: 'MESSAGES',
    READ_STATE: 'READ_STATE'
});

export function isValidConversationSyncKind(value) {
    return value === ConversationSyncKind.MESSAGES || value === ConversationSyncKind.READ_STATE;
}

export const MAX_SYNC_PEER_ID_LENGTH = 512;

// Transport hygiene, not a product limit — see this file's own header on
// why a full history sync is several small envelopes, never one large
// one.
export const SYNC_MESSAGES_BATCH_SIZE = 20;

export function toConversationSyncMessagesEnvelope({ peerIdentityId, entries }) {
    if (!peerIdentityId || typeof peerIdentityId !== 'string') {
        throw new Error('toConversationSyncMessagesEnvelope: peerIdentityId is required');
    }
    if (!Array.isArray(entries) || entries.length === 0) {
        throw new Error('toConversationSyncMessagesEnvelope: at least one entry is required');
    }
    if (entries.length > SYNC_MESSAGES_BATCH_SIZE) {
        throw new Error('toConversationSyncMessagesEnvelope: entries exceeds SYNC_MESSAGES_BATCH_SIZE');
    }
    return {
        kind: ConversationSyncKind.MESSAGES,
        peerIdentityId,
        entries: entries.map((entry) => ({
            message: entry.message,
            direction: entry.direction,
            deliveryState: entry.deliveryState !== undefined ? entry.deliveryState : null
        }))
    };
}

export function isValidConversationSyncMessagesEnvelope(value) {
    return Boolean(value)
        && typeof value === 'object'
        && value.kind === ConversationSyncKind.MESSAGES
        && typeof value.peerIdentityId === 'string' && value.peerIdentityId.length > 0 && value.peerIdentityId.length <= MAX_SYNC_PEER_ID_LENGTH
        && Array.isArray(value.entries)
        && value.entries.length > 0
        && value.entries.length <= SYNC_MESSAGES_BATCH_SIZE
        && value.entries.every((entry) => Boolean(entry)
            && typeof entry === 'object'
            && isValidChatMessage(entry.message)
            && isValidChatMessageDirection(entry.direction)
            && (entry.deliveryState === null || isValidChatDeliveryState(entry.deliveryState)));
}

export function toConversationSyncReadStateEnvelope({ peerIdentityId, lastReadSequence }) {
    if (!peerIdentityId || typeof peerIdentityId !== 'string') {
        throw new Error('toConversationSyncReadStateEnvelope: peerIdentityId is required');
    }
    if (!Number.isInteger(lastReadSequence) || lastReadSequence < 0) {
        throw new Error('toConversationSyncReadStateEnvelope: lastReadSequence must be a non-negative integer');
    }
    return { kind: ConversationSyncKind.READ_STATE, peerIdentityId, lastReadSequence };
}

export function isValidConversationSyncReadStateEnvelope(value) {
    return Boolean(value)
        && typeof value === 'object'
        && value.kind === ConversationSyncKind.READ_STATE
        && typeof value.peerIdentityId === 'string' && value.peerIdentityId.length > 0 && value.peerIdentityId.length <= MAX_SYNC_PEER_ID_LENGTH
        && Number.isInteger(value.lastReadSequence) && value.lastReadSequence >= 0;
}

export function isValidConversationSyncEnvelope(value) {
    return isValidConversationSyncMessagesEnvelope(value) || isValidConversationSyncReadStateEnvelope(value);
}
