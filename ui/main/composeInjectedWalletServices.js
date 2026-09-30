import { ArweaveContentStore } from '../../content/ArweaveContentStore.js';
import { createNostrPublicationDistributionRuntimeAdapter } from '../../application/nostr/NostrPublicationDistributionRuntimeAdapter.js';
import { createArweaveInjectedProviderSigner } from '../../arweave/ArweaveInjectedProviderSigner.js';
import { createNostrInjectedProviderPublisher } from '../../nostr/NostrInjectedProviderPublisher.js';

// Composition root: the injected-wallet Arweave signer and Nostr publisher,
// and the Arweave content store built on them. The Arweave and Base anchor
// services built on the signer are in composeAnchoring.js, which loads with
// the pages that anchor.
export function composeInjectedWalletServices({
    publicationSnapshotPlacementResolutionStoreRegistry, snapshotPlacementStoreRegistry, resolvedArweaveGatewayUrl
}) {
    // arweaveHostSigner and nostrHostPublisher resolve window.arweaveWallet and
    // window.nostr lazily, on each sign()/publish(), never once at boot: an
    // extension's content script may inject after this module runs. They are
    // therefore always present; a missing extension surfaces as an honest error
    // when a sign or publish is attempted.
    function resolveArweaveHostSigner() {
        return createArweaveInjectedProviderSigner({
            injectedProvider: typeof window !== 'undefined' ? window.arweaveWallet : undefined
        });
    }
    // Forwards the optional `tags` argument (defaults to []).
    const arweaveHostSigner = {
        sign(material, tags = []) {
            const signer = resolveArweaveHostSigner();
            return signer
                ? signer.sign(material, tags)
                : Promise.reject(new Error('This device has no Arweave wallet/signing capability configured yet.'));
        }
    };

    // One Arweave content store registered into both the creation and resolution
    // registries, so an Arweave placement can be created and later resolved.
    const arweaveSnapshotPlacementContentStore = new ArweaveContentStore({
        signer: arweaveHostSigner,
        gatewayUrl: resolvedArweaveGatewayUrl
    });
    snapshotPlacementStoreRegistry.register(arweaveSnapshotPlacementContentStore);
    publicationSnapshotPlacementResolutionStoreRegistry.register(arweaveSnapshotPlacementContentStore);

    // Same lazy resolution as arweaveHostSigner. A plain function, matching what
    // createNostrInjectedProviderPublisher() returns, so `typeof publishImpl ===
    // 'function'` checks still work.
    function resolveNostrHostPublisher() {
        return createNostrInjectedProviderPublisher({
            injectedProvider: typeof window !== 'undefined' ? window.nostr : undefined
        });
    }
    const nostrHostPublisher = async function nostrHostPublish(relayUrl, eventTemplate) {
        const publishImpl = resolveNostrHostPublisher();
        if (!publishImpl) {
            throw new Error('This device has no Nostr (NIP-07) publishing capability configured yet.');
        }
        return publishImpl(relayUrl, eventTemplate);
    };
    const nostrPublicationRuntimeCapabilities = createNostrPublicationDistributionRuntimeAdapter({ publish: nostrHostPublisher });

    return {
        arweaveHostSigner, nostrHostPublisher, nostrPublicationRuntimeCapabilities
    };
}
