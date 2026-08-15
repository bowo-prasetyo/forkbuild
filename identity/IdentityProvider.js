// Base class every identity provider extends. login()/logout()/
// currentUser()/sign(data) — the 0.1.21 login surface, unchanged.
//
// New in 0.2.16 — the cryptographic signing surface:
//
//   getSigningIdentity()  -> "Which key represents me?"
//   signCanonical(descriptor) -> "Authorize this canonical object."
//
// Providers that do not implement the crypto surface simply don't —
// every flow falls back to the legacy attribution stamp, so
// pre-0.2.16 providers and test stubs keep working untouched.
export class IdentityProvider {
    login(credentials) {
        throw new Error('IdentityProvider.login() must be implemented by a subclass');
    }

    logout() {
        throw new Error('IdentityProvider.logout() must be implemented by a subclass');
    }

    currentUser() {
        throw new Error('IdentityProvider.currentUser() must be implemented by a subclass');
    }

    // Legacy attribution stamp (0.1.21). NOT a cryptographic proof.
    sign(data) {
        throw new Error('IdentityProvider.sign() must be implemented by a subclass');
    }

    // --- 0.2.16: cryptographic signing surface ---------------------
    getSigningIdentity() {
        throw new Error('IdentityProvider.getSigningIdentity() must be implemented by a subclass');
    }

    // descriptor: { type, id, revision, payload } — the object's own
    // canonical signing descriptor. Returns a core/Signature.
    signCanonical(descriptor) {
        throw new Error('IdentityProvider.signCanonical() must be implemented by a subclass');
    }
}
