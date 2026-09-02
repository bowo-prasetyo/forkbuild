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

// 0.9.53 — Publication Distribution Lifecycle Observation Boundary.
// See docs/Roadmap.md, "0.9.53 — Publication Distribution Lifecycle
// Observation Boundary," for the full milestone story.
//
//   Section A: FLAGSHIP — execute (0.9.49) -> describe (0.9.50) ->
//              transition (0.9.51) -> store.set() (0.9.52) ->
//              subscribe() (0.9.53), end to end, with the real
//              Arweave-succeeds/Nostr-declines-then-retries scenario
//   Section B: identity preservation — a subscriber receives the exact
//              reference set() was given, never a copy
//   Section C: multiple subscribers of the same publicationId all receive
//              the same lifecycle reference
//   Section D: subscriber isolation — a throwing listener never stops
//              another subscriber or the triggering mutation
//   Section E: no initial callback on subscribe() itself
//   Section F: set() always notifies, even with a repeated identical
//              reference — no equality-based suppression
//   Section G: remove() notifies listener(publicationId, null) only when
//              an entry actually existed
//   Section H: clear() never notifies
//   Section I: unsubscribe is idempotent and permanent
//   Section J: subscription is per publicationId, never store-wide
//   Section K: each subscribe() call is an independent subscription
//   Section L: malformed subscribe() input degrades silently
//   Section M: architectural regression

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
    material: Object.freeze({ state: 'PRESENT', uri: 'ar://TXOBSERVE', storage: 'ar' }),
    discovery: Object.freeze({ state: 'ABSENT' })
});

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: the real 0.9.49 decline scenario, described
    // by 0.9.50, stored by 0.9.52, observed live by this milestone's own
    // subscribe(), then recovered by an explicit 0.9.51 retry transition
    // and observed again — proving the observation boundary preserves
    // object identity at every hand-off, exactly as storage already does.
    // ---------------------------------------------------------------
    {
        const transactionId = 'ObserveFlagshipTransactionId123456789';
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
        const observed = [];
        const unsubscribe = store.subscribe(publication.id, (publicationId, lifecycle) => {
            observed.push({ publicationId, lifecycle });
        });

        store.set(publication.id, declined);
        assert(observed.length === 1, '1. FLAGSHIP — subscribing before the first set() delivers exactly one notification');
        assert(observed[0].publicationId === publication.id, '2. FLAGSHIP — the notification carries the publication identity it was stored under');
        assert(observed[0].lifecycle === declined, '3. FLAGSHIP — the observer receives the exact decline lifecycle reference just stored, never a copy');
        assert(observed[0].lifecycle === store.get(publication.id), '4. FLAGSHIP — the observed reference and store.get() agree — the same object, seen two ways');

        const retryFact = { origin: 'wss://relay-retry.example', discoveryTag: 'forkbuild-publication', id: 'OBSERVEEVENT' + 'f'.repeat(52) };
        const recovered = transitionPublicationDistributionLifecycle(declined, { discovery: retryFact });
        assert(recovered !== null && recovered.discovery.state === 'PRESENT', 'sanity: 0.9.51 transitions discovery to PRESENT from the retry fact');

        store.set(publication.id, recovered);
        assert(observed.length === 2, '5. FLAGSHIP — the retry transition, once stored, delivers a second notification');
        assert(observed[1].lifecycle === recovered, '6. FLAGSHIP — the observer receives the exact recovered lifecycle reference, never a copy');
        assert(observed[1].lifecycle !== observed[0].lifecycle, '7. FLAGSHIP — the two observed lifecycles are distinct objects, never the same reference reused');
        assert(observed[0].lifecycle.discovery.state === 'ABSENT', '8. FLAGSHIP — the earlier observed lifecycle is untouched by the later notification');
        assert(observed[1].lifecycle.discovery.origin === retryFact.origin, '9. FLAGSHIP — the later observed lifecycle carries the retry fact, unmodified');

        unsubscribe();
        store.remove(publication.id);
        assert(observed.length === 2, '10. FLAGSHIP — no further notification is delivered once unsubscribed, even for a real removal');

        console.log('✓ Flagship: execute -> describe -> transition -> store -> observe, end to end, with the exact object identity preserved at every hand-off');
    }

    // ---------------------------------------------------------------
    // Section B — identity preservation: a subscriber receives the exact
    // reference set() was given, including nested sections.
    // ---------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();
        let receivedLifecycle = null;
        store.subscribe('pub-b', (publicationId, lifecycle) => { receivedLifecycle = lifecycle; });

        store.set('pub-b', validLifecycle);

        assert(receivedLifecycle === validLifecycle, '11. the observer receives the SAME object reference given to set()');
        assert(receivedLifecycle.material === validLifecycle.material, '12. nested sections are the same references too — no deep copy of any kind');

        console.log('✓ Identity preservation: subscribe() delivers the exact reference set() was given — an observation boundary, not a transformation boundary');
    }

    // ---------------------------------------------------------------
    // Section C — multiple subscribers of the same publicationId all
    // receive the same lifecycle reference.
    // ---------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();
        let receivedByFirst = null;
        let receivedBySecond = null;
        store.subscribe('pub-c', (publicationId, lifecycle) => { receivedByFirst = lifecycle; });
        store.subscribe('pub-c', (publicationId, lifecycle) => { receivedBySecond = lifecycle; });

        store.set('pub-c', validLifecycle);

        assert(receivedByFirst === validLifecycle && receivedBySecond === validLifecycle, '13. every subscriber of the same publicationId receives the exact same reference');
        assert(receivedByFirst === receivedBySecond, '14. two subscribers observe the identical object, never independent copies');

        console.log('✓ Multiple subscribers: every listener for the same publicationId receives the same lifecycle reference');
    }

    // ---------------------------------------------------------------
    // Section D — subscriber isolation: a throwing listener never
    // prevents another subscriber from running, and never prevents the
    // triggering mutation itself from completing normally.
    // ---------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();
        let secondListenerRan = false;

        store.subscribe('pub-d', () => {
            throw new Error('a deliberately broken subscriber');
        });
        store.subscribe('pub-d', () => {
            secondListenerRan = true;
        });

        let threw = false;
        try {
            store.set('pub-d', validLifecycle);
        } catch (error) {
            threw = true;
        }

        assert(threw === false, '15. a throwing subscriber never propagates out of set()');
        assert(secondListenerRan === true, '16. a throwing subscriber never prevents a later subscriber from running');
        assert(store.get('pub-d') === validLifecycle, '17. the mutation itself completes normally despite a throwing subscriber');

        console.log('✓ Subscriber isolation: a throwing listener harms neither another subscriber nor the triggering mutation');
    }

    // ---------------------------------------------------------------
    // Section E — no initial callback: subscribing does not itself
    // trigger a notification, even when a lifecycle is already stored.
    // ---------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();
        store.set('pub-e', validLifecycle);

        let notified = false;
        store.subscribe('pub-e', () => { notified = true; });

        assert(notified === false, '18. subscribe() itself never delivers a notification, even when a value already exists for that publicationId');
        assert(store.get('pub-e') === validLifecycle, '19. the current value remains available via get() — a caller reads it explicitly, never via a hidden subscribe() callback');

        console.log('✓ No initial callback: subscribe() only ever describes subsequent changes, never the value already there');
    }

    // ---------------------------------------------------------------
    // Section F — set() always notifies, even with a repeated identical
    // reference — no equality-based suppression.
    // ---------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();
        let count = 0;
        store.subscribe('pub-f', () => { count += 1; });

        store.set('pub-f', validLifecycle);
        assert(count === 1, '20. the first set() notifies');

        store.set('pub-f', validLifecycle);
        assert(count === 2, '21. set() with the exact same reference still notifies — no equality/dedup suppression');

        for (const badId of [undefined, null, '', 42]) {
            store.set(badId, validLifecycle);
        }
        store.set('pub-f', null);
        store.set('pub-f', undefined);
        assert(count === 2, '22. malformed set() input never notifies');

        console.log('✓ Notification rule: set() notifies on every successful store, never on malformed input, with no equality suppression');
    }

    // ---------------------------------------------------------------
    // Section G — remove() notifies listener(publicationId, null) only
    // when an entry actually existed; the null payload means absence,
    // never withdrawal.
    // ---------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();
        const received = [];
        store.subscribe('pub-g', (publicationId, lifecycle) => { received.push(lifecycle); });

        store.remove('pub-g');
        assert(received.length === 0, '23. removing an id that was never set() never notifies');

        store.set('pub-g', validLifecycle);
        assert(received.length === 1, '24. set() notifies as usual');

        store.remove('pub-g');
        assert(received.length === 2 && received[1] === null, '25. removing an existing entry notifies with lifecycle === null');
        assert(store.get('pub-g') === null, '26. get() agrees with the null the observer just received — plain absence, not a withdrawal tag');

        store.remove('pub-g');
        assert(received.length === 2, '27. removing an already-absent entry a second time never notifies again');

        for (const badId of [undefined, null, '', 42]) {
            store.remove(badId);
        }
        assert(received.length === 2, '28. malformed remove() input never notifies');

        console.log('✓ remove() notification: listener(publicationId, null) only on an actual removal, meaning absence, never withdrawal');
    }

    // ---------------------------------------------------------------
    // Section H — clear() never notifies.
    // ---------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();
        let count = 0;
        store.subscribe('pub-h', () => { count += 1; });

        store.set('pub-h', validLifecycle);
        assert(count === 1, '29. set() notifies');

        store.clear();
        assert(count === 1, '30. clear() never notifies, even though it removed an entry a subscriber was watching');
        assert(store.get('pub-h') === null, '31. the entry is actually gone after clear()');

        store.set('pub-h', validLifecycle);
        assert(count === 2, '32. an existing subscription survives clear() and still fires on a later set()');

        console.log('✓ clear() never notifies, and leaves existing subscriptions intact for whatever set()/remove() comes next');
    }

    // ---------------------------------------------------------------
    // Section I — unsubscribe is idempotent and permanent.
    // ---------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();
        let count = 0;
        const unsubscribe = store.subscribe('pub-i', () => { count += 1; });

        unsubscribe();
        store.set('pub-i', validLifecycle);
        assert(count === 0, '33. no notification is delivered once unsubscribed');

        unsubscribe();
        unsubscribe();
        store.set('pub-i', validLifecycle);
        assert(count === 0, '34. calling unsubscribe() more than once is a harmless no-op');

        console.log('✓ Unsubscribe: idempotent and permanent');
    }

    // ---------------------------------------------------------------
    // Section J — subscription is per publicationId, never store-wide: a
    // mutation for one publicationId never notifies a subscriber of
    // another.
    // ---------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();
        let countJ1 = 0;
        let countJ2 = 0;
        store.subscribe('pub-j-1', () => { countJ1 += 1; });
        store.subscribe('pub-j-2', () => { countJ2 += 1; });

        store.set('pub-j-1', validLifecycle);
        assert(countJ1 === 1 && countJ2 === 0, '35. a set() for one publicationId never notifies a subscriber of a different publicationId');

        store.remove('pub-j-1');
        assert(countJ1 === 2 && countJ2 === 0, '36. a remove() for one publicationId never notifies a subscriber of a different publicationId');

        console.log('✓ Per-publicationId isolation: a subscriber only ever hears about the one publication identity it subscribed to');
    }

    // ---------------------------------------------------------------
    // Section K — each subscribe() call is an independent subscription:
    // subscribing the same function reference twice registers two
    // subscriptions, each with its own unsubscribe().
    // ---------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();
        let count = 0;
        const listener = () => { count += 1; };

        const unsubscribeFirst = store.subscribe('pub-k', listener);
        store.subscribe('pub-k', listener);

        store.set('pub-k', validLifecycle);
        assert(count === 2, '37. subscribing the same function twice registers two independent subscriptions, both notified');

        unsubscribeFirst();
        store.set('pub-k', validLifecycle);
        assert(count === 3, '38. unsubscribing one of the two subscriptions leaves the other active');

        console.log('✓ Independent subscriptions: repeated subscribe() calls for the same function are never collapsed into one');
    }

    // ---------------------------------------------------------------
    // Section L — malformed subscribe() input degrades silently: a
    // malformed publicationId or a non-function listener registers
    // nothing, never throws, and still returns a safely callable
    // unsubscribe.
    // ---------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();

        for (const badId of [undefined, null, '', 42, {}]) {
            const unsubscribe = store.subscribe(badId, () => {});
            assert(typeof unsubscribe === 'function', '39. subscribe() always returns a callable unsubscribe, even for a malformed publicationId');
            unsubscribe();
        }

        for (const badListener of [undefined, null, 'not-a-function', 7, {}]) {
            const unsubscribe = store.subscribe('pub-l', badListener);
            assert(typeof unsubscribe === 'function', '40. subscribe() always returns a callable unsubscribe, even for a malformed listener');
            unsubscribe();
        }

        store.set('pub-l', validLifecycle);
        assert(store.get('pub-l') === validLifecycle, '41. malformed subscribe() calls never interfere with ordinary store mutation');

        console.log('✓ Malformed subscribe() input degrades silently, never throws, and yields a harmless unsubscribe');
    }

    // ---------------------------------------------------------------
    // Section M — architectural regression: the observation seam adds
    // no forbidden import or vocabulary — this remains storage plus
    // notification, never an event log, a policy engine, or a second
    // transition boundary.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/PublicationDistributionLifecycleStore.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!codeOnly.includes("from './PublicationDistributionLifecycle"), '42. never imports the 0.9.50 lifecycle module');
        assert(!codeOnly.includes("from './PublicationDistributionLifecycleTransition"), '43. never imports the 0.9.51 transition module');
        assert(!codeOnly.includes("from './PublicationDistributionResult"), '44. never imports the 0.9.48 result module');
        assert(!codeOnly.includes("from './PublicationDistributionExecutor"), '45. never imports the 0.9.49 execution module');
        assert(!/\bfetch\(/.test(codeOnly), '46. never calls fetch(...) — no network access of its own');
        assert(!codeOnly.includes('WebSocket'), '47. never references WebSocket');
        assert(!codeOnly.includes('async '), '48. contains no async function of its own — synchronous only');
        assert(!codeOnly.includes('setTimeout') && !codeOnly.includes('setInterval'), '49. no retry/scheduling/background-worker machinery of its own');
        assert(!codeOnly.includes('new Date') && !codeOnly.includes('Date.now'), '50. no clock read, and no timestamp of any kind');

        const forbiddenTerms = ['pending', 'failed', 'failure', 'retrying', 'confirmed', 'withdrawn', 'rollback', 'compensation', 'transaction', 'queue', 'schedule', 'history', 'undo', 'version', 'lock', 'merge', 'rank'];
        for (const term of forbiddenTerms) {
            const pattern = new RegExp(`\\b${term}\\b`, 'i');
            assert(!pattern.test(codeOnly), `51. code must never use "${term}" — this store neither manages state transitions nor keeps a change log`);
        }

        assert(!codeOnly.includes('Object.freeze'), '52. this file never freezes a value itself — it trusts the already-frozen lifecycle values 0.9.50/0.9.51 produce');
        assert(!codeOnly.includes('JSON.parse') && !codeOnly.includes('JSON.stringify'), '53. never serializes or deep-clones a stored or notified value');

        console.log('✓ Architectural regression: the observation seam adds no lifecycle/transition/result/execution import, no I/O, no clock, no persistence technology, no operational vocabulary, and no event-payload invention beyond (publicationId, lifecycle)');
    }

    console.log('\nAll PublicationDistributionLifecycleObservation tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
