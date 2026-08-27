import { BitcoinAnchorReviewedPsbtSigner } from '../anchoring/BitcoinAnchorReviewedPsbtSigner.js';

// 0.8.59 — Explicit Bitcoin Anchor Transaction Review UI.
//
// Mirrors application/CreateBitcoinAnchorWalletSignerUseCase.js's own shape
// exactly, for the identical reason — a composition root ui/ or tests/
// uses to get a concrete BitcoinAnchorReviewedPsbtSigner without ever
// importing anchoring/BitcoinAnchorReviewedPsbtSigner.js directly. The
// caller still supplies the `wallet` itself — this use case wires the
// review-bound signer, never the wallet capability behind it, exactly as
// CreateBitcoinAnchorWalletSignerUseCase.js already does for the unchanged
// anchoring/BitcoinAnchorWalletSigner.js it wraps.
export class CreateBitcoinAnchorReviewedPsbtSignerUseCase {
    execute({ wallet } = {}) {
        const bitcoinAnchorReviewedPsbtSigner = new BitcoinAnchorReviewedPsbtSigner({ wallet });

        return { bitcoinAnchorReviewedPsbtSigner };
    }
}
