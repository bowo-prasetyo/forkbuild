import { inject } from 'vue';
import { useEndpointListSettings } from '../composables/useEndpointListSettings.js';
import { DEFAULT_IPFS_GATEWAY_URLS } from '../../core/IpfsGatewayConfiguration.js';

// 0.9.665 — IPFS Gateway Settings UI.
//
// THIS VIEW NEVER CONSTRUCTS OR INTERPRETS AN IpfsGatewayConfiguration
// ITSELF — it only reads one back from ipfsGatewayConfigurationStore.get()
// to display what's on file, and saves a change through
// setIpfsGatewayConfigurationUseCase.execute({ gatewayUrls }). An invalid
// URL is rejected by that use case's own construction step; this view
// only ever displays whatever message that throw carries.
//
// OPENING THIS PAGE NEVER WRITES ANYTHING — the shared load() (ui/composables/
// useEndpointSettingsForm.js) only ever reads store.get(). With nothing on
// file the textarea starts from DEFAULT_IPFS_GATEWAY_URLS, and Save stays
// disabled until it differs (ui/composables/useEndpointListSettings.js).
// "Reset to Defaults" calls store.clear(), never a save of the default list
// — saving it would wrongly turn "no preference" into an explicit one that
// happens to match today's defaults.
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
        const settings = useEndpointListSettings({
            store: inject('ipfsGatewayConfigurationStore', null),
            useCase: inject('setIpfsGatewayConfigurationUseCase', null),
            defaults: DEFAULT_IPFS_GATEWAY_URLS,
            entriesOf: (configuration) => configuration.gatewayUrls,
            // Splitting the textarea into lines is the ONLY interpretation
            // this view performs; URL validity stays inside core/
            // IpfsGatewayConfiguration.js's own constructor.
            toRequest: (gatewayUrls) => ({ gatewayUrls })
        });
        return { ...settings, gatewayUrlInput: settings.input };
    },
    template: `
        <section class="ipfs-gateway-settings-view">
            <h1>IPFS Gateway</h1>
            <p class="form-hint form-hint--neutral">
                Gateway(s) used for retrieving IPFS content — resolving an ipfs:// Snapshot Placement, and the
                "Verify IPFS Content" check on the Publications page. One per line, in the order they should be
                tried — if the first does not respond, the next one is used. This setting affects retrieval only;
                it never changes where your own content gets pinned or published. If your content resolves through
                your pinning provider's own gateway (for example https://gateway.pinata.cloud) but not through the
                ones below, add that gateway here, ahead of the others.
            </p>

            <p v-if="hasOverride" class="form-hint form-hint--neutral">Using your saved gateways:</p>
            <p v-else class="form-hint form-hint--neutral">Using the default gateways:</p>
            <ul class="endpoint-settings-list">
                <li v-for="url in effectiveEntries" :key="url">{{ url }}</li>
            </ul>

            <div class="ipfs-gateway-settings-form">
                <textarea
                    v-model="gatewayUrlInput"
                    placeholder="https://gateway.pinata.cloud"
                    rows="5"
                    class="ipfs-gateway-input form-textarea"
                ></textarea>

                <p v-if="saveError" class="form-hint">{{ saveError }}</p>
                <p v-if="saveStatus === 'saved'" class="form-hint form-hint--neutral">Saved.</p>
                <p v-if="clearStatus === 'cleared'" class="form-hint form-hint--neutral">Reset — now using the default gateways.</p>

                <button class="action-btn action-btn--primary" @click="save" :disabled="!canSave">Save</button>
                <button class="action-btn" @click="resetToDefaults" :disabled="!hasOverride">Reset to Defaults</button>
            </div>
        </section>
    `
};
