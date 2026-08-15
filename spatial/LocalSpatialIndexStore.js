import { SpatialIndexStore } from './SpatialIndexStore.js';
import { ContentReference } from '../core/ContentReference.js';
import { computeContentHash } from '../serializer/contentHash.js';

const INDEX_CONTENT_KEY_PREFIX = 'spatial-index-content:';
const ROOT_POINTER_KEY = 'spatial-index-root';

// The V0.1 concrete spatial index store: content-addressed JSON under
// 'spatial-index-content:{hash}' via an injected StorageProvider,
// plus the one mutable root pointer at 'spatial-index-root'.
//
// Key namespaces stay strictly separate from everything else:
//   forkbuild:placement:*            WorldPlacement spatial index (0.2.5)
//   forkbuild:placement-record:*     PlacementRegistry records (0.2.10)
//   forkbuild:content:*              publication content (0.2.14)
//   forkbuild:spatial-index-content:*  index manifests/records/root (0.2.15)
//   forkbuild:spatial-index-root       current root pointer (0.2.15)
export class LocalSpatialIndexStore extends SpatialIndexStore {
    constructor(storageProvider) {
        super();
        this._storageProvider = storageProvider;
    }

    put(json) {
        const text = JSON.stringify(json);
        const hash = computeContentHash(text);
        const reference = new ContentReference({
            hash,
            algorithm: 'fnv1a-32',
            mediaType: 'application/json',
            size: text.length,
            storage: 'spatial-index-local'
        });
        // Content-addressed: storing the same content twice is a
        // no-op. This is what makes index rebuilds idempotent.
        if (this._storageProvider.load(INDEX_CONTENT_KEY_PREFIX + hash) === null) {
            this._storageProvider.save(INDEX_CONTENT_KEY_PREFIX + hash, json);
        }
        return reference;
    }

    get(reference) {
        const hash = this._hashOf(reference);
        if (!hash) {
            return null;
        }
        return this._storageProvider.load(INDEX_CONTENT_KEY_PREFIX + hash);
    }

    has(reference) {
        return this.get(reference) !== null;
    }

    setRootReference(reference) {
        if (reference === null) {
            this._storageProvider.remove(ROOT_POINTER_KEY);
            return;
        }
        const json = typeof reference.toJSON === 'function' ? reference.toJSON() : reference;
        this._storageProvider.save(ROOT_POINTER_KEY, json);
    }

    getRootReference() {
        const json = this._storageProvider.load(ROOT_POINTER_KEY);
        return json ? ContentReference.fromJSON(json) : null;
    }

    _hashOf(reference) {
        if (!reference) {
            return null;
        }
        if (typeof reference === 'string') {
            return reference;
        }
        return reference.hash || null;
    }
}
