import { ref, computed, inject, onMounted } from 'vue';
import { DEFAULT_BITCOIN_ESPLORA_API_URL } from '../../core/BitcoinEsploraConfiguration.js';

// Bitcoin Esplora Endpoint Settings UI.
//
// The missing user-facing seam over core/BitcoinEsploraConfiguration.js +
// storage/BitcoinEsploraConfigurationStore.js: every real Bitcoin-facing
// network call in this codebase (transaction broadcast, confirmation
// observation, wallet-funding UTXO lookup, OP_RETURN proof verification —
// anchoring/BitcoinEsplora*.js and anchoring/BitcoinOpReturnProofVerifier.js)
// already shares one hardcoded default host with no live override path; this
// page is the one ordinary product path a person has to change it, mirroring
// ui/views/ArweaveGatewaySettingsView.js's own shape exactly, one field
// instead of an ordered list — this endpoint backs a single conceptual role
// (see tests/BitcoinEndpointConfigurationUIReachabilityAudit.test.js's own
// Section E), never a failover set.
//
// THIS VIEW NEVER CONSTRUCTS OR INTERPRETS A BitcoinEsploraConfiguration
// ITSELF — it only reads one back from bitcoinEsploraConfigurationStore.get()
// to display what's on file, and saves a change through
// setBitcoinEsploraConfigurationUseCase.execute({ apiUrl }). An invalid URL
// is rejected by that use case's own construction step; this view only ever
// displays whatever message that throw carries.
//
// OPENING THIS PAGE NEVER WRITES ANYTHING — load() only ever reads
// store.get(). "Use Deployment Default" calls store.clear(), never
// save({ apiUrl: DEFAULT_BITCOIN_ESPLORA_API_URL }) — saving the default
// value would wrongly turn "no preference" into an explicit one that
// happens to match it.
//
// A CHANGE SAVED HERE TAKES EFFECT ON THE NEXT APPLICATION LOAD ONLY —
// ui/main.js resolves bitcoinEsploraConfigurationStore.get() once at
// startup; this view performs no live re-composition of its own.
export default {
    name: 'BitcoinEsploraSettingsView',
    setup() {
        const store = inject('bitcoinEsploraConfigurationStore', null);
        const setBitcoinEsploraConfigurationUseCase = inject('setBitcoinEsploraConfigurationUseCase', null);

        const configuration = ref(null);
        const apiUrlInput = ref('');
        const saveError = ref(null);
        const saveStatus = ref('idle'); // 'idle' | 'saved'
        const clearStatus = ref('idle'); // 'idle' | 'cleared'

        const hasOverride = computed(() => configuration.value !== null);
        // Shown only when no override is on file.
        const deploymentDefaultApiUrl = DEFAULT_BITCOIN_ESPLORA_API_URL;

        function load() {
            if (!store) return;
            configuration.value = store.get();
            apiUrlInput.value = configuration.value ? configuration.value.apiUrl : '';
        }

        function save() {
            if (!setBitcoinEsploraConfigurationUseCase || !apiUrlInput.value.trim()) return;
            saveError.value = null;
            clearStatus.value = 'idle';
            try {
                configuration.value = setBitcoinEsploraConfigurationUseCase.execute({ apiUrl: apiUrlInput.value.trim() });
                apiUrlInput.value = configuration.value.apiUrl;
                saveStatus.value = 'saved';
            } catch (error) {
                saveStatus.value = 'idle';
                saveError.value = error.message;
            }
        }

        function useDeploymentDefault() {
            if (!store) return;
            store.clear();
            configuration.value = null;
            apiUrlInput.value = '';
            saveError.value = null;
            saveStatus.value = 'idle';
            clearStatus.value = 'cleared';
        }

        onMounted(load);

        return {
            hasOverride, deploymentDefaultApiUrl, configuration, apiUrlInput,
            saveError, saveStatus, clearStatus, save, useDeploymentDefault
        };
    },
    template: `
        <section class="bitcoin-esplora-settings-view">
            <h1>Bitcoin Endpoint</h1>
            <p class="form-hint form-hint--neutral">
                Esplora-compatible endpoint used for Bitcoin anchor broadcasting, confirmation observation, wallet-funding lookups, and OP_RETURN proof verification. This setting affects retrieval and broadcast for Bitcoin anchoring only; it never changes any other substrate's configuration.
            </p>

            <p v-if="hasOverride" class="form-hint form-hint--neutral">
                Current override: {{ configuration.apiUrl }}
            </p>
            <p v-else class="form-hint form-hint--neutral">
                No override configured. Currently using the deployment default: {{ deploymentDefaultApiUrl }}
            </p>

            <div class="bitcoin-esplora-settings-form">
                <input
                    v-model="apiUrlInput"
                    type="text"
                    placeholder="https://blockstream.info/api"
                    class="bitcoin-esplora-input form-input"
                />

                <p v-if="saveError" class="form-hint">{{ saveError }}</p>
                <p v-if="saveStatus === 'saved'" class="form-hint form-hint--neutral">Saved.</p>
                <p v-if="clearStatus === 'cleared'" class="form-hint form-hint--neutral">Cleared — now using the deployment default.</p>

                <button class="action-btn action-btn--primary" @click="save" :disabled="!apiUrlInput.trim()">Save</button>
                <button class="action-btn" @click="useDeploymentDefault">Use Deployment Default</button>
            </div>
        </section>
    `
};
