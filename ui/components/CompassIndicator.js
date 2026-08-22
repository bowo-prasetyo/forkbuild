// 0.2.94 — World View Location & Navigation.
//
// A minimal, always-visible orientation readout — never a map, never a
// second camera, never anything that can be clicked to navigate (that's
// LocationsPanel's job). Purely presentational: `heading` is exactly
// whatever WorldNavigationSession#getCompassHeading() returned
// (`{ degrees, label }` or `null`), re-read and re-rendered by the host
// on its own existing spatial-refresh cadence — this component never
// computes a heading itself, never touches Three.js, and owns no
// polling of its own. See core/CompassHeading.js's own header for why
// "N" here means +Z, a fixed reference direction, not a real-world
// bearing.
//
// 0.3.6 — World Discovery & Exploration extends this from a bare N/E/S/W
// dial to "contextual markers... but only for nearby meaningful
// locations" (the design conversation's own words). `markers` is a
// small, pre-filtered array — `{ id, direction, kind, label }`, at most
// a handful — the HOST (ui/views/WorldView.js's own `compassMarkers`)
// already derived from core/WorldSpatialContext.js's nearbyStructures/
// nearbyCollaborators. This component still computes nothing about the
// World itself: `direction` is an N/NE/E/SE/S/SW/W/NW label it only
// ever positions, exactly the same "never touches Three.js, never
// queries the World" contract `heading` above already has. Deliberately
// dots, not labels — the dial stays a handful of pixels, never grows
// into the minimap 0.3.6 explicitly defers; a marker's readable
// label/distance lives in the plain-text legend WorldView.js renders
// alongside the dial, this component's own `title` attribute carrying
// the same text as an accessible/hover fallback.
const MARKER_DIRECTION_DEGREES = {
    N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315
};

export default {
    name: 'CompassIndicator',
    props: {
        // { degrees, label } from core/CompassHeading.js, or null
        // before a camera exists / while position and target coincide.
        heading: {
            type: Object,
            default: null
        },
        // [{ id, direction, kind, label }], kind: 'structure' | 'collaborator'.
        markers: {
            type: Array,
            default: () => []
        }
    },
    computed: {
        needleStyle() {
            const degrees = this.heading ? this.heading.degrees : 0;
            // The needle points toward the heading; N is drawn at the
            // top (rotate(0)) so a heading of 0° (facing +Z / "N")
            // needs no rotation, matching core/CompassHeading.js's own
            // 0°-faces-+Z convention directly, no offset to remember.
            return { transform: `rotate(${degrees}deg)` };
        }
    },
    methods: {
        // Same rotate-then-push-outward positioning the needle already
        // uses, just anchored at the dial's own edge (--compass-radius,
        // sized per dial in css/main.css) instead of its center.
        markerStyle(direction) {
            const degrees = MARKER_DIRECTION_DEGREES[direction] || 0;
            return { transform: `translate(-50%, -50%) rotate(${degrees}deg) translateY(calc(-1 * var(--compass-radius)))` };
        }
    },
    template: `
        <div class="compass-indicator" :class="{ 'compass-indicator--unknown': !heading }" aria-label="Compass">
            <div class="compass-indicator-dial">
                <span class="compass-indicator-tick compass-indicator-tick--n">N</span>
                <span class="compass-indicator-tick compass-indicator-tick--e">E</span>
                <span class="compass-indicator-tick compass-indicator-tick--s">S</span>
                <span class="compass-indicator-tick compass-indicator-tick--w">W</span>
                <div class="compass-indicator-needle" :style="needleStyle"></div>
                <span
                    v-for="marker in markers"
                    :key="marker.id"
                    class="compass-indicator-marker"
                    :class="'compass-indicator-marker--' + marker.kind"
                    :style="markerStyle(marker.direction)"
                    :title="marker.label"
                ></span>
            </div>
            <span class="compass-indicator-label">
                {{ heading ? heading.label + ' · ' + Math.round(heading.degrees) + '°' : '—' }}
            </span>
        </div>
    `
};
