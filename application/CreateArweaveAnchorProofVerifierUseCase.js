import { ArweaveTransactionDataProofVerifier } from '../anchoring/ArweaveTransactionDataProofVerifier.js';

// 0.9.425 — Arweave Proof/Anchoring Provider Implementation.
//
// Mirrors application/CreateBitcoinAnchorProofVerifierUseCase.js's own
// shape exactly — a composition root uses this to get a concrete,
// real-network-backed proofVerifier without ever importing anchoring/
// ArweaveTransactionDataProofVerifier.js directly. The result plugs
// straight into application/CreateExternalAnchorVerifierUseCase.js's own
// `proofVerifiers` option, or directly into application/
// ExternalAnchorVerifier.js#verify()'s `proofVerifier` option for a
// caller that already knows it is about to verify an `arweave` anchor.
export class CreateArweaveAnchorProofVerifierUseCase {
    execute({ gatewayUrl, fetchImpl, timeoutMs, maxResponseBytes } = {}) {
        const arweaveProofVerifier = new ArweaveTransactionDataProofVerifier({
            gatewayUrl, fetchImpl, timeoutMs, maxResponseBytes
        });

        return { arweaveProofVerifier };
    }
}
