import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { DocumentManifest } from './DocumentManifest.js';

// Document -> DocumentSerializer -> StorageProvider. UI never touches
// JSON or a storage API directly — it calls execute(documentManager) and
// this handles serialization, persistence, updating the manifest, and
// marking the document saved (DocumentManager.markSaved(), the only
// correct way DocumentState should change — see Architecture.md).
//
// storageProvider is accepted purely as an injected dependency — this
// class never imports a concrete provider (LocalStorageProvider or
// otherwise). Whoever wires the editor together decides which storage
// backend to use; this use case works identically with any of them.
//
// The stored id is document.world.id (a stable UUID since 0.1.10), not a
// separately invented one — saving the same document twice naturally
// overwrites the same slot rather than accumulating duplicates.
export class SaveDocumentUseCase {
    constructor(
        storageProvider,
        documentSerializer = new DocumentSerializer(),
        documentManifest = new DocumentManifest(storageProvider)
    ) {
        this._storageProvider = storageProvider;
        this._documentSerializer = documentSerializer;
        this._documentManifest = documentManifest;
    }

    execute(documentManager) {
        const document = documentManager.document;
        const id = document.world.id;

        const json = this._documentSerializer.serialize(document);
        this._storageProvider.save(id, json);

        this._documentManifest.upsert({
            id,
            title: document.metadata.title,
            modified: new Date().toISOString()
        });

        documentManager.markSaved();
        return id;
    }
}
