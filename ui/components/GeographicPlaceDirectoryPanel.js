import { searchGeographicPlaces } from '../../core/GeographicPlaceNavigation.js';

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
        formatSummary(place) {
            const descriptions = place.descriptionCount === 1 ? '1 description' : `${place.descriptionCount} descriptions`;
            const worlds = place.worldCount === 1 ? '1 World' : `${place.worldCount} Worlds`;
            const contributors = place.authorCount === 1 ? '1 contributor' : `${place.authorCount} contributors`;
            return `${descriptions} · ${worlds} · ${contributors}`;
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
            aria-label="Geographic Places"
            class="modal-overlay"
            @click.self="$emit('cancel')"
            @keydown="onKeydown"
        >
            <div class="modal-panel geographic-place-directory-panel">
                <h3>Geographic Places</h3>
                <p class="locations-panel-hint">
                    Candidate geographic identities across every World you
                    currently have loaded — regions whose geometry looks
                    similar enough to describe the same ground. This is a
                    directory of suggestions, never a claim that any two
                    regions actually are the same place.
                </p>

                <section v-if="nearby.length > 0" class="naming-panel-section geographic-place-nearby-section">
                    <h4 class="locations-panel-section-title">Nearby Places</h4>
                    <ul class="naming-panel-list">
                        <li v-for="place in nearby" :key="place.fingerprintKey" class="naming-panel-item">
                            <div class="naming-panel-item-info">
                                <span class="naming-panel-item-name">● {{ place.displayName }}</span>
                                <span class="naming-panel-item-meta">{{ place.distance }} m<span v-if="place.direction"> · {{ place.direction }}</span></span>
                            </div>
                            <div class="naming-panel-item-actions">
                                <button class="action-btn" @click="$emit('go-to-place', place.fingerprintKey)">Go</button>
                                <button class="action-btn" @click="$emit('open-place', place.fingerprintKey)">Open</button>
                            </div>
                        </li>
                    </ul>
                </section>

                <input
                    v-model="searchQuery"
                    type="text"
                    class="form-input geographic-place-search-input"
                    placeholder="Search places..."
                    aria-label="Search geographic places"
                />

                <p v-if="places.length === 0" class="locations-panel-empty">
                    No geographic places known yet — name a region to see it here.
                </p>
                <p v-else-if="filteredPlaces.length === 0" class="locations-panel-empty">
                    No places match "{{ searchQuery }}".
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
                        <button class="action-btn" @click.stop="$emit('open-place', place.fingerprintKey)">Open</button>
                    </li>
                </ul>

                <div class="modal-actions">
                    <button class="action-btn" @click="$emit('cancel')">Close</button>
                </div>
            </div>
        </div>
    `
};
