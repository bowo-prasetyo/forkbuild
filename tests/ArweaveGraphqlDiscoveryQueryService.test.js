import { ArweaveGraphqlDiscoveryQueryService } from '../application/ArweaveGraphqlDiscoveryQueryService.js';
import { DecentralizedDiscoveryQueryService } from '../application/DecentralizedWorldDiscoveryQuery.js';

// 0.9.25 — Decentralized Discovery Query Adapter (concrete service).
//
// Deterministic, network-free coverage of application/
// ArweaveGraphqlDiscoveryQueryService.js's own wire behavior — every
// scenario below runs against an injected `fetchImpl` standing in for
// Arweave's own GraphQL gateway AND raw transaction gateway, never a live
// one, the identical technique tests/BitcoinEsploraTransactionBroadcaster.test.js
// and tests/IpfsContentStore.test.js already established for this
// codebase's other real-network adapters.
//
// AMENDED BY 0.9.494 — ARWEAVE ENVELOPE-AWARE DISCOVERY URI RESOLUTION.
// `search()` now performs one additional gateway GET per transaction the
// GraphQL step finds, decoding each one's own signed publication envelope
// and reporting the envelope's own claimed `uri` — never the transaction's
// own id — as the candidate's `uri`. The fake gateway below now answers
// both `POST /graphql` and `GET /<id>`; every scenario that exercises the
// GraphQL step through to a candidate must therefore also serve a
// well-formed envelope at each matched transaction id, or expect that
// candidate to be silently skipped. `tests/
// ArweaveEnvelopeAwareDiscoveryQueryService.test.js` (0.9.494) is the
// focused test for the envelope-aware behavior itself, end to end; this
// file remains the unit-level wire-behavior coverage for this one class.
//
//   Section A: a well-formed response with results, each carrying a
//              well-formed envelope, is turned into candidates reporting
//              the envelope's own claimed uri, in order
//   Section B: a well-formed response with zero edges is []
//   Section C: a non-2xx GraphQL response is []
//   Section D: the GraphQL fetch itself throwing is [], never propagating
//   Section E: an unparseable / unexpected-shaped GraphQL body is []
//   Section F: the GraphQL request itself names the configured tag and the
//              discovery tag being searched for
//   Section G: this class is a real DecentralizedDiscoveryQueryService
//   Section H: the envelope-aware gateway step — one GET per transaction,
//              the announcement id preserved alongside the reported uri,
//              and every way an envelope can be unavailable/malformed
//              skips that candidate without ever substituting its own id

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function makeFakeGateway({ handler, envelopes = {} }) {
    const requests = [];
    async function fetchImpl(url, options = {}) {
        requests.push({ url, options });
        const parsed = new URL(url);
        if ((options.method || 'GET') !== 'POST' && parsed.pathname !== '/graphql') {
            const id = parsed.pathname.slice(1);
            if (Object.prototype.hasOwnProperty.call(envelopes, id)) {
                return new Response(envelopes[id], { status: 200 });
            }
            return new Response('not found', { status: 404 });
        }
        return handler(url, options);
    }
    return { requests, fetchImpl };
}

function graphqlResponse(ids) {
    return new Response(JSON.stringify({
        data: { transactions: { edges: ids.map((id) => ({ node: { id } })) } }
    }), { status: 200 });
}

function envelopeJson(uri, overrides = {}) {
    return JSON.stringify({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'obj', uri, ...overrides });
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — a well-formed response, each candidate carrying a
    // well-formed envelope, is turned into candidates reporting the
    // envelope's own claimed uri.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeGateway({
            handler: () => graphqlResponse(['cid-1', 'cid-2']),
            envelopes: { 'cid-1': envelopeJson('ar://material-1'), 'cid-2': envelopeJson('ar://material-2') }
        });
        const service = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: gateway.fetchImpl });

        const candidates = await service.search('forkbuild_random_unique');
        assert(candidates.length === 2, '1. two transactions become two candidates');
        assert(candidates[0].uri === 'ar://material-1' && candidates[0].storage === 'ar', '2. the first candidate carries the envelope\'s own claimed uri and "ar" storage read off its scheme');
        assert(candidates[0].announcementId === 'cid-1', '3. the first candidate preserves the announcement transaction id it came from');
        assert(candidates[1].uri === 'ar://material-2' && candidates[1].announcementId === 'cid-2', '4. the second candidate is independent of the first');
    }
    console.log('✓ Section A: a well-formed response with results, each carrying a well-formed envelope, is turned into candidates reporting the envelope\'s own claimed uri, in order');

    // ---------------------------------------------------------------
    // Section B — zero edges is [].
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeGateway({ handler: () => graphqlResponse([]) });
        const service = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: gateway.fetchImpl });

        const candidates = await service.search('forkbuild_random_unique');
        assert(Array.isArray(candidates) && candidates.length === 0, '5. a well-formed but empty result set is an empty array, not null or undefined');
    }
    console.log('✓ Section B: a well-formed response with zero edges is []');

    // ---------------------------------------------------------------
    // Section C — a non-2xx GraphQL response is [].
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeGateway({ handler: () => new Response('internal server error', { status: 503 }) });
        const service = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: gateway.fetchImpl });

        const candidates = await service.search('forkbuild_random_unique');
        assert(candidates.length === 0, '6. a non-2xx GraphQL response degrades to no candidates, never a throw');
    }
    console.log('✓ Section C: a non-2xx GraphQL response is []');

    // ---------------------------------------------------------------
    // Section D — the GraphQL fetch itself throwing (no connectivity, a
    // timeout) never propagates.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeGateway({ handler: () => { throw new Error('simulated connection failure'); } });
        const service = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: gateway.fetchImpl });

        let threw = false;
        let candidates;
        try {
            candidates = await service.search('forkbuild_random_unique');
        } catch {
            threw = true;
        }
        assert(!threw, '7. a throwing fetchImpl never propagates out of search()');
        assert(Array.isArray(candidates) && candidates.length === 0, '8. a throwing fetchImpl is reported as no candidates');
    }
    console.log('✓ Section D: the GraphQL fetch itself throwing is [], never propagating');

    // ---------------------------------------------------------------
    // Section E — an unparseable or unexpectedly-shaped GraphQL body is [].
    // ---------------------------------------------------------------
    {
        const unparseable = makeFakeGateway({
            handler: () => ({ ok: true, status: 200, json: async () => { throw new Error('invalid json'); } })
        });
        const serviceA = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: unparseable.fetchImpl });
        assert((await serviceA.search('tag')).length === 0, '9. a body that cannot be parsed as JSON degrades to no candidates');

        const wrongShape = makeFakeGateway({ handler: () => new Response(JSON.stringify({ errors: ['boom'] }), { status: 200 }) });
        const serviceB = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: wrongShape.fetchImpl });
        assert((await serviceB.search('tag')).length === 0, '10. a body missing data.transactions.edges degrades to no candidates');

        const missingId = makeFakeGateway({ handler: () => new Response(JSON.stringify({ data: { transactions: { edges: [{ node: {} }] } } }), { status: 200 }) });
        const serviceC = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: missingId.fetchImpl });
        assert((await serviceC.search('tag')).length === 0, '11. an edge with no node.id is silently skipped, not a crash');
    }
    console.log('✓ Section E: an unparseable / unexpected-shaped GraphQL body is []');

    // ---------------------------------------------------------------
    // Section F — the outgoing GraphQL request names the configured tag and
    // the discovery tag being searched for.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeGateway({ handler: () => graphqlResponse([]) });
        const service = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: gateway.fetchImpl, tagName: 'My-Custom-Tag' });

        await service.search('forkbuild_random_unique');
        assert(gateway.requests.length === 1, '12. exactly one request is made per search() call when nothing is found');
        const { url, options } = gateway.requests[0];
        assert(url === ArweaveGraphqlDiscoveryQueryService.DEFAULT_GRAPHQL_URL, '13. the request targets the default Arweave GraphQL gateway when none is configured');
        assert(options.method === 'POST', '14. the request uses POST');
        const body = JSON.parse(options.body);
        assert(body.query.includes('My-Custom-Tag'), '15. the query names the configured tag name');
        assert(body.query.includes('forkbuild_random_unique'), '16. the query names the discovery tag being searched for');
    }
    console.log('✓ Section F: the request itself names the configured tag and the discovery tag being searched for');

    // ---------------------------------------------------------------
    // Section G — this class really is a DecentralizedDiscoveryQueryService,
    // and names itself via `origin`, never a result's own id.
    // ---------------------------------------------------------------
    {
        const service = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: async () => graphqlResponse([]) });
        assert(service instanceof DecentralizedDiscoveryQueryService, '17. ArweaveGraphqlDiscoveryQueryService extends DecentralizedDiscoveryQueryService');
        assert(typeof service.origin === 'string' && service.origin.includes('arweave.net/graphql'), '18. origin names the GraphQL gateway url');

        const other = new ArweaveGraphqlDiscoveryQueryService({ graphqlUrl: 'https://a-different-gateway.example/graphql', fetchImpl: async () => graphqlResponse([]) });
        assert(other.origin !== service.origin, '19. two instances pointed at two different gateways report two different origins');
    }
    console.log('✓ Section G: this class is a real DecentralizedDiscoveryQueryService, naming itself by GraphQL gateway url');

    // ---------------------------------------------------------------
    // Section H — 0.9.494: the envelope-aware gateway step.
    // ---------------------------------------------------------------
    {
        // H1: gatewayUrl defaults to arweave.net and is configurable
        // independently of graphqlUrl.
        const defaultService = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: async () => graphqlResponse([]) });
        assert(defaultService.gatewayUrl === ArweaveGraphqlDiscoveryQueryService.DEFAULT_GATEWAY_URL, '20. gatewayUrl defaults to the documented default');
        const customGatewayService = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: async () => graphqlResponse([]), gatewayUrl: 'https://a-different-gateway.example/' });
        assert(customGatewayService.gatewayUrl === 'https://a-different-gateway.example', '21. a trailing slash on a configured gatewayUrl is stripped, exactly as graphqlUrl-adjacent classes already do');

        // H2: one GET per transaction the GraphQL step found, against the
        // configured gatewayUrl, in addition to the one GraphQL POST.
        const gateway = makeFakeGateway({
            handler: () => graphqlResponse(['tx-1', 'tx-2']),
            envelopes: { 'tx-1': envelopeJson('ar://mat-1'), 'tx-2': envelopeJson('ar://mat-2') }
        });
        const service = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: gateway.fetchImpl });
        await service.search('tag');
        assert(gateway.requests.length === 3, '22. one GraphQL POST plus one gateway GET per discovered transaction');
        const getRequests = gateway.requests.filter((r) => (r.options.method || 'GET') !== 'POST');
        assert(getRequests.length === 2, '23. exactly two gateway GETs were issued, one per transaction id');
        assert(getRequests.every((r) => r.url.startsWith(ArweaveGraphqlDiscoveryQueryService.DEFAULT_GATEWAY_URL)), '24. each gateway GET targets the configured gatewayUrl');

        // H3: a transaction whose gateway GET 404s contributes no
        // candidate — never a candidate carrying its own id as uri.
        const partialGateway = makeFakeGateway({
            handler: () => graphqlResponse(['tx-good', 'tx-missing']),
            envelopes: { 'tx-good': envelopeJson('ar://mat-good') }
        });
        const partialService = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: partialGateway.fetchImpl });
        const partialCandidates = await partialService.search('tag');
        assert(partialCandidates.length === 1 && partialCandidates[0].uri === 'ar://mat-good', '25. a transaction with no envelope at its gateway location is silently skipped, never substituting its own id as uri');

        // H4: a transaction whose gateway GET returns non-envelope JSON (or
        // non-JSON at all) is likewise skipped, never crashing the batch.
        const malformedGateway = makeFakeGateway({
            handler: () => graphqlResponse(['tx-good', 'tx-not-json', 'tx-wrong-protocol']),
            envelopes: {
                'tx-good': envelopeJson('ar://mat-good-2'),
                'tx-not-json': 'this is not json',
                'tx-wrong-protocol': JSON.stringify({ protocol: 'other', version: 1, kind: 'PUBLICATION', objectId: 'x', uri: 'ar://should-never-appear' })
            }
        });
        const malformedService = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: malformedGateway.fetchImpl });
        const malformedCandidates = await malformedService.search('tag');
        assert(malformedCandidates.length === 1 && malformedCandidates[0].uri === 'ar://mat-good-2', '26. malformed or non-envelope gateway responses are silently skipped; only the one well-formed candidate survives');

        // H5: a genuine gateway-GET failure (fetch itself throws) never
        // propagates out of search(), and never substitutes the
        // announcement id as a fallback uri either.
        const throwingGateway = {
            fetchImpl: async (url, options = {}) => {
                const parsed = new URL(url);
                if (parsed.pathname === '/graphql') {
                    return graphqlResponse(['tx-throws']);
                }
                throw new Error('simulated gateway connection failure');
            }
        };
        const throwingService = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: throwingGateway.fetchImpl });
        let threw = false;
        let candidates;
        try {
            candidates = await throwingService.search('tag');
        } catch {
            threw = true;
        }
        assert(!threw, '27. a throwing gateway fetch at the envelope-retrieval step never propagates out of search()');
        assert(Array.isArray(candidates) && candidates.length === 0, '28. ...and is reported as no candidates');
    }
    console.log('✓ Section H: the envelope-aware gateway step issues one GET per discovered transaction, preserves the announcement id alongside the envelope\'s own claimed uri, and never substitutes a transaction id as a fallback uri for an unavailable or malformed envelope');

    console.log('\nAll ArweaveGraphqlDiscoveryQueryService tests passed.');
}

run().catch((error) => {
    console.error('ArweaveGraphqlDiscoveryQueryService.test.js FAILED:', error);
    process.exitCode = 1;
});
