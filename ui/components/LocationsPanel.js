// 0.2.94 — World View Location & Navigation.
//
// A read-only browser over WorldNavigationSession#getWorldLocations() —
// "Home" plus every structure this session currently knows about — each
// row with exactly one action: Focus. There is deliberately no Select,
// Inspect, or Edit here (contrast ui/components/WorldLocationBrowser.js,
// which browses DOCUMENTS by camera region and offers all three) — a
// WorldLocation is not a document and carries no editing/active-document
// concept of its own; see core/WorldLocation.js's own header. Focusing a
// location never loads a new document, never changes the active
// document, and never touches selection — purely camera navigation, the
// same "Navigate ≠ Modify" boundary every other World View navigation
// entry point in this codebase already holds to.
export default {
    name: 'LocationsPanel',
    props: {
        // Array of WorldLocation#toJSON() shapes: { id, title, kind, position }.
        locations: {
            type: Array,
            default: () => []
        }
    },
    emits: ['focus', 'cancel'],
    methods: {
        kindLabel(kind) {
            return kind === 'origin' ? 'Home' : 'Structure';
        },
        kindIcon(kind) {
            return kind === 'origin' ? '🏠' : '📍';
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
            role="dialog"
            aria-label="Locations"
            class="modal-overlay"
            @click.self="$emit('cancel')"
            @keydown="onKeydown"
        >
            <div class="modal-panel locations-panel">
                <h3>Locations</h3>
                <p class="locations-panel-hint">
                    Navigation only — focusing a location moves the camera; it never loads, selects, or edits anything.
                </p>

                <p v-if="locations.length === 0" class="locations-panel-empty">
                    No locations known yet — load or place a structure to see it here.
                </p>
                <ul v-else class="locations-panel-list">
                    <li v-for="loc in locations" :key="loc.id" class="locations-panel-item">
                        <div class="locations-panel-item-info">
                            <span class="locations-panel-item-title">{{ kindIcon(loc.kind) }} {{ loc.title }}</span>
                            <span class="locations-panel-item-kind">{{ kindLabel(loc.kind) }}</span>
                            <span class="locations-panel-item-position">
                                {{ loc.position.x.toFixed(1) }}, {{ loc.position.y.toFixed(1) }}, {{ loc.position.z.toFixed(1) }}
                            </span>
                        </div>
                        <button class="action-btn" @click="$emit('focus', loc.id)">Focus</button>
                    </li>
                </ul>

                <div class="modal-actions">
                    <button class="action-btn" @click="$emit('cancel')">Close</button>
                </div>
            </div>
        </div>
    `
};
