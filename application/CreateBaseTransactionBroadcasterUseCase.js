import { BaseTransactionBroadcaster } from '../base/BaseTransactionBroadcaster.js';

// 0.8.95 — Explicit Base Transaction Broadcast.
//
// The identical composition-root shape `application/
// CreateBaseNetworkObserverUseCase.js` (0.8.90) already established, so a
// caller can obtain a real `BaseTransactionBroadcaster` without ever
// importing `base/BaseTransactionBroadcaster.js` directly. `rpcSource` is
// taken as a parameter, never constructed here — the SAME, already-shared
// `base/BaseJsonRpcClient.js` instance a composition root (`ui/main.js`,
// or a test) already reads chain/account/plan facts through, never a
// second, disconnected one.
export class CreateBaseTransactionBroadcasterUseCase {
    execute({ rpcSource } = {}) {
        const baseTransactionBroadcaster = new BaseTransactionBroadcaster({ rpcSource });

        return { baseTransactionBroadcaster };
    }
}
