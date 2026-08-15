export class VerifyDelegationUseCase {
    constructor(delegationResolver) {
        this._resolver = delegationResolver;
    }

    async execute(delegationId, currentDate = new Date()) {
        const delegation = await this._resolver.get(delegationId);
        if (!delegation) return { valid: false, reason: 'NOT_FOUND' };

        const payload = delegation.getCanonicalPayload();
        const sigValid = await delegation.issuerIdentity.verify(payload, delegation.signature);
        if (!sigValid) return { valid: false, reason: 'INVALID_SIGNATURE' };

        if (delegation.expiresAt && delegation.expiresAt < currentDate) {
            return { valid: false, reason: 'EXPIRED' };
        }

        return { valid: true, delegation };
    }
}
