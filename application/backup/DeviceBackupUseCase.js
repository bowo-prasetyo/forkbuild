import {
    BackupEntryGroup,
    CONTENT_ENTRY_PREFIX,
    DOCUMENT_INDEX_ENTRY_NAME,
    IDENTITY_INDEX_ENTRY_NAME,
    OWN_PUBLICATIONS_ENTRY_NAME,
    SESSION_ENTRY_NAME,
    backupEntryGroupOf
} from './BackupEntryGroups.js';
import { encodeDeviceBackup, decodeDeviceBackup } from './DeviceBackupFile.js';

export const RestoreMode = Object.freeze({
    // Deletes everything on this device first, then writes the backup.
    REPLACE: 'replace',
    // Writes only what this device doesn't have; where both have an entry,
    // this device's is kept (lists of documents, identities and your own
    // publications are combined).
    MERGE: 'merge'
});

// Backs up and restores every entry this device keeps in browser storage
// (see application/backup/BackupEntryGroups.js for what they are).
//
// Other people's published content (content:<hash>) can be large and can
// be fetched again, so it is left out unless asked for; content of your
// own publications is always kept, since this device may be its only copy.
//
// A restore writes through the StorageProvider and then waits for
// `flush` (flushLocalStorage in the app) so everything is on disk before
// the caller reloads the page: stores keep in-memory copies read at start.
export class DeviceBackupUseCase {
    constructor({ storageProvider, flush = () => Promise.resolve() }) {
        this._storage = storageProvider;
        this._flush = flush;
    }

    // Counts this device's entries per BackupEntryGroup without reading
    // them (published content stays on disk until read).
    summarize() {
        const names = this._storage.list().filter((name) => name !== SESSION_ENTRY_NAME);
        return describeBackupEntries(Object.fromEntries(names.map((name) => [name, true])));
    }

    // Resolves to { entries, groups, leftOutContentCount }: groups counts
    // entries per BackupEntryGroup.
    async collect({ includeDownloadedContent = false } = {}) {
        const ownContentHashes = this._ownContentHashes();
        const entries = {};
        let leftOutContentCount = 0;
        for (const name of [...this._storage.list()].sort()) {
            if (name === SESSION_ENTRY_NAME) continue;
            if (name.startsWith(CONTENT_ENTRY_PREFIX) && !includeDownloadedContent
                && !ownContentHashes.has(name.slice(CONTENT_ENTRY_PREFIX.length))) {
                leftOutContentCount++;
                continue;
            }
            const value = await this._storage.loadAsync(name);
            if (value !== null && value !== undefined) entries[name] = value;
        }
        return { entries, groups: describeBackupEntries(entries), leftOutContentCount };
    }

    // Resolves to { bytes, groups, leftOutContentCount }.
    async createBackupFile({ passphrase, includeDownloadedContent = false, iterations } = {}) {
        const { entries, groups, leftOutContentCount } = await this.collect({ includeDownloadedContent });
        const bytes = await encodeDeviceBackup({ entries, passphrase, ...(iterations ? { iterations } : {}) });
        return { bytes, groups, leftOutContentCount };
    }

    // Resolves to { createdAt, entries, groups } without changing anything.
    async readBackupFile(bytes, passphrase) {
        const { createdAt, entries } = await decodeDeviceBackup(bytes, passphrase);
        return { createdAt, entries, groups: describeBackupEntries(entries) };
    }

    // Resolves to { written, kept, skipped }: entries written, entries this
    // device already had and kept (MERGE), and entries skipped because this
    // version doesn't know them.
    async restore(entries, { mode = RestoreMode.MERGE } = {}) {
        if (mode !== RestoreMode.REPLACE && mode !== RestoreMode.MERGE) {
            throw new Error(`DeviceBackupUseCase: unknown restore mode "${mode}"`);
        }
        const known = Object.entries(entries || {}).filter(([name, value]) => backupEntryGroupOf(name) !== null && value !== null && value !== undefined);
        const skipped = Object.keys(entries || {}).length - known.length;
        let written = 0;
        let kept = 0;

        if (mode === RestoreMode.REPLACE) {
            for (const name of [...this._storage.list()]) this._storage.remove(name);
            for (const [name, value] of known) {
                this._storage.save(name, value);
                written++;
            }
        } else {
            for (const [name, value] of known) {
                const combine = COMBINED_LISTS[name];
                if (combine) {
                    const current = this._storage.exists(name) ? this._storage.load(name) : null;
                    this._storage.save(name, combine(current, value));
                    written++;
                } else if (this._storage.exists(name)) {
                    kept++;
                } else {
                    this._storage.save(name, value);
                    written++;
                }
            }
        }
        await this._flush();
        return { written, kept, skipped };
    }

    _ownContentHashes() {
        const records = this._storage.load(OWN_PUBLICATIONS_ENTRY_NAME);
        return new Set(Array.isArray(records) ? records.map((record) => record && record.contentHash).filter(Boolean) : []);
    }
}

// Counts entries per BackupEntryGroup; names this version doesn't know
// count as OTHER.
export function describeBackupEntries(entries) {
    const groups = {};
    for (const name of Object.keys(entries || {})) {
        const group = backupEntryGroupOf(name) || BackupEntryGroup.OTHER;
        groups[group] = (groups[group] || 0) + 1;
    }
    return groups;
}

// Index lists whose items point at other entries: in a merge, keeping only
// this device's list would hide the restored documents, identities or
// publications it doesn't list.
const COMBINED_LISTS = {
    [DOCUMENT_INDEX_ENTRY_NAME]: (current, restored) => combineLists(current, restored, (item) => item.id),
    [IDENTITY_INDEX_ENTRY_NAME]: (current, restored) => combineLists(current, restored, (item) => item.identityId),
    [OWN_PUBLICATIONS_ENTRY_NAME]: (current, restored) => combineLists(current, restored, (item) => item.id)
};

// This device's items, plus restored ones it doesn't have. Where both have
// an item, this device's is kept, matching the entry it points at, which
// a merge also keeps.
function combineLists(current, restored, keyOf) {
    const result = Array.isArray(current) ? current.filter(isObject) : [];
    const keys = new Set(result.map(keyOf));
    for (const item of Array.isArray(restored) ? restored.filter(isObject) : []) {
        if (!keys.has(keyOf(item))) {
            keys.add(keyOf(item));
            result.push(item);
        }
    }
    return result;
}

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
