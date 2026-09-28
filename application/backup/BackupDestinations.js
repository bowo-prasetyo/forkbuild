import { BackupFolder } from './BackupFolder.js';
import { BackupDestination } from './BackupStatusStore.js';
import { holdsUserData } from './BackupReminder.js';
import { deriveBackupEncryptionKey } from './DeviceBackupFile.js';

const FOLDER_VALUE = 'folder';
const KEY_VALUE = 'backup-key';
const HOUR_MS = 60 * 60 * 1000;
export const AUTOMATIC_BACKUP_INTERVAL_HOURS = 24;

export const AutomaticBackupOutcome = Object.freeze({
    SKIPPED: 'skipped',
    BACKED_UP: 'backed-up',
    FAILED: 'failed'
});

// Where backups can go besides a downloaded file: a folder the person
// picks (Chromium browsers on computers), written with one click and, if
// they ask, automatically once a day while ForkBuild is open.
//
// Writing without asking for the passphrase each time uses the backup
// key remembered on this device (deriveBackupEncryptionKey(): encrypt
// only, its bytes never readable). The folder handle and the key live in
// `valueStore` (storage/IndexedDbValueStore.js), since neither is JSON.
// They are loaded once and kept in memory, so a click can ask for the
// folder permission straight away: browsers allow that only right after
// the click.
export class BackupDestinations {
    constructor({
        deviceBackup,
        statusStore,
        valueStore,
        showDirectoryPicker = typeof globalThis.showDirectoryPicker === 'function' ? globalThis.showDirectoryPicker.bind(globalThis) : null,
        now = () => new Date()
    }) {
        this._deviceBackup = deviceBackup;
        this._statusStore = statusStore;
        this._valueStore = valueStore;
        this._showDirectoryPicker = showDirectoryPicker;
        this._now = now;
        this._loaded = null;
        this._folder = null;
        this._key = null;
    }

    get folderSupported() {
        return Boolean(this._showDirectoryPicker && this._valueStore && this._valueStore.available);
    }

    // { folder: { name, permission } | null, keyRemembered }.
    async state() {
        await this._load();
        return {
            folder: this._folder ? { name: this._folder.name, permission: await this._folder.permission() } : null,
            keyRemembered: Boolean(this._key)
        };
    }

    // Opens the browser's folder picker; resolves to state(), unchanged if
    // the person cancels.
    async chooseFolder() {
        if (!this.folderSupported) throw new Error('This browser can\'t save backups to a folder.');
        let handle;
        try {
            handle = await this._showDirectoryPicker({ id: 'forkbuild-backup', mode: 'readwrite', startIn: 'documents' });
        } catch (error) {
            if (error && error.name === 'AbortError') return this.state();
            throw error;
        }
        await this._valueStore.set(FOLDER_VALUE, handle);
        this._folder = new BackupFolder(handle);
        return this.state();
    }

    async forgetFolder() {
        await this._load();
        await this._valueStore.delete(FOLDER_VALUE);
        this._folder = null;
        this._statusStore.update({ automaticFolderBackup: false });
    }

    // Derives the backup key from `passphrase` and keeps it on this device.
    // Resolves to the key, for the backup being made now.
    async rememberKey(passphrase) {
        const key = await deriveBackupEncryptionKey(passphrase);
        await this._valueStore.set(KEY_VALUE, key);
        this._key = key;
        return key;
    }

    async forgetKey() {
        await this._load();
        await this._valueStore.delete(KEY_VALUE);
        this._key = null;
        this._statusStore.update({ automaticFolderBackup: false });
    }

    // Backs up to the chosen folder now, with `passphrase` or else the
    // remembered key. Call it from a click: it may ask for the folder
    // permission. Resolves to { fileName, folderName, groups }.
    async backUpToFolder({ passphrase = null } = {}) {
        await this._load();
        const folder = this._folder;
        if (!folder) throw new Error('Choose a backup folder first.');
        if (await folder.permission() !== 'granted' && await folder.requestPermission() !== 'granted') {
            throw new Error(`ForkBuild isn't allowed to save in "${folder.name}". Allow it when the browser asks, or choose the folder again.`);
        }
        if (!passphrase && !this._key) throw new Error('Enter the backup passphrase.');
        const { bytes, createdAt, groups } = await this._deviceBackup.createBackupFile({ ...(passphrase ? { passphrase } : { key: this._key }), createdAt: this._now() });
        const fileName = await folder.write(bytes, createdAt);
        this._statusStore.recordBackup(BackupDestination.FOLDER, createdAt);
        return { fileName, folderName: folder.name, groups };
    }

    // The automatic backup: runs only when it's turned on, the folder and
    // key are here, the browser already allows writing to the folder (it
    // never asks), there is work worth backing up, and the last backup is
    // a day old. A failure is kept in the status for the Your Data page.
    async runAutomatic() {
        const status = this._statusStore.get();
        if (!status.automaticFolderBackup) return AutomaticBackupOutcome.SKIPPED;
        try {
            await this._load();
            if (!this._folder || !this._key || await this._folder.permission() !== 'granted') return AutomaticBackupOutcome.SKIPPED;
            if (!holdsUserData(this._deviceBackup.summarize())) return AutomaticBackupOutcome.SKIPPED;
            const last = status.lastBackupAt ? new Date(status.lastBackupAt).getTime() : null;
            if (last !== null && this._now().getTime() - last < AUTOMATIC_BACKUP_INTERVAL_HOURS * HOUR_MS) return AutomaticBackupOutcome.SKIPPED;
            await this.backUpToFolder();
            return AutomaticBackupOutcome.BACKED_UP;
        } catch (error) {
            this._statusStore.update({ lastAutomaticBackupError: String((error && error.message) || error) });
            return AutomaticBackupOutcome.FAILED;
        }
    }

    _load() {
        if (!this._loaded) {
            this._loaded = (async () => {
                if (!this._valueStore || !this._valueStore.available) return;
                const handle = await this._valueStore.get(FOLDER_VALUE);
                const key = await this._valueStore.get(KEY_VALUE);
                if (handle) this._folder = new BackupFolder(handle);
                if (key && key.cryptoKey) this._key = key;
            })();
            this._loaded.catch(() => { this._loaded = null; });
        }
        return this._loaded;
    }
}

// Checks for an automatic backup a minute after start-up, then hourly.
// Returns a function that stops it.
export function startAutomaticBackups(destinations, {
    firstDelayMs = 60 * 1000,
    intervalMs = HOUR_MS,
    setTimeoutFn = globalThis.setTimeout,
    setIntervalFn = globalThis.setInterval,
    clearTimeoutFn = globalThis.clearTimeout,
    clearIntervalFn = globalThis.clearInterval
} = {}) {
    let interval = null;
    const timeout = setTimeoutFn(() => {
        destinations.runAutomatic();
        interval = setIntervalFn(() => destinations.runAutomatic(), intervalMs);
    }, firstDelayMs);
    return () => {
        clearTimeoutFn(timeout);
        if (interval !== null) clearIntervalFn(interval);
    };
}
