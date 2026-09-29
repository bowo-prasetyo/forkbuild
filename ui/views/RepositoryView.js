import { ref } from 'vue';
import PublicationCatalog from '../components/PublicationCatalog.js';
import SharedWithYouPanel from '../components/SharedWithYouPanel.js';
import { t } from '../i18n/i18n.js';

// Repository View — the "GitHub" mode: every published document,
// browsable at catalog scale. As of 0.2.31 this is a thin wrapper
// around ui/components/PublicationCatalog.js (search, sort,
// pagination, grouping, card/list views, preview, actions) — the
// component that also backs AuthorView, scoped here to the whole
// repository (no `author` prop) rather than one author's work. See
// docs/ArchitectureHistory.md, 0.2.31, for why the two views share one
// implementation instead of maintaining parallel ones.
//
// Above it, Worlds peers shared that are waiting to be retrieved. The
// catalog queries once when mounted, so a World that joins the Repository
// while the page is open remounts it.
export default {
    name: 'RepositoryView',
    components: { PublicationCatalog, SharedWithYouPanel },
    setup() {
        const catalogKey = ref(0);
        return { t, catalogKey, reloadCatalog: () => { catalogKey.value++; } };
    },
    template: `
        <section class="repository-view">
            <h1>{{ t('repositoryView.repository') }}</h1>
            <SharedWithYouPanel @retrieved="reloadCatalog" />
            <PublicationCatalog :key="catalogKey" />
        </section>
    `
};
