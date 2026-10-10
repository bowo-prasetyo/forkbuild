import { CreateBitcoinAnchorPublisherUseCase } from '../../../application/anchoring/bitcoin/CreateBitcoinAnchorPublisherUseCase.js';
import { CreateBitcoinInjectedProviderWalletAdapterUseCase } from '../../../application/anchoring/bitcoin/CreateBitcoinInjectedProviderWalletAdapterUseCase.js';
import { CreateBitcoinWalletConnectionUseCase } from '../../../application/anchoring/bitcoin/CreateBitcoinWalletConnectionUseCase.js';
import { CreateBitcoinEsploraWalletFundingSourceUseCase } from '../../../application/anchoring/bitcoin/CreateBitcoinEsploraWalletFundingSourceUseCase.js';
import { CreateBitcoinWalletFundingObserverUseCase } from '../../../application/anchoring/bitcoin/CreateBitcoinWalletFundingObserverUseCase.js';
import { CreateBitcoinAnchorTransactionBuilderUseCase } from '../../../application/anchoring/bitcoin/CreateBitcoinAnchorTransactionBuilderUseCase.js';
import { CreateBitcoinAnchorTransactionConstructionCoordinatorUseCase } from '../../../application/anchoring/bitcoin/CreateBitcoinAnchorTransactionConstructionCoordinatorUseCase.js';
import { CreateBitcoinAnchorPsbtBuilderUseCase } from '../../../application/anchoring/bitcoin/CreateBitcoinAnchorPsbtBuilderUseCase.js';
import { CreateBitcoinAnchorTransactionReviewCoordinatorUseCase } from '../../../application/anchoring/bitcoin/CreateBitcoinAnchorTransactionReviewCoordinatorUseCase.js';
import { CreateBitcoinAnchorReviewedSigningCoordinatorUseCase } from '../../../application/anchoring/bitcoin/CreateBitcoinAnchorReviewedSigningCoordinatorUseCase.js';
import { CreateBitcoinAnchorSignedPsbtFinalizerUseCase } from '../../../application/anchoring/bitcoin/CreateBitcoinAnchorSignedPsbtFinalizerUseCase.js';
import { CreateBitcoinAnchorSignedPsbtFinalizationCoordinatorUseCase } from '../../../application/anchoring/bitcoin/CreateBitcoinAnchorSignedPsbtFinalizationCoordinatorUseCase.js';
import { CreateBitcoinEsploraTransactionBroadcasterUseCase } from '../../../application/anchoring/bitcoin/CreateBitcoinEsploraTransactionBroadcasterUseCase.js';
import { CreateBitcoinAnchorTransactionBroadcasterUseCase } from '../../../application/anchoring/bitcoin/CreateBitcoinAnchorTransactionBroadcasterUseCase.js';
import { CreateBitcoinAnchorBroadcastCoordinatorUseCase } from '../../../application/anchoring/bitcoin/CreateBitcoinAnchorBroadcastCoordinatorUseCase.js';
import { CreateBitcoinAnchorPublicationCoordinatorUseCase } from '../../../application/anchoring/bitcoin/CreateBitcoinAnchorPublicationCoordinatorUseCase.js';
import { CreateBitcoinAnchorConfirmationCoordinatorUseCase } from '../../../application/anchoring/bitcoin/CreateBitcoinAnchorConfirmationCoordinatorUseCase.js';

// Bitcoin's writer (core/NetworkWriters.js): the wallet steps that build,
// review, sign, finalize, broadcast and confirm a Bitcoin anchor, and the
// one-shot Bitcoin publisher. Built only when this device switches Bitcoin's
// writer on (ui/main/NetworkWriterLoader.js); Bitcoin's reader (proof checks,
// evidence views, confirmation) is in ui/main/composeAnchoring.js.
//
// `anchoring` is what composeAnchoring() returns. Returns the services the
// Publications page injects.
export function composeBitcoinWallet({ anchoring, resolvedBitcoinEsploraApiUrls }) {
    const { publicationCatalog, publicationAnchorCatalog, createPublicationAnchorUseCase, externalAnchorPublisherRegistry, bitcoinAnchorConfirmationObserver } = anchoring;

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
    externalAnchorPublisherRegistry.register(bitcoinAnchorPublisher);

    // The injected provider is window.unisat when such an extension is installed,
    // otherwise null (an expected outcome). One shared connection app-wide, never
    // persisted across a reload.
    const { bitcoinInjectedProviderWalletAdapter } = new CreateBitcoinInjectedProviderWalletAdapterUseCase().execute({
        injectedProvider: (typeof window !== 'undefined' && window.unisat) ? window.unisat : null
    });
    const { bitcoinWalletConnection } = new CreateBitcoinWalletConnectionUseCase().execute({
        provider: bitcoinInjectedProviderWalletAdapter
    });

    const { bitcoinEsploraWalletFundingSource } = new CreateBitcoinEsploraWalletFundingSourceUseCase().execute({ apiUrls: resolvedBitcoinEsploraApiUrls });
    const { bitcoinWalletFundingObserver } = new CreateBitcoinWalletFundingObserverUseCase().execute({
        fundingSource: bitcoinEsploraWalletFundingSource
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

    const { bitcoinEsploraTransactionBroadcaster } = new CreateBitcoinEsploraTransactionBroadcasterUseCase().execute({ apiUrls: resolvedBitcoinEsploraApiUrls });
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
        bitcoinWalletConnection, bitcoinWalletFundingObserver, bitcoinAnchorTransactionConstructionCoordinator,
        bitcoinAnchorTransactionReviewCoordinator, bitcoinAnchorReviewedSigningCoordinator,
        bitcoinAnchorSignedPsbtFinalizationCoordinator, bitcoinAnchorBroadcastCoordinator,
        bitcoinAnchorPublicationCoordinator, bitcoinAnchorConfirmationCoordinator
    };
}
