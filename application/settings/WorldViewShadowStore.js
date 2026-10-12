// Keeps this device's choice of whether World View's sun and moon cast
// shadows (renderer/SunShadows.js). Shadows draw the nearby scene a second
// time each frame, so they start on where that is cheap and off on phones
// and tablets (`onByDefault`, decided by ui/main.js), until this device
// chooses. Personal and local: never published, shared or part of any World.
import { StorageProvider } from '../../storage/StorageProvider.js';

const STORAGE_KEY = 'world-view-shadows';

export class WorldViewShadowStore {
    constructor({ storageProvider, onByDefault = true }) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('WorldViewShadowStore requires a StorageProvider');
        }
        this._storage = storageProvider;
        this._onByDefault = onByDefault === true;
    }

    // This device's choice, or the default while it hasn't made one (or it
    // can't be read).
    areShadowsOn() {
        try {
            const stored = this._storage.load(STORAGE_KEY);
            return stored && typeof stored.shadows === 'boolean' ? stored.shadows : this._onByDefault;
        } catch {
            return this._onByDefault;
        }
    }

    setShadowsOn(on) {
        const next = on === true;
        try {
            this._storage.save(STORAGE_KEY, { shadows: next });
        } catch {
            // Unsaved, the choice still holds until World View closes.
        }
        return next;
    }
}
