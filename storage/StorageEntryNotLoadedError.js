// Thrown by a synchronous read of an entry that is stored on disk but not
// held in memory (IndexedDbStorageBackend's cold entries: published content
// and snapshots). `ready` is a promise for the value, already loading when
// LocalStorageProvider throws this: a caller that can wait awaits it, or
// retries its synchronous read once it resolves. Returning null instead
// would read as "not stored" and invite overwriting real data.
export class StorageEntryNotLoadedError extends Error {
    constructor(entryName, ready = null) {
        super(`Storage entry "${entryName}" is on disk and has not been loaded into memory yet`);
        this.name = 'StorageEntryNotLoadedError';
        this.entryName = entryName;
        this.ready = ready;
    }
}

export function isStorageEntryNotLoadedError(error) {
    return Boolean(error) && error.name === 'StorageEntryNotLoadedError';
}

// Runs a synchronous read, and when it finds an entry not loaded, waits for
// that entry and runs it again, so code that reads synchronously can be
// used from an async caller. Gives up after `attempts` rounds (a read may
// touch several unloaded entries, one per round).
export async function retryWhenLoaded(read, attempts = 8) {
    for (let attempt = 1; ; attempt++) {
        try {
            return read();
        } catch (error) {
            if (!isStorageEntryNotLoadedError(error) || !error.ready || attempt >= attempts) {
                throw error;
            }
            await error.ready;
        }
    }
}
