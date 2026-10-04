import { ref, computed, inject } from 'vue';
import { useEndpointSettingsForm } from '../composables/useEndpointSettingsForm.js';
import { splitNonEmptyLines } from '../../utils/splitNonEmptyLines.js';
import {
    DEFAULT_BLURT_API_NODES,
    DEFAULT_BLURT_EARLIEST_PERIOD,
    DEFAULT_BLURT_FOLLOWED_ACCOUNTS
} from '../../core/BlurtReadingConfiguration.js';
import { t } from '../i18n/i18n.js';

// Where Blurt posts are read from (applies on the next load, like the other
// network settings), and the account this device posts as (applies at once:
// it's read each time something is posted). As on the Steem page, the fields
// start from what is in effect and Save does nothing until one changes, so
// the defaults are never saved as a preference.
export default {
    name: 'BlurtSettingsView',
    setup() {
        const store = inject('blurtReadingConfigurationStore', null);
        const useCase = inject('setBlurtReadingConfigurationUseCase', null);
        const accountStore = inject('blurtAnnouncingConfigurationStore', null);
        const accountUseCase = inject('setBlurtAnnouncingConfigurationUseCase', null);
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
        const followedAccountsInput = ref('');
        const earliestPeriodInput = ref('');

        const form = useEndpointSettingsForm({
            store,
            useCase,
            buildRequest: () => {
                if (unchanged.value) return null;
                const apiNodes = splitNonEmptyLines(apiNodesInput.value);
                return {
                    apiNodes: apiNodes.length > 0 ? apiNodes : [...DEFAULT_BLURT_API_NODES],
                    followedAccounts: splitNonEmptyLines(followedAccountsInput.value),
                    earliestPeriod: earliestPeriodInput.value || DEFAULT_BLURT_EARLIEST_PERIOD
                };
            },
            fillInputs: (configuration) => {
                apiNodesInput.value = (configuration ? configuration.apiNodes : DEFAULT_BLURT_API_NODES).join('\n');
                followedAccountsInput.value = (configuration ? configuration.followedAccounts : DEFAULT_BLURT_FOLLOWED_ACCOUNTS).join('\n');
                earliestPeriodInput.value = configuration ? configuration.earliestPeriod : DEFAULT_BLURT_EARLIEST_PERIOD;
            }
        });

        // The fields still hold exactly what is in effect.
        const unchanged = computed(() => {
            const effective = form.configuration.value || {
                apiNodes: DEFAULT_BLURT_API_NODES, followedAccounts: DEFAULT_BLURT_FOLLOWED_ACCOUNTS, earliestPeriod: DEFAULT_BLURT_EARLIEST_PERIOD
            };
            return splitNonEmptyLines(apiNodesInput.value).join('\n') === effective.apiNodes.join('\n')
                && splitNonEmptyLines(followedAccountsInput.value).join('\n') === effective.followedAccounts.join('\n')
                && (earliestPeriodInput.value || DEFAULT_BLURT_EARLIEST_PERIOD) === effective.earliestPeriod;
        });

        const followedText = (accounts) => (accounts.length > 0 ? accounts.map((account) => `@${account}`).join(', ') : t('blurtSettingsView.nobody'));

        return {
            t,
            hasOverride: form.hasConfiguration, configuration: form.configuration, unchanged, followedText,
            apiNodesInput, followedAccountsInput, earliestPeriodInput,
            defaultApiNodes: DEFAULT_BLURT_API_NODES.join(', '),
            defaultEarliestPeriod: DEFAULT_BLURT_EARLIEST_PERIOD,
            saveError: form.saveError, saveStatus: form.saveStatus, clearStatus: form.clearStatus,
            save: form.save, resetToDefaults: form.clear,
            accountInput, savedAccount: accountForm.configuration, accountSaveError: accountForm.saveError,
            accountSaveStatus: accountForm.saveStatus, accountClearStatus: accountForm.clearStatus,
            saveAccount: accountForm.save, clearAccount: accountForm.clear
        };
    },
    template: `
        <section class="steem-reading-settings-view blurt-settings-view">
            <h1>Blurt</h1>
            <p class="form-hint form-hint--neutral">
                {{ t('blurtSettingsView.whereThisReplicaReadsBlurt') }}
            </p>

            <p v-if="hasOverride" class="form-hint form-hint--neutral">
                {{ t('blurtSettingsView.saved', { apiNodes: configuration.apiNodes.join(', '), followed: followedText(configuration.followedAccounts), earliestPeriod: configuration.earliestPeriod }) }}
            </p>
            <p v-else class="form-hint form-hint--neutral">
                {{ t('blurtSettingsView.usingTheDefaults', { apiNodes: defaultApiNodes, earliestPeriod: defaultEarliestPeriod }) }}
            </p>

            <div class="steem-reading-settings-form">
                <label class="form-label" for="blurt-api-nodes">{{ t('blurtSettingsView.apiNodesOnePerLine') }}</label>
                <textarea id="blurt-api-nodes" v-model="apiNodesInput" rows="3" class="form-textarea" placeholder="https://rpc.blurt.blog"></textarea>

                <label class="form-label" for="blurt-followed-accounts">{{ t('blurtSettingsView.followedAccountsOnePerLine') }}</label>
                <textarea id="blurt-followed-accounts" v-model="followedAccountsInput" rows="3" class="form-textarea" placeholder="someone"></textarea>
                <p class="form-hint form-hint--neutral">{{ t('blurtSettingsView.followedAccountsHint') }}</p>

                <label class="form-label" for="blurt-earliest-period">{{ t('blurtSettingsView.firstMonthToRead') }}</label>
                <input id="blurt-earliest-period" v-model="earliestPeriodInput" type="month" class="form-input">

                <p v-if="saveError" class="form-hint">{{ saveError }}</p>
                <p v-if="saveStatus === 'saved'" class="form-hint form-hint--neutral">{{ t('blurtSettingsView.savedReloadTheAppTo') }}</p>
                <p v-if="clearStatus === 'cleared'" class="form-hint form-hint--neutral">{{ t('blurtSettingsView.resetTheDefaultsApplyAfter') }}</p>

                <button class="action-btn action-btn--primary" @click="save" :disabled="unchanged">{{ t('blurtSettingsView.save') }}</button>
                <button class="action-btn" @click="resetToDefaults" :disabled="!hasOverride">{{ t('blurtSettingsView.resetToDefaults') }}</button>
            </div>

            <h2>{{ t('blurtSettingsView.posting') }}</h2>
            <p class="form-hint form-hint--neutral">
                {{ t('blurtSettingsView.toPostOnBlurtChoose') }}
            </p>
            <p v-if="savedAccount" class="form-hint form-hint--neutral">{{ t('blurtSettingsView.postingAs', { account: savedAccount.account }) }}</p>
            <p v-else class="form-hint form-hint--neutral">{{ t('blurtSettingsView.noAccountSetSoNothing') }}</p>

            <div class="steem-reading-settings-form">
                <label class="form-label" for="blurt-account">{{ t('blurtSettingsView.yourBlurtAccount') }}</label>
                <input id="blurt-account" v-model="accountInput" type="text" class="form-input" placeholder="yourname" autocomplete="off" spellcheck="false">

                <p v-if="accountSaveError" class="form-hint">{{ accountSaveError }}</p>
                <p v-if="accountSaveStatus === 'saved'" class="form-hint form-hint--neutral">{{ t('blurtSettingsView.accountSaved') }}</p>
                <p v-if="accountClearStatus === 'cleared'" class="form-hint form-hint--neutral">{{ t('blurtSettingsView.accountCleared') }}</p>

                <button class="action-btn action-btn--primary" @click="saveAccount" :disabled="!accountInput.trim()">{{ t('blurtSettingsView.saveAccount') }}</button>
                <button class="action-btn" @click="clearAccount">{{ t('blurtSettingsView.clear') }}</button>
            </div>
        </section>
    `
};
