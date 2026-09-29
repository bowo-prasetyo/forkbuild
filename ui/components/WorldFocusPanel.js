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
import { displayText, t } from '../i18n/i18n.js';
import { compassText } from '../i18n/worldText.js';
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
    emits: ['go', 'show-on-map', 'open-names', 'edit-copy', 'cancel'],
    methods: {
        t,
        displayText,
        compassText,
        glyph() {
            return (this.context && KIND_GLYPH[this.context.kind]) || '•';
        },
        formatDistance() {
            if (!this.context || this.context.distance === null) {
                return '';
            }
            return this.context.direction
                ? t('units.metersToward', { distance: this.context.distance, direction: compassText(this.context.direction) })
                : t('units.meters', { distance: this.context.distance });
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
            :aria-label="t('worldFocusPanel.focus')"
            class="modal-overlay"
            @click.self="$emit('cancel')"
            @keydown="onKeydown"
        >
            <div class="modal-panel world-focus-panel">
                <p class="world-focus-panel-subtitle">{{ glyph() }} {{ displayText(context.subtitle) }}</p>
                <h3>{{ displayText(context.title) }}</h3>

                <p v-if="context.description" class="world-focus-panel-description">{{ displayText(context.description) }}</p>

                <p v-if="formatDistance()" class="locations-panel-hint">{{ formatDistance() }}</p>

                <p class="world-focus-panel-arrival">{{ displayText(context.arrivalPhrase) }}</p>

                <p v-if="context.geographicPlace" class="world-focus-panel-nearby">
                    {{ t('worldFocusPanel.nearestPlace', { place: context.geographicPlace.displayName, distance: context.geographicPlace.distance, direction: compassText(context.geographicPlace.direction) }) }}
                </p>

                <div class="modal-actions">
                    <button
                        v-if="context.availableActions.includes('go')"
                        class="action-btn action-btn--primary"
                        @click="$emit('go')"
                    >{{ t('worldFocusPanel.go') }}</button>
                    <button
                        v-if="context.availableActions.includes('map')"
                        class="action-btn"
                        @click="$emit('show-on-map')"
                    >{{ t('worldFocusPanel.showOnMap') }}</button>
                    <button
                        v-if="context.availableActions.includes('names')"
                        class="action-btn"
                        @click="$emit('open-names')"
                    >{{ t('worldFocusPanel.names') }}</button>
                    <button
                        v-if="context.availableActions.includes('edit_copy')"
                        class="action-btn"
                        @click="$emit('edit-copy')"
                    >{{ t('worldFocusPanel.editACopy') }}</button>
                    <button class="action-btn" @click="$emit('cancel')">{{ t('worldFocusPanel.close') }}</button>
                </div>
                <p v-if="context.availableActions.includes('edit_copy')" class="world-focus-panel-hint">
                    {{ t('worldFocusPanel.createsAnIndependentCopyOf') }}
                </p>
            </div>
        </div>
    `
};
