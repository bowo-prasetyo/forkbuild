import { readFile } from 'node:fs/promises';
import {
    DecentralizedDiscoveryQueryService,
    queryDecentralizedWorldDiscovery
} from '../application/DecentralizedWorldDiscoveryQuery.js';

// 0.9.25 — Decentralized Discovery Query Adapter.
//
// See docs/Roadmap.md, "0.9.25 — Decentralized Discovery Query Adapter,"
// for the full milestone story. Every scenario below runs against a
// mocked `DecentralizedDiscoveryQueryService`, never a live one — this
// orchestration layer is service-agnostic, and its own tests never import
// `application/ArweaveGraphqlDiscoveryQueryService.js` at all (see
// tests/ArweaveGraphqlDiscoveryQueryService.test.js for that adapter's
// own, separately-mocked wire coverage).

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class FakeDiscoveryQueryService extends DecentralizedDiscoveryQueryService {
    constructor(origin, candidates) {
        super();
        this._origin = origin;
        this._candidates = candidates;
        this.calls = [];
    }
    get origin() { return this._origin; }
    async search(discoveryTag) {
        this.calls.push(discoveryTag);
        if (typeof this._candidates === 'function') {
            return this._candidates(discoveryTag);
        }
        return this._candidates;
    }
}

async function run() {
    // ---------------------------------------------------------------
    // 1. Basic shape: candidates become leads, origin/discoveryTag stamped
    // ---------------------------------------------------------------
    {
        const service = new FakeDiscoveryQueryService('dweb:fake-service', [
            { uri: 'ipfs://cid-1', storage: 'ipfs' },
            { uri: 'ar://tx-2' }
        ]);

        const leads = await queryDecentralizedWorldDiscovery(service, 'forkbuild_random_unique');
        assert(leads.length === 2, 'each candidate becomes exactly one lead');
        assert(leads[0].origin === 'dweb:fake-service' && leads[1].origin === 'dweb:fake-service', 'every lead is stamped with the service\'s own origin');
        assert(leads[0].discoveryTag === 'forkbuild_random_unique' && leads[1].discoveryTag === 'forkbuild_random_unique', 'every lead is stamped with the queried discoveryTag');
        assert(leads[0].uri === 'ipfs://cid-1' && leads[0].storage === 'ipfs', 'a candidate\'s own uri/storage is carried onto its lead');
        assert(leads[1].storage === null, 'a candidate with no storage degrades to null, exactly like describeDecentralizedWorldDiscoveryLead() does directly');
        assert(Object.isFrozen(leads), 'the returned array is frozen');
        assert(service.calls.length === 1 && service.calls[0] === 'forkbuild_random_unique', 'the service is asked exactly once, with the exact discoveryTag given');

        console.log('✓ 1. Basic shape: candidates become leads, origin/discoveryTag stamped');
    }

    // ---------------------------------------------------------------
    // 2. Malformed input and a malformed service both degrade to []
    // ---------------------------------------------------------------
    {
        const service = new FakeDiscoveryQueryService('dweb:fake-service', [{ uri: 'ipfs://cid' }]);

        assert((await queryDecentralizedWorldDiscovery(service, '')).length === 0, '1. an empty discoveryTag is []');
        assert((await queryDecentralizedWorldDiscovery(service, null)).length === 0, '2. a null discoveryTag is []');
        assert((await queryDecentralizedWorldDiscovery(service)).length === 0, '3. a missing discoveryTag is []');
        assert((await queryDecentralizedWorldDiscovery(null, 'tag')).length === 0, '4. a missing service is []');
        assert((await queryDecentralizedWorldDiscovery({}, 'tag')).length === 0, '5. a service with no search() is []');
        assert((await queryDecentralizedWorldDiscovery({ origin: 'x', search: 'not-a-function' }, 'tag')).length === 0, '6. a service whose search is not a function is []');

        const throwingOrigin = new FakeDiscoveryQueryService('irrelevant', []);
        Object.defineProperty(throwingOrigin, 'origin', { get() { throw new Error('boom'); } });
        assert((await queryDecentralizedWorldDiscovery(throwingOrigin, 'tag')).length === 0, '7. a service whose origin getter throws is []');

        const emptyOrigin = new FakeDiscoveryQueryService('', []);
        assert((await queryDecentralizedWorldDiscovery(emptyOrigin, 'tag')).length === 0, '8. a service with an empty-string origin is []');

        const numericOrigin = new FakeDiscoveryQueryService(42, []);
        assert((await queryDecentralizedWorldDiscovery(numericOrigin, 'tag')).length === 0, '9. a service with a non-string origin is []');

        console.log('✓ 2. Malformed input and a malformed service both degrade to []');
    }

    // ---------------------------------------------------------------
    // 3. A failed or malformed search() never throws and never corrupts
    //    the result — it degrades to [], independent of any other call
    // ---------------------------------------------------------------
    {
        const rejecting = new FakeDiscoveryQueryService('dweb:fake', async () => { throw new Error('network down'); });
        let threw = false;
        let leads;
        try {
            leads = await queryDecentralizedWorldDiscovery(rejecting, 'tag');
        } catch {
            threw = true;
        }
        assert(!threw, 'a rejecting search() never propagates out of queryDecentralizedWorldDiscovery()');
        assert(leads.length === 0, 'a rejecting search() is reported as no leads');

        const nonArray = new FakeDiscoveryQueryService('dweb:fake', { not: 'an array' });
        assert((await queryDecentralizedWorldDiscovery(nonArray, 'tag')).length === 0, 'a search() resolving to a non-array is []');

        // A previously-produced, independent result is never mutated by a
        // later, failing call against a different service.
        const goodService = new FakeDiscoveryQueryService('dweb:good', [{ uri: 'ipfs://still-here' }]);
        const earlierLeads = await queryDecentralizedWorldDiscovery(goodService, 'tag');
        await queryDecentralizedWorldDiscovery(rejecting, 'tag');
        assert(earlierLeads.length === 1 && earlierLeads[0].uri === 'ipfs://still-here', 'an unrelated earlier result is untouched by a later failing call');

        console.log('✓ 3. A failed or malformed search() never throws and never corrupts an earlier result');
    }

    // ---------------------------------------------------------------
    // 4. One malformed candidate is dropped, never invalidating the batch
    // ---------------------------------------------------------------
    {
        const service = new FakeDiscoveryQueryService('dweb:fake', [
            { uri: 'ipfs://good-1' },
            { uri: '' },
            null,
            { uri: 'ipfs://good-2', storage: 42 },
            { storage: 'ipfs' }
        ]);

        const leads = await queryDecentralizedWorldDiscovery(service, 'tag');
        assert(leads.length === 2, 'only the well-formed candidates become leads');
        assert(leads[0].uri === 'ipfs://good-1' && leads[1].uri === 'ipfs://good-2', 'the surviving leads are exactly the well-formed candidates, in order');
        assert(leads[1].storage === null, 'a non-string storage on an otherwise-valid candidate degrades to null rather than dropping the whole candidate');

        console.log('✓ 4. One malformed candidate is dropped, never invalidating the batch');
    }

    // ---------------------------------------------------------------
    // 5. Two services querying the same tag never combine, dedupe, or rank
    // ---------------------------------------------------------------
    {
        const serviceA = new FakeDiscoveryQueryService('dweb:service-a', [{ uri: 'ipfs://shared-cid' }]);
        const serviceB = new FakeDiscoveryQueryService('dweb:service-b', [{ uri: 'ipfs://shared-cid' }]);

        const leadsA = await queryDecentralizedWorldDiscovery(serviceA, 'tag');
        const leadsB = await queryDecentralizedWorldDiscovery(serviceB, 'tag');
        assert(leadsA.length === 1 && leadsB.length === 1, 'each call independently reports its own service\'s candidates');
        assert(leadsA[0].origin !== leadsB[0].origin, 'two leads sharing a uri still carry their own service\'s own origin');

        console.log('✓ 5. Two services querying the same tag never combine, dedupe, or rank');
    }

    // ---------------------------------------------------------------
    // 6. DecentralizedDiscoveryQueryService base class throws if unimplemented
    // ---------------------------------------------------------------
    {
        const base = new DecentralizedDiscoveryQueryService();
        let originThrew = false;
        try { void base.origin; } catch { originThrew = true; }
        assert(originThrew, 'accessing origin on the base class throws');

        let searchThrew = false;
        try { await base.search('tag'); } catch { searchThrew = true; }
        assert(searchThrew, 'calling search() on the base class throws');

        console.log('✓ 6. DecentralizedDiscoveryQueryService base class throws if unimplemented');
    }

    // ---------------------------------------------------------------
    // 7. No registry, no WorldEncounter, no UI, no network vocabulary in
    //    this orchestration file's own code
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/DecentralizedWorldDiscoveryQuery.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'WorldDiscoverySourceRegistry', 'WorldEncounter',
            'fetch(', 'WebSocket', 'arweave', 'ipfs', 'graphql',
            'trust', 'priority', 'confidence', 'rank', 'dedup', 'cache'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `application/DecentralizedWorldDiscoveryQuery.js code must never use the word "${term}"`);
        }

        console.log('✓ 7. No registry, no WorldEncounter, no UI, no network/backend/trust vocabulary in this file\'s own code');
    }

    console.log('\nAll DecentralizedWorldDiscoveryQuery tests passed.');
}

run().catch((error) => {
    console.error('DecentralizedWorldDiscoveryQuery.test.js FAILED:', error);
    process.exitCode = 1;
});
