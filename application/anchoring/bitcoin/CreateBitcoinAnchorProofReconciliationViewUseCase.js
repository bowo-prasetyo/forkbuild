import { BitcoinAnchorProofReconciliationView } from './BitcoinAnchorProofReconciliationView.js';

// 0.8.55 — Bitcoin Anchor Proof Reconciliation.
//
// Takes both collaborators as parameters, constructing neither — the
// identical shape application/
// CreateBitcoinAnchorPublicationCoordinatorUseCase.js's own header
// already established, for the identical reason: a real
// `bitcoinAnchorConfirmationObserver` (application/
// CreateBitcoinAnchorConfirmationObserverUseCase.js, 0.8.54) and a real
// `bitcoinProofVerifier` (application/
// CreateBitcoinAnchorProofVerifierUseCase.js, 0.8.1) each already exist,
// produced by their own composition-root use case. Reconstructing either
// here would give this view its own, disconnected copy of state a
// composition root (ui/main.js, or a test) already built once.
export class CreateBitcoinAnchorProofReconciliationViewUseCase {
    execute({ bitcoinAnchorConfirmationObserver, bitcoinProofVerifier } = {}) {
        const bitcoinAnchorProofReconciliationView = new BitcoinAnchorProofReconciliationView({
            bitcoinAnchorConfirmationObserver, bitcoinProofVerifier
        });
        return { bitcoinAnchorProofReconciliationView };
    }
}
