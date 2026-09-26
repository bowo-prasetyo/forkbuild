import { ANNOUNCEMENT_KINDS } from './AnnouncementKinds.js';
import { byteLength } from '../../utils/responseSize.js';
import { isNonEmptyString } from '../../utils/typeGuards.js';

const STORAGE_PREFIX = 'announcement-index:';
const WATCH_PREFIX = 'announcement-watch:';
export const DEFAULT_MAX_WATCHED_TAGS = 100;
const WATCH_REFRESH_MS = 60 * 1000;
const STORAGE_VERSION = 1;
export const DEFAULT_MAX_RECORDS_PER_TAG = 2000;
export const DEFAULT_MAX_PAYLOAD_BYTES = 8 * 1024;

// Every announcement this device has seen, one storage entry per kind and
// tag (docs/AnnouncementIndex.md). It holds pointers and small signed
// claims, never content bytes, and never decides whether one is true:
// readers parse and verify what list() returns exactly as they would a
// network result.
//
// Entries are read from storage on every call rather than cached, so a
// record written by another tab is seen here too.
export class AnnouncementIndex {
    constructor({
        storage,
        kinds = ANNOUNCEMENT_KINDS,
        now = () => Date.now(),
        maxRecordsPerTag = DEFAULT_MAX_RECORDS_PER_TAG,
        maxPayloadBytes = DEFAULT_MAX_PAYLOAD_BYTES,
        maxWatchedTags = DEFAULT_MAX_WATCHED_TAGS
    } = {}) {
        if (!storage || typeof storage.load !== 'function' || typeof storage.save !== 'function') {
            throw new Error('AnnouncementIndex: a StorageProvider is required');
        }
        this._storage = storage;
        this._kinds = kinds;
        this._now = now;
        this._maxRecordsPerTag = maxRecordsPerTag;
        this._maxPayloadBytes = maxPayloadBytes;
        this._maxWatchedTags = maxWatchedTags;
    }

    // Notes that this device searched `tag`, whether or not anything was
    // found, so the background sync keeps reading it. The most recently
    // searched tags are kept, up to a cap.
    watch(kind, tag) {
        if (!isNonEmptyString(tag)) return;
        const now = this._now();
        const all = this._loadWatched(kind);
        // Every source of one search calls this; one write a minute is plenty.
        const current = all.find((entry) => entry.tag === tag);
        if (current && now - current.watchedAt < WATCH_REFRESH_MS) return;
        const watched = all.filter((entry) => entry.tag !== tag);
        watched.unshift({ tag, watchedAt: now });
        this._storage.save(WATCH_PREFIX + kind, watched.slice(0, this._maxWatchedTags));
    }

    // Tags searched for this kind, most recently searched first.
    watchedTags(kind) {
        return this._loadWatched(kind).map((entry) => entry.tag);
    }

    _loadWatched(kind) {
        let stored;
        try {
            stored = this._storage.load(WATCH_PREFIX + kind);
        } catch {
            return [];
        }
        return Array.isArray(stored)
            ? stored.filter((entry) => entry && isNonEmptyString(entry.tag) && Number.isFinite(entry.watchedAt))
            : [];
    }

    // Records each result under (kind, tag), noting `origin` as one of the
    // sources that reported it. Results that fail the kind's checks or are
    // oversized are skipped. Returns how many records were added and how
    // many already known were seen again.
    record(kind, tag, results, origin) {
        const definition = this._kinds[kind];
        if (!definition) throw new Error(`AnnouncementIndex: unknown kind '${kind}'`);
        if (!isNonEmptyString(tag) || !isNonEmptyString(origin) || !Array.isArray(results) || results.length === 0) {
            return { added: 0, updated: 0 };
        }

        const records = this._load(kind, tag);
        const byKey = new Map(records.map((record) => [record.key, record]));
        const seenAt = this._now();
        let added = 0;
        let updated = 0;
        for (const result of results) {
            const normalized = definition.normalize(result, tag, origin);
            if (!normalized || byteLength(JSON.stringify(normalized.payload)) > this._maxPayloadBytes) continue;
            const existing = byKey.get(normalized.key);
            if (existing) {
                existing.lastSeenAt = seenAt;
                if (!existing.origins.includes(origin)) existing.origins.push(origin);
                updated += 1;
                continue;
            }
            const record = { key: normalized.key, payload: normalized.payload, origins: [origin], firstSeenAt: seenAt, lastSeenAt: seenAt };
            byKey.set(record.key, record);
            records.push(record);
            added += 1;
        }
        if (added === 0 && updated === 0) return { added, updated };

        // Least recently seen goes first; it can always be discovered again.
        records.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
        this._storage.save(storageName(kind, tag), { version: STORAGE_VERSION, records: records.slice(0, this._maxRecordsPerTag) });
        return { added, updated };
    }

    // Payloads stored under (kind, tag), most recently seen first. With
    // `origin`, only records that origin reported.
    list(kind, tag, { origin = null } = {}) {
        if (!isNonEmptyString(tag)) return [];
        return this._load(kind, tag)
            .filter((record) => origin === null || record.origins.includes(origin))
            .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
            .map((record) => clone(record.payload));
    }

    // Every tag holding records of this kind.
    tags(kind) {
        const prefix = `${STORAGE_PREFIX}${kind}:`;
        return this._storage.list().filter((name) => name.startsWith(prefix)).map((name) => name.slice(prefix.length));
    }

    _load(kind, tag) {
        let stored;
        try {
            stored = this._storage.load(storageName(kind, tag));
        } catch {
            return [];
        }
        if (!stored || stored.version !== STORAGE_VERSION || !Array.isArray(stored.records)) return [];
        return stored.records.filter((record) => record
            && isNonEmptyString(record.key)
            && Array.isArray(record.origins)
            && Number.isFinite(record.lastSeenAt));
    }
}

function storageName(kind, tag) {
    return `${STORAGE_PREFIX}${kind}:${tag}`;
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
