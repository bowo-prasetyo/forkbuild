// Keeps this device's choice of how the Editor shows the open build's
// details: folded to its title (the default) or unfolded into the full
// About this build panel World View shows (ui/components/DocumentInfoPanel.js).
// Personal and local: never published, shared or part of any build.
import { StorageProvider } from '../../storage/StorageProvider.js';

const STORAGE_KEY = 'editor-build-info';

export class EditorBuildInfoStore {
    constructor({ storageProvider }) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('EditorBuildInfoStore requires a StorageProvider');
        }
        this._storage = storageProvider;
    }

    // True only when this device unfolded it; anything unreadable is folded.
    isExpanded() {
        try {
            const stored = this._storage.load(STORAGE_KEY);
            return Boolean(stored && stored.expanded === true);
        } catch {
            return false;
        }
    }

    setExpanded(expanded) {
        const next = expanded === true;
        try {
            this._storage.save(STORAGE_KEY, { expanded: next });
        } catch {
            // Unsaved, the choice still holds until the Editor closes.
        }
        return next;
    }
}
