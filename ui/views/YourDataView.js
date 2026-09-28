import { computed, inject, onMounted, reactive, ref } from 'vue';
import { BACKUP_ENTRY_GROUP_LABELS } from '../../application/backup/BackupEntryGroups.js';
import { BACKUP_FILE_EXTENSION, BackupFileError, IncorrectBackupPassphraseError } from '../../application/backup/DeviceBackupFile.js';
import { RestoreMode } from '../../application/backup/DeviceBackupUseCase.js';
import { BackupDestination, REMINDER_INTERVAL_OPTIONS_DAYS } from '../../application/backup/BackupStatusStore.js';
import { backupFileName } from '../../application/backup/BackupFolder.js';
import { evaluateNewPassphrase } from '../../application/identity/NewPassphrasePolicy.js';
import { formatByteSize } from '../../utils/formatByteSize.js';
import { formatRelativeVisit } from '../../utils/formatRelativeVisit.js';

const REMINDER_LABELS = { 7: 'Every week', 14: 'Every 2 weeks', 30: 'Every month', 90: 'Every 3 months', 0: 'Never' };
const DESTINATION_LABELS = {
    [BackupDestination.FILE]: 'to a downloaded file',
    [BackupDestination.SHARE]: 'shared to another app',
    [BackupDestination.FOLDER]: 'to the backup folder',
    [BackupDestination.RESTORE]: 'restored from a backup made then'
};

// Backs up everything ForkBuild keeps in this browser to one encrypted
// file, and restores it here or on another device. Clearing the browser's
// site data deletes all of it, so this page is the one place to keep a copy.
export default {
    name: 'YourDataView',
    setup() {
        const deviceBackup = inject('deviceBackupUseCase', null);
        const navigatorStorage = inject('navigatorStorage', globalThis.navigator ? globalThis.navigator.storage : null);
        const reloadPage = inject('reloadPage', () => window.location.reload());
        const statusStore = inject('backupStatusStore', null);
        const destinations = inject('backupDestinations', null);
        // Web Share with files: phones and some desktop browsers.
        const fileSharing = inject('fileSharing', globalThis.navigator && typeof globalThis.navigator.share === 'function' ? globalThis.navigator : null);

        // --- reminders and destinations ----------------------------------------
        const status = ref(statusStore ? statusStore.get() : null);
        const destinationState = ref({ folder: null, keyRemembered: false });
        const folderSupported = Boolean(destinations && destinations.folderSupported);
        const destinationForm = reactive({ busy: false, error: '', message: '' });
        const reminderOptions = REMINDER_INTERVAL_OPTIONS_DAYS.map((days) => ({ days, label: REMINDER_LABELS[days] }));

        function refreshStatus() {
            if (statusStore) status.value = statusStore.get();
        }

        async function refreshDestinations() {
            if (!destinations) return;
            try {
                destinationState.value = await destinations.state();
            } catch {
                destinationState.value = { folder: null, keyRemembered: false };
            }
        }

        const lastBackupText = computed(() => {
            if (!status.value || !status.value.lastBackupAt) return null;
            const when = formatRelativeVisit(new Date(status.value.lastBackupAt).getTime()) || 'recently';
            const where = DESTINATION_LABELS[status.value.lastBackupDestination];
            return where ? `${when}, ${where}` : when;
        });

        function setReminderInterval(event) {
            status.value = statusStore.update({ reminderIntervalDays: Number(event.target.value), snoozedUntil: null });
        }

        function setAutomatic(event) {
            status.value = statusStore.update({ automaticFolderBackup: event.target.checked, lastAutomaticBackupError: null });
        }

        async function runDestinationAction(action, done = '') {
            destinationForm.error = '';
            destinationForm.message = '';
            destinationForm.busy = true;
            try {
                await action();
                destinationForm.message = done;
            } catch (e) {
                destinationForm.error = e.message;
            } finally {
                destinationForm.busy = false;
                await refreshDestinations();
                refreshStatus();
            }
        }

        const chooseFolder = () => runDestinationAction(() => destinations.chooseFolder());
        const forgetFolder = () => runDestinationAction(() => destinations.forgetFolder(), 'ForkBuild no longer saves to that folder. The backups already in it stay.');
        const forgetKey = () => runDestinationAction(() => destinations.forgetKey(), 'The backup key is forgotten. Backups need the passphrase again.');

        // --- what is stored ------------------------------------------------
        const groups = ref({});
        const usage = ref(null);
        const quota = ref(null);
        const persisted = ref(null);
        const persistRefused = ref(false);

        function groupRows(counts) {
            return Object.keys(BACKUP_ENTRY_GROUP_LABELS)
                .filter((group) => counts[group])
                .map((group) => ({ group, label: BACKUP_ENTRY_GROUP_LABELS[group], count: counts[group] }));
        }
        const storedRows = computed(() => groupRows(groups.value));

        async function refreshStorage() {
            groups.value = deviceBackup ? deviceBackup.summarize() : {};
            if (!navigatorStorage) return;
            try {
                if (typeof navigatorStorage.estimate === 'function') {
                    const estimate = await navigatorStorage.estimate();
                    usage.value = Number.isFinite(estimate.usage) ? estimate.usage : null;
                    quota.value = Number.isFinite(estimate.quota) ? estimate.quota : null;
                }
                if (typeof navigatorStorage.persisted === 'function') {
                    persisted.value = await navigatorStorage.persisted();
                }
            } catch {
                // Some browsers refuse these in private windows; the page works without them.
            }
        }

        async function requestPersistence() {
            persistRefused.value = false;
            try {
                persisted.value = await navigatorStorage.persist();
                persistRefused.value = !persisted.value;
            } catch {
                persistRefused.value = true;
            }
        }

        onMounted(() => {
            refreshStorage();
            refreshDestinations();
        });

        // --- back up ---------------------------------------------------------
        const backupForm = reactive({
            passphrase: '', confirmation: '', includeDownloadedContent: false, rememberKey: false,
            attempted: false, busy: false, error: '', result: null
        });
        const backupPassphraseHint = computed(() => backupForm.attempted && !usesRememberedKey()
            ? evaluateNewPassphrase({ passphrase: backupForm.passphrase, confirmation: backupForm.confirmation, offerUnprotected: false }).message
            : null);
        const canShareFiles = Boolean(fileSharing && typeof fileSharing.canShare === 'function'
            && safeCanShare(fileSharing, [new File([new Uint8Array(1)], 'test' + BACKUP_FILE_EXTENSION)]));

        // A folder backup with an empty passphrase uses the remembered key.
        let pendingDestination = null;
        // An encrypted backup waiting for a second tap on Share Backup.
        let preparedShare = null;
        function usesRememberedKey() {
            return pendingDestination === BackupDestination.FOLDER && !backupForm.passphrase && destinationState.value.keyRemembered;
        }

        async function backUp(destination) {
            pendingDestination = destination;
            backupForm.attempted = true;
            backupForm.error = '';
            backupForm.result = null;
            const evaluation = evaluateNewPassphrase({ passphrase: backupForm.passphrase, confirmation: backupForm.confirmation, offerUnprotected: false });
            const ready = evaluation.ok || usesRememberedKey() || (destination === BackupDestination.SHARE && preparedShare);
            if (!ready || backupForm.busy) return;
            backupForm.busy = true;
            try {
                const passphrase = backupForm.passphrase || null;
                const remember = Boolean(passphrase && backupForm.rememberKey && destinations);
                let result;
                if (destination === BackupDestination.FOLDER) {
                    // The folder permission prompt must follow the click closely,
                    // so the key is derived afterwards.
                    const written = await destinations.backUpToFolder(passphrase ? { passphrase } : {});
                    if (remember) await destinations.rememberKey(passphrase);
                    result = { rows: groupRows(written.groups), where: `Saved as "${written.fileName}" in "${written.folderName}".` };
                } else {
                    let created = destination === BackupDestination.SHARE ? preparedShare : null;
                    if (!created) {
                        const key = remember ? await destinations.rememberKey(passphrase) : null;
                        created = await deviceBackup.createBackupFile({
                            ...(key ? { key } : { passphrase }),
                            includeDownloadedContent: backupForm.includeDownloadedContent
                        });
                    }
                    preparedShare = null;
                    const name = backupFileName(created.createdAt);
                    if (destination === BackupDestination.SHARE) {
                        let shared;
                        try {
                            shared = await shareBytes(fileSharing, created.bytes, name);
                        } catch (error) {
                            // Browsers only open the share sheet right after a tap, and
                            // encrypting can take longer than that: keep the file for the next tap.
                            if (error && error.name === 'NotAllowedError') {
                                preparedShare = created;
                                backupForm.error = 'The backup is ready: tap Share Backup again to send it.';
                                return;
                            }
                            throw error;
                        }
                        if (!shared) return;
                    } else {
                        downloadBytes(created.bytes, name);
                    }
                    statusStore && statusStore.recordBackup(destination, created.createdAt);
                    result = {
                        rows: groupRows(created.groups), size: created.bytes.length, leftOutContentCount: created.leftOutContentCount,
                        where: destination === BackupDestination.SHARE ? 'Shared.' : 'Downloaded.'
                    };
                }
                backupForm.result = result;
                backupForm.passphrase = '';
                backupForm.confirmation = '';
                backupForm.attempted = false;
            } catch (e) {
                backupForm.error = e.message;
            } finally {
                backupForm.busy = false;
                pendingDestination = null;
                refreshStatus();
                refreshDestinations();
            }
        }

        const createBackup = () => backUp(BackupDestination.FILE);
        const shareBackup = () => backUp(BackupDestination.SHARE);
        const backUpToFolder = () => backUp(BackupDestination.FOLDER);

        // --- restore ---------------------------------------------------------
        const restoreForm = reactive({
            fileName: '', bytes: null, passphrase: '', busy: false, error: '',
            preview: null, mode: RestoreMode.MERGE, confirmReplace: false, result: null
        });

        function onRestoreFileChosen(event) {
            const file = event.target.files && event.target.files[0];
            event.target.value = '';
            restoreForm.preview = null;
            restoreForm.result = null;
            restoreForm.error = '';
            if (!file) return;
            restoreForm.fileName = file.name;
            const reader = new FileReader();
            reader.onload = () => { restoreForm.bytes = new Uint8Array(reader.result); };
            reader.onerror = () => { restoreForm.error = 'That file could not be read.'; };
            reader.readAsArrayBuffer(file);
        }

        async function openBackup() {
            restoreForm.error = '';
            if (!restoreForm.bytes || restoreForm.busy) return;
            restoreForm.busy = true;
            try {
                const { createdAt, entries, groups: inFile } = await deviceBackup.readBackupFile(restoreForm.bytes, restoreForm.passphrase);
                restoreForm.preview = { createdAt, entries, rows: groupRows(inFile) };
                restoreForm.passphrase = '';
            } catch (e) {
                restoreForm.error = e instanceof IncorrectBackupPassphraseError || e instanceof BackupFileError
                    ? e.message
                    : 'That file could not be opened: ' + e.message;
            } finally {
                restoreForm.busy = false;
            }
        }

        const canRestore = computed(() => Boolean(restoreForm.preview) && !restoreForm.busy
            && (restoreForm.mode !== RestoreMode.REPLACE || restoreForm.confirmReplace));

        async function restoreBackup() {
            if (!canRestore.value) return;
            restoreForm.busy = true;
            restoreForm.error = '';
            try {
                restoreForm.result = await deviceBackup.restore(restoreForm.preview.entries, { mode: restoreForm.mode, createdAt: restoreForm.preview.createdAt });
                restoreForm.preview = null;
                restoreForm.bytes = null;
                // Every store read its data when the app started; running on
                // with those copies could write old data over the restore.
                reloadPage();
            } catch (e) {
                restoreForm.error = 'The restore did not finish: ' + e.message;
            } finally {
                restoreForm.busy = false;
            }
        }

        function cancelRestore() {
            restoreForm.preview = null;
            restoreForm.bytes = null;
            restoreForm.fileName = '';
            restoreForm.confirmReplace = false;
        }

        function formatDate(iso) {
            const date = new Date(iso);
            return Number.isNaN(date.getTime()) ? 'an unknown date' : date.toLocaleString();
        }

        return {
            available: Boolean(deviceBackup), storedRows, usage, quota, persisted, persistRefused,
            canPersist: Boolean(navigatorStorage && typeof navigatorStorage.persist === 'function'),
            requestPersistence, formatByteSize, formatDate,
            backupForm, backupPassphraseHint, createBackup, shareBackup, backUpToFolder, canShareFiles,
            status, lastBackupText, reminderOptions, setReminderInterval, setAutomatic,
            destinationsAvailable: Boolean(destinations), folderSupported, destinationState, destinationForm,
            chooseFolder, forgetFolder, forgetKey, statusAvailable: Boolean(statusStore),
            restoreForm, onRestoreFileChosen, openBackup, canRestore, restoreBackup, cancelRestore,
            RestoreMode, backupFileExtension: BACKUP_FILE_EXTENSION
        };
    },
    template: `
        <section class="your-data-view">
            <h1>Your Data</h1>
            <p class="form-hint form-hint--neutral">
                Everything ForkBuild keeps lives only in this browser, on this device. Clearing this site's data
                in the browser deletes all of it for good. Back it up to a file to keep a copy, or to move it to
                another device.
            </p>

            <p v-if="!available" class="form-hint">Backups are not available in this copy of ForkBuild.</p>

            <div class="your-data-section">
                <h2>On this device</h2>
                <table v-if="storedRows.length" class="your-data-table">
                    <tbody>
                        <tr v-for="row in storedRows" :key="row.group">
                            <td>{{ row.label }}</td>
                            <td class="your-data-count">{{ row.count }} {{ row.count === 1 ? 'entry' : 'entries' }}</td>
                        </tr>
                    </tbody>
                </table>
                <p v-else class="form-hint form-hint--neutral">Nothing is stored yet.</p>
                <p v-if="usage !== null" class="form-hint form-hint--neutral">
                    Using {{ formatByteSize(usage) }}<template v-if="quota"> of the {{ formatByteSize(quota) }} this browser allows</template>.
                </p>
                <p v-if="persisted === true" class="form-hint form-hint--neutral">
                    The browser has agreed not to remove this data when the disk is low. Clearing site data still deletes it.
                </p>
                <template v-else-if="persisted === false && canPersist">
                    <p class="form-hint form-hint--neutral">
                        The browser may remove this data when the disk is low.
                    </p>
                    <button type="button" class="action-btn action-btn--secondary your-data-persist" @click="requestPersistence">Ask the Browser to Keep It</button>
                    <p v-if="persistRefused" class="form-hint">
                        The browser said no. Browsers usually agree once the site is bookmarked, installed or used often.
                    </p>
                </template>
            </div>

            <div v-if="available" class="your-data-section">
                <h2>Back up</h2>
                <p class="form-hint form-hint--neutral">
                    The backup holds your documents, identities and their private keys, structures, publications,
                    peers, friends, chat history and settings. It is encrypted with the passphrase you choose here,
                    which is needed to restore it. There is no way to open it without that passphrase.
                </p>
                <input v-model="backupForm.passphrase" type="password" class="modal-input your-data-backup-passphrase"
                       autocomplete="new-password" placeholder="Backup passphrase" @keydown.enter="createBackup" />
                <input v-if="backupForm.passphrase" v-model="backupForm.confirmation" type="password" class="modal-input your-data-backup-confirmation"
                       autocomplete="new-password" placeholder="Repeat the passphrase" @keydown.enter="createBackup" />
                <label class="your-data-checkbox">
                    <input type="checkbox" v-model="backupForm.includeDownloadedContent" class="your-data-include-downloaded" />
                    Include builds downloaded from other people (can be large; they can usually be fetched again)
                </label>
                <label v-if="destinationsAvailable && backupForm.passphrase" class="your-data-checkbox">
                    <input type="checkbox" v-model="backupForm.rememberKey" class="your-data-remember-key" />
                    Remember the backup key on this device, for one-click and automatic backups (the passphrase itself isn't kept, and the key can only make backups, not open them)
                </label>
                <p v-if="backupPassphraseHint" class="identity-unlock-error">{{ backupPassphraseHint }}</p>
                <p v-if="backupForm.error" class="identity-unlock-error">{{ backupForm.error }}</p>
                <div class="your-data-buttons">
                    <button type="button" class="action-btn action-btn--primary your-data-backup" :disabled="backupForm.busy" @click="createBackup">
                        {{ backupForm.busy ? 'Backing up…' : 'Back Up to a File' }}
                    </button>
                    <button v-if="canShareFiles" type="button" class="action-btn action-btn--secondary your-data-share" :disabled="backupForm.busy" @click="shareBackup">
                        Share Backup…
                    </button>
                    <button v-if="destinationState.folder" type="button" class="action-btn action-btn--secondary your-data-backup-folder" :disabled="backupForm.busy" @click="backUpToFolder">
                        Back Up to "{{ destinationState.folder.name }}"
                    </button>
                </div>
                <p v-if="destinationState.folder && destinationState.keyRemembered" class="form-hint form-hint--neutral">
                    The backup key is remembered: Back Up to "{{ destinationState.folder.name }}" works without the passphrase.
                </p>
                <div v-if="backupForm.result" class="identity-import-result your-data-backup-result">
                    <p>{{ backupForm.result.where }}<template v-if="backupForm.result.size"> ({{ formatByteSize(backupForm.result.size) }})</template> Keep the backup and its passphrase somewhere safe.</p>
                    <ul>
                        <li v-for="row in backupForm.result.rows" :key="row.group">{{ row.label }}: {{ row.count }}</li>
                    </ul>
                    <p v-if="backupForm.result.leftOutContentCount">
                        Left out {{ backupForm.result.leftOutContentCount }} downloaded {{ backupForm.result.leftOutContentCount === 1 ? 'build' : 'builds' }}.
                    </p>
                </div>
            </div>

            <div v-if="available && statusAvailable" class="your-data-section your-data-reminders">
                <h2>Reminders and automatic backups</h2>
                <p class="form-hint form-hint--neutral your-data-last-backup">
                    <template v-if="lastBackupText">Last backup: {{ lastBackupText }}.</template>
                    <template v-else>This device hasn't been backed up yet.</template>
                </p>
                <label class="form-field">
                    <span class="form-label">Remind me to back up</span>
                    <select class="form-input your-data-reminder-interval" :value="status.reminderIntervalDays" @change="setReminderInterval">
                        <option v-for="option in reminderOptions" :key="option.days" :value="option.days">{{ option.label }}</option>
                    </select>
                </label>

                <h3>Backup folder</h3>
                <template v-if="folderSupported">
                    <p class="form-hint form-hint--neutral">
                        Choose a folder your cloud storage syncs (Dropbox, OneDrive, iCloud Drive, Google Drive) or a USB drive, and
                        backups go there too, one file a day, keeping the newest ten.
                    </p>
                    <p v-if="destinationState.folder" class="your-data-folder">
                        Folder: <strong>{{ destinationState.folder.name }}</strong>
                        <template v-if="destinationState.folder.permission !== 'granted'"> (the browser asks again before the next backup)</template>
                    </p>
                    <div class="your-data-buttons">
                        <button type="button" class="action-btn action-btn--secondary your-data-choose-folder" :disabled="destinationForm.busy" @click="chooseFolder">
                            {{ destinationState.folder ? 'Choose Another Folder' : 'Choose Folder…' }}
                        </button>
                        <button v-if="destinationState.folder" type="button" class="action-btn action-btn--secondary your-data-forget-folder" :disabled="destinationForm.busy" @click="forgetFolder">Stop Using This Folder</button>
                        <button v-if="destinationState.keyRemembered" type="button" class="action-btn action-btn--secondary your-data-forget-key" :disabled="destinationForm.busy" @click="forgetKey">Forget Backup Key</button>
                    </div>
                    <label class="your-data-checkbox">
                        <input type="checkbox" class="your-data-automatic" :checked="status.automaticFolderBackup"
                               :disabled="!destinationState.folder || !destinationState.keyRemembered" @change="setAutomatic" />
                        Back up to the folder automatically once a day while ForkBuild is open
                    </label>
                    <p v-if="!destinationState.folder || !destinationState.keyRemembered" class="form-hint form-hint--neutral">
                        Needs a folder, and the backup key remembered: tick "Remember the backup key" when you back up.
                    </p>
                    <p v-if="status.automaticFolderBackup && destinationState.folder && destinationState.folder.permission !== 'granted'" class="form-hint">
                        Automatic backups wait until you back up to the folder once in this session and allow it when the browser asks.
                    </p>
                    <p v-if="status.lastAutomaticBackupError" class="identity-unlock-error">The last automatic backup failed: {{ status.lastAutomaticBackupError }}</p>
                </template>
                <p v-else class="form-hint form-hint--neutral">
                    This browser can't save to a folder (Chrome and Edge on computers can).
                    <template v-if="canShareFiles"> Share Backup sends the file to another app, such as a cloud drive or email.</template>
                    Download the file and move it to cloud storage or another disk yourself.
                </p>
                <p v-if="destinationForm.error" class="identity-unlock-error">{{ destinationForm.error }}</p>
                <p v-if="destinationForm.message" class="form-hint form-hint--neutral">{{ destinationForm.message }}</p>
            </div>

            <div v-if="available" class="your-data-section">
                <h2>Restore</h2>
                <p class="form-hint form-hint--neutral">
                    Close ForkBuild in any other tab first: a tab left open can write its older data back.
                    The page reloads when the restore is done.
                </p>

                <div v-if="restoreForm.result" class="identity-import-result your-data-restore-result">
                    <p>
                        Restored {{ restoreForm.result.written }} {{ restoreForm.result.written === 1 ? 'entry' : 'entries' }}.
                        <template v-if="restoreForm.result.kept"> Kept this device's version of {{ restoreForm.result.kept }}.</template>
                        <template v-if="restoreForm.result.skipped"> Skipped {{ restoreForm.result.skipped }} this version of ForkBuild doesn't know.</template>
                    </p>
                    <p>Reloading…</p>
                </div>

                <template v-else-if="!restoreForm.preview">
                    <label class="form-field">
                        <span class="form-label">Backup file</span>
                        <input type="file" :accept="backupFileExtension" class="your-data-restore-file" @change="onRestoreFileChosen" />
                    </label>
                    <template v-if="restoreForm.bytes">
                        <input v-model="restoreForm.passphrase" type="password" class="modal-input your-data-restore-passphrase"
                               autocomplete="off" placeholder="Backup passphrase" @keydown.enter="openBackup" />
                        <button type="button" class="action-btn action-btn--secondary your-data-open" :disabled="restoreForm.busy" @click="openBackup">
                            {{ restoreForm.busy ? 'Opening…' : 'Open Backup' }}
                        </button>
                    </template>
                </template>

                <div v-else class="identity-import-preview your-data-restore-preview">
                    <p><strong>{{ restoreForm.fileName }}</strong>, made {{ formatDate(restoreForm.preview.createdAt) }}, holds:</p>
                    <ul>
                        <li v-for="row in restoreForm.preview.rows" :key="row.group">{{ row.label }}: {{ row.count }}</li>
                    </ul>
                    <label class="your-data-radio">
                        <input type="radio" v-model="restoreForm.mode" :value="RestoreMode.MERGE" class="your-data-mode-merge" />
                        Add what this device doesn't have (where both have something, this device's version is kept)
                    </label>
                    <label class="your-data-radio">
                        <input type="radio" v-model="restoreForm.mode" :value="RestoreMode.REPLACE" class="your-data-mode-replace" />
                        Replace everything on this device with the backup
                    </label>
                    <label v-if="restoreForm.mode === RestoreMode.REPLACE" class="your-data-checkbox your-data-confirm-replace">
                        <input type="checkbox" v-model="restoreForm.confirmReplace" />
                        I understand this deletes everything ForkBuild has stored on this device first
                    </label>
                    <div class="modal-actions">
                        <button type="button" class="modal-btn modal-btn--secondary" @click="cancelRestore">Cancel</button>
                        <button type="button" class="modal-btn modal-btn--primary your-data-restore" :disabled="!canRestore" @click="restoreBackup">
                            {{ restoreForm.busy ? 'Restoring…' : 'Restore' }}
                        </button>
                    </div>
                </div>
                <p v-if="restoreForm.error" class="identity-unlock-error">{{ restoreForm.error }}</p>
            </div>
        </section>
    `
};

function downloadBytes(bytes, filename) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    // The download has started by the time this runs; revoking sooner can cancel it in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function safeCanShare(sharing, files) {
    try {
        return sharing.canShare({ files });
    } catch {
        return false;
    }
}

// Resolves to true once shared, false if the person closed the share sheet.
async function shareBytes(sharing, bytes, filename) {
    const file = new File([bytes], filename, { type: 'application/octet-stream' });
    try {
        await sharing.share({ files: [file], title: 'ForkBuild backup' });
        return true;
    } catch (error) {
        if (error && error.name === 'AbortError') return false;
        throw error;
    }
}
