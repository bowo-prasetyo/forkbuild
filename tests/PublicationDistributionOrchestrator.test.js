import { readFile } from 'node:fs/promises';
import { orchestratePublicationDistribution } from '../application/PublicationDistributionOrchestrator.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { Signature } from '../core/Signature.js';

// 0.9.58 — Publication Decentralized Distribution Orchestrator.
// See docs/Roadmap.md, "0.9.58 — Publication Decentralized Distribution
// Orchestrator," for the full milestone story.
//
//   Section A: FLAGSHIP — one call, real 0.9.47 construction + real 0.9.49
//              sequencing, produces one complete PublicationDistributionResult
//              with all three identities (material uri, discovery tag,
//              relay origin) kept distinct
//   Section B: every call composes a fresh, independent runtime — no
//              caching, no shared state across calls
//   Section C: arweaveUploaderOptions/nostrPublisherOptions are forwarded
//              verbatim to 0.9.47's own composition, never reinterpreted
//   Section D: a construction failure (either collaborator) throws
//              synchronously, before any I/O
//   Section E: a genuine collaborator rejection propagates unchanged
//   Section F: DECLINE — an upload decline is forwarded through exactly as
//              0.9.49 itself already handles it; this file adds no
//              decline/stop-on-failure logic of its own
//   Section G: architectural regression — no re-implemented construction
//              or sequencing, no lifecycle/persistence imports, no
//              forbidden vocabulary, no existing file modified

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
        id: 'pub-orchestrator-1',
        documentId: 'doc-1',
        title: 'An Orchestrated Publication',
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

function makeFakeGateway({ handler }) {
    const requests = [];
    async function fetchImpl(url, options) {
        requests.push({ url, options });
        return handler(url, options);
    }
    return { requests, fetchImpl };
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
    // Section A — FLAGSHIP: one orchestrator call, real construction and
    // real sequencing, produces one complete distribution result.
    // ---------------------------------------------------------------
    {
        const transactionId = 'OrchestratorFlagshipTransactionId123456';
        const gateway = makeFakeGateway({ handler: () => gatewayResponse('accepted') });
        const relay = makeFakeRelay({ handler: () => ({ published: true, id: 'f'.repeat(64) }) });
        const signer = makeFakeSigner({ handler: () => ({ id: transactionId, transaction: { placeholder: true } }) });

        const publication = signedPublication();

        const result = await orchestratePublicationDistribution({
            publication,
            serializedMaterial: 'serialized orchestrated material',
            arweaveUploaderOptions: { signer, fetchImpl: gateway.fetchImpl },
            nostrPublisherOptions: { relayUrl: 'wss://relay.example', discoveryTag: 'forkbuild-orchestrator', publishImpl: relay.publishImpl }
        });

        assert(result !== null, '1. FLAGSHIP — one orchestrator call resolves to a real result');
        assert(result.publication.objectId === 'pub-orchestrator-1', '2. FLAGSHIP — result.publication.objectId is the publication\'s own id');

        assert(result.material.uri === `ar://${transactionId}`, '3. FLAGSHIP — result.material.uri is exactly what the freshly composed uploader produced');
        assert(result.material.storage === 'ar', '4. FLAGSHIP — result.material.storage is the uploader\'s own storage label');

        assert(result.discovery.discoveryTag === 'forkbuild-orchestrator', '5. FLAGSHIP — result.discovery.discoveryTag is exactly the configured discoveryTag');
        assert(result.discovery.relayUrl === 'wss://relay.example', '6. FLAGSHIP — result.discovery.relayUrl is exactly the configured relay');
        assert(result.discovery.id === 'f'.repeat(64), '7. FLAGSHIP — result.discovery.id is exactly the event id the relay reported');

        assert(
            result.material.uri !== result.discovery.discoveryTag &&
            result.discovery.discoveryTag !== result.discovery.relayUrl &&
            result.material.uri !== result.discovery.relayUrl,
            '8. FLAGSHIP — material uri, discovery tag, and relay origin remain three distinct identities'
        );

        assert(gateway.requests.length === 1, '9. FLAGSHIP — the gateway was contacted exactly once');
        assert(relay.calls.length === 1, '10. FLAGSHIP — the relay was contacted exactly once');
        const publishedEnvelope = JSON.parse(relay.calls[0].eventTemplate.content);
        assert(publishedEnvelope.uri === `ar://${transactionId}`, '11. FLAGSHIP — the envelope actually published names the real uploaded materialUri');

        console.log('✓ Flagship: one orchestratePublicationDistribution() call composes 0.9.47 and sequences 0.9.49 into one complete result');
    }

    // ---------------------------------------------------------------
    // Section B — every call composes a fresh, independent runtime.
    // ---------------------------------------------------------------
    {
        const callFor = async (transactionId, eventId, relayUrl) => {
            const gateway = makeFakeGateway({ handler: () => gatewayResponse('accepted') });
            const relay = makeFakeRelay({ handler: () => ({ published: true, id: eventId }) });
            const signer = makeFakeSigner({ handler: () => ({ id: transactionId, transaction: {} }) });
            return orchestratePublicationDistribution({
                publication: signedPublication(),
                serializedMaterial: 'material',
                arweaveUploaderOptions: { signer, fetchImpl: gateway.fetchImpl },
                nostrPublisherOptions: { relayUrl, discoveryTag: 'forkbuild', publishImpl: relay.publishImpl }
            });
        };

        const a = await callFor('TX-A-000000000000000000000000000000', '1'.repeat(64), 'wss://relay-a.example');
        const b = await callFor('TX-B-000000000000000000000000000000', '2'.repeat(64), 'wss://relay-b.example');

        assert(a.material.uri === 'ar://TX-A-000000000000000000000000000000', '12. call A produced exactly its own composed uploader\'s result');
        assert(b.material.uri === 'ar://TX-B-000000000000000000000000000000', '13. call B produced exactly its own composed uploader\'s result, independent of call A');
        assert(a.discovery.relayUrl === 'wss://relay-a.example' && b.discovery.relayUrl === 'wss://relay-b.example', '14. calls A and B were each sequenced against their own independently composed publisher, never a shared one');

        console.log('✓ Section B: every orchestratePublicationDistribution() call builds a fresh, independent runtime — no caching, no shared state');
    }

    // ---------------------------------------------------------------
    // Section C — arweaveUploaderOptions/nostrPublisherOptions are
    // forwarded verbatim to 0.9.47's own composition.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeGateway({ handler: () => gatewayResponse('ok') });
        const relay = makeFakeRelay({ handler: () => ({ published: true, id: '3'.repeat(64) }) });
        const signer = makeFakeSigner({ handler: () => ({ id: 'TX-CUSTOM', transaction: {} }) });

        const result = await orchestratePublicationDistribution({
            publication: signedPublication(),
            serializedMaterial: 'material',
            arweaveUploaderOptions: { signer, fetchImpl: gateway.fetchImpl, gatewayUrl: 'https://custom-gateway.example' },
            nostrPublisherOptions: { relayUrl: 'wss://custom-relay.example', discoveryTag: 'custom-tag', tagName: 'custom-tag-name', kind: 30078, publishImpl: relay.publishImpl }
        });

        assert(gateway.requests[0].url === 'https://custom-gateway.example/tx', '15. a custom gatewayUrl reaches the composed uploader unmodified');
        assert(relay.calls[0].relayUrl === 'wss://custom-relay.example', '16. a custom relayUrl reaches the composed publisher unmodified');
        assert(relay.calls[0].eventTemplate.kind === 30078, '17. a custom kind reaches the composed publisher unmodified');
        assert(relay.calls[0].eventTemplate.tags[0][0] === 'custom-tag-name', '18. a custom tagName reaches the composed publisher unmodified');
        assert(result.discovery.discoveryTag === 'custom-tag', '19. a custom discoveryTag rides through to the final result unmodified');

        console.log('✓ Section C: arweaveUploaderOptions and nostrPublisherOptions are forwarded verbatim to 0.9.47\'s own composition, never reinterpreted here');
    }

    // ---------------------------------------------------------------
    // Section D — a construction failure throws synchronously, before
    // any I/O, exactly where 0.9.47's own composed constructors throw.
    // ---------------------------------------------------------------
    {
        expectThrows(
            () => orchestratePublicationDistribution({
                publication: signedPublication(),
                serializedMaterial: 'material',
                arweaveUploaderOptions: { fetchImpl: async () => gatewayResponse('ok') },
                nostrPublisherOptions: { discoveryTag: 'forkbuild', publishImpl: async () => ({ published: true, id: '4'.repeat(64) }) }
            }),
            '20. a missing Arweave signer throws synchronously at orchestration time'
        );
        expectThrows(
            () => orchestratePublicationDistribution({
                publication: signedPublication(),
                serializedMaterial: 'material',
                arweaveUploaderOptions: { signer: makeFakeSigner(), fetchImpl: async () => gatewayResponse('ok') },
                nostrPublisherOptions: { publishImpl: async () => ({ published: true, id: '5'.repeat(64) }) }
            }),
            '21. a missing Nostr discoveryTag throws synchronously at orchestration time'
        );
        expectThrows(
            () => orchestratePublicationDistribution({
                publication: signedPublication(),
                serializedMaterial: 'material',
                arweaveUploaderOptions: { signer: makeFakeSigner(), fetchImpl: async () => gatewayResponse('ok') },
                nostrPublisherOptions: { discoveryTag: 'forkbuild' }
            }),
            '22. a missing Nostr publishImpl throws synchronously at orchestration time'
        );

        console.log('✓ Section D: a malformed arweaveUploaderOptions/nostrPublisherOptions throws synchronously, before any collaborator is ever called');
    }

    // ---------------------------------------------------------------
    // Section E — a genuine collaborator rejection propagates unchanged.
    // ---------------------------------------------------------------
    {
        await expectRejects(
            orchestratePublicationDistribution({
                publication: signedPublication(),
                serializedMaterial: 'material',
                arweaveUploaderOptions: { signer: { sign: async () => { throw new Error('no wallet available'); } }, fetchImpl: async () => gatewayResponse('ok') },
                nostrPublisherOptions: { discoveryTag: 'forkbuild', publishImpl: async () => ({ published: true, id: '6'.repeat(64) }) }
            }),
            '23. a genuine upload rejection propagates rather than degrading to a null material section'
        );

        await expectRejects(
            orchestratePublicationDistribution({
                publication: signedPublication(),
                serializedMaterial: 'material',
                arweaveUploaderOptions: { signer: makeFakeSigner(), fetchImpl: async () => gatewayResponse('ok') },
                nostrPublisherOptions: { discoveryTag: 'forkbuild', publishImpl: async () => { throw new Error('relay unreachable'); } }
            }),
            '24. a genuine publish rejection propagates rather than degrading to a null discovery section'
        );

        console.log('✓ Section E: genuine collaborator rejections propagate unchanged through the orchestrator');
    }

    // ---------------------------------------------------------------
    // Section F — DECLINE: an upload decline is forwarded through
    // exactly as 0.9.49 already handles it — no re-implemented
    // stop-on-failure logic here.
    // ---------------------------------------------------------------
    {
        const relay = makeFakeRelay({ handler: () => ({ published: true, id: '8'.repeat(64) }) });

        const result = await orchestratePublicationDistribution({
            publication: signedPublication(),
            serializedMaterial: 'material',
            arweaveUploaderOptions: { signer: makeFakeSigner(), fetchImpl: async () => gatewayResponse('material declined', { status: 402 }) },
            nostrPublisherOptions: { discoveryTag: 'forkbuild', publishImpl: relay.publishImpl }
        });

        assert(result !== null, '25. DECLINE — an upload decline still produces a describable result, exactly as 0.9.49 itself already produces');
        assert(result.material === null, '26. DECLINE — material is null when the upload declined');
        assert(result.discovery === null, '27. DECLINE — discovery is null; the descriptor and publisher were never reached');
        assert(relay.calls.length === 0, '28. DECLINE — the relay was never contacted after the upload declined');

        console.log('✓ Section F: an upload decline is forwarded through to 0.9.49\'s own stop-on-failure sequencing, unmodified by this file');
    }

    // ---------------------------------------------------------------
    // Section G — architectural regression.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/PublicationDistributionOrchestrator.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!codeOnly.includes('ArweavePublicationMaterialUploader'), '29. never imports the concrete Arweave uploader — construction stays entirely 0.9.47\'s own');
        assert(!codeOnly.includes('NostrPublicationDiscoveryPublisher'), '30. never imports the concrete Nostr publisher — construction stays entirely 0.9.47\'s own');
        assert(!codeOnly.includes('PublicationDistributionDescriptor'), '31. never imports the descriptor module directly — it arrives only via the composed runtime');
        assert(!codeOnly.includes('DecentralizedDiscoveryEnvelope'), '32. never imports the discovery envelope module — envelope shape stays entirely 0.9.44\'s own concern');
        assert(!codeOnly.includes('PublicationDistributionResult'), '33. never imports the result boundary directly — the result stays entirely whatever 0.9.49 already produced');
        assert(!codeOnly.includes('PublicationDistributionLifecycle'), '34. never imports any lifecycle module — lifecycle stays a separate, later caller concern');
        assert(!codeOnly.includes('Persistence'), '35. never imports any persistence module');
        assert(!codeOnly.includes('MemoryStore'), '36. never imports the lifecycle memory store');
        assert(!codeOnly.includes('Restorer'), '37. never imports the lifecycle restorer');
        assert(!codeOnly.includes('Hydration'), '38. never imports lifecycle hydration');
        assert(!/\bfetch\(/.test(codeOnly), '39. never calls fetch(...) directly — no network access of its own, only through the composed runtime');
        assert(!codeOnly.includes('WebSocket'), '40. never references WebSocket directly');
        assert(!codeOnly.includes('new ArweavePublicationMaterialUploader') && !codeOnly.includes('new NostrPublicationDiscoveryPublisher'), '41. never constructs either concrete collaborator itself — that stays entirely 0.9.47\'s own job');
        assert(!/\btry\s*{/.test(codeOnly), '42. no try/catch anywhere — a genuine construction or collaborator failure is never caught here, only forwarded');
        assert((codeOnly.match(/\bexport\s+(async\s+)?function\b/g) || []).length === 1, '43. exports exactly one function — no second entry point');

        const forbiddenTerms = ['rollback', 'compensate', 'compensation', 'transaction', 'retry', 'cache', 'dedup', 'status', 'success', 'failed', 'failure', 'pending', 'trusted', 'reputation', 'weight', 'confidence', 'ranking', 'scoring', 'preferred', 'queue', 'schedule'];
        for (const term of forbiddenTerms) {
            assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `44. code must never use "${term}" — no transaction/status/execution-state/scheduling vocabulary at this boundary`);
        }

        const compositionSource = await readFile(new URL('../application/PublicationDistributionRuntimeComposition.js', import.meta.url), 'utf8');
        assert(!compositionSource.includes('PublicationDistributionOrchestrator'), '45. the 0.9.47 composition itself is never modified to know about this orchestrator');

        const executorSource = await readFile(new URL('../application/PublicationDistributionExecutor.js', import.meta.url), 'utf8');
        assert(!executorSource.includes('PublicationDistributionOrchestrator'), '46. the 0.9.49 executor itself is never modified to know about this orchestrator');

        console.log('✓ Architectural regression: no re-implemented construction/sequencing, no lifecycle/persistence imports, no forbidden vocabulary, exactly one export');
    }

    console.log('\nAll PublicationDistributionOrchestrator tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
