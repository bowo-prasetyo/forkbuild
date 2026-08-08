import { ref, onMounted } from 'vue';
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

        function openPublication(pub) {
            router.push({ path: '/editor', query: { load: pub.documentId } });
        }

        function forkPublication(pub) {
            router.push({ path: '/editor', query: { fork: pub.documentId } });
        }

        return { publications, openPublication, forkPublication };
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
                    <p class="publication-meta">
                        by {{ pub.author || 'anonymous' }} via {{ pub.providerId }}
                    </p>
                    <p class="publication-date" v-if="pub.publishedAt">
                        {{ new Date(pub.publishedAt).toLocaleDateString() }}
                    </p>
                    <div class="publication-actions">
                        <button class="action-btn action-btn--open" @click="openPublication(pub)">Open</button>
                        <button class="action-btn action-btn--fork" @click="forkPublication(pub)">Fork</button>
                    </div>
                </li>
            </ul>
        </section>
    `
};
