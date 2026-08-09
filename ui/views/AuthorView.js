import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CreateDiscoveryUseCase } from '../../application/CreateDiscoveryUseCase.js';
import ForkTree from '../components/ForkTree.js';

export default {
    name: 'AuthorView',
    components: { ForkTree },
    setup() {
        const route = useRoute();
        const router = useRouter();
        const author = route.params.username;
        const publications = ref([]);
        const { listPublicationsUseCase } = new CreateDiscoveryUseCase().execute();

        onMounted(() => {
            publications.value = listPublicationsUseCase.execute({ author });
        });

        const publicationByDocumentId = computed(() => {
            const map = new Map();
            for (const pub of publications.value) {
                map.set(pub.documentId, pub);
            }
            return map;
        });

        const forkTreeRoots = computed(() => {
            return publications.value.filter((p) => !p.parentDocumentId);
        });

        function openPublication(pub) {
            router.push({ path: '/editor', query: { load: pub.documentId } });
        }

        function forkPublication(pub) {
            router.push({ path: '/editor', query: { fork: pub.documentId } });
        }

        function viewWorld(pub) {
            router.push({ path: `/world/${pub.documentId}` });
        }

        return {
            author,
            publications,
            forkTreeRoots,
            openPublication,
            forkPublication,
            viewWorld,
            publicationByDocumentId
        };
    },
    template: `
        <section class="author-view">
            <h1>{{ author || 'Anonymous' }}</h1>
            <p class="author-stats">{{ publications.length }} publication(s)</p>

            <div v-if="publications.length === 0" class="empty-state">
                No publications found for this author.
            </div>

            <div v-else>
                <h2>Publications</h2>
                <ul class="publication-list">
                    <li v-for="pub in publications" :key="pub.id" class="publication-card">
                        <h3>{{ pub.title }}</h3>
                        <p v-if="pub.parentDocumentId" class="publication-fork-of">
                            ↳ Fork of {{ publicationByDocumentId.get(pub.parentDocumentId)?.title || 'Unknown' }}
                        </p>
                        <p class="publication-meta">
                            via {{ pub.providerId }}
                        </p>
                        <p class="publication-date" v-if="pub.publishedAt">
                            {{ new Date(pub.publishedAt).toLocaleDateString() }}
                        </p>
                        <div class="publication-actions">
                            <button class="action-btn action-btn--open" @click="openPublication(pub)">Open</button>
                            <button class="action-btn action-btn--fork" @click="forkPublication(pub)">Fork</button>
                            <button class="action-btn action-btn--explore" @click="viewWorld(pub)">Explore</button>
                        </div>
                    </li>
                </ul>

                <div v-if="forkTreeRoots.length > 0" class="fork-graph-section">
                    <h2>Original Works & Forks</h2>
                    <div v-for="root in forkTreeRoots" :key="root.id" class="fork-tree">
                        <div class="fork-node fork-node--root">
                            <strong>{{ root.title }}</strong>
                            <span class="fork-node-date" v-if="root.publishedAt">
                                {{ new Date(root.publishedAt).toLocaleDateString() }}
                            </span>
                        </div>
                        <ForkTree :publications="publications" :root-document-id="root.documentId" />
                    </div>
                </div>
            </div>
        </section>
    `
};
