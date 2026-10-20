import { StorageProvider } from '../../storage/StorageProvider.js';
import { addReadyMadeBricks, countPlacedBricks, worldBricks } from '../../core/building/PlacedBricks.js';

const KEY_PREFIX = 'ready-made-bricks:';

// The bricks each build on this device was started with (core/building/PlacedBricks.js):
// the ready-made structure or the build it is a copy of, and ready-made
// structures dropped into it since. Kept per World id, on this device only,
// to tell at publish how many bricks the builder placed or changed. A build
// with no record was started empty: every brick is its builder's.
export class ReadyMadeBricksStore {
    constructor({ storageProvider }) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('ReadyMadeBricksStore requires a StorageProvider');
        }
        this._storage = storageProvider;
    }

    // The record for `worldId`, or null.
    get(worldId) {
        if (!worldId) return null;
        try {
            const record = this._storage.load(KEY_PREFIX + worldId);
            return record && typeof record === 'object' ? record : null;
        } catch {
            return null;
        }
    }

    // `world` was just started from something: all its bricks are ready-made.
    started(world) {
        this._save(world?.id, addReadyMadeBricks(null, worldBricks(world)));
    }

    // Ready-made `bricks` were dropped into `worldId`'s build.
    added(worldId, bricks) {
        if (!worldId || !bricks || bricks.length === 0) return;
        this._save(worldId, addReadyMadeBricks(this.get(worldId), bricks));
    }

    // How many of `world`'s bricks its builder placed or changed.
    placedCount(world) {
        return countPlacedBricks(worldBricks(world), this.get(world?.id));
    }

    _save(worldId, record) {
        if (!worldId) return;
        try {
            this._storage.save(KEY_PREFIX + worldId, record);
        } catch {
            // A full or blocked storage only loses the distinction: every
            // brick then counts as the builder's.
        }
    }
}
