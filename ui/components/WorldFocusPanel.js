// 0.5.8 — World View Contextual Focus & Information Hierarchy.
//
// The one, unified destination for "what am I looking at?" — a
// read-only reading of a core/WorldFocusContext.js#WorldFocusContext
// (already reshaped to plain JSON by the host), regardless of which
// surface it came from (Explore's own "Nearby ___" rows, the Locations
// panel — see those components' own new `@inspect`-style emits).
//
// Deliberately three buttons, never more, and deliberately none of them
// named "Focus" — see core/WorldFocusContext.js's own header on why:
// this component IS the "Focus" noun already; its own camera-move
// button is labeled "Go" (matching Explore's own nearby-row wording),
// and "Show on Map"/"Names" reuse the EXACT labels
// ui/components/GeographicPlacePanel.js and
// ui/components/LocationsPanel.js already use for the same actions, so
// a viewer never has to learn a second vocabulary for the same verb.
// Which buttons actually render is entirely driven by
// `context.availableActions` — this component invents no per-kind
// logic of its own, it only reflects what the derivation already
// decided (see core/WorldFocusContext.js#deriveWorldFocusContext()'s
// own per-kind action table).
//
// Never mutates anything, never calls a session method directly — like
// every other panel in this codebase, this is a dumb, controlled
// component; the host (ui/views/WorldView.js) wires each emit to the
// actual navigation call.
const KIND_GLYPH = {
    region: '⬢',
    landmark: '★',
    structure: '▪',
    collaborator: '●',
    geographic_place: '⬢'
};

export default {
    name: 'WorldFocusPanel',
    props: {
        // A core/WorldFocusContext.js#WorldFocusContext.toJSON() shape, or null.
        context: {
            type: Object,
            default: null
        }
    },
    emits: ['go', 'show-on-map', 'open-names', 'cancel'],
    methods: {
        glyph() {
            return (this.context && KIND_GLYPH[this.context.kind]) || '•';
        },
        formatDistance() {
            if (!this.context || this.context.distance === null) {
                return '';
            }
            const direction = this.context.direction ? ` ${this.context.direction}` : '';
            return `${this.context.distance}m${direction}`;
        },
        onKeydown(event) {
            if (event.key === 'Escape') {
                event.stopPropagation();
                this.$emit('cancel');
            }
        }
    },
    template: `
        <div
            v-if="context"
            role="dialog"
            aria-label="Focus"
            class="modal-overlay"
            @click.self="$emit('cancel')"
            @keydown="onKeydown"
        >
            <div class="modal-panel world-focus-panel">
                <p class="world-focus-panel-subtitle">{{ glyph() }} {{ context.subtitle }}</p>
                <h3>{{ context.title }}</h3>

                <p v-if="context.description" class="world-focus-panel-description">{{ context.description }}</p>

                <p v-if="formatDistance()" class="locations-panel-hint">{{ formatDistance() }}</p>

                <p class="world-focus-panel-arrival">{{ context.arrivalPhrase }}</p>

                <p v-if="context.geographicPlace" class="world-focus-panel-nearby">
                    Nearest other place: {{ context.geographicPlace.displayName }}
                    ({{ context.geographicPlace.distance }}m {{ context.geographicPlace.direction }})
                </p>

                <div class="modal-actions">
                    <button
                        v-if="context.availableActions.includes('go')"
                        class="action-btn action-btn--primary"
                        @click="$emit('go')"
                    >Go</button>
                    <button
                        v-if="context.availableActions.includes('map')"
                        class="action-btn"
                        @click="$emit('show-on-map')"
                    >Show on Map</button>
                    <button
                        v-if="context.availableActions.includes('names')"
                        class="action-btn"
                        @click="$emit('open-names')"
                    >Names</button>
                    <button class="action-btn" @click="$emit('cancel')">Close</button>
                </div>
            </div>
        </div>
    `
};
