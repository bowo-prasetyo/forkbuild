import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { CreateDiscoveryUseCase } from '../../application/CreateDiscoveryUseCase.js';
import { PublicationQuery, DEFAULT_PAGE_SIZE } from '../../core/PublicationQuery.js';
import { PublicationSort } from '../../core/PublicationSort.js';
import { GroupBy, groupPublications } from '../../core/PublicationGrouping.js';
import PublicationCatalogToolbar from './PublicationCatalogToolbar.js';
import PublicationCard from './PublicationCard.js';
import PublicationList from './PublicationList.js';
import PublicationPagination from './PublicationPagination.js';

const DESCRIPTION_SNIPPET_LENGTH = 160;

// 0.2.31 — the shared catalog RepositoryView and AuthorView both mount
// (see docs/Architecture.md, 0.2.31) rather than maintaining two
// independent, slowly-diverging implementations. The ONLY difference
// between the two is the `author` prop — everything else (search,
// sort, pagination, grouping, card/list rendering, preview, actions)
// is identical, by construction, because it's the same component.
//
// Every query goes through SearchPublicationsUseCase — see its own
// comment for why this is a genuinely different question than World
// Search answers, and why pagination/sort happen at the application
// layer rather than the UI assuming the storage layer can do
// OFFSET/LIMIT efficiently.
export default {
    name: 'PublicationCatalog',
    components: { PublicationCatalogToolbar, PublicationCard, PublicationList, PublicationPagination },
    props: {
        // null -> Repository scope (every publication); a username ->
        // Author scope (that author's publications only). This is the
        // one and only thing that distinguishes the two host views.
        author: { type: String, default: null }
    },
    setup(props) {
        const router = useRouter();
        const {
            discoveryProvider,
            loadPublicationDocumentUseCase,
            searchPublicationsUseCase
        } = new CreateDiscoveryUseCase().execute();

        const sort = ref(PublicationSort.RECENTLY_PUBLISHED);
        const view = ref('cards');
        const groupBy = ref(GroupBy.NONE);
        const submittedText = ref('');
        const includeDescriptions = ref(false);
        const hasSubmittedSearch = ref(false);
        const catalogHasAnyPublications = ref(true);

        const pageResult = ref(null);
        // Enrichment caches — keyed by documentId, populated lazily for
        // whatever page has actually been VIEWED, never the whole
        // catalog. Plain (non-reactive) Maps that back small reactive
        // snapshot refs, so lookups stay cheap and the template only
        // re-renders when the current page's own data actually
        // changes — see the module comment on cost.
        const descriptionCache = new Map();
        const parentTitleCache = new Map();
        const forkCountCache = new Map();
        const descriptions = ref({});
        const parentTitles = ref({});
        const forkCounts = ref({});

        function buildQuery(page) {
            return new PublicationQuery({
                text: submittedText.value,
                author: props.author,
                sort: sort.value,
                page,
                pageSize: DEFAULT_PAGE_SIZE,
                includeDescriptions: includeDescriptions.value
            });
        }

        function truncate(text) {
            if (!text) return '';
            const trimmed = text.trim();
            if (trimmed.length <= DESCRIPTION_SNIPPET_LENGTH) return trimmed;
            return trimmed.slice(0, DESCRIPTION_SNIPPET_LENGTH).trim() + '…';
        }

        // Resolves description/parent-title/fork-count for exactly the
        // publications on the CURRENT page — bounded by pageSize, not
        // by catalog size, which is what makes this affordable even
        // against a 10,000-publication catalog (see
        // docs/Principles.md).
        function resolveEnrichment(items) {
            const nextDescriptions = { ...descriptions.value };
            const nextParentTitles = { ...parentTitles.value };
            const nextForkCounts = { ...forkCounts.value };

            for (const pub of items) {
                if (!descriptionCache.has(pub.documentId)) {
                    let snippet = '';
                    try {
                        const document = loadPublicationDocumentUseCase.execute(pub.documentId);
                        snippet = truncate(document && document.metadata ? document.metadata.description : '');
                    } catch (err) {
                        snippet = '';
                    }
                    descriptionCache.set(pub.documentId, snippet);
                }
                nextDescriptions[pub.documentId] = descriptionCache.get(pub.documentId);

                if (pub.parentDocumentId) {
                    if (!parentTitleCache.has(pub.parentDocumentId)) {
                        const matches = discoveryProvider.findByDocumentId(pub.parentDocumentId);
                        parentTitleCache.set(pub.parentDocumentId, matches.length > 0 ? matches[0].title : null);
                    }
                    nextParentTitles[pub.documentId] = parentTitleCache.get(pub.parentDocumentId);
                }

                if (!forkCountCache.has(pub.documentId)) {
                    forkCountCache.set(pub.documentId, discoveryProvider.findByParentId(pub.documentId).length);
                }
                nextForkCounts[pub.documentId] = forkCountCache.get(pub.documentId);
            }

            descriptions.value = nextDescriptions;
            parentTitles.value = nextParentTitles;
            forkCounts.value = nextForkCounts;
        }

        function runQuery(page = 1) {
            const result = searchPublicationsUseCase.execute(buildQuery(page));
            pageResult.value = result;
            resolveEnrichment(result.items);
        }

        onMounted(() => {
            // Resolved independently of any query, purely to
            // distinguish "the whole catalog is empty" from "this
            // search matched nothing" in the empty-state message —
            // same distinction WorldSearchPanel's catalogEmpty makes.
            catalogHasAnyPublications.value = searchPublicationsUseCase
                .execute(new PublicationQuery({ author: props.author, pageSize: 1 })).totalCount > 0;
            runQuery(1);
        });

        function onSearch({ text, includeDescriptions: withDescriptions }) {
            submittedText.value = text;
            includeDescriptions.value = withDescriptions;
            hasSubmittedSearch.value = !!text;
            runQuery(1);
        }

        function onChangeSort(value) {
            sort.value = value;
            runQuery(1); // a new order makes whatever page number was selected potentially meaningless
        }

        function onChangeView(value) { view.value = value; }
        function onChangeGroupBy(value) { groupBy.value = value; }
        function onGoPage(page) { runQuery(page); }

        const groups = computed(() => {
            if (!pageResult.value) return [];
            return groupPublications(pageResult.value.items, groupBy.value);
        });

        const emptyMessage = computed(() => {
            if (!catalogHasAnyPublications.value) {
                return props.author
                    ? 'No publications found for this author.'
                    : 'No publications yet. Publish a creation from the Editor to see it here.';
            }
            return `No matches for "${submittedText.value}".`;
        });

        function openPublication(pub) {
            router.push({ path: '/editor', query: { load: pub.documentId } });
        }
        function forkPublication(pub) {
            router.push({ path: '/editor', query: { fork: pub.documentId, publication: pub.id } });
        }
        function viewWorld(pub) {
            router.push({ path: `/world/${pub.documentId}` });
        }
        function viewAuthor(author) {
            if (!author) return;
            router.push({ path: `/author/${encodeURIComponent(author)}` });
        }

        return {
            sort, view, groupBy, pageResult, groups, emptyMessage,
            descriptions, parentTitles, forkCounts,
            onSearch, onChangeSort, onChangeView, onChangeGroupBy, onGoPage,
            openPublication, forkPublication, viewWorld, viewAuthor
        };
    },
    template: `
        <div class="publication-catalog">
            <PublicationCatalogToolbar
                :sort="sort"
                :view="view"
                :group-by="groupBy"
                :total-count="pageResult ? pageResult.totalCount : 0"
                @search="onSearch"
                @change-sort="onChangeSort"
                @change-view="onChangeView"
                @change-group-by="onChangeGroupBy"
            />

            <div v-if="pageResult && pageResult.items.length === 0" class="empty-state">
                {{ emptyMessage }}
            </div>

            <template v-else-if="pageResult">
                <div v-for="group in groups" :key="group.key" class="publication-catalog-group">
                    <h2 v-if="group.label" class="publication-catalog-group-label">{{ group.label }}</h2>

                    <ul v-if="view === 'cards'" class="publication-list">
                        <PublicationCard
                            v-for="pub in group.items"
                            :key="pub.id"
                            :publication="pub"
                            :description="descriptions[pub.documentId]"
                            :parent-title="parentTitles[pub.documentId]"
                            :fork-count="forkCounts[pub.documentId] || 0"
                            @open="openPublication"
                            @fork="forkPublication"
                            @explore="viewWorld"
                            @view-author="viewAuthor"
                        />
                    </ul>
                    <PublicationList
                        v-else
                        :items="group.items"
                        :descriptions="descriptions"
                        :parent-titles="parentTitles"
                        :fork-counts="forkCounts"
                        @open="openPublication"
                        @fork="forkPublication"
                        @explore="viewWorld"
                        @view-author="viewAuthor"
                    />
                </div>

                <PublicationPagination
                    :page="pageResult.page"
                    :total-pages="pageResult.totalPages"
                    :has-next="pageResult.hasNext"
                    :has-previous="pageResult.hasPrevious"
                    @go="onGoPage"
                />
            </template>
        </div>
    `
};
