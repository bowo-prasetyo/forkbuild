import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { PublishedWorldSession } from './PublishedWorldSession.js';

// Resolves a publication into a read-only PublishedWorldSession.
//
// The pipeline:
//   1. Look up the Publication record (via DiscoveryProvider)
//   2. Verify snapshot integrity (via ContentResolver)
//   3. Resolve snapshot content (via ContentResolver)
//   4. Deserialize (migrate → validate → deserialize via DocumentSerializer)
//   5. Wrap in PublishedWorldSession (read-only, no mutation pathway)
//
// This is the content-resolution half of the placement-first pipeline.
// DiscoverWorldAreaUseCase discovers placements; this use case resolves
// the actual content for spatially relevant placements.
//
// The ContentResolver abstraction means this use case works identically
// whether the content is in localStorage, IPFS, Arweave, or a CDN.
export class ResolvePublicationUseCase {
    constructor(contentResolver, discoveryProvider, documentSerializer = new DocumentSerializer()) {
        this._contentResolver = contentResolver;
        this._discoveryProvider = discoveryProvider;
        this._documentSerializer = documentSerializer;
    }

    // Resolve by publication ID.
    execute(publicationId) {
        const publication = this._discoveryProvider.findById(publicationId);
        if (!publication) {
            throw new Error(`ResolvePublicationUseCase: publication ${publicationId} not found`);
        }
        return this._resolve(publication);
    }

    // Resolve from a PlacementRecord (the placement-first workflow).
    executeFromPlacement(placementRecord) {
        return this.execute(placementRecord.publicationId);
    }

    _resolve(publication) {
        // 1. Verify integrity.
        if (publication.contentHash) {
            const isValid = this._contentResolver.verify(
                publication.id,
                publication.contentHash
            );
            if (!isValid) {
                throw new Error(
                    `ResolvePublicationUseCase: snapshot integrity check failed `
                    + `for publication ${publication.id} (hash mismatch)`
                );
            }
        }

        // 2. Resolve content.
        const snapshotJson = this._contentResolver.resolve(publication.id);

        // 3. Deserialize (migrate → validate → deserialize).
        const document = this._documentSerializer.deserialize(snapshotJson);

        // 4. Wrap in read-only session.
        return new PublishedWorldSession({ document, publication });
    }
}
