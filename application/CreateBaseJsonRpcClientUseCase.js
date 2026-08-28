import { BaseJsonRpcClient } from '../base/BaseJsonRpcClient.js';

// 0.8.90 — Explicit Base Network & Account Observation.
//
// Mirrors application/CreateBitcoinEsploraWalletFundingSourceUseCase.js's
// own shape exactly (0.8.60), one chain over — a composition root ui/ or
// tests/ uses to get a concrete BaseJsonRpcClient without ever importing
// base/BaseJsonRpcClient.js directly. `rpcUrl`/`fetchImpl` are left
// entirely to the caller; omitting both gets Base's own public mainnet
// endpoint and the ambient `fetch`, exactly as base/BaseJsonRpcClient.js's
// own header documents.
export class CreateBaseJsonRpcClientUseCase {
    execute({ rpcUrl, fetchImpl } = {}) {
        const baseJsonRpcClient = new BaseJsonRpcClient({
            ...(rpcUrl !== undefined ? { rpcUrl } : {}),
            ...(fetchImpl !== undefined ? { fetchImpl } : {})
        });

        return { baseJsonRpcClient };
    }
}
