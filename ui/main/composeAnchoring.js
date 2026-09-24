import { CreateExternalAnchorVerifierUseCase } from '../../application/anchoring/CreateExternalAnchorVerifierUseCase.js';
import { CreateBitcoinAnchorProofVerifierUseCase } from '../../application/anchoring/bitcoin/CreateBitcoinAnchorProofVerifierUseCase.js';
import { CreatePublicationEvidenceCoordinatorUseCase } from '../../application/publication/evidence/CreatePublicationEvidenceCoordinatorUseCase.js';
import { CreateBitcoinAnchorPublisherUseCase } from '../../application/anchoring/bitcoin/CreateBitcoinAnchorPublisherUseCase.js';
import { CreateExternalPublicationAnchorOrchestratorUseCase } from '../../application/anchoring/CreateExternalPublicationAnchorOrchestratorUseCase.js';
import { CreatePublicationAnchorCreationCoordinatorUseCase } from '../../application/anchoring/CreatePublicationAnchorCreationCoordinatorUseCase.js';
import { CreateBitcoinAnchorEvidenceViewUseCase } from '../../application/anchoring/bitcoin/CreateBitcoinAnchorEvidenceViewUseCase.js';
import { CreateExternalAnchorEvidenceViewRegistryUseCase } from '../../application/anchoring/CreateExternalAnchorEvidenceViewRegistryUseCase.js';
import { CreateBitcoinEsploraTransactionConfirmationObserverUseCase } from '../../application/anchoring/bitcoin/CreateBitcoinEsploraTransactionConfirmationObserverUseCase.js';
import { CreateBitcoinAnchorConfirmationObserverUseCase } from '../../application/anchoring/bitcoin/CreateBitcoinAnchorConfirmationObserverUseCase.js';
import { CreateBitcoinAnchorProofReconciliationViewUseCase } from '../../application/anchoring/bitcoin/CreateBitcoinAnchorProofReconciliationViewUseCase.js';
import { CreateBitcoinInjectedProviderWalletAdapterUseCase } from '../../application/anchoring/bitcoin/CreateBitcoinInjectedProviderWalletAdapterUseCase.js';
import { CreateBitcoinWalletConnectionUseCase } from '../../application/anchoring/bitcoin/CreateBitcoinWalletConnectionUseCase.js';
import { CreateBitcoinEsploraWalletFundingSourceUseCase } from '../../application/anchoring/bitcoin/CreateBitcoinEsploraWalletFundingSourceUseCase.js';
import { CreateBitcoinWalletFundingObserverUseCase } from '../../application/anchoring/bitcoin/CreateBitcoinWalletFundingObserverUseCase.js';
import { CreateBitcoinAnchorTransactionBuilderUseCase } from '../../application/anchoring/bitcoin/CreateBitcoinAnchorTransactionBuilderUseCase.js';
import { CreateBitcoinAnchorTransactionConstructionCoordinatorUseCase } from '../../application/anchoring/bitcoin/CreateBitcoinAnchorTransactionConstructionCoordinatorUseCase.js';
import { CreateBitcoinAnchorPsbtBuilderUseCase } from '../../application/anchoring/bitcoin/CreateBitcoinAnchorPsbtBuilderUseCase.js';
import { CreateBitcoinAnchorTransactionReviewCoordinatorUseCase } from '../../application/anchoring/bitcoin/CreateBitcoinAnchorTransactionReviewCoordinatorUseCase.js';
import { CreateBitcoinAnchorReviewedSigningCoordinatorUseCase } from '../../application/anchoring/bitcoin/CreateBitcoinAnchorReviewedSigningCoordinatorUseCase.js';
import { CreateBitcoinAnchorSignedPsbtFinalizerUseCase } from '../../application/anchoring/bitcoin/CreateBitcoinAnchorSignedPsbtFinalizerUseCase.js';
import { CreateBitcoinAnchorSignedPsbtFinalizationCoordinatorUseCase } from '../../application/anchoring/bitcoin/CreateBitcoinAnchorSignedPsbtFinalizationCoordinatorUseCase.js';
import { CreateBitcoinEsploraTransactionBroadcasterUseCase } from '../../application/anchoring/bitcoin/CreateBitcoinEsploraTransactionBroadcasterUseCase.js';
import { CreateBitcoinAnchorTransactionBroadcasterUseCase } from '../../application/anchoring/bitcoin/CreateBitcoinAnchorTransactionBroadcasterUseCase.js';
import { CreateBaseInjectedProviderWalletAdapterUseCase } from '../../application/anchoring/base/CreateBaseInjectedProviderWalletAdapterUseCase.js';
import { CreateBaseWalletConnectionUseCase } from '../../application/anchoring/base/CreateBaseWalletConnectionUseCase.js';
import { CreateBaseJsonRpcClientUseCase } from '../../application/anchoring/base/CreateBaseJsonRpcClientUseCase.js';
import { CreateBaseNetworkObserverUseCase } from '../../application/anchoring/base/CreateBaseNetworkObserverUseCase.js';
import { CreateBasePublicationTransactionPlannerUseCase } from '../../application/anchoring/base/CreateBasePublicationTransactionPlannerUseCase.js';
import { CreateBasePublicationTransactionPlanCoordinatorUseCase } from '../../application/anchoring/base/CreateBasePublicationTransactionPlanCoordinatorUseCase.js';
import { CreateBaseInjectedProviderWalletTransactionSignerUseCase } from '../../application/anchoring/base/CreateBaseInjectedProviderWalletTransactionSignerUseCase.js';
import { CreateBaseReviewedSigningCoordinatorUseCase } from '../../application/anchoring/base/CreateBaseReviewedSigningCoordinatorUseCase.js';
import { CreateBaseSignedTransactionFinalizerUseCase } from '../../application/anchoring/base/CreateBaseSignedTransactionFinalizerUseCase.js';
import { CreateBaseSignedTransactionFinalizationCoordinatorUseCase } from '../../application/anchoring/base/CreateBaseSignedTransactionFinalizationCoordinatorUseCase.js';
import { CreateBaseTransactionBroadcasterUseCase } from '../../application/anchoring/base/CreateBaseTransactionBroadcasterUseCase.js';
import { CreateBaseAnchorPublisherUseCase } from '../../application/anchoring/base/CreateBaseAnchorPublisherUseCase.js';
import { CreateBaseTransactionBroadcastCoordinatorUseCase } from '../../application/anchoring/base/CreateBaseTransactionBroadcastCoordinatorUseCase.js';
import { CreateBaseTransactionInclusionObserverUseCase } from '../../application/anchoring/base/CreateBaseTransactionInclusionObserverUseCase.js';
import { CreateBaseTransactionInclusionObservationCoordinatorUseCase } from '../../application/anchoring/base/CreateBaseTransactionInclusionObservationCoordinatorUseCase.js';
import { CreateBitcoinAnchorBroadcastCoordinatorUseCase } from '../../application/anchoring/bitcoin/CreateBitcoinAnchorBroadcastCoordinatorUseCase.js';
import { CreateBitcoinAnchorPublicationCoordinatorUseCase } from '../../application/anchoring/bitcoin/CreateBitcoinAnchorPublicationCoordinatorUseCase.js';
import { CreateBitcoinAnchorConfirmationCoordinatorUseCase } from '../../application/anchoring/bitcoin/CreateBitcoinAnchorConfirmationCoordinatorUseCase.js';
import { CreatePreferredPublicationAnchorCreationCoordinatorUseCase } from '../../application/anchoring/CreatePreferredPublicationAnchorCreationCoordinatorUseCase.js';

// Composition root: publication evidence and external anchoring, with the
// Bitcoin (PSBT build, review, sign, finalize, broadcast, confirm) and Base
// (plan, sign, finalize, broadcast, inclusion) pipelines and their wallets.
export function composeAnchoring({
    identityProvider, resolvedBitcoinEsploraApiUrl, publicationCatalog, publicationAnchorCatalog,
    anchorKnowledgeStore, roleProviderPreferenceStore
}) {
    const { bitcoinProofVerifier } = new CreateBitcoinAnchorProofVerifierUseCase().execute({ apiUrl: resolvedBitcoinEsploraApiUrl });
    // Captured so the Arweave wiring below can register a second proof verifier
    // into the same registry.
    const { externalAnchorVerifier, proofVerifierRegistry: externalAnchorProofVerifierRegistry } = new CreateExternalAnchorVerifierUseCase().execute({
        proofVerifiers: [bitcoinProofVerifier]
    });
    const { coordinator: publicationEvidenceCoordinator } = new CreatePublicationEvidenceCoordinatorUseCase().execute({
        anchorCatalog: publicationAnchorCatalog,
        externalAnchorVerifier
    });

    // Deliberately not a real broadcaster: this one-shot pipeline has no wallet
    // signing, so it honestly reports PUBLISH_UNAVAILABLE instead of fabricating a
    // broadcast. The real Bitcoin write path is the granular pipeline below.
    const bitcoinBroadcaster = {
        async broadcast() {
            return {
                broadcast: false,
                unavailable: true,
                reason: 'This device has no Bitcoin wallet/broadcast capability configured yet.'
            };
        }
    };
    const { bitcoinAnchorPublisher } = new CreateBitcoinAnchorPublisherUseCase().execute({
        network: 'mainnet',
        broadcaster: bitcoinBroadcaster
    });
    // Also captured so CreateBaseAnchorPublisherUseCase below reuses this instance
    // rather than building a second one against the same catalogs.
    const { createExternalPublicationAnchorUseCase, publisherRegistry: externalAnchorPublisherRegistry, createPublicationAnchorUseCase } =
        new CreateExternalPublicationAnchorOrchestratorUseCase().execute({
            publicationCatalog,
            anchorCatalog: publicationAnchorCatalog,
            identityProvider,
            publishers: [bitcoinAnchorPublisher],
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

    const { bitcoinEsploraTransactionConfirmationObserver } = new CreateBitcoinEsploraTransactionConfirmationObserverUseCase().execute({ apiUrl: resolvedBitcoinEsploraApiUrl });
    const { bitcoinAnchorConfirmationObserver } = new CreateBitcoinAnchorConfirmationObserverUseCase().execute({
        confirmationSource: bitcoinEsploraTransactionConfirmationObserver
    });
    const { bitcoinAnchorProofReconciliationView } = new CreateBitcoinAnchorProofReconciliationViewUseCase().execute({
        bitcoinAnchorConfirmationObserver, bitcoinProofVerifier
    });

    // The injected provider is window.unisat when such an extension is installed,
    // otherwise null (an expected outcome). One shared connection app-wide, never
    // persisted across a reload.
    const { bitcoinInjectedProviderWalletAdapter } = new CreateBitcoinInjectedProviderWalletAdapterUseCase().execute({
        injectedProvider: (typeof window !== 'undefined' && window.unisat) ? window.unisat : null
    });
    const { bitcoinWalletConnection } = new CreateBitcoinWalletConnectionUseCase().execute({
        provider: bitcoinInjectedProviderWalletAdapter
    });

    const { bitcoinEsploraWalletFundingSource } = new CreateBitcoinEsploraWalletFundingSourceUseCase().execute({ apiUrl: resolvedBitcoinEsploraApiUrl });
    const { bitcoinWalletFundingObserver } = new CreateBitcoinWalletFundingObserverUseCase().execute({
        fundingSource: bitcoinEsploraWalletFundingSource
    });

    // Same shape for Base: window.ethereum or null. The Base connection exposes an
    // account address only, never a signing capability.
    const { baseInjectedProviderWalletAdapter } = new CreateBaseInjectedProviderWalletAdapterUseCase().execute({
        injectedProvider: (typeof window !== 'undefined' && window.ethereum) ? window.ethereum : null
    });
    const { baseWalletConnection } = new CreateBaseWalletConnectionUseCase().execute({
        provider: baseInjectedProviderWalletAdapter
    });
    const { baseJsonRpcClient } = new CreateBaseJsonRpcClientUseCase().execute();
    const { baseNetworkObserver } = new CreateBaseNetworkObserverUseCase().execute({
        rpcSource: baseJsonRpcClient
    });

    const { basePublicationTransactionPlanner } = new CreateBasePublicationTransactionPlannerUseCase().execute({
        rpcSource: baseJsonRpcClient
    });
    const { coordinator: basePublicationTransactionPlanCoordinator } = new CreateBasePublicationTransactionPlanCoordinatorUseCase().execute({
        basePublicationTransactionPlanner
    });

    // Reads window.ethereum separately from the adapter above: connecting and
    // signing stay two separate objects.
    const { baseInjectedProviderWalletTransactionSigner } = new CreateBaseInjectedProviderWalletTransactionSignerUseCase().execute({
        injectedProvider: (typeof window !== 'undefined' && window.ethereum) ? window.ethereum : null
    });
    const { coordinator: baseReviewedSigningCoordinator } = new CreateBaseReviewedSigningCoordinatorUseCase().execute();

    const { baseSignedTransactionFinalizer } = new CreateBaseSignedTransactionFinalizerUseCase().execute();
    const { coordinator: baseSignedTransactionFinalizationCoordinator } = new CreateBaseSignedTransactionFinalizationCoordinatorUseCase().execute({
        baseSignedTransactionFinalizer
    });

    const { baseTransactionBroadcaster } = new CreateBaseTransactionBroadcasterUseCase().execute({
        rpcSource: baseJsonRpcClient
    });
    const { coordinator: baseTransactionBroadcastCoordinator } = new CreateBaseTransactionBroadcastCoordinatorUseCase().execute({
        baseTransactionBroadcaster
    });

    // Deliberately not registered into externalAnchorPublisherRegistry (see
    // anchoring/BaseAnchorPublisher.js).
    const { baseAnchorPublisher } = new CreateBaseAnchorPublisherUseCase().execute({
        baseTransactionBroadcaster,
        createPublicationAnchorUseCase
    });

    const { baseTransactionInclusionObserver } = new CreateBaseTransactionInclusionObserverUseCase().execute({
        rpcSource: baseJsonRpcClient
    });
    const { coordinator: baseTransactionInclusionObservationCoordinator } = new CreateBaseTransactionInclusionObservationCoordinatorUseCase().execute({
        baseTransactionInclusionObserver
    });

    const { bitcoinAnchorTransactionBuilder } = new CreateBitcoinAnchorTransactionBuilderUseCase().execute({ network: 'mainnet' });
    const { coordinator: bitcoinAnchorTransactionConstructionCoordinator } = new CreateBitcoinAnchorTransactionConstructionCoordinatorUseCase().execute({
        bitcoinAnchorTransactionBuilder
    });

    const { bitcoinAnchorPsbtBuilder } = new CreateBitcoinAnchorPsbtBuilderUseCase().execute();
    const { coordinator: bitcoinAnchorTransactionReviewCoordinator } = new CreateBitcoinAnchorTransactionReviewCoordinatorUseCase().execute({
        bitcoinAnchorPsbtBuilder
    });
    const { coordinator: bitcoinAnchorReviewedSigningCoordinator } = new CreateBitcoinAnchorReviewedSigningCoordinatorUseCase().execute();

    const { bitcoinAnchorSignedPsbtFinalizer } = new CreateBitcoinAnchorSignedPsbtFinalizerUseCase().execute();
    const { coordinator: bitcoinAnchorSignedPsbtFinalizationCoordinator } = new CreateBitcoinAnchorSignedPsbtFinalizationCoordinatorUseCase().execute({
        bitcoinAnchorSignedPsbtFinalizer
    });

    const { bitcoinEsploraTransactionBroadcaster } = new CreateBitcoinEsploraTransactionBroadcasterUseCase().execute({ apiUrl: resolvedBitcoinEsploraApiUrl });
    const { bitcoinAnchorTransactionBroadcaster } = new CreateBitcoinAnchorTransactionBroadcasterUseCase().execute({
        broadcaster: bitcoinEsploraTransactionBroadcaster
    });
    const { coordinator: bitcoinAnchorBroadcastCoordinator } = new CreateBitcoinAnchorBroadcastCoordinatorUseCase().execute({
        bitcoinAnchorTransactionBroadcaster
    });

    // The production UI only calls publishBroadcastedAnchor(), which records the
    // anchor once the granular pipeline above broadcasts; so the one-shot
    // collaborators are deliberately left unsupplied.
    const { coordinator: bitcoinAnchorPublicationCoordinator } = new CreateBitcoinAnchorPublicationCoordinatorUseCase().execute({
        publicationCatalog,
        createPublicationAnchorUseCase,
        publicationAnchorCatalog
    });

    const { coordinator: bitcoinAnchorConfirmationCoordinator } = new CreateBitcoinAnchorConfirmationCoordinatorUseCase().execute({
        bitcoinAnchorConfirmationObserver
    });

    return {
        externalAnchorProofVerifierRegistry, publicationEvidenceCoordinator, externalAnchorPublisherRegistry,
        publicationAnchorCreationCoordinator, preferredPublicationAnchorCreationCoordinator,
        externalAnchorEvidenceViewRegistry, bitcoinAnchorProofReconciliationView, bitcoinWalletConnection,
        bitcoinWalletFundingObserver, baseWalletConnection, baseNetworkObserver,
        basePublicationTransactionPlanCoordinator, baseInjectedProviderWalletTransactionSigner,
        baseReviewedSigningCoordinator, baseSignedTransactionFinalizationCoordinator,
        baseTransactionBroadcastCoordinator, baseAnchorPublisher,
        baseTransactionInclusionObservationCoordinator, bitcoinAnchorTransactionConstructionCoordinator,
        bitcoinAnchorTransactionReviewCoordinator, bitcoinAnchorReviewedSigningCoordinator,
        bitcoinAnchorSignedPsbtFinalizationCoordinator, bitcoinAnchorBroadcastCoordinator,
        bitcoinAnchorPublicationCoordinator, bitcoinAnchorConfirmationCoordinator
    };
}
