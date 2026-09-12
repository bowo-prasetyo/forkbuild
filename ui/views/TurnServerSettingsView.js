import { ref, computed, inject, onMounted } from 'vue';

// 0.9.456 — TURN Server Settings UI.
//
// 0.9.453 (contract audit) -> 0.9.454 (core/TurnServerConfiguration.js +
// storage/TurnServerConfigurationStore.js + application/
// TurnServerConfigurationProvider.js) -> 0.9.455 (composition into
// WebRtcPeerConnectionProvider's own resolvedIceServers, ui/main.js) built a
// complete, real TURN configuration boundary with no user-facing surface at
// all — the exact seam this view closes, the direct structural mirror of
// ui/views/StunSettingsView.js, applied to a TURN relay (urls + username +
// ONE shared credential) instead of a STUN server list, at its own
// `/settings/turn-server` route.
//
//   Settings
//      │
//      ▼
//   TurnServerSettingsView   ★ (THIS)
//      current configuration / Save / Clear
//      │
//      ▼
//   application/SetTurnServerConfigurationUseCase.js (Save)   (this same milestone)
//   storage/TurnServerConfigurationStore.js#clear() (Clear)   (0.9.454, unmodified)
//      │
//      ▼
//   TurnServerConfigurationStore
//
// THIS VIEW NEVER CONSTRUCTS OR INTERPRETS A TurnServerConfiguration ITSELF.
// It reads one back from `turnServerConfigurationStore.get()` only to
// display what is already on file — the identical "read the store directly,
// no symmetric Get use case" pattern StunSettingsView.js already holds —
// and it saves a change by calling
// `setTurnServerConfigurationUseCase.execute({ urls, username, credential })`,
// never `new TurnServerConfiguration(...)` and never
// `TurnServerConfigurationStore.save()` directly. An invalid entry is
// rejected by that use case's own construction step before anything is
// persisted — this view only ever displays whatever message that throw
// carries, never validates the shape a second time itself.
//
// THIS VIEW NEVER IMPORTS OR CONSTRUCTS `peer/WebRtcPeerConnectionProvider.js`,
// NEVER TOUCHES `resolvedIceServers`, AND NEVER READS FROM
// `peer/IceServerConfig.js`. A change saved here only reaches the real peer
// connection provider through the existing composition root (ui/main.js
// resolves `turnServerConfigurationStore.get()` once at startup, via
// `resolveTurnServerConfiguration()`, 0.9.455) on the NEXT application
// load — this view performs no live re-composition, and never reaches into
// an already-running peer connection.
//
// STUN CONFIGURATION ≠ TURN CONFIGURATION — A DELIBERATE, SEPARATE PAGE,
// NEVER FOLDED INTO ui/views/StunSettingsView.js. That page injects
// `iceServerConfigurationStore`/`setIceServerConfigurationUseCase` only;
// this page injects `turnServerConfigurationStore`/
// `setTurnServerConfigurationUseCase` only — genuinely separate stores,
// genuinely separate use cases, exactly the boundary core/
// TurnServerConfiguration.js's own header already draws ("A SEPARATE CLASS,
// NEVER A SHARED SHAPE WITH `IceServerConfiguration`"). Reached from the
// Network Settings hub (ui/views/NetworkSettingsView.js) as its own
// contextual link, never folded into the STUN row.
//
// ONE SHARED CREDENTIAL PAIR, ONE OR MORE RELAY URLS — mirroring core/
// TurnServerConfiguration.js's own constructor exactly. One `<textarea>`
// (one turn:/turns: URL per line, blank lines ignored, order preserved —
// normalization/deduplication of any kind remains
// `TurnServerConfiguration`'s own job, never re-implemented here), one
// username `<input>`, and one password-style credential `<input>` — never a
// dynamic repeatable-input list of independently-credentialed servers (see
// core/TurnServerConfiguration.js's own header, "one shared credential
// pair").
//
// THE CREDENTIAL IS NEVER SHOWN IN DIAGNOSTIC TEXT. This view's own
// "current configuration" summary displays the configured URLs and
// username only — never the credential's own value, in any form, anywhere
// outside the password-style `<input>` itself (a real form control the
// browser itself masks, the ordinary way any credential input works,
// distinct from this view's own PROSE/diagnostic text). Loading a
// previously-saved configuration DOES populate the password input with the
// real, on-file credential (so re-saving after only changing the URL list
// or username doesn't demand blindly re-typing an unrelated secret) — but
// that value is read through exactly one path, `configuration.credential`,
// assigned straight into the password input's own model, never interpolated
// into a template string, logged, or otherwise exposed as text.
//
// OPENING THIS PAGE NEVER WRITES ANYTHING. `load()` only ever reads
// `store.get()`; when it returns `null`, every field stays empty — merely
// visiting this page can never turn "no TURN server" into a persisted,
// explicit configuration.
//
// "CLEAR" CALLS `store.clear()`, NEVER A SAVE OF EMPTY/PLACEHOLDER VALUES.
// Unlike STUN/Rendezvous/the Nostr relay pages, TURN has no deployment-wide
// default to "reset to" — see storage/TurnServerConfigurationStore.js's own
// header, "there is no deployment-wide default TURN relay this store could
// fall back to." Clearing therefore reads "Clear," not "Reset to Defaults"
// or "Use Deployment Default," and its own confirmation text says exactly
// that: no TURN server configured, full stop.
//
// NO TEST CONNECTION BUTTON, DELIBERATELY. A successful HTTP/TURN-adjacent
// probe would not establish that a real WebRTC connection can actually use
// the configured relay, and would open a new operational-semantics seam
// this milestone's own brief explicitly declines to open yet.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No Test Connection, no health
// indicator, no automatic fallback, no failover, no server
// ranking/priorities, no credential refresh, no TURN credential generation,
// no OAuth/REST credential acquisition, no per-connection credentials, no
// multiple credential pairs, no TURN provider registries, no generic
// ICE-server configuration UI, no WebRTC diagnostics, no connection-quality
// indicators — see core/TurnServerConfiguration.js's own header and this
// milestone's own request for the full list.
export default {
    name: 'TurnServerSettingsView',
    setup() {
        const store = inject('turnServerConfigurationStore', null);
        const setTurnServerConfigurationUseCase = inject('setTurnServerConfigurationUseCase', null);

        // The TurnServerConfiguration currently on file, or null — read
        // straight from the injected store, never constructed here.
        const configuration = ref(null);
        const urlsInput = ref('');
        const usernameInput = ref('');
        const credentialInput = ref('');
        const saveError = ref(null);
        const saveStatus = ref('idle'); // 'idle' | 'saving' | 'saved'
        const clearStatus = ref('idle'); // 'idle' | 'cleared'

        const hasConfiguration = computed(() => configuration.value !== null);

        // One turn:/turns: URL per line; blank lines ignored, order
        // preserved. `TurnServerConfiguration`'s own constructor is the one
        // place that validates each entry — this view performs no
        // validation of its own.
        function parseUrlsInput() {
            return urlsInput.value
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line.length > 0);
        }

        // Re-reads the store fresh on every load — so a newly mounted
        // instance of this view always observes whatever a prior instance
        // (or a prior application run) actually persisted, never a value
        // cached from before. Never writes anything.
        function load() {
            if (!store) return;
            configuration.value = store.get();
            urlsInput.value = configuration.value ? configuration.value.urls.join('\n') : '';
            usernameInput.value = configuration.value ? configuration.value.username : '';
            // See this file's own header, "the credential is never shown in
            // diagnostic text" — this is the one, deliberate exception: the
            // real on-file credential populates the password-style input's
            // own model directly, never any other field or piece of text.
            credentialInput.value = configuration.value ? configuration.value.credential : '';
        }

        function save() {
            if (!setTurnServerConfigurationUseCase) return;
            saveError.value = null;
            clearStatus.value = 'idle';
            saveStatus.value = 'saving';
            try {
                configuration.value = setTurnServerConfigurationUseCase.execute({
                    urls: parseUrlsInput(),
                    username: usernameInput.value,
                    credential: credentialInput.value
                });
                urlsInput.value = configuration.value.urls.join('\n');
                usernameInput.value = configuration.value.username;
                credentialInput.value = configuration.value.credential;
                saveStatus.value = 'saved';
            } catch (error) {
                // The use case's own construction step threw before
                // anything was persisted — whatever was previously on
                // file (if anything) remains completely untouched.
                saveStatus.value = 'idle';
                saveError.value = error.message;
            }
        }

        function clear() {
            if (!store) return;
            store.clear();
            configuration.value = null;
            urlsInput.value = '';
            usernameInput.value = '';
            credentialInput.value = '';
            saveError.value = null;
            saveStatus.value = 'idle';
            clearStatus.value = 'cleared';
        }

        onMounted(load);

        return {
            hasConfiguration, configuration, urlsInput, usernameInput, credentialInput,
            saveError, saveStatus, clearStatus, save, clear
        };
    },
    template: `
        <section class="turn-server-settings-view">
            <h1>TURN Server</h1>
            <p class="form-hint form-hint--neutral">
                Your own TURN relay, used for peer connections that can't establish a direct or STUN-negotiated path. This setting affects connection setup only; it does not change peer identity, authentication, or any existing connection. ForkBuild has no deployment-wide default TURN server — leave this unconfigured to rely on STUN/direct connectivity alone.
            </p>

            <p v-if="hasConfiguration" class="form-hint form-hint--neutral">
                Current TURN relay ({{ configuration.urls.length }} url(s)): {{ configuration.urls.join(', ') }} — username: {{ configuration.username }}
            </p>
            <p v-else class="form-hint form-hint--neutral">
                No TURN server configured.
            </p>

            <div class="turn-server-settings-form">
                <textarea
                    v-model="urlsInput"
                    placeholder="turn:relay.example:3478&#10;turns:relay.example:5349?transport=tcp"
                    rows="5"
                    class="turn-server-settings-urls-input"
                ></textarea>
                <p class="form-hint form-hint--neutral">One turn:/turns: URL per line (e.g. turn:relay.example:3478).</p>

                <input
                    v-model="usernameInput"
                    type="text"
                    placeholder="Username"
                    class="turn-server-settings-username-input"
                />

                <input
                    v-model="credentialInput"
                    type="password"
                    placeholder="Credential"
                    class="turn-server-settings-credential-input"
                />

                <p v-if="saveError" class="form-hint">{{ saveError }}</p>
                <p v-if="saveStatus === 'saved'" class="form-hint form-hint--neutral">Saved.</p>
                <p v-if="clearStatus === 'cleared'" class="form-hint form-hint--neutral">Cleared — no TURN server configured.</p>

                <button class="action-btn action-btn--primary" @click="save" :disabled="saveStatus === 'saving' || !urlsInput.trim() || !usernameInput.trim() || !credentialInput.trim()">Save</button>
                <button class="action-btn" @click="clear" :disabled="saveStatus === 'saving'">Clear</button>
            </div>
        </section>
    `
};
