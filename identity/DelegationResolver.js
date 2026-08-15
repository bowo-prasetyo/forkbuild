export class DelegationResolver {
    async get(delegationId) { throw new Error('DelegationResolver.get() not implemented'); }
    async save(delegation) { throw new Error('DelegationResolver.save() not implemented'); }
    async findFor(subject, action, issuer, delegate) { throw new Error('DelegationResolver.findFor() not implemented'); }
}
