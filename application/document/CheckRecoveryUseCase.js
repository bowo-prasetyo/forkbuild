import { DocumentManifest } from './DocumentManifest.js';
import { DocumentRevision } from '../../core/DocumentRevision.js';
import { contentHashMatches } from '../../serializer/contentHash.js';

// Decides whether a recovery checkpoint should be offered for a document
// by comparing revisions: the checkpoint is available only when it is
// NEWER than the last explicit save. An older-or-equal checkpoint is
// obsolete and is discarded here. Integrity (contentHash) is also
// verified so a corrupted or tampered checkpoint is never offered.
//
// Returns a descriptor:
//   { available, documentId, recovery: DocumentRevision|null,
//     savedRevision, obsolete }
//
// This use case does NOT deserialize the document — that is
// RecoverDocumentUseCase's job. Keeping the decision separate from the
// load means startup can cheaply probe every open document.
export class CheckRecoveryUseCase {
    constructor(recoveryStore, storageProvider) {
        this._recoveryStore = recoveryStore;
        this._documentManifest = new DocumentManifest(storageProvider);
    }

    execute(documentId) {
        const savedRevision = this._readSavedRevision(documentId);
        const checkpoint = this._recoveryStore.load(documentId);

        if (!checkpoint) {
            return { available: false, documentId, recovery: null, savedRevision, obsolete: false };
        }

        // Integrity check: reject a tampered/corrupted checkpoint.
        // A checkpoint written before SHA-256 content hashes carries an
        // FNV-1a one; it is this device's own data, so it still recovers.
        if (!contentHashMatches(JSON.stringify(checkpoint.document), checkpoint.contentHash, { allowLegacy: true })) {
            this._recoveryStore.remove(documentId);
            return { available: false, documentId, recovery: null, savedRevision, obsolete: true };
        }

        const recovery = new DocumentRevision({
            documentId,
            revision: checkpoint.revision,
            savedAt: checkpoint.savedAt,
            contentHash: checkpoint.contentHash
        });

        if (recovery.isNewerThan({ revision: savedRevision })) {
            return { available: true, documentId, recovery, savedRevision, obsolete: false };
        }

        // Checkpoint is not newer than the saved document: obsolete.
        this._recoveryStore.remove(documentId);
        return { available: false, documentId, recovery: null, savedRevision, obsolete: true };
    }

    _readSavedRevision(documentId) {
        const entry = this._documentManifest.find(documentId);
        return entry && Number.isFinite(entry.revision) ? entry.revision : 0;
    }
}
