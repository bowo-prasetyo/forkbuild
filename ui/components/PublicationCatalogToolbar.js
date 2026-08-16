import { PublicationSort, PUBLICATION_SORT_LABELS } from '../../core/PublicationSort.js';
import { GroupBy } from '../../core/PublicationGrouping.js';

// 0.2.31 — search + sort + view + group controls for the Repository/
// Author catalog, shared by both (see ui/components/PublicationCatalog.js).
//
// Search is submit-driven, not live-as-you-type — same convention
// WorldSearchPanel (0.2.26) established, doubly important here since
// a submitted search MAY load every visible result's document to
// match its description (see the "Include descriptions" checkbox and
// docs/Principles.md, "Description Search Is Opt-In, Not Silent,
// Because It Has A Real Cost") — that cost should only ever be paid
// on an explicit action, never on every keystroke.
//
// Sort/View/Group changes take effect immediately (no submit needed):
// sort is a real re-query (see PublicationCatalog.js) but a cheap one
// (no document loading involved unless a description search is
// already active), and View/Group are pure local re-presentation of
// whatever page is already loaded — neither one justifies a second
// "confirm" step.
export default {
    name: 'PublicationCatalogToolbar',
    props: {
        sort: { type: String, default: PublicationSort.RECENTLY_PUBLISHED },
        view: { type: String, default: 'cards' },
        groupBy: { type: String, default: GroupBy.NONE },
        totalCount: { type: Number, default: 0 }
    },
    emits: ['search', 'change-sort', 'change-view', 'change-group-by'],
    data() {
        return {
            queryText: '',
            includeDescriptions: false,
            sortOptions: PublicationSort,
            sortLabels: PUBLICATION_SORT_LABELS,
            groupOptions: GroupBy
        };
    },
    methods: {
        onSubmit() {
            this.$emit('search', { text: this.queryText.trim(), includeDescriptions: this.includeDescriptions });
        }
    },
    template: `
        <div class="publication-catalog-toolbar">
            <form class="publication-catalog-search" @submit.prevent="onSubmit">
                <input
                    v-model="queryText"
                    type="text"
                    class="form-input publication-catalog-search-input"
                    placeholder="Search by title, author…"
                />
                <label class="publication-catalog-search-descriptions">
                    <input type="checkbox" v-model="includeDescriptions" />
                    Include descriptions
                </label>
                <button type="submit" class="action-btn">Search</button>
            </form>

            <div class="publication-catalog-controls">
                <label class="publication-catalog-control">
                    Sort:
                    <select class="form-select publication-catalog-select" :value="sort" @change="$emit('change-sort', $event.target.value)">
                        <option v-for="key in Object.values(sortOptions)" :key="key" :value="key">{{ sortLabels[key] }}</option>
                    </select>
                </label>
                <label class="publication-catalog-control">
                    Group:
                    <select class="form-select publication-catalog-select" :value="groupBy" @change="$emit('change-group-by', $event.target.value)">
                        <option :value="groupOptions.NONE">None</option>
                        <option :value="groupOptions.AUTHOR">Author</option>
                        <option :value="groupOptions.DATE">Date</option>
                        <option :value="groupOptions.LICENSE">License</option>
                    </select>
                </label>
                <div class="publication-catalog-view-toggle">
                    <button
                        :class="['tool-btn', { 'tool-btn--active': view === 'cards' }]"
                        @click="$emit('change-view', 'cards')"
                    >Cards</button>
                    <button
                        :class="['tool-btn', { 'tool-btn--active': view === 'list' }]"
                        @click="$emit('change-view', 'list')"
                    >List</button>
                </div>
            </div>

            <p class="publication-catalog-count">{{ totalCount }} publication{{ totalCount === 1 ? '' : 's' }}</p>
        </div>
    `
};
