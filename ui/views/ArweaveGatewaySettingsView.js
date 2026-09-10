import { ref, computed, inject, onMounted } from 'vue';
import { DEFAULT_ARWEAVE_GATEWAY_URL } from '../../core/ArweaveGatewayConfiguration.js';

// 0.9.366 — Arweave Gateway Settings UI.
//
// The missing user-facing seam over 0.9.364's own configuration boundary
// (core/ArweaveGatewayConfiguration.js + storage/
// ArweaveGatewayConfigurationStore.js) and 0.9.365's own convergence proof
// that boundary already controls both real retrieval paths. Nothing about
// that boundary changes here — this view only ever makes it REACHABLE,
// mirroring ui/views/ContentProviderSettingsView.js's own "one page, one
// concern, its own Save action" shape exactly.
//
//   Settings
//      │
//      ▼
//   ArweaveGatewaySettingsView   ★ (THIS)
//      current override / Save / Use Deployment Default
//      │
//      ▼
//   application/SetArweaveGatewayConfigurationUseCase.js (Save)   (this same milestone)
//   storage/ArweaveGatewayConfigurationStore.js#clear() (Use Deployment Default)   (0.9.364, unmodified)
//      │
//      ▼
//   ArweaveGatewayConfigurationStore
//
// THIS VIEW NEVER CONSTRUCTS OR INTERPRETS AN ArweaveGatewayConfiguration
// ITSELF. It reads one back from `arweaveGatewayConfigurationStore.get()`
// only to display what is already on file — the identical "read the store
// directly, no symmetric Get use case" pattern ContentProviderSettingsView.js
// already holds — and it saves a change by calling
// `setArweaveGatewayConfigurationUseCase.execute({ gatewayUrl })`, never
// `new ArweaveGatewayConfiguration(...)` and never
// `ArweaveGatewayConfigurationStore.save()` directly. An invalid URL is
// rejected by that use case's own construction step before anything is
// persisted — this view only ever displays whatever message that throw
// carries, never validates the shape a second time itself.
//
// THIS VIEW NEVER CONSTRUCTS A RETRIEVAL ADAPTER, AND NEVER IMPORTS
// content/ArweaveContentStore.js OR application/
// ArweaveWorldEncounterMaterialResolver.js. `DEFAULT_ARWEAVE_GATEWAY_URL`
// is the one thing imported from core/ArweaveGatewayConfiguration.js — a
// plain constant, consulted only to LABEL the effective gateway when no
// override is on file, never to construct anything. A change saved here
// only reaches those adapters through the existing composition root
// (ui/main.js resolves `arweaveGatewayConfigurationStore.get()` once at
// startup) on the next application load — exactly the "restart preserves
// the setting" contract 0.9.364/0.9.365 already proved, never a live
// re-composition this view attempts to perform itself.
//
// OPENING THIS PAGE NEVER WRITES ANYTHING. `load()` only ever reads
// `store.get()`; when it returns `null`, the input stays empty and the
// deployment default is shown purely as informational text
// (`effectiveGatewayUrl`) — merely visiting this page can never turn "no
// override" into a persisted, explicit default. That is 0.9.364's own
// "absence stays meaningful" rule, held here at the one place that could
// otherwise quietly violate it.
//
// "USE DEPLOYMENT DEFAULT" CALLS `store.clear()`, NEVER
// `save({ gatewayUrl: DEFAULT_ARWEAVE_GATEWAY_URL })`. Saving the default
// value would wrongly turn "no preference" into "an explicit preference
// that happens to match the default" — the exact confusion storage/
// ArweaveGatewayConfigurationStore.js's own header already rules out. This
// button is the one UI path back to genuine absence.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No Test Connection, no
// health indicator, no automatic fallback, no multiple gateway entries, no
// priority or rotation, no retry/timeout configuration, no credentials, no
// generic "Infrastructure Settings" page, and nothing for IPFS, TURN,
// Nostr, Bitcoin, or Base — see docs/Roadmap.md, 0.9.366, for the full
// list. Only the one Arweave retrieval override this codebase already has
// a real, persistent home for.
export default {
    name: 'ArweaveGatewaySettingsView',
    setup() {
        const store = inject('arweaveGatewayConfigurationStore', null);
        const setArweaveGatewayConfigurationUseCase = inject('setArweaveGatewayConfigurationUseCase', null);

        // The ArweaveGatewayConfiguration currently on file, or null — read
        // straight from the injected store, never constructed here.
        const configuration = ref(null);
        const gatewayUrlInput = ref('');
        const saveError = ref(null);
        const saveStatus = ref('idle'); // 'idle' | 'saving' | 'saved'
        const clearStatus = ref('idle'); // 'idle' | 'cleared'

        const hasOverride = computed(() => configuration.value !== null);
        // The gateway actually in effect right now: the stored override
        // when one exists, otherwise the deployment default — never a
        // merge of the two, mirroring ui/main.js's own
        // `resolvedArweaveGatewayUrl` resolution exactly.
        const effectiveGatewayUrl = computed(() => (
            configuration.value ? configuration.value.gatewayUrl : DEFAULT_ARWEAVE_GATEWAY_URL
        ));

        // Re-reads the store fresh on every load — so a newly mounted
        // instance of this view always observes whatever a prior instance
        // (or a prior application run) actually persisted, never a value
        // cached from before. Never writes anything.
        function load() {
            if (!store) return;
            configuration.value = store.get();
            gatewayUrlInput.value = configuration.value ? configuration.value.gatewayUrl : '';
        }

        function save() {
            if (!setArweaveGatewayConfigurationUseCase || !gatewayUrlInput.value.trim()) return;
            saveError.value = null;
            clearStatus.value = 'idle';
            saveStatus.value = 'saving';
            try {
                configuration.value = setArweaveGatewayConfigurationUseCase.execute({ gatewayUrl: gatewayUrlInput.value.trim() });
                gatewayUrlInput.value = configuration.value.gatewayUrl;
                saveStatus.value = 'saved';
            } catch (error) {
                // The use case's own construction step threw before
                // anything was persisted — whatever was previously on
                // file (if anything) remains completely untouched.
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
        <section class="arweave-gateway-settings-view">
            <h1>Arweave Gateway</h1>
            <p class="form-hint form-hint--neutral">
                Gateway used for retrieving Arweave content. This setting affects retrieval only; it does not change where your publications are uploaded.
            </p>

            <p v-if="hasOverride" class="form-hint form-hint--neutral">
                Current override: {{ configuration.gatewayUrl }}
            </p>
            <p v-else class="form-hint form-hint--neutral">
                No override configured. Currently using the deployment default: {{ effectiveGatewayUrl }}
            </p>

            <div class="arweave-gateway-settings-form">
                <input
                    type="text"
                    v-model="gatewayUrlInput"
                    placeholder="https://arweave.net"
                    class="arweave-gateway-input"
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
