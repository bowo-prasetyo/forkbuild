const STORAGE_KEY = 'build-kind-index:v1';

// What each published build on this device is made of, in counts, by content
// hash: how many bricks it has and how many of each kind, once the Build
// Library's ready-made structures are taken out (core/catalog/BuildSimilarity.js
// #withoutReadyMade()). That is all core/catalog/BuildSimilarity.js#alikeAtMost()
// and #couldBeSimilar() need, so application/publication/SimilarBuildFinder.js
// can rank every build it knows by how alike it could be, and leave out the
// ones that can't be, before reading any bytes.
//
// Published bytes never change, so a hash's counts never do either, except
// when the Build Library's structures change: the counts are kept under a key
// for those (`readyMade`), and another key starts afresh. Kept compactly,
// each kind's id once, at most MAX_INDEXED builds, the one used longest ago
// let go first. Writes are gathered and made once the current task ends.
// Never leaves the device. Reading or writing never throws: a full or blocked
// storage only loses the counts, and a build without them is read as before.
export const MAX_INDEXED = 2000;

export class BuildKindIndex {
    constructor({ storageProvider = null, schedule = (write) => setTimeout(write, 0), maxEntries = MAX_INDEXED } = {}) {
        this._storage = storageProvider && typeof storageProvider.load === 'function' && typeof storageProvider.save === 'function' ? storageProvider : null;
        this._schedule = schedule;
        this._maxEntries = maxEntries;
        this._readyMade = null;
        // hash -> { size, kinds }, the one used longest ago first.
        this._entries = null;
        this._writing = false;
    }

    // The counts of the build `hash`, as `{ size, kinds }`, kept under the
    // ready-made structures `readyMade` names; or null.
    get(hash, readyMade) {
        const entries = this._loaded(readyMade);
        const summary = entries.get(hash);
        if (!summary) return null;
        entries.delete(hash);
        entries.set(hash, summary);
        return summary;
    }

    // Keeps the counts of `shape` (anything with `size` and `kinds`) for `hash`.
    put(hash, readyMade, shape) {
        if (typeof hash !== 'string' || !hash || !shape || !Number.isFinite(shape.size)) return;
        const entries = this._loaded(readyMade);
        const kinds = {};
        for (const [kind, count] of Object.entries(shape.kinds || {})) {
            if (Number.isFinite(count) && count > 0) kinds[kind] = count;
        }
        entries.delete(hash);
        entries.set(hash, Object.freeze({ size: shape.size, kinds: Object.freeze(kinds) }));
        while (entries.size > this._maxEntries) entries.delete(entries.keys().next().value);
        this._writeSoon();
    }

    // Writes what was kept now, rather than when the current task ends.
    flush() {
        this._writing = false;
        if (!this._entries || !this._storage) return;
        const kindIds = new Map();
        const idOf = (kind) => {
            if (!kindIds.has(kind)) kindIds.set(kind, kindIds.size);
            return kindIds.get(kind);
        };
        const entries = [...this._entries.entries()].map(([hash, { size, kinds }]) => [
            hash, size, Object.entries(kinds).flatMap(([kind, count]) => [idOf(kind), count])
        ]);
        try {
            this._storage.save(STORAGE_KEY, { readyMade: this._readyMade, kinds: [...kindIds.keys()], entries });
        } catch {
            // See this class's header.
        }
    }

    _writeSoon() {
        if (this._writing || !this._storage) return;
        this._writing = true;
        this._schedule(() => {
            if (this._writing) this.flush();
        });
    }

    _loaded(readyMade) {
        if (this._entries && this._readyMade === readyMade) return this._entries;
        if (this._entries) {
            // Other ready-made structures: every count kept is out of date.
            this._readyMade = readyMade;
            this._entries = new Map();
            this._writeSoon();
            return this._entries;
        }
        this._readyMade = readyMade;
        this._entries = new Map();
        let stored = null;
        try {
            stored = this._storage ? this._storage.load(STORAGE_KEY) : null;
        } catch {
            stored = null;
        }
        if (!stored || stored.readyMade !== readyMade || !Array.isArray(stored.kinds) || !Array.isArray(stored.entries)) return this._entries;
        for (const entry of stored.entries) {
            if (!Array.isArray(entry) || typeof entry[0] !== 'string' || !Number.isFinite(entry[1]) || !Array.isArray(entry[2])) continue;
            const kinds = {};
            for (let i = 0; i + 1 < entry[2].length; i += 2) {
                const kind = stored.kinds[entry[2][i]];
                const count = entry[2][i + 1];
                if (typeof kind === 'string' && Number.isFinite(count) && count > 0) kinds[kind] = count;
            }
            this._entries.set(entry[0], Object.freeze({ size: entry[1], kinds: Object.freeze(kinds) }));
        }
        return this._entries;
    }
}
