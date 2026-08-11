import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
// Loads a published snapshot by its snapshotId, completely independent
// of the editing session. No DocumentManager, no CommandHistory, no
// tools, no selection state — just a validated, deserialized Document
// ready for viewing.
//
// This is the read-only loading path for published worlds. It uses the
// same DocumentSerializer (with migration and validation) as the
// editing load path, but the semantic contract is different: the
// returned Document is a historical artifact, not a work-in-progress.
//
// The publisherProvider.loadSnapshot() method handles storage retrieval
// and deserialization. This use case adds the session-agnostic wrapper
// so ui/ never imports publisher/ directly.
export class LoadPublishedSnapshotUseCase {
    constructor(publisherProvider) {
        this._publisherProvider = publisherProvider;
    }
    execute(snapshotId, eventBus = null) {
        const document = this._publisherProvider.loadSnapshot(snapshotId);
        // If an eventBus is provided, reconstruct the World with it so
        // domain events flow to subscribers (e.g. the renderer).
        if (eventBus) {
            const { World } = document.world.constructor;
            const json = document.toJSON();
            const { Document } = document.constructor;
            return Document.fromJSON(json, eventBus);
        }
        return document;
    }
}
