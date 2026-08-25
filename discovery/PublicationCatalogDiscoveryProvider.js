import { DiscoveryProvider } from './DiscoveryProvider.js';

// 0.8.25 — Explicit Snapshot Placement Creation UX.
//
// application/CreateExternalSnapshotPlacementUseCase.js and application/
// CreatePublicationSnapshotPlacementUseCase.js (both 0.8.18) were built
// and tested against THIS file's own base class — discovery/
// DiscoveryProvider.js#findById() — mirroring application/
// PlacePublicationUseCase.js's and application/ResolvePublicationUseCase
// .js's identical collaborator from the older, pre-0.7.0 `Publication`/
// `Publisher` world discovery/LocalDiscoveryProvider.js still serves.
//
// The Publication Center this codebase actually ships (ui/views/
// DecentralizedPublicationsView.js, wired in ui/main.js) has never used
// that world — it catalogs core/DecentralizedPublication.js instances in
// application/LocalPublicationCatalog.js, whose own lookup method is
// `get(publicationId)`, not `findById(publicationId)`. Two established,
// already-shipped classes; two different method names for the identical
// idea. This class is the thin bridge: it answers findById() by
// delegating straight to an already-existing LocalPublicationCatalog's
// own get(), so the 0.8.18 creation pipeline can finally be wired
// against the SAME catalog every other Publication Center feature
// (anchors, placement catalog, discovery, resolution) already reads and
// writes — never a second, disconnected publication index.
//
// No caching, no re-indexing, no re-validation — every call is a plain,
// synchronous pass-through. list()/findByAuthor()/findByParentId()/
// findByDocumentId() are deliberately left unimplemented (inherited from
// DiscoveryProvider, each throwing): nothing in the 0.8.18 creation
// pipeline this class exists to unblock ever calls them, and giving them
// a fabricated meaning against a catalog with a genuinely different shape
// (DecentralizedPublication has no `author`/`parentDocumentId`/
// `documentId` field) would invent behavior nobody asked for.
export class PublicationCatalogDiscoveryProvider extends DiscoveryProvider {
    constructor(publicationCatalog) {
        super();
        if (!publicationCatalog || typeof publicationCatalog.get !== 'function') {
            throw new Error('PublicationCatalogDiscoveryProvider: a LocalPublicationCatalog is required');
        }
        this._publicationCatalog = publicationCatalog;
    }

    // The cataloged DecentralizedPublication for `id`, or null — exactly
    // application/LocalPublicationCatalog.js#get()'s own return value,
    // completely unchanged.
    findById(id) {
        return this._publicationCatalog.get(id);
    }
}
