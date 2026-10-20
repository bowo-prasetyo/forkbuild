import { inject, ref } from 'vue';
import { exploreRouteFor } from '../../components/publicationCatalog/useRepositoryNetworkDiscovery.js';

// About this build's look-alikes: builds by other people published before the
// shown build's Publication that look a lot like it
// (application/publication/SimilarBuildFinder.js#findEarlier()), as its page
// lists them (ui/components/remix/SimilarEarlierBuilds.js). Looked up once per
// Publication shown, since World View refreshes its panels often; a failed
// look shows nothing.
export function useSimilarEarlierBuilds() {
    const finder = inject('similarBuildFinder', null);
    const networkPublicationLocatorStore = inject('networkPublicationLocatorStore', null);
    const documentSimilarEarlier = ref([]);
    let shownPublicationId = null;

    async function refreshSimilarEarlier(publication) {
        const publicationId = publication?.id || null;
        if (publicationId === shownPublicationId) return;
        shownPublicationId = publicationId;
        documentSimilarEarlier.value = [];
        if (!finder || !publication) return;
        let found = [];
        try {
            found = await finder.findEarlier(publication);
        } catch {
            found = [];
        }
        if (shownPublicationId === publicationId) documentSimilarEarlier.value = found;
    }

    function similarEarlierRoute(publication) {
        return publication ? exploreRouteFor(publication, networkPublicationLocatorStore) : null;
    }

    return { documentSimilarEarlier, refreshSimilarEarlier, similarEarlierRoute };
}
