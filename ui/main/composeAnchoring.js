import { CreateExternalAnchorVerifierUseCase } from '../../application/anchoring/CreateExternalAnchorVerifierUseCase.js';
import { followNetworkWriterSwitches } from './followNetworkWriterSwitches.js';
import { CreateBitcoinAnchorProofVerifierUseCase } from '../../application/anchoring/bitcoin/CreateBitcoinAnchorProofVerifierUseCase.js';
import { CreatePublicationEvidenceCoordinatorUseCase } from '../../application/publication/evidence/CreatePublicationEvidenceCoordinatorUseCase.js';
import { CreateExternalPublicationAnchorOrchestratorUseCase } from '../../application/anchoring/CreateExternalPublicationAnchorOrchestratorUseCase.js';
import { CreatePublicationAnchorCreationCoordinatorUseCase } from '../../application/anchoring/CreatePublicationAnchorCreationCoordinatorUseCase.js';
import { CreateBitcoinAnchorEvidenceViewUseCase } from '../../application/anchoring/bitcoin/CreateBitcoinAnchorEvidenceViewUseCase.js';
import { CreateExternalAnchorEvidenceViewRegistryUseCase } from '../../application/anchoring/CreateExternalAnchorEvidenceViewRegistryUseCase.js';
import { CreateBitcoinEsploraTransactionConfirmationObserverUseCase } from '../../application/anchoring/bitcoin/CreateBitcoinEsploraTransactionConfirmationObserverUseCase.js';
import { CreateBitcoinAnchorConfirmationObserverUseCase } from '../../application/anchoring/bitcoin/CreateBitcoinAnchorConfirmationObserverUseCase.js';
import { CreateBitcoinAnchorProofReconciliationViewUseCase } from '../../application/anchoring/bitcoin/CreateBitcoinAnchorProofReconciliationViewUseCase.js';
import { CreatePreferredPublicationAnchorCreationCoordinatorUseCase } from '../../application/anchoring/CreatePreferredPublicationAnchorCreationCoordinatorUseCase.js';
import { CreateArweaveAnchorPublisherUseCase } from '../../application/anchoring/CreateArweaveAnchorPublisherUseCase.js';
import { CreateArweaveAnchorProofVerifierUseCase } from '../../application/anchoring/CreateArweaveAnchorProofVerifierUseCase.js';
import { CreateArweaveAnchorEvidenceViewUseCase } from '../../application/anchoring/CreateArweaveAnchorEvidenceViewUseCase.js';
import { CreateBaseAnchorEvidenceViewUseCase } from '../../application/anchoring/base/CreateBaseAnchorEvidenceViewUseCase.js';
import { CreateBaseAnchorProofVerifierUseCase } from '../../application/anchoring/base/CreateBaseAnchorProofVerifierUseCase.js';

// Composition root: publication evidence and external anchoring, and every
// network's anchor reader: checking and describing Arweave, Steem, Blurt,
// Bitcoin and Base anchors, and Bitcoin's confirmation and reconcile. Built
// the first time a page that anchors opens (ui/main.js, the 'anchoring'
// service group). Bitcoin's and Base's wallet steps are their writers, built
// only when switched on (ui/main/plugins/, ui/main/NetworkWriterLoader.js);
// what this returns is what they build on.
export function composeAnchoring({
    identityProvider, resolvedBitcoinEsploraApiUrls, publicationCatalog, publicationAnchorCatalog,
    anchorKnowledgeStore, roleProviderPreferenceStore, arweaveHostSigner, resolvedArweaveGatewayUrl, steemRuntime = null, blurtRuntime = null,
    networkWriterSettingsStore = null
}) {
    const { bitcoinProofVerifier } = new CreateBitcoinAnchorProofVerifierUseCase().execute({ apiUrls: resolvedBitcoinEsploraApiUrls });
    // Captured so the Arweave wiring below can register a second proof verifier
    // into the same registry.
    const { externalAnchorVerifier, proofVerifierRegistry: externalAnchorProofVerifierRegistry } = new CreateExternalAnchorVerifierUseCase().execute({
        proofVerifiers: [bitcoinProofVerifier]
    });
    const { coordinator: publicationEvidenceCoordinator } = new CreatePublicationEvidenceCoordinatorUseCase().execute({
        anchorCatalog: publicationAnchorCatalog,
        externalAnchorVerifier
    });

    // Also captured so the wallet plugins reuse these rather than building a
    // second set against the same catalogs; Bitcoin's one-shot publisher joins
    // the registry when its writer is switched on.
    const { createExternalPublicationAnchorUseCase, publisherRegistry: externalAnchorPublisherRegistry, createPublicationAnchorUseCase } =
        new CreateExternalPublicationAnchorOrchestratorUseCase().execute({
            publicationCatalog,
            anchorCatalog: publicationAnchorCatalog,
            identityProvider,
            publishers: [],
            knowledgeStore: anchorKnowledgeStore
        });
    const { coordinator: publicationAnchorCreationCoordinator } = new CreatePublicationAnchorCreationCoordinatorUseCase().execute({
        createExternalPublicationAnchorUseCase,
        publisherRegistry: externalAnchorPublisherRegistry
    });

    // Adds the saved Proof & Anchoring provider preference ("Use Preferred
    // Provider"), stored in the same roleProviderPreferenceStore as the other roles.
    const { coordinator: preferredPublicationAnchorCreationCoordinator } = new CreatePreferredPublicationAnchorCreationCoordinatorUseCase().execute({
        publicationAnchorCreationCoordinator,
        proofRegistry: externalAnchorPublisherRegistry,
        preferenceStore: roleProviderPreferenceStore
    });

    const { bitcoinAnchorEvidenceView } = new CreateBitcoinAnchorEvidenceViewUseCase().execute();
    const { evidenceViewRegistry: externalAnchorEvidenceViewRegistry } = new CreateExternalAnchorEvidenceViewRegistryUseCase().execute({
        evidenceViews: [bitcoinAnchorEvidenceView]
    });

    // Steem anchors are created, verified and described like Arweave ones
    // (docs/Protocol.md, "Proposed: Steem Anchoring"). Registered before
    // Arweave and Base, the order the registries have always listed them in.
    // Their anchors are checked and described for everyone; making one is
    // offered only while the network's writer is switched on
    // (core/NetworkWriters.js), following the switch as it changes.
    if (steemRuntime) {
        externalAnchorProofVerifierRegistry.register(steemRuntime.proofVerifier);
        externalAnchorEvidenceViewRegistry.register(steemRuntime.anchorEvidenceView);
    }
    // Blurt anchors likewise (docs/Protocol.md, "Proposed: Blurt Substrate").
    if (blurtRuntime) {
        externalAnchorProofVerifierRegistry.register(blurtRuntime.proofVerifier);
        externalAnchorEvidenceViewRegistry.register(blurtRuntime.anchorEvidenceView);
    }
    const anchorWriterRuntimes = { steem: steemRuntime, blurt: blurtRuntime };
    if (networkWriterSettingsStore) {
        followNetworkWriterSwitches(networkWriterSettingsStore, anchorWriterRuntimes, {
            on: (runtime) => externalAnchorPublisherRegistry.register(runtime.anchorPublisher),
            off: (runtime) => externalAnchorPublisherRegistry.unregister(runtime.anchorPublisher.anchorType)
        });
    } else {
        for (const runtime of Object.values(anchorWriterRuntimes)) {
            if (runtime) externalAnchorPublisherRegistry.register(runtime.anchorPublisher);
        }
    }

    // Registered into the same registries. With no wallet installed,
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
    // the Base wallet's, as Bitcoin's verifier is.
    const { baseProofVerifier } = new CreateBaseAnchorProofVerifierUseCase().execute();
    externalAnchorProofVerifierRegistry.register(baseProofVerifier);

    const { arweaveAnchorEvidenceView } = new CreateArweaveAnchorEvidenceViewUseCase().execute();
    externalAnchorEvidenceViewRegistry.register(arweaveAnchorEvidenceView);

    const { baseAnchorEvidenceView } = new CreateBaseAnchorEvidenceViewUseCase().execute();
    externalAnchorEvidenceViewRegistry.register(baseAnchorEvidenceView);

    const { bitcoinEsploraTransactionConfirmationObserver } = new CreateBitcoinEsploraTransactionConfirmationObserverUseCase().execute({ apiUrls: resolvedBitcoinEsploraApiUrls });
    const { bitcoinAnchorConfirmationObserver } = new CreateBitcoinAnchorConfirmationObserverUseCase().execute({
        confirmationSource: bitcoinEsploraTransactionConfirmationObserver
    });
    const { bitcoinAnchorProofReconciliationView } = new CreateBitcoinAnchorProofReconciliationViewUseCase().execute({
        bitcoinAnchorConfirmationObserver, bitcoinProofVerifier
    });

    return {
        externalAnchorProofVerifierRegistry, publicationEvidenceCoordinator, externalAnchorPublisherRegistry,
        publicationAnchorCreationCoordinator, preferredPublicationAnchorCreationCoordinator,
        externalAnchorEvidenceViewRegistry, bitcoinAnchorProofReconciliationView,
        // For the wallet plugins.
        publicationCatalog, publicationAnchorCatalog, createPublicationAnchorUseCase, bitcoinAnchorConfirmationObserver
    };
}
