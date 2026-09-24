import { BitcoinAnchorPublicationCoordinator } from './BitcoinAnchorPublicationCoordinator.js';

// 0.8.53 — Bitcoin Anchor Publication Lifecycle.
//
// Takes every collaborator as a parameter, constructing none of them —
// the identical shape application/
// CreatePublicationAnchorCreationCoordinatorUseCase.js's own header
// already established, for the identical reason: each of these already
// exists, produced by its own 0.8.8/0.8.47–0.8.52 composition-root use
// case. Reconstructing any of them here would give this coordinator its
// own, disconnected copy of state a composition root (ui/main.js, or a
// test) already built once.
export class CreateBitcoinAnchorPublicationCoordinatorUseCase {
    execute({
        publicationCatalog,
        createPublicationAnchorUseCase,
        bitcoinAnchorTransactionBuilder,
        bitcoinAnchorPsbtBuilder,
        bitcoinAnchorPsbtSerializer,
        bitcoinAnchorWalletSigner,
        bitcoinAnchorSignedPsbtFinalizer,
        bitcoinAnchorTransactionBroadcaster
    } = {}) {
        const coordinator = new BitcoinAnchorPublicationCoordinator({
            publicationCatalog,
            createPublicationAnchorUseCase,
            bitcoinAnchorTransactionBuilder,
            bitcoinAnchorPsbtBuilder,
            bitcoinAnchorPsbtSerializer,
            bitcoinAnchorWalletSigner,
            bitcoinAnchorSignedPsbtFinalizer,
            bitcoinAnchorTransactionBroadcaster
        });
        return { coordinator };
    }
}
