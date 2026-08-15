import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// Wires the 0.2.16 trust surface in one call. The provider itself comes
// from CreateIdentityProviderUseCase — the single source of truth for
// provider construction; this use case adds the authorization verifier
// so callers receive the complete identity + verification pair without
// importing identity/ directly.
//
// options.indexAuthorityIdentity — optional SigningIdentity pinning
// which authority's spatial-index root signatures are accepted.
export class CreateIdentityProviderUseCase {
    execute(options = {}) {
        return {
            identityProvider: new LocalIdentityProvider(),
            authorizationVerifier: new LocalAuthorizationVerifier(options)
        };
    }
}
