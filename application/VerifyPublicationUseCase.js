// The explicit entry point for publication trust checks: "Is this
// publication cryptographically authentic, and did its publisher sign
// it?" Thin over the AuthorizationVerifier so ui/ and other use cases
// never import identity/ directly.
export class VerifyPublicationUseCase {
    constructor(authorizationVerifier) {
        this._authorizationVerifier = authorizationVerifier;
    }

    // Returns { valid, signed, reason }.
    execute(publication) {
        return this._authorizationVerifier.verifyPublication(publication);
    }
}
