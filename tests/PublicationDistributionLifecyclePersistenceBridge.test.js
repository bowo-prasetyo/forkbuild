import { readFile } from 'node:fs/promises';
import { PublicationDistributionLifecyclePersistenceBridge } from '../application/PublicationDistributionLifecyclePersistenceBridge.js';
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

// 0.9.55 — Publication Distribution Lifecycle Persistence Bridge.
// See docs/Roadmap.md, "0.9.55 — Publication Distribution Lifecycle
// Persistence Bridge," for the full milestone story.
//
//   Section A: FLAGSHIP — execute (0.9.49) -> describe (0.9.50) ->
//              transition (0.9.51) -> store.set() (0.9.52) -> bridge
//              (0.9.55) -> persistence.save() (0.9.54) -> fresh
//              persistence instance loads, end to end
//   Section B: set() persistence — the exact lifecycle facts arrive
//   Section C: remove() persistence — only when an entry actually existed
//   Section D: no initial persistence on observe() itself
//   Section E: exact identity — the reference reaches persistence.save()
//              unchanged, no cloning or reconstruction inside the bridge
//   Section F: replacement — two successive set() calls, two persistence
//              operations, no deduplication
//   Section G: publication isolation — a bridge observing A never
//              persists a change to B
//   Section H: disconnect — after unsubscribing, further store changes
//              are never persisted
//   Section I: unsubscribe idempotency
//   Section J: persistence failure never mutates or rolls back the
//              memory-store lifecycle
//   Section K: no clear() interpretation
//   Section L: constructor validation
//   Section M: malformed observe() input degrades silently
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

function makeSpyPersistence() {
    const saveCalls = [];
    const removeCalls = [];
    return {
        saveCalls,
        removeCalls,
        save(publicationId, lifecycle) {
            saveCalls.push({ publicationId, lifecycle });
        },
        remove(publicationId) {
            removeCalls.push({ publicationId });
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
    material: Object.freeze({ state: 'PRESENT', uri: 'ar://TXBRIDGE', storage: 'ar' }),
    discovery: Object.freeze({ state: 'ABSENT' })
});

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: the real 0.9.49 decline scenario, described
    // by 0.9.50, stored by 0.9.52, automatically projected into 0.9.54's
    // own persistence by this milestone's own bridge, reloaded by a fresh
    // persistence instance sharing the same injected storage, then
    // recovered by an explicit 0.9.51 retry transition and persisted
    // again, entirely without a caller ever calling persistence.save()
    // itself.
    // ---------------------------------------------------------------
    {
        const transactionId = 'BridgeFlagshipTransactionId123456789';
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

        const store = new PublicationDistributionLifecycleMemoryStore();
        const sharedStorage = new InMemoryStorageProvider();
        const bridgePersistence = new PublicationDistributionLifecyclePersistence(sharedStorage);
        const bridge = new PublicationDistributionLifecyclePersistenceBridge(store, bridgePersistence);

        const freshReader = new PublicationDistributionLifecyclePersistence(sharedStorage);
        assert(freshReader.load(publication.id) === null, '1. FLAGSHIP — nothing is on file before the bridge ever observes anything');

        const disconnect = bridge.observe(publication.id);

        store.set(publication.id, declined);

        const loadedAfterDecline = new PublicationDistributionLifecyclePersistence(sharedStorage).load(publication.id);
        assert(loadedAfterDecline !== null, '2. FLAGSHIP — a fresh persistence instance loads a record the bridge persisted automatically, with no explicit save() call from this test');
        assert(loadedAfterDecline.material.state === 'PRESENT' && loadedAfterDecline.material.uri === declined.material.uri, '3. FLAGSHIP — the persisted material section matches the stored lifecycle');
        assert(loadedAfterDecline.discovery.state === 'ABSENT', '4. FLAGSHIP — the persisted discovery section matches the stored lifecycle');

        const retryFact = { origin: 'wss://relay-retry.example', discoveryTag: 'forkbuild-publication', id: 'BRIDGEEVENT' + 'f'.repeat(53) };
        const recovered = transitionPublicationDistributionLifecycle(declined, { discovery: retryFact });
        assert(recovered !== null && recovered.discovery.state === 'PRESENT', 'sanity: 0.9.51 transitions discovery to PRESENT from the retry fact');

        store.set(publication.id, recovered);

        const loadedAfterRecovery = new PublicationDistributionLifecyclePersistence(sharedStorage).load(publication.id);
        assert(loadedAfterRecovery.material.state === 'PRESENT', '5. FLAGSHIP — after the replacement set(), material is still reconstructed as PRESENT');
        assert(loadedAfterRecovery.discovery.state === 'PRESENT' && loadedAfterRecovery.discovery.origin === retryFact.origin, '6. FLAGSHIP — after the replacement set(), the fresh persistence instance loads the recovered discovery fact, projected automatically by the bridge');

        disconnect();
        store.set(publication.id, declined);
        const loadedAfterDisconnect = new PublicationDistributionLifecyclePersistence(sharedStorage).load(publication.id);
        assert(loadedAfterDisconnect.discovery.state === 'PRESENT', '7. FLAGSHIP — once disconnected, a further store.set() is no longer projected into persistence; the persisted record still reflects the last observed state');

        console.log('✓ Flagship: execute -> describe -> transition -> store.set() -> bridge -> persistence.save() -> fresh-instance load, end to end, with no explicit persistence call from the caller');
    }

    // ---------------------------------------------------------------
    // Section B — set() persistence: the exact lifecycle facts reach
    // persistence.save().
    // ---------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();
        const persistence = makeSpyPersistence();
        const bridge = new PublicationDistributionLifecyclePersistenceBridge(store, persistence);
        bridge.observe('pub-b');

        store.set('pub-b', validLifecycle);

        assert(persistence.saveCalls.length === 1, '8. store.set() causes exactly one persistence.save() call');
        assert(persistence.saveCalls[0].publicationId === 'pub-b', '9. the save() call carries the correct publicationId');
        assert(persistence.saveCalls[0].lifecycle === validLifecycle, '10. the save() call carries the exact lifecycle reference set() was given');
        assert(persistence.removeCalls.length === 0, '11. a set() never calls persistence.remove()');

        console.log('✓ set() persistence: a stored lifecycle is projected into persistence.save() with the exact facts');
    }

    // ---------------------------------------------------------------
    // Section C — remove() persistence: persistence.remove() is called
    // only when an entry actually existed to remove, mirroring the
    // store's own notification contract.
    // ---------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();
        const persistence = makeSpyPersistence();
        const bridge = new PublicationDistributionLifecyclePersistenceBridge(store, persistence);
        bridge.observe('pub-c');

        store.remove('pub-c');
        assert(persistence.removeCalls.length === 0, '12. removing an id that was never set() never calls persistence.remove(), since the store never notifies for it');

        store.set('pub-c', validLifecycle);
        store.remove('pub-c');
        assert(persistence.removeCalls.length === 1 && persistence.removeCalls[0].publicationId === 'pub-c', '13. removing an existing entry calls persistence.remove() with the correct publicationId');
        assert(persistence.saveCalls.length === 1, '14. the earlier set() is the only save() call so far');

        store.remove('pub-c');
        assert(persistence.removeCalls.length === 1, '15. removing an already-absent entry a second time never calls persistence.remove() again');

        console.log('✓ remove() persistence: persistence.remove() fires only on an actual removal, exactly mirroring the store\'s own null-notification rule');
    }

    // ---------------------------------------------------------------
    // Section D — no initial persistence: observe() itself never calls
    // save() or remove(), even when a lifecycle is already stored for
    // that publicationId.
    // ---------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();
        store.set('pub-d', validLifecycle);

        const persistence = makeSpyPersistence();
        const bridge = new PublicationDistributionLifecyclePersistenceBridge(store, persistence);
        bridge.observe('pub-d');

        assert(persistence.saveCalls.length === 0 && persistence.removeCalls.length === 0, '16. observe() itself never calls save() or remove(), even for a publicationId that already has a stored lifecycle');

        console.log('✓ No initial persistence: connecting the bridge is purely forward-looking, exactly like store.subscribe() itself');
    }

    // ---------------------------------------------------------------
    // Section E — exact identity: the lifecycle reference reaches
    // persistence.save() unchanged, with no cloning or reconstruction
    // inside the bridge, including nested sections.
    // ---------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();
        const persistence = makeSpyPersistence();
        const bridge = new PublicationDistributionLifecyclePersistenceBridge(store, persistence);
        bridge.observe('pub-e');

        store.set('pub-e', validLifecycle);

        const received = persistence.saveCalls[0].lifecycle;
        assert(received === validLifecycle, '17. the bridge passes the exact lifecycle reference through, unchanged');
        assert(received.material === validLifecycle.material, '18. nested sections are the same references too — no deep copy of any kind inside the bridge');

        console.log('✓ Exact identity: the bridge performs no cloning or reconstruction of its own — it forwards precisely what the store notified it with');
    }

    // ---------------------------------------------------------------
    // Section F — replacement: two successive set() calls cause two
    // persistence operations, with no deduplication.
    // ---------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();
        const persistence = makeSpyPersistence();
        const bridge = new PublicationDistributionLifecyclePersistenceBridge(store, persistence);
        bridge.observe('pub-f');

        store.set('pub-f', validLifecycle);
        store.set('pub-f', validLifecycle);

        assert(persistence.saveCalls.length === 2, '19. two successive set() calls, even with the exact same reference, cause two persistence.save() calls — no deduplication');

        const otherLifecycle = Object.freeze({
            material: Object.freeze({ state: 'PRESENT', uri: 'ar://TXOTHER', storage: 'ar' }),
            discovery: Object.freeze({ state: 'ABSENT' })
        });
        store.set('pub-f', otherLifecycle);
        assert(persistence.saveCalls.length === 3 && persistence.saveCalls[2].lifecycle === otherLifecycle, '20. a genuine replacement is persisted too, as its own save() call');

        console.log('✓ Replacement: every set() notification produces its own persistence.save() call, with no equality-based suppression');
    }

    // ---------------------------------------------------------------
    // Section G — publication isolation: a bridge observing one
    // publicationId never persists a change made to a different one.
    // ---------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();
        const persistence = makeSpyPersistence();
        const bridge = new PublicationDistributionLifecyclePersistenceBridge(store, persistence);
        bridge.observe('pub-g-a');

        store.set('pub-g-b', validLifecycle);
        assert(persistence.saveCalls.length === 0, '21. a set() for a publicationId the bridge is not observing is never persisted');

        store.set('pub-g-a', validLifecycle);
        assert(persistence.saveCalls.length === 1 && persistence.saveCalls[0].publicationId === 'pub-g-a', '22. a set() for the observed publicationId is persisted as usual');

        store.remove('pub-g-b');
        assert(persistence.removeCalls.length === 0, '23. a remove() for an unobserved publicationId is never persisted');

        console.log('✓ Publication isolation: a bridge only ever projects changes for the exact publicationId it was told to observe');
    }

    // ---------------------------------------------------------------
    // Section H — disconnect: after unsubscribing, further store
    // changes for that publicationId are never persisted again.
    // ---------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();
        const persistence = makeSpyPersistence();
        const bridge = new PublicationDistributionLifecyclePersistenceBridge(store, persistence);
        const disconnect = bridge.observe('pub-h');

        store.set('pub-h', validLifecycle);
        assert(persistence.saveCalls.length === 1, '24. persistence happens as usual before disconnecting');

        disconnect();
        store.set('pub-h', validLifecycle);
        store.remove('pub-h');
        assert(persistence.saveCalls.length === 1 && persistence.removeCalls.length === 0, '25. once disconnected, neither a further set() nor a remove() is projected into persistence');

        console.log('✓ Disconnect: unsubscribing stops the projection into persistence for that publicationId');
    }

    // ---------------------------------------------------------------
    // Section I — unsubscribe idempotency: calling the returned
    // disconnect function twice is harmless.
    // ---------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();
        const persistence = makeSpyPersistence();
        const bridge = new PublicationDistributionLifecyclePersistenceBridge(store, persistence);
        const disconnect = bridge.observe('pub-i');

        disconnect();
        let threw = false;
        try {
            disconnect();
            disconnect();
        } catch (error) {
            threw = true;
        }
        assert(threw === false, '26. calling disconnect() more than once never throws');

        store.set('pub-i', validLifecycle);
        assert(persistence.saveCalls.length === 0, '27. after multiple disconnect() calls, the bridge still never persists a further change');

        console.log('✓ Unsubscribe idempotency: the returned disconnect function is safely callable any number of times');
    }

    // ---------------------------------------------------------------
    // Section J — persistence failure never mutates or rolls back the
    // memory-store lifecycle: the store's own value already took effect
    // before the bridge's listener ever runs, and a throwing
    // persistence.save() cannot undo it.
    // ---------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();
        const failingPersistence = {
            save() {
                throw new Error('a deliberately broken persistence implementation');
            },
            remove() {
                throw new Error('a deliberately broken persistence implementation');
            }
        };
        const bridge = new PublicationDistributionLifecyclePersistenceBridge(store, failingPersistence);
        bridge.observe('pub-j');

        let threw = false;
        try {
            store.set('pub-j', validLifecycle);
        } catch (error) {
            threw = true;
        }
        assert(threw === false, '28. a throwing persistence.save() never propagates out of store.set() — the store isolates its own subscribers, and the bridge adds no exception of its own on top');
        assert(store.get('pub-j') === validLifecycle, '29. the memory-store lifecycle is untouched by the persistence failure — no rollback of any kind');

        let removeThrew = false;
        try {
            store.remove('pub-j');
        } catch (error) {
            removeThrew = true;
        }
        assert(removeThrew === false, '30. a throwing persistence.remove() never propagates out of store.remove() either');
        assert(store.get('pub-j') === null, '31. the memory-store removal itself still takes effect despite the persistence failure');

        console.log('✓ Persistence failure: a failing save()/remove() never mutates or rolls back the memory-store lifecycle, and the bridge adds no error handling of its own on top of the store\'s existing subscriber isolation');
    }

    // ---------------------------------------------------------------
    // Section K — no clear() interpretation: emptying the store directly
    // is never projected into persistence, since the store itself never
    // notifies on clear() (0.9.53).
    // ---------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();
        const persistence = makeSpyPersistence();
        const bridge = new PublicationDistributionLifecyclePersistenceBridge(store, persistence);
        bridge.observe('pub-k');

        store.set('pub-k', validLifecycle);
        assert(persistence.saveCalls.length === 1, '32. the initial set() is persisted as usual');

        store.clear();
        assert(persistence.saveCalls.length === 1 && persistence.removeCalls.length === 0, '33. store.clear() is never projected into persistence — the bridge invents no clear() handling of its own, and the store itself never notifies on clear()');
        assert(typeof bridge.clear !== 'function', '34. the bridge exposes no clear() method of its own');

        console.log('✓ No clear() interpretation: a caller who wants both cleared calls store.clear() and persistence.clear() explicitly, itself');
    }

    // ---------------------------------------------------------------
    // Section L — constructor validation: the bridge requires a store
    // with subscribe() and a persistence instance with save()/remove(),
    // and throws immediately on a missing or incompatible one.
    // ---------------------------------------------------------------
    {
        let threwOnMissingStore = false;
        try {
            new PublicationDistributionLifecyclePersistenceBridge();
        } catch (error) {
            threwOnMissingStore = true;
        }
        assert(threwOnMissingStore, '35. constructing without a store throws');

        let threwOnStoreWithoutSubscribe = false;
        try {
            new PublicationDistributionLifecyclePersistenceBridge({}, makeSpyPersistence());
        } catch (error) {
            threwOnStoreWithoutSubscribe = true;
        }
        assert(threwOnStoreWithoutSubscribe, '36. constructing with a store missing subscribe() throws');

        let threwOnMissingPersistence = false;
        try {
            new PublicationDistributionLifecyclePersistenceBridge(new PublicationDistributionLifecycleMemoryStore());
        } catch (error) {
            threwOnMissingPersistence = true;
        }
        assert(threwOnMissingPersistence, '37. constructing without a persistence instance throws');

        let threwOnIncompletePersistence = false;
        try {
            new PublicationDistributionLifecyclePersistenceBridge(new PublicationDistributionLifecycleMemoryStore(), { save() {} });
        } catch (error) {
            threwOnIncompletePersistence = true;
        }
        assert(threwOnIncompletePersistence, '38. constructing with a persistence instance missing remove() throws');

        const bridge = new PublicationDistributionLifecyclePersistenceBridge(new PublicationDistributionLifecycleMemoryStore(), makeSpyPersistence());
        assert(bridge instanceof PublicationDistributionLifecyclePersistenceBridge, '39. a well-formed store and persistence instance construct successfully');

        console.log('✓ Constructor validation: the bridge validates its two injected collaborators eagerly, once, at construction');
    }

    // ---------------------------------------------------------------
    // Section M — malformed observe() input degrades silently: a
    // malformed publicationId registers no subscription, never throws,
    // and still returns a safely callable unsubscribe.
    // ---------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();
        const persistence = makeSpyPersistence();
        const bridge = new PublicationDistributionLifecyclePersistenceBridge(store, persistence);

        for (const badId of [undefined, null, '', 42, {}]) {
            const disconnect = bridge.observe(badId);
            assert(typeof disconnect === 'function', '40. observe() always returns a callable disconnect, even for a malformed publicationId');
            disconnect();
        }

        store.set('pub-m', validLifecycle);
        assert(persistence.saveCalls.length === 0, '41. malformed observe() calls never interfere with, or accidentally observe, ordinary store mutation for an unrelated publicationId');

        console.log('✓ Malformed observe() input degrades silently, never throws, and yields a harmless disconnect');
    }

    // ---------------------------------------------------------------
    // Section N — architectural regression: the bridge adds no forbidden
    // import or vocabulary — this remains a thin adapter, never a third
    // store, an event log, a policy engine, or a rollback mechanism.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/PublicationDistributionLifecyclePersistenceBridge.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!codeOnly.includes("from './PublicationDistributionLifecycleStore"), '42. never imports the 0.9.52/0.9.53 memory store module — it is duck-typed, received through the constructor');
        assert(!codeOnly.includes("from './PublicationDistributionLifecyclePersistence"), '43. never imports the 0.9.54 persistence module — it is duck-typed, received through the constructor');
        assert(!codeOnly.includes("from './PublicationDistributionLifecycle"), '44. never imports the 0.9.50 lifecycle module');
        assert(!codeOnly.includes("from './PublicationDistributionLifecycleTransition"), '45. never imports the 0.9.51 transition module');
        assert(!codeOnly.includes("from './PublicationDistributionResult"), '46. never imports the 0.9.48 result module');
        assert(!codeOnly.includes("from './PublicationDistributionExecutor"), '47. never imports the 0.9.49 execution module');
        assert(!codeOnly.includes('.load(') && !codeOnly.includes('.list('), '48. never calls persistence.load() or persistence.list() — no hydration of any kind');
        assert(!codeOnly.includes('try') && !codeOnly.includes('catch'), '49. the bridge itself contains no try/catch of its own — a persistence failure surfaces exactly as far as the store\'s own subscriber isolation already lets it, with no extra suppression layered on top');
        assert(!/\bfetch\(/.test(codeOnly), '50. never calls fetch(...) — no network access of its own');
        assert(!codeOnly.includes('WebSocket'), '51. never references WebSocket');
        assert(!codeOnly.includes('async '), '52. contains no async function of its own — synchronous only');
        assert(!codeOnly.includes('setTimeout') && !codeOnly.includes('setInterval'), '53. no retry/scheduling/background-worker machinery of its own');
        assert(!codeOnly.includes('new Date') && !codeOnly.includes('Date.now'), '54. no clock read, and no timestamp of any kind');
        assert(!codeOnly.includes('Object.freeze') && !codeOnly.includes('JSON.parse') && !codeOnly.includes('JSON.stringify'), '55. never freezes, clones, or serializes a value of its own — it forwards exactly what it is given');

        const forbiddenTerms = ['pending', 'failed', 'failure', 'retrying', 'recovering', 'confirmed', 'withdrawn', 'rollback', 'compensation', 'transaction', 'queue', 'schedule', 'history', 'undo', 'version', 'lock', 'merge', 'rank', 'dirty', 'stale', 'hydrat', 'batch', 'dedup'];
        for (const term of forbiddenTerms) {
            const pattern = new RegExp(`\\b${term}\\b`, 'i');
            assert(!pattern.test(codeOnly), `56. code must never use "${term}" — this bridge projects observation into persistence, and invents no durability status, retry policy, or hydration mechanism of its own`);
        }

        console.log('✓ Architectural regression: the bridge imports neither the store nor the persistence module directly, never calls load()/list(), contains no try/catch of its own, performs no I/O, reads no clock, freezes/clones/serializes nothing, and uses no rollback/hydration/durability-status vocabulary anywhere in its own code');
    }

    console.log('\nAll PublicationDistributionLifecyclePersistenceBridge tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
