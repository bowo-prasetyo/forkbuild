// 0.9.552 — Observer-Local Novel Publication Encounter Presentation.
//
// core/ObserverLocalPublicationEncounter.js describes ONE encounter, purely,
// with no memory of any other call. Nothing yet held one across the several
// ticks a Wanderer's own `WorldView` mount lives through, or gave
// `ui/components/WorldEncounterCanvas.js` a seam to subscribe to the way it
// already subscribes to `application/discovery/WorldDiscoverySourceRegistry.js`. This
// file is that seam, and nothing more — modeled directly on
// `WorldDiscoverySourceRegistry`'s own `subscribe()`/`_notify()` contract
// (0.9.12), so `WorldEncounterCanvas` can treat it exactly the same way it
// already treats that registry, with one deliberate difference named below.
//
// A SESSION-SCOPED STORE, NEVER THE SHARED `WorldDiscoverySourceRegistry`.
// 0.9.551 Section E2 found the existing shared registry carries no notion
// of a non-shared, observer-scoped registration, and that Model 3 needs "a
// genuinely new, session-scoped surface, never a mode flag on the existing
// shared WorldDiscoverySourceRegistry." This class is that new surface: a
// fresh instance is constructed once per `WorldView` mount (mirroring
// `AutomaticSnapshotEncounterCascade`'s own "a fresh instance accompanies
// each fresh session" posture), holds state purely in memory for that
// instance's own lifetime, and is never wired into, read by, or written to
// the shared `WorldDiscoverySourceRegistry`. Two Wanderers — two separate
// `WorldView` mounts, two separate `AutomaticSnapshotEncounterCascade`
// instances, two separate `ObserverLocalEncounterStore` instances — never
// share a single encounter recorded here: Wanderer A recording a novel
// encounter has no way to reach Wanderer B's own store, because there is no
// shared object between them at all. That IS the cross-Wanderer isolation
// property this milestone's own acceptance criteria name; it falls out of
// construction, not a guard this file has to enforce.
//
// `record()` REPLACES, KEYED BY `publicationId:contentHash` — THE SAME
// PROCESSING-IDENTITY KEY `AutomaticSnapshotEncounterCascade`'s OWN
// IDEMPOTENCY MAP ALREADY USES. Recording the identical subject twice
// (e.g. a later observation tick re-processing an already-recorded
// candidate) replaces its entry rather than accumulating a duplicate row —
// mirroring `WorldDiscoverySourceRegistry#setSource()`'s own "replacement,
// not accumulation" rule, one layer over.
//
// `list()` RETURNS A FRESH, FROZEN ARRAY, NEVER THE INTERNAL MAP. Exactly
// like `WorldDiscoverySourceRegistry#listSources()`, a caller can never
// mutate this store's own state through the result.
//
// `subscribe()`/`_notify()` MIRROR 0.9.12's OWN CONTRACT EXACTLY:
// `listener()` takes no arguments (a notification means only "call `list()`
// again if you care what changed"), each `subscribe()` call is its own
// independent subscription, `unsubscribe()` is idempotent and permanent,
// and a malformed `listener` degrades silently rather than throwing. A
// subscriber's own failure is isolated from every other subscriber and
// from this store itself.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Persistence of any kind.** No `StorageProvider`, no survival across a
//   page reload or a fresh `WorldView` mount — this store lives and dies
//   with the one instance holding it, exactly like
//   `AutomaticSnapshotEncounterCascade`'s own `_results` map.
// - **Promotion to a `PlacementRecord`, or any write to
//   `application/discovery/WorldDiscoverySourceRegistry.js` or a `PlacementRegistry`
//   of any kind.** See this file's own header, above.
// - **Expiry, eviction, or removal of any kind.** A recorded encounter
//   stays recorded for this instance's own lifetime; a caller wanting a
//   fresh, empty store starts a fresh `WorldView` mount, exactly the same
//   restraint `AutomaticSnapshotEncounterCascade`'s own idempotency map
//   already holds ("a caller wanting a fresh attempt... needs a fresh
//   instance").
// - **Ranking, sorting, deduplication-by-preference, or "most relevant
//   encounter" of any kind.** `list()` returns every recorded encounter,
//   in insertion order, exactly as recorded.

function isEncounterLike(value) {
    return Boolean(value)
        && typeof value.publicationId === 'string' && value.publicationId.length > 0
        && typeof value.contentHash === 'string' && value.contentHash.length > 0;
}

export class ObserverLocalEncounterStore {
    constructor() {
        this._encounters = new Map();
        this._listeners = new Map();
        this._nextListenerId = 0;
    }

    // Records `encounter` — the SAME frozen shape
    // `describeObserverLocalPublicationEncounter()` already returns — under
    // its own `publicationId:contentHash` key, replacing whatever
    // (if anything) already occupied that key. A malformed `encounter`
    // (missing, or lacking either identity field) is silently ignored,
    // never thrown, and never notifies. Notifies every current subscriber
    // whenever `encounter` IS stored.
    record(encounter) {
        if (!isEncounterLike(encounter)) {
            return;
        }
        const key = `${encounter.publicationId}:${encounter.contentHash}`;
        this._encounters.set(key, encounter);
        this._notify();
    }

    // Every currently-recorded encounter, in insertion order — frozen, and
    // a fresh array on every call, so a caller can never mutate this
    // store's own internal state through the result.
    list() {
        return Object.freeze(Array.from(this._encounters.values()));
    }

    // Registers `listener` to be called, with no arguments, on every
    // future `record()` that actually stores something — see this file's
    // own header, "subscribe()/_notify() mirror 0.9.12's own contract
    // exactly." Returns an idempotent `unsubscribe` function.
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

    _notify() {
        for (const listener of Array.from(this._listeners.values())) {
            try {
                listener();
            } catch (error) {
                // A subscriber's own failure is that subscriber's problem,
                // never this store's — mirroring WorldDiscoverySourceRegistry's
                // own subscriber isolation exactly.
            }
        }
    }
}
