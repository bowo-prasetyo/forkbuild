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
//
// 0.2.23: publishing now also creates the publication's INITIAL
// placement (placePublicationUseCase + initialPlacementStrategy, both
// optional so existing callers/tests that construct this class with
// just the first two arguments are unaffected). Placement is a
// separate concern from the document/publication itself (see
// docs/Principles.md, "A Publication Is What; A Placement Is Where")
// — it is deliberately best-effort here: a placement failure is
// logged, never thrown, so a spatial-index hiccup can never prevent a
// publish that otherwise fully succeeded. Every publish this use case
// handles — Editor or World View, a fresh document or a fork — gets
// exactly one initial placement this same way; nothing needs to
// remember to call PlacePublicationUseCase separately.
export class PublishDocumentUseCase {
    constructor(publisherProvider, identityProvider, placePublicationUseCase = null, initialPlacementStrategy = null) {
        this._publisherProvider = publisherProvider;
        this._identityProvider = identityProvider;
        this._placePublicationUseCase = placePublicationUseCase;
        this._initialPlacementStrategy = initialPlacementStrategy;
    }

    execute(documentManager) {
        const document = documentManager.document;
        if (!document) {
            throw new Error('PublishDocumentUseCase: no document is currently open');
        }
        this._validate(document);
        const publication = this._publisherProvider.publish(document, this._identityProvider);
        this._placeInitially(publication);
        return publication;
    }

    _placeInitially(publication) {
        if (!this._placePublicationUseCase || !this._initialPlacementStrategy) {
            return;
        }
        try {
            const position = this._initialPlacementStrategy.computePosition({ publicationId: publication.id });
            this._placePublicationUseCase.execute(publication.id, position);
        } catch (err) {
            // Best-effort: WorldLayoutProvider's deterministic-grid
            // fallback still resolves a position for an unplaced
            // publication, so failing to place it here degrades to
            // exactly the pre-0.2.23 behavior, not a broken publish.
            console.warn(`PublishDocumentUseCase: initial placement failed for "${publication.id}" — ${err.message}`);
        }
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
