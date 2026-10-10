import { computed, inject, onBeforeUnmount, ref } from 'vue';
import { isWritable, writableKeys } from '../../../core/NetworkWriters.js';
import { DEFAULT_ANNOUNCEMENT_DISCOVERY_PROVIDER } from '../../../core/AnnouncementDiscoveryProvider.js';

// Which networks this device can write to right now (core/NetworkWriters.js):
// Nostr and Arweave always, Steem and Blurt only while their writer is
// switched on in Network Settings. Follows the switches as they change, for
// as long as the component using it is mounted. Without the settings store
// (a test, an embed) everything counts as writable, as before writers were
// switches.
export function useWritableNetworks() {
    const store = inject('networkWriterSettingsStore', null);
    const settings = ref(store ? store.get() : null);
    // Called from a component's setup(), so the subscription ends with it.
    if (store) {
        const stop = store.onChange(() => { settings.value = store.get(); });
        onBeforeUnmount(stop);
    }
    const writable = (key) => (settings.value ? isWritable(key, settings.value) : true);
    return {
        settings,
        writable,
        // `keys` without the switched-off networks.
        only: (keys) => (settings.value ? writableKeys(keys, settings.value) : [...keys]),
        // `key` when it can be written to, else Nostr: for a saved default
        // that names a network since switched off.
        writableOr: (key, fallback = DEFAULT_ANNOUNCEMENT_DISCOVERY_PROVIDER) => (writable(key) ? key : fallback),
        steemOn: computed(() => writable('steem')),
        blurtOn: computed(() => writable('blurt'))
    };
}
