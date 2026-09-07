import { StorageProvider } from '../storage/StorageProvider.js';
import { PublicationCommentary } from '../core/PublicationCommentary.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { AddPublicationCommentaryUseCase } from '../application/AddPublicationCommentaryUseCase.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';

// 0.9.245 — Publication Commentary Authorship Boundary.
//
// 0.9.244 named, deliberately, that `authorIdentityId` was caller-
// supplied rather than authenticated — the right restraint while no UI
// existed to abuse it. This milestone closes exactly that gap: a
// commentary's author now comes from the authenticated identity of the
// AddPublicationCommentaryUseCase's own injected identityProvider, never
// from anything a caller's input object says. This file is the
// dedicated coverage for THAT boundary — content/publicationId
// validation, storage-failure propagation, duplicate-identity handling
// and store isolation are already covered by
// tests/AddPublicationCommentaryUseCase.test.js and are not repeated
// here.
//
//   Section A: authenticated author — the injected identityProvider's
//              own currently-authenticated identity becomes the
//              commentary's authorIdentityId.
//   Section B: caller cannot override author — an `authorIdentityId`
//              field on the input is never read, even when it names a
//              different, real identity.
//   Section C: no authenticated identity — creation fails cleanly,
//              before any commentary is constructed or persisted.
//   Section D: identity changes — a later commentary from a
//              differently-authenticated provider is attributed to the
//              new identity; the earlier one is untouched.
//   Section E: publication identity independence — publicationId is
//              never derived from, or affected by, which identity is
//              authenticated.
//   Section F: storage boundary — the use case depends only on the
//              store's own save() contract, exercised through a plain
//              duck-typed fake, exactly like 0.9.244's own Section H.
//   Section G: persistence — the authenticated author survives a full
//              round trip through the real PublicationCommentaryStore.
//   Section H: failure isolation — an identity-resolution failure never
//              reaches the store at all; a genuine storage failure still
//              propagates exactly as 0.9.244 established.
//
// AUTHENTICATION ONLY, NOT AUTHORIZATION — this file never asks whether
// the resolved identity is ALLOWED to comment on the given
// publicationId. That remains a separate, later, deliberately deferred
// milestone; see application/AddPublicationCommentaryUseCase.js's own
// header.

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

class WriteFailingStorageProvider extends StorageProvider {
    save() { throw new Error('simulated write failure'); }
    load() { return null; }
    remove() {}
    list() { return []; }
}

// A real, authenticated LocalIdentityProvider — the exact
// makeIdentity(label) pattern tests/PublicationAnchorCreation.test.js
// and tests/AddPublicationCommentaryUseCase.test.js already use, per
// this milestone's own brief: reuse the existing identity/authentication
// infrastructure, never a bespoke stand-in for it.
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
    // Section A — Authenticated author
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const aliceIdentityId = alice.getSigningIdentity().id;
        const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const useCase = new AddPublicationCommentaryUseCase(store, alice);

        const { commentary } = useCase.execute(validInput());

        assert(commentary.authorIdentityId === aliceIdentityId, 'A1. commentary author is the authenticated identity');
        assert(store.getById(commentary.commentaryId).authorIdentityId === aliceIdentityId, 'A2. the authenticated author is what actually reached the store');
    }

    // -------------------------------------------------------------
    // Section B — Caller cannot override author
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const aliceIdentityId = alice.getSigningIdentity().id;
        const bobIdentityId = bob.getSigningIdentity().id;
        const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const useCase = new AddPublicationCommentaryUseCase(store, alice);

        // Alice is authenticated, but her input names Bob's real,
        // resolvable identity as the requested author.
        const { commentary } = useCase.execute(validInput({ authorIdentityId: bobIdentityId }));

        assert(commentary.authorIdentityId === aliceIdentityId, 'B1. the commentary still belongs to the authenticated caller');
        assert(commentary.authorIdentityId !== bobIdentityId, 'B2. the requested, spoofed author is never used');

        // Also true when the requested "author" is not even a real
        // identity at all — an arbitrary string, exactly the shape a
        // hostile UI request would take.
        const { commentary: commentary2 } = useCase.execute(validInput({ authorIdentityId: 'not-a-real-identity' }));
        assert(commentary2.authorIdentityId === aliceIdentityId, 'B3. an arbitrary caller-supplied author string is likewise ignored');
    }

    // -------------------------------------------------------------
    // Section C — No authenticated identity
    // -------------------------------------------------------------
    {
        // An identityProvider that exists, but has nobody authenticated
        // onto it — distinct from having no identityProvider at all.
        const unauthenticated = new LocalIdentityProvider(new InMemoryStorageProvider());
        const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const useCase = new AddPublicationCommentaryUseCase(store, unauthenticated);

        let threw = false;
        try {
            useCase.execute(validInput());
        } catch (error) {
            threw = true;
        }
        assert(threw, 'C1. creation without an authenticated identity fails');
        assert(store.loadAll().length === 0, 'C2. nothing is ever persisted for a failed identity resolution');
    }

    // -------------------------------------------------------------
    // Section D — Identity changes
    // -------------------------------------------------------------
    {
        const store = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const alice = makeIdentity('Alice');
        const aliceIdentityId = alice.getSigningIdentity().id;
        const { commentary: c1 } = new AddPublicationCommentaryUseCase(store, alice).execute(validInput({ content: 'first comment' }));

        const bob = makeIdentity('Bob');
        const bobIdentityId = bob.getSigningIdentity().id;
        const { commentary: c2 } = new AddPublicationCommentaryUseCase(store, bob).execute(validInput({ content: 'second comment' }));

        assert(c1.authorIdentityId === aliceIdentityId, 'D1. the first commentary is attributed to the first authenticated identity');
        assert(c2.authorIdentityId === bobIdentityId, 'D2. the second commentary is attributed to the second authenticated identity');
        assert(c1.authorIdentityId !== c2.authorIdentityId, 'D3. the two authors are genuinely different');

        // The earlier commentary's own author is untouched by the later
        // identity switch.
        assert(store.getById(c1.commentaryId).authorIdentityId === aliceIdentityId, 'D4. the earlier commentary keeps its original author on file');
        assert(store.getById(c2.commentaryId).authorIdentityId === bobIdentityId, 'D5. the later commentary keeps its own, different author on file');
    }

    // -------------------------------------------------------------
    // Section E — Publication identity remains independent
    // -------------------------------------------------------------
    {
        const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const publicationId = 'pub-independent';

        const alice = makeIdentity('Alice');
        const { commentary: c1 } = new AddPublicationCommentaryUseCase(store, alice).execute(validInput({ publicationId, content: 'from Alice' }));

        const bob = makeIdentity('Bob');
        const { commentary: c2 } = new AddPublicationCommentaryUseCase(store, bob).execute(validInput({ publicationId, content: 'from Bob' }));

        assert(c1.publicationId === publicationId, 'E1. publicationId is preserved regardless of author');
        assert(c2.publicationId === publicationId, 'E2. the same publicationId is preserved for a different author');
        assert(c1.authorIdentityId !== c2.authorIdentityId, 'E3. the two commentaries genuinely have different authors');

        const forPub = store.getForPublication(publicationId);
        assert(forPub.length === 2, 'E4. both commentaries are queryable under the one, unaffected publicationId');
    }

    // -------------------------------------------------------------
    // Section F — Storage remains behind the boundary
    // -------------------------------------------------------------
    {
        // A plain duck-typed store — no PublicationCommentaryStore, no
        // StorageProvider imported at all — proving this use case still
        // depends only on the store's own save() contract, even with the
        // identity boundary now wired in.
        const calls = [];
        const fakeStore = {
            save(commentary) {
                calls.push(commentary);
                return true;
            }
        };
        const alice = makeIdentity('Alice');
        const aliceIdentityId = alice.getSigningIdentity().id;
        const useCase = new AddPublicationCommentaryUseCase(fakeStore, alice);

        const { commentary, isNew } = useCase.execute(validInput({ content: 'via a fake store' }));

        assert(calls.length === 1 && calls[0] === commentary, 'F1. the use case calls exactly the store boundary\'s save() method');
        assert(isNew === true, 'F2. the use case trusts the injected store\'s own return value');
        assert(commentary.authorIdentityId === aliceIdentityId, 'F3. authorship resolution is independent of which store implementation is injected');
    }

    // -------------------------------------------------------------
    // Section G — Persistence
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const aliceIdentityId = alice.getSigningIdentity().id;
        const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const useCase = new AddPublicationCommentaryUseCase(store, alice);

        const { commentary } = useCase.execute(validInput({ content: 'a durable comment' }));

        const reloaded = store.getById(commentary.commentaryId);
        assert(reloaded instanceof PublicationCommentary, 'G1. the commentary round-trips through the real store');
        assert(reloaded !== commentary, 'G2. the reloaded instance is re-hydrated, not the same object reference');
        assert(reloaded.authorIdentityId === aliceIdentityId, 'G3. the authenticated author survives the complete persistence round trip');
        assert(JSON.stringify(reloaded.toJSON()) === JSON.stringify(commentary.toJSON()), 'G4. the reloaded record matches what execute() returned, author included');
    }

    // -------------------------------------------------------------
    // Section H — Failure isolation
    // -------------------------------------------------------------
    {
        // H1/H2: an identity-resolution failure never even reaches the
        // store — a save() spy proves it is never called.
        const calls = [];
        const spyStore = {
            save(commentary) {
                calls.push(commentary);
                return true;
            }
        };
        const unauthenticated = new LocalIdentityProvider(new InMemoryStorageProvider());
        const useCaseWithoutIdentity = new AddPublicationCommentaryUseCase(spyStore, unauthenticated);

        let threw = false;
        try {
            useCaseWithoutIdentity.execute(validInput());
        } catch (error) {
            threw = true;
        }
        assert(threw, 'H1. identity-resolution failure prevents creation');
        assert(calls.length === 0, 'H2. the store is never even called when identity resolution fails');

        // H3: a genuine storage write failure still propagates exactly
        // as 0.9.244 established — the identity boundary changes nothing
        // about that behavior.
        const alice = makeIdentity('Alice');
        const failingStore = new PublicationCommentaryStore(new WriteFailingStorageProvider());
        const useCaseWithFailingStore = new AddPublicationCommentaryUseCase(failingStore, alice);

        threw = false;
        try {
            useCaseWithFailingStore.execute(validInput());
        } catch (error) {
            threw = true;
        }
        assert(threw, 'H3. a genuine storage write failure still propagates as a thrown error');
    }

    console.log('\n✅ All PublicationCommentaryAuthorship tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All PublicationCommentaryAuthorship tests passed');
}).catch((error) => {
    console.error('\n✗ PublicationCommentaryAuthorship tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
