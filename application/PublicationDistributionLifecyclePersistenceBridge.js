// 0.9.55 — Publication Distribution Lifecycle Persistence Bridge.
//
// 0.9.53 added an observation seam to the memory store; 0.9.54 added a
// persistence boundary wholly independent of it. Nothing yet connects the
// two — a caller who wants every stored lifecycle to become durable has to
// call both `store.set(publicationId, lifecycle)` AND
// `persistence.save(publicationId, lifecycle)`, by hand, at every call
// site, and never forget the second call. This file is that missing
// connection, and nothing more:
//
//   store.set(publicationId, lifecycle)        (0.9.52, unmodified)
//        │
//        ├── store value
//        │
//        └── notify subscribers of publicationId   (0.9.53, unmodified)
//                   │
//                   ▼
//        bridge's own listener(publicationId, lifecycle)   ★ (THIS)
//                   │
//                   ▼
//        persistence.save(publicationId, lifecycle)   (0.9.54, unmodified)
//
//   store.remove(publicationId)                (0.9.52, unmodified)
//        │
//        └── notify subscribers of publicationId, only when removed
//                   │
//                   ▼
//        bridge's own listener(publicationId, null)
//                   │
//                   ▼
//        persistence.remove(publicationId)   (0.9.54, unmodified)
//
// AN ADAPTER, NEVER A THIRD STORE. This file holds no lifecycle state of
// its own — no `Map`, no cache, nothing a caller could `get()` from it. It
// wraps exactly one call — `store.subscribe(publicationId, listener)` —
// and reacts to what that call already delivers. It never imports
// `PublicationDistributionLifecycle.js` (0.9.50),
// `PublicationDistributionLifecycleTransition.js` (0.9.51),
// `PublicationDistributionResult.js` (0.9.48), or
// `PublicationDistributionExecutor.js` (0.9.49) — it has no idea any of
// them exist, exactly as 0.9.52's, 0.9.53's, and 0.9.54's own headers
// already hold for themselves.
//
// NEITHER `PublicationDistributionLifecycleMemoryStore` (0.9.52/0.9.53) NOR
// `PublicationDistributionLifecyclePersistence` (0.9.54) IS MODIFIED, OR
// EVEN IMPORTED, BY THIS FILE. Both are received already-constructed,
// through this class's own constructor, and are used only through the
// methods each already exposes — `store.subscribe()`,
// `persistence.save()`, `persistence.remove()`. This file never reaches
// into either one's internals, never extends either class, and adds no
// `set()`-triggered side effect to the store itself, nor a
// `subscribe()`-triggered side effect to the persistence boundary itself
// — the connection lives here, in a third, separate file, exactly as this
// milestone's own request settled it: "a small adapter... without turning
// persistence into part of the store itself."
//
// `observe(publicationId)` — THE ENTIRE PUBLIC SURFACE. Subscribes this
// bridge to `publicationId`'s own changes on the injected store, and
// returns an `unsubscribe` function — the exact shape `store.subscribe()`
// itself already returns, since this method does nothing more than call
// it and route its notifications onward:
//
//     const bridge = new PublicationDistributionLifecyclePersistenceBridge(store, persistence);
//     const disconnect = bridge.observe('pub-1');
//     store.set('pub-1', lifecycle);      // -> persistence.save('pub-1', lifecycle)
//     store.remove('pub-1');              // -> persistence.remove('pub-1')
//     disconnect();
//     store.set('pub-1', lifecycle);      // -> nothing; the bridge is no longer listening
//
// A bridge instance may `observe()` more than one `publicationId`; each
// call returns its own independent `unsubscribe`, exactly mirroring
// `store.subscribe()`'s own "each subscribe() call is independent" rule
// (0.9.53).
//
// EXACT IDENTITY, NEVER RECONSTRUCTION. The bridge's own listener passes
// the `lifecycle` reference it receives from the store straight into
// `persistence.save()` — no cloning, no rebuilding, no inspection beyond
// the single truthiness check that decides `save()` vs. `remove()`, below.
// Whatever `persistence.save()` itself then does with that reference (0.9.54's
// own `save()` reads it structurally and writes a fresh plain record) is
// entirely that file's own concern, unchanged by this one.
//
// `lifecycle` PRESENT MEANS `save()`; `lifecycle === null` MEANS
// `remove()` — MIRRORING 0.9.53's OWN NOTIFICATION CONTRACT EXACTLY,
// NEVER REINTERPRETING IT. 0.9.53's own header is explicit that a
// notification carrying `null` means plain absence, never withdrawal —
// this file inherits that reading unchanged: `null` here means only
// "nothing is stored for this publication right now," and the bridge
// reacts to it the one honest way available, by removing whatever record
// persistence itself may be holding for the same identity.
//
//     listener(publicationId, lifecycle)
//          │
//          ├── lifecycle truthy  -> persistence.save(publicationId, lifecycle)
//          └── lifecycle === null -> persistence.remove(publicationId)
//
// NO ROLLBACK — THE CENTRAL RULE THIS WHOLE MILESTONE EXISTS TO ESTABLISH.
// `store.set()` has already taken effect, synchronously, before this
// bridge's listener ever runs — 0.9.53's own notification contract
// guarantees that ordering. Should `persistence.save()` or
// `persistence.remove()` itself fail, this file makes no attempt to undo,
// compensate for, or otherwise revisit the memory-store change that already
// happened. It calls no `store.remove()`, no `store.set()`, nothing at all
// back on the store — that would invent transactional semantics that exist
// nowhere else in this family. In-memory lifecycle state and durable
// lifecycle state are separate representations and may temporarily
// diverge; this file does not name that divergence `FAILED`, `PENDING`,
// `DIRTY`, or `OUT_OF_SYNC` — inventing any of those would be new lifecycle
// vocabulary this milestone deliberately declines to add.
//
// A PERSISTENCE FAILURE PROPAGATES EXACTLY AS FAR AS 0.9.53's OWN
// SUBSCRIBER-ISOLATION RULE ALREADY LETS IT, AND THIS FILE ADDS NO
// `try`/`catch` OF ITS OWN ON TOP OF THAT. This bridge's own listener is,
// from the store's point of view, an ordinary subscriber — and 0.9.53's
// own `_notify()` already isolates every subscriber inside its own
// `try`/`catch`, precisely so one throwing listener can never block another
// or the triggering `set()`/`remove()` call itself. A `persistence.save()`
// or `persistence.remove()` that throws therefore surfaces exactly where
// any other subscriber's own thrown error already would, under the
// contract 0.9.53 established before this file ever existed; this bridge
// does not add a second layer of suppression, and does not convert that
// failure into a lifecycle status of its own. It also never retries, never
// schedules a retry, and never queues the failed write for later —
// recovery from a persistence failure remains entirely out of scope here,
// exactly as 0.9.54's own header already leaves it out of scope for
// `save()`/`remove()` themselves.
//
// NO HYDRATION. `observe(publicationId)` never calls
// `persistence.load(publicationId)`, and never calls `store.set()` on the
// bridge's own initiative — connecting a bridge is a purely forward-looking
// act, "notify me about subsequent changes," the identical restraint
// `store.subscribe()` itself already holds for `get()` (0.9.53). A caller
// who wants whatever a persistence implementation already has on file
// reads it explicitly, with `persistence.load()`, entirely separately from
// this file — restoring persisted state into the memory store remains
// later, unscheduled work. This file's own constructor never calls
// `persistence.load()` or `persistence.list()` either; it only verifies,
// once, that the methods it needs actually exist.
//
// NO `clear()` INTERPRETATION. 0.9.53's own store deliberately never
// notifies on `clear()` — see that file's own header, "clear() never
// notifies." This bridge does not invent a way to detect it: it has no
// `clear()` method of its own, calls no `persistence.clear()`, and forms
// no opinion about what should happen to persisted records when a caller
// empties the store directly. A caller who wants both cleared calls
// `store.clear()` and `persistence.clear()` explicitly, itself — exactly
// as this milestone's own request settled it.
//
// AN INJECTED STORE AND AN INJECTED PERSISTENCE INSTANCE — DUCK-TYPED TO
// EXACTLY THE METHODS THIS FILE ITSELF CALLS, NEVER A CONCRETE CLASS THIS
// FILE CHOOSES ITSELF. The constructor never checks `instanceof
// PublicationDistributionLifecycleMemoryStore` or `instanceof
// PublicationDistributionLifecyclePersistence`; it only verifies, once,
// that `store.subscribe` and `persistence.save`/`persistence.remove` exist
// as functions — a programmer error (nothing injected, or a
// compatible-looking object missing a method) surfaces immediately as a
// thrown error, exactly as `PublicationDistributionLifecyclePersistence`'s
// own constructor already throws on a missing/incomplete persistence
// implementation (0.9.54). This file needs nothing from either injected
// collaborator beyond that minimal shape, so it needs no import of either
// concrete class at all.
//
// SYNCHRONOUS ONLY, MATCHING BOTH COLLABORATORS' OWN CONTRACTS. `observe()`
// itself, and every call it makes into `store.subscribe()` and, later,
// into `persistence.save()`/`persistence.remove()`, is synchronous — no
// `Promise`, `async`, timer, or queue of any kind is introduced here on top
// of the two already-synchronous seams this file connects.
//
// MALFORMED `observe()` INPUT DEGRADES SILENTLY, NEVER THROWS — INHERITED
// FROM THIS WHOLE FAMILY'S OWN RULE. A malformed `publicationId` (missing,
// not a string, or empty) registers no subscription with the store and
// never calls `persistence.save()`/`persistence.remove()`; the returned
// `unsubscribe` is still always a safely callable no-op function, mirroring
// `store.subscribe()`'s own malformed-input contract exactly.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Automatic hydration, or loading persisted state into the store on
//   `observe()`, construction, or any other occasion.** See "No hydration,"
//   above — a later, unscheduled milestone may add a restoration boundary
//   that reads FROM persistence and writes TO the store; this file only
//   ever moves facts in the opposite direction.
// - **Bidirectional synchronization of any kind.** This file connects
//   MEMORY -> PERSISTENCE, never PERSISTENCE -> MEMORY.
// - **Conflict resolution, optimistic locking, or any comparison between
//   what the store just reported and whatever persistence already has on
//   file.** `save()`/`remove()` are called unconditionally, on the facts
//   the store's own notification already carries.
// - **Persistence retry, retry scheduling, or a persistence-failure queue
//   of any kind.** See "A persistence failure propagates," above.
// - **Rollback, compensation, or transactions of any kind.** See "No
//   rollback," above — the single rule this whole milestone exists to
//   establish.
// - **A durability status, dirty flag, `OUT_OF_SYNC` marker, or any other
//   representation of memory/persistence divergence.** This file documents
//   that divergence is possible; it does not name or track it.
// - **Timestamps, version numbers, or an event history of any kind.** This
//   file forwards a lifecycle notification exactly once per notification;
//   nothing about when or how many times a publication has changed is
//   recorded anywhere.
// - **Distributed or cross-process synchronization, or any behavior beyond
//   the exact `store`/`persistence` instances this bridge was constructed
//   with.** A bridge only ever reacts to notifications from the one store
//   instance it was given, and only ever writes through the one persistence
//   instance it was given.
// - **An audit log, batching, or write deduplication.** Every notification
//   this bridge receives produces exactly one `save()` or `remove()` call —
//   see "Exact identity, never reconstruction," above; two successive
//   `set()` calls, even with the same reference, cause two persistence
//   operations, mirroring 0.9.53's own "a successful set() is the
//   notification, with no equality comparison."
// - **`FAILED`, `PENDING`, `CONFIRMED`, `RECOVERING`, or any other
//   operational vocabulary.** See "No rollback," above.

function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

export class PublicationDistributionLifecyclePersistenceBridge {
    constructor(store, persistence) {
        if (!store || typeof store.subscribe !== 'function') {
            throw new Error('PublicationDistributionLifecyclePersistenceBridge: a lifecycle memory store with a subscribe() method is required');
        }
        if (!persistence || typeof persistence.save !== 'function' || typeof persistence.remove !== 'function') {
            throw new Error('PublicationDistributionLifecyclePersistenceBridge: a lifecycle persistence instance with save()/remove() methods is required');
        }
        this._store = store;
        this._persistence = persistence;
    }

    // Subscribes this bridge to `publicationId`'s own changes on the
    // injected store, projecting every future notification into the
    // injected persistence instance — see this file's own header for the
    // full contract. Returns an `unsubscribe` function that stops that
    // projection; calling it more than once is a harmless no-op, mirroring
    // `store.subscribe()`'s own contract exactly, since this method is
    // nothing more than a thin wrapper around that one call. A malformed
    // `publicationId` registers no subscription and never throws; the
    // returned `unsubscribe` is still always safely callable.
    observe(publicationId) {
        if (!isNonEmptyString(publicationId)) {
            return () => {};
        }
        return this._store.subscribe(publicationId, (id, lifecycle) => {
            if (lifecycle) {
                this._persistence.save(id, lifecycle);
            } else {
                this._persistence.remove(id);
            }
        });
    }
}
