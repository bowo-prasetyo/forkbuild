import { BackupEntryGroup } from './BackupEntryGroups.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// Someone who has never backed up is first reminded this long after this
// device first held their work, rather than on their first save.
export const FIRST_REMINDER_DELAY_DAYS = 7;
export const SNOOZE_DAYS = 7;

// The kinds of data worth reminding about: things the person made or
// that only they have. Settings, downloaded data and camera positions
// alone don't earn a reminder.
const USER_DATA_GROUPS = Object.freeze([
    BackupEntryGroup.DOCUMENTS,
    BackupEntryGroup.IDENTITIES,
    BackupEntryGroup.STRUCTURES,
    BackupEntryGroup.PEOPLE,
    BackupEntryGroup.CHAT
]);

export const BackupReminderReason = Object.freeze({
    NEVER: 'never',
    OVERDUE: 'overdue'
});

// Pure. { reason, daysSinceBackup } when a reminder is due, or null.
export function backupReminderDue({ status, hasUserData, now = new Date() }) {
    if (!status || !hasUserData || status.reminderIntervalDays === 0) return null;
    const nowMs = new Date(now).getTime();
    if (status.snoozedUntil && new Date(status.snoozedUntil).getTime() > nowMs) return null;
    if (status.lastBackupAt) {
        const days = Math.floor((nowMs - new Date(status.lastBackupAt).getTime()) / DAY_MS);
        return days >= status.reminderIntervalDays ? { reason: BackupReminderReason.OVERDUE, daysSinceBackup: days } : null;
    }
    if (!status.firstDataSeenAt) return null;
    const daysWithData = (nowMs - new Date(status.firstDataSeenAt).getTime()) / DAY_MS;
    return daysWithData >= FIRST_REMINDER_DELAY_DAYS ? { reason: BackupReminderReason.NEVER, daysSinceBackup: null } : null;
}

// Whether a summary of entry counts (DeviceBackupUseCase#summarize())
// includes work worth backing up.
export function holdsUserData(groups) {
    return USER_DATA_GROUPS.some((group) => (groups && groups[group]) > 0);
}

// The reminder the app shows: reads this device's status and what it
// holds, and notes when it first held something worth backing up.
export class BackupReminder {
    constructor({ statusStore, deviceBackup, now = () => new Date() }) {
        this._statusStore = statusStore;
        this._deviceBackup = deviceBackup;
        this._now = now;
    }

    // { reason, daysSinceBackup } or null.
    check() {
        const hasUserData = holdsUserData(this._deviceBackup.summarize());
        let status = this._statusStore.get();
        if (hasUserData && !status.firstDataSeenAt) {
            status = this._statusStore.update({ firstDataSeenAt: this._now().toISOString() });
        }
        return backupReminderDue({ status, hasUserData, now: this._now() });
    }

    snooze(days = SNOOZE_DAYS) {
        return this._statusStore.update({ snoozedUntil: new Date(this._now().getTime() + days * DAY_MS).toISOString() });
    }
}
