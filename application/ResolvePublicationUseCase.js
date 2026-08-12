import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { PublishedWorldSession } from './PublishedWorldSession.js';

// Resolves a publication into a read-only PublishedWorldSession.
//
// As of 0.2.12, accepts an optional PublicationContentCache. If present,
// the use case caches the raw snapshot JSON after the first successful
// verification and resolution. Subsequent resolutions for the same
// publication (e.g. multiple placements of the same castle) bypass
// the ContentResolver entirely, saving network/storage I/O.
export class ResolvePublicationUseCase {
    constructor(
        contentResolver,
        discoveryProvider,
        documentSerializer = new DocumentSerializer(),
        contentCache = null
    ) {
        this._contentResolver = contentResolver;
        this._discoveryProvider = discoveryProvider;
        this._documentSerializer = documentSerializer;
        this._contentCache = contentCache;
    }

    execute(publicationId) {
        const publication = this._discoveryProvider.findById(publicationId);
        if (!publication) {
            throw new Error(`ResolvePublicationUseCase: publication ${publicationId} not found`);
        }
        return this._resolve(publication);
    }

    executeFromPlacement(placementRecord) {
        return this.execute(placementRecord.publicationId);
    }

    _resolve(publication) {
        let snapshotJson = this._contentCache ? this._contentCache.get(publication.id) : null;
        let fromCache = snapshotJson !== null;

        if (!fromCache) {
            // 1. Verify integrity (only on cache miss)
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

            // 2. Resolve content
            snapshotJson = this._contentResolver.resolve(publication.id);
            
            if (this._contentCache) {
                this._contentCache.set(publication.id, snapshotJson);
            }
        }

        // 3. Deserialize (always, to ensure independent World instances)
        const document = this._documentSerializer.deserialize(snapshotJson);

        // 4. Wrap in read-only session
        return new PublishedWorldSession({ document, publication });
    }
}
