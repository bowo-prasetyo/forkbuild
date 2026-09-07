import { StorageProvider } from '../storage/StorageProvider.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { AddPublicationCommentaryUseCase } from '../application/AddPublicationCommentaryUseCase.js';
import { CanCommentOnPublicationUseCase } from '../application/CanCommentOnPublicationUseCase.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';

// 0.9.246 — Publication Commentary Authorization Boundary.
//
// 0.9.245's own header drew the line deliberately: "this use case
// still does not ask, let alone answer, 'is Alice allowed to comment
// on this Publication.'" This file is the dedicated coverage for that
// separate question — authentication (0.9.245, tests/
// PublicationCommentaryAuthorship.test.js) and content/storage
// mechanics (0.9.244, tests/AddPublicationCommentaryUseCase.test.js)
// are not repeated here.
//
// THE DISCOVERED POLICY, not an invented one — see application/
// CanCommentOnPublicationUseCase.js's own header for the full audit.
// ForkBuild has no existing identity-vs-Publication permission
// relationship: Publications are openly listed and resolved by every
// discovery provider with no viewer-identity parameter at all, and the
// closest existing precedent (identity/TrustPolicy.js's own
// AuthorityMode.DISCOVERED) is itself a permissive default for exactly
// this reason — "no external trust source exists yet... accept any
// signer." So the real, enforced policy this milestone ships is: any
// authenticated identity may comment on any Publication that actually
// exists (resolves through a discoveryProvider, the same
// `findById(publicationId)` dependency application/
// ResolvePublicationUseCase.js, PlacePublicationUseCase.js and others
// already share) — denied only when the Publication does not resolve.
//
//   Section A: authorized — an authenticated identity commenting on a
//              Publication that exists succeeds.
//   Section B: unauthorized — a publicationId that does not resolve is
//              denied; no commentary is constructed, the store gains no
//              new record.
//   Section C: authentication remains authoritative — a caller-supplied
//              authorIdentityId still has no effect, preserving 0.9.245's
//              own invariant now that a second gate sits in front of it.
//   Section D: Publication isolation — authorization for one Publication
//              never leaks into authorization for a different one.
//   Section E: switching produces no stale state — across a sequence of
//              calls mixing identities and Publications, each call's
//              outcome depends only on its own arguments, never on what
//              a previous call decided.
//   Section F: authorization failure isolation — a denied request
//              mutates nothing: not the store, not another Publication's
//              commentary, not another identity's.
//   Section G: storage failure — for an authorized request, a genuine
//              storage write failure still propagates exactly as 0.9.244
//              established; authorization changes nothing about that.
//   Section H: existing infrastructure — the authorization decision
//              comes from the injected discoveryProvider collaborator,
//              never a permission table duplicated inside commentary
//              code.

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

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

// A minimal fake discoveryProvider — a plain object exposing only
// findById(id), the one method CanCommentOnPublicationUseCase actually
// calls, exactly like AddPublicationCommentaryUseCase's own fakeStore
// pattern elsewhere in this test suite. register() names a publicationId
// as "existing"; any id never registered resolves to null, the same
// discovery/LocalDiscoveryProvider.js#findById() "not found" contract.
class FakeDiscoveryProvider {
    constructor() { this._known = new Set(); }
    register(publicationId) { this._known.add(publicationId); return this; }
    findById(id) { return this._known.has(id) ? { id } : null; }
}

function validInput(overrides = {}) {
    return {
        publicationId: 'pub-exists',
        content: 'hello world',
        ...overrides
    };
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function runTests() {
    // -------------------------------------------------------------
    // Section A — Authorized
    // -------------------------------------------------------------
    {
        const discovery = new FakeDiscoveryProvider().register('pub-exists');
        const canComment = new CanCommentOnPublicationUseCase(discovery);
        const alice = makeIdentity('Alice');
        const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const useCase = new AddPublicationCommentaryUseCase(store, alice, canComment);

        const { commentary, isNew } = useCase.execute(validInput());

        assert(isNew === true, 'A1. an authorized request creates a new commentary');
        assert(commentary.publicationId === 'pub-exists', 'A2. the commentary targets the authorized publication');
        assert(store.getById(commentary.commentaryId) !== null, 'A3. the authorized commentary actually reached the store');
    }

    // -------------------------------------------------------------
    // Section B — Unauthorized
    // -------------------------------------------------------------
    {
        // 'pub-exists' is deliberately NOT registered here — this
        // discoveryProvider knows about no Publication at all.
        const discovery = new FakeDiscoveryProvider();
        const canComment = new CanCommentOnPublicationUseCase(discovery);
        const alice = makeIdentity('Alice');
        const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const useCase = new AddPublicationCommentaryUseCase(store, alice, canComment);

        let threw = false;
        try {
            useCase.execute(validInput());
        } catch (error) {
            threw = true;
        }
        assert(threw, 'B1. a request against an unknown publication is denied');
        assert(store.loadAll().length === 0, 'B2. the store contains no new record for the denied request');
    }

    // -------------------------------------------------------------
    // Section C — Authentication remains authoritative
    // -------------------------------------------------------------
    {
        const discovery = new FakeDiscoveryProvider().register('pub-exists');
        const canComment = new CanCommentOnPublicationUseCase(discovery);
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const aliceIdentityId = alice.getSigningIdentity().id;
        const bobIdentityId = bob.getSigningIdentity().id;
        const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const useCase = new AddPublicationCommentaryUseCase(store, alice, canComment);

        // Alice is authenticated and authorized; her input names Bob's
        // real identity as the requested author. The 0.9.245 invariant —
        // a caller cannot name a different author — must still hold with
        // the authorization gate now sitting in front of it.
        const { commentary } = useCase.execute(validInput({ authorIdentityId: bobIdentityId }));

        assert(commentary.authorIdentityId === aliceIdentityId, 'C1. the commentary still belongs to the authenticated caller');
        assert(commentary.authorIdentityId !== bobIdentityId, 'C2. the requested, spoofed author is never used');
    }

    // -------------------------------------------------------------
    // Section D — Publication isolation
    // -------------------------------------------------------------
    {
        const discovery = new FakeDiscoveryProvider().register('P1');
        const canComment = new CanCommentOnPublicationUseCase(discovery);
        const alice = makeIdentity('Alice');
        const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const useCase = new AddPublicationCommentaryUseCase(store, alice, canComment);

        const { commentary } = useCase.execute(validInput({ publicationId: 'P1', content: 'about P1' }));
        assert(commentary.publicationId === 'P1', 'D1. authorization for the registered P1 succeeds');

        let threw = false;
        try {
            useCase.execute(validInput({ publicationId: 'P2', content: 'about P2' }));
        } catch (error) {
            threw = true;
        }
        assert(threw, 'D2. authorization for P1 does not accidentally authorize the unregistered P2');
        assert(store.getForPublication('P2').length === 0, 'D3. no commentary was created against P2');
        assert(store.getForPublication('P1').length === 1, 'D4. P1\'s own commentary is unaffected by the P2 denial');
    }

    // -------------------------------------------------------------
    // Section E — Switching produces no stale authorization state
    // -------------------------------------------------------------
    {
        // Same Publication, alternating identities: A -> authorized,
        // B -> denied (a second, unregistered publication), A ->
        // authorized again. Each call's outcome must depend only on its
        // own (identity, publicationId) pair, never on the previous call.
        const discovery = new FakeDiscoveryProvider().register('pub-real');
        const canComment = new CanCommentOnPublicationUseCase(discovery);
        const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');

        const first = new AddPublicationCommentaryUseCase(store, alice, canComment)
            .execute(validInput({ publicationId: 'pub-real', content: 'alice first' }));
        assert(first.commentary.publicationId === 'pub-real', 'E1. A -> authorized against the real publication');

        let threw = false;
        try {
            new AddPublicationCommentaryUseCase(store, bob, canComment)
                .execute(validInput({ publicationId: 'pub-fake', content: 'bob denied' }));
        } catch (error) {
            threw = true;
        }
        assert(threw, 'E2. B -> denied against the unregistered publication');

        const third = new AddPublicationCommentaryUseCase(store, alice, canComment)
            .execute(validInput({ publicationId: 'pub-real', content: 'alice again' }));
        assert(third.commentary.publicationId === 'pub-real', 'E3. A -> authorized again, unaffected by B\'s intervening denial');

        assert(store.getForPublication('pub-real').length === 2, 'E4. exactly the two authorized commentaries are on file');
        assert(store.getForPublication('pub-fake').length === 0, 'E5. the denied publication gained no commentary at all');

        // The same identity/publication switching exercised the other
        // way: the SAME discoveryProvider instance is reused across every
        // call above, so a naive implementation caching "this identity
        // was previously authorized" (rather than re-checking Section
        // D's publicationId every time) would have let Bob's call
        // through. It did not.
    }

    // -------------------------------------------------------------
    // Section F — Authorization failure isolation
    // -------------------------------------------------------------
    {
        const discovery = new FakeDiscoveryProvider().register('pub-real');
        const canComment = new CanCommentOnPublicationUseCase(discovery);
        const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');

        // A denied request never even constructs a PublicationCommentary
        // — proven with a save() spy in place of the real store.
        const calls = [];
        const spyStore = { save(commentary) { calls.push(commentary); return true; } };
        let threw = false;
        try {
            new AddPublicationCommentaryUseCase(spyStore, alice, canComment)
                .execute(validInput({ publicationId: 'pub-missing' }));
        } catch (error) {
            threw = true;
        }
        assert(threw, 'F1. the denied request throws');
        assert(calls.length === 0, 'F2. the store is never even called for a denied request');

        // A denied request against pub-missing must not mutate the real
        // store, must not affect the already-authorized pub-real, and
        // must not affect a different identity's ability to comment on
        // pub-real afterward.
        new AddPublicationCommentaryUseCase(store, alice, canComment).execute(validInput({ publicationId: 'pub-real', content: 'alice ok' }));
        threw = false;
        try {
            new AddPublicationCommentaryUseCase(store, alice, canComment).execute(validInput({ publicationId: 'pub-missing', content: 'denied' }));
        } catch (error) {
            threw = true;
        }
        assert(threw, 'F3. the second, unauthorized request is denied');
        assert(store.getForPublication('pub-real').length === 1, 'F4. the earlier, authorized commentary on pub-real is untouched');
        assert(store.getForPublication('pub-missing').length === 0, 'F5. the denied publication gained no commentary');

        const { commentary: bobComment } = new AddPublicationCommentaryUseCase(store, bob, canComment)
            .execute(validInput({ publicationId: 'pub-real', content: 'bob ok' }));
        assert(bobComment.authorIdentityId === bob.getSigningIdentity().id, 'F6. a different identity is unaffected by the earlier denial and can still comment');
        assert(store.getForPublication('pub-real').length === 2, 'F7. both authorized commentaries, and only those, are on file');
    }

    // -------------------------------------------------------------
    // Section G — Storage failure still propagates
    // -------------------------------------------------------------
    {
        const discovery = new FakeDiscoveryProvider().register('pub-exists');
        const canComment = new CanCommentOnPublicationUseCase(discovery);
        const alice = makeIdentity('Alice');
        const failingStore = new PublicationCommentaryStore(new WriteFailingStorageProvider());
        const useCase = new AddPublicationCommentaryUseCase(failingStore, alice, canComment);

        let threw = false;
        try {
            useCase.execute(validInput());
        } catch (error) {
            threw = true;
        }
        assert(threw, 'G1. an authorized request still propagates a genuine storage write failure');
    }

    // -------------------------------------------------------------
    // Section H — Existing infrastructure, not a duplicated table
    // -------------------------------------------------------------
    {
        // The authorization decision comes entirely from calling the
        // injected discoveryProvider's own findById() — proven by
        // swapping in a spy that records exactly what it was asked, and
        // by proving the decision flips the instant the SAME provider's
        // own registration state changes, without touching
        // CanCommentOnPublicationUseCase or AddPublicationCommentaryUseCase.
        const calls = [];
        const spyDiscovery = {
            findById(id) {
                calls.push(id);
                return id === 'pub-exists' ? { id } : null;
            }
        };
        const canComment = new CanCommentOnPublicationUseCase(spyDiscovery);
        const alice = makeIdentity('Alice');
        const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const useCase = new AddPublicationCommentaryUseCase(store, alice, canComment);

        useCase.execute(validInput({ publicationId: 'pub-exists' }));
        assert(calls.includes('pub-exists'), 'H1. the authorization decision was actually delegated to the discoveryProvider');

        let threw = false;
        try {
            useCase.execute(validInput({ publicationId: 'pub-does-not-exist' }));
        } catch (error) {
            threw = true;
        }
        assert(threw, 'H2. the discoveryProvider\'s own "not found" answer, and nothing else, produces the denial');
        assert(calls.includes('pub-does-not-exist'), 'H3. the discoveryProvider was consulted for the denied id too, not skipped');

        // A mutable, duck-typed discoveryProvider proves this is a real
        // dependency, not a value CanCommentOnPublicationUseCase copies
        // or snapshots at construction time.
        const mutableDiscovery = new FakeDiscoveryProvider();
        const mutableCanComment = new CanCommentOnPublicationUseCase(mutableDiscovery);
        const mutableUseCase = new AddPublicationCommentaryUseCase(store, alice, mutableCanComment);

        threw = false;
        try { mutableUseCase.execute(validInput({ publicationId: 'pub-late' })); } catch (error) { threw = true; }
        assert(threw, 'H4. before registration, the same publicationId is denied');

        mutableDiscovery.register('pub-late');
        const { commentary } = mutableUseCase.execute(validInput({ publicationId: 'pub-late' }));
        assert(commentary.publicationId === 'pub-late', 'H5. after registration, the identical publicationId is authorized — the decision tracks the discoveryProvider\'s own live state, confirming no separate permission table was consulted instead');

        // Construction-time validation, matching every other collaborator
        // this use case requires.
        threw = false;
        try { new CanCommentOnPublicationUseCase(null); } catch (error) { threw = true; }
        assert(threw, 'H6. a missing discoveryProvider is rejected at construction, not at first use');
    }

    console.log('\n✅ All PublicationCommentaryAuthorization tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All PublicationCommentaryAuthorization tests passed');
}).catch((error) => {
    console.error('\n✗ PublicationCommentaryAuthorization tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
