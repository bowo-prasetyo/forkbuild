import { searchGeographicPlaces } from '../../core/GeographicPlaceNavigation.js';
import { t } from '../i18n/i18n.js';
import { compassText } from '../i18n/worldText.js';

// 0.5.5 — Geographic Place Directory & Identity UX.
// 0.5.6 — Geographic Place Navigation & Arrival: adds a "Nearby Places"
// section and a search box over the same directory.
//
// A read-only browser over WorldNavigationSession#getGeographicPlaceDirectory()
// — every geographic place candidate this replica currently knows
// about, world-wide across every loaded document. Deliberately the
// world-wide counterpart to ui/components/LocationsPanel.js, and a
// DIFFERENT question from the one that panel answers:
//
//   Locations       -> "what can I navigate to inside this World?"
//   Geographic Places -> "which of my regions and other Worlds' regions
//                         look like they might describe the same
//                         ground?"
//
// Each row shows exactly what core/GeographicPlaceView.js's own
// GeographicPlaceView already derived — a display name, a description/
// World/contributor count — and nothing this panel invents itself.
// Clicking a row opens ui/components/GeographicPlacePanel.js for that
// one place; this panel never shows claims, names, or geometry detail
// directly, mirroring the exact "dumb panel, smart host" split every
// other modal in this codebase already follows.
//
// 0.5.6 additions, both purely DERIVED over props this panel already
// receives — neither is a second data source:
//   - `nearby` (optional): WorldNavigationSession#getNearbyGeographicPlaces()'s
//     own already-sorted/distance-labeled rows, rendered above the main
//     alphabetical list with a "Go" action per row (emits `go-to-place`,
//     the exact same event a place panel's own "Go to Place" button
//     emits — see that panel's own header). [] renders nothing extra,
//     the same graceful-absence posture `places` itself already has.
//   - a search box filtering `places` client-side through
//     core/GeographicPlaceNavigation.js#searchGeographicPlaces() — a
//     pure function imported directly (the same "component may import a
//     pure core derivation" precedent ui/components/WorldMapPanel.js's
//     own core/WorldMapProjection.js import already set), never a
//     second index and never anything session-owned.
export default {
    name: 'GeographicPlaceDirectoryPanel',
    props: {
        // Array of GeographicPlaceView#toJSON() shapes — see that
        // class's own header. [] renders the empty state below, never a
        // throw.
        places: {
            type: Array,
            default: () => []
        },
        // 0.5.6 — WorldNavigationSession#getNearbyGeographicPlaces()'s
        // own rows: `{ fingerprintKey, displayName, distance, direction,
        // descriptionCount, worldCount, authorCount }`, nearest first.
        // Optional and [] by default — a viewer with no current position
        // (or nothing nearby) simply sees no "Nearby Places" section.
        nearby: {
            type: Array,
            default: () => []
        }
    },
    emits: ['open-place', 'go-to-place', 'cancel'],
    data() {
        return {
            searchQuery: ''
        };
    },
    computed: {
        filteredPlaces() {
            return searchGeographicPlaces(this.places, this.searchQuery);
        }
    },
    methods: {
        t,
        compassText,
        formatSummary(place) {
            return t('geographicPlace.summary', {
                descriptions: t('geographicPlace.descriptions', { count: place.descriptionCount }),
                worlds: t('geographicPlace.worlds', { count: place.worldCount }),
                contributors: t('geographicPlace.contributors', { count: place.authorCount })
            });
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
            :aria-label="t('geographicPlaceDirectoryPanel.geographicPlaces')"
            class="modal-overlay"
            @click.self="$emit('cancel')"
            @keydown="onKeydown"
        >
            <div class="modal-panel geographic-place-directory-panel">
                <h3>{{ t('geographicPlaceDirectoryPanel.geographicPlaces') }}</h3>
                <p class="locations-panel-hint">
                    {{ t('geographicPlaceDirectoryPanel.candidateGeographicIdentitiesAcrossEvery') }}
                </p>

                <section v-if="nearby.length > 0" class="naming-panel-section geographic-place-nearby-section">
                    <h4 class="locations-panel-section-title">{{ t('geographicPlaceDirectoryPanel.nearbyPlaces') }}</h4>
                    <ul class="naming-panel-list">
                        <li v-for="place in nearby" :key="place.fingerprintKey" class="naming-panel-item">
                            <div class="naming-panel-item-info">
                                <span class="naming-panel-item-name">● {{ place.displayName }}</span>
                                <span class="naming-panel-item-meta">{{ t('units.metersSpaced', { distance: place.distance }) }}<span v-if="place.direction"> · {{ compassText(place.direction) }}</span></span>
                            </div>
                            <div class="naming-panel-item-actions">
                                <button class="action-btn" @click="$emit('go-to-place', place.fingerprintKey)">{{ t('geographicPlaceDirectoryPanel.go') }}</button>
                                <button class="action-btn" @click="$emit('open-place', place.fingerprintKey)">{{ t('geographicPlaceDirectoryPanel.open') }}</button>
                            </div>
                        </li>
                    </ul>
                </section>

                <input
                    v-model="searchQuery"
                    type="text"
                    class="form-input geographic-place-search-input"
                    :placeholder="t('geographicPlaceDirectoryPanel.searchPlaces')"
                    :aria-label="t('geographicPlaceDirectoryPanel.searchGeographicPlaces')"
                />

                <p v-if="places.length === 0" class="locations-panel-empty">
                    {{ t('geographicPlaceDirectoryPanel.noGeographicPlacesKnownYet') }}
                </p>
                <p v-else-if="filteredPlaces.length === 0" class="locations-panel-empty">
                    {{ t('geographicPlace.noMatches', { query: searchQuery }) }}
                </p>

                <ul v-else class="locations-panel-list geographic-place-directory-list">
                    <li
                        v-for="place in filteredPlaces"
                        :key="place.fingerprintKey"
                        class="locations-panel-item"
                        role="button"
                        tabindex="0"
                        @click="$emit('open-place', place.fingerprintKey)"
                        @keydown.enter="$emit('open-place', place.fingerprintKey)"
                    >
                        <div class="locations-panel-item-info">
                            <span class="locations-panel-item-title">⬢ {{ place.displayName }}</span>
                            <span class="locations-panel-item-position">{{ formatSummary(place) }}</span>
                        </div>
                        <button class="action-btn" @click.stop="$emit('open-place', place.fingerprintKey)">{{ t('geographicPlaceDirectoryPanel.open') }}</button>
                    </li>
                </ul>

                <div class="modal-actions">
                    <button class="action-btn" @click="$emit('cancel')">{{ t('geographicPlaceDirectoryPanel.close') }}</button>
                </div>
            </div>
        </div>
    `
};
