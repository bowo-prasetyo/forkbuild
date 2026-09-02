import { readFile } from 'node:fs/promises';
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

// 0.9.54 — Publication Distribution Lifecycle Snapshot Persistence
// Boundary.
// See docs/Roadmap.md, "0.9.54 — Publication Distribution Lifecycle
// Snapshot Persistence Boundary," for the full milestone story.
//
//   Section A: FLAGSHIP — execute (0.9.49) -> describe (0.9.50) ->
//              persist -> fresh consumer loads -> semantic round trip ->
//              transition (0.9.51) -> persist -> load, end to end
//   Section B: identity is NOT preserved across persistence, but semantics
//              are — loaded !== original, deep-equal facts
//   Section C: a publicationId never save()d loads as null
//   Section D: a malformed persisted record loads as null
//   Section E: remove() is idempotent
//   Section F: clear() removes only this file's own records, never an
//              unrelated key sharing the same injected persistence
//   Section G: malformed input degrades silently, never throws
//   Section H: save() never mutates the supplied lifecycle
//   Section I: deterministic representation — equal lifecycles persist to
//              byte-identical records
//   Section J: independent persistence-backed instances compose correctly
//   Section K: the constructor requires a save/load/remove/list
//              implementation
//   Section L: architectural regression

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
    material: Object.freeze({ state: 'PRESENT', uri: 'ar://TXPERSIST', storage: 'ar' }),
    discovery: Object.freeze({ state: 'ABSENT' })
});

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: the real 0.9.49 decline scenario, described
    // by 0.9.50, persisted by this milestone's own boundary, reloaded by
    // a fresh consumer over the same injected persistence, then
    // transitioned by 0.9.51 on a later-obtained retry fact and persisted
    // again.
    // ---------------------------------------------------------------
    {
        const transactionId = 'PersistFlagshipTransactionId12345678';
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

        const sharedStorage = new InMemoryStorageProvider();
        const writer = new PublicationDistributionLifecyclePersistence(sharedStorage);

        assert(writer.load(publication.id) === null, '1. FLAGSHIP — nothing is on file for this publication before save() is ever called');

        writer.save(publication.id, declined);

        // A fresh consumer — its own, independent instance, over the same
        // injected persistence — proves this is a real process boundary,
        // never per-instance memory.
        const reader = new PublicationDistributionLifecyclePersistence(sharedStorage);
        const reloaded = reader.load(publication.id);

        assert(reloaded !== null, '2. FLAGSHIP — a fresh consumer loads a lifecycle for this publication');
        assert(reloaded !== declined, '3. FLAGSHIP — the reloaded lifecycle is a NEW object, never the same reference');
        assert(reloaded.material.state === 'PRESENT' && reloaded.material.uri === declined.material.uri && reloaded.material.storage === declined.material.storage, '4. FLAGSHIP — the reloaded material section reconstructs the same facts');
        assert(reloaded.discovery.state === 'ABSENT', '5. FLAGSHIP — the reloaded discovery section reconstructs the same ABSENT fact');

        const retryFact = { origin: 'wss://relay-retry.example', discoveryTag: 'forkbuild-publication', id: 'PERSISTEVENT' + 'f'.repeat(52) };
        const recovered = transitionPublicationDistributionLifecycle(declined, { discovery: retryFact });
        assert(recovered !== null && recovered.discovery.state === 'PRESENT', 'sanity: 0.9.51 transitions discovery to PRESENT from the retry fact');

        writer.save(publication.id, recovered);
        const reloadedAgain = reader.load(publication.id);

        assert(reloadedAgain.material.state === 'PRESENT', '6. FLAGSHIP — after the second save(), material is still reconstructed as PRESENT');
        assert(reloadedAgain.discovery.state === 'PRESENT' && reloadedAgain.discovery.origin === retryFact.origin, '7. FLAGSHIP — after the second save(), discovery reconstructs the retry fact');
        assert(reloadedAgain.discovery.discoveryTag === retryFact.discoveryTag && reloadedAgain.discovery.id === retryFact.id, '8. FLAGSHIP — discoveryTag and id are preserved through the persistence round trip too');

        console.log('✓ Flagship: execute -> describe -> persist -> fresh-consumer load -> transition -> persist -> load, end to end, with lifecycle FACTS reconstructed at every hand-off');
    }

    // ---------------------------------------------------------------
    // Section B — identity is NOT preserved across persistence, but
    // semantics are: loaded !== original, at every level, yet every fact
    // matches.
    // ---------------------------------------------------------------
    {
        const persistence = new PublicationDistributionLifecyclePersistence(new InMemoryStorageProvider());
        persistence.save('pub-b', validLifecycle);

        const loaded = persistence.load('pub-b');

        assert(loaded !== validLifecycle, '9. the loaded lifecycle is a different object than the one saved');
        assert(loaded.material !== validLifecycle.material, '10. the loaded material section is a different object too');
        assert(loaded.discovery !== validLifecycle.discovery, '11. the loaded discovery section is a different object too');
        assert(JSON.stringify(loaded) === JSON.stringify(validLifecycle), '12. despite no shared identity, the loaded lifecycle is deep-equal to the one saved');
        assert(Object.isFrozen(loaded) && Object.isFrozen(loaded.material) && Object.isFrozen(loaded.discovery), '13. the reconstructed lifecycle is frozen at every level, matching 0.9.50\'s own output shape');

        console.log('✓ Identity is recreated, never preserved, across a real persistence boundary — semantics survive intact');
    }

    // ---------------------------------------------------------------
    // Section C — a publicationId never save()d loads as null.
    // ---------------------------------------------------------------
    {
        const persistence = new PublicationDistributionLifecyclePersistence(new InMemoryStorageProvider());

        assert(persistence.load('never-saved') === null, '14. a publicationId that was never save()d loads as null');

        persistence.save('pub-c', validLifecycle);
        persistence.remove('pub-c');
        assert(persistence.load('pub-c') === null, '15. a removed publicationId loads as null, indistinguishable from never having been saved');

        console.log('✓ Missing persisted records load as null, never undefined and never thrown');
    }

    // ---------------------------------------------------------------
    // Section D — a malformed persisted record loads as null: the
    // persistence boundary treats whatever the injected implementation
    // hands back as an untrusted byte source, never a second trust root.
    // ---------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const persistence = new PublicationDistributionLifecyclePersistence(storage);

        // Written directly through the injected implementation, bypassing
        // this file's own save() entirely — simulating corruption, a
        // hand-edited record, or drift from an unrelated schema version.
        storage.save('publication-distribution-lifecycle:pub-d-1', { material: 'not-an-object', discovery: { state: 'ABSENT' } });
        storage.save('publication-distribution-lifecycle:pub-d-2', { material: { state: 'PRESENT' }, discovery: { state: 'ABSENT' } });
        storage.save('publication-distribution-lifecycle:pub-d-3', { material: { state: 'ABSENT' }, discovery: { state: 'PRESENT', origin: 'wss://x' } });
        storage.save('publication-distribution-lifecycle:pub-d-4', { material: { state: 'ABSENT' } });
        storage.save('publication-distribution-lifecycle:pub-d-5', 'just a string');
        storage.save('publication-distribution-lifecycle:pub-d-6', { material: { state: 'UNKNOWN' }, discovery: { state: 'ABSENT' } });

        assert(persistence.load('pub-d-1') === null, '16. a non-object material section loads as null');
        assert(persistence.load('pub-d-2') === null, '17. a PRESENT material section missing uri loads as null');
        assert(persistence.load('pub-d-3') === null, '18. a PRESENT discovery section missing discoveryTag/id loads as null');
        assert(persistence.load('pub-d-4') === null, '19. a record missing the discovery section entirely loads as null');
        assert(persistence.load('pub-d-5') === null, '20. a record that is not an object at all loads as null');
        assert(persistence.load('pub-d-6') === null, '21. a record with an unrecognized state value loads as null');

        console.log('✓ A malformed persisted record loads as null at every point of drift — this boundary trusts the shape it itself validates, never the raw bytes on file');
    }

    // ---------------------------------------------------------------
    // Section E — remove() is idempotent.
    // ---------------------------------------------------------------
    {
        const persistence = new PublicationDistributionLifecyclePersistence(new InMemoryStorageProvider());
        persistence.save('pub-e', validLifecycle);

        assert(persistence.remove('pub-e') === true, '22. removing an existing record returns true');
        assert(persistence.remove('pub-e') === false, '23. removing the same publicationId again returns false');
        assert(persistence.remove('never-existed') === false, '24. removing a publicationId that was never saved returns false');

        console.log('✓ remove() is idempotent: true on an actual removal, false otherwise');
    }

    // ---------------------------------------------------------------
    // Section F — clear() removes only this file's own records, never a
    // key some other part of the engine stores through the same injected
    // persistence implementation.
    // ---------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const persistence = new PublicationDistributionLifecyclePersistence(storage);

        persistence.save('pub-f-1', validLifecycle);
        persistence.save('pub-f-2', validLifecycle);
        storage.save('some-unrelated-engine-key', { totally: 'unrelated' });

        persistence.clear();

        assert(persistence.load('pub-f-1') === null && persistence.load('pub-f-2') === null, '25. every record this file itself wrote is gone after clear()');
        assert(storage.load('some-unrelated-engine-key') !== null, '26. an unrelated key sharing the same injected persistence survives clear() untouched');

        persistence.save('pub-f-1', validLifecycle);
        assert(persistence.load('pub-f-1') !== null, '27. the persistence boundary accepts new records normally after clear()');

        console.log('✓ clear() removes only this file\'s own key-prefixed records, leaving any unrelated key in the same injected persistence untouched');
    }

    // ---------------------------------------------------------------
    // Section G — malformed input degrades silently, never throws.
    // ---------------------------------------------------------------
    {
        const persistence = new PublicationDistributionLifecyclePersistence(new InMemoryStorageProvider());

        assert(persistence.load() === null, '28. load() with no argument returns null');
        assert(persistence.load(null) === null, '29. load(null) returns null');
        assert(persistence.load(42) === null, '30. load() with a non-string id returns null');
        assert(persistence.load('') === null, '31. load(\'\') (empty string) returns null');

        persistence.save(); // no publicationId, no lifecycle
        persistence.save(null, validLifecycle);
        persistence.save('', validLifecycle);
        persistence.save(42, validLifecycle);
        persistence.save('pub-g', null);
        persistence.save('pub-g', undefined);
        persistence.save('pub-g', {});
        persistence.save('pub-g', { material: { state: 'PRESENT' }, discovery: { state: 'ABSENT' } });
        assert(persistence.load('pub-g') === null, '32. save() with a malformed publicationId or malformed lifecycle silently writes nothing');

        assert(persistence.remove() === false, '33. remove() with no argument returns false');
        assert(persistence.remove(null) === false, '34. remove(null) returns false');
        assert(persistence.remove('') === false, '35. remove(\'\') returns false');

        console.log('✓ Malformed input degrades silently on every operation; none of the four methods ever throws over a malformed value');
    }

    // ---------------------------------------------------------------
    // Section H — save() never mutates the lifecycle a caller supplies.
    // ---------------------------------------------------------------
    {
        const persistence = new PublicationDistributionLifecyclePersistence(new InMemoryStorageProvider());
        const snapshot = JSON.stringify(validLifecycle);

        persistence.save('pub-h', validLifecycle);

        assert(JSON.stringify(validLifecycle) === snapshot, '36. the supplied lifecycle value is never mutated by save()');
        assert(Object.isFrozen(validLifecycle) && Object.isFrozen(validLifecycle.material), '37. the supplied lifecycle remains frozen throughout, exactly as 0.9.50 produced it');

        console.log('✓ save() never mutates the lifecycle it is handed');
    }

    // ---------------------------------------------------------------
    // Section I — deterministic representation: two lifecycles carrying
    // the same facts, as different object references, persist to
    // byte-identical records.
    // ---------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const persistence = new PublicationDistributionLifecyclePersistence(storage);

        const lifecycleOne = Object.freeze({
            material: Object.freeze({ state: 'PRESENT', uri: 'ar://SAME', storage: 'ar' }),
            discovery: Object.freeze({ state: 'ABSENT' })
        });
        const lifecycleTwo = Object.freeze({
            material: Object.freeze({ state: 'PRESENT', uri: 'ar://SAME', storage: 'ar' }),
            discovery: Object.freeze({ state: 'ABSENT' })
        });
        assert(lifecycleOne !== lifecycleTwo, 'sanity: the two lifecycles are different object references');

        persistence.save('pub-i-1', lifecycleOne);
        const recordOne = storage.load('publication-distribution-lifecycle:pub-i-1');

        persistence.save('pub-i-2', lifecycleTwo);
        const recordTwo = storage.load('publication-distribution-lifecycle:pub-i-2');

        assert(JSON.stringify(recordOne) === JSON.stringify(recordTwo), '38. two lifecycles carrying the same facts persist to byte-identical records, regardless of object identity');

        console.log('✓ Deterministic representation: identical facts always persist to identical bytes');
    }

    // ---------------------------------------------------------------
    // Section J — independent persistence-backed instances compose
    // correctly: two instances over the SAME injected persistence see
    // each other's writes; two instances over SEPARATE injected
    // persistence implementations share no state.
    // ---------------------------------------------------------------
    {
        const sharedStorage = new InMemoryStorageProvider();
        const first = new PublicationDistributionLifecyclePersistence(sharedStorage);
        const second = new PublicationDistributionLifecyclePersistence(sharedStorage);

        first.save('pub-j-shared', validLifecycle);
        assert(second.load('pub-j-shared') !== null, '39. a second instance over the same injected persistence sees a record the first instance wrote');

        second.remove('pub-j-shared');
        assert(first.load('pub-j-shared') === null, '40. a removal made through one instance is visible through another instance sharing the same injected persistence');

        const isolatedOne = new PublicationDistributionLifecyclePersistence(new InMemoryStorageProvider());
        const isolatedTwo = new PublicationDistributionLifecyclePersistence(new InMemoryStorageProvider());

        isolatedOne.save('pub-j-isolated', validLifecycle);
        assert(isolatedOne.load('pub-j-isolated') !== null, '41. the first isolated instance holds the record it wrote');
        assert(isolatedTwo.load('pub-j-isolated') === null, '42. a second instance backed by an entirely separate injected persistence knows nothing about it');

        console.log('✓ Composability: instances sharing an injected persistence see each other\'s writes; instances over separate implementations share no state');
    }

    // ---------------------------------------------------------------
    // Section K — the constructor requires a save/load/remove/list
    // persistence implementation, and throws immediately on a missing or
    // incompatible one, exactly as LocalPublicationAnchorStore's own
    // constructor already throws on a missing storageProvider.
    // ---------------------------------------------------------------
    {
        let threwOnMissing = false;
        try {
            new PublicationDistributionLifecyclePersistence();
        } catch (error) {
            threwOnMissing = true;
        }
        assert(threwOnMissing, '43. constructing without a persistence implementation throws');

        let threwOnIncomplete = false;
        try {
            new PublicationDistributionLifecyclePersistence({ save() {}, load() {} });
        } catch (error) {
            threwOnIncomplete = true;
        }
        assert(threwOnIncomplete, '44. constructing with an implementation missing remove()/list() throws');

        const persistence = new PublicationDistributionLifecyclePersistence(new InMemoryStorageProvider());
        assert(persistence instanceof PublicationDistributionLifecyclePersistence, '45. a well-formed persistence implementation constructs successfully');

        console.log('✓ The constructor validates its injected persistence implementation eagerly, once, at construction');
    }

    // ---------------------------------------------------------------
    // Section L — architectural regression: this remains a persistence
    // boundary alone — no memory-store/observation/transition/result/
    // execution import, no operational vocabulary, no I/O technology
    // choice of its own, no automatic persistence hook, no clock.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/PublicationDistributionLifecyclePersistence.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!codeOnly.includes("from './PublicationDistributionLifecycleStore"), '46. never imports the 0.9.52/0.9.53 memory store module');
        assert(!codeOnly.includes("from './PublicationDistributionLifecycleTransition"), '47. never imports the 0.9.51 transition module');
        assert(!codeOnly.includes("from './PublicationDistributionResult"), '48. never imports the 0.9.48 result module');
        assert(!codeOnly.includes("from './PublicationDistributionExecutor"), '49. never imports the 0.9.49 execution module');
        assert(!codeOnly.includes('ArweavePublicationMaterialUploader') && !codeOnly.includes('NostrPublicationDiscoveryPublisher') && !codeOnly.includes('PublicationDistributionDescriptor') && !codeOnly.includes('PublicationDistributionRuntimeComposition'), '50. never imports any of the four collaborator/execution files');
        assert(!codeOnly.includes("from '../storage/") && !codeOnly.includes('StorageProvider') && !codeOnly.includes('localStorage') && !codeOnly.includes('indexedDB') && !codeOnly.includes('IndexedDB'), '51. never imports or references any concrete storage technology of its own — the persistence implementation is purely injected');
        assert(!/\bfetch\(/.test(codeOnly), '52. never calls fetch(...) — no network access of its own');
        assert(!codeOnly.includes('WebSocket'), '53. never references WebSocket');
        assert(!codeOnly.includes('async '), '54. contains no async function of its own — synchronous only, matching StorageProvider\'s own contract');
        assert(!codeOnly.includes('setTimeout') && !codeOnly.includes('setInterval'), '55. no retry/scheduling/background-worker machinery of its own');
        assert(!codeOnly.includes('new Date') && !codeOnly.includes('Date.now'), '56. no clock read, and no timestamp of any kind');
        assert(!codeOnly.includes('.subscribe') && !codeOnly.includes('addEventListener'), '57. no observation/notification seam of its own — 0.9.53\'s own subscribe() lives entirely in the memory store, untouched by this file');

        const forbiddenTerms = ['pending', 'failed', 'failure', 'retrying', 'recovering', 'confirmed', 'withdrawn', 'rollback', 'compensation', 'transaction', 'queue', 'schedule', 'history', 'undo', 'version', 'lock', 'merge', 'rank', 'encrypt', 'compress', 'migrat'];
        for (const term of forbiddenTerms) {
            const pattern = new RegExp(`\\b${term}\\b`, 'i');
            assert(!pattern.test(codeOnly), `58. code must never use "${term}" — this file establishes a persistence seam, not a distributed-systems solution`);
        }

        console.log('✓ Architectural regression: no lifecycle-store/transition/result/execution/collaborator import, no concrete storage technology, no I/O beyond the injected persistence implementation, no clock, no observation seam, no operational vocabulary');
    }

    console.log('\nAll PublicationDistributionLifecyclePersistence tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
