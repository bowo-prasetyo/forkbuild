import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { DocumentCloneService } from './DocumentCloneService.js';
import { License } from '../core/License.js';

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
        if (sourcePublication && !sourcePublication.license.forkAllowed) {
            throw new Error(
                `ForkDocumentUseCase: forking is not permitted under license ${sourcePublication.license.id}`
            );
        }

        const json = this._storageProvider.load(sourceDocumentId);
        if (json === null) {
            throw new Error(`ForkDocumentUseCase: no document found with id "${sourceDocumentId}"`);
        }
        
        const sourceDocument = this._documentSerializer.deserialize(json);
        const currentUser = identityProvider ? identityProvider.currentUser() : null;
        const sourceTitle = sourceDocument.metadata.title || 'Untitled';

        // 2. ATTRIBUTION: Stamp derivative license if source is known.
        let derivativeLicense = null;
        // 1. ENFORCEMENT: Hard reject if the publication license prohibits forking.
        if (sourcePublication) {
            const license = sourcePublication.license || new License(); // Defaults to UNSPECIFIED
            if (!license.forkAllowed) {
                throw new Error(
                    `ForkDocumentUseCase: forking is not permitted under license ${license.id}`
                );
            }
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
            parentDocumentId: sourceDocument.world.id,
            license: derivativeLicense
        });
    }
}
