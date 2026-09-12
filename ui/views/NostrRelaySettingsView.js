import { ref, computed, inject, onMounted } from 'vue';
import { DEFAULT_NOSTR_RELAY_URL } from '../../core/NostrRelayConfiguration.js';

// 0.9.371 — Nostr Relay Settings UI.
//
// The missing user-facing seam over 0.9.369's own configuration boundary
// (core/NostrRelayConfiguration.js + storage/NostrRelayConfigurationStore.js)
// and 0.9.370's own convergence proof that boundary already reaches all
// three read paths at the concrete WebSocket construction. Nothing about
// that boundary changes here — this view only ever makes it REACHABLE, the
// direct structural mirror of ui/views/ArweaveGatewaySettingsView.js (0.9.366)
// applied to a relay URL instead of a gateway URL, at its own
// `/settings/nostr-relay` route exactly as docs/Roadmap.md's own 0.9.369
// "what comes after" already named.
//
//   Settings
//      │
//      ▼
//   NostrRelaySettingsView   ★ (THIS)
//      current override / Save / Use Deployment Default
//      │
//      ▼
//   application/SetNostrRelayConfigurationUseCase.js (Save)   (this same milestone)
//   storage/NostrRelayConfigurationStore.js#clear() (Use Deployment Default)   (0.9.369, unmodified)
//      │
//      ▼
//   NostrRelayConfigurationStore
//
// THIS VIEW NEVER CONSTRUCTS OR INTERPRETS A NostrRelayConfiguration ITSELF.
// It reads one back from `nostrRelayConfigurationStore.get()` only to
// display what is already on file — the identical "read the store directly,
// no symmetric Get use case" pattern ArweaveGatewaySettingsView.js already
// holds — and it saves a change by calling
// `setNostrRelayConfigurationUseCase.execute({ relayUrl })`, never
// `new NostrRelayConfiguration(...)` and never
// `NostrRelayConfigurationStore.save()` directly. An invalid URL is rejected
// by that use case's own construction step before anything is persisted —
// this view only ever displays whatever message that throw carries, never
// validates the shape a second time itself.
//
// THIS VIEW NEVER TOUCHES DISCOVERY OR PUBLISHING. It never imports
// application/NostrDiscoveryQueryService.js, application/
// NostrSnapshotDiscoveryQueryService.js, application/
// NostrPlaceNamingDiscoverySource.js, nostr/NostrRelayQueryClient.js, or any
// of the three Nostr WRITE-path publishers. `DEFAULT_NOSTR_RELAY_URL` is the
// one thing imported from core/NostrRelayConfiguration.js — a plain
// constant, consulted only to LABEL the effective relay when no override is
// on file, never to construct anything or open a connection. A change saved
// here only reaches the three read-path consumers through the existing
// composition root (ui/main.js resolves `nostrRelayConfigurationStore.get()`
// once at startup, exactly as it already does for
// `arweaveGatewayConfigurationStore`) on the NEXT application load — this
// view performs no live re-composition of its own.
//
// THIS VIEW NEVER "TESTS" THE RELAY. No Test Connection button, no live
// WebSocket probing, no health indicator, no automatic retry, no fallback
// to relay.damus.io, no multiple relay entries, no priority/ranking/health
// history. The user is selecting an endpoint, not asking this page to
// establish whether that endpoint is currently reachable — an unreachable
// configured relay remains a DISCOVERY-time failure for each of the three
// existing read-path classes' own failure semantics to report (0.9.370's
// own Section F already proved those differ — [] for Publication/Snapshot,
// a rejection for Place Naming — and this view never normalizes them into
// one new error model; it only ever configures which relay is used).
//
// OPENING THIS PAGE NEVER WRITES ANYTHING. `load()` only ever reads
// `store.get()`; when it returns `null`, the input stays empty and the
// deployment default is shown purely as informational text
// (`effectiveRelayUrl`) — merely visiting this page can never turn "no
// override" into a persisted, explicit default. That is 0.9.369's own
// "absence stays meaningful" rule, held here at the one place that could
// otherwise quietly violate it.
//
// "USE DEPLOYMENT DEFAULT" CALLS `store.clear()`, NEVER
// `save({ relayUrl: DEFAULT_NOSTR_RELAY_URL })`. Saving the default value
// would wrongly turn "no preference" into "an explicit preference that
// happens to match the default" — the exact confusion storage/
// NostrRelayConfigurationStore.js's own header already rules out. This
// button is the one UI path back to genuine absence.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No Test Connection, no health
// indicator, no automatic fallback, no multiple relay entries, no priority
// or ranking, no relay health history, no retry/timeout configuration, no
// credentials, no generic "Infrastructure Settings" page, and no new
// discovery-error framework distinguishing "nothing discovered" from "relay
// unavailable" — that is a separate, later product question (see
// docs/Roadmap.md, 0.9.372, "distinguishing 'no results' from 'relay
// unavailable'"), never something this milestone tries to solve.
//
// AMENDED BY 0.9.452 — Product Completion Reassessment. This view's own
// template text below previously listed Publications among the discovery
// operations this relay preference governs. That was accurate through
// 0.9.450, but 0.9.451 moved Publication discovery onto the separate
// Nostr Publication Relays configuration (`ui/views/
// NostrPublicationRelaySettingsView.js`) instead — see `ui/main.js`'s own
// 0.9.451 comment. This relay preference now governs Snapshot discovery and
// Place Naming discovery only; the template text below is corrected
// accordingly. No behavior changes — documentation/copy correction only.
export default {
    name: 'NostrRelaySettingsView',
    setup() {
        const store = inject('nostrRelayConfigurationStore', null);
        const setNostrRelayConfigurationUseCase = inject('setNostrRelayConfigurationUseCase', null);

        // The NostrRelayConfiguration currently on file, or null — read
        // straight from the injected store, never constructed here.
        const configuration = ref(null);
        const relayUrlInput = ref('');
        const saveError = ref(null);
        const saveStatus = ref('idle'); // 'idle' | 'saving' | 'saved'
        const clearStatus = ref('idle'); // 'idle' | 'cleared'

        const hasOverride = computed(() => configuration.value !== null);
        // The relay actually in effect right now: the stored override when
        // one exists, otherwise the deployment default — never a merge of
        // the two, mirroring ui/main.js's own `resolvedNostrRelayUrl`
        // resolution exactly.
        const effectiveRelayUrl = computed(() => (
            configuration.value ? configuration.value.relayUrl : DEFAULT_NOSTR_RELAY_URL
        ));

        // Re-reads the store fresh on every load — so a newly mounted
        // instance of this view always observes whatever a prior instance
        // (or a prior application run) actually persisted, never a value
        // cached from before. Never writes anything.
        function load() {
            if (!store) return;
            configuration.value = store.get();
            relayUrlInput.value = configuration.value ? configuration.value.relayUrl : '';
        }

        function save() {
            if (!setNostrRelayConfigurationUseCase || !relayUrlInput.value.trim()) return;
            saveError.value = null;
            clearStatus.value = 'idle';
            saveStatus.value = 'saving';
            try {
                configuration.value = setNostrRelayConfigurationUseCase.execute({ relayUrl: relayUrlInput.value.trim() });
                relayUrlInput.value = configuration.value.relayUrl;
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
            relayUrlInput.value = '';
            saveError.value = null;
            saveStatus.value = 'idle';
            clearStatus.value = 'cleared';
        }

        onMounted(load);

        return {
            hasOverride, effectiveRelayUrl, configuration, relayUrlInput,
            saveError, saveStatus, clearStatus, save, useDeploymentDefault
        };
    },
    template: `
        <section class="nostr-relay-settings-view">
            <h1>Nostr Relay</h1>
            <p class="form-hint form-hint--neutral">
                Relay used for discovery operations, including Snapshots and Place Naming. Publication discovery uses the separate Nostr Publication Relays configuration instead (see Nostr Publication Relays, under Network Settings). This setting affects discovery only; it does not change where announcements are published.
            </p>

            <p v-if="hasOverride" class="form-hint form-hint--neutral">
                Current override: {{ configuration.relayUrl }}
            </p>
            <p v-else class="form-hint form-hint--neutral">
                No override configured. Currently using the deployment default: {{ effectiveRelayUrl }}
            </p>

            <div class="nostr-relay-settings-form">
                <input
                    type="text"
                    v-model="relayUrlInput"
                    placeholder="wss://relay.damus.io"
                    class="nostr-relay-input"
                />

                <p v-if="saveError" class="form-hint">{{ saveError }}</p>
                <p v-if="saveStatus === 'saved'" class="form-hint form-hint--neutral">Saved.</p>
                <p v-if="clearStatus === 'cleared'" class="form-hint form-hint--neutral">Cleared — now using the deployment default.</p>

                <button class="action-btn action-btn--primary" @click="save" :disabled="saveStatus === 'saving' || !relayUrlInput.trim()">Save</button>
                <button class="action-btn" @click="useDeploymentDefault" :disabled="saveStatus === 'saving'">Use Deployment Default</button>
            </div>
        </section>
    `
};
