import { ContentStore } from './ContentStore.js';
import { ContentReference } from '../core/ContentReference.js';
import { computeContentHash } from '../serializer/contentHash.js';

const CONTENT_KEY_PREFIX = 'content:';

export class LocalContentStore extends ContentStore {
    constructor(storageProvider) {
        super();
        this._storageProvider = storageProvider;
    }

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

    get(reference) {
        if (!this.has(reference)) return null;
        return this._storageProvider.load(CONTENT_KEY_PREFIX + reference.hash);
    }

    has(reference) {
        return this._storageProvider.load(CONTENT_KEY_PREFIX + reference.hash) !== null;
    }
}
