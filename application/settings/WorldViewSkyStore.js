// Keeps this device's choice to keep World View in daylight instead of
// following its day and night (core/DayCycle.js), for anyone who finds the
// dark hard to see in or a slow device that would rather skip the glow.
// Personal and local: never published, shared or part of any World.
import { StorageProvider } from '../../storage/StorageProvider.js';

const STORAGE_KEY = 'world-view-sky';

export class WorldViewSkyStore {
    constructor({ storageProvider }) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('WorldViewSkyStore requires a StorageProvider');
        }
        this._storage = storageProvider;
    }

    // True only when this device chose Always day; anything unreadable
    // follows the world's time.
    isAlwaysDay() {
        try {
            const stored = this._storage.load(STORAGE_KEY);
            return Boolean(stored && stored.alwaysDay === true);
        } catch {
            return false;
        }
    }

    setAlwaysDay(alwaysDay) {
        const next = alwaysDay === true;
        try {
            this._storage.save(STORAGE_KEY, { alwaysDay: next });
        } catch {
            // Unsaved, the choice still holds until World View closes.
        }
        return next;
    }
}
