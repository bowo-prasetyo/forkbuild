import { inject } from 'vue';
import { CreateDiscoveryUseCase } from '../../application/discovery/CreateDiscoveryUseCase.js';
import { createVerifiedPublisherResolver } from '../../application/publication/FollowingFeed.js';
import { Publication } from '../../publisher/Publication.js';
import { LocalStorageProvider } from '../../storage/LocalStorageProvider.js';
import { resolveSigningIdentityId } from '../../identity/resolveSigningIdentityId.js';
import { helpedBuilds } from '../../application/buildTogether/helpedBuilds.js';
import { builderRoute } from '../components/remix/builtWithText.js';

// What a builder's page (ui/views/BuilderView.js) and My Worlds' "Builds you
// helped make" read: the Publications this device knows of, each signer
// verified, this device's own identity, and its list of builds helped make,
// each with where it opens.
export function useBuilderData() {
    const decentralizedDiscoveryProvider = inject('decentralizedPublicationDiscoveryProvider', null);
    const identityUseCase = inject('identityUseCase', null);
    const helpedBuildsStore = inject('helpedBuildsStore', null);
    const { listPublicationsUseCase } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider });
    const resolve = createVerifiedPublisherResolver();
    const signerOf = (publication) => resolve(publication instanceof Publication ? publication : safe(() => Publication.fromJSON(publication)));
    const storage = new LocalStorageProvider();

    function publications() {
        return safe(() => listPublicationsUseCase.execute()) || [];
    }

    function ownIdentityId() {
        return resolveSigningIdentityId(identityUseCase ? identityUseCase.provider : null);
    }

    // Where a build helped make opens: its World once published; else this
    // device's saved copy in the Editor; else nowhere yet.
    function routeFor(helped) {
        if (helped.publication) return { path: `/world/${helped.documentId}` };
        return safe(() => storage.load(helped.documentId)) ? { path: '/editor', query: { load: helped.documentId } } : null;
    }

    function helpedBy(identityId) {
        if (!identityId) return [];
        const noted = helpedBuildsStore ? helpedBuildsStore.list(identityId) : [];
        return helpedBuilds({ identityId, noted, publications: publications(), signerOf }).map((helped) => ({
            ...helped,
            route: routeFor(helped),
            authorRoute: builderRoute(helped.authorIdentityId, helped.authorName)
        }));
    }

    return { publications, signerOf, ownIdentityId, helpedBy };
}

function safe(read) {
    try {
        return read();
    } catch {
        return null;
    }
}
