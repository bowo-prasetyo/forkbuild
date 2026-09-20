import { ref, computed, inject, onMounted } from 'vue';
import { DEFAULT_IPFS_GATEWAY_URL } from '../../core/IpfsGatewayConfiguration.js';

// 0.9.665 — IPFS Gateway Settings UI. Mirrors ui/views/
// ArweaveGatewaySettingsView.js's own pre-multi-gateway shape: a single
// URL input, not a multi-line list — content/IpfsGatewayContentStore.js
// only ever supports one gateway per instance (see core/
// IpfsGatewayConfiguration.js's own header).
//
// THIS VIEW NEVER CONSTRUCTS OR INTERPRETS AN IpfsGatewayConfiguration
// ITSELF — it only reads one back from ipfsGatewayConfigurationStore.get()
// to display what's on file, and saves a change through
// setIpfsGatewayConfigurationUseCase.execute({ gatewayUrl }). An invalid
// URL is rejected by that use case's own construction step; this view
// only ever displays whatever message that throw carries.
//
// OPENING THIS PAGE NEVER WRITES ANYTHING — load() only ever reads
// store.get(). "Use Deployment Default" calls store.clear(), never
// save({ gatewayUrl: DEFAULT_IPFS_GATEWAY_URL }) — saving the default
// value would wrongly turn "no preference" into an explicit one that
// happens to match it.
//
// A CHANGE SAVED HERE TAKES EFFECT ON THE NEXT APPLICATION LOAD ONLY —
// ui/main.js resolves ipfsGatewayConfigurationStore.get() once at startup;
// this view performs no live re-composition of its own.
export default {
    name: 'IpfsGatewaySettingsView',
    setup() {
        const store = inject('ipfsGatewayConfigurationStore', null);
        const setIpfsGatewayConfigurationUseCase = inject('setIpfsGatewayConfigurationUseCase', null);

        const configuration = ref(null);
        const gatewayUrlInput = ref('');
        const saveError = ref(null);
        const saveStatus = ref('idle'); // 'idle' | 'saving' | 'saved'
        const clearStatus = ref('idle'); // 'idle' | 'cleared'

        const hasOverride = computed(() => configuration.value !== null);
        const effectiveGatewayUrl = computed(() => (
            configuration.value ? configuration.value.gatewayUrl : DEFAULT_IPFS_GATEWAY_URL
        ));

        function load() {
            if (!store) return;
            configuration.value = store.get();
            gatewayUrlInput.value = configuration.value ? configuration.value.gatewayUrl : '';
        }

        function save() {
            if (!setIpfsGatewayConfigurationUseCase || !gatewayUrlInput.value.trim()) return;
            saveError.value = null;
            clearStatus.value = 'idle';
            saveStatus.value = 'saving';
            try {
                configuration.value = setIpfsGatewayConfigurationUseCase.execute({ gatewayUrl: gatewayUrlInput.value.trim() });
                gatewayUrlInput.value = configuration.value.gatewayUrl;
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
            gatewayUrlInput.value = '';
            saveError.value = null;
            saveStatus.value = 'idle';
            clearStatus.value = 'cleared';
        }

        onMounted(load);

        return {
            hasOverride, effectiveGatewayUrl, configuration, gatewayUrlInput,
            saveError, saveStatus, clearStatus, save, useDeploymentDefault
        };
    },
    template: `
        <section class="ipfs-gateway-settings-view">
            <h1>IPFS Gateway</h1>
            <p class="form-hint form-hint--neutral">
                Gateway used for retrieving IPFS content — resolving an ipfs:// Snapshot Placement, and the
                "Verify IPFS Content" check on the Publications page. This setting affects retrieval only; it
                never changes where your own content gets pinned or published. The deployment default,
                https://ipfs.io, sits behind a bot-detection check that blocks ordinary programmatic requests
                for some people — if Verify keeps failing with "Failed to fetch" even though your content
                resolves fine through your pinning provider's own gateway (for example
                https://gateway.pinata.cloud), point this setting at that gateway instead.
            </p>

            <p v-if="hasOverride" class="form-hint form-hint--neutral">
                Current override: {{ configuration.gatewayUrl }}
            </p>
            <p v-else class="form-hint form-hint--neutral">
                No override configured. Currently using the deployment default: {{ effectiveGatewayUrl }}
            </p>

            <div class="ipfs-gateway-settings-form">
                <input
                    type="text"
                    v-model="gatewayUrlInput"
                    placeholder="https://gateway.pinata.cloud"
                    class="form-input ipfs-gateway-input"
                />

                <p v-if="saveError" class="form-hint">{{ saveError }}</p>
                <p v-if="saveStatus === 'saved'" class="form-hint form-hint--neutral">Saved.</p>
                <p v-if="clearStatus === 'cleared'" class="form-hint form-hint--neutral">Cleared — now using the deployment default.</p>

                <button class="action-btn action-btn--primary" @click="save" :disabled="saveStatus === 'saving' || !gatewayUrlInput.trim()">Save</button>
                <button class="action-btn" @click="useDeploymentDefault" :disabled="saveStatus === 'saving'">Use Deployment Default</button>
            </div>
        </section>
    `
};
