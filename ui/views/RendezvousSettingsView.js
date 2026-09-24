import { ref, computed, inject } from 'vue';
import { useEndpointSettingsForm } from '../composables/useEndpointSettingsForm.js';
import { splitNonEmptyLines } from '../../utils/splitNonEmptyLines.js';
import { DEFAULT_RENDEZVOUS_URLS } from '../../peer/RendezvousConfig.js';

// 0.9.388 — Rendezvous Settings UI.
//
// The missing user-facing seam over this same milestone's own
// configuration boundary (core/RendezvousConfiguration.js + storage/
// RendezvousConfigurationStore.js) — the direct structural mirror of
// ui/views/StunSettingsView.js (0.9.386), applied to a list of rendezvous
// server URLs instead of a list of STUN server entries, at its own
// `/settings/rendezvous` route.
//
//   Settings
//      │
//      ▼
//   RendezvousSettingsView   ★ (THIS)
//      current override / Save / Reset to Defaults
//      │
//      ▼
//   application/settings/SetRendezvousConfigurationUseCase.js (Save)   (this same milestone)
//   storage/RendezvousConfigurationStore.js#clear() (Reset to Defaults)   (this same milestone, unmodified)
//      │
//      ▼
//   RendezvousConfigurationStore
//
// THIS VIEW NEVER CONSTRUCTS OR INTERPRETS A RendezvousConfiguration
// ITSELF. It reads one back from `rendezvousConfigurationStore.get()` only
// to display what is already on file — the identical "read the store
// directly, no symmetric Get use case" pattern ui/views/StunSettingsView.js
// already holds — and it saves a change by calling
// `setRendezvousConfigurationUseCase.execute({ urls })`, never
// `new RendezvousConfiguration(...)` and never
// `RendezvousConfigurationStore.save()` directly. An invalid entry is
// rejected by that use case's own construction step before anything is
// persisted — this view only ever displays whatever message that throw
// carries, never validates the shape a second time itself.
//
// THIS VIEW NEVER IMPORTS OR CONSTRUCTS `peer/DiscoveryBootstrap.js`,
// `peer/RendezvousDiscoveryProvider.js`, OR
// `peer/WebSocketRendezvousTransport.js`, AND NEVER ISSUES A PUBLISH/LOOKUP
// OF ANY KIND. `DEFAULT_RENDEZVOUS_URLS` is the one thing imported from
// `peer/RendezvousConfig.js` — a plain constant, consulted only to LABEL
// the effective rendezvous list when no override is on file, never to
// construct anything or open a connection. A change saved here only
// reaches the real discovery bootstrap through the existing composition
// root (ui/main.js resolves `rendezvousConfigurationStore.get()` once at
// startup, exactly as it already does for
// `iceServerConfigurationStore`/`arweaveGatewayConfigurationStore`/
// `nostrRelayConfigurationStore`) on the NEXT application load — this view
// performs no live re-composition, and never reaches into an already-
// running discovery bootstrap.
//
// THIS VIEW NEVER "TESTS" A SERVER. No Test Connection button, no live
// PUBLISH/LOOKUP round trip, no health indicator, no automatic fallback,
// no latency ranking, no endpoint selection. The user is selecting a list
// of endpoints, not asking this page to establish whether any of them are
// currently reachable — a configured-but-unreachable rendezvous server
// remains a LOOKUP-time outcome for the existing
// `peer/RendezvousDiscoveryProvider.js#discover()` graceful-degradation
// path to handle, never something this view predicts or falls back away
// from.
//
// ONE RENDEZVOUS URL PER LINE, IN A TEXTAREA — the identical shape
// ui/views/StunSettingsView.js already holds for its own list-shaped
// configuration. Blank lines are ignored; order is preserved exactly as
// typed.
//
// OPENING THIS PAGE NEVER WRITES ANYTHING. The shared `load()` (ui/composables/
// useEndpointSettingsForm.js) only ever reads
// `store.get()`; when it returns `null`, the textarea stays empty and the
// deployment defaults are shown purely as informational text
// (`effectiveUrls`) — merely visiting this page can never turn "no
// override" into a persisted, explicit default. That is this milestone's
// own "absence stays meaningful" rule, held here at the one place that
// could otherwise quietly violate it.
//
// "RESET TO DEFAULTS" CALLS `store.clear()`, NEVER
// `save({ urls: DEFAULT_RENDEZVOUS_URLS })`. Saving the default value would
// wrongly turn "no preference" into "an explicit preference that happens
// to match the default" — the exact confusion storage/
// RendezvousConfigurationStore.js's own header already rules out. This
// button is the one UI path back to genuine absence.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No Test Connection, no
// health indicator, no automatic fallback, no latency ranking, no endpoint
// ranking, no rendezvous protocol changes, no peer connection changes, no
// STUN/TURN changes, no authentication changes, no multiple configuration
// profiles, no per-peer endpoint selection, no generic "Infrastructure
// Settings" page — see docs/Roadmap.md, 0.9.388, "explicitly exclude," for
// the full list.
export default {
    name: 'RendezvousSettingsView',
    setup() {
        const store = inject('rendezvousConfigurationStore', null);
        const setRendezvousConfigurationUseCase = inject('setRendezvousConfigurationUseCase', null);

        // One rendezvous URL per line; blank lines ignored, order preserved.
        const urlsInput = ref('');

        const form = useEndpointSettingsForm({
            store,
            useCase: setRendezvousConfigurationUseCase,
            buildRequest: () => {
                const urls = splitNonEmptyLines(urlsInput.value);
                return urls.length > 0 ? { urls } : null;
            },
            fillInputs: (configuration) => {
                urlsInput.value = configuration ? configuration.urls.join('\n') : '';
            }
        });

        // The rendezvous servers actually in effect right now: the stored
        // override when one exists, otherwise the deployment defaults —
        // never a merge of the two, mirroring ui/main.js's own
        // `resolvedRendezvousUrls` resolution exactly.
        const effectiveUrls = computed(() => (
            form.configuration.value ? form.configuration.value.urls : DEFAULT_RENDEZVOUS_URLS
        ));

        return {
            hasOverride: form.hasConfiguration, effectiveUrls, urlsInput,
            saveError: form.saveError, saveStatus: form.saveStatus, clearStatus: form.clearStatus,
            save: form.save, resetToDefaults: form.clear
        };
    },
    template: `
        <section class="rendezvous-settings-view">
            <h1>Rendezvous Servers</h1>
            <p class="form-hint form-hint--neutral">
                Rendezvous servers used to discover peers over the network. This setting affects peer discovery only; it does not change peer identity, authentication, or any existing connection.
            </p>

            <p v-if="hasOverride" class="form-hint form-hint--neutral">
                Current override:
            </p>
            <p v-else class="form-hint form-hint--neutral">
                No override configured. Currently using the deployment defaults:
            </p>
            <ul class="rendezvous-settings-server-list">
                <li v-for="url in effectiveUrls" :key="url">{{ url }}</li>
            </ul>

            <div class="rendezvous-settings-form">
                <textarea
                    v-model="urlsInput"
                    placeholder="wss://rendezvous.example"
                    rows="5"
                    class="rendezvous-settings-input form-textarea"
                ></textarea>
                <p class="form-hint form-hint--neutral">One rendezvous server URL per line (e.g. wss://rendezvous.example).</p>

                <p v-if="saveError" class="form-hint">{{ saveError }}</p>
                <p v-if="saveStatus === 'saved'" class="form-hint form-hint--neutral">Saved.</p>
                <p v-if="clearStatus === 'cleared'" class="form-hint form-hint--neutral">Cleared — now using the deployment defaults.</p>

                <button class="action-btn action-btn--primary" @click="save" :disabled="!urlsInput.trim()">Save</button>
                <button class="action-btn" @click="resetToDefaults">Reset to Defaults</button>
            </div>
        </section>
    `
};
