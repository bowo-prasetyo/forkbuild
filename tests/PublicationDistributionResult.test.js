import { readFile } from 'node:fs/promises';
import { describePublicationDistributionResult } from '../application/PublicationDistributionResult.js';
import { describePublicationDistribution } from '../application/PublicationDistributionDescriptor.js';
import { ArweavePublicationMaterialUploader } from '../application/ArweavePublicationMaterialUploader.js';
import { NostrPublicationDiscoveryPublisher } from '../application/NostrPublicationDiscoveryPublisher.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { Signature } from '../core/Signature.js';

// 0.9.48 — Publication Distribution Result Boundary.
// See docs/Roadmap.md, "0.9.48 — Publication Distribution Result Boundary,"
// for the full milestone story.
//
//   Section A: FLAGSHIP — a real Arweave upload result, a real
//              PublicationDistributionDescriptor, and a real Nostr publish
//              result compose into one described result, with material
//              uri, discovery tag, and relay origin staying three
//              distinct facts throughout
//   Section B: material and discovery are independently optional — never
//              collapsed into a boolean, never required together
//   Section C: a supplied-but-malformed section invalidates the whole
//              result, never silently dropped
//   Section D: publication validation — duck-typed, id required, no
//              signature re-check
//   Section E: determinism — no hidden state, no clock
//   Section F: architectural regression — no I/O, no second envelope, no
//              status/success vocabulary, no re-verification

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

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: Arweave upload result -> Publication
    // Distribution Descriptor -> Nostr publish result -> this file's own
    // described result, proving material uri, discovery tag, and relay
    // origin remain three distinct facts throughout.
    // ---------------------------------------------------------------
    {
        const transactionId = 'FlagshipResultTransactionId1234567890';
        const uploader = new ArweavePublicationMaterialUploader({
            signer: makeFakeSigner({ handler: () => ({ id: transactionId, transaction: { placeholder: true } }) }),
            fetchImpl: async () => gatewayResponse('accepted')
        });
        const relay = makeFakeRelay({ handler: () => ({ published: true, id: 'e'.repeat(64) }) });
        const publisher = new NostrPublicationDiscoveryPublisher({
            relayUrl: 'wss://relay.example',
            discoveryTag: 'forkbuild-publication',
            publishImpl: relay.publishImpl
        });

        const publication = signedPublication();

        const materialUri = await uploader.upload('serialized publication material');
        assert(materialUri === `ar://${transactionId}`, 'sanity: the uploader produces a real ar:// uri');

        const distribution = describePublicationDistribution({ publication, materialUri });
        assert(distribution !== null, 'sanity: the descriptor accepts the uploaded materialUri');

        const published = await publisher.publish(distribution.discoveryEnvelope);
        assert(published !== null && published.published === true, 'sanity: the publisher accepts the descriptor\'s own discoveryEnvelope');

        const result = describePublicationDistributionResult({
            publication,
            material: { uri: materialUri, storage: uploader.storage },
            discovery: { relayUrl: published.relayUrl, discoveryTag: publisher.discoveryTag, id: published.id }
        });

        assert(result !== null, '1. FLAGSHIP — a result composed from real upload/describe/publish outputs describes successfully');
        assert(result.publication.kind === 'PUBLICATION' && result.publication.objectId === 'pub-1', '2. FLAGSHIP — the publication section names the same object the descriptor named');

        assert(result.material.uri === `ar://${transactionId}`, '3. FLAGSHIP — material.uri is exactly what the uploader produced');
        assert(result.material.storage === 'ar', "4. FLAGSHIP — material.storage is the uploader's own storage label");

        assert(result.discovery.relayUrl === 'wss://relay.example', '5. FLAGSHIP — discovery.relayUrl is exactly the relay the publisher targeted');
        assert(result.discovery.discoveryTag === 'forkbuild-publication', '6. FLAGSHIP — discovery.discoveryTag is exactly the tag the publisher was constructed with');
        assert(result.discovery.id === 'e'.repeat(64), '7. FLAGSHIP — discovery.id is exactly the event id the relay reported');

        assert(
            result.material.uri !== result.discovery.discoveryTag && result.discovery.discoveryTag !== result.discovery.relayUrl && result.material.uri !== result.discovery.relayUrl,
            '8. FLAGSHIP — material uri, discovery tag, and relay origin remain three distinct identities, never conflated'
        );

        assert(!('discoveryEnvelope' in result) && !('protocol' in result) && !('version' in result), '9. FLAGSHIP — the result never duplicates the discovery envelope\'s own protocol/version shape');

        assert(Object.isFrozen(result) && Object.isFrozen(result.publication) && Object.isFrozen(result.material) && Object.isFrozen(result.discovery), '10. FLAGSHIP — the result and every one of its sections are frozen');

        console.log('✓ Flagship: a real upload -> describe -> publish sequence composes into one described result, with all three identities kept distinct');
    }

    // ---------------------------------------------------------------
    // Section B — material and discovery are independently optional,
    // never collapsed into a boolean, never required together.
    // ---------------------------------------------------------------
    {
        const publication = signedPublication();

        const neither = describePublicationDistributionResult({ publication });
        assert(neither !== null, '11. a result with neither material nor discovery supplied still describes successfully');
        assert(neither.material === null && neither.discovery === null, '12. both sections are null when neither fact is supplied — never a rejected call');
        assert(!('status' in neither) && !('success' in neither) && !('distributed' in neither), '13. no status/success/distributed field exists anywhere on the result');

        const materialOnly = describePublicationDistributionResult({
            publication,
            material: { uri: 'ar://TXONLY', storage: 'ar' }
        });
        assert(materialOnly !== null && materialOnly.material !== null && materialOnly.discovery === null, '14. material alone describes successfully, with discovery left null — not "half-failed"');

        const discoveryOnly = describePublicationDistributionResult({
            publication,
            discovery: { relayUrl: 'wss://relay.example', discoveryTag: 'tag-1', id: 'f'.repeat(64) }
        });
        assert(discoveryOnly !== null && discoveryOnly.discovery !== null && discoveryOnly.material === null, '15. discovery alone describes successfully too, with material left null — the two facts are genuinely independent');

        const explicitNulls = describePublicationDistributionResult({ publication, material: null, discovery: null });
        assert(explicitNulls !== null && explicitNulls.material === null && explicitNulls.discovery === null, '16. explicitly passing null for either section behaves exactly like omitting it');

        console.log('✓ material and discovery are independently optional facts, never collapsed into a success/failure boolean');
    }

    // ---------------------------------------------------------------
    // Section C — a supplied-but-malformed section invalidates the
    // whole result, never silently dropped.
    // ---------------------------------------------------------------
    {
        const publication = signedPublication();

        assert(describePublicationDistributionResult({ publication, material: {} }) === null, '17. an empty material object (missing uri) invalidates the whole result');
        assert(describePublicationDistributionResult({ publication, material: { uri: '' } }) === null, '18. an empty material.uri invalidates the whole result');
        assert(describePublicationDistributionResult({ publication, material: 'not-an-object' }) === null, '19. a non-object material invalidates the whole result');
        assert(describePublicationDistributionResult({ publication, material: { uri: 'ar://TX', storage: 42 } }) === null, '20. a non-string material.storage invalidates the whole result');

        assert(describePublicationDistributionResult({ publication, discovery: {} }) === null, '21. an empty discovery object invalidates the whole result');
        assert(describePublicationDistributionResult({ publication, discovery: { relayUrl: 'wss://relay.example' } }) === null, '22. a discovery object missing discoveryTag/id invalidates the whole result');
        assert(describePublicationDistributionResult({ publication, discovery: { relayUrl: 'wss://relay.example', discoveryTag: 'tag', id: '' } }) === null, '23. an empty discovery.id invalidates the whole result');
        assert(describePublicationDistributionResult({ publication, discovery: 'not-an-object' }) === null, '24. a non-object discovery invalidates the whole result');

        // A malformed material never leaks a partial result even when
        // discovery is perfectly valid, and vice versa — the whole call
        // rejects, it never silently drops just the bad section.
        const validDiscovery = { relayUrl: 'wss://relay.example', discoveryTag: 'tag-1', id: 'a'.repeat(64) };
        assert(describePublicationDistributionResult({ publication, material: { uri: '' }, discovery: validDiscovery }) === null, '25. a malformed material invalidates the whole result even when discovery is valid');

        const validMaterial = { uri: 'ar://TXVALID', storage: 'ar' };
        assert(describePublicationDistributionResult({ publication, material: validMaterial, discovery: {} }) === null, '26. a malformed discovery invalidates the whole result even when material is valid');

        console.log('✓ A supplied-but-malformed material or discovery section invalidates the whole result, never silently dropped');
    }

    // ---------------------------------------------------------------
    // Section D — publication validation: duck-typed, id required, no
    // signature re-check (that already happened upstream, at 0.9.44).
    // ---------------------------------------------------------------
    {
        assert(describePublicationDistributionResult() === null, '27. no argument at all degrades to null');
        assert(describePublicationDistributionResult({}) === null, '28. a missing publication degrades to null');
        assert(describePublicationDistributionResult({ publication: null }) === null, '29. a null publication degrades to null');
        assert(describePublicationDistributionResult({ publication: 'not-an-object' }) === null, '30. a non-object publication degrades to null');
        assert(describePublicationDistributionResult({ publication: {} }) === null, '31. a publication with no id degrades to null');
        assert(describePublicationDistributionResult({ publication: { id: '' } }) === null, '32. an empty publication id degrades to null');

        const unsignedButIdentified = { id: 'pub-unsigned' };
        const result = describePublicationDistributionResult({ publication: unsignedButIdentified });
        assert(result !== null && result.publication.objectId === 'pub-unsigned', '33. a plain, duck-typed object with only an id works — this file never re-checks signature, that already happened upstream');

        console.log('✓ publication is duck-typed on id alone; malformed/missing publication degrades to null; no redundant signature re-check');
    }

    // ---------------------------------------------------------------
    // Section E — determinism: two calls with byte-identical input
    // produce byte-identical output.
    // ---------------------------------------------------------------
    {
        const publication = signedPublication();
        const args = {
            publication,
            material: { uri: 'ar://TXDET', storage: 'ar' },
            discovery: { relayUrl: 'wss://relay.example', discoveryTag: 'tag-det', id: 'b'.repeat(64) }
        };
        const first = describePublicationDistributionResult(args);
        const second = describePublicationDistributionResult(args);
        assert(JSON.stringify(first) === JSON.stringify(second), '34. two calls with byte-identical input produce byte-identical output');

        console.log('✓ Determinism: no hidden state, no caching, no clock');
    }

    // ---------------------------------------------------------------
    // Section F — architectural regression.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/PublicationDistributionResult.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!codeOnly.includes('DecentralizedDiscoveryEnvelope'), '35. never imports the discovery envelope module — no second envelope/protocol shape');
        assert(!codeOnly.includes("import { Publication }"), '36. never imports the Publication class — duck-typed only');
        assert(!codeOnly.includes('ArweavePublicationMaterialUploader') && !codeOnly.includes('NostrPublicationDiscoveryPublisher') && !codeOnly.includes('PublicationDistributionDescriptor') && !codeOnly.includes('PublicationDistributionRuntimeComposition'), '37. never imports any of the three collaborators or the 0.9.47 composition — this file only describes facts it is handed');
        assert(!/\bfetch\(/.test(codeOnly), '38. never calls fetch(...) — no network access of its own');
        assert(!codeOnly.includes('WebSocket'), '39. never references WebSocket');
        assert(!codeOnly.includes('StorageProvider'), '40. never imports or references StorageProvider — no persistence');
        assert(!codeOnly.includes('LocalAuthorizationVerifier'), '41. never imports the signature verifier — no re-verification');
        assert(!codeOnly.includes('async '), '42. contains no async function of its own — synchronous only');
        assert(!codeOnly.includes('setTimeout'), '43. no retry/scheduling machinery of its own');

        const forbiddenTerms = ['status', 'success', 'failed', 'failure', 'distributed', 'trusted', 'reputation', 'weight', 'confidence', 'ranking', 'scoring', 'preferred', 'retry', 'cache', 'dedup'];
        for (const term of forbiddenTerms) {
            assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `44. code must never use "${term}" — no status/success/trust/execution vocabulary at this boundary`);
        }

        const descriptorSource = await readFile(new URL('../application/PublicationDistributionDescriptor.js', import.meta.url), 'utf8');
        assert(!descriptorSource.includes('PublicationDistributionResult'), '45. the 0.9.44 descriptor itself is never modified to know about this result file');

        const uploaderSource = await readFile(new URL('../application/ArweavePublicationMaterialUploader.js', import.meta.url), 'utf8');
        assert(!uploaderSource.includes('PublicationDistributionResult'), '46. the 0.9.45 uploader itself is never modified to know about this result file');

        const publisherSource = await readFile(new URL('../application/NostrPublicationDiscoveryPublisher.js', import.meta.url), 'utf8');
        assert(!publisherSource.includes('PublicationDistributionResult'), '47. the 0.9.46 publisher itself is never modified to know about this result file');

        const compositionSource = await readFile(new URL('../application/PublicationDistributionRuntimeComposition.js', import.meta.url), 'utf8');
        assert(!compositionSource.includes('PublicationDistributionResult'), '48. the 0.9.47 composition itself is never modified to know about this result file');

        console.log('✓ Architectural regression: no I/O, no second envelope shape, no status/success vocabulary, no re-verification, no existing file modified');
    }

    console.log('\nAll PublicationDistributionResult tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
