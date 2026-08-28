import { BaseSignedTransactionFinalizer } from '../base/BaseSignedTransactionFinalizer.js';

// 0.8.94 — Explicit Base Signed Transaction Verification & Finalization.
//
// The identical composition-root shape `application/
// CreateBitcoinAnchorSignedPsbtFinalizerUseCase.js` (0.8.51) already
// established, so a caller can obtain a real `BaseSignedTransactionFinalizer`
// without ever importing `base/BaseSignedTransactionFinalizer.js`
// directly. Like its Bitcoin sibling, the finalizer carries no policy or
// capability of its own to inject — it is a pure, offline cryptographic
// check — so this use case takes no arguments at all.
export class CreateBaseSignedTransactionFinalizerUseCase {
    execute() {
        const baseSignedTransactionFinalizer = new BaseSignedTransactionFinalizer();

        return { baseSignedTransactionFinalizer };
    }
}
