import { PublishedWorldSession } from './PublishedWorldSession.js';
import { DocumentSerializer } from '../../serializer/DocumentSerializer.js';

// Loads a Publication's snapshot into a read-only runtime session.
//
// The pipeline enforces snapshot integrity before the document enters
// the domain:
//   1. Verify contentHash against the stored snapshot bytes.
//   2. Migrate / Validate / Deserialize via DocumentSerializer.
//   3. Wrap in PublishedWorldSession (no mutation pathway).
//
// If the snapshot has been corrupted or tampered with, the load is
// rejected outright — a PublishedWorldSession can only be created from
// an intact publication snapshot.
export class LoadPublishedWorldSessionUseCase {
    constructor(publisherProvider, documentSerializer = new DocumentSerializer(), contentStore = null) {
        this._publisherProvider = publisherProvider;
        this._documentSerializer = documentSerializer;
        this._contentStore = contentStore;
    }

    execute(publication) {
        if (!publication || !publication.id) {
            throw new Error('LoadPublishedWorldSessionUseCase: a valid Publication is required');
        }
        
        let snapshotJson;
        
        if (publication.contentReference && this._contentStore) {
            // Synchronous: World View streaming calls this while the camera
            // moves. Content stored on disk only throws
            // StorageEntryNotLoadedError (with `ready`) until it is loaded.
            const bytes = typeof this._contentStore.getSync === 'function'
                ? this._contentStore.getSync(publication.contentReference)
                : this._contentStore.get(publication.contentReference);
            if (!bytes) {
                throw new Error(`LoadPublishedWorldSessionUseCase: content not found for hash ${publication.contentReference.hash}`);
            }
            if (!publication.contentReference.verify(bytes)) {
                throw new Error(
                    `LoadPublishedWorldSessionUseCase: snapshot integrity check failed `
                    + `for publication ${publication.id} (hash mismatch)`
                );
            }
            snapshotJson = JSON.parse(bytes);
        } else {
            // Legacy fallback
            if (!publication.contentHash) {
                throw new Error('LoadPublishedWorldSessionUseCase: publication missing contentHash');
            }
            const isValid = this._publisherProvider.verifySnapshot(publication.id, publication.contentHash);
            if (!isValid) {
                throw new Error(
                    `LoadPublishedWorldSessionUseCase: snapshot integrity check failed `
                    + `for publication ${publication.id} (hash mismatch)`
                );
            }
            snapshotJson = this._publisherProvider.loadSnapshot(publication.id);
        }

        const document = this._documentSerializer.deserialize(snapshotJson);
        return new PublishedWorldSession({ document, publication });
    }
}
