import { readFile } from 'node:fs/promises';
import { NostrPlaceNamingDiscoverySource } from '../application/NostrPlaceNamingDiscoverySource.js';
import { PlaceNamingDiscoveryQueryService } from '../application/PlaceNamingDiscoveryQueryService.js';
import { createNostrRelayQueryClient } from '../nostr/NostrRelayQueryClient.js';
import { derivePlaceNamingDiscoveryTag } from '../core/PlaceNamingDiscoveryEnvelope.js';

// 0.9.254 — Nostr Place Naming Discovery Source.
// See docs/Roadmap.md, "0.9.254 — Nostr Place Naming Discovery Source."
//
//   Section A: well-formed events become raw `.content` payloads, in order
//   Section B: zero events is []
//   Section C: a malformed or content-less event is silently skipped
//   Section D: the outgoing filter names the configured tag name, kinds,
//              discoveryTag, and maxResults
//   Section E: a rejecting queryImpl REJECTS search() — never []
//   Section F: a queryImpl that never settles REJECTS once timeoutMs elapses
//   Section G: a queryImpl resolving to a non-array REJECTS search()
//   Section H: two events announcing the same claim.id both come through,
//              independently — this layer performs no deduplication of its
//              own; PlaceNamingDiscoveryQueryService's own first-occurrence
//              dedup still collapses them one layer up
//   Section I: a constructor with no queryImpl throws immediately
//   Section J: architectural regression — this file never imports any
//              Place Naming envelope/verification/presentation vocabulary
//   Section K: FLAGSHIP — the real, unmodified NostrRelayQueryClient
//              drives the real, unmodified NostrPlaceNamingDiscoverySource,
//              which in turn feeds the real, unmodified
//              PlaceNamingDiscoveryQueryService, discovering a claim
//              end-to-end through the SAME shared Nostr transport already
//              proven out for Snapshot discovery

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch { threw = true; }
    assert(threw, message);
}

async function expectRejects(promise, message) {
    let rejected = false;
    try { await promise; } catch { rejected = true; }
    assert(rejected, message);
}

function signatureOf(overrides = {}) {
    return {
        algorithm: 'ed25519',
        signer: 'did:key:zAlice',
        signature: 'sig-abc123',
        signedHash: 'hash-abc123',
        domain: 'forkbuild.place-naming-claim',
        ...overrides
    };
}

function claimJSONOf(overrides = {}) {
    return {
        id: 'claim-1',
        worldId: 'world-1',
        regionId: 'region-1',
        name: 'Old Oak Crossing',
        authorIdentityId: 'did:key:zAlice',
        createdAt: '2026-01-01T00:00:00.000Z',
        signature: signatureOf(),
        ...overrides
    };
}

function envelopeOf(overrides = {}) {
    return {
        protocol: 'forkbuild-place-naming-discovery',
        version: 1,
        worldId: 'world-1',
        regionId: 'region-1',
        claim: claimJSONOf(),
        ...overrides
    };
}

function eventOf(content, overrides = {}) {
    return {
        id: 'event-id',
        pubkey: 'some-pubkey',
        kind: 1,
        tags: [['t', 'forkbuild-place-naming:world-1:region-1']],
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
    // Section A — well-formed events become raw payloads, in order.
    // ---------------------------------------------------------------
    {
        const events = [
            eventOf(envelopeOf({ claim: claimJSONOf({ id: 'claim-1' }) })),
            eventOf(envelopeOf({ claim: claimJSONOf({ id: 'claim-2' }) }))
        ];
        const relay = makeFakeRelay({ handler: () => events });
        const source = new NostrPlaceNamingDiscoverySource({ queryImpl: relay.queryImpl });

        const payloads = await source.search('forkbuild-place-naming:world-1:region-1');
        assert(payloads.length === 2, '1. FLAGSHIP — two well-formed events become two raw payloads');
        assert(payloads[0] === events[0].content, '2. FLAGSHIP — the first payload is the first event\'s own content, unparsed');
        assert(payloads[1] === events[1].content, '3. FLAGSHIP — the second payload is the second event\'s own content, order preserved');
        assert(typeof payloads[0] === 'string' && typeof payloads[1] === 'string', '4. FLAGSHIP — payloads are raw strings, never pre-parsed objects');

        console.log('✓ Section A: well-formed events become raw `.content` payloads, in order');
    }

    // ---------------------------------------------------------------
    // Section B — zero events is [].
    // ---------------------------------------------------------------
    {
        const relay = makeFakeRelay({ handler: () => [] });
        const source = new NostrPlaceNamingDiscoverySource({ queryImpl: relay.queryImpl });
        const payloads = await source.search('forkbuild-place-naming:world-1:region-1');
        assert(Array.isArray(payloads) && payloads.length === 0, '5. zero events reported by the relay resolves to []');

        console.log('✓ Section B: zero events is []');
    }

    // ---------------------------------------------------------------
    // Section C — a malformed or content-less event is silently skipped.
    // ---------------------------------------------------------------
    {
        const events = [
            eventOf(envelopeOf({ claim: claimJSONOf({ id: 'claim-good' }) })),
            { id: 'no-content-field', kind: 1, tags: [] },
            eventOf('', { id: 'empty-content' }),
            { ...eventOf(envelopeOf()), content: 42 },
            null,
            'not even an object'
        ];
        const relay = makeFakeRelay({ handler: () => events });
        const source = new NostrPlaceNamingDiscoverySource({ queryImpl: relay.queryImpl });

        const payloads = await source.search('forkbuild-place-naming:world-1:region-1');
        assert(payloads.length === 1, '6. only the one event carrying a non-empty string content survives');
        assert(JSON.parse(payloads[0]).claim.id === 'claim-good', '7. the surviving payload is the well-formed event\'s own content');

        console.log('✓ Section C: a malformed or content-less event is silently skipped, never a crash and never a reason to reject');
    }

    // ---------------------------------------------------------------
    // Section D — the outgoing filter carries the configured tag name,
    // discovery tag, kinds, and limit.
    // ---------------------------------------------------------------
    {
        const relay = makeFakeRelay({ handler: () => [] });
        const source = new NostrPlaceNamingDiscoverySource({
            relayUrl: 'wss://custom-relay.example',
            tagName: 'x',
            kinds: [1, 30078],
            maxResults: 5,
            queryImpl: relay.queryImpl
        });

        await source.search('forkbuild-place-naming:world-9:region-9');
        assert(relay.calls.length === 1, '8. exactly one query call is made');
        const { relayUrl, filter } = relay.calls[0];
        assert(relayUrl === 'wss://custom-relay.example', '9. queryImpl is invoked against the configured relay');
        assert(JSON.stringify(filter.kinds) === JSON.stringify([1, 30078]), '10. the filter names the configured kinds');
        assert(JSON.stringify(filter['#x']) === JSON.stringify(['forkbuild-place-naming:world-9:region-9']), '11. the filter matches on the configured tag name and the discovery tag being searched for');
        assert(filter.limit === 5, '12. the filter carries the configured maxResults as its own limit');

        console.log('✓ Section D: the outgoing filter carries the configured tag name, discovery tag, kinds, and limit — a correct NIP-01 request');
    }

    // ---------------------------------------------------------------
    // Section E — a rejecting queryImpl REJECTS search(), never [].
    // ---------------------------------------------------------------
    {
        const failingImpl = async () => { throw new Error('simulated relay connection failure'); };
        const source = new NostrPlaceNamingDiscoverySource({ queryImpl: failingImpl });
        await expectRejects(source.search('forkbuild-place-naming:world-1:region-1'), '13. a rejecting queryImpl REJECTS search() — a relay failure fails this source, never silently degrading to []');

        console.log('✓ Section E: a relay/transport failure rejects search(), preserving the isolation the aggregator already performs one layer up');
    }

    // ---------------------------------------------------------------
    // Section F — a queryImpl that never settles rejects once timeoutMs
    // elapses.
    // ---------------------------------------------------------------
    {
        const neverSettles = () => new Promise(() => {});
        const source = new NostrPlaceNamingDiscoverySource({ queryImpl: neverSettles, timeoutMs: 20 });
        await expectRejects(source.search('forkbuild-place-naming:world-1:region-1'), '14. a queryImpl that never settles rejects once timeoutMs elapses');

        console.log('✓ Section F: a queryImpl timeout rejects search()');
    }

    // ---------------------------------------------------------------
    // Section G — a queryImpl resolving to a non-array rejects search().
    // ---------------------------------------------------------------
    {
        for (const badValue of [null, undefined, 'not an array', {}, 42]) {
            const source = new NostrPlaceNamingDiscoverySource({ queryImpl: async () => badValue });
            await expectRejects(source.search('forkbuild-place-naming:world-1:region-1'), `15. queryImpl resolving to ${JSON.stringify(badValue)} rejects search()`);
        }

        console.log('✓ Section G: a non-array queryImpl resolution rejects search() as a transport-contract violation');
    }

    // ---------------------------------------------------------------
    // Section H — two events announcing the same claim.id both come
    // through independently; deduplication is not this layer's job.
    // ---------------------------------------------------------------
    {
        const events = [
            eventOf(envelopeOf({ claim: claimJSONOf({ id: 'claim-repeat', name: 'First Announcement' }) })),
            eventOf(envelopeOf({ claim: claimJSONOf({ id: 'claim-repeat', name: 'Second Announcement' }) }))
        ];
        const relay = makeFakeRelay({ handler: () => events });
        const source = new NostrPlaceNamingDiscoverySource({ queryImpl: relay.queryImpl });

        const payloads = await source.search('forkbuild-place-naming:world-1:region-1');
        assert(payloads.length === 2, '16. this source reports BOTH announcements of the same claim.id — no dedup at this layer');
        assert(JSON.parse(payloads[0]).claim.name === 'First Announcement' && JSON.parse(payloads[1]).claim.name === 'Second Announcement', '17. both announcements survive independently, in order');

        // The existing 0.9.253 aggregator still performs its own,
        // already-established first-occurrence dedup over this source's
        // own raw output — proving the dedup policy lives exactly once,
        // never duplicated here.
        const service = new PlaceNamingDiscoveryQueryService([source]);
        const results = await service.search('forkbuild-place-naming:world-1:region-1');
        assert(results.length === 1, '18. PlaceNamingDiscoveryQueryService still collapses the two announcements to one entry');
        assert(results[0].claim.name === 'First Announcement', '19. the first announcement wins, exactly as PlaceNamingDiscoveryBoundary.test.js already establishes');

        console.log('✓ Section H: multiple announcements of the same claim.id remain independently observable at the source level; the aggregator\'s own dedup still applies unchanged');
    }

    // ---------------------------------------------------------------
    // Section I — a constructor with no queryImpl throws immediately.
    // ---------------------------------------------------------------
    {
        expectThrows(() => new NostrPlaceNamingDiscoverySource({}), '20. a missing queryImpl throws at construction time');
        expectThrows(() => new NostrPlaceNamingDiscoverySource({ queryImpl: 'not-a-function' }), '21. a non-function queryImpl throws at construction time');

        console.log('✓ Section I: a constructor with no queryImpl throws immediately');
    }

    // ---------------------------------------------------------------
    // Section J — architectural regression: this file never imports any
    // Place Naming envelope, verification, or presentation vocabulary —
    // proving "no semantic leakage" structurally, not just by convention.
    // ---------------------------------------------------------------
    {
        const source = await readFile(new URL('../application/NostrPlaceNamingDiscoverySource.js', import.meta.url), 'utf8');
        const importLines = source.split('\n').filter((line) => /^\s*import\s/.test(line));
        assert(importLines.length === 0, '22. this file imports NOTHING — no envelope parser, no verifier, no store, no presentation module, not even a sibling discovery family; it is a pure Nostr transport shim over an injected queryImpl');

        console.log('✓ Section J: architectural regression — zero import statements, proving "no semantic leakage" structurally rather than by convention alone');
    }

    // ---------------------------------------------------------------
    // Section K — FLAGSHIP: the real, unmodified NostrRelayQueryClient
    // drives the real, unmodified NostrPlaceNamingDiscoverySource, which
    // feeds the real, unmodified PlaceNamingDiscoveryQueryService — one
    // shared Nostr transport, discovering a Place Naming claim end-to-end.
    // ---------------------------------------------------------------
    {
        class FakeSocket {
            constructor(url) {
                this.url = url;
                this.readyState = 0;
                queueMicrotask(() => { this.readyState = 1; if (this.onopen) this.onopen(); });
            }
            send(data) {
                const parsed = JSON.parse(data);
                if (!Array.isArray(parsed) || parsed[0] !== 'REQ') {
                    return;
                }
                const [, subscriptionId] = parsed;
                const envelope = envelopeOf({ claim: claimJSONOf({ id: 'claim-flagship' }) });
                const frames = [
                    ['EVENT', subscriptionId, eventOf(envelope)],
                    ['EOSE', subscriptionId]
                ];
                for (const frame of frames) {
                    const raw = JSON.stringify(frame);
                    queueMicrotask(() => { if (this.onmessage) this.onmessage({ data: raw }); });
                }
            }
            close() { this.readyState = 3; }
        }

        const queryImpl = createNostrRelayQueryClient({ webSocketImpl: FakeSocket });
        const source = new NostrPlaceNamingDiscoverySource({ queryImpl });
        const service = new PlaceNamingDiscoveryQueryService([source]);

        const tag = derivePlaceNamingDiscoveryTag('world-1', 'region-1');
        const results = await service.search(tag);
        assert(results.length === 1, '24. FLAGSHIP — a claim flows end to end through the shared Nostr transport, the new source, and the existing aggregator');
        assert(results[0].claim.id === 'claim-flagship', '25. FLAGSHIP — the discovered claim is the one the relay announced');
        assert(Object.isFrozen(results[0]), '26. FLAGSHIP — the aggregator\'s own frozen-envelope contract still holds end to end');

        console.log('✓ Section K: FLAGSHIP — one shared Nostr transport client discovers a Place Naming claim end-to-end, through the new source and the existing 0.9.253 aggregator, unmodified');
    }

    console.log('\nAll NostrPlaceNamingDiscoverySource tests passed.');
}

run().catch((error) => {
    console.error('NostrPlaceNamingDiscoverySource.test.js FAILED:', error);
    process.exitCode = 1;
});
