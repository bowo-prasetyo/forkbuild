import { PublicationSort, PUBLICATION_SORT_LABELS } from '../../core/PublicationSort.js';

// core/PublicationSort.js keeps English labels next to its ids; the toolbar
// shows each id's message, falling back to that English.
const SORT_MESSAGES = {
    [PublicationSort.RECENTLY_PUBLISHED]: 'publicationSort.recentlyPublished',
    [PublicationSort.OLDEST_PUBLISHED]: 'publicationSort.oldestPublished',
    [PublicationSort.TITLE_ASC]: 'publicationSort.titleAsc',
    [PublicationSort.TITLE_DESC]: 'publicationSort.titleDesc',
    [PublicationSort.AUTHOR_ASC]: 'publicationSort.authorAsc'
};
import { GroupBy } from '../../core/PublicationGrouping.js';
import { t } from '../i18n/i18n.js';

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
        t,
        sortLabel(key) {
            return SORT_MESSAGES[key] ? t(SORT_MESSAGES[key]) : this.sortLabels[key];
        },
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
                    :placeholder="t('publicationCatalogToolbar.searchByTitleAuthor')"
                />
                <label class="publication-catalog-search-descriptions">
                    <input type="checkbox" v-model="includeDescriptions" />
                    {{ t('publicationCatalogToolbar.includeDescriptions') }}
                </label>
                <button type="submit" class="action-btn">{{ t('publicationCatalogToolbar.search') }}</button>
            </form>

            <div class="publication-catalog-controls">
                <label class="publication-catalog-control">
                    {{ t('publicationCatalogToolbar.sort') }}
                    <select class="form-select publication-catalog-select" :value="sort" @change="$emit('change-sort', $event.target.value)">
                        <option v-for="key in Object.values(sortOptions)" :key="key" :value="key">{{ sortLabel(key) }}</option>
                    </select>
                </label>
                <label class="publication-catalog-control">
                    {{ t('publicationCatalogToolbar.group') }}
                    <select class="form-select publication-catalog-select" :value="groupBy" @change="$emit('change-group-by', $event.target.value)">
                        <option :value="groupOptions.NONE">{{ t('publicationCatalogToolbar.none') }}</option>
                        <option :value="groupOptions.AUTHOR">{{ t('publicationCatalogToolbar.author') }}</option>
                        <option :value="groupOptions.DATE">{{ t('publicationCatalogToolbar.date') }}</option>
                        <option :value="groupOptions.LICENSE">{{ t('publicationCatalogToolbar.license') }}</option>
                    </select>
                </label>
                <div class="publication-catalog-view-toggle">
                    <button
                        :class="['tool-btn', { 'tool-btn--active': view === 'cards' }]"
                        @click="$emit('change-view', 'cards')"
                    >{{ t('publicationCatalogToolbar.cards') }}</button>
                    <button
                        :class="['tool-btn', { 'tool-btn--active': view === 'list' }]"
                        @click="$emit('change-view', 'list')"
                    >{{ t('publicationCatalogToolbar.list') }}</button>
                </div>
            </div>

            <p class="publication-catalog-count">{{ t('authorView.publicationCount', { count: totalCount }) }}</p>
        </div>
    `
};
