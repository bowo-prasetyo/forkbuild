import { describeDecentralizedWorldDiscoveryLead } from '../core/DecentralizedWorldDiscoveryLead.js';

// 0.9.25 — Decentralized Discovery Query Adapter.
//
// 0.9.24 named the SHAPE of a rumor a decentralized discovery mechanism
// reports — `describeDecentralizedWorldDiscoveryLead()` — but was
// deliberately handed one already, never went and asked a real service
// for one. This milestone is the seam that asks: given a ForkBuild
// discovery tag, query ONE explicitly-injected discovery service, and
// turn whatever candidate locations it reports back into leads.
//
//   discoveryTag
//         │
//         ▼
//   application/DecentralizedWorldDiscoveryQuery.js   ★ (THIS milestone)
//        queryDecentralizedWorldDiscovery()
//         │
//         ▼
//   DecentralizedDiscoveryQueryService   (an injected, service-specific
//        .origin / .search(discoveryTag)   adapter — see
//                                           application/
//                                           ArweaveGraphqlDiscoveryQueryService.js
//                                           for the first concrete one)
//         │
//         ▼
//   [ { uri, storage }, ... ]   (raw candidates, already parsed out of
//                                 that service's own wire format)
//         │
//         ▼
//   core/DecentralizedWorldDiscoveryLead.js   (0.9.24, unmodified)
//        describeDecentralizedWorldDiscoveryLead()
//         │
//         ▼
//   DecentralizedWorldDiscoveryLead[]
//
// `DecentralizedDiscoveryQueryService` IS THE CONTRACT A CONCRETE ADAPTER
// IMPLEMENTS — MIRRORING `application/WorldEncounterMaterialLoading.js`'s
// AND `content/ContentStore.js`'s OWN "THROW IF UNIMPLEMENTED" SHAPE, ONE
// LAYER OVER FOR A DIFFERENT SUBSYSTEM. Its `origin` getter and its
// `search(discoveryTag)` method both throw on the base class, on
// purpose, so a caller that forgets to inject a real adapter fails
// loudly during development rather than silently reporting zero leads
// for the wrong reason. This file ships with no concrete service of its
// own — see `application/ArweaveGraphqlDiscoveryQueryService.js` for the
// first one — and never imports `fetch`, `WebSocket`, or any specific
// backend's SDK.
//
// EXACTLY ONE SERVICE PER CALL — NO FAN-OUT, NO RACE, NO FALLBACK.
// `queryDecentralizedWorldDiscovery()` asks the one injected service and
// nothing else, exactly the restraint `application/
// PeerWorldEncounterMaterialSource.js`'s own header already holds for
// exactly one peer. Querying several services and combining what they
// each report is deliberately not this milestone — see 0.9.24's own
// header, "one lead per call... it has no plural counterpart" — that
// restraint holds here one layer up: this file has no
// `queryDecentralizedWorldDiscoveryFromManyServices()` either.
//
// `origin` NAMES THE SERVICE, NEVER A CANDIDATE'S OWN URI — ASSIGNED HERE,
// NEVER BY THE SERVICE'S OWN CANDIDATE LIST. A concrete service's
// `search()` returns bare `{ uri, storage }` candidates, deliberately
// never an `origin` of their own; this function is the one place that
// stamps every lead it produces from a single call with that service's
// own `.origin`, so a service adapter can never mislabel where a lead
// actually came from and every lead from one call agrees on its origin.
//
// MALFORMED INPUT, A MALFORMED SERVICE, AND A FAILED QUERY ALL DEGRADE TO
// `[]`, NEVER THROW. A missing/non-string `discoveryTag`, a service
// missing `.search()`, a service whose `.origin` getter throws or
// returns a non-string, a `search()` call that rejects, and a `search()`
// result that is not an array all resolve to an empty array — exactly
// 0.9.24's own "malformed input degrades to null" contract, held here for
// a call that can now fail over a real network instead of over a plain
// object. Each raw candidate is independently handed to
// `describeDecentralizedWorldDiscoveryLead()`; a candidate that fails
// THAT function's own validation is silently dropped rather than
// invalidating the whole batch — one bad candidate never corrupts the
// leads a service's other candidates already produced.
//
// PURE PER CALL — NOTHING ACCUMULATES, NOTHING IS CACHED. Every call
// re-invokes `search()` fresh and returns a brand-new, frozen array; a
// caller that wants to keep leads from an earlier, since-failed call is
// responsible for holding onto that earlier array itself; this function
// never remembers a previous result and never merges a new batch into
// it — see 0.9.24's own "no combining, deduplicating, or ranking," held
// here across calls instead of across leads.
//
// NO REGISTRY, NO WORLD ENCOUNTER, NO UI. This file never imports
// `application/WorldDiscoverySourceRegistry.js`, `core/WorldEncounter.js`,
// or any UI component — an accepted lead becoming a real
// `core/WorldDiscoverySource.js` contribution is 0.9.26, unscheduled.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Querying more than one service, or combining/ranking/deduplicating
//   what several services (or two calls to the same one) report.** See
//   "Exactly one service per call," above.
// - **Retrying, caching, or rate-limiting a service's own `search()`.** A
//   concrete adapter is free to do any of this internally; this
//   orchestration layer never does it on the adapter's behalf.
// - **Wiring an accepted lead into `application/
//   WorldDiscoverySourceRegistry.js` or `core/WorldEncounter.js`.** 0.9.26,
//   unscheduled.
// - **Retrieving content from a lead's own `uri`, or hash-verifying
//   anything.** 0.9.27+, unscheduled — see 0.9.24's own header.
// - **Any trust, priority, or confidence judgment about a service or a
//   lead it reports.** No such vocabulary exists here or ever will at
//   this layer.

// Contract a concrete, service-specific adapter implements. Calling
// either member on the base class always throws — see this file's own
// header, "throw if unimplemented."
export class DecentralizedDiscoveryQueryService {
    // A short, stable string naming THIS service (e.g.
    // `'dweb:arweave-graphql:https://arweave.net/graphql'`) — never a
    // candidate's own uri. Assigned to every lead this service's
    // candidates produce; see this file's own header.
    get origin() {
        throw new Error('DecentralizedDiscoveryQueryService: origin must be implemented by a subclass');
    }

    // Returns a Promise resolving to an array of raw candidates —
    // `{ uri, storage }` pairs, `storage` optional — this service found
    // for `discoveryTag`. Resolves to `[]`, never throws, when the
    // service has nothing to report; a concrete adapter is responsible
    // for translating its own network/parse failures into `[]` rather
    // than letting them escape as a rejection (this orchestration layer
    // treats a rejection the same as `[]` regardless, per this file's own
    // header, but a well-behaved adapter never relies on that safety net).
    async search(discoveryTag) {
        throw new Error('DecentralizedDiscoveryQueryService: search() must be implemented by a subclass');
    }
}

// Queries the one injected `discoveryQueryService` for `discoveryTag` and
// returns a Promise resolving to a frozen array of
// `DecentralizedWorldDiscoveryLead`s — see this file's own header for
// exactly what is, and is not, guaranteed. Never throws.
export async function queryDecentralizedWorldDiscovery(discoveryQueryService, discoveryTag) {
    if (typeof discoveryTag !== 'string' || discoveryTag.length === 0) {
        return Object.freeze([]);
    }
    if (!discoveryQueryService || typeof discoveryQueryService.search !== 'function') {
        return Object.freeze([]);
    }

    let origin;
    try {
        origin = discoveryQueryService.origin;
    } catch {
        return Object.freeze([]);
    }
    if (typeof origin !== 'string' || origin.length === 0) {
        return Object.freeze([]);
    }

    let candidates;
    try {
        candidates = await discoveryQueryService.search(discoveryTag);
    } catch {
        return Object.freeze([]);
    }
    if (!Array.isArray(candidates)) {
        return Object.freeze([]);
    }

    const leads = [];
    for (const candidate of candidates) {
        const lead = describeDecentralizedWorldDiscoveryLead({
            origin,
            discoveryTag,
            uri: candidate && candidate.uri,
            storage: candidate && candidate.storage
        });
        if (lead !== null) {
            leads.push(lead);
        }
    }
    return Object.freeze(leads);
}
