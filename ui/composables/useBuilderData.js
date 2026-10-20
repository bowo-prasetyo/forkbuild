import { inject } from 'vue';
import { CreateDiscoveryUseCase } from '../../application/discovery/CreateDiscoveryUseCase.js';
import { createVerifiedPublisherResolver } from '../../application/publication/FollowingFeed.js';
import { Publication } from '../../publisher/Publication.js';
import { LocalStorageProvider } from '../../storage/LocalStorageProvider.js';
import { currentIdentityId } from '../../identity/SigningReadiness.js';
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
    const deviceAuthorization = inject('deviceAuthorizationUseCase', null);
    const { listPublicationsUseCase } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider });
    const resolve = createVerifiedPublisherResolver();
    const signerOf = (publication) => resolve(publication instanceof Publication ? publication : safe(() => Publication.fromJSON(publication)));
    const storage = new LocalStorageProvider();

    function publications() {
        return safe(() => listPublicationsUseCase.execute()) || [];
    }

    // This device's key, and the identity it acts for (its own, or the one
    // it is an authorized device of), which credits name.
    function ownIdentityIds() {
        const device = currentIdentityId(identityUseCase ? identityUseCase.provider : null);
        const social = safe(() => deviceAuthorization?.resolveOwnSocialIdentity()?.identityId) || null;
        return [...new Set([social, device].filter(Boolean))];
    }

    function ownIdentityId() {
        return ownIdentityIds()[0] || null;
    }

    function isOwnIdentity(identityId) {
        return Boolean(identityId) && ownIdentityIds().includes(identityId);
    }

    // Where a build helped make opens: its World once published; else this
    // device's saved copy in the Editor; else nowhere yet.
    function routeFor(helped) {
        if (helped.publication) return { path: `/world/${helped.documentId}` };
        return safe(() => storage.load(helped.documentId)) ? { path: '/editor', query: { load: helped.documentId } } : null;
    }

    function helpedBy(identityId) {
        if (!identityId) return [];
        // Your own list is kept under the identity your devices share; one
        // noted under this device's key before then is read too.
        const keys = isOwnIdentity(identityId) ? ownIdentityIds() : [identityId];
        const noted = helpedBuildsStore ? keys.flatMap((key) => helpedBuildsStore.list(key)) : [];
        const credited = keys.flatMap((key) => helpedBuilds({ identityId: key, noted: key === keys[0] ? noted : [], publications: publications(), signerOf }));
        const byDocument = new Map();
        for (const helped of credited) {
            const known = byDocument.get(helped.documentId);
            if (!known || (!known.publication && helped.publication)) byDocument.set(helped.documentId, helped);
        }
        return [...byDocument.values()].sort((a, b) => new Date(b.at ?? 0) - new Date(a.at ?? 0)).map((helped) => ({
            ...helped,
            route: routeFor(helped),
            authorRoute: builderRoute(helped.authorIdentityId, helped.authorName)
        }));
    }

    return { publications, signerOf, ownIdentityId, isOwnIdentity, helpedBy };
}

function safe(read) {
    try {
        return read();
    } catch {
        return null;
    }
}
