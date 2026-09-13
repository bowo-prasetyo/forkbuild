import { SnapshotCandidateDiscoveryQueryService } from './SnapshotCandidateDiscoveryQueryService.js';
import { LocalSnapshotCandidateDiscoveryQueryService } from './LocalSnapshotCandidateDiscoveryQueryService.js';

// 0.9.485 — Walking-Triggered Snapshot Candidate Query Service.
//
// The identical "composition, never orchestration" seam
// `application/PlaceNamingDiscoveryRuntimeComposition.js` (0.9.253) already
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
// SAME instance `application/DiscoverSnapshotRuntimeComposition.js`
// (0.9.142/0.9.151) already builds from a host's own Nostr relay-query
// capability, and the SAME instance `ui/main.js`'s own
// `discoverSnapshotCandidatesCommand` already calls today — and an
// already-constructed `placementCatalog`, the ONE
// `LocalPublicationSnapshotPlacementCatalog` instance `ui/main.js` already
// threads through the whole placement-catalog/peer-exchange family (see
// `application/CreatePublicationSnapshotPlacementPeerExchangeUseCase.js`'s
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
// `application/SnapshotCandidateDiscoveryQueryService.js`'s own header,
// "Peer is not a third source here, on purpose" — Peer's own contribution
// arrives entirely through `placementCatalog` itself (already populated by
// `application/PublicationSnapshotPlacementPeerExchange.js`'s own passive
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
// `application/WorldSnapshotDiscoveryMonitor.js`, or
// `application/SnapshotPlacementResolver.js` itself.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Constructing `nostrSnapshotDiscoveryQueryService` or
//   `placementCatalog` themselves.** Both are handed in, already built —
//   see "never a second Nostr construction... never a second catalog,"
//   above.
// - **Wiring the returned `queryService` into `application/
//   DiscoverSnapshotCandidatesCommand.js`'s own
//   `discoverSnapshotCandidatesCommand`, or into `application/
//   WorldSnapshotDiscoveryMonitor.js`.** A separate, later, unscheduled
//   step (0.9.486).
// - **A third source of any kind (Peer, Arweave, a file-import bridge).**
export function composeSnapshotCandidateDiscoveryRuntime({
    nostrSnapshotDiscoveryQueryService = null,
    placementCatalog
} = {}) {
    const sources = [];
    if (isSearchableSource(nostrSnapshotDiscoveryQueryService)) {
        sources.push(nostrSnapshotDiscoveryQueryService);
    }
    sources.push(new LocalSnapshotCandidateDiscoveryQueryService(placementCatalog));

    const queryService = new SnapshotCandidateDiscoveryQueryService(sources);
    return Object.freeze({ queryService });
}

function isSearchableSource(source) {
    return Boolean(source) && typeof source === 'object' && typeof source.search === 'function';
}
