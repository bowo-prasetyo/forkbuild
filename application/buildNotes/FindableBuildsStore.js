// The Publications this device knows are on the public Nostr relays as build
// notes (core/publication/BuildNote.js): its own, once a relay took the note, and others'
// it opened from one. Only these are offered a short link (/n/<publication
// id>, core/app/ForkBuildAppLinks.js), since a short link names a note instead of
// carrying the build. Personal and local: never published or shared.
import { StorageProvider } from '../../storage/StorageProvider.js';

const STORAGE_KEY = 'findable-builds';

// The most ids kept; the oldest are forgotten first. A forgotten build is
// still shared, by its long link.
export const MAX_FINDABLE_BUILDS = 1000;

export class FindableBuildsStore {
    constructor({ storageProvider, maxEntries = MAX_FINDABLE_BUILDS }) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('FindableBuildsStore requires a StorageProvider');
        }
        this._storage = storageProvider;
        this._maxEntries = maxEntries;
        this._listeners = new Set();
    }

    has(publicationId) {
        return typeof publicationId === 'string' && this._ids().includes(publicationId);
    }

    // Notes `publicationId` as on the relays; listeners hear of it only when
    // it is new. Never throws.
    add(publicationId) {
        if (typeof publicationId !== 'string' || !publicationId) return false;
        const ids = this._ids();
        if (ids.includes(publicationId)) return false;
        try {
            this._storage.save(STORAGE_KEY, { ids: [...ids, publicationId].slice(-this._maxEntries) });
        } catch {
            return false;
        }
        for (const listener of [...this._listeners]) {
            try {
                listener(publicationId);
            } catch {
                // One listener never stops another.
            }
        }
        return true;
    }

    // `listener(publicationId)` for each id newly added; returns an unsubscribe.
    subscribe(listener) {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    _ids() {
        try {
            const ids = this._storage.load(STORAGE_KEY)?.ids;
            return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string' && id) : [];
        } catch {
            return [];
        }
    }
}
