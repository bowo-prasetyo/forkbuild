export const PUBLICATION_ANCHOR_STORE_KEY = 'publication-anchor-catalog:entries';

// 0.8.15 — Persistent External Evidence Catalog & Restart Recovery.
//
// application/LocalPublicationAnchorCatalog.js (0.8.2) has always taken a
// StorageProvider and always written every add() straight through it —
// this replica's anchor catalog was never actually in-memory-only. What
// was missing was never durability itself; it was a NAMED boundary
// between "durable bytes on disk" and "what the catalog will vouch for."
// Before this milestone, a catalog read (`get()`/`list()`) turned
// whatever JSON happened to be sitting in storage straight into a
// PublicationAnchor instance, with no re-validation and no signature
// check — a tampered or corrupted record injected directly into storage
// (by a bug, another script sharing the page's origin, or a hand-edited
// devtools entry) would be served back exactly as confidently as one
// that had actually passed application/PublicationAnchorExchange.js#
// importAnchor()'s own validate → construct → verify-signature gate.
//
// This class is the durable half of that split, and now the ONLY thing
// that touches the raw storage bytes for the anchor catalog — application/
// LocalPublicationAnchorCatalog.js (unchanged constructor, unchanged
// public API, unchanged behavior for every existing caller) delegates to
// an instance of this class instead of calling a StorageProvider
// directly. application/RestorePublicationAnchorCatalogUseCase.js is the
// other caller: the ONE place that walks list() and re-runs every record
// through the ordinary import boundary before trusting it, pruning
// anything that doesn't hold up (see that file's own header).
//
// DELIBERATELY DUMB. This class never validates, never constructs a
// PublicationAnchor, never checks a signature, and never imports
// core/PublicationAnchor.js at all — every method here operates on plain,
// JSON-safe values. `get()`/`list()` hand back the RAW envelope
// (`{ anchor: <plain JSON>, receivedAt: <ISO string> }`) exactly as
// stored, not a hydrated instance — from this class's own point of view,
// what's in storage is an UNTRUSTED byte source, exactly as untrusted as
// a peer message or an imported package (see docs/Principles.md, "A
// Persistent Store Is An Untrusted Byte Source, Not A Second Trust Root
// (0.8.15)"). A caller that wants a real PublicationAnchor decides for
// itself whether it's willing to skip re-verification (application/
// LocalPublicationAnchorCatalog.js, for a record this replica already
// wrote itself) or must re-verify first (application/
// RestorePublicationAnchorCatalogUseCase.js, for a record this replica is
// only now choosing to trust again after a restart).
//
// Same flat, single-key, read-modify-write shape application/
// LocalPublicationAnchorCatalog.js's own storage access already used —
// this class only names that shape and gives it a seam of its own.
export class LocalPublicationAnchorStore {
    constructor(storageProvider) {
        if (!storageProvider) {
            throw new Error('LocalPublicationAnchorStore: storageProvider is required');
        }
        this._storageProvider = storageProvider;
    }

    // Persists `anchor` (a PublicationAnchor instance — this class calls
    // its own `toJSON()`, never trusts a plain object here) together with
    // `receivedAt` (a Date, or an ISO string — the caller's choice,
    // because application/RestorePublicationAnchorCatalogUseCase.js never
    // needs this method at all, but application/
    // LocalPublicationAnchorCatalog.js#add() calls it with `new Date()`
    // for a genuinely new anchor).
    //
    // FIRST-SEEN-WINS, enforced here rather than merely relied upon by a
    // caller: re-saving an id already on file is a no-op that returns
    // `false` — it never resets `receivedAt` and never overwrites the
    // stored envelope. Returns `true` when a new record was actually
    // written.
    save(anchor, receivedAt) {
        if (!anchor || typeof anchor.toJSON !== 'function' || !anchor.id) {
            throw new Error('LocalPublicationAnchorStore: a PublicationAnchor instance is required');
        }
        if (this.has(anchor.id)) {
            return false;
        }
        const receivedAtDate = receivedAt instanceof Date ? receivedAt : new Date(receivedAt);
        if (Number.isNaN(receivedAtDate.getTime())) {
            throw new Error('LocalPublicationAnchorStore: receivedAt must be a valid date');
        }
        const all = this._loadAll();
        all.push({ anchor: anchor.toJSON(), receivedAt: receivedAtDate.toISOString() });
        this._storageProvider.save(PUBLICATION_ANCHOR_STORE_KEY, all);
        return true;
    }

    // True iff a record whose OWN `anchor.id` equals `anchorId` is on
    // file. Defensive against a malformed entry already sitting in
    // storage — see this class's own header — an entry missing an `id`
    // (or missing `anchor` entirely) simply never matches; it never
    // throws.
    has(anchorId) {
        return this._loadAll().some((entry) => entry && entry.anchor && entry.anchor.id === anchorId);
    }

    // The RAW envelope on file for `anchorId`, or null. `anchor` here is
    // PLAIN JSON, exactly as it was persisted — never a hydrated
    // PublicationAnchor, and never re-checked in any way. See this
    // class's own header for why.
    get(anchorId) {
        const entry = this._loadAll().find((e) => e && e.anchor && e.anchor.id === anchorId);
        return entry ? { anchor: entry.anchor, receivedAt: entry.receivedAt } : null;
    }

    // Withdraws the record for `anchorId`, by id. Used both by application/
    // LocalPublicationAnchorCatalog.js#remove() (an ordinary local
    // withdrawal) and by application/
    // RestorePublicationAnchorCatalogUseCase.js (pruning a record that
    // failed re-validation on restart) — this class has no way to tell
    // the two apart, and does not need to. Returns true if a record
    // existed and was removed.
    remove(anchorId) {
        const all = this._loadAll();
        const index = all.findIndex((entry) => entry && entry.anchor && entry.anchor.id === anchorId);
        if (index === -1) {
            return false;
        }
        all.splice(index, 1);
        this._storageProvider.save(PUBLICATION_ANCHOR_STORE_KEY, all);
        return true;
    }

    // Every RAW envelope on file, in storage order — never sorted (that
    // is application/LocalPublicationAnchorCatalog.js#list()'s own job,
    // over records it has already decided to trust) and never hydrated.
    // Defensive against a garbage entry (even `null` itself) the same way
    // has()/get() are — a caller that walks this list (application/
    // RestorePublicationAnchorCatalogUseCase.js) sees a `{ anchor: null,
    // receivedAt: null }` placeholder rather than a crash, and rejects it
    // the same way it would any other structurally invalid record.
    list() {
        return this._loadAll().map((entry) => ({
            anchor: entry && entry.anchor ? entry.anchor : null,
            receivedAt: entry && entry.receivedAt ? entry.receivedAt : null
        }));
    }

    _loadAll() {
        return this._storageProvider.load(PUBLICATION_ANCHOR_STORE_KEY) || [];
    }
}
