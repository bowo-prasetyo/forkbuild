import { BitcoinOpReturnProofVerifier } from '../anchoring/BitcoinOpReturnProofVerifier.js';

// 0.8.1 — External Anchor Proof Adapters & Verification Registry.
//
// The proof of application/CreateExternalAnchorVerifierUseCase.js's own
// 0.8.0 promise: "a real proofVerifier plugs in later without changing
// this pipeline." Mirrors application/
// CreateIpfsPublicationResolverUseCase.js's own shape, for the identical
// reason — a composition root ui/ or tests/ uses to get a concrete,
// real-network-backed proofVerifier without ever importing anchoring/
// BitcoinOpReturnProofVerifier.js directly. The result plugs straight
// into application/CreateExternalAnchorVerifierUseCase.js's own
// `proofVerifiers` option, or directly into application/
// ExternalAnchorVerifier.js#verify()'s `proofVerifier` option for a
// caller that already knows it is about to verify a `bitcoin-op-return`
// anchor.
export class CreateBitcoinAnchorProofVerifierUseCase {
    execute({ apiUrl, network, fetchImpl, timeoutMs, minConfirmations } = {}) {
        const bitcoinProofVerifier = new BitcoinOpReturnProofVerifier({
            apiUrl, network, fetchImpl, timeoutMs, minConfirmations
        });

        return { bitcoinProofVerifier };
    }
}
