import { PlaceNamingDiscoveryQueryService } from './PlaceNamingDiscoveryQueryService.js';

// 0.9.253 — Place Naming Discovery Boundary.
//
// The identical "composition, never orchestration" seam
// `application/DiscoverSnapshotRuntimeComposition.js` (0.9.142/0.9.151)
// already established for Snapshot discovery, drawn here for Place Naming
// claim discovery instead. Its whole job is object construction — decide
// whether there is enough here to build a usable `queryService`, build
// it, and hand it back — and nothing more.
//
//   sources[]   (already-constructed collaborators, each exposing
//                search(discoveryTag) — a future Nostr adapter, a future
//                peer adapter, a future file-import bridge; NONE exist
//                yet as of this milestone, see "an honest empty roster,"
//                below)
//        │
//        ▼
//   application/PlaceNamingDiscoveryRuntimeComposition.js   ★ (THIS)
//        composePlaceNamingDiscoveryRuntime({ sources })
//        │
//        ▼
//   new PlaceNamingDiscoveryQueryService(sources)   (application/
//                                                     PlaceNamingDiscoveryQueryService.js,
//                                                     0.9.253, unmodified)
//        │
//        ▼
//   { queryService }
//        │
//        │   a caller's own call — never this file's own:
//        ▼
//   executeDiscoverPlaceNamingClaimsCommand({ discoveryTag, discoveryQueryService: queryService })
//        (application/DiscoverPlaceNamingClaimsCommand.js, 0.9.253, unmodified —
//        NOT imported or called by this file; see "composition, never
//        orchestration," below)
//
// COMPOSITION, NEVER A SECOND COLLABORATOR AND NEVER A NEW ORCHESTRATION
// ENTRY POINT. This file contains no source construction, no Nostr/peer
// wiring, and no search()/parsing logic of its own — it does not even
// import `application/DiscoverPlaceNamingClaimsCommand.js`. Every
// behavior a caller observes through the returned `queryService` is
// entirely `application/PlaceNamingDiscoveryQueryService.js`'s own,
// unmodified.
//
// AN HONEST EMPTY ROSTER, NEVER A `null` DEGRADATION — THE ONE
// DELIBERATE DEPARTURE FROM `application/
// DiscoverSnapshotRuntimeComposition.js`'S OWN PATTERN, AND WHY. That
// file resolves `resolver`/`queryService` to `null` when no USABLE
// CAPABILITY (a real `queryImpl` function, a real `signer`) is available
// — an honest "cannot even attempt this" for a single, all-or-nothing
// collaborator. This milestone's own `sources` is a LIST, not a single
// capability, and an empty list is not the absence of a capability — it
// is this milestone's own, entirely expected, honestly-scoped starting
// state: see docs/Roadmap.md, "0.9.253 — Place Naming Discovery
// Boundary," "deliberately excludes... Arweave publishing; Nostr
// publishing... replacing file import/export; replacing peer-to-peer
// exchange" — NO source exists yet for this milestone to wire in at all.
// Returning `null` here would force every future caller (0.9.254 and
// beyond) to re-implement the identical `queryService || fallback`
// null-check `PlaceNamingDiscoveryQueryService` ALREADY performs
// correctly for zero sources — its own `search()` already, honestly,
// resolves to `[]` when `this._sources` is empty. So this file always
// returns a real, usable `queryService`, whether `sources` is empty or
// not; a caller composing this runtime TODAY gets a `queryService` whose
// `search()` always resolves to `[]`, exactly as honest as `null` would
// be, without requiring every future caller to branch on it specially.
//
// A GENUINELY MALFORMED `sources` ENTRY STILL THROWS, UNCHANGED —
// `PlaceNamingDiscoveryQueryService`'s own constructor already throws
// synchronously for a non-array `sources` or a non-searchable entry; this
// file performs no separate validation of its own and never swallows
// that throw.
//
// EVERY CALL BUILDS A FRESH, INDEPENDENT `queryService` — NO
// MODULE-LEVEL STATE, NO SINGLETON, NO CACHING OF A PREVIOUSLY-COMPOSED
// RUNTIME.
//
// NO BROWSER API OF ANY KIND, NO I/O OF ANY KIND — CONSTRUCTION ONLY.
// This file never touches `window`, `fetch`, or `WebSocket`, and calling
// `composePlaceNamingDiscoveryRuntime()` never contacts a relay, a peer,
// or a gateway.
//
// NO COUPLING TO SNAPSHOT DISCOVERY OR PUBLICATION DISCOVERY. This file
// never imports `application/DiscoverSnapshotRuntimeComposition.js`,
// `application/NostrSnapshotDiscoveryQueryService.js`, or any
// `application/*PublicationDiscovery*.js` sibling — composing the Place
// Naming discovery family's own runtime is never itself a Snapshot or
// Publication discovery composition, the same boundary every family in
// this codebase already holds for itself.
//
// NO UI OF ANY KIND, AND NO NEW ORCHESTRATION ENTRY POINT. This file has
// no idea `ui/` exists, and it never calls
// `executeDiscoverPlaceNamingClaimsCommand()` itself.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Building any real source** (a Nostr adapter, a peer adapter, a
//   file-import bridge re-exposed as a source). A caller supplies
//   already-constructed `sources`; today, no caller has any to supply —
//   see "an honest empty roster," above.
// - **Wiring this composition into `ui/main.js`.** A separate, later,
//   unscheduled step — see docs/Roadmap.md, "what comes after."
// - **Calling `executeDiscoverPlaceNamingClaimsCommand()` itself, or any
//   other new orchestration entry point.**
// - **Validating a source beyond the one shape check
//   `PlaceNamingDiscoveryQueryService`'s own constructor already
//   performs.**

// composePlaceNamingDiscoveryRuntime({ sources }) -> { queryService }. See
// this file's own header for the full contract: `queryService` is always
// a real, usable `PlaceNamingDiscoveryQueryService` instance — never
// `null` — whose behavior over an empty `sources` array is exactly as
// honest as `null` would be (see "an honest empty roster," above). A
// genuinely malformed `sources` argument still throws, exactly as
// constructing `PlaceNamingDiscoveryQueryService` directly already would.
export function composePlaceNamingDiscoveryRuntime({ sources = [] } = {}) {
    const queryService = new PlaceNamingDiscoveryQueryService(sources);
    return Object.freeze({ queryService });
}
