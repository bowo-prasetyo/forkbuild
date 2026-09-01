import { readFile } from 'node:fs/promises';
import { executePublicationDistribution } from '../application/PublicationDistributionExecutor.js';
import { describePublicationDistribution } from '../application/PublicationDistributionDescriptor.js';
import { ArweavePublicationMaterialUploader } from '../application/ArweavePublicationMaterialUploader.js';
import { NostrPublicationDiscoveryPublisher } from '../application/NostrPublicationDiscoveryPublisher.js';
import { composePublicationDistributionRuntime } from '../application/PublicationDistributionRuntimeComposition.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { Signature } from '../core/Signature.js';

// 0.9.49 — Publication Distribution Execution Boundary.
// See docs/Roadmap.md, "0.9.49 — Publication Distribution Execution Boundary,"
// for the full milestone story.
//
//   Section A: FLAGSHIP — a real composed runtime (0.9.47), sequenced by
//              this file's own executor, produces one complete
//              PublicationDistributionResult with all three identities
//              (material uri, discovery tag, relay origin) kept distinct
//   Section B: material upload fails -> the whole call stops there,
//              distributionDescriptor and discoveryPublisher are never
//              consulted, material and discovery are both null
//   Section C: DECLINE — discovery publish declines after a successful
//              upload: no retry, no rollback, no fabricated success,
//              material fact preserved, discovery null
//   Section D: distributionDescriptor fails after a successful upload —
//              discoveryPublisher never consulted, material fact preserved
//   Section E: genuine collaborator rejection propagates, never swallowed
//              into a null section
//   Section F: collaborator contract violations throw synchronously,
//              before any I/O
//   Section G: architectural regression — no transaction/rollback/status
//              vocabulary, single envelope construction point, no
//              concrete Arweave/Nostr imports

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function expectRejects(promise, message) {
    let threw = false;
    try { await promise; } catch (e) { threw = true; }
    assert(threw, message);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, message);
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
    // Section A — FLAGSHIP: a real 0.9.47 composed runtime, sequenced by
    // this file's own executor, into one complete result.
    // ---------------------------------------------------------------
    {
        const transactionId = 'ExecutorFlagshipTransactionId1234567890';
        const relay = makeFakeRelay({ handler: () => ({ published: true, id: 'e'.repeat(64) }) });

        const runtime = composePublicationDistributionRuntime({
            arweaveUploaderOptions: {
                signer: makeFakeSigner({ handler: () => ({ id: transactionId, transaction: { placeholder: true } }) }),
                fetchImpl: async () => gatewayResponse('accepted')
            },
            nostrPublisherOptions: {
                relayUrl: 'wss://relay.example',
                discoveryTag: 'forkbuild-publication',
                publishImpl: relay.publishImpl
            }
        });

        const publication = signedPublication();

        const result = await executePublicationDistribution({
            publication,
            serializedMaterial: 'serialized publication material',
            materialUploader: runtime.uploader,
            distributionDescriptor: runtime.describeDistribution,
            discoveryPublisher: runtime.publisher
        });

        assert(result !== null, '1. FLAGSHIP — a full upload -> describe -> publish sequence resolves to a real result');
        assert(result.publication.objectId === 'pub-1', '2. FLAGSHIP — result.publication.objectId is the publication\'s own id');

        assert(result.material.uri === `ar://${transactionId}`, '3. FLAGSHIP — result.material.uri is exactly what the composed uploader produced');
        assert(result.material.storage === 'ar', '4. FLAGSHIP — result.material.storage is the uploader\'s own storage label');

        assert(result.discovery.discoveryTag === 'forkbuild-publication', '5. FLAGSHIP — result.discovery.discoveryTag is exactly the composed publisher\'s own discoveryTag');
        assert(result.discovery.relayUrl === 'wss://relay.example', '6. FLAGSHIP — result.discovery.relayUrl is exactly the configured relay');
        assert(result.discovery.id === 'e'.repeat(64), '7. FLAGSHIP — result.discovery.id is exactly the event id the relay reported');

        assert(
            result.material.uri !== result.discovery.discoveryTag &&
            result.discovery.discoveryTag !== result.discovery.relayUrl &&
            result.material.uri !== result.discovery.relayUrl,
            '9. FLAGSHIP — material uri, discovery tag, and relay origin remain three distinct identities'
        );

        assert(relay.calls.length === 1, '10. FLAGSHIP — the relay was contacted exactly once');
        const publishedEnvelope = JSON.parse(relay.calls[0].eventTemplate.content);
        assert(publishedEnvelope.uri === `ar://${transactionId}`, '11. FLAGSHIP — the envelope actually published to the relay names the real uploaded materialUri');

        console.log('✓ Flagship: a real composed runtime, sequenced by executePublicationDistribution(), produces one complete result');
    }

    // ---------------------------------------------------------------
    // Section B — material upload fails: the whole call stops there.
    // ---------------------------------------------------------------
    {
        const publication = signedPublication();
        let descriptorCalled = false;
        let publishCalled = false;

        const materialUploader = { upload: async () => null, storage: 'ar' };
        const distributionDescriptor = (args) => { descriptorCalled = true; return describePublicationDistribution(args); };
        const discoveryPublisher = {
            discoveryTag: 'tag-1',
            publish: async () => { publishCalled = true; return { published: true, relayUrl: 'wss://relay.example', id: '0'.repeat(64) }; }
        };

        const result = await executePublicationDistribution({
            publication,
            serializedMaterial: 'material',
            materialUploader,
            distributionDescriptor,
            discoveryPublisher
        });

        assert(result !== null, '12. an upload decline still produces a describable result');
        assert(result.material === null, '13. material is null when upload declined');
        assert(result.discovery === null, '14. discovery is null when upload declined');
        assert(descriptorCalled === false, '15. distributionDescriptor is never called when there is no materialUri to build from');
        assert(publishCalled === false, '16. discoveryPublisher.publish is never called when upload declined');

        console.log('✓ Section B: material upload failure stops the sequence — descriptor and publisher are never consulted');
    }

    // ---------------------------------------------------------------
    // Section C — DECLINE: discovery publish declines after a
    // successful upload. No retry, no rollback, no fabricated success.
    // ---------------------------------------------------------------
    {
        const publication = signedPublication();
        const uploadCalls = [];
        const publishCalls = [];

        const materialUploader = {
            storage: 'ar',
            upload: async (material) => { uploadCalls.push(material); return 'ar://REAL-TX-ID'; }
        };
        const distributionDescriptor = describePublicationDistribution;
        const discoveryPublisher = {
            discoveryTag: 'tag-decline',
            publish: async (envelope) => { publishCalls.push(envelope); return null; }
        };

        const result = await executePublicationDistribution({
            publication,
            serializedMaterial: 'real material bytes',
            materialUploader,
            distributionDescriptor,
            discoveryPublisher
        });

        assert(uploadCalls.length === 1, '17. DECLINE — the uploader was actually invoked exactly once');
        assert(publishCalls.length === 1, '18. DECLINE — the publisher was subsequently invoked exactly once, proving the sequence proceeded past upload');

        assert(result !== null, '19. DECLINE — a result is still produced');
        assert(result.material !== null && result.material.uri === 'ar://REAL-TX-ID', '20. DECLINE — the material fact from the successful upload is preserved');
        assert(result.discovery === null, '21. DECLINE — discovery is null, not a fabricated partial-success value');
        assert(!('status' in result) && !('success' in result) && !('distributed' in result), '22. DECLINE — no fully-successful or partial-success status is ever fabricated');

        // No retry: exactly one publish attempt, never more, after a decline.
        assert(publishCalls.length === 1, '23. DECLINE — no retry occurred after the decline');

        // No rollback: the executor never asks the uploader to undo, revoke,
        // or delete anything — it has no such method to call in the first
        // place, and this file never invents one.
        assert(typeof materialUploader.delete === 'undefined' && typeof materialUploader.rollback === 'undefined', '24. DECLINE — the uploader collaborator is never even given a delete/rollback surface to call');

        console.log('✓ Section C: a Nostr decline after a successful Arweave upload preserves the material fact, reports discovery as null, retries nothing, rolls back nothing');
    }

    // ---------------------------------------------------------------
    // Section D — distributionDescriptor fails after a successful
    // upload (e.g. an unsigned publication) — discoveryPublisher is
    // never consulted, the material fact is still preserved.
    // ---------------------------------------------------------------
    {
        const unsignedPublication = signedPublication({ signature: null });
        let publishCalled = false;

        const materialUploader = { storage: 'ar', upload: async () => 'ar://SOME-TX' };
        const discoveryPublisher = {
            discoveryTag: 'tag-2',
            publish: async () => { publishCalled = true; return { published: true, relayUrl: 'wss://relay.example', id: '1'.repeat(64) }; }
        };

        const result = await executePublicationDistribution({
            publication: unsignedPublication,
            serializedMaterial: 'material',
            materialUploader,
            distributionDescriptor: describePublicationDistribution,
            discoveryPublisher
        });

        assert(result !== null, '25. a descriptor failure still produces a describable result');
        assert(result.material !== null && result.material.uri === 'ar://SOME-TX', '26. the material fact from the already-successful upload is preserved even though the descriptor failed');
        assert(result.material.storage === 'ar', '27. the preserved material fact falls back to the uploader\'s own storage label when the descriptor never ran');
        assert(result.discovery === null, '28. discovery is null when the descriptor never produced an envelope');
        assert(publishCalled === false, '29. discoveryPublisher.publish is never called when there is no discoveryEnvelope to publish');

        console.log('✓ Section D: a distributionDescriptor failure after a successful upload preserves the material fact and never reaches the publisher');
    }

    // ---------------------------------------------------------------
    // Section E — a genuine collaborator rejection propagates, never
    // swallowed into a null section.
    // ---------------------------------------------------------------
    {
        const publication = signedPublication();

        const rejectingUploader = { storage: 'ar', upload: async () => { throw new Error('no wallet available'); } };
        await expectRejects(
            executePublicationDistribution({
                publication,
                serializedMaterial: 'material',
                materialUploader: rejectingUploader,
                distributionDescriptor: describePublicationDistribution,
                discoveryPublisher: { discoveryTag: 'tag-3', publish: async () => null }
            }),
            '30. a genuine upload failure (rejection) propagates rather than degrading to a null material section'
        );

        const rejectingPublisher = {
            discoveryTag: 'tag-4',
            publish: async () => { throw new Error('relay unreachable'); }
        };
        await expectRejects(
            executePublicationDistribution({
                publication,
                serializedMaterial: 'material',
                materialUploader: { storage: 'ar', upload: async () => 'ar://TX-E' },
                distributionDescriptor: describePublicationDistribution,
                discoveryPublisher: rejectingPublisher
            }),
            '31. a genuine publish failure (rejection) propagates rather than degrading to a null discovery section'
        );

        console.log('✓ Section E: genuine collaborator rejections propagate unchanged, never flattened into an ordinary null result');
    }

    // ---------------------------------------------------------------
    // Section F — collaborator contract violations throw synchronously,
    // before any I/O occurs.
    // ---------------------------------------------------------------
    {
        const publication = signedPublication();
        const workingUploader = { storage: 'ar', upload: async () => 'ar://SHOULD-NOT-BE-CALLED' };
        const workingPublisher = { discoveryTag: 'tag-5', publish: async () => ({ published: true, relayUrl: 'wss://relay.example', id: '2'.repeat(64) }) };

        expectThrows(
            () => executePublicationDistribution({ publication, materialUploader: {}, distributionDescriptor: describePublicationDistribution, discoveryPublisher: workingPublisher }),
            '32. a materialUploader with no upload() throws synchronously'
        );
        expectThrows(
            () => executePublicationDistribution({ publication, materialUploader: workingUploader, distributionDescriptor: 'not-a-function', discoveryPublisher: workingPublisher }),
            '33. a non-function distributionDescriptor throws synchronously'
        );
        expectThrows(
            () => executePublicationDistribution({ publication, materialUploader: workingUploader, distributionDescriptor: describePublicationDistribution, discoveryPublisher: {} }),
            '34. a discoveryPublisher with no publish() throws synchronously'
        );
        expectThrows(
            () => executePublicationDistribution({ publication, materialUploader: workingUploader, distributionDescriptor: describePublicationDistribution, discoveryPublisher: { publish: async () => null } }),
            '35. a discoveryPublisher with no discoveryTag throws synchronously'
        );

        console.log('✓ Section F: collaborator contract violations throw immediately, before any collaborator is ever called');
    }

    // ---------------------------------------------------------------
    // Section G — architectural regression.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/PublicationDistributionExecutor.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!codeOnly.includes('ArweavePublicationMaterialUploader'), '36. never imports the concrete Arweave uploader — collaborators are injected');
        assert(!codeOnly.includes('NostrPublicationDiscoveryPublisher'), '37. never imports the concrete Nostr publisher — collaborators are injected');
        assert(!codeOnly.includes("from './PublicationDistributionDescriptor.js'"), '38. never imports the concrete descriptor module — the distributionDescriptor function is injected');
        assert(!codeOnly.includes('PublicationDistributionRuntimeComposition'), '39. never imports the 0.9.47 composition — a caller wires that together itself');
        assert(!codeOnly.includes('DecentralizedDiscoveryEnvelope'), '40. never imports the discovery envelope module — the descriptor\'s own envelope is forwarded, never reconstructed');
        assert(!/\bfetch\(/.test(codeOnly), '41. never calls fetch(...) directly — no network access of its own, only through injected collaborators');
        assert(!codeOnly.includes('WebSocket'), '42. never references WebSocket directly');
        assert(!codeOnly.includes('StorageProvider'), '43. never imports or references StorageProvider — no persistence');
        assert(!codeOnly.includes('setTimeout'), '44. no retry/scheduling machinery of its own');
        assert(!/\btry\s*{/.test(codeOnly), '45. no try/catch anywhere — a genuine collaborator failure is never caught, only ordinary null declines are composed');

        const forbiddenTerms = ['rollback', 'compensate', 'compensation', 'transaction', 'retry', 'cache', 'dedup', 'status', 'success', 'failed', 'failure', 'pending', 'trusted', 'reputation', 'weight', 'confidence', 'ranking', 'scoring', 'preferred', 'queue', 'schedule'];
        for (const term of forbiddenTerms) {
            assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `46. code must never use "${term}" — no transaction/status/execution-state/scheduling vocabulary at this boundary`);
        }

        const descriptorSource = await readFile(new URL('../application/PublicationDistributionDescriptor.js', import.meta.url), 'utf8');
        assert(!descriptorSource.includes('PublicationDistributionExecutor'), '47. the 0.9.44 descriptor itself is never modified to know about this executor');

        const uploaderSource = await readFile(new URL('../application/ArweavePublicationMaterialUploader.js', import.meta.url), 'utf8');
        assert(!uploaderSource.includes('PublicationDistributionExecutor'), '48. the 0.9.45 uploader itself is never modified to know about this executor');

        const publisherSource = await readFile(new URL('../application/NostrPublicationDiscoveryPublisher.js', import.meta.url), 'utf8');
        assert(!publisherSource.includes('PublicationDistributionExecutor'), '49. the 0.9.46 publisher itself is never modified to know about this executor');

        const compositionSource = await readFile(new URL('../application/PublicationDistributionRuntimeComposition.js', import.meta.url), 'utf8');
        assert(!compositionSource.includes('PublicationDistributionExecutor'), '50. the 0.9.47 composition itself is never modified to know about this executor');

        const resultSource = await readFile(new URL('../application/PublicationDistributionResult.js', import.meta.url), 'utf8');
        assert(!resultSource.includes('PublicationDistributionExecutor'), '51. the 0.9.48 result boundary itself is never modified to know about this executor');

        console.log('✓ Architectural regression: no transaction/rollback/status vocabulary, single envelope construction point, collaborators injected not imported, no existing file modified');
    }

    console.log('\nAll PublicationDistributionExecutor tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
