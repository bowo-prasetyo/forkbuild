// The single entry point for publishing. UI calls
// execute(documentManager) and receives a Publication — never touches
// a concrete publisher or blockchain API directly.
// Mirrors SaveDocumentUseCase: injected dependencies, no knowledge of UI.
export class PublishDocumentUseCase {
    constructor(publisherProvider, identityProvider) {
        this._publisherProvider = publisherProvider;
        this._identityProvider = identityProvider;
    }

    execute(documentManager) {
        const document = documentManager.document;
        if (!document) {
            throw new Error('PublishDocumentUseCase: no document is currently open');
        }
        return this._publisherProvider.publish(document, this._identityProvider);
    }
}
