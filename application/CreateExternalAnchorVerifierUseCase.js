import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { ExternalAnchorVerifier } from './ExternalAnchorVerifier.js';
import { ExternalProofVerifierRegistry } from './ExternalProofVerifierRegistry.js';

// 0.8.0 — Decentralized Publication Anchoring & External Evidence.
// 0.8.1 — External Anchor Proof Adapters & Verification Registry.
//
// Wires the concrete authorization verifier and returns an
// ExternalAnchorVerifier, so ui/ never imports identity/
// LocalAuthorizationVerifier.js directly — the same composition-root
// shape application/CreatePublicationResolverUseCase.js already
// established. No anchor storage or transport is wired here — this use
// case only ever answers "given an anchor record I already have, can I
// verify it?"
//
// `proofVerifiers` (0.8.1) is where a caller plugs in whichever real
// backends it wants checked automatically — e.g. `new
// CreateBitcoinAnchorProofVerifierUseCase().execute().bitcoinProofVerifier`
// — without this use case ever importing anchoring/
// BitcoinOpReturnProofVerifier.js or any other concrete adapter itself.
// Passing none still returns a perfectly usable, empty
// ExternalProofVerifierRegistry: every anchorType simply falls through
// to AnchorVerificationOutcome.VALID_PROOF_UNVERIFIED, exactly 0.8.0's
// own behavior before this milestone existed.
export class CreateExternalAnchorVerifierUseCase {
    execute({ proofVerifiers = [] } = {}) {
        const verifier = new LocalAuthorizationVerifier();
        const externalAnchorVerifier = new ExternalAnchorVerifier(verifier);
        const proofVerifierRegistry = new ExternalProofVerifierRegistry();
        for (const proofVerifier of proofVerifiers) {
            proofVerifierRegistry.register(proofVerifier);
        }

        return { externalAnchorVerifier, verifier, proofVerifierRegistry };
    }
}
