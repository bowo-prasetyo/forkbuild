import { BaseTransactionInclusionObserver } from '../base/BaseTransactionInclusionObserver.js';

// 0.8.96 — Explicit Base Transaction Inclusion & Confirmation Observation.
//
// The identical composition-root shape `application/
// CreateBaseTransactionBroadcasterUseCase.js` (0.8.95) already established,
// so a caller can obtain a real `BaseTransactionInclusionObserver` without
// ever importing `base/BaseTransactionInclusionObserver.js` directly.
// `rpcSource` is taken as a parameter, never constructed here — the SAME,
// already-shared `base/BaseJsonRpcClient.js` instance a composition root
// (`ui/main.js`, or a test) already reads chain/account/plan/broadcast
// facts through, never a second, disconnected one.
export class CreateBaseTransactionInclusionObserverUseCase {
    execute({ rpcSource } = {}) {
        const baseTransactionInclusionObserver = new BaseTransactionInclusionObserver({ rpcSource });

        return { baseTransactionInclusionObserver };
    }
}
