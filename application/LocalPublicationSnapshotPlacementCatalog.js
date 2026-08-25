import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';
import { LocalPublicationSnapshotPlacementStore } from './LocalPublicationSnapshotPlacementStore.js';

// 0.8.18 — Decentralized Snapshot Placement Foundation.
//
// The placement-side counterpart of application/
// LocalPublicationAnchorCatalog.js (0.8.2), mirrored deliberately:
//
//   PublicationSnapshotPlacement (core/PublicationSnapshotPlacement.js)
//       │
//       ▼
//   LocalPublicationSnapshotPlacementCatalog (THIS FILE)
//
//   answer:  "what placements do I know about?"
//   answer:  "which of them name this publicationId / contentHash /
//             storage backend?"
//   never:   "which of them can actually serve their bytes right now?"
//   never:   "which placement is canonical for this publication?"
//
// Cataloging Is Not Resolving — the identical restraint application/
// LocalPublicationAnchorCatalog.js's own header already draws between
// discovery and verification, applied here to locators instead of
// evidence. add() never calls application/SnapshotPlacementResolver.js,
// never checks a signature, never touches a storage backend, and never
// stores a resolution outcome. A placement whose locator is currently
// unreachable, or whose signature would fail to verify, is exactly as
// cataloggable as a perfectly valid one — this class cannot tell the
// difference, and does not try to. A caller that wants to know whether a
// cataloged placement actually still serves its bytes asks application/
// SnapshotPlacementResolver.js separately, every time, and never gets to
// cache the answer here.
//
// No PublicationSnapshotPlacementCatalogEntry wrapper class exists here,
// for the identical reason application/LocalPublicationAnchorCatalog.js's
// own header gives for skipping one: a core/
// PublicationSnapshotPlacement.js instance already IS the slim, signed
// record this catalog indexes.
//
// Identity for dedup is the placement's own `id` — first-seen-wins,
// exactly like application/LocalPublicationAnchorCatalog.js#add():
// re-adding a placement id already on file never resets `receivedAt` and
// never overwrites the stored envelope. `receivedAt` is local-only
// metadata, never part of the signed placement itself.
//
// Multiple independent placements — different placing identities,
// different storage backends, different locators, even different
// placement ids naming the SAME publicationId/contentHash — all coexist
// here, exactly as core/PublicationSnapshotPlacement.js's own header
// requires. This catalog never collapses them into one, never picks a
// "best" one, and holds no ranking, trust score, or "canonical
// placement" field anywhere in it.
//
// 0.8.21 — Persistent Snapshot Placement Catalog & Restart Recovery.
//
// This class's constructor and every method on it are UNCHANGED by
// 0.8.21 — every caller written against it before this milestone (0.8.18
// through 0.8.20, plus every existing test file that constructs it
// directly) keeps working identically. What changed is internal only:
// where this class used to read/write a `storageProvider` directly, it
// now delegates to application/LocalPublicationSnapshotPlacementStore.js,
// the named durability seam this milestone introduces — the exact "grow
// a Store class, keep the catalog's own surface untouched" move
// application/LocalPublicationAnchorCatalog.js's own header already
// describes for 0.8.15, applied here one axis over. This class remains
// the one place that turns a raw stored envelope into a real
// `PublicationSnapshotPlacement` instance — via `PublicationSnapshotPlacement
// .fromJSON()`, exactly as before, and still with NO signature
// re-verification on an ordinary read: an application-authored write
// (through add(), from application/AddPublicationSnapshotPlacementUseCase.js
// or application/PublicationSnapshotPlacementExchange.js, both of which
// already gate what reaches add() their own way) is trusted on the next
// read the same way it always was. Re-establishing that trust for
// whatever was ALREADY sitting in storage before this replica's own
// process started is a different question — application/
// RestorePublicationSnapshotPlacementCatalogUseCase.js's own, asked once,
// explicitly, at startup, never here.
export class LocalPublicationSnapshotPlacementCatalog {
    constructor(storageProvider) {
        if (!storageProvider) {
            throw new Error('LocalPublicationSnapshotPlacementCatalog: storageProvider is required');
        }
        this._store = new LocalPublicationSnapshotPlacementStore(storageProvider);
    }

    // Records `placement` (a PublicationSnapshotPlacement instance the
    // CALLER is responsible for having already structurally validated —
    // see application/AddPublicationSnapshotPlacementUseCase.js, the
    // ordinary way a placement reaches this catalog) as known to this
    // replica. Never verifies the placement's signature or locator — see
    // this class's own header. Deduplicates by the envelope's own `id`;
    // a duplicate is never an error, only the ordinary cost of the same
    // placement reaching this replica more than once. Returns
    // `{ placement, isNew }`.
    add(placement) {
        if (!placement || typeof placement.toJSON !== 'function' || !placement.id) {
            throw new Error('LocalPublicationSnapshotPlacementCatalog: a PublicationSnapshotPlacement instance is required');
        }
        const existing = this._store.get(placement.id);
        if (existing) {
            return { placement: PublicationSnapshotPlacement.fromJSON(existing.placement), isNew: false };
        }
        this._store.save(placement, new Date());
        return { placement, isNew: true };
    }

    has(placementId) {
        return this._store.has(placementId);
    }

    // The cataloged PublicationSnapshotPlacement for `placementId`, or
    // null if this replica has never seen one. Never verifies anything —
    // see this class's own header.
    get(placementId) {
        const entry = this._store.get(placementId);
        return entry ? PublicationSnapshotPlacement.fromJSON(entry.placement) : null;
    }

    // Withdraws a placement this replica knows about, by id. LOCAL ONLY
    // — mirrors application/LocalPublicationAnchorCatalog.js#remove()'s
    // own header: forgetting a placement here never un-attests it, and
    // never makes the locator it claimed any less (or more) real for a
    // replica that still has it. Returns true if an entry existed and
    // was removed.
    remove(placementId) {
        return this._store.remove(placementId);
    }

    // Every placement known to this replica, most recently RECEIVED
    // first — deterministic, and ordered by `receivedAt`, never by the
    // envelope's own self-reported `placedAt` (a placing-identity-
    // controlled field is never the right axis for what THIS replica
    // considers "newest to it" — the identical restraint application/
    // LocalPublicationAnchorCatalog.js#list() already applies to
    // `anchoredAt`).
    list() {
        return this._sorted(this._store.list()).map((entry) => PublicationSnapshotPlacement.fromJSON(entry.placement));
    }

    // The ISO timestamp this replica first cataloged `placementId` at, or
    // null if it has never been cataloged.
    getReceivedAt(placementId) {
        const entry = this._store.get(placementId);
        return entry ? entry.receivedAt : null;
    }

    // Every cataloged placement naming `publicationId` — every
    // independent locator this replica has seen about that publication,
    // none more authoritative than another.
    findByPublicationId(publicationId) {
        return this._filtered((entry) => entry.placement.publicationId === publicationId);
    }

    // Every cataloged placement naming `contentHash` — the same locator
    // search as findByPublicationId(), narrowed to the bytes themselves
    // rather than one particular publication envelope that named them.
    findByContentHash(contentHash) {
        return this._filtered((entry) => entry.placement.contentHash === contentHash);
    }

    // Every cataloged placement whose own `storage` equals `storage` —
    // e.g. every known `ipfs` placement, regardless of which publication
    // or placing identity. A caller narrows further with its own
    // in-memory filter; this catalog never learns what a storage string
    // MEANS.
    findByStorage(storage) {
        return this._filtered((entry) => entry.placement.storage === storage);
    }

    _filtered(predicate) {
        return this._sorted(this._store.list().filter(predicate))
            .map((entry) => PublicationSnapshotPlacement.fromJSON(entry.placement));
    }

    _sorted(entries) {
        return [...entries].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
    }
}
