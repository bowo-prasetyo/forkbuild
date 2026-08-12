import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { DocumentManifest } from './DocumentManifest.js';
import { DocumentRevision } from '../core/DocumentRevision.js';
import { computeContentHash } from '../serializer/contentHash.js';

// Document -> DocumentSerializer -> StorageProvider. UI never touches
// JSON or a storage API directly — it calls execute(documentManager) and
// this handles serialization, persistence, updating the manifest, and
// marking the document saved.
//
// As of 0.2.6, an explicit Save also:
//   - advances the document's revision (one beyond the newest of the
//     previous saved revision and any recovery checkpoint),
//   - records a contentHash for integrity,
//   - removes any recovery checkpoint, which the explicit save now
//     supersedes.
// Save remains distinct from autosave (which only writes a checkpoint)
// and from publish (which creates an immutable snapshot).
//
// recoveryStore is optional for backward compatibility: when absent, save
// still tracks revision but does not clear a checkpoint.
export class SaveDocumentUseCase {
    constructor(
        storageProvider,
        documentSerializer = new DocumentSerializer(),
        documentManifest = new DocumentManifest(storageProvider),
        recoveryStore = null
    ) {
        this._storageProvider = storageProvider;
        this._documentSerializer = documentSerializer;
        this._documentManifest = documentManifest;
        this._recoveryStore = recoveryStore;
    }

    execute(documentManager) {
        const document = documentManager.document;
        const id = document.world.id;
        const json = this._documentSerializer.serialize(document);
        const contentHash = computeContentHash(JSON.stringify(json));

        const savedRevision = this._readSavedRevision(id);
        const recoveryRevision = this._readRecoveryRevision(id);
        const revision = DocumentRevision.nextRevision(savedRevision, recoveryRevision);

        this._storageProvider.save(id, json);
        this._documentManifest.upsert({
            id,
            title: document.metadata.title,
            modified: new Date().toISOString(),
            revision,
            contentHash
        });

        // The explicit save supersedes any recovery checkpoint.
        if (this._recoveryStore) {
            this._recoveryStore.remove(id);
        }

        documentManager.markSaved();
        return id;
    }

    _readSavedRevision(documentId) {
        const entry = this._documentManifest.find(documentId);
        return entry && Number.isFinite(entry.revision) ? entry.revision : 0;
    }

    _readRecoveryRevision(documentId) {
        if (!this._recoveryStore || !this._recoveryStore.exists(documentId)) {
            return 0;
        }
        const checkpoint = this._recoveryStore.load(documentId);
        return checkpoint && Number.isFinite(checkpoint.revision) ? checkpoint.revision : 0;
    }
}
