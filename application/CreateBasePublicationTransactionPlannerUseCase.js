import { BasePublicationTransactionPlanner } from '../base/BasePublicationTransactionPlanner.js';

// 0.8.91 — Explicit Base Publication Transaction Construction.
//
// Mirrors application/CreateBaseNetworkObserverUseCase.js's own shape
// exactly (0.8.90), one milestone over — a composition root ui/ or
// tests/ uses to get a concrete BasePublicationTransactionPlanner without
// ever importing base/BasePublicationTransactionPlanner.js directly. The
// caller still supplies the `rpcSource` itself — this use case wires the
// domain class, never the network capability behind it.
export class CreateBasePublicationTransactionPlannerUseCase {
    execute({ rpcSource } = {}) {
        const basePublicationTransactionPlanner = new BasePublicationTransactionPlanner({ rpcSource });

        return { basePublicationTransactionPlanner };
    }
}
