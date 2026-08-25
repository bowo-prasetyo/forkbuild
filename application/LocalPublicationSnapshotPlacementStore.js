export const PUBLICATION_SNAPSHOT_PLACEMENT_STORE_KEY = 'publication-snapshot-placement-catalog:entries';

// 0.8.21 — Persistent Snapshot Placement Catalog & Restart Recovery.
//
// application/LocalPublicationSnapshotPlacementCatalog.js (0.8.18) has
// always taken a StorageProvider and always written every add() straight
// through it — this replica's placement catalog was never actually
// in-memory-only. What was missing was never durability itself; it was a
// NAMED boundary between "durable bytes on disk" and "what the catalog
// will vouch for" — the exact gap application/
// LocalPublicationAnchorStore.js (0.8.15) already closed for evidence,
// closed here for locators. Before this milestone, a catalog read
// (`get()`/`list()`) turned whatever JSON happened to be sitting in
// storage straight into a PublicationSnapshotPlacement instance, with no
// re-validation and no signature check — a tampered or corrupted record
// injected directly into storage (by a bug, another script sharing the
// page's origin, or a hand-edited devtools entry) would be served back
// exactly as confidently as one that had actually passed application/
// PublicationSnapshotPlacementExchange.js#importPlacement()'s own
// validate → construct → verify-signature gate.
//
// This class is the durable half of that split, and now the ONLY thing
// that touches the raw storage bytes for the placement catalog —
// application/LocalPublicationSnapshotPlacementCatalog.js (unchanged
// constructor, unchanged public API, unchanged behavior for every
// existing caller) delegates to an instance of this class instead of
// calling a StorageProvider directly. application/
// RestorePublicationSnapshotPlacementCatalogUseCase.js is the other
// caller: the ONE place that walks list() and re-runs every record
// through the ordinary import boundary before trusting it, pruning
// anything that doesn't hold up (see that file's own header).
//
// Keeps the IDENTICAL storage key application/
// LocalPublicationSnapshotPlacementCatalog.js already wrote to before
// this milestone — a replica upgrading from 0.8.18/0.8.19/0.8.20 finds
// every placement it already cataloged exactly where this class expects
// it, with no migration step of any kind.
//
// DELIBERATELY DUMB. This class never validates, never constructs a
// PublicationSnapshotPlacement, never checks a signature, never contacts
// IPFS or any other storage backend, and never imports core/
// PublicationSnapshotPlacement.js at all — every method here operates on
// plain, JSON-safe values. `get()`/`list()` hand back the RAW envelope
// (`{ placement: <plain JSON>, receivedAt: <ISO string> }`) exactly as
// stored, not a hydrated instance — from this class's own point of view,
// what's in storage is an UNTRUSTED byte source, exactly as untrusted as
// a peer message or an imported package (see docs/Principles.md, "A
// Persistent Store Is An Untrusted Byte Source, Not A Second Trust Root
// (0.8.15)," extended here to placement locators). A caller that wants a
// real PublicationSnapshotPlacement decides for itself whether it's
// willing to skip re-verification (application/
// LocalPublicationSnapshotPlacementCatalog.js, for a record this replica
// already wrote itself) or must re-verify first (application/
// RestorePublicationSnapshotPlacementCatalogUseCase.js, for a record this
// replica is only now choosing to trust again after a restart). This
// class also never resolves — it has no notion of retrieving bytes from a
// locator, and never holds a resolution observation of any kind (see
// application/SnapshotPlacementResolutionObservation.js's own header,
// "NEVER PERSISTED, NEVER SHARED" — this store is exactly where that
// restraint would be violated if it were ever weakened).
//
// Same flat, single-key, read-modify-write shape application/
// LocalPublicationAnchorStore.js already established — this class only
// names that shape and gives it a seam of its own, one domain over.
export class LocalPublicationSnapshotPlacementStore {
    constructor(storageProvider) {
        if (!storageProvider) {
            throw new Error('LocalPublicationSnapshotPlacementStore: storageProvider is required');
        }
        this._storageProvider = storageProvider;
    }

    // Persists `placement` (a PublicationSnapshotPlacement instance — this
    // class calls its own `toJSON()`, never trusts a plain object here)
    // together with `receivedAt` (a Date, or an ISO string — the caller's
    // choice, because application/
    // RestorePublicationSnapshotPlacementCatalogUseCase.js never needs
    // this method at all, but application/
    // LocalPublicationSnapshotPlacementCatalog.js#add() calls it with
    // `new Date()` for a genuinely new placement).
    //
    // FIRST-SEEN-WINS, enforced here rather than merely relied upon by a
    // caller: re-saving an id already on file is a no-op that returns
    // `false` — it never resets `receivedAt` and never overwrites the
    // stored envelope. Returns `true` when a new record was actually
    // written.
    save(placement, receivedAt) {
        if (!placement || typeof placement.toJSON !== 'function' || !placement.id) {
            throw new Error('LocalPublicationSnapshotPlacementStore: a PublicationSnapshotPlacement instance is required');
        }
        if (this.has(placement.id)) {
            return false;
        }
        const receivedAtDate = receivedAt instanceof Date ? receivedAt : new Date(receivedAt);
        if (Number.isNaN(receivedAtDate.getTime())) {
            throw new Error('LocalPublicationSnapshotPlacementStore: receivedAt must be a valid date');
        }
        const all = this._loadAll();
        all.push({ placement: placement.toJSON(), receivedAt: receivedAtDate.toISOString() });
        this._storageProvider.save(PUBLICATION_SNAPSHOT_PLACEMENT_STORE_KEY, all);
        return true;
    }

    // True iff a record whose OWN `placement.id` equals `placementId` is
    // on file. Defensive against a malformed entry already sitting in
    // storage — see this class's own header — an entry missing an `id`
    // (or missing `placement` entirely) simply never matches; it never
    // throws.
    has(placementId) {
        return this._loadAll().some((entry) => entry && entry.placement && entry.placement.id === placementId);
    }

    // The RAW envelope on file for `placementId`, or null. `placement`
    // here is PLAIN JSON, exactly as it was persisted — never a hydrated
    // PublicationSnapshotPlacement, and never re-checked in any way. See
    // this class's own header for why.
    get(placementId) {
        const entry = this._loadAll().find((e) => e && e.placement && e.placement.id === placementId);
        return entry ? { placement: entry.placement, receivedAt: entry.receivedAt } : null;
    }

    // Withdraws the record for `placementId`, by id. Used both by
    // application/LocalPublicationSnapshotPlacementCatalog.js#remove()
    // (an ordinary local withdrawal) and by application/
    // RestorePublicationSnapshotPlacementCatalogUseCase.js (pruning a
    // record that failed re-validation on restart) — this class has no
    // way to tell the two apart, and does not need to. Returns true if a
    // record existed and was removed.
    remove(placementId) {
        const all = this._loadAll();
        const index = all.findIndex((entry) => entry && entry.placement && entry.placement.id === placementId);
        if (index === -1) {
            return false;
        }
        all.splice(index, 1);
        this._storageProvider.save(PUBLICATION_SNAPSHOT_PLACEMENT_STORE_KEY, all);
        return true;
    }

    // Every RAW envelope on file, in storage order — never sorted (that
    // is application/LocalPublicationSnapshotPlacementCatalog.js#list()'s
    // own job, over records it has already decided to trust) and never
    // hydrated. Defensive against a garbage entry (even `null` itself) the
    // same way has()/get() are — a caller that walks this list
    // (application/RestorePublicationSnapshotPlacementCatalogUseCase.js)
    // sees a `{ placement: null, receivedAt: null }` placeholder rather
    // than a crash, and rejects it the same way it would any other
    // structurally invalid record.
    list() {
        return this._loadAll().map((entry) => ({
            placement: entry && entry.placement ? entry.placement : null,
            receivedAt: entry && entry.receivedAt ? entry.receivedAt : null
        }));
    }

    _loadAll() {
        return this._storageProvider.load(PUBLICATION_SNAPSHOT_PLACEMENT_STORE_KEY) || [];
    }
}
