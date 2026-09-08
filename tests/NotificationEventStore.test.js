import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { StorageProvider } from '../storage/StorageProvider.js';
import {
    NotificationEventStore,
    NotificationPersistenceOutcome
} from '../storage/NotificationEventStore.js';
import { NotificationEvent } from '../core/NotificationEvent.js';
import { NotificationCollisionOutcome } from '../core/NotificationDeduplicationPolicy.js';

// 0.9.281 — NotificationEventStore Persistence Boundary.
//
// 0.9.280 adopted a deduplication identity and a three-way collision
// classifier without ever writing a `NotificationEvent` to durable
// storage. This file exercises `storage/NotificationEventStore.js`, the
// production consumer of that policy: a small, focused persistence
// contract, not an audit.
//
//   Section A — New event: the first save() of a genuinely new logical
//               notification returns NEW.
//   Section B — Retrieval by notificationId: a saved event's own exact
//               record comes back unchanged from getById().
//   Section C — Retrieval by deduplication identity: a SEPARATELY
//               constructed, equivalent event (different notificationId/
//               createdAt/object identity) finds the persisted record via
//               getByDeduplicationIdentity() without ever being saved
//               itself.
//   Section D — Retry idempotency: two independently produced events for
//               the same logical notification collapse onto ONE stored
//               row — the second save() returns EXISTING, never a second
//               NEW.
//   Section E — Different recipients: identical eventType/commentaryId,
//               different recipientIdentityId, both persist as
//               independent NEW rows.
//   Section F — Different event types: identical commentaryId/recipient,
//               different eventType, both persist as independent NEW
//               rows.
//   Section G — Reconstruction: a live-reconstructed event (per 0.9.277/
//               0.9.280's own reconstruction scenario) finds the original
//               persisted record.
//   Section H — Benign payload superset: a compatible payload expansion
//               of an already-persisted identity still returns EXISTING,
//               consistent with 0.9.280's own MATCH classification.
//   Section I — Conflict: a shared identity with a contradictory shared
//               payload field returns CONFLICT, carries enough detail to
//               diagnose it, and leaves the original record untouched.
//   Section J — Persistence failure: a storage provider that throws on
//               save() propagates the failure unmodified — no false NEW/
//               EXISTING/CONFLICT result is ever produced.
//   Section K — Read corruption: a non-array persisted value degrades to
//               an empty collection, and one corrupted entry among valid
//               ones is dropped alone — the identical restraint
//               `storage/PublicationCommentaryStore.js` already uses.
//   Section L — Isolation: several unrelated notification identities,
//               saved in any order, never contaminate one another.
//   Section M — Restart/reload: a FRESH store instance constructed
//               against the SAME injected provider reproduces every
//               dedup/read result the original instance produced —
//               proving persistence survives process/UI-instance
//               reconstruction, not merely one instance's own memory.
//   Section N — Architecture: no pre-existing production file this
//               milestone depends on (`core/NotificationEvent.js`,
//               `core/NotificationDeduplicationPolicy.js`,
//               `storage/StorageProvider.js`,
//               `storage/LocalStorageProvider.js`) was modified, and
//               neither of the two core files imports this store — the
//               dependency direction runs one way.
//
// See docs/Roadmap.md, 0.9.281, for the full milestone entry.

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

const EVENT_TYPE = 'publication.commented';
const OTHER_EVENT_TYPE = 'publication.mentioned';

function makeEvent({
    notificationId,
    eventType = EVENT_TYPE,
    recipientIdentityId = 'recipient-alice',
    createdAt = new Date('2024-01-01T00:00:00.000Z'),
    commentaryId = 'commentary-1',
    payload = {}
} = {}) {
    return new NotificationEvent({
        notificationId,
        eventType,
        recipientIdentityId,
        createdAt,
        payload: { commentaryId, ...payload }
    });
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function runTests() {
    // -------------------------------------------------------------
    // Section A — New event.
    // -------------------------------------------------------------
    {
        const store = new NotificationEventStore(new InMemoryStorageProvider());
        const event = makeEvent({ notificationId: 'n-a1' });

        const result = store.save(event);

        assert(result.outcome === NotificationPersistenceOutcome.NEW, 'A1. first save() of a genuinely new logical notification returns NEW');
        assert(result.event === event, 'A2. the NEW result carries the exact instance that was saved');
        assert(store.loadAll().length === 1, 'A3. exactly one record is now on file');
    }

    // -------------------------------------------------------------
    // Section B — Retrieval by notificationId.
    // -------------------------------------------------------------
    {
        const store = new NotificationEventStore(new InMemoryStorageProvider());
        const event = makeEvent({ notificationId: 'n-b1', payload: { authorIdentityId: 'author-bob' } });
        store.save(event);

        const fetched = store.getById('n-b1');
        assert(fetched !== null, 'B1. a saved event is retrievable by its own notificationId');
        assert(fetched.notificationId === event.notificationId, 'B2. notificationId matches exactly');
        assert(fetched.eventType === event.eventType, 'B3. eventType matches exactly');
        assert(fetched.recipientIdentityId === event.recipientIdentityId, 'B4. recipientIdentityId matches exactly');
        assert(fetched.createdAt.getTime() === event.createdAt.getTime(), 'B5. createdAt matches exactly');
        assert(JSON.stringify(fetched.payload) === JSON.stringify(event.payload), 'B6. payload matches exactly, field for field');
        assert(store.getById('n-does-not-exist') === null, 'B7. an unrecognized notificationId returns null, never a thrown error');
    }

    // -------------------------------------------------------------
    // Section C — Retrieval by deduplication identity.
    // -------------------------------------------------------------
    {
        const store = new NotificationEventStore(new InMemoryStorageProvider());
        const original = makeEvent({ notificationId: 'n-c1', commentaryId: 'commentary-c', createdAt: new Date('2024-02-02T00:00:00.000Z') });
        store.save(original);

        // A separately constructed event describing the identical logical
        // notification: different notificationId, different createdAt,
        // different object identity — exactly 0.9.277's own retry finding.
        const probe = makeEvent({ notificationId: 'n-c2', commentaryId: 'commentary-c', createdAt: new Date('2024-03-03T00:00:00.000Z') });
        assert(probe.notificationId !== original.notificationId, 'C1. sanity: the probe carries a different notificationId');
        assert(probe !== original, 'C2. sanity: the probe is a distinct object instance, never saved itself');

        const found = store.getByDeduplicationIdentity(probe);
        assert(found !== null, 'C3. a probe event sharing deduplication identity finds the persisted record');
        assert(found.notificationId === original.notificationId, 'C4. the record found is genuinely the ORIGINAL persisted event, not the probe');
        assert(store.loadAll().length === 1, 'C5. merely probing never persists anything of its own');

        const unrelatedProbe = makeEvent({ notificationId: 'n-c3', commentaryId: 'commentary-unrelated' });
        assert(store.getByDeduplicationIdentity(unrelatedProbe) === null, 'C6. a probe for an unrelated identity finds nothing');
    }

    // -------------------------------------------------------------
    // Section D — Retry idempotency.
    // -------------------------------------------------------------
    {
        const store = new NotificationEventStore(new InMemoryStorageProvider());

        // Two independently produced events for the SAME logical
        // notification — different notificationId, different createdAt,
        // different object identity — the exact producer-retry shape
        // 0.9.277 Section B and 0.9.280 Section B already proved.
        const callA = makeEvent({ notificationId: 'n-d1', commentaryId: 'commentary-d', createdAt: new Date('2024-04-04T00:00:00.000Z') });
        const callB = makeEvent({ notificationId: 'n-d2', commentaryId: 'commentary-d', createdAt: new Date('2024-04-04T00:00:05.000Z') });

        const resultA = store.save(callA);
        const resultB = store.save(callB);

        assert(resultA.outcome === NotificationPersistenceOutcome.NEW, 'D1. producer call #1 persists as NEW');
        assert(resultB.outcome === NotificationPersistenceOutcome.EXISTING, 'D2. producer call #2 (the retry) returns EXISTING, never a second NEW');
        assert(resultB.event.notificationId === callA.notificationId, 'D3. the EXISTING result points back at the ORIGINAL record, not the retry');
        assert(store.loadAll().length === 1, 'D4. two independently produced events for one logical notification collapse onto exactly one stored row');
    }

    // -------------------------------------------------------------
    // Section E — Different recipients remain separate.
    // -------------------------------------------------------------
    {
        const store = new NotificationEventStore(new InMemoryStorageProvider());
        const toAlice = makeEvent({ notificationId: 'n-e1', recipientIdentityId: 'recipient-alice', commentaryId: 'commentary-e' });
        const toBob = makeEvent({ notificationId: 'n-e2', recipientIdentityId: 'recipient-bob', commentaryId: 'commentary-e' });

        const resultAlice = store.save(toAlice);
        const resultBob = store.save(toBob);

        assert(resultAlice.outcome === NotificationPersistenceOutcome.NEW, 'E1. the first recipient\'s notification persists as NEW');
        assert(resultBob.outcome === NotificationPersistenceOutcome.NEW, 'E2. a different recipient, same commentaryId/eventType, ALSO persists as NEW');
        assert(store.loadAll().length === 2, 'E3. two distinct recipients produce two distinct stored rows');
    }

    // -------------------------------------------------------------
    // Section F — Different event types remain separate.
    // -------------------------------------------------------------
    {
        const store = new NotificationEventStore(new InMemoryStorageProvider());
        const commented = makeEvent({ notificationId: 'n-f1', eventType: EVENT_TYPE, commentaryId: 'commentary-f' });
        const mentioned = makeEvent({ notificationId: 'n-f2', eventType: OTHER_EVENT_TYPE, commentaryId: 'commentary-f' });

        const resultCommented = store.save(commented);
        const resultMentioned = store.save(mentioned);

        assert(resultCommented.outcome === NotificationPersistenceOutcome.NEW, 'F1. the first eventType persists as NEW');
        assert(resultMentioned.outcome === NotificationPersistenceOutcome.NEW, 'F2. a different eventType, same commentaryId/recipient, ALSO persists as NEW');
        assert(store.loadAll().length === 2, 'F3. two distinct event types produce two distinct stored rows');
    }

    // -------------------------------------------------------------
    // Section G — Reconstruction.
    // -------------------------------------------------------------
    {
        const store = new NotificationEventStore(new InMemoryStorageProvider());
        const original = makeEvent({
            notificationId: 'n-g1',
            commentaryId: 'commentary-g',
            createdAt: new Date('2024-05-05T00:00:00.000Z'),
            payload: { authorIdentityId: 'author-bob' }
        });
        store.save(original);

        // A live reconstruction of the same underlying fact — a fresh
        // notificationId every time, per 0.9.277 Section F's own
        // "reconstruction is not deduplicated on its own" finding — still
        // finds the original through the store, because the STORE, not
        // reconstruction itself, is what carries the dedup guarantee.
        const reconstructed = makeEvent({
            notificationId: 'n-g2',
            commentaryId: 'commentary-g',
            createdAt: new Date('2024-05-05T00:00:00.000Z'),
            payload: { authorIdentityId: 'author-bob' }
        });
        assert(reconstructed.notificationId !== original.notificationId, 'G1. sanity: reconstruction produces a fresh notificationId, exactly as 0.9.277 Section F already proved');

        const found = store.getByDeduplicationIdentity(reconstructed);
        assert(found !== null && found.notificationId === original.notificationId, 'G2. a reconstructed event finds the ORIGINAL persisted notification');

        const saveResult = store.save(reconstructed);
        assert(saveResult.outcome === NotificationPersistenceOutcome.EXISTING, 'G3. saving a reconstruction of an already-persisted fact returns EXISTING, never a duplicate NEW row');
        assert(store.loadAll().length === 1, 'G4. reconstruction-then-save never duplicates the stored row');
    }

    // -------------------------------------------------------------
    // Section H — Benign payload superset.
    // -------------------------------------------------------------
    {
        const store = new NotificationEventStore(new InMemoryStorageProvider());
        const original = makeEvent({ notificationId: 'n-h1', commentaryId: 'commentary-h', payload: { authorIdentityId: 'author-bob' } });
        store.save(original);

        // A hypothetical future producer revision attaching an extra,
        // non-conflicting field — 0.9.279 Section C's own benign-superset
        // case, now decided as MATCH by 0.9.280.
        const superset = makeEvent({
            notificationId: 'n-h2',
            commentaryId: 'commentary-h',
            payload: { authorIdentityId: 'author-bob', excerpt: 'a field the original event never carried' }
        });

        const result = store.save(superset);
        assert(result.outcome === NotificationPersistenceOutcome.EXISTING, 'H1. a compatible payload superset of an already-persisted identity returns EXISTING, not CONFLICT');
        assert(result.event.notificationId === original.notificationId, 'H2. the EXISTING result points at the ORIGINAL record');
        assert(store.loadAll().length === 1, 'H3. no second row is created for a benign superset');
        assert(!('excerpt' in store.getById(original.notificationId).payload), 'H4. the original on-file record is untouched — it never absorbs the superset\'s extra field');
    }

    // -------------------------------------------------------------
    // Section I — Conflict.
    // -------------------------------------------------------------
    {
        const store = new NotificationEventStore(new InMemoryStorageProvider());
        const original = makeEvent({ notificationId: 'n-i1', commentaryId: 'commentary-i', payload: { authorIdentityId: 'author-bob' } });
        store.save(original);

        // Same deduplication identity, but a shared payload field
        // disagrees — 0.9.279 Section I's own scenario.
        const contradictory = makeEvent({ notificationId: 'n-i2', commentaryId: 'commentary-i', payload: { authorIdentityId: 'author-mallory' } });

        const result = store.save(contradictory);
        assert(result.outcome === NotificationPersistenceOutcome.CONFLICT, 'I1. a shared identity with a contradictory shared payload field returns CONFLICT');
        assert(result.conflict !== undefined && result.conflict !== null, 'I2. a CONFLICT result carries diagnostic detail');
        assert(result.conflict.existing.notificationId === original.notificationId, 'I3. the conflict names the EXISTING on-file record');
        assert(result.conflict.incoming === contradictory, 'I4. the conflict names the INCOMING record that was rejected');

        // The existing record is left completely untouched — never
        // overwritten, never merged, never removed.
        assert(store.loadAll().length === 1, 'I5. a CONFLICT never appends a second row');
        const stillOnFile = store.getById(original.notificationId);
        assert(stillOnFile !== null, 'I6. the original record still exists');
        assert(stillOnFile.payload.authorIdentityId === 'author-bob', 'I7. the original record\'s own conflicting field is unchanged — never silently overwritten by the incoming value');
        assert(store.getById(contradictory.notificationId) === null, 'I8. the rejected incoming record is never itself persisted under its own notificationId');
    }

    // -------------------------------------------------------------
    // Section J — Persistence failure.
    // -------------------------------------------------------------
    {
        class ThrowingStorageProvider extends StorageProvider {
            save() { throw new Error('simulated storage provider failure'); }
            load() { return null; }
            remove() {}
            list() { return []; }
        }

        const store = new NotificationEventStore(new ThrowingStorageProvider());
        const event = makeEvent({ notificationId: 'n-j1' });

        let threw = false;
        let result;
        try {
            result = store.save(event);
        } catch (error) {
            threw = true;
            assert(error.message === 'simulated storage provider failure', 'J1. the genuine provider failure propagates UNMODIFIED out of save()');
        }
        assert(threw === true, 'J2. a real storage-provider failure is never swallowed into a false success result');
        assert(result === undefined, 'J3. no NEW/EXISTING/CONFLICT result is ever produced when persistence itself fails');
    }

    // -------------------------------------------------------------
    // Section K — Read corruption.
    // -------------------------------------------------------------
    {
        // A non-array persisted value degrades to an empty collection —
        // the identical restraint storage/PublicationCommentaryStore.js
        // already uses for its own store, never a thrown error.
        const nonArrayProvider = new InMemoryStorageProvider();
        nonArrayProvider.save('notification-events:entries', { not: 'an array' });
        const nonArrayStore = new NotificationEventStore(nonArrayProvider);
        assert(nonArrayStore.loadAll().length === 0, 'K1. a non-array persisted value degrades to an empty collection');
        assert(nonArrayStore.getById('anything') === null, 'K2. getById() against corrupted storage returns null, never throws');

        // One corrupted entry among otherwise-valid ones is dropped alone
        // — the rest of the collection survives intact.
        const mixedProvider = new InMemoryStorageProvider();
        const valid = makeEvent({ notificationId: 'n-k1', commentaryId: 'commentary-k' });
        mixedProvider.save('notification-events:entries', [
            valid.toJSON(),
            { notificationId: 'n-k-corrupt', eventType: '', recipientIdentityId: 'x' }, // invalid eventType
            null
        ]);
        const mixedStore = new NotificationEventStore(mixedProvider);
        const loaded = mixedStore.loadAll();
        assert(loaded.length === 1, 'K3. exactly one corrupted entry (plus one null entry) is dropped, leaving only the valid record');
        assert(loaded[0].notificationId === 'n-k1', 'K4. the surviving record is genuinely the valid one, untouched');
    }

    // -------------------------------------------------------------
    // Section L — Isolation.
    // -------------------------------------------------------------
    {
        const store = new NotificationEventStore(new InMemoryStorageProvider());
        const events = [
            makeEvent({ notificationId: 'n-l1', commentaryId: 'commentary-l1', recipientIdentityId: 'recipient-alice', eventType: EVENT_TYPE }),
            makeEvent({ notificationId: 'n-l2', commentaryId: 'commentary-l2', recipientIdentityId: 'recipient-bob', eventType: EVENT_TYPE }),
            makeEvent({ notificationId: 'n-l3', commentaryId: 'commentary-l1', recipientIdentityId: 'recipient-alice', eventType: OTHER_EVENT_TYPE }),
            makeEvent({ notificationId: 'n-l4', commentaryId: 'commentary-l3', recipientIdentityId: 'recipient-carol', eventType: EVENT_TYPE })
        ];

        for (const event of events) {
            const result = store.save(event);
            assert(result.outcome === NotificationPersistenceOutcome.NEW, `L1. every genuinely distinct identity in this batch persists as NEW — failed for ${event.notificationId}`);
        }

        assert(store.loadAll().length === events.length, 'L2. four genuinely distinct identities remain four distinct rows');
        for (const event of events) {
            const fetched = store.getById(event.notificationId);
            assert(fetched !== null && fetched.notificationId === event.notificationId, `L3. each event remains independently retrievable by its own notificationId — failed for ${event.notificationId}`);
        }

        // Saving a retry of just ONE of the four must not affect the
        // other three.
        const retryOfL2 = makeEvent({ notificationId: 'n-l2-retry', commentaryId: 'commentary-l2', recipientIdentityId: 'recipient-bob', eventType: EVENT_TYPE });
        const retryResult = store.save(retryOfL2);
        assert(retryResult.outcome === NotificationPersistenceOutcome.EXISTING, 'L4. the retry of one identity is correctly recognized as EXISTING');
        assert(store.loadAll().length === events.length, 'L5. the other three identities are completely unaffected by a retry of the fourth');
    }

    // -------------------------------------------------------------
    // Section M — Restart/reload.
    // -------------------------------------------------------------
    {
        const sharedProvider = new InMemoryStorageProvider();
        const firstInstance = new NotificationEventStore(sharedProvider);

        const original = makeEvent({ notificationId: 'n-m1', commentaryId: 'commentary-m', createdAt: new Date('2024-06-06T00:00:00.000Z') });
        const firstResult = firstInstance.save(original);
        assert(firstResult.outcome === NotificationPersistenceOutcome.NEW, 'M1. sanity: the original save, against the first instance, is NEW');

        // A brand-new NotificationEventStore instance, sharing only the
        // underlying provider — simulating a process/UI-instance restart.
        const secondInstance = new NotificationEventStore(sharedProvider);

        assert(secondInstance.loadAll().length === 1, 'M2. the fresh instance sees the persisted record without ever being told about it directly');
        assert(secondInstance.getById('n-m1') !== null, 'M3. getById() works identically against the fresh instance');

        // A retry, submitted to the SECOND instance, must still be
        // recognized as the same logical notification — deduplication is
        // a property of the durable data, not of one instance's memory.
        const retry = makeEvent({ notificationId: 'n-m2', commentaryId: 'commentary-m', createdAt: new Date('2024-06-06T00:05:00.000Z') });
        const retryResult = secondInstance.save(retry);
        assert(retryResult.outcome === NotificationPersistenceOutcome.EXISTING, 'M4. a retry submitted to a FRESH instance is still recognized as EXISTING — dedup survives instance reconstruction');
        assert(secondInstance.loadAll().length === 1, 'M5. no duplicate row is created across the restart boundary');

        // A third instance, reloaded again, still reflects exactly one
        // record — confirming this is not an accident of instance #2's
        // own transient state either.
        const thirdInstance = new NotificationEventStore(sharedProvider);
        assert(thirdInstance.loadAll().length === 1, 'M6. a second reload still reflects exactly one durable record');
    }

    // -------------------------------------------------------------
    // Section N — Architecture.
    // -------------------------------------------------------------
    {
        const gitDiffStat = execSync(
            'git diff --stat HEAD -- core/NotificationEvent.js core/NotificationDeduplicationPolicy.js storage/StorageProvider.js storage/LocalStorageProvider.js application/PublicationCommentaryNotificationProducer.js 2>/dev/null || true',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim();
        assert(gitDiffStat === '', `N1. no pre-existing production file this milestone depends on was modified. Found: ${gitDiffStat || '(none)'}.`);

        const notificationEventSource = readFileSync(new URL('../core/NotificationEvent.js', import.meta.url), 'utf8');
        const dedupPolicySource = readFileSync(new URL('../core/NotificationDeduplicationPolicy.js', import.meta.url), 'utf8');
        const importLinePattern = /^\s*import\b.*$/gm;
        const notificationEventImports = notificationEventSource.match(importLinePattern) || [];
        const dedupPolicyImports = dedupPolicySource.match(importLinePattern) || [];
        assert(notificationEventImports.every((line) => !line.includes('NotificationEventStore')), 'N2. core/NotificationEvent.js does not import this store — the dependency direction runs one way');
        assert(dedupPolicyImports.every((line) => !line.includes('NotificationEventStore')), 'N3. core/NotificationDeduplicationPolicy.js does not import this store either');
        assert(notificationEventImports.every((line) => !line.includes('storage')), 'N4. core/NotificationEvent.js imports nothing from storage/');
        assert(dedupPolicyImports.length === 0, 'N5. core/NotificationDeduplicationPolicy.js remains import-free, per its own 0.9.280 header');
    }

    console.log('\n✅ All NotificationEventStore tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All NotificationEventStore tests passed');
}).catch((error) => {
    console.error('\n✗ NotificationEventStore tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
