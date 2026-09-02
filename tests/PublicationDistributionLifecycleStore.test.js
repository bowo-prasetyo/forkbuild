import { readFile } from 'node:fs/promises';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { transitionPublicationDistributionLifecycle } from '../application/PublicationDistributionLifecycleTransition.js';
import { describePublicationDistributionLifecycle } from '../application/PublicationDistributionLifecycle.js';
import { executePublicationDistribution } from '../application/PublicationDistributionExecutor.js';
import { describePublicationDistribution } from '../application/PublicationDistributionDescriptor.js';
import { ArweavePublicationMaterialUploader } from '../application/ArweavePublicationMaterialUploader.js';
import { NostrPublicationDiscoveryPublisher } from '../application/NostrPublicationDiscoveryPublisher.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { Signature } from '../core/Signature.js';

// 0.9.52 — Publication Distribution Lifecycle Store Boundary.
// See docs/Roadmap.md, "0.9.52 — Publication Distribution Lifecycle Store
// Boundary," for the full milestone story.
//
//   Section A: FLAGSHIP — executor (0.9.49) -> lifecycle (0.9.50) ->
//              transition (0.9.51) -> store (0.9.52), end to end
//   Section B: get/set identity — get() returns the SAME reference set()
//              was given, never a copy
//   Section C: replacement semantics — set() replaces, never merges
//   Section D: missing entries degrade to null, never undefined
//   Section E: remove() is idempotent — true when removed, false otherwise
//   Section F: clear() empties the store
//   Section G: malformed input degrades silently, never throws
//   Section H: the store never mutates a stored value
//   Section I: independent instances share no state
//   Section J: architectural regression

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
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
    material: Object.freeze({ state: 'PRESENT', uri: 'ar://TXSTORE', storage: 'ar' }),
    discovery: Object.freeze({ state: 'ABSENT' })
});

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: the real 0.9.49 decline scenario, described
    // by 0.9.50, transitioned on a later-obtained retry fact by 0.9.51,
    // then remembered and retrieved by this milestone's own store.
    // ---------------------------------------------------------------
    {
        const transactionId = 'StoreFlagshipTransactionId1234567890';
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

        const retryFact = { origin: 'wss://relay-retry.example', discoveryTag: 'forkbuild-publication', id: 'STOREEVENT' + 'f'.repeat(54) };
        const recovered = transitionPublicationDistributionLifecycle(declined, { discovery: retryFact });
        assert(recovered !== null && recovered.discovery.state === 'PRESENT', 'sanity: 0.9.51 transitions discovery to PRESENT from the retry fact');

        const store = new PublicationDistributionLifecycleMemoryStore();
        assert(store.get(publication.id) === null, '1. FLAGSHIP — nothing is remembered for this publication before set() is ever called');

        store.set(publication.id, declined);
        assert(store.get(publication.id) === declined, '2. FLAGSHIP — get() returns the exact decline lifecycle just stored');

        store.set(publication.id, recovered);
        assert(store.get(publication.id) === recovered, '3. FLAGSHIP — set() with the transitioned lifecycle replaces the decline lifecycle');
        assert(store.get(publication.id) !== declined, '4. FLAGSHIP — the earlier decline lifecycle is no longer retrievable once replaced');
        assert(store.get(publication.id).discovery.origin === retryFact.origin, '5. FLAGSHIP — the retrieved lifecycle carries the retry fact, unmodified');

        console.log('✓ Flagship: execute -> describe -> transition -> store -> retrieve, end to end, with the exact object identity preserved at each hand-off');
    }

    // ---------------------------------------------------------------
    // Section B — get/set identity: get() returns the SAME reference
    // set() was given, never a copy, clone, or re-normalized equivalent.
    // ---------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();
        store.set('pub-b', validLifecycle);

        assert(store.get('pub-b') === validLifecycle, '6. get() returns the SAME object reference given to set()');
        assert(store.get('pub-b').material === validLifecycle.material, '7. nested sections are the same references too — no deep copy of any kind');

        console.log('✓ get() returns the exact reference set() was given — a storage boundary, not a transformation boundary');
    }

    // ---------------------------------------------------------------
    // Section C — replacement semantics: set() replaces, never merges,
    // keeps no history, and applies no legitimacy judgment.
    // ---------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();
        const lifecycleA = Object.freeze({ material: Object.freeze({ state: 'ABSENT' }), discovery: Object.freeze({ state: 'ABSENT' }) });
        const lifecycleB = Object.freeze({ material: Object.freeze({ state: 'PRESENT', uri: 'ar://TXB', storage: 'ar' }), discovery: Object.freeze({ state: 'ABSENT' }) });

        store.set('pub-c', lifecycleA);
        store.set('pub-c', lifecycleB);

        assert(store.get('pub-c') === lifecycleB, '8. the second set() replaces the first outright');
        assert(store.get('pub-c') !== lifecycleA, '9. the first stored value is gone, never merged into the second');

        console.log('✓ set() replaces the previously stored value; no merge, no history, no legitimacy check');
    }

    // ---------------------------------------------------------------
    // Section D — missing entries degrade to null, never undefined.
    // ---------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();

        assert(store.get('never-set') === null, '10. a publicationId that was never set() returns null');
        assert(store.get('never-set') !== undefined, '11. a never-set publicationId is never undefined');

        store.set('pub-d', validLifecycle);
        store.remove('pub-d');
        assert(store.get('pub-d') === null, '12. a removed publicationId returns null, indistinguishable from never having been set');

        console.log('✓ Missing entries degrade to null, matching this codebase\'s own degradation style, never undefined');
    }

    // ---------------------------------------------------------------
    // Section E — remove() is idempotent: true when something was
    // removed, false otherwise.
    // ---------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();
        store.set('pub-e', validLifecycle);

        assert(store.remove('pub-e') === true, '13. removing an existing entry returns true');
        assert(store.remove('pub-e') === false, '14. removing the same id again returns false — it is no longer there');
        assert(store.remove('never-existed') === false, '15. removing an id that was never set() returns false');

        console.log('✓ remove() is idempotent: true on actual removal, false otherwise, safe to call without checking get() first');
    }

    // ---------------------------------------------------------------
    // Section F — clear() empties the store; afterward it behaves
    // exactly as a freshly constructed store.
    // ---------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();
        store.set('pub-f-1', validLifecycle);
        store.set('pub-f-2', validLifecycle);

        store.clear();

        assert(store.get('pub-f-1') === null && store.get('pub-f-2') === null, '16. every entry is gone after clear()');

        store.set('pub-f-1', validLifecycle);
        assert(store.get('pub-f-1') === validLifecycle, '17. the store accepts new entries normally after clear()');

        console.log('✓ clear() empties the store completely and leaves it usable exactly as a fresh instance');
    }

    // ---------------------------------------------------------------
    // Section G — malformed input degrades silently, never throws.
    // ---------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();

        assert(store.get() === null, '18. get() with no argument returns null');
        assert(store.get(null) === null, '19. get(null) returns null');
        assert(store.get(42) === null, '20. get() with a non-string id returns null');
        assert(store.get('') === null, '21. get(\'\') (empty string) returns null');

        store.set(); // no publicationId, no lifecycle
        store.set(null, validLifecycle);
        store.set('', validLifecycle);
        store.set(42, validLifecycle);
        store.set('pub-g', null);
        store.set('pub-g', undefined);
        assert(store.get('pub-g') === null, '22. set() with a malformed publicationId or falsy lifecycle silently does nothing');

        assert(store.remove() === false, '23. remove() with no argument returns false');
        assert(store.remove(null) === false, '24. remove(null) returns false');
        assert(store.remove('') === false, '25. remove(\'\') returns false');

        console.log('✓ Malformed input degrades silently on every operation; none of the four methods ever throws');
    }

    // ---------------------------------------------------------------
    // Section H — the store never mutates a stored value.
    // ---------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();
        const snapshot = JSON.stringify(validLifecycle);

        store.set('pub-h', validLifecycle);
        store.get('pub-h');
        store.remove('pub-h');

        assert(JSON.stringify(validLifecycle) === snapshot, '26. the stored lifecycle value is never mutated by set(), get(), or remove()');
        assert(Object.isFrozen(validLifecycle) && Object.isFrozen(validLifecycle.material), '27. the lifecycle value remains frozen throughout, exactly as 0.9.50/0.9.51 produced it');

        console.log('✓ The store never mutates a lifecycle value it holds — it trusts the frozen values 0.9.50/0.9.51 already produce');
    }

    // ---------------------------------------------------------------
    // Section I — independent instances share no state.
    // ---------------------------------------------------------------
    {
        const storeOne = new PublicationDistributionLifecycleMemoryStore();
        const storeTwo = new PublicationDistributionLifecycleMemoryStore();

        storeOne.set('pub-i', validLifecycle);

        assert(storeOne.get('pub-i') === validLifecycle, '28. the first store holds the value it was given');
        assert(storeTwo.get('pub-i') === null, '29. a second, independent store instance knows nothing about it — no shared module-level state');

        console.log('✓ Each store instance holds its own independent state — not a singleton');
    }

    // ---------------------------------------------------------------
    // Section J — architectural regression.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/PublicationDistributionLifecycleStore.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!codeOnly.includes("from './PublicationDistributionLifecycle"), '30. never imports the 0.9.50 lifecycle module');
        assert(!codeOnly.includes("from './PublicationDistributionLifecycleTransition"), '31. never imports the 0.9.51 transition module');
        assert(!codeOnly.includes("from './PublicationDistributionResult"), '32. never imports the 0.9.48 result module');
        assert(!codeOnly.includes("from './PublicationDistributionExecutor"), '33. never imports the 0.9.49 execution module');
        assert(!codeOnly.includes('ArweavePublicationMaterialUploader') && !codeOnly.includes('NostrPublicationDiscoveryPublisher') && !codeOnly.includes('PublicationDistributionDescriptor') && !codeOnly.includes('PublicationDistributionRuntimeComposition'), '34. never imports any of the four collaborator/execution files');
        assert(!/\bfetch\(/.test(codeOnly), '35. never calls fetch(...) — no network access of its own');
        assert(!codeOnly.includes('WebSocket'), '36. never references WebSocket');
        assert(!codeOnly.includes('StorageProvider'), '37. never imports or references StorageProvider — no persistence adapter');
        assert(!codeOnly.includes('localStorage') && !codeOnly.includes('indexedDB') && !codeOnly.includes('IndexedDB'), '38. never references browser storage of any kind');
        assert(!codeOnly.includes('async '), '39. contains no async function of its own — synchronous only');
        assert(!codeOnly.includes('setTimeout') && !codeOnly.includes('setInterval'), '40. no retry/scheduling/background-worker machinery of its own');
        assert(!codeOnly.includes('new Date') && !codeOnly.includes('Date.now'), '41. no clock read, and no timestamp of any kind');

        const forbiddenTerms = ['pending', 'failed', 'failure', 'retrying', 'confirmed', 'withdrawn', 'rollback', 'compensation', 'transaction', 'queue', 'schedule', 'history', 'undo', 'version', 'lock', 'merge', 'rank'];
        for (const term of forbiddenTerms) {
            const pattern = new RegExp(`\\b${term}\\b`, 'i');
            assert(!pattern.test(codeOnly), `42. code must never use "${term}" — this store neither manages state transitions nor keeps history`);
        }

        assert(!codeOnly.includes('Object.freeze'), '43. this file never freezes a value itself — it trusts the already-frozen lifecycle values 0.9.50/0.9.51 produce, and does not reconstruct them');
        assert(!codeOnly.includes('JSON.parse') && !codeOnly.includes('JSON.stringify'), '44. never serializes or deep-clones a stored value');

        console.log('✓ Architectural regression: no lifecycle/transition/result/execution/collaborator imports, no I/O, no clock, no persistence technology, no freezing/cloning of stored values, no operational vocabulary');
    }

    console.log('\nAll PublicationDistributionLifecycleStore tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
