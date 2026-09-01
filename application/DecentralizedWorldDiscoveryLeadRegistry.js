// 0.9.26 — Decentralized World Discovery Lead Registry.
//
// 0.9.24 named the shape of a lead; 0.9.25 built the seam that asks a
// real service for one. Neither file remembers anything between calls —
// `queryDecentralizedWorldDiscovery()` is pure per call, exactly its own
// header says: "nothing accumulates, nothing is cached." Something has to
// hold the leads a caller has collected so far, the same way 0.9.9's own
// `WorldDiscoverySourceRegistry` is the one piece of mutable state the
// 0.9.5-through-0.9.8 source family was always missing. This file is that
// piece, one layer earlier — for LEADS, never for `WorldDiscoverySource`s.
//
//   queryDecentralizedWorldDiscovery()      lead no longer wanted
//   resolves to DecentralizedWorldDiscoveryLead[]     │
//          │                                          │
//          ▼                                          ▼
//   registry.setLead(lead)  ★ (THIS)      registry.removeLead(origin,
//          │                                 discoveryTag, uri)
//          └───────────────────┬────────────────────┘
//                               ▼
//                     registry.listLeads()
//                               │
//                               ▼
//              (future, unscheduled: deciding whether/how an
//               accepted lead is actually retrieved, hash-verified
//               into a real core/ContentReference.js, and turned
//               into a core/WorldDiscoverySource.js contribution —
//               see "Deliberately excluded," below)
//
// A LEAD REGISTRY, DELIBERATELY NOT A SECOND `WorldDiscoverySourceRegistry`
// — SEE THIS FILE'S OWN NAME. `application/WorldDiscoverySourceRegistry.js`
// holds `WorldDiscoverySource`s: bundles of six record arrays a caller has
// already decided to treat as real World data. A decentralized discovery
// lead is not that — 0.9.24's own header already drew this line in so many
// words: "a lead is deliberately not yet a `ContentReference`... a search
// or index service reporting a lead has done no such thing; it is
// reporting 'try looking here,' never 'I fetched this and it hashes to
// X.'" Putting a lead into `WorldDiscoverySourceRegistry` would collapse
// "I discovered this content" into "I have this World data" — exactly the
// two stages 0.9.24 built this whole family to keep separate. So this file
// introduces its own, parallel registry instead of extending or wrapping
// the existing one, and never imports `application/
// WorldDiscoverySourceRegistry.js` or anything it produces.
//
// MEMBERSHIP, NOT COMPUTATION — INHERITED FROM 0.9.9 UNCHANGED, ONE LAYER
// EARLIER. This file answers exactly one question: "which decentralized
// discovery leads are currently known?" It never decides whether a lead is
// worth acting on, never retrieves anything a lead's own `uri` points at,
// and never constructs a `core/ContentReference.js`,
// `core/DecentralizedPublication.js`, or `core/WorldDiscoverySource.js`
// from one. A caller reads `listLeads()` and decides what, if anything,
// happens next — this file's own job stops at `leads[]`, exactly as
// `WorldDiscoverySourceRegistry`'s own job stops at `sources[]`.
//
// IDENTITY IS THE TRIPLE `origin` + `discoveryTag` + `uri` — DELIBERATELY
// NOT `uri` ALONE, AND DELIBERATELY NOT A SEPARATE CALLER-CHOSEN ID. 0.9.9's
// own `WorldDiscoverySourceRegistry` keys a source by `origin` alone,
// because a `WorldDiscoverySource`'s `origin` already IS the one contributor
// identity that matters — one peer, one bundle. A lead has no such single
// natural key: the very same `uri` can be reported by two entirely
// different discovery services (two independent leads, corroborating
// nothing, per 0.9.24's own header — "this file never treats a shared
// `uri` as evidence the three reports corroborate each other"), and the
// very same service can report the very same `uri` for two different
// discovery tags. Keying on `uri` alone would silently let a later lead
// from a DIFFERENT service overwrite an earlier one just because they
// happen to name the same location — precisely the false corroboration
// 0.9.24 refused to assume. So `setLead(lead)`/`removeLead(origin,
// discoveryTag, uri)` identify a lead's own slot by all three fields
// together; two leads differing in any one of them occupy independent
// slots, and only an exact match on the whole triple replaces or removes
// the same slot.
//
// REPLACEMENT, NOT ACCUMULATION — WITHIN ONE IDENTITY TRIPLE. Calling
// `setLead(lead)` again for a triple that already occupies a slot replaces
// that slot's lead; it never appends a second entry alongside it. This
// mirrors 0.9.9's own "replacement, not accumulation" rule exactly, held
// here over the finer-grained composite identity a lead needs instead of
// `WorldDiscoverySource`'s own single `origin`.
//
// REMOVAL IS PLAIN ABSENCE, NEVER A TOMBSTONE — INHERITED FROM 0.9.9
// UNCHANGED. `removeLead(origin, discoveryTag, uri)` deletes that triple's
// entry outright; `listLeads()` afterward looks exactly as if that lead had
// never been set. There is no `stale`, `expired`, `rejected`, or `seen`
// flag left behind — a lead this registry no longer holds is a lead this
// registry has never heard of, exactly as far as any caller can tell.
//
// `listLeads()` ORDER: EACH TRIPLE'S FIRST-EVER `setLead()` CALL FIXES ITS
// POSITION; REPLACING AN EXISTING TRIPLE NEVER MOVES IT; REMOVING AND LATER
// RE-ADDING THE SAME TRIPLE PLACES IT LAST, AS A NEW ENTRY. Exactly 0.9.9's
// own ordering rule, `Map`'s own iteration-order contract used as-is, held
// here over the composite key instead of a bare `origin` string.
//
// NO DEDUPLICATION, RANKING, OR TRUST JUDGMENT ACROSS LEADS — INHERITED
// FROM 0.9.24's OWN "ONE LEAD PER CALL," HELD HERE ACROSS THE WHOLE
// CURRENTLY-KNOWN SET. Two leads that share a `uri` but differ in `origin`
// or `discoveryTag` sit side by side in `listLeads()` forever, exactly as
// independent as the two `setLead()` calls that produced them — this file
// never merges them, never picks a "better" one, and never lets one
// silently supersede the other. No `trusted`, `verified`, `authority`,
// `priority`, `weight`, or `confidence` field or method exists here or
// ever will at this layer.
//
// NO QUERY SERVICE, NO NETWORK, NO POLLING, NO RETRY. This file never
// imports `application/DecentralizedWorldDiscoveryQuery.js`,
// `application/ArweaveGraphqlDiscoveryQueryService.js`, `fetch`, or
// `WebSocket`. It does not know when a query happened, how often, or
// against which service — it only knows that some caller told it, via
// `setLead()`/`removeLead()`, that a lead now exists or no longer matters.
// Deciding WHEN to call `queryDecentralizedWorldDiscovery()` and feed its
// result in here remains a separate, unscheduled bridge's own job — see
// "Deliberately excluded," below.
//
// NO RETRIEVAL, NO VERIFICATION, NO `ContentReference` OR
// `WorldDiscoverySource` CONSTRUCTION. This file never imports
// `core/ContentReference.js`, `core/DecentralizedPublication.js`,
// `core/WorldDiscoverySource.js`, or `core/WorldEncounter.js`, and never
// fetches bytes from a lead's own `uri`. A lead stays exactly what 0.9.24
// already called it — a rumor about where material MIGHT live — for as
// long as it lives in this registry.
//
// LEADS ARE OPAQUE BEYOND THEIR OWN IDENTITY FIELDS — INHERITED FROM
// 0.9.9's OWN TREATMENT OF A SOURCE'S SIX RECORD ARRAYS. This file never
// looks inside a lead beyond reading `origin`, `discoveryTag`, and `uri`
// to compute its identity; it never inspects, validates, or reconstructs
// `storage`. It does not call `describeDecentralizedWorldDiscoveryLead()`
// itself — a caller is expected to hand this registry an
// already-described lead (typically 0.9.25's own
// `queryDecentralizedWorldDiscovery()` result), and this file re-derives
// none of 0.9.24's own validation, exactly as 0.9.9 never re-derives 0.9.5's.
//
// MALFORMED INPUT DEGRADES SILENTLY, NEVER THROWS — INHERITED FROM 0.9.9.
// `setLead(lead)` silently ignores a `lead` that is missing, not an
// object, or missing a non-empty-string `origin`, `discoveryTag`, or `uri`.
// `removeLead(origin, discoveryTag, uri)` silently ignores any of the
// three arguments that is missing, not a string, or empty. Neither method
// ever throws, and neither ever partially mutates the registry on
// malformed input.
//
// CHANGE NOTIFICATION — THE SAME SEAM 0.9.12 ALREADY BUILT FOR
// `WorldDiscoverySourceRegistry`, HELD HERE FROM THE START RATHER THAN AS A
// LATER MILESTONE. `registry.subscribe(listener)` registers `listener` to
// be called with no arguments whenever `setLead()`, `removeLead()`, or
// `clear()` actually changes membership — never on a no-op call. Exactly
// 0.9.12's own contract: synchronous delivery, no event payload, no
// dedup of identical listener references, each subscriber isolated in its
// own `try`/`catch` so one throwing never breaks another or the mutation
// that triggered it, and `unsubscribe()` idempotent and permanent. A
// subscriber that wants to know what changed reads `listLeads()` itself.
//
// LIVE, IN-MEMORY, PER-INSTANCE STATE — NOT A SINGLETON, NOT PERSISTED.
// Each `new DecentralizedWorldDiscoveryLeadRegistry()` holds its own
// independent set of leads; nothing here is shared module-level state, and
// nothing here is written to a `StorageProvider` or survives a page
// reload. A caller owns exactly one instance for as long as it cares to
// keep collecting leads.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A bridge that calls `queryDecentralizedWorldDiscovery()` and feeds
//   its result into `setLead()` automatically.** This file is told; it
//   never asks a query service on its own. Unscheduled follow-up work.
// - **Deciding whether an accepted lead becomes a real
//   `core/WorldDiscoverySource.js` contribution, or wiring anything into
//   `application/WorldDiscoverySourceRegistry.js`.** See "A lead registry,
//   deliberately not a second WorldDiscoverySourceRegistry," above — this
//   remains unscheduled, later work, approached only once something
//   downstream has actually retrieved and hash-verified a lead's own
//   bytes.
// - **Retrieving content from a lead's own `uri`, or constructing a real,
//   hash-verified `core/ContentReference.js`/
//   `core/DecentralizedPublication.js`.** Unscheduled, per 0.9.24's own
//   header.
// - **Deduplication, ranking, expiry, staleness, or any trust/authority
//   judgment about a lead, including between two leads that share a
//   `uri`.** See "No deduplication, ranking, or trust judgment across
//   leads," above.
// - **Persisting the current lead set to a `StorageProvider`, or across a
//   page reload.** The registry's contents are exactly as durable as the
//   running session that owns it — nothing more.
// - **Validating or re-describing a lead's own shape.** See "Leads are
//   opaque beyond their own identity fields," above — that is
//   `core/DecentralizedWorldDiscoveryLead.js`'s own job, already done
//   before a lead ever reaches this file.

function isDescribedLead(value) {
    return Boolean(value)
        && typeof value === 'object'
        && typeof value.origin === 'string' && value.origin.length > 0
        && typeof value.discoveryTag === 'string' && value.discoveryTag.length > 0
        && typeof value.uri === 'string' && value.uri.length > 0;
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

function leadKey(origin, discoveryTag, uri) {
    return JSON.stringify([origin, discoveryTag, uri]);
}

export class DecentralizedWorldDiscoveryLeadRegistry {
    constructor() {
        this._leads = new Map();
        this._listeners = new Map();
        this._nextListenerId = 0;
    }

    // Adds or replaces the lead occupying the `(origin, discoveryTag, uri)`
    // slot `lead` itself identifies — see this file's own header,
    // "Identity is the triple," and "Replacement, not accumulation." A
    // malformed `lead` (missing, not an object, or missing a non-empty
    // `origin`, `discoveryTag`, or `uri`) is silently ignored, never
    // thrown. Notifies every current subscriber whenever `lead` IS stored,
    // never when it's ignored as malformed.
    setLead(lead) {
        if (!isDescribedLead(lead)) {
            return;
        }
        this._leads.set(leadKey(lead.origin, lead.discoveryTag, lead.uri), lead);
        this._notify();
    }

    // Removes whatever lead currently occupies the `(origin, discoveryTag,
    // uri)` slot, if any — plain absence afterward, never a tombstone. Any
    // argument that is missing, not a string, or empty means there is
    // nothing describable to remove, and the call is silently ignored.
    // Removing a slot with no current lead is a no-op. Notifies every
    // current subscriber only when a lead actually occupied that slot
    // immediately beforehand — never on a no-op removal.
    removeLead(origin, discoveryTag, uri) {
        if (!isNonEmptyString(origin) || !isNonEmptyString(discoveryTag) || !isNonEmptyString(uri)) {
            return;
        }
        if (this._leads.delete(leadKey(origin, discoveryTag, uri))) {
            this._notify();
        }
    }

    // The current lead set, one entry per distinct `(origin, discoveryTag,
    // uri)` triple, in the order documented in this file's own header —
    // frozen, and a fresh array on every call, so a caller can never
    // mutate the registry's own internal state through the result.
    listLeads() {
        return Object.freeze(Array.from(this._leads.values()));
    }

    // Removes every currently-registered lead. The registry afterward
    // behaves exactly as it did immediately after construction. Notifies
    // every current subscriber only when the registry held at least one
    // lead immediately beforehand — never on an already-empty registry.
    clear() {
        if (this._leads.size === 0) {
            return;
        }
        this._leads.clear();
        this._notify();
    }

    // Registers `listener` to be called, with no arguments, on every
    // future change notification — see this file's own header, "Change
    // notification." Returns an `unsubscribe` function that removes
    // exactly this one subscription; calling it more than once is a
    // harmless no-op. A non-function `listener` registers no subscription
    // and never throws; the returned `unsubscribe` is still safely
    // callable in that case. Subscribing the same function reference more
    // than once registers that many independent subscriptions.
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
    // from the others' and from its own failure. Never called directly by
    // anything outside this class; `setLead()`/`removeLead()`/`clear()`
    // call it themselves, only after a mutation has actually taken effect.
    _notify() {
        for (const listener of Array.from(this._listeners.values())) {
            try {
                listener();
            } catch (error) {
                // A subscriber's own failure is that subscriber's
                // problem, never the registry's.
            }
        }
    }
}
