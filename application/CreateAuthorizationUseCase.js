import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// Wires the concrete authorization backend. 
//
// Swapping to a multi-sig, DAO-based, or Smart Contract verifier in 0.2.17+ 
// means changing exactly this one file — the use cases and UI stay untouched.
export class CreateAuthorizationUseCase {
    execute(identityProvider, options = {}) {
        return new LocalAuthorizationVerifier(identityProvider, options);
    }
}
