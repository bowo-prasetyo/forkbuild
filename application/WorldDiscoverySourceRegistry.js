// 0.9.9 — World Discovery Source Lifecycle.
//
// 0.9.5 named the seam (`WorldDiscoverySource`), 0.9.6 crossed it once per
// peer message, 0.9.7 concatenated any number of already-described
// sources, and 0.9.8 wired the result into a running World View — but
// every one of those four files' own headers named, and explicitly
// refused to take, the same next step. 0.9.8's own header put it exactly:
// "Live peer-source lifecycle (a source entering when a peer appears,
// leaving when a peer disappears). This file holds no state between
// calls and subscribes to nothing; a caller decides, on every call,
// exactly which sources currently apply." This file is that caller. It
// is the one piece of mutable state the whole 0.9.5-through-0.9.8 family
// was always missing: which sources currently exist, right now.
//
//   peer becomes available                 peer becomes unavailable
//          │                                        │
//          ▼                                        ▼
//   WorldDiscoverySource                    registry.removeSource(origin)
//          │                                        │
//          ▼                                        │
//   registry.setSource(source)  ★ (THIS)            │
//          │                                        │
//          └───────────────────┬────────────────────┘
//                               ▼
//                     registry.listSources()
//                               │
//                               ▼
//        application/WorldEncounterIntegration.js   (0.9.8, unchanged)
//               describeWorldFromDiscoverySources()
//                               │
//                               ▼
//                          World View
//
// MEMBERSHIP, NOT COMPUTATION. This file answers exactly one question:
// "which `WorldDiscoverySource` bundles currently exist?" It never
// answers "what does the World look like" — it has no idea
// `deriveWorldEncounters()`, `assembleWorldDiscoveryInputs()`, or
// `describeWorldFromDiscoverySources()` exist, imports none of
// 0.9.0/0.9.7/0.9.8, and calls none of them. A caller reads
// `listSources()` and hands the result to 0.9.8's own
// `describeWorldFromDiscoverySources()` itself, exactly as the diagram
// above shows — this file's own job stops at `sources[]`.
//
// KEYED BY `origin`, NEVER BY A SEPARATE CALLER-CHOSEN ID. 0.9.5's own
// `origin` field is already the one stable identity a `WorldDiscoverySource`
// carries — `'local'`, `'peer:<identityId>'`, or any other free-form label
// a future origin might use. This file introduces no second identity
// scheme alongside it: `setSource(source)` takes the whole, already-
// described source and reads `source.origin` itself to decide which slot
// it occupies. There is no `setSource(id, source)` two-argument form, and
// no way for a caller to register a source under an origin other than its
// own.
//
// REPLACEMENT, NOT ACCUMULATION — SETTING AN ORIGIN THAT ALREADY EXISTS
// REPLACES ITS PREVIOUS CONTRIBUTION; IT NEVER APPENDS A SECOND ONE. If
// peer A's presence updates and this file's caller calls `setSource()`
// again with a freshly-described `peer:<identityId>` source, the registry
// holds exactly one current `peer:<identityId>` entry afterward — never
// two, and never the old one lingering alongside the new one. This is
// deliberately the opposite of 0.9.7's own "assembly is not reconciliation"
// rule: 0.9.7 concatenates the SAME source list every time it's called and
// preserves every duplicate a caller hands it; this file is what decides,
// between calls, what that source list even IS. Assembly preserves
// duplicates across sources; lifecycle decides which source instances
// currently exist. Both rules are correct at their own layer, and neither
// contradicts the other.
//
// REMOVAL IS PLAIN ABSENCE, NEVER A TOMBSTONE. `removeSource(origin)`
// deletes that origin's entry outright. It never marks a source
// "revoked," "invalidated," "untrusted," "stale," or "offline" — there is
// no field, flag, or record of any kind left behind once an origin is
// removed, and `listSources()` afterward looks exactly as if that origin
// had never been set at all. This mirrors 0.9.0's own rule that an avatar
// needs a LIVE presence to be encounterable, one layer up: a peer that has
// disappeared contributes nothing, not a ghost contribution marked absent.
//
// A REMOVED ORIGIN THAT RETURNS IS A FRESH SLOT, NOT A REVIVED ONE. Once
// `removeSource('peer:A')` has been called, that origin no longer exists
// in the registry in any form. A later `setSource()` for the same origin
// creates a new entry from scratch — this file keeps no memory of what
// `peer:A` used to contribute, and a caller who wants continuity has to
// supply it themselves via a fresh, complete `WorldDiscoverySource`.
//
// `listSources()` ORDER: EACH ORIGIN'S FIRST-EVER `setSource()` CALL FIXES
// ITS POSITION; REPLACING AN EXISTING ORIGIN'S CONTRIBUTION NEVER MOVES
// IT; REMOVING AND LATER RE-ADDING AN ORIGIN PLACES IT LAST, AS A NEW
// ENTRY. This is exactly `Map`'s own iteration-order contract, used
// as-is rather than reimplemented: this file has no sorting, grouping, or
// "local first" rule of its own — see 0.9.7's own header, "no `local
// first` special case hard-coded here," which this file extends from
// source CONTENT to source ORDER.
//
// NO ORIGIN-BASED JUDGMENT, NO TRUST VOCABULARY — inherited unchanged
// from 0.9.5 through 0.9.8. `'local'` occupies a slot exactly like
// `'peer:<identityId>'` does: nothing here treats it as privileged,
// permanent, or exempt from removal. No `trusted`, `verified`,
// `authority`, `priority`, or `weight` field or method exists here or
// ever will at this layer.
//
// NO DEDUPLICATION, NO RECONCILIATION, NO RECORD-LEVEL LOGIC OF ANY KIND.
// This file never looks inside a source's own six record arrays — it
// treats a `WorldDiscoverySource` as one opaque unit, identified solely by
// `origin`. It never matches a record across two sources, never merges
// two sources' arrays together, and never mutates a record.
//
// NO ENCOUNTER DERIVATION — inherited from 0.9.7's and 0.9.8's own
// refusal. This file never imports `core/WorldEncounter.js`,
// `core/WorldDiscoverySourceAssembly.js`, or
// `application/WorldEncounterIntegration.js`, and never calls
// `deriveWorldEncounters()`, `assembleWorldDiscoveryInputs()`, or
// `describeWorldFromDiscoverySources()`. See "Membership, not
// computation," above.
//
// NO PEER TRANSPORT, NO NETWORK, NO PERSISTENCE. This file never imports
// `peer/PeerMessageBus.js`, `peer/PeerConnection.js`, any
// `PeerDiscoveryProvider`, or a `StorageProvider`. It does not know when a
// peer connects or disconnects — it only knows that some caller told it,
// via `setSource()`/`removeSource()`, that a source now exists or no
// longer does. Deciding WHEN to make those calls remains the peer
// transport layer's own job, exactly as 0.9.6's own header already drew
// that line for describing a single message.
//
// LIVE, IN-MEMORY, PER-INSTANCE STATE — NOT A SINGLETON. Each
// `new WorldDiscoverySourceRegistry()` holds its own independent set of
// sources; nothing here is shared module-level state. This file lives in
// `application/`, not `core/`, precisely because it IS mutable state,
// unlike every pure `core/` file the 0.9.5-through-0.9.7 family already
// established — a caller owns exactly one instance for the lifetime of a
// running World View.
//
// 0.9.12 — WORLD DISCOVERY REGISTRY CHANGE NOTIFICATION. 0.9.10's own
// header named the gap in so many words: "nothing here watches,
// subscribes to, or is notified of a registry change on its own...
// Reactive, automatic recomputation is separate, later, unscheduled
// work." This milestone is the seam that later work subscribes through —
// `registry.subscribe(listener)` — and only that seam.
//
//   registry.setSource(source)              const unsubscribe =
//   registry.removeSource(origin)              registry.subscribe(listener)
//   registry.clear()                                 │
//          │                                          │
//          ▼                                          │
//   membership actually changed? ──── yes ──▶ listener()  (no arguments)
//          │
//          no
//          │
//          ▼
//     (no notification)
//
// `listener()` TAKES NO ARGUMENTS, EVER. A notification means exactly
// one thing — "the registry's snapshot may have changed; call
// `listSources()` again if you care what it now looks like." It carries
// no `{ origin, action, source }` detail object, because the registry's
// own `listSources()` already is the one authoritative source of truth;
// inventing a second, event-shaped description of the same change would
// give a caller two things to keep in sync instead of one. A subscriber
// that wants to know what changed reads `listSources()` itself, exactly
// as `application/WorldDiscoveryRegistryProjection.js`'s own
// `describeWorldFromDiscoveryRegistry(registry)` already does.
//
// A SUCCESSFUL MUTATION IS THE NOTIFICATION RULE — NO STRUCTURAL
// EQUALITY, ANYWHERE. `setSource(source)` notifies every subscriber
// whenever it actually stores `source` — including when an origin that
// already existed is replaced by a new, possibly field-for-field
// identical, source. This file never compares the new source against the
// one it replaces to decide whether anything "really" changed; doing so
// would make the registry a second comparison engine, exactly what "No
// source comparison," above, already rules out for `setSource()` in
// general. `removeSource(origin)` notifies only when that origin
// actually held a source immediately beforehand — `this._sources.delete
// (origin)` returning `true` — never on a no-op removal of an origin
// that was already absent. `clear()` notifies only when the registry held
// at least one source immediately beforehand, never on an already-empty
// registry.
//
// SUBSCRIBER ISOLATION: ONE LISTENER THROWING NEVER BREAKS ANOTHER
// LISTENER, AND NEVER BREAKS THE MUTATION THAT TRIGGERED IT. Each
// subscriber is invoked inside its own `try`/`catch`; an exception a
// listener throws is discarded right there; every remaining subscriber
// still runs, and `setSource()`/`removeSource()`/`clear()` themselves
// still return normally, exactly as they would with no subscribers at
// all. A malfunctioning World View is a UI-layer problem, never the
// registry's own membership state to protect against by refusing a
// mutation.
//
// EACH `subscribe()` CALL IS ITS OWN INDEPENDENT SUBSCRIPTION — NO
// IDENTITY-BASED DEDUPLICATION. Calling `registry.subscribe(listener)`
// twice with the exact same function reference registers two
// subscriptions, each notified separately and each with its own
// `unsubscribe()`; there is no `Set`-of-functions collapsing the second
// call into the first, and no hidden "already subscribed" check. This
// keeps the API's contract simple and observable purely from its own
// return value — a caller never has to reason about whether some OTHER
// caller already subscribed the same function.
//
// `unsubscribe()` IS IDEMPOTENT AND PERMANENT. Calling the function
// `subscribe()` returns removes exactly that one subscription; calling it
// again afterward is a harmless no-op, never an error and never a removal
// of some other, later subscription that happens to reuse a freed slot.
// Once unsubscribed, that listener is never invoked by this registry
// again — including from a mutation already in progress when
// `unsubscribe()` was itself called from inside another listener.
//
// MALFORMED `subscribe()` INPUT DEGRADES SILENTLY, INHERITED FROM EVERY
// OTHER METHOD ON THIS FILE. A non-function `listener` registers no
// subscription and never throws; `subscribe()` still returns a callable
// `unsubscribe` in that case — a harmless no-op — so a caller never has
// to type-check the return value before using it.
//
// STILL NO EVENT PAYLOAD, NO ASYNC/BATCHED DELIVERY, NO ONE-TIME
// ("once") SUBSCRIPTIONS, NO WILDCARD OR ORIGIN-FILTERED SUBSCRIPTIONS,
// AND STILL NO GENERALIZED STATE-MANAGEMENT FRAMEWORK. `subscribe()` is
// deliberately the entire addition: notification is synchronous (a
// listener runs inside the very same `setSource()`/`removeSource()`/
// `clear()` call that triggered it, before that call returns), untyped
// (`listener()`, nothing more), and unfiltered (every subscriber hears
// about every change to any origin — there is no
// `registry.subscribe(origin, listener)` form). A caller that wants
// origin-scoped reactions, coalesced/debounced notification, or a
// `describeWorldFromDiscoveryRegistry()` call made automatically on its
// behalf builds that on top of this seam; none of it lives here.
//
// STILL NO PEER KNOWLEDGE, NO WORLD COMPUTATION, NO SOURCE COMPARISON —
// UNCHANGED FROM 0.9.9. `subscribe()`/`_notify()` add no new import and
// no new vocabulary; every rule this file's own header already
// establishes above — membership not computation, no encounter
// derivation, no peer transport, no trust vocabulary, no deduplication —
// applies to the notification seam exactly as it applies to
// `setSource()`/`removeSource()`/`clear()` themselves.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Calling `deriveWorldEncounters()`, `assembleWorldDiscoveryInputs()`,
//   or `describeWorldFromDiscoverySources()`.** See "No encounter
//   derivation," above — a caller does that itself, with this file's own
//   `listSources()` result.
// - **Deduplication, reconciliation, source prioritization, trust
//   decisions, signature verification, or any record-level judgment.**
//   See "No deduplication," above.
// - **Tombstones, "offline" markers, revocation, invalidation, or any
//   record of a source that used to exist.** See "Removal is plain
//   absence," above.
// - **Deciding WHEN a peer has appeared or disappeared, or reading
//   anything off `peer/PeerMessageBus.js`, `peer/PeerConnection.js`, or
//   any `PeerDiscoveryProvider`/`PeerConnectionProvider`.** This file is
//   told; it never finds out on its own.
// - **Persisting the current source set to a `StorageProvider`, or across
//   a page reload.** The registry's contents are exactly as durable as
//   the running World View session that owns it — nothing more.
// - **An event payload, async or batched delivery, "once" subscriptions,
//   or origin-filtered/wildcard subscriptions.** See "Still no event
//   payload," above — 0.9.12's own `subscribe()` stays exactly this
//   narrow.
// - **A retry system, or any generalized state-management framework.**
//   `setSource()`, `removeSource()`, `listSources()`, `clear()`, and now
//   `subscribe()` are the entire surface.
// - **The World View itself subscribing and re-rendering.** See 0.9.10's
//   own epilogue and 0.9.11's own header — that remains 0.9.13,
//   unscheduled here. This milestone only proves the registry CAN notify
//   a subscriber; wiring an actual running World View to call
//   `subscribe()` and re-project on notification is separate work.
// - **Validating, verifying, or trusting a source's OWN contents** beyond
//   the same "is this a describable `WorldDiscoverySource`" check 0.9.5
//   already performs. This file re-derives nothing 0.9.5 already decided.

function isDescribedSource(value) {
    return Boolean(value) && typeof value === 'object' && typeof value.origin === 'string' && value.origin.length > 0;
}

export class WorldDiscoverySourceRegistry {
    constructor() {
        this._sources = new Map();
        this._listeners = new Map();
        this._nextListenerId = 0;
    }

    // Adds or replaces the source occupying `source.origin`'s own slot —
    // see this file's own header, "Replacement, not accumulation." A
    // malformed `source` (missing, not an object, or with no non-empty
    // `origin` string) is silently ignored, never thrown, exactly
    // mirroring 0.9.5's own "malformed source degrades, never throws"
    // contract one layer up. Notifies every current subscriber — see
    // "A successful mutation is the notification rule," above — whenever
    // `source` IS stored, never when it's ignored as malformed.
    setSource(source) {
        if (!isDescribedSource(source)) {
            return;
        }
        this._sources.set(source.origin, source);
        this._notify();
    }

    // Removes whatever source currently occupies `origin`'s slot, if any
    // — plain absence afterward, never a tombstone. A malformed `origin`
    // (missing, not a string, or empty) is silently ignored. Removing an
    // origin with no current source is a no-op. Notifies every current
    // subscriber only when a source actually occupied `origin`
    // immediately beforehand — never on a no-op removal.
    removeSource(origin) {
        if (typeof origin !== 'string' || origin.length === 0) {
            return;
        }
        if (this._sources.delete(origin)) {
            this._notify();
        }
    }

    // The current source set, one entry per distinct `origin`, in the
    // order documented in this file's own header — frozen, and a fresh
    // array on every call, so a caller can never mutate the registry's
    // own internal state through the result.
    listSources() {
        return Object.freeze(Array.from(this._sources.values()));
    }

    // Removes every currently-registered source. The registry afterward
    // behaves exactly as it did immediately after construction. Notifies
    // every current subscriber only when the registry held at least one
    // source immediately beforehand — never on an already-empty registry.
    clear() {
        if (this._sources.size === 0) {
            return;
        }
        this._sources.clear();
        this._notify();
    }

    // Registers `listener` to be called, with no arguments, on every
    // future change notification — see this file's own header, "0.9.12 —
    // World discovery registry change notification." Returns an
    // `unsubscribe` function that removes exactly this one subscription;
    // calling it more than once is a harmless no-op. A non-function
    // `listener` registers no subscription and never throws; the returned
    // `unsubscribe` is still safely callable in that case. Subscribing the
    // same function reference more than once registers that many
    // independent subscriptions — see "Each subscribe() call is its own
    // independent subscription," above.
    subscribe(listener) {
        if (typeof listener !== 'function') {
            return () => {};
        }
        const id = this._nextListenerId++;
        this._listeners.set(id, listener);
        let active = true;
        return () => {
            if (!active) {
                return;
            }
            active = false;
            this._listeners.delete(id);
        };
    }

    // Invokes every current subscriber with no arguments, isolating each
    // from the others' and from its own failure — see this file's own
    // header, "Subscriber isolation." Never called directly by anything
    // outside this class; `setSource()`/`removeSource()`/`clear()` call it
    // themselves, only after a mutation has actually taken effect.
    _notify() {
        for (const listener of Array.from(this._listeners.values())) {
            try {
                listener();
            } catch (error) {
                // A subscriber's own failure is that subscriber's
                // problem, never the registry's — see "Subscriber
                // isolation," above.
            }
        }
    }
}
