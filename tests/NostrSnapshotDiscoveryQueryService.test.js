import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';

// 0.9.133 — Nostr Snapshot Discovery Query Service.
// See docs/Roadmap.md, "0.9.133 — Snapshot Location Discovery via Nostr."
//
// Deterministic, network-free coverage of application/
// NostrSnapshotDiscoveryQueryService.js's own behavior — every scenario
// below runs against an injected `queryImpl` standing in for a real Nostr
// relay's own subscribe/collect/EOSE exchange, never a live one, the
// identical technique tests/NostrDiscoveryQueryService.test.js already
// established for this file's own nearest sibling.
//
//   Section A: well-formed events carrying a well-formed envelope in
//              `content` become { contentHash, locator, storage }
//              candidates, in order
//   Section B: zero events is []
//   Section C: an event whose content is not a describable envelope is
//              silently skipped, not a crash
//   Section D: queryImpl rejecting is [], never propagating
//   Section E: queryImpl resolving to a non-array is []
//   Section F: queryImpl never settling is [] once timeoutMs elapses
//   Section G: the outgoing filter names the configured tag name, the
//              discovery tag being searched for, and the configured kinds
//   Section H: resolveLocator() finds the first matching contentHash, or
//              null when none matches; multiple candidates for the same
//              contentHash are all still reported by search() — no ranking
//   Section I: a constructor with no queryImpl throws immediately

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch { threw = true; }
    assert(threw, message);
}

function envelopeOf(overrides = {}) {
    return {
        protocol: 'forkbuild-snapshot-discovery',
        version: 1,
        contentHash: 'snapshot-hash-1',
        locator: 'ar://SnapshotTx000000000000000000001',
        storage: 'ar',
        ...overrides
    };
}

function eventOf(content, overrides = {}) {
    return {
        id: 'event-id',
        pubkey: 'some-pubkey',
        kind: 1,
        tags: [['t', 'forkbuild-snapshot']],
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
        const events = [
            eventOf(envelopeOf({ contentHash: 'hash-1', locator: 'ar://tx1' })),
            eventOf(envelopeOf({ contentHash: 'hash-2', locator: 'ipfs://cid2', storage: 'ipfs' }))
        ];
        const relay = makeFakeRelay({ handler: () => events });
        const service = new NostrSnapshotDiscoveryQueryService({ queryImpl: relay.queryImpl });

        const candidates = await service.search('forkbuild-snapshot');
        assert(candidates.length === 2, '1. FLAGSHIP — two well-formed events become two candidates');
        assert(candidates[0].contentHash === 'hash-1' && candidates[0].locator === 'ar://tx1' && candidates[0].storage === 'ar', '2. FLAGSHIP — the first candidate carries the first event\'s own fields');
        assert(candidates[1].contentHash === 'hash-2' && candidates[1].locator === 'ipfs://cid2' && candidates[1].storage === 'ipfs', '3. FLAGSHIP — the second candidate carries the second event\'s own fields, order preserved');
    }
    console.log('✓ Section A: well-formed events become { contentHash, locator, storage } candidates, in order');

    // ---------------------------------------------------------------
    // Section B — zero events is [].
    // ---------------------------------------------------------------
    {
        const relay = makeFakeRelay({ handler: () => [] });
        const service = new NostrSnapshotDiscoveryQueryService({ queryImpl: relay.queryImpl });
        const candidates = await service.search('forkbuild-snapshot');
        assert(Array.isArray(candidates) && candidates.length === 0, '4. zero events reported by the relay resolves to []');
    }
    console.log('✓ Section B: zero events is []');

    // ---------------------------------------------------------------
    // Section C — an undescribable event is silently skipped.
    // ---------------------------------------------------------------
    {
        const events = [
            eventOf('not valid json at all'),
            eventOf({ some: 'unrelated payload' }),
            eventOf(envelopeOf({ protocol: 'some-other-protocol' })),
            eventOf(envelopeOf({ contentHash: '' })),
            eventOf(envelopeOf({ contentHash: 'hash-good', locator: 'ar://good-tx' }))
        ];
        const relay = makeFakeRelay({ handler: () => events });
        const service = new NostrSnapshotDiscoveryQueryService({ queryImpl: relay.queryImpl });

        const candidates = await service.search('forkbuild-snapshot');
        assert(candidates.length === 1, '5. only the one well-formed event among five becomes a candidate');
        assert(candidates[0].contentHash === 'hash-good', '6. the surviving candidate is the well-formed one, others silently skipped');
    }
    console.log('✓ Section C: an event whose content is not a describable envelope is silently skipped, never a crash');

    // ---------------------------------------------------------------
    // Section D — queryImpl rejecting is [], never propagating.
    // ---------------------------------------------------------------
    {
        const failingImpl = async () => { throw new Error('simulated relay connection failure'); };
        const service = new NostrSnapshotDiscoveryQueryService({ queryImpl: failingImpl });
        const candidates = await service.search('forkbuild-snapshot');
        assert(Array.isArray(candidates) && candidates.length === 0, '7. a rejecting queryImpl resolves to [], never propagates');
    }
    console.log('✓ Section D: a rejecting queryImpl degrades to []');

    // ---------------------------------------------------------------
    // Section E — queryImpl resolving to a non-array is [].
    // ---------------------------------------------------------------
    {
        for (const badValue of [null, undefined, 'not an array', {}, 42]) {
            const service = new NostrSnapshotDiscoveryQueryService({ queryImpl: async () => badValue });
            const candidates = await service.search('forkbuild-snapshot');
            assert(Array.isArray(candidates) && candidates.length === 0, `8. queryImpl resolving to ${JSON.stringify(badValue)} degrades to []`);
        }
    }
    console.log('✓ Section E: a non-array queryImpl resolution degrades to []');

    // ---------------------------------------------------------------
    // Section F — queryImpl never settling is [] once timeoutMs elapses.
    // ---------------------------------------------------------------
    {
        const neverSettles = () => new Promise(() => {});
        const service = new NostrSnapshotDiscoveryQueryService({ queryImpl: neverSettles, timeoutMs: 20 });
        const candidates = await service.search('forkbuild-snapshot');
        assert(Array.isArray(candidates) && candidates.length === 0, '9. a queryImpl that never settles degrades to [] once timeoutMs elapses');
    }
    console.log('✓ Section F: a queryImpl timeout degrades to []');

    // ---------------------------------------------------------------
    // Section G — the outgoing filter names the configured tag name,
    // discovery tag, and kinds.
    // ---------------------------------------------------------------
    {
        const relay = makeFakeRelay({ handler: () => [] });
        const service = new NostrSnapshotDiscoveryQueryService({
            relayUrl: 'wss://custom-relay.example',
            tagName: 'x',
            kinds: [1, 30078],
            maxResults: 5,
            queryImpl: relay.queryImpl
        });

        await service.search('forkbuild-snapshot-campaign-42');
        assert(relay.calls.length === 1, '10. exactly one query call is made');
        const { relayUrl, filter } = relay.calls[0];
        assert(relayUrl === 'wss://custom-relay.example', '11. queryImpl is invoked against the configured relay');
        assert(JSON.stringify(filter.kinds) === JSON.stringify([1, 30078]), '12. the filter names the configured kinds');
        assert(JSON.stringify(filter['#x']) === JSON.stringify(['forkbuild-snapshot-campaign-42']), '13. the filter matches on the configured tag name and the discovery tag being searched for');
        assert(filter.limit === 5, '14. the filter carries the configured maxResults as its own limit');
    }
    console.log('✓ Section G: the outgoing filter carries the configured tag name, discovery tag, kinds, and limit');

    // ---------------------------------------------------------------
    // Section H — resolveLocator() finds the first matching contentHash,
    // or null; multiple candidates for the same contentHash are all still
    // reported by search() — no ranking.
    // ---------------------------------------------------------------
    {
        const events = [
            eventOf(envelopeOf({ contentHash: 'hash-a', locator: 'ar://tx-a', storage: 'ar' })),
            eventOf(envelopeOf({ contentHash: 'hash-b', locator: 'ipfs://cid-b', storage: 'ipfs' })),
            eventOf(envelopeOf({ contentHash: 'hash-a', locator: 'ar://tx-a-second-announcement', storage: 'ar' }))
        ];
        const relay = makeFakeRelay({ handler: () => events });
        const service = new NostrSnapshotDiscoveryQueryService({ queryImpl: relay.queryImpl });

        const resolvedA = await service.resolveLocator('forkbuild-snapshot', 'hash-a');
        assert(resolvedA === 'ar://tx-a', '15. resolveLocator() returns the FIRST candidate\'s own locator for a matching contentHash');

        const resolvedB = await service.resolveLocator('forkbuild-snapshot', 'hash-b');
        assert(resolvedB === 'ipfs://cid-b', '16. resolveLocator() resolves a different contentHash to its own, distinct locator');

        const resolvedMissing = await service.resolveLocator('forkbuild-snapshot', 'hash-nonexistent');
        assert(resolvedMissing === null, '17. resolveLocator() returns null when no candidate matches the requested contentHash');

        const allForHashA = (await service.search('forkbuild-snapshot')).filter((c) => c.contentHash === 'hash-a');
        assert(allForHashA.length === 2, '18. search() itself still reports BOTH candidates for hash-a — resolveLocator() picking the first is never search() discarding the second; no ranking is performed');
    }
    console.log('✓ Section H: resolveLocator() picks the first match; search() itself performs no ranking or deduplication');

    // ---------------------------------------------------------------
    // Section I — a constructor with no queryImpl throws immediately.
    // ---------------------------------------------------------------
    {
        expectThrows(() => new NostrSnapshotDiscoveryQueryService({}), '19. a missing queryImpl throws at construction time');
        expectThrows(() => new NostrSnapshotDiscoveryQueryService({ queryImpl: 'not-a-function' }), '20. a non-function queryImpl throws at construction time');
    }
    console.log('✓ Section I: a constructor with no queryImpl throws immediately');

    console.log('\nAll NostrSnapshotDiscoveryQueryService tests passed.');
}

run().catch((error) => {
    console.error('NostrSnapshotDiscoveryQueryService.test.js FAILED:', error);
    process.exitCode = 1;
});
