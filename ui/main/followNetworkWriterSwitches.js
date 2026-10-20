// Keeps something in step with network writer switches (core/publication/NetworkWriters.js)
// whose writer is part of a runtime every copy builds (Steem's and Blurt's,
// whose code that posts that runtime loads itself): `on(runtime, id)` now for each switched on,
// and `on`/`off` as each switch changes. `runtimes` maps a writer to its
// runtime, or null where it wasn't built. Returns a function that stops
// following.
export function followNetworkWriterSwitches(settingsStore, runtimes, { on, off }) {
    const applied = new Map();
    function apply(id, enabled) {
        const runtime = runtimes[id];
        if (!runtime || applied.get(id) === enabled) return;
        applied.set(id, enabled);
        try {
            if (enabled) on(runtime, id);
            else off(runtime, id);
        } catch {
            // One network's failure never stops the others following.
        }
    }
    for (const id of Object.keys(runtimes)) apply(id, settingsStore.isEnabled(id));
    return settingsStore.onChange((id, enabled) => {
        if (Object.hasOwn(runtimes, id)) apply(id, enabled);
    });
}
