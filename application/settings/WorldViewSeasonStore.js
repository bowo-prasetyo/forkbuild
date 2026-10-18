// Keeps the season this device shows World View in (core/Season.js's
// SEASON), for anyone who would rather always walk in summer, or wants a
// winter's photo; nothing kept follows the world's year. Personal and local:
// never published, shared or part of any World.
import { StorageProvider } from '../../storage/StorageProvider.js';
import { SEASON } from '../../core/Season.js';

const STORAGE_KEY = 'world-view-season';

export class WorldViewSeasonStore {
    constructor({ storageProvider }) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('WorldViewSeasonStore requires a StorageProvider');
        }
        this._storage = storageProvider;
    }

    // The season kept, or null to follow the world's year; anything
    // unreadable follows the world.
    keptSeason() {
        try {
            const stored = this._storage.load(STORAGE_KEY);
            return stored && SEASON[stored.season] ? stored.season : null;
        } catch {
            return null;
        }
    }

    setKeptSeason(season) {
        const next = SEASON[season] ? season : null;
        try {
            this._storage.save(STORAGE_KEY, { season: next });
        } catch {
            // Unsaved, the choice still holds until World View closes.
        }
        return next;
    }
}
