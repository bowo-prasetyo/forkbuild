import { StorageProvider } from '../storage/StorageProvider.js';
import { PublicationCommentary } from '../core/PublicationCommentary.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { GetPublicationCommentariesUseCase } from '../application/GetPublicationCommentariesUseCase.js';

// 0.9.247 — Publication Commentary Query / Observation Boundary. Covers
// application/GetPublicationCommentariesUseCase.js — the one place a
// future Publication UI reads commentary back, rather than depending on
// storage/PublicationCommentaryStore.js directly. No UI, no
// subscription/observer, no sorting or pagination exists yet for this
// milestone to test.

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

// The identical in-memory StorageProvider fake this milestone's sibling
// commentary test files already use — a real StorageProvider subclass,
// backed by nothing but a Map.
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
    // Section A — Single Publication
    // -------------------------------------------------------------
    {
        const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const useCase = new GetPublicationCommentariesUseCase(store);

        const c1 = makeCommentary({ publicationId: 'pub-1', content: 'first comment' });
        store.save(c1);

        const result = useCase.execute({ publicationId: 'pub-1' });

        assert(Array.isArray(result), 'A1. execute() returns an array');
        assert(result.length === 1, 'A2. exactly the one stored commentary is returned');
        assert(result[0] instanceof PublicationCommentary, 'A3. the returned entry is a real PublicationCommentary instance');
        assert(result[0].commentaryId === c1.commentaryId, 'A4. the returned entry is the one that was stored');
        assert(result[0].content === 'first comment', 'A5. content survives the round trip');
    }

    // -------------------------------------------------------------
    // Section B — Multiple commentaries
    // -------------------------------------------------------------
    {
        const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const useCase = new GetPublicationCommentariesUseCase(store);

        const c1 = makeCommentary({ publicationId: 'p1', content: 'c1' });
        const c2 = makeCommentary({ publicationId: 'p1', content: 'c2' });
        const c3 = makeCommentary({ publicationId: 'p1', content: 'c3' });
        store.save(c1);
        store.save(c2);
        store.save(c3);

        const result = useCase.execute({ publicationId: 'p1' });

        assert(result.length === 3, 'B1. all three commentaries for the Publication are returned');
        const ids = result.map((c) => c.commentaryId);
        assert(ids.includes(c1.commentaryId), 'B2. c1 is present');
        assert(ids.includes(c2.commentaryId), 'B3. c2 is present');
        assert(ids.includes(c3.commentaryId), 'B4. c3 is present');
        assert(
            ids.indexOf(c1.commentaryId) < ids.indexOf(c2.commentaryId)
                && ids.indexOf(c2.commentaryId) < ids.indexOf(c3.commentaryId),
            'B5. the store\'s own save order is preserved, never re-sorted'
        );
    }

    // -------------------------------------------------------------
    // Section C — Publication isolation
    // -------------------------------------------------------------
    {
        const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const useCase = new GetPublicationCommentariesUseCase(store);

        const c1 = makeCommentary({ publicationId: 'p1', content: 'only p1' });
        const c2 = makeCommentary({ publicationId: 'p2', content: 'only p2' });
        store.save(c1);
        store.save(c2);

        const result = useCase.execute({ publicationId: 'p1' });

        assert(result.length === 1, 'C1. querying p1 returns exactly one commentary');
        assert(result[0].commentaryId === c1.commentaryId, 'C2. querying p1 returns c1');
        assert(!result.some((c) => c.commentaryId === c2.commentaryId), 'C3. p2\'s commentary never leaks into p1\'s result');
    }

    // -------------------------------------------------------------
    // Section D — Same Document, different Publications
    // -------------------------------------------------------------
    {
        const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const useCase = new GetPublicationCommentariesUseCase(store);

        // Both Publications trace back to the same underlying Document —
        // the query must key strictly off publicationId, never any
        // shared documentId or content hash. See core/
        // PublicationCommentaryCollection.js's own 0.9.242 header.
        const documentId = 'doc-1';
        const c1 = makeCommentary({ publicationId: 'pub-from-doc1-v1', content: 'about v1' });
        const c2 = makeCommentary({ publicationId: 'pub-from-doc1-v2', content: 'about v2' });
        store.save(c1);
        store.save(c2);

        const resultV1 = useCase.execute({ publicationId: 'pub-from-doc1-v1' });
        const resultV2 = useCase.execute({ publicationId: 'pub-from-doc1-v2' });

        assert(resultV1.length === 1 && resultV1[0].commentaryId === c1.commentaryId, 'D1. v1\'s query returns only c1');
        assert(resultV2.length === 1 && resultV2[0].commentaryId === c2.commentaryId, 'D2. v2\'s query returns only c2');
        assert(resultV1[0].publicationId !== documentId, 'D3. the returned commentary\'s publicationId is never the shared documentId');
    }

    // -------------------------------------------------------------
    // Section E — Multiple authors
    // -------------------------------------------------------------
    {
        const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const useCase = new GetPublicationCommentariesUseCase(store);

        const alice = makeCommentary({ publicationId: 'p1', authorIdentityId: 'alice', content: 'from alice' });
        const bob = makeCommentary({ publicationId: 'p1', authorIdentityId: 'bob', content: 'from bob' });
        store.save(alice);
        store.save(bob);

        const result = useCase.execute({ publicationId: 'p1' });

        assert(result.length === 2, 'E1. commentaries from two different authors both come back');
        const authors = result.map((c) => c.authorIdentityId);
        assert(authors.includes('alice'), 'E2. alice\'s commentary is present');
        assert(authors.includes('bob'), 'E3. bob\'s commentary is present');
    }

    // -------------------------------------------------------------
    // Section F — Empty result
    // -------------------------------------------------------------
    {
        const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const useCase = new GetPublicationCommentariesUseCase(store);

        // No commentary at all has ever been saved to this store.
        const resultForUnsaved = useCase.execute({ publicationId: 'never-commented-on' });
        assert(Array.isArray(resultForUnsaved), 'F1. an empty result is still an array');
        assert(resultForUnsaved.length === 0, 'F2. a Publication with no commentary returns []');

        // A different Publication has commentary; an unrelated,
        // never-registered publicationId still returns [], never an
        // error — see this use case's own header on why it never calls
        // a discoveryProvider to distinguish the two.
        store.save(makeCommentary({ publicationId: 'p1' }));
        const resultForUnknown = useCase.execute({ publicationId: 'totally-unknown-publication' });
        assert(Array.isArray(resultForUnknown) && resultForUnknown.length === 0, 'F3. an unrecognized publicationId returns [], not an error');
    }

    // -------------------------------------------------------------
    // Section G — Store failure
    // -------------------------------------------------------------
    {
        // A fake store whose getForPublication() fails the way a real
        // read failure would (corrupted device, IPC error, ...) — never
        // the graceful "degrade to []" a real PublicationCommentaryStore
        // performs for its OWN read path (see storage/
        // PublicationCommentaryStore.js's own header and
        // tests/PublicationCommentaryStorage.test.js for that
        // established store-level semantics). This use case must not
        // add a second, silent layer of failure-swallowing on top of it.
        const readFailingStore = {
            getForPublication() {
                throw new Error('simulated read failure');
            }
        };
        const useCase = new GetPublicationCommentariesUseCase(readFailingStore);

        let threw = false;
        let result;
        try {
            result = useCase.execute({ publicationId: 'p1' });
        } catch (error) {
            threw = true;
        }
        assert(threw, 'G1. a genuine store read failure propagates as a thrown error');
        assert(result === undefined, 'G2. a store failure never produces a silently-successful empty result');
    }

    // -------------------------------------------------------------
    // Section H — Dependency boundary
    // -------------------------------------------------------------
    {
        // A plain object satisfying only the one method this use case
        // actually calls — no StorageProvider, no
        // PublicationCommentaryStore, no LocalStorageProvider, no
        // discovery implementation, and no UI imported at all. If this
        // use case depended on a concrete storage class or a discovery
        // provider rather than the duck-typed store boundary, this fake
        // could never stand in for it.
        const calls = [];
        const fakeStore = {
            getForPublication(publicationId) {
                calls.push(publicationId);
                return [{ commentaryId: 'fake-1', publicationId }];
            }
        };
        const useCase = new GetPublicationCommentariesUseCase(fakeStore);

        const result = useCase.execute({ publicationId: 'p1' });

        assert(calls.length === 1 && calls[0] === 'p1', 'H1. the use case calls exactly the store boundary\'s getForPublication() method, with the exact publicationId given');
        assert(result.length === 1 && result[0].commentaryId === 'fake-1', 'H2. the use case trusts and returns the injected store\'s own result, rather than transforming it');

        let threw = false;
        try { new GetPublicationCommentariesUseCase(null); } catch (e) { threw = true; }
        assert(threw, 'H3. a missing store is rejected at construction, not at first use');

        threw = false;
        try { new GetPublicationCommentariesUseCase({}); } catch (e) { threw = true; }
        assert(threw, 'H4. a store lacking getForPublication() is rejected at construction, not at first use');

        threw = false;
        try { useCase.execute({ publicationId: '' }); } catch (e) { threw = true; }
        assert(threw, 'H5. a blank publicationId is rejected as a malformed call, before ever reaching the store');

        threw = false;
        try { useCase.execute({}); } catch (e) { threw = true; }
        assert(threw, 'H6. a missing publicationId is rejected as a malformed call, before ever reaching the store');
    }

    console.log('\n✅ All GetPublicationCommentariesUseCase tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All GetPublicationCommentariesUseCase tests passed');
}).catch((error) => {
    console.error('\n✗ GetPublicationCommentariesUseCase tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
