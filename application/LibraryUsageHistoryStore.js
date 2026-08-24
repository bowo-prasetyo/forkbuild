import { StorageProvider } from '../storage/StorageProvider.js';

const STORAGE_KEY_PREFIX = 'blueprint-usage:';

// 0.6.4 — Blueprint Discovery, Search & Library Organization.
//
// Backs the Build Library's "Recent" section — WHICH structure ids were
// placed and WHEN, purely local/per-device state, exactly the same
// key-prefix-and-list() shape application/LocalWorldExperienceStore.js
// (0.3.10) already established for camera framing. See docs/Principles.md,
// "Usage History Is Local Presentation Metadata, Never Structure State
// (0.6.4)":
//
//     Structure                    LibraryUsageHistoryStore
//         |                              |
//     immutable reusable value      local UI/session metadata
//
// core/Structure.js, core/StructureRegistry.js, and
// application/LocalStructureLibraryStore.js stay completely unaware
// this store exists — nothing here adds a field to Structure, and
// nothing here is exported/imported alongside a blueprint package (see
// application/ExportBlueprintUseCase.js/ImportBlueprintUseCase.js,
// unmodified). A structure id recorded here that later gets renamed,
// re-forked, or removed from every library that ever held it is simply
// an id nothing resolves anymore — this store never validates against
// either library, and the caller that reads listRecent() (0.6.4's own
// ui/components/BuildLibraryPanel.js) is the one place that resolves
// each id and silently drops what neither library recognizes.
export class LibraryUsageHistoryStore {
    constructor({ storageProvider }) {
        if (!storageProvider || !(storageProvider instanceof StorageProvider)) {
            throw new Error('LibraryUsageHistoryStore requires a StorageProvider');
        }
        this._storage = storageProvider;
    }

    // Records that `structureId` was just used (placed into a
    // Document). Overwrites any prior record for the same id — history
    // tracks the LAST time something was used, never a use count or a
    // full log. `usedAt` is an optional explicit override (tests only,
    // same convention application/LocalStructureLibraryStore.js's own
    // `savedAt` override already established) for deterministic
    // ordering without depending on real elapsed wall-clock time.
    recordUse(structureId, { usedAt } = {}) {
        if (!structureId || typeof structureId !== 'string') {
            return;
        }
        this._storage.save(STORAGE_KEY_PREFIX + structureId, {
            structureId,
            lastUsedAt: typeof usedAt === 'number' ? usedAt : Date.now()
        });
    }

    // Every recorded structure id, most-recently-used first, capped at
    // `limit`. Returns bare ids (never Structure instances) — resolving
    // an id against whichever library still has it is the caller's job,
    // per this class's own header.
    listRecent(limit = 5) {
        const allKeys = this._storage.list();
        const records = [];
        for (const key of allKeys) {
            if (key.startsWith(STORAGE_KEY_PREFIX)) {
                const record = this._storage.load(key);
                if (record && record.structureId) {
                    records.push(record);
                }
            }
        }
        records.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
        return records.slice(0, limit).map((record) => record.structureId);
    }

    // Removes one id's usage record — offered for parity/testability;
    // no current UI surface calls this (removing a personal Structure
    // never needs to reach into this store, per this class's own
    // header on stale ids being harmless).
    clear(structureId) {
        if (!structureId || typeof structureId !== 'string') {
            return;
        }
        this._storage.remove(STORAGE_KEY_PREFIX + structureId);
    }
}
