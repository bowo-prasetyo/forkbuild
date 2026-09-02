// 0.9.56 — Publication Distribution Lifecycle Restoration Boundary.
//
// 0.9.54 answered "how does a lifecycle survive a process restart"
// (persistence.save() / persistence.load()). 0.9.55 answered "how does a
// stored lifecycle become durable without a caller remembering to call
// save() by hand" (the store -> persistence bridge). Neither file answers
// the reverse question: once a process restarts, or a fresh consumer
// entirely comes up with an empty memory store, how does a lifecycle
// already on file get back INTO the memory store, so it can be `get()`,
// `subscribe()`d to, and transitioned like any other lifecycle the store
// holds? This file is that missing reverse seam, and nothing more:
//
//   persistence.load(publicationId)   (0.9.54, unmodified)
//        │
//        ├── null?
//        │      │
//        │     yes ──────────────────────────────► return null
//        │                                          (store untouched)
//        │
//        no
//        │
//        ▼
//   store.set(publicationId, lifecycle)   ★ (THIS calls into 0.9.52,
//        │                                    unmodified)
//        ▼
//   return lifecycle
//
// AN ORCHESTRATION BOUNDARY, NEVER A THIRD STORE OR A SECOND PERSISTENCE
// IMPLEMENTATION. This file holds no lifecycle state of its own — no
// `Map`, no cache, nothing a caller could `get()` from it directly. It
// wraps exactly two calls it is given, already-constructed, through its
// own constructor — `persistence.load(publicationId)` and
// `store.set(publicationId, lifecycle)` — and does nothing more than
// decide, once, whether the second call happens at all. It never imports
// `PublicationDistributionLifecycleMemoryStore` (0.9.52/0.9.53),
// `PublicationDistributionLifecyclePersistence` (0.9.54),
// `PublicationDistributionLifecyclePersistenceBridge` (0.9.55),
// `PublicationDistributionLifecycle.js` (0.9.50), or
// `PublicationDistributionLifecycleTransition.js` (0.9.51) — both
// collaborators are received duck-typed, exactly as 0.9.55's own bridge
// already receives its two collaborators, and this file has no idea any
// of those other modules exist.
//
// `restore(publicationId)` — THE ENTIRE PUBLIC SURFACE.
//
//     const restorer = new PublicationDistributionLifecycleRestorer(persistence, store);
//     const lifecycle = restorer.restore('pub-1');
//     // lifecycle is whatever persistence.load('pub-1') returned, or null
//     // store.get('pub-1') === lifecycle, when lifecycle is not null
//
// RESTORATION IS CALLER-TRIGGERED, NEVER AUTOMATIC — THE SINGLE MOST
// IMPORTANT DECISION OF THIS MILESTONE, SETTLED EXPLICITLY BY ITS OWN
// REQUEST. There is no constructor loading, no startup hook, no automatic
// hydration, no background process, no polling, and no retry or
// scheduling of any kind anywhere in this file. Constructing a
// `PublicationDistributionLifecycleRestorer` calls neither
// `persistence.load()` nor `store.set()` — it only verifies, once, that
// the two methods it needs actually exist. A lifecycle is restored only
// when, and exactly when, a caller explicitly calls `restore(publicationId)`.
//
// NON-DESTRUCTIVE WHEN PERSISTENCE HAS NO RECORD — THE CRUCIAL SEMANTIC
// RULE THIS MILESTONE EXISTS TO ESTABLISH. When `persistence.load(publicationId)`
// returns `null`, `restore()` returns `null` too, and `store.set()` is
// never called — an absent persistence record is never interpreted as an
// instruction to erase an existing memory state:
//
//     store.set('pub-1', existingLifecycle);
//     // persistence has no record for 'pub-1'
//     restorer.restore('pub-1');
//     store.get('pub-1') === existingLifecycle;   // true — untouched
//
// This is the identical restraint `PublicationDistributionLifecycleMemoryStore`'s
// own `set()` already holds for a malformed/falsy `lifecycle` (0.9.52,
// "Malformed input degrades silently") — a would-be write that carries no
// value simply does not happen.
//
// EXACT IDENTITY, NEVER RECONSTRUCTION, ON THE WAY THROUGH THIS FILE.
// `restore()` passes the exact reference `persistence.load()` returns
// straight into `store.set()` — no cloning, no rebuilding, no inspection
// beyond the single `null`/non-`null` check that decides whether `store.set()`
// runs at all. Three different identities are genuinely at play across
// the boundary this file sits on, and this file preserves the ones that
// are its own to preserve:
//
//     persisted bytes -> persistence.load() -> a NEW lifecycle object
//          (0.9.54's own "Identity is not preserved across persistence")
//                              │
//                              ▼
//                     store.set(publicationId, loaded)
//                              │
//                              ▼
//              store.get(publicationId) === loaded        // true
//              observer receives  === loaded               // true
//                  (0.9.52's/0.9.53's own "Storage, never transformation")
//
// `loaded !== whatever object was originally persisted before the
// process restart` — that identity is gone the moment 0.9.54's own
// `save()` serializes it, and this file does nothing to bring it back.
// But `semanticFacts(loaded) === semanticFacts(original)` — 0.9.54's own
// `load()` already reconstructs the identical facts — and once `loaded`
// reaches the store, it becomes an ordinary stored lifecycle, indistinguishable
// from one the store received any other way.
//
// THE 0.9.55 BRIDGE MAY OBSERVE A RESTORED `set()` TOO, AND THIS FILE
// DOES NOTHING TO SUPPRESS THAT. If a 0.9.55 bridge is `observe()`ing the
// same `publicationId` on the same store instance, `store.set()` here
// notifies it exactly like any other `set()` would, and the bridge may
// turn straight back around and call `persistence.save()` with the very
// value this file just loaded:
//
//     persistence.load()  ->  store.set()  ->  bridge's listener  ->  persistence.save()
//
// That resulting write is redundant from an I/O-efficiency standpoint,
// but this file introduces no `hydrating` flag, no bridge bypass, and no
// suppression of any kind to prevent it. 0.9.55's own contract is that
// "every actual set() is an observable lifecycle change" — restoration is
// simply another explicit source of a lifecycle fact, exactly as
// legitimate as any other caller of `store.set()`. Semantic deduplication
// of a redundant persistence write, if ever wanted, is a separate,
// unscheduled optimization milestone — never smuggled in here.
//
// NO COMPARISON BETWEEN PERSISTED STATE AND CURRENT MEMORY STATE, OF ANY
// KIND — EXPLICITLY PROHIBITED BY THIS MILESTONE'S OWN REQUEST. This file
// never reads `store.get(publicationId)` before calling `store.set()`,
// and never asks whether the persisted value is newer, different, or
// otherwise more or less authoritative than whatever the store already
// holds. There is no `if (persisted.version > memory.version)`, no
// `if (persisted !== memory)`, and no "is persisted newer" judgment
// anywhere in this file — this family has no version, timestamp, or
// authority semantics yet, and this file invents none. `restore()` says
// only "the caller explicitly asked to restore this persisted snapshot,"
// and does exactly that, unconditionally, whenever a snapshot exists.
//
// NO TRANSITION SEMANTICS. `restore()` never calls
// `transitionPublicationDistributionLifecycle()` (0.9.51), and never
// imports `PublicationDistributionLifecycleTransition.js` at all. A
// restored lifecycle is not a new lifecycle transition generated from a
// fact — it is an existing fact, already valid, reintroduced into memory
// exactly as `persistence.load()` reconstructed it.
//
// A PERSISTENCE OR STORE FAILURE PROPAGATES, UNCHANGED, WITH NO
// ROLLBACK AND NO NEW VOCABULARY. This file adds no `try`/`catch` of its
// own around either collaborator call. A `persistence.load()` that
// genuinely throws propagates straight out of `restore()` — this file
// invents no `RESTORE_FAILED` status, or any other operational
// vocabulary, to wrap it in. A `store.set()` that throws (after a
// successful `load()`) propagates the same way, with no attempt to undo
// or compensate for anything — there is nothing to roll back, since
// `store.set()` either takes effect or it doesn't; this file does not
// retry it, and does not treat a thrown error as a reason to invent a
// second code path.
//
// PUBLICATION ISOLATION, INHERITED DIRECTLY FROM 0.9.52's OWN KEYING.
// `restore(publicationId)` only ever reads and writes the single
// `publicationId` it is given — it calls `persistence.load(publicationId)`
// and, when that succeeds, `store.set(publicationId, lifecycle)`, and
// nothing else. Restoring one publication's snapshot never reads, writes,
// or otherwise touches any other publication identity's own entry in
// either collaborator.
//
// AN INJECTED PERSISTENCE INSTANCE AND AN INJECTED STORE — DUCK-TYPED TO
// EXACTLY THE METHODS THIS FILE ITSELF CALLS, NEVER A CONCRETE CLASS THIS
// FILE CHOOSES ITSELF. The constructor never checks `instanceof
// PublicationDistributionLifecyclePersistence` or `instanceof
// PublicationDistributionLifecycleMemoryStore`; it only verifies, once,
// that `persistence.load` and `store.set` exist as functions — a
// programmer error (nothing injected, or a compatible-looking object
// missing a method) surfaces immediately as a thrown error, exactly as
// 0.9.54's own constructor and 0.9.55's own constructor already throw on
// a missing or incomplete collaborator.
//
// SYNCHRONOUS ONLY, MATCHING BOTH COLLABORATORS' OWN CONTRACTS. `restore()`
// itself, and every call it makes into `persistence.load()` and
// `store.set()`, is synchronous — no `Promise`, `async`, timer, or queue
// of any kind is introduced here on top of the two already-synchronous
// seams this file connects.
//
// MALFORMED `restore()` INPUT DEGRADES SILENTLY, NEVER THROWS — INHERITED
// FROM THIS WHOLE FAMILY'S OWN RULE. A malformed `publicationId` (missing,
// not a string, or empty) calls neither `persistence.load()` nor
// `store.set()`, and `restore()` simply returns `null` — the identical
// degradation `persistence.load()` itself already performs for the same
// input (0.9.54), applied here before that call is even made.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Constructor loading, a startup hook, automatic hydration, a
//   background process, polling, or retry/scheduling of any kind.** See
//   "Restoration is caller-triggered," above — the single rule this whole
//   milestone exists to establish.
// - **Startup hydration composition — restoring a whole set of
//   publication ids on application startup.** A later, unscheduled
//   milestone may compose this file's own `restore()` over a selected
//   list of publication ids; this file exposes only the one-publication
//   primitive, never the composition on top of it.
// - **Comparison, conflict resolution, or authority judgment between
//   persisted state and current memory state, of any kind.** See "No
//   comparison," above.
// - **A `hydrating` flag, a bridge bypass, or any suppression of a
//   redundant `persistence.save()` a 0.9.55 bridge may perform in
//   reaction to this file's own `store.set()`.** See "The 0.9.55 bridge
//   may observe," above.
// - **Lifecycle transition semantics of any kind.** See "No transition
//   semantics," above — a restored lifecycle is an existing fact, never a
//   newly generated one.
// - **Rollback, compensation, or transactions of any kind.** A
//   `persistence.load()` or `store.set()` failure propagates exactly as
//   thrown; this file adds no recovery of its own.
// - **`RESTORE_FAILED`, `PENDING`, `RECOVERING`, or any other operational
//   vocabulary.** See "A persistence or store failure propagates," above.
// - **Selecting which publication ids to restore, listing what
//   persistence currently holds, or a `restoreAll()`/`restoreMany()`
//   convenience of any kind.** `restore()` accepts exactly one
//   caller-supplied `publicationId` per call; this file never calls
//   `persistence.list()`.
// - **A durability status, dirty flag, or any other representation of
//   memory/persistence divergence.** This file only ever moves a fact in
//   one direction, once per call, on explicit request.

function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

export class PublicationDistributionLifecycleRestorer {
    constructor(persistence, store) {
        if (!persistence || typeof persistence.load !== 'function') {
            throw new Error('PublicationDistributionLifecycleRestorer: a lifecycle persistence instance with a load() method is required');
        }
        if (!store || typeof store.set !== 'function') {
            throw new Error('PublicationDistributionLifecycleRestorer: a lifecycle memory store with a set() method is required');
        }
        this._persistence = persistence;
        this._store = store;
    }

    // Explicitly loads whatever lifecycle snapshot is on file for
    // `publicationId` and places it into the injected store — see this
    // file's own header for the full contract. Returns the loaded
    // lifecycle when a persisted record existed and was stored, or `null`
    // when it did not — in which case `store.set()` is never called, and
    // whatever the store already held for `publicationId` is left exactly
    // as it was. A malformed `publicationId` (missing, not a string, or
    // empty) calls neither collaborator and returns `null`. A genuine
    // failure thrown by `persistence.load()` or `store.set()` propagates
    // unchanged — this method adds no `try`/`catch` of its own.
    restore(publicationId) {
        if (!isNonEmptyString(publicationId)) {
            return null;
        }
        const lifecycle = this._persistence.load(publicationId);
        if (lifecycle === null || lifecycle === undefined) {
            return null;
        }
        this._store.set(publicationId, lifecycle);
        return lifecycle;
    }
}
