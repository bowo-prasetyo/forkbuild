// Keeps this device's number keys for recent bricks (core/building/BrickSlots.js):
// which brick each of the keys 3 to 9 holds. Personal and local, like
// application/settings/EditorBuildInfoStore.js: never published or shared.
import { StorageProvider } from '../../storage/StorageProvider.js';
import { emptyBrickSlots, normalizeBrickSlots, useBrick } from '../../core/building/BrickSlots.js';

const STORAGE_KEY = 'editor-recent-bricks';

export class RecentBricksStore {
    constructor({ storageProvider }) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('RecentBricksStore requires a StorageProvider');
        }
        this._storage = storageProvider;
        // Read once; kept here so the keys hold even when a save fails.
        this._slots = null;
    }

    // Anything unreadable is no keys held yet.
    load() {
        if (!this._slots) {
            try {
                this._slots = normalizeBrickSlots(this._storage.load(STORAGE_KEY));
            } catch {
                this._slots = emptyBrickSlots();
            }
        }
        return this._slots;
    }

    // Records that `definitionId` was chosen, and returns the slots now.
    use(definitionId) {
        const next = useBrick(this.load(), definitionId);
        this._slots = next;
        try {
            this._storage.save(STORAGE_KEY, next);
        } catch {
            // Unsaved, the keys still hold until the Editor closes.
        }
        return next;
    }
}
