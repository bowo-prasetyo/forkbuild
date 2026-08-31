// 0.9.3 — World View UI / Wanderer Presence.
// 0.9.4 — World Encounter Selection.
//
// One encounterable object, drawn as a small SVG marker group — a
// publication or an avatar, distinguished only by `kind`. Purely
// presentational, exactly like ui/components/WorldMapPanel.js's own
// per-marker <g> blocks (structure/landmark/collaborator): this component
// receives an already-screen-mapped `x`/`y` pair and a `label` string, and
// nothing else. It imports nothing — no `application/`, no `core/`, not
// even `vue` — the same "consume props, decide nothing" contract every
// other dumb marker in this codebase already holds.
//
// `kind` selects only the glyph and a CSS modifier class. Nothing about
// `kind` changes how `x`/`y` are interpreted — the parent
// (ui/components/WorldEncounterCanvas.js) is the only place that ever
// decides where a marker sits on screen; this component never computes a
// position of its own.
//
// 0.9.4 ADDS EXACTLY ONE THING: A CLICK EMITS "SELECT". Clicking this
// marker's own <g> emits `select` carrying only `{ kind, objectId }` —
// the identity needed to name which encounter was chosen, nothing more.
// This component never decides what selection MEANS; it only reports
// "the user selected this marker," exactly like
// ui/components/WorldMapPanel.js's own `@click.stop="$emit('focus-
// location', id)"` markers already do one layer over. It never emits the
// caller-supplied `label`, never emits its own projected `x`/`y`, and
// never emits a whole publication/avatar record — see
// ui/components/WorldEncounterCanvas.js's own header for why the payload
// stays this narrow.
//
// NO DISTANCE, NEAREST, NEARBY, RADIUS, SCORE, RANK, TRUST, VERIFIED,
// WINNER, OR CORRECTNESS VOCABULARY OF ANY KIND. This component draws
// whatever it is told to draw, and reports whatever was clicked; it never
// decides whether that object matters.
const GLYPH_BY_KIND = {
    PUBLICATION: '📄',
    AVATAR: '👤'
};

export default {
    name: 'WorldEncounterMarker',
    props: {
        // 'PUBLICATION' | 'AVATAR' — the ONLY two kinds core/WorldEncounter.js
        // (0.9.0) ever names. This component never invents a third.
        kind: {
            type: String,
            required: true,
            validator: (value) => value === 'PUBLICATION' || value === 'AVATAR'
        },
        // 0.9.1/0.9.2's own `objectId` — carried through unchanged, and now
        // (0.9.4) also the identity a click emits back to the caller.
        objectId: { type: String, default: '' },
        // `title` for a publication row, `displayName` for an avatar row
        // — the caller already knows which; this component just renders
        // whatever string it is handed.
        label: { type: String, default: '' },
        x: { type: Number, required: true },
        y: { type: Number, required: true }
    },
    computed: {
        glyph() {
            return GLYPH_BY_KIND[this.kind] || '?';
        }
    },
    methods: {
        // Reports the click; decides nothing about what it means. Reads
        // straight off this marker's own props, so a malformed/empty
        // `objectId` still emits (an empty string, never a throw) — this
        // component performs no validation of its own beyond the `kind`
        // prop validator above.
        emitSelect() {
            this.$emit('select', { kind: this.kind, objectId: this.objectId });
        }
    },
    template: `
        <g
            class="world-encounter-marker"
            :class="'world-encounter-marker--' + kind.toLowerCase()"
            :transform="'translate(' + x + ',' + y + ')'"
            :data-object-id="objectId"
            @click="emitSelect"
        >
            <text class="world-encounter-marker-glyph" text-anchor="middle" dy="4">{{ glyph }}</text>
            <text v-if="label" class="world-encounter-marker-label" text-anchor="middle" dy="18">{{ label }}</text>
            <title>{{ label || kind }}</title>
        </g>
    `
};
