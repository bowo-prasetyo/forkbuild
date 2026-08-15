export class DelegationVerifier {
    async verify({
        signerIdentity,
        ownerIdentity,
        requiredAction,
        subject,
        signature,
        payload,
        delegationId,
        delegationResolver,
        constraintsContext = null,
        currentDate = new Date()
    }) {
        // 1. Verify the signature on the payload
        const sigValid = await signerIdentity.verify(payload, signature);
        if (!sigValid) return { authorized: false, reason: 'INVALID_SIGNATURE' };

        // 2. Direct Ownership Path
        if (signerIdentity.id === ownerIdentity.id && !delegationId) {
            return { authorized: true, mode: 'DIRECT' };
        }

        // 3. Delegated Path
        if (!delegationId) {
            return { authorized: false, reason: 'MISSING_DELEGATION' };
        }

        const delegation = await delegationResolver.get(delegationId);
        if (!delegation) return { authorized: false, reason: 'DELEGATION_NOT_FOUND' };

        const delSigValid = await delegation.issuerIdentity.verify(delegation.getCanonicalPayload(), delegation.signature);
        if (!delSigValid) return { authorized: false, reason: 'INVALID_DELEGATION_SIGNATURE' };

        if (delegation.expiresAt && delegation.expiresAt < currentDate) {
            return { authorized: false, reason: 'DELEGATION_EXPIRED' };
        }

        if (delegation.issuerIdentity.id !== ownerIdentity.id) {
            return { authorized: false, reason: 'DELEGATION_ISSUER_MISMATCH' };
        }

        if (delegation.delegateIdentity.id !== signerIdentity.id) {
            return { authorized: false, reason: 'DELEGATION_DELEGATE_MISMATCH' };
        }

        if (delegation.action !== requiredAction) {
            return { authorized: false, reason: 'DELEGATION_ACTION_MISMATCH' };
        }

        if (delegation.subject.type !== subject.type || delegation.subject.id !== subject.id) {
            return { authorized: false, reason: 'DELEGATION_SUBJECT_MISMATCH' };
        }

        // 4. Constraint Evaluation (Spatial)
        if (delegation.constraints && delegation.constraints.region && constraintsContext && constraintsContext.position) {
            const r = delegation.constraints.region;
            const p = constraintsContext.position;
            if (p.x < r.min.x || p.x > r.max.x ||
                p.y < r.min.y || p.y > r.max.y ||
                p.z < r.min.z || p.z > r.max.z) {
                return { authorized: false, reason: 'DELEGATION_CONSTRAINT_VIOLATION' };
            }
        }

        return { authorized: true, mode: 'DELEGATED', delegationId: delegation.id };
    }
}
