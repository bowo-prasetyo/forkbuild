import { BasePublicationTransactionPlanCoordinator } from './BasePublicationTransactionPlanCoordinator.js';

// 0.8.91 — Explicit Base Publication Transaction Construction.
//
// Takes its one collaborator as a parameter, constructing none of it — the
// identical shape application/
// CreateBitcoinAnchorTransactionConstructionCoordinatorUseCase.js (0.8.61)
// already established, for the identical reason: a real
// `basePublicationTransactionPlanner` already exists, produced by its own
// composition-root use case (application/
// CreateBasePublicationTransactionPlannerUseCase.js). Reconstructing it
// here would give this coordinator its own, disconnected copy of the
// rpcSource a composition root (ui/main.js, or a test) already built
// once.
export class CreateBasePublicationTransactionPlanCoordinatorUseCase {
    execute({ basePublicationTransactionPlanner } = {}) {
        const coordinator = new BasePublicationTransactionPlanCoordinator({ basePublicationTransactionPlanner });
        return { coordinator };
    }
}
