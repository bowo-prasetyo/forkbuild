import { SnapshotCandidateDiscoveryQueryService } from './SnapshotCandidateDiscoveryQueryService.js';
import { LocalSnapshotCandidateDiscoveryQueryService } from './LocalSnapshotCandidateDiscoveryQueryService.js';

// 0.9.500 — Compose Arweave into Snapshot Candidate Discovery.
//
// Adds the third source this file's own 0.9.485 header (below) named as
// future work: `application/arweave/ArweaveSnapshotDiscoveryQueryService.js`
// (0.9.499, UNMODIFIED) joins Local and Nostr, exactly the same way —
// an already-constructed instance, injected as a new, optional
// constructor argument, never built by this file:
//
//   nostrSnapshotDiscoveryQueryService   arweaveSnapshotDiscoveryQueryService   placementCatalog
//     (0.9.133, UNMODIFIED — built by      (0.9.499, UNMODIFIED — built            (already-constructed,
//     application/                         directly in ui/main.js from this        unchanged, see
//     DiscoverSnapshotRuntimeComposition.js, replica's own resolvedArweaveGatewayUrl, "never a second
//     reused, never rebuilt here)          reused, never rebuilt here)             catalog," below)
//                    │                                  │                                  │
//                    │                                  │                    new LocalSnapshotCandidateDiscoveryQueryService(placementCatalog)
//                    │                                  │                                  │
//                    └──────────────────┬───────────────┴──────────────────┬───────────────┘
//                                       ▼
//        new SnapshotCandidateDiscoveryQueryService([nostr, arweave, local])
//                                       │
//                                       ▼
//                         { queryService }
//
// GRACEFUL DEGRADATION EXTENDS UNCHANGED TO A THIRD SOURCE.
// `arweaveSnapshotDiscoveryQueryService` is admitted through the IDENTICAL
// `isSearchableSource()` duck-typed check `nostrSnapshotDiscoveryQueryService`
// already goes through, below — `null`, absent, or anything not exposing a
// real `search()` method is silently excluded from `sources`, never a
// throw. No source is ever a fallback FOR another (see `application/
// SnapshotCandidateDiscoveryQueryService.js`'s own `Promise.allSettled()`
// contract, UNMODIFIED) — Local, Nostr, and Arweave are three independent,
// equally-weighted contributors, and every combination of their own
// availability degrades exactly the way removing either of Local/Nostr
// already did before this milestone; see tests/
// SnapshotCandidateDiscoveryArweaveCompositionIntegrationAudit.test.js for
// the full eight-combination matrix.
//
// NEVER A SECOND ARWEAVE CONSTRUCTION — THE IDENTICAL RESTRAINT ALREADY
// HELD FOR NOSTR. `arweaveSnapshotDiscoveryQueryService` is handed in,
// already built by `ui/main.js` from this replica's own single
// `resolvedArweaveGatewayUrl` (the SAME value the Snapshot retrieval path
// already threads into `composeDiscoverSnapshotRuntime()`'s own
// `arweaveContentStoreOptions`) — this file constructs no
// `ArweaveSnapshotDiscoveryQueryService` of its own, and never will. It
// shares no construction, no options object, and no lifecycle with
// `application/arweave/ArweaveSnapshotDiscoveryPublisher.js` — see that pair's own
// headers, "siblings, never dependent on each other."
//
// THIS MILESTONE'S OWN DIFF IS COMPOSITION ONLY. No change to
// `application/snapshot/DiscoverSnapshotCandidatesCommand.js`, `application/
// WorldSnapshotDiscoveryMonitor.js`, `application/
// SnapshotPlacementResolver.js`, World Encounter, Snapshot material
// loading, verification, placement, or Repository admission — the walking
// pipeline stays exactly as source-agnostic as it already was, now simply
// fed by one more source.
//
// The remainder of this file's own 0.9.485 header, below, is otherwise
// unmodified; only its "DELIBERATELY EXCLUDED" note naming Arweave among
// sources this file would not yet accept is struck — see that note's own
// updated text, at the bottom of this header.
//
// 0.9.485 — Walking-Triggered Snapshot Candidate Query Service.
//
// The identical "composition, never orchestration" seam
// `application/placeNaming/PlaceNamingDiscoveryRuntimeComposition.js` (0.9.253) already
// established for Place Naming, drawn here for Snapshot candidates
// instead. Its whole job is object construction — decide, per source,
// whether there is enough here to build a usable collaborator, build it,
// and hand back one composed `queryService` — and nothing more.
//
//   nostrSnapshotDiscoveryQueryService   placementCatalog
//        (application/                        (application/
//        NostrSnapshotDiscoveryQueryService    LocalPublicationSnapshotPlacementCatalog.js,
//        .js, 0.9.133 — already-composed        an already-constructed
//        by application/                        instance; NOT built here)
//        DiscoverSnapshotRuntimeComposition.js,
//        NOT rebuilt here — see "never a
//        second Nostr construction," below)
//                    │                                  │
//                    │                    new LocalSnapshotCandidateDiscoveryQueryService(placementCatalog)
//                    │                                  │
//                    └────────────────┬─────────────────┘
//                                     ▼
//        new SnapshotCandidateDiscoveryQueryService([nostr, local])
//                                     │
//                                     ▼
//                         { queryService }
//
// NEVER A SECOND NOSTR CONSTRUCTION, AND NEVER A SECOND CATALOG. This file
// receives an already-composed `nostrSnapshotDiscoveryQueryService` — the
// SAME instance `application/snapshot/DiscoverSnapshotRuntimeComposition.js`
// (0.9.142/0.9.151) already builds from a host's own Nostr relay-query
// capability, and the SAME instance `ui/main.js`'s own
// `discoverSnapshotCandidatesCommand` already calls today — and an
// already-constructed `placementCatalog`, the ONE
// `LocalPublicationSnapshotPlacementCatalog` instance `ui/main.js` already
// threads through the whole placement-catalog/peer-exchange family (see
// `application/snapshot/placement/CreatePublicationSnapshotPlacementPeerExchangeUseCase.js`'s
// own header). This file constructs neither; it only wraps the catalog in
// the one adapter it needs (`LocalSnapshotCandidateDiscoveryQueryService`,
// sibling) and hands both sources to the composite.
//
// AN HONEST, POSSIBLY-PARTIAL ROSTER, NEVER A THROW FOR AN ABSENT NOSTR
// CAPABILITY — mirrors `application/
// DiscoverSnapshotRuntimeComposition.js`'s own graceful degradation.
// `nostrSnapshotDiscoveryQueryService` may be `null` on a host with no
// usable Nostr relay-query capability (see that file's own header,
// "graceful degradation... no host Nostr relay-query capability exists
// anywhere in this codebase yet"); this file never lets that absence
// prevent Local candidates from being served. `placementCatalog`, by
// contrast, is REQUIRED and never defaulted — `ui/main.js` always
// constructs one (see its own 0.8.19 wiring), so there is no equivalent
// "absent capability" case to degrade gracefully around; a caller passing
// none gets the identical synchronous throw
// `LocalSnapshotCandidateDiscoveryQueryService`'s own constructor already
// produces.
//
// PEER IS NEVER A THIRD ARGUMENT HERE. See
// `application/snapshot/SnapshotCandidateDiscoveryQueryService.js`'s own header,
// "Peer is not a third source here, on purpose" — Peer's own contribution
// arrives entirely through `placementCatalog` itself (already populated by
// `application/snapshot/placement/PublicationSnapshotPlacementPeerExchange.js`'s own passive
// ANNOUNCE path, production since 0.9.483), never through a second
// collaborator this file would need to accept.
//
// EVERY CALL BUILDS A FRESH, INDEPENDENT `queryService` — NO
// MODULE-LEVEL STATE, NO SINGLETON, NO CACHING OF A PREVIOUSLY-COMPOSED
// RUNTIME. The identical restraint every composition-root sibling in this
// codebase already holds.
//
// NO BROWSER API OF ANY KIND, NO I/O OF ANY KIND — CONSTRUCTION ONLY.
// Calling `composeSnapshotCandidateDiscoveryRuntime()` never contacts a
// relay, a peer, or a storage backend.
//
// NO UI OF ANY KIND, AND NO NEW ORCHESTRATION ENTRY POINT. This file has
// no idea `ui/` exists, and it never calls
// `executeDiscoverSnapshotCandidatesCommand()`,
// `application/snapshot/WorldSnapshotDiscoveryMonitor.js`, or
// `application/snapshot/placement/SnapshotPlacementResolver.js` itself.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Constructing `nostrSnapshotDiscoveryQueryService`,
//   `arweaveSnapshotDiscoveryQueryService`, or `placementCatalog`
//   themselves.** All three are handed in, already built — see "never a
//   second Nostr construction... never a second Arweave construction...
//   never a second catalog," above.
// - **Wiring the returned `queryService` into `application/
//   DiscoverSnapshotCandidatesCommand.js`'s own
//   `discoverSnapshotCandidatesCommand`, or into `application/
//   WorldSnapshotDiscoveryMonitor.js`.** Both were already wired, unchanged,
//   by 0.9.486 — this milestone (0.9.500) adds a source underneath that
//   existing wire, never touching it.
// - **A fourth source of any kind** — Peer as an ACTIVE query provider (see
//   "PEER IS NEVER A THIRD ARGUMENT HERE," above — still true; Peer's own
//   contribution remains entirely via `placementCatalog`), a file-import
//   bridge, or anything else. Arweave (0.9.499's own
//   `ArweaveSnapshotDiscoveryQueryService`) is no longer excluded — as of
//   this milestone (0.9.500) it is the third source, injected exactly like
//   Nostr; see this file's own 0.9.500 header, above.
export function composeSnapshotCandidateDiscoveryRuntime({
    nostrSnapshotDiscoveryQueryService = null,
    arweaveSnapshotDiscoveryQueryService = null,
    placementCatalog
} = {}) {
    const sources = [];
    if (isSearchableSource(nostrSnapshotDiscoveryQueryService)) {
        sources.push(nostrSnapshotDiscoveryQueryService);
    }
    if (isSearchableSource(arweaveSnapshotDiscoveryQueryService)) {
        sources.push(arweaveSnapshotDiscoveryQueryService);
    }
    sources.push(new LocalSnapshotCandidateDiscoveryQueryService(placementCatalog));

    const queryService = new SnapshotCandidateDiscoveryQueryService(sources);
    return Object.freeze({ queryService });
}

function isSearchableSource(source) {
    return Boolean(source) && typeof source === 'object' && typeof source.search === 'function';
}
