import { BitcoinAnchorReviewedSigningCoordinator } from './BitcoinAnchorReviewedSigningCoordinator.js';

// 0.8.62 — Explicit Reviewed Bitcoin Anchor Signing UI.
//
// Mirrors application/CreateBitcoinAnchorTransactionConstructionCoordinatorUseCase.js's
// own shape exactly, one stage later in the pipeline — a composition root
// ui/ or tests/ uses to get a concrete BitcoinAnchorReviewedSigningCoordinator
// without ever importing application/BitcoinAnchorReviewedSigningCoordinator.js
// directly. Takes no collaborator at all: the coordinator it wires
// constructs its own signer, fresh, on every explicit sign() call — see
// that class's own header on why it never accepts (and so this use case
// never needs to supply) a wallet up front.
export class CreateBitcoinAnchorReviewedSigningCoordinatorUseCase {
    execute() {
        const coordinator = new BitcoinAnchorReviewedSigningCoordinator();
        return { coordinator };
    }
}
