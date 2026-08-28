import { BaseSignedTransactionFinalizationCoordinator } from './BaseSignedTransactionFinalizationCoordinator.js';

// 0.8.94 — Explicit Base Signed Transaction Verification & Finalization.
//
// The identical composition-root shape `application/
// CreateBitcoinAnchorSignedPsbtFinalizationCoordinatorUseCase.js` (0.8.63)
// already established, so a caller can obtain a real
// `BaseSignedTransactionFinalizationCoordinator` without ever importing
// `application/BaseSignedTransactionFinalizationCoordinator.js` directly.
// `baseSignedTransactionFinalizer` is taken as a parameter, never
// constructed here — the SAME, already-existing finalizer instance a
// composition root (`ui/main.js`, or a test) already built once via
// `application/CreateBaseSignedTransactionFinalizerUseCase.js`.
export class CreateBaseSignedTransactionFinalizationCoordinatorUseCase {
    execute({ baseSignedTransactionFinalizer } = {}) {
        const coordinator = new BaseSignedTransactionFinalizationCoordinator({ baseSignedTransactionFinalizer });
        return { coordinator };
    }
}
