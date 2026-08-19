import { EventBus } from '../core/events/EventBus.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { FriendshipState } from '../core/FriendshipState.js';
import { toChatMessage, isValidChatMessage, deriveConversationId, MAX_CHAT_BODY_LENGTH } from '../core/ChatMessage.js';
import { ChatReplayWindow } from '../core/ChatReplayWindow.js';
import { resolveIncomingChatMessage } from '../core/ChatMessageIngestion.js';
import { ChatDeliveryState } from '../core/ChatDeliveryState.js';
import { toChatDeliveryAck, isValidChatDeliveryAck } from '../core/ChatDeliveryAck.js';
import { toChatReadReceipt, isValidChatReadReceipt } from '../core/ChatReadReceipt.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LiveConversation } from './LiveConversation.js';
import { ChatOutbox } from './ChatOutbox.js';
import { ConversationStore } from './ConversationStore.js';
import { ConversationReadOutbox } from './ConversationReadOutbox.js';
import { RemoteReadReceiptStore } from './RemoteReadReceiptStore.js';

const MESSAGE_EVENT = 'ChatMessage';
const READ_RECEIPT_EVENT = 'ChatReadReceipt';

// A per-instance, in-memory-only StorageProvider — ChatUseCase's own
// default backend for BOTH `chatOutbox` and `conversationStore` when no
// durable one is injected, the exact same "always constructible with
// zero required args, non-durable by default" posture this file's own
// `replayWindow` default (`new ChatReplayWindow()`) already established
// one field over. Real app wiring (ui/main.js, via
// application/CreateChatOutboxUseCase.js/CreateConversationStoreUseCase.js)
// always supplies a genuinely persisted store instead — see this
// class's own constructor. One class, two independent instances (never
// shared between the two stores) — see application/ConversationStore.js's
// own header on why the outbox and the conversation history are never
// allowed to become the same store.
class EphemeralStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, data); }
    load(name) { return this._data.has(name) ? this._data.get(name) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

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
//
// 0.2.63 — Reliable Offline Messaging & Delivery State.
//
// `sendMessage()` above still means exactly what it meant in 0.2.61:
// live delivery, refused outright the instant the peer isn't a
// currently-AUTHENTICATED ConnectedPeer — not one line of it changes
// here. `sendOrQueue()` is the new, DELIBERATELY separate operation
// this milestone adds for the question 0.2.61 left open on purpose:
// "what happens to a message when the recipient isn't connected?" It
// never redefines `send`'s own meaning — see docs/Principles.md, "Send
// Means Live Delivery; SendOrQueue Means Deliberate Durability"
// (0.2.63) — a caller (ui/views/ChatView.js's own compose box) that
// wants offline messages to wait for the recipient chooses
// `sendOrQueue()` explicitly; a caller that wants 0.2.61's original,
// unqueued behavior keeps calling `sendMessage()`.
//
// A message `sendOrQueue()` cannot deliver immediately is written to
// `application/ChatOutbox.js` — a durable store keyed by the
// RECIPIENT'S PROVEN IDENTITY, never a connectionId, an endpoint, or
// anything else that could go stale the moment a connection closes.
// See docs/Principles.md, "A Durable Outbox Is Addressed To An
// Identity, Never A Connection" (0.2.63): this is what makes flushing
// the outbox on reconnect (`_attemptFlush()` below, wired into the
// SAME `connectedPeerRegistry.onChange()` subscription this class
// already used to attach() every peer to the bus) correct without any
// bespoke "is this the same connection I queued against" bookkeeping
// — the only question ever asked is "is THIS identity AUTHENTICATED
// right now," exactly the question 0.2.62's own `expectedIdentityId`
// guard already answers honestly. Concretely: if Alice queues a
// message for Bob and a later "reconnect" attempt authenticates as
// Charlie instead (0.2.62's own rejected-reconnect scenario), Bob's
// still-QUEUED entry is never touched — `_attemptFlush()` is invoked
// with Charlie's own proven identityId, which matches no outbox entry
// addressed to Bob. No new code enforces this; it falls out of keying
// by identity in the first place.
//
// Delivery is tracked as three genuinely different facts, never
// conflated — see docs/Principles.md, "Sent Is Not Delivered"
// (0.2.63): QUEUED (sitting in the outbox), SENT (handed to
// peer/PeerMessageBus.js#send() over a live connection — the bus
// ACCEPTED it for transmission, nothing more), and DELIVERED (a
// core/ChatDeliveryAck.js came back from the recipient's own,
// already-trusted `_handleIncoming()`). The receiving side acknowledges
// EVERY chat message it accepts — freshly-accepted or an exact,
// already-seen duplicate alike (`_handleIncoming()` below) — which is
// what makes a resend after a dropped connection harmless rather than
// something a sender needs its own retry/timeout logic for: Bob's
// replay window (core/ChatReplayWindow.js, 0.2.61, completely
// unmodified) already rejects the duplicate CONTENT; this milestone
// only adds that Bob's ack still goes back regardless, so Alice's
// outbox entry can reach DELIVERED even on a second, retried
// transmission of the exact same message.
//
// 0.2.69 — Reliable Offline Conversations.
//
// application/LiveConversation.js (0.2.61) answers "what does this
// device's owner see right now" and was always meant to be exactly as
// durable as this ChatUseCase instance — see that file's own header.
// 0.2.69 finally answers the question 0.2.61 deliberately deferred
// ("what persistent message history should even mean") for its
// narrowest, most defensible case: a PURELY LOCAL record of a
// conversation this device already had, kept by the new
// application/ConversationStore.js and NOTHING ELSE — no server, no
// relay, no wire protocol change, no new trust input (see that file's
// own header, "This Store Is Never An Authorization Mechanism"). Every
// place this class already appends to a LiveConversation
// (`_appendMessage`) or transitions a delivery state
// (`_publishDeliveryState`) now ALSO writes through to the durable
// store, in the same call, so the two never drift.
//
// 0.2.71 — Explicit Read Acknowledgement.
//
// `sendReadReceipt()` below is a THIRD, deliberately independent "tell
// the peer something" operation, alongside `sendMessage()`/`sendOrQueue()`
// (content) and the automatic delivery-ack machinery (transport). It
// answers a question 0.2.70's `application/ConversationReadTracker.js`
// explicitly declined to answer: not "what has THIS device seen" (a
// local, unsigned, never-transmitted note — see that class's own
// header) but "what does the OTHER participant know that I have seen."
// See docs/Principles.md, "A Read Receipt Is Computed Independently
// From The Local Read Marker, Never Transmitted From It" (0.2.71):
// `sendReadReceipt()` never reads `ConversationReadTracker` at all — it
// recomputes "the highest incoming sequence I currently hold for this
// peer" itself, straight from this class's own `_conversations`, the
// exact same computation `application/PeerPresenceUseCase.js#markRead()`
// independently performs against `application/ConversationStore.js` for
// the local marker. This is deliberate, not an oversight: a local read
// marker was never "simply transmitted" into a network fact, because no
// code path anywhere reads one to produce the other.
//
// The wire payload, `core/ChatReadReceipt.js`, travels on its own
// protocol (`READ_PROTOCOL`, `forkbuild:chat-read`) — a separate string
// from both `DEFAULT_PROTOCOL` and `ACK_PROTOCOL`, the identical
// reasoning core/ChatDeliveryAck.js's own header already gives for why
// an acknowledgement never rides the content protocol. `readThroughSequence`
// is a monotonic high-water mark, exactly like 0.2.70's own read
// marker, which is what makes it safe to send liberally: `_handleIncomingRead()`
// applies Math.max on arrival (`application/RemoteReadReceiptStore.js`),
// so an out-of-order or duplicate receipt is harmless by construction —
// no replay window is needed for this protocol at all.
//
// A read acknowledgement this device cannot deliver immediately is
// written to `application/ConversationReadOutbox.js` — a FOURTH durable
// store, deliberately NOT `application/ChatOutbox.js`: that store holds
// one entry per MESSAGE and prunes on acknowledgement; this one holds
// at most one entry per PEER and COALESCES on every new value, because
// "read through 20" already says everything "read through 17, 18, 19,
// 20" would have — see that class's own header, "A Coalescing Outbox
// Remembers The Latest Value, Not Every Event." The SAME reconnect-
// triggered flush this class already wired for the message outbox in
// 0.2.63 (`_attemptFlush()`, riding `connectedPeerRegistry.onChange()`)
// now also flushes this one, for the identical reason: "is this
// identity AUTHENTICATED right now" is the only question either flush
// ever asks, so the same security property 0.2.63 proved for queued
// messages — a "reconnect" that genuinely authenticates as the wrong
// identity can never receive mail addressed to someone else — holds
// here too, for free, because both outboxes are addressed by
// peerIdentityId and neither is ever addressed by connection.
//
// A Read Marker Is A Local Note And A Read Receipt Is A Network Fact
// Are Never The Same Object (0.2.71): `core/ConversationReadMarker.js`
// (0.2.70) stays completely unmodified by this milestone — still never
// signed, never sent, never read by this class's own ingestion
// boundary. `core/RemoteReadReceipt.js` is a NEW, separate value object
// for the opposite-direction question ("what has the PEER told me they
// have seen of MY OWN messages"), stored in a NEW, separate class
// (`application/RemoteReadReceiptStore.js`) with zero shared code — see
// that file's own header on why collapsing the two, despite their
// structurally identical shape, was considered and rejected.
//
// A Reload Continues A Conversation; It Never Starts A New One
// (0.2.69): the constructor's own `_rehydrateFromStore()` rebuilds
// every `LiveConversation` this owner has ANY stored history with —
// message content, direction, and delivery state, verbatim — before a
// single peer is even attached to the bus. `LiveConversation` itself
// stays exactly as ephemeral as 0.2.61 left it (still no toJSON/
// fromJSON of its own); it is simply SEEDED, on construction, from
// durable state one layer down. Rehydration also re-seeds
// `_nextSequence` from the highest `sequence` this device has ever sent
// to each peer — without it, a fresh instance would restart outgoing
// sequence numbers at 1 after every reload, and the recipient's own
// (unmodified) core/ChatReplayWindow.js would silently reject the
// resulting message as stale, since it already accepted a higher
// sequence from this same sender in a prior session. This is the
// concrete mechanism behind "reconnection continues the same logical
// conversation" — nothing about it required touching the wire protocol,
// core/ChatMessage.js, or core/ChatReplayWindow.js at all.
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
        this._ackProtocol = ackProtocol;
        this._readProtocol = readProtocol;
        this._replayWindow = replayWindow;
        // 0.2.63 — see this class's own header, and
        // application/ChatOutbox.js's, for why an injected, durable
        // outbox is what ui/main.js always supplies, while this
        // in-memory default only ever backs a caller (a test, an
        // ad-hoc composition) that never asked for one.
        this._outbox = chatOutbox || new ChatOutbox(new EphemeralStorageProvider(), identityProvider);
        // 0.2.69 — same posture, for the durable conversation-history
        // store — see this class's own header and
        // application/ConversationStore.js's own, and note this is a
        // COMPLETELY SEPARATE default instance from `_outbox` above,
        // never the same storage.
        this._conversationStore = conversationStore || new ConversationStore(new EphemeralStorageProvider(), identityProvider);
        // 0.2.71 — same posture, for the two new read-acknowledgement
        // stores — see this class's own header, and
        // application/ConversationReadOutbox.js's/
        // application/RemoteReadReceiptStore.js's own. Two SEPARATE
        // default instances from `_outbox`/`_conversationStore` above and
        // from each other, never shared storage.
        this._readOutbox = conversationReadOutbox || new ConversationReadOutbox(new EphemeralStorageProvider(), identityProvider);
        this._remoteReadReceipts = remoteReadReceiptStore || new RemoteReadReceiptStore(new EphemeralStorageProvider(), identityProvider);
        this._conversations = new Map(); // peerIdentityId -> LiveConversation
        this._nextSequence = new Map(); // peerIdentityId -> last sequence THIS device used
        this._eventBus = new EventBus();
        // 0.2.69 — rebuild every LiveConversation this owner already had,
        // from durable state, BEFORE a single peer is attached to the bus
        // below — see this class's own header, "A Reload Continues A
        // Conversation; It Never Starts A New One."
        this._rehydrateFromStore();

        // Same "attach every already-connected peer, then every future
        // one" discipline application/FriendRelationshipUseCase.js's own
        // constructor already established — see its header. 0.2.63
        // rides the exact same subscription to also flush any QUEUED
        // outbox mail addressed to a peer identity that is AUTHENTICATED
        // right now — see `_attemptFlush()` below, and this class's own
        // header on why "reconnect" needs no separate wiring of its own.
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

    // The live, in-memory transcript with one peer — [] if this device
    // has exchanged no messages with them yet this session. Never
    // throws for an unknown peerIdentityId; there is simply nothing
    // there yet.
    getConversation(peerIdentityId) {
        const conversation = this._conversations.get(peerIdentityId);
        return conversation ? conversation.messages : [];
    }

    // Every conversation with at least one message — this session OR a
    // prior one, rehydrated from application/ConversationStore.js at
    // construction (see `_rehydrateFromStore()`) — ordered by
    // peerIdentityId for a stable render order, mirroring every other
    // use case's own getX() list convention.
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

    // 0.2.63 — Alice's OTHER "Send" gesture: deliberately durable,
    // addressed to `peerIdentityId` rather than to a specific
    // `ConnectedPeer` — there may not BE one right now, and that's the
    // entire point. Eligibility (not blocked, currently FRIEND) is
    // checked exactly like `sendMessage()` does, and exactly as
    // strictly — an offline friend can be queued for, a blocked
    // identity or a stranger still cannot. What differs is
    // reachability: rather than throwing when no AUTHENTICATED
    // connection exists, this writes a QUEUED core/ChatOutboxEntry.js
    // to application/ChatOutbox.js and returns immediately; a
    // connection that already exists gets an immediate flush attempt
    // (`_attemptFlush()`) in the SAME call, so the common case — the
    // peer IS online — still ends up SENT before this method returns,
    // exactly as promptly as `sendMessage()` always was.
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

    // The current outbox snapshot for one peer identity — QUEUED/SENT
    // entries only (a DELIVERED one is removed from
    // application/ChatOutbox.js the instant it's acknowledged — see
    // that class's own header), oldest first. A UI reads this to show
    // "queued, will send once X is back online" without needing to
    // understand core/ChatOutboxEntry.js's own shape.
    getOutbox(peerIdentityId) {
        return this._outbox.list(peerIdentityId).sort((a, b) => a.message.sequence - b.message.sequence);
    }

    // A caller-driven retry, in addition to the automatic
    // reconnect-triggered one this class's own constructor already
    // wires — see `_attemptFlush()`. Harmless to call at any time, for
    // any identity: it is a no-op unless that identity is both eligible
    // and AUTHENTICATED right now.
    flushOutbox(peerIdentityId) {
        this._attemptFlush(peerIdentityId);
    }

    // 0.2.71 — Alice's "I looked, and I'm telling Bob" gesture. Computes
    // "the highest incoming sequence I currently hold for this peer"
    // straight from this instance's OWN `_conversations`, deliberately
    // WITHOUT ever consulting `application/ConversationReadTracker.js` —
    // see this class's own header on why that independence is the whole
    // point. Never throws: an ineligible peer (blocked, not a friend
    // anymore) or a peer with nothing incoming yet is simply a no-op,
    // the same "harmless to call repeatedly" posture
    // `application/PeerPresenceUseCase.js#markRead()` already
    // established for the local marker one layer over — this is meant
    // to be called from the same UI moment (opening/refreshing a
    // conversation), every time, without a caller needing its own
    // eligibility or "anything to say" check first.
    //
    // The computed value is written to `application/ConversationReadOutbox.js`
    // (coalescing — see that class's own header) and an immediate flush
    // is attempted, so the common case — the peer IS online — reaches
    // them promptly; if not, `_attemptFlush()`'s existing
    // reconnect-triggered wiring (0.2.63) delivers it once they're back,
    // coalesced with anything newer by the time that happens.
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

    // 0.2.71 — "has the PEER told me they've seen my messages, and
    // through which sequence?" 0, never null/undefined, for a peer this
    // device has no receipt from at all — reads straight through to
    // `application/RemoteReadReceiptStore.js#getReadThroughSequence()`,
    // never cached, so a UI (see ui/views/ChatView.js) can render a
    // "Seen" mark under its own outgoing messages without holding a
    // second copy of this fact.
    getPeerReadThroughSequence(peerIdentityId) {
        return this._remoteReadReceipts.getReadThroughSequence(peerIdentityId);
    }

    // Returns an unsubscribe function. Fires `(peerIdentityId, message)`
    // for every message this device sends OR accepts, AND every time an
    // already-appended message's `deliveryState` transitions (0.2.63) —
    // `message` always carries its own `direction` and (for a
    // `sendOrQueue()` message) `deliveryState` — a UI subscribes once
    // and re-renders whichever conversation is currently open.
    onMessage(callback) {
        const subscription = this._eventBus.subscribe(MESSAGE_EVENT, ({ peerIdentityId, message }) => callback(peerIdentityId, message));
        return () => subscription.unsubscribe();
    }

    // 0.2.71 — returns an unsubscribe function. Fires
    // `(peerIdentityId, readThroughSequence)` every time a NEW,
    // genuinely-newer read receipt is accepted from a peer — never on a
    // stale/duplicate/lower one, since `application/RemoteReadReceiptStore.js`
    // is a monotonic high-water mark and simply has nothing new to
    // report for those. A UI subscribes once to render "Seen" against
    // its own outgoing messages, the same pattern `onMessage()` above
    // already established for content.
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
        // Deliberately does NOT dispose the injected peerMessageBus,
        // connectedPeerRegistry, friendRelationshipUseCase, chatOutbox,
        // conversationStore, conversationReadOutbox, or
        // remoteReadReceiptStore — all shared collaborators that outlive
        // this one protocol's use case, exactly like
        // application/FriendRelationshipUseCase.js's own dispose().
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
    //
    // 0.2.63 — once every trust gate above has passed, this device owes
    // the sender a core/ChatDeliveryAck.js — see `_sendAck()` below —
    // whether the message is being accepted for the first time OR is an
    // exact, already-seen duplicate (a retransmit after the sender's
    // own connection dropped mid-delivery, say). Only a message that
    // never clears the trust gates in the first place (forged sender,
    // blocked, not-yet-friend, wrong conversationId) gets no ack at
    // all — see this class's own header, "Sent Is Not Delivered."
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
            this._sendAck(meta.connectedPeer, payload, myIdentityId);
            return;
        }
        const decision = resolveIncomingChatMessage(this._replayWindow.highestSequence(key), payload);
        if (!decision.accepted) {
            return;
        }
        this._replayWindow.recordAccepted(key, payload.messageId, payload.sequence);
        this._appendMessage(remoteIdentity.identityId, payload.conversationId, payload, 'incoming');
        this._sendAck(meta.connectedPeer, payload, myIdentityId);
    }

    // 0.2.63 — the receiving half of core/ChatDeliveryAck.js. A far
    // smaller trust boundary than `_handleIncoming()`'s own, on
    // purpose: an ack carries no content, only a confirmation about a
    // message THIS device chose to send, so the only things worth
    // checking are the same "claimed identity matches the proven
    // connection" and "conversationId is the one I'd derive myself"
    // rules `_handleIncoming()` already applies to content — see
    // core/ChatDeliveryAck.js's own header. An ack that doesn't match
    // any SENT entry (unknown messageId, already acknowledged, or from
    // an identity this outbox never addressed anything to) is silently
    // ignored — see application/ChatOutbox.js#acknowledge()'s own
    // header on why that's the correct, idempotent behavior for a
    // duplicate or stale ack, never an error.
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
        const entry = this._outbox.acknowledge(remoteIdentity.identityId, payload.messageId);
        if (!entry) {
            return;
        }
        this._publishDeliveryState(remoteIdentity.identityId, payload.messageId, ChatDeliveryState.DELIVERED);
    }

    // 0.2.71 — the receiving half of core/ChatReadReceipt.js. Applies
    // the SAME trust gates `_handleIncoming()`/`_handleIncomingAck()`
    // already established: the claimed `readerIdentity` must match the
    // connection's own already-proven remoteIdentity, the sender must
    // not be blocked, the sender must currently be a FRIEND, and
    // `conversationId` must be the one this device independently
    // re-derives — never whatever the payload claims. No replay window
    // is applied or needed: `application/RemoteReadReceiptStore.js#recordReadThrough()`
    // is itself a monotonic high-water mark, so a stale, duplicate, or
    // out-of-order receipt is silently absorbed as a no-op rather than
    // needing to be detected and rejected as a replay — see
    // core/ChatReadReceipt.js's own header.
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
        const before = this._remoteReadReceipts.getReadThroughSequence(remoteIdentity.identityId);
        const updated = this._remoteReadReceipts.recordReadThrough(remoteIdentity.identityId, payload.readThroughSequence);
        if (updated.readThroughSequence > before) {
            this._eventBus.publish(READ_RECEIPT_EVENT, { peerIdentityId: remoteIdentity.identityId, readThroughSequence: updated.readThroughSequence });
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

    // 0.2.63 — the reconnect-triggered delivery trigger this class's
    // own header describes: prune whatever just expired for this ONE
    // peer identity (publishing EXPIRED for each — see this class's own
    // header on why expiry is a fact about THIS device giving up,
    // checked lazily rather than on a timer), then — only if this
    // identity is still eligible (friendship/blocking are re-checked
    // fresh here exactly like `sendMessage()`/`_handleIncoming()`
    // already do everywhere else in this class) AND AUTHENTICATED right
    // now — hand every remaining QUEUED entry to the wire, in this
    // device's own sequence order. Safe to call liberally and
    // repeatedly (the constructor does, on every registry change,
    // regardless of which peer actually changed): an entry that is
    // already SENT or DELIVERED is simply not QUEUED anymore, so a
    // redundant call finds nothing left to do.
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
        // 0.2.71 — the SAME reconnect-triggered moment now also flushes
        // any coalesced, still-PENDING read acknowledgement for this
        // peer — see this class's own header on why one flush trigger
        // correctly serves both outboxes.
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

    _flushIfAuthenticated(connectedPeer) {
        if (connectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED && connectedPeer.remoteIdentity) {
            this._attemptFlush(connectedPeer.remoteIdentity.identityId);
        }
    }

    // The live, AUTHENTICATED ConnectedPeer for one identity, or null —
    // the same lookup ui/views/ChatView.js's own `connectedPeer`
    // computed already performs, reused here so "is this identity
    // reachable right now" is answered identically everywhere in this
    // codebase.
    _findAuthenticatedPeer(identityId) {
        return this._registry.list().find((peer) => peer.remoteIdentity
            && peer.remoteIdentity.identityId === identityId
            && peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED) || null;
    }

    // 0.2.69 — rebuilds every LiveConversation this owner has ANY
    // durable history with, from application/ConversationStore.js,
    // before this instance does anything else — see this class's own
    // header, "A Reload Continues A Conversation; It Never Starts A New
    // One." Also re-seeds `_nextSequence` from the highest `sequence`
    // this device has ever SENT to each peer (OUTGOING entries only —
    // an incoming message's sequence belongs to the SENDER's own
    // namespace, never this device's), so the very next
    // sendMessage()/sendOrQueue() after a reload continues this
    // device's own monotonic count rather than restarting it at 1.
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
        // 0.2.69 — the durable write-through sibling of the in-memory
        // update above; see application/ConversationStore.js's own
        // header on why this can never fail to find what LiveConversation
        // just found (the two are always appended to together, in
        // `_appendMessage` below).
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
        // 0.2.69 — the durable write-through sibling of the in-memory
        // append above, in the exact same call — see this class's own
        // header, "0.2.69 — Reliable Offline Conversations."
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

// 0.2.63 — a SEPARATE protocol string from DEFAULT_PROTOCOL, on
// purpose — see core/ChatDeliveryAck.js's own header, "Sent Is Not
// Delivered."
ChatUseCase.ACK_PROTOCOL = 'forkbuild:chat-delivery-ack';

// 0.2.71 — a THIRD, equally separate protocol string — see
// core/ChatReadReceipt.js's own header on why a read acknowledgement
// never rides DEFAULT_PROTOCOL or ACK_PROTOCOL either.
ChatUseCase.READ_PROTOCOL = 'forkbuild:chat-read';

function replayKey(conversationId, senderIdentity) {
    return `${conversationId}:${senderIdentity}`;
}
