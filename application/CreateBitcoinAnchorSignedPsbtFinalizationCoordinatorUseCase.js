import { BitcoinAnchorSignedPsbtFinalizationCoordinator } from './BitcoinAnchorSignedPsbtFinalizationCoordinator.js';

// 0.8.63 — Explicit Signed PSBT Verification & Transaction Finalization UI.
//
// The identical composition-root shape application/
// CreateBitcoinAnchorTransactionConstructionCoordinatorUseCase.js (0.8.61)
// already established, so a caller can obtain a real
// BitcoinAnchorSignedPsbtFinalizationCoordinator without ever importing
// application/BitcoinAnchorSignedPsbtFinalizationCoordinator.js directly.
// `bitcoinAnchorSignedPsbtFinalizer` is taken as a parameter, never
// constructed here — the SAME, already-existing 0.8.51 finalizer instance
// a composition root (ui/main.js, or a test) already built once via
// application/CreateBitcoinAnchorSignedPsbtFinalizerUseCase.js, exactly as
// application/CreateBitcoinAnchorTransactionConstructionCoordinatorUseCase.js
// already takes its own `bitcoinAnchorTransactionBuilder` as a parameter
// rather than reconstructing it.
export class CreateBitcoinAnchorSignedPsbtFinalizationCoordinatorUseCase {
    execute({ bitcoinAnchorSignedPsbtFinalizer } = {}) {
        const coordinator = new BitcoinAnchorSignedPsbtFinalizationCoordinator({ bitcoinAnchorSignedPsbtFinalizer });
        return { coordinator };
    }
}
