import { inject } from 'vue';
import { useEndpointListSettings } from '../composables/useEndpointListSettings.js';
import { DEFAULT_ARWEAVE_GATEWAY_URLS } from '../../core/ArweaveGatewayConfiguration.js';

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
//      current override / Save / Reset to Defaults
//      │
//      ▼
//   application/settings/SetArweaveGatewayConfigurationUseCase.js (Save)   (this same milestone)
//   storage/ArweaveGatewayConfigurationStore.js#clear() (Reset to Defaults)   (0.9.364, unmodified)
//      │
//      ▼
//   ArweaveGatewayConfigurationStore
//
// THIS VIEW NEVER CONSTRUCTS OR INTERPRETS AN ArweaveGatewayConfiguration
// ITSELF. It reads one back from `arweaveGatewayConfigurationStore.get()`
// only to display what is already on file — the identical "read the store
// directly, no symmetric Get use case" pattern ContentProviderSettingsView.js
// already holds — and it saves a change by calling
// `setArweaveGatewayConfigurationUseCase.execute({ gatewayUrls })`, never
// `new ArweaveGatewayConfiguration(...)` and never
// `ArweaveGatewayConfigurationStore.save()` directly. An invalid URL is
// rejected by that use case's own construction step before anything is
// persisted — this view only ever displays whatever message that throw
// carries, never validates the shape a second time itself.
//
// THIS VIEW NEVER CONSTRUCTS A RETRIEVAL ADAPTER, AND NEVER IMPORTS
// content/ArweaveContentStore.js OR application/
// ArweaveWorldEncounterMaterialResolver.js. `DEFAULT_ARWEAVE_GATEWAY_URLS`
// is the one thing imported from core/ArweaveGatewayConfiguration.js — a
// plain constant, consulted only to SHOW the deployment defaults when no
// override is on file, never to construct anything. A change saved here
// only reaches those adapters through the existing composition root
// (ui/main.js resolves `arweaveGatewayConfigurationStore.get()` once at
// startup) on the next application load — exactly the "restart preserves
// the setting" contract 0.9.364/0.9.365 already proved, never a live
// re-composition this view attempts to perform itself.
//
// OPENING THIS PAGE NEVER WRITES ANYTHING. The shared `load()` (ui/composables/
// useEndpointSettingsForm.js) only ever reads `store.get()`; when it returns
// `null`, the textarea is filled with the deployment defaults as a starting
// point, and Save stays disabled until the text differs from them (ui/
// composables/useEndpointListSettings.js) — merely visiting this page, or
// pressing Save on it unchanged, can never turn "no override" into a
// persisted copy of the defaults. That is 0.9.364's own "absence stays
// meaningful" rule, held here at the one place that could otherwise quietly
// violate it.
//
// "RESET TO DEFAULTS" CALLS `store.clear()`, NEVER A SAVE OF THE DEFAULT
// LIST. Saving the defaults would wrongly turn "no preference" into "an
// explicit preference that happens to match today's defaults", which would
// then stop following the defaults when a later release changes them — the
// exact confusion storage/ArweaveGatewayConfigurationStore.js's own header
// already rules out. This button is the one UI path back to genuine absence.
//
// 0.9.440 — ONE GATEWAY PER LINE, IN TRY ORDER. The single text input
// became a multi-line field: each non-empty line is one gateway URL, and
// the ORDER of the lines is the order gateways are tried on a read — see
// core/ArweaveGatewayConfiguration.js's own 0.9.440 header, "ordering IS
// the priority." A single line still behaves exactly as the single input
// always did — see that same header, "why the single-value shape isn't
// just a list of one everywhere." This view still performs no ordering
// decision of its own: it only ever splits the textarea into lines and
// hands the resulting array to `setArweaveGatewayConfigurationUseCase.execute({ gatewayUrls })`,
// which is itself a thin, unvalidating forward to core/
// ArweaveGatewayConfiguration.js's own constructor.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No Test Connection, no
// health indicator, no automatic reordering, no drag-to-reorder control, no
// per-gateway timeout configuration, no credentials, no generic
// "Infrastructure Settings" page, and nothing for IPFS, TURN, Nostr,
// Bitcoin, or Base — see docs/Roadmap.md, 0.9.366/0.9.440, for the full
// list. Only the one Arweave retrieval override this codebase already has
// a real, persistent home for, now able to name more than one gateway.
export default {
    name: 'ArweaveGatewaySettingsView',
    setup() {
        const settings = useEndpointListSettings({
            store: inject('arweaveGatewayConfigurationStore', null),
            useCase: inject('setArweaveGatewayConfigurationUseCase', null),
            defaults: DEFAULT_ARWEAVE_GATEWAY_URLS,
            entriesOf: (configuration) => configuration.gatewayUrls,
            // Splitting the textarea into lines is the ONLY interpretation
            // this view performs; every other rule (what counts as a valid
            // URL) stays inside core/ArweaveGatewayConfiguration.js's own
            // constructor, reached through the use case.
            toRequest: (gatewayUrls) => ({ gatewayUrls })
        });
        return { ...settings, gatewayUrlInput: settings.input };
    },
    template: `
        <section class="arweave-gateway-settings-view">
            <h1>Arweave Gateway</h1>
            <p class="form-hint form-hint--neutral">
                Gateway(s) used for retrieving Arweave content. One per line, in the order they should be tried — if the first does not respond, the next one is used. This setting affects retrieval only; it does not change where your publications are uploaded.
            </p>

            <p v-if="hasOverride" class="form-hint form-hint--neutral">Using your saved gateways:</p>
            <p v-else class="form-hint form-hint--neutral">Using the default gateways:</p>
            <ul class="endpoint-settings-list">
                <li v-for="url in effectiveEntries" :key="url">{{ url }}</li>
            </ul>

            <div class="arweave-gateway-settings-form">
                <textarea
                    v-model="gatewayUrlInput"
                    placeholder="https://arweave.net"
                    rows="4"
                    class="arweave-gateway-input form-textarea"
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
