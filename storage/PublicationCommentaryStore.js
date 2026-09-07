import { StorageProvider } from './StorageProvider.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';
import { PublicationCommentary } from '../core/PublicationCommentary.js';
import {
    addPublicationCommentary,
    getPublicationCommentaryById,
    getPublicationCommentariesForPublication
} from '../core/PublicationCommentaryCollection.js';

const COMMENTARY_STORE_KEY = 'publication-commentary:entries';

// 0.9.243 — Publication Commentary Storage Boundary.
//
// 0.9.242 drew the domain seam — core/PublicationCommentary.js (the
// immutable descriptor) and core/PublicationCommentaryCollection.js (three
// plain functions over an in-memory array) — and named persistence an
// explicitly separate, later milestone. This file is that milestone, and
// only that: the smallest possible transition from those domain objects to
// durable storage. No networking, no UI, no command/use-case layer.
//
//   PublicationCommentary                  (0.9.242, unmodified)
//        │
//        │  toJSON() / fromJSON()
//        ▼
//   PublicationCommentaryCollection        (0.9.242, unmodified — reused
//        │                                  as plain functions, never
//        │                                  reimplemented here)
//        ▼
//   PublicationCommentaryStore             (THIS FILE)
//        │  save() / getById() / getForPublication() / loadAll()
//        ▼
//   storage/StorageProvider.js             (generic, JSON-safe, injected)
//
// AN INJECTED storage/StorageProvider.js, DEFAULTING TO
// storage/LocalStorageProvider.js — the identical seam
// storage/LocalStoragePublicationObservationArchive.js (0.8.75) already
// established one domain over. A caller needs to pass nothing to get real
// persistence; a test injects an in-memory fake instead (see this file's
// own tests, and tests/DurableDocuments.test.js's `InMemoryStorageProvider`
// for the pattern). This class never touches `window.localStorage`
// directly — only the injected provider does.
//
// THE DOMAIN STAYS UNAWARE OF STORAGE. core/PublicationCommentary.js and
// core/PublicationCommentaryCollection.js import nothing from storage/ —
// this file is the ONLY bridge between them and any actual persistence
// mechanism. Conversely, this file duplicates none of
// core/PublicationCommentary.js's own validation: every record this class
// persists came from a real PublicationCommentary instance's own
// `toJSON()`, and every record it reads back is re-hydrated through that
// same class's own `fromJSON()` — never a hand-rolled parallel parser.
//
// CORRUPTED OR MALFORMED STORAGE DEGRADES TO AN EMPTY COLLECTION, NEVER A
// THROWN ERROR OR A PARTIALLY VALID INSTANCE — the identical restraint
// storage/LocalStoragePublicationObservationArchive.js's own header already
// names, and see docs/Principles.md, "Persistence Restores Historical
// Facts; It Never Resurrects Invented Ones (0.8.75)." Truly invalid JSON
// (the injected provider itself throws), a persisted value that isn't an
// array, and an individual array entry that fails
// `PublicationCommentary.fromJSON()`'s own strict-at-construction
// validation are all handled the same way: the whole payload is dropped
// for the first two, and only the one bad entry is dropped for the third —
// in no case does a corrupted byte source escape as a commentary object
// this class hands back to a caller.
//
// APPEND-ONLY, LIKE THE 0.9.242 COLLECTION IT PERSISTS. `save()` never
// truncates, reorders, or rewrites an existing record's fields — the only
// two outcomes for a `commentaryId` already on file are described below.
// There is no `remove()`, no `update()`, and no bulk `clear()` exposed by
// this class at all: a commentary, once saved, stays on file for as long
// as the injected storage itself holds it.
//
// SAME ID + IDENTICAL RECORD -> IDEMPOTENT SUCCESS (returns `false`, no
// write performed). SAME ID + A DIFFERENT RECORD -> REJECTED, by throwing
// `PublicationCommentaryConflictError`, never by silently overwriting the
// original — this is a deliberate departure from
// application/LocalPublicationAnchorStore.js's own simpler
// "first-seen-wins" rule (0.8.15), because that store's own header notes
// its conflict case "can't arise from two honestly generated packages,"
// whereas a `commentaryId` collision here has no such structural
// impossibility to lean on. "Identical" means every field `toJSON()`
// exposes matches exactly, `createdAt` included — two commentaries
// constructed separately with the same id but even a millisecond apart
// are NOT identical, and the second `save()` is rejected exactly as a
// genuinely different commentary would be. This gives `commentaryId`
// useful identity semantics without introducing any lifecycle state
// machine, edit method, or version counter.
export class PublicationCommentaryConflictError extends Error {
    constructor(commentaryId) {
        super(`PublicationCommentaryStore: commentaryId ${commentaryId} already exists with different content — refusing to overwrite it`);
        this.name = 'PublicationCommentaryConflictError';
        this.commentaryId = commentaryId;
    }
}

export class PublicationCommentaryStore {
    constructor(storageProvider = new LocalStorageProvider()) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('PublicationCommentaryStore requires a StorageProvider');
        }
        this._storageProvider = storageProvider;
    }

    // Persists `commentary` (a PublicationCommentary instance — this
    // method performs no duck-typing and constructs nothing of its own
    // from a plain object). Returns `true` when a new record was actually
    // appended, `false` when an identical record for the same
    // `commentaryId` was already on file (idempotent no-op — no write is
    // performed). Throws `PublicationCommentaryConflictError` when the
    // same `commentaryId` is already on file with a DIFFERENT record; the
    // existing record is left untouched in that case, exactly as an
    // ordinary thrown error leaves it untouched.
    save(commentary) {
        if (!(commentary instanceof PublicationCommentary)) {
            throw new Error('PublicationCommentaryStore.save() requires a PublicationCommentary instance');
        }
        const collection = this._loadCollection();
        const existing = getPublicationCommentaryById(collection, commentary.commentaryId);
        if (existing) {
            if (JSON.stringify(existing.toJSON()) === JSON.stringify(commentary.toJSON())) {
                return false;
            }
            throw new PublicationCommentaryConflictError(commentary.commentaryId);
        }
        const next = addPublicationCommentary(collection, commentary);
        this._persist(next);
        return true;
    }

    // The PublicationCommentary instance whose own `commentaryId` equals
    // `commentaryId`, or `null` when none is on file — including for a
    // persisted record that exists but fails `fromJSON()`'s own
    // validation, since `_loadCollection()` never lets such a record
    // reach this far. Never throws.
    getById(commentaryId) {
        return getPublicationCommentaryById(this._loadCollection(), commentaryId);
    }

    // Every PublicationCommentary on file whose own `publicationId` equals
    // `publicationId`, in the order they were originally saved. Two
    // Publications never contaminate each other's commentary here, even
    // when both trace back to the same underlying Document — see
    // core/PublicationCommentaryCollection.js's own header, unchanged by
    // this file. An unrecognized `publicationId` returns an empty array,
    // never `null` and never a thrown error.
    getForPublication(publicationId) {
        return getPublicationCommentariesForPublication(this._loadCollection(), publicationId);
    }

    // Every PublicationCommentary currently on file, in save order. The
    // one bulk-restoration method this milestone's own brief allows —
    // see this file's own header — for an application lifecycle that
    // needs to rehydrate its full in-memory picture from durable storage
    // at startup.
    loadAll() {
        return this._loadCollection();
    }

    // Reads the full persisted array and re-hydrates it through
    // PublicationCommentary.fromJSON(), dropping any entry that fails
    // validation. Never mutates the injected storage provider's own
    // record. Never throws — see this file's own header, "Corrupted or
    // malformed storage degrades to an empty collection."
    _loadCollection() {
        let raw;
        try {
            raw = this._storageProvider.load(COMMENTARY_STORE_KEY);
        } catch (error) {
            return [];
        }
        if (!Array.isArray(raw)) {
            return [];
        }
        let collection = [];
        for (const record of raw) {
            const commentary = PublicationCommentary.fromJSON(record);
            if (commentary) {
                collection = addPublicationCommentary(collection, commentary);
            }
        }
        return collection;
    }

    // Writes exactly `collection.map((commentary) => commentary.toJSON())`
    // — never a caller's own object reference, and never any field beyond
    // what PublicationCommentary.js's own `toJSON()` already exposes.
    _persist(collection) {
        this._storageProvider.save(COMMENTARY_STORE_KEY, collection.map((commentary) => commentary.toJSON()));
    }
}
