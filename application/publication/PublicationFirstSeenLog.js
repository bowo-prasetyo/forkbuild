const STORAGE_KEY = 'publication-first-seen:entries';

// When this device first saw each Publication, by id (ms), for telling which
// of two look-alike builds came first (core/publication/PublicationOrder.js).
// A Publication's own date is what its builder signed; this is what this
// device knows for itself, and no builder can set it.
//
// record() keeps the earliest time it is given for an id, so it can be fed
// from every place a Publication arrives, and from records kept before it
// existed (application/worldEncounter/LocalWorldEncounterPublicationAdmissionLog.js's
// `admittedAt`), in any order. Writes are gathered and made once the current
// task ends, since a visit's start admits every known Publication at once.
// At most MAX_FIRST_SEEN ids are kept, the latest seen let go first: a build
// with no time counts as seen late, which those were, while an old build that
// lost its time would wrongly look new. Never leaves the device. Reading or
// writing never throws: a full or blocked storage only loses the times, and
// a build without one counts as seen late.
export const MAX_FIRST_SEEN = 5000;

export class PublicationFirstSeenLog {
    constructor({ storageProvider, now = () => Date.now(), schedule = (write) => setTimeout(write, 0), maxEntries = MAX_FIRST_SEEN }) {
        if (!storageProvider || typeof storageProvider.load !== 'function' || typeof storageProvider.save !== 'function') {
            throw new Error('PublicationFirstSeenLog: a storageProvider is required');
        }
        this._storage = storageProvider;
        this._now = now;
        this._schedule = schedule;
        this._maxEntries = maxEntries;
        this._times = null;
        this._writing = false;
    }

    // When `publicationId` was first seen here (ms), or null.
    get(publicationId) {
        const time = this._loaded().get(publicationId);
        return Number.isFinite(time) ? time : null;
    }

    // `publicationId` was seen at `at` (a Date, ms or ISO text; now when left
    // out). An earlier time already kept stays.
    record(publicationId, at = this._now()) {
        if (typeof publicationId !== 'string' || !publicationId) return;
        const time = at instanceof Date ? at.getTime() : (typeof at === 'string' ? Date.parse(at) : Number(at));
        if (!Number.isFinite(time)) return;
        const times = this._loaded();
        const kept = times.get(publicationId);
        if (Number.isFinite(kept) && kept <= time) return;
        times.set(publicationId, time);
        this._writeSoon();
    }

    // Writes what was recorded now, rather than when the current task ends.
    flush() {
        this._writing = false;
        if (!this._times) return;
        const entries = [...this._times.entries()].sort((a, b) => a[1] - b[1]).slice(0, this._maxEntries);
        if (entries.length < this._times.size) this._times = new Map(entries);
        try {
            this._storage.save(STORAGE_KEY, entries.map(([publicationId, seen]) => ({ publicationId, seen })));
        } catch {
            // See this class's header.
        }
    }

    _writeSoon() {
        if (this._writing) return;
        this._writing = true;
        this._schedule(() => {
            if (this._writing) this.flush();
        });
    }

    _loaded() {
        if (this._times) return this._times;
        let entries;
        try {
            entries = this._storage.load(STORAGE_KEY);
        } catch {
            entries = null;
        }
        this._times = new Map((Array.isArray(entries) ? entries : [])
            .filter((entry) => entry && typeof entry.publicationId === 'string' && entry.publicationId && Number.isFinite(entry.seen))
            .map((entry) => [entry.publicationId, entry.seen]));
        return this._times;
    }
}
