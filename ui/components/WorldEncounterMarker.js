// 0.9.3 — World View UI / Wanderer Presence.
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
// NO CLICK, SELECT, OR INSPECT HANDLING OF ANY KIND. Every marker this
// component draws is inert. Turning "I can see this" into "I chose this"
// is 0.9.4's own unscheduled "Spatial Encounter Interaction" milestone,
// not this one — see docs/Roadmap.md's own 0.9.3 entry.
//
// NO DISTANCE, NEAREST, NEARBY, RADIUS, SCORE, RANK, TRUST, VERIFIED,
// WINNER, OR CORRECTNESS VOCABULARY OF ANY KIND. This component draws
// whatever it is told to draw; it never decides whether that object
// matters.
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
        // 0.9.1/0.9.2's own `objectId` — carried through unchanged, used
        // only as a DOM data attribute (a future 0.9.4 click handler's
        // own hook, unused by this milestone), never reinterpreted.
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
    template: `
        <g
            class="world-encounter-marker"
            :class="'world-encounter-marker--' + kind.toLowerCase()"
            :transform="'translate(' + x + ',' + y + ')'"
            :data-object-id="objectId"
        >
            <text class="world-encounter-marker-glyph" text-anchor="middle" dy="4">{{ glyph }}</text>
            <text v-if="label" class="world-encounter-marker-label" text-anchor="middle" dy="18">{{ label }}</text>
            <title>{{ label || kind }}</title>
        </g>
    `
};
