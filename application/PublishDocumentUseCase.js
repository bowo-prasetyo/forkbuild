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
//
// 0.2.21: publishing now validates the metadata the publication
// itself depends on being meaningful, BEFORE anything immutable is
// created — a title and at least one building. Deliberately NOT
// validated here: license choice. UNSPECIFIED/ALL_RIGHTS_RESERVED are
// legitimate, maximally-restrictive choices an author is entitled to
// make (0.2.13) — this use case enforces that metadata exists and is
// usable, not what it says. Shared by both surfaces: WorldNavigation
// Session.publishDocument calls this same class with a duck-typed
// { document } stand-in for documentManager, so a fork published from
// World View is validated identically to a document published from
// the Editor.
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
        this._validate(document);
        return this._publisherProvider.publish(document, this._identityProvider);
    }

    _validate(document) {
        const title = (document.metadata.title || '').trim();
        if (!title) {
            throw new Error('PublishDocumentUseCase: a title is required before publishing');
        }
        if (document.world.getBuildings().length === 0) {
            throw new Error('PublishDocumentUseCase: cannot publish an empty world');
        }
    }
}
