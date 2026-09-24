// Removes a publication and its immutable snapshot. The editable
// document is NOT touched — unpublishing never destroys the source.
//
// This is the mirror of PublishDocumentUseCase: publish creates an
// immutable artifact; unpublish removes it. The document remains
// fully editable in both cases.
export class UnpublishDocumentUseCase {
    constructor(publisherProvider) {
        this._publisherProvider = publisherProvider;
    }

    // Returns true if the publication existed and was removed.
    execute(publicationId) {
        if (!publicationId) {
            throw new Error('UnpublishDocumentUseCase: publicationId is required');
        }
        return this._publisherProvider.unpublish(publicationId);
    }
}
