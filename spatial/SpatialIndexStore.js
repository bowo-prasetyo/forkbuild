// Base adapter for immutable spatial-index content (0.2.15).
//
// The ContentStore (0.2.14) analogue for the spatial index plane:
// content-addressed, immutable objects. The store holds three kinds
// of content behind one put/get surface — PlacementRecord revision
// snapshots, SpatialIndexManifests, and the SpatialIndexRoot — all
// plain JSON keyed by content hash.
//
// The ONLY mutable thing in the whole decentralized index is the
// root pointer: setRootReference/getRootReference. Mutable pointer,
// immutable content — exactly the placement-revision model.
//
// Future implementations:
//     IPFSSpatialIndexStore
//     ArweaveSpatialIndexStore
//     BlockchainAnchoredSpatialIndexStore
export class SpatialIndexStore {
    // Stores immutable index JSON, returns its ContentReference.
    put(json) { throw new Error('SpatialIndexStore.put() not implemented'); }

    // reference: ContentReference (or hash string). Returns JSON or null.
    get(reference) { throw new Error('SpatialIndexStore.get() not implemented'); }

    has(reference) { throw new Error('SpatialIndexStore.has() not implemented'); }

    // The single mutable pointer at the current immutable root.
    setRootReference(reference) { throw new Error('SpatialIndexStore.setRootReference() not implemented'); }
    getRootReference() { throw new Error('SpatialIndexStore.getRootReference() not implemented'); }
}
