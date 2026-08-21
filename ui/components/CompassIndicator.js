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
export default {
    name: 'CompassIndicator',
    props: {
        // { degrees, label } from core/CompassHeading.js, or null
        // before a camera exists / while position and target coincide.
        heading: {
            type: Object,
            default: null
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
    template: `
        <div class="compass-indicator" :class="{ 'compass-indicator--unknown': !heading }" aria-label="Compass">
            <div class="compass-indicator-dial">
                <span class="compass-indicator-tick compass-indicator-tick--n">N</span>
                <span class="compass-indicator-tick compass-indicator-tick--e">E</span>
                <span class="compass-indicator-tick compass-indicator-tick--s">S</span>
                <span class="compass-indicator-tick compass-indicator-tick--w">W</span>
                <div class="compass-indicator-needle" :style="needleStyle"></div>
            </div>
            <span class="compass-indicator-label">
                {{ heading ? heading.label + ' · ' + Math.round(heading.degrees) + '°' : '—' }}
            </span>
        </div>
    `
};
