import { NostrDiscoveryQueryService } from '../application/NostrDiscoveryQueryService.js';
import { DecentralizedDiscoveryQueryService } from '../application/DecentralizedWorldDiscoveryQuery.js';

// 0.9.31 — Nostr Decentralized Discovery Adapter.
//
// Deterministic, network-free coverage of application/
// NostrDiscoveryQueryService.js's own behavior — every scenario below
// runs against an injected `queryImpl` standing in for a real Nostr
// relay's own subscribe/collect/EOSE exchange, never a live one, the
// identical technique tests/ArweaveGraphqlDiscoveryQueryService.test.js
// already established for this codebase's other real-network discovery
// adapter.
//
//   Section A: well-formed events carrying a well-formed envelope in
//              `content` become { uri, storage } candidates, in order
//   Section B: zero events is []
//   Section C: an event whose content is not a describable ForkBuild
//              envelope is silently skipped, not a crash
//   Section D: queryImpl rejecting is [], never propagating
//   Section E: queryImpl resolving to a non-array is []
//   Section F: queryImpl never settling is [] once timeoutMs elapses
//   Section G: the outgoing filter names the configured tag name, the
//              discovery tag being searched for, and the configured kinds
//   Section H: this class is a real DecentralizedDiscoveryQueryService,
//              names itself by relay url, and never by an event's own id
//   Section I: storage is read off the envelope's own uri scheme, never
//              hard-coded, and degrades to null with no recognizable scheme
//   Section J: a constructor with no queryImpl throws immediately

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function envelopeOf(overrides = {}) {
    return {
        protocol: 'forkbuild',
        version: 1,
        kind: 'PUBLICATION',
        objectId: 'pub-1',
        uri: 'ar://ABC123',
        ...overrides
    };
}

function eventOf(content, overrides = {}) {
    return {
        id: 'event-id',
        pubkey: 'some-pubkey',
        kind: 1,
        tags: [['t', 'forkbuild_random_unique']],
        content: typeof content === 'string' ? content : JSON.stringify(content),
        sig: 'some-signature',
        ...overrides
    };
}

function makeFakeRelay({ handler }) {
    const calls = [];
    async function queryImpl(relayUrl, filter) {
        calls.push({ relayUrl, filter });
        return handler(relayUrl, filter);
    }
    return { calls, queryImpl };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — well-formed events become candidates, in order.
    // ---------------------------------------------------------------
    {
        const relay = makeFakeRelay({
            handler: () => [
                eventOf(envelopeOf({ objectId: 'pub-1', uri: 'ar://AAA' })),
                eventOf(envelopeOf({ objectId: 'pub-2', uri: 'ipfs://BBB' }))
            ]
        });
        const service = new NostrDiscoveryQueryService({ queryImpl: relay.queryImpl });

        const candidates = await service.search('forkbuild_random_unique');
        assert(candidates.length === 2, '1. two events become two candidates');
        assert(candidates[0].uri === 'ar://AAA' && candidates[0].storage === 'ar', '2. the first candidate carries the envelope\'s own uri and a scheme-derived storage');
        assert(candidates[1].uri === 'ipfs://BBB' && candidates[1].storage === 'ipfs', '3. the second candidate is independent of the first');
    }
    console.log('✓ Section A: well-formed events carrying a well-formed envelope become { uri, storage } candidates, in order');

    // ---------------------------------------------------------------
    // Section B — zero events is [].
    // ---------------------------------------------------------------
    {
        const relay = makeFakeRelay({ handler: () => [] });
        const service = new NostrDiscoveryQueryService({ queryImpl: relay.queryImpl });

        const candidates = await service.search('forkbuild_random_unique');
        assert(Array.isArray(candidates) && candidates.length === 0, '4. a well-formed but empty result set is an empty array, not null or undefined');
    }
    console.log('✓ Section B: zero events is []');

    // ---------------------------------------------------------------
    // Section C — an event whose content is not a describable envelope is
    // silently skipped.
    // ---------------------------------------------------------------
    {
        const relay = makeFakeRelay({
            handler: () => [
                eventOf('not json at all {{{'),
                eventOf({ protocol: 'some-other-app', version: 1, kind: 'PUBLICATION', objectId: 'x', uri: 'ar://x' }),
                eventOf({ protocol: 'forkbuild', version: 1 }),
                eventOf(undefined, { content: undefined }),
                eventOf(envelopeOf({ objectId: 'pub-good', uri: 'ar://GOOD' }))
            ]
        });
        const service = new NostrDiscoveryQueryService({ queryImpl: relay.queryImpl });

        const candidates = await service.search('forkbuild_random_unique');
        assert(candidates.length === 1, '5. only the one describable envelope survives, the rest are silently skipped');
        assert(candidates[0].uri === 'ar://GOOD', '6. the surviving candidate is the well-formed one, not corrupted by the others');
    }
    console.log('✓ Section C: an event whose content is not a describable ForkBuild envelope is silently skipped, not a crash');

    // ---------------------------------------------------------------
    // Section D — queryImpl rejecting never propagates.
    // ---------------------------------------------------------------
    {
        const relay = makeFakeRelay({ handler: () => { throw new Error('simulated relay failure'); } });
        const service = new NostrDiscoveryQueryService({ queryImpl: relay.queryImpl });

        let threw = false;
        let candidates;
        try {
            candidates = await service.search('forkbuild_random_unique');
        } catch {
            threw = true;
        }
        assert(!threw, '7. a rejecting queryImpl never propagates out of search()');
        assert(Array.isArray(candidates) && candidates.length === 0, '8. a rejecting queryImpl is reported as no candidates');
    }
    console.log('✓ Section D: queryImpl rejecting is [], never propagating');

    // ---------------------------------------------------------------
    // Section E — queryImpl resolving to a non-array is [].
    // ---------------------------------------------------------------
    {
        const relay = makeFakeRelay({ handler: () => ({ not: 'an array' }) });
        const service = new NostrDiscoveryQueryService({ queryImpl: relay.queryImpl });

        const candidates = await service.search('forkbuild_random_unique');
        assert(Array.isArray(candidates) && candidates.length === 0, '9. a non-array result degrades to no candidates, never a crash');
    }
    console.log('✓ Section E: queryImpl resolving to a non-array is []');

    // ---------------------------------------------------------------
    // Section F — queryImpl never settling degrades to [] once timeoutMs
    // elapses.
    // ---------------------------------------------------------------
    {
        const neverSettles = () => new Promise(() => {});
        const service = new NostrDiscoveryQueryService({ queryImpl: neverSettles, timeoutMs: 20 });

        const start = Date.now();
        const candidates = await service.search('forkbuild_random_unique');
        const elapsed = Date.now() - start;
        assert(Array.isArray(candidates) && candidates.length === 0, '10. a queryImpl that never settles degrades to no candidates');
        assert(elapsed < 2000, '11. search() actually returns once timeoutMs elapses, rather than hanging forever');
    }
    console.log('✓ Section F: queryImpl never settling is [] once timeoutMs elapses');

    // ---------------------------------------------------------------
    // Section G — the outgoing filter names the configured tag, the
    // discovery tag, and the configured kinds.
    // ---------------------------------------------------------------
    {
        const relay = makeFakeRelay({ handler: () => [] });
        const service = new NostrDiscoveryQueryService({
            queryImpl: relay.queryImpl,
            relayUrl: 'wss://my-relay.example',
            tagName: 'my-custom-tag',
            kinds: [1, 30078],
            maxResults: 7
        });

        await service.search('forkbuild_random_unique');
        assert(relay.calls.length === 1, '12. exactly one queryImpl call is made per search() call');
        const { relayUrl, filter } = relay.calls[0];
        assert(relayUrl === 'wss://my-relay.example', '13. queryImpl is called with the configured relay url');
        assert(Array.isArray(filter.kinds) && filter.kinds[0] === 1 && filter.kinds[1] === 30078, '14. the filter names the configured kinds');
        assert(Array.isArray(filter['#my-custom-tag']) && filter['#my-custom-tag'][0] === 'forkbuild_random_unique', '15. the filter names the configured tag name and the discovery tag being searched for');
        assert(filter.limit === 7, '16. the filter names the configured maxResults as its own limit');
    }
    console.log('✓ Section G: the outgoing filter names the configured tag name, the discovery tag being searched for, and the configured kinds');

    // ---------------------------------------------------------------
    // Section H — this class really is a DecentralizedDiscoveryQueryService,
    // and names itself via origin, never an event's own id.
    // ---------------------------------------------------------------
    {
        const service = new NostrDiscoveryQueryService({ queryImpl: async () => [] });
        assert(service instanceof DecentralizedDiscoveryQueryService, '17. NostrDiscoveryQueryService extends DecentralizedDiscoveryQueryService');
        assert(typeof service.origin === 'string' && service.origin.includes(NostrDiscoveryQueryService.DEFAULT_RELAY_URL), '18. origin names the relay url');

        const other = new NostrDiscoveryQueryService({ relayUrl: 'wss://a-different-relay.example', queryImpl: async () => [] });
        assert(other.origin !== service.origin, '19. two instances pointed at two different relays report two different origins');
    }
    console.log('✓ Section H: this class is a real DecentralizedDiscoveryQueryService, naming itself by relay url');

    // ---------------------------------------------------------------
    // Section I — storage is read off the envelope's own uri scheme.
    // ---------------------------------------------------------------
    {
        const relay = makeFakeRelay({
            handler: () => [
                eventOf(envelopeOf({ objectId: 'a', uri: 'ar://scheme-a' })),
                eventOf(envelopeOf({ objectId: 'b', uri: 'ipfs://scheme-b' })),
                eventOf(envelopeOf({ objectId: 'c', uri: 'https://scheme-c.example/x' })),
                eventOf(envelopeOf({ objectId: 'd', uri: 'no-recognizable-scheme-here' }))
            ]
        });
        const service = new NostrDiscoveryQueryService({ queryImpl: relay.queryImpl });

        const candidates = await service.search('forkbuild_random_unique');
        assert(candidates[0].storage === 'ar', '20. an ar:// uri reports "ar" storage');
        assert(candidates[1].storage === 'ipfs', '21. an ipfs:// uri reports "ipfs" storage');
        assert(candidates[2].storage === 'https', '22. an https:// uri reports "https" storage');
        assert(candidates[3].storage === null, '23. a uri with no recognizable scheme degrades to null storage, not a crash or a guess');
    }
    console.log('✓ Section I: storage is read off the envelope\'s own uri scheme, never hard-coded, and degrades to null with no recognizable scheme');

    // ---------------------------------------------------------------
    // Section J — a constructor with no queryImpl throws immediately.
    // ---------------------------------------------------------------
    {
        let threw = false;
        try {
            new NostrDiscoveryQueryService({});
        } catch {
            threw = true;
        }
        assert(threw, '24. constructing this class with no queryImpl throws immediately — there is no ambient default');
    }
    console.log('✓ Section J: a constructor with no queryImpl throws immediately');

    console.log('\nAll NostrDiscoveryQueryService tests passed.');
}

run().catch((error) => {
    console.error('NostrDiscoveryQueryService.test.js FAILED:', error);
    process.exitCode = 1;
});
