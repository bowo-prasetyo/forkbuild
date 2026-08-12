// Base class every spatial discovery adapter extends. Answers:
// "Where are things in the shared virtual space?"
//
// This is the discovery entry point for the World View. It returns
// PlacementRecords — lightweight spatial metadata — without loading
// any publication content. The caller decides which publications to
// actually resolve and load.
//
// The implementation may be a local spatial index, an IPFS spatial
// index, an Arweave index, a blockchain-anchored index, or a
// specialized decentralized indexer. The application layer never
// knows which.
//
// Distinct from:
//   PlacementRegistry  — "What placement records exist?"
//   ContentResolver    — "Where/how do I retrieve this publication?"
//   SpatialIndexProvider — "Which placements intersect this area?"
//                        (storage-level spatial query)
export class SpatialDiscoveryProvider {
    // Returns PlacementRecord[] for placements intersecting the
    // sphere defined by (center, radius).
    discover(center, radius) {
        throw new Error('SpatialDiscoveryProvider.discover() must be implemented by a subclass');
    }

    // Returns PlacementRecord[] for all placements of a specific
    // publication. This is the reverse-lookup workflow:
    // "This castle has been placed in 7 locations."
    findByPublicationId(publicationId) {
        throw new Error('SpatialDiscoveryProvider.findByPublicationId() must be implemented by a subclass');
    }
}
