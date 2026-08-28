import { BaseNetworkObserver } from '../base/BaseNetworkObserver.js';

// 0.8.90 — Explicit Base Network & Account Observation.
//
// Mirrors application/CreateBitcoinWalletFundingObserverUseCase.js's own
// shape exactly (0.8.60), one chain over — a composition root ui/ or
// tests/ uses to get a concrete BaseNetworkObserver without ever importing
// base/BaseNetworkObserver.js directly. The caller still supplies the
// `rpcSource` itself — this use case wires the domain class, never the
// network capability behind it.
export class CreateBaseNetworkObserverUseCase {
    execute({ rpcSource } = {}) {
        const baseNetworkObserver = new BaseNetworkObserver({ rpcSource });

        return { baseNetworkObserver };
    }
}
