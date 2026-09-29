// @environment browser
import { createApp, nextTick } from 'vue';
import YourDataView from '../ui/views/YourDataView.js';
import BackupReminderBanner from '../ui/components/BackupReminderBanner.js';
import { DeviceBackupUseCase } from '../application/backup/DeviceBackupUseCase.js';
import { BackupStatusStore } from '../application/backup/BackupStatusStore.js';
import { BackupReminder } from '../application/backup/BackupReminder.js';
import { BackupDestinations, AutomaticBackupOutcome } from '../application/backup/BackupDestinations.js';
import { decodeDeviceBackup } from '../application/backup/DeviceBackupFile.js';
import { IndexedDbValueStore } from '../storage/IndexedDbValueStore.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { backupFileName } from '../application/backup/BackupFolder.js';
import { assert } from './support/Assert.js';

// Backups to a folder, the remembered key, sharing and the reminder banner,
// with real Vue and real IndexedDB (the remembered CryptoKey is stored and
// read back across sessions). The folder is an in-page stand-in for the
// directory handle a picker returns; tests/BackupReminderAndDestinations.test.js
// covers the folder's files and pruning.

await new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/main.css';
    link.onload = resolve;
    link.onerror = () => reject(new Error('css/main.css failed to load'));
    document.head.appendChild(link);
});

const DOC = '11111111-1111-4111-8111-111111111111';
const PASSPHRASE = 'backup passphrase';
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const settle = async () => { await nextTick(); await new Promise((r) => setTimeout(r, 0)); await nextTick(); };

async function waitFor(condition, what) {
    for (let i = 0; i < 400; i++) {
        if (await condition()) return;
        await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`timed out waiting for ${what}`);
}

function setInput(input, value) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
}

function click(element) {
    element.click();
}

// The parts of a FileSystemDirectoryHandle BackupFolder uses.
function makeFolder(name) {
    const files = new Map();
    return {
        name,
        files,
        async queryPermission() { return 'granted'; },
        async requestPermission() { return 'granted'; },
        async getFileHandle(fileName) {
            return {
                async createWritable() {
                    let data = null;
                    return {
                        async write(bytes) { data = new Uint8Array(bytes); },
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
}

async function folderFiles(folderHandle) {
    return Object.fromEntries(folderHandle.files);
}

// Real IndexedDB for everything but the folder: a stand-in handle can't be
// structured-cloned, so it stays in memory, as if the browser had kept it.
function valueStoreWithFolder(databaseName, folderHandle) {
    const idb = new IndexedDbValueStore({ databaseName });
    let storedFolder = null;
    return {
        available: true,
        get: async (key) => (key === 'folder' ? storedFolder : idb.get(key)),
        set: async (key, value) => { if (key === 'folder') storedFolder = value; else await idb.set(key, value); },
        delete: async (key) => { if (key === 'folder') storedFolder = null; else await idb.delete(key); },
        folderStored: () => storedFolder === folderHandle
    };
}

function mount(component, services, props = {}) {
    const host = document.createElement('div');
    host.style.width = '390px';
    document.body.style.margin = '0';
    document.body.appendChild(host);
    const app = createApp(component, props);
    for (const [key, value] of Object.entries(services)) app.provide(key, value);
    app.mount(host);
    return { host, unmount: () => { app.unmount(); host.remove(); } };
}

const folder = makeFolder('Dropbox');

const storage = new InMemoryStorageProvider();
storage.save(DOC, { world: 'mine' });
storage.save('forkbuild-index', [{ id: DOC, title: 'House' }]);
const statusStore = new BackupStatusStore(storage);
const deviceBackup = new DeviceBackupUseCase({ storageProvider: storage, statusStore });
const databaseName = `forkbuild-backup-test-${Date.now()}`;
const valueStore = valueStoreWithFolder(databaseName, folder);
// Your Data's "Last backup: today" line reads the real clock, so the backups
// here are dated from now rather than a fixed day, which would stop being
// "today" once a day had passed.
const DAY_MS = 24 * 60 * 60 * 1000;
const firstBackupAt = new Date();
let clock = firstBackupAt;
const makeDestinations = () => new BackupDestinations({
    deviceBackup, statusStore,
    valueStore,
    showDirectoryPicker: async () => folder,
    now: () => clock
});

// A share sheet that refuses the first time (the tap's activation ran out
// while encrypting), then accepts.
const shared = [];
let shareAttempts = 0;
const fileSharing = {
    canShare: ({ files }) => Array.isArray(files) && files.length === 1,
    share: async ({ files }) => {
        shareAttempts++;
        if (shareAttempts === 1) {
            const error = new Error('needs a tap');
            error.name = 'NotAllowedError';
            throw error;
        }
        shared.push(files[0]);
    }
};

// Downloads are not the subject here.
const originalCreateObjectURL = URL.createObjectURL;
URL.createObjectURL = () => 'blob:captured';
const originalClick = HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click = function clickLink() {
    if (this.href !== 'blob:captured') originalClick.call(this);
};

// --- Your Data: folder, remembered key, automatic, share ---------------------
{
    const destinations = makeDestinations();
    const { host, unmount } = mount(YourDataView, {
        deviceBackupUseCase: deviceBackup, backupStatusStore: statusStore, backupDestinations: destinations,
        navigatorStorage: null, fileSharing, reloadPage: () => {}
    });
    await settle();
    assert(/hasn't been backed up yet/.test(text(host.querySelector('.your-data-last-backup'))), 'the page says there is no backup yet');
    assert(host.querySelector('.your-data-automatic').disabled, 'automatic backups need a folder and a remembered key');

    click(host.querySelector('.your-data-choose-folder'));
    await waitFor(() => host.querySelector('.your-data-backup-folder'), 'the folder to be chosen');
    assert(text(host.querySelector('.your-data-folder')).includes(folder.name), 'the chosen folder is shown');

    setInput(host.querySelector('.your-data-backup-passphrase'), PASSPHRASE);
    await settle();
    setInput(host.querySelector('.your-data-backup-confirmation'), PASSPHRASE);
    const remember = host.querySelector('.your-data-remember-key');
    remember.checked = true;
    remember.dispatchEvent(new Event('change'));
    await settle();
    click(host.querySelector('.your-data-backup-folder'));
    await waitFor(() => host.querySelector('.your-data-backup-result'), 'the folder backup');
    const files = await folderFiles(folder);
    const name = backupFileName(clock);
    assert(files[name], `the backup is in the folder (${Object.keys(files).join(', ')})`);
    assert((await decodeDeviceBackup(files[name], PASSPHRASE)).entries[DOC].world === 'mine', 'and opens with the passphrase');
    await waitFor(() => /Last backup: today, to the backup folder/.test(text(host.querySelector('.your-data-last-backup'))), 'the status line');
    await waitFor(() => !host.querySelector('.your-data-automatic').disabled, 'automatic backups to become available');
    assert(/works without the passphrase/.test(text(host)), 'the page says the key is remembered');

    const automatic = host.querySelector('.your-data-automatic');
    automatic.checked = true;
    automatic.dispatchEvent(new Event('change'));
    await settle();
    assert(statusStore.get().automaticFolderBackup, 'automatic backups are turned on');

    // One click, no passphrase: the remembered key.
    clock = new Date(firstBackupAt.getTime() + DAY_MS);
    click(host.querySelector('.your-data-backup-folder'));
    await waitFor(async () => (await folderFiles(folder))[backupFileName(clock)], 'the one-click backup');

    // Share: the first tap prepares the file, the second shares it.
    setInput(host.querySelector('.your-data-backup-passphrase'), PASSPHRASE);
    await settle();
    setInput(host.querySelector('.your-data-backup-confirmation'), PASSPHRASE);
    click(host.querySelector('.your-data-share'));
    await waitFor(() => /tap Share Backup again/.test(text(host)), 'the second-tap hint');
    click(host.querySelector('.your-data-share'));
    await waitFor(() => shared.length === 1, 'the share');
    assert(shared[0].name.endsWith('.forkbuild-backup'), 'a backup file is shared');
    assert((await decodeDeviceBackup(new Uint8Array(await shared[0].arrayBuffer()), PASSPHRASE)).entries[DOC], 'and opens with the passphrase');
    await waitFor(() => statusStore.get().lastBackupDestination === 'share', 'the share to be recorded');

    const rootElement = document.scrollingElement;
    assert(rootElement.scrollWidth <= rootElement.clientWidth, `no sideways scroll at 390px (${rootElement.scrollWidth} > ${rootElement.clientWidth})`);
    unmount();
    console.log('✓ Your Data backs up to the folder, remembers the key, and shares on a second tap');
}

// --- a later session: remembered folder and key, automatic backup --------------
{
    const later = makeDestinations();
    const state = await later.state();
    assert(state.folder && state.folder.name === folder.name && state.keyRemembered, 'the folder and the key (from IndexedDB) are there in a later session');
    clock = new Date(firstBackupAt.getTime() + 2 * DAY_MS + 2 * 60 * 60 * 1000);
    assert(await later.runAutomatic() === AutomaticBackupOutcome.BACKED_UP, 'the automatic backup runs a day later');
    const files = await folderFiles(folder);
    assert((await decodeDeviceBackup(files[backupFileName(clock)], PASSPHRASE)).entries[DOC], 'with the remembered key');
    console.log('✓ a later session reads the key back from IndexedDB and backs up automatically');
}

// --- the reminder banner ----------------------------------------------------------
{
    const bannerStorage = new InMemoryStorageProvider();
    bannerStorage.save(DOC, { world: 'mine' });
    const bannerStatus = new BackupStatusStore(bannerStorage);
    bannerStatus.update({ lastBackupAt: '2026-08-01T00:00:00.000Z' });
    const bannerBackup = new DeviceBackupUseCase({ storageProvider: bannerStorage, statusStore: bannerStatus });
    let now = new Date('2026-09-28T00:00:00Z');
    const reminder = new BackupReminder({ statusStore: bannerStatus, deviceBackup: bannerBackup, now: () => now });

    let opened = 0;
    const plain = mount(BackupReminderBanner, { backupReminder: reminder, backupDestinations: null }, { path: '/editor', onOpenYourData: () => { opened++; } });
    await settle();
    assert(/Last backup 58 days ago/.test(text(plain.host)), `the banner says how long ago (${text(plain.host)})`);
    click(plain.host.querySelector('.backup-reminder-now'));
    await waitFor(() => opened === 1, 'Back Up Now to open Your Data');
    click(plain.host.querySelector('.backup-reminder-snooze'));
    await settle();
    assert(!plain.host.querySelector('.backup-reminder-banner'), 'Remind Me in a Week hides it');
    plain.unmount();

    const onYourData = mount(BackupReminderBanner, { backupReminder: reminder, backupDestinations: null }, { path: '/settings/data' });
    now = new Date('2026-10-28T00:00:00Z');
    await settle();
    assert(!onYourData.host.querySelector('.backup-reminder-banner'), 'it never shows on Your Data itself');
    onYourData.unmount();

    // With a folder and a remembered key, Back Up Now backs up in one click.
    const oneClick = new BackupDestinations({
        deviceBackup: bannerBackup, statusStore: bannerStatus,
        valueStore,
        showDirectoryPicker: async () => folder, now: () => now
    });
    const withFolder = mount(BackupReminderBanner, { backupReminder: reminder, backupDestinations: oneClick }, { path: '/repository' });
    await settle();
    click(withFolder.host.querySelector('.backup-reminder-now'));
    await waitFor(() => /Backed up to/.test(text(withFolder.host)), 'the one-click backup');
    assert((await folderFiles(folder))['forkbuild-backup-2026-10-28.forkbuild-backup'], 'the banner wrote to the folder');
    assert(bannerStatus.get().lastBackupDestination === 'folder', 'and recorded it');
    withFolder.unmount();
    console.log('✓ the banner reminds, snoozes, stays off Your Data, and backs up in one click');
}

URL.createObjectURL = originalCreateObjectURL;
HTMLAnchorElement.prototype.click = originalClick;
