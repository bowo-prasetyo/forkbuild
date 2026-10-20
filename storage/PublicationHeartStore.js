import { StorageProvider } from './StorageProvider.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';
import { PublicationHeart, currentHeartsFor, latestHeartsFor } from '../core/publication/PublicationHeart.js';

// Every heart record this device has made or accepted
// (core/publication/PublicationHeart.js), kept so a person's latest one decides. The
// records are small and every tap makes one, so all are kept: an old one
// arriving again is then known and never counts as new. No cache, so every
// store over the same storage sees the same records.
const HEART_STORE_KEY = 'publication-hearts:entries';

export class PublicationHeartConflictError extends Error {
    constructor(heartId) {
        super(`PublicationHeartStore: heartId ${heartId} already exists with different content — refusing to overwrite it`);
        this.name = 'PublicationHeartConflictError';
        this.heartId = heartId;
    }
}

export class PublicationHeartStore {
    constructor(storageProvider = new LocalStorageProvider()) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('PublicationHeartStore requires a StorageProvider');
        }
        this._storageProvider = storageProvider;
    }

    // True when the record is new here, false when the same record was
    // already kept; a different record under a known heartId is refused.
    save(heart) {
        if (!(heart instanceof PublicationHeart)) {
            throw new Error('PublicationHeartStore.save() requires a PublicationHeart instance');
        }
        const records = this.loadAll();
        const existing = records.find((record) => record.heartId === heart.heartId);
        if (existing) {
            if (JSON.stringify(existing.toJSON()) === JSON.stringify(heart.toJSON())) {
                return false;
            }
            throw new PublicationHeartConflictError(heart.heartId);
        }
        this._storageProvider.save(HEART_STORE_KEY, [...records, heart].map((record) => record.toJSON()));
        return true;
    }

    // The people whose latest record for the Publication is a heart, most
    // recent first.
    currentHearts(publicationId) {
        return currentHeartsFor(this.loadAll(), publicationId);
    }

    // One person's latest record for the Publication, or null.
    latestFor(publicationId, authorIdentityId) {
        return latestHeartsFor(this.loadAll(), publicationId).get(authorIdentityId) || null;
    }

    loadAll() {
        let raw;
        try {
            raw = this._storageProvider.load(HEART_STORE_KEY);
        } catch {
            return [];
        }
        if (!Array.isArray(raw)) {
            return [];
        }
        return raw.map((record) => PublicationHeart.fromJSON(record)).filter(Boolean);
    }
}
