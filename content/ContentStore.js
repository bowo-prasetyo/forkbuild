// Base adapter for immutable content-addressed storage.
//
// This is different from StorageProvider.
//
// StorageProvider:
//     application persistence
//     mutable local records
//
// ContentStore:
//     immutable published bytes
//     addressed by content identity
//
// Future implementations:
//     IPFSContentStore
//     ArweaveContentStore
//     HttpContentStore
//
// 0.8.18 — Decentralized Snapshot Placement Foundation.
//
// `storage` is a short, stable string self-identifying which backend a
// concrete ContentStore talks to ('local', 'ipfs', ...) — the exact
// same value it already stamps onto every ContentReference its own
// put() returns (see core/ContentReference.js's own `storage` field).
// Exposing it on the STORE itself, not just on what it produces, is
// what lets application/snapshot/placement/SnapshotPlacementStoreRegistry.js key a lookup
// table by "the plugin's own name" — the identical discipline
// application/anchoring/ExternalProofVerifierRegistry.js already holds for a
// proofVerifier's own `anchorType` — without this codebase inventing a
// second, competing way to spell the same backend's name.
export class ContentStore {
    get storage() { throw new Error('ContentStore.storage not implemented'); }
    // The largest content, in UTF-8 bytes, put() can store; Infinity when
    // the backend sets no limit of its own.
    get maxContentBytes() { return Infinity; }
    put(bytes) { throw new Error('ContentStore.put() not implemented'); }
    get(reference) { throw new Error('ContentStore.get() not implemented'); }
    has(reference) { throw new Error('ContentStore.has() not implemented'); }
}

// Thrown when content is larger than a store's maxContentBytes, before
// anything is uploaded. The message is written for the user.
export class ContentTooLargeError extends Error {
    constructor(contentBytes, maxContentBytes, storageLabel) {
        super(`This build is ${formatBytes(contentBytes)}, more than the ${formatBytes(maxContentBytes)} ${storageLabel} storage accepts. Choose IPFS storage to distribute it.`);
        this.name = 'ContentTooLargeError';
        this.contentBytes = contentBytes;
        this.maxContentBytes = maxContentBytes;
    }
}

function formatBytes(bytes) {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.ceil(bytes / 1024)} KB`;
}
