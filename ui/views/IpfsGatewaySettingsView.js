import { ref, computed, inject, onMounted } from 'vue';
import { DEFAULT_IPFS_GATEWAY_URL } from '../../core/IpfsGatewayConfiguration.js';

// 0.9.665 — IPFS Gateway Settings UI.
//
// THIS VIEW NEVER CONSTRUCTS OR INTERPRETS AN IpfsGatewayConfiguration
// ITSELF — it only reads one back from ipfsGatewayConfigurationStore.get()
// to display what's on file, and saves a change through
// setIpfsGatewayConfigurationUseCase.execute({ gatewayUrls }). An invalid
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
//
// 0.9.666 — ONE GATEWAY PER LINE, IN TRY ORDER, mirroring ui/views/
// ArweaveGatewaySettingsView.js's own 0.9.440 shape exactly: the single
// text input became a multi-line field; each non-empty line is one
// gateway URL, and the ORDER of the lines is the order gateways are tried
// on a read — see content/IpfsGatewayFailoverContentStore.js. A single
// line still behaves exactly as the single input always did. This view
// still performs no ordering decision of its own: it only ever splits the
// textarea into lines and hands the resulting array to
// setIpfsGatewayConfigurationUseCase.execute({ gatewayUrls }).
export default {
    name: 'IpfsGatewaySettingsView',
    setup() {
        const store = inject('ipfsGatewayConfigurationStore', null);
        const setIpfsGatewayConfigurationUseCase = inject('setIpfsGatewayConfigurationUseCase', null);

        const configuration = ref(null);
        // One gateway URL per line, in the order they should be tried.
        const gatewayUrlInput = ref('');
        const saveError = ref(null);
        const saveStatus = ref('idle'); // 'idle' | 'saved'
        const clearStatus = ref('idle'); // 'idle' | 'cleared'

        const hasOverride = computed(() => configuration.value !== null);
        // Shown only when no override is on file.
        const deploymentDefaultGatewayUrl = DEFAULT_IPFS_GATEWAY_URL;

        function load() {
            if (!store) return;
            configuration.value = store.get();
            gatewayUrlInput.value = configuration.value ? configuration.value.gatewayUrls.join('\n') : '';
        }

        // Splits the textarea into one trimmed URL per non-empty line —
        // the ONLY interpretation this view performs; every other rule
        // (what counts as a valid URL, whether the list is non-empty)
        // stays inside core/IpfsGatewayConfiguration.js's own constructor,
        // reached through the use case below.
        function parseGatewayUrls() {
            return gatewayUrlInput.value
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line.length > 0);
        }

        function save() {
            if (!setIpfsGatewayConfigurationUseCase || !gatewayUrlInput.value.trim()) return;
            saveError.value = null;
            clearStatus.value = 'idle';
            try {
                configuration.value = setIpfsGatewayConfigurationUseCase.execute({ gatewayUrls: parseGatewayUrls() });
                gatewayUrlInput.value = configuration.value.gatewayUrls.join('\n');
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
            hasOverride, deploymentDefaultGatewayUrl, configuration, gatewayUrlInput,
            saveError, saveStatus, clearStatus, save, useDeploymentDefault
        };
    },
    template: `
        <section class="ipfs-gateway-settings-view">
            <h1>IPFS Gateway</h1>
            <p class="form-hint form-hint--neutral">
                Gateway(s) used for retrieving IPFS content — resolving an ipfs:// Snapshot Placement, and the
                "Verify IPFS Content" check on the Publications page. One per line, in the order they should be
                tried — if the first does not respond, the next one is used. This setting affects retrieval only;
                it never changes where your own content gets pinned or published. The deployment default,
                https://ipfs.io, sits behind a bot-detection check that blocks ordinary programmatic requests
                for some people — if Verify keeps failing with "Failed to fetch" even though your content
                resolves fine through your pinning provider's own gateway (for example
                https://gateway.pinata.cloud), add that gateway here, either instead of or ahead of the default.
            </p>

            <p v-if="hasOverride" class="form-hint form-hint--neutral">
                Current override(s): {{ configuration.gatewayUrls.join(', ') }}
            </p>
            <p v-else class="form-hint form-hint--neutral">
                No override configured. Currently using the deployment default: {{ deploymentDefaultGatewayUrl }}
            </p>

            <div class="ipfs-gateway-settings-form">
                <textarea
                    v-model="gatewayUrlInput"
                    placeholder="https://gateway.pinata.cloud"
                    rows="4"
                    class="ipfs-gateway-input form-textarea"
                ></textarea>

                <p v-if="saveError" class="form-hint">{{ saveError }}</p>
                <p v-if="saveStatus === 'saved'" class="form-hint form-hint--neutral">Saved.</p>
                <p v-if="clearStatus === 'cleared'" class="form-hint form-hint--neutral">Cleared — now using the deployment default.</p>

                <button class="action-btn action-btn--primary" @click="save" :disabled="!gatewayUrlInput.trim()">Save</button>
                <button class="action-btn" @click="useDeploymentDefault">Use Deployment Default</button>
            </div>
        </section>
    `
};
