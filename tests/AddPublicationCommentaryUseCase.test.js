import { StorageProvider } from '../storage/StorageProvider.js';
import { PublicationCommentary } from '../core/PublicationCommentary.js';
import {
    PublicationCommentaryStore,
    PublicationCommentaryConflictError
} from '../storage/PublicationCommentaryStore.js';
import { AddPublicationCommentaryUseCase } from '../application/AddPublicationCommentaryUseCase.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';

// 0.9.244 — Publication Commentary Application Command Boundary. Covers
// application/AddPublicationCommentaryUseCase.js — the one place user
// intent turns into a persisted PublicationCommentary.
//
// 0.9.245 gave this use case an authorship boundary: authorIdentityId is
// no longer caller-supplied input, it is resolved from an injected
// identityProvider's own authenticated signing identity. This file's
// own tests are updated to construct the use case with a real,
// authenticated identityProvider (the identical LocalIdentityProvider
// pattern tests/PublicationAnchorCreation.test.js already uses), so the
// original, still-relevant assertions here — content/publicationId
// validation, storage failure propagation, duplicate-identity handling,
// store isolation, duck-typed store dependency — keep exercising this
// use case's OWN behavior rather than the authorship boundary itself.
// The authorship boundary's own dedicated coverage lives in
// tests/PublicationCommentaryAuthorship.test.js.

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

// The identical in-memory StorageProvider fake
// tests/PublicationCommentaryStorage.test.js already uses for the same
// purpose — a real StorageProvider subclass, backed by nothing but a Map.
class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// A storage provider whose save() always fails — simulates a real write
// failure (disk full, quota exceeded, IPC error, ...) rather than a read
// failure. Never used for load().
class WriteFailingStorageProvider extends StorageProvider {
    save() { throw new Error('simulated write failure'); }
    load() { return null; }
    remove() {}
    list() { return []; }
}

// A real, authenticated LocalIdentityProvider — the same
// makeIdentity(label) pattern tests/PublicationAnchorCreation.test.js
// already uses, so this file's own coverage exercises the real
// identity/ infrastructure this use case now depends on, never a
// hand-rolled stand-in for it.
function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

function validInput(overrides = {}) {
    return {
        publicationId: 'pub-1',
        content: 'hello world',
        ...overrides
    };
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function runTests() {
    // -------------------------------------------------------------
    // Section A — Successful creation
    // -------------------------------------------------------------
    {
        const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const useCase = new AddPublicationCommentaryUseCase(store, makeIdentity('Alice'));

        const { commentary, isNew } = useCase.execute(validInput({ content: 'Great work on this piece.' }));

        assert(isNew === true, 'A1. isNew is true for a genuinely new commentary');
        assert(commentary instanceof PublicationCommentary, 'A2. execute() returns a real PublicationCommentary instance');
        assert(commentary.content === 'Great work on this piece.', 'A3. content is preserved on the returned instance');

        const persisted = store.getById(commentary.commentaryId);
        assert(persisted instanceof PublicationCommentary, 'A4. the commentary reached the real PublicationCommentaryStore');
        assert(persisted !== commentary, 'A5. the persisted instance is reloaded, not the same object reference');
        assert(JSON.stringify(persisted.toJSON()) === JSON.stringify(commentary.toJSON()), 'A6. the persisted record matches what execute() returned');
    }

    // -------------------------------------------------------------
    // Section B — Exact Publication identity
    // -------------------------------------------------------------
    {
        const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const useCase = new AddPublicationCommentaryUseCase(store, makeIdentity('Alice'));

        // The same underlying Document produced this Publication, and
        // this Publication's own contentReference carries a content
        // hash — neither of those ever substitutes for publicationId.
        const documentId = 'doc-1';
        const contentHash = 'sha256-deadbeef';
        const publicationId = 'pub-from-doc1-v1';

        const { commentary } = useCase.execute(validInput({ publicationId }));

        assert(commentary.publicationId === publicationId, 'B1. publicationId is preserved exactly');
        assert(commentary.publicationId !== documentId, 'B2. publicationId is never substituted with the Document id');
        assert(commentary.publicationId !== contentHash, 'B3. publicationId is never substituted with a content hash');

        const forPub = store.getForPublication(publicationId);
        assert(forPub.length === 1 && forPub[0].commentaryId === commentary.commentaryId, 'B4. the commentary is queryable by its exact publicationId afterward');
    }

    // -------------------------------------------------------------
    // Section C — Author identity comes from the injected provider
    // -------------------------------------------------------------
    {
        const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const aliceProvider = makeIdentity('Alice');
        const bobProvider = makeIdentity('Bob');
        const aliceIdentityId = aliceProvider.getSigningIdentity().id;
        const bobIdentityId = bobProvider.getSigningIdentity().id;

        const { commentary: aliceComment } = new AddPublicationCommentaryUseCase(store, aliceProvider).execute(validInput());
        const { commentary: bobComment } = new AddPublicationCommentaryUseCase(store, bobProvider).execute(validInput());

        assert(aliceComment.authorIdentityId === aliceIdentityId, 'C1. the author identity comes from the injected identityProvider');
        assert(bobComment.authorIdentityId === bobIdentityId, 'C2. a different injected identityProvider yields a different author identity');
        assert(store.getById(aliceComment.commentaryId).authorIdentityId === aliceIdentityId, 'C3. author identity survives the round trip through the real store');
    }

    // -------------------------------------------------------------
    // Section D — Content validation
    // -------------------------------------------------------------
    {
        const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const useCase = new AddPublicationCommentaryUseCase(store, makeIdentity('Alice'));

        let threw = false;
        try { useCase.execute(validInput({ content: '' })); } catch (e) { threw = true; }
        assert(threw, 'D1. empty content is rejected');

        threw = false;
        try { useCase.execute(validInput({ content: '   ' })); } catch (e) { threw = true; }
        assert(threw, 'D2. whitespace-only content is rejected');

        threw = false;
        try { useCase.execute(validInput({ publicationId: undefined })); } catch (e) { threw = true; }
        assert(threw, 'D3. a missing publicationId is rejected');

        assert(store.loadAll().length === 0, 'D4. none of the rejected attempts ever reached persistence');
    }

    // -------------------------------------------------------------
    // Section E — Persistence failure
    // -------------------------------------------------------------
    {
        const store = new PublicationCommentaryStore(new WriteFailingStorageProvider());
        const useCase = new AddPublicationCommentaryUseCase(store, makeIdentity('Alice'));

        let threw = false;
        let result;
        try {
            result = useCase.execute(validInput());
        } catch (error) {
            threw = true;
        }
        assert(threw, 'E1. a genuine storage write failure propagates as a thrown error');
        assert(result === undefined, 'E2. a storage failure never produces a returned "created" result');
    }

    // -------------------------------------------------------------
    // Section F — Duplicate identity
    // -------------------------------------------------------------
    {
        const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const useCase = new AddPublicationCommentaryUseCase(store, makeIdentity('Alice'));

        const fixedInput = validInput({
            commentaryId: 'fixed-commentary-id',
            content: 'original content',
            createdAt: new Date('2024-01-01T00:00:00.000Z')
        });

        const first = useCase.execute(fixedInput);
        assert(first.isNew === true, 'F1. the first submission with an explicit commentaryId writes a new record');

        // Retrying the exact same submission (e.g. after a caller-side
        // timeout) is an idempotent no-op, not a duplicate.
        const retry = useCase.execute({ ...fixedInput });
        assert(retry.isNew === false, 'F2. retrying the identical submission is an idempotent no-op');
        assert(store.getForPublication('pub-1').length === 1, 'F3. the idempotent retry never creates a second entry');

        // The same commentaryId with different content is a genuine
        // conflict, not a silent overwrite or a second entry.
        let threw = false;
        try {
            useCase.execute({ ...fixedInput, content: 'DIFFERENT content' });
        } catch (error) {
            threw = true;
            assert(error instanceof PublicationCommentaryConflictError, 'F4. a differing resubmission under the same commentaryId is rejected as a conflict');
        }
        assert(threw, 'F5. the conflicting submission is rejected, not silently accepted');
        assert(store.getById('fixed-commentary-id').content === 'original content', 'F6. the original record is left untouched by the rejected conflict');
    }

    // -------------------------------------------------------------
    // Section G — Store isolation
    // -------------------------------------------------------------
    {
        const storeOne = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const storeTwo = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const useCaseOne = new AddPublicationCommentaryUseCase(storeOne, makeIdentity('Alice'));
        const useCaseTwo = new AddPublicationCommentaryUseCase(storeTwo, makeIdentity('Bob'));

        const { commentary: c1 } = useCaseOne.execute(validInput({ content: 'only in store one' }));
        const { commentary: c2 } = useCaseTwo.execute(validInput({ content: 'only in store two' }));

        assert(storeOne.loadAll().length === 1, 'G1. store one holds exactly its own commentary');
        assert(storeTwo.loadAll().length === 1, 'G2. store two holds exactly its own commentary');
        assert(storeOne.getById(c2.commentaryId) === null, 'G3. store one never sees store two\'s commentary');
        assert(storeTwo.getById(c1.commentaryId) === null, 'G4. store two never sees store one\'s commentary');
    }

    // -------------------------------------------------------------
    // Section H — Domain/storage separation
    // -------------------------------------------------------------
    {
        // A plain object satisfying only the one method this use case
        // actually calls — no StorageProvider, no PublicationCommentaryStore,
        // no concrete storage provider imported at all. If the use case
        // depended on a concrete provider rather than the store boundary,
        // this fake could never stand in for it.
        const calls = [];
        const fakeStore = {
            save(commentary) {
                calls.push(commentary);
                return true;
            }
        };
        const useCase = new AddPublicationCommentaryUseCase(fakeStore, makeIdentity('Alice'));

        const { commentary, isNew } = useCase.execute(validInput({ content: 'via a fake store' }));

        assert(calls.length === 1 && calls[0] === commentary, 'H1. the use case calls exactly the store boundary\'s save() method');
        assert(isNew === true, 'H2. the use case trusts the injected store\'s own return value rather than deriving its own');

        let threw = false;
        try { new AddPublicationCommentaryUseCase(null, makeIdentity('Alice')); } catch (e) { threw = true; }
        assert(threw, 'H3. a missing store is rejected at construction, not at first use');

        threw = false;
        try { new AddPublicationCommentaryUseCase(fakeStore, null); } catch (e) { threw = true; }
        assert(threw, 'H4. a missing identityProvider is rejected at construction, not at first use');
    }

    console.log('\n✅ All AddPublicationCommentaryUseCase tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All AddPublicationCommentaryUseCase tests passed');
}).catch((error) => {
    console.error('\n✗ AddPublicationCommentaryUseCase tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
