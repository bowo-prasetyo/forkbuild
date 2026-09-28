import { BACKUP_STATUS_ENTRY_NAME } from './BackupEntryGroups.js';

export const BackupDestination = Object.freeze({
    FILE: 'file',
    SHARE: 'share',
    FOLDER: 'folder',
    // The data now on this device came from a backup made at lastBackupAt.
    RESTORE: 'restore'
});

// Every how many days to remind; 0 turns reminders off. In the order the
// Your Data page offers them.
export const REMINDER_INTERVAL_OPTIONS_DAYS = Object.freeze([7, 14, 30, 90, 0]);
export const DEFAULT_REMINDER_INTERVAL_DAYS = 30;

const DEFAULTS = Object.freeze({
    lastBackupAt: null,
    lastBackupDestination: null,
    firstDataSeenAt: null,
    reminderIntervalDays: DEFAULT_REMINDER_INTERVAL_DAYS,
    snoozedUntil: null,
    automaticFolderBackup: false,
    lastAutomaticBackupError: null
});

// When this device was last backed up, and its reminder and automatic
// backup settings. One entry, never itself backed up (BackupEntryGroups.js).
// Timestamps are ISO strings; anything malformed reads as its default.
export class BackupStatusStore {
    constructor(storageProvider) {
        this._storage = storageProvider;
    }

    get() {
        let stored = null;
        try {
            stored = this._storage.load(BACKUP_STATUS_ENTRY_NAME);
        } catch {
            stored = null;
        }
        const raw = stored && typeof stored === 'object' ? stored : {};
        return {
            lastBackupAt: validDate(raw.lastBackupAt),
            lastBackupDestination: Object.values(BackupDestination).includes(raw.lastBackupDestination) ? raw.lastBackupDestination : null,
            firstDataSeenAt: validDate(raw.firstDataSeenAt),
            reminderIntervalDays: REMINDER_INTERVAL_OPTIONS_DAYS.includes(raw.reminderIntervalDays) ? raw.reminderIntervalDays : DEFAULTS.reminderIntervalDays,
            snoozedUntil: validDate(raw.snoozedUntil),
            automaticFolderBackup: raw.automaticFolderBackup === true,
            lastAutomaticBackupError: typeof raw.lastAutomaticBackupError === 'string' ? raw.lastAutomaticBackupError : null
        };
    }

    update(changes) {
        const next = { ...this.get(), ...changes };
        this._storage.save(BACKUP_STATUS_ENTRY_NAME, next);
        return this.get();
    }

    // A backup made now also ends any snooze: the reminder starts over.
    recordBackup(destination, at = new Date()) {
        return this.update({
            lastBackupAt: new Date(at).toISOString(),
            lastBackupDestination: destination,
            snoozedUntil: null,
            ...(destination === BackupDestination.FOLDER ? { lastAutomaticBackupError: null } : {})
        });
    }

    // After a restore, this device's data is at least as backed up as the
    // backup it came from.
    recordRestore(backupCreatedAt) {
        const createdAt = validDate(backupCreatedAt);
        const current = this.get();
        if (!createdAt || (current.lastBackupAt && current.lastBackupAt >= createdAt)) return current;
        return this.update({ lastBackupAt: createdAt, lastBackupDestination: BackupDestination.RESTORE });
    }
}

function validDate(value) {
    if (typeof value !== 'string') return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
