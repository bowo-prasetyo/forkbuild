import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CreateBrickRegistryUseCase } from '../../application/CreateBrickRegistryUseCase.js';
import { CreateWorldViewUseCase } from '../../application/CreateWorldViewUseCase.js';
import { CreateDiscoveryUseCase } from '../../application/CreateDiscoveryUseCase.js';

export default {
    name: 'WorldView',
    setup() {
        const route = useRoute();
        const router = useRouter();
        const viewport = ref(null);
        const documentId = route.params.documentId;
        const title = ref('Loading...');
        const author = ref(null);
        const publishedAt = ref(null);
        const worldPosition = ref(null);
        const nearbyPublications = ref([]);

        const registry = new CreateBrickRegistryUseCase().execute();
        const worldViewFactory = new CreateWorldViewUseCase().execute();
        const session = worldViewFactory.createSession(registry);

        const { listPublicationsUseCase } = new CreateDiscoveryUseCase().execute();

        function navigateToWorld(id) {
            router.push({ path: `/world/${id}` });
        }

        onMounted(() => {
            try {
                const document = session.viewDocument(viewport.value, documentId);
                title.value = document.metadata.title || 'Untitled';
                author.value = document.metadata.author;
                publishedAt.value = document.metadata.created;
                worldPosition.value = session.getDocumentPosition(documentId);

                const nearbyIds = new Set(session.getNearbyDocuments(documentId, 120));
                const allPubs = listPublicationsUseCase.execute();
                nearbyPublications.value = allPubs.filter((p) => nearbyIds.has(p.documentId));
            } catch (err) {
                title.value = 'Error loading world';
                console.error(err);
            }
        });

        onBeforeUnmount(() => {
            session.dispose();
        });

        return {
            viewport,
            title,
            author,
            publishedAt,
            worldPosition,
            nearbyPublications,
            navigateToWorld
        };
    },
    template: `
        <div class="world-view">
            <div class="world-view-overlay">
                <h2>{{ title }}</h2>
                <p v-if="author">by {{ author }}</p>
                <p v-if="publishedAt" class="world-view-date">
                    Created {{ new Date(publishedAt).toLocaleDateString() }}
                </p>
                <p v-if="worldPosition" class="world-view-coords">
                    Layout: {{ worldPosition.x.toFixed(1) }}, {{ worldPosition.y.toFixed(1) }}, {{ worldPosition.z.toFixed(1) }}
                </p>
                <p class="world-view-hint">Drag to orbit • Scroll to zoom • Home to reset</p>

                <div v-if="nearbyPublications.length > 0" class="world-view-nearby">
                    <h4>Nearby Worlds</h4>
                    <ul class="nearby-list">
                        <li
                            v-for="pub in nearbyPublications"
                            :key="pub.id"
                            class="nearby-item"
                            @click="navigateToWorld(pub.documentId)"
                        >
                            {{ pub.title }}
                        </li>
                    </ul>
                </div>
            </div>
            <div ref="viewport" class="world-viewport"></div>
        </div>
    `
};
