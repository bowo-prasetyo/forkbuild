import { BaseJsonRpcClient } from '../base/BaseJsonRpcClient.js';
import { BaseProofVerifier } from '../anchoring/BaseProofVerifier.js';

// 0.9.463 — Base Transaction Proof Verifier.
//
// Mirrors application/CreateBitcoinAnchorProofVerifierUseCase.js's and
// application/CreateArweaveAnchorProofVerifierUseCase.js's own shape
// exactly — a composition root uses this to get a concrete, real-network-
// backed proofVerifier without ever importing anchoring/BaseProofVerifier.js
// or base/BaseJsonRpcClient.js directly. The result plugs straight into
// application/CreateExternalAnchorVerifierUseCase.js's own
// `proofVerifiers` option, or directly into application/
// ExternalAnchorVerifier.js#verify()'s `proofVerifier` option for a caller
// that already knows it is about to verify a `base` anchor.
//
// THE ONE GENUINE DIFFERENCE FROM ITS TWO SIBLINGS: Bitcoin's and
// Arweave's own use cases each construct their verifier directly against
// a raw `fetchImpl`, because each of their own verifiers talks straight
// to an HTTP API. `BaseProofVerifier` instead takes a structured
// `rpcSource` — so this use case constructs a `BaseJsonRpcClient` first
// (the identical construction application/
// CreateBaseJsonRpcClientUseCase.js already performs), then hands it to
// `BaseProofVerifier` as that `rpcSource`. Nothing about the composition-
// root shape itself changes: still one use case, still zero wiring
// exposed to whatever calls `execute()`.
export class CreateBaseAnchorProofVerifierUseCase {
    execute({ rpcUrl, fetchImpl, timeoutMs, network } = {}) {
        const baseJsonRpcClient = new BaseJsonRpcClient({
            ...(rpcUrl !== undefined ? { rpcUrl } : {}),
            ...(fetchImpl !== undefined ? { fetchImpl } : {}),
            ...(timeoutMs !== undefined ? { timeoutMs } : {})
        });
        const baseProofVerifier = new BaseProofVerifier({
            rpcSource: baseJsonRpcClient,
            ...(network !== undefined ? { network } : {})
        });

        return { baseProofVerifier };
    }
}
