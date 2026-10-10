import { ref, computed, inject } from 'vue';
import NetworkWriterSwitch from '../components/networkWriters/NetworkWriterSwitch.js';
import { useWritableNetworks } from '../components/networkWriters/useWritableNetworks.js';
import { useEndpointSettingsForm } from '../composables/useEndpointSettingsForm.js';
import { splitNonEmptyLines } from '../../utils/splitNonEmptyLines.js';
import {
    DEFAULT_STEEM_API_NODES,
    DEFAULT_STEEM_EARLIEST_PERIOD,
    DEFAULT_STEEM_THREAD_ACCOUNTS
} from '../../core/SteemReadingConfiguration.js';
import { t } from '../i18n/i18n.js';

// Where Steem announcements are read from (applies on the next load, like
// the other network settings), and the account this device posts as
// (applies at once: it's read each time something is announced). As on the
// other list pages (ui/composables/useEndpointListSettings.js), the fields
// start from what is in effect and Save does nothing until one changes, so
// the defaults are never saved as a preference.
export default {
    name: 'SteemReadingSettingsView',
    components: { NetworkWriterSwitch },
    setup() {
        // The account form only while this device posts to Steem (core/NetworkWriters.js).
        const { steemOn: postingOn } = useWritableNetworks();
        const store = inject('steemReadingConfigurationStore', null);
        const useCase = inject('setSteemReadingConfigurationUseCase', null);
        const accountStore = inject('steemAnnouncingConfigurationStore', null);
        const accountUseCase = inject('setSteemAnnouncingConfigurationUseCase', null);
        const accountInput = ref('');
        const accountForm = useEndpointSettingsForm({
            store: accountStore,
            useCase: accountUseCase,
            buildRequest: () => (accountInput.value.trim() ? { account: accountInput.value } : null),
            fillInputs: (configuration) => {
                accountInput.value = configuration ? configuration.account : '';
            }
        });

        const apiNodesInput = ref('');
        const threadAccountsInput = ref('');
        const earliestPeriodInput = ref('');

        const form = useEndpointSettingsForm({
            store,
            useCase,
            buildRequest: () => {
                if (unchanged.value) return null;
                const apiNodes = splitNonEmptyLines(apiNodesInput.value);
                const threadAccounts = splitNonEmptyLines(threadAccountsInput.value);
                return {
                    apiNodes: apiNodes.length > 0 ? apiNodes : [...DEFAULT_STEEM_API_NODES],
                    threadAccounts: threadAccounts.length > 0 ? threadAccounts : [...DEFAULT_STEEM_THREAD_ACCOUNTS],
                    earliestPeriod: earliestPeriodInput.value || DEFAULT_STEEM_EARLIEST_PERIOD
                };
            },
            fillInputs: (configuration) => {
                apiNodesInput.value = (configuration ? configuration.apiNodes : DEFAULT_STEEM_API_NODES).join('\n');
                threadAccountsInput.value = (configuration ? configuration.threadAccounts : DEFAULT_STEEM_THREAD_ACCOUNTS).join('\n');
                earliestPeriodInput.value = configuration ? configuration.earliestPeriod : DEFAULT_STEEM_EARLIEST_PERIOD;
            }
        });

        // The fields still hold exactly what is in effect.
        const unchanged = computed(() => {
            const effective = form.configuration.value || {
                apiNodes: DEFAULT_STEEM_API_NODES, threadAccounts: DEFAULT_STEEM_THREAD_ACCOUNTS, earliestPeriod: DEFAULT_STEEM_EARLIEST_PERIOD
            };
            return splitNonEmptyLines(apiNodesInput.value).join('\n') === effective.apiNodes.join('\n')
                && splitNonEmptyLines(threadAccountsInput.value).join('\n') === effective.threadAccounts.join('\n')
                && (earliestPeriodInput.value || DEFAULT_STEEM_EARLIEST_PERIOD) === effective.earliestPeriod;
        });

        return {
            t,
            hasOverride: form.hasConfiguration, configuration: form.configuration, unchanged,
            apiNodesInput, threadAccountsInput, earliestPeriodInput,
            defaultApiNodes: DEFAULT_STEEM_API_NODES.join(', '),
            defaultThreadAccounts: DEFAULT_STEEM_THREAD_ACCOUNTS.map((account) => `@${account}`).join(', '),
            defaultEarliestPeriod: DEFAULT_STEEM_EARLIEST_PERIOD,
            saveError: form.saveError, saveStatus: form.saveStatus, clearStatus: form.clearStatus,
            save: form.save, resetToDefaults: form.clear,
            accountInput, savedAccount: accountForm.configuration, accountSaveError: accountForm.saveError,
            accountSaveStatus: accountForm.saveStatus, accountClearStatus: accountForm.clearStatus,
            saveAccount: accountForm.save, clearAccount: accountForm.clear,
            postingOn
        };
    },
    template: `
        <section class="steem-reading-settings-view">
            <h1>Steem</h1>
            <p class="form-hint form-hint--neutral">
                {{ t('steemReadingSettingsView.whereThisReplicaReadsSteem') }}
            </p>

            <p v-if="hasOverride" class="form-hint form-hint--neutral">
                {{ t('steemReadingSettingsView.savedThreadsBy', { apiNodes: configuration.apiNodes.join(', '), threadAccounts: configuration.threadAccounts.map((a) => '@' + a).join(', '), earliestPeriod: configuration.earliestPeriod }) }}
            </p>
            <p v-else class="form-hint form-hint--neutral">
                {{ t('steemReadingSettingsView.usingTheDefaultsThreadsBy', { defaultApiNodes: defaultApiNodes, defaultThreadAccounts: defaultThreadAccounts, defaultEarliestPeriod: defaultEarliestPeriod }) }}
            </p>

            <div class="steem-reading-settings-form">
                <label class="form-label" for="steem-api-nodes">{{ t('steemReadingSettingsView.apiNodesOnePerLine') }}</label>
                <textarea id="steem-api-nodes" v-model="apiNodesInput" rows="3" class="form-textarea" placeholder="https://api.steemit.com"></textarea>

                <label class="form-label" for="steem-thread-accounts">{{ t('steemReadingSettingsView.threadAccountsOnePerLine') }}</label>
                <textarea id="steem-thread-accounts" v-model="threadAccountsInput" rows="2" class="form-textarea" placeholder="forkbuild"></textarea>

                <label class="form-label" for="steem-earliest-period">{{ t('steemReadingSettingsView.firstMonthToRead') }}</label>
                <input id="steem-earliest-period" v-model="earliestPeriodInput" type="month" class="form-input">

                <p v-if="saveError" class="form-hint">{{ saveError }}</p>
                <p v-if="saveStatus === 'saved'" class="form-hint form-hint--neutral">{{ t('steemReadingSettingsView.savedReloadTheAppTo') }}</p>
                <p v-if="clearStatus === 'cleared'" class="form-hint form-hint--neutral">{{ t('steemReadingSettingsView.resetTheDefaultsApplyAfter') }}</p>

                <button class="action-btn action-btn--primary" @click="save" :disabled="unchanged">{{ t('steemReadingSettingsView.save') }}</button>
                <button class="action-btn" @click="resetToDefaults" :disabled="!hasOverride">{{ t('steemReadingSettingsView.resetToDefaults') }}</button>
            </div>

            <h2>{{ t('steemReadingSettingsView.posting') }}</h2>
            <NetworkWriterSwitch writer="steem" :label="t('networkWriters.steemSwitch')" :hint="t('networkWriters.steemSwitchHint')" />
            <p v-if="!postingOn" class="form-hint form-hint--neutral steem-posting-off">{{ t('networkWriters.postingOff', { network: 'Steem' }) }}</p>
            <template v-if="postingOn">
            <p class="form-hint form-hint--neutral">
                {{ t('steemReadingSettingsView.toAnnounceOnSteemChoose') }}
            </p>
            <p v-if="savedAccount" class="form-hint form-hint--neutral">{{ t('steemReadingSettingsView.postingAs', { account: savedAccount.account }) }}</p>
            <p v-else class="form-hint form-hint--neutral">{{ t('steemReadingSettingsView.noAccountSetSoNothing') }}</p>

            <div class="steem-reading-settings-form">
                <label class="form-label" for="steem-account">{{ t('steemReadingSettingsView.yourSteemAccount') }}</label>
                <input id="steem-account" v-model="accountInput" type="text" class="form-input" placeholder="yourname" autocomplete="off" spellcheck="false">

                <p v-if="accountSaveError" class="form-hint">{{ accountSaveError }}</p>
                <p v-if="accountSaveStatus === 'saved'" class="form-hint form-hint--neutral">{{ t('steemReadingSettingsView.saved') }}</p>
                <p v-if="accountClearStatus === 'cleared'" class="form-hint form-hint--neutral">{{ t('steemReadingSettingsView.cleared') }}</p>

                <button class="action-btn action-btn--primary" @click="saveAccount" :disabled="!accountInput.trim()">{{ t('steemReadingSettingsView.saveAccount') }}</button>
                <button class="action-btn" @click="clearAccount">{{ t('steemReadingSettingsView.clear') }}</button>
            </div>
            </template>
        </section>
    `
};
