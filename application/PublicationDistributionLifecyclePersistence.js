import { PublicationDistributionState } from './PublicationDistributionLifecycle.js';

const KEY_PREFIX = 'publication-distribution-lifecycle:';
const INVALID_SECTION = Symbol('PublicationDistributionLifecyclePersistence.INVALID_SECTION');

// 0.9.54 — Publication Distribution Lifecycle Snapshot Persistence Boundary.
//
// Every file in this family through 0.9.53 lives entirely within one
// process's own memory. 0.9.52's own store remembers a lifecycle between
// one call and the next, and 0.9.53 lets a caller hear about it changing
// live — but both are explicit about the boundary they refuse to cross:
// 0.9.52's own header names it directly, "Live, in-memory, per-instance
// state — not a singleton, not persisted... nothing here is written to a
// StorageProvider, localStorage, IndexedDB, a filesystem, or a database,
// and nothing here survives a page reload or a process restart." This
// file is that later, unscheduled milestone, answering only the question
// 0.9.52 declined to: once a caller HAS a lifecycle snapshot, how does it
// survive the one boundary the memory store never crosses — a process
// restart?
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
//   store.set(publicationId, lifecycle)   (0.9.52, unmodified)
//        │
//        ▼
//   persistence.save(publicationId, lifecycle)   ★ (THIS)
//        │
//        ▼
//   ... process restart, or a fresh consumer entirely ...
//        │
//        ▼
//   persistence.load(publicationId)  ->  the same lifecycle FACTS, later
//
// A PERSISTENCE BOUNDARY, NEVER A SECOND MEMORY STORE. This file does not
// extend, wrap, or replace `PublicationDistributionLifecycleMemoryStore`
// (0.9.52/0.9.53) — it never imports that file, never imports
// `PublicationDistributionLifecycleTransition.js` (0.9.51), never imports
// `PublicationDistributionResult.js` (0.9.48) or
// `PublicationDistributionExecutor.js` (0.9.49), and never calls
// `describePublicationDistributionLifecycle()` (0.9.50) itself. It is a
// wholly separate, composable seam: `PublicationDistributionLifecycleMemoryStore`
// keeps staying exactly what it already is, with no `set()`-triggered
// side effect added on top of it. A caller who wants both remembers a
// lifecycle in the memory store AND separately calls `save()` here — this
// milestone's own request settled that explicitly: "I would not make the
// existing `PublicationDistributionLifecycleMemoryStore` secretly
// persistent."
//
// THE PERSISTENCE BOUNDARY STORES LIFECYCLE FACTS; IT DOES NOT EXECUTE
// LIFECYCLE TRANSITIONS. `save(publicationId, lifecycle)` persists the
// already-valid lifecycle description a caller already holds — it never
// derives lifecycle state from a `PublicationDistributionResult`, never
// validates a publication's distribution, never executes an upload or a
// publish, never transitions state, never generates a timestamp, never
// assigns a version, never compares the new value against whatever was
// previously on file, and never deduplicates a repeated write. Calling
// `save()` twice in a row with the exact same lifecycle writes twice —
// there is no equality check anywhere in this file.
//
// PUBLICATION ID AS THE STORAGE KEY — THE IDENTICAL KEY 0.9.52's OWN STORE
// ALREADY USES, NEVER A DISTRIBUTION-DIMENSION IDENTITY. Not material uri,
// not discovery uri, not relay origin, not a discovery tag, not a Nostr
// event id — see 0.9.52's own header for why. `publicationId` is read as
// an opaque, caller-supplied string, namespaced under this file's own key
// prefix before being handed to the injected persistence implementation,
// so this file's own records never collide with an unrelated key some
// other part of the engine happens to store through the same injected
// implementation — the identical scoping discipline
// `storage/LocalStorageProvider.js` already applies one layer below, and
// `application/LocalPublicationAnchorStore.js` (0.8.15) already applies
// one layer up.
//
// AN INJECTED PERSISTENCE IMPLEMENTATION — DUCK-TYPED TO
// `storage/StorageProvider.js`'s OWN `save`/`load`/`remove`/`list` SHAPE,
// NEVER A CONCRETE TECHNOLOGY THIS FILE CHOOSES ITSELF. This file has no
// idea whether the object handed to its constructor is backed by
// `localStorage`, a filesystem, an in-memory `Map`, or anything else — it
// only ever calls the four methods that shape already promises. It
// imports nothing from `storage/`, and never checks `instanceof
// StorageProvider`; it only verifies, once, at construction, that the
// four methods it needs actually exist as functions — a programmer error
// (nothing injected, or a compatible-looking object missing a method)
// surfaces immediately as a thrown error, exactly as
// `LocalPublicationAnchorStore`'s own constructor already throws on a
// missing `storageProvider`, rather than degrading silently into a
// persistence boundary that quietly does nothing.
//
// A PERSISTED RECORD IS AN UNTRUSTED BYTE SOURCE, NOT A SECOND TRUST ROOT
// — THE SAME PRINCIPLE `LocalPublicationAnchorStore`'s OWN HEADER ALREADY
// NAMES (0.8.15, docs/Principles.md). `save()` writes a deterministic,
// JSON-safe plain record built from exactly the fields a well-formed
// lifecycle section carries — never the caller's own object reference, and
// never any extra property a caller's object might additionally happen to
// carry. `load()` reads that record back and re-validates its minimal
// shape before trusting it — a `state` of `'ABSENT'` or `'PRESENT'`, and,
// when `'PRESENT'`, the same non-empty-string fields
// `PublicationDistributionLifecycle.js` (0.9.50) itself already requires.
// A record whose shape has drifted — hand-edited, corrupted, written by an
// unrelated version of this file, or simply garbage — is not a lifecycle
// this file can honestly reconstruct: `load()` returns `null` for it,
// exactly as it does for a publication this store has never heard of at
// all. This file re-validates only the minimal shape it itself reads,
// never anything about whether the described distribution is
// operationally sound — that remains entirely outside this file's own job.
//
// A MISSING PERSISTED RECORD REMAINS SIMPLY ABSENCE OF A LIFECYCLE
// SNAPSHOT — NEVER `PENDING`, NEVER `FAILED`, NEVER ANY OTHER VOCABULARY.
// `load(publicationId)` returns `null`, never throws, for a `publicationId`
// this file has never `save()`d, has had `remove()`d, or whose persisted
// record fails the minimal shape check above. `null` here means exactly
// what it already means for `PublicationDistributionLifecycleMemoryStore`'s
// own `get()` (0.9.52) — "nothing is currently on file" — nothing more.
//
// IDENTITY IS NOT PRESERVED ACROSS PERSISTENCE — SEMANTICS ARE, AND THAT
// DISTINCTION IS THE ONE THIS WHOLE MILESTONE EXISTS TO DRAW. Unlike
// 0.9.52's and 0.9.53's own in-memory boundary, where
// `store.get(publicationId) === lifecycle` holds exactly because nothing
// is ever serialized:
//
//     persistence.save('pub-1', lifecycle);
//     const loaded = persistence.load('pub-1');
//     loaded === lifecycle;                        // false — a NEW object
//     describePublicationDistributionLifecycle;     // (never called by this file)
//     loaded.material.state === lifecycle.material.state;   // true
//     loaded.material.uri === lifecycle.material.uri;       // true
//
// Crossing a real persistence boundary (serialize, store, later
// deserialize) never preserves a JavaScript object reference — only the
// facts the reference carried. This file's own tests make that boundary
// explicit rather than accidental.
//
// SAVE()/LOAD()/REMOVE()/CLEAR() — DELIBERATELY THE SAME FOUR VERBS 0.9.52
// ESTABLISHED, RENAMED ONLY WHERE THE OPERATION ITSELF IS GENUINELY
// DIFFERENT (`get` -> `load`, TO NAME THAT THIS ONE CROSSES A REAL I/O
// BOUNDARY THE MEMORY STORE NEVER DOES; `set` -> `save`, FOR THE SAME
// REASON). `remove(publicationId)` deletes whatever record currently
// occupies that publication identity's slot, if any, and returns `true`
// when a record was actually removed, `false` otherwise (including for a
// malformed `publicationId`) — the identical idempotency contract 0.9.52's
// own `remove()` already established. `clear()` removes every record this
// file itself has ever written through the injected persistence
// implementation — found via that implementation's own `list()`, filtered
// to this file's own key prefix, so a `clear()` here never touches an
// unrelated key some other part of the engine stores through the same
// injected implementation.
//
// SYNCHRONOUS ONLY — MATCHING `storage/StorageProvider.js`'s OWN
// SYNCHRONOUS CONTRACT, NEVER INTRODUCING A `Promise` THIS FAMILY HAS
// NEVER NEEDED BEFORE. Every method here returns immediately; whatever I/O
// the injected persistence implementation itself performs is that
// implementation's own concern, not this file's.
//
// A CALLER'S SUPPLIED LIFECYCLE IS NEVER MUTATED. `save()` reads
// `lifecycle.material`/`lifecycle.discovery` structurally and writes a
// freshly built plain record; it never assigns onto, freezes, or
// otherwise alters the `lifecycle` object a caller handed it.
//
// MALFORMED INPUT DEGRADES SILENTLY, NEVER THROWS — INHERITED FROM 0.9.52's
// OWN RULE, HELD HERE FOR THE SAME FOUR METHODS. `save(publicationId,
// lifecycle)` silently does nothing when `publicationId` is missing, not a
// string, or empty, or when `lifecycle` fails the same minimal shape
// `load()` itself re-validates on the way back in. `load(publicationId)`
// and `remove(publicationId)` treat a malformed `publicationId` the same
// way `PublicationDistributionLifecycleMemoryStore` already does: `load()`
// returns `null`, `remove()` returns `false`. None of the four operations
// ever throws over a malformed VALUE passed to it — only a genuinely
// broken injected persistence implementation, discovered once at
// construction, is treated as the programmer error it is.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Automatic persistence from `PublicationDistributionLifecycleMemoryStore#set()`.**
//   See "A persistence boundary, never a second memory store," above — the
//   memory store is not modified by this milestone in any way, and every
//   0.9.52/0.9.53 test keeps passing unmodified.
// - **Automatic loading during this class's own construction.** The
//   constructor only records the injected persistence implementation; it
//   never calls `load()`, `list()`, or anything else on it up front.
// - **Retry, recovery, or reconciliation of any kind** should the injected
//   persistence implementation itself fail. A failure inside `save()`,
//   `load()`, `remove()`, or `clear()`'s own calls to the injected
//   implementation propagates as whatever error that implementation itself
//   throws — this file adds no retry loop, no recovery policy, and no
//   persistence-failure status field of its own.
// - **History, an audit trail, version numbers, or timestamps of any
//   kind.** `save()` replaces whatever record was previously on file for a
//   `publicationId`; nothing about what was previously persisted, or when,
//   survives a replacement or is recorded anywhere.
// - **Optimistic locking, conflict resolution, or any comparison between a
//   newly supplied lifecycle and whatever is currently on file.** `save()`
//   never reads the current record before overwriting it.
// - **Cross-process synchronization, or any rule that a value persisted by
//   one process becomes visible to a live subscriber of the memory store
//   in another.** This file crosses exactly the persistence boundary the
//   injected implementation itself crosses — nothing about notification,
//   subscription, or 0.9.53's own observation seam is introduced here.
// - **Encryption, compression, or migration of a persisted record's
//   shape.** A record is written and read back in the identical plain
//   shape this file itself defines.
// - **Garbage collection, expiry, or eviction of a persisted record on
//   its own initiative.** A record is removed only by an explicit
//   `remove()` or `clear()` call.
// - **Event sourcing, or persisting anything other than the single most
//   recently `save()`d lifecycle per publication identity.** Exactly
//   0.9.52's own "a single current value per publication identity," one
//   layer later, across a real I/O boundary instead of an in-memory one.
// - **Persistence-failure status or persistence notifications of any
//   kind.** `save()`/`load()`/`remove()`/`clear()` either complete or throw
//   whatever the injected implementation itself throws; there is no
//   `{ success, error }` wrapper, and no subscriber is ever told a
//   persistence operation occurred.
// - **`PENDING`, `RECOVERING`, `CONFIRMED`, or any other operational
//   vocabulary.** See 0.9.50's and 0.9.52's own headers — a persisted
//   lifecycle carries exactly the two states `ABSENT`/`PRESENT` those
//   files already established, and nothing this file adds introduces a
//   third.

function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// Pure. Builds a deterministic, JSON-safe plain record from a lifecycle's
// own `material` section — used both to build the record `save()` writes
// and, mirrored exactly, to validate the record `load()` reads back.
// Returns `INVALID_SECTION` when `section` fails the identical minimal
// shape `PublicationDistributionLifecycle.js` (0.9.50) itself already
// requires for a `PRESENT` material section.
function readMaterialSection(section) {
    if (!isPlainObject(section)) {
        return INVALID_SECTION;
    }
    if (section.state === PublicationDistributionState.ABSENT) {
        return { state: PublicationDistributionState.ABSENT };
    }
    if (section.state !== PublicationDistributionState.PRESENT || !isNonEmptyString(section.uri)) {
        return INVALID_SECTION;
    }
    const storage = isNonEmptyString(section.storage) ? section.storage : null;
    return { state: PublicationDistributionState.PRESENT, uri: section.uri, storage };
}

// Pure. Mirrors `readMaterialSection()` exactly, for a lifecycle's own
// `discovery` section.
function readDiscoverySection(section) {
    if (!isPlainObject(section)) {
        return INVALID_SECTION;
    }
    if (section.state === PublicationDistributionState.ABSENT) {
        return { state: PublicationDistributionState.ABSENT };
    }
    if (
        section.state !== PublicationDistributionState.PRESENT ||
        !isNonEmptyString(section.origin) ||
        !isNonEmptyString(section.discoveryTag) ||
        !isNonEmptyString(section.id)
    ) {
        return INVALID_SECTION;
    }
    return { state: PublicationDistributionState.PRESENT, origin: section.origin, discoveryTag: section.discoveryTag, id: section.id };
}

// Pure. `{ material, discovery }` plain record built from `lifecycle`, or
// `INVALID_SECTION` when `lifecycle` itself is not an object or either
// section fails the minimal shape above.
function buildRecord(lifecycle) {
    if (!isPlainObject(lifecycle)) {
        return INVALID_SECTION;
    }
    const material = readMaterialSection(lifecycle.material);
    if (material === INVALID_SECTION) {
        return INVALID_SECTION;
    }
    const discovery = readDiscoverySection(lifecycle.discovery);
    if (discovery === INVALID_SECTION) {
        return INVALID_SECTION;
    }
    return { material, discovery };
}

// Pure. The frozen lifecycle description reconstructed from a persisted
// `record`, in the identical `{ material, discovery }` shape
// `PublicationDistributionLifecycle.js` (0.9.50) itself produces, or
// `null` when `record` fails the minimal shape `buildRecord()` above
// already enforces on the way in — see this file's own header, "A
// persisted record is an untrusted byte source, not a second trust root."
function parseRecord(record) {
    const parsed = buildRecord(record);
    if (parsed === INVALID_SECTION) {
        return null;
    }
    return Object.freeze({
        material: Object.freeze(parsed.material),
        discovery: Object.freeze(parsed.discovery)
    });
}

export class PublicationDistributionLifecyclePersistence {
    constructor(persistence) {
        if (
            !persistence ||
            typeof persistence.save !== 'function' ||
            typeof persistence.load !== 'function' ||
            typeof persistence.remove !== 'function' ||
            typeof persistence.list !== 'function'
        ) {
            throw new Error('PublicationDistributionLifecyclePersistence: a save/load/remove/list persistence implementation is required');
        }
        this._persistence = persistence;
    }

    // Persists `lifecycle` under `publicationId`, replacing whatever
    // record was previously on file for it, if anything — see this file's
    // own header, "The persistence boundary stores lifecycle facts; it
    // does not execute lifecycle transitions." Silently does nothing when
    // `publicationId` is malformed (missing, not a string, or empty) or
    // `lifecycle` fails the minimal shape this file itself reads. Writes a
    // freshly built plain record, never the caller's own object reference,
    // and never mutates `lifecycle` itself.
    save(publicationId, lifecycle) {
        if (!isNonEmptyString(publicationId)) {
            return;
        }
        const record = buildRecord(lifecycle);
        if (record === INVALID_SECTION) {
            return;
        }
        this._persistence.save(this._key(publicationId), record);
    }

    // The lifecycle reconstructed from the record most recently `save()`d
    // for `publicationId`, or `null` when `publicationId` is malformed, has
    // no persisted record, or its persisted record fails the minimal shape
    // this file itself reads — see this file's own header, "A missing
    // persisted record remains simply absence of a lifecycle snapshot."
    // Returns a NEW frozen object every call; see this file's own header,
    // "Identity is not preserved across persistence."
    load(publicationId) {
        if (!isNonEmptyString(publicationId)) {
            return null;
        }
        const record = this._persistence.load(this._key(publicationId));
        if (record === null || record === undefined) {
            return null;
        }
        return parseRecord(record);
    }

    // Removes whatever record currently occupies `publicationId`'s slot in
    // the injected persistence implementation, if any. Returns `true` when
    // a record was removed, `false` otherwise (including when
    // `publicationId` is itself malformed) — the identical idempotency
    // contract `PublicationDistributionLifecycleMemoryStore#remove()`
    // (0.9.52) already established.
    remove(publicationId) {
        if (!isNonEmptyString(publicationId)) {
            return false;
        }
        const key = this._key(publicationId);
        const existed = this._persistence.load(key) !== null && this._persistence.load(key) !== undefined;
        if (existed) {
            this._persistence.remove(key);
        }
        return existed;
    }

    // Removes every record this instance's own key prefix has ever
    // written through the injected persistence implementation — found via
    // that implementation's own `list()`, never via bookkeeping this class
    // keeps for itself, so a `clear()` sees every record actually on file
    // even across independent instances sharing the same injected
    // implementation. Never touches a key outside this file's own prefix.
    clear() {
        for (const key of this._persistence.list()) {
            if (typeof key === 'string' && key.startsWith(KEY_PREFIX)) {
                this._persistence.remove(key);
            }
        }
    }

    _key(publicationId) {
        return KEY_PREFIX + publicationId;
    }
}
