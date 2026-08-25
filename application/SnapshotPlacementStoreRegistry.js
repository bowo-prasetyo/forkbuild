// 0.8.18 — Decentralized Snapshot Placement Foundation.
//
// application/CreateExternalSnapshotPlacementUseCase.js needs to pick a
// concrete content/ContentStore.js (content/IpfsContentStore.js today)
// from a caller-supplied `storage` string to PLACE bytes into, and
// application/SnapshotPlacementResolver.js needs the identical lookup to
// RETRIEVE bytes back from, given only a cataloged placement's own
// `storage` field. This registry IS that one shared lookup step, keyed
// by the store's OWN `storage` name (content/ContentStore.js's own
// 0.8.18 addition — see that file's header) — never a second,
// caller-supplied key that could drift from what the store actually
// talks to.
//
// UNLIKE ANCHORING, ONE REGISTRY SUFFICES FOR BOTH DIRECTIONS. Anchor
// evidence needed two separate registries (application/
// ExternalProofVerifierRegistry.js for verifying, application/
// ExternalAnchorPublisherRegistry.js for creating) because creating an
// anchor and verifying its proof are fundamentally different
// capabilities, implemented by two entirely different classes
// (anchoring/BitcoinAnchorPublisher.js, anchoring/
// BitcoinOpReturnProofVerifier.js). A content/ContentStore.js already
// provides BOTH halves of a placement's own lifecycle on one object —
// put() to place bytes, get() to retrieve them back — so one registry,
// mapping `storage -> ContentStore`, covers both application/
// CreateExternalSnapshotPlacementUseCase.js's own need and application/
// SnapshotPlacementResolver.js's own need without this codebase
// maintaining two lookup tables that would always have to be kept in
// sync by hand.
//
// It never itself places or retrieves anything, never imports content/
// IpfsContentStore.js or any other concrete store, and neither
// application/CreateExternalSnapshotPlacementUseCase.js nor application/
// SnapshotPlacementResolver.js imports THIS file's own concrete stores
// either — a caller wires the three together explicitly at a composition
// root (see application/CreateSnapshotPlacementOrchestratorUseCase.js),
// the identical "generic pipeline, concrete plugin wired outside it"
// split every registry in this codebase already holds. No storage
// vocabulary lives here either — a store names its own `storage`; this
// registry only ever reads that name back, never invents or validates it
// against any fixed list. It never ranks stores, never picks a
// "preferred" storage backend, and never falls back from one to
// another.
export class SnapshotPlacementStoreRegistry {
    constructor() {
        this._stores = new Map();
    }

    // Keyed by the store's OWN `storage` — never a second, caller-
    // supplied key that could drift from what the store actually talks
    // to. Registering a second store for a storage name already
    // registered REPLACES the first, the same "last write wins, for a
    // purely local lookup table" posture application/
    // ExternalProofVerifierRegistry.js already takes.
    register(contentStore) {
        if (!contentStore || typeof contentStore.storage !== 'string' || !contentStore.storage.trim()) {
            throw new Error('SnapshotPlacementStoreRegistry: a ContentStore with a non-empty storage name is required');
        }
        if (typeof contentStore.put !== 'function' || typeof contentStore.get !== 'function') {
            throw new Error('SnapshotPlacementStoreRegistry: a ContentStore must implement put() and get()');
        }
        this._stores.set(contentStore.storage, contentStore);
        return this;
    }

    unregister(storage) {
        this._stores.delete(storage);
    }

    has(storage) {
        return this._stores.has(storage);
    }

    // Returns null for an unregistered storage name — never throws. A
    // caller decides for itself what a null lookup means: application/
    // CreateExternalSnapshotPlacementUseCase.js treats it as a refusal to
    // proceed (there is no degraded-but-honest way to place content
    // without a store), while application/SnapshotPlacementResolver.js
    // treats it as STORE_UNAVAILABLE — never a verdict about the
    // placement itself.
    get(storage) {
        return this._stores.get(storage) || null;
    }

    get storageTypes() {
        return Array.from(this._stores.keys());
    }
}
