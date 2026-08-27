import { BitcoinAnchorTransactionReviewCoordinator } from './BitcoinAnchorTransactionReviewCoordinator.js';

// 0.8.62 — Explicit Reviewed Bitcoin Anchor Signing UI.
//
// Mirrors application/CreateBitcoinAnchorTransactionConstructionCoordinatorUseCase.js's
// own shape exactly, one stage later in the pipeline — a composition root
// ui/ or tests/ uses to get a concrete BitcoinAnchorTransactionReviewCoordinator
// without ever importing application/BitcoinAnchorTransactionReviewCoordinator.js
// directly. The caller still supplies `bitcoinAnchorPsbtBuilder` itself —
// this use case wires the bridge, never the PSBT builder behind it.
export class CreateBitcoinAnchorTransactionReviewCoordinatorUseCase {
    execute({ bitcoinAnchorPsbtBuilder } = {}) {
        const coordinator = new BitcoinAnchorTransactionReviewCoordinator({ bitcoinAnchorPsbtBuilder });
        return { coordinator };
    }
}
