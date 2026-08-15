import { Delegation } from '../core/Delegation.js';

export class CreateDelegationUseCase {
    constructor(delegationResolver) {
        this._resolver = delegationResolver;
    }

    async execute({ issuerIdentity, delegateIdentity, action, subject, constraints = null, expiresAt = null }) {
        const delegation = new Delegation({
            issuerIdentity,
            delegateIdentity,
            action,
            subject,
            constraints,
            expiresAt
        });
        
        const payload = delegation.getCanonicalPayload();
        const signature = await issuerIdentity.sign(payload);
        delegation._signature = signature;
        
        await this._resolver.save(delegation);
        return delegation;
    }
}
