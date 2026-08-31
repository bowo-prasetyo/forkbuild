import WorldEncounterMarker from './WorldEncounterMarker.js';
import WandererMarker from './WandererMarker.js';

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
            selectedEncounter: null
        };
    },
    computed: {
        publicationRows() {
            return this.view && Array.isArray(this.view.publications) ? this.view.publications : [];
        },
        avatarRows() {
            return this.view && Array.isArray(this.view.avatars) ? this.view.avatars : [];
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
        }
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
