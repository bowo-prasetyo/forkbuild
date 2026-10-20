import { CreateBitcoinAnchorPublisherUseCase } from '../../../application/anchoring/bitcoin/CreateBitcoinAnchorPublisherUseCase.js';
import { CreateBitcoinInjectedProviderWalletAdapterUseCase } from '../../../application/anchoring/bitcoin/CreateBitcoinInjectedProviderWalletAdapterUseCase.js';
import { CreateBitcoinWalletConnectionUseCase } from '../../../application/anchoring/bitcoin/CreateBitcoinWalletConnectionUseCase.js';
import { CreateBitcoinEsploraWalletFundingSourceUseCase } from '../../../application/anchoring/bitcoin/CreateBitcoinEsploraWalletFundingSourceUseCase.js';
import { CreateBitcoinAnchorPsbtBuilderUseCase } from '../../../application/anchoring/bitcoin/CreateBitcoinAnchorPsbtBuilderUseCase.js';
import { CreateBitcoinEsploraTransactionBroadcasterUseCase } from '../../../application/anchoring/bitcoin/CreateBitcoinEsploraTransactionBroadcasterUseCase.js';
import { CreateBitcoinAnchorPublicationCoordinatorUseCase } from '../../../application/anchoring/bitcoin/CreateBitcoinAnchorPublicationCoordinatorUseCase.js';
import { BitcoinAnchorTransactionBroadcaster } from '../../../anchoring/BitcoinAnchorTransactionBroadcaster.js';
import { BitcoinAnchorBroadcastCoordinator } from '../../../application/anchoring/bitcoin/BitcoinAnchorBroadcastCoordinator.js';
import { BitcoinAnchorTransactionConstructionCoordinator } from '../../../application/anchoring/bitcoin/BitcoinAnchorTransactionConstructionCoordinator.js';
import { BitcoinAnchorConfirmationCoordinator } from '../../../application/anchoring/bitcoin/BitcoinAnchorConfirmationCoordinator.js';
import { BitcoinAnchorReviewedSigningCoordinator } from '../../../application/anchoring/bitcoin/BitcoinAnchorReviewedSigningCoordinator.js';
import { BitcoinAnchorSignedPsbtFinalizationCoordinator } from '../../../application/anchoring/bitcoin/BitcoinAnchorSignedPsbtFinalizationCoordinator.js';
import { BitcoinAnchorSignedPsbtFinalizer } from '../../../anchoring/BitcoinAnchorSignedPsbtFinalizer.js';
import { BitcoinAnchorTransactionBuilder } from '../../../anchoring/BitcoinAnchorTransactionBuilder.js';
import { BitcoinAnchorTransactionReviewCoordinator } from '../../../application/anchoring/bitcoin/BitcoinAnchorTransactionReviewCoordinator.js';
import { BitcoinWalletFundingObserver } from '../../../anchoring/BitcoinWalletFundingObserver.js';

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
    const bitcoinWalletFundingObserver = new BitcoinWalletFundingObserver({ fundingSource: bitcoinEsploraWalletFundingSource });

    const bitcoinAnchorTransactionBuilder = new BitcoinAnchorTransactionBuilder({ network: 'mainnet' });
    const bitcoinAnchorTransactionConstructionCoordinator = new BitcoinAnchorTransactionConstructionCoordinator({ bitcoinAnchorTransactionBuilder });

    const { bitcoinAnchorPsbtBuilder } = new CreateBitcoinAnchorPsbtBuilderUseCase().execute();
    const bitcoinAnchorTransactionReviewCoordinator = new BitcoinAnchorTransactionReviewCoordinator({ bitcoinAnchorPsbtBuilder });
    const bitcoinAnchorReviewedSigningCoordinator = new BitcoinAnchorReviewedSigningCoordinator();

    const bitcoinAnchorSignedPsbtFinalizer = new BitcoinAnchorSignedPsbtFinalizer();
    const bitcoinAnchorSignedPsbtFinalizationCoordinator = new BitcoinAnchorSignedPsbtFinalizationCoordinator({ bitcoinAnchorSignedPsbtFinalizer });

    const { bitcoinEsploraTransactionBroadcaster } = new CreateBitcoinEsploraTransactionBroadcasterUseCase().execute({ apiUrls: resolvedBitcoinEsploraApiUrls });
    const bitcoinAnchorTransactionBroadcaster = new BitcoinAnchorTransactionBroadcaster({ broadcaster: bitcoinEsploraTransactionBroadcaster });
    const bitcoinAnchorBroadcastCoordinator = new BitcoinAnchorBroadcastCoordinator({ bitcoinAnchorTransactionBroadcaster });

    // The production UI only calls publishBroadcastedAnchor(), which records the
    // anchor once the granular pipeline above broadcasts; so the one-shot
    // collaborators are deliberately left unsupplied.
    const { coordinator: bitcoinAnchorPublicationCoordinator } = new CreateBitcoinAnchorPublicationCoordinatorUseCase().execute({
        publicationCatalog,
        createPublicationAnchorUseCase,
        publicationAnchorCatalog
    });

    const bitcoinAnchorConfirmationCoordinator = new BitcoinAnchorConfirmationCoordinator({ bitcoinAnchorConfirmationObserver });

    return {
        bitcoinWalletConnection, bitcoinWalletFundingObserver, bitcoinAnchorTransactionConstructionCoordinator,
        bitcoinAnchorTransactionReviewCoordinator, bitcoinAnchorReviewedSigningCoordinator,
        bitcoinAnchorSignedPsbtFinalizationCoordinator, bitcoinAnchorBroadcastCoordinator,
        bitcoinAnchorPublicationCoordinator, bitcoinAnchorConfirmationCoordinator
    };
}
