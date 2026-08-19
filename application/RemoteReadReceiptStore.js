import { RemoteReadReceipt } from '../core/RemoteReadReceipt.js';

const STORAGE_KEY_PREFIX = 'chat-remote-read-receipts:';

// 0.2.71 — Explicit Read Acknowledgement.
//
// The durable home for core/RemoteReadReceipt.js — "what has each peer
// told me they have seen of MY OWN messages." A FIFTH durable per-owner
// store, alongside application/ChatOutbox.js, application/ConversationStore.js,
// application/ConversationReadTracker.js, and application/ConversationReadOutbox.js
// — same shape, same discipline: one flat list per LOCAL owner,
// loaded/created/saved through an injected StorageProvider, filtered by
// peerIdentityId on read.
//
// This class has exactly ONE writer in this codebase:
// application/ChatUseCase.js#_handleIncomingRead(), and only ever AFTER
// a core/ChatReadReceipt.js has already passed every trust gate that
// method applies — the claimed `readerIdentity` matches the sending
// connection's own already-proven remoteIdentity, the sender is not
// blocked, the sender is currently a FRIEND, and the `conversationId`
// is the one this device independently re-derives. Exactly like
// application/ConversationStore.js's own header says of itself ("This
// Store Is Never An Authorization Mechanism"), this store never
// re-checks any of that and is never consulted to decide whether to
// trust anything; it only ever records a claim ChatUseCase already
// decided was genuine.
//
// `recordReadThrough()` is intentionally the ONLY write this class
// exposes — there is no local "mark the peer as having read something"
// operation, because the peer's own read state is never this device's
// to assert. It can only ever be told.
export class RemoteReadReceiptStore {
    constructor(storageProvider, identityProvider) {
        if (!storageProvider) {
            throw new Error('RemoteReadReceiptStore: storageProvider is required');
        }
        if (!identityProvider) {
            throw new Error('RemoteReadReceiptStore: identityProvider is required');
        }
        this._storageProvider = storageProvider;
        this._identityProvider = identityProvider;
    }

    // 0, never null/undefined, for a peer this device has no receipt
    // from at all — the same "closed vocabulary, no null in the common
    // path" convention application/ConversationReadTracker.js#getLastReadSequence
    // already established one store over.
    getReadThroughSequence(peerIdentityId) {
        const receipt = this._loadAll().find((r) => r.peerIdentityId === peerIdentityId);
        return receipt ? receipt.readThroughSequence : 0;
    }

    // Advances (never regresses) what this device durably remembers the
    // peer having confirmed reading. Returns the resulting receipt.
    recordReadThrough(peerIdentityId, readThroughSequence) {
        if (!peerIdentityId || typeof peerIdentityId !== 'string') {
            throw new Error('RemoteReadReceiptStore: peerIdentityId is required');
        }
        const owner = this._requireOwner();
        const all = this._loadAll();
        const index = all.findIndex((r) => r.peerIdentityId === peerIdentityId);
        const existing = index === -1 ? new RemoteReadReceipt({ peerIdentityId }) : all[index];
        const updated = existing.withReadThroughSequence(readThroughSequence);
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
        return stored.map((json) => RemoteReadReceipt.fromJSON(json)).filter(Boolean);
    }

    _saveAll(owner, receipts) {
        this._storageProvider.save(STORAGE_KEY_PREFIX + owner, receipts.map((r) => r.toJSON()));
    }

    _requireOwner() {
        const owner = this._currentOwnerOrNull();
        if (!owner) {
            throw new Error('RemoteReadReceiptStore: no user is currently logged in');
        }
        return owner;
    }

    _currentOwnerOrNull() {
        const user = this._identityProvider.currentUser();
        return user ? user.username : null;
    }
}
