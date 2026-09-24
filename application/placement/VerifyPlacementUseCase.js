// The explicit entry point for placement trust checks: "Is this
// placement revision authentic, and did its owner authorize it?"
export class VerifyPlacementUseCase {
    constructor(authorizationVerifier) {
        this._authorizationVerifier = authorizationVerifier;
    }

    // Returns { valid, signed, reason }.
    execute(record) {
        return this._authorizationVerifier.verifyPlacement(record);
    }
}
