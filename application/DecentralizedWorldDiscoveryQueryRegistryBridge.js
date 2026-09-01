import { queryDecentralizedWorldDiscovery } from './DecentralizedWorldDiscoveryQuery.js';

// 0.9.27 — Decentralized World Discovery Query → Lead Registry Bridge.
//
// 0.9.25 built the seam that asks one real service for leads —
// `queryDecentralizedWorldDiscovery()` — and its own header named exactly
// what it refused to do with the result: "Wiring an accepted lead into
// `application/WorldDiscoverySourceRegistry.js`... 0.9.26, unscheduled." 0.9.26
// then built somewhere for a lead to live — `DecentralizedWorldDiscoveryLeadRegistry`
// — but its own header named the identical gap from the other side: "a
// bridge that calls `queryDecentralizedWorldDiscovery()` and feeds its
// result into `setLead()` automatically... unscheduled follow-up work."
// Both halves already exist; nothing yet connects them. This file is that
// one connection, and only that connection.
//
//   discoveryTag
//         │
//         ▼
//   application/DecentralizedWorldDiscoveryQuery.js   (0.9.25, unmodified)
//        queryDecentralizedWorldDiscovery(discoveryQueryService, discoveryTag)
//         │
//         ▼
//   DecentralizedWorldDiscoveryLead[]
//         │
//         ▼
//   application/DecentralizedWorldDiscoveryQueryRegistryBridge.js   ★ (THIS)
//        queryDecentralizedWorldDiscoveryIntoRegistry()
//         │
//         ▼
//   registry.setLead(lead)   — once per returned lead
//         │
//         ▼
//   application/DecentralizedWorldDiscoveryLeadRegistry.js   (0.9.26, unmodified)
//
// ONE FUNCTION, ONE JOB, BOTH ALREADY-BUILT HALVES UNMODIFIED. This file
// calls 0.9.25's own `queryDecentralizedWorldDiscovery()` exactly as it is
// already written, then calls `registry.setLead()` — 0.9.26's own,
// already-written method — once per lead the query returned. It renames no
// field, adds no field, and makes no decision either file doesn't already
// make on its own. It never imports the `DecentralizedWorldDiscoveryLeadRegistry`
// class itself — like `peer/PeerWorldDiscoveryLifecycleBridge.js`'s own
// `registry.setSource` check, this file only ever requires that whatever
// `registry` it is handed exposes a `setLead` function, so a caller is free
// to hand it a real registry, a test double, or any other object shaped the
// same way.
//
// EVERY VALID RETURNED LEAD, NO FILTERING, NO JUDGMENT OF ITS OWN. This
// file never decides a lead is more or less worth keeping than another —
// `queryDecentralizedWorldDiscovery()` already dropped anything that failed
// `describeDecentralizedWorldDiscoveryLead()`'s own validation before this
// file ever sees a result, and every lead that survives that call gets
// exactly one `registry.setLead()` call, unconditionally. This file carries
// no `trusted`, `verified`, `priority`, `confidence`, `rank`, or `dedup`
// vocabulary of any kind, and never will at this layer — see 0.9.24's,
// 0.9.25's, and 0.9.26's own headers, all making the identical restraint
// one layer earlier.
//
// REPLACEMENT ACROSS CALLS COMES FOR FREE, FROM THE REGISTRY'S OWN
// CONTRACT — THIS FILE PERFORMS NO DIFFING OF ITS OWN. A later call for the
// same `discoveryTag` against the same service reports the same `uri`
// again under the same `origin`; `registry.setLead()` already replaces
// whatever previously occupied that `(origin, discoveryTag, uri)` slot
// rather than accumulating a duplicate — 0.9.26's own "replacement, not
// accumulation" rule, inherited here unchanged. This file holds no memory
// of a previous call's own results and never calls `registry.removeLead()`
// — a lead a later query simply stops reporting is left exactly where it
// was; deciding whether that silence means anything is deliberately not
// this milestone, see "Deliberately excluded," below.
//
// NEVER THROWS, DEGRADES TO AN EMPTY RESULT. A missing `registry`, or a
// `registry` whose `setLead` is not itself a function, is treated exactly
// like `peer/PeerWorldDiscoveryLifecycleBridge.js`'s own missing-method
// check: nothing is queried, nothing is stored, and this function resolves
// to a frozen empty array without ever calling `discoveryQueryService`.
// Every other failure mode — a missing/malformed `discoveryTag`, a
// malformed `discoveryQueryService`, or a rejected `search()` call — is
// already handled by `queryDecentralizedWorldDiscovery()`'s own "malformed
// input... all degrade to `[]`, never throw" contract; this file adds no
// `try`/`catch` of its own around a call it already trusts not to reject.
//
// RETURNS THE LEADS IT STORED — VISIBILITY, NOT A NEW CONTRACT. This
// function resolves to the same frozen `DecentralizedWorldDiscoveryLead[]`
// `queryDecentralizedWorldDiscovery()` itself produced, purely so a caller
// (a UI status line, a test) can see what this call just did without
// re-deriving it from `registry.listLeads()` — the registry's own
// `listLeads()` remains the only source of truth for current membership;
// what this function returns is a snapshot of one call's own contribution,
// nothing more.
//
// NO RETRIEVAL, NO VERIFICATION, NO `ContentReference` OR
// `WorldDiscoverySource` CONSTRUCTION. This file never imports
// `core/ContentReference.js`, `core/DecentralizedPublication.js`,
// `core/WorldDiscoverySource.js`, `core/WorldEncounter.js`, or
// `application/WorldDiscoverySourceRegistry.js`, and never fetches
// anything from a lead's own `uri`. A lead a caller now finds via
// `registry.listLeads()` is exactly what 0.9.24 already called it — a rumor
// about where material MIGHT live — for as long as it lives in the
// registry; this bridge does nothing to change that.
//
// NO SCHEDULING, POLLING, OR RETRY OF ITS OWN. This function runs to
// completion once and returns; there is no class here, no constructor, no
// timer, and no subscription. A caller that wants to re-query periodically
// (on an interval, on a UI action, on reconnect) calls this function again
// itself — exactly `peer/PeerWorldDiscoveryLifecycleBridge.js`'s own "no
// persistent service of any kind" restraint, held here for a query instead
// of a peer lifecycle event.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Querying more than one service, or combining what several calls (or
//   several services) report.** `queryDecentralizedWorldDiscovery()`'s own
//   "exactly one service per call" already forbids fan-out one layer down;
//   this file adds no `Promise.all()` of its own. A caller wanting several
//   services calls this function once per service.
// - **Removing a lead a later query no longer reports.** See "Replacement
//   across calls comes for free," above — this file never calls
//   `registry.removeLead()`. Whether a lead's absence from a later query
//   means anything (staleness, expiry) is a trust judgment this whole
//   family has refused at every layer so far; still refused here.
// - **Scheduling, polling, debouncing, or retrying a query
//   automatically.** See "No scheduling, polling, or retry of its own,"
//   above.
// - **Deciding whether an accepted lead becomes a real
//   `core/WorldDiscoverySource.js` contribution, resolving it against a
//   selected World encounter, retrieving its bytes, or hash-verifying
//   anything.** Unscheduled, later work — see 0.9.24's own header, "A lead
//   is deliberately not yet a `ContentReference`."
// - **Any trust, priority, ranking, or confidence judgment about a lead or
//   a service.** No such vocabulary exists here or ever will at this
//   layer.

// Queries the one injected `discoveryQueryService` for `discoveryTag` via
// 0.9.25's own `queryDecentralizedWorldDiscovery()`, then calls
// `registry.setLead(lead)` once for every lead the query returned — see
// this file's own header for exactly what is, and is not, guaranteed.
// Resolves to the same frozen `DecentralizedWorldDiscoveryLead[]` the query
// itself produced. Never throws; resolves to a frozen empty array, without
// ever querying `discoveryQueryService`, when `registry` is missing or does
// not expose a `setLead` function.
export async function queryDecentralizedWorldDiscoveryIntoRegistry(registry, discoveryQueryService, discoveryTag) {
    if (!registry || typeof registry.setLead !== 'function') {
        return Object.freeze([]);
    }

    const leads = await queryDecentralizedWorldDiscovery(discoveryQueryService, discoveryTag);
    for (const lead of leads) {
        registry.setLead(lead);
    }
    return leads;
}
