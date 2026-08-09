import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import { CreateBrickRegistryUseCase } from '../../application/CreateBrickRegistryUseCase.js';
import { CreateWorldViewUseCase } from '../../application/CreateWorldViewUseCase.js';

export default {
    name: 'WorldView',
    setup() {
        const route = useRoute();
        const viewport = ref(null);
        const documentId = route.params.documentId;
        const title = ref('Loading...');
        const author = ref(null);
        const publishedAt = ref(null);

        const registry = new CreateBrickRegistryUseCase().execute();
        const worldViewFactory = new CreateWorldViewUseCase().execute();
        const session = worldViewFactory.createSession(registry);

        onMounted(() => {
            try {
                const document = session.viewDocument(viewport.value, documentId);
                title.value = document.metadata.title || 'Untitled';
                author.value = document.metadata.author;
                publishedAt.value = document.metadata.created;
            } catch (err) {
                title.value = 'Error loading world';
                console.error(err);
            }
        });

        onBeforeUnmount(() => {
            session.dispose();
        });

        return { viewport, title, author, publishedAt };
    },
    template: `
        <div class="world-view">
            <div class="world-view-overlay">
                <h2>{{ title }}</h2>
                <p v-if="author">by {{ author }}</p>
                <p v-if="publishedAt" class="world-view-date">
                    Created {{ new Date(publishedAt).toLocaleDateString() }}
                </p>
                <p class="world-view-hint">Drag to orbit • Scroll to zoom</p>
            </div>
            <div ref="viewport" class="world-viewport"></div>
        </div>
    `
};
