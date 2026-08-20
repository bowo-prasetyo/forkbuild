import { SiblingReadMarker } from '../core/SiblingReadMarker.js';

const STORAGE_KEY_PREFIX = 'sibling-read-state:';

// 0.2.83 — Multi-Device Conversation & Read-State Synchronization.
//
// The durable home for core/SiblingReadMarker.js — "what has each of my
// OWN sibling devices told me about ITS OWN local read position, per
// peer." A SIXTH durable per-owner store in this file's own family
// (alongside application/ChatOutbox.js, application/ConversationStore.js,
// application/ConversationReadTracker.js, application/ConversationReadOutbox.js,
// and application/RemoteReadReceiptStore.js) — same shape, same
// discipline: one flat list per LOCAL owner, loaded/created/saved
// through an injected StorageProvider, filtered by peerIdentityId on
// read.
//
// This class is never reused as, and never reaches into,
// application/ConversationReadTracker.js — see that file's own header
// and core/SiblingReadMarker.js's own: a device's OWN local read marker
// answers what THIS device's owner has actually looked at, on THIS
// screen; this store answers a completely different, THIRD-PARTY
// question, "what has one of my other devices reported about itself."
// application/DeviceConversationSyncUseCase.js#getIdentityObservedReadSequence()
// is the one place these two are ever combined, and even there only by
// taking the max of two independently-read values — never by writing one
// into the other. See docs/Principles.md, "Per-Device Local Read State
// And Identity-Observed Read State Are Never The Same Fact" (0.2.83).
//
// This class has exactly ONE writer: application/
// DeviceConversationSyncUseCase.js's own READ_STATE ingestion, and only
// ever after that class's own eligibility check (the incoming connection
// resolves to THIS device's own parent identity) already passed. Exactly
// like application/RemoteReadReceiptStore.js's own header says of
// itself, this store never re-checks that and is never consulted to
// decide whether to trust anything — it only ever records a claim
// already decided genuine one layer up.
export class SiblingReadStateStore {
    constructor(storageProvider, identityProvider) {
        if (!storageProvider) {
            throw new Error('SiblingReadStateStore: storageProvider is required');
        }
        if (!identityProvider) {
            throw new Error('SiblingReadStateStore: identityProvider is required');
        }
        this._storageProvider = storageProvider;
        this._identityProvider = identityProvider;
    }

    // 0, never null/undefined, for a peer no sibling has ever reported
    // anything about — the same "closed vocabulary, no null in the
    // common path" convention every sibling store in this file's own
    // family already uses.
    getObservedSequence(peerIdentityId) {
        const marker = this._loadAll().find((m) => m.peerIdentityId === peerIdentityId);
        return marker ? marker.lastReadSequence : 0;
    }

    // Advances (never regresses) what this device durably remembers a
    // sibling having reported for this peer. Returns the resulting
    // marker either way — harmless to call for a peer with no prior
    // marker at all.
    recordObserved(peerIdentityId, lastReadSequence) {
        if (!peerIdentityId || typeof peerIdentityId !== 'string') {
            throw new Error('SiblingReadStateStore: peerIdentityId is required');
        }
        const owner = this._requireOwner();
        const all = this._loadAll();
        const index = all.findIndex((m) => m.peerIdentityId === peerIdentityId);
        const existing = index === -1 ? new SiblingReadMarker({ peerIdentityId }) : all[index];
        const updated = existing.withLastReadSequence(lastReadSequence);
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
        return stored.map((json) => SiblingReadMarker.fromJSON(json)).filter(Boolean);
    }

    _saveAll(owner, markers) {
        this._storageProvider.save(STORAGE_KEY_PREFIX + owner, markers.map((m) => m.toJSON()));
    }

    _requireOwner() {
        const owner = this._currentOwnerOrNull();
        if (!owner) {
            throw new Error('SiblingReadStateStore: no user is currently logged in');
        }
        return owner;
    }

    _currentOwnerOrNull() {
        const user = this._identityProvider.currentUser();
        return user ? user.username : null;
    }
}
