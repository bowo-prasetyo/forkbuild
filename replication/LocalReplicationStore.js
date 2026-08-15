import { ReplicationStore } from './ReplicationStore.js';
import { computeContentHash } from '../serializer/contentHash.js';

// The V0.1 concrete replication store: a content-addressed blob store
// backed by an injected StorageProvider, namespaced by object scope so
// unrelated immutable object types (placement revisions today;
// publications and index roots are the same shape of future work)
// never collide in the same key space:
//
//   replication:placement-revision:<hash>
//   replication:publication:<hash>
//   replication:index-root:<hash>
//
// Deliberately dumb: put()/get()/has()/getReferences() move bytes and
// answer "do I have this?" — they never interpret, verify, or merge
// anything. That is ReplicaMergeService's job (see
// docs/Principles.md, "Replication and Conflict Handling (0.2.18)").
export class LocalReplicationStore extends ReplicationStore {
    static DEFAULT_SCOPE = 'placement-revision';

    constructor(storageProvider) {
        super();
        this._storage = storageProvider;
    }

    _prefix(scope) {
        return `replication:${scope || LocalReplicationStore.DEFAULT_SCOPE}:`;
    }

    _key(hash, scope) {
        return this._prefix(scope) + hash;
    }

    // The address IS the object's own declared contentHash when it has
    // one (every PlacementRecord that reaches here does — merge()
    // requires integrity to pass first) — this is what lets a
    // RevisionReference (core/RevisionReference.js) built from
    // record.contentHash resolve directly through get()/has(), instead
    // of the store inventing a second, unrelated hash of its own.
    // Objects with no contentHash of their own fall back to a hash of
    // their full serialization.
    put(object, scope = LocalReplicationStore.DEFAULT_SCOPE) {
        const json = object && typeof object.toJSON === 'function' ? object.toJSON() : object;
        const hash = json.contentHash || computeContentHash(JSON.stringify(json));
        this._storage.save(this._key(hash, scope), json);
        return hash;
    }

    get(hash, scope = LocalReplicationStore.DEFAULT_SCOPE) {
        return this._storage.load(this._key(hash, scope));
    }

    has(hash, scope = LocalReplicationStore.DEFAULT_SCOPE) {
        return this._storage.load(this._key(hash, scope)) !== null;
    }

    getReferences(scope = LocalReplicationStore.DEFAULT_SCOPE) {
        const prefix = this._prefix(scope);
        return this._storage.list()
            .filter((k) => k.startsWith(prefix))
            .map((k) => k.slice(prefix.length));
    }
}
