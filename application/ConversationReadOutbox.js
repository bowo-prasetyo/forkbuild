import { ConversationReadOutboxEntry, ReadReceiptOutboxState } from '../core/ConversationReadOutboxEntry.js';

const STORAGE_KEY_PREFIX = 'chat-read-outbox:';

// 0.2.71 — Explicit Read Acknowledgement.
//
// "What read acknowledgement do I still owe each peer?" — a FOURTH
// durable per-owner store, alongside application/ChatOutbox.js (0.2.63,
// messages not yet confirmed delivered), application/ConversationStore.js
// (0.2.69, what we talked about), and application/ConversationReadTracker.js
// (0.2.70, what I have seen). Same loaded/created/saved-through-an-
// injected-StorageProvider shape every durable per-owner store in this
// codebase already uses — see application/ChatOutbox.js's own header —
// but with a genuinely different retention posture from all three:
// this store never grows past ONE entry per peer, because a read
// acknowledgement is "the latest known state," not "an event," and
// coalesces instead of accumulating — see
// core/ConversationReadOutboxEntry.js's own header.
//
// This class is never reused as, and never reaches into,
// application/ChatOutbox.js: that store answers "what MESSAGE have I
// sent that isn't confirmed delivered," addressed by messageId, kept
// until acknowledged or expired. This store answers "what is the
// highest sequence I've told this peer I've read," addressed ONLY by
// peerIdentityId, with no message identity at all and no expiry —
// see this file's own header, "A Coalescing Outbox Remembers The
// Latest Value, Not Every Event" (docs/Principles.md, 0.2.71).
//
// Addressed to an identity, never a connection — the same property
// application/ChatOutbox.js's own header established in 0.2.63 for the
// identical reason: a "reconnect" that genuinely authenticates as the
// WRONG identity finds no entry here addressed to it, so
// application/ChatUseCase.js#_attemptFlush()'s own reconnect-triggered
// flush can never leak one peer's pending read acknowledgement to a
// different, merely-hoped-for identity.
export class ConversationReadOutbox {
    constructor(storageProvider, identityProvider) {
        if (!storageProvider) {
            throw new Error('ConversationReadOutbox: storageProvider is required');
        }
        if (!identityProvider) {
            throw new Error('ConversationReadOutbox: identityProvider is required');
        }
        this._storageProvider = storageProvider;
        this._identityProvider = identityProvider;
    }

    // Every entry currently held for the current local owner — at most
    // one per peer — optionally scoped to a single peer identity,
    // mirroring application/ChatOutbox.js#list's own per-identity
    // filter.
    list(peerIdentityId = null) {
        const all = this._loadAll();
        return peerIdentityId ? all.filter((entry) => entry.peerIdentityId === peerIdentityId) : all;
    }

    // The subset actually worth transmitting — PENDING only, never SENT
    // — the same "what still needs a wire" filter
    // application/ChatOutbox.js#list applies to QUEUED/SENT versus
    // DELIVERED, adapted to this store's own two-state vocabulary.
    pending(peerIdentityId = null) {
        return this.list(peerIdentityId).filter((entry) => entry.state === ReadReceiptOutboxState.PENDING);
    }

    // Advances (never regresses — see core/ConversationReadOutboxEntry.js#withReadThroughSequence)
    // this peer's pending read-through value, creating a fresh entry if
    // none exists yet. Returns the resulting entry either way, so a
    // caller never needs a separate existence check first, the same
    // "harmless no-op, not an error" posture
    // application/ConversationReadTracker.js#markRead already
    // established for the identical shape of guarantee one store over.
    enqueue(peerIdentityId, readThroughSequence) {
        if (!peerIdentityId || typeof peerIdentityId !== 'string') {
            throw new Error('ConversationReadOutbox: peerIdentityId is required');
        }
        if (!Number.isInteger(readThroughSequence) || readThroughSequence <= 0) {
            return null;
        }
        const owner = this._requireOwner();
        const all = this._loadAll();
        const index = all.findIndex((entry) => entry.peerIdentityId === peerIdentityId);
        const existing = index === -1 ? null : all[index];
        const updated = existing
            ? existing.withReadThroughSequence(readThroughSequence)
            : new ConversationReadOutboxEntry({ peerIdentityId, readThroughSequence });
        if (existing && updated === existing) {
            return existing;
        }
        if (index === -1) {
            all.push(updated);
        } else {
            all[index] = updated;
        }
        this._saveAll(owner, all);
        return updated;
    }

    // PENDING -> SENT, once application/ChatUseCase.js has actually
    // handed this exact `readThroughSequence` to
    // peer/PeerMessageBus.js#send() over a live, AUTHENTICATED
    // connection. `readThroughSequence` must match the entry's CURRENT
    // value exactly — a mismatch means a newer `enqueue()` landed while
    // the send was in flight, and that strictly newer value must stay
    // PENDING rather than being incorrectly marked delivered-to-the-wire
    // by a send that was already for a stale number.
    markSent(peerIdentityId, readThroughSequence) {
        const owner = this._requireOwner();
        const all = this._loadAll();
        const index = all.findIndex((entry) => entry.peerIdentityId === peerIdentityId
            && entry.readThroughSequence === readThroughSequence
            && entry.state === ReadReceiptOutboxState.PENDING);
        if (index === -1) {
            return null;
        }
        const sent = all[index].withState(ReadReceiptOutboxState.SENT);
        all[index] = sent;
        this._saveAll(owner, all);
        return sent;
    }

    _loadAll() {
        const owner = this._currentOwnerOrNull();
        if (!owner) {
            return [];
        }
        const stored = this._storageProvider.load(STORAGE_KEY_PREFIX + owner) || [];
        return stored.map((json) => ConversationReadOutboxEntry.fromJSON(json)).filter(Boolean);
    }

    _saveAll(owner, entries) {
        this._storageProvider.save(STORAGE_KEY_PREFIX + owner, entries.map((entry) => entry.toJSON()));
    }

    _requireOwner() {
        const owner = this._currentOwnerOrNull();
        if (!owner) {
            throw new Error('ConversationReadOutbox: no user is currently logged in');
        }
        return owner;
    }

    _currentOwnerOrNull() {
        const user = this._identityProvider.currentUser();
        return user ? user.username : null;
    }
}
