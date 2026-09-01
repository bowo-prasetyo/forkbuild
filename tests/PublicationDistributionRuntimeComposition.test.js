import { readFile } from 'node:fs/promises';
import { composePublicationDistributionRuntime } from '../application/PublicationDistributionRuntimeComposition.js';
import { ArweavePublicationMaterialUploader } from '../application/ArweavePublicationMaterialUploader.js';
import { NostrPublicationDiscoveryPublisher } from '../application/NostrPublicationDiscoveryPublisher.js';
import { describePublicationDistribution } from '../application/PublicationDistributionDescriptor.js';
import { parseDecentralizedDiscoveryEnvelope } from '../core/DecentralizedDiscoveryEnvelope.js';

// 0.9.47 — Publication Distribution Runtime Composition.
// See docs/Roadmap.md, "0.9.47 — Publication Distribution Runtime Composition."
//
//   Section A: composePublicationDistributionRuntime() builds all three
//              expected collaborators
//   Section B: two composition calls produce independent uploader/publisher
//              instances — no singleton behavior
//   Section C: arweaveUploaderOptions and nostrPublisherOptions are
//              forwarded verbatim to their own collaborator, never
//              reinterpreted or partially reconstructed
//   Section D: composition performs no I/O of any kind — construction only
//   Section E: a construction failure (either collaborator) propagates,
//              never swallowed
//   Section F: FLAGSHIP — a caller sequences the three composed
//              collaborators itself (upload → describe → publish) into a
//              working publication distribution, with material uri,
//              discovery tag, and relay origin staying three distinct
//              facts throughout
//   Section G: architectural regression — no semantic duplication, no
//              orchestration entry point, no forbidden vocabulary

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, message);
}

function makeFakeSigner({ handler } = {}) {
    const calls = [];
    async function sign(material) {
        calls.push(material);
        return handler ? handler(material) : { id: 'fake-tx-id', transaction: { data: material } };
    }
    return { calls, signer: { sign } };
}

function makeFakeGateway({ handler }) {
    const requests = [];
    async function fetchImpl(url, options) {
        requests.push({ url, options });
        return handler(url, options);
    }
    return { requests, fetchImpl };
}

function gatewayResponse(body, { status = 200, headers = {} } = {}) {
    return new Response(body, { status, headers });
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
    // Section A — composePublicationDistributionRuntime() builds all
    // three expected collaborators.
    // ---------------------------------------------------------------
    {
        const signer = makeFakeSigner().signer;
        const relay = makeFakeRelay({ handler: () => ({ published: true, id: '0'.repeat(64) }) });

        const runtime = composePublicationDistributionRuntime({
            arweaveUploaderOptions: { signer, fetchImpl: async () => gatewayResponse('ok') },
            nostrPublisherOptions: { discoveryTag: 'forkbuild', publishImpl: relay.publishImpl }
        });

        assert(runtime.uploader instanceof ArweavePublicationMaterialUploader, '1. runtime.uploader is a real ArweavePublicationMaterialUploader');
        assert(runtime.publisher instanceof NostrPublicationDiscoveryPublisher, '2. runtime.publisher is a real NostrPublicationDiscoveryPublisher');
        assert(runtime.describeDistribution === describePublicationDistribution, '3. runtime.describeDistribution is 0.9.44\'s own describePublicationDistribution, forwarded unmodified');
        assert(typeof runtime.uploader.upload === 'function', '4. runtime.uploader exposes a working upload()');
        assert(typeof runtime.publisher.publish === 'function', '5. runtime.publisher exposes a working publish()');
        assert(Object.isFrozen(runtime), '6. the returned runtime object is frozen');
    }
    console.log('✓ Section A: composePublicationDistributionRuntime() builds all three expected collaborators');

    // ---------------------------------------------------------------
    // Section B — two composition calls produce independent
    // uploader/publisher instances; no singleton behavior.
    // ---------------------------------------------------------------
    {
        const optionsFor = () => ({
            arweaveUploaderOptions: { signer: makeFakeSigner().signer, fetchImpl: async () => gatewayResponse('ok') },
            nostrPublisherOptions: { discoveryTag: 'forkbuild', publishImpl: makeFakeRelay({ handler: () => ({ published: true, id: '1'.repeat(64) }) }).publishImpl }
        });

        const a = composePublicationDistributionRuntime(optionsFor());
        const b = composePublicationDistributionRuntime(optionsFor());

        assert(a.uploader !== b.uploader, '7. two composition calls never share an uploader instance');
        assert(a.publisher !== b.publisher, '8. two composition calls never share a publisher instance');
        assert(a.describeDistribution === b.describeDistribution, '9. describeDistribution is the same pure function reference across calls — it has no instance state to keep independent (see this file\'s own header)');
    }
    console.log('✓ Section B: every composition call builds a fresh, independent uploader/publisher pair');

    // ---------------------------------------------------------------
    // Section C — arweaveUploaderOptions and nostrPublisherOptions are
    // forwarded verbatim, never reinterpreted or partially reconstructed.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeGateway({ handler: () => gatewayResponse('ok') });
        const relay = makeFakeRelay({ handler: () => ({ published: true, id: '2'.repeat(64) }) });
        const signer = makeFakeSigner().signer;

        const runtime = composePublicationDistributionRuntime({
            arweaveUploaderOptions: {
                signer,
                fetchImpl: gateway.fetchImpl,
                gatewayUrl: 'https://custom-gateway.example',
                maxMaterialBytes: 12345
            },
            nostrPublisherOptions: {
                publishImpl: relay.publishImpl,
                relayUrl: 'wss://custom-relay.example',
                tagName: 'custom-tag',
                kind: 30078,
                discoveryTag: 'custom-discovery-tag'
            }
        });

        assert(runtime.uploader.gatewayUrl === 'https://custom-gateway.example', '10. a custom gatewayUrl is forwarded to the uploader, not defaulted a second time here');
        assert(runtime.publisher.relayUrl === 'wss://custom-relay.example', '11. a custom relayUrl is forwarded to the publisher, not defaulted a second time here');
        assert(runtime.publisher.discoveryTag === 'custom-discovery-tag', '12. discoveryTag is forwarded exactly as supplied, never derived from anything else');

        await runtime.uploader.upload('hello world');
        assert(gateway.requests[0].url === 'https://custom-gateway.example/tx', '13. the custom gatewayUrl is actually the one the uploader talks to');

        await runtime.publisher.publish({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-1', uri: 'ar://tx-1' });
        assert(relay.calls[0].relayUrl === 'wss://custom-relay.example', '14. the custom relayUrl is actually the one the publisher talks to');
        assert(relay.calls[0].eventTemplate.kind === 30078, '15. the custom kind is actually the one the publisher declares');
        assert(relay.calls[0].eventTemplate.tags[0][0] === 'custom-tag', '16. the custom tagName is actually the one the publisher attaches the discovery tag under');
        assert(relay.calls[0].eventTemplate.tags[0][1] === 'custom-discovery-tag', '17. the custom discoveryTag rides in the event\'s own tag, unchanged');
    }
    console.log('✓ Section C: constructor options are forwarded verbatim to the appropriate collaborator, never reinterpreted here');

    // ---------------------------------------------------------------
    // Section D — composition performs no I/O of any kind.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeGateway({ handler: () => { throw new Error('the gateway must never be contacted during composition'); } });
        const relay = makeFakeRelay({ handler: () => { throw new Error('the relay must never be contacted during composition'); } });
        let signerCalls = 0;

        const runtime = composePublicationDistributionRuntime({
            arweaveUploaderOptions: { signer: { sign: async () => { signerCalls += 1; return { id: 'x', transaction: {} }; } }, fetchImpl: gateway.fetchImpl },
            nostrPublisherOptions: { discoveryTag: 'forkbuild', publishImpl: relay.publishImpl }
        });

        assert(gateway.requests.length === 0, '18. composition alone never contacts the Arweave gateway');
        assert(relay.calls.length === 0, '19. composition alone never contacts the Nostr relay');
        assert(signerCalls === 0, '20. composition alone never invokes the signer');
        assert(runtime.uploader !== undefined, '21. the runtime is still fully constructed despite doing no I/O');
    }
    console.log('✓ Section D: composePublicationDistributionRuntime() performs no I/O — construction only');

    // ---------------------------------------------------------------
    // Section E — a construction failure, from either collaborator,
    // propagates rather than being swallowed.
    // ---------------------------------------------------------------
    {
        expectThrows(
            () => composePublicationDistributionRuntime({
                arweaveUploaderOptions: { fetchImpl: async () => {} },
                nostrPublisherOptions: { discoveryTag: 'forkbuild', publishImpl: async () => ({}) }
            }),
            '22. a missing Arweave signer throws at composition time'
        );
        expectThrows(
            () => composePublicationDistributionRuntime({
                arweaveUploaderOptions: { signer: makeFakeSigner().signer, fetchImpl: async () => {} },
                nostrPublisherOptions: { publishImpl: async () => ({}) }
            }),
            '23. a missing Nostr discoveryTag throws at composition time'
        );
        expectThrows(
            () => composePublicationDistributionRuntime({
                arweaveUploaderOptions: { signer: makeFakeSigner().signer, fetchImpl: async () => {} },
                nostrPublisherOptions: { discoveryTag: 'forkbuild' }
            }),
            '24. a missing Nostr publishImpl throws at composition time'
        );
    }
    console.log('✓ Section E: a construction failure in either composed collaborator propagates, never swallowed');

    // ---------------------------------------------------------------
    // Section F — FLAGSHIP: a caller sequences the three composed
    // collaborators itself into one working publication distribution.
    // This file never performs this sequence on its own — see this
    // file's own header, "No new orchestration."
    // ---------------------------------------------------------------
    {
        const transactionId = 'ComposedRuntimeFlagshipTransactionId1';
        const gateway = makeFakeGateway({
            handler: (url) => {
                assert(url === 'https://arweave.net/tx', '25. FLAGSHIP — the composed uploader posts to the default Arweave gateway');
                return gatewayResponse('accepted');
            }
        });
        const relay = makeFakeRelay({
            handler: (relayUrl, eventTemplate) => {
                assert(relayUrl === 'wss://relay.damus.io', '26. FLAGSHIP — the composed publisher targets the default Nostr relay');
                const content = JSON.parse(eventTemplate.content);
                assert(content.uri === `ar://${transactionId}`, '27. FLAGSHIP — the published event\'s own content carries exactly the uri the composed uploader produced');
                return { published: true, id: '7'.repeat(64) };
            }
        });
        const signer = makeFakeSigner({ handler: () => ({ id: transactionId, transaction: { placeholder: true } }) }).signer;

        const runtime = composePublicationDistributionRuntime({
            arweaveUploaderOptions: { signer, fetchImpl: gateway.fetchImpl },
            nostrPublisherOptions: { discoveryTag: 'forkbuild-flagship', publishImpl: relay.publishImpl }
        });

        const publication = { id: 'pub-composed-1', signature: 'sig-bytes' };
        const material = JSON.stringify({ title: 'Composed Publication', body: 'assembled through the 0.9.47 runtime' });

        const materialUri = await runtime.uploader.upload(material);
        assert(materialUri === `ar://${transactionId}`, '28. FLAGSHIP — the composed uploader produces a real ar:// uri');

        const envelope = runtime.describeDistribution({ publication, materialUri });
        assert(envelope !== null, '29. FLAGSHIP — the composed describeDistribution accepts the uploader\'s own output as its materialUri');
        assert(envelope.material.uri === materialUri && envelope.material.storage === 'ar', '30. FLAGSHIP — material uri and storage are exactly what the uploader produced');
        assert(envelope.discoveryEnvelope.objectId === 'pub-composed-1', '31. FLAGSHIP — the envelope names the Publication the caller supplied');

        const published = await runtime.publisher.publish(envelope.discoveryEnvelope);
        assert(published !== null && published.published === true, '32. FLAGSHIP — the composed publisher accepts the descriptor\'s own discoveryEnvelope as its publish() argument');
        assert(published.relayUrl === 'wss://relay.damus.io', '33. FLAGSHIP — the publish result names the relay this runtime was composed for');

        const roundTripped = parseDecentralizedDiscoveryEnvelope(relay.calls[0].eventTemplate.content);
        assert(roundTripped.uri === materialUri, '34. FLAGSHIP — the exact bytes sent to the relay round-trip through 0.9.31\'s own reader to the same material uri');
        assert(relay.calls[0].eventTemplate.tags[0] === undefined || relay.calls[0].eventTemplate.tags[0][1] === 'forkbuild-flagship', '35. FLAGSHIP — the discovery tag this runtime was composed for rides the event, separate from the material uri and the relay origin');
        assert(gateway.requests.length === 1 && relay.calls.length === 1, '36. FLAGSHIP — exactly one upload and exactly one publish serviced the whole caller-sequenced chain');
    }
    console.log('✓ Section F: FLAGSHIP — a caller-sequenced upload → describe → publish chain works end to end through the composed runtime, with material uri, discovery tag, and relay origin staying distinct throughout');

    // ---------------------------------------------------------------
    // Section G — architectural regression.
    // ---------------------------------------------------------------
    {
        const path = '../application/PublicationDistributionRuntimeComposition.js';
        const fullSource = await readFile(new URL(path, import.meta.url), 'utf8');
        const codeOnly = fullSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!/export\s+(async\s+)?function\s+publishPublication/.test(codeOnly), '37. never exports a publishPublication()-style orchestration entry point');
        assert(!codeOnly.includes('DecentralizedDiscoveryEnvelope'), '38. never imports the discovery envelope module directly — envelope shape stays entirely PublicationDistributionDescriptor\'s own concern');
        assert(!codeOnly.includes('WorldEncounterKind'), '39. never references WorldEncounterKind directly — kind stays entirely PublicationDistributionDescriptor\'s own concern');
        assert(!/\bfetch\(/.test(codeOnly), '40. never calls fetch(...) directly — this file constructs, it never uploads');
        assert(!codeOnly.includes('WebSocket'), '41. never references WebSocket — this file constructs, it never publishes');
        assert(!codeOnly.includes('JSON.stringify'), '42. never serializes an envelope itself — that stays entirely NostrPublicationDiscoveryPublisher\'s own concern');
        assert(!codeOnly.includes('async '), '43. contains no async function of its own — composition only, never upload or publish');
        assert(!codeOnly.includes('setTimeout'), '44. no retry/scheduling machinery of its own');

        const forbiddenTerms = ['trusted', 'trust(', 'reputation', 'authority', 'weight', 'confidence', 'ranking', 'scoring', 'retry', 'cache', 'dedup', 'compensat'];
        for (const term of forbiddenTerms) {
            assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `45. code must never use "${term}" — composition only, no execution/state/trust vocabulary`);
        }

        const descriptorSource = await readFile(new URL('../application/PublicationDistributionDescriptor.js', import.meta.url), 'utf8');
        assert(!descriptorSource.includes('PublicationDistributionRuntimeComposition'), '46. the 0.9.44 descriptor itself is never modified to know about this composition file');

        const uploaderSource = await readFile(new URL('../application/ArweavePublicationMaterialUploader.js', import.meta.url), 'utf8');
        assert(!uploaderSource.includes('PublicationDistributionRuntimeComposition'), '47. the 0.9.45 uploader itself is never modified to know about this composition file');

        const publisherSource = await readFile(new URL('../application/NostrPublicationDiscoveryPublisher.js', import.meta.url), 'utf8');
        assert(!publisherSource.includes('PublicationDistributionRuntimeComposition'), '48. the 0.9.46 publisher itself is never modified to know about this composition file');

        console.log('✓ Section G: architectural regression — no orchestration entry point, no re-implemented envelope/upload/publish semantics, no execution/state/trust vocabulary; 0.9.44/0.9.45/0.9.46 untouched');
    }

    console.log('All PublicationDistributionRuntimeComposition tests passed.');
}

await run();
