import { inject } from 'vue';
import { useEndpointListSettings } from '../composables/useEndpointListSettings.js';
import { DEFAULT_ICE_SERVERS } from '../../peer/IceServerConfig.js';

// 0.9.386 — STUN Settings UI.
//
// The missing user-facing seam over this same milestone's own configuration
// boundary (core/IceServerConfiguration.js + storage/
// IceServerConfigurationStore.js) — the direct structural mirror of
// ui/views/ArweaveGatewaySettingsView.js / ui/views/NostrRelaySettingsView.js,
// applied to a list of STUN server URLs instead of a single gateway/relay
// URL, at its own `/settings/stun` route.
//
//   Settings
//      │
//      ▼
//   StunSettingsView   ★ (THIS)
//      current override / Save / Reset to Defaults
//      │
//      ▼
//   application/settings/SetIceServerConfigurationUseCase.js (Save)   (this same milestone)
//   storage/IceServerConfigurationStore.js#clear() (Reset to Defaults)   (this same milestone, unmodified)
//      │
//      ▼
//   IceServerConfigurationStore
//
// THIS VIEW NEVER CONSTRUCTS OR INTERPRETS AN IceServerConfiguration ITSELF.
// It reads one back from `iceServerConfigurationStore.get()` only to
// display what is already on file — the identical "read the store
// directly, no symmetric Get use case" pattern its two siblings already
// hold — and it saves a change by calling
// `setIceServerConfigurationUseCase.execute({ servers })`, never
// `new IceServerConfiguration(...)` and never
// `IceServerConfigurationStore.save()` directly. An invalid entry is
// rejected by that use case's own construction step before anything is
// persisted — this view only ever displays whatever message that throw
// carries, never validates the shape a second time itself.
//
// THIS VIEW NEVER IMPORTS OR CONSTRUCTS `peer/WebRtcPeerConnectionProvider.js`,
// NEVER CALLS `setIceServers()`, AND NEVER TOUCHES `peer/IceServerConfig.js`'s
// OWN TURN credential source. `DEFAULT_ICE_SERVERS` is the one thing imported
// from `peer/IceServerConfig.js` — a plain constant, consulted only to
// LABEL the effective STUN list when no override is on file, never to
// construct anything or open a connection. A change saved here only
// reaches the real peer connection provider through the existing
// composition root (ui/main.js resolves `iceServerConfigurationStore.get()`
// once at startup, exactly as it already does for
// `arweaveGatewayConfigurationStore`/`nostrRelayConfigurationStore`) on the
// NEXT application load — this view performs no live re-composition, and
// never reaches into an already-running peer connection.
//
// THIS VIEW NEVER "TESTS" A SERVER. No Test Connection button, no live ICE
// gathering, no health indicator, no automatic fallback, no latency
// ranking, no STUN discovery, no TURN configuration, no credentials. The
// user is selecting a list of endpoints, not asking this page to establish
// whether any of them are currently reachable — a configured-but-
// unreachable STUN server remains a connection-time outcome for the
// existing `peer/WebRtcPeerConnection.js` ICE-gathering timeout to handle,
// never something this view predicts or falls back away from.
//
// ONE STUN URL PER LINE, IN A TEXTAREA, reflecting `core/
// IceServerConfiguration.js`'s own list-shaped `servers` field. Blank
// lines are ignored; order is preserved exactly as typed.
//
// OPENING THIS PAGE NEVER WRITES ANYTHING. The shared `load()` (ui/composables/
// useEndpointSettingsForm.js) only ever reads
// `store.get()`; when it returns `null`, the textarea starts from the
// deployment defaults and Save stays disabled until it differs (ui/
// composables/useEndpointListSettings.js) — merely visiting this page, or
// pressing Save on it unchanged, can never turn "no override" into a
// persisted, explicit default. That is this milestone's
// own "absence stays meaningful" rule, held here at the one place that
// could otherwise quietly violate it.
//
// "RESET TO DEFAULTS" CALLS `store.clear()`, NEVER
// `save({ servers: DEFAULT_ICE_SERVERS })`. Saving the default value would
// wrongly turn "no preference" into "an explicit preference that happens
// to match the default" — the exact confusion storage/
// IceServerConfigurationStore.js's own header already rules out. This
// button is the one UI path back to genuine absence.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No Test Connection, no
// health indicator, no automatic fallback, no latency ranking, no STUN
// discovery, no TURN configuration, no credential management, no peer
// reconnection orchestration, no multiple configuration profiles, no
// per-peer STUN selection, no generic "Infrastructure Settings" page, and
// nothing for TURN, Rendezvous, IPFS, Nostr, Bitcoin, or Base — see
// docs/Roadmap.md, 0.9.386, "explicitly exclude," for the full list.
export default {
    name: 'StunSettingsView',
    setup() {
        const settings = useEndpointListSettings({
            store: inject('iceServerConfigurationStore', null),
            useCase: inject('setIceServerConfigurationUseCase', null),
            defaults: DEFAULT_ICE_SERVERS.map((server) => server.urls),
            entriesOf: (configuration) => configuration.servers.map((server) => server.urls),
            toRequest: (urls) => ({ servers: urls.map((url) => ({ urls: url })) })
        });
        return { ...settings, serversInput: settings.input };
    },
    template: `
        <section class="stun-settings-view">
            <h1>STUN Servers</h1>
            <p class="form-hint form-hint--neutral">
                STUN servers used for NAT traversal when establishing peer connections. This setting affects connection setup only; it does not change peer identity, authentication, or any existing connection.
            </p>

            <p v-if="hasOverride" class="form-hint form-hint--neutral">Using your saved servers:</p>
            <p v-else class="form-hint form-hint--neutral">Using the default servers:</p>
            <ul class="endpoint-settings-list">
                <li v-for="url in effectiveEntries" :key="url">{{ url }}</li>
            </ul>

            <div class="stun-settings-form">
                <textarea
                    v-model="serversInput"
                    placeholder="stun:stun.l.google.com:19302"
                    rows="5"
                    class="stun-settings-input form-textarea"
                ></textarea>
                <p class="form-hint form-hint--neutral">One STUN server URL per line (e.g. stun:stun.l.google.com:19302).</p>

                <p v-if="saveError" class="form-hint">{{ saveError }}</p>
                <p v-if="saveStatus === 'saved'" class="form-hint form-hint--neutral">Saved.</p>
                <p v-if="clearStatus === 'cleared'" class="form-hint form-hint--neutral">Reset — now using the default servers.</p>

                <button class="action-btn action-btn--primary" @click="save" :disabled="!canSave">Save</button>
                <button class="action-btn" @click="resetToDefaults" :disabled="!hasOverride">Reset to Defaults</button>
            </div>
        </section>
    `
};
