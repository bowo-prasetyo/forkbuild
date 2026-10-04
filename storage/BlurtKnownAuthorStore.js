import { StorageProvider } from './StorageProvider.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';

// The Blurt accounts this device has seen a ForkBuild build post from
// (docs/Protocol.md, "Proposed: Blurt Substrate", "Reading"), most recently
// seen first, so their post histories keep being read after their posts
// leave the tag listing. Only names are kept, at most `limit`.

const BLURT_KNOWN_AUTHORS_KEY = 'blurt-known-authors';
export const DEFAULT_BLURT_KNOWN_AUTHOR_LIMIT = 200;

export class BlurtKnownAuthorStore {
    constructor(storageProvider = new LocalStorageProvider(), { limit = DEFAULT_BLURT_KNOWN_AUTHOR_LIMIT } = {}) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('BlurtKnownAuthorStore requires a StorageProvider');
        }
        this._storageProvider = storageProvider;
        this._limit = limit;
    }

    list() {
        const raw = this._storageProvider.load(BLURT_KNOWN_AUTHORS_KEY);
        return Array.isArray(raw) ? raw.filter((name) => typeof name === 'string').slice(0, this._limit) : [];
    }

    // Moves `authors` to the front, in the order given.
    remember(authors) {
        const seen = [...new Set(authors.filter((name) => typeof name === 'string'))];
        if (seen.length === 0) return;
        const next = [...seen, ...this.list().filter((name) => !seen.includes(name))].slice(0, this._limit);
        this._storageProvider.save(BLURT_KNOWN_AUTHORS_KEY, next);
    }
}
