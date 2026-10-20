import { computed, ref } from 'vue';
import { findBuildEntrance } from '../../../core/world/BuildEntrance.js';

// Walk inside it: once a build is published, a way from the Editor into
// World View that arrives at its door (`/world/:id?arrive=door`, see
// application/worldNavigation/arrivalMethods.js). Offered beside the
// post-publish link and by the guided first build's last step, for as long
// as the published build is the one open. A build with no door is walked
// round instead, and the button says so.
export function useWalkInside({ documentManager, registry, documentVersion }) {
    const published = ref(null);

    function walkInsidePublished(publication) {
        const world = documentManager.document?.world;
        if (!publication || !publication.documentId || !world) {
            published.value = null;
            return;
        }
        const bricks = [];
        for (const building of world.getBuildings()) {
            for (const brick of building.getBricks()) bricks.push(brick);
        }
        let entrance = null;
        try {
            entrance = findBuildEntrance(bricks, registry);
        } catch {
            entrance = null;
        }
        published.value = {
            documentId: publication.documentId,
            openDocumentId: world.id,
            hasDoor: entrance?.kind === 'door'
        };
    }

    const walkInside = computed(() => {
        // Read so a document opened, saved or edited since is noticed.
        void documentVersion?.value;
        const current = published.value;
        if (!current || (documentManager.document?.world?.id ?? null) !== current.openDocumentId) return null;
        return {
            route: { path: `/world/${current.documentId}`, query: { arrive: 'door' } },
            hasDoor: current.hasDoor
        };
    });

    return { walkInside, walkInsidePublished };
}
