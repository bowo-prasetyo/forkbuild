import WorldEncounterMarker from './WorldEncounterMarker.js';
import WandererMarker from './WandererMarker.js';
import { describeWorldFromDiscoveryRegistry } from '../../application/WorldDiscoveryRegistryProjection.js';

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
            unsubscribeWorldRegistry: null
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
        // 'Publication' | 'Avatar' — a display label only, derived from
        // `selectedEncounter.kind`. Never stored on `selectedEncounter`
        // itself, and never anything richer than this one word: no
        // "selected"/"verified"/"trusted"/"nearby" vocabulary enters the
        // selection state anywhere in this file.
        selectedEncounterKindLabel() {
            if (!this.selectedEncounter) return '';
            return this.selectedEncounter.kind === 'AVATAR' ? 'Avatar' : 'Publication';
        }
    },
    methods: {
        // The only writer of `selectedEncounter`. Takes exactly what a
        // WorldEncounterMarker's own `select` emit carries — `{ kind,
        // objectId }` — and stores it verbatim; no lookup, no join back
        // into `view`, no re-derivation of any kind.
        selectEncounter(encounter) {
            this.selectedEncounter = encounter;
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
        this.unsubscribeWorldRegistry = this.registry.subscribe(() => {
            this.refreshWorldViewFromRegistry();
        });
    },
    // 0.9.13 — unsubscribes, unconditionally and idempotently; see this
    // file's own header, "`beforeUnmount()` unsubscribes."
    beforeUnmount() {
        if (typeof this.unsubscribeWorldRegistry === 'function') {
            this.unsubscribeWorldRegistry();
        }
        this.unsubscribeWorldRegistry = null;
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

            <div v-if="selectedEncounter" class="world-encounter-selection-panel">
                <h4 class="world-encounter-selection-title">Selected encounter</h4>
                <dl class="world-encounter-selection-detail">
                    <dt>Kind</dt>
                    <dd>{{ selectedEncounterKindLabel }}</dd>
                    <dt>Object</dt>
                    <dd>{{ selectedEncounter.objectId }}</dd>
                </dl>
            </div>
        </div>
    `
};
