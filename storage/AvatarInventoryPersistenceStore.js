import { StorageProvider } from './StorageProvider.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';
import { AvatarInventory, emptyAvatarInventory } from '../core/AvatarInventory.js';

const AVATAR_INVENTORY_STORE_KEY = 'avatar-inventory';

// World View Inventory Persistence.
//
// application/AvatarInventoryStore.js is the session-local holder of the
// current AvatarInventory — this file is its optional durable backing,
// the same seam storage/NotificationEventStore.js and
// storage/PublicationCommentaryStore.js already establish for their own
// core/ value objects: a plain save()/load() pair over an injected
// StorageProvider, using AvatarInventory's own toJSON()/fromJSON()
// rather than reinventing serialization here.
//
// CORRUPTED OR MISSING STORAGE DEGRADES TO AN EMPTY INVENTORY, never a
// thrown error — the identical restraint every other *Store in this
// directory already applies to its own malformed-data case. A genuine
// StorageProvider failure (the injected provider itself throws) still
// propagates unmodified out of save() — never swallowed here.
export class AvatarInventoryPersistenceStore {
    constructor(storageProvider = new LocalStorageProvider()) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('AvatarInventoryPersistenceStore requires a StorageProvider');
        }
        this._storageProvider = storageProvider;
    }

    save(inventory) {
        this._storageProvider.save(AVATAR_INVENTORY_STORE_KEY, inventory.toJSON());
    }

    // Never throws — a never-written, malformed, or unreadable record all
    // degrade to emptyAvatarInventory(), exactly what a fresh
    // AvatarInventoryStore already starts from when no persistence is
    // wired at all.
    load() {
        let raw;
        try {
            raw = this._storageProvider.load(AVATAR_INVENTORY_STORE_KEY);
        } catch {
            return emptyAvatarInventory();
        }
        if (!raw || typeof raw !== 'object') {
            return emptyAvatarInventory();
        }
        try {
            return AvatarInventory.fromJSON(raw);
        } catch {
            return emptyAvatarInventory();
        }
    }
}
