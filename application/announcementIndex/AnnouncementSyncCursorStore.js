import { isNonEmptyString, isPlainObject } from '../../utils/typeGuards.js';

const STORAGE_PREFIX = 'announcement-sync:';

// How far each substrate endpoint has been read for each sync target
// (docs/AnnouncementIndex.md, "Phase 3"). One storage entry per cursor, so
// two targets or two relays never overwrite each other's progress.
export class AnnouncementSyncCursorStore {
    constructor({ storage }) {
        if (!storage || typeof storage.load !== 'function' || typeof storage.save !== 'function') {
            throw new Error('AnnouncementSyncCursorStore: a StorageProvider is required');
        }
        this._storage = storage;
    }

    get(cursorId) {
        let stored;
        try {
            stored = this._storage.load(STORAGE_PREFIX + cursorId);
        } catch {
            return null;
        }
        return isPlainObject(stored) ? stored : null;
    }

    set(cursorId, cursor) {
        if (!isNonEmptyString(cursorId)) throw new Error('AnnouncementSyncCursorStore: a cursor id is required');
        this._storage.save(STORAGE_PREFIX + cursorId, cursor);
    }
}
