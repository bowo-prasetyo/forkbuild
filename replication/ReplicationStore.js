// Base abstraction for exchanging immutable objects between replicas.
// Replication never mutates authoritative objects.
export class ReplicationStore {
    getReferences(scope) { throw new Error('ReplicationStore.getReferences() not implemented'); }
    get(reference) { throw new Error('ReplicationStore.get() not implemented'); }
    put(object) { throw new Error('ReplicationStore.put() not implemented'); }
    has(reference) { throw new Error('ReplicationStore.has() not implemented'); }
}
