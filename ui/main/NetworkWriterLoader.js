import { NETWORK_WRITERS } from '../../core/NetworkWriters.js';

// Builds the network writers this device has switched on (core/
// NetworkWriters.js, docs/Pillars.md "Networks: readers and writers") and
// provides their services to the app. A writer builds on what the anchoring
// service group composed, so none is built before that group loads: attach()
// hands that over and builds the writers switched on then, and switching one
// on later builds it at once. Each is built at most once; one that fails is
// forgotten so the next attempt tries again, and never stops the others.
//
// `plugins` maps a writer to an async function (anchoring) => services, which
// imports the writer's modules only when called. `provide(key, value)` makes a
// service available (app.provide). Switching a writer off does not unload it:
// what the Publications page offers is decided by the switch when the page
// opens (ui/views/decentralizedPublications/networkWriterServices.js).
export class NetworkWriterLoader {
    constructor({ settingsStore, plugins, provide }) {
        this._settingsStore = settingsStore;
        this._plugins = plugins;
        this._provide = provide;
        this._anchoring = null;
        this._loads = new Map();
        settingsStore.onChange((id, enabled) => {
            if (enabled && this._anchoring) this.load(id).catch(() => {});
        });
    }

    // Resolves once every writer switched on now is built (or has failed).
    attach(anchoring) {
        this._anchoring = anchoring;
        const enabled = NETWORK_WRITERS.filter((id) => this._settingsStore.isEnabled(id) && this._plugins[id]);
        return Promise.all(enabled.map((id) => this.load(id).catch(() => null)));
    }

    isLoaded(id) {
        return this._loads.has(id) && this._loads.get(id).loaded === true;
    }

    load(id) {
        if (!this._anchoring) return Promise.reject(new Error('the anchoring services are not built yet'));
        const plugin = this._plugins[id];
        if (!plugin) return Promise.reject(new Error(`no plugin for network writer "${id}"`));
        if (!this._loads.has(id)) {
            const entry = { loaded: false, promise: null };
            entry.promise = Promise.resolve()
                .then(() => plugin(this._anchoring))
                .then((services) => {
                    for (const [key, value] of Object.entries(services || {})) this._provide(key, value);
                    entry.loaded = true;
                    return services;
                });
            entry.promise.catch(() => { this._loads.delete(id); });
            this._loads.set(id, entry);
        }
        return this._loads.get(id).promise;
    }
}
