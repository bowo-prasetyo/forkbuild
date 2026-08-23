// 0.5.5 — Geographic Place Directory & Identity UX.
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
export default {
    name: 'GeographicPlaceDirectoryPanel',
    props: {
        // Array of GeographicPlaceView#toJSON() shapes — see that
        // class's own header. [] renders the empty state below, never a
        // throw.
        places: {
            type: Array,
            default: () => []
        }
    },
    emits: ['open-place', 'cancel'],
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

                <p v-if="places.length === 0" class="locations-panel-empty">
                    No geographic places known yet — name a region to see it here.
                </p>

                <ul v-else class="locations-panel-list geographic-place-directory-list">
                    <li
                        v-for="place in places"
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
