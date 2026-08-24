import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { ExternalAnchorVerifier } from './ExternalAnchorVerifier.js';

// 0.8.0 — Decentralized Publication Anchoring & External Evidence.
//
// Wires the concrete authorization verifier and returns an
// ExternalAnchorVerifier, so ui/ never imports identity/
// LocalAuthorizationVerifier.js directly — the same composition-root
// shape application/CreatePublicationResolverUseCase.js already
// established. No anchor storage or transport is wired here — 0.8.0
// ships no concrete place an anchor is kept or exchanged (see
// docs/Roadmap.md); this use case only ever answers "given an anchor
// record I already have, can I verify it?"
export class CreateExternalAnchorVerifierUseCase {
    execute() {
        const verifier = new LocalAuthorizationVerifier();
        const externalAnchorVerifier = new ExternalAnchorVerifier(verifier);

        return { externalAnchorVerifier, verifier };
    }
}
