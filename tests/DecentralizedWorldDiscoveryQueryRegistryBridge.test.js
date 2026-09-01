import { readFile } from 'node:fs/promises';
import { DecentralizedDiscoveryQueryService } from '../application/DecentralizedWorldDiscoveryQuery.js';
import { queryDecentralizedWorldDiscoveryIntoRegistry } from '../application/DecentralizedWorldDiscoveryQueryRegistryBridge.js';
import { DecentralizedWorldDiscoveryLeadRegistry } from '../application/DecentralizedWorldDiscoveryLeadRegistry.js';

// 0.9.27 — Decentralized World Discovery Query → Lead Registry Bridge.
//
// See docs/Roadmap.md, "0.9.27 — Decentralized World Discovery Query →
// Lead Registry Bridge," for the full milestone story. These tests run
// against the real 0.9.25 query function and the real 0.9.26 registry —
// this bridge's own job is exactly the wiring between two already-tested
// pieces, so its own coverage exercises that wiring end-to-end rather than
// re-mocking either half.

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
    // 1. Every lead a query returns is stored in the registry.
    // ---------------------------------------------------------------
    {
        const registry = new DecentralizedWorldDiscoveryLeadRegistry();
        const service = new FakeDiscoveryQueryService('dweb:fake-service', [
            { uri: 'ar://aaa', storage: 'ar' },
            { uri: 'ipfs://bbb' }
        ]);

        const leads = await queryDecentralizedWorldDiscoveryIntoRegistry(registry, service, 'forkbuild_random_unique');

        assert(leads.length === 2, 'the bridge resolves to every lead the query produced');
        assert(registry.listLeads().length === 2, 'every returned lead is stored in the registry');
        assert(registry.listLeads()[0].uri === 'ar://aaa' && registry.listLeads()[1].uri === 'ipfs://bbb', 'the stored leads match the query results, in order');

        console.log('✓ 1. Every lead a query returns is stored in the registry');
    }

    // ---------------------------------------------------------------
    // 2. A later call for the same (origin, discoveryTag, uri) replaces,
    //    never accumulates — the registry's own contract, unmodified.
    // ---------------------------------------------------------------
    {
        const registry = new DecentralizedWorldDiscoveryLeadRegistry();
        const service = new FakeDiscoveryQueryService('dweb:fake-service', [{ uri: 'ar://aaa', storage: 'ar' }]);

        await queryDecentralizedWorldDiscoveryIntoRegistry(registry, service, 'tag');
        await queryDecentralizedWorldDiscoveryIntoRegistry(registry, service, 'tag');

        assert(registry.listLeads().length === 1, 'the same (origin, discoveryTag, uri) triple across two calls replaces rather than accumulates');

        console.log('✓ 2. A later call for the same triple replaces, never accumulates');
    }

    // ---------------------------------------------------------------
    // 3. Two different discovery services reporting the same uri remain
    //    two independent leads — the bridge introduces no dedup of its own.
    // ---------------------------------------------------------------
    {
        const registry = new DecentralizedWorldDiscoveryLeadRegistry();
        const serviceA = new FakeDiscoveryQueryService('dweb:service-a', [{ uri: 'ar://shared' }]);
        const serviceB = new FakeDiscoveryQueryService('dweb:service-b', [{ uri: 'ar://shared' }]);

        await queryDecentralizedWorldDiscoveryIntoRegistry(registry, serviceA, 'tag');
        await queryDecentralizedWorldDiscoveryIntoRegistry(registry, serviceB, 'tag');

        assert(registry.listLeads().length === 2, 'two services reporting the identical uri produce two independent stored leads');

        console.log('✓ 3. Two services reporting the same uri never collapse into one stored lead');
    }

    // ---------------------------------------------------------------
    // 4. A query that returns nothing stores nothing, and never throws.
    // ---------------------------------------------------------------
    {
        const registry = new DecentralizedWorldDiscoveryLeadRegistry();
        const emptyService = new FakeDiscoveryQueryService('dweb:empty', []);

        const leads = await queryDecentralizedWorldDiscoveryIntoRegistry(registry, emptyService, 'tag');
        assert(leads.length === 0, 'an empty search() result resolves to an empty array');
        assert(registry.listLeads().length === 0, 'nothing is stored when the query finds nothing');

        const rejectingService = new FakeDiscoveryQueryService('dweb:rejecting', async () => { throw new Error('network down'); });
        let threw = false;
        try {
            await queryDecentralizedWorldDiscoveryIntoRegistry(registry, rejectingService, 'tag');
        } catch {
            threw = true;
        }
        assert(!threw, 'a rejecting search() never propagates out of the bridge');
        assert(registry.listLeads().length === 0, 'a rejecting search() stores nothing');

        console.log('✓ 4. A query that returns nothing stores nothing, and never throws');
    }

    // ---------------------------------------------------------------
    // 5. A missing or malformed registry is a no-op — the service is never
    //    even queried.
    // ---------------------------------------------------------------
    {
        const service = new FakeDiscoveryQueryService('dweb:fake', [{ uri: 'ar://aaa' }]);

        assert((await queryDecentralizedWorldDiscoveryIntoRegistry(null, service, 'tag')).length === 0, 'a missing registry resolves to []');
        assert((await queryDecentralizedWorldDiscoveryIntoRegistry({}, service, 'tag')).length === 0, 'a registry with no setLead() resolves to []');
        assert((await queryDecentralizedWorldDiscoveryIntoRegistry({ setLead: 'not-a-function' }, service, 'tag')).length === 0, 'a registry whose setLead is not a function resolves to []');
        assert(service.calls.length === 0, 'the service is never queried when the registry is missing or malformed');

        console.log('✓ 5. A missing or malformed registry is a no-op, and the service is never queried');
    }

    // ---------------------------------------------------------------
    // 6. One malformed candidate never blocks the well-formed leads around
    //    it from being stored — inherited from the query layer, unmodified.
    // ---------------------------------------------------------------
    {
        const registry = new DecentralizedWorldDiscoveryLeadRegistry();
        const service = new FakeDiscoveryQueryService('dweb:fake', [
            { uri: 'ar://good-1' },
            { uri: '' },
            null,
            { uri: 'ar://good-2' }
        ]);

        const leads = await queryDecentralizedWorldDiscoveryIntoRegistry(registry, service, 'tag');
        assert(leads.length === 2, 'only well-formed candidates become leads');
        assert(registry.listLeads().length === 2, 'only well-formed leads are stored');

        console.log('✓ 6. A malformed candidate is dropped, never blocking the well-formed leads around it');
    }

    // ---------------------------------------------------------------
    // 7. subscribe() on the registry fires exactly once per newly-stored
    //    lead, through the bridge, exactly as it would through a direct
    //    setLead() call.
    // ---------------------------------------------------------------
    {
        const registry = new DecentralizedWorldDiscoveryLeadRegistry();
        let notifications = 0;
        registry.subscribe(() => { notifications++; });

        const service = new FakeDiscoveryQueryService('dweb:fake', [
            { uri: 'ar://one' },
            { uri: 'ar://two' }
        ]);
        await queryDecentralizedWorldDiscoveryIntoRegistry(registry, service, 'tag');

        assert(notifications === 2, 'each newly-stored lead notifies the registry\'s own subscribers exactly once');

        console.log('✓ 7. Registry subscribers are notified exactly as they would be through a direct setLead() call');
    }

    // ---------------------------------------------------------------
    // 8. Architectural regression: this file never reaches past the two
    //    seams it bridges, and carries no trust/dedup vocabulary.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/DecentralizedWorldDiscoveryQueryRegistryBridge.js', import.meta.url);
        const fullSource = await readFile(sourceUrl, 'utf8');
        const codeOnly = fullSource
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        assert(!codeOnly.includes('DecentralizedWorldDiscoveryLeadRegistry'), 'the bridge code must never import the registry CLASS, only duck-type registry.setLead');
        assert(!codeOnly.includes('WorldDiscoverySourceRegistry'), 'the bridge code must never reference WorldDiscoverySourceRegistry');
        assert(!codeOnly.includes('WorldEncounter'), 'the bridge code must never reference WorldEncounter');
        assert(!codeOnly.includes('ContentReference'), 'the bridge code must never reference ContentReference');
        assert(!codeOnly.includes('DecentralizedPublication'), 'the bridge code must never reference DecentralizedPublication');
        assert(!codeOnly.includes('removeLead'), 'the bridge code must never call removeLead()');
        assert(!/fetch\(/.test(codeOnly), 'the bridge code must never call fetch(...) directly');
        assert(!codeOnly.includes('setTimeout') && !codeOnly.includes('setInterval'), 'the bridge code must never schedule or poll on its own');

        const forbiddenTerms = ['trusted', 'verified', 'authority', 'priority', 'weight', 'confidence', 'ranking', 'scoring', 'dedup', 'stale', 'expired'];
        for (const term of forbiddenTerms) {
            assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `the bridge code must never use "${term}"`);
        }

        console.log('✓ 8. Architectural regression: no reach past the two bridged seams, no trust/dedup vocabulary');
    }

    console.log('\nAll DecentralizedWorldDiscoveryQueryRegistryBridge tests passed.');
}

run().catch((error) => {
    console.error('DecentralizedWorldDiscoveryQueryRegistryBridge.test.js FAILED:', error);
    process.exitCode = 1;
});
