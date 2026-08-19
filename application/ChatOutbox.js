import { ChatOutboxEntry } from '../core/ChatOutboxEntry.js';
import { ChatDeliveryState } from '../core/ChatDeliveryState.js';

const STORAGE_KEY_PREFIX = 'chat-outbox:';

// 0.2.63 — Reliable Offline Messaging & Delivery State.
//
// "What have I deliberately sent that I haven't yet confirmed
// arrived?" — the durable-but-narrow local store application/
// ChatUseCase.js#sendOrQueue() writes to and
// application/ChatUseCase.js's own reconnect-triggered flush reads
// from. Loaded/created/saved through an injected StorageProvider, one
// list per LOCAL owner, the exact same "stable per-owner record"
// shape application/PeerRelationshipUseCase.js already established —
// see that file's own header. `application/ChatUseCase.js`'s own
// default (an in-memory-only ChatOutbox, used when no durable one is
// injected — see that file's own header) is the ONE place this class
// is ever constructed without a real backend; every other caller,
// starting with `ui/main.js` via
// application/CreateChatOutboxUseCase.js, supplies a genuine one.
//
// A Durable Outbox Is Addressed To An Identity, Never A Connection
// (0.2.63): every entry is keyed by `peerIdentityId` — a
// core/ChatOutboxEntry.js never carries a connectionId, an endpoint,
// or anything else that could go stale the instant the connection it
// was written against closes. This is what makes
// application/ChatUseCase.js's own reconnect-triggered flush correct
// without any special handling for "which incarnation of Bob's
// connection is this": there is only ever one question to ask —
// "is Bob's PROVEN identity authenticated right now?" — never "is
// THIS SPECIFIC connection still the one I queued against?"
//
// The Outbox Prunes Itself; It Is Not A Message Database (0.2.63): a
// DELIVERED entry is removed from storage the instant its
// acknowledgement lands (see `acknowledge()` below) rather than kept
// around as a growing, permanent log — and an entry whose TTL elapses
// before that ever happens is dropped just as completely (see
// `pruneExpired()`). Compare this deliberately with
// application/LiveConversation.js (0.2.61), which is NEVER durable at
// all: the outbox is the one new piece of durable chat state 0.2.63
// adds, and it is durable only for as long as a message remains
// genuinely in flight — never a persistent transcript, never a
// history, never something a UI reads to answer "what did we talk
// about."
export class ChatOutbox {
    constructor(storageProvider, identityProvider) {
        if (!storageProvider) {
            throw new Error('ChatOutbox: storageProvider is required');
        }
        if (!identityProvider) {
            throw new Error('ChatOutbox: identityProvider is required');
        }
        this._storageProvider = storageProvider;
        this._identityProvider = identityProvider;
    }

    // Every entry still worth tracking for the current local owner —
    // QUEUED or SENT, never DELIVERED (removed the instant it is
    // acknowledged) and never one whose TTL has quietly elapsed
    // (pruned here, lazily, on every read — see `pruneExpired()`).
    // Filters to one peer identity when asked, mirroring
    // application/PeerRelationshipUseCase.js#getRelationship's own
    // per-identity filter.
    list(peerIdentityId = null) {
        this.pruneExpired();
        const all = this._loadAll();
        return peerIdentityId ? all.filter((entry) => entry.peerIdentityId === peerIdentityId) : all;
    }

    // Alice's "Send" gesture when application/ChatUseCase.js#sendOrQueue()
    // decides this message is worth tracking to delivery — see that
    // method's own header. Always starts QUEUED; getting from there to
    // SENT is `markSent()`'s job, attempted immediately by the same
    // call that enqueues, never assumed here.
    enqueue(message, peerIdentityId, { ttlMs } = {}) {
        const owner = this._requireOwner();
        const all = this._loadAll();
        const entry = new ChatOutboxEntry({
            message,
            peerIdentityId,
            queuedAt: new Date(),
            ...(ttlMs ? { expiresAt: new Date(Date.now() + ttlMs) } : {})
        });
        this._saveAll(owner, [...all, entry]);
        return entry;
    }

    // QUEUED -> SENT, once application/ChatUseCase.js has actually
    // handed this exact message to peer/PeerMessageBus.js#send() over
    // a live, AUTHENTICATED connection. Deliberately refuses to move
    // anything but a QUEUED entry — see core/ChatDeliveryState.js's own
    // header on why "handed to the wire" and "accepted by the
    // recipient" are kept genuinely distinct facts; this is the first
    // of those two, never the second.
    markSent(peerIdentityId, messageId) {
        return this._transition(peerIdentityId, messageId, (entry) => (
            entry.state === ChatDeliveryState.QUEUED
                ? entry.withState(ChatDeliveryState.SENT, { sentAt: new Date() })
                : null
        ));
    }

    // A core/ChatDeliveryAck.js landed for this (peerIdentityId,
    // messageId) — application/ChatUseCase.js#_handleIncomingAck() is
    // the only caller. Only a SENT entry can ever be acknowledged: a
    // still-QUEUED one was never actually transmitted, so there is
    // nothing genuine an ack could be confirming (an ack claiming
    // otherwise simply finds no match here and is silently ignored,
    // the same "no match, no effect" idempotence a duplicate or
    // stale ack already needs — see this class's own header on why an
    // ack for an entry already removed is harmless). The outbox's job
    // for this one message is now over, so the entry is deleted from
    // storage entirely — see this class's own header, "The Outbox
    // Prunes Itself."
    acknowledge(peerIdentityId, messageId) {
        const owner = this._requireOwner();
        const all = this._loadAll();
        const index = all.findIndex((entry) => entry.peerIdentityId === peerIdentityId
            && entry.message.messageId === messageId
            && entry.state === ChatDeliveryState.SENT);
        if (index === -1) {
            return null;
        }
        const delivered = all[index].withState(ChatDeliveryState.DELIVERED, { deliveredAt: new Date() });
        all.splice(index, 1);
        this._saveAll(owner, all);
        return delivered;
    }

    // Drops every entry (for the current owner, optionally scoped to
    // one peer identity) whose TTL has elapsed without ever being
    // acknowledged — see core/ChatOutboxEntry.js#isExpired(). Run
    // lazily, on every read and on every
    // application/ChatUseCase.js#_attemptFlush() pass, rather than on
    // a background timer — the same lazy-check-on-read posture every
    // other TTL in this codebase already uses (e.g. a
    // core/PeerInvitation.js expiry). Returns the entries that were
    // JUST pruned so a caller (application/ChatUseCase.js) can tell a
    // live conversation "this one will never be delivered."
    pruneExpired(peerIdentityId = null) {
        const owner = this._currentOwnerOrNull();
        if (!owner) {
            return [];
        }
        const all = this._loadAll();
        const now = new Date();
        const expired = all.filter((entry) => entry.isExpired(now) && (!peerIdentityId || entry.peerIdentityId === peerIdentityId));
        if (expired.length > 0) {
            const expiredIds = new Set(expired.map((entry) => entry.message.messageId));
            this._saveAll(owner, all.filter((entry) => !expiredIds.has(entry.message.messageId)));
        }
        return expired;
    }

    _transition(peerIdentityId, messageId, transform) {
        const owner = this._requireOwner();
        const all = this._loadAll();
        const index = all.findIndex((entry) => entry.peerIdentityId === peerIdentityId && entry.message.messageId === messageId);
        if (index === -1) {
            return null;
        }
        const updated = transform(all[index]);
        if (!updated) {
            return null;
        }
        all[index] = updated;
        this._saveAll(owner, all);
        return updated;
    }

    _loadAll() {
        const owner = this._currentOwnerOrNull();
        if (!owner) {
            return [];
        }
        const stored = this._storageProvider.load(STORAGE_KEY_PREFIX + owner) || [];
        return stored.map((json) => ChatOutboxEntry.fromJSON(json)).filter(Boolean);
    }

    _saveAll(owner, entries) {
        this._storageProvider.save(STORAGE_KEY_PREFIX + owner, entries.map((entry) => entry.toJSON()));
    }

    _requireOwner() {
        const owner = this._currentOwnerOrNull();
        if (!owner) {
            throw new Error('ChatOutbox: no user is currently logged in');
        }
        return owner;
    }

    _currentOwnerOrNull() {
        const user = this._identityProvider.currentUser();
        return user ? user.username : null;
    }
}
