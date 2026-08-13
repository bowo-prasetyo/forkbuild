import { computeContentHash } from '../serializer/contentHash.js';

// Immutable reference to published content.
//
// The cryptographic hash identifies the content.
// The URI describes one retrieval mechanism.
//
// The same content may have multiple retrieval URIs:
//
//   sha256:ABC
//       ├── ipfs://CID
//       ├── ar://transaction-id
//       └── https://mirror.example/content/ABC
//
// The hash remains the canonical identity regardless of where the
// content is retrieved from.
export class ContentReference {
    constructor({
        hash,
        algorithm = 'fnv1a-32', // Placeholder for sha256 until async crypto is wired
        mediaType = 'application/json',
        size = null,
        uri = null,
        storage = null
    } = {}) {
        this._hash = hash;
        this._algorithm = algorithm;
        this._mediaType = mediaType;
        this._size = size;
        this._uri = uri;
        this._storage = storage;
    }

    get hash() { return this._hash; }
    get algorithm() { return this._algorithm; }
    get mediaType() { return this._mediaType; }
    get size() { return this._size; }
    get uri() { return this._uri; }
    get storage() { return this._storage; }

    verify(bytes) {
        const text = typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes);
        const actualHash = computeContentHash(text);
        return actualHash === this._hash;
    }

    toJSON() {
        return {
            hash: this._hash,
            algorithm: this._algorithm,
            mediaType: this._mediaType,
            size: this._size,
            uri: this._uri,
            storage: this._storage
        };
    }

    static fromJSON(json) {
        if (!json) return null;
        return new ContentReference(json);
    }
}
