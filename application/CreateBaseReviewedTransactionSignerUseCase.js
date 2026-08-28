import { BaseReviewedTransactionSigner } from '../base/BaseReviewedTransactionSigner.js';

// 0.8.93 — Explicit Base Reviewed Transaction Signing.
//
// Mirrors `application/CreateBitcoinAnchorReviewedPsbtSignerUseCase.js`'s
// own shape exactly, one chain over — a composition root `ui/` or `tests/`
// uses to get a concrete `BaseReviewedTransactionSigner` without ever
// importing `base/BaseReviewedTransactionSigner.js` directly. The caller
// still supplies the `wallet` itself — this use case wires the
// review-bound signer, never the wallet capability behind it.
export class CreateBaseReviewedTransactionSignerUseCase {
    execute({ wallet } = {}) {
        const baseReviewedTransactionSigner = new BaseReviewedTransactionSigner({ wallet });

        return { baseReviewedTransactionSigner };
    }
}
