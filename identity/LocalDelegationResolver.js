import { DelegationResolver } from './DelegationResolver.js';
import { Delegation } from '../core/Delegation.js';

const DELEGATIONS_KEY = 'forkbuild-delegations';

export class LocalDelegationResolver extends DelegationResolver {
    constructor(storageProvider) {
        super();
        this._storageProvider = storageProvider;
    }

    async save(delegation) {
        const records = this._loadRecords();
        records.push(delegation.toJSON());
        this._storageProvider.save(DELEGATIONS_KEY, records);
    }

    async get(delegationId) {
        const records = this._loadRecords();
        const record = records.find(r => r.id === delegationId);
        return record ? Delegation.fromJSON(record) : null;
    }

    async findFor(subject, action, issuer, delegate) {
        const records = this._loadRecords();
        return records
            .filter(r => 
                r.subject.type === subject.type && 
                r.subject.id === subject.id &&
                r.action === action &&
                r.issuerIdentity.id === issuer &&
                r.delegateIdentity.id === delegate
            )
            .map(Delegation.fromJSON);
    }

    _loadRecords() {
        return this._storageProvider.load(DELEGATIONS_KEY) || [];
    }
}
