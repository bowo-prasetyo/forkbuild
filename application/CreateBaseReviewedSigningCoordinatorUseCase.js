import { BaseReviewedSigningCoordinator } from './BaseReviewedSigningCoordinator.js';

// 0.8.93 — Explicit Base Reviewed Transaction Signing.
//
// Mirrors `application/CreateBitcoinAnchorReviewedSigningCoordinatorUseCase.js`'s
// own shape exactly, one chain over — a composition root `ui/` or `tests/`
// uses to get a concrete `BaseReviewedSigningCoordinator` without ever
// importing `application/BaseReviewedSigningCoordinator.js` directly.
// Takes no collaborator at all: the coordinator it wires constructs its
// own signer, fresh, on every explicit `sign()` call — see that class's
// own header on why it never accepts (and so this use case never needs to
// supply) a wallet up front.
export class CreateBaseReviewedSigningCoordinatorUseCase {
    execute() {
        const coordinator = new BaseReviewedSigningCoordinator();
        return { coordinator };
    }
}
