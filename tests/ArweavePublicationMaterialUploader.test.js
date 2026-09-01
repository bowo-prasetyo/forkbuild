import { readFile } from 'node:fs/promises';
import { ArweavePublicationMaterialUploader } from '../application/ArweavePublicationMaterialUploader.js';
import { describePublicationDistribution } from '../application/PublicationDistributionDescriptor.js';

// 0.9.45 — Arweave Publication Material Uploader.
// See docs/Roadmap.md, "0.9.45 — Arweave Publication Material Uploader."
//
// Deterministic, network-free coverage of application/
// ArweavePublicationMaterialUploader.js's own wire behavior — every
// scenario below runs against an injected `signer` and an injected
// `fetchImpl` standing in for a real wallet and a real Arweave gateway,
// never either live one, the identical technique tests/
// ArweaveWorldEncounterMaterialResolver.test.js already established for
// this exact substrate's own read side.
//
//   Section A: flagship — material uploads and resolves to ar://<id>
//   Section B: the signed transaction is POSTed to <gatewayUrl>/tx, not
//              the raw material
//   Section C: malformed material (missing/non-string/empty) resolves to
//              null, the signer and gateway are never consulted
//   Section D: material exceeding maxMaterialBytes resolves to null, the
//              signer and gateway are never consulted
//   Section E: a genuine signer failure propagates, never swallowed as
//              null
//   Section F: a genuine fetch/HTTP failure propagates; a non-2xx
//              gateway response is a clean null instead
//   Section G: a signer that resolves but violates its own contract
//              throws — never degrades to null
//   Section H: an oversized gateway response is rejected — by
//              Content-Length and, independently, by actual decoded body
//              size
//   Section I: the injected fetchImpl is actually what is used — no
//              fallback to a real network call
//   Section J: no caching — two calls for the same material issue two
//              fresh sign+upload cycles
//   Section K: the resulting uri composes directly as
//              PublicationDistributionDescriptor's own materialUri
//   Section L: architectural regression — no forbidden imports/vocabulary

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, message);
}

async function expectRejects(promise, message) {
    let rejected = false;
    try { await promise; } catch { rejected = true; }
    assert(rejected, message);
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

async function run() {
    // ---------------------------------------------------------------
    // Section A — flagship: material uploads and resolves to ar://<id>.
    // ---------------------------------------------------------------
    {
        const { signer } = makeFakeSigner({ handler: () => ({ id: 'tx-abc123', transaction: { data: 'signed-bytes' } }) });
        const gateway = makeFakeGateway({ handler: () => gatewayResponse('OK') });
        const uploader = new ArweavePublicationMaterialUploader({ signer, fetchImpl: gateway.fetchImpl });

        const uri = await uploader.upload('{"id":"pub-1","title":"Hello, decentralized world."}');
        assert(uri === 'ar://tx-abc123', '1. FLAGSHIP — a successful upload resolves to ar://<id>, using the signer\'s own id');
        assert(uploader.storage === 'ar', '2. FLAGSHIP — storage is always "ar"');
    }
    console.log('✓ Section A: material uploads and resolves to ar://<id>');

    // ---------------------------------------------------------------
    // Section B — the signed transaction is POSTed to <gatewayUrl>/tx,
    // not the raw material.
    // ---------------------------------------------------------------
    {
        const { signer } = makeFakeSigner({ handler: (material) => ({ id: 'tx-posted', transaction: { data: material, wrapped: true } }) });
        const gateway = makeFakeGateway({ handler: () => gatewayResponse('OK') });
        const uploader = new ArweavePublicationMaterialUploader({ signer, fetchImpl: gateway.fetchImpl, gatewayUrl: 'https://custom-gateway.example' });

        await uploader.upload('raw-material-text');
        assert(gateway.requests.length === 1, '3. exactly one request is made per upload() call');
        assert(gateway.requests[0].url === 'https://custom-gateway.example/tx', '4. the request targets <gatewayUrl>/tx');
        assert(gateway.requests[0].options.method === 'POST', '5. the request uses POST');
        const postedBody = JSON.parse(gateway.requests[0].options.body);
        assert(postedBody.wrapped === true && postedBody.data === 'raw-material-text', '6. the POST body is the signer\'s own transaction, never the raw material directly');
    }
    console.log('✓ Section B: the signed transaction, not the raw material, is POSTed to <gatewayUrl>/tx');

    // ---------------------------------------------------------------
    // Section C — malformed material resolves to null, the signer and
    // gateway are never consulted.
    // ---------------------------------------------------------------
    {
        const { signer, calls } = makeFakeSigner();
        const gateway = makeFakeGateway({ handler: () => gatewayResponse('OK') });
        const uploader = new ArweavePublicationMaterialUploader({ signer, fetchImpl: gateway.fetchImpl });

        for (const material of ['', null, undefined, 42, {}, []]) {
            const result = await uploader.upload(material);
            assert(result === null, `7. malformed material ${JSON.stringify(material)} resolves to null`);
        }
        assert(calls.length === 0, '8. the signer is never consulted for malformed material');
        assert(gateway.requests.length === 0, '9. the gateway is never consulted for malformed material');
    }
    console.log('✓ Section C: malformed material resolves to null without consulting the signer or gateway');

    // ---------------------------------------------------------------
    // Section D — material exceeding maxMaterialBytes resolves to null,
    // the signer and gateway are never consulted.
    // ---------------------------------------------------------------
    {
        const { signer, calls } = makeFakeSigner();
        const gateway = makeFakeGateway({ handler: () => gatewayResponse('OK') });
        const uploader = new ArweavePublicationMaterialUploader({ signer, fetchImpl: gateway.fetchImpl, maxMaterialBytes: 16 });

        const result = await uploader.upload('this material is definitely longer than sixteen bytes');
        assert(result === null, '10. material exceeding maxMaterialBytes resolves to null');
        assert(calls.length === 0, '11. the signer is never consulted for oversized material');
        assert(gateway.requests.length === 0, '12. the gateway is never consulted for oversized material');

        const withinCeiling = new ArweavePublicationMaterialUploader({ signer, fetchImpl: gateway.fetchImpl, maxMaterialBytes: 1024 });
        const okResult = await withinCeiling.upload('short');
        assert(okResult !== null, '13. material within maxMaterialBytes still uploads normally');
    }
    console.log('✓ Section D: material exceeding maxMaterialBytes resolves to null without consulting the signer or gateway');

    // ---------------------------------------------------------------
    // Section E — a genuine signer failure propagates, never swallowed
    // as null.
    // ---------------------------------------------------------------
    {
        const failingSigner = { sign: async () => { throw new Error('simulated locked keystore'); } };
        const gateway = makeFakeGateway({ handler: () => gatewayResponse('OK') });
        const uploader = new ArweavePublicationMaterialUploader({ signer: failingSigner, fetchImpl: gateway.fetchImpl });

        await expectRejects(uploader.upload('material'), '14. a genuine signer failure propagates as a rejection, never swallowed as null');
        assert(gateway.requests.length === 0, '15. the gateway is never reached once signing itself failed');
    }
    console.log('✓ Section E: a genuine signer failure propagates rather than degrading to null');

    // ---------------------------------------------------------------
    // Section F — a genuine fetch/HTTP failure propagates; a non-2xx
    // gateway response is a clean null instead.
    // ---------------------------------------------------------------
    {
        const { signer } = makeFakeSigner();
        const failingGateway = makeFakeGateway({ handler: () => { throw new Error('simulated connection failure'); } });
        const uploader = new ArweavePublicationMaterialUploader({ signer, fetchImpl: failingGateway.fetchImpl });
        await expectRejects(uploader.upload('material'), '16. a genuine fetch failure propagates as a rejection, never swallowed as null');

        const { signer: signer2 } = makeFakeSigner();
        const rejectingGateway = makeFakeGateway({ handler: () => gatewayResponse('quota exceeded', { status: 429 }) });
        const uploader2 = new ArweavePublicationMaterialUploader({ signer: signer2, fetchImpl: rejectingGateway.fetchImpl });
        const declined = await uploader2.upload('material');
        assert(declined === null, '17. a non-2xx gateway response degrades to null, not a throw');
    }
    console.log('✓ Section F: a genuine fetch failure propagates; a non-2xx response degrades to null');

    // ---------------------------------------------------------------
    // Section G — a signer that resolves but violates its own contract
    // throws, never degrades to null.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeGateway({ handler: () => gatewayResponse('OK') });

        const noId = { sign: async () => ({ transaction: { data: 'x' } }) };
        await expectRejects(new ArweavePublicationMaterialUploader({ signer: noId, fetchImpl: gateway.fetchImpl }).upload('material'), '18. a signer resolving with no id throws rather than returning null');

        const malformedId = { sign: async () => ({ id: 'has a space', transaction: { data: 'x' } }) };
        await expectRejects(new ArweavePublicationMaterialUploader({ signer: malformedId, fetchImpl: gateway.fetchImpl }).upload('material'), '19. a signer resolving with a malformed id (failing the transaction-id charset) throws rather than returning null');

        const noTransaction = { sign: async () => ({ id: 'valid-id-123' }) };
        await expectRejects(new ArweavePublicationMaterialUploader({ signer: noTransaction, fetchImpl: gateway.fetchImpl }).upload('material'), '20. a signer resolving with no transaction at all throws rather than returning null');

        assert(gateway.requests.length === 0, '21. the gateway is never reached once the signer\'s own contract was violated');
    }
    console.log('✓ Section G: a signer violating its own { id, transaction } contract throws, never degrades to null');

    // ---------------------------------------------------------------
    // Section H — an oversized gateway response is rejected, both by
    // Content-Length and by actual decoded body size.
    // ---------------------------------------------------------------
    {
        const oversizedBody = 'x'.repeat(200);

        const { signer: signerA } = makeFakeSigner();
        const byDeclaredLength = makeFakeGateway({
            handler: () => gatewayResponse(oversizedBody, { headers: { 'content-length': String(oversizedBody.length) } })
        });
        const uploaderByLength = new ArweavePublicationMaterialUploader({ signer: signerA, fetchImpl: byDeclaredLength.fetchImpl, maxResponseBytes: 32 });
        const resultByLength = await uploaderByLength.upload('material');
        assert(resultByLength === null, '23. a response whose declared Content-Length exceeds the ceiling is rejected');

        const { signer: signerB } = makeFakeSigner();
        const withoutDeclaredLength = makeFakeGateway({
            handler: () => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => oversizedBody })
        });
        const uploaderNoHeader = new ArweavePublicationMaterialUploader({ signer: signerB, fetchImpl: withoutDeclaredLength.fetchImpl, maxResponseBytes: 32 });
        const resultNoHeader = await uploaderNoHeader.upload('material');
        assert(resultNoHeader === null, '24. a response with no usable Content-Length is still rejected once its actual decoded size exceeds the ceiling');

        const { signer: signerC } = makeFakeSigner({ handler: () => ({ id: 'tx-within-ceiling', transaction: {} }) });
        const withinCeiling = makeFakeGateway({ handler: () => gatewayResponse('ok') });
        const uploaderWithinCeiling = new ArweavePublicationMaterialUploader({ signer: signerC, fetchImpl: withinCeiling.fetchImpl, maxResponseBytes: 1024 });
        const resultWithinCeiling = await uploaderWithinCeiling.upload('material');
        assert(resultWithinCeiling === 'ar://tx-within-ceiling', '25. a response within the ceiling still uploads normally');
    }
    console.log('✓ Section H: an oversized gateway response is rejected by declared and by actual size');

    // ---------------------------------------------------------------
    // Section I — the injected fetchImpl is actually what is used.
    // ---------------------------------------------------------------
    {
        let realFetchCalled = false;
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async () => { realFetchCalled = true; return gatewayResponse('OK'); };
        try {
            const { signer } = makeFakeSigner({ handler: () => ({ id: 'via-injected-fetch', transaction: {} }) });
            const gateway = makeFakeGateway({ handler: () => gatewayResponse('OK') });
            const uploader = new ArweavePublicationMaterialUploader({ signer, fetchImpl: gateway.fetchImpl });
            const uri = await uploader.upload('material');
            assert(uri === 'ar://via-injected-fetch', '26. the injected fetchImpl, not the global fetch, is used when supplied');
            assert(!realFetchCalled, '27. the global fetch is never called when an explicit fetchImpl is injected');
        } finally {
            globalThis.fetch = originalFetch;
        }

        expectThrows(() => new ArweavePublicationMaterialUploader({ signer: makeFakeSigner().signer, fetchImpl: 'not-a-function' }), '28. a non-function fetchImpl falls through to requiring a real fetch implementation');
        expectThrows(() => new ArweavePublicationMaterialUploader({ signer: null }), '29. a missing signer throws at construction time');
        expectThrows(() => new ArweavePublicationMaterialUploader({ signer: { sign: 'not-a-function' } }), '30. a signer with no sign() method throws at construction time');
    }
    console.log('✓ Section I: the injected fetchImpl is what actually uploads material, never a real network call');

    // ---------------------------------------------------------------
    // Section J — no caching: two calls issue two fresh sign+upload
    // cycles.
    // ---------------------------------------------------------------
    {
        let callCount = 0;
        const signer = { sign: async () => { callCount++; return { id: `tx-call-${callCount}`, transaction: { callCount } }; } };
        const gateway = makeFakeGateway({ handler: () => gatewayResponse('OK') });
        const uploader = new ArweavePublicationMaterialUploader({ signer, fetchImpl: gateway.fetchImpl });

        const first = await uploader.upload('material');
        const second = await uploader.upload('material');
        assert(first === 'ar://tx-call-1' && second === 'ar://tx-call-2', '31. calling upload() twice for identical material signs and uploads twice, never cached');
        assert(gateway.requests.length === 2, '32. two independent POST requests are made');
    }
    console.log('✓ Section J: no caching — every call signs and uploads fresh');

    // ---------------------------------------------------------------
    // Section K — the resulting uri composes directly as
    // PublicationDistributionDescriptor's own materialUri.
    // ---------------------------------------------------------------
    {
        const { signer } = makeFakeSigner({ handler: () => ({ id: 'tx-composed', transaction: {} }) });
        const gateway = makeFakeGateway({ handler: () => gatewayResponse('OK') });
        const uploader = new ArweavePublicationMaterialUploader({ signer, fetchImpl: gateway.fetchImpl });

        const materialUri = await uploader.upload('{"id":"pub-1"}');
        assert(materialUri === 'ar://tx-composed', 'sanity: upload resolved as expected');

        const distribution = describePublicationDistribution({
            publication: { id: 'pub-1', signature: { value: 'fake-signature' } },
            materialUri
        });
        assert(distribution !== null, '33. the uploaded uri composes directly as PublicationDistributionDescriptor\'s own materialUri');
        assert(distribution.material.uri === 'ar://tx-composed' && distribution.material.storage === 'ar', '34. the resulting distribution carries the uploaded uri and its inferred ar storage');
        assert(distribution.discoveryEnvelope.uri === 'ar://tx-composed', '35. the discovery envelope names the same uploaded uri');
    }
    console.log('✓ Section K: the uploaded uri composes directly as PublicationDistributionDescriptor\'s own materialUri');

    // ---------------------------------------------------------------
    // Section L — architectural regression: no forbidden imports or
    // vocabulary.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/ArweavePublicationMaterialUploader.js', import.meta.url);
        const fullSource = await readFile(sourceUrl, 'utf8');
        const codeOnly = fullSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!codeOnly.includes("import { Publication }"), '36. never imports the Publication class — serialized material is supplied, never produced');
        assert(!codeOnly.includes('.toJSON()'), '37. never calls toJSON() on anything — never serializes a Publication itself');
        assert(!codeOnly.includes('DecentralizedWorldDiscoveryLeadRegistry'), '38. never imports the 0.9.26 lead registry');
        assert(!codeOnly.includes('DecentralizedWorldEncounterLeadResolution'), '39. never imports the 0.9.28 lead resolution boundary');
        assert(!codeOnly.includes('NostrDiscoveryQueryService') && !codeOnly.includes('NostrPublicationDiscoveryPublisher'), '40. never imports or references any Nostr publishing concern — 0.9.46 is unscheduled here');
        assert(!codeOnly.includes('PublicationDistributionDescriptor'), '41. never imports the 0.9.44 descriptor — composition is proven in tests only, never wired in application code');
        assert(!codeOnly.includes('crypto') && !codeOnly.includes('Wallet') && !codeOnly.includes('JWK'), '42. never references key/wallet material of any kind — signing is fully delegated to the injected signer');
        assert(!codeOnly.includes('WebSocket'), '43. never references WebSocket');

        const forbiddenTerms = ['trusted', 'reputation', 'weight', 'confidence', 'ranking', 'scoring', 'preferred'];
        for (const term of forbiddenTerms) {
            assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `44. code must never use "${term}" — no trust/ranking vocabulary at this boundary`);
        }

        const resolverSource = await readFile(new URL('../application/ArweaveWorldEncounterMaterialResolver.js', import.meta.url), 'utf8');
        assert(!resolverSource.includes('ArweavePublicationMaterialUploader'), '45. the 0.9.35 resolver is never modified to know about this uploader — read and write stay two separate files');

        console.log('✓ Section L: architectural regression — no forbidden imports, no Publication serialization, no key management');
    }

    console.log('\nAll ArweavePublicationMaterialUploader tests passed.');
}

run().catch((error) => {
    console.error('ArweavePublicationMaterialUploader.test.js FAILED:', error);
    process.exitCode = 1;
});
