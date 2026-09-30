import { inject, onMounted, ref, watch } from 'vue';
import { BackupReminderReason } from '../../application/backup/BackupReminder.js';
import { t } from '../i18n/i18n.js';

export const YOUR_DATA_PATH = '/settings/data';

// Shown under the header on every page but Your Data when this device
// hasn't been backed up for the interval chosen there (or ever, a week
// after it first held your work). Back Up Now writes to the backup folder
// in one click when one is set up with a remembered key, and otherwise
// opens Your Data. The host passes the current route path and navigates
// on `open-your-data`.
export default {
    name: 'BackupReminderBanner',
    props: {
        path: { type: String, default: '' }
    },
    emits: ['open-your-data'],
    setup(props, { emit }) {
        const backupReminder = inject('backupReminder', null);
        const backupDestinations = inject('backupDestinations', null);
        const reminder = ref(null);
        const busy = ref(false);
        const message = ref('');
        let hideTimer = null;

        function check() {
            if (!backupReminder || props.path === YOUR_DATA_PATH) {
                reminder.value = null;
                return;
            }
            try {
                reminder.value = backupReminder.check();
            } catch {
                reminder.value = null;
            }
        }

        async function backUpNow() {
            if (busy.value) return;
            let oneClick = false;
            if (backupDestinations) {
                try {
                    const state = await backupDestinations.state();
                    oneClick = Boolean(state.folder && state.keyRemembered);
                } catch {
                    oneClick = false;
                }
            }
            if (!oneClick) {
                emit('open-your-data');
                return;
            }
            busy.value = true;
            try {
                const { folderName } = await backupDestinations.backUpToFolder();
                message.value = t('backupReminderBanner.backedUpTo', { folder: folderName });
                hideTimer = setTimeout(() => { message.value = ''; check(); }, 4000);
            } catch {
                emit('open-your-data');
            } finally {
                busy.value = false;
            }
        }

        function snooze() {
            backupReminder.snooze();
            check();
        }

        onMounted(check);
        watch(() => props.path, () => {
            clearTimeout(hideTimer);
            message.value = '';
            check();
        });

        return { t, reminder, busy, message, backUpNow, snooze, BackupReminderReason };
    },
    template: `
        <div v-if="message" class="backup-reminder-banner backup-reminder-banner--done" role="status">{{ message }}</div>
        <div v-else-if="reminder" class="backup-reminder-banner" role="note">
            <span class="backup-reminder-text">
                <template v-if="reminder.reason === BackupReminderReason.NEVER">
                    <strong>{{ t('backupReminderBanner.yourWorkIsnTBacked') }}</strong> {{ t('backupReminderBanner.itLivesOnlyInThis') }}
                </template>
                <template v-else>
                    <strong>{{ t('backupReminderBanner.lastBackupDaysAgo', { count: reminder.daysSinceBackup }) }}</strong> {{ t('backupReminderBanner.changesSinceThenLiveOnly') }}
                </template>
            </span>
            <span class="backup-reminder-actions">
                <button type="button" class="action-btn action-btn--primary backup-reminder-now" :disabled="busy" @click="backUpNow">
                    {{ busy ? t('backupReminderBanner.backingUp') : t('backupReminderBanner.backUpNow') }}
                </button>
                <button type="button" class="action-btn action-btn--secondary backup-reminder-snooze" @click="snooze">{{ t('backupReminderBanner.remindMeInAWeek') }}</button>
            </span>
        </div>
    `
};
