// 0.9.3 — World View UI / Wanderer Presence.
//
// The Wanderer's own on-screen position — drawn independently of any
// encounter data. This component takes only an already-screen-mapped
// `x`/`y` pair; it never receives, and never needs, publications,
// avatars, or the 0.9.2 view itself. Imports nothing — no `application/`,
// no `core/`, not even `vue` — the same zero-import contract
// ui/components/WorldEncounterMarker.js already holds.
//
// ALWAYS RENDERED, EVEN IN AN EMPTY WORLD. An empty World is not an empty
// screen: ui/components/WorldEncounterCanvas.js renders this component
// unconditionally, whether or not any publication or avatar exists. The
// Wanderer exists even when nothing is encountered.
//
// See ui/components/WorldEncounterCanvas.js for where the Wanderer's own
// world position actually lives — page-local UI state, never persisted,
// never synchronized (see docs/Roadmap.md's own 0.9.3 entry).
export default {
    name: 'WandererMarker',
    props: {
        x: { type: Number, required: true },
        y: { type: Number, required: true }
    },
    template: `
        <g class="wanderer-marker" :transform="'translate(' + x + ',' + y + ')'">
            <text class="wanderer-marker-glyph" text-anchor="middle" dy="4">🧭</text>
            <text class="wanderer-marker-label" text-anchor="middle" dy="18">Wanderer</text>
            <title>Wanderer</title>
        </g>
    `
};
