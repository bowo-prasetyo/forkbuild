// 0.9.52 — Publication Distribution Lifecycle Store Boundary.
//
// 0.9.49's own executor deliberately has no memory — it runs once, returns a
// `PublicationDistributionResult`, and forgets. 0.9.50 turns that result into
// an explicit lifecycle description; 0.9.51 turns one already-held lifecycle
// description plus one already-obtained fact into the next lifecycle
// description. Every one of those three files is a pure function: called
// again with the same input, it returns the same output, and nothing
// anywhere remembers what was last produced. This file is the first piece of
// this whole family that remembers anything at all — the one question none
// of 0.9.48/0.9.49/0.9.50/0.9.51 answers: once a caller HAS a
// `PublicationDistributionLifecycle` description, where does it live between
// one call and the next?
//
//   execute (0.9.49) -> result (0.9.48 shape)
//        │
//        ▼
//   describe (0.9.50) -> lifecycle
//        │
//        ▼
//   transition (0.9.51) -> next lifecycle
//        │
//        ▼
//   store.set(publication.id, lifecycle)   ★ (THIS)
//        │
//        ▼
//   store.get(publication.id)  ->  the same lifecycle, later
//
// A STORE, NEVER A DATABASE ADAPTER, EVENT LOG, CACHE, OR SYNCHRONIZATION
// MECHANISM. This file exists to answer exactly one question: "what is the
// most recently remembered lifecycle description for this publication?" It
// holds a single current value per publication identity — never a history,
// never an event stream, never a cache with eviction or expiry, and never
// anything that talks to another process, tab, or machine. A caller that
// wants any of those builds it on top of this file, in later, unscheduled
// work — this file is the seam, not the mechanism.
//
// KEYED BY `publication.id` — NEVER BY A DISTRIBUTION-DIMENSION IDENTITY.
// This milestone's own request settled this explicitly: not material uri,
// not discovery uri, not relay origin, not a discovery tag, not a Nostr
// event id. Those each describe ONE distribution dimension's own facts —
// exactly the facts 0.9.50/0.9.51 already hold inside `material`/
// `discovery`. A publication's identity is a single, stable thing that
// exists independently of whether either dimension is `PRESENT` or
// `ABSENT` yet, and that is the only thing this file accepts as a key.
// `publicationId` is read as an opaque, caller-supplied string; this file
// never inspects, parses, or validates it beyond requiring it be a
// non-empty string, and never constructs one itself from a
// `Publication`, `PublicationDistributionResult`, or lifecycle value.
//
// DELIBERATELY DUMB — ACCEPTS AN ALREADY-VALID LIFECYCLE DESCRIPTION,
// INTERPRETS NOTHING. `set(publicationId, lifecycle)` means exactly
// "remember this lifecycle description under this publication identity,"
// nothing more. This file never calls `describePublicationDistributionLifecycle()`
// (0.9.50) or `transitionPublicationDistributionLifecycle()` (0.9.51),
// never imports either of them (nor `PublicationDistributionResult.js`,
// `PublicationDistributionExecutor.js`, any uploader, or any publisher),
// never validates that a stored `lifecycle` matches 0.9.50's own shape, and
// never judges whether one stored lifecycle is a legitimate successor of
// the one it replaces. Deriving, transitioning, or validating a lifecycle
// remains entirely 0.9.50's and 0.9.51's own job, done before a lifecycle
// value ever reaches this file. This file duck-types nothing about
// `lifecycle` beyond requiring it be a non-null value — see "Malformed
// input," below — so it needs no dependency on the lifecycle family at all.
//
// STORAGE, NEVER TRANSFORMATION — IDENTITY IS PRESERVED, NEVER
// RECONSTRUCTED. `set(publicationId, lifecycle)` stores the exact reference
// supplied; `get(publicationId)` returns that exact same reference back,
// never a copy, clone, or re-normalized equivalent. 0.9.50 and 0.9.51
// already freeze every lifecycle value they produce, at every level — this
// file trusts that and does no freezing, cloning, or defensive copying of
// its own:
//
//     store.set('pub-1', lifecycle);
//     store.get('pub-1') === lifecycle;   // true — the SAME object
//
// That identity equality is what makes this a storage boundary rather than
// a transformation boundary — a transformation boundary would produce an
// equivalent-but-different value; this file produces the very value it was
// given.
//
// REPLACEMENT, NEVER MERGE — INHERITED FROM 0.9.9's AND 0.9.26's OWN
// "REPLACEMENT, NOT ACCUMULATION" RULE, HELD HERE OVER A SINGLE VALUE PER
// KEY RATHER THAN A COLLECTION. `set(publicationId, lifecycle)` called
// again for a `publicationId` that already holds a value replaces it
// outright:
//
//     store.set('pub-1', lifecycleA);
//     store.set('pub-1', lifecycleB);
//     store.get('pub-1') === lifecycleB;   // true
//
// There is no merge of `lifecycleA` and `lifecycleB`, no automatic
// transition between them, no history of `lifecycleA` retained anywhere,
// and no check that `lifecycleB` is a legitimate successor of `lifecycleA`
// — that judgment belongs entirely to 0.9.51's own transition boundary,
// applied by a caller BEFORE calling `set()`, never by this file after the
// fact. This file does not become a second transition engine.
//
// MISSING ENTRIES DEGRADE TO `null`, NEVER `undefined` — MATCHING THIS
// CODEBASE'S OWN DEGRADATION STYLE AT SEVERAL EXISTING APPLICATION
// BOUNDARIES. `get(publicationId)` returns `null` for a `publicationId`
// this store has never `set()`, has had `remove()`d, or that is itself
// malformed (missing, not a string, or empty) — never `undefined`, and
// never a thrown error.
//
// `remove()` IS IDEMPOTENT. `remove(publicationId)` deletes whatever
// lifecycle currently occupies that publication identity's slot, if any,
// and returns `true` when it did or `false` when there was nothing to
// remove (including when `publicationId` is itself malformed) — a caller
// can call `remove()` on an id it is unsure about without first checking
// `get()`. Removal is plain absence afterward, never a tombstone:
// `get(publicationId)` immediately after `remove(publicationId)` returns
// `null`, indistinguishable from a `publicationId` this store has never
// heard of at all.
//
// `clear()` removes every currently-stored lifecycle. The store afterward
// behaves exactly as it did immediately after construction.
//
// LIVE, IN-MEMORY, PER-INSTANCE STATE — NOT A SINGLETON, NOT PERSISTED.
// Each `new PublicationDistributionLifecycleMemoryStore()` holds its own
// independent set of entries; nothing here is shared module-level state,
// and nothing here is written to a `StorageProvider`, `localStorage`,
// `IndexedDB`, a filesystem, or a database, and nothing here survives a
// page reload or a process restart. See this milestone's own request: "In
// particular, do not call this a persistent store yet." A caller owns
// exactly one instance for as long as it cares to keep remembering
// lifecycle descriptions.
//
// MALFORMED INPUT DEGRADES SILENTLY, NEVER THROWS. `set(publicationId,
// lifecycle)` silently does nothing when `publicationId` is missing, not a
// string, or empty, or when `lifecycle` is `undefined`, `null`, or
// otherwise falsy — there is nothing else for this file to validate about
// `lifecycle` itself, per "Deliberately dumb," above. `get(publicationId)`
// and `remove(publicationId)` treat the identical malformed `publicationId`
// the same way: `get()` returns `null`, `remove()` returns `false`. None of
// the four operations ever throws.
//
// SYNCHRONOUS ONLY. Every operation returns its result immediately, with no
// `Promise`, `async`, I/O, network call, timer, or clock read of any kind.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Persistence across process restarts, or any storage technology at
//   all** (filesystem, `localStorage`, `IndexedDB`, SQL/NoSQL database).
//   See "Live, in-memory, per-instance state," above — a later, unscheduled
//   milestone may add a persistence-backed implementation of the same
//   minimal contract this file establishes.
// - **Synchronization across tabs, processes, or machines.** This file
//   holds exactly the state one JavaScript object gives it — nothing more.
// - **History, an audit trail, version numbers, or timestamps.** `set()`
//   replaces; nothing about what was previously stored, or when, survives
//   a replacement.
// - **Concurrency control, optimistic locking, or transactions of any
//   kind.** This file exposes plain, synchronous last-write-wins semantics.
// - **Retry scheduling, background workers, or polling of any kind.**
//   Nothing here runs except in direct, synchronous response to a caller's
//   own method call.
// - **Withdrawal, confirmation, or any global success/failure judgment
//   about a stored lifecycle.** This file stores and returns opaque
//   lifecycle values; it forms no opinion on what they mean.
// - **Validating that a stored value is a well-formed
//   `PublicationDistributionLifecycle`, or deriving/transitioning one.**
//   See "Deliberately dumb," above — entirely 0.9.50's and 0.9.51's own
//   job, done before a value ever reaches this file.
// - **Change notification/subscription.** 0.9.26's own registry establishes
//   that seam for a different kind of collection; this milestone's own
//   request describes only `get`/`set`/`remove`/`clear` — a `subscribe()`
//   seam remains later, unscheduled work, added only if requested.

function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

export class PublicationDistributionLifecycleMemoryStore {
    constructor() {
        this._entries = new Map();
    }

    // The lifecycle value most recently `set()` for `publicationId`, or
    // `null` when `publicationId` is malformed (missing, not a string, or
    // empty) or has never been `set()` (or was `remove()`d/`clear()`ed
    // since). Returns the exact reference last stored — see this file's
    // own header, "Storage, never transformation."
    get(publicationId) {
        if (!isNonEmptyString(publicationId)) {
            return null;
        }
        if (!this._entries.has(publicationId)) {
            return null;
        }
        return this._entries.get(publicationId);
    }

    // Stores `lifecycle` under `publicationId`, replacing whatever was
    // previously stored there, if anything — see this file's own header,
    // "Replacement, never merge." Silently does nothing when
    // `publicationId` is malformed or `lifecycle` is `undefined`, `null`,
    // or otherwise falsy.
    set(publicationId, lifecycle) {
        if (!isNonEmptyString(publicationId) || !lifecycle) {
            return;
        }
        this._entries.set(publicationId, lifecycle);
    }

    // Removes whatever lifecycle currently occupies `publicationId`'s slot,
    // if any. Returns `true` when an entry was removed, `false` when there
    // was nothing to remove (including when `publicationId` is itself
    // malformed) — see this file's own header, "`remove()` is idempotent."
    remove(publicationId) {
        if (!isNonEmptyString(publicationId)) {
            return false;
        }
        return this._entries.delete(publicationId);
    }

    // Removes every currently-stored lifecycle. The store afterward behaves
    // exactly as it did immediately after construction.
    clear() {
        this._entries.clear();
    }
}
