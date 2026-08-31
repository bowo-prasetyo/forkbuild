import { describeWorldFromDiscoverySources } from './WorldEncounterIntegration.js';

// 0.9.10 — Registry-Backed World Encounter Projection.
//
// 0.9.9's own header put the gap exactly: the registry knows which
// sources currently exist, but "a caller reads `listSources()` and hands
// the result to 0.9.8's own `describeWorldFromDiscoverySources()` itself"
// — nothing yet was that caller. This file is that caller, and only that
// caller.
//
//   local source ───────┐
//                        │
//   peer source ─────────┼──▶ WorldDiscoverySourceRegistry   (0.9.9)
//                        │        registry.listSources()
//   another peer ────────┘                  │
//                                            ▼
//        application/WorldDiscoveryRegistryProjection.js   ★ (THIS)
//               describeWorldFromDiscoveryRegistry()
//                                            │
//                                            ▼
//        application/WorldEncounterIntegration.js   (0.9.8, unchanged)
//               describeWorldFromDiscoverySources()
//                                            │
//                                            ▼
//                                       World View
//
// ONE FUNCTION, ONE JOB: TURN A REGISTRY'S CURRENT MEMBERSHIP INTO A
// WORLD VIEW. `describeWorldFromDiscoveryRegistry(registry)` reads
// `registry.listSources()` and hands the result, unmodified, to 0.9.8's
// own `describeWorldFromDiscoverySources()`. It returns exactly that call's
// own result — nothing added, nothing renamed, nothing re-sorted. If a bug
// ever exists in "which encounters exist" or "how a row is shaped," it
// lives in 0.9.8 (or the chain 0.9.8 already wires through) — never here.
//
// NO SECOND DISCOVERY ALGORITHM. This file holds no `.filter()`, `.map()`,
// `.find()`, or per-source logic of its own, and never calls
// `deriveWorldEncounters()`, `assembleWorldDiscoveryInputs()`,
// `describeWorldEncounterReadModel()`, or `describeWorldEncounterView()`
// directly — those remain behind 0.9.8's own
// `describeWorldFromDiscoverySources()`, called here exactly once.
//
// THE RESULT CARRIES NO REGISTRY-SHAPED FIELDS. The return value is
// exactly 0.9.8's own view shape — `isEmpty`, `publicationCount`,
// `avatarCount`, `totalCount`, `publications`, `avatars` — and nothing
// else. No `sourceCount`, `peerCount`, `onlinePeerCount`, or `localCount`
// field exists here or ever will at this layer: the registry stays
// responsible for membership, 0.9.8 stays responsible for projection, and
// this file never lets the former leak into the latter's own shape.
//
// SNAPSHOT, NOT SUBSCRIPTION. `describeWorldFromDiscoveryRegistry()` reads
// the registry's CURRENT contents once, at the moment it is called, and
// returns. It establishes that the World View CAN BE DERIVED from the
// registry's live membership — it does not establish that the World View
// automatically updates whenever the registry changes. Calling this
// function again after `registry.setSource()` or `registry.removeSource()`
// reflects the new membership; nothing here watches, subscribes to, or is
// notified of a registry change on its own. Reactive, automatic
// recomputation is separate, later, unscheduled work.
//
// NO PEER KNOWLEDGE, NO SOURCE INTERPRETATION — inherited unchanged from
// 0.9.8 and 0.9.9. This file never imports `peer/PeerMessageBus.js`,
// `peer/PeerConnection.js`, any `PeerDiscoveryProvider`, WebRTC, or a
// WebSocket/rendezvous mechanism, and never reads `source.origin` to
// decide what to include, exclude, or trust. `registry.listSources()`
// already returns exactly the sources that count; this file passes all of
// them through, in the order the registry already provides.
//
// NO STORAGE, NO CRYPTOGRAPHIC VERIFICATION, NO UI. This file never
// imports a `StorageProvider`, never reads or writes `localStorage`, never
// verifies a signature, and renders nothing itself —
// `ui/components/WorldEncounterCanvas.js` remains where a returned view
// actually renders, unchanged by this milestone.
//
// SYNCHRONOUS, PURE, NO MUTATION. This file reads no clock and touches no
// archive. Calling `describeWorldFromDiscoveryRegistry()` twice against a
// registry whose membership has not changed between calls returns a
// byte-identical result, because `registry.listSources()` and
// `describeWorldFromDiscoverySources()` already each make that same
// promise on their own.
//
// MALFORMED INPUT DEGRADES EXACTLY AS `describeWorldFromDiscoverySources()`
// ALREADY DEGRADES — NEVER THROWS, AND NEVER A NEW DEGRADE RULE OF THIS
// FILE'S OWN INVENTION. A `registry` missing a `listSources` method is
// treated as contributing no sources at all; whatever `listSources()`
// itself returns flows straight into 0.9.8's own function, which already
// degrades malformed or empty input to an empty, well-formed view without
// throwing.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A second discovery, assembly, or projection algorithm.** See "No
//   second discovery algorithm," above — 0.9.8's own chain is called once,
//   unmodified.
// - **Any registry-shaped field on the returned view** (`sourceCount`,
//   `peerCount`, `onlinePeerCount`, `localCount`, or similar). See "The
//   result carries no registry-shaped fields," above.
// - **A subscription, event bus, or automatic recomputation whenever the
//   registry changes.** See "Snapshot, not subscription," above — separate,
//   later, unscheduled work.
// - **Peer lifecycle** (deciding when a peer has appeared or disappeared,
//   or calling `registry.setSource()`/`registry.removeSource()` in
//   response). This file only ever reads a registry that some other caller
//   already populated.
// - **Peer transport, network, persistence, or cryptographic verification
//   of any kind.** See "No peer knowledge, no source interpretation" and
//   "No storage, no cryptographic verification, no UI," above.

// Pure. Reads `registry.listSources()` and returns exactly what 0.9.8's
// own `describeWorldFromDiscoverySources()` returns for that snapshot —
// see this file's own header, "One function, one job."
export function describeWorldFromDiscoveryRegistry(registry) {
    const sources = registry && typeof registry.listSources === 'function'
        ? registry.listSources()
        : undefined;
    return describeWorldFromDiscoverySources(sources);
}
