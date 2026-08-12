import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { CreateDiscoveryUseCase } from '../../application/CreateDiscoveryUseCase.js';

// Repository View — the "GitHub" mode. Lists all published documents as
// Publication cards. This is the first of the three view modes; Author
// View and World View follow the same architectural pattern (consume
// Publications through DiscoveryProvider, render without knowing the
// blockchain source).
export default {
    name: 'RepositoryView',
    setup() {
        const router = useRouter();
        const publications = ref([]);
        const { listPublicationsUseCase } = new CreateDiscoveryUseCase().execute();

        onMounted(() => {
            publications.value = listPublicationsUseCase.execute();
        });

        const publicationByDocumentId = computed(() => {
            const map = new Map();
            for (const pub of publications.value) {
                map.set(pub.documentId, pub);
            }
            return map;
        });

        function openPublication(pub) {
            router.push({ path: '/editor', query: { load: pub.documentId } });
        }

        function forkPublication(pub) {
		    // Pass both documentId (for loading) and publicationId (for license enforcement)
		    router.push({ path: '/editor', query: { fork: pub.documentId, publication: pub.id } });
        }

        function viewWorld(pub) {
            router.push({ path: `/world/${pub.documentId}` });
        }

        function viewAuthor(author) {
            if (!author) return;
            router.push({ path: `/author/${encodeURIComponent(author)}` });
        }

        function getForkCount(pub) {
            return publications.value.filter((p) => p.parentDocumentId === pub.documentId).length;
        }

        function getParentTitle(pub) {
            if (!pub.parentDocumentId) return null;
            const parent = publicationByDocumentId.value.get(pub.parentDocumentId);
            return parent ? parent.title : 'Unknown';
        }

        return {
            publications,
            openPublication,
            forkPublication,
            viewWorld,
            viewAuthor,
            getForkCount,
            getParentTitle
        };
    },
    template: `
        <section class="repository-view">
            <h1>Repository</h1>
            <div v-if="publications.length === 0" class="empty-state">
                No publications yet. Publish a creation from the Editor to see it here.
            </div>
            <ul v-else class="publication-list">
                <li v-for="pub in publications" :key="pub.id" class="publication-card">
                    <h3>{{ pub.title }}</h3>
                    <p v-if="pub.parentDocumentId" class="publication-fork-of">
                        ↳ Fork of {{ getParentTitle(pub) }}
                    </p>
                    <p class="publication-meta">
                        by
                        <template v-if="pub.author">
                            <a @click.prevent="viewAuthor(pub.author)" class="publication-author-link">{{ pub.author }}</a>
                        </template>
                        <template v-else>anonymous</template>
                        via {{ pub.providerId }}
                    </p>
                    <p class="publication-date" v-if="pub.publishedAt">
                        {{ new Date(pub.publishedAt).toLocaleDateString() }}
                    </p>
                    <p class="publication-forks" v-if="getForkCount(pub) > 0">
                        {{ getForkCount(pub) }} fork(s)
                    </p>
                    <div class="publication-actions">
                        <button class="action-btn action-btn--open" @click="openPublication(pub)">Open</button>
                        <button class="action-btn action-btn--fork" @click="forkPublication(pub)">Fork</button>
                        <button class="action-btn action-btn--explore" @click="viewWorld(pub)">Explore</button>
                    </div>
                </li>
            </ul>
        </section>
    `
};
