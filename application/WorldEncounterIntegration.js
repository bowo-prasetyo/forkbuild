import { describeWorldDiscoverySource } from '../core/WorldDiscoverySource.js';
import { assembleWorldDiscoveryInputs } from '../core/WorldDiscoverySourceAssembly.js';
import { deriveWorldEncounters } from '../core/WorldEncounter.js';
import { describeWorldEncounterReadModel } from './WorldEncounterReadModel.js';
import { describeWorldEncounterView } from './WorldEncounterView.js';

// 0.9.8 — Remote Encounter Integration (Multi-Source World Encounter
// Integration).
//
// 0.9.5 named the seam (`WorldDiscoverySource`), 0.9.6 crossed it once per
// peer message (`PeerWorldDataIngress`), and 0.9.7 concatenated any number
// of already-described sources into `deriveWorldEncounters()`'s own six
// arrays (`WorldDiscoverySourceAssembly`) — and every one of those three
// files' own headers named the same next step and refused to take it:
// wiring the assembled result into the actual running World View. This
// file is that wiring, and only that wiring.
//
//   local records                    already-received peer message
//        │                                       │
//        ▼                                       ▼
//   describeLocalWorldDiscoverySource   describePeerWorldDiscoverySource
//        │        (THIS)                     (0.9.6, peer/PeerWorldDataIngress.js)
//        │                                       │
//        └──────────────────┬────────────────────┘
//                            ▼         [ sources ]
//              application/WorldEncounterIntegration.js   ★ (THIS milestone)
//                    describeWorldFromDiscoverySources()
//                            │
//                            ├─▶ assembleWorldDiscoveryInputs()   (0.9.7)
//                            ├─▶ deriveWorldEncounters()          (0.9.0)
//                            ├─▶ describeWorldEncounterReadModel() (0.9.1)
//                            └─▶ describeWorldEncounterView()      (0.9.2)
//                            │
//                            ▼
//                  ui/components/WorldEncounterCanvas.js  (0.9.3/0.9.4, unchanged)
//
// ORCHESTRATION, NOT ANOTHER PROJECTION ALGORITHM. Every fact this file's
// own result carries is computed entirely by the four functions it calls,
// in the fixed order the diagram above shows. This file adds no field,
// drops no field, re-sorts nothing, and re-joins nothing itself — it holds
// no `.filter()`, `.map()` over records, `.find()`, or any per-record
// logic of its own. If a bug ever exists in "which encounters exist" or
// "how a row is shaped," it lives in 0.9.0, 0.9.1, 0.9.2, or 0.9.7 — never
// here.
//
// `describeWorldFromDiscoverySources(sources)` IS THE ONE APPLICATION-
// FACING ENTRY POINT. It takes exactly what 0.9.7's own
// `assembleWorldDiscoveryInputs()` takes — an array of already-described
// `WorldDiscoverySource` bundles, local and peer alike, already
// indistinguishable to this file — and returns exactly what 0.9.2's own
// `describeWorldEncounterView()` returns. A caller (a future,
// unscheduled page-level container for `ui/views/WorldView.js`) never has
// to import `core/WorldDiscoverySourceAssembly.js`,
// `core/WorldEncounter.js`, or either application-layer projection itself
// — this file is the one seam the UI is meant to depend on instead. See
// "Dependency direction," below.
//
// `describeLocalWorldDiscoverySource(records)` GIVES LOCAL DATA THE SAME
// SHAPE A PEER'S DATA ALREADY HAS — NOTHING MORE. 0.9.5's own `origin`
// field was always open-ended, and `describeWorldDiscoverySource({ origin:
// 'local', ... })` already fully answers "what does local data look like
// as a source" with no new code required. This helper exists only so a
// caller assembling `[local, peerA, peerB, ...]` never has to spell the
// literal string `'local'` itself, or risk one call site typing `'Local'`
// and another `'local-storage'` — the same single-source-of-truth role
// `WorldDiscoveryInputKeys` already plays for the six field names, held
// here for the one origin name this file commits to. It performs no
// lookup, no fetch, and no read of a `StorageProvider` — the caller
// already has its own local `publications`/`placements`/`anchors`/
// `snapshotPlacements`/`avatarProfiles`/`avatarPresences` in hand, exactly
// as every existing local caller of `deriveWorldEncounters()` already
// does today. This file gives local data no special status: the source it
// returns is structurally identical to any `peer:<identityId>` source —
// see "No origin-based judgment," below.
//
// NO ORIGIN-BASED JUDGMENT OF ANY KIND — inherited unchanged from 0.9.5,
// 0.9.6, and 0.9.7, held here at the one layer that finally sees local and
// peer sources side by side. This file never branches on `source.origin`,
// never treats `'local'` as special, privileged, or "the real data," and
// never treats a `'peer:...'` origin as remote-and-therefore-suspect. Both
// kinds are handed to `assembleWorldDiscoveryInputs()` in exactly the
// order the caller supplied them, exactly like 0.9.7 already promises on
// its own. No `trusted`, `verified`, `authority`, `priority`, or `weight`
// vocabulary exists here, or ever will at this layer.
//
// NO DEDUPLICATION — inherited unchanged from 0.9.7. If local storage and
// a peer both contributed a publication with the same `id`, this file's
// own result contains both contributions' worth of encounter data, exactly
// as `assembleWorldDiscoveryInputs()` and `deriveWorldEncounters()` already
// produce on their own. This file never notices, and never "fixes," a
// duplicate — see 0.9.7's own header, "Assembly is not reconciliation,"
// which this file never contradicts.
//
// NO PEER CONNECTION, NO TRANSPORT, NO NETWORK. This file never imports
// `peer/PeerMessageBus.js`, `peer/PeerConnection.js`, or any
// `PeerConnectionProvider`/`PeerDiscoveryProvider`. It never establishes a
// connection, never requests data from a peer, never subscribes to
// anything, and never polls. It is handed `sources` — an array a caller
// already assembled from an already-received peer message (0.9.6's own
// job) and its own local records — and does nothing to obtain either. Live
// peer-source lifecycle (a source appearing when a peer connects,
// disappearing when a peer disconnects) is explicitly separate, later,
// unscheduled work — this file has no subscription mechanism, no
// "current sources" state of its own, and no memory between calls.
//
// DEPENDENCY DIRECTION — THE UI NEVER IMPORTS `core/WorldEncounter.js`
// DIRECTLY. This file is what lets a future page-level container write
// `describeWorldFromDiscoverySources(currentWorldDiscoverySources)` and
// nothing else, rather than manually calling
// `assembleWorldDiscoveryInputs()`, then `deriveWorldEncounters()`, then
// `describeWorldEncounterReadModel()`, then `describeWorldEncounterView()`
// itself — which would make the UI layer a second, parallel World
// discovery implementation. `ui/components/WorldEncounterCanvas.js` itself
// is unchanged by this milestone: it already receives a 0.9.2-shaped
// `view` prop and knows nothing about where that view came from.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK. This file reads
// no clock and touches no archive. `describeWorldFromDiscoverySources()`
// calling the same four functions on a byte-identical `sources` argument
// twice returns a byte-identical result, because each of those four
// functions already makes that same promise on its own.
//
// MALFORMED INPUT DEGRADES EXACTLY AS THE FOUR UNDERLYING FUNCTIONS
// ALREADY DEGRADE — NEVER THROWS, AND NEVER A NEW DEGRADE RULE OF THIS
// FILE'S OWN INVENTION. `sources` missing, not an array, empty, or holding
// malformed entries flows straight into `assembleWorldDiscoveryInputs()`,
// which already degrades to six empty arrays without throwing; from there,
// `deriveWorldEncounters()`, `describeWorldEncounterReadModel()`, and
// `describeWorldEncounterView()` each already degrade to their own empty,
// well-formed result in turn. This file adds no `try`/`catch` and no
// defaulting logic of its own — there is nothing left for it to guard.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Establishing, authenticating, or managing a peer connection, or
//   reading anything off `peer/PeerMessageBus.js`, `peer/
//   PeerConnection.js`, or any `PeerConnectionProvider`/
//   `PeerDiscoveryProvider`.** See "No peer connection," above — this file
//   is handed already-described sources.
// - **Live peer-source lifecycle** (a source entering when a peer appears,
//   leaving when a peer disappears). This file holds no state between
//   calls and subscribes to nothing; a caller decides, on every call,
//   exactly which sources currently apply.
// - **Deduplication, reconciliation, source prioritization, trust
//   decisions, signature verification, freshness decisions, conflict
//   resolution, automatic record matching, ranking, scoring, proximity
//   selection, or "nearest" encounter selection.** See "No origin-based
//   judgment" and "No deduplication," above — every one of these is
//   inherited, unmodified, from 0.9.0 through 0.9.7.
// - **Persisting `sources`, the assembled inputs, the encounters, the read
//   model, or the view to a `StorageProvider`.** Every value this file
//   touches is transient, exactly like every value the four functions it
//   calls already treat as transient.
// - **Actual markup, DOM nodes, rendering technology, or the Wanderer
//   itself.** This file returns plain, frozen, 0.9.2-shaped view data;
//   `ui/components/WorldEncounterCanvas.js` (0.9.3/0.9.4, unchanged) is
//   where that data actually renders.
// - **Turning a 0.9.4 selection into an inspection request, or loading
//   inspected content.** Separate, later, unscheduled work (0.9.9, 0.9.10).

export const LOCAL_WORLD_DISCOVERY_ORIGIN = 'local';

// Pure. Describes local data as one `WorldDiscoverySource`, attributed to
// the fixed origin `'local'` — structurally identical to, and no more
// privileged than, any `peer:<identityId>` source 0.9.6 describes. Simply
// forwards to `describeWorldDiscoverySource()`; see this file's own
// header, "`describeLocalWorldDiscoverySource()` gives local data the
// same shape a peer's data already has — nothing more."
export function describeLocalWorldDiscoverySource({
    publications,
    placements,
    anchors,
    snapshotPlacements,
    avatarProfiles,
    avatarPresences
} = {}) {
    return describeWorldDiscoverySource({
        origin: LOCAL_WORLD_DISCOVERY_ORIGIN,
        publications,
        placements,
        anchors,
        snapshotPlacements,
        avatarProfiles,
        avatarPresences
    });
}

// Pure. The one application-facing entry point this milestone adds: takes
// zero or more already-described `WorldDiscoverySource` bundles — local
// and peer alike, in whatever order the caller supplies — and returns
// exactly `describeWorldEncounterView()`'s own result, ready for
// `ui/components/WorldEncounterCanvas.js`'s own `view` prop. See this
// file's own header, "Orchestration, not another projection algorithm."
export function describeWorldFromDiscoverySources(sources) {
    const assembled = assembleWorldDiscoveryInputs(sources);
    const encounters = deriveWorldEncounters(assembled);
    const readModel = describeWorldEncounterReadModel(encounters);
    return describeWorldEncounterView(readModel);
}
