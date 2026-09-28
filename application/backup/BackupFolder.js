import { BACKUP_FILE_EXTENSION } from './DeviceBackupFile.js';

// How many dated backups a folder keeps; older ones ForkBuild wrote are
// removed, never any other file.
export const BACKUP_FOLDER_KEEP = 10;
const BACKUP_FILE_PATTERN = new RegExp(`^forkbuild-backup-\\d{4}-\\d{2}-\\d{2}${BACKUP_FILE_EXTENSION.replace('.', '\\.')}$`);

export function backupFileName(at = new Date()) {
    return `forkbuild-backup-${new Date(at).toISOString().slice(0, 10)}${BACKUP_FILE_EXTENSION}`;
}

// Backups written into a folder the person chose (the File System Access
// API's directory handle), one file per day: a later backup the same day
// replaces that day's file. A folder a sync client watches (Dropbox,
// OneDrive, iCloud Drive, a network share) carries the backups off this
// device with no server of ForkBuild's involved.
export class BackupFolder {
    constructor(directoryHandle) {
        this._handle = directoryHandle;
    }

    get name() {
        return this._handle.name;
    }

    // 'granted', 'prompt' or 'denied'.
    async permission() {
        return typeof this._handle.queryPermission === 'function'
            ? this._handle.queryPermission({ mode: 'readwrite' })
            : 'granted';
    }

    // Only works during a click or key press: browsers ask the person.
    async requestPermission() {
        return typeof this._handle.requestPermission === 'function'
            ? this._handle.requestPermission({ mode: 'readwrite' })
            : 'granted';
    }

    // Writes `bytes` as today's backup, then removes the oldest of
    // ForkBuild's backups beyond BACKUP_FOLDER_KEEP. Resolves to the name.
    async write(bytes, at = new Date()) {
        const name = backupFileName(at);
        const file = await this._handle.getFileHandle(name, { create: true });
        const writable = await file.createWritable();
        try {
            await writable.write(bytes);
            await writable.close();
        } catch (error) {
            // Nothing is replaced unless close() succeeds.
            if (typeof writable.abort === 'function') await writable.abort().catch(() => {});
            throw error;
        }
        await this._prune();
        return name;
    }

    async _prune() {
        if (typeof this._handle.values !== 'function' || typeof this._handle.removeEntry !== 'function') return;
        const names = [];
        for await (const entry of this._handle.values()) {
            if (entry.kind === 'file' && BACKUP_FILE_PATTERN.test(entry.name)) names.push(entry.name);
        }
        names.sort();
        for (const name of names.slice(0, Math.max(0, names.length - BACKUP_FOLDER_KEEP))) {
            await this._handle.removeEntry(name);
        }
    }
}
