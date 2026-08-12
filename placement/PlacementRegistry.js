// Base class every placement registry adapter extends. Answers:
// "How do I store and discover placement records?"
//
// This is the decentralized discovery layer. The SpatialIndexProvider
// handles spatial queries (sphere-AABB intersection). The
// PlacementRegistry handles storage and retrieval of placement records.
// These are separate concerns:
//
//   IPFS/Arweave stores the records; a spatial index makes them
//   discoverable.
//
// A content-addressed store by itself cannot answer "give me all
// worlds within 5 km of (x, y, z)." That's the SpatialIndexProvider's
// job. The PlacementRegistry answers "give me all placement records
// for this publication" or "give me all placement records by this
// owner."
//
// The implementation may be localStorage, IPFS, Arweave, a blockchain,
// or a distributed database. The application layer never knows which.
export class PlacementRegistry {
    add(record) {
        throw new Error('PlacementRegistry.add() must be implemented by a subclass');
    }

    update(record) {
        throw new Error('PlacementRegistry.update() must be implemented by a subclass');
    }

    remove(placementId) {
        throw new Error('PlacementRegistry.remove() must be implemented by a subclass');
    }

    get(placementId) {
        throw new Error('PlacementRegistry.get() must be implemented by a subclass');
    }

    findByPublicationId(publicationId) {
        throw new Error('PlacementRegistry.findByPublicationId() must be implemented by a subclass');
    }

    findByOwner(owner) {
        throw new Error('PlacementRegistry.findByOwner() must be implemented by a subclass');
    }

    discover(center, radius) {
        throw new Error('PlacementRegistry.discover() must be implemented by a subclass');
    }

    list() {
        throw new Error('PlacementRegistry.list() must be implemented by a subclass');
    }

    // Verifies the integrity of a stored placement record.
    verifyIntegrity(placementId) {
        throw new Error('PlacementRegistry.verifyIntegrity() must be implemented by a subclass');
    }
}
