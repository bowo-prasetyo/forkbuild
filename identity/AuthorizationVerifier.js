// Base class every authorization verifier extends. Answers the three
// trust questions for a signed object:
//
//   1. Is it cryptographically authentic?  (signature verifies)
//   2. Is the signer known?                (identity resolves)
//   3. Is the signer authorized?           (policy rule for the type)
//
// The 0.2.16 rules are deliberately simple and live in
// LocalAuthorizationVerifier:
//
//   Publication    -> the publisher must sign
//   Placement      -> the placement owner must sign
//   Index root     -> the builder signs; optional configured authority
//
// This is the seam where 0.2.17 (delegation) and later DAO/policy
// authorization plug in without touching the objects or the pipeline.
import { DelegationVerifier } from './DelegationVerifier.js';

export class AuthorizationVerifier extends DelegationVerifier {
    // Each returns { valid, signed, reason }:
    //   valid  — the object may be trusted
    //   signed — false for legacy unsigned objects (tolerated in 0.2.16)
    //   reason — human-readable explanation when not valid
    verifyPublication(publication) {
        throw new Error('AuthorizationVerifier.verifyPublication() must be implemented by a subclass');
    }

    verifyPlacement(record) {
        throw new Error('AuthorizationVerifier.verifyPlacement() must be implemented by a subclass');
    }

    verifyIndexRoot(root) {
        throw new Error('AuthorizationVerifier.verifyIndexRoot() must be implemented by a subclass');
    }
}
