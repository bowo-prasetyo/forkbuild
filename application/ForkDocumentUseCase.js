import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { DocumentCloneService } from './DocumentCloneService.js';
import { License } from '../core/License.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { ForkFailureReason } from './ForkFailureReason.js';

// Creates a new Document derived from an existing one. The source is
// loaded from storage by its world id (publication.documentId), then
// cloned via DocumentCloneService — the single cloning mechanism shared
// with World View's Duplicate/Fork (0.1.42): fresh instance identities
// throughout, "Fork of <title>", the current user as author, lineage via
// parentDocumentId. The result is an ordinary editable Document, ready
// to be opened by EditorSession.
export class ForkDocumentUseCase {
    constructor(
        storageProvider,
        documentSerializer = new DocumentSerializer(),
        documentCloneService = new DocumentCloneService()
    ) {
        this._storageProvider = storageProvider;
        this._documentSerializer = documentSerializer;
        this._documentCloneService = documentCloneService;
    }

    execute(sourceDocumentId, identityProvider = null, sourcePublication = null) {
        // 1. ENFORCEMENT: Hard reject if the publication license prohibits forking.
    if (sourcePublication) {
        const pubLicense = sourcePublication.license instanceof License 
            ? sourcePublication.license 
            : new License(sourcePublication.license || {});
            
        if (!pubLicense.forkAllowed) {
            const error = new Error(
                `ForkDocumentUseCase: forking is not permitted under license ${pubLicense.id}`
            );
            // 0.9.353 — see application/ForkFailureReason.js's own
            // header: a structural signal the UI boundary can branch on,
            // never a string it has to pattern-match out of `.message`.
            error.reason = ForkFailureReason.LICENSE_DENIED;
            throw error;
        }
    }


        const json = this._storageProvider.load(sourceDocumentId);
        if (json === null) {
            const error = new Error(`ForkDocumentUseCase: no document found with id "${sourceDocumentId}"`);
            error.reason = ForkFailureReason.MATERIAL_UNAVAILABLE;
            throw error;
        }
        
        const sourceDocument = this._documentSerializer.deserialize(json);
        const currentUser = identityProvider ? identityProvider.currentUser() : null;
        const sourceTitle = sourceDocument.metadata.title || 'Untitled';

        // 2. ATTRIBUTION: Stamp derivative license if source is known.
        let derivativeLicense = null;
        // 1. ENFORCEMENT: Hard reject if the publication license prohibits forking.
    if (sourcePublication) {
        const pubLicense = sourcePublication.license instanceof License 
            ? sourcePublication.license 
            : new License(sourcePublication.license || {});
            
        derivativeLicense = new License({
            id: pubLicense.id, // Inherit license type
            attribution: {
                author: sourcePublication.author || sourceDocument.metadata.author,
                title: sourcePublication.title || sourceTitle,
                sourcePublicationId: sourcePublication.id,
                sourceDocumentId: sourceDocument.world.id
            }
        });
        } else if (sourceDocument.metadata.license && sourceDocument.metadata.license.id !== 'UNSPECIFIED') {
            derivativeLicense = new License({
                id: sourceDocument.metadata.license.id,
                attribution: {
                    author: sourceDocument.metadata.author,
                    title: sourceTitle,
                    sourcePublicationId: null,
                    sourceDocumentId: sourceDocument.world.id
                }
            });
        }

        return this._documentCloneService.execute(sourceDocument, {
            title: `Fork of ${sourceTitle}`,
            author: currentUser ? currentUser.username : null,
            // 0.2.95 — see core/DocumentMetadata.js's own comment: the
            // FORKER becomes the new owner, never the source document's
            // original author, so this is resolved fresh here rather
            // than falling through DocumentCloneService's own
            // source-value default.
            authorIdentityId: resolveSigningIdentityId(identityProvider),
            parentDocumentId: sourceDocument.world.id,
            license: derivativeLicense
        });
    }
}
