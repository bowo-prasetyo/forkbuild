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
export class ContentStore {
    put(bytes) { throw new Error('ContentStore.put() not implemented'); }
    get(reference) { throw new Error('ContentStore.get() not implemented'); }
    has(reference) { throw new Error('ContentStore.has() not implemented'); }
}
