import WorldEncounterMarker from './WorldEncounterMarker.js';
import WandererMarker from './WandererMarker.js';
import WorldDistributionDialog from './WorldDistributionDialog.js';
import { describeWorldFromDiscoveryRegistry } from '../../application/WorldDiscoveryRegistryProjection.js';
import { describeWorldEncounterInspection } from '../../application/WorldEncounterInspection.js';
import { describeWorldEncounterSelectionOutcomeFromRegistry, WorldEncounterSelectionOutcomeStatus } from '../../application/WorldEncounterSelectionOutcome.js';
import { inspectWorldEncounterMaterial } from '../../application/WorldEncounterMaterialInspection.js';
import { createId } from '../../core/createId.js';
import { sanitizeDistributionErrorMessage } from '../../application/DistributionErrorMessageSanitizer.js';
import { resolveSavedProviderDefault } from '../../application/SavedProviderDefaultChoice.js';
// 0.9.474 — Admit World-Encountered Publications into App-Wide Discovery.
// `Publication` (never previously imported here) is needed for exactly one
// check: `loading.status === 'AVAILABLE' && loading.material instanceof
// Publication` — the identical instanceof-gated admission shape
// ui/views/DecentralizedPublicationsView.js's own admitToRepositoryDiscovery()
// (0.9.337) already established for the sibling decentralized-Publications-
// page encounter flow — see admitToRepositoryDiscovery() below. The
// `'AVAILABLE'` string is compared directly, matching
// application/WorldEncounterMaterialInspection.js's own `loading.status`
// (application/WorldEncounterMaterialLoading.js's own
// WorldEncounterMaterialLoadStatus.AVAILABLE) verbatim, WITHOUT importing
// that loading boundary's own module — this file's own established rule
// (see this file's own header, "never a fourth loader") is that it calls
// inspectWorldEncounterMaterial()'s own orchestration boundary and reacts
// only to its result, never reaching past it to a loading/verification
// boundary module directly.
import { Publication } from '../../publisher/Publication.js';
import { PublicationDistributionState } from '../../application/PublicationDistributionLifecycle.js';
import { describeDecentralizedWorldEncounterLeadSelectionOutcomeFromRegistry, DecentralizedWorldEncounterLeadSelectionOutcomeStatus } from '../../application/DecentralizedWorldEncounterLeadSelection.js';
import { describePublicationMaterialProvenanceFromInspection } from '../../application/PublicationMaterialProvenance.js';
import { resolveSnapshotPublicationAttribution } from '../../application/SnapshotPublicationAttribution.js';
import { describeWorldEncounterPresentation, describeWorldEncounterPresentationSourceFamily, WorldEncounterPresentationSourceFamily } from '../../application/WorldEncounterPresentation.js';
import { describeWorldSnapshotInspection } from '../../application/WorldSnapshotInspection.js';
import { unregisterMaterializedSnapshotWorldSource, materializedSnapshotWorldOrigin } from '../../application/MaterializedSnapshotWorldDiscoveryBridge.js';
import { describeWorldEncounterComparisonCandidate } from '../../application/WorldEncounterComparisonCandidate.js';
import { compareSnapshotWorldPublications } from '../../application/WorldSnapshotComparison.js';
import { describeWorldSnapshotContentView } from '../../application/WorldSnapshotContentView.js';
import { describeWorldSnapshotContentComparisonView } from '../../application/WorldSnapshotContentComparisonView.js';
import { describeWorldEncounterMaterialLoadStatusLabel, describeWorldEncounterMaterialVerificationStatusLabel } from '../../application/WorldEncounterMaterialInspectionView.js';
import { describeSnapshotResolutionOutcomeLabel, describeSnapshotAttributionOutcomeLabel } from '../../application/SnapshotOutcomeInspectionView.js';

// 0.9.3 — World View UI / Wanderer Presence.
//
// The first actual World View surface. 0.9.0 → 0.9.1 → 0.9.2 built the
// complete application-side World Encounter pipeline and stopped, each
// milestone explicitly naming "an actual World UI" as later, unscheduled
// work. This file is that request: a simple 2D World View that renders
// 0.9.2's own `application/WorldEncounterView.js#describeWorldEncounterView()`
// result — encounterable publications and avatars — alongside the
// Wanderer's own on-screen position.
//
//   0.9.2 WorldEncounterView
//             │
//             ▼
//   WorldEncounterCanvas (THIS milestone) ★
//        ├── WorldEncounterMarker × publications
//        ├── WorldEncounterMarker × avatars
//        └── WandererMarker
//
// THIS IS A SPATIAL REPRESENTATION, NEVER SPATIAL INTELLIGENCE. Every
// encounterable object `view` supplies renders, regardless of distance
// from the Wanderer — no proximity, no "nearby," no discovery relevance.
// That is explicitly this milestone's OWN "one thing not added yet," left
// for a separate, later, unscheduled 0.9.4-or-later projection (a World
// Spatial Encounter Projection) — see docs/Roadmap.md's own 0.9.3 entry.
//
// THIS COMPONENT RECEIVES THE 0.9.2 VIEW DIRECTLY — NEVER RAW DOMAIN DATA.
// `view` is exactly `describeWorldEncounterView()`'s own result (or a
// plain object shaped like it). This file imports NOTHING from
// `application/` or `core/` — not `WorldEncounter.js`, not
// `WorldEncounterReadModel.js`, not `WorldEncounterView.js` itself — and
// performs no join, no fetch, and no recomputation of the encounter data
// itself. A caller (a future, unscheduled page-level container) computes
// the view however it likes and hands it here already-built, exactly the
// same "host resolves, component renders" convention
// ui/components/PublicationCard.js already established.
//
// THE WANDERER'S POSITION IS PAGE-LOCAL UI STATE — NEVER PERSISTED, NEVER
// SYNCHRONIZED. `wandererPosition` lives entirely in this component's own
// `data()`, defaulting to the World's origin (`{ x: 0, y: 0, z: 0 }`).
// Nothing here writes it to a StorageProvider, nothing here opens a
// network connection, and nothing here creates a player/world-state domain
// object to hold it — a plain reactive field is enough for this milestone.
//
// SCREEN X ← WORLD X; SCREEN Y ← WORLD Z. `projectToCanvas()` below is a
// simple, fixed, pure linear transform — a fixed half-span mapped onto a
// fixed square viewBox, no auto-fit, no pan, no zoom. World `y`
// (elevation) is never read by this mapping; it stays whatever metadata
// 0.9.1's own row already carries. Unlike ui/components/WorldMapPanel.js's
// own richer projection (pan, zoom, auto-fit extent), 0.9.3 doesn't need
// one: there is no camera to move yet, and every object always renders.
//
// PUBLICATIONS AND AVATARS STAY SEPARATE, NEVER FLATTENED. Exactly like
// 0.9.0/0.9.1/0.9.2 before it, `projectedPublications`/`projectedAvatars`
// are two separate computed arrays, rendered as two separate `v-for`
// blocks below — never merged into one generic "markers" list.
//
// COUNTS ARE RECOMPUTED FROM THE ARRAYS THEMSELVES, NEVER TRUSTED BLINDLY
// OFF `view.isEmpty` — the same defensive posture 0.9.2's own
// `describeWorldEncounterView()` already holds one layer down.
// `isWorldEmpty` is `true` only when both arrays are empty; the Wanderer
// still renders either way (see ui/components/WandererMarker.js's own
// header, "an empty World is not an empty screen").
//
// NO SORTING. `projectedPublications`/`projectedAvatars` preserve `view`'s
// own row order, unchanged — there is no `.sort()` anywhere in this file.
//
// NO DISTANCE, NEAREST, NEARBY, RADIUS, SCORE, RANK, TRUST, VERIFIED,
// WINNER, OR CORRECTNESS VOCABULARY OF ANY KIND.
//
// MALFORMED `view` DEGRADES TO AN EMPTY RENDER — NEVER THROWS. A `view`
// that is `null`, `undefined`, or missing a genuine `publications`/
// `avatars` array degrades to zero markers of either kind (the Wanderer
// still renders) — the same posture 0.9.1's and 0.9.2's own application
// layer already holds at their own boundaries.
//
// 0.9.4 — World Encounter Selection.
//
// This is the one behavior 0.9.3 explicitly left out: this component now
// OWNS the Wanderer's current selection, as page-local UI state only —
//
//   marker click (WorldEncounterMarker's own `select` emit)
//           ↓
//   selectEncounter()
//           ↓
//   selectedEncounter = { kind, objectId }
//
// `selectedEncounter` lives entirely in this component's own `data()`,
// exactly like `wandererPosition` above it — no StorageProvider write, no
// network call, no global/Vuex-style store, no archive mutation. Selecting
// a marker never re-fetches, re-derives, or mutates `view` itself; the
// prop this component received stays exactly what its caller handed it
// (see ui/components/WorldEncounterMarker.js's own header, "0.9.4 adds
// exactly one thing").
//
// ONE SELECTION STATE, NOT TWO. `selectedEncounter` is a single
// `{ kind, objectId }` pair, never split into `selectedPublication` /
// `selectedAvatar`. The World already established publications and
// avatars as two encounter kinds; selection answers "which encounter did
// the Wanderer select?", not two separate questions.
//
// SELECTING NEVER INSPECTS. `selectedEncounter` carries only the identity
// a marker emitted — `kind` and `objectId` — and nothing is fetched,
// compared, verified, or ranked as a result of selecting it. Turning a
// selection into an inspection request is separate, later, unscheduled
// work (0.9.5).
//
// 0.9.13 — Live World View Registry Subscription.
//
// 0.9.10 proved a World View CAN be derived from a registry's current
// membership; 0.9.12 proved the registry CAN notify a subscriber when
// that membership changes. Both stopped there on purpose — 0.9.10's own
// header named the gap "reactive, automatic recomputation is separate,
// later, unscheduled work," and 0.9.12's own header named it again,
// even more specifically: "wiring an actual running World View
// component to call `registry.subscribe()` and re-project on
// notification is 0.9.13, unscheduled here." This is that wiring, and
// only that wiring.
//
//   local records ────────────────┐
//                                  │
//   peer connect ──▶ lifecycle ────┤
//                                  ▼
//                  WorldDiscoverySourceRegistry        (0.9.9/0.9.11/0.9.12)
//                       registry.subscribe(listener)
//                                  │
//                                  ▼  notification (no arguments)
//                  WorldEncounterCanvas.js   ★ (THIS milestone)
//                       registry.subscribe()'d in mounted()
//                       describeWorldFromDiscoveryRegistry(registry)  (0.9.10)
//                       worldView = <fresh result>
//                                  │
//                                  ▼
//                       (renders exactly as 0.9.3/0.9.4 already do)
//
// A NEW, OPTIONAL `registry` PROP — `view` IS UNCHANGED AND STILL WORKS.
// A caller that already hands this component an already-computed `view`
// (0.9.3's own original contract, still exactly what every existing test
// in `tests/WorldEncounterCanvasUI.test.js` and
// `tests/WorldEncounterSelectionUI.test.js` exercises) keeps doing so —
// nothing about that path changes. `registry` is the new, separate way
// to drive this component: hand it a live `WorldDiscoverySourceRegistry`
// instance instead, and this component keeps its own rendered World in
// sync with that registry's membership for as long as it stays mounted.
// See `effectiveView`, below, for exactly which one a render uses when
// both are supplied.
//
// `effectiveView`: REGISTRY, WHEN SUPPLIED, WINS — NEVER BOTH AT ONCE.
// `effectiveView` reads `worldView` (this component's own registry-
// derived state, below) whenever a `registry` prop was supplied, and
// falls back to the `view` prop otherwise. There is no merging of the
// two, and no field-by-field reconciliation between them — exactly one
// of them is ever live for a given mount, decided once by whether
// `registry` is truthy.
//
// `worldView` IS PAGE-LOCAL UI STATE, OWNED BY THIS COMPONENT — EXACTLY
// LIKE `wandererPosition` AND `selectedEncounter` ALREADY ARE. It lives
// in this component's own `data()`, starts `null`, and is written to
// exactly once per registry snapshot, by `refreshWorldViewFromRegistry()`
// below. Nothing here persists it to a `StorageProvider`, broadcasts it
// to a peer, or holds it anywhere but this one component instance's own
// reactive state.
//
// SUBSCRIPTION IS A MOUNT-LIFETIME CONCERN, OWNED BY THIS COMPONENT —
// NOT BY `application/WorldDiscoveryRegistryProjection.js`. That module's
// own header is explicit about staying "synchronous and stateless" —
// "snapshot, not subscription" — and 0.9.13 does not change that; it
// stays a pure `registry -> view` function, called here, unmodified,
// exactly as 0.9.10 already calls it. Mounting and unmounting are
// precisely where a subscription's own lifetime belongs — a page-level
// component, not a stateless projection function — so `mounted()`
// subscribes and `beforeUnmount()` unsubscribes, both below.
//
// `mounted()`: SEED, THEN SUBSCRIBE. When a `registry` prop is supplied,
// `mounted()` calls `refreshWorldViewFromRegistry()` once immediately (so
// this component renders the registry's CURRENT membership without
// waiting for the first future change), then calls `registry.subscribe()`
// and keeps the `unsubscribe` function it returns. When no `registry` is
// supplied (or it is falsy), `mounted()` does nothing at all — this
// component behaves exactly as it did before 0.9.13, driven purely by
// the `view` prop.
//
// `refreshWorldViewFromRegistry()` IS THE ONE PLACE `worldView` IS EVER
// WRITTEN, AND THE ONLY CALLER OF `describeWorldFromDiscoveryRegistry()`
// IN THIS FILE. Every write REPLACES `worldView` wholesale with a fresh
// call's own result — never mutates the previous snapshot in place, and
// never patches individual `publications`/`avatars` rows into it. This
// is also 0.9.12's own subscription contract, applied literally:
// `listener()` carries no `{ origin, action, source }` detail, so the
// only correct reaction to a notification is "read `listSources()`
// again" — which is exactly what `describeWorldFromDiscoveryRegistry()`
// already does, unmodified, on this component's behalf.
//
// THE LISTENER ITSELF DOES NOTHING BUT CALL `refreshWorldViewFromRegistry()`.
// It reads no argument (0.9.12's own `listener()` is called with none),
// inspects no `source.origin`, and makes no decision about what changed
// — see "Architectural boundary," below.
//
// `beforeUnmount()` UNSUBSCRIBES, UNCONDITIONALLY AND IDEMPOTENTLY. If
// `mounted()` never subscribed (no `registry` was supplied),
// `unsubscribeWorldRegistry` stays `null` and `beforeUnmount()` does
// nothing. Otherwise it calls the exact `unsubscribe` function 0.9.12's
// own `registry.subscribe()` returned — safe to call more than once,
// per that module's own "unsubscribe() is idempotent and permanent"
// contract — and clears the stored reference. Once unmounted, this
// component's own `worldView` is never written to again by anything.
//
// ARCHITECTURAL BOUNDARY — THIS COMPONENT MAY SUBSCRIBE AND REQUEST A
// FRESH PROJECTION; IT MAY NEVER COMPUTE ONE ITSELF. This file imports
// exactly one `application/` module — `WorldDiscoveryRegistryProjection.js`'s
// own `describeWorldFromDiscoveryRegistry()`, 0.9.10's already-existing,
// unmodified function — and no `core/` module at all. It never imports
// or calls `deriveWorldEncounters()`, `assembleWorldDiscoveryInputs()`,
// or `describeWorldFromDiscoverySources()` directly, never reads
// `registry.listSources()` itself (that stays entirely inside 0.9.10's
// own function), and never reads a source's own `origin` field —
// `describeWorldFromDiscoveryRegistry()` already treats every source
// identically, and this component inherits that blindness rather than
// reproducing or second-guessing it. It never calls
// `registry.setSource()`, `registry.removeSource()`, or `registry.clear()`
// — membership stays the registry's own decision, never this
// component's. It performs no deduplication, no sorting, no record
// comparison, no signature verification, and no peer data fetch — every
// one of those stays behind the seam this component depends on,
// unchanged from 0.9.10 down through 0.9.0.
//
// NO RUNTIME `registry` PROP SWAPPING. This milestone does not watch for
// `registry` changing to a different instance (or to/from `null`) after
// mount and re-subscribing accordingly — a mounted `WorldEncounterCanvas`
// is bound to whichever `registry` it received when `mounted()` first
// ran, for its own entire mount lifetime. A caller that needs to observe
// a different registry re-mounts the component (e.g. via a `:key`
// change) rather than relying on this component to notice a prop swap
// itself. Separate, later, unscheduled work, if ever needed.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A second World-projection algorithm, or any direct call to
//   `deriveWorldEncounters()`, `assembleWorldDiscoveryInputs()`, or
//   `describeWorldFromDiscoverySources()`.** See "Architectural
//   boundary," above — `describeWorldFromDiscoveryRegistry()` is the one
//   seam this component depends on.
// - **Reading, filtering, or branching on `source.origin` or any peer
//   identity.** This component never sees an individual source at all —
//   only the already-fully-projected `view` shape 0.9.2 already defined.
// - **Mutating registry membership** (`setSource()`/`removeSource()`/
//   `clear()`) from this component. Membership stays the registry's own
//   decision — see "Architectural boundary," above.
// - **Deduplication, sorting, record comparison, signature verification,
//   or fetching a peer's own data.** Every one of those remains out of
//   scope at this layer, inherited unchanged from 0.9.0 through 0.9.10.
// - **Persisting `worldView`, or anything else this component holds, to
//   a `StorageProvider` or across a page reload.** `worldView` lives and
//   dies with this component's own mount, exactly like
//   `wandererPosition`/`selectedEncounter` already do.
// - **Watching a `registry` prop change after mount and re-subscribing.**
//   See "No runtime registry prop swapping," above.
// - **An event payload, coalesced/debounced notification, or any change
//   to 0.9.12's own `subscribe()` contract.** This component consumes
//   that contract exactly as 0.9.12 already defined it.
// - **The Wanderer's own position becoming registry-driven, or any
//   spatial/proximity computation.** Unchanged from every earlier
//   milestone in this file — the Wanderer stays page-local UI state,
//   entirely unrelated to World discovery.
//
// 0.9.18 — Render Selected Encounter Inspection.
//
// 0.9.16 built the join — `describeWorldEncounterInspection({
// selectedEncounter, view })` — and stopped, its own header naming the
// gap explicitly: "any UI, panel, or rendering technology choice... is
// separate, later, unscheduled work (Encounter Inspection UI)." This
// component already owns both halves that join needs — `selectedEncounter`
// (0.9.4) and `effectiveView` (0.9.2/0.9.13) — so this milestone is simply
// calling it and rendering what comes back:
//
//   effectiveView  +  selectedEncounter
//                  │
//                  ▼
//   application/WorldEncounterInspection.js   (0.9.16, unmodified)
//        describeWorldEncounterInspection()
//                  │
//                  ▼
//        selectedEncounterInspection      ★ (THIS milestone)
//                  │
//                  ▼
//        world-encounter-inspection-panel (below, in the template)
//
// `selectedEncounterInspection` IS LOCAL, DERIVED, COMPUTED STATE — NEVER A
// NEW APPLICATION PROJECTION OF ITS OWN. It is a plain `computed` that
// calls 0.9.16's own function with this component's own already-existing
// `selectedEncounter` and `effectiveView` and returns whatever comes back,
// unchanged. No new page-local data field is introduced to hold it, and no
// new `application/` module is added — the read model this milestone
// renders already existed; only the rendering did not.
//
// THE PUBLICATION PANEL AND THE AVATAR PANEL STAY TWO SEPARATE TEMPLATE
// BLOCKS, NEVER ONE GENERIC RECORD. Exactly like `projectedPublications`/
// `projectedAvatars` above, and exactly like 0.9.16's own inspection
// result itself, there is no shared "inspection card" shape rendering
// every possible field with some left blank depending on `kind` — the
// template below branches on `selectedEncounterInspection.kind` into two
// distinct `<dl>` blocks, one per shape 0.9.16 already defined.
//
// A STALE SELECTION RENDERS NOTHING STALE — IT RENDERS UNAVAILABLE. The
// World is live (0.9.13): the object a Wanderer selected can leave the
// World — a peer disconnects, a peer replaces its source — between
// selection and render. When that happens, 0.9.16's own join already
// returns `null` rather than a stale or fabricated row; this component's
// only job is to respect that boundary, never to paper over it. When
// `selectedEncounter` is set but `selectedEncounterInspection` comes back
// `null`, the panel shows a plain "no longer part of the World" notice —
// never the previous inspection's own fields, never a fabricated
// placeholder. `selectedEncounter` itself is left exactly as it was: this
// milestone does not clear it, so a re-appearing object under the same
// `objectId` resumes showing its own inspection automatically, on the
// very next reactive recompute — no explicit "retry" or "refresh" action
// of any kind.
//
// `isSigned` IS RENDERED AS "SIGNED: YES/NO" — LITERALLY WHAT IT ALREADY
// MEANS, NOTHING MORE. See `application/WorldEncounterInspection.js`'s own
// header: `isSigned` reports only that the underlying publication carries
// signature material, never whether that signature verifies. This
// component introduces no `isVerified`/`isTrusted`/`isAuthentic` label,
// icon, color, or wording of any kind — "Signed: Yes" is read the same way
// "Signed: No" is, with no implication drawn from either.
//
// `publisherIdentity` RENDERS AS ITS OWN STRUCTURE, VERBATIM — NEVER ONE
// CHERRY-PICKED FIELD. `application/WorldEncounterReadModel.js`'s own
// header already drew this line: "this file does not collapse
// publisherIdentity (an object) into a single scalar... picking a single
// property of that object to stand in for the whole thing would be an
// interpretive step." This component holds that same line: it renders
// `publisherIdentity`'s own structure (`JSON.stringify`), never a
// `.username`/`.id`/`.publisherId` guess at which of its fields matters.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A network request, peer request, storage lookup, signature
//   verification, or trust decision of any kind.** This milestone renders
//   exactly the structural fact 0.9.16 already computed — nothing here
//   fetches, verifies, or judges anything.
// - **Loading the selected publication's or avatar's own underlying signed
//   material.** Separate, later, unscheduled work (Encounter Material
//   Resolution).
// - **`isVerified`/`isTrusted`/`isAuthentic` vocabulary, or any styling
//   that implies one.** See "isSigned is rendered... nothing more," above.
// - **Navigation, proximity, sorting, or deduplication of any kind.**
//   Unaffected by this milestone — inherited, unchanged, from every
//   earlier one in this file.
// - **Clearing `selectedEncounter` when its own inspection goes stale, or
//   any other change to how `selectedEncounter` is written.** See "a stale
//   selection renders unavailable," above — `selectEncounter()` stays this
//   component's only writer of `selectedEncounter`, exactly as 0.9.4 left
//   it.
//
// 0.9.20 — World Encounter Selection Resolution.
//
// 0.9.19 could already say WHICH sources currently offer a matching
// encounter; nothing yet turned that list into a specific, resolved
// `{ kind, objectId, origin }` a future material-loading step could act
// on. This milestone crosses exactly that boundary, entirely below
// `selectedEncounter` itself:
//
//   selectedEncounter = { kind, objectId }                (0.9.4, unchanged)
//                  │
//                  ▼
//   application/WorldEncounterSelectionOutcome.js   (THIS milestone) ★
//        describeWorldEncounterSelectionOutcomeFromRegistry()
//                  │
//                  ▼
//        selectionOutcome = { status, candidates, resolvedSelection }
//                  │
//        ┌─────────┼──────────────────┐
//        ▼          ▼                  ▼
//   UNAVAILABLE  RESOLVED           AMBIGUOUS
//  (existing    (resolvedEncounter  ("Choose Source" panel, below —
//   inspection   Selection is set    resolvedEncounterSelection stays
//   panel's own  automatically,      null until the Wanderer clicks
//   "no longer   no interaction      one of selectionOutcome's own
//   part of the  required)           candidates)
//   World"
//   notice
//   already
//   covers this)
//
// `selectedEncounter` STAYS EXACTLY `{ kind, objectId }` — THE ONE THING
// THIS MILESTONE DOES NOT TOUCH. Per the task's own framing, resolving
// provenance is an entirely separate, additional fact layered UNDER the
// existing selection, never a reshaping of it: `selectEncounter()` still
// stores exactly what a marker's own `select` emit carries, and every
// 0.9.4/0.9.18 behavior (repeated selection, malformed identity,
// inspection rendering) is unaffected. `resolvedEncounterSelection` is a
// new, separate, DERIVED concept — `{ kind, objectId, origin }` — that
// exists ALONGSIDE `selectedEncounter`, never in place of it.
//
// `selectionOutcome` IS DATA, WRITTEN BY `refreshSelectionOutcome()` —
// NEVER A COMPUTED. Exactly like `worldView` (0.9.13), this cannot be a
// plain Vue `computed`: it depends on `this.registry`'s own current
// `listSources()` snapshot, and a bare class instance handed in as a prop
// gives Vue's reactivity system nothing to track when that snapshot
// changes later. `refreshSelectionOutcome()` is the one place
// `selectionOutcome` is ever written, called from the exact two places a
// resolvable answer can change: `selectEncounter()` (a new selection) and
// the registry's own change listener (sources coming and going while a
// selection stays open) — mirroring `refreshWorldViewFromRegistry()`'s own
// two call sites exactly.
//
// NO `registry`, NO RESOLUTION — NEVER A FABRICATED ORIGIN. Resolving
// provenance requires the very thing that makes provenance nameable at
// all: per-source data, which this component only ever has access to via
// a `registry` (see 0.9.19's own header, "attached to the encounter,
// never to a record" — a bare `view` prop is already the origin-blind,
// assembled reading and carries no source boundary to resolve against).
// When no `registry` was supplied, `selectionOutcome` stays `null` and
// `resolvedEncounterSelection` stays `null` — this component behaves
// exactly as every earlier milestone already left it, driven purely by
// `view`.
//
// `resolvedSelectionChoice` IS THE WANDERER'S OWN EXPLICIT PICK, WRITTEN
// ONLY BY `chooseSelectionOrigin()` — NEVER GUESSED, NEVER DEFAULTED.
// When `selectionOutcome.status` is `'AMBIGUOUS'`, this component does
// not call `.find()`, does not read `candidates[0]`, and does not prefer
// `'local'` — see 0.9.19's own header, "every matching candidate, never
// one picked for the caller," and
// `application/WorldEncounterSelectionOutcome.js`'s own header, "the
// choice belongs at the presentation/application boundary." The "Choose
// Source" panel below renders every one of `selectionOutcome.candidates`
// as its own button; clicking one calls `chooseSelectionOrigin(candidate)`,
// which stores that EXACT candidate object, verbatim, as
// `resolvedSelectionChoice`. `selectEncounter()` resets
// `resolvedSelectionChoice` to `null` on every new selection, so a choice
// made for one ambiguous encounter never silently carries over to the
// next one.
//
// `resolvedEncounterSelection` IS THE ONE COMPUTED VALUE A FUTURE,
// UNSCHEDULED MATERIAL-LOADING STEP WOULD ACTUALLY CONSUME. It is
// `selectionOutcome.resolvedSelection` when `status` is `'RESOLVED'`
// (automatic — no interaction required for an already-unambiguous
// selection), `resolvedSelectionChoice` when `status` is `'AMBIGUOUS'`
// AND that choice still names one of `selectionOutcome`'s own current
// candidates (re-checked on every read, never trusted blindly — a chosen
// origin can itself disappear from a live World between the click and
// now), and `null` in every other case — no selection, no registry,
// `'UNAVAILABLE'`, or an `'AMBIGUOUS'` selection nobody has resolved yet.
// This milestone renders it nowhere beyond the "Source: …" line described
// below; nothing here loads, fetches, or interprets what it names.
//
// UNAVAILABLE RENDERS NOTHING NEW — 0.9.18's OWN NOTICE ALREADY COVERS IT.
// A `selectionOutcome.status` of `'UNAVAILABLE'` means zero sources
// currently offer this selection, which is exactly the same condition
// 0.9.16's own join already reports as a `null`
// `selectedEncounterInspection` — the existing "This encounter is no
// longer part of the World" notice already says everything this
// milestone would otherwise duplicate. The new panel below renders
// nothing at all in this case.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Loading publication material, requesting anything from a peer,
//   reading `localStorage`, sending a peer message, verifying a
//   signature, or determining trust.** This milestone establishes
//   unambiguous selection only — see
//   `application/WorldEncounterSelectionOutcome.js`'s own header for the
//   identical boundary held one layer down.
// - **Deduplicating encounters, or preferring one source/peer over
//   another by any rule.** See "resolvedSelectionChoice is the
//   Wanderer's own explicit pick," above.
// - **Interpreting the publication a resolved selection names.** A
//   resolved `{ kind, objectId, origin }` is still just a name.
// - **Any change to `core/WorldEncounter.js` or the peer transport
//   layer.** Neither is imported, referenced, or affected by this
//   milestone.
// - **Persisting `resolvedSelectionChoice`, `selectionOutcome`, or
//   anything else this milestone adds, beyond this component's own
//   mount.** Both live and die with this component instance, exactly
//   like `selectedEncounter`/`worldView` already do.
//
// 0.9.39 — World Encounter Material Inspection Orchestration & UI
// Integration.
//
// 0.9.20 already computes `resolvedEncounterSelection` — the one
// `{ kind, objectId, origin }` a future material-loading step would
// actually consume, per that milestone's own header. Nothing until now
// consumed it. This milestone is that consumption, entirely through
// `application/WorldEncounterMaterialInspection.js`'s own unmodified
// `inspectWorldEncounterMaterial()` — the one orchestration boundary that
// already knows how to route a resolved selection to a loading boundary
// (0.9.21/0.9.34) and hand the result to verification (0.9.37/0.9.38):
//
//   resolvedEncounterSelection (0.9.20, unchanged)
//                  │
//                  ▼
//   application/WorldEncounterMaterialInspection.js   (0.9.39, unmodified)
//        inspectWorldEncounterMaterial()
//                  │
//                  ▼
//        materialInspection = { selection, lead, loading, verification }
//                  │
//                  ▼
//        world-encounter-material-panel (below, in the template)
//
// THIS COMPONENT REMAINS A CONSUMER, NEVER A SECOND ORCHESTRATOR. It never
// reads `material.id`/`material.avatarId`, never calls
// `loadWorldEncounterMaterial()`/`loadWorldEncounterMaterialFromResolvedLead()`/
// `verifyWorldEncounterMaterial()` directly, and never constructs a
// `WorldEncounterMaterialSource` or `WorldEncounterMaterialVerifier` of its
// own — `materialSources`/`materialVerifier` are new, optional props a
// caller injects, exactly the way `registry` already is.
//
// `materialInspection` IS DATA, WRITTEN BY `refreshMaterialInspection()` —
// NEVER A COMPUTED. It cannot be a plain `computed` because loading
// material is asynchronous (0.9.21's own "synchronous validation,
// asynchronous result"); a computed cannot await a Promise.
// `refreshMaterialInspection()` is the one place `materialInspection` is
// ever written, called from every place `resolvedEncounterSelection` could
// change: the tail of `refreshSelectionOutcome()` (itself already called
// from `selectEncounter()`, `mounted()`, and the registry's own change
// listener — see this file's own 0.9.20 header) and the tail of
// `chooseSelectionOrigin()`. This mirrors `refreshWorldViewFromRegistry()`'s
// and `refreshSelectionOutcome()`'s own "one writer, several call sites"
// shape exactly.
//
// NO MATERIAL SOURCE, NO MATERIAL INSPECTION — MIRRORING 0.9.20's OWN "NO
// REGISTRY, NO RESOLUTION." When no `materialSources` prop was supplied,
// `refreshMaterialInspection()` leaves `materialInspection` at `null`
// without ever calling `inspectWorldEncounterMaterial()` — this component
// behaves exactly as every earlier milestone already left it for every
// caller that has not opted into material inspection, including every
// existing test in this chain.
//
// DO NOT LOAD MATERIAL WHILE THE SELECTION IS AMBIGUOUS — THE EXPLICIT
// DESIGN CHOICE THIS MILESTONE WAS BUILT AROUND. `refreshMaterialInspection()`
// reads `this.resolvedEncounterSelection` — 0.9.20's own computed, already
// `null` for any `'AMBIGUOUS'` selection nobody has explicitly resolved via
// `chooseSelectionOrigin()` yet — and does nothing at all when it is
// `null`. This component invents no automatic choice between multiple
// offered sources; the Wanderer's own explicit `origin` pick (0.9.20)
// remains the only gate that ever lets material loading proceed.
//
// A STALE OR CHANGED SELECTION REFRESHES MATERIAL INSPECTION, EXACTLY LIKE
// 0.9.20 ALREADY REFRESHES `selectionOutcome`. Because `refreshMaterialInspection()`
// runs at the tail of `refreshSelectionOutcome()`, every one of that
// method's own triggers — a fresh selection, the registry's own
// notification when a source appears or disappears — refreshes
// `materialInspection` whenever `resolvedEncounterSelection` genuinely
// changed as a result (as of 0.9.169 — see that milestone's own header,
// below, for the precision that reads: an unrelated registry mutation
// that leaves the current selection's own resolved identity untouched no
// longer re-triggers a load). A selection that goes stale (`selectionOutcome`
// becomes `'UNAVAILABLE'`, or `resolvedEncounterSelection` otherwise
// becomes `null`) clears `materialInspection` back to `null` the same way
// — that is itself a genuine change, so it still refreshes.
//
// A REQUEST COUNTER GUARDS AGAINST A STALE ASYNC RESPONSE OVERWRITING A
// NEWER ONE — NOT A CACHE, NOT A RETRY. Because loading is asynchronous, a
// Wanderer could select encounter A, then B, before A's own
// `inspectWorldEncounterMaterial()` call resolves. `materialInspectionRequestId`
// is incremented on every call to `refreshMaterialInspection()`; a
// resolved Promise is only written to `materialInspection` if that same
// request is still the most recent one made. This is purely a
// last-request-wins correctness guard — it never memoizes a result for
// reuse and never retries a failed or stale one.
//
// `beforeUnmount()` ALSO INVALIDATES ANY IN-FLIGHT REQUEST. Bumping
// `materialInspectionRequestId` one more time on unmount ensures a
// still-pending `inspectWorldEncounterMaterial()` Promise, if one resolves
// after this component is gone, is never written to `materialInspection`
// — mirroring the same "no writes after teardown" discipline
// `unsubscribeWorldRegistry` already holds for the registry subscription.
//
// NO `resolvedLead` IS EVER SUPPLIED FROM THIS COMPONENT. `inspectWorldEncounterMaterial()`
// accepts an optional decentralized lead; this component never has one to
// offer — decentralized lead resolution (0.9.28) is not wired into this
// file, in either direction, by this milestone. Every call this component
// makes therefore always routes through 0.9.21's own origin-routed loading
// boundary (`materialSources.local`/`.peer`), never through 0.9.34's own
// lead-aware one. Wiring a resolved lead into this component is separate,
// later, unscheduled work.
//
// STATUS IS RENDERED LITERALLY, NEVER AS "TRUSTED"/"AUTHENTIC"/"SAFE." The
// new panel below renders exactly `materialInspection.loading.status`
// (`UNAVAILABLE`/`AVAILABLE`, 0.9.21) and
// `materialInspection.verification.status` (`UNVERIFIABLE`/`VERIFIED`/
// `REJECTED`, 0.9.37) — the same restraint this file's own 0.9.18 section
// already holds for `isSigned` ("no isVerified/isTrusted/isAuthentic
// vocabulary... anywhere").
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Resolving a decentralized lead, or any decentralized-discovery UI of
//   any kind.** See "no resolvedLead is ever supplied," above.
// - **A default `materialSources`/`materialVerifier`.** Both stay `null`
//   until a caller explicitly injects them — this component never
//   constructs a `WorldEncounterMaterialSource`/`WorldEncounterMaterialVerifier`
//   itself.
// - **Retrying a failed or unavailable load, or caching a previous
//   result.** See "a request counter guards against a stale async
//   response," above — that counter exists purely to discard a superseded
//   response, never to reuse or retry one.
// - **Cryptographic signature verification, content-reference/URI
//   correspondence, or any interpretation of `material` beyond the two
//   status strings this milestone renders.**
// - **Persisting `materialInspection`, or anything else this milestone
//   adds, beyond this component's own mount.** Lives and dies with this
//   component instance, exactly like `selectionOutcome`/`worldView`
//   already do.
//
// 0.9.40 — Decentralized Lead Resolution Integration.
//
// 0.9.39 already wired resolved selection and verification into this
// component and stopped there on purpose — its own header named the gap
// explicitly: "no resolvedLead is ever supplied from this component...
// decentralized lead resolution (0.9.28) is not wired into this file, in
// either direction." This milestone is that wiring, entirely through a new,
// thin application-layer seam — `application/
// DecentralizedWorldEncounterLeadSelection.js`'s own
// `describeDecentralizedWorldEncounterLeadSelectionOutcomeFromRegistry()` —
// which exposes 0.9.28's own already-authoritative resolution machinery
// (`application/DecentralizedWorldEncounterLeadResolution.js`, unmodified)
// in the exact `{ status, candidates, resolvedLead }` shape 0.9.20's own
// `selectionOutcome` already established one layer over, for World
// Discovery sources.
//
//   selectedEncounter = { kind, objectId }                (0.9.4, unchanged)
//                  │
//                  ▼
//   application/DecentralizedWorldEncounterLeadSelection.js   (THIS milestone) ★
//        describeDecentralizedWorldEncounterLeadSelectionOutcomeFromRegistry()
//                  │
//                  ▼
//        decentralizedLeadOutcome = { status, candidates, resolvedLead }
//                  │
//        ┌─────────┼──────────────────┐
//        ▼          ▼                  ▼
//   UNAVAILABLE  RESOLVED           AMBIGUOUS
//  (no panel    (resolvedLead set   ("Choose Location" panel, below —
//   rendered)    automatically,      resolvedLead stays null until the
//                no interaction      Wanderer clicks one of
//                required)           decentralizedLeadOutcome's own
//                                    candidates)
//                  │
//                  ▼
//        resolvedLead, forwarded alongside resolvedEncounterSelection to
//        inspectWorldEncounterMaterial()  (0.9.39, unmodified)
//
// `decentralizedLeadOutcome` IS COMPUTED FROM `selectedEncounter` ALONE —
// NEVER FROM `resolvedEncounterSelection`. Per 0.9.28's own header,
// "requestedMaterial is { kind, objectId } — deliberately not a full
// { kind, objectId, origin } selection identity" — a decentralized lead's
// own provenance has never been part of the local/peer origin vocabulary
// `resolvedEncounterSelection` names. This component's own lead resolution
// therefore runs off exactly the same `{ kind, objectId }` pair a marker
// click already produces, entirely independent of whether the World-
// discovery-source selection itself is resolved, ambiguous, or stale.
// `resolvedEncounterSelection` still gates whether material EVER loads at
// all (0.9.39's own "do not load material while the selection is
// ambiguous" — a resolved lead alone never bypasses that gate, because
// `inspectWorldEncounterMaterial()` still requires a well-formed
// `resolvedSelection` regardless of path), but it never gates whether a
// lead RESOLVES.
//
// NO `worldDiscoveryLeadRegistry`, NO LEAD RESOLUTION — MIRRORING 0.9.20's
// OWN "NO REGISTRY, NO RESOLUTION." When no `worldDiscoveryLeadRegistry`
// prop was supplied, `decentralizedLeadOutcome` stays `null` and
// `resolvedLead` stays `null` — every existing caller of this component,
// including every pre-0.9.40 test, is unaffected;
// `inspectWorldEncounterMaterial()` is still called (via
// `resolvedEncounterSelection` alone, exactly as 0.9.39 left it), just
// never with a `resolvedLead`.
//
// `decentralizedLeadAssociations` IS THE CALLER'S OWN EVIDENCE, FORWARDED
// VERBATIM — NEVER DERIVED BY THIS COMPONENT. See `core/
// DecentralizedWorldEncounterLeadAssociation.js`'s own header, "the one
// rule this file exists to hold": a discovery tag or URI is never, by
// itself, evidence of association. This component computes no evidence of
// its own — it never reads a lead's own `discoveryTag`/`uri` to guess a
// match, and never imports `application/
// DecentralizedWorldEncounterLeadAssociationEvidenceIngress.js` or `core/
// DecentralizedPublicationLocationClaim.js`. A caller already holding real
// evidence supplies it via this prop; an empty array (the default) means
// every lead resolution honestly reports `UNAVAILABLE`, exactly the
// conservative starting point 0.9.28 itself already documents.
//
// `resolvedLead` MIRRORS `resolvedEncounterSelection` EXACTLY, ONE LAYER
// OVER, FOR LEADS INSTEAD OF SOURCES. Automatic when
// `decentralizedLeadOutcome.status` is already `'RESOLVED'`; the Wanderer's
// own explicit `chooseDecentralizedLead()` pick when `'AMBIGUOUS'` AND that
// choice still names one of `decentralizedLeadOutcome`'s own CURRENT
// candidates (re-checked on every read, never trusted blindly — a chosen
// lead can itself disappear from the registry between the click and now);
// `null` in every other case. This component never calls `.find()`, never
// reads `candidates[0]` as an implicit default, and never invents a rule
// preferring one storage backend, one discovery service, or one URI over
// another — see 0.9.28's own header, "three statuses, never a ranking
// between them," held here unchanged.
//
// A RESOLVED LEAD IS THE ROUTING DECISION, NOT AN OVERRIDE THIS COMPONENT
// ITSELF DEBATES. Per `application/
// DecentralizedWorldEncounterLeadAwareMaterialLoading.js`'s own header,
// "calling this function at all is the routing decision" —
// `inspectWorldEncounterMaterial()` already routes purely by whether a
// `resolvedLead` was supplied, never by reading `resolvedSelection.origin`.
// This component holds that same restraint rather than re-deciding it: once
// `resolvedLead` is non-null (automatically for a `RESOLVED` outcome, or by
// the Wanderer's own explicit pick for an `AMBIGUOUS` one), it is forwarded
// to `refreshMaterialInspection()` unconditionally — there is no third,
// separate "use decentralized instead of local/peer" toggle in this
// milestone, because 0.9.28's own resolution already IS that explicit
// decision, made either automatically (an unambiguous lead) or by the
// Wanderer (an ambiguous one), exactly the same two-tier restraint 0.9.20
// already established for local/peer origin selection.
//
// `refreshDecentralizedLeadOutcome()` IS THE ONE PLACE
// `decentralizedLeadOutcome` IS EVER WRITTEN — NEVER A COMPUTED. Exactly
// like `selectionOutcome` (0.9.20), this cannot be a plain Vue `computed`:
// it depends on `this.worldDiscoveryLeadRegistry`'s own current
// `listLeads()` snapshot, a bare class instance Vue's reactivity system
// cannot track. Called from the tail of `selectEncounter()` (a fresh
// selection) and from the lead registry's own change listener (a lead
// coming or going while a selection stays open) — a second, independent
// subscription in `mounted()`/`beforeUnmount()`, alongside the existing
// `registry` one, mirroring its exact shape.
//
// `resolvedLeadChoice` IS RESET ON EVERY NEW SELECTION, EXACTLY LIKE
// `resolvedSelectionChoice` ALREADY IS. `selectEncounter()` clears it to
// `null` alongside `resolvedSelectionChoice` — a lead chosen for one
// encounter never silently carries over to the next one selected.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Deriving association evidence from anything this component can see**
//   (a lead's own `discoveryTag`/`uri`, a signed publication, a Nostr
//   envelope). See "decentralizedLeadAssociations is the caller's own
//   evidence," above — a caller assembles that array elsewhere, via
//   already-existing 0.9.29/0.9.32 machinery, and hands it here unchanged.
// - **Querying a discovery service, subscribing to a relay, or fetching a
//   lead's own `uri` from within this component.** This component only
//   ever reads an already-populated `worldDiscoveryLeadRegistry`'s current
//   snapshot — it never calls `queryDecentralizedWorldDiscovery()`,
//   `application/DecentralizedWorldDiscoveryQueryRegistryBridge.js`, or any
//   relay/gateway client, directly or indirectly.
// - **A default `worldDiscoveryLeadRegistry`, or constructing
//   `DecentralizedWorldDiscoveryLeadRegistry`/`DecentralizedWorldEncounterMaterialSource`
//   of its own.** Both stay caller-injected, exactly like `registry`/
//   `materialSources` already are.
// - **Cryptographic signature verification, content-reference/hash
//   correspondence, or any change to `application/
//   WorldEncounterMaterialVerification.js`.** Unaffected by this milestone —
//   separate, later, unscheduled work (0.9.41).
// - **A third "material path" chooser distinguishing local/peer from
//   decentralized when both happen to be available.** See "a resolved lead
//   is the routing decision," above — this milestone holds
//   `inspectWorldEncounterMaterial()`'s own existing routing restraint
//   rather than adding a second one in front of it.
// - **Persisting `decentralizedLeadOutcome`, `resolvedLeadChoice`, or
//   anything else this milestone adds, beyond this component's own mount.**
//   Both live and die with this component instance, exactly like
//   `selectionOutcome`/`materialInspection` already do.
// 0.9.100 — Publication Distribution Observation.
//
// `application/PublicationDistributionLifecycle.js` (0.9.50) through
// `application/PublicationDistributionLifecycleStore.js` (0.9.52/0.9.53)
// already built a complete, independently-tested distribution lifecycle —
// a two-dimensional `{ material: { state }, discovery: { state } }`
// description, kept live in a `PublicationDistributionLifecycleMemoryStore`
// a caller can `subscribe()` to. This component becomes another such
// caller, exactly the way it already is one of
// `WorldDiscoverySourceRegistry.subscribe()` (0.9.13) and
// `DecentralizedWorldDiscoveryLeadRegistry.subscribe()` (0.9.40).
//
//   distributionLifecycleStore (injected, 0.9.100 ★)
//        │
//        │ .get(publicationId)  +  .subscribe(publicationId, listener)
//        ▼
//   distributionLifecycle = { material: { state }, discovery: { state } }
//        │
//        ▼
//   this component's own "Distribution" panel
//   ( {{ distributionMaterialState }} / {{ distributionDiscoveryState }} )
//
// OBSERVATION ONLY, NEVER EXECUTION. This component never imports
// `PublicationDistributionOrchestrator.js`, `...RuntimeComposition.js`,
// `...Executor.js`, `ArweavePublicationMaterialUploader.js`, or
// `NostrPublicationDiscoveryPublisher.js` — it has no "distribute" action
// of its own, and constructs neither an Arweave uploader nor a Nostr
// publisher. Composing the runtime that actually PRODUCES a distribution
// result stays entirely `ui/main.js`'s own, separate, unscheduled concern —
// wiring an actual distribute command is a future, unscheduled interaction
// milestone, not this one.
//
// NO SECOND LIFECYCLE, NO POLLING. `refreshDistributionLifecycle()` never
// calls `describePublicationDistributionLifecycle()`,
// `transitionPublicationDistributionLifecycle()`, or constructs a
// `PublicationDistributionLifecycleMemoryStore` of its own — it only reads
// and subscribes to the ONE store `ui/main.js` composes and injects. There
// is no `setInterval()` anywhere in this addition; `distributionLifecycle`
// changes only in reaction to a real store notification, or a fresh
// selection.
//
// NO NEW VOCABULARY. `distributionMaterialState`/`distributionDiscoveryState`
// are exactly `PublicationDistributionState.ABSENT`/`.PRESENT` — the two
// values `PublicationDistributionLifecycle.js` (0.9.50) already defines.
// No TRUSTED/PUBLISHED/POPULAR/SUCCESSFUL/ONLINE/DECENTRALIZED status is
// invented at this layer.
//
// 0.9.104 — World View Publication Distribution Action.
//
// 0.9.100 gave this component OBSERVATION of a Publication's own
// distribution lifecycle; 0.9.103 then built the one thing missing to
// actually PRODUCE a fresh one — `executePublicationDistributionCommand()`
// — and stopped deliberately short of any UI trigger, naming it as
// separate, later, unscheduled work. This milestone is that trigger, and
// nothing more:
//
//   distributablePublication (this component's own, below)
//        │
//        │ click "Distribute Publication"
//        ▼
//   distributeSelectedPublication()
//        │
//        ▼
//   distributionCommand(publication)   (injected, 0.9.104 ★)
//        │
//        ▼
//   Promise<PublicationDistributionResult | null>  (or a rejection)
//        │
//        ▼
//   (recorded into distributionLifecycleStore by whatever
//    distributionCommand itself already is — this component never
//    touches the store directly)
//        │
//        ▼
//   distributionLifecycle (0.9.100's own subscription, unmodified)
//        │
//        ▼
//   the SAME Distribution panel already rendering Material/Discovery
//
// `distributionCommand` IS THE ENTIRE REQUEST-BUILDING BOUNDARY — THIS
// COMPONENT SUPPLIES NOTHING BUT THE PUBLICATION ITSELF. A caller injects
// a single function, `(publication) -> Promise<PublicationDistributionResult
// | null>`, exactly the way `materialSources`/`materialVerifier`/
// `distributionLifecycleStore` are already caller-injected. This component
// never decides what `serializedMaterial` is, never chooses a
// `materialStorage` tag, and never supplies `arweaveUploaderOptions`/
// `nostrPublisherOptions` — deciding what "the material" consists of, and
// which signer/relay configuration to distribute it through, stays
// entirely the injected function's own concern (in the real running app,
// `ui/views/WorldView.js`'s own thin wrapper around the app-wide
// `publicationDistributionCommand`, 0.9.103). `null` by default: a mount
// with no `distributionCommand` supplied renders no action at all — the
// same "no collaborator, no capability" restraint every other optional
// prop on this component already holds.
//
// `distributablePublication` IS THE SAME `Publication` DOMAIN OBJECT
// 0.9.39's OWN MATERIAL INSPECTION ALREADY LOADED — NEVER A SECOND FETCH.
// This component already loads the actual signed `Publication` for a
// resolved, local-origin PUBLICATION selection via `materialInspection.
// loading.material` (0.9.21/0.9.22/0.9.39); the one thing genuinely new
// here is reading that same value for a second purpose. No new material
// source, no new load, no new request is introduced — a selection whose
// material hasn't (or can't) load AVAILABLE simply has no distributable
// publication, and the action stays disabled, exactly the same
// "unavailable, never guessed" restraint 0.9.20's/0.9.39's own headers
// already hold one layer over.
//
// EXECUTION IS EPHEMERAL UI STATE — NEVER A THIRD LIFECYCLE VALUE.
// `distributionExecuting`/`distributionError` are page-local `data()`
// fields, exactly like `wandererPosition`/`selectedEncounter` — an
// idle -> executing -> idle transition this component owns purely to
// disable the button while a call is in flight and to hold a plain-text
// notice for a genuine rejection. Neither is ever written into
// `PublicationDistributionLifecycle.js`'s own vocabulary
// (`ABSENT`/`PRESENT`); this milestone introduces no `INITIATED`/
// `RUNNING`/`COMPLETED`/`FAILED` state anywhere, in this file or any
// collaborator it calls. A resolved call is never turned into a
// fabricated "success" fact here — the Distribution panel's own
// `distributionMaterialState`/`distributionDiscoveryState` (0.9.100,
// unmodified) remain the only place a completed distribution's own facts
// are ever shown, observed entirely through the existing subscription,
// never written by this milestone's own click handler.
//
// A GENUINE REJECTION (OR A SYNCHRONOUS CONSTRUCTION THROW) BECOMES ONE
// PLAIN NOTICE — NEVER A RECLASSIFIED DOMAIN RESULT. `distributeSelectedPublication()`
// wraps the call in `Promise.resolve().then(...)` specifically so a
// SYNCHRONOUS throw (e.g. `distributionCommand`'s own collaborator
// rejecting malformed signer/relay configuration before ever returning a
// promise — see `application/PublicationDistributionCommand.js`'s own
// "synchronous validation, synchronous throw") is caught exactly the same
// way as an asynchronous rejection would be. Either becomes the same
// generic `distributionError` text; this component never inspects an
// error's own message, `name`, or any other field to decide a more
// specific notice — doing so would mean interpreting a domain failure the
// UI has no business classifying.
//
// A `distributionRequestId` COUNTER GUARDS AGAINST A STALE RESPONSE —
// MIRRORING `materialInspectionRequestId` (0.9.39) EXACTLY, ONE LAYER
// OVER. Switching the selected encounter, or unmounting, bumps the
// counter so a still-in-flight call's own eventual resolution/rejection
// never writes `distributionExecuting`/`distributionError` for a
// selection (or a component instance) that has since moved on. This is
// purely a last-response-wins correctness guard, never a cache and never
// a retry.
//
// REPEATED CLICKS NEVER START A SECOND, OVERLAPPING CALL. The action is
// disabled (`:disabled="!distributablePublication || distributionExecuting"`)
// the moment a call starts, and `distributeSelectedPublication()` itself
// re-checks `distributionExecuting` before ever calling
// `distributionCommand` — the same double guard (template `:disabled`
// plus a method-level check) this codebase already uses nowhere else
// because nothing else in this file was ever a fire-and-forget async
// action a Wanderer could double-click.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Constructing an Arweave client, a Nostr client, or calling
//   `orchestratePublicationDistribution()`/`executePublicationDistribution()`
//   directly.** This component imports none of them, and calls exactly
//   one function it was handed: `distributionCommand`.
//   `PublicationDistributionCommand.js`, `PublicationDistributionOrchestrator.js`,
//   `PublicationDistributionExecutor.js`, `PublicationDistributionRuntimeComposition.js`,
//   `ArweavePublicationMaterialUploader.js`, and
//   `NostrPublicationDiscoveryPublisher.js` remain unimported here, exactly
//   as they already were before this milestone.
// - **Manipulating `distributionLifecycleStore` directly, or transitioning
//   lifecycle state of any kind.** This component still never calls
//   `.set()`, `describePublicationDistributionLifecycle()`, or
//   `transitionPublicationDistributionLifecycle()` — whatever
//   `distributionCommand` itself already does to the store (0.9.103,
//   unmodified) is the only way a fresh fact ever reaches it.
// - **Deciding distribution success or failure.** A resolved
//   `distributionCommand` call is never inspected for
//   `result.material`/`result.discovery` by this component — the existing
//   Distribution panel's own live subscription is the only place that
//   ever renders what actually happened.
// - **Retry, cancel, progress percentage, distribution history, a
//   transaction explorer, a relay browser, relay selection, wallet/signer
//   UI, or any distribution-configuration UI.** None of those exist
//   anywhere in this file; a rejected call surfaces exactly one plain
//   notice and returns the action to idle.
// - **A second selection concept, or gating the action on anything beyond
//   the CURRENT `selectedEncounter`/`materialInspection` this component
//   already tracks.** No new page-local selection state is introduced.
// 0.9.111 — World View Decentralized Publication Retrieval.
//
// 0.9.110 gave this component a live `worldDiscoveryLeadRegistry` and gave
// `ui/main.js` a real, composed `discoverWorldEncounterPublicationCommand`
// — but that command lived only in `ui/views/WorldView.js`'s own page-local
// state, rendering its own ad-hoc "Resolution: …" / "Loading: …" text
// instead of the SAME Material/Verification panel this component already
// renders for a selection-driven `materialInspection` (0.9.39). This
// milestone is that convergence:
//
//   discoveryCommand({ objectId, discoveryTag })   (caller-injected, 0.9.111)
//                  │
//                  ▼
//   discoveryResult = { discovery, resolution, inspection }   ★ (THIS)
//                  │
//        ┌─────────┴──────────┐
//        ▼                    ▼
//   resolution.status    inspection (only when RESOLVED — 0.9.110's own
//   rendered as its       restraint, unchanged)
//   own existing               │
//   vocabulary                 ▼
//   (UNAVAILABLE/          THE SAME "Material"/"Verification" `<dl>`
//   RESOLVED/AMBIGUOUS,    markup (identical CSS classes, identical
//   0.9.28, unchanged)     `loading.status`/`verification.status` fields)
//                          this component already renders for a
//                          SELECTION-driven `materialInspection`, below —
//                          see "the existing inspection mechanism stays
//                          canonical," below.
//
// A DISCOVERED PUBLICATION IS NEVER A MARKER, NEVER A `selectedEncounter`,
// AND NEVER FORCED INTO ONE. Everything else this component already knows
// how to inspect (`selectedEncounterInspection`, `selectionOutcome`,
// `decentralizedLeadOutcome`, `materialInspection`) is reached by clicking
// a marker `effectiveView` already projects — a purely decentralized-
// discovered Publication has no such marker (it isn't part of any
// currently-known World source at all; that is the entire reason discovery
// exists). Rather than fabricate a fake `selectedEncounter`/`view` entry to
// route it through that machinery, this milestone adds one small,
// independent, ADDITIVE panel — `discoveryResult`, driven by its own
// `discoverPublication()` action — that exists entirely alongside
// `selectedEncounter`/`materialInspection`, never in place of them. See
// "local/decentralized separation," below.
//
// THE EXISTING INSPECTION MECHANISM STAYS CANONICAL — NO SECOND
// REPRESENTATION. The template block below reuses the EXACT `world-encounter-material-title`/
// `world-encounter-material-detail`/`world-encounter-verification-title`/
// `world-encounter-verification-detail` CSS classes and `<dl>` shape the
// selection-driven Material/Verification panel (0.9.39) already renders —
// same two fields (`loading.status`, `verification.status`), same literal
// status vocabulary, no new trust word of any kind. This is deliberately a
// second RENDERING of the same shape against a second, independent data
// source — never a second `inspectWorldEncounterMaterial()` call, and never
// a fork of that panel's own markup into something visually different.
//
// `discoveryCommand` IS THE ONE NEW COLLABORATOR THIS MILESTONE INTRODUCES
// — A PLAIN INJECTED FUNCTION, MIRRORING `distributionCommand` (0.9.104)
// EXACTLY. `({ objectId, discoveryTag }) -> Promise<{ discovery, resolution,
// inspection }>`, `null` by default. This component never constructs a
// discovery service, a lead registry, a material source, or a verifier
// itself — it calls exactly the one function it was handed, exactly once
// per click, and renders exactly what that call resolves to. In the real
// running app this is `ui/main.js`'s own composed
// `discoverWorldEncounterPublicationCommand` (0.9.111,
// `application/DiscoverWorldEncounterPublicationCommandComposition.js`),
// forwarded by `ui/views/WorldView.js` verbatim — no wrapper, no added
// field, unlike `distributionCommand`'s own `serializedMaterial` addition,
// because `discoverWorldEncounterPublicationCommand`'s own `{ objectId,
// discoveryTag }` shape is already everything a caller needs to supply.
//
// EPHEMERAL UI STATE ONLY — MIRRORING `distributionExecuting`/
// `distributionError`/`distributionRequestId` (0.9.104) EXACTLY, ONE LAYER
// OVER. `discoveryObjectId`/`discoveryTag` are the Wanderer's own typed
// input; `discovering`/`discoveryError`/`discoveryResult`/`discoveryRequestId`
// track an idle -> discovering -> idle transition and hold the plain result
// to render. None of it is persisted, and none of it is written into any
// lifecycle vocabulary — a rejected or malformed call surfaces one plain
// notice via `discoveryError`, exactly like `distributionError` already
// does. `discoveryRequestId` guards a still-in-flight call's own eventual
// resolution from overwriting a NEWER click's own result or from writing
// into an unmounted component — the same "a request counter guards against
// a stale response" restraint `materialInspectionRequestId`/
// `distributionRequestId` already hold, applied here a third time.
//
// LOCAL/DECENTRALIZED SEPARATION — `discoveryResult` NEVER TOUCHES
// `materialInspection`, `selectedEncounter`, OR ANY LOCAL MATERIAL SOURCE.
// `discoverPublication()` writes only `discoveryResult` (and the ephemeral
// `discovering`/`discoveryError` fields); it never assigns to
// `materialInspection`, never calls `selectEncounter()`, and never touches
// `materialSources`/`materialVerifier` directly. A discovered Publication
// therefore never overwrites or masquerades as this replica's own locally
// stored evidence — the two stay two independent facts, rendered in two
// independent panels, exactly the way `materialSources.local` and
// `materialSources.decentralized` already stay two independent entries
// inside `composeWorldEncounterMaterialSources()` (0.9.36, unmodified) one
// layer down.
//
// NO DUPLICATE FETCHING. `discoverPublication()` calls `discoveryCommand`
// exactly once per click; this component never calls
// `inspectWorldEncounterMaterial()` a second time for the SAME discovered
// material afterward — `discoveryResult.inspection`, when present, is
// already the complete, already-loaded-and-verified result 0.9.110's own
// runtime produced in that one call. The template renders it directly; no
// method in this file re-derives, re-loads, or re-verifies it.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A second inspection panel, a new decentralized publication viewer, or
//   any new trust/status vocabulary.** See "the existing inspection
//   mechanism stays canonical," above.
// - **Constructing discovery infrastructure, a lead registry, or a
//   verifier.** This component calls exactly one caller-injected function —
//   see "discoveryCommand is the one new collaborator," above.
// - **Turning a discovered lead into a `selectedEncounter`, a marker, or an
//   entry in `effectiveView`.** See "a discovered Publication is never a
//   marker," above.
// - **Ranking, retry, caching, or background/automatic discovery.**
//   `discoverPublication()` runs once per click and returns; there is no
//   timer and no cache anywhere in this addition.
// - **Persisting `discoveryObjectId`/`discoveryTag`/`discoveryResult`, or
//   anything else this milestone adds, beyond this component's own mount.**
//   All of it lives and dies with this component instance, exactly like
//   `selectedEncounter`/`materialInspection` already do.
//
// 0.9.357 — Wire Canonical Publication Discovery Tag into World View.
//
// 0.9.356's own audit (`tests/PublicationDiscoveryTagUXConsistencyAudit.test.js`)
// found `discoveryTag`'s own blank default, above, to be a real UX gap: the
// application already owns the exact campaign tag (`ui/main.js`'s own
// `'forkbuild-publication'`) a same-app Publication would have been
// announced under, but never offered it to this input. The new
// `defaultDiscoveryTag` prop, above, seeds `discoveryTag`'s own initial
// value with it — ONE assignment, in `data()`, nothing more.
//
// NEVER BAKED INTO `discoveryCommand` ITSELF, AND NEVER A SECOND LITERAL.
// The canonical tag remains defined exactly once, in `ui/main.js`; this
// component only ever reads it through `defaultDiscoveryTag`, exactly the
// way `discoveryCommand` itself already arrives as a caller-injected
// collaborator rather than something this component constructs. Baking the
// tag into the command's own closure (mirroring how Snapshot's own
// `discoverSnapshotCommand` is pre-bound) was considered and rejected —
// see 0.9.356's own Section C: unlike Snapshot's fixed single campaign,
// this field is documented, above, as "the Wanderer's own typed input," a
// genuinely free-form recovery tool a person may need to point at a
// DIFFERENT tag. Baking the value in would remove that capability; seeding
// only the starting value preserves it.
//
// `discoveryTag` REMAINS EXACTLY AS EDITABLE AS BEFORE. `defaultDiscoveryTag`
// is read exactly once, inside `data()`, at construction — never re-read,
// never re-applied, and no code path anywhere in this file resets
// `discoveryTag` back to it. `discoverPublication()` itself, below, is
// completely unmodified: it still reads whatever `discoveryTag` currently
// holds, whether that is the seeded default, an edit, or (with no
// `defaultDiscoveryTag` supplied, e.g. every test constructing this
// component directly) the prior blank string.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any change to `discoverPublication()`, `discoveryCommand`, or any
//   command/composition/query-layer file.** See "never baked into
//   discoveryCommand itself," above — this milestone touches exactly one
//   `data()` field's own initial value.
// - **Hiding the field, disabling it, or any other UX shape.** 0.9.356's
//   own Section I scored this (Option B: prefill, remain editable) as the
//   one recommended shape; nothing else was in scope.
//
// 0.9.112 — Publication Provenance in World View.
//
// 0.9.111 made the selection-driven Material/Verification panel
// (`materialInspection`) and the discovery-driven one (`discoveryResult.
// inspection`) render through the exact same markup — see this file's own
// header, "the existing inspection mechanism stays canonical." That
// convergence left one question unanswered for a Wanderer looking at
// either panel: where did THIS inspected material come from? This
// milestone adds exactly that one small fact — `application/
// PublicationMaterialProvenance.js`'s own `{ origin: 'LOCAL' |
// 'DECENTRALIZED' }` — rendered as one new "Source" row alongside the
// existing Material/Verification rows in both panels, never a new panel of
// its own.
//
//   materialInspection            discoveryResult.inspection
//   (selection-driven, 0.9.39)    (discovery-driven, 0.9.111)
//         │                              │
//         ▼                              ▼
//   materialProvenance             discoveryResult.provenance
//   (THIS milestone — computed,     (THIS milestone — already
//    derived here)                   computed by 0.9.110's own
//         │                          runtime composition, forwarded
//         │                          verbatim, never re-derived here)
//         ▼                              ▼
//   "Source" row, selection panel   "Source" row, discovery panel
//
// `materialProvenance` IS A COMPUTED, DERIVED FROM `materialInspection`
// ALONE — NEVER A NEW PAGE-LOCAL DATA FIELD. Exactly like
// `selectedEncounterInspection` (0.9.18), this needs no field of its own
// in `data()`: it is a pure function of state this component already
// tracks, recomputed automatically whenever `materialInspection` itself
// changes. This component never writes an `origin` onto `materialInspection`
// itself, and never mutates the `Publication`/material it names — see
// `application/PublicationMaterialProvenance.js`'s own header, "never
// mutates the underlying inspection/material/Publication."
//
// `discoveryResult.provenance` IS RENDERED VERBATIM, NEVER RE-DERIVED HERE.
// Unlike `materialProvenance`, this component computes nothing for the
// discovery panel's own Source row — `discoverWorldEncounterPublicationCommand()`'s
// own result already carries a `provenance` field (0.9.110's own runtime
// composition, 0.9.112), forwarded through 0.9.111's own command boundary
// unchanged. Calling `describePublicationMaterialProvenanceFromInspection()`
// a second time on `discoveryResult.inspection` here would be a redundant,
// pointless recomputation of a fact the caller already handed over — this
// file reads `discoveryResult.provenance.origin` directly, exactly the same
// "never a second orchestrator" restraint 0.9.111's own header already
// holds for `discoveryResult.inspection`.
//
// SOURCE NEVER REPLACES DISCOVERY, MATERIAL, OR VERIFICATION — ALL FOUR
// FACTS RENDER SIDE BY SIDE. The "Choose Source"/"Source: local" panel
// 0.9.20 already renders (`selectionOutcome`) answers "which
// WorldDiscoverySource offered this encounter?" — an entirely different
// question from "which loading boundary produced the material a Wanderer
// is currently looking at?" this milestone's own "Source" row answers. Both
// coexist unchanged; this milestone renames nothing and removes nothing.
//
// NO PROVENANCE ROW WHEN THERE IS NO MATERIAL TO REPORT PROVENANCE FOR.
// `materialProvenance` is `null` whenever `materialInspection` itself is
// `null` (see `describePublicationMaterialProvenanceFromInspection()`'s own
// "no material, no provenance"); the template's own `v-if="materialProvenance"`
// simply renders nothing in that case, exactly the same restraint every
// other optional row in these panels already holds.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A trust score, source ranking, "preferred source," or any styling
//   implying one origin is better than the other.** See `application/
//   PublicationMaterialProvenance.js`'s own header, "this is not a trust
//   state."
// - **A third origin value, or any per-service (Arweave vs. Nostr)
//   breakout.** `discoveryResult.discovery` already names which services
//   were queried; this milestone adds no second, competing breakdown.
// - **Merging the local and decentralized panels into one, or letting a
//   discovered Publication overwrite `materialInspection`, or vice versa.**
//   Both stay exactly as independent as 0.9.111 already left them — see
//   "local/decentralized separation" in that milestone's own header,
//   unchanged here.
// - **Persisting provenance, or computing it anywhere but freshly, on
//   read, from state this component already tracks.**
//
// 0.9.113 — World View Discovered Publication Selection.
//
// 0.9.111 rendered a discovered, resolved, verified Publication through the
// exact same Material/Verification markup a local selection already uses;
// 0.9.112 then let a Wanderer see WHERE that material came from. Neither
// milestone let a Wanderer actually DO anything with a discovered
// Publication beyond looking at it — `discoveryResult` stayed a read-only
// snapshot of the Discover Publication panel's own most recent search,
// never something a Wanderer could explicitly pick as "the Publication I
// want to work with next." This milestone is exactly that one small,
// additive interaction fact:
//
//   discoveryResult                      (0.9.111, unchanged)
//         │
//         │ Wanderer clicks "Select Publication"
//         ▼
//   selectDiscoveredPublication()   ★ (THIS milestone)
//         │
//         ▼
//   selectedDiscoveredPublication = discoveryResult   (verbatim, same reference)
//
// A SELECTION INTENT, NOT A NEW PUBLICATION STATE. Selecting never mutates
// `discoveryResult`, the `Publication`/material it names, or any lifecycle
// vocabulary — it is a plain interaction fact, the Wanderer's own explicit
// pick among what discovery already returned. This mirrors
// `selectEncounter()`'s own restraint (0.9.4) one concept over: no lookup,
// no join, no re-derivation of any kind.
//
// NEVER REPLACES `selectedEncounter`, `resolvedEncounterSelection`, OR
// `materialInspection`. Those name a spatial/World Encounter selection and
// its own locally-loaded material — a different interaction idiom this
// milestone does not read from and does not write to.
// `selectedDiscoveredPublication` is a THIRD, independent selection
// concept, existing alongside the other two, never merged with either —
// see 0.9.111's own header, "local/decentralized separation," held here
// once more, one layer over. `selectEncounter()` is not touched by this
// milestone at all, and never resets `selectedDiscoveredPublication`.
//
// `selectedDiscoveredPublication` IS `discoveryResult` ITSELF, VERBATIM —
// NEVER A RESHAPED OR RE-COMPUTED COPY. `selectDiscoveredPublication()`
// stores the exact same `{ discovery, resolution, inspection, provenance }`
// reference `discoverPublication()` (0.9.111) already wrote into
// `discoveryResult`. It never re-derives provenance, never re-inspects
// material, and never fabricates a shape a caller would have to learn
// separately from `discoveryResult`'s own already-established one.
//
// ONLY A VERIFIED DISCOVERY RESULT IS SELECTABLE — AN EXPLICIT RULE, NEVER
// A SILENT DEFAULT. `isDiscoveredPublicationSelectable` requires
// `discoveryResult.inspection.verification.status === 'VERIFIED'` — a
// `REJECTED`/`UNVERIFIABLE` verification, or no inspection at all (an
// `UNAVAILABLE`/`AMBIGUOUS` resolution never produces one, per 0.9.110's
// own restraint), is never selectable. `selectDiscoveredPublication()`
// re-checks this same rule itself before ever writing
// `selectedDiscoveredPublication` — the "Select Publication" button being
// hidden otherwise is a rendering convenience, never the only enforcement
// of this rule. "Selection" means "the Publication I intend to work
// with," and this codebase never lets a Wanderer intend to work with
// material that actively failed verification.
//
// SELECTING NEVER TRIGGERS DISTRIBUTION, NEVER FEEDS A LOCAL SELECTION, AND
// NEVER RUNS A SECOND DISCOVERY. `selectDiscoveredPublication()` writes
// exactly one field and returns; it calls no `distributionCommand`, no
// `discoveryCommand`, and no `inspectWorldEncounterMaterial()` a second
// time. Consuming `selectedDiscoveredPublication` for a later distribution
// (or any other purpose) is explicitly separate, later, unscheduled work —
// this milestone establishes the selection fact alone.
//
// NO APPLICATION-LAYER COMMAND — SELECTION IS EPHEMERAL UI STATE WITH NO
// APPLICATION DECISION BEHIND IT YET. Unlike `distributionCommand`/
// `discoveryCommand` (both real, caller-injected boundaries fronting an
// actual network/runtime action this component has no business performing
// itself), this milestone introduces no
// `application/SelectDiscoveredPublicationCommand.js` and no new prop:
// there is nothing yet for such a command to decide or forward to.
// `distributablePublication` (0.9.104) is the precedent, one layer over: a
// plain computed/method pair, entirely inside this component, is already
// this codebase's convention for a UI-local eligibility rule with no
// application collaborator behind it. A future milestone that gives
// `selectedDiscoveredPublication` a real consumer (distribution, most
// plausibly) is the moment such a boundary would earn its own file — not
// before.
//
// `selectedDiscoveredPublication` NEVER AUTO-RESETS. Starting a new
// `discoverPublication()` search overwrites `discoveryResult` (0.9.111,
// unchanged) but never touches `selectedDiscoveredPublication`; selecting a
// different World Encounter marker (`selectEncounter()`) never touches it
// either. A Wanderer's earlier explicit pick stays exactly what it was
// until a future, unscheduled milestone gives this component an actual
// reason to clear it — there is no hidden "the newest thing found is
// implicitly what's selected" behavior anywhere in this file.
//
// EPHEMERAL, PAGE-LOCAL UI STATE ONLY — NEVER PERSISTED. Exactly like
// `selectedEncounter`/`discoveryResult` already are:
// `selectedDiscoveredPublication` lives in this component's own `data()`,
// is written by exactly one method, and is never written to a
// `StorageProvider` or restored on mount. A page reload starts with
// `selectedDiscoveredPublication` back at `null`, even immediately after a
// selection was made.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Consuming `selectedDiscoveredPublication` for distribution, or any
//   other operation.** See "selecting never triggers distribution," above
//   — a future, unscheduled milestone decides whether/how to wire this in.
// - **Merging `selectedDiscoveredPublication` with `selectedEncounter` or
//   `resolvedEncounterSelection` into one selection concept.** See "never
//   replaces selectedEncounter," above.
// - **A trust/rank/preference judgment favoring a selected Publication
//   over an unselected one, beyond the plain VERIFIED eligibility rule.**
//   See "only a VERIFIED discovery result is selectable," above.
// - **Discovery history, multiple simultaneous selections, or an automatic
//   selection of any kind.** Exactly one `selectedDiscoveredPublication`
//   value exists at a time, written only by an explicit Wanderer click —
//   never by `discoverPublication()` itself.
// - **Persisting the selection across a reload, or any `StorageProvider`
//   write of any kind.** See "ephemeral, page-local UI state only," above.
// - **An application-layer `SelectDiscoveredPublicationCommand`.** See "no
//   application-layer command," above.

// 0.9.360 — Relocate Publication Discovery to a Secondary Diagnostic Surface.
//
// 0.9.359's own audit (`tests/WorldViewMainScreenClutterProductAudit.test.js`)
// found exactly one genuine main-screen clutter problem among three named
// candidates: the Discover Publication panel immediately below is a
// standing, selection-independent manual lookup, rendered by default
// (EXPLORE mode, expanded "World Encounters") for every Wanderer, for a
// capability nothing in ordinary navigation or Publication interaction ever
// requires (0.9.359's own Section B1-B3). Snapshot Distribution and Content
// Comparison were independently audited and scored NOT_A_CLUTTER_PROBLEM/
// KEEP — neither is touched by this milestone; see that audit's own
// Decision Matrix and Section H, "artificial-symmetry check."
//
//   click "Publication Discovery"
//           │
//           ▼
//   publicationDiscoveryOpen = true   (NEW, below — a plain boolean,
//                                       nothing else)
//           │
//           ▼
//   the EXACT SAME Discover Publication panel (0.9.111-0.9.113, 0.9.357,
//   byte-for-byte unmoved below) now renders inside a
//   `.modal-overlay`/`.modal-panel` popup instead of inline on the
//   standing "World Encounters" surface
//
// A PRESENTATION GROUPING, NEVER A NEW DIAGNOSTIC SUBSYSTEM — the identical
// restraint `ui/components/OwnPublicationPanel.js`'s own 0.9.324 "Diagnostic
// Tools Surface" already proved safe for a different manual/recovery
// pipeline. No command, prop, data field, method, or disabled/result
// binding changed for any part of the moved panel: `discoveryCommand`,
// `defaultDiscoveryTag`, `discoveryObjectId`/`discoveryTag`/`discovering`/
// `discoveryError`/`discoveryResult`/`discoveryRequestId`,
// `discoverPublication()`, `isDiscoveredPublicationSelectable`,
// `selectDiscoveredPublication()`, and `selectedDiscoveredPublication` are
// all untouched below — every `v-if`, `:disabled`, `@click`, and result
// `<dl>` inside the panel is IDENTICAL text to what 0.9.111-0.9.113/0.9.357
// already wrote, merely indented one level deeper inside the new overlay.
//
// WHY NOT THE EXISTING DIAGNOSTIC TOOLS SURFACE. 0.9.359's own "what comes
// after" explicitly asked this milestone to check whether
// `OwnPublicationPanel.js`'s own 0.9.324 "Diagnostic Tools" popup could host
// this control before building a second one. It cannot, on the same
// criterion 0.9.324 itself already used to decide what belongs inside it —
// "does the existing surface already mean manual/advanced inspection and
// recovery actions," never "can we technically put this button there":
//   - It lives in a DIFFERENT component (`OwnPublicationPanel`, always
//     mounted, independent of primaryMode) than Discover Publication
//     (`WorldEncounterCanvas`, mounted only inside EXPLORE mode's "World
//     Encounters" section). Hosting it there would mean moving
//     `discoveryCommand`/`defaultDiscoveryTag` across a component boundary
//     and re-wiring `ui/views/WorldView.js`'s own bindings — a structural
//     change, never the pure presentation grouping this milestone is
//     scoped to.
//   - Its own stated scope is narrower than "diagnostics in general": a
//     Wanderer's OWN Snapshot candidate discover/resolve/materialize
//     recovery pipeline, the manual counterpart to `application/
//     AutomaticSnapshotEncounterCascade.js`'s own background cascade — see
//     that popup's own 0.9.324 header, "valuable precisely because it
//     exposes individual stages... not because it belongs beside ordinary
//     World View actions." Discover Publication looks up ANY Publication by
//     objectId/discoveryTag, entirely independent of "my own Snapshot" —
//     folding it into "my own Publication's recovery tools" would be
//     exactly the kind of semantically-misleading reuse 0.9.324's own
//     header already rejected for Place Naming, one section over ("no Place
//     Naming section exists in this popup... Place Naming discovery runs
//     automatically with no manual counterpart to relocate").
// This milestone therefore builds the small, dedicated secondary surface
// 0.9.359's own Section C anticipated ("no existing secondary surface... a
// real destination would need building") — local to `WorldEncounterCanvas`,
// never a generic `DiagnosticToolsManager`/shared tool registry of any kind.
//
// `publicationDiscoveryOpen` HAS EXACTLY ONE JOB: showing or hiding the
// popup. It is never read by, and never written from, `discoverPublication()`
// or `selectDiscoveredPublication()`; neither method touches it, and it
// never resets `discoveryObjectId`/`discoveryTag`/`discoveryResult`/
// `selectedDiscoveredPublication`. Closing the popup and reopening it (or
// selecting/deselecting a World Encounter marker while it stays open) shows
// whatever those fields already held — identical to what a Wanderer would
// have seen had the markup never moved. `selectedDiscoveredPublication`'s
// own "never auto-resets" restraint (0.9.113) is unaffected: it does not
// reset when the popup closes either.
//
// GATED ON THE SAME PROP THE PANEL ITSELF ALREADY GATES ON. The trigger
// renders only when `discoveryCommand` is supplied — mirroring, never
// replacing, the panel's own existing `v-if="discoveryCommand"`. A host
// that supplies no `discoveryCommand` sees no trigger and no popup, exactly
// as it saw no Discover Publication panel before this milestone.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any change to `discoverPublication()`, `discoveryCommand`,
//   `defaultDiscoveryTag`, or any command/composition/query-layer file.**
//   This milestone adds one boolean and one popup wrapper around markup
//   that already existed.
// - **Relocating Snapshot Distribution or Content Comparison.** 0.9.359's
//   own Decision Matrix scored both NOT_A_CLUTTER_PROBLEM/KEEP; neither is
//   touched here.
// - **Reusing, merging with, or renaming `OwnPublicationPanel.js`'s own
//   0.9.324 "Diagnostic Tools" popup.** See "why not the existing
//   Diagnostic Tools Surface," above — that popup, and this one, remain two
//   independent, component-local surfaces with two different scopes.
// - **A generic `DiagnosticToolsManager`, shared tool registry, permissions,
//   feature flags, or persisted UI preference of any kind.** This is a
//   presentation change local to one component, not a new subsystem.

// 0.9.138 — World View Snapshot Distribution Action.
//
// 0.9.104 wired the Signed Claim family's own distribution command into
// this component; 0.9.136/0.9.137 separately built a complete, independently
// tested Snapshot distribution command and runtime composition that,
// exactly like 0.9.103's own command before 0.9.104, "reaches no user" —
// see `application/SnapshotDistributionRuntimeComposition.js`'s own
// "Deliberately excluded" list, naming this milestone directly. This
// addition is that seam, one family over, deliberately NOT copying 0.9.104's
// own implementation mechanically — see the two divergences called out
// below.
//
//   distributablePublication (0.9.104's own computed, reused verbatim)
//        │ click "Distribute Snapshot"
//        ▼
//   distributeSelectedSnapshot()
//        │
//        ▼
//   snapshotDistributionCommand(publication)   (injected, 0.9.138 ★)
//        │
//        ▼
//   Promise<{ contentReference, announcement }>  (or a rejection)
//        │
//        ▼
//   snapshotDistributionResult   (stored directly — see divergence 1, below)
//        │
//        ▼
//   the Snapshot Distribution panel's own result display
//
// DIVERGENCE 1 — THIS FAMILY HAS NO LIFECYCLE STORE, SO THIS COMPONENT
// STORES THE RESOLVED RESULT DIRECTLY. 0.9.104's own `distributeSelectedPublication()`
// deliberately discards its own command call's resolved value — see that
// method's own comment, "never inspects a resolved result" — because
// `distributionLifecycleStore`'s own live subscription (0.9.100) is already
// the canonical place that family's own facts surface. `application/
// SnapshotDistributionCommand.js`'s own header is explicit that it
// introduces "no result describer, no new status vocabulary" and no
// lifecycle store of any kind for this family — so there is no second
// channel for `snapshotDistributionResult` to arrive through. This
// component holds the resolved `{ contentReference, announcement }`
// verbatim instead, in page-local, ephemeral `data()` state — never
// persisted, never a lifecycle fact, reset on every fresh selection exactly
// like `distributionError` already is.
//
// DIVERGENCE 2 — A SEPARATE PANEL, NEVER FOLDED INTO THE EXISTING
// DISTRIBUTION PANEL. Signed Claim distribution and Snapshot distribution
// are two different protocols that happen to share some of the same
// physical substrates (Arweave, Nostr) — see `application/
// SnapshotDistributionCommand.js`'s own header, "no coupling to Signed
// Claim distribution," and `docs/Roadmap.md`'s own 0.9.131 entry naming
// the boundary directly. Rendering both under one "Distribution" heading
// would visually imply they are one distribution with two facets; the new
// "Snapshot Distribution" panel stays entirely separate, with its own
// title, its own action, and its own result display, gated on
// `snapshotDistributionCommand` alone — never on `distributionLifecycleStore`.
//
// `distributablePublication` IS REUSED VERBATIM, NEVER RE-DERIVED. Both
// panels distribute the SAME currently selected, local-origin PUBLICATION
// encounter's material — see 0.9.104's own comment on that computed for the
// full eligibility rule. This addition introduces no second selection
// concept and no second "is there something to distribute" check.
//
// EPHEMERAL UI STATE ONLY, DUPLICATE- AND STALE-RESPONSE PROTECTED —
// MIRRORING `distributionExecuting`/`distributionError`/`distributionRequestId`
// (0.9.104) EXACTLY, ONE COLLABORATOR OVER. `distributeSelectedSnapshot()`
// is a no-op while `snapshotDistributionExecuting` is already `true` (see
// this file's own header, "repeated clicks never start a second,
// overlapping call"), and a `snapshotDistributionRequestId` counter,
// bumped on every call and on unmount, guards `snapshotDistributionResult`/
// `snapshotDistributionError`/`snapshotDistributionExecuting` against a
// stale response exactly the way `distributionRequestId` already guards
// its own three fields.
//
// PLAIN NOTICE — NEVER A RECLASSIFIED DOMAIN RESULT. A genuine
// `snapshotDistributionCommand` rejection (or synchronous construction
// throw, e.g. no Arweave wallet installed) becomes the same generic
// `snapshotDistributionError` text every other command failure in this
// file already becomes — this component never inspects an error's own
// message or type. A successfully resolved `{ contentReference,
// announcement: null }` — Arweave placement succeeded, Nostr announcement
// did not — is never treated as an error; see the template's own comment
// on why `announcement: null` renders as "No announcement," not a failure.
//
// NEVER CONSTRUCTS AN ARWEAVE CLIENT, A NOSTR CLIENT, OR CALLS
// `executeSnapshotDistributionCommand()`/`composeSnapshotDistributionRuntime()`
// DIRECTLY. This component calls exactly one thing: the already-composed
// `snapshotDistributionCommand` prop — the same restraint 0.9.104's own
// `distributionCommand` already holds, one collaborator over. This file
// never imports `application/SnapshotDistributionCommand.js`,
// `application/SnapshotDistributionRuntimeComposition.js`, `content/
// ArweaveContentStore.js`, or `application/NostrSnapshotDiscoveryPublisher.js`.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A lifecycle store, persistence, or restoration of any kind for
//   Snapshot distribution results.** See "Divergence 1," above.
// - **Retry, cancel, progress percentage, distribution history, a
//   provider-selection UI, or any distribution-configuration UI.** None of
//   those exist for the Signed Claim family either — see 0.9.104's own
//   identical exclusion, one collaborator over.
// - **Merging this panel with the existing Distribution panel, or any new
//   summary state combining both families' own outcomes.** See
//   "Divergence 2," above.
// - **Consuming `snapshotDistributionResult` for anything beyond display**
//   (e.g. feeding it into a later retrieval/verification action). A
//   future, unscheduled milestone decides whether/how to wire that in.
//
// 0.9.144 — World View Snapshot Attribution Integration.
//
// `OwnPublicationPanel.js` (0.9.142/0.9.144) already reaches "Discover
// Snapshot" + "Snapshot Attribution" for the local user's own current
// Publication, entirely independent of World Encounters. This milestone
// gives this component the SAME "which Publication owns this verified
// Snapshot?" question for a Wanderer-SELECTED encounter instead — the
// second of the two entry points 0.9.144's own design calls for, sharing
// exactly the same application seam, differing only in where `publication`
// comes from:
//
//   distributablePublication (0.9.104's own computed, reused verbatim)
//                  │
//                  │ click "Discover Snapshot"
//                  ▼
//   discoverSelectedSnapshot()
//                  │
//                  ▼
//   discoverSnapshotCommand(publication)   (injected, 0.9.144 ★ — the
//                                            SAME `(publication) -> Promise<{
//                                            outcome, bytes, candidates,
//                                            locator, storage, reason }>`
//                                            function OwnPublicationPanel's
//                                            own `discoverSnapshotCommand`
//                                            prop already is; in the real
//                                            running app, `ui/views/
//                                            WorldView.js`'s own
//                                            `discoverOwnSnapshot()`, bound
//                                            here too)
//                  │
//                  ▼
//   snapshotDiscoveryResult
//                  │
//                  ▼
//   resolveSnapshotPublicationAttribution(publication, snapshotDiscoveryResult)
//   (application/SnapshotPublicationAttribution.js, 0.9.143, unmodified —
//   the identical pure, no-I/O function OwnPublicationPanel.js already
//   calls directly)
//                  │
//                  ▼
//   snapshotAttributionResult
//
// MIRRORS `snapshotDistributionExecuting`/`snapshotDistributionError`/
// `snapshotDistributionResult`/`snapshotDistributionRequestId` (0.9.138)
// EXACTLY, ONE ACTION OVER — its own separate ephemeral state, reset in
// `selectEncounter()` alongside every other selection-scoped field this
// file already resets there, and invalidated on unmount exactly like
// `snapshotDistributionRequestId` already is. `distributablePublication`
// is reused verbatim, never re-derived — the same restraint 0.9.138's own
// `snapshotDistributionCommand` already holds for the identical computed.
//
// `snapshotAttributionResult` IS COMPUTED IMMEDIATELY, IN THE SAME
// `.then()` AS `snapshotDiscoveryResult` ITSELF — mirroring
// `OwnPublicationPanel.js`'s own identical restraint, one surface over.
// This component still never hashes bytes, compares hashes, or interprets
// a resolution outcome itself; `resolveSnapshotPublicationAttribution()`
// does all of that.
//
// A SEPARATE PANEL FROM Snapshot Distribution, NEVER MERGED — mirrors this
// file's own "Divergence 2" restraint (0.9.138) for the identical reason:
// discovering/attributing a Snapshot and distributing one are different
// questions about the same Publication.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A default `discoverSnapshotCommand`, or constructing
//   `DecentralizedSnapshotResolver`/`ArweaveContentStore`/
//   `NostrSnapshotDiscoveryQueryService` of its own.** `null` by default,
//   exactly like every other optional command prop on this component —
//   composing the real capability stays `ui/main.js`'s own concern.
// - **Any trust/ownership/authenticity vocabulary beyond MATCH/NO_MATCH and
//   `DecentralizedSnapshotResolutionOutcome`'s own four failure values,
//   rendered verbatim.** See `application/SnapshotPublicationAttribution.js`'s
//   own header, unrevisited here.
// - **Automatic attribution during Snapshot Distribution, or any change to
//   `distributeSelectedSnapshot()`.** Distribution and discovery/attribution
//   remain independent actions, exactly as 0.9.138 already left them.
//
// 0.9.169 — Material Inspection Refresh Precision.
//
// 0.9.168's own Section E found and proved, without fixing, one genuine
// seam: `refreshSelectionOutcome()` unconditionally tail-called
// `refreshMaterialInspection()` on every one of its own triggers —
// including the registry's own change listener — so a registry mutation
// with nothing to do with the currently selected encounter (an unrelated
// peer joining, an unrelated source leaving) still cost a fresh, redundant
// `materialSources.*.load()` call for whatever stayed selected. This
// milestone closes exactly that seam, and only that seam:
//
//   registry notification
//           │
//           ▼
//   refreshSelectionOutcome()
//           │
//           ├── capture resolvedEncounterSelection BEFORE recomputing
//           │   selectionOutcome
//           │
//           ├── recompute selectionOutcome (unchanged — still the only
//           │   place it is ever written)
//           │
//           ▼
//   did resolvedEncounterSelection (kind/objectId/origin) actually change?
//           │
//     ┌─────┴─────┐
//    YES          NO
//     │            │
//     ▼            ▼
//   refreshMaterialInspection()   (nothing — the previous
//                                  materialInspection is retained as-is)
//
// `resolvedEncounterSelectionsEqual()` IS THE ONE NEW PIECE OF LOGIC THIS
// MILESTONE ADDS — A PLAIN, PURE, FIELD-BY-FIELD COMPARISON, NEVER A NEW
// IDENTITY SYSTEM. It compares exactly the three fields
// `resolvedEncounterSelection` already carries (`kind`, `objectId`,
// `origin`) against their own previous value, treating `null` as its own
// distinct state — the SAME `{ kind, objectId, origin }` shape 0.9.20
// already established, reused verbatim rather than reinvented. This is
// deliberately source-family blind: it never reads `origin` to branch on
// `'local'`/`'peer:'`/`'snapshot:'`, so local, peer, and Snapshot
// selections are all optimized identically, exactly as 0.9.168's own
// Section C capability matrix already required of every other seam in
// this file.
//
// ONLY `refreshSelectionOutcome()`'s OWN TAIL-CALL IS GATED — EVERY OTHER
// TRIGGER OF `refreshMaterialInspection()` IS UNCHANGED. `selectEncounter()`
// (via `refreshSelectionOutcome()`, gated the same way — a fresh selection
// always changes `resolvedEncounterSelection` at least in `objectId`, so it
// always reloads), `chooseSelectionOrigin()`, `chooseDecentralizedLead()`,
// and the `worldDiscoveryLeadRegistry` subscription's own listener
// (`mounted()`) all keep calling `refreshMaterialInspection()`
// unconditionally, exactly as every prior milestone left them — none of
// those is the seam 0.9.168 named, and none of them is touched here.
//
// NO NEW LIFECYCLE STATE, NO CACHE, NO DEDUPLICATION. When
// `resolvedEncounterSelection` has genuinely changed, this component
// still reloads through the exact same `inspectWorldEncounterMaterial()`
// call it always has — nothing here memoizes a load result or skips a
// load that is actually owed. When nothing relevant changed, the previous
// `materialInspection` (and its own already-resolved `loading`/
// `verification` status — `UNAVAILABLE` included) is simply left in place,
// never recomputed into a new value and never replaced with a fabricated
// one.
//
// A SUPPRESSED REFRESH NEVER TOUCHES `materialInspectionRequestId` — SO IT
// CANNOT INVALIDATE AN IN-FLIGHT REQUEST. Because an irrelevant registry
// notification now skips calling `refreshMaterialInspection()` entirely,
// it never bumps `materialInspectionRequestId` either — an in-flight,
// genuinely-relevant material load started just before an unrelated
// mutation arrives is never at risk of having its own eventual response
// discarded by a request-id bump that had nothing to do with it.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any change to `WorldDiscoverySourceRegistry.js`, its own
//   `subscribe()`/notification contract, or a coalesced/event-payload
//   notification of any kind.** The registry stays exactly as coarse a
//   notifier as 0.9.12 already left it; this milestone makes the OBSERVER
//   more selective, never the registry more granular.
// - **A Snapshot-specific branch, Nostr/Arweave vocabulary, or a change to
//   `materializedSnapshotWorldOrigin`/`MaterializedSnapshotWorldDiscoveryBridge.js`.**
//   See "source-family blind," above.
// - **Gating `refreshMaterialInspection()`'s OWN internal behavior**
//   (its `materialInspectionRequestId` guard, its `materialSources`/
//   `resolvedLead` reads). This milestone decides whether to CALL it, not
//   how it behaves once called.
// - **A new `UNAVAILABLE`-adjacent status, a cache, a TTL, or any
//   deduplication/ranking/trust vocabulary.** See "no new lifecycle
//   state," above.
//
// 0.9.182 — World Snapshot Comparison UI.
//
// 0.9.181 built `compareSnapshotWorldPublications(a, b)` and deliberately
// stopped short of any UI, naming exactly the gap this milestone closes:
// "giving a Wanderer a genuine second, independently-held 'compare with'
// selection... would be a new selection-holding mechanism in its own
// right." This milestone adds precisely that second, independent selection
// — never a second copy of the FULL selection-resolution pipeline
// (ambiguity choice, decentralized leads, material loading, distribution —
// none of that is needed to compare two already-known facts).
//
//   selectedEncounter (0.9.4, primary — "Publication A", unchanged)
//        │
//        │  click "Compare with…" -> armedForComparisonSelection = true
//        │  click a second marker -> comparisonEncounter ("Publication B")
//        ▼
//   comparisonSelectionOutcome / comparisonResolvedSelection   ★ (THIS)
//        (mirrors selectionOutcome/resolvedEncounterSelection, 0.9.20 —
//         RESOLVED only; an AMBIGUOUS comparison target has no "Choose
//         Source" panel of its own, see "deliberately excluded," below)
//        │
//        ▼
//   application/WorldEncounterComparisonCandidate.js   (THIS milestone)
//        describeWorldEncounterComparisonCandidate()   × 2 (A and B)
//        │
//        ▼
//   application/WorldSnapshotComparison.js   (0.9.181, unmodified)
//        compareSnapshotWorldPublications(a, b)
//        │
//        ▼
//   worldSnapshotComparisonResult
//        { aPublicationId, bPublicationId, samePublication, contentComparison }
//        null
//
// `armedForComparisonSelection` REUSES THE EXISTING MARKER-CLICK PATH —
// NEVER A SECOND CLICK HANDLER. Per the brief's own "the exact interaction
// should follow whatever selection mechanism already exists rather than
// creating a second selection system": clicking "Compare with…" arms this
// flag; the very next marker click still emits the SAME `select` event
// `selectEncounter()` already handles (0.9.4) — the ONLY new branch is at
// that method's own top, routing to `selectComparisonEncounter()` instead
// of overwriting the primary selection, then immediately un-arming. No new
// component, no new emit, no new template click handler on
// `WorldEncounterMarker` itself.
//
// `worldSnapshotComparisonResult` IS A LIVE COMPUTED, NEVER A CACHED FACT —
// SO IT CAN NEVER DESCRIBE A STALE PAIR. It is `null` whenever
// `comparisonEncounter` itself is `null` (see "no implicit comparison,"
// below); otherwise it is recomputed, from scratch, from whatever
// `selectedEncounter`/`comparisonEncounter` currently resolve to — a
// change to EITHER side (a fresh primary selection, the registry dropping
// one side's source entirely) is reflected on the very next read, exactly
// the same "never a computed cache, always live" discipline
// `resolvedEncounterSelection` (0.9.20) already holds one layer down.
//
// NO IMPLICIT COMPARISON, EVER. Selecting a Publication alone
// (`selectedEncounter` alone) never sets `comparisonEncounter` — that field
// is written by exactly one method, `selectComparisonEncounter()`, called
// only after the Wanderer explicitly clicks "Compare with…" AND then
// explicitly clicks a second marker. A registry notification never writes
// `comparisonEncounter` either (only `comparisonSelectionOutcome`, which
// stays `null` — and therefore contributes nothing — whenever
// `comparisonEncounter` itself is `null`). Material loading
// (`refreshMaterialInspection()`) is entirely untouched by this milestone
// in both directions.
//
// THE COMPARISON CANDIDATES ARE SOURCE-FAMILY AGNOSTIC — NEITHER THIS FILE
// NOR `WorldEncounterComparisonCandidate.js` GATES ON `sourceFamily`. A
// resolved LOCAL, PEER, or SNAPSHOT selection all become a comparison
// candidate the same way; only a SNAPSHOT-sourced one carries a genuinely
// known `contentHash` today (0.9.177's own "not reachable here, yet,
// honestly," unrevisited), so a LOCAL/PEER-involving comparison honestly
// reports `contentComparison: null` ("not knowable") rather than being
// refused outright for crossing families.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **An "AMBIGUOUS" resolution UI for the comparison target.**
//   `comparisonResolvedSelection` mirrors `resolvedEncounterSelection`'s
//   `RESOLVED` case only; an ambiguous second pick simply does not resolve
//   (comparison stays unavailable) rather than gaining its own second
//   "Choose Source" panel — the primary selection already owns that
//   interaction, and duplicating it for a fact-only comparison would be
//   exactly the scope growth 0.9.181's own brief already declined.
// - **Decentralized lead resolution, material loading, verification, or
//   distribution for the comparison target.** None of those are needed to
//   state a content-identity fact; `comparisonEncounter` never feeds
//   `inspectWorldEncounterMaterial()` or any distribution/discovery
//   command.
// - **A side-by-side content viewer.** `worldSnapshotComparisonResult` is
//   rendered as exactly the fact it is — same content / different content
//   / not yet knowable — never a rendering of either Publication's own
//   material.
// - **Deduplication, ranking, or any removal/replacement action offered
//   from the comparison result.** `SAME_CONTENT` is shown as a fact only;
//   nothing here offers to remove, merge, or prefer either Publication.
// - **Clearing `comparisonEncounter` automatically when the primary
//   selection changes.** A live comparison keeps comparing whatever is
//   CURRENTLY selected on both sides — see "worldSnapshotComparisonResult
//   is a live computed," above. `clearComparisonSelection()` remains the
//   Wanderer's own explicit way to start over.
//
// 0.9.183 — World Snapshot Content View.
//
// Comparison (0.9.181/0.9.182) answers "are these two Publications the
// same content?" without ever rendering either one's own material — that
// restraint was deliberate, and stays. This milestone answers the other,
// still-unaddressed question for a single selected Snapshot: "what IS this
// Snapshot's content?" — by consuming material this component ALREADY
// loads (`materialInspection`, 0.9.39) rather than adding a second loader.
//
//   selectedEncounterSnapshotInspection (0.9.177, unchanged)
//   materialInspection                  (0.9.39, unchanged)
//        │
//        ▼
//   application/WorldSnapshotContentView.js   (THIS milestone)
//        describeWorldSnapshotContentView()
//        │
//        ▼
//   selectedSnapshotContentView   ★ (THIS milestone's own new computed)
//        { publicationId, contentHash, material, position }
//        null
//        │
//        │  click "View Snapshot" -> snapshotContentViewOpen = true
//        ▼
//   Content View panel (rendered only while BOTH `snapshotContentViewOpen`
//   AND `selectedSnapshotContentView` are truthy)
//
// AN EXPLICIT ACTION, MIRRORING "COMPARE WITH…" EXACTLY, ONE PANEL OVER.
// `snapshotContentViewOpen` is `false` until the Wanderer clicks "View
// Snapshot" — merely having a viewable Snapshot selected never opens the
// panel on its own, exactly like merely selecting Publication A never
// arms/starts a comparison (0.9.182's own "no implicit comparison, ever").
//
// NO NEW MATERIAL LOADING, EVER. `openSnapshotContentView()` never calls
// `refreshMaterialInspection()`, `inspectWorldEncounterMaterial()`, or
// anything upstream of them — it only flips a boolean, and only when
// `selectedSnapshotContentView` (a value already computed from data this
// component already holds) is genuinely non-null. "View Snapshot" observes
// material the World's own existing pipeline already made available; it
// never triggers fetching it.
//
// `snapshotContentViewOpen` IS RESET ON EVERY FRESH PRIMARY SELECTION —
// MIRRORING `resolvedSelectionChoice`/`resolvedLeadChoice`'s OWN RESET IN
// `selectEncounter()` EXACTLY. Without this, selecting a new Publication
// right after viewing a previous one's content would render the NEW
// selection's Content View immediately, with no fresh explicit click — an
// implicit view, exactly the thing this milestone's own brief rules out.
// `selectComparisonEncounter()`'s own branch of `selectEncounter()` never
// runs this reset — a click that only sets the SEPARATE comparison target
// leaves the primary selection's own open Content View exactly as it was.
//
// `selectedSnapshotContentView` COLLAPSES TO `null` THE INSTANT MATERIAL
// STOPS BEING AVAILABLE — NEVER LEFT DESCRIBING STALE MATERIAL. It is a
// live computed, recomputed on every read from `selectedEncounterSnapshotInspection`/
// `materialInspection` — the SAME two already-live computeds/data this
// component already maintains. Unregistering the selected Snapshot
// (`unregisterSelectedSnapshot()`, 0.9.179) changes `resolvedEncounterSelection`,
// which `refreshSelectionOutcome()` already reacts to by tail-calling
// `refreshMaterialInspection()` (0.9.39, unmodified) — `materialInspection`
// collapses to `null`, and on the very next read so does
// `selectedSnapshotContentView`, so the Content View panel simply stops
// rendering (its own `v-if` already gates on it) without this milestone
// adding a single new listener anywhere.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any discovery, resolution, materialization, or distribution
//   triggered by "View Snapshot."** See "no new material loading, ever,"
//   above — the action only observes already-loaded material.
// - **Changing World position, or mutating the registry.** `openSnapshotContentView()`/
//   `closeSnapshotContentView()` write exactly one page-local boolean each;
//   neither ever touches `registry` or `selectedEncounter`.
//   `unregisterSelectedSnapshot()` remains the only registry-mutating
//   action reachable from this panel, unchanged since 0.9.179.
// - **A side-by-side content comparison viewer.** This milestone renders
//   exactly one Publication's own content at a time; combining it with
//   0.9.181/0.9.182's own comparison fact is explicitly later, unscheduled
//   work.
// - **Rendering arbitrary HTML/media/application content, or decoding
//   document bytes.** The Content View panel renders the SAME structured
//   `Publication` fields (title, author, published date, content
//   reference) this codebase already knows how to display elsewhere —
//   never fetched bytes, never parsed markup.
// - **A generic content viewer for LOCAL/PEER encounters.** `application/
//   WorldSnapshotContentView.js` requires a genuine `selectedEncounterSnapshotInspection`
//   (SNAPSHOT-sourced only, 0.9.177's own gate, unmodified) — a LOCAL/PEER
//   selection never produces one, so "View Snapshot" stays unreachable for
//   both, exactly like "Remove Snapshot from World" already does.
//
// 0.9.184 — World Snapshot Content Comparison View.
//
// 0.9.183's own "Recommendation" named this milestone directly: combine
// 0.9.181/0.9.182's own comparison fact with 0.9.183's own Content View —
// "a side-by-side rendering of two already-open Content Views, alongside
// the already-computed SAME_CONTENT/DIFFERENT_CONTENT fact." Doing that
// for real requires something 0.9.182 explicitly declined: a Content View
// for the COMPARISON TARGET, not only the primary selection. This milestone
// is the narrowest extension that makes that possible, and nothing more.
//
//   selectedSnapshotContentView (0.9.183, unmodified) ── "Publication A"
//   comparisonSnapshotContentView (★ NEW, mirrors it exactly, one
//                                    selection over)     ── "Publication B"
//   worldSnapshotComparisonResult (0.9.181/182, unmodified)
//        │
//        ▼
//   application/WorldSnapshotContentComparisonView.js   (NEW)
//        describeWorldSnapshotContentComparisonView()
//        │
//        ▼
//   worldSnapshotContentComparisonView   ★ (THIS milestone's own new computed)
//        { aPublicationId, bPublicationId, contentComparison, aMaterial, bMaterial }
//        null
//        │
//        │  click "View Content Comparison" -> contentComparisonViewOpen = true
//        ▼
//   Content Comparison panel
//
// EXTENDING MATERIAL LOADING TO THE COMPARISON TARGET IS A DELIBERATE,
// NARROW REVISION OF 0.9.182'S OWN EXCLUSION — NOT AN OVERSIGHT. 0.9.182's
// own header excluded "material loading... for the comparison target"
// because comparison, at the time, was ONLY an identity question
// (`contentHash` equality), which never needed material at all. This
// milestone's own purpose — SHOWING both sides' content — cannot be done
// without it. What is added mirrors the primary selection's own existing
// `materialInspection`/`refreshMaterialInspection()` pair exactly, one
// selection over (`comparisonMaterialInspection`/
// `refreshComparisonMaterialInspection()`), calling the SAME, already-
// existing `inspectWorldEncounterMaterial()` — never a second loader, never
// a new `materialSources` slot. Decentralized lead resolution for the
// comparison target remains excluded, unrevisited (see "deliberately
// excluded," below): `refreshComparisonMaterialInspection()` never supplies
// a `resolvedLead`, exactly like the primary selection's own material
// inspection behaved before 0.9.40 ever existed. A comparison target whose
// material genuinely requires a resolved decentralized lead to load simply
// stays `UNAVAILABLE` here — honest degradation, never a silent second
// resolution pipeline invented to route around that gap.
//
// `refreshComparisonMaterialInspection()` IS TRIGGERED THE IDENTICAL WAY
// `refreshMaterialInspection()` ALREADY IS FOR THE PRIMARY SELECTION —
// EXPLICITLY, NEVER AUTOMATICALLY, NEVER ON A TIMER. It runs once, from
// `selectComparisonEncounter()`, mirroring `selectEncounter()`'s own tail
// call into `refreshSelectionOutcome()` (which itself tail-calls
// `refreshMaterialInspection()` only on a genuine resolved-selection
// change); `refreshComparisonSelectionOutcome()` gains the identical
// "only on a genuine change" guard, using the SAME
// `resolvedEncounterSelectionsEqual()` helper 0.9.39 already defined, so a
// registry notification that leaves the comparison target's own resolved
// identity untouched never redundantly reloads its material.
//
// CRITICAL RULE — `application/WorldSnapshotContentComparisonView.js` NEVER
// RECOMPUTES CONTENT IDENTITY FROM EITHER SIDE'S OWN MATERIAL. It consumes
// `worldSnapshotComparisonResult` (0.9.181/182, unmodified) for the
// identity relationship and `selectedSnapshotContentView`/
// `comparisonSnapshotContentView` (0.9.183's own shape, produced twice) for
// the actual material — see that file's own header for the full rationale.
// `worldSnapshotComparisonResult` remains the ONE source of truth for
// "same or different content"; this milestone never introduces a second
// one.
//
// NO FABRICATED COMPARISON VIEW WHEN EITHER SIDE'S MATERIAL IS UNAVAILABLE.
// `worldSnapshotContentComparisonView` is `null` whenever
// `selectedSnapshotContentView` or `comparisonSnapshotContentView` is
// `null`, OR either one's own `publicationId` no longer matches
// `worldSnapshotComparisonResult`'s own corresponding side (the same
// "two arguments captured at different moments" guard 0.9.183 already
// applies one layer down) — even though `worldSnapshotComparisonResult`
// itself may still be genuinely available and rendered on its own, in the
// existing Compare panel, entirely unaffected. This file never retrieves,
// substitutes, or materializes the missing side to paper over the gap.
//
// AN EXPLICIT ACTION, MIRRORING "VIEW SNAPSHOT"/"COMPARE WITH…" EXACTLY,
// ONE PANEL OVER. `contentComparisonViewOpen` is `false` until the Wanderer
// clicks "View Content Comparison" — both sides' material becoming
// AVAILABLE never opens the panel on its own. It resets to `false` on every
// fresh PRIMARY selection (mirroring `snapshotContentViewOpen`'s own reset)
// and on every fresh comparison-target selection or `clearComparisonSelection()`
// call (a NEW pairing never implicitly reopens a panel that described the
// OLD one).
//
// SAME CONTENT DOES NOT MEAN ONE OBJECT — UNCHANGED, ONE LAYER UP.
// `worldSnapshotContentComparisonView.aMaterial`/`.bMaterial` remain two
// fully independent `describeWorldSnapshotContentView()` results even when
// `contentComparison` is `SAME_CONTENT`; `aPublicationId`/`bPublicationId`
// are never collapsed, and each side's own `position` is rendered
// independently. Different positions for identical content remain two
// World objects, exactly as 0.9.181's own header already established.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **"Merge identical Snapshots," "replace this Snapshot with the
//   other," or any deduplication/removal/replacement action offered from
//   `SAME_CONTENT`.** This panel renders a fact, and two independent
//   materials, never an action.
// - **Decentralized lead resolution for the comparison target.** Remains
//   excluded exactly as 0.9.182 first stated it — only the no-lead loading
//   path (already sufficient for LOCAL/SNAPSHOT-origin material, per
//   0.9.183's own header) is mirrored for `comparisonEncounter`.
// - **A mandatory side-by-side visual layout.** The panel renders two
//   independent material regions; a strict side-by-side arrangement is
//   explicitly not assumed — see `application/
//   WorldSnapshotContentComparisonView.js`'s own header.
// - **Any new World Encounter kind, registry identity, or lifecycle
//   state.** This milestone adds no new taxonomy of any kind.
// - **Rendering arbitrary HTML/media/application content, or decoding
//   document bytes.** The panel renders the same structured fields
//   0.9.183's own Content View panel already renders, for each side.
//
// 0.9.291 — Publication Commentary on the World Encounter Surface.
//
// 0.9.288's own Section E named SIX UI surfaces holding a full
// `Publication` object at render time yet carrying zero commentary
// vocabulary. 0.9.289 wired the first (PublicationCard.js, a
// Discovery-facing surface, via a NEW standalone composition —
// application/CreatePublicationCommentaryUseCase.js — because that
// component has no WorldNavigationSession to ask). This milestone wires
// the second: WorldEncounterCanvas.js, the component named explicitly in
// that same Section E finding — and, unlike PublicationCard, reaches
// commentary through NEITHER a new composition NOR the app-wide one
// 0.9.289 built, but through the composition ALREADY IN SCOPE one file
// up: ui/views/WorldView.js's own `getPublicationCommentariesCommand`/
// `addPublicationCommentaryCommand` (0.9.248), the exact functions that
// already feed OwnPublicationPanel, now ALSO handed to THIS component as
// two new, optional props — the identical shape every other WorldView-
// composed capability (`distributionCommand`, `discoveryCommand`,
// `snapshotDistributionCommand`, ...) already arrives as.
//
//   ui/views/WorldView.js
//        session.getPublicationCommentaries()/.addPublicationCommentary()   (0.9.248, unmodified)
//                  │
//                  ▼
//        getPublicationCommentariesCommand / addPublicationCommentaryCommand   (0.9.248, unmodified — ALREADY built for OwnPublicationPanel)
//                  │
//        ┌─────────┴─────────┐
//        ▼                   ▼
//   OwnPublicationPanel   WorldEncounterCanvas   ★ (THIS milestone — a NEW prop wire, not a new command)
//
// WHY THE SESSION-BACKED COMMANDS, NOT application/CreatePublicationCommentaryUseCase.js
// (0.9.289)'s APP-WIDE ONES. Both compositions wrap the identical,
// unmodified GetPublicationCommentariesUseCase/AddPublicationCommentaryUseCase/
// CanCommentOnPublicationUseCase/PublicationCommentaryNotificationProducer
// chain, and 0.9.290 already proved both converge on the SAME underlying
// PublicationCommentaryStore/NotificationEventStore (the same
// window.localStorage keys) — functionally, either would work. But
// WorldEncounterCanvas is mounted BY ui/views/WorldView.js alone (see
// "deliberately excluded," below, for ui/views/LiveWorldView.js's own
// separate, unwired mount) — the SAME file that already composes
// commentary for OwnPublicationPanel. Reaching for the app-wide
// composition instead would mean plumbing a THIRD path
// (main.js -> WorldView.js -> WorldEncounterCanvas) past a perfectly
// good, already-in-scope SECOND one (WorldView.js's own session). This
// file therefore imports NOTHING new from application/ or ui/main.js: it
// adds two plain caller-injected Function props, exactly the way
// `distributionCommand` (0.9.104) already is.
//
// NO NEW USE CASE, NO NEW STORE, NO NEW COMPOSITION ROOT. This is the
// THIRD wiring of the identical, unmodified application layer 0.9.288's
// Section E already found ownership-agnostic — after OwnPublicationPanel
// (0.9.248, via WorldNavigationSession) and PublicationCard (0.9.289, via
// CreatePublicationCommentaryUseCase) — and the FIRST to add no new
// composition of its own at all.
//
// THE PUBLICATIONID IS THE ENCOUNTER'S OWN objectId — NEVER THE LOADED
// MATERIAL'S. `core/WorldEncounter.js`'s own row construction already
// sets `objectId: publication.id` for a PUBLICATION-kind encounter — the
// identical identity `selectedEncounterInspection` (0.9.16/0.9.18)
// already renders as "Title"/"Publisher" for the SAME encounter.
// `encounterCommentaryPublicationId` (below) reads `selectedEncounter.objectId`
// directly, gated on `selectedEncounterInspection.kind === 'PUBLICATION'`
// (a currently live, resolvable encounter — see 0.9.18's own "a stale
// selection renders unavailable," held here for commentary too) — NEVER
// `distributablePublication.id` (0.9.104's own material-loading-gated
// computed, one panel below). Commentary about an encountered Publication
// is never made to wait on whether its signed material bytes happen to
// load, fetch, or verify — those stay separate, independent questions
// this milestone deliberately does not couple together. World position ≠
// Publication identity (0.9.19's own line); this milestone holds that
// line one further: World MATERIAL AVAILABILITY ≠ Publication identity,
// either.
//
// RENDERED INSIDE THE EXISTING "World Encounter" INSPECTION PANEL, NEVER
// A NEW ONE. The Comment action and its panel live inside
// `world-encounter-inspection-panel` (0.9.18), immediately below the
// existing Title/Publisher/Signed/Position `<dl>` — the same panel
// already showing the Publication/Author facts this milestone's own task
// framing sketched. There is no second "World Encounter" heading, no
// separate card, and no new top-level panel.
//
// COLLAPSED BY DEFAULT, LOADED ONLY ON FIRST EXPANSION — MIRRORING
// PublicationCard.js's OWN RESTRAINT (0.9.289), NOT OwnPublicationPanel's
// OWN EAGER LOAD. OwnPublicationPanel shows exactly one Publication per
// mount, so loading commentary immediately is cheap; this component's own
// selection can change on every marker click as a Wanderer walks the
// World, and 0.9.288's own six-surface finding was itself explicit about
// "automatic Commentary loading for every encountered Publication" being
// out of scope. `toggleEncounterCommentary()` (below) is the only thing
// that ever triggers the first `refreshEncounterCommentaries()` call.
//
// COMMENTARY STATE IS RESET ON EVERY FRESH SELECTION — NEVER LEAKED FROM
// ENCOUNTER A TO ENCOUNTER B. `selectEncounter()` (0.9.4) already resets
// every other selection-scoped ephemeral field (`resolvedSelectionChoice`,
// `distributionError`, `snapshotContentViewOpen`, ...) on every new
// selection; this milestone adds `encounterCommentaryOpen`/
// `encounterCommentaries`/`encounterCommentaryError`/
// `newEncounterCommentaryText`/`encounterCommentarySubmitting` to that
// same tail, mirroring the identical discipline one concept over — a
// Wanderer who opened comments for Publication A and then selects
// Publication B sees B's own (collapsed, unread) commentary section,
// never A's stale list or draft.
//
// AUTHORSHIP IS NEVER UI-SUPPLIED, NO OWNERSHIP GATE, SYNCHRONOUS,
// RE-QUERY ON SUCCESS — THE IDENTICAL RESTRAINT PublicationCard.js/
// OwnPublicationPanel.js ALREADY HOLD, HELD HERE VERBATIM. See those
// files' own headers; this file introduces no variation on any of it.
// `viewerIdentityId` (a new, optional String prop, mirroring
// OwnPublicationPanel's own identical prop) gates only the compose-form/
// sign-in-hint choice — never sent to `addPublicationCommentaryCommand`,
// which sends only `{ publicationId, content }`.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Wiring ui/views/LiveWorldView.js.** Its own `<WorldEncounterCanvas>`
//   mount supplies no session, no identity, and none of this component's
//   other optional capabilities either — left exactly as it already was;
//   the new props simply default to `null` there, exactly like every
//   other optional prop already does for that mount.
// - **A comment count badge on the marker itself, spatial/proximity
//   comments, comment bubbles, World chat, replies, editing, deletion,
//   moderation, or ranking.** None of it is commentary vocabulary this
//   file, or any collaborator it calls, introduces.
// - **A new notification producer, a new NotificationEvent kind, or any
//   change to PublicationCommentaryNotificationProducer.js.** A comment
//   created here produces the exact same `publication.commented` event
//   0.9.275 already defines, through the exact same producer instance
//   WorldView.js's own session already wraps `addPublicationCommentaryUseCase`
//   with.
// - **Refactoring CreateWorldViewUseCase.js, or collapsing it with
//   application/CreatePublicationCommentaryUseCase.js (0.9.289) into one
//   shared composition.** Two independently constructed, already-converging
//   compositions stay two — see 0.9.290's own convergence proof for why
//   that duplication is safe, not a defect to fix.

const WORLD_HALF_SPAN = 50;
const CANVAS_SIZE = 600;

function projectToCanvas(value) {
    return CANVAS_SIZE / 2 + (value / WORLD_HALF_SPAN) * (CANVAS_SIZE / 2);
}

// 0.9.169 — a plain, pure, field-by-field comparison of two
// `resolvedEncounterSelection`-shaped values (or `null`) — see this file's
// own "0.9.169" header, above, for why this exists and what it deliberately
// does not do.
function resolvedEncounterSelectionsEqual(previousResolvedSelection, nextResolvedSelection) {
    if (previousResolvedSelection === nextResolvedSelection) {
        return true;
    }
    if (!previousResolvedSelection || !nextResolvedSelection) {
        return false;
    }
    return previousResolvedSelection.kind === nextResolvedSelection.kind
        && previousResolvedSelection.objectId === nextResolvedSelection.objectId
        && previousResolvedSelection.origin === nextResolvedSelection.origin;
}

// 0.9.430 — Announcement/Discovery Provider Selection Reachability.
//
// 0.9.429's own audit found `application/PublicationDistributionRuntimeComposition.js`'s
// own `discoveryProvider: 'nostr' | 'arweave'` selection (0.9.428) to be
// real, correct, and completely unreachable from this component's own
// "Distribute Publication" action — every real click silently distributed
// on Nostr, with no control anywhere offering a choice. This milestone is
// that control, and nothing more:
//
//   Distribution panel (0.9.100/0.9.104, already rendered below)
//        │
//        │  new "Announcement / Discovery substrate" <select>   ★ (THIS)
//        ▼
//   selectedDiscoveryProvider = 'nostr' | 'arweave'   (page-local UI state)
//        │
//        │  click "Distribute Publication"
//        ▼
//   distributeSelectedPublication()   (0.9.104, amended)
//        │
//        ▼
//   distributionCommand(publication, selectedDiscoveryProvider)
//        │                                    ★ the one new argument
//        ▼
//   (WorldView.js's own distributeWorldEncounterPublication(), amended;
//    ultimately application/PublicationDistributionRuntimeComposition.js's
//    own already-real selection)
//
// THIS COMPONENT CHOOSES NOTHING — IT ONLY OFFERS THE CHOICE. Exactly like
// every other injected command this file already holds
// (`distributionCommand`/`snapshotDistributionCommand`/`discoveryCommand`),
// this milestone constructs no Arweave client, no Nostr client, and knows
// nothing about `gatewayUrl`/`tagName`/`uploadTaggedTransaction` — see
// `application/PublicationDistributionRuntimeComposition.js`'s own header,
// "Keep Arweave options out of the UI," held here as this component's own
// restraint too. `selectedDiscoveryProvider` is a bare string, the same
// vocabulary that file's own `discoveryProvider` parameter already accepts,
// never a stored preference or registry lookup keyed by role of any kind —
// this milestone reaches no file under `core/RoleProvider*.js`.
//
// EXACTLY ONE SELECTION, NEVER FAN-OUT — THE SAME INVARIANT
// `PublicationDistributionRuntimeComposition.js`'s OWN HEADER ALREADY
// HOLDS, ONE LAYER UP. The new control is a single `<select>`, never a
// pair of checkboxes; `selectedDiscoveryProvider` is always exactly one of
// `'nostr'`/`'arweave'`, never an array, and this component sends exactly
// one `distributionCommand()` call per click, exactly as 0.9.104 already
// does.
//
// DEFAULTS TO `'nostr'` — EVERY PRE-0.9.430 MOUNT BEHAVES IDENTICALLY.
// `selectedDiscoveryProvider` starts `'nostr'` in `data()`, below, matching
// `composePublicationDistributionRuntime()`'s own default exactly; a
// Wanderer who never touches the new control gets precisely today's
// existing behavior, unchanged.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Endpoint/relay/gateway configuration UI of any kind** (`gatewayUrl`,
//   `tagName`, `relayUrl`, `uploadTaggedTransaction`, a signer/wallet
//   picker). See "This component chooses nothing," above — those remain
//   entirely `ui/main.js`'s own composition-root concern.
// - **Multi-substrate selection, fan-out, or fallback.** See "Exactly one
//   selection, never fan-out," above.
// - **A second Distribution action, panel, or command.** The existing
//   `distributionCommand`/`distributeSelectedPublication()` seam is
//   extended with one argument — never duplicated.
// - **`ui/components/OwnPublicationPanel.js`'s own, separate distribution
//   action.** Unmodified by this milestone; it keeps calling
//   `publicationDistributionCommand(publication)` with no
//   `discoveryProvider` of its own, which still resolves to `'nostr'`
//   exactly as it already did.
//
// AMENDED BY 0.9.433 — Concurrent Discovery Observation Preservation.
// `distributionLifecycleStore.get()`'s own single-slot Discovery fact
// (0.9.100, unmodified) silently showed only the most recently used
// substrate once a Publication had been announced on a second one — real,
// independently discoverable evidence from the first substrate, simply not
// observable through this panel. `PublicationDistributionLifecycleStore.js`
// gained an additive `getDiscoveryObservations(publicationId)` accessor
// (0.9.433); this file adds exactly one new computed,
// `discoveryObservations` (below), and replaces the Discovery `<dt>/<dd>`
// pair in the template with a `v-for` over it whenever more than one
// substrate observation exists, falling back to today's exact single row
// otherwise. No new panel, heading, route, or history view; `get()`/
// `subscribe()`'s own existing single-slot observation
// (`distributionMaterialState`/`distributionDiscoveryState`) is unchanged
// and still the fallback for the common, single-substrate case.

// 0.9.516 — World View / Wanderer Product Experience Reassessment,
// Section G. Three small, presentation-only lookups/helpers backing
// `describeSelectionOriginLabel()`/`describeDecentralizedLeadUriLabel()`
// (below, in `methods`) — kept private to this file, mirroring
// `ui/views/DecentralizedPublicationsView.js`'s own identically-shaped
// `STORAGE_TYPE_LABELS`/`shortId()`/`shortHash()` (0.9.510/0.8.13) rather
// than importing them: neither is exported from that file today, and a
// World Encounter is not a Decentralized Publications list row — the two
// views stay independent consumers of the same convention, never coupled
// through a shared UI import.
const CONTENT_URI_SCHEME_LABELS = {
    ar: 'Arweave',
    ipfs: 'IPFS'
};

function shortIdentityId(identityId) {
    if (typeof identityId !== 'string' || identityId.length === 0) {
        return 'an unknown identity';
    }
    return identityId.length > 14 ? identityId.slice(-14) : identityId;
}

function shortContentHash(contentHash) {
    if (typeof contentHash !== 'string' || contentHash.length === 0) {
        return 'an unknown hash';
    }
    return contentHash.length > 18 ? `${contentHash.slice(0, 10)}…${contentHash.slice(-6)}` : contentHash;
}

// 0.9.552 — Observer-Local Novel Publication Encounter Presentation.
//
// application/AutomaticSnapshotEncounterCascade.js gained an additive
// `encounter` field on its own `UNPLACED` result; application/
// ObserverLocalEncounterStore.js gained a session-scoped place to hold one
// across ticks. Nothing until now rendered either. This milestone is that
// rendering, and nothing more:
//
//   observerLocalEncounterRegistry (new prop)  ─┐
//                                                ▼
//                        mounted(): seed, then subscribe
//                    (mirrors `registry`'s own pattern exactly)
//                                                │
//                                                ▼
//               observerLocalEncounters (new page-local state)
//                                                │
//                                                ▼
//         projectedObserverLocalEncounters (new computed)
//                                                │
//                                                ▼
//              a THIRD, separate <g> v-for block, in the template
//
// A THIRD, SEPARATE PROP AND PROJECTED ARRAY, NEVER A MERGE INTO
// `registry`/`projectedPublications`. See this file's own header, "no
// runtime registry prop swapping" and the several "architectural boundary"
// notes above — `registry` stays the ONE seam this component reads
// authoritative World state through. `observerLocalEncounterRegistry` is a
// second, independent, optional prop, duck-typed to exactly the same
// `{ list(), subscribe(listener) }` shape `registry` already exposes (see
// application/ObserverLocalEncounterStore.js's own header, "modeled
// directly on WorldDiscoverySourceRegistry's own subscribe()/_notify()
// contract"), never the same object, never read through `effectiveView`,
// and never combined with `worldView`/`publicationRows` in any way. A
// mount supplied `registry` but not `observerLocalEncounterRegistry` (or
// vice versa) renders exactly the corresponding half — the two are
// entirely independent.
//
// NOT SELECTABLE — NOT A `WorldEncounterMarker`, NOT WIRED TO
// `selectEncounter()`. An observer-local encounter has no `origin` a
// `WorldDiscoverySourceRegistry`-backed `selectionOutcome` could ever
// resolve (it was never registered with that registry at all — see
// application/AutomaticSnapshotEncounterCascade.js's own header, "this file
// never records an encounter anywhere itself... never a PlacementRecord"),
// so wiring it into the existing selection/inspection/material-loading
// machinery would only ever resolve to `'UNAVAILABLE'` — a false "this
// left the World" notice for something that was never a `WorldEncounter`
// in the first place. This milestone renders a plain `<g>`, not a
// `<WorldEncounterMarker>`, and binds no `@select` handler to it at all.
// Wiring a dedicated inspection surface for THIS kind of encounter is
// separate, later, unscheduled work.
//
// VOCABULARY: "DISCOVERED HERE," NEVER "PLACED." The rendered label and
// `<title>` tooltip deliberately avoid "Placed"/"Official location"/
// "Located by publisher"/"Trusted location"/"Verified location"/
// "Authoritative"/"Owned" — see this milestone's own brief. "Discovered
// here" names the observation that actually happened (a Wanderer's own
// walking triggered real discovery, resolution, content-hash verification,
// and materialization for this exact publicationId/contentHash — see
// application/AutomaticSnapshotEncounterCascade.js's own header, "0.9.552,"
// for why `AVAILABLE + VERIFIED` remains a hard precondition, unweakened);
// it never claims the publisher's own `claimedPosition` was honored, used,
// or trusted, because it was not — see core/ObserverLocalPublicationEncounter.js's
// own header for why `position` here is the Wanderer's OWN encounter
// position, never a publisher's claim.
//
// `objectId`/`kind`/`title`/`publisherIdentity`/`isSigned`/`anchorCount`/
// `placementCount` DO NOT EXIST ON THIS SHAPE, AND THIS MILESTONE NEVER
// FABRICATES THEM. `projectedObserverLocalEncounters` carries exactly
// `publicationId`, `contentHash`, `x`, `y` — see core/
// ObserverLocalPublicationEncounter.js's own header for why that identity
// (`publicationId` + `contentHash`) is deliberately never a `documentId`,
// a `locator`, or `claimedPosition` itself.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Selection, inspection, material loading, commentary, or distribution
//   for an observer-local encounter.** See "not selectable," above.
// - **Merging `observerLocalEncounterRegistry` into `registry`, or reading
//   one through the other.** See "a third, separate prop," above.
// - **Any change to `registry`/`worldView`/`effectiveView`/
//   `publicationRows`/`projectedPublications`.** All are byte-for-byte
//   unchanged by this milestone.
// - **A new glyph, marker component, or change to
//   `ui/components/WorldEncounterMarker.js`.** That component's own "dumb,
//   zero-import" contract stays untouched; this milestone renders a plain
//   `<g>` of its own instead.
// - **Persistence, expiry, or cross-Wanderer sharing of a rendered
//   encounter.** See application/ObserverLocalEncounterStore.js's own
//   header — this component only ever reflects whatever that store
//   currently holds.
//
// 0.9.570 — AMENDED. "Merging `observerLocalEncounterRegistry` into
// `registry`... or reading one through the other," above, still holds — the
// two remain fully independent props and stores. What changed: 0.9.568
// Section D found that a Publication discovered while UNPLACED, then
// authoritatively registered within the SAME session, rendered BOTH its
// permanent primary marker AND its now-stale observer-local ghost,
// simultaneously, for the rest of that session; 0.9.569 located the fix as
// a filtering step inside `projectedObserverLocalEncounters` itself, keyed
// by `publicationId` against `publicationRows`'s own `objectId`. See that
// computed's own 0.9.570 header, below, for the filter and its rationale.
// This remains a presentational suppression only — `observerLocalEncounters`
// (this component's copy of the store's own list) is untouched, nothing is
// ever written back to `ObserverLocalEncounterStore.js`, and an inspection
// already open on a converging encounter is deliberately left alone (see
// that computed's own header, and 0.9.569 Section H).
//
// 0.9.554 — AMENDED. "Selection, inspection, material loading... for an
// observer-local encounter," immediately above, was this milestone's own
// named exclusion — 0.9.553's own Section G confirmed it as the resulting
// PRODUCT_GAP: an observer-local encounter rendered, but supported no
// interaction of any kind, and routing it through the EXISTING selection
// machinery (`selectEncounter()`/`selectionOutcome`/`resolvedEncounterSelection`)
// resolved to a false `'UNAVAILABLE'` — a "this left the World" notice for
// something that was never a registered `WorldEncounter` to begin with
// (0.9.553's own Section G4, live-proven). See "0.9.554 — Observer-Local
// Encounter Inspection Capability," below, for the narrow, genuinely
// separate surface that closes exactly that gap without touching this
// exclusion's own remaining restraint — see that section's own header for
// why "not selectable" (this marker still binds no `@select`, is still
// never a `<WorldEncounterMarker>`, and still never enters
// `selectedEncounter`/`selectionOutcome`) is NOT the same restraint as "not
// inspectable."
//
// 0.9.554 — OBSERVER-LOCAL ENCOUNTER INSPECTION CAPABILITY.
//
// 0.9.553's own Section G named the gap precisely: a Wanderer can PERCEIVE
// that something was discovered ("Discovered here"), but has no way to ask
// for more — and that same section's own G4 proved, empirically, that the
// obvious-looking fix (routing an observer-local encounter through the
// EXISTING `selectEncounter()` -> `selectionOutcome` -> `resolvedEncounterSelection`
// chain) does not work: that chain answers "which currently-registered
// `WorldDiscoverySource` offers this identity," and an observer-local
// encounter, by construction (core/ObserverLocalPublicationEncounter.js's
// own header, "no I/O... never registered with that registry at all"), is
// never one. This milestone builds the narrow, SEPARATE surface 0.9.553's
// own verdict called for instead:
//
//   click on the observer-local marker (a plain `<g>`, still never a
//   `<WorldEncounterMarker>` — see "not selectable," above, unweakened)
//                      │
//                      ▼
//   selectObserverLocalEncounter({ publicationId, contentHash })   ★ (THIS)
//                      │
//                      ▼
//   selectedObserverLocalEncounter = { publicationId, contentHash }
//                      │
//                      ▼
//   observerLocalEncounterResolvedSelection   (computed)   ★ (THIS)
//        { kind: 'PUBLICATION', objectId: publicationId, origin }
//                      │
//        origin = materializedSnapshotWorldOrigin(contentHash, publicationId)
//        (application/MaterializedSnapshotWorldDiscoveryBridge.js, 0.9.160/
//         0.9.163, REUSED VERBATIM, never reimplemented)
//                      │
//                      ▼
//   refreshObserverLocalEncounterInspection()   ★ (THIS)
//        inspectWorldEncounterMaterial({ resolvedSelection, materialSources,
//        verifier })   (application/WorldEncounterMaterialInspection.js,
//        0.9.39, UNMODIFIED — the SAME orchestration boundary the primary
//        selection already calls)
//                      │
//                      ▼
//   observerLocalEncounterInspection = { selection, lead, loading, verification }
//                      │
//                      ▼
//   a THIRD, separate inspection panel (never merged into the "World
//   Encounter" panel, and never the Publication Catalog/Repository)
//
// WHY THIS WORKS WITHOUT THE REGISTRY: `application/
// MaterializedSnapshotWorldDiscoveryBridge.js`'s own `materializedSnapshotWorldOrigin()`
// derives `"snapshot:<contentHash>:<publicationId>"` as a PURE function of
// exactly the two facts an observer-local encounter already carries — no
// registry lookup, no candidate search. `application/
// WorldEncounterMaterialLoading.js`'s own `materialSourceFor()` (0.9.166)
// already routes any `"snapshot:*"`-prefixed origin to the SAME
// `materialSources.local` slot a REGISTERED Snapshot's own material would
// use — because a Snapshot's bytes are ALREADY LOCAL by the time a caller
// ever reaches this point, whether or not this replica has ever placed it.
// An observer-local encounter's own `AutomaticSnapshotEncounterCascade.js`
// pipeline already reached exactly that point (DISCOVER -> RESOLVE ->
// VERIFY -> MATERIALIZE) before ever producing the encounter in the first
// place — see core/ObserverLocalPublicationEncounter.js's own header,
// "AVAILABLE + VERIFIED remains a hard precondition." This milestone
// therefore reuses the IDENTICAL local-origin material slot a placed
// Snapshot already resolves through, computing the identical origin STRING
// a future `registerMaterializedSnapshotWorldSource()` call for the SAME
// publicationId/contentHash pair would itself derive — never a new loading
// path, never a second `materialSources` slot, and never a guess at where
// the bytes might be.
//
// NO SECOND DOWNLOAD, NO SECOND VERIFICATION MECHANISM — THE SAME
// ORCHESTRATION BOUNDARY, CALLED FRESH. `refreshObserverLocalEncounterInspection()`
// calls `inspectWorldEncounterMaterial()` — the IDENTICAL function
// `refreshMaterialInspection()` already calls for the primary selection —
// with the SAME `materialSources`/`materialVerifier` props this component
// already holds. Because the resolved origin always names
// `materialSources.local` for an observer-local encounter (see above), the
// resulting `load()` call reads bytes this replica's own cascade already
// materialized — a local read, never a second network fetch — and
// `verifyWorldEncounterMaterial()` is the SAME verification boundary/
// verifier every other World Encounter inspection already uses, never a
// second, independently-invented check. This is composition, not a new
// interpretation of identity or verification — see this file's own
// long-held "never a fourth loader... never a second verifier" restraint,
// continued here for a third selection concept.
//
// A THIRD, GENUINELY SEPARATE SELECTION CONCEPT — NEVER
// `selectedEncounter`, NEVER `resolvedEncounterSelection`. Exactly the
// restraint this milestone's own product brief asked for: "avoid reusing a
// production method whose semantic meaning is specifically selection of an
// authoritative resolvedEncounterSelection." `selectedObserverLocalEncounter`/
// `observerLocalEncounterResolvedSelection`/`observerLocalEncounterInspection`/
// `observerLocalEncounterInspectionRequestId` are FOUR new, independent
// pieces of state, each mirroring an existing primary-selection counterpart
// one concept over, and `selectObserverLocalEncounter()`/
// `refreshObserverLocalEncounterInspection()`/
// `dismissObserverLocalEncounterInspection()` never read or write
// `selectedEncounter`, `selectionOutcome`, `resolvedSelectionChoice`,
// `materialInspection`, or any comparison-panel state above — selecting
// (or inspecting, or dismissing) an observer-local encounter never
// disturbs the primary/comparison selection, and vice versa. Both may be
// open, independently, at once — mirroring 0.9.553's own Section K, which
// already proved the two rendering CHANNELS coexist without merging or
// cross-counting; this milestone extends that same coexistence to
// selection and inspection.
//
// (AS OF 0.9.554) NEVER `admitToRepositoryDiscovery()` — 0.9.553's OWN
// SECTION H BOUNDARY STAYS EXACTLY WHERE IT WAS, AT THE TIME. This
// milestone writes its own, narrower `refreshObserverLocalEncounterInspection()`
// — never reusing `refreshMaterialInspection()` verbatim — specifically so
// this file keeps a genuinely separate selection concept for an
// observer-local encounter (see "a third, genuinely separate selection
// concept," above); AT THE TIME this method deliberately never calls
// `admitToRepositoryDiscovery()`, matching 0.9.553's own DELIBERATE_BOUNDARY
// finding (Section H: "an observer-local encounter has no path, automatic
// or manual, into app-wide Repository discovery today... a real product
// decision, not a repurposing of anything that already bridges the two").
//
// SUPERSEDED BY 0.9.595 — Admit Verified Observer-Local Publications into
// Repository Discovery. 0.9.553's Section H finding described the
// codebase as it stood in 0.9.553, not a permanent restriction; 0.9.594's
// own audit measured the downstream continuity cost that restriction left
// unmeasured (a verified observer-local Publication had no route into
// Explore/OwnPublicationPanel's existing placement UI, ever, for the rest
// of that Wanderer's session) and reclassified it CONTINUITY_GAP_CONFIRMED.
// `refreshObserverLocalEncounterInspection()` now DOES call
// `admitToRepositoryDiscovery()` — see that method's own "AMENDED BY
// 0.9.595" header, below — reusing the identical method, the identical
// `AVAILABLE + VERIFIED` gate, and the identical target provider
// `refreshMaterialInspection()` already writes into; nothing about the
// "third, genuinely separate selection concept" restraint immediately
// above changes: `observerLocalEncounterInspection` is still never merged
// into `materialInspection`, and `selectedObserverLocalEncounter` is still
// never merged into `selectedEncounter`. Only Repository admission — a
// side effect neither selection concept exposes to its own template — is
// now shared.
//
// NEVER THE PUBLICATION CATALOG/REPOSITORY BROWSER. This milestone's own
// product brief was explicit: "I would not automatically open the full
// Publication Catalog when the user selects an encounter... a lightweight
// inspection surface... may be appropriate, but those actions should be
// deliberately evaluated rather than inherited accidentally." The new
// inspection panel below renders exactly `publicationId`, `contentHash`,
// and the SAME Material/Verification vocabulary the primary panel already
// renders — no Open/Explore/Fork action, no catalog navigation, no
// Repository admission (see immediately above). Those remain deliberately
// unbuilt, later, separately-evaluated work.
//
// EXACT PUBLICATION IDENTITY, NEVER SUBSTITUTED. `observerLocalEncounterResolvedSelection.objectId`
// is always `selectedObserverLocalEncounter.publicationId` — the exact
// field name core/ObserverLocalPublicationEncounter.js's own header already
// drew this identity around. `contentHash` appears only inside the derived
// `origin` string (as `materializedSnapshotWorldOrigin()` itself already
// composes it) and in the panel's own display row — it is never treated as
// a second, competing notion of "which Publication this is."
//
// STILL NEVER SELECTABLE THROUGH THE EXISTING MACHINERY, STILL NEVER A
// PLACEMENT. This milestone changes nothing about "not selectable," above:
// the marker is still a plain `<g>`, still binds no `@select`, and still
// never becomes a `<WorldEncounterMarker>` or an entry in
// `selectedEncounter`/`selectionOutcome`. It gains its OWN, narrow `@click`
// binding — a different event, to a different method, writing different,
// parallel state — never a repurposing of the existing selection concept
// this file has held one meaning for since 0.9.4. Nothing in this
// milestone constructs, reads, or references a `PlacementRecord` or a
// `PlacementRegistry` of any kind, and no `WorldDiscoverySourceRegistry` is
// ever mutated by any of it.
//
// A STALE OR DISMISSED SELECTION RENDERS NOTHING STALE. Mirroring
// `materialInspectionRequestId`'s own guard (0.9.39) exactly, one selection
// concept over: `observerLocalEncounterInspectionRequestId` is bumped on
// every call to `refreshObserverLocalEncounterInspection()` (including on
// `dismissObserverLocalEncounterInspection()` and on unmount), and a
// resolved `inspectWorldEncounterMaterial()` response is only ever written
// when it is still the most recent request. A late response for an
// encounter the Wanderer has since dismissed, replaced with a different
// selection, or that disappeared entirely (this component unmounted) is
// silently discarded, never resurrecting stale state.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **"Find it again" / persistence / rediscovery of any kind.** Per this
//   milestone's own product brief: "Because the encounter is intentionally
//   ephemeral, 'find it again' raises a different product question...
//   [it] should not be silently solved by making the encounter
//   persistent." `selectedObserverLocalEncounter` holds exactly as long as
//   this component instance does — no different than `selectedEncounter`
//   itself already does.
// - **Reputation, trust scores, spatial voting, or community moderation of
//   any kind.** Unaffected by this milestone — inherited unchanged from
//   0.9.552/0.9.553.
// - **Promotion to a `PlacementRecord`.** Still true, unamended — see
//   this file's own "0.9.595" header, above `refreshObserverLocalEncounterInspection()`,
//   Acceptance Criterion E: nothing in Repository admission creates a
//   `PlacementRecord`; only the existing, explicit placement action in
//   `OwnPublicationPanel` ever does. (Admission into app-wide Repository
//   discovery ITSELF was later added by 0.9.595 — see "SUPERSEDED BY
//   0.9.595," above, for why this bullet no longer covers that half.)
// - **Open/Explore/Fork, commentary, or distribution actions for an
//   observer-local encounter.** See "never the Publication Catalog/
//   Repository browser," above — deliberately evaluated, later,
//   unscheduled work.
// - **A comparison surface, a "choose source" panel, or a decentralized
//   lead resolution for an observer-local encounter.** This encounter's
//   own material always resolves through `materialSources.local` alone
//   (see "why this works without the registry," above) — there is no
//   ambiguity to resolve and no lead to choose among.
// - **Any change to `selectEncounter()`, `selectionOutcome`,
//   `resolvedEncounterSelection`, `resolvedSelectionChoice`,
//   `materialInspection`, `materialInspectionRequestId`, or
//   `admitToRepositoryDiscovery()` itself.** All are byte-for-byte
//   unchanged by this milestone — see "a third, genuinely separate
//   selection concept," above.
//
// 0.9.558 — Known Publication Encounter Continuation.
//
// 0.9.557 found EXISTING_RETURN_SEAM: `observerLocalEncounterInspection.
// loading.material`, immediately above, ALREADY resolves to the exact same
// `publisher/Publication.js` instance `ui/components/PublicationCatalog.js`'s
// own Open/Fork/Explore actions need (`documentId`/`id`), and
// `ui/components/PublicationCard.js`'s own Comment action needs (`id`
// alone) — never routed through Repository search. This milestone wires
// that seam to the inspection panel, and nothing else:
//
//   observerLocalEncounterActionablePublication   (computed)   ★ (THIS)
//        = observerLocalEncounterInspection.loading.material, but ONLY
//          once AVAILABLE + VERIFIED (mirrors admitToRepositoryDiscovery()'s
//          own gate verbatim — see that computed's own header)
//                      │
//                      ▼
//   openObserverLocalEncounterPublication() /
//   forkObserverLocalEncounterPublication() /
//   exploreObserverLocalEncounterPublication()   ★ (THIS)
//        each call `openPublicationCommand`/`forkPublicationCommand`/
//        `explorePublicationCommand` — three NEW, optional command props
//        — with that SAME resolved object, never
//        `selectedObserverLocalEncounter.publicationId` alone
//                      │
//                      ▼
//   ui/views/WorldView.js's own wiring (this milestone) reuses
//   PublicationCatalog.js's own `/editor?load=`/`/editor?fork=`
//   navigations verbatim for Open/Fork, and its own existing
//   `focusWorld(documentId)` for Explore — NO new navigation mechanism
//
// Commentary reuses `getPublicationCommentariesCommand`/
// `addPublicationCommentaryCommand` (0.9.291) — the SAME two props this
// file already threads through for the PRIMARY selection — via a
// deliberately SEPARATE `observerLocalEncounterCommentary*` state block,
// mirroring `encounterCommentary*` exactly, one selection concept over,
// for the same reason `selectedObserverLocalEncounter` itself is separate
// from `selectedEncounter` (see the "0.9.554" header above, "a third,
// genuinely separate selection concept").
//
// NEVER A SECOND LOOKUP, NEVER REPOSITORY SEARCH. None of this milestone's
// new code calls `findById()` or reaches into Repository's own free-text
// search machinery (see 0.9.557 Section E/C5 for exactly which two
// modules that means, and why this file still imports neither). The
// identity handed to
// every one of the four actions is always the SAME object instance
// `refreshObserverLocalEncounterInspection()` already wrote, read fresh
// on each click — never re-derived, never re-fetched.
//
// (AS OF 0.9.558) NEITHER OF THESE NEW METHODS CALLS
// `admitToRepositoryDiscovery()` EITHER. This milestone's own
// `observerLocalEncounterActionablePublication` reuses that method's gate
// CONDITION (read-only) but never calls the method itself, and none of
// the three new action methods do either — Repository admission for an
// observer-local encounter is NOT introduced here.
//
// (0.9.558's own closing clause here used to read: "0.9.553's/0.9.554's
// own DELIBERATE_BOUNDARY (an observer-local encounter has no path into
// app-wide Repository discovery) stays exactly where it was." 0.9.595
// SUPERSEDED that boundary — see this file's own "0.9.595" header, above
// `refreshObserverLocalEncounterInspection()` — by adding an
// `admitToRepositoryDiscovery()` call to THAT method, not to any of the
// four methods this "0.9.558" section documents. Every fact this section
// states about ITS OWN four methods remains true unchanged: Open/Fork/
// Explore/Comment still never call `admitToRepositoryDiscovery()`, and
// still never construct, read, or reference a `PlacementRecord`.)
//
// NOT A FOURTH ACTION SET. `openPublicationCommand`/`forkPublicationCommand`/
// `explorePublicationCommand` are plain `(publication) -> void` functions,
// each invoking the IDENTICAL route PublicationCatalog.js's own
// openPublication()/forkPublication()/viewWorld() already build — never a
// parallel implementation, and never constructed by this component
// itself (mirroring every other optional command prop in this file).
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any change to the four route-building functions themselves
//   (`PublicationCatalog.js`'s own openPublication()/forkPublication()/
//   viewWorld(), or `PublicationCard.js`'s own commentary methods).** All
//   are reused exactly as 0.9.557 found them.
// - **A fifth action, a catalog listing, or any browse/search surface for
//   observer-local encounters.** See this file's own "0.9.554" header,
//   "never the Publication Catalog/Repository browser" — unweakened.
// - **Persistence of the encounter past this component's own lifetime, or
//   any change to 0.9.555's World-lifecycle destruction of the
//   session-local encounter store.** Unaffected by this milestone.
//
// 0.9.595 — Admit Verified Observer-Local Publications into Repository
// Discovery.
//
// 0.9.594's own audit (Discovered-Unplaced Publication Actionability
// Product Boundary Audit) found CONTINUITY_GAP_CONFIRMED: a Wanderer who
// encounters a novel, verified Publication through the observer-local path
// can perceive it, understand it, and even Open/Fork/Explore/Comment on it
// (0.9.554/0.9.558) for as long as this component instance survives — but
// has no route whatsoever into `OwnPublicationPanel`'s existing placement
// capability, because `WorldNavigationSession#getPublicationForDocument()`
// resolves through `discoveryProvider.findByDocumentId()`
// (discovery/DecentralizedPublicationDiscoveryProvider.js), and nothing in
// this file's observer-local path had ever called `.add()` on that same
// provider — every one of 0.9.553, 0.9.554, and 0.9.558 deliberately
// withheld it, each correct in its own narrower scope (see the "0.9.554"
// and "0.9.558" headers, above, both now amended in place), but none
// measured this specific downstream cost.
//
// THIS MILESTONE CLOSES PART OF THAT GAP, NOT ALL OF IT — see "A KNOWN,
// PRE-EXISTING LIMIT," below, before assuming the full
// Explore -> OwnPublicationPanel -> Place journey now works: it does not,
// for a structural reason unrelated to this file, that equally affects
// the already-shipped primary/registered encounter family.
//
// THE FIX IS ONE CALL, NOT A NEW MECHANISM.
// `refreshObserverLocalEncounterInspection()` (below) now calls
// `admitToRepositoryDiscovery(result.loading, result.verification)`, on
// `this`, in its own `.then()` callback — the IDENTICAL method
// `refreshMaterialInspection()` (0.9.474) already calls for the PRIMARY
// encounter family, with the IDENTICAL `AVAILABLE + VERIFIED` gate
// (0.9.523), admitting into the IDENTICAL `decentralizedPublicationDiscoveryProvider`
// prop this component already receives (0.9.474) — no new prop, no new
// store, no new provider, no observer-local-specific admission API. This
// is exactly the remedy 0.9.474 already applied to close the structurally
// identical gap 0.9.473 found for the PRIMARY/registered encounter family,
// one milestone later — this milestone applies that same, unmodified
// remedy to its observer-local sibling.
//
// WHAT THIS MEANS FOR THE FOUR ACCEPTANCE FACTS.
//   A. A verified observer-local Publication (`AVAILABLE` load of a real
//      `publisher/Publication.js` instance, `verification.status ===
//      'VERIFIED'`) is now Repository-admissible — `admitToRepositoryDiscovery()`'s
//      own unchanged gate decides exactly as it always has.
//   B. `AVAILABLE + UNVERIFIABLE`, `AVAILABLE + REJECTED`, and
//      `UNAVAILABLE + *` remain excluded — same gate, same file, same
//      method, zero new logic to diverge.
//   C. The admitted object is the EXACT `loading.material` instance
//      `inspectWorldEncounterMaterial()` resolved — never reconstructed
//      from `contentHash`, locator, observer position, `claimedPosition`,
//      or announcement id. `.add()` (discovery/DecentralizedPublicationDiscoveryProvider.js)
//      takes that instance directly and nothing here or downstream
//      rebuilds it.
//   D. `OwnPublicationPanel`'s existing placement action is completely
//      untouched — this milestone changes zero lines in that file, zero
//      lines in application/WorldNavigationSession.js, and adds no second
//      placement mechanism of any kind.
//
// `claimedPosition` REMAINS INERT — THE 0.9.551 BOUNDARY IS UNTOUCHED.
// `admitToRepositoryDiscovery()` never reads `claimedPosition`, never has,
// and this milestone adds no code path that does either. Repository
// admission is a fact about WHICH Publication is now knowable app-wide,
// never a fact about WHERE it claims to belong — that remains exclusively
// the explicit, human "Place" action's own decision, exactly as 0.9.551
// established.
//
// GHOST SUPPRESSION (0.9.570/0.9.571) IS UNTOUCHED. This milestone adds no
// code to `selectedObserverLocalEncounter`, `observerLocalEncounters`, or
// either marker-rendering branch — an observer-local marker is suppressed
// once an authoritative `PlacementRecord` exists for the same Publication,
// and reappears if that record is removed, exactly as before. Repository
// admission and placement remain two independent facts about the same
// Publication; only an explicit "Place" action, still performed entirely
// inside `OwnPublicationPanel`, ever creates the `PlacementRecord` that
// suppression keys on.
//
// FAILURE ISOLATION IS INHERITED, NOT REIMPLEMENTED.
// `admitToRepositoryDiscovery()`'s own try/catch (0.9.474) already
// guarantees a discovery-admission failure can never turn an
// already-successful resolution into a failed one, for either encounter
// family — this milestone adds no second failure-handling path, because
// none is needed: the exact same call, in the exact same position
// relative to the stale-response guard, gets the exact same guarantee for
// free.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A persistent "Discovered, Not Yet Placed" list, or any client-side
//   persistence of the observer-local encounter itself.** The requesting
//   brief's own instruction: test whether Repository admission alone
//   closes the continuity gap before building a second, narrower surface.
//   `selectedObserverLocalEncounter`/`observerLocalEncounters` remain
//   exactly as session-scoped as 0.9.554 left them.
// - **A new `NotificationEvent` kind, a toast, or any other announcement
//   that admission occurred.** Admission is silent, exactly like
//   `refreshMaterialInspection()`'s own admission already is for the
//   primary encounter family.
// - **Automatic placement, or any use of `claimedPosition` for anything.**
//   See "`claimedPosition` remains inert," above.
// - **A new `PlacementRecord` API, a new Repository category, or a new
//   discovery protocol.** Repository admission reuses
//   `DecentralizedPublicationDiscoveryProvider.add()` (0.9.335) verbatim —
//   the identical call, the identical provider, the identical `list()`/
//   `findById()`/`findByDocumentId()` read surface Repository's own
//   search machinery (application/CreateDiscoveryUseCase.js) already
//   uses. This file itself still never imports or calls into that
//   machinery directly — see this file's own "never a second lookup,
//   never Repository search" restraint, unweakened.
//
// A KNOWN, PRE-EXISTING LIMIT THIS MILESTONE DOES NOT CLOSE — READ BEFORE
// ASSUMING "EXPLORE -> OWNPUBLICATIONPANEL -> PLACE" WORKS END TO END.
// `decentralizedPublicationDiscoveryProvider` (the object this milestone's
// one new call admits into) is wired, app-wide, into exactly two things:
// this component's own admission target, and `CreateDiscoveryUseCase.js`'s
// `discoveryProvider` (a `CompositeDiscoveryProvider` of it plus a plain
// `LocalDiscoveryProvider`) — used ONLY to build
// `listPublicationsUseCase`/`findPublicationUseCase`/`searchPublicationsUseCase`
// for Repository's own search UI (`ui/views/WorldView.js`'s own
// `decentralizedDiscoveryProviderForEnrichment`, 0.9.339, "for search-result
// enrichment only," in its own words). `application/WorldNavigationSession.js`'s
// own `_discoveryProvider` — the ONE thing `getPublicationForDocument()`
// (and therefore `OwnPublicationPanel`'s own `publication` prop, per
// `ui/views/WorldView.js`'s `ownPublication` computation) ever reads — is a
// COMPLETELY SEPARATE, freshly-constructed `LocalDiscoveryProvider`, built
// entirely inside `application/CreateWorldViewUseCase.js#execute()`, whose
// own signature has no parameter to receive
// `decentralizedPublicationDiscoveryProvider` at all. Admitting a
// Publication here therefore makes it findable via Repository's own search
// UI, and (already true since 0.9.558, unaffected by this milestone)
// Open/Fork/Explore/Comment-able via the already-resolved object this
// file's own inspection holds — but it does NOT, by itself, make
// `OwnPublicationPanel` resolve it, because `WorldNavigationSession` never
// consults this provider at all. This is not a regression this milestone
// introduces: the IDENTICAL limit already existed, unexamined, for the
// PRIMARY/registered encounter family's own 0.9.474 admission call —
// `tests/WorldEncounterRepositoryContinuityIntegrationBoundaryAudit.test.js`'s
// own "Section F — Openability" proves only `findById`/documentId fidelity
// on the isolated provider instance that test itself constructs, never
// `WorldNavigationSession`/`OwnPublicationPanel` reachability specifically.
// This milestone brings the observer-local path to exact PARITY with that
// already-shipped, already-real capability — genuinely closing the part of
// 0.9.594's own gap that IS closable this way (Repository search
// visibility) — and knowingly leaves the `OwnPublicationPanel`-specific
// part of Acceptance Criterion D open, as a separate, pre-existing,
// not-yet-scoped limitation affecting both encounter families equally, for
// a possible later milestone (composing `WorldNavigationSession`'s own
// `_discoveryProvider` the same way `CreateDiscoveryUseCase.js` already
// composes its own, via the existing, unmodified `CompositeDiscoveryProvider`)
// — never invented or half-built here.
// - **Any change to `admitToRepositoryDiscovery()` itself, `refreshMaterialInspection()`,
//   `refreshComparisonMaterialInspection()`, `observerLocalEncounterActionablePublication`,
//   or any of the four Open/Fork/Explore/Comment action methods 0.9.558
//   added.** All are byte-for-byte unchanged — this milestone adds exactly
//   one call, inside `refreshObserverLocalEncounterInspection()`'s own
//   `.then()` callback, and touches no other method in this file.
//
// See tests/AdmitVerifiedObserverLocalPublicationsIntoRepositoryDiscoveryAudit.test.js
// and docs/Roadmap.md's own 0.9.595 entry.

export default {
    name: 'WorldEncounterCanvas',
    components: { WorldEncounterMarker, WandererMarker, WorldDistributionDialog },
    props: {
        // Exactly `describeWorldEncounterView()`'s own result shape —
        // see this file's own header, "receives the 0.9.2 view directly."
        view: {
            type: Object,
            default: () => ({
                isEmpty: true,
                publicationCount: 0,
                avatarCount: 0,
                totalCount: 0,
                publications: [],
                avatars: []
            })
        },
        // 0.9.13 — optional. A live `WorldDiscoverySourceRegistry`
        // (application/WorldDiscoverySourceRegistry.js). When supplied,
        // this component subscribes to it in `mounted()` and keeps its
        // own `worldView` in sync for as long as it stays mounted — see
        // this file's own header, "0.9.13 — Live World View Registry
        // Subscription." `null` by default: a caller that hands this
        // component an already-computed `view` instead keeps working
        // exactly as before this milestone.
        registry: {
            type: Object,
            default: null
        },
        // 0.9.552 — optional. A live `ObserverLocalEncounterStore`
        // (application/ObserverLocalEncounterStore.js). When supplied, this
        // component subscribes to it in `mounted()` and keeps its own
        // `observerLocalEncounters` in sync for as long as it stays
        // mounted — the SAME "seed, then subscribe" pattern `registry`
        // above already establishes, applied to a second, entirely
        // separate, session-scoped store. `null` by default: a mount with
        // no store supplied renders no observer-local encounters at all,
        // exactly as if this milestone had never shipped. Deliberately
        // NEVER the same object as `registry` — see that file's own
        // header, "a session-scoped store, never the shared
        // WorldDiscoverySourceRegistry" — this component never merges the
        // two or reads one through the other.
        observerLocalEncounterRegistry: {
            type: Object,
            default: null
        },
        // 0.9.39 — optional. A `{ local, peer, decentralized }`-shaped
        // object of `WorldEncounterMaterialSource`-shaped sources, forwarded
        // verbatim to `inspectWorldEncounterMaterial()`. `null` by default
        // — see this file's own header, "no material source, no material
        // inspection." Never constructed by this component itself.
        materialSources: {
            type: Object,
            default: null
        },
        // 0.9.39 — optional. A `WorldEncounterMaterialVerifier`-shaped
        // object, forwarded verbatim to `inspectWorldEncounterMaterial()`
        // as its own `verifier`. `null` by default — a resolved selection
        // whose material loads with no `materialVerifier` supplied still
        // verifies as `UNVERIFIABLE` (0.9.37's own established default),
        // never a thrown error. Never constructed by this component itself.
        materialVerifier: {
            type: Object,
            default: null
        },
        // 0.9.40 — optional. A live `DecentralizedWorldDiscoveryLeadRegistry`
        // (application/DecentralizedWorldDiscoveryLeadRegistry.js, 0.9.26).
        // When supplied, this component subscribes to it in `mounted()` and
        // keeps its own `decentralizedLeadOutcome` in sync for as long as it
        // stays mounted — see this file's own header, "0.9.40 —
        // Decentralized Lead Resolution Integration." `null` by default —
        // see that header's own "no worldDiscoveryLeadRegistry, no lead
        // resolution."
        worldDiscoveryLeadRegistry: {
            type: Object,
            default: null
        },
        // 0.9.40 — optional. Explicit association evidence, forwarded
        // verbatim to `describeDecentralizedWorldEncounterLeadSelectionOutcomeFromRegistry()`.
        // This component never derives this array itself — see this file's
        // own header, "decentralizedLeadAssociations is the caller's own
        // evidence." An empty array by default.
        decentralizedLeadAssociations: {
            type: Array,
            default: () => []
        },
        // 0.9.100 — optional. A `PublicationDistributionLifecycleMemoryStore`-
        // shaped object (duck-typed: `get(publicationId)`/`subscribe(publicationId,
        // listener)`), read for the CURRENT `selectedEncounter` only when its
        // `kind` is `'PUBLICATION'` — see this file's own header, "0.9.100 —
        // Publication Distribution Observation." `null` by default: a mount
        // with no store supplied never renders the Distribution panel and
        // never calls `get()`/`subscribe()`. Never constructed by this
        // component itself, and never written to. AMENDED BY 0.9.433: also
        // duck-typed for an optional `getDiscoveryObservations(publicationId)`
        // — see this file's own header, "Amended by 0.9.433" — read by the
        // new `discoveryObservations` computed, below; a store lacking it
        // still renders exactly today's single Discovery row.
        distributionLifecycleStore: {
            type: Object,
            default: null
        },
        // 0.9.474 — Admit World-Encountered Publications into App-Wide
        // Discovery. Optional. The same app-wide
        // `DecentralizedPublicationDiscoveryProvider` ui/main.js
        // constructs and ui/views/WorldView.js already injects (0.9.339,
        // there for search-result enrichment only) — this component's own
        // admission target, reused verbatim rather than a second provider
        // or a new store; see admitToRepositoryDiscovery() below. NOT the
        // same concept as `distributionCommand`'s own `discoveryProvider`
        // argument, below — that one is the Wanderer's explicit Nostr/
        // Arweave ANNOUNCEMENT substrate choice (a string), never a
        // Repository catalog. `null` by default: a mount with no provider
        // supplied still resolves and renders World Encounter material
        // exactly as before this milestone — only discovery admission is
        // skipped. Never constructed by this component itself.
        decentralizedPublicationDiscoveryProvider: {
            type: Object,
            default: null
        },
        // 0.9.651 — Persist World-Encounter Publication Admissions.
        // Optional. A duck-typed `{ add(publication) }` sink — in
        // production, ui/main.js's own
        // `application/CreateWorldEncounterPublicationAdmissionLogUseCase.js`-composed
        // `LocalWorldEncounterPublicationAdmissionLog`, reconstructed back
        // into `decentralizedPublicationDiscoveryProvider` at startup via
        // `application/ReconstructWorldEncounterPublicationDiscoveryUseCase.js`
        // — never `LocalPublicationCatalog` itself: that class stores
        // signed `core/DecentralizedPublication.js` locator envelopes, a
        // shape World Encounter admission never produces, and handing it a
        // plain `publisher/Publication.js` instance instead is actively
        // unsafe (see that log's own header, and
        // tests/DistributionResultPublicationCenterDeepLinkAudit.test.js's
        // own Section B6). Wholly independent of
        // `decentralizedPublicationDiscoveryProvider` above — a mount can
        // supply either, both, or neither; see `admitToRepositoryDiscovery()`
        // below for how the two are admitted into separately, each behind
        // its own failure isolation. `null` by default: a mount with no log
        // supplied behaves exactly as before this milestone — admission
        // stays in-memory-only. Never constructed by this component itself.
        publicationAdmissionLog: {
            type: Object,
            default: null
        },
        // 0.9.104 — optional. A `(publication, discoveryProvider) -> Promise<PublicationDistributionResult
        // | null>` function, called with exactly the loaded `Publication`
        // domain object for the CURRENTLY selected, local-origin
        // PUBLICATION encounter — see this file's own header, "0.9.104 —
        // World View Publication Distribution Action." `null` by default:
        // a mount with no `distributionCommand` supplied renders no
        // distribution action at all. Never constructed by this component
        // itself — every other input a real distribution needs
        // (`serializedMaterial`, `materialStorage`, `arweaveUploaderOptions`,
        // `nostrPublisherOptions`, `arweaveAnnouncementPublisherOptions`)
        // stays entirely this function's own, caller-side concern.
        //
        // AMENDED BY 0.9.430 — Announcement/Discovery Provider Selection
        // Reachability. `discoveryProvider` is a new, optional second
        // argument — this component's own `selectedDiscoveryProvider`
        // (below), the Wanderer's explicit Nostr/Arweave choice. This
        // component computes no value for it beyond forwarding that page-
        // local string verbatim; see this file's own header, "0.9.430 —
        // Announcement/Discovery Provider Selection Reachability."
        distributionCommand: {
            type: Function,
            default: null
        },
        // 0.9.138 — optional. A `(publication) -> Promise<{ contentReference,
        // announcement }>` function, called with exactly the loaded
        // `Publication` domain object for the CURRENTLY selected,
        // local-origin PUBLICATION encounter — the SAME `distributablePublication`
        // `distributionCommand` above already reads, one collaborator over.
        // `null` by default: a mount with no `snapshotDistributionCommand`
        // supplied renders no Snapshot Distribution panel at all. Never
        // constructed by this component itself, and never called with
        // anything but that one `Publication` argument — turning it into
        // bytes stays entirely this function's own, caller-side concern
        // (see `ui/views/WorldView.js`'s own `distributeWorldEncounterSnapshot()`).
        //
        // UNLIKE `distributionCommand`, THIS COMPONENT DOES STORE THE
        // RESOLVED RESULT — see `snapshotDistributionResult`, below. The
        // Signed Claim family's own result reaches this component only
        // through `distributionLifecycleStore`'s live subscription (see
        // "0.9.104 — World View Publication Distribution Action," above);
        // `application/SnapshotDistributionCommand.js`'s own header is
        // explicit that it introduces "no result describer, no new status
        // vocabulary" and no lifecycle store of any kind — the resolved
        // `{ contentReference, announcement }` object IS the only record of
        // what just happened, so this component holds onto it directly,
        // exactly as received, rather than inventing an observation channel
        // that does not exist for this family.
        snapshotDistributionCommand: {
            type: Function,
            default: null
        },
        // Bug fix — the eligible-and-currently-registered Snapshot
        // Distribution content backends ('ipfs'/'ar'), mirroring
        // OwnPublicationPanel.js's own identical prop — see that file's
        // own comment and ui/views/WorldView.js's own injection comment.
        snapshotDistributionStorageTypes: {
            type: Array,
            default: () => []
        },
        // 0.9.667 — Role Provider Preference As Dropdown Default. This
        // replica's own resolved ANNOUNCEMENT_AND_DISCOVERY/CONTENT
        // preferences, ui/main.js's own `defaultAnnouncementDiscoveryProvider`/
        // `defaultContentDistributionProvider`, forwarded through
        // ui/views/WorldView.js exactly like `snapshotDistributionStorageTypes`
        // immediately above already is. Read only to seed
        // `selectedDiscoveryProvider`/`selectedDistributionStorageChoice`'s
        // own initial value, below — never re-read afterward, and never
        // used to override a choice already made on this component. See
        // application/PreferredProviderDefaultChoice.js's own header.
        //
        // `selectedDiscoveryProvider` is now read by "Distribute Snapshot"
        // too — see WorldDistributionDialog.js's own header.
        defaultDiscoveryDistributionProvider: {
            type: String,
            default: 'nostr'
        },
        defaultContentDistributionProvider: {
            type: String,
            default: null
        },
        // 0.9.111 — optional. A `({ objectId, discoveryTag }) -> Promise<{
        // discovery, resolution, inspection }>` function — see this file's
        // own header, "discoveryCommand is the one new collaborator this
        // milestone introduces." `null` by default: a mount with no
        // `discoveryCommand` supplied renders no Discover Publication panel
        // at all, the same "no collaborator, no capability" restraint every
        // other optional prop on this component already holds. Never
        // constructed by this component itself.
        discoveryCommand: {
            type: Function,
            default: null
        },
        // 0.9.357 — optional. The canonical Publication discovery campaign
        // tag (ui/main.js's own 'forkbuild-publication', forwarded through
        // ui/views/WorldView.js) used ONLY to seed discoveryTag's own
        // initial value in data(), below — never read again afterward. A
        // mount with no defaultDiscoveryTag supplied (e.g. every existing
        // test constructing this component directly) keeps discoveryTag's
        // own prior blank default, unchanged. See this file's own header,
        // "0.9.111 — ephemeral UI state only": discoveryTag remains the
        // Wanderer's own freely editable typed input; this prop changes
        // only where that input starts.
        defaultDiscoveryTag: {
            type: String,
            default: ''
        },
        // 0.9.144 — optional. A `(publication) -> Promise<{ outcome, bytes,
        // candidates, locator, storage, reason }>` function, called with
        // exactly the loaded `Publication` domain object for the CURRENTLY
        // selected, local-origin PUBLICATION encounter — the SAME
        // `distributablePublication` `distributionCommand`/
        // `snapshotDistributionCommand` above already read, and the SAME
        // contract `OwnPublicationPanel.js`'s own `discoverSnapshotCommand`
        // prop already is (in the real running app, the identical function
        // instance — see this file's own header, "0.9.144 — World View
        // Snapshot Attribution Integration"). `null` by default: a mount
        // with no `discoverSnapshotCommand` supplied renders no Snapshot
        // Discovery/Attribution panel at all. Never constructed by this
        // component itself.
        discoverSnapshotCommand: {
            type: Function,
            default: null
        },
        // 0.9.291 — optional. A `(publicationId) -> PublicationCommentary[]`
        // function, or `null` when the capability is unavailable — the
        // IDENTICAL prop shape `ui/components/OwnPublicationPanel.js`'s own
        // `getPublicationCommentariesCommand` already is (0.9.248), and in
        // the real running app the SAME function instance, forwarded by
        // `ui/views/WorldView.js` — see this file's own header, "0.9.291."
        // Synchronous; this component awaits nothing and shows no
        // "loading" state for it. Never constructed by this component
        // itself.
        getPublicationCommentariesCommand: {
            type: Function,
            default: null
        },
        // 0.9.291 — optional. A `({ publicationId, content }) ->
        // { commentary, isNew }` function, or `null` when the capability
        // is unavailable — mirrors `getPublicationCommentariesCommand`
        // immediately above, one action over. Also synchronous. Sends
        // only `{ publicationId, content }` — see this file's own header,
        // "authorship is never UI-supplied."
        addPublicationCommentaryCommand: {
            type: Function,
            default: null
        },
        // 0.9.291 — optional. The CURRENT viewer's own identityId, or
        // `null` when nobody is signed in — mirrors
        // `OwnPublicationPanel.js`'s own identical `viewerIdentityId`
        // prop. Read only to decide whether to show the compose form or a
        // sign-in hint; never sent to `addPublicationCommentaryCommand`.
        viewerIdentityId: {
            type: String,
            default: null
        },
        // 0.9.558 — Known Publication Encounter Continuation. Optional. A
        // `(publication) -> void` function, or `null` when the capability
        // is unavailable — called with the SAME already-resolved
        // `publisher/Publication.js` instance
        // `observerLocalEncounterActionablePublication` (below) already
        // produces, never a bare id. In the real running app,
        // `ui/views/WorldView.js` wires this to the IDENTICAL
        // `/editor?load=<documentId>` navigation
        // `ui/components/PublicationCatalog.js`'s own `openPublication(pub)`
        // already performs — see 0.9.557's own Section A1/E for why that
        // route, built from an already-in-hand object, is the correct
        // reuse target. Never constructed by this component itself.
        openPublicationCommand: {
            type: Function,
            default: null
        },
        // 0.9.558 — optional. A `(publication) -> void` function mirroring
        // `openPublicationCommand` immediately above, one action over —
        // the SAME `/editor?fork=<documentId>&publication=<id>` navigation
        // `PublicationCatalog.js`'s own `forkPublication(pub)` already
        // performs (0.9.557 Section A2/E).
        forkPublicationCommand: {
            type: Function,
            default: null
        },
        // 0.9.558 — optional. A `(publication) -> void` function mirroring
        // `openPublicationCommand` above, one action over — the SAME
        // `/world/<documentId>` navigation `PublicationCatalog.js`'s own
        // `viewWorld(pub)` already performs, and the SAME destination
        // `ui/views/WorldView.js`'s own `focusWorld(documentId)` already
        // reaches (0.9.557 Section A3/F1/F2) — which function actually
        // executes it is `WorldView.js`'s own choice, not this
        // component's concern.
        explorePublicationCommand: {
            type: Function,
            default: null
        }
    },
    data() {
        return {
            // Page-local only — see this file's own header, "the
            // Wanderer's position is page-local UI state."
            wandererPosition: { x: 0, y: 0, z: 0 },
            // Page-local only — see this file's own header, "0.9.4 —
            // World Encounter Selection." `null` until the Wanderer
            // selects a marker; thereafter exactly `{ kind, objectId }`.
            selectedEncounter: null,
            // 0.9.13 — page-local, registry-derived World View snapshot.
            // `null` until `mounted()` seeds it (only ever happens when
            // a `registry` prop was supplied); stays `null` for the
            // lifetime of a mount driven purely by the `view` prop
            // instead. See `effectiveView`, below.
            worldView: null,
            // 0.9.13 — the `unsubscribe` function `registry.subscribe()`
            // itself returned, held only so `beforeUnmount()` can call
            // it. `null` whenever this mount never subscribed.
            unsubscribeWorldRegistry: null,
            // 0.9.552 — page-local, `observerLocalEncounterRegistry`-derived
            // snapshot — the SAME "seed, then subscribe" shape `worldView`
            // above already holds, one store over. `[]` until `mounted()`
            // seeds it (only ever happens when an
            // `observerLocalEncounterRegistry` prop was supplied).
            observerLocalEncounters: [],
            // 0.9.552 — the `unsubscribe` function
            // `observerLocalEncounterRegistry.subscribe()` itself returned,
            // held only so `beforeUnmount()` can call it. `null` whenever
            // this mount never subscribed.
            unsubscribeObserverLocalEncounterRegistry: null,
            // 0.9.554 — Observer-Local Encounter Inspection Capability.
            // The Wanderer's own explicit pick of ONE observer-local
            // encounter to inspect — `{ publicationId, contentHash }`,
            // taken verbatim from a `projectedObserverLocalEncounters` row.
            // `null` until `selectObserverLocalEncounter()` writes it.
            // Deliberately NEVER `selectedEncounter` itself — see this
            // file's own "0.9.554" header for why an observer-local
            // encounter gets its own, separate selection concept rather
            // than being folded into the authoritative one.
            selectedObserverLocalEncounter: null,
            // 0.9.554 — orchestration-derived material/verification
            // snapshot for the CURRENT `selectedObserverLocalEncounter`,
            // mirroring `materialInspection` (0.9.39) exactly, one
            // selection concept over. `null` until
            // `refreshObserverLocalEncounterInspection()` writes it; stays
            // `null` whenever there is no current selection or no
            // `materialSources`.
            observerLocalEncounterInspection: null,
            // 0.9.554 — mirrors `materialInspectionRequestId` (0.9.39)
            // exactly, one selection concept over: a monotonically
            // increasing counter guarding against a stale
            // `inspectWorldEncounterMaterial()` response overwriting a
            // newer one (bumped on every fresh selection, every dismissal,
            // and on unmount).
            observerLocalEncounterInspectionRequestId: 0,
            // 0.9.558 — mirrors `encounterCommentaryOpen` (0.9.291) exactly,
            // one selection concept over: `true` for as long as the
            // Wanderer has explicitly clicked "Comment" for the CURRENT
            // `selectedObserverLocalEncounter`. Deliberately a SEPARATE
            // field from `encounterCommentaryOpen` — see this file's own
            // "0.9.554" header, "a third, genuinely separate selection
            // concept" — so both panels' own commentary sections can be
            // open independently, exactly like the two selections
            // themselves already can be.
            observerLocalEncounterCommentaryOpen: false,
            // 0.9.558 — mirrors `encounterCommentaries` (0.9.291) exactly,
            // one selection concept over. Reset to `[]` on every fresh
            // `selectObserverLocalEncounter()` call and on dismissal.
            observerLocalEncounterCommentaries: [],
            // 0.9.558 — mirrors `newEncounterCommentaryText` (0.9.291)
            // exactly, one selection concept over.
            newObserverLocalEncounterCommentaryText: '',
            // 0.9.558 — mirrors `encounterCommentarySubmitting` (0.9.291)
            // exactly, one selection concept over.
            observerLocalEncounterCommentarySubmitting: false,
            // 0.9.558 — mirrors `encounterCommentaryError` (0.9.291)
            // exactly, one selection concept over.
            observerLocalEncounterCommentaryError: null,
            // 0.9.558 — mirrors `pendingEncounterCommentaryDraft` (0.9.542)
            // exactly, one selection concept over.
            pendingObserverLocalEncounterCommentaryDraft: null,
            // 0.9.20 — page-local, registry-derived classification of the
            // CURRENT `selectedEncounter`. `null` until `refreshSelectionOutcome()`
            // writes it (see this file's own header, "selectionOutcome is
            // data, written by refreshSelectionOutcome() — never a
            // computed"); stays `null` for the lifetime of a mount with no
            // `selectedEncounter` or no `registry`.
            selectionOutcome: null,
            // 0.9.20 — the Wanderer's own explicit pick among an
            // `'AMBIGUOUS'` `selectionOutcome`'s own candidates, written
            // only by `chooseSelectionOrigin()`. `null` until chosen, and
            // reset to `null` by `selectEncounter()` on every new
            // selection — see this file's own header, "resolvedSelectionChoice
            // is the Wanderer's own explicit pick."
            resolvedSelectionChoice: null,
            // 0.9.39 — page-local, orchestration-derived material/verification
            // snapshot for the CURRENT `resolvedEncounterSelection`. `null`
            // until `refreshMaterialInspection()` writes it; stays `null`
            // whenever there is no resolved selection or no `materialSources`
            // — see this file's own header, "no material source, no material
            // inspection."
            materialInspection: null,
            // 0.9.39 — a monotonically increasing counter, bumped on every
            // call to `refreshMaterialInspection()` (including on unmount).
            // A resolved `inspectWorldEncounterMaterial()` Promise is only
            // ever written to `materialInspection` when it is still the
            // most recent request — see this file's own header, "a request
            // counter guards against a stale async response."
            materialInspectionRequestId: 0,
            // 0.9.40 — page-local, lead-registry-derived classification of
            // the CURRENT `selectedEncounter` — independent of
            // `selectionOutcome`/`resolvedEncounterSelection`; see this
            // file's own header, "0.9.40 — Decentralized Lead Resolution
            // Integration." `null` until `refreshDecentralizedLeadOutcome()`
            // writes it; stays `null` for the lifetime of a mount with no
            // `selectedEncounter` or no `worldDiscoveryLeadRegistry`.
            decentralizedLeadOutcome: null,
            // 0.9.40 — the Wanderer's own explicit pick among an
            // `'AMBIGUOUS'` `decentralizedLeadOutcome`'s own candidates,
            // written only by `chooseDecentralizedLead()`. `null` until
            // chosen, and reset to `null` by `selectEncounter()` on every
            // new selection — mirrors `resolvedSelectionChoice` (0.9.20)
            // exactly, one layer over, for leads instead of sources.
            resolvedLeadChoice: null,
            // 0.9.40 — the `unsubscribe` function
            // `worldDiscoveryLeadRegistry.subscribe()` itself returned, held
            // only so `beforeUnmount()` can call it. `null` whenever this
            // mount never subscribed to a lead registry.
            unsubscribeWorldDiscoveryLeadRegistry: null,
            // 0.9.100 — page-local, store-derived lifecycle description for
            // the CURRENT `selectedEncounter`, exactly the `{ material,
            // discovery }` shape `describePublicationDistributionLifecycle()`
            // (0.9.50) already produces. `null` until
            // `refreshDistributionLifecycle()` writes it; stays `null`
            // whenever there is no current `selectedEncounter`, its `kind`
            // isn't `'PUBLICATION'`, no `distributionLifecycleStore` was
            // supplied, or the store itself holds nothing yet for this
            // publication — see this file's own header, "0.9.100 —
            // Publication Distribution Observation."
            distributionLifecycle: null,
            // 0.9.100 — the `unsubscribe` function
            // `distributionLifecycleStore.subscribe()` itself returned, held
            // only so `beforeUnmount()` (and every fresh
            // `refreshDistributionLifecycle()` call) can call it. `null`
            // whenever this mount never subscribed.
            unsubscribeDistributionLifecycle: null,
            // 0.9.104 — ephemeral UI interaction state only, never a
            // lifecycle fact — see this file's own header, "execution is
            // ephemeral UI state." `true` for exactly as long as a call to
            // `distributionCommand` is in flight for the current selection.
            distributionExecuting: false,
            // 0.9.104 — a plain-text notice for the most recent genuine
            // `distributionCommand` rejection (or synchronous construction
            // throw), or `null` when there is none to show. Reset on every
            // fresh selection and on every new attempt.
            distributionError: null,
            // 0.9.104 — bumped on every call to `distributeSelectedPublication()`,
            // on every fresh selection, and on unmount — see this file's own
            // header, "a distributionRequestId counter guards against a
            // stale response," mirroring `materialInspectionRequestId`
            // (0.9.39) exactly, one layer over.
            distributionRequestId: 0,
            // 0.9.672 — World View Distribution Dialog. Purely a "is the
            // popup currently open" flag, the same shape every other
            // popup-visibility boolean in this codebase already uses —
            // see WorldDistributionDialog.js's own header. Never read by,
            // and never written from, either distribution action itself,
            // and never shared with this file's own, entirely separate
            // publicationDiscoveryOpen popup.
            distributionDialogOpen: false,
            // 0.9.430 — the Wanderer's own freely editable choice of
            // Announcement/Discovery substrate for the NEXT "Distribute
            // Publication" click, page-local UI state only — exactly like
            // `wandererPosition`/`selectedEncounter` above, never persisted,
            // never synchronized. See this file's own header, "0.9.430 —
            // Announcement/Discovery Provider Selection."
            //
            // 0.9.667 — opens on the injected `defaultDiscoveryDistributionProvider`
            // prop above (this replica's own saved preference, resolved by
            // ui/main.js, or 'nostr' when none is on file) instead of
            // hardcoding 'nostr' directly — matching the identical default
            // `PublicationDistributionRuntimeComposition.js` itself already
            // holds, so a mount that never touches this control, and whose
            // parent never supplies the prop, behaves exactly as every
            // pre-0.9.667 mount already did.
            selectedDiscoveryProvider: this.defaultDiscoveryDistributionProvider || 'nostr',
            // `selectedDiscoveryProvider` immediately above is shared by
            // "Distribute Publication" AND "Distribute Snapshot" (and the
            // combined action) — see WorldDistributionDialog.js's own
            // header, "ONE SHARED SETTINGS BLOCK FOR BOTH PROTOCOLS."
            // 0.9.138 — ephemeral UI interaction state only, mirroring
            // `distributionExecuting`/`distributionError`/`distributionRequestId`
            // (0.9.104) exactly, one collaborator over. `true` for exactly
            // as long as a call to `snapshotDistributionCommand` is in
            // flight for the current selection.
            snapshotDistributionExecuting: false,
            // 0.9.138 — a plain-text notice for the most recent genuine
            // `snapshotDistributionCommand` rejection (or synchronous
            // construction throw), or `null` when there is none to show.
            // Reset on every fresh selection and on every new attempt.
            snapshotDistributionError: null,
            // 0.9.138 — bumped on every call to `distributeSelectedSnapshot()`,
            // on every fresh selection, and on unmount — guards against a
            // stale response exactly as `distributionRequestId` already
            // does, one collaborator over.
            snapshotDistributionRequestId: 0,
            // 0.9.138 — the composed command's own resolved `{
            // contentReference, announcement }` result, rendered verbatim
            // below — see this component's own `snapshotDistributionCommand`
            // prop comment, "unlike distributionCommand, this component
            // does store the resolved result." `null` until a call
            // resolves; reset on every fresh selection and on every new
            // attempt, exactly like `snapshotDistributionError`.
            snapshotDistributionResult: null,
            // Backs the selectedDistributionStorage computed below — the
            // one Storage choice both distribution actions read. `null`
            // until a Wanderer explicitly picks a storage.
            selectedDistributionStorageChoice: null,
            // The Remote Pinning (e.g. Pinata) endpoint/credential draft,
            // shown only when selectedDistributionStorage === 'remote-pinning',
            // shared by both distribution actions. A plain object, never a
            // class instance — this component still imports no
            // application/ class of its own. Never persisted anywhere.
            remotePinningDraft: { endpoint: '', credential: '', requestField: '', responseField: '' },
            // 0.9.144 — ephemeral UI interaction state only, mirroring
            // `snapshotDistributionExecuting`/`snapshotDistributionError`/
            // `snapshotDistributionRequestId` (0.9.138) exactly, one action
            // over. `true` for exactly as long as a call to
            // `discoverSnapshotCommand` is in flight for the current
            // selection.
            snapshotDiscoveryExecuting: false,
            // 0.9.144 — a plain-text notice for the most recent genuine
            // `discoverSnapshotCommand` rejection (or synchronous
            // construction throw), or `null` when there is none to show.
            // Reset on every fresh selection and on every new attempt.
            snapshotDiscoveryError: null,
            // 0.9.144 — bumped on every call to `discoverSelectedSnapshot()`,
            // on every fresh selection, and on unmount — guards against a
            // stale response exactly as `snapshotDistributionRequestId`
            // already does, one action over.
            snapshotDiscoveryRequestId: 0,
            // 0.9.144 — the composed command's own resolved `{ outcome,
            // bytes, candidates, locator, storage, reason }` result,
            // rendered verbatim below. `null` until a call resolves; reset
            // on every fresh selection and on every new attempt.
            snapshotDiscoveryResult: null,
            // 0.9.144 — `resolveSnapshotPublicationAttribution(publication,
            // snapshotDiscoveryResult)`'s own result — a SEPARATE field,
            // never a replacement of `snapshotDiscoveryResult`, mirroring
            // `OwnPublicationPanel.js`'s own identical restraint. `null`
            // until a discovery call resolves; written only by
            // `discoverSelectedSnapshot()`, below, in the same `.then()` as
            // `snapshotDiscoveryResult` itself.
            snapshotAttributionResult: null,
            // 0.9.360 — Relocate Publication Discovery to a Secondary
            // Diagnostic Surface. Purely a "is the popup currently open"
            // flag — see this file's own 0.9.360 header. Never read by, and
            // never written from, `discoverPublication()` or
            // `selectDiscoveredPublication()`; closing/reopening the popup
            // never resets `discoveryObjectId`/`discoveryTag`/
            // `discoveryResult`/`selectedDiscoveredPublication`, below.
            publicationDiscoveryOpen: false,
            // 0.9.111 — the Wanderer's own typed discovery input, page-local
            // UI state only — see this file's own header, "ephemeral UI
            // state only." Never persisted, never validated beyond a plain
            // trim/empty check in `discoverPublication()` below.
            discoveryObjectId: '',
            // 0.9.357 — seeded from defaultDiscoveryTag (the canonical
            // 'forkbuild-publication' campaign tag, when supplied) rather
            // than always starting blank — read exactly once, at mount, the
            // same "initial value only" restraint every other data() field
            // seeded from a prop already holds on this component. Still a
            // plain, freely editable v-model field afterward; see this
            // file's own header, "0.9.357 — Wire Canonical Publication
            // Discovery Tag into World View."
            discoveryTag: this.defaultDiscoveryTag,
            // 0.9.111 — `true` for exactly as long as a call to
            // `discoveryCommand` is in flight — mirrors `distributionExecuting`
            // exactly.
            discovering: false,
            // 0.9.111 — a plain-text notice for the most recent genuine
            // `discoveryCommand` rejection (or synchronous construction
            // throw), or `null` when there is none to show — mirrors
            // `distributionError` exactly.
            discoveryError: null,
            // 0.9.111 — the composed capability's own `{ discovery,
            // resolution, inspection }` result, rendered verbatim below
            // using only the existing status vocabulary — see this file's
            // own header, "the existing inspection mechanism stays
            // canonical." `null` until a call resolves.
            discoveryResult: null,
            // 0.9.111 — bumped on every call to `discoverPublication()` and
            // on unmount — mirrors `distributionRequestId` exactly, guarding
            // against a stale response; see this file's own header,
            // "ephemeral UI state only."
            discoveryRequestId: 0,
            // 0.9.113 — the Wanderer's own explicit pick of a successfully
            // discovered, VERIFIED Publication — see this file's own
            // header, "0.9.113 — World View Discovered Publication
            // Selection." `null` until `selectDiscoveredPublication()`
            // writes it; that method is this field's only writer.
            // Deliberately never reset by `selectEncounter()` or a fresh
            // `discoverPublication()` call — see that header's own
            // "selectedDiscoveredPublication never auto-resets."
            selectedDiscoveredPublication: null,
            // 0.9.182 — `true` for exactly as long as the Wanderer has
            // clicked "Compare with…" but not yet clicked a second marker.
            // While `true`, `selectEncounter()` routes the next marker
            // click to `selectComparisonEncounter()` instead of overwriting
            // `selectedEncounter` — see this file's own header, "reuses the
            // existing marker-click path."
            armedForComparisonSelection: false,
            // 0.9.182 — page-local only, exactly like `selectedEncounter`
            // itself: `null` until the Wanderer picks a second Publication
            // to compare `selectedEncounter` against; thereafter exactly
            // `{ kind, objectId }`. Written only by
            // `selectComparisonEncounter()`/`clearComparisonSelection()`.
            comparisonEncounter: null,
            // 0.9.182 — page-local, registry-derived classification of the
            // CURRENT `comparisonEncounter`, mirroring `selectionOutcome`
            // (0.9.20) exactly, one selection over. `null` until
            // `refreshComparisonSelectionOutcome()` writes it; stays `null`
            // for the lifetime of a mount with no `comparisonEncounter` or
            // no `registry`.
            comparisonSelectionOutcome: null,
            // 0.9.183 — `true` for as long as the Wanderer has explicitly
            // clicked "View Snapshot" for the CURRENT primary selection.
            // Written only by `openSnapshotContentView()`/
            // `closeSnapshotContentView()`, and reset to `false` on every
            // fresh `selectEncounter()` call — see this file's own
            // "0.9.183" header, "snapshotContentViewOpen is reset on every
            // fresh primary selection." Whether the Content View panel
            // actually renders also depends on the LIVE
            // `selectedSnapshotContentView` computed, below — this flag
            // alone never fabricates content that isn't genuinely
            // available.
            snapshotContentViewOpen: false,
            // 0.9.184 — mirrors `materialInspection` (0.9.39) exactly, one
            // selection over, for `comparisonEncounter` instead of
            // `selectedEncounter`. `null` until `refreshComparisonMaterialInspection()`
            // writes it; see this file's own "0.9.184" header, "extending
            // material loading to the comparison target."
            comparisonMaterialInspection: null,
            // 0.9.184 — mirrors `materialInspectionRequestId` (0.9.39)
            // exactly, one selection over: guards against a stale async
            // `inspectWorldEncounterMaterial()` response overwriting a newer
            // one, or writing after this component has since unmounted.
            comparisonMaterialInspectionRequestId: 0,
            // 0.9.184 — `true` for as long as the Wanderer has explicitly
            // clicked "View Content Comparison" for the CURRENT primary
            // selection/comparison-target pair. Written only by
            // `openContentComparisonView()`/`closeContentComparisonView()`,
            // and reset to `false` on every fresh primary selection,
            // comparison-target selection, or `clearComparisonSelection()`
            // call — mirrors `snapshotContentViewOpen`'s own reset
            // discipline, one panel over.
            contentComparisonViewOpen: false,
            // 0.9.291 — `true` for as long as the Wanderer has explicitly
            // clicked "Comment" for the CURRENT primary selection. Written
            // only by `toggleEncounterCommentary()`, and reset to `false`
            // on every fresh `selectEncounter()` call — mirrors
            // `snapshotContentViewOpen`'s (0.9.183) own reset discipline,
            // one panel over. See this file's own "0.9.291" header,
            // "collapsed by default, loaded only on first expansion."
            encounterCommentaryOpen: false,
            // 0.9.291 — every PublicationCommentary
            // `getPublicationCommentariesCommand` returned for the
            // current selection's own publicationId, in the EXACT order
            // it returned them — no sort performed here, mirroring
            // `OwnPublicationPanel.js`'s/`PublicationCard.js`'s own
            // identical restraint. Reset to `[]` on every fresh selection.
            encounterCommentaries: [],
            // 0.9.291 — the current compose draft. Reset to `''` on every
            // fresh selection and on a successful submission; left
            // UNCHANGED on a failed one — see `submitEncounterCommentary()`,
            // below.
            newEncounterCommentaryText: '',
            // 0.9.291 — guards against a second, overlapping submission —
            // mirrors `publicationCommentarySubmitting`/
            // `commentarySubmitting` one file over, each.
            encounterCommentarySubmitting: false,
            // 0.9.291 — the most recent read OR create failure's own
            // plain-text notice, or `null`. A failed READ leaves
            // `encounterCommentaries` exactly as it was; a failed CREATE
            // leaves `encounterCommentaries`/`newEncounterCommentaryText`
            // exactly as they were — see `refreshEncounterCommentaries()`/
            // `submitEncounterCommentary()`, below.
            encounterCommentaryError: null,
            // 0.9.542 — Publication Commentary Submission Experience
            // Product Reassessment. Mirrors `PublicationCard.js`'s/
            // `OwnPublicationPanel.js`'s own `pendingCommentaryDraft`
            // exactly, one surface over — see either file's own 0.9.542
            // header. `{ content, commentaryId, createdAt }` for the
            // CURRENT in-progress compose attempt, or `null`; reset on
            // every fresh selection exactly where `encounterCommentaries`
            // already is.
            pendingEncounterCommentaryDraft: null
        };
    },
    computed: {
        // The one Arweave/IPFS/Remote-Pinning choice the Distribution
        // dialog's shared Storage picker shows, read by both
        // distributeSelectedPublication() (as its Material storage) and
        // distributeSelectedSnapshot() (as its Snapshot storage) —
        // mirroring OwnPublicationPanel.js's own identical
        // `distributionStorage` computed exactly, one host component over.
        // Snapshot-capable: limited to `snapshotDistributionStorageTypes`
        // plus 'remote-pinning', falling back to that list's first entry;
        // Publication-only: all three Material storages, falling back to
        // 'ar'. This replica's own saved Content preference (0.9.667) wins
        // over either fallback whenever it names an eligible backend.
        selectedDistributionStorage: {
            get() {
                const eligible = this.snapshotDistributionCommand
                    ? [...this.snapshotDistributionStorageTypes, 'remote-pinning']
                    : ['ar', 'ipfs', 'remote-pinning'];
                return this.selectedDistributionStorageChoice
                    || resolveSavedProviderDefault(this.defaultContentDistributionProvider, eligible, null)
                    || (this.snapshotDistributionCommand ? this.snapshotDistributionStorageTypes[0] : null)
                    || 'ar';
            },
            set(value) {
                this.selectedDistributionStorageChoice = value;
            }
        },
        // 0.9.13 — registry, when supplied, wins; see this file's own
        // header, "`effectiveView`: registry, when supplied, wins."
        effectiveView() {
            return this.registry ? this.worldView : this.view;
        },
        publicationRows() {
            return this.effectiveView && Array.isArray(this.effectiveView.publications) ? this.effectiveView.publications : [];
        },
        avatarRows() {
            return this.effectiveView && Array.isArray(this.effectiveView.avatars) ? this.effectiveView.avatars : [];
        },
        projectedPublications() {
            return this.publicationRows.map((row) => ({
                objectId: row.objectId,
                label: row.title,
                x: projectToCanvas(row.x),
                y: projectToCanvas(row.z)
            }));
        },
        projectedAvatars() {
            return this.avatarRows.map((row) => ({
                objectId: row.objectId,
                label: row.displayName,
                x: projectToCanvas(row.x),
                y: projectToCanvas(row.z)
            }));
        },
        // 0.9.552 — entirely independent of `publicationRows`/`effectiveView`
        // above: these rows come from `observerLocalEncounters`
        // (`observerLocalEncounterRegistry`-derived, never `registry`/`view`),
        // and are projected the SAME way `projectedPublications` already
        // projects world x/z onto screen x/y — see this file's own header,
        // "0.9.552," for why this stays a THIRD, separate projected array
        // rather than being merged into `projectedPublications`: an
        // observer-local encounter carries no `title`/`publisherIdentity`/
        // `isSigned`/anchor or placement count of any kind (it was never
        // joined against a WorldPlacement in the first place), so treating
        // it as just another publication row would either fabricate those
        // fields or silently render blanks for them.
        //
        // 0.9.570 — AMENDED. Now also filters out any row whose
        // `publicationId` already has an authoritative `publicationRows`
        // entry (matched by `objectId`, the only identity field the two
        // sides share — see 0.9.569 Section E/F, `contentHash` and
        // coordinate (dis)agreement each independently produce a wrong
        // result on a real fixture). 0.9.568 Section D found that a
        // Publication discovered while UNPLACED, then registered within
        // the SAME session, otherwise renders BOTH a permanent marker AND
        // a stale observer-local ghost, simultaneously, for the rest of
        // that session; 0.9.569 located this exact computed as the
        // narrowest seam capable of the fix (Section J) and confirmed it
        // introduces no new race and cannot corrupt an already-open
        // inspection (Sections H/I). This filter suppresses only the
        // RENDERED row — it never writes to `ObserverLocalEncounterStore`,
        // never touches `selectedObserverLocalEncounter`/
        // `observerLocalEncounterInspection` (an inspection already open
        // on a converging encounter is deliberately left alone; see
        // 0.9.569 Section H — the existing product vocabulary already
        // disclaims permanence for it, so a stale-but-still-open panel is
        // not a correctness bug), and is purely reactive: a publicationId
        // that leaves `publicationRows` again (an existing lifecycle path,
        // unrelated to this milestone) makes its observer-local marker
        // reappear on the very next recomputation, never a one-way
        // "once placed, forever hidden" flag.
        projectedObserverLocalEncounters() {
            // `|| []` — never live in a real mount (`publicationRows` above
            // always returns an array), but several pre-existing test
            // harnesses across this codebase call this computed directly,
            // via `WorldEncounterCanvas.computed.projectedObserverLocalEncounters.call(ctx)`,
            // without first priming `ctx.publicationRows` the way a real
            // Vue instance's own reactivity would; this mirrors
            // `publicationRows`'s own existing defensive style immediately
            // above rather than requiring every such harness to change.
            const placedPublicationIds = new Set((this.publicationRows || []).map((row) => row.objectId));
            return this.observerLocalEncounters
                .filter((encounter) => !placedPublicationIds.has(encounter.publicationId))
                .map((encounter) => ({
                    publicationId: encounter.publicationId,
                    contentHash: encounter.contentHash,
                    x: projectToCanvas(encounter.position.x),
                    y: projectToCanvas(encounter.position.z)
                }));
        },
        projectedWanderer() {
            return {
                x: projectToCanvas(this.wandererPosition.x),
                y: projectToCanvas(this.wandererPosition.z)
            };
        },
        isWorldEmpty() {
            return this.publicationRows.length === 0 && this.avatarRows.length === 0;
        },
        // 0.9.18 — 0.9.16's own read model, joined against this
        // component's own already-existing `selectedEncounter`/
        // `effectiveView`. `null` whenever there is no selection, and
        // also `null` whenever the selected object has left the World
        // since it was selected — see this file's own header, "a stale
        // selection renders unavailable." Local, derived, computed state
        // only; never a new page-local data field, never a new
        // `application/` module.
        selectedEncounterInspection() {
            return describeWorldEncounterInspection({ selectedEncounter: this.selectedEncounter, view: this.effectiveView });
        },
        // 0.9.18 — `selectedEncounterInspection.publisherIdentity`
        // rendered as its own verbatim structure, never one cherry-picked
        // field. See this file's own header, "publisherIdentity renders
        // as its own structure."
        selectedEncounterInspectionPublisherIdentityLabel() {
            if (!this.selectedEncounterInspection || this.selectedEncounterInspection.kind !== 'PUBLICATION') {
                return '';
            }
            const publisherIdentity = this.selectedEncounterInspection.publisherIdentity;
            return publisherIdentity ? JSON.stringify(publisherIdentity) : '';
        },
        // 0.9.20 — the one resolved `{ kind, objectId, origin }` a future,
        // unscheduled material-loading step would actually consume. See
        // this file's own header, "resolvedEncounterSelection is the one
        // computed value..." A candidate the Wanderer already chose is
        // re-checked against `selectionOutcome`'s own CURRENT candidates
        // on every read, never trusted blindly — a chosen origin can
        // itself disappear from a live World between the click and now.
        resolvedEncounterSelection() {
            if (!this.selectionOutcome) {
                return null;
            }
            if (this.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.RESOLVED) {
                return this.selectionOutcome.resolvedSelection;
            }
            if (this.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.AMBIGUOUS && this.resolvedSelectionChoice) {
                const choice = this.resolvedSelectionChoice;
                const stillOffered = this.selectionOutcome.candidates.some((candidate) => (
                    candidate.kind === choice.kind && candidate.objectId === choice.objectId && candidate.origin === choice.origin
                ));
                return stillOffered ? choice : null;
            }
            return null;
        },
        // 0.9.554 — a pure derivation of a resolvedSelection-shaped
        // identity for the CURRENT `selectedObserverLocalEncounter` alone —
        // `{ kind: 'PUBLICATION', objectId: publicationId, origin }`, where
        // `origin` is EXACTLY `materializedSnapshotWorldOrigin()`'s own
        // derivation (application/MaterializedSnapshotWorldDiscoveryBridge.js,
        // reused verbatim, never reimplemented) for the encounter's own
        // `contentHash`/`publicationId` pair. Deliberately never
        // `resolvedEncounterSelection` immediately above itself, and never
        // routed through `describeWorldEncounterSelectionOutcomeFromRegistry()`
        // — see this file's own "0.9.554" header for why an observer-local
        // encounter's own material is reachable WITHOUT the registry-
        // candidate-search machinery a 0.9.553 Section G empirical probe
        // already proved gives it a false UNAVAILABLE. `null` whenever
        // there is no current `selectedObserverLocalEncounter`, or its own
        // `contentHash`/`publicationId` fail `materializedSnapshotWorldOrigin()`'s
        // own validation.
        observerLocalEncounterResolvedSelection() {
            if (!this.selectedObserverLocalEncounter) {
                return null;
            }
            const origin = materializedSnapshotWorldOrigin(
                this.selectedObserverLocalEncounter.contentHash,
                this.selectedObserverLocalEncounter.publicationId
            );
            if (!origin) {
                return null;
            }
            return Object.freeze({
                kind: 'PUBLICATION',
                objectId: this.selectedObserverLocalEncounter.publicationId,
                origin
            });
        },
        // 0.9.558 — Known Publication Encounter Continuation. The ONE gate
        // for all three route-based continuation actions below (Open/
        // Fork/Explore): the already-resolved `publisher/Publication.js`
        // instance `observerLocalEncounterInspection.loading.material`
        // already carries — see 0.9.557's own verdict, "the resolved
        // object itself is the correct hand-off object" — but ONLY once
        // this specific inspection has actually finished as a genuine
        // `AVAILABLE` load of a real `Publication` AND an actively
        // `VERIFIED` signature. Mirrors `admitToRepositoryDiscovery()`'s
        // own gate condition verbatim, one boundary over (see that
        // method's own header for the full 0.9.523 rationale on why
        // `VERIFIED` specifically, not merely `AVAILABLE`, is required
        // before anything acts on retrieved material) — but this getter
        // NEVER calls `admitToRepositoryDiscovery()` itself, and never
        // writes to `decentralizedPublicationDiscoveryProvider`; it only
        // READS the same two already-computed facts
        // `observerLocalEncounterInspection` already holds. `null` for a
        // still-loading, unavailable, unverifiable, or rejected
        // inspection — never a partially-resolved object, and never
        // `selectedObserverLocalEncounter.publicationId` alone (0.9.557
        // Section E's own point: a bare publicationId lacks the
        // documentId/id an Open/Fork/Explore route needs).
        observerLocalEncounterActionablePublication() {
            if (!this.observerLocalEncounterInspection) {
                return null;
            }
            const { loading, verification } = this.observerLocalEncounterInspection;
            if (!loading || loading.status !== 'AVAILABLE' || !(loading.material instanceof Publication)) {
                return null;
            }
            if (!verification || verification.status !== 'VERIFIED') {
                return null;
            }
            return loading.material;
        },
        // 0.9.558 — mirrors `encounterCommentaryPublicationId` (0.9.291)
        // exactly, one selection concept over: the publicationId Commentary
        // is scoped to for the CURRENT `selectedObserverLocalEncounter`, or
        // `null` when there isn't one. Deliberately independent of
        // `observerLocalEncounterInspection`/
        // `observerLocalEncounterActionablePublication` immediately
        // above — exactly like its primary-selection counterpart, this
        // never waits on material loading, fetching, or verification: an
        // `ObserverLocalPublicationEncounter`'s own `publicationId` is
        // already a known, complete identity the moment it's selected
        // (core/ObserverLocalPublicationEncounter.js's own header), and
        // `getPublicationCommentariesCommand`/`addPublicationCommentaryCommand`
        // (0.9.291) already take exactly that bare id, never a resolved
        // object — see `ui/components/PublicationCard.js`'s own
        // `this.publication.id` (0.9.557 Section A5).
        observerLocalEncounterCommentaryPublicationId() {
            return this.selectedObserverLocalEncounter ? this.selectedObserverLocalEncounter.publicationId : null;
        },
        // 0.9.176 — the smallest possible World Snapshot Presentation seam:
        // a pure join of `selectedEncounterInspection` (0.9.16/0.9.18) and
        // `resolvedEncounterSelection` (0.9.20, immediately above), both
        // already computed. Names WHICH source family — `LOCAL`, `PEER`, or
        // `SNAPSHOT` — currently backs the selected encounter, so a
        // successfully materialized and World-placed Snapshot becomes
        // visibly distinguishable in the SAME inspection panel every other
        // encounter already renders through. See `application/
        // WorldEncounterPresentation.js`'s own header for the full
        // rationale. `null` whenever there is nothing selected/inspectable,
        // exactly like `selectedEncounterInspection` itself.
        selectedEncounterPresentation() {
            return describeWorldEncounterPresentation({
                inspection: this.selectedEncounterInspection,
                resolvedSelection: this.resolvedEncounterSelection
            });
        },
        // 0.9.176 — a friendly label over `selectedEncounterPresentation.sourceFamily`,
        // mirroring `selectedEncounterInspectionPublisherIdentityLabel`'s own
        // "render a friendly derived label, never a raw enum value in the
        // template" pattern. 'Unresolved' (never a blank cell) whenever
        // there is no presentation yet, or the current selection has not
        // settled on one specific source — the SAME 'Choose Source'
        // ambiguity every other panel in this file already surfaces,
        // reported here in this file's own vocabulary instead of a second,
        // competing one.
        selectedEncounterPresentationSourceLabel() {
            const sourceFamily = this.selectedEncounterPresentation ? this.selectedEncounterPresentation.sourceFamily : null;
            if (sourceFamily === 'LOCAL') return 'Local';
            if (sourceFamily === 'PEER') return 'Peer';
            if (sourceFamily === 'SNAPSHOT') return 'Snapshot';
            return 'Unresolved';
        },
        // 0.9.177 — World Snapshot Inspection Detail. A pure join of
        // `selectedEncounterPresentation` (0.9.176, immediately above) and
        // `resolvedEncounterSelection` (0.9.20), both already computed.
        // `null` for anything other than a resolved, SNAPSHOT-sourced
        // PUBLICATION encounter — see `application/WorldSnapshotInspection.js`'s
        // own header for exactly which facts this reports and, just as
        // deliberately, which it does not (a publisher's claimed position
        // and a Snapshot's own locator/storage do not survive to this
        // boundary today).
        selectedEncounterSnapshotInspection() {
            return describeWorldSnapshotInspection({
                presentation: this.selectedEncounterPresentation,
                resolvedSelection: this.resolvedEncounterSelection
            });
        },
        // 0.9.40 — the one resolved decentralized lead, if any, this
        // component ever forwards to `inspectWorldEncounterMaterial()`.
        // Mirrors `resolvedEncounterSelection` immediately above, exactly,
        // one layer over — see this file's own header, "resolvedLead
        // mirrors resolvedEncounterSelection exactly."
        resolvedLead() {
            if (!this.decentralizedLeadOutcome) {
                return null;
            }
            if (this.decentralizedLeadOutcome.status === DecentralizedWorldEncounterLeadSelectionOutcomeStatus.RESOLVED) {
                return this.decentralizedLeadOutcome.resolvedLead;
            }
            if (this.decentralizedLeadOutcome.status === DecentralizedWorldEncounterLeadSelectionOutcomeStatus.AMBIGUOUS && this.resolvedLeadChoice) {
                const choice = this.resolvedLeadChoice;
                const stillOffered = this.decentralizedLeadOutcome.candidates.some((candidate) => (
                    candidate.origin === choice.origin && candidate.discoveryTag === choice.discoveryTag && candidate.uri === choice.uri
                ));
                return stillOffered ? choice : null;
            }
            return null;
        },
        // 0.9.100 — `distributionLifecycle.material.state`, defaulting to
        // `PublicationDistributionState.ABSENT` (the SAME enum
        // `describePublicationDistributionLifecycle()`, 0.9.50, already
        // uses) whenever `distributionLifecycle` is still `null` — no new
        // vocabulary invented at this layer.
        distributionMaterialState() {
            return this.distributionLifecycle ? this.distributionLifecycle.material.state : PublicationDistributionState.ABSENT;
        },
        // 0.9.100 — mirrors `distributionMaterialState` immediately above,
        // exactly, for `distributionLifecycle.discovery.state`. Material
        // and discovery state stay independent, never collapsed into one
        // overall verdict — see `PublicationDistributionLifecycle.js`'s own
        // header, unrevisited here.
        distributionDiscoveryState() {
            return this.distributionLifecycle ? this.distributionLifecycle.discovery.state : PublicationDistributionState.ABSENT;
        },
        // 0.9.433 — every CURRENT Announcement/Discovery observation for
        // the selected Publication, one entry per substrate actually used,
        // read from `distributionLifecycleStore.getDiscoveryObservations()`
        // (additive, 0.9.433) — see this file's own header, "0.9.433 —
        // Concurrent Discovery Observation Preservation." `[]` whenever
        // there is no current selection, no `distributionLifecycleStore`,
        // or the store does not expose `getDiscoveryObservations()` (a
        // duck-typed guard, matching this store's own optional-method
        // convention). Depends on `distributionLifecycle` purely so this
        // computed re-evaluates on the SAME existing subscription
        // notification (0.9.100) that already fires whenever a fresh
        // distribution result is recorded — never a new notification
        // channel of its own.
        discoveryObservations() {
            if (!this.distributionLifecycle || !this.selectedEncounter || !this.distributionLifecycleStore
                || typeof this.distributionLifecycleStore.getDiscoveryObservations !== 'function') {
                return [];
            }
            return this.distributionLifecycleStore.getDiscoveryObservations(this.selectedEncounter.objectId);
        },
        // 0.9.104 — the loaded `Publication` domain object for the CURRENT
        // selection, when (and only when) there genuinely is one to
        // distribute — see this file's own header, "distributablePublication
        // is the same Publication domain object 0.9.39's own material
        // inspection already loaded." `null` whenever there is no current
        // PUBLICATION selection, no `materialInspection` yet, or its own
        // `loading.status` isn't `AVAILABLE` — never a guess, never a second
        // load of any kind.
        distributablePublication() {
            if (!this.selectedEncounter || this.selectedEncounter.kind !== 'PUBLICATION') {
                return null;
            }
            if (!this.materialInspection || !this.materialInspection.loading) {
                return null;
            }
            // The literal string, not an imported enum — this file already
            // renders `materialInspection.loading.status` literally in its
            // own template (see this file's own header, "status is
            // rendered literally") without ever importing
            // `WorldEncounterMaterialLoading.js` directly; that boundary
            // stays entirely behind `inspectWorldEncounterMaterial()`.
            if (this.materialInspection.loading.status !== 'AVAILABLE') {
                return null;
            }
            return this.materialInspection.loading.material || null;
        },
        // 0.9.112 — the selection-driven Material panel's own "Source"
        // fact, derived fresh from `materialInspection` on every read —
        // see this file's own header, "materialProvenance is a computed,
        // derived from materialInspection alone." `null` whenever
        // `materialInspection` itself is `null` — no material, no
        // provenance to report.
        materialProvenance() {
            return describePublicationMaterialProvenanceFromInspection(this.materialInspection);
        },
        // 0.9.113 — whether the CURRENT `discoveryResult` is eligible for
        // explicit selection — see this file's own header, "only a
        // VERIFIED discovery result is selectable." `false` whenever there
        // is no `discoveryResult`, no `inspection` on it (an
        // `UNAVAILABLE`/`AMBIGUOUS` resolution never produces one), or a
        // `verification.status` other than `'VERIFIED'`.
        isDiscoveredPublicationSelectable() {
            return !!(
                this.discoveryResult &&
                this.discoveryResult.inspection &&
                this.discoveryResult.inspection.verification.status === 'VERIFIED'
            );
        },
        // 0.9.182 — mirrors `resolvedEncounterSelection` (0.9.20) exactly,
        // one selection over, for `comparisonEncounter` instead of
        // `selectedEncounter` — with one deliberate narrowing: an
        // `'AMBIGUOUS'` `comparisonSelectionOutcome` never resolves here.
        // See this file's own header, "deliberately excluded... an
        // AMBIGUOUS resolution UI for the comparison target."
        comparisonResolvedSelection() {
            if (!this.comparisonSelectionOutcome) {
                return null;
            }
            if (this.comparisonSelectionOutcome.status === WorldEncounterSelectionOutcomeStatus.RESOLVED) {
                return this.comparisonSelectionOutcome.resolvedSelection;
            }
            return null;
        },
        // 0.9.182 — mirrors `selectedEncounterInspection` exactly, one
        // selection over, for `comparisonEncounter`.
        comparisonEncounterInspection() {
            return describeWorldEncounterInspection({ selectedEncounter: this.comparisonEncounter, view: this.effectiveView });
        },
        // 0.9.182 — mirrors `selectedEncounterPresentation` exactly, one
        // selection over, for `comparisonEncounter`/`comparisonResolvedSelection`.
        comparisonEncounterPresentation() {
            return describeWorldEncounterPresentation({
                inspection: this.comparisonEncounterInspection,
                resolvedSelection: this.comparisonResolvedSelection
            });
        },
        // 0.9.182 — "Publication A": the primary selection's own comparison
        // candidate — see `application/WorldEncounterComparisonCandidate.js`'s
        // own header. `null` whenever `selectedEncounter` is not a resolved
        // PUBLICATION encounter (nothing selected, an AVATAR selected, or an
        // unresolved/AMBIGUOUS one).
        selectedPublicationComparisonCandidate() {
            return describeWorldEncounterComparisonCandidate({
                presentation: this.selectedEncounterPresentation,
                resolvedSelection: this.resolvedEncounterSelection
            });
        },
        // 0.9.182 — "Publication B": the comparison target's own comparison
        // candidate, mirroring `selectedPublicationComparisonCandidate`
        // immediately above exactly, one selection over.
        comparisonPublicationComparisonCandidate() {
            return describeWorldEncounterComparisonCandidate({
                presentation: this.comparisonEncounterPresentation,
                resolvedSelection: this.comparisonResolvedSelection
            });
        },
        // 0.9.182 — the one new fact this milestone makes user-visible.
        // `null` whenever `comparisonEncounter` itself is `null` — see this
        // file's own header, "no implicit comparison, ever": merely having
        // a `selectedEncounter` (Publication A) never produces a
        // comparison on its own. Once a comparison target IS explicitly
        // set, this is a live join of both sides' current comparison
        // candidates through `compareSnapshotWorldPublications()` (0.9.181,
        // unmodified) — never cached, so a change to either side (a fresh
        // primary selection, either source leaving the registry) is
        // reflected on the very next read, never presented as though it
        // still described a stale pair.
        worldSnapshotComparisonResult() {
            if (!this.comparisonEncounter) {
                return null;
            }
            return compareSnapshotWorldPublications(
                this.selectedPublicationComparisonCandidate,
                this.comparisonPublicationComparisonCandidate
            );
        },
        // 0.9.183 — the one new fact this milestone makes user-visible: a
        // live join of `selectedEncounterSnapshotInspection` (0.9.177) and
        // `materialInspection` (0.9.39), both already-existing computeds/
        // data this component already maintains for entirely different
        // purposes. `null` whenever the current selection isn't a
        // Snapshot-sourced Publication, or its material isn't currently
        // `AVAILABLE` — see `application/WorldSnapshotContentView.js`'s own
        // header for exactly what is and isn't required. Never cached: a
        // change to either input (a fresh selection, material becoming
        // unavailable after `unregisterSelectedSnapshot()`) is reflected on
        // the very next read, exactly like `worldSnapshotComparisonResult`
        // immediately above.
        selectedSnapshotContentView() {
            return describeWorldSnapshotContentView({
                inspection: this.selectedEncounterSnapshotInspection,
                materialInspection: this.materialInspection
            });
        },
        // 0.9.184 — mirrors `selectedEncounterSnapshotInspection` (0.9.177)
        // exactly, one selection over, for `comparisonEncounter`.
        comparisonEncounterSnapshotInspection() {
            return describeWorldSnapshotInspection({
                presentation: this.comparisonEncounterPresentation,
                resolvedSelection: this.comparisonResolvedSelection
            });
        },
        // 0.9.184 — mirrors `selectedSnapshotContentView` (0.9.183)
        // exactly, one selection over — "Publication B"'s own Content View.
        // `null` under the identical conditions that collapse
        // `selectedSnapshotContentView`: not a resolved, Snapshot-sourced
        // comparison target, or its material isn't currently `AVAILABLE`.
        comparisonSnapshotContentView() {
            return describeWorldSnapshotContentView({
                inspection: this.comparisonEncounterSnapshotInspection,
                materialInspection: this.comparisonMaterialInspection
            });
        },
        // 0.9.184 — the one new fact this milestone makes user-visible: a
        // live join of `worldSnapshotComparisonResult` (0.9.181/182) and
        // both sides' own Content Views, immediately above — see
        // `application/WorldSnapshotContentComparisonView.js`'s own header
        // for exactly what is and isn't required. Never cached: a change to
        // any of the three inputs (a fresh primary or comparison-target
        // selection, either side's material becoming unavailable) is
        // reflected on the very next read, exactly like
        // `worldSnapshotComparisonResult`/`selectedSnapshotContentView`
        // themselves already are.
        worldSnapshotContentComparisonView() {
            return describeWorldSnapshotContentComparisonView({
                comparisonResult: this.worldSnapshotComparisonResult,
                contentViewA: this.selectedSnapshotContentView,
                contentViewB: this.comparisonSnapshotContentView
            });
        },
        // 0.9.291 — the publicationId Commentary is scoped to for the
        // CURRENT primary selection, or `null` when there isn't one — see
        // this file's own "0.9.291" header, "the publicationId is the
        // encounter's own objectId, never the loaded material's." `null`
        // whenever `selectedEncounterInspection` is itself `null` (no
        // selection, or a stale one no longer part of the World — the
        // SAME gate the inspection panel's own "no longer part of the
        // World" notice already applies) or its `kind` isn't
        // `'PUBLICATION'`. Deliberately independent of
        // `materialInspection`/`distributablePublication` — this never
        // waits on material loading, fetching, or verification.
        encounterCommentaryPublicationId() {
            if (!this.selectedEncounter || !this.selectedEncounterInspection || this.selectedEncounterInspection.kind !== 'PUBLICATION') {
                return null;
            }
            return this.selectedEncounter.objectId;
        }
    },
    methods: {
        // The only writer of `selectedEncounter`. Takes exactly what a
        // WorldEncounterMarker's own `select` emit carries — `{ kind,
        // objectId }` — and stores it verbatim; no lookup, no join back
        // into `view`, no re-derivation of any kind.
        //
        // 0.9.182 — while `armedForComparisonSelection` is `true`, this SAME
        // marker-click path routes to `selectComparisonEncounter()` instead
        // — see this file's own header, "reuses the existing marker-click
        // path." The primary `selectedEncounter` (Publication A) is left
        // completely untouched in that case; none of this method's own
        // resets below run.
        selectEncounter(encounter) {
            if (this.armedForComparisonSelection) {
                this.selectComparisonEncounter(encounter);
                return;
            }
            this.selectedEncounter = encounter;
            // 0.9.20 — a fresh selection never carries a stale explicit
            // choice from whatever was previously selected; see this
            // file's own header, "resolvedSelectionChoice is the
            // Wanderer's own explicit pick."
            this.resolvedSelectionChoice = null;
            // 0.9.40 — a fresh selection never carries a stale explicit
            // lead choice either; see this file's own header,
            // "resolvedLeadChoice is reset on every new selection."
            this.resolvedLeadChoice = null;
            // 0.9.40 — `refreshDecentralizedLeadOutcome()` runs FIRST,
            // deliberately: it never tail-calls `refreshMaterialInspection()`
            // itself (unlike `refreshSelectionOutcome()`, immediately
            // below), so that `refreshSelectionOutcome()`'s own single tail
            // call is the one place material inspection actually runs for
            // a fresh selection — reading an already-current
            // `resolvedLead`, never a stale one, and never calling any
            // injected source twice for the one selection. See this file's
            // own header, "refreshDecentralizedLeadOutcome() is the one
            // place decentralizedLeadOutcome is ever written."
            this.refreshDecentralizedLeadOutcome();
            this.refreshSelectionOutcome();
            // 0.9.100 — a fresh selection always re-derives distribution
            // observation from scratch, independent of both calls above:
            // distribution state is keyed by `selectedEncounter.objectId`
            // alone (a Publication's own id, the same regardless of which
            // origin served this encounter), never by
            // `selectionOutcome`/`resolvedEncounterSelection` — see this
            // file's own header, "0.9.100 — Publication Distribution
            // Observation."
            this.refreshDistributionLifecycle();
            // 0.9.104 — a fresh selection never carries a stale execution/
            // error notice from whatever was previously selected, and
            // invalidates any still-in-flight call so its eventual
            // resolution can never write ephemeral state for a selection
            // that has since moved on — see this file's own header, "a
            // distributionRequestId counter guards against a stale
            // response."
            this.distributionExecuting = false;
            this.distributionError = null;
            this.distributionRequestId += 1;
            // 0.9.138 — mirrors the 0.9.104 reset immediately above,
            // exactly, one collaborator over: a fresh selection never
            // carries a stale Snapshot Distribution execution/error/result
            // from whatever was previously selected, and invalidates any
            // still-in-flight call.
            this.snapshotDistributionExecuting = false;
            this.snapshotDistributionError = null;
            this.snapshotDistributionResult = null;
            this.snapshotDistributionRequestId += 1;
            // 0.9.672 — a fresh selection never leaves a stale World
            // Distribution Dialog open over whichever encounter was
            // previously selected.
            this.distributionDialogOpen = false;
            // 0.9.144 — mirrors the 0.9.138 reset immediately above,
            // exactly, one action over: a fresh selection never carries a
            // stale Snapshot Discovery/Attribution execution/error/result
            // from whatever was previously selected, and invalidates any
            // still-in-flight call.
            this.snapshotDiscoveryExecuting = false;
            this.snapshotDiscoveryError = null;
            this.snapshotDiscoveryResult = null;
            this.snapshotAttributionResult = null;
            this.snapshotDiscoveryRequestId += 1;
            // 0.9.183 — a fresh primary selection never leaves a
            // previously-opened Content View rendering implicitly for the
            // NEW selection; see this file's own "0.9.183" header,
            // "snapshotContentViewOpen is reset on every fresh primary
            // selection." This branch never runs for `selectComparisonEncounter()`'s
            // own routing above — only an actual change to the PRIMARY
            // selection resets it.
            this.snapshotContentViewOpen = false;
            // 0.9.184 — mirrors the reset immediately above, exactly, one
            // panel over: a fresh primary selection never leaves a
            // previously-opened Content Comparison panel rendering
            // implicitly for the NEW pairing.
            this.contentComparisonViewOpen = false;
            // 0.9.291 — a fresh selection never carries a stale open/
            // closed state, commentary list, draft, or error from
            // whatever was previously selected — see this file's own
            // "0.9.291" header, "commentary state is reset on every fresh
            // selection." Mirrors `snapshotContentViewOpen`'s own reset
            // immediately above, one panel over; this branch never runs
            // for `selectComparisonEncounter()`'s own routing either,
            // exactly like every other reset in this method.
            this.encounterCommentaryOpen = false;
            this.encounterCommentaries = [];
            this.newEncounterCommentaryText = '';
            this.encounterCommentarySubmitting = false;
            this.encounterCommentaryError = null;
            // 0.9.542 — a fresh selection invalidates any pending retry
            // draft the identical way it already invalidates the draft
            // text itself, above: a draft's reused commentaryId is only
            // ever valid for retries against the SAME publicationId it
            // was minted for.
            this.pendingEncounterCommentaryDraft = null;
        },
        // 0.9.13 — the only writer of `worldView`, and the only caller
        // of `describeWorldFromDiscoveryRegistry()` in this file. See
        // this file's own header, "`refreshWorldViewFromRegistry()` is
        // the one place `worldView` is ever written." A no-op when no
        // `registry` was supplied.
        refreshWorldViewFromRegistry() {
            if (!this.registry) {
                return;
            }
            this.worldView = describeWorldFromDiscoveryRegistry(this.registry);
        },
        // 0.9.552 — the only writer of `observerLocalEncounters`, and the
        // only caller of `observerLocalEncounterRegistry.list()` in this
        // file — mirroring `refreshWorldViewFromRegistry()` immediately
        // above exactly, one store over. A no-op when no
        // `observerLocalEncounterRegistry` was supplied.
        refreshObserverLocalEncountersFromRegistry() {
            if (!this.observerLocalEncounterRegistry || typeof this.observerLocalEncounterRegistry.list !== 'function') {
                return;
            }
            this.observerLocalEncounters = this.observerLocalEncounterRegistry.list();
        },
        // 0.9.554 — the only writer of `selectedObserverLocalEncounter`.
        // Takes exactly one row of `projectedObserverLocalEncounters`'s own
        // shape (the template's own click handler passes the marker
        // verbatim) and stores just its `{ publicationId, contentHash }`
        // identity — no lookup, no re-derivation. Deliberately NEVER
        // touches `selectedEncounter`, `selectionOutcome`,
        // `resolvedSelectionChoice`, or any comparison-panel state above —
        // see this file's own "0.9.554" header, "a third, genuinely
        // separate selection concept." Always triggers a fresh
        // `refreshObserverLocalEncounterInspection()`, mirroring
        // `selectEncounter()`'s own tail call to `refreshSelectionOutcome()`
        // one selection concept over. A malformed `marker` (missing either
        // identity field) is silently ignored, never throws.
        selectObserverLocalEncounter(marker) {
            if (!marker || typeof marker.publicationId !== 'string' || typeof marker.contentHash !== 'string') {
                return;
            }
            this.selectedObserverLocalEncounter = { publicationId: marker.publicationId, contentHash: marker.contentHash };
            this.refreshObserverLocalEncounterInspection();
            // 0.9.558 — a fresh observer-local selection never carries a
            // stale open/closed state, commentary list, draft, or error
            // from whatever was previously selected — mirrors
            // `selectEncounter()`'s own identical 0.9.291 reset, one
            // selection concept over.
            this.observerLocalEncounterCommentaryOpen = false;
            this.observerLocalEncounterCommentaries = [];
            this.newObserverLocalEncounterCommentaryText = '';
            this.observerLocalEncounterCommentarySubmitting = false;
            this.observerLocalEncounterCommentaryError = null;
            this.pendingObserverLocalEncounterCommentaryDraft = null;
        },
        // 0.9.554 — the only writer of `observerLocalEncounterInspection`,
        // and the only caller of `inspectWorldEncounterMaterial()` for an
        // observer-local encounter in this file. Mirrors
        // `refreshMaterialInspection()` (0.9.39) exactly, one selection
        // concept over, with one remaining deliberate difference: it reads
        // `observerLocalEncounterResolvedSelection` (never
        // `resolvedEncounterSelection`). Never supplies a `resolvedLead` —
        // this encounter's own material always resolves through
        // `materialSources.local` (its own derived `origin` names exactly
        // that slot), so no decentralized lead resolution ever applies. A
        // no-op (`observerLocalEncounterInspection` cleared to `null`)
        // whenever there is no current
        // `observerLocalEncounterResolvedSelection` or no `materialSources`
        // — mirroring `refreshMaterialInspection()`'s own "no material
        // source, no material inspection" restraint.
        //
        // AMENDED BY 0.9.595 — Admit Verified Observer-Local Publications
        // into Repository Discovery. This method now ALSO calls
        // `admitToRepositoryDiscovery()` in its own `.then()` callback,
        // exactly where `refreshMaterialInspection()` already does — see
        // that call's own inline header for why, and this file's own
        // "0.9.595" header, above, for the full rationale. The 0.9.554-era
        // restraint this comment used to describe ("it NEVER calls
        // admitToRepositoryDiscovery()") is hereby SUPERSEDED, not
        // extended — 0.9.553's own Section H finding that "an observer-local
        // encounter has no path into app-wide Repository discovery" was a
        // correct description of the codebase AS IT STOOD THEN, not a
        // permanent restriction; 0.9.594's own audit found the resulting
        // continuity gap and this milestone closes it, the same way 0.9.474
        // already closed the identical gap for the PRIMARY encounter family
        // one milestone after 0.9.473 found it.
        refreshObserverLocalEncounterInspection() {
            this.observerLocalEncounterInspectionRequestId += 1;
            const requestId = this.observerLocalEncounterInspectionRequestId;
            const resolvedSelection = this.observerLocalEncounterResolvedSelection;

            if (!resolvedSelection || !this.materialSources) {
                this.observerLocalEncounterInspection = null;
                return;
            }

            inspectWorldEncounterMaterial({
                resolvedSelection,
                materialSources: this.materialSources,
                verifier: this.materialVerifier
            }).then((result) => {
                // 0.9.595 — Admit Verified Observer-Local Publications into
                // Repository Discovery. Mirrors `refreshMaterialInspection()`'s
                // own call verbatim, one selection concept over: offered to
                // `admitToRepositoryDiscovery()` UNCONDITIONALLY on every
                // resolution, deliberately NOT gated behind the
                // stale-response `requestId` guard immediately below — see
                // that method's own header, "a resolution superseded for
                // DISPLAY purposes was still a genuine, VERIFIED retrieval
                // this device is entitled to make discoverable." Whether
                // this resolution is actually ADMITTED still depends
                // entirely on that method's own unchanged gate (`AVAILABLE`
                // + a real `Publication` instance + `verification.status
                // === 'VERIFIED'`) — see this file's own "0.9.595" header,
                // above `refreshObserverLocalEncounterInspection()`, for why
                // this call now exists here at all.
                this.admitToRepositoryDiscovery(result.loading, result.verification);
                // 0.9.554 — mirrors `refreshMaterialInspection()`'s own
                // stale-response guard exactly: a superseded response (a
                // newer observer-local selection, a dismissal, or this
                // component having since unmounted) is discarded, never
                // written.
                if (requestId === this.observerLocalEncounterInspectionRequestId) {
                    this.observerLocalEncounterInspection = result;
                }
            });
        },
        // 0.9.554 — the only writer that ever clears
        // `selectedObserverLocalEncounter` back to `null`. Also bumps
        // `observerLocalEncounterInspectionRequestId` so a still-in-flight
        // `inspectWorldEncounterMaterial()` call from the dismissed
        // selection can never resurrect it.
        dismissObserverLocalEncounterInspection() {
            this.selectedObserverLocalEncounter = null;
            this.observerLocalEncounterInspection = null;
            this.observerLocalEncounterInspectionRequestId += 1;
            // 0.9.558 — a dismissed selection never leaves its own
            // commentary state rendering implicitly for whatever gets
            // selected next — mirrors the reset `selectObserverLocalEncounter()`
            // itself now also performs, immediately above.
            this.observerLocalEncounterCommentaryOpen = false;
            this.observerLocalEncounterCommentaries = [];
            this.newObserverLocalEncounterCommentaryText = '';
            this.observerLocalEncounterCommentarySubmitting = false;
            this.observerLocalEncounterCommentaryError = null;
            this.pendingObserverLocalEncounterCommentaryDraft = null;
        },
        // 0.9.558 — Known Publication Encounter Continuation. The only
        // call site of `openPublicationCommand` in this file. Hands it the
        // ALREADY-RESOLVED `observerLocalEncounterActionablePublication`
        // object directly — never `selectedObserverLocalEncounter.publicationId`,
        // never a second `findById()` lookup (see that computed's own
        // header, and 0.9.557's own Section E). A no-op whenever no
        // command was injected or the current inspection isn't actionable
        // yet (still loading, unavailable, or unverified) — mirrors this
        // file's own established "no command, no action" restraint for
        // every other optional collaborator (`discoveryCommand`,
        // `distributionCommand`, ...).
        openObserverLocalEncounterPublication() {
            const publication = this.observerLocalEncounterActionablePublication;
            if (!publication || !this.openPublicationCommand) {
                return;
            }
            this.openPublicationCommand(publication);
        },
        // 0.9.558 — mirrors `openObserverLocalEncounterPublication()`
        // exactly, one action over.
        forkObserverLocalEncounterPublication() {
            const publication = this.observerLocalEncounterActionablePublication;
            if (!publication || !this.forkPublicationCommand) {
                return;
            }
            this.forkPublicationCommand(publication);
        },
        // 0.9.558 — mirrors `openObserverLocalEncounterPublication()`
        // exactly, one action over.
        exploreObserverLocalEncounterPublication() {
            const publication = this.observerLocalEncounterActionablePublication;
            if (!publication || !this.explorePublicationCommand) {
                return;
            }
            this.explorePublicationCommand(publication);
        },
        // 0.9.558 — mirrors `toggleEncounterCommentary()` (0.9.291)
        // exactly, one selection concept over.
        toggleObserverLocalEncounterCommentary() {
            if (!this.getPublicationCommentariesCommand || !this.observerLocalEncounterCommentaryPublicationId) {
                return;
            }
            const opening = !this.observerLocalEncounterCommentaryOpen;
            this.observerLocalEncounterCommentaryOpen = opening;
            if (opening) {
                this.refreshObserverLocalEncounterCommentaries();
            }
        },
        // 0.9.558 — mirrors `refreshEncounterCommentaries()` (0.9.291)
        // exactly, one selection concept over.
        refreshObserverLocalEncounterCommentaries() {
            if (!this.getPublicationCommentariesCommand || !this.observerLocalEncounterCommentaryPublicationId) {
                return;
            }
            try {
                const result = this.getPublicationCommentariesCommand(this.observerLocalEncounterCommentaryPublicationId);
                this.observerLocalEncounterCommentaries = Array.isArray(result) ? result : [];
                this.observerLocalEncounterCommentaryError = null;
            } catch (error) {
                this.observerLocalEncounterCommentaryError = 'Commentary could not be loaded.';
            }
        },
        // 0.9.558 — mirrors `submitEncounterCommentary()` (0.9.291/0.9.542)
        // exactly, one selection concept over.
        submitObserverLocalEncounterCommentary() {
            const publicationId = this.observerLocalEncounterCommentaryPublicationId;
            const content = this.newObserverLocalEncounterCommentaryText.trim();
            if (!publicationId || !this.addPublicationCommentaryCommand || !content || this.observerLocalEncounterCommentarySubmitting) {
                return;
            }
            if (!this.pendingObserverLocalEncounterCommentaryDraft || this.pendingObserverLocalEncounterCommentaryDraft.content !== content) {
                this.pendingObserverLocalEncounterCommentaryDraft = { content, commentaryId: createId(), createdAt: new Date() };
            }
            const { commentaryId, createdAt } = this.pendingObserverLocalEncounterCommentaryDraft;
            this.observerLocalEncounterCommentarySubmitting = true;
            try {
                this.addPublicationCommentaryCommand({ publicationId, content, commentaryId, createdAt });
                this.newObserverLocalEncounterCommentaryText = '';
                this.observerLocalEncounterCommentaryError = null;
                this.pendingObserverLocalEncounterCommentaryDraft = null;
                this.refreshObserverLocalEncounterCommentaries();
            } catch (error) {
                this.observerLocalEncounterCommentaryError = (error && error.message) ? error.message : 'Commentary could not be created.';
            } finally {
                this.observerLocalEncounterCommentarySubmitting = false;
            }
        },
        // 0.9.20 — the only writer of `selectionOutcome`, and the only
        // caller of `describeWorldEncounterSelectionOutcomeFromRegistry()`
        // in this file. See this file's own header, "selectionOutcome is
        // data, written by refreshSelectionOutcome() — never a computed."
        // `null` whenever there is no current selection or no `registry`
        // — see "no registry, no resolution," above.
        refreshSelectionOutcome() {
            // 0.9.169 — captured BEFORE `selectionOutcome` is overwritten,
            // so it reads the CURRENT `resolvedEncounterSelection` computed
            // off the value this method is about to replace. See this
            // file's own "0.9.169" header for why this, rather than the
            // registry's own notification, is the seam that needed
            // narrowing.
            const previousResolvedSelection = this.resolvedEncounterSelection;

            if (!this.selectedEncounter || !this.registry) {
                this.selectionOutcome = null;
            } else {
                this.selectionOutcome = describeWorldEncounterSelectionOutcomeFromRegistry({
                    selectedEncounter: this.selectedEncounter,
                    registry: this.registry
                });
            }
            // 0.9.39 / 0.9.169 — every trigger that can change
            // `selectionOutcome` can also change `resolvedEncounterSelection`,
            // but only a GENUINE change to it warrants a fresh material
            // load; a registry notification that leaves the current
            // selection's own resolved identity untouched retains the
            // existing `materialInspection` instead of redundantly
            // recomputing it — see this file's own "0.9.169" header.
            //
            // 0.9.535 — a GENUINE change clears `materialInspection`
            // synchronously, BEFORE `refreshMaterialInspection()`'s own
            // async load/verify round trip even starts. Without this, the
            // previous selection's own already-resolved `materialInspection`
            // (its `loading.status`/`verification.status`, and — through
            // `distributablePublication` — its own loaded `Publication`
            // instance) stayed readable, and the Distribute/Snapshot-
            // Distribute/Discover-Snapshot actions stayed enabled against
            // it, for the entire gap between selecting a NEW encounter and
            // that encounter's own material actually resolving. See
            // tests/WandererWorldSessionContinuityProductReassessment.test.js
            // Section F for the live reproduction this fixes.
            //
            // 0.9.536 — a GENUINE change ALSO invalidates the Distribute/
            // Snapshot-Distribute/Discover-Snapshot action state the SAME
            // way `selectEncounter()` already does (0.9.104/0.9.138/
            // 0.9.144, mirrored here verbatim, one seam over). Before this,
            // that reset ran only from `selectEncounter()` — an EXPLICIT
            // marker click. But this branch runs from HERE too, reached
            // from `mounted()`'s own registry `subscribe()` callback with
            // no `selectEncounter()` call anywhere on that path — e.g. an
            // AMBIGUOUS/RESOLVED transition
            // (application/WorldEncounterSelectionOutcome.js's own
            // candidate-count reclassification) as a second source starts
            // or stops offering the SAME still-selected encounter, with no
            // click of any kind. Without this, a Distribute/Snapshot action
            // already in flight against the OLD resolution kept its
            // `distributionRequestId`/`snapshotDistributionRequestId`/
            // `snapshotDiscoveryRequestId` guard unbumped, so its late
            // result (or error) still passed that guard and was written —
            // `snapshotDistributionResult`/`snapshotDiscoveryResult`/
            // `snapshotAttributionResult`/`distributionError` are plain
            // `data()`, never live computeds like `distributablePublication`
            // itself — rendering evidence of an action taken against a
            // resolution the Wanderer's own selection has already moved
            // past. See
            // tests/WorldEncounterActionStateBoundaryProductReassessment.test.js
            // Section I for the live reproduction this fixes.
            if (!resolvedEncounterSelectionsEqual(previousResolvedSelection, this.resolvedEncounterSelection)) {
                this.materialInspection = null;
                this.distributionExecuting = false;
                this.distributionError = null;
                this.distributionRequestId += 1;
                this.snapshotDistributionExecuting = false;
                this.snapshotDistributionError = null;
                this.snapshotDistributionResult = null;
                this.snapshotDistributionRequestId += 1;
                this.distributionDialogOpen = false;
                this.snapshotDiscoveryExecuting = false;
                this.snapshotDiscoveryError = null;
                this.snapshotDiscoveryResult = null;
                this.snapshotAttributionResult = null;
                this.snapshotDiscoveryRequestId += 1;
                this.refreshMaterialInspection();
            }
        },
        // 0.9.20 — the only writer of `resolvedSelectionChoice`. Takes
        // exactly one entry of `selectionOutcome.candidates` — a
        // `{ kind, objectId, origin }` this component never invented
        // itself — and stores it verbatim; no lookup, no re-derivation,
        // no ranking of the choice against any other candidate. See this
        // file's own header, "resolvedSelectionChoice is the Wanderer's
        // own explicit pick."
        chooseSelectionOrigin(candidate) {
            this.resolvedSelectionChoice = candidate;
            // 0.9.39 — an explicit choice can turn a null
            // `resolvedEncounterSelection` into a real one (or replace one
            // real choice with another); see this file's own header, "a
            // stale or changed selection refreshes material inspection."
            this.refreshMaterialInspection();
        },
        // 0.9.40 — the only writer of `decentralizedLeadOutcome`, and the
        // only caller of
        // `describeDecentralizedWorldEncounterLeadSelectionOutcomeFromRegistry()`
        // in this file. `null` whenever there is no current
        // `selectedEncounter` or no `worldDiscoveryLeadRegistry` — see this
        // file's own header, "no worldDiscoveryLeadRegistry, no lead
        // resolution." UNLIKE `refreshSelectionOutcome()`, this method
        // never tail-calls `refreshMaterialInspection()` itself — see this
        // file's own header, "refreshDecentralizedLeadOutcome() is the one
        // place decentralizedLeadOutcome is ever written," for why: every
        // call site of this method is itself responsible for triggering
        // exactly one material-inspection refresh once BOTH
        // `selectionOutcome` and `decentralizedLeadOutcome` are current,
        // rather than this method (and `refreshSelectionOutcome()`) each
        // independently triggering their own, which would call an injected
        // source's own `load()` twice for a single selection.
        refreshDecentralizedLeadOutcome() {
            if (!this.selectedEncounter || !this.worldDiscoveryLeadRegistry) {
                this.decentralizedLeadOutcome = null;
            } else {
                this.decentralizedLeadOutcome = describeDecentralizedWorldEncounterLeadSelectionOutcomeFromRegistry({
                    selectedEncounter: this.selectedEncounter,
                    registry: this.worldDiscoveryLeadRegistry,
                    associations: this.decentralizedLeadAssociations
                });
            }
        },
        // 0.9.40 — the only writer of `resolvedLeadChoice`. Takes exactly
        // one entry of `decentralizedLeadOutcome.candidates` — a lead this
        // component never invented itself — and stores it verbatim; no
        // lookup, no re-derivation, no ranking against any other candidate.
        // Mirrors `chooseSelectionOrigin()` (0.9.20) exactly, one layer
        // over.
        chooseDecentralizedLead(candidate) {
            this.resolvedLeadChoice = candidate;
            this.refreshMaterialInspection();
        },
        // 0.9.516 — World View / Wanderer Product Experience Reassessment,
        // Section G (vocabulary sweep). The "Choose Source"/"Source: …"
        // panel immediately below in the template rendered a raw
        // `WorldDiscoverySource` `origin` string straight to a Wanderer —
        // `'local'`, but also `'peer:' + identityId` (a raw peer identity
        // id, `application/PeerWorldEncounterMaterialSource.js`'s own
        // `PEER_ORIGIN_PREFIX`) and `'snapshot:' + contentHash + ':' +
        // publicationId` (a raw content hash,
        // `application/MaterializedSnapshotWorldDiscoveryBridge.js`'s own
        // `deriveSnapshotWorldDiscoveryOrigin()`). This is a DIFFERENT bug
        // from the one 0.9.176 already fixed one panel over: that
        // milestone gave the (already-resolved) inspection panel a
        // friendly `selectedEncounterPresentationSourceLabel` computed,
        // immediately above, but never touched THIS panel — the one a
        // Wanderer actually clicks through, while more than one source
        // still competes for the same encounter, and the one that keeps
        // showing its pick's own raw origin once resolved.
        //
        // Reuses `describeWorldEncounterPresentationSourceFamily()`
        // (0.9.176, unmodified) for the SAME three-family classification
        // the inspection panel's own friendly label already relies on —
        // never a second, competing classification. Unlike that computed,
        // this one is a method: it also needs to tell apart more than one
        // candidate sharing a family (e.g. two different peers each
        // offering the same encounter), which a bare family name cannot.
        // Disambiguation reuses this codebase's own existing truncation
        // convention — `ui/views/DecentralizedPublicationsView.js`'s own
        // `shortId()`/`shortHash()` (0.8.13 and earlier) — rather than an
        // arbitrary, meaningless position number: a Peer candidate shows
        // the last 14 characters of its own identity id, a Snapshot
        // candidate shows a truncated form of its own content hash, both
        // already-established "enough to tell two apart, never the full
        // raw value pretending to be friendly" shapes. A `LOCAL` origin
        // never needs disambiguation (`WorldDiscoverySourceRegistry` holds
        // at most one local source) and is never truncated.
        //
        // An origin this codebase's own family classifier does not
        // recognize (`describeWorldEncounterPresentationSourceFamily()`
        // returns `null` — a future, unimplemented family) still renders,
        // verbatim, exactly as today — never hidden, never refused, the
        // SAME restraint `humanizeStorageType()`/`humanizeAnchorType()`
        // already hold one view over for an unrecognized code.
        describeSelectionOriginLabel(origin) {
            const family = describeWorldEncounterPresentationSourceFamily(origin);
            if (family === WorldEncounterPresentationSourceFamily.LOCAL) {
                return 'Local';
            }
            if (family === WorldEncounterPresentationSourceFamily.PEER) {
                const identityId = origin.slice('peer:'.length);
                return `Peer ${shortIdentityId(identityId)}`;
            }
            if (family === WorldEncounterPresentationSourceFamily.SNAPSHOT) {
                const contentHash = origin.slice('snapshot:'.length).split(':')[0];
                return `Snapshot ${shortContentHash(contentHash)}`;
            }
            return origin;
        },
        // 0.9.516 — Section G, one panel over: the "Choose Location"/
        // "Location: …" panel rendered a decentralized lead's own raw
        // `uri` — a `core/ContentReference.js`-shaped retrieval locator,
        // literally `'ipfs://' + CID` or `'ar://' + transactionId` per
        // that file's own header diagram — straight to a Wanderer. Mirrors
        // `describeSelectionOriginLabel()` immediately above, one
        // vocabulary over: reuses this codebase's own already-established
        // `STORAGE_TYPE_LABELS` mapping
        // (`ui/views/DecentralizedPublicationsView.js`'s own 0.9.510 fix —
        // `ar` -> "Arweave", `ipfs` -> "IPFS") for the scheme, and the SAME
        // `shortContentHash()` truncation immediately above for the
        // scheme-specific identifier that follows it, rather than a
        // second competing scheme-label table. A `uri` with no recognized
        // `scheme://` shape (or none at all) still renders, verbatim/
        // truncated, never hidden or refused.
        describeDecentralizedLeadUriLabel(uri) {
            if (typeof uri !== 'string' || uri.length === 0) {
                return uri;
            }
            const schemeSeparator = uri.indexOf('://');
            if (schemeSeparator === -1) {
                return shortContentHash(uri);
            }
            const scheme = uri.slice(0, schemeSeparator);
            const identifier = uri.slice(schemeSeparator + 3);
            const schemeLabel = CONTENT_URI_SCHEME_LABELS[scheme] || scheme;
            return `${schemeLabel} ${shortContentHash(identifier)}`;
        },
        // 0.9.519 — Publication Evidence & Trust Experience Product
        // Reassessment, Section A/H. Thin template-callable wrappers around
        // application/WorldEncounterMaterialInspectionView.js's own two
        // pure functions — mirroring how every method in this file wraps
        // an imported application/ view function for template use (this
        // component's `template` is a runtime-compiled string, not an SFC,
        // so a bare module-level import is never callable from inside
        // `{{ }}` on its own; see `describeSelectionOriginLabel()`/
        // `describeDecentralizedLeadUriLabel()` immediately above for the
        // identical shape). No logic of their own — see that file's own
        // header for what each status actually means and does not mean.
        describeMaterialLoadStatusLabel(status) {
            return describeWorldEncounterMaterialLoadStatusLabel(status);
        },
        describeMaterialVerificationStatusLabel(status) {
            return describeWorldEncounterMaterialVerificationStatusLabel(status);
        },
        // 0.9.528 — Snapshot Encounter & Placement Product Experience
        // Reassessment, Section C/I. The identical thin-wrapper shape,
        // one family over — application/SnapshotOutcomeInspectionView.js's
        // own two pure functions, for the Snapshot Discovery/Attribution
        // panel immediately below.
        describeSnapshotResolutionLabel(outcome) {
            return describeSnapshotResolutionOutcomeLabel(outcome);
        },
        describeSnapshotAttributionLabel(outcome) {
            return describeSnapshotAttributionOutcomeLabel(outcome);
        },
        // 0.9.474 — Admit World-Encountered Publications into App-Wide
        // Discovery. The only caller of `.add()` on
        // `decentralizedPublicationDiscoveryProvider` in this file.
        // Mirrors ui/views/DecentralizedPublicationsView.js's own
        // admitToRepositoryDiscovery() (0.9.337) verbatim, one family
        // over: a resolved selection is a Repository discovery candidate
        // ONLY on a genuine `AVAILABLE` load whose material is a real
        // `publisher/Publication.js` instance — never a failed/UNAVAILABLE
        // load, and never an Avatar encounter or a decentralized envelope
        // this replica never hydrates into a Publication instance (see
        // application/DecentralizedWorldEncounterMaterialSource.js's own
        // header, "no `Publication.fromJSON()`" — Section F of
        // tests/WorldEncounterRepositoryContinuityBoundaryAudit.test.js
        // already proved this `instanceof` gate excludes those for free).
        //
        // AMENDED BY 0.9.523 — Repository / Discovery Product Boundary
        // Reassessment, Section E. This gate now ALSO requires
        // `verification.status === VERIFIED`, closing the one asymmetry
        // that milestone's own audit found between this admission path
        // and its DecentralizedPublicationsView.js sibling: that sibling's
        // own gate (`view.resolved`) only ever becomes true after
        // application/PublicationResolver.js's full envelope/bytes/content
        // signature-verification pipeline succeeds, whereas this method,
        // before 0.9.523, admitted on `loading.status === 'AVAILABLE'`
        // alone — a fact about SUCCESSFUL RETRIEVAL, never about whether
        // the retrieved bytes are genuine (see
        // application/DecentralizedWorldEncounterMaterialSource.js's own
        // header, "NO SIGNATURE VERIFICATION, NO HASH CHECK, NO TRUST
        // DECISION OF ANY KIND"). Requiring `VERIFIED` means the identical
        // composed verifier ui/main.js already wires into World rendering
        // (`WorldEncounterMaterialIdentityVerifier` AND
        // `WorldEncounterMaterialSignatureVerifier`, ANDed together by
        // application/WorldEncounterMaterialVerificationComposition.js —
        // see 0.9.523's own audit, Section E) must have actively confirmed
        // BOTH structural identity AND a genuine Ed25519 signature before
        // a World Encounter admits anything into the SAME catalog Open/
        // Fork/Explore act on app-wide. `REJECTED` (a bad signature) and
        // `UNVERIFIABLE` (no verifier injected, or nothing to judge) are
        // now both excluded, exactly like a failed/UNAVAILABLE load
        // already was — a Repository result must never be indistinguishable
        // from a verified one when it demonstrably is not (docs/Principles.md,
        // "Known Evidence Is Not Verified Evidence, And Verified Evidence
        // Is Not Authority," continued here for this boundary).
        //
        // No `decentralizedPublicationDiscoveryProvider` supplied is a
        // silent no-op, exactly like every other optional collaborator in
        // this file (`materialVerifier`, `worldDiscoveryLeadRegistry`,
        // ...) — admission is additive to World rendering, never a
        // precondition for it. Called from BOTH `refreshMaterialInspection()`
        // and `refreshComparisonMaterialInspection()`, below, unconditionally
        // on every resolution — deliberately NOT gated behind either
        // method's own stale-response request-counter guard, since a
        // resolution superseded for DISPLAY purposes was still a genuine,
        // VERIFIED retrieval this device is entitled to make discoverable.
        // A repeated resolution of the SAME Publication (re-selecting it,
        // or a comparison target matching the primary selection) calls
        // `.add()` again, exactly as ui/views/DecentralizedPublicationsView.js's
        // own `resolveEntry()`/`retrieve()` already do on every recheck —
        // an existing, pre-0.9.474 property of `discoveryProvider.add()`
        // itself (discovery/DecentralizedPublicationDiscoveryProvider.js
        // keeps no id index), not a new duplication concern this milestone
        // introduces or is scoped to fix.
        // AMENDED BY 0.9.651 — Persist World-Encounter Publication
        // Admissions. The identical `AVAILABLE + VERIFIED` eligibility
        // check now gates TWO independent, optional sinks rather than one:
        // the pre-existing in-memory `decentralizedPublicationDiscoveryProvider`
        // (unchanged — same call, same try/catch, same failure isolation),
        // and the new durable `publicationAdmissionLog`. Neither sink's
        // presence is required for the other to run — a mount supplying
        // only one of the two still gets exactly that one's admission —
        // and each has its OWN try/catch, so a misbehaving log never
        // blocks in-memory discovery and a misbehaving provider never
        // blocks durable persistence. See `publicationAdmissionLog`'s own
        // prop header, above, for why this is a NEW, purpose-built log
        // rather than `LocalPublicationCatalog` itself.
        admitToRepositoryDiscovery(loading, verification) {
            const eligible = loading
                && loading.status === 'AVAILABLE'
                && loading.material instanceof Publication
                && verification
                && verification.status === 'VERIFIED';
            if (!eligible) {
                return;
            }
            if (this.decentralizedPublicationDiscoveryProvider) {
                try {
                    this.decentralizedPublicationDiscoveryProvider.add(loading.material);
                } catch {
                    // 0.9.474 — a discovery-admission failure (a
                    // misbehaving injected provider; ordinarily `.add()`
                    // never throws here, since the `instanceof Publication`
                    // check above already satisfies its own only
                    // documented throw condition) must never turn an
                    // already-successful World Encounter resolution into a
                    // failed one. This method is called from its own
                    // callers' `.then()` callback BEFORE the line that
                    // writes `materialInspection`/`comparisonMaterialInspection`
                    // — an uncaught throw here would abort that callback
                    // and silently skip that write, which is exactly the
                    // coupling this milestone's own product brief rejects.
                }
            }
            if (this.publicationAdmissionLog) {
                try {
                    this.publicationAdmissionLog.add(loading.material);
                } catch {
                    // 0.9.651 — identical failure-isolation rationale to
                    // the `decentralizedPublicationDiscoveryProvider` branch
                    // above, applied to the new durable sink: a misbehaving
                    // or storage-exhausted log must never turn an
                    // already-successful World Encounter resolution into a
                    // failed one, and must never suppress the in-memory
                    // admission this method already performed above.
                }
            }
        },
        // 0.9.39 — the only writer of `materialInspection`, and the only
        // caller of `inspectWorldEncounterMaterial()` in this file. See
        // this file's own header, "materialInspection is data, written by
        // refreshMaterialInspection() — never a computed." A no-op
        // (`materialInspection` cleared to `null`) whenever there is no
        // current `resolvedEncounterSelection` or no `materialSources` —
        // see "no material source, no material inspection," above. Never
        // supplies a `resolvedLead` — see "no resolvedLead is ever
        // supplied," above. As of 0.9.40 this restraint no longer holds —
        // see this file's own "0.9.40" header — this method now forwards
        // `this.resolvedLead` whenever it resolves. AMENDED BY 0.9.474 —
        // see admitToRepositoryDiscovery() above: every resolution this
        // method produces is now also OFFERED to Repository discovery —
        // whether it is actually ADMITTED depends on that method's own
        // gate, tightened by 0.9.523 to require `verification.status ===
        // VERIFIED` (see that method's own header) — World rendering
        // itself (`this.materialInspection`, guarded by `requestId`
        // exactly as before) is completely unchanged either way.
        refreshMaterialInspection() {
            this.materialInspectionRequestId += 1;
            const requestId = this.materialInspectionRequestId;
            const resolvedSelection = this.resolvedEncounterSelection;

            if (!resolvedSelection || !this.materialSources) {
                this.materialInspection = null;
                return;
            }

            inspectWorldEncounterMaterial({
                resolvedSelection,
                resolvedLead: this.resolvedLead,
                materialSources: this.materialSources,
                verifier: this.materialVerifier
            }).then((result) => {
                this.admitToRepositoryDiscovery(result.loading, result.verification);
                // 0.9.39 — see this file's own header, "a request counter
                // guards against a stale async response overwriting a
                // newer one." A superseded response (a newer selection, or
                // this component having since unmounted) is discarded,
                // never written.
                if (requestId === this.materialInspectionRequestId) {
                    this.materialInspection = result;
                }
            });
        },
        // 0.9.100 — the only writer of `distributionLifecycle`, and the
        // only caller of `distributionLifecycleStore.get()`/`.subscribe()`
        // in this file. Never calls `describePublicationDistributionLifecycle()`,
        // never constructs a `PublicationDistributionLifecycleMemoryStore`,
        // and never executes a distribution — this method only OBSERVES a
        // store a caller already composed and injected. Always unsubscribes
        // any previous subscription first, so a changed selection (or a
        // repeated call) never leaves more than one live subscription behind
        // — the same discipline `beforeUnmount()` already holds for
        // `unsubscribeWorldRegistry`/`unsubscribeWorldDiscoveryLeadRegistry`.
        // A no-op (`distributionLifecycle` cleared to `null`) whenever there
        // is no current `selectedEncounter`, its `kind` isn't `'PUBLICATION'`,
        // or no `distributionLifecycleStore` was supplied — see this file's
        // own header, "0.9.100 — Publication Distribution Observation."
        refreshDistributionLifecycle() {
            this.stopSubscription('unsubscribeDistributionLifecycle');

            if (!this.selectedEncounter || this.selectedEncounter.kind !== 'PUBLICATION' || !this.distributionLifecycleStore) {
                this.distributionLifecycle = null;
                return;
            }

            const publicationId = this.selectedEncounter.objectId;
            this.distributionLifecycle = this.distributionLifecycleStore.get(publicationId);
            this.unsubscribeDistributionLifecycle = this.distributionLifecycleStore.subscribe(publicationId, (_publicationId, lifecycle) => {
                this.distributionLifecycle = lifecycle;
            });
        },
        // 0.9.101 — World View Integration Boundary Review. The one
        // piece of real, mechanical duplication that review found: three
        // separate collaborator subscriptions (`registry`, 0.9.13;
        // `worldDiscoveryLeadRegistry`, 0.9.40; `distributionLifecycleStore`,
        // 0.9.100) each held their own "call the stored unsubscribe
        // function if one exists, then clear the field" idiom, repeated
        // identically four times — three times in `beforeUnmount()`, and
        // a fourth, inline, at the top of `refreshDistributionLifecycle()`
        // (which re-subscribes per selection, not per mount, so it can't
        // simply reuse `beforeUnmount()`'s own copy). This is that one
        // idiom, factored out to its one place — it changes nothing about
        // WHEN or WHY each of the three subscriptions starts or stops
        // (still three independent lifetimes, two mount-scoped and one
        // selection-scoped, exactly as their own 0.9.13/0.9.40/0.9.100
        // headers already establish), only how the "stop and forget"
        // mechanics of ANY ONE of them gets written. `fieldName` names
        // one of this component's own `data()` fields holding either an
        // `unsubscribe` function or `null` — never a subscription object,
        // never a registry/store reference itself.
        stopSubscription(fieldName) {
            if (typeof this[fieldName] === 'function') {
                this[fieldName]();
            }
            this[fieldName] = null;
        },
        // 0.9.104 — the only writer of `distributionExecuting`/
        // `distributionError`, and the only caller of `distributionCommand`
        // in this file. A no-op whenever there is nothing to distribute
        // (`distributablePublication` is `null`), no `distributionCommand`
        // was supplied, or a call is already in flight for this selection —
        // see this file's own header, "repeated clicks never start a
        // second, overlapping call." AMENDED BY 0.9.430: calls
        // `distributionCommand` with `this.selectedDiscoveryProvider` as a
        // second argument — the Wanderer's own current substrate choice —
        // never anything this method itself derives or interprets.
        // Wrapping the call in
        // `Promise.resolve().then(...)` catches a SYNCHRONOUS construction
        // throw exactly the same way as an asynchronous rejection — see
        // this file's own header, "a genuine rejection (or a synchronous
        // construction throw) becomes one plain notice." Never inspects a
        // resolved result — see "deciding distribution success or
        // failure," above; whatever fresh fact a call actually produced
        // reaches this component only through `distributionLifecycleStore`'s
        // own existing subscription (0.9.100, unmodified).
        distributeSelectedPublication() {
            const publication = this.distributablePublication;
            if (!publication || !this.distributionCommand || this.distributionExecuting) {
                return;
            }

            this.distributionExecuting = true;
            this.distributionError = null;
            this.distributionRequestId += 1;
            const requestId = this.distributionRequestId;

            return Promise.resolve()
                .then(() => this.distributionCommand(
                    publication,
                    this.selectedDiscoveryProvider,
                    this.selectedDistributionStorage,
                    this.selectedDistributionStorage === 'remote-pinning' ? this.remotePinningDraft : undefined
                ))
                .catch((error) => {
                    if (requestId === this.distributionRequestId) {
                        console.error('Publication distribution failed:', error);
                        this.distributionError = sanitizeDistributionErrorMessage(error)
                            || 'Distribution could not be completed.';
                    }
                })
                .then(() => {
                    if (requestId === this.distributionRequestId) {
                        this.distributionExecuting = false;
                    }
                });
        },
        // 0.9.138 — the only writer of `snapshotDistributionExecuting`/
        // `snapshotDistributionError`/`snapshotDistributionResult`, and the
        // only caller of `snapshotDistributionCommand` in this file —
        // mirrors `distributeSelectedPublication()` immediately above,
        // exactly, with one deliberate addition: a resolved result is
        // stored (see this component's own `snapshotDistributionCommand`
        // prop comment for why). A no-op whenever there is nothing to
        // distribute (`distributablePublication` is `null`), no
        // `snapshotDistributionCommand` was supplied, or a call is already
        // in flight for this selection. Wrapping the call in
        // `Promise.resolve().then(...)` catches a synchronous construction
        // throw the same way as an asynchronous rejection, exactly as
        // `distributeSelectedPublication()` already does.
        distributeSelectedSnapshot() {
            const publication = this.distributablePublication;
            if (!publication || !this.snapshotDistributionCommand || this.snapshotDistributionExecuting) {
                return;
            }

            this.snapshotDistributionExecuting = true;
            this.snapshotDistributionError = null;
            this.snapshotDistributionRequestId += 1;
            const requestId = this.snapshotDistributionRequestId;

            const storage = this.selectedDistributionStorage;
            const remotePinningConfiguration = storage === 'remote-pinning' ? {
                endpoint: this.remotePinningDraft.endpoint,
                credential: this.remotePinningDraft.credential || null,
                requestField: this.remotePinningDraft.requestField || null,
                responseField: this.remotePinningDraft.responseField || null
            } : undefined;

            return Promise.resolve()
                .then(() => this.snapshotDistributionCommand(publication, storage, remotePinningConfiguration, this.selectedDiscoveryProvider))
                .then((result) => {
                    if (requestId === this.snapshotDistributionRequestId) {
                        this.snapshotDistributionResult = result;
                    }
                })
                .catch((error) => {
                    if (requestId === this.snapshotDistributionRequestId) {
                        console.error('Snapshot distribution failed:', error);
                        this.snapshotDistributionError = sanitizeDistributionErrorMessage(error)
                            || 'Snapshot distribution could not be completed.';
                    }
                })
                .then(() => {
                    if (requestId === this.snapshotDistributionRequestId) {
                        this.snapshotDistributionExecuting = false;
                    }
                });
        },
        // UX-level convenience only: fires the two already-independent
        // actions above from one click. Each keeps its own protocol, its
        // own executing/error/result state, and its own outcome display —
        // this never introduces a combined result or an aggregate status,
        // and a failure in one never stops or hides the other. Run
        // SEQUENTIALLY, never concurrently: both legs can end up signing
        // through the SAME injected browser extension (e.g. a NIP-07
        // provider used for both Nostr announcements), and firing two
        // signing requests at once is a real-world extension failure mode
        // (no popup ever shown, no response ever received) rather than a
        // race either leg's own code can detect or recover from — see
        // arweave/ArweaveInjectedProviderSigner.js's/nostr/
        // NostrInjectedProviderPublisher.js's own "MV3 background service
        // worker recycled mid-request" note.
        distributeSelectedPublicationAndSnapshot() {
            return Promise.resolve(this.distributeSelectedPublication())
                .then(() => this.distributeSelectedSnapshot());
        },
        // 0.9.144 — the only writer of `snapshotDiscoveryExecuting`/
        // `snapshotDiscoveryError`/`snapshotDiscoveryResult`/
        // `snapshotAttributionResult`, and the only caller of
        // `discoverSnapshotCommand`/`resolveSnapshotPublicationAttribution()`
        // in this file — mirrors `distributeSelectedSnapshot()` immediately
        // above, exactly, with one deliberate addition: a resolved
        // discovery result is immediately turned into an attribution
        // verdict, computed under the SAME `requestId` guard — see this
        // file's own header, "0.9.144 — World View Snapshot Attribution
        // Integration." A no-op whenever there is nothing to discover
        // (`distributablePublication` is `null`), no
        // `discoverSnapshotCommand` was supplied, or a call is already in
        // flight for this selection.
        discoverSelectedSnapshot() {
            const publication = this.distributablePublication;
            if (!publication || !this.discoverSnapshotCommand || this.snapshotDiscoveryExecuting) {
                return;
            }

            this.snapshotDiscoveryExecuting = true;
            this.snapshotDiscoveryError = null;
            this.snapshotDiscoveryRequestId += 1;
            const requestId = this.snapshotDiscoveryRequestId;

            Promise.resolve()
                .then(() => this.discoverSnapshotCommand(publication))
                .then((result) => {
                    if (requestId === this.snapshotDiscoveryRequestId) {
                        this.snapshotDiscoveryResult = result;
                        this.snapshotAttributionResult = resolveSnapshotPublicationAttribution(publication, result);
                    }
                })
                .catch((error) => {
                    if (requestId === this.snapshotDiscoveryRequestId) {
                        console.error('Snapshot discovery failed:', error);
                        this.snapshotDiscoveryError = sanitizeDistributionErrorMessage(error)
                            || 'Snapshot discovery could not be completed.';
                    }
                })
                .then(() => {
                    if (requestId === this.snapshotDiscoveryRequestId) {
                        this.snapshotDiscoveryExecuting = false;
                    }
                });
        },
        // 0.9.179 — Snapshot World Source Unregistration. The one new
        // Wanderer-reachable action this milestone adds: an explicit
        // invocation of the already-existing, symmetric undo of
        // `registerMaterializedSnapshotWorldSource()` — see
        // `application/MaterializedSnapshotWorldDiscoveryBridge.js`'s own
        // header, "the deliberate, symmetric undo... never invoked
        // automatically." This method IS that "future, explicit caller."
        //
        // Reads `contentHash`/`publicationId` straight off
        // `selectedEncounterSnapshotInspection` (0.9.177, already
        // computed) — no re-derivation, no second lookup, no new join.
        // That computed is `null` for anything other than a RESOLVED,
        // SNAPSHOT-sourced PUBLICATION encounter (0.9.178's own Section G:
        // an AMBIGUOUS selection reports no Snapshot inspection detail, so
        // this action stays unreachable for one too) — this method adds no
        // gate of its own beyond that and requiring a `registry`.
        //
        // Calls `unregisterMaterializedSnapshotWorldSource()` exactly once
        // and nothing else. No rediscovery, no re-resolution, no material
        // deletion, no Publication mutation, no Nostr/Arweave action of any
        // kind — that scope is already `unregisterMaterializedSnapshotWorldSource()`'s
        // own guarantee, not something reasserted here. This method writes
        // no local state of its own (unlike `distributeSelectedSnapshot()`/
        // `discoverSelectedSnapshot()`, which track an in-flight request):
        // the registry mutation is synchronous, and every downstream
        // projection (`selectionOutcome`, `resolvedEncounterSelection`,
        // `selectedEncounterSnapshotInspection`, `materialInspection`,
        // `distributablePublication`) already re-derives itself from the
        // registry's own change notification — the SAME collapse-to-null
        // behavior 0.9.178's own Section H already proved holds for a
        // Snapshot source removed by any means.
        unregisterSelectedSnapshot() {
            const inspection = this.selectedEncounterSnapshotInspection;
            if (!inspection || !this.registry) {
                return;
            }
            unregisterMaterializedSnapshotWorldSource(this.registry, inspection.contentHash, inspection.publicationId);
        },
        // 0.9.183 — the only writer of `snapshotContentViewOpen` that ever
        // sets it `true`. Guarded on there being a genuinely viewable
        // Content View for the CURRENT selection — opening without one
        // would be indistinguishable from a fabricated view for material
        // that was never actually loaded. Never touches `registry`,
        // `selectedEncounter`, or `materialInspection` — see this file's
        // own "0.9.183" header, "no new material loading, ever."
        openSnapshotContentView() {
            if (!this.selectedSnapshotContentView) {
                return;
            }
            this.snapshotContentViewOpen = true;
        },
        // 0.9.183 — the Wanderer's own explicit way to close an open
        // Content View, mirroring `clearComparisonSelection()` (0.9.182)
        // exactly, one panel over.
        closeSnapshotContentView() {
            this.snapshotContentViewOpen = false;
        },
        // 0.9.184 — mirrors `openSnapshotContentView()` immediately above,
        // exactly, one panel over: the only writer of
        // `contentComparisonViewOpen` that ever sets it `true`, guarded on
        // there being a genuinely available `worldSnapshotContentComparisonView`
        // for the CURRENT pair. Never touches `registry`, either selection,
        // or either material inspection.
        openContentComparisonView() {
            if (!this.worldSnapshotContentComparisonView) {
                return;
            }
            this.contentComparisonViewOpen = true;
        },
        // 0.9.184 — the Wanderer's own explicit way to close an open
        // Content Comparison panel, mirroring `closeSnapshotContentView()`
        // exactly, one panel over.
        closeContentComparisonView() {
            this.contentComparisonViewOpen = false;
        },
        // 0.9.182 — the only writer of `armedForComparisonSelection` that
        // ever sets it `true`. Guarded on there being a genuine comparison
        // candidate for the CURRENT primary selection — arming without one
        // would let the Wanderer pick a "Publication B" for a Publication A
        // that isn't actually comparable (nothing selected, an AVATAR, or
        // an unresolved selection). `selectEncounter()`'s own armed branch,
        // and `selectComparisonEncounter()` below, are the only two places
        // that ever set it back to `false`.
        armComparisonSelection() {
            if (!this.selectedPublicationComparisonCandidate) {
                return;
            }
            this.armedForComparisonSelection = true;
        },
        // 0.9.182 — the only writer of `comparisonEncounter`. Takes exactly
        // what a marker's own `select` emit carries — `{ kind, objectId }`
        // — and stores it verbatim, mirroring `selectEncounter()`'s own
        // restraint (0.9.4) exactly: no lookup, no join back into `view`,
        // no re-derivation of any kind. Reached only through
        // `selectEncounter()`'s own armed branch, above.
        selectComparisonEncounter(encounter) {
            this.armedForComparisonSelection = false;
            this.comparisonEncounter = encounter;
            // 0.9.184 — a fresh comparison target never leaves a
            // previously-opened Content Comparison panel rendering
            // implicitly for the NEW pairing; mirrors `selectEncounter()`'s
            // own `snapshotContentViewOpen` reset, one panel over.
            this.contentComparisonViewOpen = false;
            this.refreshComparisonSelectionOutcome();
        },
        // 0.9.182 — the only writer of `comparisonSelectionOutcome`, and
        // the only caller of `describeWorldEncounterSelectionOutcomeFromRegistry()`
        // for `comparisonEncounter` in this file — mirrors
        // `refreshSelectionOutcome()` (0.9.20) exactly, one selection over.
        // `null` whenever there is no current `comparisonEncounter` or no
        // `registry`.
        //
        // 0.9.184 — AS OF THIS MILESTONE, this method's own former
        // deliberate omission ("never tail-calls `refreshMaterialInspection()`
        // — a comparison target's own material is never loaded") is
        // narrowed: it now tail-calls `refreshComparisonMaterialInspection()`,
        // mirroring `refreshSelectionOutcome()`'s own identical tail call
        // exactly, one selection over — but ONLY on a genuine change to
        // `comparisonResolvedSelection` (the same `resolvedEncounterSelectionsEqual()`
        // guard 0.9.39 already uses), never redundantly on every
        // notification. See this file's own "0.9.184" header, "extending
        // material loading to the comparison target."
        refreshComparisonSelectionOutcome() {
            const previousComparisonResolvedSelection = this.comparisonResolvedSelection;

            if (!this.comparisonEncounter || !this.registry) {
                this.comparisonSelectionOutcome = null;
            } else {
                this.comparisonSelectionOutcome = describeWorldEncounterSelectionOutcomeFromRegistry({
                    selectedEncounter: this.comparisonEncounter,
                    registry: this.registry
                });
            }
            // 0.9.535 — mirrors `refreshSelectionOutcome()`'s own
            // identical fix exactly, one selection over: a genuine change
            // clears `comparisonMaterialInspection` synchronously before
            // the async reload starts, so the previous comparison
            // target's own material/verification never lingers, readable,
            // under the NEW comparison target's identity.
            if (!resolvedEncounterSelectionsEqual(previousComparisonResolvedSelection, this.comparisonResolvedSelection)) {
                this.comparisonMaterialInspection = null;
                this.refreshComparisonMaterialInspection();
            }
        },
        // 0.9.184 — mirrors `refreshMaterialInspection()` (0.9.39) exactly,
        // one selection over, for `comparisonEncounter` instead of
        // `selectedEncounter`, with one deliberate narrowing: it never
        // supplies a `resolvedLead` — decentralized lead resolution for the
        // comparison target remains excluded (see this file's own "0.9.184"
        // header). A no-op (`comparisonMaterialInspection` cleared to
        // `null`) whenever there is no current `comparisonResolvedSelection`
        // or no `materialSources`. AMENDED BY 0.9.474 — mirrors
        // `refreshMaterialInspection()`'s own admitToRepositoryDiscovery()
        // call exactly, one selection over: a comparison target the
        // Wanderer resolves is just as genuinely encountered as the
        // primary selection, and gets the identical admission offer,
        // gated by the identical `verification.status === VERIFIED`
        // requirement (0.9.523).
        refreshComparisonMaterialInspection() {
            this.comparisonMaterialInspectionRequestId += 1;
            const requestId = this.comparisonMaterialInspectionRequestId;
            const resolvedSelection = this.comparisonResolvedSelection;

            if (!resolvedSelection || !this.materialSources) {
                this.comparisonMaterialInspection = null;
                return;
            }

            inspectWorldEncounterMaterial({
                resolvedSelection,
                resolvedLead: null,
                materialSources: this.materialSources,
                verifier: this.materialVerifier
            }).then((result) => {
                this.admitToRepositoryDiscovery(result.loading, result.verification);
                // 0.9.184 — mirrors `refreshMaterialInspection()`'s own
                // stale-response guard exactly, one selection over.
                if (requestId === this.comparisonMaterialInspectionRequestId) {
                    this.comparisonMaterialInspection = result;
                }
            });
        },
        // 0.9.182 — the Wanderer's own explicit way to start a comparison
        // over: clears `comparisonEncounter`/`comparisonSelectionOutcome`
        // and un-arms comparison selection, all in one step. Never called
        // automatically — see this file's own header, "deliberately
        // excluded... clearing comparisonEncounter automatically when the
        // primary selection changes."
        //
        // 0.9.184 — also clears `comparisonMaterialInspection` (invalidating
        // any still-in-flight request) and closes the Content Comparison
        // panel, mirroring the primary reset immediately above, one
        // selection over.
        clearComparisonSelection() {
            this.armedForComparisonSelection = false;
            this.comparisonEncounter = null;
            this.comparisonSelectionOutcome = null;
            this.comparisonMaterialInspection = null;
            this.comparisonMaterialInspectionRequestId += 1;
            this.contentComparisonViewOpen = false;
        },
        // 0.9.111 — the only writer of `discoveryResult`/`discoveryError`/
        // `discovering`, and the only caller of `discoveryCommand` in this
        // file. A no-op whenever there is no `discoveryCommand`, a call is
        // already in flight, or `discoveryObjectId`/`discoveryTag` is blank
        // — mirrors `distributeSelectedPublication()`'s own guards exactly,
        // one collaborator over. Wrapping the call in
        // `Promise.resolve().then(...)` catches a synchronous construction
        // throw the same way a rejection is caught — see this file's own
        // header, "ephemeral UI state only." Never inspects
        // `discoveryResult` beyond storing it verbatim — see this file's
        // own header, "the existing inspection mechanism stays canonical."
        discoverPublication() {
            if (!this.discoveryCommand || this.discovering) {
                return;
            }
            const objectId = this.discoveryObjectId.trim();
            const discoveryTag = this.discoveryTag.trim();
            if (!objectId || !discoveryTag) {
                return;
            }

            this.discovering = true;
            this.discoveryError = null;
            this.discoveryRequestId += 1;
            const requestId = this.discoveryRequestId;

            Promise.resolve()
                .then(() => this.discoveryCommand({ objectId, discoveryTag }))
                .then((result) => {
                    if (requestId === this.discoveryRequestId) {
                        this.discoveryResult = result;
                    }
                })
                .catch((error) => {
                    if (requestId === this.discoveryRequestId) {
                        console.error('Discovery failed:', error);
                        this.discoveryError = sanitizeDistributionErrorMessage(error)
                            || 'Discovery could not be completed.';
                    }
                })
                .then(() => {
                    if (requestId === this.discoveryRequestId) {
                        this.discovering = false;
                    }
                });
        },
        // 0.9.113 — the only writer of `selectedDiscoveredPublication`.
        // Stores the CURRENT `discoveryResult` verbatim — the exact same
        // reference `discoverPublication()` (0.9.111) already wrote — never
        // a reshaped copy, and never a second inspection/derivation of any
        // kind. A no-op whenever `isDiscoveredPublicationSelectable` is
        // false, re-checked here rather than trusted to the template's own
        // `v-if` alone — see this file's own header, "only a VERIFIED
        // discovery result is selectable."
        selectDiscoveredPublication() {
            if (!this.isDiscoveredPublicationSelectable) {
                return;
            }
            this.selectedDiscoveredPublication = this.discoveryResult;
        },
        // 0.9.291 — the only writer of `encounterCommentaryOpen`. A no-op
        // whenever no `getPublicationCommentariesCommand` was injected, or
        // there is no current `encounterCommentaryPublicationId` — mirrors
        // `PublicationCard.js`'s own `toggleCommentary()`. The FIRST time
        // this opens for a given selection, this also performs the first
        // read — see this file's own header, "collapsed by default,
        // loaded only on first expansion."
        toggleEncounterCommentary() {
            if (!this.getPublicationCommentariesCommand || !this.encounterCommentaryPublicationId) {
                return;
            }
            const opening = !this.encounterCommentaryOpen;
            this.encounterCommentaryOpen = opening;
            if (opening) {
                this.refreshEncounterCommentaries();
            }
        },
        // 0.9.291 — the only writer of `encounterCommentaries`/
        // `encounterCommentaryError` from a read, and the only call site
        // of `getPublicationCommentariesCommand` in this file. A FAILED
        // read leaves `encounterCommentaries` exactly as it was — never
        // wiped to `[]` — and only sets `encounterCommentaryError`,
        // mirroring `PublicationCard.js`'s own `refreshCommentaries()`.
        refreshEncounterCommentaries() {
            if (!this.getPublicationCommentariesCommand || !this.encounterCommentaryPublicationId) {
                return;
            }
            try {
                const result = this.getPublicationCommentariesCommand(this.encounterCommentaryPublicationId);
                this.encounterCommentaries = Array.isArray(result) ? result : [];
                this.encounterCommentaryError = null;
            } catch (error) {
                this.encounterCommentaryError = 'Commentary could not be loaded.';
            }
        },
        // 0.9.291 — the only call site of `addPublicationCommentaryCommand`
        // in this file. Sends ONLY `{ publicationId, content }` — see this
        // file's own header, "authorship is never UI-supplied." On
        // success, clears the compose draft and RE-QUERIES through
        // `refreshEncounterCommentaries()` rather than appending the
        // returned commentary itself — one source of truth, never a
        // second, UI-maintained interpretation of the store's own
        // collection, mirroring `PublicationCard.js`'s/
        // `OwnPublicationPanel.js`'s own identical restraint. On failure,
        // `newEncounterCommentaryText`/`encounterCommentaries` are both
        // left UNCHANGED.
        //
        // 0.9.542 — see `pendingEncounterCommentaryDraft`'s own data()
        // header, and `PublicationCard.js`'s own `submitCommentary()`
        // header for the full rationale: a manual retry of an unedited
        // draft after an error reuses the SAME commentaryId/createdAt,
        // landing on the store's own idempotent no-op if the earlier
        // attempt actually persisted, never a second, duplicate
        // commentary. Editing the draft before retrying mints a fresh id.
        submitEncounterCommentary() {
            const publicationId = this.encounterCommentaryPublicationId;
            const content = this.newEncounterCommentaryText.trim();
            if (!publicationId || !this.addPublicationCommentaryCommand || !content || this.encounterCommentarySubmitting) {
                return;
            }
            if (!this.pendingEncounterCommentaryDraft || this.pendingEncounterCommentaryDraft.content !== content) {
                this.pendingEncounterCommentaryDraft = { content, commentaryId: createId(), createdAt: new Date() };
            }
            const { commentaryId, createdAt } = this.pendingEncounterCommentaryDraft;
            this.encounterCommentarySubmitting = true;
            try {
                this.addPublicationCommentaryCommand({ publicationId, content, commentaryId, createdAt });
                this.newEncounterCommentaryText = '';
                this.encounterCommentaryError = null;
                this.pendingEncounterCommentaryDraft = null;
                this.refreshEncounterCommentaries();
            } catch (error) {
                this.encounterCommentaryError = (error && error.message) ? error.message : 'Commentary could not be created.';
            } finally {
                this.encounterCommentarySubmitting = false;
            }
        }
    },
    // 0.9.13 — seed, then subscribe; see this file's own header,
    // "`mounted()`: seed, then subscribe." A no-op when no `registry`
    // was supplied — this component then behaves exactly as it did
    // before 0.9.13.
    mounted() {
        if (this.registry && typeof this.registry.subscribe === 'function') {
            this.refreshWorldViewFromRegistry();
            this.refreshSelectionOutcome();
            // 0.9.182 — seeds `comparisonSelectionOutcome` too, mirroring
            // `refreshSelectionOutcome()` immediately above exactly, one
            // selection over. A no-op whenever there is no
            // `comparisonEncounter` yet (the common case at mount time).
            this.refreshComparisonSelectionOutcome();
            this.unsubscribeWorldRegistry = this.registry.subscribe(() => {
                this.refreshWorldViewFromRegistry();
                // 0.9.20 — a source appearing or disappearing while a
                // selection stays open can change its own candidate list
                // (an ambiguous selection resolving down to one, a resolved
                // one disappearing entirely, or a new peer joining an
                // already-ambiguous one) — see this file's own header,
                // "selectionOutcome is data, written by
                // refreshSelectionOutcome() — never a computed," for why
                // this must be an explicit call here, mirroring
                // refreshWorldViewFromRegistry() immediately above.
                this.refreshSelectionOutcome();
                // 0.9.182 — the SAME reasoning applies to a live comparison
                // target: if its own source leaves the registry while a
                // comparison is open, `comparisonSelectionOutcome` must
                // re-derive too, so `worldSnapshotComparisonResult` collapses
                // to "no longer actionable" rather than staying stale.
                this.refreshComparisonSelectionOutcome();
            });
        }
        // 0.9.40 — a second, independent optional registry subscription,
        // mirroring the block immediately above exactly, one layer over:
        // for decentralized leads instead of World discovery sources. See
        // this file's own header, "0.9.40 — Decentralized Lead Resolution
        // Integration."
        if (this.worldDiscoveryLeadRegistry && typeof this.worldDiscoveryLeadRegistry.subscribe === 'function') {
            this.refreshDecentralizedLeadOutcome();
            this.refreshMaterialInspection();
            this.unsubscribeWorldDiscoveryLeadRegistry = this.worldDiscoveryLeadRegistry.subscribe(() => {
                // 0.9.40 — `refreshDecentralizedLeadOutcome()` never
                // tail-calls `refreshMaterialInspection()` itself (see that
                // method's own header); this listener triggers it
                // explicitly, exactly once per notification, mirroring
                // `this.registry.subscribe()`'s own listener immediately
                // above.
                this.refreshDecentralizedLeadOutcome();
                this.refreshMaterialInspection();
            });
        }
        // 0.9.552 — a third, independent optional subscription, mirroring
        // the `registry` block at the top of this method exactly, one
        // store over: seed, then subscribe.
        if (this.observerLocalEncounterRegistry && typeof this.observerLocalEncounterRegistry.subscribe === 'function') {
            this.refreshObserverLocalEncountersFromRegistry();
            this.unsubscribeObserverLocalEncounterRegistry = this.observerLocalEncounterRegistry.subscribe(() => {
                this.refreshObserverLocalEncountersFromRegistry();
            });
        }
    },
    // 0.9.13 — unsubscribes, unconditionally and idempotently; see this
    // file's own header, "`beforeUnmount()` unsubscribes." As of 0.9.101
    // this, and the two mirrored blocks below it, all call the one
    // `stopSubscription()` helper (see that method's own header) rather
    // than repeating its three-line body per collaborator — the three
    // subscriptions themselves stay exactly as independent as they always
    // were.
    beforeUnmount() {
        this.stopSubscription('unsubscribeWorldRegistry');
        // 0.9.40 — unsubscribes the lead registry too, unconditionally and
        // idempotently, mirroring the block immediately above.
        this.stopSubscription('unsubscribeWorldDiscoveryLeadRegistry');
        // 0.9.552 — unsubscribes the observer-local encounter store too,
        // unconditionally and idempotently, mirroring the two blocks above.
        this.stopSubscription('unsubscribeObserverLocalEncounterRegistry');
        // 0.9.39 — invalidates any still-pending `inspectWorldEncounterMaterial()`
        // request; see this file's own header, "beforeUnmount() also
        // invalidates any in-flight request."
        this.materialInspectionRequestId += 1;
        // 0.9.184 — invalidates any still-pending
        // `inspectWorldEncounterMaterial()` request for the comparison
        // target too, mirroring the invalidation immediately above exactly,
        // one selection over.
        this.comparisonMaterialInspectionRequestId += 1;
        // 0.9.554 — invalidates any still-pending
        // `inspectWorldEncounterMaterial()` request for an observer-local
        // encounter selection too, mirroring the invalidation immediately
        // above, one selection concept over.
        this.observerLocalEncounterInspectionRequestId += 1;
        // 0.9.100 — unsubscribes from `distributionLifecycleStore` too,
        // unconditionally and idempotently, mirroring the two blocks above.
        this.stopSubscription('unsubscribeDistributionLifecycle');
        // 0.9.104 — invalidates any still-in-flight `distributionCommand`
        // call, mirroring `materialInspectionRequestId`'s own unmount
        // invalidation immediately above, one layer over.
        this.distributionRequestId += 1;
        // 0.9.138 — invalidates any still-in-flight `snapshotDistributionCommand`
        // call, mirroring `distributionRequestId`'s own unmount invalidation
        // immediately above, one collaborator over.
        this.snapshotDistributionRequestId += 1;
        // 0.9.144 — invalidates any still-in-flight `discoverSnapshotCommand`
        // call, mirroring `snapshotDistributionRequestId`'s own unmount
        // invalidation immediately above, one action over.
        this.snapshotDiscoveryRequestId += 1;
        // 0.9.111 — invalidates any still-in-flight `discoveryCommand`
        // call, mirroring `distributionRequestId`'s own unmount
        // invalidation immediately above, one layer over.
        this.discoveryRequestId += 1;
    },
    template: `
        <div class="world-encounter-view">
            <svg
                class="world-encounter-canvas"
                viewBox="0 0 600 600"
                role="img"
                aria-label="World View"
            >
                <rect class="world-encounter-canvas-background" x="0" y="0" width="600" height="600" />

                <text v-if="isWorldEmpty" class="world-encounter-canvas-empty-hint" x="300" y="24" text-anchor="middle">
                    Nothing encounterable here yet.
                </text>

                <WorldEncounterMarker
                    v-for="marker in projectedPublications"
                    :key="'publication:' + marker.objectId"
                    kind="PUBLICATION"
                    :object-id="marker.objectId"
                    :label="marker.label"
                    :x="marker.x"
                    :y="marker.y"
                    @select="selectEncounter"
                />

                <WorldEncounterMarker
                    v-for="marker in projectedAvatars"
                    :key="'avatar:' + marker.objectId"
                    kind="AVATAR"
                    :object-id="marker.objectId"
                    :label="marker.label"
                    :x="marker.x"
                    :y="marker.y"
                    @select="selectEncounter"
                />

                <!-- 0.9.552 — see this file's own header, above, "vocabulary: discovered here, never placed."
                     0.9.554 — @click added: see this file's own "0.9.554" header, "still never selectable
                     through the existing machinery" — a genuinely separate event, bound to a genuinely
                     separate method, never @select and never <WorldEncounterMarker>. -->
                <g
                    v-for="marker in projectedObserverLocalEncounters"
                    :key="'observer-local:' + marker.publicationId + ':' + marker.contentHash"
                    class="world-encounter-observer-local-marker"
                    :transform="'translate(' + marker.x + ',' + marker.y + ')'"
                    :data-publication-id="marker.publicationId"
                    @click="selectObserverLocalEncounter(marker)"
                >
                    <text class="world-encounter-marker-glyph" text-anchor="middle" dy="4">📄</text>
                    <text class="world-encounter-observer-local-label" text-anchor="middle" dy="18">Discovered here</text>
                    <title>This publication was discovered while you were here. Its publisher's own location claim has not been used as a World placement.</title>
                </g>

                <WandererMarker :x="projectedWanderer.x" :y="projectedWanderer.y" />
            </svg>

            <div v-if="selectedEncounter" class="world-encounter-inspection-panel">
                <h4 class="world-encounter-inspection-title">World Encounter</h4>

                <dl v-if="selectedEncounterInspection && selectedEncounterInspection.kind === 'PUBLICATION'" class="world-encounter-inspection-detail">
                    <dt>Kind</dt>
                    <dd>Publication</dd>
                    <dt>Source</dt>
                    <dd class="world-encounter-inspection-source" :class="'world-encounter-inspection-source--' + selectedEncounterPresentationSourceLabel.toLowerCase()">{{ selectedEncounterPresentationSourceLabel }}</dd>
                    <dt>Title</dt>
                    <dd>{{ selectedEncounterInspection.title }}</dd>
                    <dt>Publisher</dt>
                    <dd>{{ selectedEncounterInspectionPublisherIdentityLabel }}</dd>
                    <dt>Signed</dt>
                    <dd>{{ selectedEncounterInspection.isSigned ? 'Yes' : 'No' }}</dd>
                    <dt>Position</dt>
                    <dd>{{ selectedEncounterInspection.x }}, {{ selectedEncounterInspection.y }}, {{ selectedEncounterInspection.z }}</dd>
                    <dt>Anchors</dt>
                    <dd>{{ selectedEncounterInspection.anchorCount }}</dd>
                    <dt>Placements</dt>
                    <dd>{{ selectedEncounterInspection.placementCount }}</dd>
                    <template v-if="selectedEncounterSnapshotInspection">
                        <dt>Content Hash</dt>
                        <dd class="world-encounter-inspection-content-hash">{{ selectedEncounterSnapshotInspection.contentHash || 'Unknown' }}</dd>
                    </template>
                </dl>

                <dl v-else-if="selectedEncounterInspection && selectedEncounterInspection.kind === 'AVATAR'" class="world-encounter-inspection-detail">
                    <dt>Kind</dt>
                    <dd>Avatar</dd>
                    <dt>Source</dt>
                    <dd class="world-encounter-inspection-source" :class="'world-encounter-inspection-source--' + selectedEncounterPresentationSourceLabel.toLowerCase()">{{ selectedEncounterPresentationSourceLabel }}</dd>
                    <dt>Name</dt>
                    <dd>{{ selectedEncounterInspection.displayName }}</dd>
                    <dt>Owner</dt>
                    <dd>{{ selectedEncounterInspection.ownerIdentity }}</dd>
                    <dt>Position</dt>
                    <dd>{{ selectedEncounterInspection.x }}, {{ selectedEncounterInspection.y }}, {{ selectedEncounterInspection.z }}</dd>
                </dl>

                <p v-else class="world-encounter-inspection-unavailable">
                    This encounter is no longer part of the World.
                </p>

                <div v-if="selectedEncounterSnapshotInspection" class="world-encounter-inspection-actions">
                    <button
                        type="button"
                        class="world-encounter-unregister-snapshot"
                        @click="unregisterSelectedSnapshot"
                    >Remove Snapshot from World</button>
                </div>

                <!-- 0.9.291 — Publication Commentary on the World Encounter
                     Surface. Rendered only when a caller supplied
                     getPublicationCommentariesCommand AND the current
                     selection is a live PUBLICATION encounter — see this
                     file's own "0.9.291" header. Never gated on ownership:
                     shown identically whether the encountered Publication
                     is the Wanderer's own or another Wanderer's. -->
                <div v-if="encounterCommentaryPublicationId && getPublicationCommentariesCommand" class="world-encounter-commentary-panel">
                    <h4 class="world-encounter-commentary-title">Commentary</h4>

                    <button
                        type="button"
                        class="action-btn world-encounter-commentary-toggle"
                        @click="toggleEncounterCommentary"
                    >{{ encounterCommentaryOpen ? 'Hide Comments' : 'Comment' }}</button>

                    <div v-if="encounterCommentaryOpen" class="world-encounter-commentary-body">
                        <p v-if="encounterCommentaryError" class="world-encounter-commentary-error">{{ encounterCommentaryError }}</p>

                        <p v-if="!encounterCommentaries.length" class="world-encounter-commentary-empty">No commentary yet.</p>
                        <ul v-else class="world-encounter-commentary-list">
                            <li
                                v-for="commentary in encounterCommentaries"
                                :key="commentary.commentaryId"
                                class="world-encounter-commentary-entry"
                            >
                                <span class="world-encounter-commentary-author">{{ commentary.authorIdentityId }}</span>
                                <p class="world-encounter-commentary-content">{{ commentary.content }}</p>
                            </li>
                        </ul>

                        <p v-if="addPublicationCommentaryCommand && !viewerIdentityId" class="world-encounter-commentary-signin-hint">
                            Sign in to add commentary.
                        </p>
                        <form
                            v-else-if="addPublicationCommentaryCommand"
                            class="world-encounter-commentary-form"
                            @submit.prevent="submitEncounterCommentary"
                        >
                            <textarea
                                v-model="newEncounterCommentaryText"
                                class="world-encounter-commentary-input"
                                :disabled="encounterCommentarySubmitting"
                                placeholder="Add a comment…"
                            ></textarea>
                            <button
                                type="submit"
                                class="action-btn world-encounter-commentary-submit-action"
                                :disabled="!newEncounterCommentaryText.trim() || encounterCommentarySubmitting"
                            >{{ encounterCommentarySubmitting ? 'Posting…' : 'Post Comment' }}</button>
                        </form>
                    </div>
                </div>
            </div>

            <!-- 0.9.554 — Observer-Local Encounter Inspection Capability.
                 A THIRD, separate inspection panel — never merged into the
                 "World Encounter" panel above, and never a re-shaping of it.
                 See this file's own "0.9.554" header for why:
                 selectedObserverLocalEncounter names an ephemeral,
                 session-local observation with no World-placement
                 standing of its own, never
                 selectedEncounter/resolvedEncounterSelection. Both
                 panels may be open at once, independently — mirroring
                 0.9.553's own Section K, which already proved the two
                 rendering channels coexist without merging or
                 cross-counting. -->
            <div v-if="selectedObserverLocalEncounter" class="world-encounter-inspection-panel world-encounter-observer-local-inspection-panel">
                <h4 class="world-encounter-inspection-title">Discovered Publication</h4>

                <!-- Answers "is it temporary?" explicitly — see this
                     milestone's own product brief, item 3: "The UI can
                     explain that... This accurately reflects the
                     session-scoped store without implying World
                     placement." -->
                <p class="world-encounter-observer-local-inspection-note">
                    This was discovered during your current World session. It has not been placed
                    anywhere in the shared World, and will not be found here again after you leave
                    or reload.
                </p>

                <dl class="world-encounter-inspection-detail">
                    <dt>Publication</dt>
                    <dd>{{ selectedObserverLocalEncounter.publicationId }}</dd>
                    <dt>Content Hash</dt>
                    <dd class="world-encounter-inspection-content-hash">{{ selectedObserverLocalEncounter.contentHash }}</dd>
                </dl>

                <!-- Reuses the EXACT same Material/Verification vocabulary
                     (and the same describeMaterialLoadStatusLabel()/
                     describeMaterialVerificationStatusLabel() view helpers,
                     application/WorldEncounterMaterialInspectionView.js) the
                     primary selection's own panel already renders below —
                     see this file's own "0.9.554" header, "the same
                     orchestration boundary, called fresh." -->
                <template v-if="observerLocalEncounterInspection">
                    <h4 class="world-encounter-material-title">Material</h4>
                    <dl class="world-encounter-material-detail">
                        <dt>Status</dt>
                        <dd>{{ describeMaterialLoadStatusLabel(observerLocalEncounterInspection.loading.status) }}</dd>
                    </dl>

                    <h4 class="world-encounter-verification-title">Verification</h4>
                    <dl class="world-encounter-verification-detail">
                        <dt>Status</dt>
                        <dd>{{ describeMaterialVerificationStatusLabel(observerLocalEncounterInspection.verification.status) }}</dd>
                    </dl>
                </template>
                <p v-else class="world-encounter-inspection-unavailable">
                    This publication's material could not be inspected.
                </p>

                <!-- 0.9.558 — Known Publication Encounter Continuation.
                     Rendered ONLY once observerLocalEncounterActionablePublication
                     is non-null — a genuine AVAILABLE + VERIFIED
                     resolution, never a still-loading, unavailable, or
                     unverified one. Every action below is handed that
                     SAME already-resolved object directly; none of them
                     re-derive identity from selectedObserverLocalEncounter
                     or perform a second lookup of any kind — see 0.9.557's
                     own verdict, "the resolved object itself is the
                     correct hand-off object." Presented in ordinary
                     vocabulary (the Publication's own title, and plain
                     action verbs) — publicationId/contentHash stay exactly
                     where the detail list above already shows them, never
                     repeated here as if they were the primary affordance. -->
                <div v-if="observerLocalEncounterActionablePublication" class="world-encounter-observer-local-actions">
                    <h4 class="world-encounter-observer-local-actions-title">{{ observerLocalEncounterActionablePublication.title || 'This publication' }}</h4>
                    <button
                        v-if="openPublicationCommand"
                        type="button"
                        class="action-btn world-encounter-observer-local-open"
                        @click="openObserverLocalEncounterPublication"
                    >Open</button>
                    <button
                        v-if="explorePublicationCommand"
                        type="button"
                        class="action-btn world-encounter-observer-local-explore"
                        @click="exploreObserverLocalEncounterPublication"
                    >Explore</button>
                    <button
                        v-if="forkPublicationCommand"
                        type="button"
                        class="action-btn world-encounter-observer-local-fork"
                        @click="forkObserverLocalEncounterPublication"
                    >Fork</button>
                </div>

                <!-- 0.9.558 — Commentary for a known observer-local
                     encounter. Mirrors the primary selection's own
                     Commentary panel (0.9.291) verbatim, structure for
                     structure, bound to this file's own SEPARATE
                     observerLocalEncounterCommentary-prefixed state (never
                     encounterCommentary* itself) — both panels' own
                     Commentary sections may be open independently, exactly
                     like the two selections themselves already can be.
                     Deliberately NOT gated on
                     observerLocalEncounterActionablePublication above —
                     see that computed's own sibling,
                     observerLocalEncounterCommentaryPublicationId's own
                     header, for why Commentary never waits on material
                     loading/verification. -->
                <div v-if="observerLocalEncounterCommentaryPublicationId && getPublicationCommentariesCommand" class="world-encounter-observer-local-commentary-panel">
                    <h4 class="world-encounter-observer-local-commentary-title">Commentary</h4>

                    <button
                        type="button"
                        class="action-btn world-encounter-observer-local-commentary-toggle"
                        @click="toggleObserverLocalEncounterCommentary"
                    >{{ observerLocalEncounterCommentaryOpen ? 'Hide Comments' : 'Comment' }}</button>

                    <div v-if="observerLocalEncounterCommentaryOpen" class="world-encounter-observer-local-commentary-body">
                        <p v-if="observerLocalEncounterCommentaryError" class="world-encounter-observer-local-commentary-error">{{ observerLocalEncounterCommentaryError }}</p>

                        <p v-if="!observerLocalEncounterCommentaries.length" class="world-encounter-observer-local-commentary-empty">No commentary yet.</p>
                        <ul v-else class="world-encounter-observer-local-commentary-list">
                            <li
                                v-for="commentary in observerLocalEncounterCommentaries"
                                :key="commentary.commentaryId"
                                class="world-encounter-observer-local-commentary-entry"
                            >
                                <span class="world-encounter-observer-local-commentary-author">{{ commentary.authorIdentityId }}</span>
                                <p class="world-encounter-observer-local-commentary-content">{{ commentary.content }}</p>
                            </li>
                        </ul>

                        <p v-if="addPublicationCommentaryCommand && !viewerIdentityId" class="world-encounter-observer-local-commentary-signin-hint">
                            Sign in to add commentary.
                        </p>
                        <form
                            v-else-if="addPublicationCommentaryCommand"
                            class="world-encounter-observer-local-commentary-form"
                            @submit.prevent="submitObserverLocalEncounterCommentary"
                        >
                            <textarea
                                v-model="newObserverLocalEncounterCommentaryText"
                                class="world-encounter-observer-local-commentary-input"
                                :disabled="observerLocalEncounterCommentarySubmitting"
                                placeholder="Add a comment…"
                            ></textarea>
                            <button
                                type="submit"
                                class="action-btn world-encounter-observer-local-commentary-submit-action"
                                :disabled="!newObserverLocalEncounterCommentaryText.trim() || observerLocalEncounterCommentarySubmitting"
                            >{{ observerLocalEncounterCommentarySubmitting ? 'Posting…' : 'Post Comment' }}</button>
                        </form>
                    </div>
                </div>

                <button
                    type="button"
                    class="action-btn world-encounter-observer-local-inspection-close"
                    @click="dismissObserverLocalEncounterInspection"
                >Close</button>
            </div>

            <!-- 0.9.183 — a SEPARATE panel from the inspection actions row
                 immediately above, mirroring the Compare panel's own
                 structure exactly, one panel over: an "arm" button while
                 closed, the actual observation while open. Gated on
                 selectedEncounterSnapshotInspection — the same gate
                 "Remove Snapshot from World" already uses — so "View
                 Snapshot" stays unreachable for a non-Snapshot, or
                 unresolved, selection exactly like that action already
                 does. See this file's own "0.9.183" header. -->
            <div v-if="selectedEncounterSnapshotInspection" class="world-snapshot-content-view-panel">
                <h4 class="world-snapshot-content-view-title">Snapshot Content</h4>

                <template v-if="!snapshotContentViewOpen">
                    <!-- Actionable only while selectedSnapshotContentView is
                         genuinely non-null — see application/
                         WorldSnapshotContentView.js's own header for
                         exactly what that requires. Never discovers,
                         resolves, materializes, or mutates the registry —
                         it only opens the detail below. -->
                    <button
                        type="button"
                        class="world-snapshot-content-view-action"
                        :disabled="!selectedSnapshotContentView"
                        @click="openSnapshotContentView"
                    >View Snapshot</button>
                </template>

                <template v-else>
                    <dl v-if="selectedSnapshotContentView" class="world-snapshot-content-view-detail">
                        <dt>Publication ID</dt>
                        <dd>{{ selectedSnapshotContentView.publicationId }}</dd>
                        <dt>Content Hash</dt>
                        <dd>{{ selectedSnapshotContentView.contentHash || 'Unknown' }}</dd>
                        <dt>Title</dt>
                        <dd>{{ selectedSnapshotContentView.material.title }}</dd>
                        <dt>Author</dt>
                        <dd>{{ selectedSnapshotContentView.material.author }}</dd>
                        <dt>Published</dt>
                        <dd>{{ selectedSnapshotContentView.material.publishedAt ? selectedSnapshotContentView.material.publishedAt.toLocaleDateString() : 'Unknown' }}</dd>
                        <template v-if="selectedSnapshotContentView.material.contentReference">
                            <dt>Content Reference</dt>
                            <dd>{{ selectedSnapshotContentView.material.contentReference.hash }}</dd>
                        </template>
                        <dt>Position</dt>
                        <dd>{{ selectedSnapshotContentView.position.x }}, {{ selectedSnapshotContentView.position.y }}, {{ selectedSnapshotContentView.position.z }}</dd>
                    </dl>
                    <!-- Mirrors the Compare panel's own "This comparison is
                         no longer available" collapse text exactly, one
                         panel over — material can stop being AVAILABLE
                         while this panel stays open. -->
                    <p v-else class="world-snapshot-content-view-unavailable">
                        This Snapshot's content is no longer available.
                    </p>
                    <button
                        type="button"
                        class="world-snapshot-content-view-close"
                        @click="closeSnapshotContentView"
                    >Close</button>
                </template>
            </div>

            <div v-if="selectedPublicationComparisonCandidate" class="world-snapshot-comparison-panel">
                <h4 class="world-snapshot-comparison-title">Compare</h4>

                <template v-if="!comparisonEncounter">
                    <button
                        type="button"
                        class="world-snapshot-comparison-arm"
                        :disabled="armedForComparisonSelection"
                        @click="armComparisonSelection"
                    >Compare with…</button>
                    <p v-if="armedForComparisonSelection" class="world-snapshot-comparison-hint">
                        Click another Publication marker to compare.
                    </p>
                </template>

                <template v-else>
                    <dl class="world-snapshot-comparison-detail">
                        <dt>Publication A</dt>
                        <dd>{{ selectedPublicationComparisonCandidate.publicationId }}</dd>
                        <dt>Publication B</dt>
                        <dd>{{ comparisonPublicationComparisonCandidate ? comparisonPublicationComparisonCandidate.publicationId : comparisonEncounter.objectId }}</dd>
                        <dt>Result</dt>
                        <dd class="world-snapshot-comparison-result">
                            <template v-if="!worldSnapshotComparisonResult">This comparison is no longer available.</template>
                            <template v-else-if="worldSnapshotComparisonResult.contentComparison === 'SAME_CONTENT'">Same content</template>
                            <template v-else-if="worldSnapshotComparisonResult.contentComparison === 'DIFFERENT_CONTENT'">Different content</template>
                            <template v-else>Content identity not yet known</template>
                        </dd>
                    </dl>
                    <button
                        type="button"
                        class="world-snapshot-comparison-clear"
                        @click="clearComparisonSelection"
                    >Clear comparison</button>
                </template>
            </div>

            <!-- 0.9.184 — a SEPARATE panel from the Compare panel
                 immediately above, mirroring the Snapshot Content panel's
                 own arm/observe structure exactly, one panel over. Gated on
                 comparisonEncounter alone (the Compare panel's own
                 detail-view gate) so it appears alongside the comparison
                 fact once a target is explicitly chosen — its own action
                 button independently gates on worldSnapshotContentComparisonView
                 being genuinely available. See this file's own "0.9.184"
                 header. -->
            <div v-if="comparisonEncounter" class="world-snapshot-content-comparison-panel">
                <h4 class="world-snapshot-content-comparison-title">Content Comparison</h4>

                <template v-if="!contentComparisonViewOpen">
                    <!-- Actionable only while worldSnapshotContentComparisonView is
                         genuinely non-null — both sides' material must
                         already be AVAILABLE. Never discovers, resolves,
                         materializes, or mutates the registry. -->
                    <button
                        type="button"
                        class="world-snapshot-content-comparison-action"
                        :disabled="!worldSnapshotContentComparisonView"
                        @click="openContentComparisonView"
                    >View Content Comparison</button>
                </template>

                <template v-else>
                    <template v-if="worldSnapshotContentComparisonView">
                        <dl class="world-snapshot-content-comparison-result">
                            <dt>Content</dt>
                            <dd>
                                <template v-if="worldSnapshotContentComparisonView.contentComparison === 'SAME_CONTENT'">Same content</template>
                                <template v-else-if="worldSnapshotContentComparisonView.contentComparison === 'DIFFERENT_CONTENT'">Different content</template>
                                <template v-else>Content identity not yet known</template>
                            </dd>
                        </dl>
                        <div class="world-snapshot-content-comparison-materials">
                            <div class="world-snapshot-content-comparison-material">
                                <h5>Snapshot A</h5>
                                <dl>
                                    <dt>Publication ID</dt>
                                    <dd>{{ worldSnapshotContentComparisonView.aMaterial.publicationId }}</dd>
                                    <dt>Title</dt>
                                    <dd>{{ worldSnapshotContentComparisonView.aMaterial.material.title }}</dd>
                                    <dt>Author</dt>
                                    <dd>{{ worldSnapshotContentComparisonView.aMaterial.material.author }}</dd>
                                    <dt>Position</dt>
                                    <dd>{{ worldSnapshotContentComparisonView.aMaterial.position.x }}, {{ worldSnapshotContentComparisonView.aMaterial.position.y }}, {{ worldSnapshotContentComparisonView.aMaterial.position.z }}</dd>
                                </dl>
                            </div>
                            <div class="world-snapshot-content-comparison-material">
                                <h5>Snapshot B</h5>
                                <dl>
                                    <dt>Publication ID</dt>
                                    <dd>{{ worldSnapshotContentComparisonView.bMaterial.publicationId }}</dd>
                                    <dt>Title</dt>
                                    <dd>{{ worldSnapshotContentComparisonView.bMaterial.material.title }}</dd>
                                    <dt>Author</dt>
                                    <dd>{{ worldSnapshotContentComparisonView.bMaterial.material.author }}</dd>
                                    <dt>Position</dt>
                                    <dd>{{ worldSnapshotContentComparisonView.bMaterial.position.x }}, {{ worldSnapshotContentComparisonView.bMaterial.position.y }}, {{ worldSnapshotContentComparisonView.bMaterial.position.z }}</dd>
                                </dl>
                            </div>
                        </div>
                    </template>
                    <!-- Mirrors the Snapshot Content panel's own "no longer
                         available" collapse text exactly, one panel over —
                         either side's material can stop being AVAILABLE
                         while this panel stays open. -->
                    <p v-else class="world-snapshot-content-comparison-unavailable">
                        This content comparison is no longer available.
                    </p>
                    <button
                        type="button"
                        class="world-snapshot-content-comparison-close"
                        @click="closeContentComparisonView"
                    >Close</button>
                </template>
            </div>

            <div v-if="selectedEncounter && selectionOutcome && selectionOutcome.status !== 'UNAVAILABLE'" class="world-encounter-selection-origin-panel">
                <template v-if="selectionOutcome.status === 'AMBIGUOUS'">
                    <h4 class="world-encounter-selection-origin-title">Choose Source</h4>
                    <p v-if="!resolvedEncounterSelection" class="world-encounter-selection-origin-hint">
                        This encounter is offered by more than one source.
                    </p>
                    <ul class="world-encounter-selection-origin-list">
                        <li v-for="candidate in selectionOutcome.candidates" :key="candidate.origin">
                            <button
                                type="button"
                                class="world-encounter-selection-origin-choice"
                                :class="{ 'world-encounter-selection-origin-choice-active': resolvedEncounterSelection && resolvedEncounterSelection.origin === candidate.origin }"
                                @click="chooseSelectionOrigin(candidate)"
                            >{{ describeSelectionOriginLabel(candidate.origin) }}</button>
                        </li>
                    </ul>
                </template>

                <p v-else-if="selectionOutcome.status === 'RESOLVED'" class="world-encounter-selection-origin-resolved">
                    Source: {{ describeSelectionOriginLabel(selectionOutcome.resolvedSelection.origin) }}
                </p>
            </div>

            <div v-if="selectedEncounter && decentralizedLeadOutcome && decentralizedLeadOutcome.status !== 'UNAVAILABLE'" class="world-encounter-lead-panel">
                <template v-if="decentralizedLeadOutcome.status === 'AMBIGUOUS'">
                    <h4 class="world-encounter-lead-title">Choose Location</h4>
                    <p v-if="!resolvedLead" class="world-encounter-lead-hint">
                        More than one decentralized lead is currently associated with this encounter.
                    </p>
                    <ul class="world-encounter-lead-list">
                        <li v-for="candidate in decentralizedLeadOutcome.candidates" :key="candidate.origin + '|' + candidate.discoveryTag + '|' + candidate.uri">
                            <button
                                type="button"
                                class="world-encounter-lead-choice"
                                :class="{ 'world-encounter-lead-choice-active': resolvedLead && resolvedLead.origin === candidate.origin && resolvedLead.discoveryTag === candidate.discoveryTag && resolvedLead.uri === candidate.uri }"
                                @click="chooseDecentralizedLead(candidate)"
                            >{{ describeDecentralizedLeadUriLabel(candidate.uri) }}</button>
                        </li>
                    </ul>
                </template>

                <p v-else-if="decentralizedLeadOutcome.status === 'RESOLVED'" class="world-encounter-lead-resolved">
                    Location: {{ describeDecentralizedLeadUriLabel(decentralizedLeadOutcome.resolvedLead.uri) }}
                </p>
            </div>

            <!-- 0.9.519 — Publication Evidence & Trust Experience Product
                 Reassessment, Section A/H. loading.status/
                 verification.status are routed through application/
                 WorldEncounterMaterialInspectionView.js's own
                 describeWorldEncounterMaterialLoadStatusLabel()/
                 describeWorldEncounterMaterialVerificationStatusLabel()
                 rather than rendered as the raw
                 WorldEncounterMaterialLoadStatus/
                 WorldEncounterMaterialVerificationStatus enum constants —
                 see that file's own header on why the bare word "VERIFIED"
                 in particular is the concrete risk this closes: it means
                 IDENTITY CORRESPONDENCE to the selected encounter, never
                 authorship, ownership, or general trustworthiness. -->
            <div v-if="selectedEncounter && materialInspection" class="world-encounter-material-panel">
                <h4 class="world-encounter-material-title">Material</h4>
                <dl class="world-encounter-material-detail">
                    <dt>Status</dt>
                    <dd>{{ describeMaterialLoadStatusLabel(materialInspection.loading.status) }}</dd>
                </dl>

                <!-- 0.9.112 — Publication Provenance in World View. A plain
                     origin fact about THIS observation — see
                     application/PublicationMaterialProvenance.js's own
                     header. -->
                <dl v-if="materialProvenance" class="world-encounter-provenance-detail">
                    <dt>Source</dt>
                    <dd>{{ materialProvenance.origin }}</dd>
                </dl>

                <h4 class="world-encounter-verification-title">Verification</h4>
                <dl class="world-encounter-verification-detail">
                    <dt>Status</dt>
                    <dd>{{ describeMaterialVerificationStatusLabel(materialInspection.verification.status) }}</dd>
                </dl>
            </div>

            <!-- 0.9.672 — World View Distribution Dialog. Every
                 Distribution/Snapshot Distribution storage/substrate
                 picker, button, lifecycle status, and result display that
                 used to render inline here now lives in
                 WorldDistributionDialog.js (see that file's own header) —
                 a single "Distribute" trigger replaces them all on this
                 primary screen. Rendered whenever EITHER protocol is
                 usable at all; the dialog itself renders only the
                 section(s) that apply, exactly like each protocol's own
                 dedicated button already only rendered when that
                 protocol's own command was supplied. -->
            <button
                v-if="selectedEncounter && selectedEncounter.kind === 'PUBLICATION' && (distributionCommand || snapshotDistributionCommand)"
                type="button"
                class="action-btn world-encounter-distribution-trigger-action"
                :disabled="!distributablePublication"
                @click="distributionDialogOpen = true"
            >Distribute</button>

            <WorldDistributionDialog
                v-if="distributionDialogOpen"
                :can-distribute-publication="Boolean(distributionCommand)"
                :can-distribute-snapshot="Boolean(snapshotDistributionCommand)"
                :has-subject="Boolean(distributablePublication)"
                :distribution-executing="distributionExecuting"
                :distribution-error="distributionError"
                :show-distribution-lifecycle="Boolean(distributionLifecycleStore)"
                :distribution-material-state="distributionMaterialState"
                :distribution-discovery-state="distributionDiscoveryState"
                :discovery-observations="discoveryObservations"
                v-model:storage="selectedDistributionStorage"
                v-model:discovery-provider="selectedDiscoveryProvider"
                :remote-pinning-draft="remotePinningDraft"
                :snapshot-distribution-storage-types="snapshotDistributionStorageTypes"
                :snapshot-distribution-executing="snapshotDistributionExecuting"
                :snapshot-distribution-error="snapshotDistributionError"
                :snapshot-distribution-result="snapshotDistributionResult"
                @close="distributionDialogOpen = false"
                @distribute-both="distributeSelectedPublicationAndSnapshot"
                @distribute-publication="distributeSelectedPublication"
                @distribute-snapshot="distributeSelectedSnapshot"
            />

            <!-- 0.9.144 — a SEPARATE panel from Snapshot Distribution,
                 immediately above, mirroring its own "Divergence 2"
                 restraint: discovering/attributing a Snapshot and
                 distributing one are different questions about the same
                 Publication. Rendered only when a caller supplied a
                 discoverSnapshotCommand. See this file's own header,
                 "0.9.144 — World View Snapshot Attribution Integration." -->
            <div v-if="selectedEncounter && selectedEncounter.kind === 'PUBLICATION' && discoverSnapshotCommand" class="world-encounter-snapshot-discovery-panel">
                <h4 class="world-encounter-snapshot-discovery-title">Snapshot Discovery</h4>

                <!-- Disabled whenever there is nothing to discover for this
                     selection, or a call is already in flight — mirrors the
                     Distribute Snapshot button immediately above, exactly. -->
                <button
                    type="button"
                    class="action-btn world-encounter-snapshot-discovery-action"
                    :disabled="!distributablePublication || snapshotDiscoveryExecuting"
                    @click="discoverSelectedSnapshot"
                >{{ snapshotDiscoveryExecuting ? 'Discovering…' : 'Discover Snapshot' }}</button>

                <!-- The resolver's own outcome vocabulary — see this
                     file's own header. 0.9.528 — Snapshot Encounter &
                     Placement Product Experience Reassessment, Section
                     C/I: routed through application/
                     SnapshotOutcomeInspectionView.js's own
                     describeSnapshotResolutionOutcomeLabel() rather than
                     rendered as the raw outcome string, the identical
                     discipline this file's own 0.9.519 already applied to
                     the Material/Verification panel below, extended here. -->
                <p v-if="snapshotDiscoveryError" class="world-encounter-snapshot-discovery-error">{{ snapshotDiscoveryError }}</p>
                <dl v-else-if="snapshotDiscoveryResult" class="world-encounter-snapshot-discovery-detail">
                    <dt>Outcome</dt>
                    <dd>{{ describeSnapshotResolutionLabel(snapshotDiscoveryResult.outcome) }}</dd>
                    <template v-if="snapshotDiscoveryResult.reason">
                        <dt>Reason</dt>
                        <dd>{{ snapshotDiscoveryResult.reason }}</dd>
                    </template>
                    <template v-if="snapshotDiscoveryResult.locator">
                        <dt>Locator</dt>
                        <dd>{{ snapshotDiscoveryResult.locator }}</dd>
                    </template>
                </dl>

                <!-- A separate result, below Snapshot Discovery's own,
                     never merged into it — see this file's own header,
                     "0.9.144 — World View Snapshot Attribution
                     Integration," and application/
                     SnapshotPublicationAttribution.js's own header for what
                     MATCH does and does not mean. 0.9.528 — routed through
                     describeSnapshotAttributionLabel(): the bare word
                     "match" is exactly the unqualified claim
                     docs/Principles.md's 0.8.3 warns against, echoed here
                     as "Confirmed to match this Publication" — the
                     identical wording, and the identical narrow meaning
                     (a content-hash correspondence, never authorship or
                     trustworthiness), this file's own Material/
                     Verification panel already uses for the same
                     underlying kind of evidence. -->
                <dl v-if="snapshotAttributionResult" class="world-encounter-snapshot-attribution-detail">
                    <dt>Snapshot Attribution</dt>
                    <dd>{{ describeSnapshotAttributionLabel(snapshotAttributionResult.outcome) }}</dd>
                </dl>
            </div>

            <!-- 0.9.360 — Relocate Publication Discovery to a Secondary
                 Diagnostic Surface. Trigger only; gated on the SAME prop
                 (discoveryCommand) the panel inside the popup already gates
                 on individually — see this file's own 0.9.360 header. -->
            <button
                v-if="discoveryCommand"
                type="button"
                class="action-btn world-encounter-publication-discovery-trigger"
                @click="publicationDiscoveryOpen = true"
            >Publication Discovery</button>

            <div
                v-if="publicationDiscoveryOpen"
                class="modal-overlay world-encounter-publication-discovery-overlay"
                @click.self="publicationDiscoveryOpen = false"
            >
                <div class="modal-panel world-encounter-publication-discovery-modal">
                    <h3>Publication Discovery</h3>

                    <!-- 0.9.111 — entirely independent of selectedEncounter: a
                         discovered Publication is never a marker — see this file's
                         own header, "a discovered Publication is never a marker."
                         Rendered only when a caller supplied a discoveryCommand.
                         The Material/Verification dl blocks below reuse the EXACT
                         same CSS classes/shape the selection-driven panel above
                         already renders — see this file's own header, "the
                         existing inspection mechanism stays canonical." -->
                    <div v-if="discoveryCommand" class="world-encounter-discovery-panel">
                        <h4 class="world-encounter-discovery-title">Discover Publication</h4>
                        <input v-model="discoveryObjectId" placeholder="Publication id" :disabled="discovering" />
                        <input v-model="discoveryTag" placeholder="Discovery tag" :disabled="discovering" />
                        <button
                            type="button"
                            class="action-btn world-encounter-discovery-action"
                            :disabled="discovering"
                            @click="discoverPublication"
                        >{{ discovering ? 'Discovering…' : 'Discover Publication' }}</button>

                        <p v-if="discoveryError" class="world-encounter-discovery-error">{{ discoveryError }}</p>
                        <template v-else-if="discoveryResult">
                            <!-- discoveryResult.resolution.status stays raw, deliberately —
                                 DecentralizedWorldEncounterLeadResolutionStatus's own three
                                 values (UNAVAILABLE/RESOLVED/AMBIGUOUS, 0.9.28) are plain,
                                 pre-existing technical tokens with no claim word, this
                                 file's own header already documents rendering them "as its
                                 own existing vocabulary," and no humanizer for this enum
                                 exists anywhere in this codebase to route through. -->
                            <dl class="world-encounter-discovery-detail">
                                <dt>Discovery</dt>
                                <dd>{{ discoveryResult.resolution.status }}</dd>
                            </dl>

                            <!-- 0.9.521 — Close Remaining Raw Status Rendering Boundaries.
                                 0.9.520's own Finding 1 (Section D/I): this Discovery-driven
                                 panel is a SECOND call site into the exact
                                 WorldEncounterMaterialLoadStatus/VerificationStatus enums
                                 0.9.519 already routed through
                                 describeMaterialLoadStatusLabel()/
                                 describeMaterialVerificationStatusLabel() for the
                                 SELECTION-driven Material/Verification panel above — this
                                 one (0.9.111-0.9.113, predating 0.9.519) rendered the same
                                 raw enum constants instead. Reusing the SAME two methods
                                 here, rather than writing a second, competing humanizer,
                                 is the whole fix: it guarantees this panel can never
                                 communicate a stronger verification claim than the
                                 selection-driven panel does for the identical underlying
                                 fact — see that panel's own comment, above, for why the
                                 bare word "VERIFIED" in particular is the risk this
                                 closes. -->
                            <template v-if="discoveryResult.inspection">
                                <h4 class="world-encounter-material-title">Material</h4>
                                <dl class="world-encounter-material-detail">
                                    <dt>Status</dt>
                                    <dd>{{ describeMaterialLoadStatusLabel(discoveryResult.inspection.loading.status) }}</dd>
                                </dl>

                                <!-- 0.9.112 — discoveryResult.provenance is already
                                     computed by 0.9.110's own runtime composition
                                     (application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js)
                                     and forwarded verbatim through 0.9.111's own
                                     command boundary — rendered directly, never
                                     re-derived here. See this file's own header,
                                     "discoveryResult.provenance is rendered
                                     verbatim." -->
                                <dl v-if="discoveryResult.provenance" class="world-encounter-provenance-detail">
                                    <dt>Source</dt>
                                    <dd>{{ discoveryResult.provenance.origin }}</dd>
                                </dl>

                                <h4 class="world-encounter-verification-title">Verification</h4>
                                <dl class="world-encounter-verification-detail">
                                    <dt>Status</dt>
                                    <dd>{{ describeMaterialVerificationStatusLabel(discoveryResult.inspection.verification.status) }}</dd>
                                </dl>

                                <!-- 0.9.113 — see isDiscoveredPublicationSelectable,
                                     below, and this file's own 0.9.113 header, for
                                     the one eligibility rule gating this button. -->
                                <button
                                    v-if="isDiscoveredPublicationSelectable"
                                    type="button"
                                    class="action-btn world-encounter-discovery-selection-action"
                                    @click="selectDiscoveredPublication"
                                >Select Publication</button>
                            </template>
                        </template>
                    </div>

                    <!-- 0.9.113 — independent of discoveryResult's own CURRENT
                         state: see this file's own header, "selectedDiscoveredPublication
                         never auto-resets." Renders for as long as a selection
                         exists, regardless of whether the panel above still shows
                         the same result, a different one, or none at all. -->
                    <div v-if="selectedDiscoveredPublication" class="world-encounter-discovered-selection-panel">
                        <p class="world-encounter-discovered-selection-notice">Selected discovered publication.</p>
                    </div>

                    <button
                        type="button"
                        class="action-btn world-encounter-publication-discovery-close"
                        @click="publicationDiscoveryOpen = false"
                    >Close</button>
                </div>
            </div>
        </div>
    `
};
