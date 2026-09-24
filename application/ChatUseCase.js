import { EventBus } from '../core/events/EventBus.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { FriendshipState } from '../core/FriendshipState.js';
import { toChatMessage, isValidChatMessage, deriveConversationId, MAX_CHAT_BODY_LENGTH } from '../core/ChatMessage.js';
import { ChatReplayWindow } from '../core/ChatReplayWindow.js';
import { resolveIncomingChatMessage } from '../core/ChatMessageIngestion.js';
import { ChatDeliveryState } from '../core/ChatDeliveryState.js';
import { toChatDeliveryAck, isValidChatDeliveryAck } from '../core/ChatDeliveryAck.js';
import { toChatReadReceipt, isValidChatReadReceipt } from '../core/ChatReadReceipt.js';
import { isDeliveryStateAdvancement } from '../core/ChatDeliveryState.js';
import { isValidChatMessageDirection } from '../core/ConversationEntry.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LiveConversation } from './LiveConversation.js';
import { ChatOutbox } from './ChatOutbox.js';
import { ConversationStore } from './ConversationStore.js';
import { ConversationReadOutbox } from './ConversationReadOutbox.js';
import { RemoteReadReceiptStore } from './RemoteReadReceiptStore.js';
import { resolveDirectSocialIdentity } from './SocialIdentityResolver.js';

const MESSAGE_EVENT = 'ChatMessage';
const READ_RECEIPT_EVENT = 'ChatReadReceipt';

// In-memory default backend when no durable store is injected; ui/main.js always
// injects persisted ones. Each store gets its own instance, never shared.
class EphemeralStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, data); }
    load(name) { return this._data.has(name) ? this._data.get(name) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// Peer-to-peer chat: its own `forkbuild:chat` protocol on the shared
// PeerMessageBus, never folded into presence or friendship.
//
// Friendship authorizes chat; it is never the protocol. Chat is allowed only
// with an authenticated, unblocked FRIEND, checked fresh on every send and
// every incoming message in both directions. Unfriending or blocking does not
// close the connection; it just stops chat (docs/Principles.md, "Friendship
// Authorizes A Protocol; It Is Never The Protocol").
//
// sendMessage() is live delivery only and throws when the peer is not
// connected. sendOrQueue() is the deliberately durable alternative ("Send
// Means Live Delivery; SendOrQueue Means Deliberate Durability"): undeliverable
// messages wait in ChatOutbox, addressed to the recipient's proven identity,
// never a connection, so a "reconnect" that authenticates as someone else can
// never receive them. Delivery is QUEUED -> SENT (accepted by the bus) ->
// DELIVERED (acked by the recipient); "Sent Is Not Delivered". Every accepted
// message is acked, duplicates included, so resends are harmless.
//
// History is kept locally in ConversationStore and written through on every
// append and state change. The constructor rehydrates conversations before any
// peer attaches, and re-seeds each peer's outgoing sequence so a reload never
// restarts at 1 (the recipient's replay window would reject it).
//
// Read receipts (`forkbuild:chat-read`) are computed from this class's own
// conversations, never transmitted from the local read marker ("A Read Receipt
// Is Computed Independently From The Local Read Marker, Never Transmitted From
// It"). They are monotonic high-water marks, coalesced per peer in their own
// outbox and flushed on the same reconnect trigger as messages.
//
// Blocking or unfriending never deletes stored history, but it cancels anything
// still QUEUED for that peer immediately (and once at startup, for changes made
// in an earlier session), rather than letting it wait to expire. CANCELLED
// means authorization was withdrawn; EXPIRED means time ran out ("Queued Mail
// Answers To The Same Eligibility Check As A Fresh Send, Never A Softer One").
//
// Multi-device: business state is keyed by the peer's resolved social identity
// (all of Alice's devices share one conversation), while authentication and the
// wire-level conversationId stay on the raw authenticated keys, which both ends
// derive independently. Each message's senderIdentity still records the device.
// This device's own identity is never resolved.
export class ChatUseCase {
    constructor(identityProvider, {
        peerMessageBus,
        connectedPeerRegistry,
        friendRelationshipUseCase,
        peerBlockUseCase = null,
        chatOutbox = null,
        conversationStore = null,
        conversationReadOutbox = null,
        remoteReadReceiptStore = null,
        protocol = ChatUseCase.DEFAULT_PROTOCOL,
        ackProtocol = ChatUseCase.ACK_PROTOCOL,
        readProtocol = ChatUseCase.READ_PROTOCOL,
        replayWindow = new ChatReplayWindow(),
        resolveSocialIdentity = resolveDirectSocialIdentity
    } = {}) {
        if (!identityProvider) {
            throw new Error('ChatUseCase: identityProvider is required');
        }
        if (!peerMessageBus || typeof peerMessageBus.send !== 'function' || typeof peerMessageBus.subscribe !== 'function' || typeof peerMessageBus.attach !== 'function') {
            throw new Error('ChatUseCase: a PeerMessageBus is required');
        }
        if (!connectedPeerRegistry || typeof connectedPeerRegistry.list !== 'function' || typeof connectedPeerRegistry.onChange !== 'function') {
            throw new Error('ChatUseCase: a ConnectedPeerRegistry is required');
        }
        if (!friendRelationshipUseCase || typeof friendRelationshipUseCase.getState !== 'function') {
            throw new Error('ChatUseCase: a FriendRelationshipUseCase is required');
        }
        this._identityProvider = identityProvider;
        this._bus = peerMessageBus;
        this._registry = connectedPeerRegistry;
        this._friends = friendRelationshipUseCase;
        this._isBlocked = peerBlockUseCase ? (identityId) => peerBlockUseCase.isBlocked(identityId) : () => false;
        this._protocol = protocol;
        this._ackProtocol = ackProtocol;
        this._readProtocol = readProtocol;
        this._replayWindow = replayWindow;
        this._resolveSocialIdentity = resolveSocialIdentity;
        this._outbox = chatOutbox || new ChatOutbox(new EphemeralStorageProvider(), identityProvider);
        this._conversationStore = conversationStore || new ConversationStore(new EphemeralStorageProvider(), identityProvider);
        this._readOutbox = conversationReadOutbox || new ConversationReadOutbox(new EphemeralStorageProvider(), identityProvider);
        this._remoteReadReceipts = remoteReadReceiptStore || new RemoteReadReceiptStore(new EphemeralStorageProvider(), identityProvider);
        this._conversations = new Map();
        this._nextSequence = new Map();
        this._eventBus = new EventBus();
        this._rehydrateFromStore();

        // Seeded before the startup reconciliation below, so it compares storage with
        // current eligibility directly.
        this._blockedIds = peerBlockUseCase ? new Set(peerBlockUseCase.getBlocked().map((b) => b.identityId)) : new Set();
        this._friendIds = new Set(friendRelationshipUseCase.getRelationships()
            .filter((r) => r.status === FriendshipState.FRIEND)
            .map((r) => r.identityId));
        this._reconcileCancellationsOnStartup();
        // A second subscriber to events that exist for the UI: cancels queued mail as
        // soon as a peer becomes ineligible.
        this._unsubscribeBlocks = peerBlockUseCase
            ? peerBlockUseCase.onBlockedChanged((blocked) => this._reconcileCancellationsForBlocked(blocked))
            : null;
        this._unsubscribeFriends = friendRelationshipUseCase.onRelationshipsChanged
            ? friendRelationshipUseCase.onRelationshipsChanged((relationships) => this._reconcileCancellationsForFriends(relationships))
            : null;

        // Attaches every current and future peer; each registry change also flushes
        // queued mail for identities authenticated now.
        for (const peer of this._registry.list()) {
            this._bus.attach(peer);
            this._flushIfAuthenticated(peer);
        }
        this._unsubscribeRegistry = this._registry.onChange((peers) => {
            for (const peer of peers) {
                this._bus.attach(peer);
                this._flushIfAuthenticated(peer);
            }
        });
        this._unsubscribeBus = this._bus.subscribe(this._protocol, (payload, meta) => this._handleIncoming(payload, meta));
        this._unsubscribeAckBus = this._bus.subscribe(this._ackProtocol, (payload, meta) => this._handleIncomingAck(payload, meta));
        this._unsubscribeReadBus = this._bus.subscribe(this._readProtocol, (payload, meta) => this._handleIncomingRead(payload, meta));
    }

    getConversation(peerIdentityId) {
        const conversation = this._conversations.get(peerIdentityId);
        return conversation ? conversation.messages : [];
    }

    // Includes conversations rehydrated from earlier sessions, ordered by
    // peerIdentityId.
    getConversations() {
        return Array.from(this._conversations.values()).sort((a, b) => a.peerIdentityId.localeCompare(b.peerIdentityId));
    }

    // Eligibility only, not reachability: lets the UI disable the compose box.
    // sendMessage() enforces reachability.
    canChat(identityId) {
        return Boolean(identityId) && !this._isBlocked(identityId) && this._friends.getState(identityId) === FriendshipState.FRIEND;
    }

    // `connectedPeer` must be authenticated; refused (not queued) otherwise.
    sendMessage(connectedPeer, body) {
        const peerIdentity = this._requireAuthenticatedPeer(connectedPeer);
        // Eligibility and bucketing use the resolved social identity; the wire-level
        // conversationId and sequence stay on the raw peer identity.
        const social = this._resolvePeerSocialIdentity(connectedPeer);
        this._requireEligible(social.identityId);
        const trimmed = typeof body === 'string' ? body.trim() : '';
        if (!trimmed) {
            throw new Error('ChatUseCase: message body must not be empty');
        }
        if (trimmed.length > MAX_CHAT_BODY_LENGTH) {
            throw new Error('ChatUseCase: message body exceeds maximum length');
        }
        const myIdentityId = this._identityProvider.getSigningIdentity().id;
        const conversationId = deriveConversationId(myIdentityId, peerIdentity.identityId);
        const sequence = (this._nextSequence.get(peerIdentity.identityId) || 0) + 1;
        const message = toChatMessage({ conversationId, senderIdentity: myIdentityId, sequence, body: trimmed });
        this._bus.send(connectedPeer, this._protocol, message);
        this._nextSequence.set(peerIdentity.identityId, sequence);
        this._appendMessage(social.identityId, conversationId, message, 'outgoing');
        return message;
    }

    // Queues for an eligible peer even when offline, and flushes immediately when a
    // connection exists, so an online peer still gets SENT before this returns.
    sendOrQueue(peerIdentityId, body, { ttlMs } = {}) {
        this._requireEligible(peerIdentityId);
        const trimmed = typeof body === 'string' ? body.trim() : '';
        if (!trimmed) {
            throw new Error('ChatUseCase: message body must not be empty');
        }
        if (trimmed.length > MAX_CHAT_BODY_LENGTH) {
            throw new Error('ChatUseCase: message body exceeds maximum length');
        }
        const myIdentityId = this._identityProvider.getSigningIdentity().id;
        const conversationId = deriveConversationId(myIdentityId, peerIdentityId);
        const sequence = (this._nextSequence.get(peerIdentityId) || 0) + 1;
        const message = toChatMessage({ conversationId, senderIdentity: myIdentityId, sequence, body: trimmed });
        this._nextSequence.set(peerIdentityId, sequence);
        this._outbox.enqueue(message, peerIdentityId, ttlMs ? { ttlMs } : {});
        this._appendMessage(peerIdentityId, conversationId, message, 'outgoing', ChatDeliveryState.QUEUED);
        this._attemptFlush(peerIdentityId);
        return message;
    }

    // QUEUED/SENT entries, oldest first (delivered ones are removed).
    getOutbox(peerIdentityId) {
        return this._outbox.list(peerIdentityId).sort((a, b) => a.message.sequence - b.message.sequence);
    }

    // No-op unless the identity is eligible and authenticated now.
    flushOutbox(peerIdentityId) {
        this._attemptFlush(peerIdentityId);
    }

    // Never throws: an ineligible peer, or nothing incoming yet, is a no-op, so the
    // UI can call this every time a conversation opens.
    sendReadReceipt(peerIdentityId) {
        if (!this.canChat(peerIdentityId)) {
            return null;
        }
        const conversation = this._conversations.get(peerIdentityId);
        if (!conversation) {
            return null;
        }
        const highestIncoming = conversation.messages.reduce(
            (max, message) => (message.direction === 'incoming' && message.sequence > max ? message.sequence : max),
            0
        );
        if (highestIncoming === 0) {
            return null;
        }
        this._readOutbox.enqueue(peerIdentityId, highestIncoming);
        this._attemptFlush(peerIdentityId);
        return highestIncoming;
    }

    // 0 when no receipt exists; read through, never cached.
    getPeerReadThroughSequence(peerIdentityId) {
        return this._remoteReadReceipts.getReadThroughSequence(peerIdentityId);
    }

    getStoredEntries(peerIdentityId) {
        return this._conversationStore.list(peerIdentityId).sort((a, b) => a.message.sequence - b.message.sequence);
    }

    getStoredConversationPeerIds() {
        return this._conversationStore.conversations().map((c) => c.peerIdentityId);
    }

    // Ingests a message from a sibling device, which has already applied its own
    // trust checks; nothing is re-validated here. Idempotent by messageId: a known
    // message is not re-appended, but a genuine delivery-state advancement is
    // applied. Sends nothing back on the wire: only the device that received a
    // message live acks it ("Conversation Synchronization Is A Protocol Between A
    // Device And Itself, Never A Wider Chat Feature").
    ingestSyncedEntry(peerIdentityId, message, direction, deliveryState = null) {
        if (!peerIdentityId || typeof peerIdentityId !== 'string') {
            return;
        }
        if (!isValidChatMessage(message) || !isValidChatMessageDirection(direction)) {
            return;
        }
        const existing = this._conversationStore.list(peerIdentityId).find((entry) => entry.message.messageId === message.messageId);
        if (!existing) {
            this._appendMessage(peerIdentityId, message.conversationId, message, direction, deliveryState);
            return;
        }
        if (isDeliveryStateAdvancement(existing.deliveryState, deliveryState)) {
            this._publishDeliveryState(peerIdentityId, message.messageId, deliveryState);
        }
    }

    // Returns an unsubscribe function. Fires for every sent or accepted message and
    // every delivery-state change.
    onMessage(callback) {
        const subscription = this._eventBus.subscribe(MESSAGE_EVENT, ({ peerIdentityId, message }) => callback(peerIdentityId, message));
        return () => subscription.unsubscribe();
    }

    // Returns an unsubscribe function. Fires only for a genuinely newer receipt.
    onReadReceipt(callback) {
        const subscription = this._eventBus.subscribe(READ_RECEIPT_EVENT, ({ peerIdentityId, readThroughSequence }) => callback(peerIdentityId, readThroughSequence));
        return () => subscription.unsubscribe();
    }

    dispose() {
        if (this._unsubscribeRegistry) {
            this._unsubscribeRegistry();
            this._unsubscribeRegistry = null;
        }
        if (this._unsubscribeBus) {
            this._unsubscribeBus();
            this._unsubscribeBus = null;
        }
        if (this._unsubscribeAckBus) {
            this._unsubscribeAckBus();
            this._unsubscribeAckBus = null;
        }
        if (this._unsubscribeReadBus) {
            this._unsubscribeReadBus();
            this._unsubscribeReadBus = null;
        }
        if (this._unsubscribeBlocks) {
            this._unsubscribeBlocks();
            this._unsubscribeBlocks = null;
        }
        if (this._unsubscribeFriends) {
            this._unsubscribeFriends();
            this._unsubscribeFriends = null;
        }
        // The injected collaborators are shared and outlive this use case, so they are
        // not disposed.
    }

    // Nothing from the wire is trusted until, in order:
    //   1. it is well formed (core/ChatMessage.js)
    //   2. its senderIdentity is the identity this connection proved, not what the
    //      payload claims (defeats forged senders)
    //   3. the sender is not blocked
    //   4. the sender is a FRIEND right now
    //   5. the conversationId matches the one derived here for (me, sender)
    //   6. it passes the replay/sequence check
    // Anything that clears the gates is acked, duplicates included; anything that
    // fails them gets no ack.
    _handleIncoming(payload, meta) {
        if (!isValidChatMessage(payload)) {
            return;
        }
        const remoteIdentity = meta.connectedPeer && meta.connectedPeer.remoteIdentity;
        if (!remoteIdentity) {
            return;
        }
        if (payload.senderIdentity !== remoteIdentity.identityId) {
            return;
        }
        const social = this._resolvePeerSocialIdentity(meta.connectedPeer);
        if (this._isBlocked(social.identityId)) {
            return;
        }
        if (this._friends.getState(social.identityId) !== FriendshipState.FRIEND) {
            return;
        }
        let myIdentityId;
        try {
            myIdentityId = this._identityProvider.getSigningIdentity().id;
        } catch {
            return;
        }
        if (payload.conversationId !== deriveConversationId(myIdentityId, remoteIdentity.identityId)) {
            return;
        }

        const key = replayKey(payload.conversationId, payload.senderIdentity);
        if (this._replayWindow.hasAccepted(key, payload.messageId)) {
            this._sendAck(meta.connectedPeer, payload, myIdentityId);
            return;
        }
        const decision = resolveIncomingChatMessage(this._replayWindow.highestSequence(key), payload);
        if (!decision.accepted) {
            return;
        }
        this._replayWindow.recordAccepted(key, payload.messageId, payload.sequence);
        this._appendMessage(social.identityId, payload.conversationId, payload, 'incoming');
        this._sendAck(meta.connectedPeer, payload, myIdentityId);
    }

    // A smaller boundary: identity must match the connection and the
    // conversationId must match. An ack for nothing we sent is ignored.
    _handleIncomingAck(payload, meta) {
        if (!isValidChatDeliveryAck(payload)) {
            return;
        }
        const remoteIdentity = meta.connectedPeer && meta.connectedPeer.remoteIdentity;
        if (!remoteIdentity) {
            return;
        }
        if (payload.recipientIdentity !== remoteIdentity.identityId) {
            return;
        }
        let myIdentityId;
        try {
            myIdentityId = this._identityProvider.getSigningIdentity().id;
        } catch {
            return;
        }
        if (payload.conversationId !== deriveConversationId(myIdentityId, remoteIdentity.identityId)) {
            return;
        }
        const social = this._resolvePeerSocialIdentity(meta.connectedPeer);
        const entry = this._outbox.acknowledge(social.identityId, payload.messageId);
        if (!entry) {
            return;
        }
        this._publishDeliveryState(social.identityId, payload.messageId, ChatDeliveryState.DELIVERED);
    }

    // Same gates as messages. No replay window is needed: the receipt store keeps a
    // monotonic maximum, so stale or duplicate receipts are no-ops.
    _handleIncomingRead(payload, meta) {
        if (!isValidChatReadReceipt(payload)) {
            return;
        }
        const remoteIdentity = meta.connectedPeer && meta.connectedPeer.remoteIdentity;
        if (!remoteIdentity) {
            return;
        }
        if (payload.readerIdentity !== remoteIdentity.identityId) {
            return;
        }
        const social = this._resolvePeerSocialIdentity(meta.connectedPeer);
        if (this._isBlocked(social.identityId)) {
            return;
        }
        if (this._friends.getState(social.identityId) !== FriendshipState.FRIEND) {
            return;
        }
        let myIdentityId;
        try {
            myIdentityId = this._identityProvider.getSigningIdentity().id;
        } catch {
            return;
        }
        if (payload.conversationId !== deriveConversationId(myIdentityId, remoteIdentity.identityId)) {
            return;
        }
        const before = this._remoteReadReceipts.getReadThroughSequence(social.identityId);
        const updated = this._remoteReadReceipts.recordReadThrough(social.identityId, payload.readThroughSequence);
        if (updated.readThroughSequence > before) {
            this._eventBus.publish(READ_RECEIPT_EVENT, { peerIdentityId: social.identityId, readThroughSequence: updated.readThroughSequence });
        }
    }

    _sendAck(connectedPeer, payload, myIdentityId) {
        const ack = toChatDeliveryAck({
            messageId: payload.messageId,
            conversationId: payload.conversationId,
            recipientIdentity: myIdentityId
        });
        this._bus.send(connectedPeer, this._ackProtocol, ack);
    }

    // Prunes expired entries, then, only if the identity is eligible and
    // authenticated now, sends every QUEUED entry in sequence order. Safe to call
    // repeatedly.
    _attemptFlush(peerIdentityId) {
        const expired = this._outbox.pruneExpired(peerIdentityId);
        for (const entry of expired) {
            this._publishDeliveryState(entry.peerIdentityId, entry.message.messageId, ChatDeliveryState.EXPIRED);
        }
        if (!this.canChat(peerIdentityId)) {
            return;
        }
        const connectedPeer = this._findAuthenticatedPeer(peerIdentityId);
        if (!connectedPeer) {
            return;
        }
        const queued = this._outbox.list(peerIdentityId)
            .filter((entry) => entry.state === ChatDeliveryState.QUEUED)
            .sort((a, b) => a.message.sequence - b.message.sequence);
        for (const entry of queued) {
            this._bus.send(connectedPeer, this._protocol, entry.message);
            this._outbox.markSent(peerIdentityId, entry.message.messageId);
            this._publishDeliveryState(peerIdentityId, entry.message.messageId, ChatDeliveryState.SENT);
        }
        const pendingReads = this._readOutbox.pending(peerIdentityId);
        if (pendingReads.length > 0) {
            const myIdentityId = this._identityProvider.getSigningIdentity().id;
            const conversationId = deriveConversationId(myIdentityId, peerIdentityId);
            for (const entry of pendingReads) {
                const receipt = toChatReadReceipt({ conversationId, readerIdentity: myIdentityId, readThroughSequence: entry.readThroughSequence });
                this._bus.send(connectedPeer, this._readProtocol, receipt);
                this._readOutbox.markSent(peerIdentityId, entry.readThroughSequence);
            }
        }
    }

    // Only newly blocked identities cancel mail; unblocking restores nothing.
    _reconcileCancellationsForBlocked(blocked) {
        const now = new Set(blocked.map((b) => b.identityId));
        for (const identityId of now) {
            if (!this._blockedIds.has(identityId)) {
                this._cancelOutboxFor(identityId);
            }
        }
        this._blockedIds = now;
    }

    // Only a lost friendship cancels mail; new friendships have no side effect.
    _reconcileCancellationsForFriends(relationships) {
        const now = new Set(relationships.filter((r) => r.status === FriendshipState.FRIEND).map((r) => r.identityId));
        for (const identityId of this._friendIds) {
            if (!now.has(identityId)) {
                this._cancelOutboxFor(identityId);
            }
        }
        this._friendIds = now;
    }

    _reconcileCancellationsOnStartup() {
        const candidates = new Set([
            ...this._outbox.list().map((entry) => entry.peerIdentityId),
            ...this._readOutbox.list().map((entry) => entry.peerIdentityId)
        ]);
        for (const peerIdentityId of candidates) {
            if (!this.canChat(peerIdentityId)) {
                this._cancelOutboxFor(peerIdentityId);
            }
        }
    }

    // Cancels QUEUED messages (recording CANCELLED in history) and any pending read
    // acknowledgement. Anything already SENT is beyond recall.
    _cancelOutboxFor(peerIdentityId) {
        const cancelled = this._outbox.cancel(peerIdentityId);
        for (const entry of cancelled) {
            this._publishDeliveryState(peerIdentityId, entry.message.messageId, ChatDeliveryState.CANCELLED);
        }
        this._readOutbox.cancel(peerIdentityId);
    }

    _flushIfAuthenticated(connectedPeer) {
        if (connectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED && connectedPeer.remoteIdentity) {
            const social = this._resolvePeerSocialIdentity(connectedPeer);
            this._attemptFlush(social.identityId);
        }
    }

    // Matches by resolved identity, so mail for Alice reaches whichever of her
    // authorized devices is found first (one device, never a fan-out).
    _findAuthenticatedPeer(identityId) {
        return this._registry.list().find((peer) => peer.remoteIdentity
            && peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED
            && this._resolvePeerSocialIdentity(peer).identityId === identityId) || null;
    }

    // Re-seeds the outgoing sequence from OUTGOING entries only: incoming sequences
    // belong to the sender's namespace.
    _rehydrateFromStore() {
        for (const { peerIdentityId } of this._conversationStore.conversations()) {
            const entries = this._conversationStore.list(peerIdentityId);
            if (entries.length === 0) {
                continue;
            }
            const conversation = new LiveConversation({ conversationId: entries[0].message.conversationId, peerIdentityId });
            this._conversations.set(peerIdentityId, conversation);
            let highestOutgoingSequence = 0;
            for (const entry of entries) {
                conversation.append(entry.message, entry.direction, entry.deliveryState);
                if (entry.direction === 'outgoing' && entry.message.sequence > highestOutgoingSequence) {
                    highestOutgoingSequence = entry.message.sequence;
                }
            }
            if (highestOutgoingSequence > 0) {
                this._nextSequence.set(peerIdentityId, highestOutgoingSequence);
            }
        }
    }

    _publishDeliveryState(peerIdentityId, messageId, deliveryState) {
        const conversation = this._conversations.get(peerIdentityId);
        if (!conversation) {
            return;
        }
        const updated = conversation.updateDeliveryState(messageId, deliveryState);
        if (!updated) {
            return;
        }
        this._conversationStore.updateDeliveryState(peerIdentityId, messageId, deliveryState);
        this._eventBus.publish(MESSAGE_EVENT, { peerIdentityId, message: updated });
    }

    _appendMessage(peerIdentityId, conversationId, message, direction, deliveryState = null) {
        let conversation = this._conversations.get(peerIdentityId);
        if (!conversation) {
            conversation = new LiveConversation({ conversationId, peerIdentityId });
            this._conversations.set(peerIdentityId, conversation);
        }
        conversation.append(message, direction, deliveryState);
        this._conversationStore.append(peerIdentityId, message, direction, deliveryState);
        this._eventBus.publish(MESSAGE_EVENT, { peerIdentityId, message: { ...message, direction, deliveryState } });
    }

    _requireAuthenticatedPeer(connectedPeer) {
        if (!connectedPeer || typeof connectedPeer.getLifecycleState !== 'function') {
            throw new Error('ChatUseCase: a ConnectedPeer is required');
        }
        if (connectedPeer.getLifecycleState() !== PeerLifecycleState.AUTHENTICATED || !connectedPeer.remoteIdentity) {
            throw new Error('ChatUseCase: the peer must be an authenticated connection');
        }
        return connectedPeer.remoteIdentity;
    }

    // Falls back to the raw identity if the resolver returns null.
    _resolvePeerSocialIdentity(connectedPeer) {
        return this._resolveSocialIdentity(connectedPeer) || resolveDirectSocialIdentity(connectedPeer);
    }

    // Throws a specific reason on the sending side; the receiving side drops
    // silently instead.
    _requireEligible(identityId) {
        if (this._isBlocked(identityId)) {
            throw new Error('ChatUseCase: this identity is blocked');
        }
        if (this._friends.getState(identityId) !== FriendshipState.FRIEND) {
            throw new Error('ChatUseCase: chat requires a mutual friendship');
        }
    }
}

ChatUseCase.DEFAULT_PROTOCOL = 'forkbuild:chat';

// Separate protocols for content, delivery acks and read receipts.
ChatUseCase.ACK_PROTOCOL = 'forkbuild:chat-delivery-ack';

ChatUseCase.READ_PROTOCOL = 'forkbuild:chat-read';

function replayKey(conversationId, senderIdentity) {
    return `${conversationId}:${senderIdentity}`;
}
