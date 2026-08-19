import { ConversationReadMarker } from '../core/ConversationReadMarker.js';

const STORAGE_KEY_PREFIX = 'conversation-read-state:';

// 0.2.70 — Presence & Conversation Lifecycle.
//
// A THIRD, independent durable per-owner store alongside
// `application/ChatOutbox.js` (0.2.63, "what have I sent that hasn't
// been confirmed delivered") and `application/ConversationStore.js`
// (0.2.69, "what did we talk about") — this one answers "what have I,
// this device's owner, actually SEEN." Same shape every durable per-
// owner store in this codebase already uses (loaded/created/saved
// through an injected StorageProvider, one list per LOCAL owner,
// resolved fresh on every call rather than captured once), and the same
// discipline `application/ConversationStore.js`'s own header names
// explicitly for its sibling: kept as a SEPARATE class, a SEPARATE
// storage key, and ZERO shared code with either of the other two —
// see docs/Principles.md, "A Read Marker Answers A Third Question; It
// Is Never Folded Into The Outbox Or The History Store" (0.2.70).
//
// This class never reads a message's CONTENT and never talks to
// `application/ConversationStore.js` directly — it is handed a bare
// `peerIdentityId` and the sequence number to advance to by its one
// caller, `application/PeerPresenceUseCase.js#markRead()`, which is the
// only place in this codebase that ever computes "the highest incoming
// sequence this device currently holds for this peer" and hands it
// here. Keeping that computation OUTSIDE this class is deliberate: a
// read tracker that reached into ConversationStore itself would start
// blurring the exact same "two stores, never one reaching into the
// other" line 0.2.69 already drew between the outbox and the history
// store.
export class ConversationReadTracker {
    constructor(storageProvider, identityProvider) {
        if (!storageProvider) {
            throw new Error('ConversationReadTracker: storageProvider is required');
        }
        if (!identityProvider) {
            throw new Error('ConversationReadTracker: identityProvider is required');
        }
        this._storageProvider = storageProvider;
        this._identityProvider = identityProvider;
    }

    // 0, never null/undefined, for a peer this device has no read marker
    // for at all — a caller never needs a separate null-check before
    // comparing against a message's own sequence, the same "closed
    // vocabulary, no null in the common path" convention
    // `application/FriendRelationshipUseCase.js#getState()` already
    // established for FriendshipState.NONE.
    getLastReadSequence(peerIdentityId) {
        const marker = this._loadAll().find((m) => m.peerIdentityId === peerIdentityId);
        return marker ? marker.lastReadSequence : 0;
    }

    // Advances this peer's own high-water mark to `sequence` — a no-op
    // (never an error, never a regression) if `sequence` is at or below
    // what is already recorded, exactly like
    // `core/ConversationReadMarker.js#withLastReadSequence()` itself
    // guarantees. Returns the resulting marker either way.
    markRead(peerIdentityId, sequence) {
        if (!peerIdentityId || typeof peerIdentityId !== 'string') {
            throw new Error('ConversationReadTracker: peerIdentityId is required');
        }
        const owner = this._requireOwner();
        const all = this._loadAll();
        const index = all.findIndex((m) => m.peerIdentityId === peerIdentityId);
        const existing = index === -1 ? new ConversationReadMarker({ peerIdentityId }) : all[index];
        const updated = existing.withLastReadSequence(sequence);
        if (index === -1) {
            all.push(updated);
        } else {
            all[index] = updated;
        }
        this._saveAll(owner, all);
        return updated;
    }

    _loadAll() {
        const owner = this._currentOwnerOrNull();
        if (!owner) {
            return [];
        }
        const stored = this._storageProvider.load(STORAGE_KEY_PREFIX + owner) || [];
        return stored.map((json) => ConversationReadMarker.fromJSON(json)).filter(Boolean);
    }

    _saveAll(owner, markers) {
        this._storageProvider.save(STORAGE_KEY_PREFIX + owner, markers.map((m) => m.toJSON()));
    }

    _requireOwner() {
        const owner = this._currentOwnerOrNull();
        if (!owner) {
            throw new Error('ConversationReadTracker: no user is currently logged in');
        }
        return owner;
    }

    _currentOwnerOrNull() {
        const user = this._identityProvider.currentUser();
        return user ? user.username : null;
    }
}
