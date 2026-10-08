import { DocumentSerializer } from '../../serializer/DocumentSerializer.js';
import { DocumentCloneService } from './DocumentCloneService.js';
import { License } from '../../core/License.js';
import { resolveSigningIdentityId } from '../../identity/resolveSigningIdentityId.js';
import { ForkFailureReason } from './ForkFailureReason.js';
import { forkTitle, untitledWorldTitle } from './DocumentTitles.js';
import { ContentReference } from '../../core/ContentReference.js';
import { isStorageEntryNotLoadedError, retryWhenLoaded } from '../../storage/StorageEntryNotLoadedError.js';

// Creates a new Document derived from an existing one. The source is
// loaded from storage by its world id (publication.documentId), then
// cloned via DocumentCloneService — the single cloning mechanism shared
// with World View's Duplicate/Fork (0.1.42): fresh instance identities
// throughout, "Fork of <title>", the current user as author, lineage via
// parentDocumentId. The result is an ordinary editable Document, ready
// to be opened by EditorSession.
//
// Someone else's published build (one opened from a shared link, or found
// in the World) is not a document on this device: its bytes are kept in
// `contentStore` under its Publication's content hash. With no document by
// that id, the build is read from there, and used only when it matches the
// hash the Publication signed. Reading it can throw
// StorageEntryNotLoadedError while the content is on disk only; the caller
// retries once it is loaded (storage/StorageEntryNotLoadedError.js,
// retryWhenLoaded).
export class ForkDocumentUseCase {
    constructor(
        storageProvider,
        documentSerializer = new DocumentSerializer(),
        documentCloneService = new DocumentCloneService(),
        contentStore = null
    ) {
        this._storageProvider = storageProvider;
        this._documentSerializer = documentSerializer;
        this._documentCloneService = documentCloneService;
        this._contentStore = contentStore;
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
            // 0.9.353 — see application/document/ForkFailureReason.js's own
            // header: a structural signal the UI boundary can branch on,
            // never a string it has to pattern-match out of `.message`.
            error.reason = ForkFailureReason.LICENSE_DENIED;
            throw error;
        }
    }


        const json = this._storageProvider.load(sourceDocumentId) ?? this._publishedBuild(sourceDocumentId, sourcePublication);
        if (json === null) {
            const error = new Error(`ForkDocumentUseCase: no document found with id "${sourceDocumentId}"`);
            error.reason = ForkFailureReason.MATERIAL_UNAVAILABLE;
            throw error;
        }
        
        const sourceDocument = this._documentSerializer.deserialize(json);
        const currentUser = identityProvider ? identityProvider.currentUser() : null;
        const sourceTitle = sourceDocument.metadata.title || untitledWorldTitle();

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
            title: forkTitle(sourceTitle),
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

    // Whether `error`, thrown by execute(), means only that the build is still
    // on disk: executeWhenLoaded() then makes the copy.
    isWaitingForStorage(error) {
        return isStorageEntryNotLoadedError(error) && Boolean(error.ready);
    }

    // execute(), retried while the build being read is still on disk only.
    async executeWhenLoaded(sourceDocumentId, identityProvider = null, sourcePublication = null) {
        return retryWhenLoaded(() => this.execute(sourceDocumentId, identityProvider, sourcePublication));
    }

    // The published build's JSON, or null when there is none to read: no
    // content store, no Publication of this document, its build not on this
    // device, or bytes that don't match the hash it signed.
    _publishedBuild(sourceDocumentId, sourcePublication) {
        if (!this._contentStore || !sourcePublication || sourcePublication.documentId !== sourceDocumentId) return null;
        const hash = sourcePublication.contentReference?.hash ?? sourcePublication.contentHash;
        if (!hash) return null;
        const reference = new ContentReference({ hash });
        if (!this._contentStore.has(reference)) return null;
        const bytes = typeof this._contentStore.getSync === 'function' ? this._contentStore.getSync(reference) : null;
        if (typeof bytes !== 'string' || !reference.verify(bytes)) return null;
        try {
            return JSON.parse(bytes);
        } catch {
            return null;
        }
    }
}
