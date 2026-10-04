import { ref, computed, onBeforeUnmount } from 'vue';
import { t } from '../../i18n/i18n.js';

// The catalog's search of Nostr, Arweave, Steem and Blurt for what others
// distributed (application/publication/RepositoryNetworkDiscovery.js).
// `repositoryNetworkDiscovery` may be null, where it isn't composed; nothing
// is searched then. `onAdmitted()` runs after a search that admitted any.
export function useRepositoryNetworkDiscovery({ repositoryNetworkDiscovery, onAdmitted }) {
    // null | { searching: true } | { searching: false, admitted, pending }
    const networkDiscovery = ref(null);
    let unmounted = false;
    onBeforeUnmount(() => { unmounted = true; });

    async function searchNetworks() {
        if (!repositoryNetworkDiscovery || (networkDiscovery.value && networkDiscovery.value.searching)) return;
        networkDiscovery.value = { searching: true };
        let result;
        try {
            result = await repositoryNetworkDiscovery.run();
        } catch {
            result = { admitted: [], pending: 0 };
        }
        if (unmounted) return;
        networkDiscovery.value = { searching: false, admitted: result.admitted.length, pending: result.pending };
        if (result.admitted.length > 0) onAdmitted();
    }

    const networkDiscoveryText = computed(() => {
        const state = networkDiscovery.value;
        if (!state) return '';
        if (state.searching) return t('publicationCatalog.network.searching');
        const found = state.admitted > 0
            ? t('publicationCatalog.network.found', { count: state.admitted })
            : t('publicationCatalog.network.nothingNew');
        return state.pending > 0 ? `${found} ${t('publicationCatalog.network.pending', { count: state.pending })}` : found;
    });

    return { networkDiscovery, networkDiscoveryText, searchNetworks };
}

// Where Explore goes. A Publication found on the networks has no build on
// this device until it is explored: the link view for its signed record
// fetches and checks the build, then opens World View.
export function exploreRouteFor(publication, networkPublicationLocatorStore) {
    const networkPath = networkPublicationLocatorStore ? networkPublicationLocatorStore.viewPath(publication.id) : null;
    return { path: networkPath || `/world/${publication.documentId}` };
}
