// Test-support only. storage/LocalStorageProvider.js reads
// window.localStorage; under plain Node there is no window, so this installs
// a minimal in-memory one. It does nothing when a window already exists, so
// a browser run keeps its real storage.
export function installFakeWindowLocalStorage() {
    if (typeof globalThis.window !== 'undefined') return;
    const store = new Map();
    globalThis.window = {
        localStorage: {
            getItem: (k) => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => { store.set(k, String(v)); },
            removeItem: (k) => { store.delete(k); },
            key: (i) => Array.from(store.keys())[i] ?? null,
            get length() { return store.size; }
        }
    };
}
