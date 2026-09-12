import { ref, computed, inject, onMounted } from 'vue';
import { DEFAULT_NOSTR_PUBLICATION_RELAY_URL } from '../../core/NostrPublicationRelaySetConfiguration.js';

// 0.9.447 — Nostr Publication Relay Set Configuration UI.
//
// 0.9.446's own audit (tests/NostrMultiRelayConfigurationUIReachabilityAudit.test.js)
// proved, live, that `/settings/nostr-relay` (`ui/views/NostrRelaySettingsView.js`)
// is explicitly, correctly scoped to read/discovery only, and that the
// write-side multi-relay fan-out capability (0.9.444) had no Settings
// surface of its own at all. This view is that missing surface — the
// direct structural mirror of `NostrRelaySettingsView.js`, one field
// widened to a relay SET, at its own, separate route
// (`/settings/nostr-publication-relays`, `ui/router/index.js`).
//
//   Settings
//      │
//      ▼
//   NostrPublicationRelaySettingsView   ★ (THIS)
//      current relay set / Save / Use Deployment Default
//      │
//      ▼
//   application/SetNostrPublicationRelaySetConfigurationUseCase.js (Save)   (this same milestone)
//   storage/NostrPublicationRelaySetConfigurationStore.js#clear() (Use Deployment Default)
//      │
//      ▼
//   NostrPublicationRelaySetConfigurationStore
//
// THIS VIEW NEVER TOUCHES `/settings/nostr-relay`'S OWN STORE, USE CASE, OR
// ROUTE. It injects `nostrPublicationRelaySetConfigurationStore`/
// `setNostrPublicationRelaySetConfigurationUseCase` only — a genuinely
// separate pair, never `nostrRelayConfigurationStore`/
// `setNostrRelayConfigurationUseCase`. This page configures WHERE this
// Wanderer's own signed announcements are published; it has no opinion
// about, and no control over, which relay THIS Wanderer's own discovery
// queries read from — see `NostrRelaySettingsView.js`'s own template text
// for that boundary, stated from the read side.
//
// ONE RELAY URL PER LINE — A MULTILINE TEXTAREA, NEVER A DYNAMIC
// REPEATABLE-INPUT LIST. `core/NostrPublicationRelaySetConfiguration.js`'s
// own constructor already normalizes (trims, drops empty lines, dedupes)
// and validates every entry — this view performs no normalization or
// validation of its own; it only ever splits the textarea's own value on
// newlines and hands the resulting array straight to
// `setNostrPublicationRelaySetConfigurationUseCase.execute({ relayUrls })`,
// exactly as `NostrRelaySettingsView.js`'s own single `<input>` hands its
// own value to its sibling use case unvalidated.
//
// THIS VIEW NEVER CONSTRUCTS OR INTERPRETS A
// `NostrPublicationRelaySetConfiguration` ITSELF, AND NEVER TESTS A RELAY.
// The identical restraints `NostrRelaySettingsView.js`'s own header already
// holds — see that file's own "this view never constructs..." and "this
// view never tests the relay" — held here for a relay SET instead of a
// single relay.
//
// EVERY CONFIGURED RELAY IS AN EQUAL FAN-OUT TARGET — NO ORDERING UI, NO
// PRIMARY/FALLBACK MARKER, NO PER-RELAY HEALTH OR REMOVE-INDIVIDUALLY
// CONTROL. Saving always replaces the entire relay set outright, mirroring
// `NostrPublicationRelaySetConfigurationStore.save()`'s own "replaces
// whatever was previously on file outright" contract — there is no partial
// edit, only "the current textarea contents, or nothing."
//
// OPENING THIS PAGE NEVER WRITES ANYTHING. `load()` only ever reads
// `store.get()`; when it returns `null`, the textarea stays empty and the
// deployment default is shown purely as informational text
// (`effectiveRelayUrls`) — merely visiting this page can never turn "no
// override" into a persisted, explicit default.
//
// "USE DEPLOYMENT DEFAULT" CALLS `store.clear()`, NEVER
// `save({ relayUrls: [DEFAULT_NOSTR_PUBLICATION_RELAY_URL] })` — the
// identical "saving the default would wrongly turn 'no preference' into an
// explicit one" restraint `NostrRelaySettingsView.js`'s own header already
// holds.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No Test Connection, no health
// indicator, no automatic fallback, no per-relay priority/ranking, no relay
// health history, no retry/timeout configuration, no credentials, and no
// per-publication relay configuration of any kind — see
// core/NostrPublicationRelaySetConfiguration.js's own header, "deliberately
// excluded... per-publication scoping."
export default {
    name: 'NostrPublicationRelaySettingsView',
    setup() {
        const store = inject('nostrPublicationRelaySetConfigurationStore', null);
        const setNostrPublicationRelaySetConfigurationUseCase = inject('setNostrPublicationRelaySetConfigurationUseCase', null);

        // The NostrPublicationRelaySetConfiguration currently on file, or
        // null — read straight from the injected store, never constructed
        // here.
        const configuration = ref(null);
        const relayUrlsInput = ref('');
        const saveError = ref(null);
        const saveStatus = ref('idle'); // 'idle' | 'saving' | 'saved'
        const clearStatus = ref('idle'); // 'idle' | 'cleared'

        const hasOverride = computed(() => configuration.value !== null);
        // The relay set actually in effect right now: the stored override
        // when one exists, otherwise a one-element array holding the
        // deployment default — never a merge of the two, mirroring
        // application/NostrPublicationRelaySetConfigurationProvider.js's own
        // resolveNostrPublicationRelayUrls() exactly.
        const effectiveRelayUrls = computed(() => (
            configuration.value ? configuration.value.relayUrls : [DEFAULT_NOSTR_PUBLICATION_RELAY_URL]
        ));

        function parseRelayUrlsInput() {
            return relayUrlsInput.value.split('\n');
        }

        // Re-reads the store fresh on every load — so a newly mounted
        // instance of this view always observes whatever a prior instance
        // (or a prior application run) actually persisted, never a value
        // cached from before. Never writes anything.
        function load() {
            if (!store) return;
            configuration.value = store.get();
            relayUrlsInput.value = configuration.value ? configuration.value.relayUrls.join('\n') : '';
        }

        function save() {
            if (!setNostrPublicationRelaySetConfigurationUseCase || !relayUrlsInput.value.trim()) return;
            saveError.value = null;
            clearStatus.value = 'idle';
            saveStatus.value = 'saving';
            try {
                configuration.value = setNostrPublicationRelaySetConfigurationUseCase.execute({ relayUrls: parseRelayUrlsInput() });
                relayUrlsInput.value = configuration.value.relayUrls.join('\n');
                saveStatus.value = 'saved';
            } catch (error) {
                // The use case's own construction step threw before
                // anything was persisted — whatever was previously on file
                // (if anything) remains completely untouched.
                saveStatus.value = 'idle';
                saveError.value = error.message;
            }
        }

        function useDeploymentDefault() {
            if (!store) return;
            store.clear();
            configuration.value = null;
            relayUrlsInput.value = '';
            saveError.value = null;
            saveStatus.value = 'idle';
            clearStatus.value = 'cleared';
        }

        onMounted(load);

        return {
            hasOverride, effectiveRelayUrls, configuration, relayUrlsInput,
            saveError, saveStatus, clearStatus, save, useDeploymentDefault
        };
    },
    template: `
        <section class="nostr-publication-relay-settings-view">
            <h1>Nostr Publication Relays</h1>
            <p class="form-hint form-hint--neutral">
                Relays this replica publishes signed announcements to when distributing a Publication or Snapshot over Nostr — one independent fan-out target per line, every relay treated equally. This setting affects publication distribution only; it does not change which relay discovery queries read from (see Nostr Relay, under Network Settings).
            </p>

            <p v-if="hasOverride" class="form-hint form-hint--neutral">
                Current relay set ({{ configuration.relayUrls.length }}): {{ configuration.relayUrls.join(', ') }}
            </p>
            <p v-else class="form-hint form-hint--neutral">
                No override configured. Currently using the deployment default: {{ effectiveRelayUrls.join(', ') }}
            </p>

            <div class="nostr-publication-relay-settings-form">
                <textarea
                    v-model="relayUrlsInput"
                    placeholder="wss://relay-a.example&#10;wss://relay-b.example"
                    rows="6"
                    class="nostr-publication-relay-input"
                ></textarea>

                <p v-if="saveError" class="form-hint">{{ saveError }}</p>
                <p v-if="saveStatus === 'saved'" class="form-hint form-hint--neutral">Saved.</p>
                <p v-if="clearStatus === 'cleared'" class="form-hint form-hint--neutral">Cleared — now using the deployment default.</p>

                <button class="action-btn action-btn--primary" @click="save" :disabled="saveStatus === 'saving' || !relayUrlsInput.trim()">Save</button>
                <button class="action-btn" @click="useDeploymentDefault" :disabled="saveStatus === 'saving'">Use Deployment Default</button>
            </div>
        </section>
    `
};
