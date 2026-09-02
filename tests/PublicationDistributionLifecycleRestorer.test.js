import { readFile } from 'node:fs/promises';
import { PublicationDistributionLifecycleRestorer } from '../application/PublicationDistributionLifecycleRestorer.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { PublicationDistributionLifecyclePersistence } from '../application/PublicationDistributionLifecyclePersistence.js';
import { transitionPublicationDistributionLifecycle } from '../application/PublicationDistributionLifecycleTransition.js';
import { describePublicationDistributionLifecycle } from '../application/PublicationDistributionLifecycle.js';
import { executePublicationDistribution } from '../application/PublicationDistributionExecutor.js';
import { describePublicationDistribution } from '../application/PublicationDistributionDescriptor.js';
import { ArweavePublicationMaterialUploader } from '../application/ArweavePublicationMaterialUploader.js';
import { NostrPublicationDiscoveryPublisher } from '../application/NostrPublicationDiscoveryPublisher.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { Signature } from '../core/Signature.js';

// 0.9.56 — Publication Distribution Lifecycle Restoration Boundary.
// See docs/Roadmap.md, "0.9.56 — Publication Distribution Lifecycle
// Restoration Boundary," for the full milestone story.
//
//   Section A: FLAGSHIP — a true process-restart simulation: Process A
//              executes/describes/transitions/stores/persists (0.9.49
//              through 0.9.55), then Process A's own store/bridge are
//              discarded; Process B constructs entirely fresh instances,
//              restores explicitly, and proves the restored lifecycle
//              participates normally in ordinary store/observation
//              (0.9.51/0.9.53) afterward
//   Section B: existing persisted lifecycle restores
//   Section C: missing persistence does nothing — persistence.load() ===
//              null and store.set() is never called
//   Section D: existing memory state survives missing persistence
//   Section E: loaded identity — store.get(id) === loadedLifecycle, but
//              loadedLifecycle !== the original, pre-restart lifecycle
//   Section F: the existing 0.9.53 observation boundary sees the exact
//              object restore() inserted
//   Section G: persistence failure propagates, uninvented
//   Section H: store failure propagates, uninvented, no rollback
//   Section I: publication isolation
//   Section J: no automatic loading — construction calls neither
//              collaborator
//   Section K: no transition semantics — restore() never invokes 0.9.51
//   Section L: constructor validation
//   Section M: malformed restore() input degrades silently
//   Section N: architectural regression

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() {
        super();
        this._data = new Map();
    }
    save(name, data) {
        this._data.set(name, JSON.parse(JSON.stringify(data)));
    }
    load(name) {
        return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null;
    }
    remove(name) {
        this._data.delete(name);
    }
    list() {
        return Array.from(this._data.keys());
    }
}

function makeSpyStore() {
    const setCalls = [];
    return {
        setCalls,
        set(publicationId, lifecycle) {
            setCalls.push({ publicationId, lifecycle });
        }
    };
}

function makeSpyPersistence(loadImpl) {
    const loadCalls = [];
    return {
        loadCalls,
        load(publicationId) {
            loadCalls.push(publicationId);
            return loadImpl(publicationId);
        }
    };
}

function signedPublication(overrides = {}) {
    const publication = new Publication({
        id: 'pub-1',
        documentId: 'doc-1',
        title: 'A Signed Publication',
        author: 'author-1',
        contentReference: new ContentReference({ hash: 'legacy-hash', uri: 'ipfs://legacy-cid', storage: 'ipfs' }),
        ...overrides
    });
    if (overrides.signature !== undefined) {
        return publication;
    }
    return publication.withSignature(new Signature({
        algorithm: 'Ed25519',
        signer: 'author-1',
        signature: 'fake-signature-value',
        signedHash: 'fake-signed-hash',
        domain: 'forkbuild'
    }));
}

function makeFakeSigner({ handler } = {}) {
    async function sign(material) {
        return handler ? handler(material) : { id: 'fake-tx-id', transaction: { data: material } };
    }
    return { sign };
}

function gatewayResponse(body, { status = 200 } = {}) {
    return new Response(body, { status });
}

function makeFakeRelay({ handler }) {
    const calls = [];
    async function publishImpl(relayUrl, eventTemplate) {
        calls.push({ relayUrl, eventTemplate });
        return handler(relayUrl, eventTemplate);
    }
    return { calls, publishImpl };
}

const validLifecycle = Object.freeze({
    material: Object.freeze({ state: 'PRESENT', uri: 'ar://TXRESTORER', storage: 'ar' }),
    discovery: Object.freeze({ state: 'ABSENT' })
});

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: a true process-restart simulation. Process A
    // executes a real distribution, describes/transitions its lifecycle,
    // stores and persists it (0.9.49 through 0.9.55). Process A's own
    // store and bridge are then discarded entirely. Process B constructs
    // wholly fresh instances — a fresh persistence reader, a fresh store,
    // a fresh restorer — sharing only the same underlying injected
    // storage, and restores explicitly. The restored lifecycle then
    // participates in an ordinary 0.9.51 transition and is observed by an
    // ordinary 0.9.53 subscriber, exactly like any other stored lifecycle.
    // ---------------------------------------------------------------
    {
        const transactionId = 'RestorerFlagshipTransactionId12345678';
        const materialUploader = new ArweavePublicationMaterialUploader({
            signer: makeFakeSigner({ handler: () => ({ id: transactionId, transaction: { placeholder: true } }) }),
            fetchImpl: async () => gatewayResponse('accepted')
        });
        const relay = makeFakeRelay({ handler: () => null });
        const discoveryPublisher = new NostrPublicationDiscoveryPublisher({
            relayUrl: 'wss://relay.example',
            discoveryTag: 'forkbuild-publication',
            publishImpl: relay.publishImpl
        });

        const publication = signedPublication();

        const result = await executePublicationDistribution({
            publication,
            serializedMaterial: 'serialized publication material',
            materialUploader,
            distributionDescriptor: describePublicationDistribution,
            discoveryPublisher
        });

        const declined = describePublicationDistributionLifecycle(result);
        assert(declined !== null && declined.material.state === 'PRESENT' && declined.discovery.state === 'ABSENT', 'sanity: the 0.9.50 decline lifecycle is material PRESENT / discovery ABSENT');

        // --- Process A ---
        const sharedStorage = new InMemoryStorageProvider();
        {
            const storeA = new PublicationDistributionLifecycleMemoryStore();
            const persistenceA = new PublicationDistributionLifecyclePersistence(sharedStorage);
            storeA.set(publication.id, declined);
            persistenceA.save(publication.id, storeA.get(publication.id));
            // storeA/persistenceA fall out of scope here — discarded, as
            // "Process A" would be on a real process restart.
        }

        // --- Process B: wholly fresh instances, sharing only the storage ---
        const persistenceB = new PublicationDistributionLifecyclePersistence(sharedStorage);
        const storeB = new PublicationDistributionLifecycleMemoryStore();
        const restorerB = new PublicationDistributionLifecycleRestorer(persistenceB, storeB);

        assert(storeB.get(publication.id) === null, '1. FLAGSHIP — Process B\'s fresh store starts out empty, exactly as a real process restart would leave it');

        const restored = restorerB.restore(publication.id);
        assert(restored !== null, '2. FLAGSHIP — restore() finds Process A\'s persisted snapshot');
        assert(restored.material.state === 'PRESENT' && restored.material.uri === declined.material.uri, '3. FLAGSHIP — the restored material section carries the same facts Process A persisted');
        assert(restored.discovery.state === 'ABSENT', '4. FLAGSHIP — the restored discovery section carries the same facts Process A persisted');

        assert(storeB.get(publication.id) === restored, '5. FLAGSHIP — Process B\'s store now holds the exact object restore() returned');
        assert(restored !== declined, '6. FLAGSHIP — the restored lifecycle is a NEW object, never the same reference Process A originally described');

        // Now prove the restored lifecycle is an ordinary memory-store
        // lifecycle, participating normally in the existing 0.9.53
        // observation pipeline and a further 0.9.51 transition.
        let observedId = null;
        let observedLifecycle = undefined;
        storeB.subscribe(publication.id, (id, lifecycle) => {
            observedId = id;
            observedLifecycle = lifecycle;
        });

        const retryFact = { origin: 'wss://relay-retry.example', discoveryTag: 'forkbuild-publication', id: 'RESTOREREVENT' + 'f'.repeat(50) };
        const recovered = transitionPublicationDistributionLifecycle(restored, { discovery: retryFact });
        assert(recovered !== null && recovered.discovery.state === 'PRESENT', 'sanity: 0.9.51 transitions the restored lifecycle\'s discovery to PRESENT from the retry fact');

        storeB.set(publication.id, recovered);
        assert(observedId === publication.id && observedLifecycle === recovered, '7. FLAGSHIP — the restored lifecycle participates normally in the store\'s own ordinary observation pipeline (0.9.53) after a further transition (0.9.51)');

        console.log('✓ Flagship: a true process-restart simulation — Process A executes/describes/transitions/stores/persists, its own store/bridge are discarded, and Process B\'s wholly fresh instances restore explicitly and resume ordinary store/observation/transition participation');
    }

    // ---------------------------------------------------------------
    // Section B — existing persisted lifecycle restores: save() -> a
    // fresh restorer -> restore() -> store.get() sees it.
    // ---------------------------------------------------------------
    {
        const sharedStorage = new InMemoryStorageProvider();
        const persistence = new PublicationDistributionLifecyclePersistence(sharedStorage);
        persistence.save('pub-b', validLifecycle);

        const store = new PublicationDistributionLifecycleMemoryStore();
        const restorer = new PublicationDistributionLifecycleRestorer(persistence, store);

        const returned = restorer.restore('pub-b');
        assert(returned !== null, '8. restore() returns the persisted lifecycle when one exists');
        assert(returned.material.uri === validLifecycle.material.uri, '9. the returned lifecycle carries the persisted facts');
        assert(store.get('pub-b') === returned, '10. store.get() now returns the exact object restore() returned');

        console.log('✓ Existing persisted lifecycle restores: save() -> fresh restorer -> restore() -> store.get() sees it');
    }

    // ---------------------------------------------------------------
    // Section C — missing persistence does nothing: persistence.load()
    // returns null, and store.set() is never called.
    // ---------------------------------------------------------------
    {
        const persistence = makeSpyPersistence(() => null);
        const store = makeSpyStore();
        const restorer = new PublicationDistributionLifecycleRestorer(persistence, store);

        const returned = restorer.restore('pub-c');
        assert(returned === null, '11. restore() returns null when persistence.load() returns null');
        assert(persistence.loadCalls.length === 1 && persistence.loadCalls[0] === 'pub-c', '12. persistence.load() was called exactly once, with the correct publicationId');
        assert(store.setCalls.length === 0, '13. store.set() is never called when persistence has no record');

        console.log('✓ Missing persistence does nothing: persistence.load() === null, and store.set() was never called');
    }

    // ---------------------------------------------------------------
    // Section D — existing memory state survives missing persistence:
    // the single most important guarantee this milestone establishes.
    // ---------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();
        store.set('pub-d', validLifecycle);
        assert(store.get('pub-d') === validLifecycle, 'sanity: the store holds lifecycle A before restore() is ever called');

        const persistence = new PublicationDistributionLifecyclePersistence(new InMemoryStorageProvider());
        assert(persistence.load('pub-d') === null, 'sanity: persistence has no record for pub-d');

        const restorer = new PublicationDistributionLifecycleRestorer(persistence, store);
        const returned = restorer.restore('pub-d');

        assert(returned === null, '14. restore() returns null when persistence has no record');
        assert(store.get('pub-d') === validLifecycle, '15. the store\'s existing lifecycle is completely untouched — an absent persistence record is never interpreted as an instruction to erase existing memory state');

        console.log('✓ Existing memory state survives missing persistence: restore() against an empty persistence record never erases what the store already held');
    }

    // ---------------------------------------------------------------
    // Section E — loaded identity: store.get(id) === loadedLifecycle, but
    // loadedLifecycle !== the lifecycle that was originally persisted.
    // ---------------------------------------------------------------
    {
        const sharedStorage = new InMemoryStorageProvider();
        const persistence = new PublicationDistributionLifecyclePersistence(sharedStorage);
        persistence.save('pub-e', validLifecycle);

        const store = new PublicationDistributionLifecycleMemoryStore();
        const restorer = new PublicationDistributionLifecycleRestorer(persistence, store);
        const loaded = restorer.restore('pub-e');

        assert(store.get('pub-e') === loaded, '16. store.get(id) === the exact object restore() returned');
        assert(loaded !== validLifecycle, '17. the loaded lifecycle is a NEW object, never the same reference that was originally persisted');
        assert(loaded.material.uri === validLifecycle.material.uri, '18. the loaded lifecycle carries the identical underlying facts despite being a different object');

        console.log('✓ Loaded identity: store.get(id) === loadedLifecycle, while loadedLifecycle !== the originally persisted reference');
    }

    // ---------------------------------------------------------------
    // Section F — the existing 0.9.53 observation boundary sees the exact
    // object restore() inserted.
    // ---------------------------------------------------------------
    {
        const sharedStorage = new InMemoryStorageProvider();
        const persistence = new PublicationDistributionLifecyclePersistence(sharedStorage);
        persistence.save('pub-f', validLifecycle);

        const store = new PublicationDistributionLifecycleMemoryStore();
        let observed = undefined;
        store.subscribe('pub-f', (id, lifecycle) => {
            observed = lifecycle;
        });

        const restorer = new PublicationDistributionLifecycleRestorer(persistence, store);
        const restored = restorer.restore('pub-f');

        assert(observed === restored, '19. an existing 0.9.53 subscriber receives the exact object restore() inserted into the store');

        console.log('✓ Observer receives restored lifecycle: restore()\'s own store.set() notifies an existing subscriber with the exact restored object');
    }

    // ---------------------------------------------------------------
    // Section G — persistence failure propagates, uninvented: a
    // genuinely throwing persistence.load() propagates straight out of
    // restore(), with no RESTORE_FAILED or similar vocabulary.
    // ---------------------------------------------------------------
    {
        const failingPersistence = {
            load() {
                throw new Error('a deliberately broken persistence implementation');
            }
        };
        const store = makeSpyStore();
        const restorer = new PublicationDistributionLifecycleRestorer(failingPersistence, store);

        let threw = false;
        try {
            restorer.restore('pub-g');
        } catch (error) {
            threw = true;
            assert(error.message === 'a deliberately broken persistence implementation', '20. the original error propagates unchanged, with no new RESTORE_FAILED wrapper');
        }
        assert(threw, '21. a genuinely throwing persistence.load() propagates straight out of restore()');
        assert(store.setCalls.length === 0, '22. store.set() is never called when persistence.load() itself throws');

        console.log('✓ Persistence failure: a throwing persistence.load() propagates unchanged out of restore(), with no invented failure vocabulary');
    }

    // ---------------------------------------------------------------
    // Section H — store failure propagates, uninvented, with no rollback
    // of any kind (there is nothing to roll back).
    // ---------------------------------------------------------------
    {
        const persistence = makeSpyPersistence(() => validLifecycle);
        const failingStore = {
            set() {
                throw new Error('a deliberately broken store implementation');
            }
        };
        const restorer = new PublicationDistributionLifecycleRestorer(persistence, failingStore);

        let threw = false;
        try {
            restorer.restore('pub-h');
        } catch (error) {
            threw = true;
            assert(error.message === 'a deliberately broken store implementation', '23. the original error propagates unchanged');
        }
        assert(threw, '24. a genuinely throwing store.set() propagates straight out of restore()');

        console.log('✓ Store failure: a throwing store.set() propagates unchanged out of restore(), with no rollback of any kind');
    }

    // ---------------------------------------------------------------
    // Section I — publication isolation: restoring A never touches B.
    // ---------------------------------------------------------------
    {
        const sharedStorage = new InMemoryStorageProvider();
        const persistence = new PublicationDistributionLifecyclePersistence(sharedStorage);
        persistence.save('pub-i-a', validLifecycle);

        const otherLifecycle = Object.freeze({
            material: Object.freeze({ state: 'PRESENT', uri: 'ar://TXOTHERISOLATION', storage: 'ar' }),
            discovery: Object.freeze({ state: 'ABSENT' })
        });
        persistence.save('pub-i-b', otherLifecycle);

        const store = new PublicationDistributionLifecycleMemoryStore();
        const restorer = new PublicationDistributionLifecycleRestorer(persistence, store);

        restorer.restore('pub-i-a');
        assert(store.get('pub-i-a') !== null, '25. restoring pub-i-a stores pub-i-a\'s own lifecycle');
        assert(store.get('pub-i-b') === null, '26. restoring pub-i-a never touches pub-i-b, which was never restored');

        console.log('✓ Publication isolation: restoring one publication\'s snapshot never reads or writes any other publication\'s entry');
    }

    // ---------------------------------------------------------------
    // Section J — no automatic loading: construction calls neither
    // collaborator.
    // ---------------------------------------------------------------
    {
        const persistence = makeSpyPersistence(() => validLifecycle);
        const store = makeSpyStore();

        new PublicationDistributionLifecycleRestorer(persistence, store);

        assert(persistence.loadCalls.length === 0, '27. construction never calls persistence.load()');
        assert(store.setCalls.length === 0, '28. construction never calls store.set()');

        console.log('✓ No automatic loading: constructing a restorer produces zero persistence or store calls');
    }

    // ---------------------------------------------------------------
    // Section K — no transition semantics: restore() never invokes the
    // 0.9.51 transition function, even indirectly.
    // ---------------------------------------------------------------
    {
        const sharedStorage = new InMemoryStorageProvider();
        const persistence = new PublicationDistributionLifecyclePersistence(sharedStorage);
        persistence.save('pub-k', validLifecycle);

        const store = new PublicationDistributionLifecycleMemoryStore();
        const restorer = new PublicationDistributionLifecycleRestorer(persistence, store);
        const restored = restorer.restore('pub-k');

        // A transition always requires an explicit fact argument and
        // produces a lifecycle that is never === its own input (0.9.51).
        // restore() itself supplies no such fact and performs no such
        // call — the restored lifecycle is exactly what persistence.load()
        // reconstructed, verified structurally below via the
        // architectural regression pass (Section N) that confirms no
        // import of the transition module exists in this file at all.
        assert(restored.material.state === 'PRESENT' && restored.discovery.state === 'ABSENT', '29. the restored lifecycle carries exactly the persisted facts, with no transition applied on top');

        console.log('✓ No transition semantics: restore() reintroduces an existing fact verbatim, never generating a new lifecycle transition');
    }

    // ---------------------------------------------------------------
    // Section L — constructor validation: the restorer requires a
    // persistence instance with load() and a store with set(), throwing
    // immediately on a missing or incompatible one.
    // ---------------------------------------------------------------
    {
        let threwOnMissingPersistence = false;
        try {
            new PublicationDistributionLifecycleRestorer();
        } catch (error) {
            threwOnMissingPersistence = true;
        }
        assert(threwOnMissingPersistence, '30. constructing without a persistence instance throws');

        let threwOnPersistenceWithoutLoad = false;
        try {
            new PublicationDistributionLifecycleRestorer({}, makeSpyStore());
        } catch (error) {
            threwOnPersistenceWithoutLoad = true;
        }
        assert(threwOnPersistenceWithoutLoad, '31. constructing with a persistence instance missing load() throws');

        let threwOnMissingStore = false;
        try {
            new PublicationDistributionLifecycleRestorer(makeSpyPersistence(() => null));
        } catch (error) {
            threwOnMissingStore = true;
        }
        assert(threwOnMissingStore, '32. constructing without a store throws');

        let threwOnStoreWithoutSet = false;
        try {
            new PublicationDistributionLifecycleRestorer(makeSpyPersistence(() => null), {});
        } catch (error) {
            threwOnStoreWithoutSet = true;
        }
        assert(threwOnStoreWithoutSet, '33. constructing with a store missing set() throws');

        const restorer = new PublicationDistributionLifecycleRestorer(new PublicationDistributionLifecyclePersistence(new InMemoryStorageProvider()), new PublicationDistributionLifecycleMemoryStore());
        assert(restorer instanceof PublicationDistributionLifecycleRestorer, '34. a well-formed persistence instance and store construct successfully');

        console.log('✓ Constructor validation: the restorer validates its two injected collaborators eagerly, once, at construction');
    }

    // ---------------------------------------------------------------
    // Section M — malformed restore() input degrades silently, never
    // throws, and calls neither collaborator.
    // ---------------------------------------------------------------
    {
        const persistence = makeSpyPersistence(() => validLifecycle);
        const store = makeSpyStore();
        const restorer = new PublicationDistributionLifecycleRestorer(persistence, store);

        for (const badId of [undefined, null, '', 42, {}]) {
            const returned = restorer.restore(badId);
            assert(returned === null, '35. restore() returns null for a malformed publicationId');
        }
        assert(persistence.loadCalls.length === 0, '36. a malformed publicationId never reaches persistence.load()');
        assert(store.setCalls.length === 0, '37. a malformed publicationId never reaches store.set()');

        console.log('✓ Malformed restore() input degrades silently, never throws, and calls neither collaborator');
    }

    // ---------------------------------------------------------------
    // Section N — architectural regression: the restorer adds no
    // forbidden import or vocabulary — this remains a thin orchestration
    // boundary, never a third store, a policy engine, or a rollback
    // mechanism.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/PublicationDistributionLifecycleRestorer.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!codeOnly.includes("from './PublicationDistributionLifecycleStore"), '38. never imports the 0.9.52/0.9.53 memory store module — it is duck-typed, received through the constructor');
        assert(!codeOnly.includes("from './PublicationDistributionLifecyclePersistence"), '39. never imports the 0.9.54 persistence module — it is duck-typed, received through the constructor');
        assert(!codeOnly.includes("from './PublicationDistributionLifecyclePersistenceBridge"), '40. never imports the 0.9.55 bridge module');
        assert(!codeOnly.includes("from './PublicationDistributionLifecycle"), '41. never imports the 0.9.50 lifecycle module');
        assert(!codeOnly.includes("from './PublicationDistributionLifecycleTransition"), '42. never imports the 0.9.51 transition module — restore() invokes no lifecycle transition of its own');
        assert(!codeOnly.includes("from './PublicationDistributionResult"), '43. never imports the 0.9.48 result module');
        assert(!codeOnly.includes("from './PublicationDistributionExecutor"), '44. never imports the 0.9.49 execution module');
        assert(!codeOnly.includes('.list(') && !codeOnly.includes('.save(') && !codeOnly.includes('.remove(') && !codeOnly.includes('.subscribe('), '45. never calls persistence.save()/remove()/list() or store.get()/remove()/subscribe() — it calls exactly persistence.load() and store.set(), nothing else');
        assert(!codeOnly.includes('.get('), '46. never reads store.get() before writing — no comparison between persisted and current memory state');
        assert(!codeOnly.includes('try') && !codeOnly.includes('catch'), '47. the restorer itself contains no try/catch of its own — a collaborator failure propagates unchanged, with no suppression layered on top');
        assert(!/\bfetch\(/.test(codeOnly), '48. never calls fetch(...) — no network access of its own');
        assert(!codeOnly.includes('async '), '49. contains no async function of its own — synchronous only');
        assert(!codeOnly.includes('setTimeout') && !codeOnly.includes('setInterval'), '50. no retry/scheduling/polling/background-worker machinery of its own');
        assert(!codeOnly.includes('new Date') && !codeOnly.includes('Date.now'), '51. no clock read, and no timestamp of any kind');
        assert(!codeOnly.includes('Object.freeze') && !codeOnly.includes('JSON.parse') && !codeOnly.includes('JSON.stringify'), '52. never freezes, clones, or serializes a value of its own — it forwards exactly what persistence.load() returns');
        assert(!codeOnly.includes('.version') && !codeOnly.includes('.timestamp'), '53. never reads a version or timestamp field from either collaborator — this family has no such semantics yet');

        const forbiddenTerms = ['pending', 'failed', 'failure', 'retrying', 'recovering', 'confirmed', 'withdrawn', 'rollback', 'compensation', 'transaction', 'queue', 'schedule', 'polling', 'history', 'undo', 'version', 'lock', 'merge', 'rank', 'dirty', 'stale', 'hydrat', 'batch', 'dedup', 'authoritative', 'authority'];
        for (const term of forbiddenTerms) {
            const pattern = new RegExp(`\\b${term}\\b`, 'i');
            assert(!pattern.test(codeOnly), `54. code must never use "${term}" — this restorer reintroduces a persisted fact into memory, and invents no authority, recovery, or hydration-flag vocabulary of its own`);
        }

        console.log('✓ Architectural regression: the restorer imports none of the lifecycle/store/persistence/bridge/transition/result/execution modules, calls exactly persistence.load() and store.set() and nothing else, contains no try/catch of its own, performs no I/O or clock reads, and uses no authority/rollback/hydration-flag vocabulary anywhere in its own code');
    }

    console.log('\nAll PublicationDistributionLifecycleRestorer tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
