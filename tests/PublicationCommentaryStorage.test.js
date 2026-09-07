import { StorageProvider } from '../storage/StorageProvider.js';
import { PublicationCommentary } from '../core/PublicationCommentary.js';
import {
    PublicationCommentaryStore,
    PublicationCommentaryConflictError
} from '../storage/PublicationCommentaryStore.js';

// 0.9.243 — Publication Commentary Storage Boundary. Covers
// storage/PublicationCommentaryStore.js — the sole bridge between the pure
// 0.9.242 domain (core/PublicationCommentary.js /
// core/PublicationCommentaryCollection.js) and durable storage. No UI, no
// networking, no command/use-case layer exists yet for this milestone to
// test.

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

// The identical in-memory StorageProvider fake tests/DurableDocuments.test.js
// already uses for the same purpose — a real StorageProvider subclass, so
// `instanceof StorageProvider` passes, backed by nothing but a Map.
class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function makeCommentary(overrides = {}) {
    return new PublicationCommentary({
        publicationId: 'pub-1',
        authorIdentityId: 'alice',
        content: 'hello world',
        ...overrides
    });
}

async function runTests() {
    // -------------------------------------------------------------
    // Section A — Save and reload
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const store = new PublicationCommentaryStore(storage);

        const commentary = makeCommentary({ content: 'Great work on this piece.' });
        const wrote = store.save(commentary);
        assert(wrote === true, 'A1. save() returns true for a genuinely new record');

        const loaded = store.getById(commentary.commentaryId);
        assert(loaded instanceof PublicationCommentary, 'A2. getById() returns a real PublicationCommentary instance');
        assert(loaded !== commentary, 'A3. the reloaded instance is a NEW object, not the same reference');
        assert(loaded.commentaryId === commentary.commentaryId, 'A4. commentaryId survives the round trip');
        assert(loaded.publicationId === commentary.publicationId, 'A5. publicationId survives the round trip');
        assert(loaded.authorIdentityId === commentary.authorIdentityId, 'A6. authorIdentityId survives the round trip');
        assert(loaded.content === commentary.content, 'A7. content survives the round trip');
        assert(loaded.createdAt.getTime() === commentary.createdAt.getTime(), 'A8. createdAt survives the round trip');
        assert(JSON.stringify(loaded.toJSON()) === JSON.stringify(commentary.toJSON()), 'A9. semantic equality holds via toJSON()');
    }

    // -------------------------------------------------------------
    // Section B — Publication query
    // -------------------------------------------------------------
    {
        const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const c1 = makeCommentary({ publicationId: 'pub-1', content: 'first on pub-1' });
        const c2 = makeCommentary({ publicationId: 'pub-1', authorIdentityId: 'bob', content: 'second on pub-1' });
        const c3 = makeCommentary({ publicationId: 'pub-2', content: 'only comment on pub-2' });

        store.save(c1);
        store.save(c2);
        store.save(c3);

        const forPub1 = store.getForPublication('pub-1').map((c) => c.commentaryId);
        const forPub2 = store.getForPublication('pub-2').map((c) => c.commentaryId);
        assert(forPub1.length === 2 && forPub1.includes(c1.commentaryId) && forPub1.includes(c2.commentaryId), 'B1. getForPublication(pub-1) returns exactly [C1, C2]');
        assert(forPub2.length === 1 && forPub2[0] === c3.commentaryId, 'B2. getForPublication(pub-2) returns exactly [C3]');
        assert(store.getForPublication('pub-3').length === 0, 'B3. an unknown publicationId returns an empty array, never null');
    }

    // -------------------------------------------------------------
    // Section C — Publication identity: two Publications originating
    // from the same Document remain separate storage scopes
    // -------------------------------------------------------------
    {
        const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
        // documentId D1 published twice, producing P1 and P2 — this store
        // never sees documentId at all, exactly like the 0.9.242 domain
        // it persists.
        const p1 = 'pub-from-doc1-v1';
        const p2 = 'pub-from-doc1-v2';
        const c1 = makeCommentary({ publicationId: p1, content: 'about the first publish' });
        const c2 = makeCommentary({ publicationId: p2, content: 'about the second publish' });

        store.save(c1);
        store.save(c2);

        const forP1 = store.getForPublication(p1);
        assert(forP1.length === 1 && forP1[0].commentaryId === c1.commentaryId, 'C1. P1 only ever sees C1');
        assert(forP1.every((c) => c.commentaryId !== c2.commentaryId), 'C2. querying P1 must never return C2');
        const forP2 = store.getForPublication(p2);
        assert(forP2.length === 1 && forP2[0].commentaryId === c2.commentaryId, 'C3. P2 only ever sees C2');
    }

    // -------------------------------------------------------------
    // Section D — Persistence round trip: all five fields survive
    // -------------------------------------------------------------
    {
        const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const createdAt = new Date('2024-03-01T12:00:00.000Z');
        const commentary = new PublicationCommentary({
            commentaryId: 'commentary-fixed-id',
            publicationId: 'pub-fixed',
            authorIdentityId: 'carol',
            content: 'a fully specified commentary',
            createdAt
        });
        store.save(commentary);

        const loaded = store.getById('commentary-fixed-id');
        assert(loaded.commentaryId === 'commentary-fixed-id', 'D1. commentaryId survives');
        assert(loaded.publicationId === 'pub-fixed', 'D2. publicationId survives');
        assert(loaded.authorIdentityId === 'carol', 'D3. authorIdentityId survives');
        assert(loaded.content === 'a fully specified commentary', 'D4. content survives');
        assert(loaded.createdAt.toISOString() === createdAt.toISOString(), 'D5. createdAt survives, to the millisecond');
    }

    // -------------------------------------------------------------
    // Section E — Corrupted records: malformed persisted data can
    // never become a valid domain object
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const store = new PublicationCommentaryStore(storage);
        const good = makeCommentary({ content: 'a perfectly valid commentary' });
        store.save(good);

        // Reach past the store and corrupt the underlying storage
        // directly — the store must still behave safely afterward.
        const raw = storage.load('publication-commentary:entries');
        raw.push({ commentaryId: 'bad-1' }); // missing every other required field
        raw.push({ publicationId: 'pub-1', authorIdentityId: 'alice', content: '' }); // blank content
        raw.push('not even an object');
        raw.push(null);
        storage.save('publication-commentary:entries', raw);

        const all = store.loadAll();
        assert(all.length === 1, 'E1. only the one genuinely valid record survives corruption placed alongside it');
        assert(all[0].commentaryId === good.commentaryId, 'E2. the surviving record is the original valid one');
        assert(store.getById('bad-1') === null, 'E3. a malformed record can never be looked up by id');

        // A payload that isn't an array at all degrades to empty, not a
        // thrown error.
        const storage2 = new InMemoryStorageProvider();
        storage2.save('publication-commentary:entries', { not: 'an array' });
        const store2 = new PublicationCommentaryStore(storage2);
        assert(Array.isArray(store2.loadAll()) && store2.loadAll().length === 0, 'E4. a non-array payload degrades to an empty collection');

        // A provider whose load() itself throws (simulating truly invalid
        // JSON) degrades to empty, never propagates.
        class ThrowingStorageProvider extends StorageProvider {
            save() {}
            load() { throw new Error('corrupted bytes'); }
            remove() {}
            list() { return []; }
        }
        const store3 = new PublicationCommentaryStore(new ThrowingStorageProvider());
        let threw = false;
        let result;
        try { result = store3.loadAll(); } catch (e) { threw = true; }
        assert(!threw, 'E5. a throwing storage provider never propagates out of loadAll()');
        assert(Array.isArray(result) && result.length === 0, 'E6. it degrades to an empty collection instead');
    }

    // -------------------------------------------------------------
    // Section F — Duplicate identity
    // -------------------------------------------------------------
    {
        const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const c1 = new PublicationCommentary({
            commentaryId: 'dup-id',
            publicationId: 'pub-1',
            authorIdentityId: 'alice',
            content: 'original content',
            createdAt: new Date('2024-01-01T00:00:00.000Z')
        });
        const wrote1 = store.save(c1);
        assert(wrote1 === true, 'F1. the first save of a new id writes a new record');

        // save(C1); save(C1) — a second save of the exact same record.
        const c1Repeat = new PublicationCommentary({
            commentaryId: 'dup-id',
            publicationId: 'pub-1',
            authorIdentityId: 'alice',
            content: 'original content',
            createdAt: new Date('2024-01-01T00:00:00.000Z')
        });
        const wrote2 = store.save(c1Repeat);
        assert(wrote2 === false, 'F2. saving an identical record for the same id is an idempotent no-op');
        assert(store.getForPublication('pub-1').length === 1, 'F3. the idempotent save never creates a second entry');

        // save(C1); save(C1') — same id, different content.
        const c1Prime = new PublicationCommentary({
            commentaryId: 'dup-id',
            publicationId: 'pub-1',
            authorIdentityId: 'alice',
            content: 'DIFFERENT content',
            createdAt: new Date('2024-01-01T00:00:00.000Z')
        });
        let threw = false;
        try {
            store.save(c1Prime);
        } catch (error) {
            threw = true;
            assert(error instanceof PublicationCommentaryConflictError, 'F4. the rejection is a PublicationCommentaryConflictError');
            assert(error.commentaryId === 'dup-id', 'F5. the error names the conflicting commentaryId');
        }
        assert(threw, 'F6. saving the same id with different content is rejected, not silently accepted');

        const stillOriginal = store.getById('dup-id');
        assert(stillOriginal.content === 'original content', 'F7. the original record was never overwritten by the rejected save');

        // Same id, different publicationId is also a conflict, not a move.
        const c1Retargeted = new PublicationCommentary({
            commentaryId: 'dup-id',
            publicationId: 'pub-2',
            authorIdentityId: 'alice',
            content: 'original content',
            createdAt: new Date('2024-01-01T00:00:00.000Z')
        });
        threw = false;
        try { store.save(c1Retargeted); } catch (e) { threw = true; }
        assert(threw, 'F8. re-saving the same id under a different publicationId is also rejected, never silently re-targeted');
    }

    // -------------------------------------------------------------
    // Section G — Append-only behavior: saving new commentary never
    // mutates existing records
    // -------------------------------------------------------------
    {
        const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const c1 = makeCommentary({ content: 'first' });
        store.save(c1);
        const c1SnapshotBefore = store.getById(c1.commentaryId).toJSON();

        const c2 = makeCommentary({ content: 'second' });
        const c3 = makeCommentary({ content: 'third' });
        store.save(c2);
        store.save(c3);

        const c1SnapshotAfter = store.getById(c1.commentaryId).toJSON();
        assert(JSON.stringify(c1SnapshotBefore) === JSON.stringify(c1SnapshotAfter), 'G1. C1 is byte-for-byte unchanged after C2 and C3 are saved');
        assert(store.loadAll().length === 3, 'G2. all three records are present');

        const idsInOrder = store.loadAll().map((c) => c.commentaryId);
        assert(
            idsInOrder.indexOf(c1.commentaryId) < idsInOrder.indexOf(c2.commentaryId) &&
            idsInOrder.indexOf(c2.commentaryId) < idsInOrder.indexOf(c3.commentaryId),
            'G3. loadAll() preserves save order: C1, C2, C3'
        );
    }

    // -------------------------------------------------------------
    // Section H — Restart semantics: a fresh store instance over the
    // same underlying persistence sees every previously saved record
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const store1 = new PublicationCommentaryStore(storage);
        const c1 = makeCommentary({ publicationId: 'pub-1', content: 'before restart, on pub-1' });
        const c2 = makeCommentary({ publicationId: 'pub-2', content: 'before restart, on pub-2' });
        store1.save(c1);
        store1.save(c2);

        // Simulate a process restart: a brand new store instance, no
        // shared in-memory state with store1, over the identical
        // underlying storage.
        const store2 = new PublicationCommentaryStore(storage);
        assert(store2.loadAll().length === 2, 'H1. a fresh store instance sees both previously saved records');
        assert(store2.getById(c1.commentaryId).content === c1.content, 'H2. C1 is intact after the simulated restart');
        assert(store2.getForPublication('pub-2').length === 1, 'H3. publication scoping is intact after the simulated restart');

        // And a save through the fresh instance is visible to a third.
        const c3 = makeCommentary({ publicationId: 'pub-1', content: 'after restart' });
        store2.save(c3);
        const store3 = new PublicationCommentaryStore(storage);
        assert(store3.loadAll().length === 3, 'H4. a write from the restarted instance is durable for a subsequent instance too');
    }

    console.log('\n✅ All PublicationCommentaryStorage tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All PublicationCommentaryStorage tests passed');
}).catch((error) => {
    console.error('\n✗ PublicationCommentaryStorage tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
