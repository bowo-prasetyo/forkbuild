import { BaseTransactionBroadcastCoordinator } from './BaseTransactionBroadcastCoordinator.js';

// 0.8.95 — Explicit Base Transaction Broadcast.
//
// The identical composition-root shape `application/
// CreateBaseSignedTransactionFinalizationCoordinatorUseCase.js` (0.8.94)
// already established, so a caller can obtain a real
// `BaseTransactionBroadcastCoordinator` without ever importing
// `application/BaseTransactionBroadcastCoordinator.js` directly.
// `baseTransactionBroadcaster` is taken as a parameter, never constructed
// here — the SAME, already-existing broadcaster instance a composition
// root (`ui/main.js`, or a test) already built once via `application/
// CreateBaseTransactionBroadcasterUseCase.js`.
export class CreateBaseTransactionBroadcastCoordinatorUseCase {
    execute({ baseTransactionBroadcaster } = {}) {
        const coordinator = new BaseTransactionBroadcastCoordinator({ baseTransactionBroadcaster });
        return { coordinator };
    }
}
