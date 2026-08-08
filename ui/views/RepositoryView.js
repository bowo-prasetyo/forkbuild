import { ref, onMounted } from 'vue';
import { CreateDiscoveryUseCase } from '../../application/CreateDiscoveryUseCase.js';

// Repository View — the "GitHub" mode. Lists all published documents as
// Publication cards. This is the first of the three view modes; Author
// View and World View follow the same architectural pattern (consume
// Publications through DiscoveryProvider, render without knowing the
// blockchain source).
export default {
    name: 'RepositoryView',
    setup() {
        const publications = ref([]);
        const { listPublicationsUseCase } = new CreateDiscoveryUseCase().execute();

        onMounted(() => {
            publications.value = listPublicationsUseCase.execute();
        });

        return { publications };
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
                </li>
            </ul>
        </section>
    `
};
