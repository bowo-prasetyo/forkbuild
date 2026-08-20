import { EventBus } from '../core/events/EventBus.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import {
    ConversationSyncKind,
    SYNC_MESSAGES_BATCH_SIZE,
    toConversationSyncMessagesEnvelope,
    toConversationSyncReadStateEnvelope,
    isValidConversationSyncMessagesEnvelope,
    isValidConversationSyncReadStateEnvelope
} from '../core/ConversationSyncEnvelope.js';

const SYNCED_MESSAGE_EVENT = 'DeviceConversationSyncedMessage';
const SIBLING_READ_STATE_EVENT = 'SiblingReadStateChanged';

// 0.2.83 — Multi-Device Conversation & Read-State Synchronization.
//
// The milestone 0.2.78 named and 0.2.82 deliberately left standing:
// "message/conversation synchronization BETWEEN Alice's own several
// devices... each still has its own independent, local view." Alice's
// Phone and Alice's Laptop are two genuinely separate application/
// ChatUseCase.js instances, each with its own local
// application/ConversationStore.js/application/ConversationReadTracker.js —
// no shared storage, no shared process, no primary device. This class is
// the ONE new protocol (`forkbuild:device-conversation-sync`) that closes
// the gap between them, running strictly ALONGSIDE
// application/ChatUseCase.js's own `forkbuild:chat` protocol, never
// folded into it — see docs/Principles.md, "Conversation Synchronization
// Is A Protocol Between A Device And Itself, Never A Wider Chat Feature"
// (0.2.83): Bob's own ChatUseCase never subscribes to this protocol at
// all, and nothing here ever produces a core/ChatDeliveryAck.js or
// core/ChatReadReceipt.js — those remain exactly what 0.2.63/0.2.71 built
// them to be, a conversation between this device and the PEER, never
// between this device and one of its own siblings.
//
// No primary, no master, no cloud mailbox — every device is an
// independent durable replica, and this protocol only ever pushes ITS
// OWN already-stored state at a sibling, never pulls or asks. Two
// devices that have been apart for a while and reconnect converge
// through ordinary, repeated, idempotent pushes — see this class's own
// `_syncIfEligible()` (full-state push on every new eligible connection)
// and `_handleChatMessage()` (a live, single-message push the instant
// this device's own application/ChatUseCase.js accepts or sends
// anything new, for a sibling that is ALREADY connected). Applying the
// same batch any number of times converges to the same state —
// `Sync(S, S) = S` — entirely because application/ChatUseCase.js#ingestSyncedEntry()
// and application/SiblingReadStateStore.js#recordObserved() are each
// already idempotent/monotonic on their own; this class adds no merge
// logic of its own beyond calling them.
//
// The security boundary this whole protocol rests on is a single,
// symmetric comparison, re-derived fresh on EVERY connection and EVERY
// incoming envelope — never cached, never decided once and remembered:
//
//   application/DeviceAuthorizationPropagationUseCase.js
//     #resolveConnectionIdentity(peer).identityId
//       ===
//   application/DeviceAuthorizationPropagationUseCase.js
//     #resolveOwnSocialIdentity().identityId
//
// "Is the identity this device independently resolves the OTHER party
// to be the SAME identity this device independently resolves ITSELF to
// be?" See docs/Principles.md, "Sibling Eligibility Is A Symmetric
// Identity Comparison, Never A Device Allowlist" (0.2.83). Because both
// sides of that comparison are freshly re-derived from
// application/DeviceAuthorizationPropagationUseCase.js's own
// core/DeviceAuthority.js records — which a later revocation updates the
// instant it is learned, through the completely unmodified 0.2.78/0.2.82
// gossip path — revocation isolation falls out for free: no code here
// ever asks "has this device been revoked," because ineligibility IS
// what a revoked device's own resolution now produces. A device this
// class refused to sync with keeps authenticating exactly as it always
// did (0.2.78's own SECURITY FLAGSHIP B, unchanged) — only its ability to
// exchange conversation state, decided fresh on every attempt, is gone.
//
// Deliberately a full-state push rather than an incremental delta sync:
// every eligible reconnect resends every stored entry for every
// conversation this device holds (batched under
// core/ConversationSyncEnvelope.js's own SYNC_MESSAGES_BATCH_SIZE, never
// one unbounded envelope), the same "resend everything, let idempotency
// absorb the redundancy" posture 0.2.41's own periodic profile
// republish already chose over computing a precise diff. A real
// vector-clock/delta protocol is a genuinely harder, separate
// optimization, deliberately left for whenever conversation volume
// actually makes full-state resync too expensive — see docs/Roadmap.md,
// 0.2.83, "Deliberately not in 0.2.83."
//
// Presence and voice ringing are deliberately untouched — see
// docs/Roadmap.md, 0.2.83: this milestone answers "which messages has
// each device seen," never "is Alice online" or "should every device
// ring."
export class DeviceConversationSyncUseCase {
    constructor({
        peerMessageBus,
        connectedPeerRegistry,
        deviceAuthorization,
        chatUseCase,
        conversationReadTracker,
        siblingReadStateStore,
        protocol = DeviceConversationSyncUseCase.DEFAULT_PROTOCOL
    } = {}) {
        if (!peerMessageBus || typeof peerMessageBus.send !== 'function' || typeof peerMessageBus.subscribe !== 'function' || typeof peerMessageBus.attach !== 'function') {
            throw new Error('DeviceConversationSyncUseCase: a PeerMessageBus is required');
        }
        if (!connectedPeerRegistry || typeof connectedPeerRegistry.list !== 'function' || typeof connectedPeerRegistry.onChange !== 'function') {
            throw new Error('DeviceConversationSyncUseCase: a ConnectedPeerRegistry is required');
        }
        if (!deviceAuthorization || typeof deviceAuthorization.resolveConnectionIdentity !== 'function' || typeof deviceAuthorization.resolveOwnSocialIdentity !== 'function') {
            throw new Error('DeviceConversationSyncUseCase: a DeviceAuthorizationPropagationUseCase is required');
        }
        if (!chatUseCase || typeof chatUseCase.ingestSyncedEntry !== 'function' || typeof chatUseCase.getStoredEntries !== 'function' || typeof chatUseCase.onMessage !== 'function') {
            throw new Error('DeviceConversationSyncUseCase: a ChatUseCase is required');
        }
        if (!conversationReadTracker || typeof conversationReadTracker.getLastReadSequence !== 'function') {
            throw new Error('DeviceConversationSyncUseCase: a ConversationReadTracker is required');
        }
        if (!siblingReadStateStore || typeof siblingReadStateStore.recordObserved !== 'function' || typeof siblingReadStateStore.getObservedSequence !== 'function') {
            throw new Error('DeviceConversationSyncUseCase: a SiblingReadStateStore is required');
        }
        this._bus = peerMessageBus;
        this._registry = connectedPeerRegistry;
        this._deviceAuth = deviceAuthorization;
        this._chat = chatUseCase;
        this._readTracker = conversationReadTracker;
        this._siblingReadState = siblingReadStateStore;
        this._protocol = protocol;
        this._eventBus = new EventBus();

        for (const peer of this._registry.list()) {
            this._bus.attach(peer);
            this._syncIfEligible(peer);
        }
        this._unsubscribeRegistry = this._registry.onChange((peers) => {
            for (const peer of peers) {
                this._bus.attach(peer);
                this._syncIfEligible(peer);
            }
        });
        this._unsubscribeBus = this._bus.subscribe(this._protocol, (payload, meta) => this._handleIncoming(payload, meta));
        this._unsubscribeChat = this._chat.onMessage((peerIdentityId, message) => this._handleChatMessage(peerIdentityId, message));
    }

    // "Would this device sync conversation state with `connectedPeer`
    // right now?" — exposed so a UI (a future "My Devices" view) can show
    // it without duplicating the comparison. Re-derived fresh every call —
    // see this class's own header.
    isEligibleSibling(connectedPeer) {
        return this._isEligibleSibling(connectedPeer);
    }

    // Every currently-AUTHENTICATED, currently-eligible sibling
    // connection this device has right now.
    getEligibleSiblings() {
        return this._registry.list().filter((peer) => this._isEligibleSibling(peer));
    }

    // 0.2.83 — Alice's "I looked" gesture, propagated to her OTHER
    // devices. Deliberately a SEPARATE, explicit call from
    // application/ConversationReadTracker.js#markRead() itself — this
    // class never subscribes to that store's writes (it has no change
    // event to subscribe to, and giving it one would blur the "this store
    // never reaches beyond itself" boundary that class's own header
    // already draws) — a caller that just marked something read pushes
    // that fact onward explicitly, the identical "compute now, send now"
    // shape application/ChatUseCase.js#sendReadReceipt() already
    // established one protocol over. Harmless to call for a peer with no
    // eligible sibling connected right now — the current value is still
    // included in the next full sync any sibling that reconnects
    // receives (see `_syncIfEligible()`).
    pushReadState(peerIdentityId) {
        const lastReadSequence = this._readTracker.getLastReadSequence(peerIdentityId);
        const envelope = toConversationSyncReadStateEnvelope({ peerIdentityId, lastReadSequence });
        for (const peer of this.getEligibleSiblings()) {
            this._bus.send(peer, this._protocol, envelope);
        }
        return lastReadSequence;
    }

    // 0.2.83 — "what does Alice's IDENTITY consider read?" Deliberately
    // NOT stored as its own authoritative fact — see
    // application/SiblingReadStateStore.js's own header: a purely derived
    // maximum of this device's OWN local read marker
    // (application/ConversationReadTracker.js, per-device, untouched by
    // this milestone) and the highest position any sibling has reported
    // about itself (application/SiblingReadStateStore.js). Recomputed
    // fresh on every call from two independently-read values, never
    // cached — the identical "derived, never a fourth store" discipline
    // application/PeerPresenceUseCase.js's own header already established
    // for presence.
    getIdentityObservedReadSequence(peerIdentityId) {
        return Math.max(
            this._readTracker.getLastReadSequence(peerIdentityId),
            this._siblingReadState.getObservedSequence(peerIdentityId)
        );
    }

    // "What is MY OWN local read position, on THIS device, for this
    // peer?" — a thin, explicitly-named pass-through to
    // application/ConversationReadTracker.js, exposed here so a caller
    // that already holds a DeviceConversationSyncUseCase reference never
    // needs a second collaborator just to tell the two apart in a UI —
    // see this class's own header, "per-device local read state and
    // identity-observed read state are never the same fact."
    getMyLocalReadSequence(peerIdentityId) {
        return this._readTracker.getLastReadSequence(peerIdentityId);
    }

    // Returns an unsubscribe function. Fires `(peerIdentityId, message)`
    // for every message this device's own application/ChatUseCase.js
    // just newly learned about via a sibling's sync push (never for a
    // duplicate it already held) — a UI subscribes once, alongside
    // application/ChatUseCase.js#onMessage(), to know a re-render
    // originated from a sibling catching this device up rather than a
    // live wire message.
    onSyncedMessage(callback) {
        const subscription = this._eventBus.subscribe(SYNCED_MESSAGE_EVENT, ({ peerIdentityId, message }) => callback(peerIdentityId, message));
        return () => subscription.unsubscribe();
    }

    // Returns an unsubscribe function. Fires `(peerIdentityId, observedSequence)`
    // every time a sibling's reported read position genuinely advances
    // what application/SiblingReadStateStore.js already held.
    onSiblingReadStateChanged(callback) {
        const subscription = this._eventBus.subscribe(SIBLING_READ_STATE_EVENT, ({ peerIdentityId, observedSequence }) => callback(peerIdentityId, observedSequence));
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
        if (this._unsubscribeChat) {
            this._unsubscribeChat();
            this._unsubscribeChat = null;
        }
        // Deliberately does NOT dispose the injected peerMessageBus,
        // connectedPeerRegistry, deviceAuthorization, chatUseCase,
        // conversationReadTracker, or siblingReadStateStore — all shared,
        // app-wide collaborators this class never owns.
    }

    // The one security-relevant predicate this whole protocol rests on —
    // see this class's own header. Re-derived fresh every call from
    // application/DeviceAuthorizationPropagationUseCase.js's own
    // already-verified local state; never cached anywhere in this class.
    _isEligibleSibling(connectedPeer) {
        if (!connectedPeer || typeof connectedPeer.getLifecycleState !== 'function') {
            return false;
        }
        if (connectedPeer.getLifecycleState() !== PeerLifecycleState.AUTHENTICATED || !connectedPeer.remoteIdentity) {
            return false;
        }
        const remote = this._deviceAuth.resolveConnectionIdentity(connectedPeer);
        const own = this._deviceAuth.resolveOwnSocialIdentity();
        return Boolean(remote) && Boolean(own) && remote.identityId === own.identityId;
    }

    // A newly (or already) AUTHENTICATED connection that resolves as a
    // sibling gets this device's own COMPLETE stored state pushed at it —
    // see this class's own header, "no primary, no pull, only pushes of
    // already-stored state." A no-op for a connection that is not
    // eligible, or not AUTHENTICATED yet — harmless to call repeatedly,
    // the same posture application/ChatUseCase.js#_flushIfAuthenticated()
    // already established for its own reconnect trigger.
    _syncIfEligible(connectedPeer) {
        if (!this._isEligibleSibling(connectedPeer)) {
            return;
        }
        for (const peerIdentityId of this._chat.getStoredConversationPeerIds()) {
            const entries = this._chat.getStoredEntries(peerIdentityId);
            if (entries.length === 0) {
                continue;
            }
            for (const batch of chunk(entries, SYNC_MESSAGES_BATCH_SIZE)) {
                const envelope = toConversationSyncMessagesEnvelope({
                    peerIdentityId,
                    entries: batch.map((entry) => ({ message: entry.message, direction: entry.direction, deliveryState: entry.deliveryState }))
                });
                this._bus.send(connectedPeer, this._protocol, envelope);
            }
            const lastReadSequence = this._readTracker.getLastReadSequence(peerIdentityId);
            if (lastReadSequence > 0) {
                this._bus.send(connectedPeer, this._protocol, toConversationSyncReadStateEnvelope({ peerIdentityId, lastReadSequence }));
            }
        }
    }

    // application/ChatUseCase.js#onMessage()'s own event already fires
    // for a message THIS device just sent or accepted, live or synced
    // alike — this is the "keep an already-connected sibling caught up
    // without waiting for its next reconnect" half of this protocol,
    // complementing `_syncIfEligible()`'s own connect-time full push. A
    // message this device just learned about FROM a sibling's own sync
    // push is pushed right back out to every OTHER eligible sibling too
    // (never only the one it came from) — harmless, not an infinite loop:
    // application/ChatUseCase.js#ingestSyncedEntry() only republishes
    // MESSAGE_EVENT for a message that was genuinely NEW to this device,
    // so a sibling that already held it sees the redelivery reach
    // application/ConversationStore.js#append()'s own dedup and stop
    // there, firing no further event.
    _handleChatMessage(peerIdentityId, message) {
        const siblings = this.getEligibleSiblings();
        if (siblings.length === 0) {
            return;
        }
        const envelope = toConversationSyncMessagesEnvelope({
            peerIdentityId,
            entries: [{ message: toWireChatMessage(message), direction: message.direction, deliveryState: message.deliveryState }]
        });
        for (const peer of siblings) {
            this._bus.send(peer, this._protocol, envelope);
        }
    }

    // The receiving-side trust boundary. EVERY incoming envelope,
    // whatever its kind, passes the SAME eligibility check `_syncIfEligible()`
    // applies on the sending side — re-checked here too, never assumed
    // from the fact that a message merely arrived under this protocol's
    // name, because a connection that was eligible when this class
    // attached it can stop being eligible the instant a revocation is
    // learned (see this class's own header on why that single re-check
    // is the entire revocation-isolation mechanism).
    _handleIncoming(payload, meta) {
        if (!this._isEligibleSibling(meta.connectedPeer)) {
            return;
        }
        if (isValidConversationSyncMessagesEnvelope(payload)) {
            this._handleIncomingMessages(payload);
        } else if (isValidConversationSyncReadStateEnvelope(payload)) {
            this._handleIncomingReadState(payload);
        }
    }

    _handleIncomingMessages(payload) {
        for (const entry of payload.entries) {
            const before = this._chat.getStoredEntries(payload.peerIdentityId).find((e) => e.message.messageId === entry.message.messageId);
            this._chat.ingestSyncedEntry(payload.peerIdentityId, entry.message, entry.direction, entry.deliveryState);
            if (!before) {
                this._eventBus.publish(SYNCED_MESSAGE_EVENT, { peerIdentityId: payload.peerIdentityId, message: entry.message });
            }
        }
    }

    _handleIncomingReadState(payload) {
        const before = this._siblingReadState.getObservedSequence(payload.peerIdentityId);
        const updated = this._siblingReadState.recordObserved(payload.peerIdentityId, payload.lastReadSequence);
        if (updated.lastReadSequence > before) {
            this._eventBus.publish(SIBLING_READ_STATE_EVENT, { peerIdentityId: payload.peerIdentityId, observedSequence: updated.lastReadSequence });
        }
    }
}

DeviceConversationSyncUseCase.DEFAULT_PROTOCOL = 'forkbuild:device-conversation-sync';

function toWireChatMessage(message) {
    const { messageId, conversationId, senderIdentity, sequence, kind, body, timestamp } = message;
    return { messageId, conversationId, senderIdentity, sequence, kind, body, timestamp };
}

function chunk(array, size) {
    const batches = [];
    for (let i = 0; i < array.length; i += size) {
        batches.push(array.slice(i, i + size));
    }
    return batches;
}
