import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { DocumentCloneService } from './DocumentCloneService.js';
import { LoadPublishedSnapshotUseCase } from './LoadPublishedSnapshotUseCase.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';

// Forks a Published World into a new editable Document (0.2.8).
//
// The pipeline enforces snapshot integrity BEFORE entering the domain:
//   1. Load the published snapshot via LoadPublishedSnapshotUseCase
//      (which verifies contentHash and rejects corrupted snapshots).
//   2. Clone via DocumentCloneService (fresh identities throughout).
//   3. Return a new editable Document, ready for EditorSession.
//
// Invariants enforced:
//   - The source Publication is NEVER mutated.
//   - The source snapshot at `snapshot:{publicationId}` is NEVER touched.
//   - The source WorldPlacement is NEVER touched.
//   - The fork gets a completely new documentId (world.id).
//   - The fork's parentDocumentId points to the SOURCE document's
//     world.id, establishing lineage without coupling to the snapshot.
//
// The fork does NOT automatically create a WorldPlacement. Forking is
// a content operation; placing is a spatial operation. These remain
// separate concerns.
//
// Usage:
//   const forkedDocument = forkPublishedWorldUseCase.execute(
//       publication, identityProvider
//   );
//   // forkedDocument is now a fresh, editable Document.
//   // Open it in an EditorSession or WorldNavigationSession.
export class ForkPublishedWorldUseCase {
    constructor(
        publisherProvider,
        documentSerializer = new DocumentSerializer(),
        documentCloneService = new DocumentCloneService()
    ) {
        this._publisherProvider = publisherProvider; // Save provider for verification
        this._loadPublishedSnapshotUseCase = new LoadPublishedSnapshotUseCase(
            publisherProvider, documentSerializer
        );
        this._documentCloneService = documentCloneService;
    }

    // publication: a Publication instance (or a plain object with id,
    // contentHash, documentId — duck-typed for flexibility).
    //
    // identityProvider: optional, used to set the fork's author.
    //
    // Returns a new Document. Throws if the snapshot fails integrity
    // verification or deserialization.
    execute(publication, identityProvider = null) {
        if (!publication || !publication.id || !publication.contentHash) {
            throw new Error('ForkPublishedWorldUseCase: a valid Publication is required');
        }

        // 1. Verify the snapshot integrity BEFORE loading.
        const isValid = this._publisherProvider.verifySnapshot(
            publication.id,
            publication.contentHash
        );
        if (!isValid) {
            throw new Error(
                `ForkPublishedWorldUseCase: snapshot integrity check failed `
                + `for publication ${publication.id} (hash mismatch)`
            );
        }

        // 2. Load the verified snapshot.
        const sourceDocument = this._loadPublishedSnapshotUseCase.execute(
            publication.id
        );

        // 3. Clone with fresh identities, preserving lineage.
        const currentUser = identityProvider ? identityProvider.currentUser() : null;
        const sourceTitle = sourceDocument.metadata.title || 'Untitled';
        return this._documentCloneService.execute(sourceDocument, {
            title: `Fork of ${sourceTitle}`,
            author: currentUser ? currentUser.username : null,
            // 0.2.95 — see ForkDocumentUseCase.js's own comment: the
            // forker becomes the new owner.
            authorIdentityId: resolveSigningIdentityId(identityProvider),
            parentDocumentId: sourceDocument.world.id
        });
    }
}
