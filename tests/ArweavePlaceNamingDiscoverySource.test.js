import { ArweavePlaceNamingDiscoverySource } from '../application/placeNaming/ArweavePlaceNamingDiscoverySource.js';
import { ArweavePlaceNamingDiscoveryPublisher } from '../application/placeNaming/ArweavePlaceNamingDiscoveryPublisher.js';
import { PlaceNamingDiscoveryQueryService } from '../application/placeNaming/PlaceNamingDiscoveryQueryService.js';
import { derivePlaceNamingDiscoveryTag } from '../core/PlaceNamingDiscoveryEnvelope.js';
import { assert } from './support/Assert.js';

// Arweave Place Naming Discovery Source: reads back what
// ArweavePlaceNamingDiscoveryPublisher announces.
//
//   Section A: the GraphQL query names the publisher's Tag NAME, the tag and maxResults
//   Section B: each transaction body becomes one raw payload, in order
//   Section C: a missing, unreadable or oversized transaction is skipped
//   Section D: a failed or malformed tag search REJECTS search() — never []
//   Section E: end to end through PlaceNamingDiscoveryQueryService

const GRAPHQL_URL = 'https://gateway.example/graphql';
const GATEWAY_URL = 'https://gateway.example';

function claimJSONOf(overrides = {}) {
    return {
        id: 'claim-1',
        worldId: 'world-1',
        regionId: 'region-1',
        name: 'Old Oak Crossing',
        authorIdentityId: 'did:key:zAlice',
        createdAt: '2026-01-01T00:00:00.000Z',
        signature: {
            algorithm: 'ed25519',
            signer: 'did:key:zAlice',
            signature: 'sig-abc123',
            signedHash: 'hash-abc123',
            domain: 'forkbuild.place-naming-claim'
        },
        ...overrides
    };
}

function envelopeOf(claimOverrides = {}) {
    return {
        protocol: 'forkbuild-place-naming-discovery',
        version: 1,
        worldId: 'world-1',
        regionId: 'region-1',
        claim: claimJSONOf(claimOverrides)
    };
}

function response(status, body, headers = {}) {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: (name) => headers[name.toLowerCase()] ?? null },
        json: async () => JSON.parse(text),
        text: async () => text
    };
}

// transactions: { [id]: Response | body }. graphql: Response for the search.
function makeGateway({ graphql, transactions = {} }) {
    const requests = [];
    const fetchImpl = async (url, init) => {
        requests.push({ url, init });
        if (url === GRAPHQL_URL) {
            if (graphql instanceof Error) throw graphql;
            return graphql;
        }
        const id = url.slice(GATEWAY_URL.length + 1);
        const entry = transactions[id];
        if (entry === undefined) return response(404, 'not found');
        if (entry instanceof Error) throw entry;
        return entry.ok !== undefined ? entry : response(200, entry);
    };
    return { fetchImpl, requests };
}

function searchResultOf(ids) {
    return response(200, { data: { transactions: { edges: ids.map((id) => ({ node: { id } })) } } });
}

function sourceWith(gateway, options = {}) {
    return new ArweavePlaceNamingDiscoverySource({ graphqlUrl: GRAPHQL_URL, gatewayUrl: GATEWAY_URL, fetchImpl: gateway.fetchImpl, ...options });
}

async function expectRejects(promise, message) {
    let rejected = false;
    try { await promise; } catch { rejected = true; }
    assert(rejected, message);
}

const TAG = derivePlaceNamingDiscoveryTag('world-1', 'region-1');

async function run() {
    {
        const gateway = makeGateway({ graphql: searchResultOf([]) });
        const result = await sourceWith(gateway, { maxResults: 7 }).search(TAG);
        assert(Array.isArray(result) && result.length === 0, 'A1. an empty search resolves []');
        const query = JSON.parse(gateway.requests[0].init.body).query;
        assert(query.includes(JSON.stringify(ArweavePlaceNamingDiscoveryPublisher.DEFAULT_TAG_NAME)), 'A2. the query uses the publisher\'s own Tag NAME');
        assert(query.includes(JSON.stringify(TAG)), 'A3. the query names the requested discovery tag');
        assert(query.includes('first: 7'), 'A4. the query honors maxResults');
        console.log('✓ Section A: the GraphQL query matches what the publisher tags');
    }

    {
        const first = envelopeOf({ id: 'claim-a' });
        const second = envelopeOf({ id: 'claim-b' });
        const gateway = makeGateway({ graphql: searchResultOf(['tx-a', 'tx-b']), transactions: { 'tx-a': first, 'tx-b': second } });
        const result = await sourceWith(gateway).search(TAG);
        assert(result.length === 2, 'B1. both transactions become payloads');
        assert(JSON.parse(result[0]).claim.id === 'claim-a' && JSON.parse(result[1]).claim.id === 'claim-b', 'B2. payloads keep search order');
        assert(gateway.requests[1].url === `${GATEWAY_URL}/tx-a`, 'B3. bodies are fetched from the configured gateway');
        console.log('✓ Section B: transaction bodies become raw payloads');
    }

    {
        const gateway = makeGateway({
            graphql: searchResultOf(['tx-missing', 'tx-error', 'tx-big', 'tx-declared-big', 'bad id!', 'tx-ok']),
            transactions: {
                'tx-error': new Error('network'),
                'tx-big': 'x'.repeat(3000),
                'tx-declared-big': response(200, 'small', { 'content-length': '5000' }),
                'tx-ok': envelopeOf()
            }
        });
        const result = await sourceWith(gateway, { maxEnvelopeBytes: 2000 }).search(TAG);
        assert(result.length === 1 && JSON.parse(result[0]).claim.id === 'claim-1', 'C1. only the readable, in-bounds transaction comes through');
        assert(!gateway.requests.some((r) => r.url.includes('bad id!')), 'C2. a malformed transaction id is never fetched');
        console.log('✓ Section C: one bad transaction never aborts the batch');
    }

    {
        await expectRejects(sourceWith(makeGateway({ graphql: response(502, 'bad gateway') })).search(TAG), 'D1. a non-OK search rejects');
        await expectRejects(sourceWith(makeGateway({ graphql: new Error('offline') })).search(TAG), 'D2. an unreachable search rejects');
        await expectRejects(sourceWith(makeGateway({ graphql: response(200, { data: {} }) })).search(TAG), 'D3. a malformed search body rejects');
        let threw = false;
        try { new ArweavePlaceNamingDiscoverySource({ graphqlUrl: '' }); } catch { threw = true; }
        assert(threw, 'D4. an empty graphqlUrl throws at construction');
        console.log('✓ Section D: a failed tag search rejects rather than looking empty');
    }

    {
        const gateway = makeGateway({ graphql: searchResultOf(['tx-a', 'tx-junk']), transactions: { 'tx-a': envelopeOf({ id: 'claim-e2e' }), 'tx-junk': 'not json' } });
        const service = new PlaceNamingDiscoveryQueryService([sourceWith(gateway), { search: async () => { throw new Error('other source down'); } }]);
        const results = await service.search(TAG);
        assert(results.length === 1 && results[0].claim.id === 'claim-e2e', 'E1. the aggregator parses the Arweave payload and ignores junk and a failed sibling source');
        console.log('✓ Section E: an Arweave-announced claim is discovered end to end');
    }

    console.log('\nAll ArweavePlaceNamingDiscoverySource tests passed.');
}

await run().catch((error) => {
    console.error('ArweavePlaceNamingDiscoverySource.test.js FAILED:', error);
    process.exitCode = 1;
});
