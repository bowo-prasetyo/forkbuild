import { ConversationEntry, isValidChatMessageDirection } from '../core/ConversationEntry.js';

const STORAGE_KEY_PREFIX = 'conversation-history:';

// A best-effort, per-conversation cap — storage hygiene, not a
// retention policy. Keeps one long-lived friendship's transcript from
// growing this device's local storage without bound; the oldest
// entries for that ONE peer are dropped first once the cap is
// exceeded, exactly like `application/ChatOutbox.js#pruneExpired`
// keeps that store bounded, only on count instead of TTL. What
// persistent message history should really mean at scale — pagination,
// archival, a user-controlled retention policy — is a genuinely
// different, harder question than "does my conversation survive a
// reload," deliberately left open rather than half-answered here.
export const MAX_STORED_MESSAGES_PER_PEER = 500;

// 0.2.69 — Reliable Offline Conversations.
//
// "What did Alice and Bob actually talk about?" — the question
// application/LiveConversation.js's own header (0.2.61) named and
// deliberately left unanswered: "no persistence, no store-and-forward,
// ... What persistent message history should even mean in a
// decentralized system ... is a genuinely different, harder question
// ... deliberately left to a later milestone." This is that later
// milestone's answer, scoped as narrowly as the question allows: a
// PURELY LOCAL, CLIENT-SIDE record of a conversation this device
// already had. Nothing here is transmitted, nothing here is a new wire
// protocol, and nothing here changes who is trusted to say what —
// see this file's own security note below.
//
// Same "one durable record per local owner, loaded/created/saved
// through an injected StorageProvider" shape
// application/ChatOutbox.js and application/PeerRelationshipUseCase.js
// already established — one flat list per owner, filtered by
// `peerIdentityId` on read, exactly like `ChatOutbox#list` already
// does. Deliberately NOT one storage key per peer: a single flat list
// is the same shape every other durable per-owner store in this
// codebase already uses, and needs no separate index to enumerate
// which conversations exist — `conversations()` below derives that
// directly from the one list.
//
// A Durable Conversation Store Is Addressed To An Identity, Never A
// Connection — the identical property application/ChatOutbox.js's own
// header already established for queued mail (0.2.63): every entry
// carries a `peerIdentityId`, never a connectionId or endpoint, so
// nothing about persisting history introduces a second place a
// connection-scoped assumption could sneak back in.
//
// This Store Is Never An Authorization Mechanism (0.2.69): every write
// here happens strictly AFTER application/ChatUseCase.js's own
// ingestion boundary already decided a message is genuine — authenticated
// connection, sender matches connection, not blocked, FRIEND, correct
// conversationId, replay/sequence valid (see that file's own header for
// the full ordered list). This class never re-checks any of that, never
// reads friendship/block state, and is never consulted to decide
// whether an incoming message should be trusted — it only ever records
// what was ALREADY trusted, the same one-way "trust decided upstream,
// this is a pure write-through" relationship
// application/LiveConversation.js already had with ChatUseCase, now
// simply also durable. A UI reading conversation history is reading a
// LOG of past decisions, never a place new authorization can be granted
// from.
//
// Never Reused As, Or By, application/ChatOutbox.js (0.2.69): the
// outbox answers "what have I sent that I haven't yet confirmed
// arrived" and prunes itself the instant that question is answered —
// it was never meant to become a message database (see that file's own
// header). This store answers a completely different question — "what
// did we talk about" — and keeps every message (up to
// MAX_STORED_MESSAGES_PER_PEER), delivered or not, exactly the
// opposite retention shape. The two stores share no code and no
// storage key, on purpose.
export class ConversationStore {
    constructor(storageProvider, identityProvider) {
        if (!storageProvider) {
            throw new Error('ConversationStore: storageProvider is required');
        }
        if (!identityProvider) {
            throw new Error('ConversationStore: identityProvider is required');
        }
        this._storageProvider = storageProvider;
        this._identityProvider = identityProvider;
    }

    // Every stored entry for the current local owner, oldest first —
    // the same acceptance/send order application/LiveConversation.js
    // already displays in. Filters to one peer identity when asked,
    // mirroring application/ChatOutbox.js#list's own per-identity
    // filter.
    list(peerIdentityId = null) {
        const all = this._loadAll();
        return peerIdentityId ? all.filter((entry) => entry.peerIdentityId === peerIdentityId) : all;
    }

    // One summary per peer identity this owner has ANY stored history
    // with — `{ peerIdentityId, lastEntry }` — most recently active
    // first. `application/ChatUseCase.js` reads this once, at
    // construction, to rehydrate every conversation this device already
    // had (see that file's own header on why a reload continues a
    // conversation rather than starting a new one); a future
    // conversation-list UI could read the exact same thing.
    conversations() {
        const all = this._loadAll();
        const lastEntryByPeer = new Map();
        for (const entry of all) {
            lastEntryByPeer.set(entry.peerIdentityId, entry);
        }
        return Array.from(lastEntryByPeer.entries())
            .map(([peerIdentityId, lastEntry]) => ({ peerIdentityId, lastEntry }))
            .sort((a, b) => b.lastEntry.recordedAt.getTime() - a.lastEntry.recordedAt.getTime());
    }

    // application/ChatUseCase.js's own write-through, called for EVERY
    // message it appends to a LiveConversation — outgoing or incoming
    // alike — immediately after that in-memory append. Idempotent by
    // `(peerIdentityId, messageId)`: a duplicate append (the realistic
    // case being a retransmit that core/ChatReplayWindow.js's own
    // bounded, in-memory window no longer recognizes after a reload —
    // see application/ChatUseCase.js's own header) is a harmless no-op
    // that returns the ALREADY-stored entry, never a second copy.
    append(peerIdentityId, message, direction, deliveryState = null) {
        if (!isValidChatMessageDirection(direction)) {
            throw new Error(`ConversationStore: unknown direction "${direction}"`);
        }
        const owner = this._requireOwner();
        const all = this._loadAll();
        const already = all.find((entry) => entry.peerIdentityId === peerIdentityId && entry.message.messageId === message.messageId);
        if (already) {
            return already;
        }
        const entry = new ConversationEntry({ message, peerIdentityId, direction, deliveryState });
        this._saveAll(owner, capForPeer([...all, entry], peerIdentityId));
        return entry;
    }

    // application/ChatUseCase.js's own write-through for a delivery-state
    // transition (QUEUED -> SENT -> DELIVERED, or -> EXPIRED) — mirrors
    // application/LiveConversation.js#updateDeliveryState's own
    // find-and-replace shape, kept in sync by the SAME caller
    // (`ChatUseCase#_publishDeliveryState`) rather than either store
    // ever reaching into the other. Returns null (never throws) if this
    // store never held that entry — a stale or out-of-order event,
    // exactly like LiveConversation's own version already treats it.
    updateDeliveryState(peerIdentityId, messageId, deliveryState) {
        const owner = this._requireOwner();
        const all = this._loadAll();
        const index = all.findIndex((entry) => entry.peerIdentityId === peerIdentityId && entry.message.messageId === messageId);
        if (index === -1) {
            return null;
        }
        const updated = all[index].withDeliveryState(deliveryState);
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
        return stored.map((json) => ConversationEntry.fromJSON(json)).filter(Boolean);
    }

    _saveAll(owner, entries) {
        this._storageProvider.save(STORAGE_KEY_PREFIX + owner, entries.map((entry) => entry.toJSON()));
    }

    _requireOwner() {
        const owner = this._currentOwnerOrNull();
        if (!owner) {
            throw new Error('ConversationStore: no user is currently logged in');
        }
        return owner;
    }

    _currentOwnerOrNull() {
        const user = this._identityProvider.currentUser();
        return user ? user.username : null;
    }
}

// Drops the OLDEST entries for exactly one peer once that peer's own
// count exceeds MAX_STORED_MESSAGES_PER_PEER — every other peer's own
// history is completely untouched, matching the per-peer scoping
// `application/ChatOutbox.js#pruneExpired` already uses for its own,
// differently-triggered pruning.
function capForPeer(entries, peerIdentityId) {
    const forPeer = entries.filter((entry) => entry.peerIdentityId === peerIdentityId);
    if (forPeer.length <= MAX_STORED_MESSAGES_PER_PEER) {
        return entries;
    }
    const overflow = forPeer.length - MAX_STORED_MESSAGES_PER_PEER;
    const dropIds = new Set(forPeer.slice(0, overflow).map((entry) => entry.message.messageId));
    return entries.filter((entry) => !(entry.peerIdentityId === peerIdentityId && dropIds.has(entry.message.messageId)));
}
