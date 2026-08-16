import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { CreateDiscoveryUseCase } from '../../application/CreateDiscoveryUseCase.js';
import PublicationCatalog from '../components/PublicationCatalog.js';
import ForkTree from '../components/ForkTree.js';

// As of 0.2.31, the paginated "Publications" listing above is
// ui/components/PublicationCatalog.js scoped to this author — the
// SAME component RepositoryView mounts, see its own comment for why.
//
// The "Original Works & Forks" lineage graph below stays a SEPARATE,
// deliberately UNPAGINATED query: a fork tree needs this author's
// WHOLE publication set to render correctly (a root published on page
// 1 could have a fork that only exists on page 4) — pagination is a
// property of the browsable list, not of a lineage visualization, and
// conflating the two would either break the tree or force the catalog
// to always load everything, defeating the point of paginating it.
export default {
    name: 'AuthorView',
    components: { PublicationCatalog, ForkTree },
    setup() {
        const route = useRoute();
        const author = route.params.username;
        const allPublications = ref([]);
        const { listPublicationsUseCase } = new CreateDiscoveryUseCase().execute();

        onMounted(() => {
            allPublications.value = listPublicationsUseCase.execute({ author });
        });

        const forkTreeRoots = computed(() => {
            return allPublications.value.filter((p) => !p.parentDocumentId);
        });

        return {
            author,
            allPublications,
            forkTreeRoots
        };
    },
    template: `
        <section class="author-view">
            <h1>{{ author || 'Anonymous' }}</h1>
            <p class="author-stats">{{ allPublications.length }} publication(s)</p>

            <PublicationCatalog :author="author" />

            <div v-if="forkTreeRoots.length > 0" class="fork-graph-section">
                <h2>Original Works & Forks</h2>
                <div v-for="root in forkTreeRoots" :key="root.id" class="fork-tree">
                    <div class="fork-node fork-node--root">
                        <strong>{{ root.title }}</strong>
                        <span class="fork-node-date" v-if="root.publishedAt">
                            {{ new Date(root.publishedAt).toLocaleDateString() }}
                        </span>
                    </div>
                    <ForkTree :publications="allPublications" :root-document-id="root.documentId" />
                </div>
            </div>
        </section>
    `
};
