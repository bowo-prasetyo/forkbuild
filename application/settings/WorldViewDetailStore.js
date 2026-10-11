// Keeps this device's choice of how much World View shows: a visitor's view
// (the default), or every tool, with the coordinates, World Encounters,
// claimed builds, discovered place names and the publication's network
// tools (docs/user/03-WorldView.md, "A visitor's view, and Advanced").
// Personal and local: never published, shared or part of any World.
import { StorageProvider } from '../../storage/StorageProvider.js';

const STORAGE_KEY = 'world-view-detail';

export class WorldViewDetailStore {
    constructor({ storageProvider }) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('WorldViewDetailStore requires a StorageProvider');
        }
        this._storage = storageProvider;
    }

    // True only when this device chose Advanced; anything unreadable is a
    // visitor's view.
    isAdvanced() {
        try {
            const stored = this._storage.load(STORAGE_KEY);
            return Boolean(stored && stored.advanced === true);
        } catch {
            return false;
        }
    }

    setAdvanced(advanced) {
        const next = advanced === true;
        try {
            this._storage.save(STORAGE_KEY, { advanced: next });
        } catch {
            // Unsaved, the choice still holds until World View closes.
        }
        return next;
    }
}
