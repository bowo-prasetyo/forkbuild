import WorldEncounterMarker from './WorldEncounterMarker.js';
import WandererMarker from './WandererMarker.js';
import { describeWorldFromDiscoveryRegistry } from '../../application/WorldDiscoveryRegistryProjection.js';
import { describeWorldEncounterInspection } from '../../application/WorldEncounterInspection.js';
import { describeWorldEncounterSelectionOutcomeFromRegistry, WorldEncounterSelectionOutcomeStatus } from '../../application/WorldEncounterSelectionOutcome.js';
import { inspectWorldEncounterMaterial } from '../../application/WorldEncounterMaterialInspection.js';
import { PublicationDistributionState } from '../../application/PublicationDistributionLifecycle.js';
import { describeDecentralizedWorldEncounterLeadSelectionOutcomeFromRegistry, DecentralizedWorldEncounterLeadSelectionOutcomeStatus } from '../../application/DecentralizedWorldEncounterLeadSelection.js';
import { describePublicationMaterialProvenanceFromInspection } from '../../application/PublicationMaterialProvenance.js';
import { resolveSnapshotPublicationAttribution } from '../../application/SnapshotPublicationAttribution.js';
import { describeWorldEncounterPresentation } from '../../application/WorldEncounterPresentation.js';

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

export default {
    name: 'WorldEncounterCanvas',
    components: { WorldEncounterMarker, WandererMarker },
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
        // component itself, and never written to.
        distributionLifecycleStore: {
            type: Object,
            default: null
        },
        // 0.9.104 — optional. A `(publication) -> Promise<PublicationDistributionResult
        // | null>` function, called with exactly the loaded `Publication`
        // domain object for the CURRENTLY selected, local-origin
        // PUBLICATION encounter — see this file's own header, "0.9.104 —
        // World View Publication Distribution Action." `null` by default:
        // a mount with no `distributionCommand` supplied renders no
        // distribution action at all. Never constructed by this component
        // itself, and never called with anything but that one `Publication`
        // argument — every other input a real distribution needs
        // (`serializedMaterial`, `materialStorage`, `arweaveUploaderOptions`,
        // `nostrPublisherOptions`) stays entirely this function's own,
        // caller-side concern.
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
            // 0.9.111 — the Wanderer's own typed discovery input, page-local
            // UI state only — see this file's own header, "ephemeral UI
            // state only." Never persisted, never validated beyond a plain
            // trim/empty check in `discoverPublication()` below.
            discoveryObjectId: '',
            discoveryTag: '',
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
            selectedDiscoveredPublication: null
        };
    },
    computed: {
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
        }
    },
    methods: {
        // The only writer of `selectedEncounter`. Takes exactly what a
        // WorldEncounterMarker's own `select` emit carries — `{ kind,
        // objectId }` — and stores it verbatim; no lookup, no join back
        // into `view`, no re-derivation of any kind.
        selectEncounter(encounter) {
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
            if (!resolvedEncounterSelectionsEqual(previousResolvedSelection, this.resolvedEncounterSelection)) {
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
        // `this.resolvedLead` whenever it resolves.
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
        // second, overlapping call." Wrapping the call in
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

            Promise.resolve()
                .then(() => this.distributionCommand(publication))
                .catch(() => {
                    if (requestId === this.distributionRequestId) {
                        this.distributionError = 'Distribution could not be completed.';
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

            Promise.resolve()
                .then(() => this.snapshotDistributionCommand(publication))
                .then((result) => {
                    if (requestId === this.snapshotDistributionRequestId) {
                        this.snapshotDistributionResult = result;
                    }
                })
                .catch(() => {
                    if (requestId === this.snapshotDistributionRequestId) {
                        this.snapshotDistributionError = 'Snapshot distribution could not be completed.';
                    }
                })
                .then(() => {
                    if (requestId === this.snapshotDistributionRequestId) {
                        this.snapshotDistributionExecuting = false;
                    }
                });
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
                .catch(() => {
                    if (requestId === this.snapshotDiscoveryRequestId) {
                        this.snapshotDiscoveryError = 'Snapshot discovery could not be completed.';
                    }
                })
                .then(() => {
                    if (requestId === this.snapshotDiscoveryRequestId) {
                        this.snapshotDiscoveryExecuting = false;
                    }
                });
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
                .catch(() => {
                    if (requestId === this.discoveryRequestId) {
                        this.discoveryError = 'Discovery could not be completed.';
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
        // 0.9.39 — invalidates any still-pending `inspectWorldEncounterMaterial()`
        // request; see this file's own header, "beforeUnmount() also
        // invalidates any in-flight request."
        this.materialInspectionRequestId += 1;
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
                            >{{ candidate.origin }}</button>
                        </li>
                    </ul>
                </template>

                <p v-else-if="selectionOutcome.status === 'RESOLVED'" class="world-encounter-selection-origin-resolved">
                    Source: {{ selectionOutcome.resolvedSelection.origin }}
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
                            >{{ candidate.uri }}</button>
                        </li>
                    </ul>
                </template>

                <p v-else-if="decentralizedLeadOutcome.status === 'RESOLVED'" class="world-encounter-lead-resolved">
                    Location: {{ decentralizedLeadOutcome.resolvedLead.uri }}
                </p>
            </div>

            <div v-if="selectedEncounter && materialInspection" class="world-encounter-material-panel">
                <h4 class="world-encounter-material-title">Material</h4>
                <dl class="world-encounter-material-detail">
                    <dt>Status</dt>
                    <dd>{{ materialInspection.loading.status }}</dd>
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
                    <dd>{{ materialInspection.verification.status }}</dd>
                </dl>
            </div>

            <!-- 0.9.100 — reads exactly distributionLifecycle.material.state /
                 .discovery.state, the SAME two independent
                 PublicationDistributionState values
                 describePublicationDistributionLifecycle() (0.9.50) already
                 defines. See this file's own header, "0.9.100 — Publication
                 Distribution Observation." -->
            <div v-if="selectedEncounter && selectedEncounter.kind === 'PUBLICATION' && distributionLifecycleStore" class="world-encounter-distribution-panel">
                <h4 class="world-encounter-distribution-title">Distribution</h4>
                <dl class="world-encounter-distribution-detail">
                    <dt>Material</dt>
                    <dd>{{ distributionMaterialState }}</dd>
                    <dt>Discovery</dt>
                    <dd>{{ distributionDiscoveryState }}</dd>
                </dl>

                <!-- 0.9.104 — a request/attempt action, never a claim of
                     success; see this file's own header, "0.9.104 — World
                     View Publication Distribution Action." Rendered only
                     when a caller supplied a distributionCommand; disabled
                     whenever there is nothing distributable yet for this
                     selection, or a call is already in flight. -->
                <button
                    v-if="distributionCommand"
                    type="button"
                    class="action-btn world-encounter-distribution-action"
                    :disabled="!distributablePublication || distributionExecuting"
                    @click="distributeSelectedPublication"
                >{{ distributionExecuting ? 'Distributing…' : 'Distribute Publication' }}</button>

                <p v-if="distributionError" class="world-encounter-distribution-error">{{ distributionError }}</p>
            </div>

            <!-- 0.9.138 — a SEPARATE panel from Distribution, immediately
                 above: Snapshot distribution is a different protocol than
                 Signed Claim distribution (see application/
                 SnapshotDistributionCommand.js's own header, "no coupling
                 to Signed Claim distribution"), so it gets its own action
                 and its own result display, never folded into the
                 Material/Discovery dl above. Rendered only when a caller
                 supplied a snapshotDistributionCommand; independent of
                 distributionLifecycleStore, which this panel never reads. -->
            <div v-if="selectedEncounter && selectedEncounter.kind === 'PUBLICATION' && snapshotDistributionCommand" class="world-encounter-snapshot-distribution-panel">
                <h4 class="world-encounter-snapshot-distribution-title">Snapshot Distribution</h4>

                <!-- 0.9.138 — a request/attempt action, never a claim of
                     success — mirrors the Distribute Publication button
                     immediately above, exactly. Disabled whenever there is
                     nothing distributable yet for this selection, or a call
                     is already in flight. -->
                <button
                    type="button"
                    class="action-btn world-encounter-snapshot-distribution-action"
                    :disabled="!distributablePublication || snapshotDistributionExecuting"
                    @click="distributeSelectedSnapshot"
                >{{ snapshotDistributionExecuting ? 'Distributing…' : 'Distribute Snapshot' }}</button>

                <!-- 0.9.138 — the resolved contentReference/announcement,
                     rendered verbatim, never reinterpreted or collapsed
                     into a single success/failure verdict — see this
                     component's own snapshotDistributionCommand prop
                     comment. announcement is legitimately null (Arweave
                     placement succeeded, Nostr announcement did not — see
                     application/SnapshotDistributionCommand.js's own
                     header, "a successful placement is never rolled back")
                     — shown as "No announcement," never as an error. -->
                <p v-if="snapshotDistributionError" class="world-encounter-snapshot-distribution-error">{{ snapshotDistributionError }}</p>
                <dl v-else-if="snapshotDistributionResult" class="world-encounter-snapshot-distribution-detail">
                    <dt>Content hash</dt>
                    <dd>{{ snapshotDistributionResult.contentReference.hash }}</dd>
                    <dt>Locator</dt>
                    <dd>{{ snapshotDistributionResult.contentReference.uri }}</dd>
                    <dt>Announcement</dt>
                    <dd>{{ snapshotDistributionResult.announcement ? snapshotDistributionResult.announcement.id : 'No announcement' }}</dd>
                </dl>
            </div>

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

                <!-- The resolver's own outcome vocabulary, rendered
                     verbatim — see this file's own header. -->
                <p v-if="snapshotDiscoveryError" class="world-encounter-snapshot-discovery-error">{{ snapshotDiscoveryError }}</p>
                <dl v-else-if="snapshotDiscoveryResult" class="world-encounter-snapshot-discovery-detail">
                    <dt>Outcome</dt>
                    <dd>{{ snapshotDiscoveryResult.outcome }}</dd>
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
                     MATCH does and does not mean. -->
                <dl v-if="snapshotAttributionResult" class="world-encounter-snapshot-attribution-detail">
                    <dt>Snapshot Attribution</dt>
                    <dd>{{ snapshotAttributionResult.outcome }}</dd>
                </dl>
            </div>

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
                    <dl class="world-encounter-discovery-detail">
                        <dt>Discovery</dt>
                        <dd>{{ discoveryResult.resolution.status }}</dd>
                    </dl>

                    <template v-if="discoveryResult.inspection">
                        <h4 class="world-encounter-material-title">Material</h4>
                        <dl class="world-encounter-material-detail">
                            <dt>Status</dt>
                            <dd>{{ discoveryResult.inspection.loading.status }}</dd>
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
                            <dd>{{ discoveryResult.inspection.verification.status }}</dd>
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
        </div>
    `
};
