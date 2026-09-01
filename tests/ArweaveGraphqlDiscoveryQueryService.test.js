import { ArweaveGraphqlDiscoveryQueryService } from '../application/ArweaveGraphqlDiscoveryQueryService.js';
import { DecentralizedDiscoveryQueryService } from '../application/DecentralizedWorldDiscoveryQuery.js';

// 0.9.25 — Decentralized Discovery Query Adapter (concrete service).
//
// Deterministic, network-free coverage of application/
// ArweaveGraphqlDiscoveryQueryService.js's own wire behavior — every
// scenario below runs against an injected `fetchImpl` standing in for
// Arweave's own GraphQL gateway, never a live one, the identical
// technique tests/BitcoinEsploraTransactionBroadcaster.test.js and
// tests/IpfsContentStore.test.js already established for this
// codebase's other real-network adapters.
//
//   Section A: a well-formed response with results is turned into
//              ar://<id> / "ar" candidates, in order
//   Section B: a well-formed response with zero edges is []
//   Section C: a non-2xx response is []
//   Section D: the fetch itself throwing is [], never propagating
//   Section E: an unparseable / unexpected-shaped body is []
//   Section F: the request itself names the configured tag and the
//              discovery tag being searched for
//   Section G: this class is a real DecentralizedDiscoveryQueryService

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function makeFakeGateway({ handler }) {
    const requests = [];
    async function fetchImpl(url, options) {
        requests.push({ url, options });
        return handler(url, options);
    }
    return { requests, fetchImpl };
}

function graphqlResponse(ids) {
    return new Response(JSON.stringify({
        data: { transactions: { edges: ids.map((id) => ({ node: { id } })) } }
    }), { status: 200 });
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — a well-formed response is turned into candidates.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeGateway({ handler: () => graphqlResponse(['cid-1', 'cid-2']) });
        const service = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: gateway.fetchImpl });

        const candidates = await service.search('forkbuild_random_unique');
        assert(candidates.length === 2, '1. two transactions become two candidates');
        assert(candidates[0].uri === 'ar://cid-1' && candidates[0].storage === 'ar', '2. the first candidate carries an ar:// uri and "ar" storage');
        assert(candidates[1].uri === 'ar://cid-2', '3. the second candidate is independent of the first');
    }
    console.log('✓ Section A: a well-formed response with results is turned into ar:// candidates, in order');

    // ---------------------------------------------------------------
    // Section B — zero edges is [].
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeGateway({ handler: () => graphqlResponse([]) });
        const service = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: gateway.fetchImpl });

        const candidates = await service.search('forkbuild_random_unique');
        assert(Array.isArray(candidates) && candidates.length === 0, '4. a well-formed but empty result set is an empty array, not null or undefined');
    }
    console.log('✓ Section B: a well-formed response with zero edges is []');

    // ---------------------------------------------------------------
    // Section C — a non-2xx response is [].
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeGateway({ handler: () => new Response('internal server error', { status: 503 }) });
        const service = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: gateway.fetchImpl });

        const candidates = await service.search('forkbuild_random_unique');
        assert(candidates.length === 0, '5. a non-2xx response degrades to no candidates, never a throw');
    }
    console.log('✓ Section C: a non-2xx response is []');

    // ---------------------------------------------------------------
    // Section D — the fetch itself throwing (no connectivity, a timeout)
    // never propagates.
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
        assert(!threw, '6. a throwing fetchImpl never propagates out of search()');
        assert(Array.isArray(candidates) && candidates.length === 0, '7. a throwing fetchImpl is reported as no candidates');
    }
    console.log('✓ Section D: the fetch itself throwing is [], never propagating');

    // ---------------------------------------------------------------
    // Section E — an unparseable or unexpectedly-shaped body is [].
    // ---------------------------------------------------------------
    {
        const unparseable = makeFakeGateway({
            handler: () => ({ ok: true, status: 200, json: async () => { throw new Error('invalid json'); } })
        });
        const serviceA = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: unparseable.fetchImpl });
        assert((await serviceA.search('tag')).length === 0, '8. a body that cannot be parsed as JSON degrades to no candidates');

        const wrongShape = makeFakeGateway({ handler: () => new Response(JSON.stringify({ errors: ['boom'] }), { status: 200 }) });
        const serviceB = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: wrongShape.fetchImpl });
        assert((await serviceB.search('tag')).length === 0, '9. a body missing data.transactions.edges degrades to no candidates');

        const missingId = makeFakeGateway({ handler: () => new Response(JSON.stringify({ data: { transactions: { edges: [{ node: {} }] } } }), { status: 200 }) });
        const serviceC = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: missingId.fetchImpl });
        assert((await serviceC.search('tag')).length === 0, '10. an edge with no node.id is silently skipped, not a crash');
    }
    console.log('✓ Section E: an unparseable / unexpected-shaped body is []');

    // ---------------------------------------------------------------
    // Section F — the outgoing request names the configured tag and the
    // discovery tag being searched for.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeGateway({ handler: () => graphqlResponse([]) });
        const service = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: gateway.fetchImpl, tagName: 'My-Custom-Tag' });

        await service.search('forkbuild_random_unique');
        assert(gateway.requests.length === 1, '11. exactly one request is made per search() call');
        const { url, options } = gateway.requests[0];
        assert(url === ArweaveGraphqlDiscoveryQueryService.DEFAULT_GRAPHQL_URL, '12. the request targets the default Arweave GraphQL gateway when none is configured');
        assert(options.method === 'POST', '13. the request uses POST');
        const body = JSON.parse(options.body);
        assert(body.query.includes('My-Custom-Tag'), '14. the query names the configured tag name');
        assert(body.query.includes('forkbuild_random_unique'), '15. the query names the discovery tag being searched for');
    }
    console.log('✓ Section F: the request itself names the configured tag and the discovery tag being searched for');

    // ---------------------------------------------------------------
    // Section G — this class really is a DecentralizedDiscoveryQueryService,
    // and names itself via `origin`, never a result's own id.
    // ---------------------------------------------------------------
    {
        const service = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: async () => graphqlResponse([]) });
        assert(service instanceof DecentralizedDiscoveryQueryService, '16. ArweaveGraphqlDiscoveryQueryService extends DecentralizedDiscoveryQueryService');
        assert(typeof service.origin === 'string' && service.origin.includes('arweave.net/graphql'), '17. origin names the gateway url');

        const other = new ArweaveGraphqlDiscoveryQueryService({ graphqlUrl: 'https://a-different-gateway.example/graphql', fetchImpl: async () => graphqlResponse([]) });
        assert(other.origin !== service.origin, '18. two instances pointed at two different gateways report two different origins');
    }
    console.log('✓ Section G: this class is a real DecentralizedDiscoveryQueryService, naming itself by gateway url');

    console.log('\nAll ArweaveGraphqlDiscoveryQueryService tests passed.');
}

run().catch((error) => {
    console.error('ArweaveGraphqlDiscoveryQueryService.test.js FAILED:', error);
    process.exitCode = 1;
});
