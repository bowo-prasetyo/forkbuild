import { BaseWalletConnection } from '../base/BaseWalletConnection.js';

// 0.8.90 — Explicit Base Network & Account Observation.
//
// Mirrors application/CreateBitcoinWalletConnectionUseCase.js's own shape
// exactly (0.8.58), one chain over — a composition root ui/ or tests/ uses
// to get a concrete BaseWalletConnection without ever importing base/
// BaseWalletConnection.js directly. The caller still supplies the
// `provider` itself — this use case wires the connection, never the
// browser-extension capability behind it.
export class CreateBaseWalletConnectionUseCase {
    execute({ provider } = {}) {
        const baseWalletConnection = new BaseWalletConnection({ provider });

        return { baseWalletConnection };
    }
}
