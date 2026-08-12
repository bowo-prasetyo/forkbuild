import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { computeContentHash } from '../serializer/contentHash.js';

// Loads a recovery checkpoint back into a Document. The checkpoint goes
// through the SAME pipeline as every other persisted document:
// verify integrity -> migrate -> validate -> deserialize. No persisted
// representation ever enters the domain without migration and validation
// (the 0.2.2 rule, surviving unchanged).
//
// Recovery returns a Document, not a session, and it NEVER creates a
// Publication, never touches placements, and never advances the saved
// revision. Autosave != Save != Publish.
export class RecoverDocumentUseCase {
    constructor(recoveryStore, documentSerializer = new DocumentSerializer()) {
        this._recoveryStore = recoveryStore;
        this._documentSerializer = documentSerializer;
    }

    // Returns { document, revision }. Throws when the checkpoint is
    // missing, fails the integrity check, or fails validation.
    execute(documentId) {
        const checkpoint = this._recoveryStore.load(documentId);
        if (!checkpoint) {
            throw new Error(`RecoverDocumentUseCase: no recovery checkpoint for "${documentId}"`);
        }
        const actualHash = computeContentHash(JSON.stringify(checkpoint.document));
        if (checkpoint.contentHash !== actualHash) {
            throw new Error(
                `RecoverDocumentUseCase: recovery checkpoint integrity check failed for "${documentId}"`
            );
        }
        // DocumentSerializer.deserialize performs migrate -> validate ->
        // deserialize. A corrupt or unverifiable checkpoint is rejected.
        const document = this._documentSerializer.deserialize(checkpoint.document);
        return { document, revision: checkpoint.revision };
    }
}
