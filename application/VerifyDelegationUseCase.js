import { Delegation } from '../core/Delegation.js';

export class VerifyDelegationUseCase {
    constructor(delegationResolver) {
        this._resolver = delegationResolver;
    }

    async execute(delegationId, currentDate = new Date()) {
        let delegation = await this._resolver.get(delegationId);
        if (!delegation) return { valid: false, reason: 'NOT_FOUND' };
        
        // FIX: Reconstruct Delegation instance if the resolver returned plain JSON
        if (!(delegation instanceof Delegation)) {
            delegation = Delegation.fromJSON(delegation);
        }

        const payload = delegation.getCanonicalPayload();
        const sigValid = await delegation.issuerIdentity.verify(payload, delegation.signature);
        if (!sigValid) return { valid: false, reason: 'INVALID_SIGNATURE' };
        if (delegation.expiresAt && delegation.expiresAt < currentDate) {
            return { valid: false, reason: 'EXPIRED' };
        }
        return { valid: true, delegation };
    }
}
