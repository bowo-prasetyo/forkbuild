import { isStorageFullError } from '../../storage/StorageFullError.js';

// What the Editor tells the user when saving fails. A full browser storage
// gets its own message: trying again cannot help, but exporting the
// document keeps the user's work.

export function saveFailureMessage(error) {
    return isStorageFullError(error)
        ? 'Save failed: this browser\'s storage for ForkBuild is full. Your changes are still open; use Export to keep a copy as a file.'
        : 'Save failed — your changes are still here, but were not saved. Try again.';
}

export function autosaveFailureMessage(error) {
    return isStorageFullError(error)
        ? 'Crash recovery is paused: this browser\'s storage for ForkBuild is full. Your changes are still open; use Export to keep a copy as a file.'
        : 'Crash recovery could not save a checkpoint. Your changes are still open.';
}
