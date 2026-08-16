// 0.2.26 — World View search, over the same decentralized discovery
// machinery every other surface already reads from (see
// application/SearchWorldUseCase.js / WorldNavigationSession.searchWorld).
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
            submittedQuery: ''
        };
    },
    methods: {
        onSubmit() {
            this.submittedQuery = this.queryInput.trim();
            this.$emit('search', this.submittedQuery);
        }
    },
    template: `
        <div class="world-search-panel">
            <form class="world-search-form" @submit.prevent="onSubmit">
                <input
                    v-model="queryInput"
                    type="text"
                    class="form-input world-search-input"
                    placeholder="Search by title or author…"
                />
                <button type="submit" class="action-btn">Find</button>
            </form>
            <div v-if="submittedQuery" class="world-search-results">
                <p v-if="results.length === 0" class="world-search-empty">
                    {{ catalogEmpty
                        ? 'No documents have been published yet.'
                        : 'No matches for "' + submittedQuery + '".' }}
                </p>
                <template v-else>
                    <p class="world-search-count">
                        {{ results.length }} {{ results.length === 1 ? 'match' : 'matches' }}
                    </p>
                    <ul class="world-search-list">
                        <li v-for="r in results" :key="r.documentId" class="world-search-item">
                            <div class="world-search-item-info">
                                <span class="world-search-item-title">{{ r.title }}</span>
                                <span class="world-search-item-author">by {{ r.author || 'anonymous' }}</span>
                                <span v-if="!r.hasPlacement" class="world-search-item-note">
                                    No placement recorded — using a default position
                                </span>
                            </div>
                            <button class="action-btn" @click="$emit('focus', r.documentId)">Focus</button>
                        </li>
                    </ul>
                </template>
            </div>
        </div>
    `
};
