import { BackupStatusStore, BackupDestination } from '../application/backup/BackupStatusStore.js';
import { BackupReminder, BackupReminderReason, backupReminderDue, holdsUserData } from '../application/backup/BackupReminder.js';
import { BackupDestinations, AutomaticBackupOutcome, startAutomaticBackups } from '../application/backup/BackupDestinations.js';
import { BackupFolder, BACKUP_FOLDER_KEEP, backupFileName } from '../application/backup/BackupFolder.js';
import { DeviceBackupUseCase, RestoreMode } from '../application/backup/DeviceBackupUseCase.js';
import { decodeDeviceBackup, deriveBackupEncryptionKey, encodeDeviceBackupWithKey } from '../application/backup/DeviceBackupFile.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// The backup reminder, the folder destination with its remembered key, and
// automatic backups.

const DOC = '11111111-1111-4111-8111-111111111111';
const at = (iso) => new Date(iso);

// A folder handle like the File System Access API's, in memory.
function fakeFolder(name = 'Dropbox', { permission = 'granted', grantOnRequest = true } = {}) {
    const files = new Map();
    const folder = {
        name,
        files,
        permissionState: permission,
        requests: 0,
        async queryPermission() { return folder.permissionState; },
        async requestPermission() {
            folder.requests++;
            if (grantOnRequest) folder.permissionState = 'granted';
            return folder.permissionState;
        },
        async getFileHandle(fileName) {
            return {
                async createWritable() {
                    let data = null;
                    return {
                        async write(bytes) { data = bytes; },
                        async close() { files.set(fileName, data); }
                    };
                }
            };
        },
        async *values() {
            for (const fileName of files.keys()) yield { kind: 'file', name: fileName };
        },
        async removeEntry(fileName) { files.delete(fileName); }
    };
    return folder;
}

function fakeValueStore() {
    const values = new Map();
    return {
        available: true,
        values,
        async get(key) { return values.has(key) ? values.get(key) : null; },
        async set(key, value) { values.set(key, value); },
        async delete(key) { values.delete(key); }
    };
}

function device({ withData = true } = {}) {
    const storage = new InMemoryStorageProvider();
    if (withData) {
        storage.save(DOC, { world: 'mine' });
        storage.save('forkbuild-index', [{ id: DOC, title: 'House' }]);
    }
    const statusStore = new BackupStatusStore(storage);
    const deviceBackup = new DeviceBackupUseCase({ storageProvider: storage, statusStore });
    return { storage, statusStore, deviceBackup };
}

async function run() {
    // --- status store -----------------------------------------------------
    {
        const { storage, statusStore } = device();
        const initial = statusStore.get();
        assert(initial.lastBackupAt === null && initial.reminderIntervalDays === 30 && !initial.automaticFolderBackup, 'defaults');
        storage.save('device-backup-status', { reminderIntervalDays: 3, lastBackupAt: 'not a date', automaticFolderBackup: 'yes' });
        const junk = statusStore.get();
        assert(junk.reminderIntervalDays === 30 && junk.lastBackupAt === null && junk.automaticFolderBackup === false, 'malformed values read as defaults');
        statusStore.update({ snoozedUntil: '2026-10-01T00:00:00.000Z' });
        const recorded = statusStore.recordBackup(BackupDestination.FILE, at('2026-09-28T10:00:00Z'));
        assert(recorded.lastBackupAt === '2026-09-28T10:00:00.000Z' && recorded.lastBackupDestination === 'file', 'a backup is recorded');
        assert(recorded.snoozedUntil === null, 'a backup ends a snooze');
        assert(statusStore.recordRestore('2026-01-01T00:00:00Z').lastBackupAt === '2026-09-28T10:00:00.000Z', 'restoring an older backup keeps the later date');
        assert(statusStore.recordRestore('2026-10-05T00:00:00Z').lastBackupDestination === 'restore', 'restoring a newer backup records it');
    }
    console.log('✓ the backup status store records backups and restores');

    // --- reminder policy ------------------------------------------------------
    {
        const base = { lastBackupAt: null, firstDataSeenAt: null, reminderIntervalDays: 30, snoozedUntil: null };
        const now = at('2026-09-28T12:00:00Z');
        assert(backupReminderDue({ status: base, hasUserData: false, now }) === null, 'nothing worth backing up, no reminder');
        assert(backupReminderDue({ status: { ...base, firstDataSeenAt: '2026-09-25T12:00:00Z' }, hasUserData: true, now }) === null,
            'no reminder in the first week');
        const never = backupReminderDue({ status: { ...base, firstDataSeenAt: '2026-09-20T12:00:00Z' }, hasUserData: true, now });
        assert(never && never.reason === BackupReminderReason.NEVER, 'never backed up after a week: reminded');
        assert(backupReminderDue({ status: { ...base, lastBackupAt: '2026-09-10T12:00:00Z' }, hasUserData: true, now }) === null,
            'a recent backup: no reminder');
        const overdue = backupReminderDue({ status: { ...base, lastBackupAt: '2026-08-20T12:00:00Z' }, hasUserData: true, now });
        assert(overdue.reason === BackupReminderReason.OVERDUE && overdue.daysSinceBackup === 39, 'overdue after the interval, with the days');
        assert(backupReminderDue({ status: { ...base, lastBackupAt: '2026-09-20T12:00:00Z', reminderIntervalDays: 7 }, hasUserData: true, now }).reason === 'overdue',
            'the interval is the person\'s choice');
        assert(backupReminderDue({ status: { ...base, lastBackupAt: '2026-01-01T00:00:00Z', reminderIntervalDays: 0 }, hasUserData: true, now }) === null,
            'reminders can be turned off');
        assert(backupReminderDue({ status: { ...base, lastBackupAt: '2026-01-01T00:00:00Z', snoozedUntil: '2026-09-30T00:00:00Z' }, hasUserData: true, now }) === null,
            'a snooze silences it until it ends');
        assert(holdsUserData({ documents: 1 }) && holdsUserData({ identities: 2 }), 'documents and identities are worth backing up');
        assert(!holdsUserData({ settings: 3, downloaded: 40, 'avatar-and-worlds': 2 }), 'settings, downloads and camera positions alone are not');
    }
    console.log('✓ the reminder waits a week at first, then follows the chosen interval');

    // --- the reminder notes when work first appeared ---------------------------
    {
        let clock = at('2026-09-01T00:00:00Z');
        const empty = device({ withData: false });
        const emptyReminder = new BackupReminder({ statusStore: empty.statusStore, deviceBackup: empty.deviceBackup, now: () => clock });
        assert(emptyReminder.check() === null && empty.statusStore.get().firstDataSeenAt === null, 'an empty device notes nothing');

        const { statusStore, deviceBackup } = device();
        const reminder = new BackupReminder({ statusStore, deviceBackup, now: () => clock });
        assert(reminder.check() === null, 'no reminder on the first day');
        assert(statusStore.get().firstDataSeenAt === '2026-09-01T00:00:00.000Z', 'the first day with work is noted');
        clock = at('2026-09-09T00:00:00Z');
        assert(reminder.check().reason === 'never', 'a week later it reminds');
        reminder.snooze();
        assert(reminder.check() === null, 'Remind Me in a Week silences it');
        clock = at('2026-09-17T00:00:00Z');
        assert(reminder.check().reason === 'never', 'and it comes back a week later');
        const summary = deviceBackup.summarize();
        assert(!('undefined' in summary) && !summary.other, 'the status entry is not counted as data');
    }
    console.log('✓ the reminder notes the first day with work and can be snoozed');

    // --- device-only entries --------------------------------------------------------
    {
        const { storage, statusStore, deviceBackup } = device();
        statusStore.recordBackup(BackupDestination.FILE, at('2026-09-28T10:00:00Z'));
        const { entries } = await deviceBackup.collect();
        assert(!('device-backup-status' in entries), 'the backup status is never backed up');
        await deviceBackup.restore({ [DOC]: { world: 'restored' } }, { mode: RestoreMode.REPLACE, createdAt: '2026-09-29T00:00:00Z' });
        assert(storage.load(DOC).world === 'restored', 'replace restores');
        assert(statusStore.get().lastBackupAt === '2026-09-29T00:00:00.000Z', 'replace keeps the status and records the restore');
    }
    console.log('✓ the backup status stays with the device');

    // --- remembered key ----------------------------------------------------------------
    {
        const key = await deriveBackupEncryptionKey('backup passphrase', { iterations: 1000 });
        assert(key.cryptoKey.extractable === false && key.cryptoKey.usages.join() === 'encrypt', 'the remembered key can only encrypt, and never be read');
        const first = await encodeDeviceBackupWithKey({ entries: { a: 1 }, key });
        const second = await encodeDeviceBackupWithKey({ entries: { a: 2 }, key });
        assert((await decodeDeviceBackup(first, 'backup passphrase')).entries.a === 1, 'a file made with the key opens with the passphrase');
        assert((await decodeDeviceBackup(second, 'backup passphrase')).entries.a === 2, 'and so does every later one');
        const nonceOf = (bytes) => JSON.parse(new TextDecoder().decode(bytes).split('\n')[1]).nonce;
        assert(nonceOf(first) !== nonceOf(second), 'each file gets a fresh nonce');
    }
    console.log('✓ the remembered key encrypts files the passphrase opens');

    // --- folder --------------------------------------------------------------------------
    {
        const handle = fakeFolder();
        const folder = new BackupFolder(handle);
        handle.files.set('holiday-photo.jpg', 'keep');
        handle.files.set('forkbuild-backup-notes.txt', 'keep');
        for (let day = 1; day <= BACKUP_FOLDER_KEEP + 2; day++) {
            await folder.write(new Uint8Array([day]), at(`2026-08-${String(day).padStart(2, '0')}T10:00:00Z`));
        }
        const backups = [...handle.files.keys()].filter((n) => n.endsWith('.forkbuild-backup')).sort();
        assert(backups.length === BACKUP_FOLDER_KEEP && backups[0] === 'forkbuild-backup-2026-08-03.forkbuild-backup', 'only the newest backups are kept');
        assert(handle.files.has('holiday-photo.jpg') && handle.files.has('forkbuild-backup-notes.txt'), 'no other file is ever removed');
        await folder.write(new Uint8Array([99]), at('2026-08-12T20:00:00Z'));
        assert(handle.files.get(backupFileName(at('2026-08-12T00:00:00Z')))[0] === 99, 'a second backup the same day replaces that day\'s file');
    }
    console.log('✓ a folder keeps one backup a day, and only the newest ten');

    // --- destinations ----------------------------------------------------------------------
    {
        const { statusStore, deviceBackup } = device();
        const valueStore = fakeValueStore();
        const handle = fakeFolder('Dropbox', { permission: 'prompt' });
        let picks = 0;
        let clock = at('2026-09-28T10:00:00Z');
        const destinations = new BackupDestinations({
            deviceBackup, statusStore, valueStore, now: () => clock,
            showDirectoryPicker: async () => { picks++; return handle; }
        });
        assert(destinations.folderSupported, 'a folder can be chosen when the browser has a picker');
        assert(!new BackupDestinations({ deviceBackup, statusStore, valueStore, showDirectoryPicker: null }).folderSupported,
            'and not without one');

        let error = null;
        try { await destinations.backUpToFolder({ passphrase: 'backup passphrase' }); } catch (e) { error = e; }
        assert(error && /Choose a backup folder/.test(error.message), 'backing up needs a folder');

        const chosen = await destinations.chooseFolder();
        assert(picks === 1 && chosen.folder.name === 'Dropbox' && chosen.folder.permission === 'prompt', 'the chosen folder is remembered');

        const cancelling = new BackupDestinations({
            deviceBackup, statusStore, valueStore: fakeValueStore(),
            showDirectoryPicker: async () => { const e = new Error('cancelled'); e.name = 'AbortError'; throw e; }
        });
        assert((await cancelling.chooseFolder()).folder === null, 'cancelling the picker changes nothing');

        error = null;
        try { await destinations.backUpToFolder(); } catch (e) { error = e; }
        assert(error && /passphrase/.test(error.message), 'without a remembered key it needs the passphrase');

        const result = await destinations.backUpToFolder({ passphrase: 'backup passphrase' });
        assert(handle.requests === 1, 'it asks for the folder permission');
        assert(handle.files.has(result.fileName) && result.folderName === 'Dropbox', 'the backup is written to the folder');
        const opened = await decodeDeviceBackup(handle.files.get(result.fileName), 'backup passphrase');
        assert(opened.entries[DOC].world === 'mine', 'and opens with the passphrase');
        assert(statusStore.get().lastBackupDestination === 'folder', 'the folder backup is recorded');

        // A fresh session loads the folder and key from the value store.
        await destinations.rememberKey('backup passphrase');
        const later = new BackupDestinations({ deviceBackup, statusStore, valueStore, now: () => clock, showDirectoryPicker: async () => handle });
        assert((await later.state()).keyRemembered, 'the key is remembered across sessions');

        // Automatic backups.
        assert(await later.runAutomatic() === AutomaticBackupOutcome.SKIPPED, 'automatic backups are off by default');
        statusStore.update({ automaticFolderBackup: true });
        assert(await later.runAutomatic() === AutomaticBackupOutcome.SKIPPED, 'not again within a day of the last backup');
        clock = at('2026-09-29T11:00:00Z');
        handle.permissionState = 'prompt';
        const requestsBefore = handle.requests;
        assert(await later.runAutomatic() === AutomaticBackupOutcome.SKIPPED && handle.requests === requestsBefore,
            'without permission it skips, and never asks');
        handle.permissionState = 'granted';
        assert(await later.runAutomatic() === AutomaticBackupOutcome.BACKED_UP, 'a day later, with permission, it backs up');
        assert(handle.files.has('forkbuild-backup-2026-09-29.forkbuild-backup'), 'to today\'s file');
        const auto = await decodeDeviceBackup(handle.files.get('forkbuild-backup-2026-09-29.forkbuild-backup'), 'backup passphrase');
        assert(auto.entries[DOC], 'with the remembered key, which the passphrase opens');

        clock = at('2026-09-30T12:00:00Z');
        handle.getFileHandle = async () => { throw new Error('The disk is full'); };
        assert(await later.runAutomatic() === AutomaticBackupOutcome.FAILED, 'a failed automatic backup is reported');
        assert(statusStore.get().lastAutomaticBackupError === 'The disk is full', 'and kept for the Your Data page');

        await later.forgetKey();
        assert(!(await later.state()).keyRemembered && !valueStore.values.has('backup-key'), 'the key can be forgotten');
        assert(statusStore.get().automaticFolderBackup === false, 'which turns automatic backups off');
        await later.forgetFolder();
        assert((await later.state()).folder === null, 'the folder can be forgotten');
    }
    console.log('✓ backups go to a chosen folder, by click or automatically once a day');

    // --- scheduling -----------------------------------------------------------------------
    {
        const timers = [];
        let runs = 0;
        const stop = startAutomaticBackups({ runAutomatic: () => { runs++; } }, {
            firstDelayMs: 60000, intervalMs: 3600000,
            setTimeoutFn: (fn, ms) => { timers.push({ fn, ms, kind: 'timeout' }); return 1; },
            setIntervalFn: (fn, ms) => { timers.push({ fn, ms, kind: 'interval' }); return 2; },
            clearTimeoutFn: () => {}, clearIntervalFn: () => {}
        });
        assert(timers[0].ms === 60000 && runs === 0, 'the first check waits a minute after start-up');
        timers[0].fn();
        assert(runs === 1 && timers[1].kind === 'interval' && timers[1].ms === 3600000, 'then it checks hourly');
        stop();
    }
    console.log('✓ automatic backups are checked a minute after start-up, then hourly');
}

await run();
