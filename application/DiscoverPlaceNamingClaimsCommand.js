// 0.9.253 — Place Naming Discovery Boundary.
//
// The identical "application command boundary" seam
// `application/DiscoverSnapshotCandidatesCommand.js` (0.9.150) already
// established for Snapshot candidate discovery, drawn here for Place
// Naming claim discovery instead, and nothing more.
//
//   World View, or a future automatic refresh (unscheduled — see
//   docs/Roadmap.md, "0.9.253 — Place Naming Discovery Boundary")
//        │  { discoveryTag }
//        ▼
//   application/DiscoverPlaceNamingClaimsCommand.js   ★ (THIS)
//        executeDiscoverPlaceNamingClaimsCommand({ discoveryTag, discoveryQueryService })
//        │
//        ▼
//   discoveryQueryService.search(discoveryTag)
//        (application/PlaceNamingDiscoveryQueryService.js, 0.9.253, unmodified)
//        │
//        ▼
//   [ { protocol, version, worldId, regionId, claim }, ... ]
//        (0.9.253's own envelope shape, passed through verbatim)
//
// AN ASSEMBLY BOUNDARY, NEVER A SECOND DISCOVERY ALGORITHM. This file
// contains no filtering, no ranking, no deduplication of its own — every
// behavior a caller observes through it is entirely
// `discoveryQueryService`'s own. The returned result is
// `discoveryQueryService`'s own result, passed through, never
// re-described — no `{ candidates: [...] }` wrapper, no status field, no
// reordering.
//
// `discoveryQueryService` IS THE ONE COLLABORATOR THIS FILE VALIDATES,
// DUCK-TYPED, NEVER `instanceof`-CHECKED — the identical restraint
// `application/DiscoverSnapshotCandidatesCommand.js`'s own header already
// holds. `discoveryTag` is forwarded verbatim, unread by this file.
//
// SYNCHRONOUS VALIDATION, SYNCHRONOUS THROW. A missing or malformed
// `discoveryQueryService` throws synchronously, before a `Promise` is
// ever returned — exactly where it already would calling
// `discoveryQueryService.search()` directly on a bad reference.
//
// NO QUERY SERVICE, NO SOURCE, AND NO NOSTR/PEER CLASS IS EVER
// CONSTRUCTED HERE. Composing `discoveryQueryService` itself is entirely
// `application/PlaceNamingDiscoveryRuntimeComposition.js`'s (0.9.253,
// sibling) or a future caller's own concern.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A UI candidate browser, World View wiring, or automatic/background
//   refresh of any kind.** This file has no idea `ui/` exists.
// - **Ranking, deduplication beyond what `discoveryQueryService.search()`
//   already performs, proximity/radius filtering, or presentation.**
// - **Any signature verification, or promotion of a returned candidate
//   into `application/LocalPlaceNamingClaimStore.js`.** A caller who
//   wants to actually ADOPT a discovered candidate does so through
//   `application/PlaceNamingClaimExchange.js#importClaim()` itself, with
//   that candidate's own `claim` handed to it as a publication package —
//   a separate, later, unscheduled step this file never performs.

// executeDiscoverPlaceNamingClaimsCommand({ discoveryTag,
//   discoveryQueryService }) -> Promise<[{ protocol, version, worldId,
//   regionId, claim }, ...]>.
//
// The application-level command boundary for Place Naming claim
// discovery — see this file's own header for the full contract. Calls
// `discoveryQueryService.search()` with `discoveryTag` forwarded
// verbatim. Throws synchronously, before the query service is ever
// called, when `discoveryQueryService` is missing or does not expose a
// `search` function.
export function executeDiscoverPlaceNamingClaimsCommand({
    discoveryTag,
    discoveryQueryService
} = {}) {
    if (!discoveryQueryService || typeof discoveryQueryService.search !== 'function') {
        throw new Error('executeDiscoverPlaceNamingClaimsCommand: a discoveryQueryService with search() is required');
    }

    return discoveryQueryService.search(discoveryTag);
}
