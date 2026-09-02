// 0.9.57 — Publication Distribution Lifecycle Hydration Composition.
//
// 0.9.56 answered "how does ONE publication's lifecycle get back into the
// memory store, on explicit request" — `PublicationDistributionLifecycleRestorer`'s
// own `restore(publicationId)`, called once, for one id, by a caller who
// already decided that id needed restoring. That file's own header named
// exactly the question it left open: "Startup hydration composition —
// restoring a whole set of publication ids on application startup... a
// later, unscheduled milestone may compose this file's own `restore()`
// over a selected list of publication ids; this file exposes only the
// one-publication primitive, never the composition on top of it." This
// file is that later milestone, and nothing more:
//
//   Application / Runtime
//        │
//        │  an explicit array of publication ids it already knows about
//        ▼
//   application/PublicationDistributionLifecycleHydration.js   ★ (THIS)
//        hydratePublicationDistributionLifecycles(restorer, publicationIds)
//        │
//        ├── restorer.restore(publicationIds[0])   (0.9.56, unmodified)
//        ├── restorer.restore(publicationIds[1])   (0.9.56, unmodified)
//        └── restorer.restore(publicationIds[2])   (0.9.56, unmodified)
//        │
//        ▼
//   [ { publicationId, lifecycle }, ... ]   (one pair per input id, same order)
//
// A COMPOSITION OF `restore()` CALLS, NEVER A FOURTH RESTORATION
// ALGORITHM. This file holds no lifecycle state of its own — no `Map`, no
// cache, nothing a caller could `get()` from it directly — and performs no
// restoration logic of its own. Its only job is to call an already-
// constructed `restorer`'s own `restore(publicationId)`, once per id in an
// explicit, caller-supplied list, in order, and hand back what each call
// returned. It never imports `PublicationDistributionLifecycleRestorer`
// (0.9.56), `PublicationDistributionLifecycleMemoryStore` (0.9.52/0.9.53),
// `PublicationDistributionLifecyclePersistence` (0.9.54),
// `PublicationDistributionLifecyclePersistenceBridge` (0.9.55),
// `PublicationDistributionLifecycle.js` (0.9.50), or
// `PublicationDistributionLifecycleTransition.js` (0.9.51) — `restorer` is
// received already-constructed and duck-typed through this function's own
// first argument, exactly as 0.9.55's bridge and 0.9.56's restorer already
// receive their own collaborators, and this file has no idea any of those
// other modules exist.
//
// `hydratePublicationDistributionLifecycles(restorer, publicationIds)` —
// THE ENTIRE PUBLIC SURFACE. A plain function, never a class — there is no
// per-call state for a constructor to hold onto between one invocation and
// the next; every call is independent, exactly like 0.9.51's own
// `transitionPublicationDistributionLifecycle()`.
//
//     const results = hydratePublicationDistributionLifecycles(restorer, ['pub-1', 'pub-2', 'pub-3']);
//     // results = [
//     //   { publicationId: 'pub-1', lifecycle: <whatever restorer.restore('pub-1') returned> },
//     //   { publicationId: 'pub-2', lifecycle: <whatever restorer.restore('pub-2') returned> },
//     //   { publicationId: 'pub-3', lifecycle: <whatever restorer.restore('pub-3') returned> }
//     // ]
//
// THE CALLER SUPPLIES THE LIST — THIS FILE NEVER DISCOVERS ONE. `publicationIds`
// is read as an opaque, caller-supplied array of ids; this file never
// enumerates, discovers, or infers which publications exist. It calls no
// `persistence.list()`, no `listPublicationIds()`, and no equivalent of
// either — `restorer` is duck-typed to exactly the one method this file
// itself calls, `restore`, and nothing about the persistence layer
// underneath it is ever inspected or assumed. See this milestone's own
// request: "I would not make it discover all persisted publications... The
// key principle: hydration determines what the application explicitly
// asks to restore; it does not determine what should be restored." An
// empty `publicationIds` array is a completely valid, explicit request —
// "restore nothing" — and produces an empty result with zero `restore()`
// calls, never an error.
//
// SEQUENTIAL, IN INPUT ORDER, ONE `restore()` CALL PER LIST ENTRY — NO
// DEDUPLICATION. `publicationIds` is walked front-to-back; `restorer.restore()`
// is called exactly once per entry, in the exact order supplied, including
// when the same id appears more than once:
//
//     hydratePublicationDistributionLifecycles(restorer, ['pub-1', 'pub-1']);
//     // restorer.restore('pub-1') is called twice — no dedup, exactly as
//     // 0.9.52's own store.set() never deduplicates a repeated call
//
// Suppressing a repeated id would silently teach this file an equality/
// dedup semantic the family it composes over has never defined for itself
// — see 0.9.52's own header, "A successful set() is the notification...
// no dedup." This file adds none of its own, over ids either.
//
// EXACT IDENTITY, NEVER RECONSTRUCTION, ON THE WAY THROUGH THIS FILE. The
// `lifecycle` in each returned pair is the exact reference `restorer.restore()`
// returned for that id — `null` when nothing was persisted for it, or the
// exact lifecycle object 0.9.56's own `restore()` already produced when
// something was. This file inspects neither value beyond building the
// `{ publicationId, lifecycle }` pair itself; it never reads a `.material`
// or `.discovery` field, and never treats a `null` lifecycle as a failure —
// `null` means exactly what it already means one layer down, at 0.9.56's
// own `restore()`: "persistence had no record for this id."
//
// NO PARTIAL-RESULT, STATUS, OR OUTCOME VOCABULARY OF ANY KIND. Each pair
// in the returned array is exactly `{ publicationId, lifecycle }` — never
// `{ publicationId, lifecycle, status }`, `{ publicationId, lifecycle,
// hydrated }`, or `{ publicationId, lifecycle, success }`. A caller who
// wants to know whether a given id actually restored something already has
// everything needed to ask that question itself: `lifecycle !== null`.
// This file invents no additional word for the same fact.
//
// A THROWING `restorer.restore()` PROPAGATES IMMEDIATELY, UNCHANGED, WITH
// NO ROLLBACK, NO PARTIAL-RESULTS OBJECT, AND NO CONTINUING TO THE
// REMAINING IDS. This file adds no `try`/`catch` of its own around any
// individual `restore()` call. When `restorer.restore(publicationIds[i])`
// throws, that error propagates straight out of
// `hydratePublicationDistributionLifecycles()` — the function never
// returns at all for that call, no `RESTORE_FAILED`/`PARTIAL`/`HYDRATED`
// status is invented, and ids after index `i` are never attempted.
// Whatever `restore()` calls already completed for earlier ids already
// took their own effect on the injected store, exactly as 0.9.56's own
// `restore()` already left them — there is nothing for this file to roll
// back, since it holds no state of its own that a throw could leave
// half-applied.
//
// NO RETRY, NO CONCURRENCY, NO BATCHING. Every `restore()` call is made
// synchronously, one at a time, in a plain loop — there is no `Promise.all`,
// no worker pool, no chunking of a large `publicationIds` list into
// batches, and no retry of a call that returned `null` or threw. A caller
// who wants any of those builds it on top of this file, in later,
// unscheduled work.
//
// A THROWN OR MALFORMED `restorer` FAILS LOUDLY, IMMEDIATELY, AT THE START
// OF THE CALL — MATCHING EVERY OTHER DUCK-TYPED COLLABORATOR IN THIS
// FAMILY. `restorer` is checked once, before any `restore()` call is made,
// for exactly the one method this file itself calls: `restore`. A missing
// `restorer`, or one without a `restore` function, throws immediately —
// exactly as 0.9.54's, 0.9.55's, and 0.9.56's own constructors already
// throw on a missing or incomplete collaborator — never silently producing
// an empty result.
//
// MALFORMED `publicationIds` DEGRADES SILENTLY, NEVER THROWS — INHERITED
// FROM THIS WHOLE FAMILY'S OWN RULE FOR ITS DATA ARGUMENTS (as opposed to
// its collaborator arguments; see "A thrown or malformed restorer," above).
// A `publicationIds` that is not an array (missing, `null`, a string, a
// plain object) is treated exactly like an empty array: zero `restore()`
// calls, and an empty array returned. This file performs no validation of
// each individual id within an otherwise well-formed array — a malformed
// entry (not a string, empty, `null`) is forwarded straight into
// `restorer.restore()`, which 0.9.56's own header already documents as
// degrading that exact input silently, returning `null` without touching
// either of its own collaborators. Re-validating the same input here would
// only duplicate a rule 0.9.56 already owns.
//
// NO HYDRATION STATUS, STARTUP LIFECYCLE STATE, OR PROGRESS TRACKING OF
// ANY KIND — THIS FUNCTION IS STATELESS, START TO FINISH. There is no
// `isHydrating` flag, no `hydratedCount`, no event emitted while the loop
// runs, and nothing here for a second caller to inspect mid-call — the
// function either returns its full array of pairs, or throws, with no
// observable state in between visible to anyone outside this one call
// stack.
//
// SYNCHRONOUS ONLY, MATCHING `restore()`'s OWN CONTRACT. This function
// itself, and every call it makes into `restorer.restore()`, is
// synchronous — no `Promise`, `async`, timer, or queue of any kind.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Discovering, listing, or enumerating which publication ids exist.**
//   No `persistence.list()`, no `listPublicationIds()`, no equivalent of
//   either. See "The caller supplies the list," above — the single rule
//   this whole milestone exists to hold.
// - **Retry, concurrency, or batching of any kind.** See "No retry, no
//   concurrency, no batching," above.
// - **A hydration status, startup lifecycle state, progress event, or any
//   other representation of "hydration in progress."** See "No hydration
//   status," above.
// - **Conflict resolution, version comparison, or any authority judgment
//   between what a `restore()` call returns and anything else.** This file
//   forms no opinion about what `restore()` returns beyond pairing it with
//   its own `publicationId` — 0.9.56's own `restore()` already declined
//   this exact question for a single id, and this file does not revisit it
//   across many.
// - **Deduplicating a repeated id, or reordering `publicationIds`.** See
//   "Sequential, in input order," above.
// - **A class, singleton, or any construction step at all.** A plain
//   function taking its two arguments fresh on every call — see "The
//   entire public surface," above.
// - **Catching, wrapping, or recovering from a `restorer.restore()`
//   failure.** See "A throwing restorer.restore() propagates," above.
// - **Selecting `publicationIds` from application state, a route, local
//   storage, or anywhere else.** Deciding WHICH ids to hydrate remains
//   entirely a caller's own, separate concern; this file only ever
//   receives that decision already made, as its own second argument.

// Calls `restorer.restore(publicationId)` once for every id in
// `publicationIds`, in order, and returns one `{ publicationId, lifecycle }`
// pair per input id — see this file's own header for the full contract.
// `restorer` must be an object exposing a `restore` function (duck-typed,
// exactly as 0.9.56's own restorer is itself received elsewhere); a
// missing or incompatible `restorer` throws immediately, before any
// `restore()` call is attempted. `publicationIds` that is not an array
// (missing, `null`, or any other non-array value) is treated as empty —
// zero `restore()` calls, and an empty array returned. A genuinely
// throwing `restorer.restore()` call propagates unchanged, immediately,
// out of this function — no partial-results object is returned, and no
// id after the failing one is attempted.
export function hydratePublicationDistributionLifecycles(restorer, publicationIds) {
    if (!restorer || typeof restorer.restore !== 'function') {
        throw new Error('hydratePublicationDistributionLifecycles: a lifecycle restorer instance with a restore() method is required');
    }
    if (!Array.isArray(publicationIds)) {
        return [];
    }

    const results = [];
    for (const publicationId of publicationIds) {
        const lifecycle = restorer.restore(publicationId);
        results.push({ publicationId, lifecycle });
    }
    return results;
}
