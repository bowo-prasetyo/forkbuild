import { isStorageFullError } from '../../storage/StorageFullError.js';
import { t } from '../i18n/i18n.js';

// What the Editor tells the user when saving fails. A full browser storage
// gets its own message: trying again cannot help, but exporting the
// document keeps the user's work.

export function saveFailureMessage(error) {
    return t(isStorageFullError(error) ? 'saveFailure.storageFull' : 'saveFailure.other');
}

export function autosaveFailureMessage(error) {
    return t(isStorageFullError(error) ? 'autosaveFailure.storageFull' : 'autosaveFailure.other');
}
