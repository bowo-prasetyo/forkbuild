import { StorageProvider } from './StorageProvider.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';
import { NotificationEvent } from '../core/NotificationEvent.js';
import {
    NotificationCollisionOutcome,
    notificationDeduplicationIdentity,
    classifyNotificationCollision
} from '../core/NotificationDeduplicationPolicy.js';

const NOTIFICATION_EVENT_STORE_KEY = 'notification-events:entries';

// 0.9.281 — NotificationEventStore Persistence Boundary.
//
// 0.9.280 turned 0.9.278/0.9.279's own audits into an adopted, executable
// policy — an identity function and a three-way collision classifier —
// without ever persisting a `NotificationEvent` anywhere. This file is the
// seam 0.9.280's own "what comes after" named: the first place a
// `NotificationEvent` is durably written down, and nothing more.
//
//   NotificationEvent                  (0.9.273, unmodified)
//        │
//        │  notificationDeduplicationIdentity() / classifyNotificationCollision()
//        ▼
//   NotificationDeduplicationPolicy    (0.9.280, unmodified — CONSUMED here,
//        │                              never reimplemented)
//        ▼
//   NotificationEventStore             (THIS FILE)
//        │  save() / getById() / getByDeduplicationIdentity() / loadAll()
//        ▼
//   storage/StorageProvider.js         (generic, JSON-safe, injected —
//                                        identical seam
//                                        storage/PublicationCommentaryStore.js
//                                        already established)
//
// THE DEPENDENCY DIRECTION RUNS ONE WAY. `core/NotificationEvent.js` and
// `core/NotificationDeduplicationPolicy.js` import nothing from `storage/`
// and know nothing of persistence, retries, or conflicts — this file is
// the only thing that imports THEM. Neither file is modified by this
// milestone.
//
// THIS STORE PERSISTS FACTS; IT DOES NOT INVENT NOTIFICATION SEMANTICS.
// Every identity and equivalence decision this file makes is delegated to
// `core/NotificationDeduplicationPolicy.js` — `save()` never recomputes,
// approximates, or special-cases what "the same notification" means. This
// mirrors `storage/PublicationCommentaryStore.js`'s own restraint (that
// file reuses `core/PublicationCommentaryCollection.js`'s functions rather
// than reimplementing them) applied to the policy 0.9.280 already adopted.
//
// SAVE() OUTCOMES — an explicit three-way result, not a boolean plus a
// thrown conflict error the way `PublicationCommentaryStore.save()` works.
// A shared deduplication identity is evidence to INSPECT, exactly as
// 0.9.280's own header says, so a caller must be able to distinguish
// "nothing happened because this is already on file" from "nothing
// happened because the facts disagree" without parsing an error message:
//
//   NEW      — no record shares this event's deduplication identity. The
//              event is appended and returned as `event`.
//   EXISTING — a record sharing this identity is already on file, and
//              every field the two share agrees (`MATCH`, per 0.9.280).
//              No write is performed; the ORIGINAL on-file record is
//              returned as `event` — never the caller's own instance —
//              so a caller cannot mistake "accepted as identical" for
//              "this exact object is now the durable copy."
//   CONFLICT — a record sharing this identity is already on file, but the
//              two disagree on a shared field (`CONFLICT`, per 0.9.280).
//              No write is performed and the existing record is left
//              completely untouched — this store never overwrites, never
//              picks a winner, and never resolves the disagreement. The
//              result carries `conflict: { existing, incoming }` so the
//              application layer has enough to diagnose the collision
//              itself.
//
// This gives producer retries (0.9.277's own flagship finding — two
// independently constructed `NotificationEvent`s, different
// `notificationId`/`createdAt`/object identity, same logical notification)
// a safe destination: `save()` on the retry returns `EXISTING`, not a
// second row and not an error.
//
// CORRUPTED OR MALFORMED STORAGE DEGRADES TO AN EMPTY COLLECTION, THE
// IDENTICAL RESTRAINT `storage/PublicationCommentaryStore.js` ALREADY
// USES — never a thrown error, never a partially-valid instance. A
// persisted value that isn't an array drops the whole payload; an
// individual entry that fails `NotificationEvent.fromJSON()`'s own
// strict-at-construction validation drops only that one entry.
//
// A GENUINE STORAGE-PROVIDER FAILURE (the injected provider itself
// throws) PROPAGATES UNMODIFIED out of `save()` — this store never
// swallows it into a false `NEW`/`EXISTING` result, and never partially
// updates its own in-memory view before the throw.
//
// DELIBERATELY EXCLUDED FROM THIS MILESTONE, per 0.9.280's own "what comes
// after" and this milestone's own brief: `getUnread()`, `getForRecipient()`,
// `markRead()`, `delete()`, `expire()` — none of these are persistence
// primitives implied by the adopted policy. This store is durable history
// of notification facts, not a recipient's inbox. It also does not choose
// what a `CONFLICT` should trigger (reject/flag/log-and-keep-both stays
// exactly as `OPEN` as 0.9.279 left it), does not touch
// `PublicationCommentaryNotificationProducer.js`, does not introduce a
// deterministic `notificationId`, and never mutates a `NotificationEvent`
// instance it is handed.
export const NotificationPersistenceOutcome = Object.freeze({
    NEW: 'NEW',
    EXISTING: 'EXISTING',
    CONFLICT: 'CONFLICT'
});

export class NotificationEventStore {
    constructor(storageProvider = new LocalStorageProvider()) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('NotificationEventStore requires a StorageProvider');
        }
        this._storageProvider = storageProvider;
    }

    // Persists `event` (a `NotificationEvent` instance — no duck-typing,
    // nothing constructed here from a plain object). Returns one of the
    // three `NotificationPersistenceOutcome` results described above.
    // Never throws for `EXISTING` or `CONFLICT` — only for an invalid
    // argument or a genuine storage-provider failure.
    save(event) {
        requireNotificationEvent(event, 'NotificationEventStore.save()');
        const collection = this._loadCollection();
        const identity = notificationDeduplicationIdentity(event);
        const existing = collection.find((stored) => notificationDeduplicationIdentity(stored) === identity) || null;

        if (!existing) {
            this._persist([...collection, event]);
            return { outcome: NotificationPersistenceOutcome.NEW, event };
        }

        const classification = classifyNotificationCollision(existing, event);
        if (classification === NotificationCollisionOutcome.CONFLICT) {
            return {
                outcome: NotificationPersistenceOutcome.CONFLICT,
                event: existing,
                conflict: { existing, incoming: event }
            };
        }

        // classification === MATCH — compatible facts, no new record.
        return { outcome: NotificationPersistenceOutcome.EXISTING, event: existing };
    }

    // The NotificationEvent instance whose own `notificationId` equals
    // `notificationId`, or `null` when none is on file. Never throws.
    getById(notificationId) {
        return this._loadCollection().find((stored) => stored.notificationId === notificationId) || null;
    }

    // The on-file NotificationEvent sharing `event`'s own deduplication
    // identity (per `core/NotificationDeduplicationPolicy.js`), or `null`
    // when none is on file. `event` need not itself be persisted, or even
    // previously seen — this is how a reconstructed or independently
    // produced event (0.9.277 Section F/0.9.280 Section F's own scenario)
    // finds an already-persisted logical match. Never throws.
    getByDeduplicationIdentity(event) {
        requireNotificationEvent(event, 'NotificationEventStore.getByDeduplicationIdentity()');
        const identity = notificationDeduplicationIdentity(event);
        return this._loadCollection().find((stored) => notificationDeduplicationIdentity(stored) === identity) || null;
    }

    // Every NotificationEvent currently on file, in save order. Never
    // throws — see this file's own header, "Corrupted or malformed
    // storage degrades to an empty collection."
    loadAll() {
        return this._loadCollection();
    }

    // Reads the full persisted array and re-hydrates it through
    // NotificationEvent.fromJSON(), dropping any entry that fails
    // validation. Never mutates the injected storage provider's own
    // record.
    _loadCollection() {
        let raw;
        try {
            raw = this._storageProvider.load(NOTIFICATION_EVENT_STORE_KEY);
        } catch {
            return [];
        }
        if (!Array.isArray(raw)) {
            return [];
        }
        const collection = [];
        for (const record of raw) {
            const event = NotificationEvent.fromJSON(record);
            if (event) {
                collection.push(event);
            }
        }
        return collection;
    }

    // Writes exactly `collection.map((event) => event.toJSON())` — never a
    // caller's own object reference. Lets a genuine provider failure
    // propagate unmodified to `save()`'s own caller.
    _persist(collection) {
        this._storageProvider.save(NOTIFICATION_EVENT_STORE_KEY, collection.map((event) => event.toJSON()));
    }
}

function requireNotificationEvent(value, callerLabel) {
    if (!(value instanceof NotificationEvent)) {
        throw new Error(`${callerLabel} requires a NotificationEvent instance`);
    }
}
