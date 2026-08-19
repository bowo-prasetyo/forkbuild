import { EventBus } from '../core/events/EventBus.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { FriendshipState } from '../core/FriendshipState.js';
import { toChatMessage, isValidChatMessage, deriveConversationId, MAX_CHAT_BODY_LENGTH } from '../core/ChatMessage.js';
import { ChatReplayWindow } from '../core/ChatReplayWindow.js';
import { resolveIncomingChatMessage } from '../core/ChatMessageIngestion.js';
import { LiveConversation } from './LiveConversation.js';

const MESSAGE_EVENT = 'ChatMessage';

// 0.2.61 — Direct Peer Messaging & Live Chat.
//
// "Chat is a protocol running over authenticated peers, not a feature
// embedded into the peer transport." This class is that ONE new
// protocol, `forkbuild:chat`, built the exact same way
// application/FriendRelationshipUseCase.js (0.2.57) was: its own
// namespaced channel on the shared peer/PeerMessageBus.js, its own
// wire vocabulary (core/ChatMessage.js), its own ingestion boundary —
// never folded into presence/profile/interaction, and never given any
// special knowledge inside peer/PeerMessageBus.js itself.
//
// Friendship is an AUTHORIZATION INPUT here, never the protocol. This
// class never mutates a FriendshipRecord and never sends a friendship
// advertisement — it only ever ASKS `friendRelationshipUseCase.getState()`,
// fresh, on every single send and every single incoming message, the
// same "consult a predicate, never cache it" discipline 0.2.58's
// isFriend/0.2.60's isBlocked already established one layer down. See
// docs/Principles.md, "Friendship Authorizes A Protocol; It Is Never
// The Protocol" (0.2.61):
//
//   Authenticated peer + not blocked + FriendshipState.FRIEND -> chat allowed.
//   Anything else (anonymous, unauthenticated, not friends, blocked,
//   disconnected) -> chat refused, checked fresh on every message, in
//   BOTH directions independently — see _requireEligible()/_handleIncoming()
//   below. A connection staying AUTHENTICATED after Alice unfriends or
//   blocks Bob does NOT keep chat working; this class never asks the
//   transport to close the connection over it either — see 0.2.60's own
//   "friendship/blocking and the peer connection are independent axes"
//   precedent (core/PeerBlockRecord.js's own header), extended here to
//   chat specifically.
//
// 0.2.61 Ships Live Chat, Not A Message Database (docs/Principles.md):
// no persistence, no store-and-forward, no relay, no server. A message
// sent to a peer that is not, right now, an AUTHENTICATED ConnectedPeer
// simply fails to send — peer/PeerMessageBus.js#send() itself throws —
// there is no queue anywhere in this class for it to wait in. See
// application/LiveConversation.js's own header for why the in-memory
// transcript this class keeps is deliberately never named "history."
export class ChatUseCase {
    constructor(identityProvider, {
        peerMessageBus,
        connectedPeerRegistry,
        friendRelationshipUseCase,
        peerBlockUseCase = null,
        protocol = ChatUseCase.DEFAULT_PROTOCOL,
        replayWindow = new ChatReplayWindow()
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
        this._replayWindow = replayWindow;
        this._conversations = new Map(); // peerIdentityId -> LiveConversation
        this._nextSequence = new Map(); // peerIdentityId -> last sequence THIS device used
        this._eventBus = new EventBus();

        // Same "attach every already-connected peer, then every future
        // one" discipline application/FriendRelationshipUseCase.js's own
        // constructor already established — see its header.
        for (const peer of this._registry.list()) {
            this._bus.attach(peer);
        }
        this._unsubscribeRegistry = this._registry.onChange((peers) => {
            for (const peer of peers) {
                this._bus.attach(peer);
            }
        });
        this._unsubscribeBus = this._bus.subscribe(this._protocol, (payload, meta) => this._handleIncoming(payload, meta));
    }

    // The live, in-memory transcript with one peer — [] if this device
    // has exchanged no messages with them yet this session. Never
    // throws for an unknown peerIdentityId; there is simply nothing
    // there yet.
    getConversation(peerIdentityId) {
        const conversation = this._conversations.get(peerIdentityId);
        return conversation ? conversation.messages : [];
    }

    // Every conversation with at least one message this session,
    // ordered by peerIdentityId for a stable render order — mirrors
    // every other use case's own getX() list convention.
    getConversations() {
        return Array.from(this._conversations.values()).sort((a, b) => a.peerIdentityId.localeCompare(b.peerIdentityId));
    }

    // "Can Alice send/receive chat with this identity RIGHT NOW,
    // independent of whether they're currently connected?" — the same
    // predicate _requireEligible()/_handleIncoming() themselves consult,
    // exposed so a UI can grey out a compose box without an
    // attempt-and-catch. Deliberately does NOT check connection state —
    // "eligible to chat" and "reachable right now" are different
    // questions; sendMessage() itself is where reachability is enforced.
    canChat(identityId) {
        return Boolean(identityId) && !this._isBlocked(identityId) && this._friends.getState(identityId) === FriendshipState.FRIEND;
    }

    // Alice's "Send" gesture. `connectedPeer` MUST be a real, currently
    // AUTHENTICATED application/ConnectedPeer.js — refused rather than
    // queued if it is not, exactly like
    // application/FriendRelationshipUseCase.js#sendFriendRequest's own
    // header explains. Refused just as firmly against a blocked or
    // non-friend identity, checked fresh here every call — see this
    // class's own header.
    sendMessage(connectedPeer, body) {
        const peerIdentity = this._requireAuthenticatedPeer(connectedPeer);
        this._requireEligible(peerIdentity.identityId);
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
        this._appendMessage(peerIdentity.identityId, conversationId, message, 'outgoing');
        return message;
    }

    // Returns an unsubscribe function. Fires `(peerIdentityId, message)`
    // for every message this device sends OR accepts, `message` already
    // carrying its own `direction` — a UI subscribes once and re-renders
    // whichever conversation is currently open.
    onMessage(callback) {
        const subscription = this._eventBus.subscribe(MESSAGE_EVENT, ({ peerIdentityId, message }) => callback(peerIdentityId, message));
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
        // Deliberately does NOT dispose the injected peerMessageBus,
        // connectedPeerRegistry, or friendRelationshipUseCase — all
        // shared collaborators that outlive this one protocol's use
        // case, exactly like application/FriendRelationshipUseCase.js's
        // own dispose().
    }

    // The ingestion boundary — see this class's own header for the
    // full ordered list. Nothing arriving over the wire is trusted,
    // let alone displayed, until every one of these holds, IN ORDER:
    //   1. well-formed shape (core/ChatMessage.js)
    //   2. the claimed senderIdentity really is who this specific,
    //      already-AUTHENTICATED connection proved during the 0.2.49
    //      handshake — never merely whatever the payload itself claims
    //      (defeats a forged-sender attack: Charlie's authenticated
    //      connection cannot claim to be Alice)
    //   3. the actor is not locally BLOCKED
    //   4. the actor is a FRIEND, right now — not merely once
    //   5. the conversationId is the one THIS device independently
    //      derives for (me, sender) — never whatever the payload says
    //      (defeats a message crafted for a different conversation)
    //   6. replay/sequence check (core/ChatReplayWindow.js +
    //      core/ChatMessageIngestion.js)
    // Only then is it appended to this peer's LiveConversation.
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
        if (this._isBlocked(remoteIdentity.identityId)) {
            return;
        }
        if (this._friends.getState(remoteIdentity.identityId) !== FriendshipState.FRIEND) {
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
            return;
        }
        const decision = resolveIncomingChatMessage(this._replayWindow.highestSequence(key), payload);
        if (!decision.accepted) {
            return;
        }
        this._replayWindow.recordAccepted(key, payload.messageId, payload.sequence);
        this._appendMessage(remoteIdentity.identityId, payload.conversationId, payload, 'incoming');
    }

    _appendMessage(peerIdentityId, conversationId, message, direction) {
        let conversation = this._conversations.get(peerIdentityId);
        if (!conversation) {
            conversation = new LiveConversation({ conversationId, peerIdentityId });
            this._conversations.set(peerIdentityId, conversation);
        }
        conversation.append(message, direction);
        this._eventBus.publish(MESSAGE_EVENT, { peerIdentityId, message: { ...message, direction } });
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

    // The exact same "authenticated + not blocked + FRIEND" gate the
    // receiver side (_handleIncoming) applies, applied here to the
    // SENDER side — see this class's own header. Throws with a
    // specific, distinguishable reason (unlike the receiver side, which
    // deliberately drops silently — there is no one on the sending
    // device's own UI who benefits from an indistinguishable failure).
    _requireEligible(identityId) {
        if (this._isBlocked(identityId)) {
            throw new Error('ChatUseCase: this identity is blocked');
        }
        if (this._friends.getState(identityId) !== FriendshipState.FRIEND) {
            throw new Error('ChatUseCase: chat requires a mutual friendship');
        }
    }
}

// Deliberately the same protocol-name convention every PeerMessageBus
// consumer uses — see application/FriendRelationshipUseCase.js's own
// DEFAULT_PROTOCOL.
ChatUseCase.DEFAULT_PROTOCOL = 'forkbuild:chat';

function replayKey(conversationId, senderIdentity) {
    return `${conversationId}:${senderIdentity}`;
}
