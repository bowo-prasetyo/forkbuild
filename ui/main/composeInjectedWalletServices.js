import { CreateArweaveAnchorPublisherUseCase } from '../../application/anchoring/CreateArweaveAnchorPublisherUseCase.js';
import { CreateArweaveAnchorProofVerifierUseCase } from '../../application/anchoring/CreateArweaveAnchorProofVerifierUseCase.js';
import { CreateArweaveAnchorEvidenceViewUseCase } from '../../application/anchoring/CreateArweaveAnchorEvidenceViewUseCase.js';
import { CreateBaseAnchorEvidenceViewUseCase } from '../../application/anchoring/base/CreateBaseAnchorEvidenceViewUseCase.js';
import { CreateBaseAnchorProofVerifierUseCase } from '../../application/anchoring/base/CreateBaseAnchorProofVerifierUseCase.js';
import { ArweaveContentStore } from '../../content/ArweaveContentStore.js';
import { createNostrPublicationDistributionRuntimeAdapter } from '../../application/nostr/NostrPublicationDistributionRuntimeAdapter.js';
import { createArweaveInjectedProviderSigner } from '../../arweave/ArweaveInjectedProviderSigner.js';
import { createNostrInjectedProviderPublisher } from '../../nostr/NostrInjectedProviderPublisher.js';

// Composition root: the injected-wallet Arweave signer and Nostr publisher,
// and the Arweave content store and Arweave/Base anchor services built on them.
export function composeInjectedWalletServices({
    publicationSnapshotPlacementResolutionStoreRegistry, snapshotPlacementStoreRegistry,
    externalAnchorProofVerifierRegistry, externalAnchorPublisherRegistry, externalAnchorEvidenceViewRegistry,
    resolvedArweaveGatewayUrl
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

    // Registered into the same registries as Bitcoin. With no wallet installed,
    // the lazy signer rejects honestly, so "Create Arweave Anchor" reports
    // PUBLISH_UNAVAILABLE rather than disappearing.
    const { arweaveAnchorPublisher } = new CreateArweaveAnchorPublisherUseCase().execute({
        signer: arweaveHostSigner,
        gatewayUrl: resolvedArweaveGatewayUrl
    });
    externalAnchorPublisherRegistry.register(arweaveAnchorPublisher);

    const { arweaveProofVerifier } = new CreateArweaveAnchorProofVerifierUseCase().execute({
        gatewayUrl: resolvedArweaveGatewayUrl
    });
    externalAnchorProofVerifierRegistry.register(arweaveProofVerifier);

    // Uses its own BaseJsonRpcClient (the default endpoint), kept separate from
    // baseJsonRpcClient above, as Bitcoin's verifier is.
    const { baseProofVerifier } = new CreateBaseAnchorProofVerifierUseCase().execute();
    externalAnchorProofVerifierRegistry.register(baseProofVerifier);

    const { arweaveAnchorEvidenceView } = new CreateArweaveAnchorEvidenceViewUseCase().execute();
    externalAnchorEvidenceViewRegistry.register(arweaveAnchorEvidenceView);

    const { baseAnchorEvidenceView } = new CreateBaseAnchorEvidenceViewUseCase().execute();
    externalAnchorEvidenceViewRegistry.register(baseAnchorEvidenceView);

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
