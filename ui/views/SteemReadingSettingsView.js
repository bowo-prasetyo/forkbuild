import { ref, computed, inject } from 'vue';
import { useEndpointSettingsForm } from '../composables/useEndpointSettingsForm.js';
import { splitNonEmptyLines } from '../../utils/splitNonEmptyLines.js';
import {
    DEFAULT_STEEM_API_NODES,
    DEFAULT_STEEM_EARLIEST_PERIOD,
    DEFAULT_STEEM_THREAD_ACCOUNTS
} from '../../core/SteemReadingConfiguration.js';

// Where Steem announcements are read from (applies on the next load, like
// the other network settings), and the account this device posts as
// (applies at once: it's read each time something is announced). As on the
// other list pages (ui/composables/useEndpointListSettings.js), the fields
// start from what is in effect and Save does nothing until one changes, so
// the defaults are never saved as a preference.
export default {
    name: 'SteemReadingSettingsView',
    setup() {
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
            hasOverride: form.hasConfiguration, configuration: form.configuration, unchanged,
            apiNodesInput, threadAccountsInput, earliestPeriodInput,
            defaultApiNodes: DEFAULT_STEEM_API_NODES.join(', '),
            defaultThreadAccounts: DEFAULT_STEEM_THREAD_ACCOUNTS.map((account) => `@${account}`).join(', '),
            defaultEarliestPeriod: DEFAULT_STEEM_EARLIEST_PERIOD,
            saveError: form.saveError, saveStatus: form.saveStatus, clearStatus: form.clearStatus,
            save: form.save, resetToDefaults: form.clear,
            accountInput, savedAccount: accountForm.configuration, accountSaveError: accountForm.saveError,
            accountSaveStatus: accountForm.saveStatus, accountClearStatus: accountForm.clearStatus,
            saveAccount: accountForm.save, clearAccount: accountForm.clear
        };
    },
    template: `
        <section class="steem-reading-settings-view">
            <h1>Steem</h1>
            <p class="form-hint form-hint--neutral">
                Where this replica reads Steem announcements: Publications, Snapshots, Place Naming and Commentary posted
                as replies to monthly discovery threads. Every announcement is verified before it is used. Reading needs
                no Steem account. Changes apply the next time the app loads.
            </p>

            <p v-if="hasOverride" class="form-hint form-hint--neutral">
                Saved: {{ configuration.apiNodes.join(', ') }} · threads by {{ configuration.threadAccounts.map((a) => '@' + a).join(', ') }} · from {{ configuration.earliestPeriod }}
            </p>
            <p v-else class="form-hint form-hint--neutral">
                Using the defaults: {{ defaultApiNodes }} · threads by {{ defaultThreadAccounts }} · from {{ defaultEarliestPeriod }}
            </p>

            <div class="steem-reading-settings-form">
                <label class="form-label" for="steem-api-nodes">API nodes, one per line, tried in order</label>
                <textarea id="steem-api-nodes" v-model="apiNodesInput" rows="3" class="form-textarea" placeholder="https://api.steemit.com"></textarea>

                <label class="form-label" for="steem-thread-accounts">Thread accounts, one per line</label>
                <textarea id="steem-thread-accounts" v-model="threadAccountsInput" rows="2" class="form-textarea" placeholder="forkbuild"></textarea>

                <label class="form-label" for="steem-earliest-period">First month to read</label>
                <input id="steem-earliest-period" v-model="earliestPeriodInput" type="month" class="form-input">

                <p v-if="saveError" class="form-hint">{{ saveError }}</p>
                <p v-if="saveStatus === 'saved'" class="form-hint form-hint--neutral">Saved. Reload the app to use it.</p>
                <p v-if="clearStatus === 'cleared'" class="form-hint form-hint--neutral">Reset. The defaults apply after a reload.</p>

                <button class="action-btn action-btn--primary" @click="save" :disabled="unchanged">Save</button>
                <button class="action-btn" @click="resetToDefaults" :disabled="!hasOverride">Reset to Defaults</button>
            </div>

            <h2>Posting</h2>
            <p class="form-hint form-hint--neutral">
                To announce on Steem, choose Steem in a Distribute dialog or when posting a comment. Posts are replies
                to this month's discovery thread, signed by Steem Keychain with your account's posting key; ForkBuild
                never sees the key. Payout is declined on every post.
            </p>
            <p v-if="savedAccount" class="form-hint form-hint--neutral">Posting as @{{ savedAccount.account }}.</p>
            <p v-else class="form-hint form-hint--neutral">No account set, so nothing can be posted to Steem.</p>

            <div class="steem-reading-settings-form">
                <label class="form-label" for="steem-account">Your Steem account</label>
                <input id="steem-account" v-model="accountInput" type="text" class="form-input" placeholder="yourname" autocomplete="off" spellcheck="false">

                <p v-if="accountSaveError" class="form-hint">{{ accountSaveError }}</p>
                <p v-if="accountSaveStatus === 'saved'" class="form-hint form-hint--neutral">Saved.</p>
                <p v-if="accountClearStatus === 'cleared'" class="form-hint form-hint--neutral">Cleared.</p>

                <button class="action-btn action-btn--primary" @click="saveAccount" :disabled="!accountInput.trim()">Save Account</button>
                <button class="action-btn" @click="clearAccount">Clear</button>
            </div>
        </section>
    `
};
