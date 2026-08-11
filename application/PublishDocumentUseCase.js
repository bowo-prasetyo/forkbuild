// The single entry point for publishing. UI calls
// execute(documentManager) and receives a Publication — never touches
// a concrete publisher or blockchain API directly.
//
// As of 0.2.3, publishing is distinct from saving:
//   Save    → persist the editable document (mutable, overwriteable)
//   Publish → create an immutable, validated, versioned snapshot
//
// The publisher provider handles serialization, migration, validation,
// hashing, and immutable storage. This use case orchestrates the
// session-level concerns: ensuring a document is open.
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
