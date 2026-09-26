import { ref, computed } from 'vue';
import { useEndpointSettingsForm } from './useEndpointSettingsForm.js';
import { splitNonEmptyLines } from '../../utils/splitNonEmptyLines.js';

// The Network Settings pages whose setting is an ordered list of endpoints
// with deployment defaults (Arweave Gateway, IPFS Gateway, Bitcoin Endpoint,
// Nostr Relays, STUN, Rendezvous), on top of useEndpointSettingsForm:
//
//   - The list in effect is the saved override, or else the defaults —
//     never a merge — exactly as ui/main/ resolves it at startup.
//   - The textarea (`input`, one entry per line) always shows that list, so
//     with nothing saved it starts from the defaults and a person can add,
//     remove or reorder from there instead of retyping them.
//   - Save does nothing while the textarea still matches the list in effect
//     (`unchanged`), so opening the page and pressing Save never turns the
//     defaults into a saved override that would stop following them.
//   - Reset to Defaults (`resetToDefaults`) is useEndpointSettingsForm's
//     clear(): it removes the saved override, and the page shows the
//     defaults again.
//
//   store, useCase       as for useEndpointSettingsForm.
//   defaults             the deployment default entries, as strings.
//   entriesOf(configuration)  a saved configuration's entries, as strings.
//   toRequest(entries)   the use case's request for the given entries.
export function useEndpointListSettings({ store, useCase, defaults, entriesOf, toRequest }) {
    const input = ref('');
    const defaultEntries = Object.freeze([...defaults]);

    const form = useEndpointSettingsForm({
        store,
        useCase,
        buildRequest: () => {
            const entries = splitNonEmptyLines(input.value);
            return entries.length > 0 && !sameEntries(entries, effectiveEntries.value) ? toRequest(entries) : null;
        },
        fillInputs: (configuration) => {
            input.value = (configuration ? entriesOf(configuration) : defaultEntries).join('\n');
        }
    });

    const effectiveEntries = computed(() => (
        form.configuration.value ? [...entriesOf(form.configuration.value)] : [...defaultEntries]
    ));
    const unchanged = computed(() => sameEntries(splitNonEmptyLines(input.value), effectiveEntries.value));
    const canSave = computed(() => !unchanged.value && splitNonEmptyLines(input.value).length > 0);

    return {
        input, defaultEntries, effectiveEntries, unchanged, canSave,
        hasOverride: form.hasConfiguration, configuration: form.configuration,
        saveError: form.saveError, saveStatus: form.saveStatus, clearStatus: form.clearStatus,
        save: form.save, resetToDefaults: form.clear
    };
}

function sameEntries(a, b) {
    return a.length === b.length && a.every((entry, index) => entry === b[index]);
}
