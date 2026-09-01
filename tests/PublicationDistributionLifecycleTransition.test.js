import { readFile } from 'node:fs/promises';
import { transitionPublicationDistributionLifecycle } from '../application/PublicationDistributionLifecycleTransition.js';
import { describePublicationDistributionLifecycle, PublicationDistributionState } from '../application/PublicationDistributionLifecycle.js';
import { describePublicationDistributionResult } from '../application/PublicationDistributionResult.js';
import { executePublicationDistribution } from '../application/PublicationDistributionExecutor.js';
import { describePublicationDistribution } from '../application/PublicationDistributionDescriptor.js';
import { ArweavePublicationMaterialUploader } from '../application/ArweavePublicationMaterialUploader.js';
import { NostrPublicationDiscoveryPublisher } from '../application/NostrPublicationDiscoveryPublisher.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { Signature } from '../core/Signature.js';

// 0.9.51 — Publication Distribution Lifecycle Transition Boundary.
// See docs/Roadmap.md, "0.9.51 — Publication Distribution Lifecycle
// Transition Boundary," for the full milestone story.
//
//   Section A: FLAGSHIP — the real 0.9.49 decline scenario, described by
//              0.9.50, then explicitly transitioned on a later-obtained
//              discovery fact (a manual retry) — material stays untouched
//   Section B: a material transition (ABSENT -> PRESENT) leaves discovery
//              byte-for-byte unchanged
//   Section C: a discovery transition (ABSENT -> PRESENT) leaves material
//              byte-for-byte unchanged
//   Section D: replacement — PRESENT -> PRESENT for each dimension
//   Section E: all four 0.9.50 combinations, each transitioned
//              independently
//   Section F: malformed/ambiguous transition input degrades to null
//   Section G: immutability — neither current nor the supplied fact is
//              mutated
//   Section H: determinism and freezing
//   Section I: architectural regression

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

const validMaterialFact = { uri: 'ar://TXVALID', storage: 'ar' };
const validDiscoveryFact = { origin: 'wss://relay.example', discoveryTag: 'tag-1', id: 'a'.repeat(64) };

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: the real 0.9.49 decline scenario (Arweave
    // upload succeeds, Nostr publish declines) described by 0.9.50 as
    // material PRESENT / discovery ABSENT, then explicitly transitioned on
    // a discovery fact a caller obtained later (a manual retry) — material
    // stays untouched, never recomputed.
    // ---------------------------------------------------------------
    {
        const transactionId = 'TransitionFlagshipTransactionId123456';
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

        const before = describePublicationDistributionLifecycle(result);
        assert(before !== null && before.material.state === 'PRESENT' && before.discovery.state === 'ABSENT', 'sanity: the 0.9.50 decline lifecycle is material PRESENT / discovery ABSENT');

        const retryFact = { origin: 'wss://relay-retry.example', discoveryTag: 'forkbuild-publication', id: 'RETRYEVENT' + 'e'.repeat(54) };
        const after = transitionPublicationDistributionLifecycle(before, { discovery: retryFact });

        assert(after !== null, '1. FLAGSHIP — a transition on the decline lifecycle produces a next lifecycle');
        assert(after.discovery.state === PublicationDistributionState.PRESENT, '2. FLAGSHIP — discovery is now PRESENT, from the explicitly supplied retry fact');
        assert(after.discovery.origin === retryFact.origin && after.discovery.id === retryFact.id, '3. FLAGSHIP — discovery facts are exactly the supplied retry fact, never re-derived');
        assert(after.material.state === PublicationDistributionState.PRESENT, '4. FLAGSHIP — material is still PRESENT');
        assert(after.material.uri === before.material.uri && after.material.storage === before.material.storage, '5. FLAGSHIP — material facts are byte-for-byte identical to before the transition');
        assert(after.material === before.material, '6. FLAGSHIP — the untouched material section is the SAME object, copied through, never recomputed');

        console.log('✓ Flagship: a discovery-only transition on the real 0.9.49/0.9.50 decline lifecycle fills in discovery from an explicit retry fact, leaving material untouched');
    }

    // ---------------------------------------------------------------
    // Section B — a material transition (ABSENT -> PRESENT) leaves
    // discovery byte-for-byte unchanged.
    // ---------------------------------------------------------------
    {
        const publication = signedPublication();
        const result = describePublicationDistributionResult({
            publication,
            discovery: { relayUrl: validDiscoveryFact.origin, discoveryTag: validDiscoveryFact.discoveryTag, id: validDiscoveryFact.id }
        });
        const current = describePublicationDistributionLifecycle(result);
        assert(current.material.state === 'ABSENT' && current.discovery.state === 'PRESENT', 'sanity: ABSENT material / PRESENT discovery starting point');

        const next = transitionPublicationDistributionLifecycle(current, { material: validMaterialFact });

        assert(next !== null, '7. a material transition from ABSENT produces a next lifecycle');
        assert(next.material.state === PublicationDistributionState.PRESENT, '8. material is now PRESENT');
        assert(next.material.uri === validMaterialFact.uri && next.material.storage === validMaterialFact.storage, '9. material facts are exactly the supplied fact');
        assert(next.discovery === current.discovery, '10. discovery is the SAME object as before the transition — copied through, never recomputed');
        assert(next.discovery.state === 'PRESENT' && next.discovery.origin === current.discovery.origin, '11. discovery facts remain byte-for-byte identical');

        console.log('✓ A material transition leaves discovery byte-for-byte unchanged, copied through rather than recomputed');
    }

    // ---------------------------------------------------------------
    // Section C — a discovery transition (ABSENT -> PRESENT) leaves
    // material byte-for-byte unchanged.
    // ---------------------------------------------------------------
    {
        const publication = signedPublication();
        const result = describePublicationDistributionResult({ publication, material: validMaterialFact });
        const current = describePublicationDistributionLifecycle(result);
        assert(current.material.state === 'PRESENT' && current.discovery.state === 'ABSENT', 'sanity: PRESENT material / ABSENT discovery starting point');

        const next = transitionPublicationDistributionLifecycle(current, { discovery: validDiscoveryFact });

        assert(next !== null, '12. a discovery transition from ABSENT produces a next lifecycle');
        assert(next.discovery.state === PublicationDistributionState.PRESENT, '13. discovery is now PRESENT');
        assert(next.discovery.origin === validDiscoveryFact.origin && next.discovery.discoveryTag === validDiscoveryFact.discoveryTag && next.discovery.id === validDiscoveryFact.id, '14. discovery facts are exactly the supplied fact');
        assert(next.material === current.material, '15. material is the SAME object as before the transition — copied through, never recomputed');

        console.log('✓ A discovery transition leaves material byte-for-byte unchanged, copied through rather than recomputed');
    }

    // ---------------------------------------------------------------
    // Section D — replacement: PRESENT -> PRESENT for each dimension,
    // never rejected, never judged.
    // ---------------------------------------------------------------
    {
        const publication = signedPublication();
        const result = describePublicationDistributionResult({
            publication,
            material: { uri: 'ar://TXOLD', storage: 'ar' },
            discovery: { relayUrl: 'wss://relay-A.example', discoveryTag: 'tag-old', id: 'a'.repeat(64) }
        });
        const current = describePublicationDistributionLifecycle(result);

        const materialReplaced = transitionPublicationDistributionLifecycle(current, { material: { uri: 'ar://TXNEW', storage: 'ar' } });
        assert(materialReplaced !== null && materialReplaced.material.uri === 'ar://TXNEW', '16. a PRESENT material section can be replaced with new facts');
        assert(materialReplaced.discovery === current.discovery, '17. replacing material still leaves discovery copied through unchanged');

        const discoveryReplaced = transitionPublicationDistributionLifecycle(current, { discovery: { origin: 'wss://relay-B.example', discoveryTag: 'tag-new', id: 'b'.repeat(64) } });
        assert(discoveryReplaced !== null && discoveryReplaced.discovery.origin === 'wss://relay-B.example' && discoveryReplaced.discovery.id === 'b'.repeat(64), '18. a PRESENT discovery section can be replaced with new facts');
        assert(discoveryReplaced.material === current.material, '19. replacing discovery still leaves material copied through unchanged');

        console.log('✓ Replacement of an already-PRESENT section is accepted, never rejected as illegitimate');
    }

    // ---------------------------------------------------------------
    // Section E — all four 0.9.50 combinations, each transitioned
    // independently where valid.
    // ---------------------------------------------------------------
    {
        const publication = signedPublication();
        const rawMaterial = { uri: 'ar://TXCOMBO', storage: 'ar' };
        const rawDiscovery = { relayUrl: 'wss://relay.example', discoveryTag: 'tag-combo', id: 'c'.repeat(64) };

        const combos = {
            neither: describePublicationDistributionLifecycle(describePublicationDistributionResult({ publication })),
            materialOnly: describePublicationDistributionLifecycle(describePublicationDistributionResult({ publication, material: rawMaterial })),
            discoveryOnly: describePublicationDistributionLifecycle(describePublicationDistributionResult({ publication, discovery: rawDiscovery })),
            both: describePublicationDistributionLifecycle(describePublicationDistributionResult({ publication, material: rawMaterial, discovery: rawDiscovery }))
        };

        for (const [name, lifecycle] of Object.entries(combos)) {
            const materialTransitioned = transitionPublicationDistributionLifecycle(lifecycle, { material: validMaterialFact });
            assert(materialTransitioned !== null && materialTransitioned.material.state === 'PRESENT' && materialTransitioned.material.uri === validMaterialFact.uri, `20. [${name}] a material transition always produces a PRESENT material section`);
            assert(materialTransitioned.discovery === lifecycle.discovery, `21. [${name}] a material transition never touches the discovery section`);

            const discoveryTransitioned = transitionPublicationDistributionLifecycle(lifecycle, { discovery: validDiscoveryFact });
            assert(discoveryTransitioned !== null && discoveryTransitioned.discovery.state === 'PRESENT' && discoveryTransitioned.discovery.origin === validDiscoveryFact.origin, `22. [${name}] a discovery transition always produces a PRESENT discovery section`);
            assert(discoveryTransitioned.material === lifecycle.material, `23. [${name}] a discovery transition never touches the material section`);
        }

        console.log('✓ All four material x discovery combinations transition independently in either dimension');
    }

    // ---------------------------------------------------------------
    // Section F — malformed or ambiguous transition input degrades to
    // null, never throws.
    // ---------------------------------------------------------------
    {
        const publication = signedPublication();
        const current = describePublicationDistributionLifecycle(describePublicationDistributionResult({ publication }));

        assert(transitionPublicationDistributionLifecycle() === null, '24. no arguments at all degrades to null');
        assert(transitionPublicationDistributionLifecycle(current) === null, '25. a missing transition degrades to null');
        assert(transitionPublicationDistributionLifecycle(current, null) === null, '26. a null transition degrades to null');
        assert(transitionPublicationDistributionLifecycle(current, {}) === null, '27. a transition naming neither dimension degrades to null');
        assert(transitionPublicationDistributionLifecycle(current, { material: validMaterialFact, discovery: validDiscoveryFact }) === null, '28. a transition naming BOTH dimensions in one call degrades to null — one explicit fact per call, never a bundle');
        assert(transitionPublicationDistributionLifecycle(current, { material: {} }) === null, '29. a material fact missing uri degrades to null');
        assert(transitionPublicationDistributionLifecycle(current, { material: { uri: '' } }) === null, '30. an empty material.uri degrades to null');
        assert(transitionPublicationDistributionLifecycle(current, { material: { uri: 'ar://TX', storage: 123 } }) === null, '31. a non-string material.storage degrades to null');
        assert(transitionPublicationDistributionLifecycle(current, { discovery: {} }) === null, '32. a discovery fact missing all fields degrades to null');
        assert(transitionPublicationDistributionLifecycle(current, { discovery: { origin: 'wss://relay.example' } }) === null, '33. a discovery fact missing discoveryTag/id degrades to null');
        assert(transitionPublicationDistributionLifecycle(null, { material: validMaterialFact }) === null, '34. a null current lifecycle degrades to null');
        assert(transitionPublicationDistributionLifecycle('not-an-object', { material: validMaterialFact }) === null, '35. a non-object current lifecycle degrades to null');
        assert(transitionPublicationDistributionLifecycle({ material: { state: 'PRESENT' }, discovery: { state: 'ABSENT' } }, { discovery: validDiscoveryFact }) === null, '36. a malformed current.material (PRESENT with no uri) degrades to null');
        assert(transitionPublicationDistributionLifecycle({ material: { state: 'ABSENT' }, discovery: { state: 'PRESENT' } }, { material: validMaterialFact }) === null, '37. a malformed current.discovery (PRESENT with no fields) degrades to null');
        assert(transitionPublicationDistributionLifecycle(current, { material: undefined, discovery: validDiscoveryFact }) !== null, '38. an explicitly undefined non-target dimension is treated as absent from the transition, not as "both supplied"');

        console.log('✓ Malformed, ambiguous, or missing transition input degrades to null; never throws');
    }

    // ---------------------------------------------------------------
    // Section G — immutability: neither the current lifecycle nor the
    // supplied fact is mutated.
    // ---------------------------------------------------------------
    {
        const publication = signedPublication();
        const current = describePublicationDistributionLifecycle(describePublicationDistributionResult({ publication, material: { uri: 'ar://TXIMMUT', storage: 'ar' } }));
        const currentSnapshot = JSON.stringify(current);
        const fact = { origin: 'wss://relay.example', discoveryTag: 'tag-immut', id: 'd'.repeat(64) };
        const factSnapshot = JSON.stringify(fact);

        const next = transitionPublicationDistributionLifecycle(current, { discovery: fact });

        assert(JSON.stringify(current) === currentSnapshot, '39. the current lifecycle is not mutated by the transition');
        assert(JSON.stringify(fact) === factSnapshot, '40. the supplied fact object is not mutated by the transition');
        assert(next !== current, '41. the returned lifecycle is a new object, never the same reference as current');
        assert(Object.isFrozen(current) && Object.isFrozen(current.material), '42. current itself remains frozen throughout');

        console.log('✓ Immutability: neither the current lifecycle nor the supplied fact is ever mutated');
    }

    // ---------------------------------------------------------------
    // Section H — determinism and freezing.
    // ---------------------------------------------------------------
    {
        const current = Object.freeze({
            material: Object.freeze({ state: 'ABSENT' }),
            discovery: Object.freeze({ state: 'PRESENT', origin: 'wss://relay.example', discoveryTag: 'tag-det', id: 'e'.repeat(64) })
        });
        const transition = Object.freeze({ material: Object.freeze({ uri: 'ar://TXDET', storage: 'ar' }) });

        const first = transitionPublicationDistributionLifecycle(current, transition);
        const second = transitionPublicationDistributionLifecycle(current, transition);

        assert(JSON.stringify(first) === JSON.stringify(second), '43. two calls with byte-identical input produce byte-identical output');
        assert(Object.isFrozen(first) && Object.isFrozen(first.material) && Object.isFrozen(first.discovery), '44. the transitioned lifecycle and every one of its sections are frozen');

        console.log('✓ Determinism and freezing: no hidden state, no mutation');
    }

    // ---------------------------------------------------------------
    // Section I — architectural regression.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/PublicationDistributionLifecycleTransition.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(codeOnly.includes("from './PublicationDistributionLifecycle.js'"), '45. imports PublicationDistributionState from the 0.9.50 lifecycle file, its one deliberate dependency');
        assert(!codeOnly.includes("from './PublicationDistributionResult"), '46. never imports the 0.9.48 result module');
        assert(!codeOnly.includes("from './PublicationDistributionExecutor"), '47. never imports the 0.9.49 execution module');
        assert(!codeOnly.includes('ArweavePublicationMaterialUploader') && !codeOnly.includes('NostrPublicationDiscoveryPublisher') && !codeOnly.includes('PublicationDistributionDescriptor') && !codeOnly.includes('PublicationDistributionRuntimeComposition'), '48. never imports any of the four collaborator/execution files');
        assert(!/\bfetch\(/.test(codeOnly), '49. never calls fetch(...) — no network access of its own');
        assert(!codeOnly.includes('WebSocket'), '50. never references WebSocket');
        assert(!codeOnly.includes('StorageProvider'), '51. never imports or references StorageProvider — no persistence');
        assert(!codeOnly.includes('async '), '52. contains no async function of its own — synchronous only');
        assert(!codeOnly.includes('setTimeout'), '53. no retry/scheduling machinery of its own');
        assert(!codeOnly.includes('new Date') && !codeOnly.includes('Date.now'), '54. no clock read of any kind');

        const forbiddenTerms = ['pending', 'failed', 'failure', 'retrying', 'confirmed', 'withdrawn', 'rollback', 'compensation', 'transaction', 'queue', 'schedule', 'history', 'undo'];
        for (const term of forbiddenTerms) {
            const pattern = new RegExp(`\\b${term}\\b`, 'i');
            assert(!pattern.test(codeOnly), `55. code must never use "${term}" — no operational-interpretation vocabulary at this boundary`);
        }

        assert(!codeOnly.includes("'ABSENT'") && !codeOnly.includes('"ABSENT"'), '56. this file never writes a literal ABSENT string of its own — state is only ever read via PublicationDistributionState.ABSENT or copied through unchanged from current');

        const lifecycleSource = await readFile(new URL('../application/PublicationDistributionLifecycle.js', import.meta.url), 'utf8');
        assert(!lifecycleSource.includes('PublicationDistributionLifecycleTransition'), '57. the 0.9.50 lifecycle file itself is never modified to know about this transition file');

        const resultSource = await readFile(new URL('../application/PublicationDistributionResult.js', import.meta.url), 'utf8');
        assert(!resultSource.includes('PublicationDistributionLifecycleTransition'), '58. the 0.9.48 result file itself is never modified to know about this transition file');

        console.log('✓ Architectural regression: no execution/collaborator imports, no I/O, no clock, no PENDING/FAILED/WITHDRAWN vocabulary, no existing file modified');
    }

    console.log('\nAll PublicationDistributionLifecycleTransition tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
