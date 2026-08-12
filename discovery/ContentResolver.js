// Base class every content resolver extends. Answers:
// "Where and how do I retrieve the content for this publication?"
//
// The implementation may be local storage, IPFS, Arweave, a CDN, or
// any content-addressed store. The application layer never knows which.
//
// Distinct from:
//   SpatialDiscoveryProvider — "Where are things?"
//   PlacementRegistry        — "What placement records exist?"
//   Snapshot loader          — "How do I turn content into a session?"
//
// The ContentResolver returns raw snapshot data. It does NOT
// deserialize, validate, or wrap in a session — that is the
// ResolvePublicationUseCase's job.
export class ContentResolver {
    // Returns the raw snapshot JSON for a publication.
    resolve(publicationId) {
        throw new Error('ContentResolver.resolve() must be implemented by a subclass');
    }

    // Verifies the integrity of a stored snapshot against its
    // recorded content hash.
    verify(publicationId, expectedHash) {
        throw new Error('ContentResolver.verify() must be implemented by a subclass');
    }
}
