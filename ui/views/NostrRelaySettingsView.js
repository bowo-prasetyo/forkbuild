import { ref, inject } from 'vue';
import { useEndpointSettingsForm } from '../composables/useEndpointSettingsForm.js';
import { splitNonEmptyLines } from '../../utils/splitNonEmptyLines.js';
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
// `setNostrRelayConfigurationUseCase.execute({ relayUrls })`, never
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
// constant, consulted only to LABEL the deployment default when no override is
// on file, never to construct anything or open a connection. A change saved
// here only reaches its consumers — every Nostr read and publish path (see
// "UNIFIED" below) — through the existing composition root (ui/main.js resolves `nostrRelayConfigurationStore.get()`
// once at startup, exactly as it already does for
// `arweaveGatewayConfigurationStore`) on the NEXT application load — this
// view performs no live re-composition of its own.
//
// THIS VIEW NEVER "TESTS" THE RELAY. No Test Connection button, no live
// WebSocket probing, no health indicator, no automatic retry, no
// priority/ranking/health history. The user is selecting endpoints, not
// asking this page to establish whether they are currently reachable — an
// unreachable configured relay remains a DISCOVERY-time failure for each of
// the read-path classes' own failure semantics to report, and this view
// never normalizes them into one new error model; it only ever configures
// which relay(s) are used.
//
// ONE RELAY PER LINE, EVERY LINE FANNED OUT TO, NEVER TRIED IN ORDER. The
// single text input became a multi-line field: each non-empty line is one
// relay URL, and every configured relay is queried/published to
// independently — see core/NostrRelayConfiguration.js's own header, "fan-out,
// never ordered failover." A single line still behaves exactly as the
// single input always did. This view still performs no ordering or
// selection decision of its own: it only ever splits the textarea into
// lines and hands the resulting array to
// `setNostrRelayConfigurationUseCase.execute({ relayUrls })`, which is
// itself a thin, unvalidating forward to core/NostrRelayConfiguration.js's
// own constructor.
//
// OPENING THIS PAGE NEVER WRITES ANYTHING. The shared `load()` (ui/composables/
// useEndpointSettingsForm.js) only ever reads
// `store.get()`; when it returns `null`, the input stays empty and the
// deployment default is shown purely as informational text
// (`deploymentDefaultRelayUrl`) — merely visiting this page can never turn "no
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
// DELIBERATELY EXCLUDED. No Test Connection, no health indicator, no
// automatic fallback, no priority or ranking among configured relays (fan-out
// treats every one identically — see core/NostrRelayConfiguration.js's own
// header), no relay health history, no retry/timeout configuration, no
// credentials, no generic "Infrastructure Settings" page, and no new
// discovery-error framework distinguishing "nothing discovered" from "relay
// unavailable" — that remains a separate, later product question, never
// something this page tries to solve.
//
// UNIFIED — this relay set now governs Publications too. 0.9.451/0.9.452
// had moved Publication distribution/discovery onto a separate
// `NostrPublicationRelaySetConfiguration`/`ui/views/NostrPublicationRelaySettingsView.js`
// pair, reasoning that Publications (broad discovery by strangers) and
// Snapshot/Place-Naming discovery (a narrower, personal need) might want
// different relays. See core/NostrRelayConfiguration.js's own "unified"
// header for why that divergence never materialized and the two
// configurations were merged back into this one — this page, this store,
// this use case. `ui/views/NostrPublicationRelaySettingsView.js` and its
// own route have been removed; this is now the one Nostr relay
// configuration surface in the application.
export default {
    name: 'NostrRelaySettingsView',
    setup() {
        const store = inject('nostrRelayConfigurationStore', null);
        const setNostrRelayConfigurationUseCase = inject('setNostrRelayConfigurationUseCase', null);

        // One relay URL per line — every configured relay is fanned out to.
        const relayUrlInput = ref('');

        const form = useEndpointSettingsForm({
            store,
            useCase: setNostrRelayConfigurationUseCase,
            // Splitting the textarea into lines is the ONLY interpretation
            // this view performs; every other rule (what counts as a valid
            // URL) stays inside core/NostrRelayConfiguration.js's own
            // constructor, reached through the use case.
            buildRequest: () => {
                const relayUrls = splitNonEmptyLines(relayUrlInput.value);
                return relayUrls.length > 0 ? { relayUrls } : null;
            },
            fillInputs: (configuration) => {
                relayUrlInput.value = configuration ? configuration.relayUrls.join('\n') : '';
            }
        });

        // Shown only when no override is on file, as informational text —
        // so the relay in effect is always exactly the deployment default,
        // never a merge with anything, mirroring ui/main.js's own
        // `resolvedNostrRelayUrls` fallback.
        const deploymentDefaultRelayUrl = DEFAULT_NOSTR_RELAY_URL;

        return {
            hasOverride: form.hasConfiguration, deploymentDefaultRelayUrl, configuration: form.configuration, relayUrlInput,
            saveError: form.saveError, saveStatus: form.saveStatus, clearStatus: form.clearStatus,
            save: form.save, useDeploymentDefault: form.clear
        };
    },
    template: `
        <section class="nostr-relay-settings-view">
            <h1>Nostr Relays</h1>
            <p class="form-hint form-hint--neutral">
                Relay(s) used everywhere this replica publishes or discovers over Nostr — Publications, Snapshots, Place Naming, and Commentary. One per line — every configured relay is queried and announced to independently, so a second relay stays useful even while the first is unreachable, and a Publication announced to more than one relay is discoverable by more people.
            </p>

            <p v-if="hasOverride" class="form-hint form-hint--neutral">
                Current override(s): {{ configuration.relayUrls.join(', ') }}
            </p>
            <p v-else class="form-hint form-hint--neutral">
                No override configured. Currently using the deployment default: {{ deploymentDefaultRelayUrl }}
            </p>

            <div class="nostr-relay-settings-form">
                <textarea
                    v-model="relayUrlInput"
                    placeholder="wss://relay.damus.io"
                    rows="4"
                    class="nostr-relay-input form-textarea"
                ></textarea>

                <p v-if="saveError" class="form-hint">{{ saveError }}</p>
                <p v-if="saveStatus === 'saved'" class="form-hint form-hint--neutral">Saved.</p>
                <p v-if="clearStatus === 'cleared'" class="form-hint form-hint--neutral">Cleared — now using the deployment default.</p>

                <button class="action-btn action-btn--primary" @click="save" :disabled="!relayUrlInput.trim()">Save</button>
                <button class="action-btn" @click="useDeploymentDefault">Use Deployment Default</button>
            </div>
        </section>
    `
};
