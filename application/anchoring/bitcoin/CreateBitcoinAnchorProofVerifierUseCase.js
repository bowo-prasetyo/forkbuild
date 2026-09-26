import { BitcoinOpReturnProofVerifier } from '../../../anchoring/BitcoinOpReturnProofVerifier.js';
import { BitcoinOpReturnProofVerifierFailover } from '../../../anchoring/BitcoinEsploraFailover.js';

// 0.8.1 — External Anchor Proof Adapters & Verification Registry.
//
// The proof of application/anchoring/CreateExternalAnchorVerifierUseCase.js's own
// 0.8.0 promise: "a real proofVerifier plugs in later without changing
// this pipeline." Mirrors application/
// CreateIpfsPublicationResolverUseCase.js's own shape, for the identical
// reason — a composition root ui/ or tests/ uses to get a concrete,
// real-network-backed proofVerifier without ever importing anchoring/
// BitcoinOpReturnProofVerifier.js directly. The result plugs straight
// into application/anchoring/CreateExternalAnchorVerifierUseCase.js's own
// `proofVerifiers` option, or directly into application/
// ExternalAnchorVerifier.js#verify()'s `proofVerifier` option for a
// caller that already knows it is about to verify a `bitcoin-op-return`
// anchor.
export class CreateBitcoinAnchorProofVerifierUseCase {
    // `apiUrls` (two or more endpoints, in order) builds the failover
    // wrapper from anchoring/BitcoinEsploraFailover.js; otherwise one
    // adapter on `apiUrl` (or `apiUrls`' only entry).
    execute({ apiUrl, apiUrls, network, fetchImpl, timeoutMs, minConfirmations } = {}) {
        const bitcoinProofVerifier = Array.isArray(apiUrls) && apiUrls.length > 1
            ? new BitcoinOpReturnProofVerifierFailover({ apiUrls, network, fetchImpl, timeoutMs, minConfirmations })
            : new BitcoinOpReturnProofVerifier({ apiUrl: Array.isArray(apiUrls) && apiUrls.length === 1 ? apiUrls[0] : apiUrl, network, fetchImpl, timeoutMs, minConfirmations });

        return { bitcoinProofVerifier };
    }
}
