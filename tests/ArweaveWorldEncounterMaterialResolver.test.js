import { readFile } from 'node:fs/promises';
import { ArweaveWorldEncounterMaterialResolver } from '../application/ArweaveWorldEncounterMaterialResolver.js';
import { DecentralizedWorldEncounterMaterialSource } from '../application/DecentralizedWorldEncounterMaterialSource.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';

// 0.9.35 — Arweave World Encounter Material Resolver.
// See docs/Roadmap.md, "0.9.35 — Arweave World Encounter Material Resolver."
//
// Deterministic, network-free coverage of application/
// ArweaveWorldEncounterMaterialResolver.js's own wire behavior — every
// scenario below runs against an injected `fetchImpl` standing in for an
// Arweave gateway, never a live one, the identical technique tests/
// ArweaveGraphqlDiscoveryQueryService.test.js and tests/
// IpfsGatewayContentStore.test.js already established for this codebase's
// other real-network adapters.
//
//   Section A: flagship — ar://<id> retrieves and parses a Publication-
//              shaped JSON object from a mocked gateway
//   Section B: the transaction id is extracted correctly and named in the
//              outgoing request URL
//   Section C: a non-ar:// uri is rejected (null), the gateway never called
//   Section D: a malformed ar:// uri is rejected (null), the gateway never
//              called
//   Section E: a genuine fetch failure (HTTP-level failure) propagates,
//              never swallowed as null
//   Section F: malformed JSON becomes null
//   Section G: an oversized response is rejected — by Content-Length and,
//              independently, by actual decoded body size
//   Section H: the injected fetchImpl is actually what is used — no
//              fallback to a real network call
//   Section I: no caching — two calls for the same uri issue two requests
//   Section J: a signature is returned, unverified, exactly as parsed
//   Section K: this resolver never knows about discovery leads, resolved
//              selections, or Nostr/Arweave discovery queries — never
//              reads origin/discoveryTag, and composes with 0.9.33's own
//              DecentralizedWorldEncounterMaterialSource as a bare
//              retrieveByUri function
//   Section L: architectural regression — no forbidden imports/vocabulary

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, message);
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
    // Section A — flagship: ar://<id> retrieves and parses a
    // Publication-shaped JSON object from a mocked gateway.
    // ---------------------------------------------------------------
    {
        const publication = { id: 'pub-1', title: 'A Decentralized Publication', body: 'Hello, decentralized world.' };
        const gateway = makeFakeGateway({ handler: () => gatewayResponse(JSON.stringify(publication)) });
        const resolver = new ArweaveWorldEncounterMaterialResolver({ fetchImpl: gateway.fetchImpl });

        const material = await resolver.retrieveByUri('ar://tx-abc123');
        assert(material !== null, '1. FLAGSHIP — a valid ar:// uri retrieves material rather than null');
        assert(material.id === 'pub-1' && material.title === 'A Decentralized Publication', '2. FLAGSHIP — the retrieved material matches the mocked gateway response');
    }
    console.log('✓ Section A: a valid ar:// uri retrieves a Publication-shaped object from a mocked gateway');

    // ---------------------------------------------------------------
    // Section B — the transaction id is extracted correctly and named
    // in the outgoing request.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeGateway({ handler: () => gatewayResponse(JSON.stringify({ ok: true })) });
        const resolver = new ArweaveWorldEncounterMaterialResolver({ fetchImpl: gateway.fetchImpl, gatewayUrl: 'https://custom-gateway.example' });

        await resolver.retrieveByUri('ar://my-transaction-id_123-ABC');
        assert(gateway.requests.length === 1, '3. exactly one request is made per retrieveByUri() call');
        assert(gateway.requests[0].url === 'https://custom-gateway.example/my-transaction-id_123-ABC', '4. the transaction id is extracted and appended to the configured gateway url');
        assert(gateway.requests[0].options.method === 'GET', '5. the request uses GET');
    }
    console.log('✓ Section B: the transaction id is extracted correctly and named in the outgoing request');

    // ---------------------------------------------------------------
    // Section C — a non-ar:// uri is rejected, the gateway never
    // called.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeGateway({ handler: () => gatewayResponse(JSON.stringify({ ok: true })) });
        const resolver = new ArweaveWorldEncounterMaterialResolver({ fetchImpl: gateway.fetchImpl });

        for (const uri of ['ipfs://CID123', 'https://example.com/thing', 'nostr://npub1abc', '', null, undefined, 123]) {
            const result = await resolver.retrieveByUri(uri);
            assert(result === null, `6. a non-ar:// uri ${JSON.stringify(uri)} resolves to null`);
        }
        assert(gateway.requests.length === 0, '7. the gateway is never called for a non-ar:// uri');
    }
    console.log('✓ Section C: a non-ar:// uri is rejected without calling the gateway');

    // ---------------------------------------------------------------
    // Section D — a malformed ar:// uri is rejected, the gateway never
    // called.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeGateway({ handler: () => gatewayResponse(JSON.stringify({ ok: true })) });
        const resolver = new ArweaveWorldEncounterMaterialResolver({ fetchImpl: gateway.fetchImpl });

        for (const uri of ['ar://', 'ar:///leading-slash', 'ar://has a space', 'ar://has/slash', 'ar://has?query=1', 'ar://has#fragment']) {
            const result = await resolver.retrieveByUri(uri);
            assert(result === null, `8. a malformed ar:// uri ${JSON.stringify(uri)} resolves to null`);
        }
        assert(gateway.requests.length === 0, '9. the gateway is never called for a malformed ar:// uri');
    }
    console.log('✓ Section D: a malformed ar:// uri is rejected without calling the gateway');

    // ---------------------------------------------------------------
    // Section E — a genuine fetch/HTTP failure propagates rather than
    // being swallowed as null; a non-2xx "not found" response is a
    // clean null instead.
    // ---------------------------------------------------------------
    {
        const failingGateway = makeFakeGateway({ handler: () => { throw new Error('simulated connection failure'); } });
        const resolver = new ArweaveWorldEncounterMaterialResolver({ fetchImpl: failingGateway.fetchImpl });

        let rejected = false;
        try {
            await resolver.retrieveByUri('ar://tx-abc123');
        } catch {
            rejected = true;
        }
        assert(rejected, '10. a genuine fetch failure propagates as a rejection, never swallowed as null');

        const notFoundGateway = makeFakeGateway({ handler: () => gatewayResponse('Not Found', { status: 404 }) });
        const notFoundResolver = new ArweaveWorldEncounterMaterialResolver({ fetchImpl: notFoundGateway.fetchImpl });
        const missing = await notFoundResolver.retrieveByUri('ar://tx-missing');
        assert(missing === null, '11. a non-2xx gateway response (transaction not found) degrades to null, not a throw');
    }
    console.log('✓ Section E: a genuine fetch failure propagates; a non-2xx response degrades to null');

    // ---------------------------------------------------------------
    // Section F — malformed JSON becomes null.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeGateway({ handler: () => gatewayResponse('{ this is not valid JSON') });
        const resolver = new ArweaveWorldEncounterMaterialResolver({ fetchImpl: gateway.fetchImpl });

        const result = await resolver.retrieveByUri('ar://tx-malformed');
        assert(result === null, '12. an unparseable JSON body degrades to null');

        const scalarGateway = makeFakeGateway({ handler: () => gatewayResponse('"just a string"') });
        const scalarResolver = new ArweaveWorldEncounterMaterialResolver({ fetchImpl: scalarGateway.fetchImpl });
        const scalarResult = await scalarResolver.retrieveByUri('ar://tx-scalar');
        assert(scalarResult === null, '13. valid JSON that is not an object (a bare scalar) degrades to null');
    }
    console.log('✓ Section F: malformed JSON, and non-object JSON, both become null');

    // ---------------------------------------------------------------
    // Section G — an oversized response is rejected, both by
    // Content-Length and by actual decoded body size.
    // ---------------------------------------------------------------
    {
        const oversizedBody = JSON.stringify({ id: 'huge', padding: 'x'.repeat(200) });

        const byDeclaredLength = makeFakeGateway({
            handler: () => gatewayResponse(oversizedBody, { headers: { 'content-length': String(oversizedBody.length) } })
        });
        const resolverByLength = new ArweaveWorldEncounterMaterialResolver({ fetchImpl: byDeclaredLength.fetchImpl, maxResponseBytes: 32 });
        const resultByLength = await resolverByLength.retrieveByUri('ar://tx-oversized-1');
        assert(resultByLength === null, '14. a response whose declared Content-Length exceeds the ceiling is rejected');

        const withoutDeclaredLength = makeFakeGateway({
            handler: () => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => oversizedBody })
        });
        const resolverNoHeader = new ArweaveWorldEncounterMaterialResolver({ fetchImpl: withoutDeclaredLength.fetchImpl, maxResponseBytes: 32 });
        const resultNoHeader = await resolverNoHeader.retrieveByUri('ar://tx-oversized-2');
        assert(resultNoHeader === null, '15. a response with no usable Content-Length is still rejected once its actual decoded size exceeds the ceiling');

        const withinCeiling = makeFakeGateway({ handler: () => gatewayResponse(JSON.stringify({ id: 'small' })) });
        const resolverWithinCeiling = new ArweaveWorldEncounterMaterialResolver({ fetchImpl: withinCeiling.fetchImpl, maxResponseBytes: 1024 });
        const resultWithinCeiling = await resolverWithinCeiling.retrieveByUri('ar://tx-small');
        assert(resultWithinCeiling !== null && resultWithinCeiling.id === 'small', '16. a response within the ceiling still resolves normally');
    }
    console.log('✓ Section G: an oversized response is rejected by declared and by actual size');

    // ---------------------------------------------------------------
    // Section H — the injected fetchImpl is actually what is used.
    // ---------------------------------------------------------------
    {
        let realFetchCalled = false;
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async () => { realFetchCalled = true; return gatewayResponse(JSON.stringify({ ok: true })); };
        try {
            const gateway = makeFakeGateway({ handler: () => gatewayResponse(JSON.stringify({ id: 'via-injected-fetch' })) });
            const resolver = new ArweaveWorldEncounterMaterialResolver({ fetchImpl: gateway.fetchImpl });
            const material = await resolver.retrieveByUri('ar://tx-abc123');
            assert(material.id === 'via-injected-fetch', '17. the injected fetchImpl, not the global fetch, is used when supplied');
            assert(!realFetchCalled, '18. the global fetch is never called when an explicit fetchImpl is injected');
        } finally {
            globalThis.fetch = originalFetch;
        }

        expectThrows(() => new ArweaveWorldEncounterMaterialResolver({ fetchImpl: 'not-a-function' }), '19. a non-function fetchImpl falls through to requiring a real fetch implementation');
    }
    console.log('✓ Section H: the injected fetchImpl is what actually retrieves material, never a real network call');

    // ---------------------------------------------------------------
    // Section I — no caching: two calls for the same uri issue two
    // requests.
    // ---------------------------------------------------------------
    {
        let callCount = 0;
        const gateway = makeFakeGateway({ handler: () => { callCount++; return gatewayResponse(JSON.stringify({ id: 'pub-1', callCount })); } });
        const resolver = new ArweaveWorldEncounterMaterialResolver({ fetchImpl: gateway.fetchImpl });

        const first = await resolver.retrieveByUri('ar://tx-abc123');
        const second = await resolver.retrieveByUri('ar://tx-abc123');
        assert(gateway.requests.length === 2, '20. calling retrieveByUri() twice for the same uri issues two requests, never cached');
        assert(first.callCount === 1 && second.callCount === 2, '21. each call reaches the gateway fresh');
    }
    console.log('✓ Section I: no caching — every call reaches the gateway fresh');

    // ---------------------------------------------------------------
    // Section J — a signature is returned, unverified, exactly as
    // parsed.
    // ---------------------------------------------------------------
    {
        const signedMaterial = { id: 'pub-signed', title: 'Signed', signature: { algorithm: 'Ed25519', signer: 'not-a-real-signer', signature: 'not-a-real-signature' } };
        const gateway = makeFakeGateway({ handler: () => gatewayResponse(JSON.stringify(signedMaterial)) });
        const resolver = new ArweaveWorldEncounterMaterialResolver({ fetchImpl: gateway.fetchImpl });

        const material = await resolver.retrieveByUri('ar://tx-signed');
        assert(material.signature && material.signature.algorithm === 'Ed25519', '22. a signature field on the retrieved material is preserved exactly as parsed');
        assert(material.signature.signer === 'not-a-real-signer', '23. the signature is returned verbatim — never checked, never stripped, never verified');
    }
    console.log('✓ Section J: a signature is returned exactly as parsed, never verified');

    // ---------------------------------------------------------------
    // Section K — this resolver never knows about discovery leads,
    // resolved selections, or discovery queries; it composes with
    // 0.9.33's own DecentralizedWorldEncounterMaterialSource as a bare
    // retrieveByUri function.
    // ---------------------------------------------------------------
    {
        const material = { id: 'pub-1', title: 'Composed Through 0.9.33' };
        const gateway = makeFakeGateway({ handler: () => gatewayResponse(JSON.stringify(material)) });
        const resolver = new ArweaveWorldEncounterMaterialResolver({ fetchImpl: gateway.fetchImpl });

        // retrieveByUri takes exactly one argument — a bare uri string —
        // and never a lead or a selection of any kind.
        const direct = await resolver.retrieveByUri('ar://tx-abc123');
        assert(direct.title === 'Composed Through 0.9.33', '24. retrieveByUri() takes a bare uri string and nothing else');

        const source = new DecentralizedWorldEncounterMaterialSource(resolver.retrieveByUri);
        const resolvedSelection = Object.freeze({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-1', origin: 'decentralized:nostr' });
        const resolvedLead = Object.freeze({ origin: 'nostr', discoveryTag: 'forkbuild', uri: 'ar://tx-abc123', storage: 'ar' });

        const loaded = await source.load(resolvedSelection, resolvedLead);
        assert(loaded !== null && loaded.title === 'Composed Through 0.9.33', '25. resolver.retrieveByUri composes directly as the retrieveByUri argument DecentralizedWorldEncounterMaterialSource\'s constructor requires');
        assert(gateway.requests[gateway.requests.length - 1].url.endsWith('/tx-abc123'), '26. the resolver only ever reads resolvedLead.uri through the source — never origin/discoveryTag/storage');
    }
    console.log('✓ Section K: never aware of leads/selections/discovery; composes as a bare retrieveByUri function');

    // ---------------------------------------------------------------
    // Section L — architectural regression: no forbidden imports or
    // vocabulary.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/ArweaveWorldEncounterMaterialResolver.js', import.meta.url);
        const fullSource = await readFile(sourceUrl, 'utf8');
        const codeOnly = fullSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!codeOnly.includes('DecentralizedWorldEncounterLeadResolution'), '27. never imports the 0.9.28 lead resolution boundary');
        assert(!codeOnly.includes('DecentralizedWorldDiscoveryLeadRegistry'), '28. never imports the 0.9.26 lead registry');
        assert(!codeOnly.includes('DecentralizedWorldEncounterLeadAssociation'), '29. never imports the 0.9.28 lead association module');
        assert(!codeOnly.includes('DecentralizedWorldDiscoveryQuery'), '30. never imports the decentralized discovery query orchestration layer');
        assert(!codeOnly.includes('ArweaveGraphqlDiscoveryQueryService'), '31. never imports the Arweave discovery adapter — retrieval only, never discovery');
        assert(!codeOnly.includes('DecentralizedWorldEncounterMaterialSource'), '32. never imports the 0.9.33 source itself — this file is a plain retrieveByUri implementation, not a second material source');
        assert(!codeOnly.includes('.origin') && !codeOnly.includes('.discoveryTag'), '33. never reads a lead\'s own origin/discoveryTag anywhere in the implementation');
        assert(!codeOnly.includes('WebSocket'), '34. never references WebSocket directly');

        const forbiddenTerms = ['trusted', 'trust(', 'reputation', 'verify(', 'authority', 'weight', 'confidence', 'ranking', 'scoring'];
        for (const term of forbiddenTerms) {
            assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `35. code must never use "${term}" — retrieval only, no trust/verification vocabulary`);
        }

        const decentralizedSourceText = await readFile(new URL('../application/DecentralizedWorldEncounterMaterialSource.js', import.meta.url), 'utf8');
        assert(!decentralizedSourceText.includes('ArweaveWorldEncounterMaterialResolver'), '36. the 0.9.33 source itself is never modified to know about this concrete resolver');

        console.log('✓ Section L: architectural regression — no forbidden imports, no lead awareness, no trust vocabulary');
    }

    console.log('\nAll ArweaveWorldEncounterMaterialResolver tests passed.');
}

run().catch((error) => {
    console.error('ArweaveWorldEncounterMaterialResolver.test.js FAILED:', error);
    process.exitCode = 1;
});
