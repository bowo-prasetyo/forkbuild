import WorldEncounterMarker from './WorldEncounterMarker.js';
import WandererMarker from './WandererMarker.js';
import { describeWorldFromDiscoveryRegistry } from '../../application/WorldDiscoveryRegistryProjection.js';
import { describeWorldEncounterInspection } from '../../application/WorldEncounterInspection.js';
import { describeWorldEncounterSelectionOutcomeFromRegistry, WorldEncounterSelectionOutcomeStatus } from '../../application/WorldEncounterSelectionOutcome.js';
import { inspectWorldEncounterMaterial } from '../../application/WorldEncounterMaterialInspection.js';

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
// notification when a source appears or disappears — also refreshes
// `materialInspection`. A selection that goes stale (`selectionOutcome`
// becomes `'UNAVAILABLE'`, or `resolvedEncounterSelection` otherwise
// becomes `null`) clears `materialInspection` back to `null` the same way.
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
const WORLD_HALF_SPAN = 50;
const CANVAS_SIZE = 600;

function projectToCanvas(value) {
    return CANVAS_SIZE / 2 + (value / WORLD_HALF_SPAN) * (CANVAS_SIZE / 2);
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
            materialInspectionRequestId: 0
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
            this.refreshSelectionOutcome();
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
            if (!this.selectedEncounter || !this.registry) {
                this.selectionOutcome = null;
            } else {
                this.selectionOutcome = describeWorldEncounterSelectionOutcomeFromRegistry({
                    selectedEncounter: this.selectedEncounter,
                    registry: this.registry
                });
            }
            // 0.9.39 — every trigger that can change `selectionOutcome`
            // can also change `resolvedEncounterSelection`, so it also
            // refreshes material inspection — see this file's own header,
            // "a stale or changed selection refreshes material inspection."
            this.refreshMaterialInspection();
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
        // 0.9.39 — the only writer of `materialInspection`, and the only
        // caller of `inspectWorldEncounterMaterial()` in this file. See
        // this file's own header, "materialInspection is data, written by
        // refreshMaterialInspection() — never a computed." A no-op
        // (`materialInspection` cleared to `null`) whenever there is no
        // current `resolvedEncounterSelection` or no `materialSources` —
        // see "no material source, no material inspection," above. Never
        // supplies a `resolvedLead` — see "no resolvedLead is ever
        // supplied," above.
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
        }
    },
    // 0.9.13 — seed, then subscribe; see this file's own header,
    // "`mounted()`: seed, then subscribe." A no-op when no `registry`
    // was supplied — this component then behaves exactly as it did
    // before 0.9.13.
    mounted() {
        if (!this.registry || typeof this.registry.subscribe !== 'function') {
            return;
        }
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
    },
    // 0.9.13 — unsubscribes, unconditionally and idempotently; see this
    // file's own header, "`beforeUnmount()` unsubscribes."
    beforeUnmount() {
        if (typeof this.unsubscribeWorldRegistry === 'function') {
            this.unsubscribeWorldRegistry();
        }
        this.unsubscribeWorldRegistry = null;
        // 0.9.39 — invalidates any still-pending `inspectWorldEncounterMaterial()`
        // request; see this file's own header, "beforeUnmount() also
        // invalidates any in-flight request."
        this.materialInspectionRequestId += 1;
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

            <div v-if="selectedEncounter && materialInspection" class="world-encounter-material-panel">
                <h4 class="world-encounter-material-title">Material</h4>
                <dl class="world-encounter-material-detail">
                    <dt>Status</dt>
                    <dd>{{ materialInspection.loading.status }}</dd>
                </dl>

                <h4 class="world-encounter-verification-title">Verification</h4>
                <dl class="world-encounter-verification-detail">
                    <dt>Status</dt>
                    <dd>{{ materialInspection.verification.status }}</dd>
                </dl>
            </div>
        </div>
    `
};
