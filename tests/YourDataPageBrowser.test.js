// @environment browser
import { createApp, nextTick } from 'vue';
import YourDataView from '../ui/views/YourDataView.js';
import { DeviceBackupUseCase } from '../application/backup/DeviceBackupUseCase.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// The Your Data page, rendered by real Vue with the shipped CSS: it lists
// what is stored, backs it up to an encrypted file, and restores that file
// onto another device (merge and replace), then reloads the page.

await new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/main.css';
    link.onload = resolve;
    link.onerror = () => reject(new Error('css/main.css failed to load'));
    document.head.appendChild(link);
});

const DOC = '11111111-1111-4111-8111-111111111111';
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const settle = async () => { await nextTick(); await new Promise((r) => setTimeout(r, 0)); await nextTick(); };

async function waitFor(condition, what) {
    for (let i = 0; i < 400; i++) {
        if (condition()) return;
        await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`timed out waiting for ${what}`);
}

function setInput(input, value) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
}

function mount(storage, { persisted = false, onReload = () => {} } = {}) {
    const host = document.createElement('div');
    host.style.width = '390px';
    document.body.style.margin = '0';
    document.body.appendChild(host);
    const app = createApp(YourDataView);
    app.provide('deviceBackupUseCase', new DeviceBackupUseCase({ storageProvider: storage }));
    app.provide('navigatorStorage', {
        estimate: async () => ({ usage: 1234567, quota: 5000000000 }),
        persisted: async () => persisted,
        persist: async () => false
    });
    app.provide('reloadPage', onReload);
    app.mount(host);
    return { host, unmount: () => { app.unmount(); host.remove(); } };
}

// Capture the downloaded backup instead of saving it.
const downloads = [];
const originalCreateObjectURL = URL.createObjectURL;
URL.createObjectURL = (blob) => { downloads.push(blob); return 'blob:captured'; };
const originalClick = HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click = function click() {
    if (this.href !== 'blob:captured') originalClick.call(this);
};

// --- back up ---------------------------------------------------------------
const source = new InMemoryStorageProvider();
source.save(DOC, { world: 'mine' });
source.save('forkbuild-index', [{ id: DOC, title: 'My House' }]);
source.save('personal-structure:s1', { name: 'Tower' });
source.save('local-session', { identityId: 'x' });
source.save('content:someone-else', 'big');

let backupFile;
{
    const { host, unmount } = mount(source);
    await settle();
    await waitFor(() => /Using 1\.2 MB/.test(text(host)), 'the storage estimate');
    const summary = [...host.querySelectorAll('.your-data-table tr')].map((row) => [...row.cells].map(text).join(' ')).join('; ');
    assert(summary.includes('Documents and unsaved changes 2 entries') && summary.includes('My Structures 1 entry'), `the page lists what is stored (${summary})`);
    assert(host.querySelector('.your-data-persist'), 'the page offers to ask the browser to keep the data');

    host.querySelector('.your-data-backup').click();
    await settle();
    assert(/Choose a passphrase/.test(text(host)), 'a backup needs a passphrase');

    setInput(host.querySelector('.your-data-backup-passphrase'), 'backup passphrase');
    await settle();
    setInput(host.querySelector('.your-data-backup-confirmation'), 'backup passphrase');
    host.querySelector('.your-data-backup').click();
    await waitFor(() => host.querySelector('.your-data-backup-result'), 'the backup to finish');
    const result = text(host.querySelector('.your-data-backup-result'));
    assert(downloads.length === 1, 'the backup is downloaded');
    assert(/Left out 1 downloaded build/.test(result), `other people's builds are left out by default (${result})`);
    backupFile = new File([await downloads[0].arrayBuffer()], 'forkbuild-backup.forkbuild-backup');

    const root = document.scrollingElement;
    assert(root.scrollWidth <= root.clientWidth, `no sideways scroll at 390px (${root.scrollWidth} > ${root.clientWidth})`);
    unmount();
}

async function openBackupOn(host, passphrase) {
    const input = host.querySelector('.your-data-restore-file');
    const transfer = new DataTransfer();
    transfer.items.add(backupFile);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
    await waitFor(() => host.querySelector('.your-data-restore-passphrase'), 'the file to be read');
    setInput(host.querySelector('.your-data-restore-passphrase'), passphrase);
    host.querySelector('.your-data-open').click();
}

// --- restore: merge ----------------------------------------------------------
{
    const target = new InMemoryStorageProvider();
    target.save('personal-structure:s1', { name: 'Tower, edited here' });
    let reloads = 0;
    const { host, unmount } = mount(target, { persisted: true, onReload: () => { reloads++; } });
    await settle();
    await waitFor(() => /agreed not to remove/.test(text(host)), 'the persisted notice');

    await openBackupOn(host, 'wrong passphrase');
    await waitFor(() => /Wrong passphrase/.test(text(host)), 'a wrong passphrase to be refused');

    setInput(host.querySelector('.your-data-restore-passphrase'), 'backup passphrase');
    host.querySelector('.your-data-open').click();
    await waitFor(() => host.querySelector('.your-data-restore-preview'), 'the backup to open');
    assert(/My Structures: 1/.test(text(host.querySelector('.your-data-restore-preview'))), 'the preview says what the file holds');
    assert(host.querySelector('.your-data-mode-merge').checked, 'adding what is missing is the default');

    host.querySelector('.your-data-restore').click();
    await waitFor(() => reloads === 1, 'the page to reload after the restore');
    assert(target.load(DOC).world === 'mine', 'the document is restored');
    assert(target.load('personal-structure:s1').name === 'Tower, edited here', 'merge keeps this device\'s version');
    assert(target.load('local-session') === null, 'the session is not restored');
    assert(/Kept this device's version of 1/.test(text(host)), 'the result says what was kept');
    unmount();
}

// --- restore: replace ----------------------------------------------------------
{
    const target = new InMemoryStorageProvider();
    target.save('personal-structure:other', { name: 'Only here' });
    let reloads = 0;
    const { host, unmount } = mount(target, { onReload: () => { reloads++; } });
    await settle();
    await openBackupOn(host, 'backup passphrase');
    await waitFor(() => host.querySelector('.your-data-restore-preview'), 'the backup to open');
    const replace = host.querySelector('.your-data-mode-replace');
    replace.checked = true;
    replace.dispatchEvent(new Event('change'));
    await settle();
    assert(host.querySelector('.your-data-restore').disabled, 'replacing needs an explicit confirmation');
    const confirm = host.querySelector('.your-data-confirm-replace input');
    confirm.checked = true;
    confirm.dispatchEvent(new Event('change'));
    await settle();
    host.querySelector('.your-data-restore').click();
    await waitFor(() => reloads === 1, 'the page to reload after the restore');
    assert(target.load('personal-structure:other') === null, 'replace deletes what the device had');
    assert(target.load('personal-structure:s1').name === 'Tower', 'replace writes the backup');
    unmount();
}

URL.createObjectURL = originalCreateObjectURL;
HTMLAnchorElement.prototype.click = originalClick;
