import { ref, inject } from 'vue';
import { useEndpointSettingsForm } from '../composables/useEndpointSettingsForm.js';
import { splitNonEmptyLines } from '../../utils/splitNonEmptyLines.js';
import {
    DEFAULT_STEEM_API_NODES,
    DEFAULT_STEEM_EARLIEST_PERIOD,
    DEFAULT_STEEM_THREAD_ACCOUNTS
} from '../../core/SteemReadingConfiguration.js';

// Where Steem announcements are read from. Saved settings apply the next
// time the app loads, like the other network settings.
export default {
    name: 'SteemReadingSettingsView',
    setup() {
        const store = inject('steemReadingConfigurationStore', null);
        const useCase = inject('setSteemReadingConfigurationUseCase', null);

        const apiNodesInput = ref('');
        const threadAccountsInput = ref('');
        const earliestPeriodInput = ref('');

        const form = useEndpointSettingsForm({
            store,
            useCase,
            buildRequest: () => {
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

        return {
            hasOverride: form.hasConfiguration, configuration: form.configuration,
            apiNodesInput, threadAccountsInput, earliestPeriodInput,
            defaultApiNodes: DEFAULT_STEEM_API_NODES.join(', '),
            defaultThreadAccounts: DEFAULT_STEEM_THREAD_ACCOUNTS.map((account) => `@${account}`).join(', '),
            defaultEarliestPeriod: DEFAULT_STEEM_EARLIEST_PERIOD,
            saveError: form.saveError, saveStatus: form.saveStatus, clearStatus: form.clearStatus,
            save: form.save, useDefaults: form.clear
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
                <p v-if="clearStatus === 'cleared'" class="form-hint form-hint--neutral">Cleared. The defaults apply after a reload.</p>

                <button class="action-btn action-btn--primary" @click="save">Save</button>
                <button class="action-btn" @click="useDefaults">Use Defaults</button>
            </div>
        </section>
    `
};
