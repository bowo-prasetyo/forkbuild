import { computed, inject, onMounted, reactive, ref } from 'vue';
import { BACKUP_ENTRY_GROUP_LABELS } from '../../application/backup/BackupEntryGroups.js';
import { BACKUP_FILE_EXTENSION, BackupFileError, IncorrectBackupPassphraseError } from '../../application/backup/DeviceBackupFile.js';
import { RestoreMode } from '../../application/backup/DeviceBackupUseCase.js';
import { BackupDestination, REMINDER_INTERVAL_OPTIONS_DAYS } from '../../application/backup/BackupStatusStore.js';
import { backupFileName } from '../../application/backup/BackupFolder.js';
import { evaluateNewPassphrase } from '../../application/identity/NewPassphrasePolicy.js';
import { formatByteSize } from '../../utils/formatByteSize.js';
import { formatRelativeVisit } from '../../utils/formatRelativeVisit.js';
import { displayText, errorText, hasMessage, t } from '../i18n/i18n.js';
import I18nText from '../i18n/I18nText.js';

const REMINDER_LABELS = { 7: t('yourDataView.everyWeek'), 14: t('yourDataView.every2Weeks'), 30: t('yourDataView.everyMonth'), 90: t('yourDataView.every3Months'), 0: t('yourDataView.never') };
const DESTINATION_LABELS = {
    [BackupDestination.FILE]: 'to a downloaded file',
    [BackupDestination.SHARE]: 'shared to another app',
    [BackupDestination.FOLDER]: 'to the backup folder',
    [BackupDestination.RESTORE]: 'restored from a backup made then'
};

// Backs up everything ForkBuild keeps in this browser to one encrypted
// file, and restores it here or on another device. Clearing the browser's
// site data deletes all of it, so this page is the one place to keep a copy.
// A backup group's name by its id ('avatar-and-worlds' → backupGroup.avatarAndWorlds),
// or application/backup's English for a group without a message.
function backupGroupLabel(group) {
    const key = `backupGroup.${group.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase())}`;
    return hasMessage(key) ? t(key) : BACKUP_ENTRY_GROUP_LABELS[group];
}

export default {
    name: 'YourDataView',
    components: { I18nText },
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
                destinationForm.error = errorText(e);
            } finally {
                destinationForm.busy = false;
                await refreshDestinations();
                refreshStatus();
            }
        }

        const chooseFolder = () => runDestinationAction(() => destinations.chooseFolder());
        const forgetFolder = () => runDestinationAction(() => destinations.forgetFolder(), t('yourDataView.folderForgotten'));
        const forgetKey = () => runDestinationAction(() => destinations.forgetKey(), t('yourDataView.keyForgotten'));

        // --- what is stored ------------------------------------------------
        const groups = ref({});
        const usage = ref(null);
        const quota = ref(null);
        const persisted = ref(null);
        const persistRefused = ref(false);

        function groupRows(counts) {
            return Object.keys(BACKUP_ENTRY_GROUP_LABELS)
                .filter((group) => counts[group])
                .map((group) => ({ group, label: backupGroupLabel(group), count: counts[group] }));
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
            ? displayText(evaluateNewPassphrase({ passphrase: backupForm.passphrase, confirmation: backupForm.confirmation, offerUnprotected: false }).message)
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
                    result = { rows: groupRows(written.groups), where: t('yourDataView.savedAsIn', { file: written.fileName, folder: written.folderName }) };
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
                                backupForm.error = t('yourDataView.backupReadyShareAgain');
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
                        where: destination === BackupDestination.SHARE ? t('yourDataView.shared') : t('yourDataView.downloaded')
                    };
                }
                backupForm.result = result;
                backupForm.passphrase = '';
                backupForm.confirmation = '';
                backupForm.attempted = false;
            } catch (e) {
                backupForm.error = errorText(e);
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
            reader.onerror = () => { restoreForm.error = t('yourDataView.fileCouldNotBeRead'); };
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
                    ? errorText(e)
                    : t('yourDataView.fileCouldNotBeOpened', { error: errorText(e) });
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
                restoreForm.error = t('yourDataView.restoreDidNotFinish', { error: errorText(e) });
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
            t,
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
            <h1>{{ t('yourDataView.yourData') }}</h1>
            <p class="form-hint form-hint--neutral">
                {{ t('yourDataView.everythingForkbuildKeepsLivesOnly') }}
            </p>

            <p v-if="!available" class="form-hint">{{ t('yourDataView.backupsAreNotAvailableIn') }}</p>

            <div class="your-data-section">
                <h2>{{ t('yourDataView.onThisDevice') }}</h2>
                <table v-if="storedRows.length" class="your-data-table">
                    <tbody>
                        <tr v-for="row in storedRows" :key="row.group">
                            <td>{{ row.label }}</td>
                            <td class="your-data-count">{{ t('yourDataView.entryCount', { count: row.count }) }}</td>
                        </tr>
                    </tbody>
                </table>
                <p v-else class="form-hint form-hint--neutral">{{ t('yourDataView.nothingIsStoredYet') }}</p>
                <p v-if="usage !== null" class="form-hint form-hint--neutral">
                    {{ t('yourDataView.using', { usage: formatByteSize(usage) }) }}<template v-if="quota"> {{ t('yourDataView.ofTheThisBrowserAllows', { quota: formatByteSize(quota) }) }}</template>.
                </p>
                <p v-if="persisted === true" class="form-hint form-hint--neutral">
                    {{ t('yourDataView.theBrowserHasAgreedNot') }}
                </p>
                <template v-else-if="persisted === false && canPersist">
                    <p class="form-hint form-hint--neutral">
                        {{ t('yourDataView.theBrowserMayRemoveThis') }}
                    </p>
                    <button type="button" class="action-btn action-btn--secondary your-data-persist" @click="requestPersistence">{{ t('yourDataView.askTheBrowserToKeep') }}</button>
                    <p v-if="persistRefused" class="form-hint">
                        {{ t('yourDataView.theBrowserSaidNoBrowsers') }}
                    </p>
                </template>
            </div>

            <div v-if="available" class="your-data-section">
                <h2>{{ t('yourDataView.backUp') }}</h2>
                <p class="form-hint form-hint--neutral">
                    {{ t('yourDataView.theBackupHoldsYourDocuments') }}
                </p>
                <input v-model="backupForm.passphrase" type="password" class="modal-input your-data-backup-passphrase"
                       autocomplete="new-password" :placeholder="t('yourDataView.backupPassphrase')" @keydown.enter="createBackup" />
                <input v-if="backupForm.passphrase" v-model="backupForm.confirmation" type="password" class="modal-input your-data-backup-confirmation"
                       autocomplete="new-password" :placeholder="t('yourDataView.repeatThePassphrase')" @keydown.enter="createBackup" />
                <label class="your-data-checkbox">
                    <input type="checkbox" v-model="backupForm.includeDownloadedContent" class="your-data-include-downloaded" />
                    {{ t('yourDataView.includeBuildsDownloadedFromOther') }}
                </label>
                <label v-if="destinationsAvailable && backupForm.passphrase" class="your-data-checkbox">
                    <input type="checkbox" v-model="backupForm.rememberKey" class="your-data-remember-key" />
                    {{ t('yourDataView.rememberTheBackupKeyOn') }}
                </label>
                <p v-if="backupPassphraseHint" class="identity-unlock-error">{{ backupPassphraseHint }}</p>
                <p v-if="backupForm.error" class="identity-unlock-error">{{ backupForm.error }}</p>
                <div class="your-data-buttons">
                    <button type="button" class="action-btn action-btn--primary your-data-backup" :disabled="backupForm.busy" @click="createBackup">
                        {{ backupForm.busy ? t('yourDataView.backingUp') : t('yourDataView.backUpToAFile') }}
                    </button>
                    <button v-if="canShareFiles" type="button" class="action-btn action-btn--secondary your-data-share" :disabled="backupForm.busy" @click="shareBackup">
                        {{ t('yourDataView.shareBackup') }}
                    </button>
                    <button v-if="destinationState.folder" type="button" class="action-btn action-btn--secondary your-data-backup-folder" :disabled="backupForm.busy" @click="backUpToFolder">
                        {{ t('yourDataView.backUpTo', { name: destinationState.folder.name }) }}
                    </button>
                </div>
                <p v-if="destinationState.folder && destinationState.keyRemembered" class="form-hint form-hint--neutral">
                    {{ t('yourDataView.theBackupKeyIsRemembered', { name: destinationState.folder.name }) }}
                </p>
                <div v-if="backupForm.result" class="identity-import-result your-data-backup-result">
                    <p>{{ backupForm.result.where }}<template v-if="backupForm.result.size"> ({{ formatByteSize(backupForm.result.size) }})</template> {{ t('yourDataView.keepTheBackupAndIts') }}</p>
                    <ul>
                        <li v-for="row in backupForm.result.rows" :key="row.group">{{ row.label }}: {{ row.count }}</li>
                    </ul>
                    <p v-if="backupForm.result.leftOutContentCount">
                        {{ t('yourDataView.leftOutBuilds', { count: backupForm.result.leftOutContentCount }) }}
                    </p>
                </div>
            </div>

            <div v-if="available && statusAvailable" class="your-data-section your-data-reminders">
                <h2>{{ t('yourDataView.remindersAndAutomaticBackups') }}</h2>
                <p class="form-hint form-hint--neutral your-data-last-backup">
                    <template v-if="lastBackupText">{{ t('yourDataView.lastBackup', { lastBackupText: lastBackupText }) }}</template>
                    <template v-else>{{ t('yourDataView.thisDeviceHasnTBeen') }}</template>
                </p>
                <label class="form-field">
                    <span class="form-label">{{ t('yourDataView.remindMeToBackUp') }}</span>
                    <select class="form-input your-data-reminder-interval" :value="status.reminderIntervalDays" @change="setReminderInterval">
                        <option v-for="option in reminderOptions" :key="option.days" :value="option.days">{{ option.label }}</option>
                    </select>
                </label>

                <h3>{{ t('yourDataView.backupFolder') }}</h3>
                <template v-if="folderSupported">
                    <p class="form-hint form-hint--neutral">
                        {{ t('yourDataView.chooseAFolderYourCloud') }}
                    </p>
                    <p v-if="destinationState.folder" class="your-data-folder">
                        <I18nText keypath="yourDataView.folder"><template #folder><strong>{{ destinationState.folder.name }}</strong></template></I18nText>
                        <template v-if="destinationState.folder.permission !== 'granted'"> {{ t('yourDataView.theBrowserAsksAgainBefore') }}</template>
                    </p>
                    <div class="your-data-buttons">
                        <button type="button" class="action-btn action-btn--secondary your-data-choose-folder" :disabled="destinationForm.busy" @click="chooseFolder">
                            {{ destinationState.folder ? t('yourDataView.chooseAnotherFolder') : t('yourDataView.chooseFolder') }}
                        </button>
                        <button v-if="destinationState.folder" type="button" class="action-btn action-btn--secondary your-data-forget-folder" :disabled="destinationForm.busy" @click="forgetFolder">{{ t('yourDataView.stopUsingThisFolder') }}</button>
                        <button v-if="destinationState.keyRemembered" type="button" class="action-btn action-btn--secondary your-data-forget-key" :disabled="destinationForm.busy" @click="forgetKey">{{ t('yourDataView.forgetBackupKey') }}</button>
                    </div>
                    <label class="your-data-checkbox">
                        <input type="checkbox" class="your-data-automatic" :checked="status.automaticFolderBackup"
                               :disabled="!destinationState.folder || !destinationState.keyRemembered" @change="setAutomatic" />
                        {{ t('yourDataView.backUpToTheFolder') }}
                    </label>
                    <p v-if="!destinationState.folder || !destinationState.keyRemembered" class="form-hint form-hint--neutral">
                        {{ t('yourDataView.needsAFolderAndThe') }}
                    </p>
                    <p v-if="status.automaticFolderBackup && destinationState.folder && destinationState.folder.permission !== 'granted'" class="form-hint">
                        {{ t('yourDataView.automaticBackupsWaitUntilYou') }}
                    </p>
                    <p v-if="status.lastAutomaticBackupError" class="identity-unlock-error">{{ t('yourDataView.theLastAutomaticBackupFailed', { lastAutomaticBackupError: status.lastAutomaticBackupError }) }}</p>
                </template>
                <p v-else class="form-hint form-hint--neutral">
                    {{ t('yourDataView.thisBrowserCanTSave') }}
                    <template v-if="canShareFiles"> {{ t('yourDataView.shareBackupSendsTheFile') }}</template>
                    {{ t('yourDataView.downloadTheFileAndMove') }}
                </p>
                <p v-if="destinationForm.error" class="identity-unlock-error">{{ destinationForm.error }}</p>
                <p v-if="destinationForm.message" class="form-hint form-hint--neutral">{{ destinationForm.message }}</p>
            </div>

            <div v-if="available" class="your-data-section">
                <h2>{{ t('yourDataView.restore') }}</h2>
                <p class="form-hint form-hint--neutral">
                    {{ t('yourDataView.closeForkbuildInAnyOther') }}
                </p>

                <div v-if="restoreForm.result" class="identity-import-result your-data-restore-result">
                    <p>
                        {{ t('yourDataView.restoredEntries', { count: restoreForm.result.written }) }}
                        <template v-if="restoreForm.result.kept"> {{ t('yourDataView.keptThisDeviceSVersion', { kept: restoreForm.result.kept }) }}</template>
                        <template v-if="restoreForm.result.skipped"> {{ t('yourDataView.skippedThisVersionOfForkbuild', { skipped: restoreForm.result.skipped }) }}</template>
                    </p>
                    <p>{{ t('yourDataView.reloading') }}</p>
                </div>

                <template v-else-if="!restoreForm.preview">
                    <label class="form-field">
                        <span class="form-label">{{ t('yourDataView.backupFile') }}</span>
                        <input type="file" :accept="backupFileExtension" class="your-data-restore-file" @change="onRestoreFileChosen" />
                    </label>
                    <template v-if="restoreForm.bytes">
                        <input v-model="restoreForm.passphrase" type="password" class="modal-input your-data-restore-passphrase"
                               autocomplete="off" :placeholder="t('yourDataView.backupPassphrase')" @keydown.enter="openBackup" />
                        <button type="button" class="action-btn action-btn--secondary your-data-open" :disabled="restoreForm.busy" @click="openBackup">
                            {{ restoreForm.busy ? t('yourDataView.opening') : t('yourDataView.openBackup') }}
                        </button>
                    </template>
                </template>

                <div v-else class="identity-import-preview your-data-restore-preview">
                    <p><I18nText keypath="yourDataView.madeHolds" :params="{ createdAt: formatDate(restoreForm.preview.createdAt) }"><template #file><strong>{{ restoreForm.fileName }}</strong></template></I18nText></p>
                    <ul>
                        <li v-for="row in restoreForm.preview.rows" :key="row.group">{{ row.label }}: {{ row.count }}</li>
                    </ul>
                    <label class="your-data-radio">
                        <input type="radio" v-model="restoreForm.mode" :value="RestoreMode.MERGE" class="your-data-mode-merge" />
                        {{ t('yourDataView.addWhatThisDeviceDoesn') }}
                    </label>
                    <label class="your-data-radio">
                        <input type="radio" v-model="restoreForm.mode" :value="RestoreMode.REPLACE" class="your-data-mode-replace" />
                        {{ t('yourDataView.replaceEverythingOnThisDevice') }}
                    </label>
                    <label v-if="restoreForm.mode === RestoreMode.REPLACE" class="your-data-checkbox your-data-confirm-replace">
                        <input type="checkbox" v-model="restoreForm.confirmReplace" />
                        {{ t('yourDataView.iUnderstandThisDeletesEverything') }}
                    </label>
                    <div class="modal-actions">
                        <button type="button" class="modal-btn modal-btn--secondary" @click="cancelRestore">{{ t('yourDataView.cancel') }}</button>
                        <button type="button" class="modal-btn modal-btn--primary your-data-restore" :disabled="!canRestore" @click="restoreBackup">
                            {{ restoreForm.busy ? t('yourDataView.restoring') : t('yourDataView.restore2') }}
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
        await sharing.share({ files: [file], title: t('yourDataView.forkbuildBackup') });
        return true;
    } catch (error) {
        if (error && error.name === 'AbortError') return false;
        throw error;
    }
}
