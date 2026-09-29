// 0.2.26 — World View search, over the same decentralized discovery
// machinery every other surface already reads from (see
// application/world/SearchWorldUseCase.js / WorldNavigationSession.searchWorld).
// Pure presentation: the host supplies `results` (already resolved by
// the session) and `catalogEmpty` (whether anything has been published
// at all, so the empty state can say something more useful than "no
// matches"); this component owns only its own input state and the
// "search on submit" interaction — no debounced live search, matching
// the explicit [Find] button in the design doc's mockup rather than
// firing a query on every keystroke.
//
// A result with `hasPlacement: false` still gets a resolvable position
// (WorldNavigationSession.searchWorld always resolves one, via the
// deterministic fallback grid — 0.2.24 — when there's no recorded
// PlacementRecord) and Focus still works; the note just makes the
// distinction visible rather than presenting a fallback position as if
// it were an authored one. See docs/Principles.md, "Publication Found
// Is Not The Same As Placement Found."
//
// 0.2.28: gains a Location section (X/Y/Z + Radius, all in World
// Units) alongside the text field — the two compose into one query,
// not two separate search mechanisms. Submitting emits
// { text, center?, radius? } — `center`/`radius` are present only when
// Radius actually has a value; leaving Location blank is exactly the
// 0.2.26 text-only search, byte-identical. A result found through a
// spatial query additionally carries a resolved position and a
// `distance` (World Units from the requested center), both shown
// inline — this is also what finally makes the 0.2.24 coordinate
// system something a person actually reads, not just an internal
// convention.
import { formatNumber, t } from '../i18n/i18n.js';
export default {
    name: 'WorldSearchPanel',
    props: {
        results: {
            type: Array,
            default: () => []
        },
        catalogEmpty: {
            type: Boolean,
            default: false
        }
    },
    emits: ['search', 'focus'],
    data() {
        return {
            queryInput: '',
            centerX: 0,
            centerY: 0,
            centerZ: 0,
            radiusInput: '',
            submittedQuery: '',
            submittedHasLocation: false,
            submittedCenter: null,
            submittedRadius: null
        };
    },
    computed: {
        hasSubmission() {
            return !!this.submittedQuery || this.submittedHasLocation;
        },
        emptyMessage() {
            if (this.catalogEmpty) {
                return t('worldLocationBrowser.catalogEmpty');
            }
            if (this.submittedHasLocation) {
                const c = this.submittedCenter;
                const location = t('units.coordinates', { x: c.x, y: c.y, z: c.z });
                return this.submittedQuery
                    ? t('worldSearchPanel.noMatchesNear', { query: this.submittedQuery, radius: this.submittedRadius, location })
                    : t('worldSearchPanel.nothingNear', { radius: this.submittedRadius, location });
            }
            return t('worldSearchPanel.noMatches', { query: this.submittedQuery });
        }
    },
    methods: {
        t,
        one(value) {
            return formatNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false });
        },
        onSubmit() {
            const text = this.queryInput.trim();
            const radius = Number(this.radiusInput);
            const hasLocation = this.radiusInput !== '' && Number.isFinite(radius) && radius >= 0;
            if (!text && !hasLocation) {
                // Nothing to search for — leave any previous results as
                // they were rather than submitting an empty query that
                // would just report "no matches" for no reason.
                return;
            }
            this.submittedQuery = text;
            this.submittedHasLocation = hasLocation;
            const options = { text };
            if (hasLocation) {
                const center = {
                    x: Number(this.centerX) || 0,
                    y: Number(this.centerY) || 0,
                    z: Number(this.centerZ) || 0
                };
                this.submittedCenter = center;
                this.submittedRadius = radius;
                options.center = center;
                options.radius = radius;
            } else {
                this.submittedCenter = null;
                this.submittedRadius = null;
            }
            this.$emit('search', options);
        }
    },
    template: `
        <div class="world-search-panel">
            <form class="world-search-form" @submit.prevent="onSubmit">
                <input
                    v-model="queryInput"
                    type="text"
                    class="form-input world-search-input"
                    :placeholder="t('worldSearchPanel.searchByTitleOrAuthor')"
                />
                <button type="submit" class="action-btn">{{ t('worldSearchPanel.find') }}</button>
            </form>

            <div class="world-search-location">
                <span class="form-label">{{ t('worldSearchPanel.locationWorldUnits') }}</span>
                <div class="world-search-location-fields">
                    <input v-model.number="centerX" type="number" step="1" class="form-input world-search-coord" placeholder="X" :aria-label="t('worldSearchPanel.centerX')" />
                    <input v-model.number="centerY" type="number" step="1" class="form-input world-search-coord" placeholder="Y" :aria-label="t('worldSearchPanel.centerY')" />
                    <input v-model.number="centerZ" type="number" step="1" class="form-input world-search-coord" placeholder="Z" :aria-label="t('worldSearchPanel.centerZ')" />
                    <input v-model="radiusInput" type="number" step="1" min="0" class="form-input world-search-radius" :placeholder="t('worldSearchPanel.radius')" :aria-label="t('worldSearchPanel.radius')" />
                </div>
            </div>

            <div v-if="hasSubmission" class="world-search-results">
                <p v-if="results.length === 0" class="world-search-empty">{{ emptyMessage }}</p>
                <template v-else>
                    <p class="world-search-count">
                        {{ t('worldSearchPanel.matchCount', { count: results.length }) }}
                    </p>
                    <ul class="world-search-list">
                        <li v-for="r in results" :key="r.documentId" class="world-search-item">
                            <div class="world-search-item-info">
                                <span class="world-search-item-title">{{ r.title }}</span>
                                <span class="world-search-item-author">{{ t('worldLocationBrowser.by', { author: r.author || t('worldLocationBrowser.anonymous') }) }}</span>
                                <span v-if="r.position" class="world-search-item-position">
                                    📍 {{ t('units.coordinates', { x: one(r.position.x), y: one(r.position.y), z: one(r.position.z) }) }}
                                    <template v-if="r.distance !== null"> · {{ t('worldLocationBrowser.distance', { distance: one(r.distance) }) }}</template>
                                </span>
                                <span v-if="!r.hasPlacement" class="world-search-item-note">
                                    {{ t('worldSearchPanel.noPlacementRecordedUsingA') }}
                                </span>
                            </div>
                            <button class="action-btn" @click="$emit('focus', r.documentId)">{{ t('worldSearchPanel.focus') }}</button>
                        </li>
                    </ul>
                </template>
            </div>
        </div>
    `
};
