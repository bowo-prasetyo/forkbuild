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
// what lets application/SnapshotPlacementStoreRegistry.js key a lookup
// table by "the plugin's own name" — the identical discipline
// application/ExternalProofVerifierRegistry.js already holds for a
// proofVerifier's own `anchorType` — without this codebase inventing a
// second, competing way to spell the same backend's name.
export class ContentStore {
    get storage() { throw new Error('ContentStore.storage not implemented'); }
    put(bytes) { throw new Error('ContentStore.put() not implemented'); }
    get(reference) { throw new Error('ContentStore.get() not implemented'); }
    has(reference) { throw new Error('ContentStore.has() not implemented'); }
}
