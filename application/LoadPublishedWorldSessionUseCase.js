import { PublishedWorldSession } from './PublishedWorldSession.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';

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
    constructor(publisherProvider, documentSerializer = new DocumentSerializer()) {
        this._publisherProvider = publisherProvider;
        this._documentSerializer = documentSerializer;
    }

    execute(publication) {
        if (!publication || !publication.id || !publication.contentHash) {
            throw new Error('LoadPublishedWorldSessionUseCase: a valid Publication is required');
        }

        // 1. Integrity check
        const isValid = this._publisherProvider.verifySnapshot(publication.id, publication.contentHash);
        if (!isValid) {
            throw new Error(
                `LoadPublishedWorldSessionUseCase: snapshot integrity check failed `
                + `for publication ${publication.id} (hash mismatch)`
            );
        }

        // 2. Load and deserialize
        const snapshotJson = this._publisherProvider.loadSnapshot(publication.id);
        const document = this._documentSerializer.deserialize(snapshotJson);

        // 3. Wrap in read-only session
        return new PublishedWorldSession({
            document,
            publication
        });
    }
}
