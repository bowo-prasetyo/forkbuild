// Keeps this device's progress through the guided first build
// (core/FirstBuildChecklist.js). Personal and local: never published, shared
// or part of any World.
import { StorageProvider } from '../../storage/StorageProvider.js';
import { normalizeFirstBuildProgress } from '../../core/FirstBuildChecklist.js';

const STORAGE_KEY = 'first-build-guide';

export class FirstBuildChecklistStore {
    constructor({ storageProvider }) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('FirstBuildChecklistStore requires a StorageProvider');
        }
        this._storage = storageProvider;
    }

    // Whether anything was ever saved, so a device that already knows the
    // Editor can start with the guide hidden.
    hasRecord() {
        try {
            return this._storage.load(STORAGE_KEY) != null;
        } catch {
            return false;
        }
    }

    get() {
        try {
            return normalizeFirstBuildProgress(this._storage.load(STORAGE_KEY));
        } catch {
            return normalizeFirstBuildProgress(null);
        }
    }

    save(progress) {
        const normalized = normalizeFirstBuildProgress(progress);
        this._storage.save(STORAGE_KEY, {
            completed: [...normalized.completed],
            dismissed: normalized.dismissed,
            celebrated: normalized.celebrated
        });
        return normalized;
    }
}
