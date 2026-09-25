import { ContentStore } from './ContentStore.js';
import { ContentReference } from '../core/ContentReference.js';
import { computeContentHash } from '../serializer/contentHash.js';

const CONTENT_KEY_PREFIX = 'content:';

export class LocalContentStore extends ContentStore {
    constructor(storageProvider) {
        super();
        this._storageProvider = storageProvider;
    }

    // 0.8.18 — matches the `storage: 'local'` this class's own put()
    // already stamps onto every ContentReference it returns.
    get storage() { return 'local'; }

    put(bytes) {
        const text = typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes);
        const hash = computeContentHash(text);
        const reference = new ContentReference({
            hash,
            algorithm: 'fnv1a-32',
            mediaType: 'application/json',
            size: text.length,
            storage: 'local'
        });
        this._storageProvider.save(CONTENT_KEY_PREFIX + hash, text);
        return reference;
    }

    // Resolves to the stored text, or null. Content can be large and, over
    // IndexedDB, stays on disk until read (storage/IndexedDbStorageBackend.js),
    // so reading it is asynchronous, as for every other ContentStore.
    async get(reference) {
        if (!this.has(reference)) return null;
        const key = CONTENT_KEY_PREFIX + reference.hash;
        return typeof this._storageProvider.loadAsync === 'function'
            ? this._storageProvider.loadAsync(key)
            : this._storageProvider.load(key);
    }

    // The stored text, or null, for a caller that cannot wait (World View
    // streaming). Throws StorageEntryNotLoadedError when the content is on
    // disk and not in memory; its `ready` resolves once it is.
    getSync(reference) {
        if (!this.has(reference)) return null;
        return this._storageProvider.load(CONTENT_KEY_PREFIX + reference.hash);
    }

    // Whether the content is stored, without reading it.
    has(reference) {
        const key = CONTENT_KEY_PREFIX + reference.hash;
        return typeof this._storageProvider.exists === 'function'
            ? this._storageProvider.exists(key)
            : this._storageProvider.load(key) !== null;
    }
}
