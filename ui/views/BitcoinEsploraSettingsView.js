import { inject } from 'vue';
import { useEndpointListSettings } from '../composables/useEndpointListSettings.js';
import { DEFAULT_BITCOIN_ESPLORA_API_URLS } from '../../core/BitcoinEsploraConfiguration.js';

// Bitcoin Esplora Endpoint Settings UI.
//
// The missing user-facing seam over core/BitcoinEsploraConfiguration.js +
// storage/BitcoinEsploraConfigurationStore.js: every real Bitcoin-facing
// network call in this codebase (transaction broadcast, confirmation
// observation, wallet-funding UTXO lookup, OP_RETURN proof verification —
// anchoring/BitcoinEsplora*.js and anchoring/BitcoinOpReturnProofVerifier.js)
// already shares one hardcoded default host with no live override path; this
// page is the one ordinary product path a person has to change it, mirroring
// ui/views/ArweaveGatewaySettingsView.js's own shape: one endpoint per line,
// tried in order — see anchoring/BitcoinEsploraFailover.js.
//
// THIS VIEW NEVER CONSTRUCTS OR INTERPRETS A BitcoinEsploraConfiguration
// ITSELF — it only reads one back from bitcoinEsploraConfigurationStore.get()
// to display what's on file, and saves a change through
// setBitcoinEsploraConfigurationUseCase.execute({ apiUrls }). An invalid URL
// is rejected by that use case's own construction step; this view only ever
// displays whatever message that throw carries.
//
// OPENING THIS PAGE NEVER WRITES ANYTHING — the shared load() (ui/composables/
// useEndpointSettingsForm.js) only ever reads store.get(). With nothing on
// file the textarea starts from DEFAULT_BITCOIN_ESPLORA_API_URLS, and Save
// stays disabled until it differs (ui/composables/useEndpointListSettings.js).
// "Reset to Defaults" calls store.clear(), never a save of the default list
// — saving it would wrongly turn "no preference" into an explicit one that
// happens to match today's defaults.
//
// A CHANGE SAVED HERE TAKES EFFECT ON THE NEXT APPLICATION LOAD ONLY —
// ui/main.js resolves bitcoinEsploraConfigurationStore.get() once at
// startup; this view performs no live re-composition of its own.
export default {
    name: 'BitcoinEsploraSettingsView',
    setup() {
        const settings = useEndpointListSettings({
            store: inject('bitcoinEsploraConfigurationStore', null),
            useCase: inject('setBitcoinEsploraConfigurationUseCase', null),
            defaults: DEFAULT_BITCOIN_ESPLORA_API_URLS,
            entriesOf: (configuration) => configuration.apiUrls,
            toRequest: (apiUrls) => ({ apiUrls })
        });
        return { ...settings, apiUrlInput: settings.input };
    },
    template: `
        <section class="bitcoin-esplora-settings-view">
            <h1>Bitcoin Endpoint</h1>
            <p class="form-hint form-hint--neutral">
                Esplora-compatible endpoint(s) used for Bitcoin anchor broadcasting, confirmation observation, wallet-funding lookups, and OP_RETURN proof verification. One per line, in the order they should be tried — if the first does not respond, the next one is used. This setting affects Bitcoin anchoring only; it never changes any other substrate's configuration.
            </p>

            <p v-if="hasOverride" class="form-hint form-hint--neutral">Using your saved endpoints:</p>
            <p v-else class="form-hint form-hint--neutral">Using the default endpoints:</p>
            <ul class="endpoint-settings-list">
                <li v-for="url in effectiveEntries" :key="url">{{ url }}</li>
            </ul>

            <div class="bitcoin-esplora-settings-form">
                <textarea
                    v-model="apiUrlInput"
                    placeholder="https://blockstream.info/api"
                    rows="3"
                    class="bitcoin-esplora-input form-textarea"
                ></textarea>

                <p v-if="saveError" class="form-hint">{{ saveError }}</p>
                <p v-if="saveStatus === 'saved'" class="form-hint form-hint--neutral">Saved.</p>
                <p v-if="clearStatus === 'cleared'" class="form-hint form-hint--neutral">Reset — now using the default endpoints.</p>

                <button class="action-btn action-btn--primary" @click="save" :disabled="!canSave">Save</button>
                <button class="action-btn" @click="resetToDefaults" :disabled="!hasOverride">Reset to Defaults</button>
            </div>
        </section>
    `
};
