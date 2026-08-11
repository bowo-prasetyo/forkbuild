import { DocumentSerializer } from '../serializer/DocumentSerializer.js';

// Loads a published snapshot by its publicationId, completely
// independent of the editing session. No DocumentManager, no
// CommandHistory, no tools — just a validated, deserialized Document
// ready for viewing.
//
// The snapshot passes through the same DocumentSerializer pipeline
// (migrate → validate → deserialize) as any other document load,
// ensuring published snapshots are always valid and can be loaded
// even after schema evolution.
export class LoadPublishedSnapshotUseCase {
    constructor(publisherProvider, documentSerializer = new DocumentSerializer()) {
        this._publisherProvider = publisherProvider;
        this._documentSerializer = documentSerializer;
    }

    // Returns a Document reconstructed from the published snapshot.
    execute(publicationId, eventBus = null) {
        const json = this._publisherProvider.loadSnapshot(publicationId);
        return this._documentSerializer.deserialize(json, eventBus);
    }
}
