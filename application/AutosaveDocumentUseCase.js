import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { DocumentManifest } from './DocumentManifest.js';
import { DocumentRevision } from '../core/DocumentRevision.js';
import { computeContentHash } from '../serializer/contentHash.js';

// Autosave protects recent unsaved work against unexpected loss. It is
// NOT an invisible Save: it writes a recovery checkpoint to the
// RecoveryStore WITHOUT touching the canonical saved document, WITHOUT
// advancing the manifest's saved revision, WITHOUT clearing the dirty
// flag, and WITHOUT creating a Publication. Save, autosave, and publish
// remain three distinct operations.
//
// The checkpoint carries a monotonic revision (one beyond the newest of
// the saved revision and any existing checkpoint), a contentHash for
// integrity, and the serialized document itself. The document blob is the
// same canonical DocumentSerializer output used everywhere, so recovery
// later flows through the identical migrate -> validate -> deserialize
// pipeline.
export class AutosaveDocumentUseCase {
    constructor(recoveryStore, storageProvider, documentSerializer = new DocumentSerializer()) {
        this._recoveryStore = recoveryStore;
        this._documentSerializer = documentSerializer;
        this._documentManifest = new DocumentManifest(storageProvider);
    }

    // Returns the written DocumentRevision, or null when there is
    // nothing to autosave (no document, or document already clean).
    execute(documentManager) {
        const document = documentManager.document;
        if (!document) {
            return null;
        }
        if (!documentManager.state.dirty) {
            return null;
        }
        const documentId = document.world.id;
        const savedRevision = this._readSavedRevision(documentId);
        const existing = this._recoveryStore.load(documentId);
        const recoveryRevision = existing && Number.isFinite(existing.revision) ? existing.revision : 0;
        const revision = DocumentRevision.nextRevision(savedRevision, recoveryRevision);

        const serialized = this._documentSerializer.serialize(document);
        const contentHash = computeContentHash(JSON.stringify(serialized));
        const checkpoint = {
            documentId,
            revision,
            savedAt: new Date().toISOString(),
            contentHash,
            document: serialized
        };
        this._recoveryStore.save(documentId, checkpoint);

        // Deliberately NOT documentManager.markSaved(): autosave does
        // not make the document clean, and it never publishes.
        return new DocumentRevision({
            documentId,
            revision,
            savedAt: checkpoint.savedAt,
            contentHash
        });
    }

    _readSavedRevision(documentId) {
        const entry = this._documentManifest.find(documentId);
        return entry && Number.isFinite(entry.revision) ? entry.revision : 0;
    }
}
