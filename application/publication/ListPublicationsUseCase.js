// The single entry point for listing publications. Filters are optional
// and additive: { author } or { parentDocumentId }. No filter returns
// everything the provider knows about.
export class ListPublicationsUseCase {
    constructor(discoveryProvider) {
        this._discoveryProvider = discoveryProvider;
    }

    execute(filter = {}) {
        if (filter.author) {
            return this._discoveryProvider.findByAuthor(filter.author);
        }
        if (filter.parentDocumentId) {
            return this._discoveryProvider.findByParentId(filter.parentDocumentId);
        }
        if (filter.documentId) {
            return this._discoveryProvider.findByDocumentId(filter.documentId);
        }
        return this._discoveryProvider.list();
    }
}
