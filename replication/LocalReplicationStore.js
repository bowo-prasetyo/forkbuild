import { ReplicationStore } from './ReplicationStore.js';
import { computeContentHash } from '../serializer/contentHash.js';

export class LocalReplicationStore extends ReplicationStore {
    constructor(storageProvider) {
        super();
        this._storage = storageProvider;
    }
    
    _key(hash) { return `replication:${hash}`; }
    
    put(object) {
        const json = JSON.stringify(object.toJSON ? object.toJSON() : object);
        const hash = computeContentHash(json);
        this._storage.save(this._key(hash), json);
        return hash;
    }
    
    get(hash) {
        const json = this._storage.load(this._key(hash));
        if (!json) return null;
        return JSON.parse(json);
    }
    
    has(hash) {
        return this._storage.load(this._key(hash)) !== null;
    }
    
    getReferences(scope) {
        const allKeys = this._storage.list();
        return allKeys.filter(k => k.startsWith('replication:')).map(k => k.replace('replication:', ''));
    }
}
