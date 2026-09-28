import { CONTENT_HASH_ALGORITHM, contentHashAlgorithm, contentHashMatches } from '../serializer/contentHash.js';

// Immutable reference to published content.
//
// The cryptographic hash identifies the content.
// The URI describes one retrieval mechanism.
//
// The same content may have multiple retrieval URIs:
//
//   <sha256 hex>
//       ├── ipfs://CID
//       ├── ar://transaction-id
//       └── https://mirror.example/content/ABC
//
// The hash remains the canonical identity regardless of where the
// content is retrieved from.
export class ContentReference {
    constructor({
        hash,
        algorithm = contentHashAlgorithm(hash) ?? CONTENT_HASH_ALGORITHM,
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

    // Whether `bytes` are this content. Only a SHA-256 hash can vouch for
    // bytes from elsewhere; a legacy FNV-1a hash is honored only when the
    // caller passes `allowLegacy` because the bytes came from this device.
    // Bytes must be valid UTF-8: a lenient decode would give different
    // bytes the same text, and so the same hash.
    verify(bytes, { allowLegacy = false } = {}) {
        let text = bytes;
        if (typeof bytes !== 'string') {
            try {
                text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
            } catch {
                return false;
            }
        }
        return contentHashMatches(text, this._hash, { allowLegacy });
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
