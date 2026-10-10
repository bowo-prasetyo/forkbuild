import { inject } from 'vue';

// Whether this device has switched on a network writer (core/
// NetworkWriters.js), read when the Publications page opens. Its wallet
// services are offered only then, even if they were built earlier in the
// session (ui/main/NetworkWriterLoader.js builds a writer once and keeps it).
// Call from setup().
export function isNetworkWriterOn(id) {
    const store = inject('networkWriterSettingsStore', null);
    return Boolean(store && store.isEnabled(id));
}
