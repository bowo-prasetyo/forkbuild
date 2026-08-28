import { BaseTransactionInclusionObservationCoordinator } from './BaseTransactionInclusionObservationCoordinator.js';

// 0.8.96 — Explicit Base Transaction Inclusion & Confirmation Observation.
//
// The identical composition-root shape `application/
// CreateBaseTransactionBroadcastCoordinatorUseCase.js` (0.8.95) already
// established, so a caller can obtain a real
// `BaseTransactionInclusionObservationCoordinator` without ever importing
// `application/BaseTransactionInclusionObservationCoordinator.js`
// directly. `baseTransactionInclusionObserver` is taken as a parameter,
// never constructed here — the SAME, already-existing observer instance a
// composition root (`ui/main.js`, or a test) already built once via
// `application/CreateBaseTransactionInclusionObserverUseCase.js`.
export class CreateBaseTransactionInclusionObservationCoordinatorUseCase {
    execute({ baseTransactionInclusionObserver } = {}) {
        const coordinator = new BaseTransactionInclusionObservationCoordinator({ baseTransactionInclusionObserver });
        return { coordinator };
    }
}
