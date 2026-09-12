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
//   seam remains later, unscheduled work, added only if requested. See
//   0.9.53, below, which is that later, requested work.
//
// 0.9.53 — PUBLICATION DISTRIBUTION LIFECYCLE OBSERVATION BOUNDARY, ADDED
// HERE RATHER THAN AS A SEPARATE ADAPTER. This store gains exactly one new
// method, `subscribe(publicationId, listener)`, returning an `unsubscribe`
// function — the same shape 0.9.26's own
// `DecentralizedWorldDiscoveryLeadRegistry` already established for a
// different kind of collection. Nothing about the existing `get`/`set`/
// `remove`/`clear` surface changes; every 0.9.52 test still passes
// unmodified.
//
//     const unsubscribe = store.subscribe('pub-1', listener);
//     // ... later ...
//     unsubscribe();
//
// SUBSCRIPTION IS PER `publicationId`, NEVER STORE-WIDE. Unlike 0.9.26's
// own store-wide `subscribe(listener)`, a listener registered here is told
// about exactly one publication identity's own changes, never another
// publication's. `store.subscribe('pub-1', listener)` is never notified by
// `store.set('pub-2', lifecycle)`.
//
// `listener(publicationId, lifecycle)` — THE NOTIFICATION DESCRIBES WHAT
// CHANGED, NEVER WHAT TO DO ABOUT IT. A subscriber is told "this
// publication now has this lifecycle description" and nothing more. It
// never receives an operational verb like `RETRY`/`FAILED`/`CONFIRMED`/
// `PENDING` — those remain outside this whole family's own vocabulary, per
// 0.9.50's and 0.9.51's own header. `publicationId` is passed back so one
// listener can be shared across several `subscribe()` calls and still tell
// which publication a given notification is about.
//
// IDENTITY IS PRESERVED THROUGH NOTIFICATION TOO — INHERITED FROM THIS
// FILE'S OWN "Storage, never transformation," ABOVE. A listener receives
// the exact same `lifecycle` reference `set()` was given, never a copy:
//
//     store.set('pub-1', lifecycle);
//     store.get('pub-1') === lifecycle;               // true
//     // and, inside a subscriber notified by that same set():
//     receivedLifecycle === lifecycle;                 // true
//
// A SUCCESSFUL `set()` IS THE NOTIFICATION — NO EQUALITY COMPARISON, EXACTLY
// 0.9.12's OWN RULE FOR `WorldDiscoverySourceRegistry`, HELD HERE OVER A
// SINGLE KEYED VALUE INSTEAD OF A MEMBERSHIP SET. `set(publicationId,
// lifecycle)` notifies every subscriber of `publicationId` whenever
// `lifecycle` is actually stored — even calling `set()` twice with the
// exact same reference notifies twice:
//
//     store.set('pub-1', lifecycleX);
//     store.set('pub-1', lifecycleX);   // notifies again — no dedup
//
// Suppressing the second notification would silently teach this store an
// equality/deduplication semantic 0.9.52's own `set()` never defined — see
// this file's own header, "Deliberately dumb." A malformed `set()` call (a
// malformed `publicationId`, or a falsy `lifecycle`) stores nothing and
// notifies nobody, exactly as it always has.
//
// `remove()` NOTIFIES `listener(publicationId, null)` — NEVER A WITHDRAWAL
// EVENT. `remove(publicationId)` notifies every subscriber of
// `publicationId`, but only when an entry actually existed to remove — a
// `remove()` on an already-empty or malformed `publicationId` notifies
// nobody, unchanged from 0.9.52's own idempotency rule. The `null` passed
// to `listener` means exactly what `get()` already means for an absent
// entry: "there is no lifecycle currently stored for this publication." It
// does not mean, and must never be read as meaning, "this publication has
// been withdrawn" — withdrawal remains outside this file's own vocabulary,
// exactly as it is outside 0.9.50's and 0.9.51's.
//
// `clear()` NEVER NOTIFIES. Emitting one notification per previously-held
// key would require deciding whether every affected `publicationId`
// deserves its own `listener(publicationId, null)` call, or one lump
// signal with no established vocabulary of its own — this milestone
// deliberately declines to invent either. `clear()` keeps 0.9.52's own
// behavior exactly as it was: it empties the store, silently, and existing
// subscriptions remain registered, ready to be notified by whatever
// `set()`/`remove()` call comes next.
//
// NO INITIAL NOTIFICATION ON `subscribe()` ITSELF. Subscribing means
// "notify me about subsequent changes," never "immediately tell me the
// current value." A caller that wants the current value reads it with
// `get()`, explicitly, before or after subscribing:
//
//     const current = store.get('pub-1');
//     const unsubscribe = store.subscribe('pub-1', listener);
//
// This keeps subscription free of a hidden read and makes its own
// behavior fully deterministic — no ordering question between "the
// current value" and "the first live notification."
//
// SUBSCRIBER ISOLATION — INHERITED FROM 0.9.12's AND 0.9.26's OWN RULE,
// UNCHANGED. Each subscriber runs inside its own `try`/`catch` during
// notification; one listener throwing never prevents another listener for
// the same `publicationId` from running, and never prevents `set()`/
// `remove()` themselves from returning normally.
//
// EACH `subscribe()` CALL IS INDEPENDENT, AND `unsubscribe()` IS
// IDEMPOTENT — INHERITED FROM 0.9.12's AND 0.9.26's OWN RULE, UNCHANGED.
// Subscribing the same function reference to the same `publicationId` more
// than once registers that many independent subscriptions, each notified
// separately and each with its own `unsubscribe()`. Calling the returned
// `unsubscribe()` more than once is a harmless no-op.
//
// MALFORMED `subscribe()` INPUT DEGRADES SILENTLY, NEVER THROWS —
// UNCHANGED FROM THIS FILE'S OWN RULE FOR EVERY OTHER METHOD. A malformed
// `publicationId` (missing, not a string, or empty) or a non-function
// `listener` registers no subscription and never throws; the returned
// `unsubscribe` is still always a safely callable no-op function.
//
// STILL SYNCHRONOUS ONLY, STILL NO EVENT PAYLOAD BEYOND
// `(publicationId, lifecycle)`, STILL NO HISTORY. Notification delivery is
// synchronous and unbatched, exactly like `set()`/`remove()` themselves;
// no queue, timer, `Promise`, async delivery, "once" subscription, or
// wildcard/global subscription is introduced. A subscriber that missed a
// notification (because it subscribed too late, or unsubscribed too
// early) has no way to recover it from this store — `get()` only ever
// answers "what is true right now."
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE, EITHER.
// - **An event log or notification history of any kind.** A subscriber
//   that was not listening when a change happened has no way to retrieve
//   it afterward.
// - **`clear()` emitting a per-key or lump notification.** See "`clear()`
//   never notifies," above — deferred rather than inventing vocabulary
//   prematurely.
// - **Deduplication/equality-based suppression of a repeated `set()`.**
//   See "A successful `set()` is the notification," above.
// - **Any operational payload — `RETRY`/`FAILED`/`CONFIRMED`/`PENDING`, a
//   change-kind tag, a version/change counter, or a timestamp.** See
//   `listener(publicationId, lifecycle)`, above — the notification
//   describes state, never intent, sequence, or time.
// - **Cross-instance or cross-process synchronization of any kind.** A
//   subscription only ever sees changes made through the exact store
//   instance it subscribed to — unchanged from this file's own "Live,
//   in-memory, per-instance state," above.
// - **Retry triggers, automatic transitions, or automatic execution in
//   reaction to a notification.** An observer observes; it does not decide
//   what happens next. Reacting to a notification — retrying, re-deriving
//   a lifecycle, re-executing a distribution — remains entirely a
//   subscriber's own, separate, unscheduled job.
//
// 0.9.433 — CONCURRENT DISCOVERY OBSERVATION PRESERVATION, ADDED HERE AS A
// SECOND, INDEPENDENT KEYED STRUCTURE — NEVER A CHANGE TO `get`/`set`/
// `subscribe`'S OWN EXISTING CONTRACT. 0.9.431 found, and 0.9.432's own
// read-only audit confirmed in full, that `set(publicationId, lifecycle)`'s
// own single-slot-per-publication contract (see "Keyed by publication.id,"
// above) means a second substrate's own independently successful
// Announcement/Discovery fact silently erases the first — both real, both
// independently discoverable, only one ever observable through `get()`.
// 0.9.432's own verdict named the minimal fix: a SECOND, additive keyed
// structure, scoped to Announcement/Discovery alone, never a change to this
// store's own primary per-publication slot. This store gains exactly two
// new methods, `recordDiscoveryObservation(publicationId, discoveryProvider,
// discoverySection)` and `getDiscoveryObservations(publicationId)`. Nothing
// about `get`/`set`/`remove`/`clear`/`subscribe`'s own existing behavior,
// return shape, or notification rule changes; every 0.9.52/0.9.53 test
// still passes unmodified.
//
// KEYED BY `(publicationId, discoveryProvider)` — ONE FINER GRAIN THAN THE
// PRIMARY SLOT, NEVER A REPLACEMENT FOR IT. `discoveryProvider` is read as
// an opaque, caller-supplied string, exactly like `publicationId` itself —
// this file never validates it against `'nostr'`/`'arweave'` or any other
// fixed vocabulary, and never derives it from a lifecycle section.
//
// REPLACEMENT PER PROVIDER, NEVER MERGE, NEVER ACCUMULATION — THE SAME RULE
// THIS FILE'S OWN "Replacement, never merge," ABOVE, ALREADY HOLDS FOR THE
// PRIMARY SLOT, HELD HERE AT ONE FINER KEY:
//
//     store.recordDiscoveryObservation('pub-1', 'nostr', sectionA);
//     store.recordDiscoveryObservation('pub-1', 'nostr', sectionB);
//     store.getDiscoveryObservations('pub-1');
//     // -> [{ discoveryProvider: 'nostr', ...sectionB }]   — sectionA is gone
//
// A DIFFERENT `discoveryProvider` FOR THE SAME `publicationId` COEXISTS,
// NEVER COLLIDES:
//
//     store.recordDiscoveryObservation('pub-1', 'nostr', sectionA);
//     store.recordDiscoveryObservation('pub-1', 'arweave', sectionB);
//     store.getDiscoveryObservations('pub-1');
//     // -> [{ discoveryProvider: 'nostr', ...sectionA },
//     //     { discoveryProvider: 'arweave', ...sectionB }]   — both present
//
// `getDiscoveryObservations(publicationId)` RETURNS `[]`, NEVER `null` OR A
// THROWN ERROR, FOR A MALFORMED `publicationId` OR ONE NOTHING HAS EVER BEEN
// RECORDED FOR — the same "missing entries degrade silently" discipline
// this file's own header already holds for `get()`, expressed at this
// method's own, list-shaped, return type instead of `null`.
//
// `recordDiscoveryObservation()` DEGRADES SILENTLY, NEVER THROWS, FOR A
// MALFORMED `publicationId` (missing, not a string, empty), A MALFORMED
// `discoveryProvider` (same rule), OR A FALSY `discoverySection` — the
// identical rule `set()` already holds for `publicationId`/`lifecycle`,
// above.
//
// `remove(publicationId)`/`clear()` ALSO CLEAR THIS PUBLICATION'S OWN
// DISCOVERY OBSERVATIONS — NEVER LEAVING A GHOST BEHIND `get()` ALREADY
// DECLARED ABSENT. A `publicationId` for which `get()` returns `null`
// (freshly `remove()`d, or after `clear()`) never has a stale, disagreeing
// `getDiscoveryObservations()` result left over from before.
//
// NO NEW NOTIFICATION VOCABULARY. `recordDiscoveryObservation()` never
// calls `_notify()` — a caller that also calls the pre-existing `set()` for
// the same fact is notified exactly as it always was, through that
// existing call alone; this store invents no second subscription channel
// for the additive structure, and remains just as ignorant of any
// particular caller as it already was — see this file's own header,
// "Deliberately dumb," above.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Multi-select fan-out, aggregate distribution status, or a "how many
//   substrates" count of any kind.** `getDiscoveryObservations()` returns
//   the current facts, nothing computed on top of them.
// - **History, retries, provider ranking, or provider health.** Exactly one
//   current fact per `(publicationId, discoveryProvider)`, replaced, never
//   accumulated — see "Replacement per provider," above.
// - **A generic multi-valued lifecycle storage mechanism.** This addition
//   is scoped to Announcement/Discovery alone; Content (`material`) and
//   Proof/Anchor remain entirely outside it.
//
// 0.9.443 — NOSTR RELAY OBSERVATION IDENTITY BOUNDARY. 0.9.442's own product
// reassessment found the exact collision this milestone fixes: two REAL,
// independently-obtained Nostr relay observations for the SAME publication
// — attributed under the only `discoveryProvider` value a Nostr caller has
// ("nostr") — silently collapsed to one at `recordDiscoveryObservation()`'s
// own `(publicationId, discoveryProvider)` key, exactly the class of loss
// this same key was originally built to prevent one substrate level up.
// `recordDiscoveryObservation()` gains one new, OPTIONAL fourth argument,
// `discoveryOrigin`. Nothing about its existing three-argument call shape,
// or `getDiscoveryObservations()`'s own signature or return shape, changes.
//
//     store.recordDiscoveryObservation(publicationId, discoveryProvider, section);
//     store.recordDiscoveryObservation(publicationId, discoveryProvider, section, discoveryOrigin);
//
// CONCEPTUAL IDENTITY WIDENS TO `(publicationId, discoveryProvider,
// discoveryOrigin)` — BUT ONLY WHEN A CALLER ACTUALLY SUPPLIES
// `discoveryOrigin`. Omitting it (as every pre-0.9.443 caller does, and as
// every non-Nostr caller continues to) keys the observation by
// `discoveryProvider` alone, byte-identical to 0.9.433's own original
// behavior:
//
//     store.recordDiscoveryObservation('pub-1', 'arweave', sectionA);
//     store.recordDiscoveryObservation('pub-1', 'arweave', sectionB);
//     store.getDiscoveryObservations('pub-1');
//     // -> [{ discoveryProvider: 'arweave', ...sectionB }]   — unchanged from 0.9.433
//
// A DIFFERENT `discoveryOrigin` FOR THE SAME `discoveryProvider` COEXISTS,
// NEVER COLLIDES — THE CENTRAL FIX. Two Nostr relay observations for the
// same publication, each carrying its own real relay identity as
// `discoveryOrigin`, are now two independent entries:
//
//     store.recordDiscoveryObservation('pub-1', 'nostr', sectionA, 'wss://relay-a.example');
//     store.recordDiscoveryObservation('pub-1', 'nostr', sectionB, 'wss://relay-b.example');
//     store.getDiscoveryObservations('pub-1');
//     // -> [{ discoveryProvider: 'nostr', ...sectionA }, { discoveryProvider: 'nostr', ...sectionB }]
//
// RE-OBSERVATION FROM THE SAME `discoveryOrigin` STILL REPLACES, NEVER
// ACCUMULATES — THE SAME "replacement per provider" RULE ABOVE, HELD HERE
// AT ONE FINER KEY WHEN `discoveryOrigin` IS SUPPLIED:
//
//     store.recordDiscoveryObservation('pub-1', 'nostr', sectionA1, 'wss://relay-a.example');
//     store.recordDiscoveryObservation('pub-1', 'nostr', sectionA2, 'wss://relay-a.example');
//     store.getDiscoveryObservations('pub-1');
//     // -> [{ discoveryProvider: 'nostr', ...sectionA2 }]   — sectionA1 is gone, relay B untouched
//
// `discoveryProvider` ITSELF IS NEVER REDEFINED. This file still never
// validates `discoveryProvider` against any fixed vocabulary, and
// `discoveryOrigin` is read exactly as opaquely — a non-empty string, or
// absent. Widening a provider's own key to include origin remains entirely
// a CALLER's decision, made once per call, never a policy this store
// imposes on a `discoveryProvider` it doesn't recognize as "Nostr" or
// anything else. This store still has no idea "Nostr" or "Arweave" exist as
// concepts, exactly as its own header above already establishes.
//
// `getDiscoveryObservations()`'S OWN RETURN SHAPE IS UNCHANGED. An entry
// keyed by `(discoveryProvider, discoveryOrigin)` still returns as
// `{ discoveryProvider, ...section }` — no new `discoveryOrigin` field is
// added to the returned object, because `section` (the discovery lifecycle
// section a caller already supplies) already carries the identical value
// under its own existing `origin` field for exactly this purpose — see
// `application/PublicationDistributionLifecycle.js`'s own `describeDiscoveryState()`.
// Adding a second, redundant `discoveryOrigin` field here would be exactly
// the kind of generic endpoint abstraction this milestone's own request
// deliberately excludes.
//
// A MALFORMED `discoveryOrigin` (NOT A NON-EMPTY STRING) DEGRADES TO
// "ABSENT", NEVER THROWN, NEVER TREATED AS A DISTINGUISHING KEY — the same
// "malformed input degrades silently" discipline this file already holds
// for `publicationId`/`discoveryProvider`/`discoverySection`. A caller that
// passes `null`, `undefined`, `''`, or a non-string `discoveryOrigin` gets
// exactly 0.9.433's own original, provider-only-keyed behavior.
//
// `remove(publicationId)`/`clear()` STILL CLEAR EVERY OBSERVATION FOR THAT
// PUBLICATION, REGARDLESS OF HOW MANY DISTINCT `discoveryOrigin` VALUES
// ACCUMULATED UNDER ONE `discoveryProvider` — unchanged from this file's
// own existing rule, now simply applied to a per-publication map that may
// hold more entries per provider than before.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE, EITHER.
// - **A relay list, relay configuration, or any Settings UI.** This file
//   has no idea how many relays exist or should exist — it only stores
//   whatever `discoveryOrigin` a caller already obtained from a real
//   publish/query attempt.
// - **Fan-out, failover, retry, or relay health/ranking of any kind.**
//   Nothing here decides how many relays get contacted, or in what order —
//   this file only ever stores whatever ONE call's own caller already
//   observed; it never coordinates multiple calls itself.
// - **A generic multi-provider endpoint abstraction.** `discoveryOrigin` is
//   read as an opaque string for ANY `discoveryProvider` a caller supplies
//   it for — this file forces no provider to adopt one, and no caller in
//   this codebase supplies one for `'arweave'` as of this milestone.
// - **Any change to `getDiscoveryObservations()`'s own return shape**, or
//   to `get`/`set`/`subscribe`'s own pre-existing contracts.

function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

// 0.9.443 — the origin-map key used for an observation recorded WITHOUT a
// `discoveryOrigin`, keeping that observation keyed by `discoveryProvider`
// alone, byte-identical to 0.9.433's own original per-provider slot. A
// `Symbol` can never collide with any real `discoveryOrigin` string a
// caller might supply.
const DEFAULT_ORIGIN_KEY = Symbol('PublicationDistributionLifecycleStore.DEFAULT_ORIGIN_KEY');

export class PublicationDistributionLifecycleMemoryStore {
    constructor() {
        this._entries = new Map();
        this._listeners = new Map();
        this._nextListenerId = 0;
        // 0.9.433 — publicationId -> Map(discoveryProvider -> discoverySection).
        // AMENDED BY 0.9.443 — one level deeper: publicationId ->
        // Map(discoveryProvider -> Map(originKey -> discoverySection)),
        // where `originKey` is a supplied `discoveryOrigin` string when one
        // is given, or the module-level `DEFAULT_ORIGIN_KEY` sentinel when
        // not — see this file's own 0.9.443 header. Additive; never read or
        // written by get()/set()/remove()/clear()'s own primary `_entries`
        // map.
        this._discoveryObservations = new Map();
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
    // or otherwise falsy. Notifies every current subscriber of
    // `publicationId` with `(publicationId, lifecycle)` whenever `lifecycle`
    // IS stored — see this file's own header, "A successful set() is the
    // notification" — never when it's ignored as malformed.
    set(publicationId, lifecycle) {
        if (!isNonEmptyString(publicationId) || !lifecycle) {
            return;
        }
        this._entries.set(publicationId, lifecycle);
        this._notify(publicationId, lifecycle);
    }

    // Removes whatever lifecycle currently occupies `publicationId`'s slot,
    // if any. Returns `true` when an entry was removed, `false` when there
    // was nothing to remove (including when `publicationId` is itself
    // malformed) — see this file's own header, "`remove()` is idempotent."
    // Notifies every current subscriber of `publicationId` with
    // `(publicationId, null)` only when an entry actually existed to
    // remove — see this file's own header, "remove() notifies
    // listener(publicationId, null)."
    remove(publicationId) {
        if (!isNonEmptyString(publicationId)) {
            return false;
        }
        const removed = this._entries.delete(publicationId);
        // 0.9.433 — this publicationId's own discovery observations, if
        // any, are cleared alongside its primary slot; see this file's
        // own header, "remove()/clear() also clear this publication's own
        // discovery observations."
        this._discoveryObservations.delete(publicationId);
        if (removed) {
            this._notify(publicationId, null);
        }
        return removed;
    }

    // Removes every currently-stored lifecycle. The store afterward behaves
    // exactly as it did immediately after construction. Never notifies any
    // subscriber — see this file's own header, "clear() never notifies" —
    // and never removes an existing subscription.
    clear() {
        this._entries.clear();
        this._discoveryObservations.clear(); // 0.9.433
    }

    // Registers `listener` to be called with `(publicationId, lifecycle)`
    // on every future change notification for `publicationId` — see this
    // file's own header, "0.9.53 — Publication Distribution Lifecycle
    // Observation Boundary." Returns an `unsubscribe` function that removes
    // exactly this one subscription; calling it more than once is a
    // harmless no-op. A malformed `publicationId` (missing, not a string,
    // or empty) or a non-function `listener` registers no subscription and
    // never throws; the returned `unsubscribe` is still always safely
    // callable. Subscribing the same function reference more than once,
    // even to the same `publicationId`, registers that many independent
    // subscriptions.
    subscribe(publicationId, listener) {
        if (!isNonEmptyString(publicationId) || typeof listener !== 'function') {
            return () => {};
        }
        if (!this._listeners.has(publicationId)) {
            this._listeners.set(publicationId, new Map());
        }
        const listenersForId = this._listeners.get(publicationId);
        const id = this._nextListenerId++;
        listenersForId.set(id, listener);
        let active = true;
        return () => {
            if (!active) {
                return;
            }
            active = false;
            listenersForId.delete(id);
            if (listenersForId.size === 0) {
                this._listeners.delete(publicationId);
            }
        };
    }

    // 0.9.433 — records `discoverySection` as the CURRENT Announcement/
    // Discovery observation for `(publicationId, discoveryProvider)`,
    // replacing whatever was previously recorded for that exact pair, if
    // anything — see this file's own header, "Replacement per provider,
    // never merge, never accumulation." A different `discoveryProvider` for
    // the same `publicationId` is a different pair, and coexists. Silently
    // does nothing when `publicationId` or `discoveryProvider` is malformed
    // (missing, not a string, or empty), or when `discoverySection` is
    // falsy — never throws. Additive: never touches `_entries`, never calls
    // `set()`, and never notifies a subscriber — see this file's own
    // header, "No new notification vocabulary."
    //
    // AMENDED BY 0.9.443 — an optional fourth argument, `discoveryOrigin`,
    // widens the effective key to `(discoveryProvider, discoveryOrigin)`
    // ONLY when supplied as a non-empty string; see this file's own header,
    // "Nostr Relay Observation Identity Boundary," for the full contract.
    // Omitted (or malformed) `discoveryOrigin` keys by `discoveryProvider`
    // alone, exactly as 0.9.433 always did.
    recordDiscoveryObservation(publicationId, discoveryProvider, discoverySection, discoveryOrigin) {
        if (!isNonEmptyString(publicationId) || !isNonEmptyString(discoveryProvider) || !discoverySection) {
            return;
        }
        if (!this._discoveryObservations.has(publicationId)) {
            this._discoveryObservations.set(publicationId, new Map());
        }
        const byProvider = this._discoveryObservations.get(publicationId);
        if (!byProvider.has(discoveryProvider)) {
            byProvider.set(discoveryProvider, new Map());
        }
        const originKey = isNonEmptyString(discoveryOrigin) ? discoveryOrigin : DEFAULT_ORIGIN_KEY;
        byProvider.get(discoveryProvider).set(originKey, discoverySection);
    }

    // 0.9.433 — returns every currently-recorded Announcement/Discovery
    // observation for `publicationId`, one entry per `discoveryProvider`
    // ever recorded via `recordDiscoveryObservation()`, each shaped
    // `{ discoveryProvider, ...discoverySection }`. Returns `[]`, never
    // `null`, for a malformed `publicationId` or one nothing has ever been
    // recorded for — see this file's own header, "getDiscoveryObservations()
    // returns [], never null or a thrown error."
    //
    // AMENDED BY 0.9.443 — unchanged signature and unchanged return shape.
    // When one or more entries were recorded with a distinguishing
    // `discoveryOrigin`, this now returns one entry PER `(discoveryProvider,
    // discoveryOrigin)` pair rather than one per `discoveryProvider` alone
    // — each still shaped `{ discoveryProvider, ...discoverySection }`,
    // `discoverySection` itself already carrying that same origin under its
    // own existing `origin` field.
    getDiscoveryObservations(publicationId) {
        if (!isNonEmptyString(publicationId)) {
            return [];
        }
        const byProvider = this._discoveryObservations.get(publicationId);
        if (!byProvider) {
            return [];
        }
        return Array.from(byProvider.entries()).flatMap(([discoveryProvider, byOrigin]) =>
            Array.from(byOrigin.values()).map((section) => ({ discoveryProvider, ...section }))
        );
    }

    // Invokes every current subscriber of `publicationId` with
    // `(publicationId, lifecycle)`, isolating each from the others' and
    // from its own failure. Never called directly by anything outside this
    // class; `set()`/`remove()` call it themselves, only after a mutation
    // has actually taken effect.
    _notify(publicationId, lifecycle) {
        const listenersForId = this._listeners.get(publicationId);
        if (!listenersForId) {
            return;
        }
        for (const listener of Array.from(listenersForId.values())) {
            try {
                listener(publicationId, lifecycle);
            } catch (error) {
                // A subscriber's own failure is that subscriber's
                // problem, never the store's.
            }
        }
    }
}
