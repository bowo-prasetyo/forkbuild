import { inject } from 'vue';
import { seesNeighbour } from '../../../core/world/NeighbourSight.js';

// Counting what finding 1 of docs/reviews/CreativeDirection-2026-10-12b.md
// asks of the village: of World View visits (`/e/world-visit`), how many see
// someone else's build (`/e/world-neighbour`, once a visit;
// core/world/NeighbourSight.js). Under the visitor count's rules and setting
// (application/settings/FunnelEventCounter.js); nothing about the build or
// the visitor is sent.
export function useNeighbourCount({ session }) {
    const funnel = inject('funnelEventCounter', null);
    let counted = false;
    let own = null;

    function startVisit() {
        counted = false;
        own = null;
        funnel?.visitedWorld();
    }

    // Called as the World around the camera changes (WorldView's refresh).
    // `extraIds`: builds shown but not loaded, such as the plaza's entries.
    function checkNeighbours(extraIds = []) {
        if (counted || !funnel) return;
        if (!own) own = funnel.ownDocumentIds();
        let loaded = [];
        try {
            loaded = session.listLoadedDocumentIds();
        } catch {
            loaded = [];
        }
        const isEditable = (id) => Boolean(session.getDocumentInfo(id)?.editable);
        if (seesNeighbour([...loaded, ...extraIds], { ownDocumentIds: own, isEditable })) {
            counted = true;
            funnel.sawNeighbour();
        }
    }

    return { startVisit, checkNeighbours };
}
