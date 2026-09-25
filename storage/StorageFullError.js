// Browser storage has a quota per site: about 5 MB of localStorage, or a
// share of the disk for IndexedDB. When a write would exceed it, the
// browser raises a QuotaExceededError whose name and code differ between
// engines; LocalStorageProvider and IndexedDbStorageBackend turn that into
// this one error, whose message is safe to show the user as is.
export const STORAGE_FULL_MESSAGE =
    'This browser\'s storage for ForkBuild is full, so this was not saved. Nothing you have open was lost.';

export class StorageFullError extends Error {
    constructor(cause = null) {
        super(STORAGE_FULL_MESSAGE);
        this.name = 'StorageFullError';
        this.cause = cause;
    }
}

// True for a StorageFullError or any engine's quota error: Chrome and
// Safari throw QuotaExceededError (legacy code 22), older Firefox
// NS_ERROR_DOM_QUOTA_REACHED (code 1014).
export function isStorageFullError(error) {
    if (!error || typeof error !== 'object') {
        return false;
    }
    return error instanceof StorageFullError
        || error.name === 'QuotaExceededError'
        || error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
        || error.code === 22
        || error.code === 1014;
}
