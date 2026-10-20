// A network's posting code, loaded the first time it is needed and kept:
// Steem's and Blurt's runtimes read for everyone, but only a device that
// posts there needs the code that posts (core/publication/NetworkWriters.js).
// `load()` resolves to whatever the network's posting composition builds; a
// load that fails is forgotten, so the next call tries again.
export function createLazyPosting(load) {
    let pending = null;
    let loaded = null;
    return Object.freeze({
        get() {
            if (loaded) return Promise.resolve(loaded);
            if (!pending) {
                pending = Promise.resolve()
                    .then(load)
                    .then((posting) => { loaded = posting; return posting; });
                pending.catch(() => { pending = null; });
            }
            return pending;
        },
        // What has been loaded, or null: for the few questions asked without
        // waiting, which answer from the saved settings until then.
        get loaded() { return loaded; }
    });
}
