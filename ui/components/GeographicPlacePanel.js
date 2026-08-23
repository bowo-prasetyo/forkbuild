// 0.5.5 — Geographic Place Directory & Identity UX.
//
// The place a ui/components/GeographicPlaceDirectoryPanel.js row opens
// into: a read-only exploration of ONE core/GeographicPlaceView.js
// entry — every region that fingerprint-matched into it, the combined
// community naming view across all of them, and a plain-language
// answer to "why do we think these are the same place?" Deliberately
// captioned "Other descriptions of this place," never "other regions
// that are this place" — the latter would claim an identity this
// architecture has never established. See core/PlaceIdentity.js's own
// header, and docs/Principles.md, "Geographic Similarity Suggests
// Identity; It Never Mutates Identity (0.5.4)," which this panel exists
// purely to make VISIBLE, not to go any further than.
//
// Deliberately READ-ONLY: publishing or retracting a naming claim stays
// ui/components/PlaceNamingPanel.js's own job, scoped to one region at
// a time — this panel's "Names" button per region opens exactly that
// existing panel rather than duplicating its publish/retract machinery.
// A world-wide place directory that could also mutate naming claims
// would blur the same line 0.5.4 was careful to draw: this panel shows
// candidacy, it never acts on it.
export default {
    name: 'GeographicPlacePanel',
    props: {
        // A GeographicPlaceView#toJSON() shape, or null.
        place: {
            type: Object,
            default: null
        }
    },
    emits: ['focus-region', 'open-names', 'show-on-map', 'cancel'],
    methods: {
        formatRegionLabel(region) {
            const kind = region.kind ? `${region.kind.charAt(0).toUpperCase()}${region.kind.slice(1)}` : 'Place';
            return region.name ? `${kind} · ${region.name}` : kind;
        },
        formatSummary() {
            if (!this.place) return '';
            const descriptions = this.place.descriptionCount === 1 ? '1 description' : `${this.place.descriptionCount} descriptions`;
            const worlds = this.place.worldCount === 1 ? '1 World' : `${this.place.worldCount} Worlds`;
            const contributors = this.place.authorCount === 1 ? '1 contributor' : `${this.place.authorCount} contributors`;
            return `${descriptions} · ${worlds} · ${contributors}`;
        },
        regionKey(region) {
            return `${region.worldId}:${region.id}`;
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
            v-if="place"
            role="dialog"
            aria-label="Geographic Place"
            class="modal-overlay"
            @click.self="$emit('cancel')"
            @keydown="onKeydown"
        >
            <div class="modal-panel geographic-place-panel">
                <h3>{{ place.displayName }}</h3>
                <p class="locations-panel-hint">{{ formatSummary() }}</p>

                <section class="naming-panel-section">
                    <h4 class="locations-panel-section-title">Community Names</h4>
                    <p v-if="place.names.length === 0" class="locations-panel-empty">
                        Nobody has published a naming claim for this place yet.
                    </p>
                    <ul v-else class="naming-panel-list">
                        <li v-for="entry in place.names" :key="entry.name" class="naming-panel-item">
                            <div class="naming-panel-item-info">
                                <span class="naming-panel-item-name">{{ entry.name }}</span>
                                <span class="naming-panel-item-score">{{ entry.score }} {{ entry.score === 1 ? 'author' : 'authors' }}</span>
                            </div>
                        </li>
                    </ul>
                </section>

                <section class="naming-panel-section">
                    <h4 class="locations-panel-section-title">Described By</h4>
                    <p class="form-hint form-hint--neutral">
                        Other descriptions of this place — each one stays
                        its own separate region; nothing here merges them.
                    </p>
                    <ul class="naming-panel-list">
                        <li v-for="region in place.regions" :key="regionKey(region)" class="naming-panel-item">
                            <div class="naming-panel-item-info">
                                <span class="naming-panel-item-name">{{ formatRegionLabel(region) }}</span>
                            </div>
                            <div class="naming-panel-item-actions">
                                <button class="action-btn" @click="$emit('focus-region', region.id)">Focus</button>
                                <button class="action-btn" @click="$emit('open-names', region.id)">Names</button>
                            </div>
                        </li>
                    </ul>
                </section>

                <section v-if="place.reasons.length > 0" class="naming-panel-section geographic-place-reasons">
                    <h4 class="locations-panel-section-title">Why Grouped Together?</h4>
                    <ul class="geographic-place-reasons-list">
                        <li v-for="reason in place.reasons" :key="reason">✓ {{ reason }}</li>
                    </ul>
                    <p class="form-hint form-hint--neutral">{{ place.caveat }}</p>
                </section>

                <div class="modal-actions">
                    <button class="action-btn" @click="$emit('show-on-map')">Show on Map</button>
                    <button class="action-btn" @click="$emit('cancel')">Close</button>
                </div>
            </div>
        </div>
    `
};
