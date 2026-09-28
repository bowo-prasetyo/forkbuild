import { Delegation } from '../../core/Delegation.js';
import { LocalAuthorizationVerifier } from '../../identity/LocalAuthorizationVerifier.js';

// Checks a stored Delegation's issuer signature and expiry.
export class VerifyDelegationUseCase {
    constructor(delegationResolver, verifier = new LocalAuthorizationVerifier()) {
        this._resolver = delegationResolver;
        this._verifier = verifier;
    }

    async execute(delegationId, currentDate = new Date()) {
        let delegation = await this._resolver.get(delegationId);
        if (!delegation) return { valid: false, reason: 'NOT_FOUND' };

        if (!(delegation instanceof Delegation)) {
            delegation = Delegation.fromJSON(delegation);
        }

        if (!this._verifier.verifyDelegation(delegation).valid) {
            return { valid: false, reason: 'INVALID_SIGNATURE' };
        }
        if (delegation.expiresAt && delegation.expiresAt < currentDate) {
            return { valid: false, reason: 'EXPIRED' };
        }
        return { valid: true, delegation };
    }
}
