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

        // 0.2.19: delegation chains (a delegate re-delegating under the
        // authority of a delegation THEY hold, rather than direct
        // ownership) are explicitly unsupported. Without this check, a
        // delegation issued by a non-owner would simply fail
        // DELEGATION_ISSUER_MISMATCH below and read like a plain
        // authorization failure — this reports the actual shape of
        // what was attempted instead, rather than silently
        // misclassifying (or, worse, a future change to this method
        // accidentally treating it as valid). Full chaining is
        // deliberately deferred, not partially/accidentally implemented.
        if (delegation.parentDelegationId) {
            return { authorized: false, reason: 'UNSUPPORTED_DELEGATION_CHAIN' };
        }

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
