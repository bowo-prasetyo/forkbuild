import { ContentResolver } from './ContentResolver.js';

// 0.8.25 — Explicit Snapshot Placement Creation UX.
//
// The content-reading counterpart of discovery/
// PublicationCatalogDiscoveryProvider.js, one axis over — see that
// file's own header for why a bridge is needed at all. application/
// CreateExternalSnapshotPlacementUseCase.js (0.8.18) reads a
// publication's own locally stored bytes back through a `contentResolver`
// shaped like THIS file's own base class: `resolve(publicationId)` /
// `verify(publicationId, expectedHash)`, mirroring discovery/
// LocalContentResolver.js's identical contract against the older
// `Publisher`-based world.
//
// The Publication Center this codebase actually ships stores a
// publication's bytes differently: application/PublicationResolver.js
// (0.7.0/0.7.1) puts them, content-addressed, into a content/
// ContentStore.js keyed by the publication's OWN contentReference — never
// by publicationId. This class is the bridge between the two: given a
// publicationId, it looks the publication up in an application/
// LocalPublicationCatalog.js (for its contentReference) and then reads
// the bytes back from the SAME content/ContentStore.js instance
// application/CreatePublicationResolverUseCase.js already wired for
// local publish/resolve — never a second, disconnected store.
//
// LOCAL, SYNCHRONOUS, DELIBERATELY. `resolve()`/`verify()` are called
// unawaited by application/CreateExternalSnapshotPlacementUseCase.js
// itself (see that file's own "local integrity check" / "retrieve local
// bytes" pipeline steps, both explicitly local) — so this class only
// ever makes sense wired against a synchronous content/LocalContentStore
// .js, exactly as content/LocalContentStore.js#get() already is, never
// against a network-backed store like content/IpfsContentStore.js. That
// restriction is a fact about how this class is composed at ui/main.js's
// own composition root, not something this class enforces itself.
export class PublicationCatalogContentResolver extends ContentResolver {
    constructor(publicationCatalog, contentStore) {
        super();
        if (!publicationCatalog || typeof publicationCatalog.get !== 'function') {
            throw new Error('PublicationCatalogContentResolver: a LocalPublicationCatalog is required');
        }
        if (!contentStore || typeof contentStore.get !== 'function') {
            throw new Error('PublicationCatalogContentResolver: a ContentStore is required');
        }
        this._publicationCatalog = publicationCatalog;
        this._contentStore = contentStore;
    }

    // The raw, parsed snapshot JSON for `publicationId`, or null if the
    // publication is unknown or its bytes are not (or no longer) present
    // in this replica's own content store.
    resolve(publicationId) {
        const bytes = this._readBytes(publicationId);
        return bytes === null ? null : JSON.parse(bytes);
    }

    // Whether this replica's own stored bytes for `publicationId` still
    // hash to `expectedHash` — always the publication's OWN
    // contentReference.hash, per application/
    // CreateExternalSnapshotPlacementUseCase.js's own header. Delegates to
    // core/ContentReference.js#verify(), the identical recomputation
    // application/PublicationResolver.js#resolve() step 5 already runs.
    verify(publicationId, expectedHash) {
        const publication = this._publicationCatalog.get(publicationId);
        if (!publication) return false;
        const bytes = this._readBytes(publicationId);
        if (bytes === null) return false;
        return publication.contentReference.hash === expectedHash && publication.contentReference.verify(bytes);
    }

    _readBytes(publicationId) {
        const publication = this._publicationCatalog.get(publicationId);
        if (!publication || !publication.contentReference) return null;
        const bytes = this._contentStore.get(publication.contentReference);
        return bytes === null || bytes === undefined ? null : bytes;
    }
}
