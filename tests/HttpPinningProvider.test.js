import { HttpPinningProvider, PinningRejectedError } from '../content/HttpPinningProvider.js';
import { ContentUnavailableError } from '../content/IpfsContentStore.js';

// 0.8.67 — Explicit Remote IPFS Publishing via a Pinning Provider.
//
// Deterministic, network-free coverage of content/HttpPinningProvider
// .js's own wire behavior — every scenario below runs against an
// injected `fetchImpl` standing in for a real pinning service, never a
// live one. Mirrors tests/IpfsGatewayContentStore.test.js's own
// structure: same assert helpers, same "fake network" shape, applied to
// the creation side instead of the resolution side.
//
//   Section A: a successful pin — request shape, response parsing
//   Section B: credentials/custom headers are injected, never invented
//   Section C: a 4xx response is a definitive PinningRejectedError
//   Section D: a 5xx/unreachable/malformed response is a transient
//              ContentUnavailableError — the SAME class content/
//              IpfsContentStore.js and content/IpfsGatewayContentStore.js
//              already throw
//   Section E: configuration validation
//   Section F: field-name configurability (fileFieldName/cidField)

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function expectRejects(promiseFn, message, ErrorType = null) {
    let threw = false;
    let error = null;
    try { await promiseFn(); } catch (e) { threw = true; error = e; }
    assert(threw, message);
    if (ErrorType) {
        assert(error instanceof ErrorType, `${message} (wrong error type: ${error && error.constructor && error.constructor.name})`);
    }
    return error;
}

// A tiny in-memory stand-in for a generic remote pinning service's HTTP
// upload endpoint. `status`/`cidFieldInResponse` let each test drive a
// specific, otherwise-realistic wire response without a live service.
function makeFakePinningService({
    status = 200,
    cidFieldInResponse = 'cid',
    cidValue = 'bafyFAKECID',
    throwOnRequest = false,
    unparsableJson = false,
    capturedRequests = []
} = {}) {
    async function fetchImpl(url, options) {
        if (throwOnRequest) {
            throw new Error('simulated connection failure');
        }
        capturedRequests.push({ url, options });
        if (status >= 200 && status < 300) {
            if (unparsableJson) {
                return new Response('not json', { status });
            }
            return new Response(JSON.stringify({ [cidFieldInResponse]: cidValue }), { status });
        }
        return new Response('rejected by fake service', { status });
    }
    return { fetchImpl, capturedRequests };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — a successful pin
    // ---------------------------------------------------------------
    {
        const { fetchImpl, capturedRequests } = makeFakePinningService({ cidValue: 'bafySUCCESS' });
        const provider = new HttpPinningProvider({ endpoint: 'https://pin.test/api/upload', fetchImpl });

        assert(provider.name === 'remote pinning provider', '1. a default, self-identifying name is set');
        assert(provider.endpoint === 'https://pin.test/api/upload', '2. endpoint is exposed as configured');

        const result = await provider.put(JSON.stringify({ hello: 'world' }));
        assert(result.cid === 'bafySUCCESS', '3. put() resolves with the CID the service returned');

        assert(capturedRequests.length === 1, '4. exactly one HTTP request is made');
        assert(capturedRequests[0].options.method === 'POST', '5. the request is a POST');
        const form = capturedRequests[0].options.body;
        assert(form instanceof FormData, '6. the request body is a multipart form');
        assert(form.get('file') instanceof Blob, '7. the bytes are attached under the default "file" field');
    }
    console.log('✓ Section A: a successful pin request/response round-trips a CID');

    // ---------------------------------------------------------------
    // Section B — credentials and custom headers are injected, never invented
    // ---------------------------------------------------------------
    {
        const { fetchImpl, capturedRequests } = makeFakePinningService();
        const provider = new HttpPinningProvider({
            endpoint: 'https://pin.test/api/upload',
            credential: 'my-secret-token',
            headers: { 'X-Custom-Header': 'custom-value' },
            fetchImpl
        });
        await provider.put('{}');
        assert(capturedRequests[0].options.headers['Authorization'] === 'Bearer my-secret-token',
            '1. a supplied credential is sent as a bearer Authorization header');
        assert(capturedRequests[0].options.headers['X-Custom-Header'] === 'custom-value',
            '2. arbitrary caller-supplied headers are forwarded unchanged');

        const { fetchImpl: fetchImplNoAuth, capturedRequests: requestsNoAuth } = makeFakePinningService();
        const providerNoCredential = new HttpPinningProvider({ endpoint: 'https://pin.test/api/upload', fetchImpl: fetchImplNoAuth });
        await providerNoCredential.put('{}');
        assert(!('Authorization' in requestsNoAuth[0].options.headers),
            '3. no Authorization header is added when no credential was supplied — nothing is invented');
    }
    console.log('✓ Section B: credentials/custom headers are exactly what the caller injected, never fabricated');

    // ---------------------------------------------------------------
    // Section C — a 4xx response is a definitive refusal
    // ---------------------------------------------------------------
    {
        const { fetchImpl } = makeFakePinningService({ status: 401 });
        const provider = new HttpPinningProvider({ endpoint: 'https://pin.test/api/upload', name: 'test-provider', fetchImpl });
        const error = await expectRejects(() => provider.put('{}'),
            '1. a 401 response rejects with PinningRejectedError', PinningRejectedError);
        assert(error.message.includes('test-provider'), '2. the error message names the provider');

        const { fetchImpl: fetchImplQuota } = makeFakePinningService({ status: 429 });
        const providerQuota = new HttpPinningProvider({ endpoint: 'https://pin.test/api/upload', fetchImpl: fetchImplQuota });
        await expectRejects(() => providerQuota.put('{}'),
            '3. a 429 (quota) response also rejects with PinningRejectedError', PinningRejectedError);
    }
    console.log('✓ Section C: a 4xx response is a definitive PinningRejectedError, not a transient failure');

    // ---------------------------------------------------------------
    // Section D — transient/unavailable failures
    // ---------------------------------------------------------------
    {
        const { fetchImpl: throwingFetch } = makeFakePinningService({ throwOnRequest: true });
        const unreachableProvider = new HttpPinningProvider({ endpoint: 'https://unreachable.test/api/upload', fetchImpl: throwingFetch });
        await expectRejects(() => unreachableProvider.put('{}'),
            '1. a connection failure rejects with ContentUnavailableError', ContentUnavailableError);

        const { fetchImpl: serverErrorFetch } = makeFakePinningService({ status: 503 });
        const serverErrorProvider = new HttpPinningProvider({ endpoint: 'https://pin.test/api/upload', fetchImpl: serverErrorFetch });
        await expectRejects(() => serverErrorProvider.put('{}'),
            '2. a 503 response rejects with ContentUnavailableError, never PinningRejectedError', ContentUnavailableError);

        const { fetchImpl: malformedFetch } = makeFakePinningService({ unparsableJson: true });
        const malformedProvider = new HttpPinningProvider({ endpoint: 'https://pin.test/api/upload', fetchImpl: malformedFetch });
        await expectRejects(() => malformedProvider.put('{}'),
            '3. a response body that cannot be parsed as JSON rejects with ContentUnavailableError', ContentUnavailableError);

        const { fetchImpl: missingCidFetch } = makeFakePinningService({ cidFieldInResponse: 'somethingElse' });
        const missingCidProvider = new HttpPinningProvider({ endpoint: 'https://pin.test/api/upload', fetchImpl: missingCidFetch });
        await expectRejects(() => missingCidProvider.put('{}'),
            '4. a well-formed response with no CID field rejects with ContentUnavailableError', ContentUnavailableError);
    }
    console.log('✓ Section D: unreachable/5xx/malformed responses are ContentUnavailableError — the same class every other adapter throws');

    // ---------------------------------------------------------------
    // Section E — configuration validation
    // ---------------------------------------------------------------
    {
        let threw = false;
        try { new HttpPinningProvider({ endpoint: '' }); } catch { threw = true; }
        assert(threw, '1. an empty endpoint is rejected at construction');

        threw = false;
        try { new HttpPinningProvider({}); } catch { threw = true; }
        assert(threw, '2. a missing endpoint is rejected at construction');
    }
    console.log('✓ Section E: an endpoint is required — there is no default remote service');

    // ---------------------------------------------------------------
    // Section F — field-name configurability
    // ---------------------------------------------------------------
    {
        const { fetchImpl, capturedRequests } = makeFakePinningService({ cidFieldInResponse: 'IpfsHash', cidValue: 'bafyALT' });
        const provider = new HttpPinningProvider({
            endpoint: 'https://pin.test/api/upload',
            cidField: 'IpfsHash',
            fileFieldName: 'upload',
            fetchImpl
        });
        const result = await provider.put('{}');
        assert(result.cid === 'bafyALT', '1. a custom cidField is read correctly');
        const form = capturedRequests[0].options.body;
        assert(form.get('upload') instanceof Blob, '2. a custom fileFieldName is used for the upload field');
        assert(form.get('file') === null, '3. the default field name is not also used');
    }
    console.log('✓ Section F: field names are fully configurable, so this one class can front differently-shaped providers');

    console.log('\nAll HttpPinningProvider tests passed.');
}

run().catch((error) => {
    console.error('HttpPinningProvider.test.js FAILED:', error);
    process.exitCode = 1;
});
