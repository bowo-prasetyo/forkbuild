// Keeps this device's choice of whether World View draws nearby trees in full
// detail, every branch and leaf (renderer/TreeForest.js). Leaves are drawn
// over each other many times, which phones and tablets feel most, so full
// detail starts on where that is cheap and off on them (`onByDefault`,
// decided by ui/main.js), until this device chooses. Personal and local:
// never published, shared or part of any World.
import { StorageProvider } from '../../storage/StorageProvider.js';

const STORAGE_KEY = 'world-view-tree-detail';

export class WorldViewTreeDetailStore {
    constructor({ storageProvider, onByDefault = true }) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('WorldViewTreeDetailStore requires a StorageProvider');
        }
        this._storage = storageProvider;
        this._onByDefault = onByDefault === true;
    }

    // This device's choice, or the default while it hasn't made one (or it
    // can't be read).
    areDetailedTreesOn() {
        try {
            const stored = this._storage.load(STORAGE_KEY);
            return stored && typeof stored.detailed === 'boolean' ? stored.detailed : this._onByDefault;
        } catch {
            return this._onByDefault;
        }
    }

    setDetailedTreesOn(on) {
        const next = on === true;
        try {
            this._storage.save(STORAGE_KEY, { detailed: next });
        } catch {
            // Unsaved, the choice still holds until World View closes.
        }
        return next;
    }
}
