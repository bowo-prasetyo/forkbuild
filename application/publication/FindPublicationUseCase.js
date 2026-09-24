// The single entry point for retrieving one specific publication by id.
export class FindPublicationUseCase {
    constructor(discoveryProvider) {
        this._discoveryProvider = discoveryProvider;
    }

    execute(id) {
        return this._discoveryProvider.findById(id);
    }

    executeByDocumentId(documentId) {
        return this._discoveryProvider.findByDocumentId(documentId);
    }
}
