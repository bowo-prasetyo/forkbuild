import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { DocumentManifest } from './DocumentManifest.js';

// StorageProvider -> DocumentSerializer -> Document, loaded into a
// DocumentManager (DocumentManager.load(), the only correct way
// DocumentState should change on load — sets loadedFrom/lastSaved and
// clears dirty in one place). Same injected-dependency shape as
// SaveDocumentUseCase: never imports a concrete storage provider.
export class LoadDocumentUseCase {
    constructor(
        storageProvider,
        documentSerializer = new DocumentSerializer(),
        documentManifest = new DocumentManifest(storageProvider)
    ) {
        this._storageProvider = storageProvider;
        this._documentSerializer = documentSerializer;
        this._documentManifest = documentManifest;
    }

    // eventBus: optional, passed through so the restored World can
    // publish domain events the same as a freshly-built one.
    execute(documentManager, id, eventBus = null) {
        const json = this._storageProvider.load(id);
        if (json === null) {
            throw new Error(`LoadDocumentUseCase: no document found with id "${id}"`);
        }

        const document = this._documentSerializer.deserialize(json, eventBus);
        documentManager.load(document, id);
        return document;
    }

    // For a future Open Document dialog — reads the manifest rather than
    // scanning every stored key.
    listSavedDocuments() {
        return this._documentManifest.list();
    }
}
