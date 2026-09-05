import { readFile } from 'node:fs/promises';
import { createNostrRelayQueryClient } from '../nostr/NostrRelayQueryClient.js';
import { NostrDiscoveryQueryService } from '../application/NostrDiscoveryQueryService.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';
import { describeDecentralizedDiscoveryEnvelope, DECENTRALIZED_DISCOVERY_ENVELOPE_PROTOCOL, DECENTRALIZED_DISCOVERY_ENVELOPE_VERSION } from '../core/DecentralizedDiscoveryEnvelope.js';
import { describeSnapshotDiscoveryEnvelope, SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL, SNAPSHOT_DISCOVERY_ENVELOPE_VERSION } from '../core/SnapshotDiscoveryEnvelope.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';

// 0.9.147 — Decentralized Discovery Relay Query Client.
// See docs/Roadmap.md, "0.9.147 — Decentralized Discovery Relay Query
// Client," for the full milestone story.
//
//   Section A: connect -> REQ -> EVENT -> EOSE -> completion, deterministically
//   Section B: multiple EVENT frames are preserved as multiple entries, never collapsed
//   Section C: EOSE with zero EVENT frames is an ordinary [], not an error
//   Section D: a relay connection error rejects — never silently []
//   Section E: a relay that never sends EOSE rejects once timeoutMs elapses
//   Section F: malformed/foreign frames are skipped, never fabricated into events or fatal
//   Section G: the outgoing REQ carries the given relayUrl/filter, and CLOSE follows EOSE
//   Section H: concurrent calls use distinct subscription ids, never cross-contaminating
//   Section I: no usable WebSocket implementation degrades to undefined, never a throwing function
//   Section J: FLAGSHIP — the real, unmodified NostrDiscoveryQueryService discovers
//              a Publication lead through this client alone
//   Section K: FLAGSHIP — the real, unmodified NostrSnapshotDiscoveryQueryService
//              discovers a Snapshot candidate through the SAME client instance —
//              one implementation, two dormant seams
//   Section L: architectural regression — a pure transport producer, no
//              discovery-semantic knowledge, no external dependency

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

// A minimal fake relay speaking the REQ/EVENT/EOSE/CLOSE subset this file's
// own NostrRelayQueryClient actually uses. `respond(subscriptionId, filter)`
// returns an array of frames to emit back, in order; an array entry is
// JSON-stringified before sending, a string entry is sent completely raw
// (used to simulate a malformed/unparseable relay message).
function makeCapturingRelay({ respond } = {}) {
    const instances = [];
    class FakeSocket {
        constructor(url) {
            this.url = url;
            this.sent = [];
            this.readyState = 0;
            instances.push(this);
            queueMicrotask(() => { this.readyState = 1; if (this.onopen) this.onopen(); });
        }
        send(data) {
            this.sent.push(data);
            let parsed;
            try {
                parsed = JSON.parse(data);
            } catch {
                return;
            }
            if (!Array.isArray(parsed) || parsed[0] !== 'REQ') {
                return;
            }
            const [, subscriptionId, filter] = parsed;
            const frames = respond ? respond(subscriptionId, filter) : [['EOSE', subscriptionId]];
            for (const frame of frames) {
                const raw = typeof frame === 'string' ? frame : JSON.stringify(frame);
                queueMicrotask(() => { if (this.onmessage) this.onmessage({ data: raw }); });
            }
        }
        close() { this.closed = true; this.readyState = 3; }
    }
    return { FakeSocket, instances };
}

function erroringSocketCtor() {
    return class FakeSocket {
        constructor() {
            queueMicrotask(() => { if (this.onerror) this.onerror(new Error('boom')); });
        }
        send() {}
        close() {}
    };
}

function silentSocketCtor() {
    return class FakeSocket {
        constructor() { /* never opens, never answers — simulates a dead relay */ }
        send() {}
        close() {}
    };
}

function sentFrames(socket) {
    return socket.sent.map((raw) => JSON.parse(raw));
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — connect -> REQ -> EVENT -> EOSE -> completion.
    // ---------------------------------------------------------------
    {
        const { FakeSocket, instances } = makeCapturingRelay({
            respond: (subId) => [['EVENT', subId, { id: 'e1', kind: 1, content: 'hello', tags: [] }], ['EOSE', subId]]
        });
        const queryImpl = createNostrRelayQueryClient({ webSocketImpl: FakeSocket });
        assert(typeof queryImpl === 'function', '1. a usable WebSocket implementation resolves a real queryImpl function');

        const result = await queryImpl('wss://relay.example', { kinds: [1] });
        assert(Array.isArray(result) && result.length === 1, '2. one EVENT frame becomes one entry in the resolved array');
        assert(result[0].id === 'e1' && result[0].content === 'hello', '3. the resolved event carries the relay\'s own fields unchanged');
        assert(instances.length === 1 && instances[0].url === 'wss://relay.example', '4. exactly one socket is opened, to the relayUrl this call was given');

        console.log('✓ Section A: connect -> REQ -> EVENT -> EOSE -> completion works deterministically');
    }

    // ---------------------------------------------------------------
    // Section B — multiple EVENT frames are preserved, never collapsed.
    // ---------------------------------------------------------------
    {
        const { FakeSocket } = makeCapturingRelay({
            respond: (subId) => [
                ['EVENT', subId, { id: '1' }],
                ['EVENT', subId, { id: '2' }],
                ['EVENT', subId, { id: '3' }],
                ['EOSE', subId]
            ]
        });
        const queryImpl = createNostrRelayQueryClient({ webSocketImpl: FakeSocket });

        const result = await queryImpl('wss://relay.example', {});
        assert(result.length === 3, '5. three EVENT frames become three entries, never collapsed into one');
        assert(result[0].id === '1' && result[1].id === '2' && result[2].id === '3', '6. events are preserved in the order the relay sent them');

        console.log('✓ Section B: multiple EVENT frames are preserved as multiple entries, never collapsed');
    }

    // ---------------------------------------------------------------
    // Section C — EOSE with zero EVENT frames is an ordinary [].
    // ---------------------------------------------------------------
    {
        const { FakeSocket } = makeCapturingRelay({ respond: (subId) => [['EOSE', subId]] });
        const queryImpl = createNostrRelayQueryClient({ webSocketImpl: FakeSocket });

        const result = await queryImpl('wss://relay.example', {});
        assert(Array.isArray(result) && result.length === 0, '7. an EOSE with no prior EVENT resolves an ordinary empty array, not an error');

        console.log('✓ Section C: EOSE with zero EVENT frames is an ordinary [], not an error');
    }

    // ---------------------------------------------------------------
    // Section D — a relay connection error rejects, never silently [].
    // ---------------------------------------------------------------
    {
        const queryImpl = createNostrRelayQueryClient({ webSocketImpl: erroringSocketCtor() });
        await queryImpl('wss://relay.example', {}).then(
            () => assert(false, '8. a failing relay connection should have rejected'),
            (error) => assert(/connection failed/.test(error.message), '8. a genuine connection failure rejects with a clear error, distinct from an empty result')
        );

        console.log('✓ Section D: a relay connection error rejects — never collapsed into []');
    }

    // ---------------------------------------------------------------
    // Section E — a relay that never sends EOSE rejects once timeoutMs
    // elapses.
    // ---------------------------------------------------------------
    {
        const queryImpl = createNostrRelayQueryClient({ webSocketImpl: silentSocketCtor(), timeoutMs: 50 });
        const start = Date.now();
        await queryImpl('wss://relay.example', {}).then(
            () => assert(false, '9. a relay that never sends EOSE should have timed out'),
            (error) => assert(/timing out/.test(error.message), '9. a silent relay rejects with a timeout error rather than hanging forever')
        );
        assert(Date.now() - start < 2000, '10. the timeout actually bounds how long queryImpl waits');

        console.log('✓ Section E: a relay that never sends EOSE rejects once timeoutMs elapses');
    }

    // ---------------------------------------------------------------
    // Section F — malformed/foreign frames are skipped, never fabricated
    // into events or fatal.
    // ---------------------------------------------------------------
    {
        const { FakeSocket } = makeCapturingRelay({
            respond: (subId) => [
                'not json at all {{{',
                JSON.stringify({ not: 'an array frame at all' }),
                JSON.stringify(['EVENT', 'a-completely-different-subscription-id', { id: 'wrong-sub' }]),
                JSON.stringify(['EVENT', subId, ['not', 'a', 'plain', 'object']]),
                JSON.stringify(['EVENT', subId, null]),
                JSON.stringify(['NOTICE', 'a relay notice this file never interprets']),
                JSON.stringify(['EVENT', subId, { id: 'good' }]),
                JSON.stringify(['EOSE', subId])
            ]
        });
        const queryImpl = createNostrRelayQueryClient({ webSocketImpl: FakeSocket });

        const result = await queryImpl('wss://relay.example', {});
        assert(result.length === 1, '11. only the one well-formed EVENT for this subscription survives — every malformed/foreign frame is silently skipped');
        assert(result[0].id === 'good', '12. the surviving event is the well-formed one, not corrupted by the others');

        console.log('✓ Section F: malformed/foreign frames are skipped, never fabricated into a discovery record');
    }

    // ---------------------------------------------------------------
    // Section G — the outgoing REQ carries the given relayUrl/filter, and
    // CLOSE follows EOSE.
    // ---------------------------------------------------------------
    {
        const { FakeSocket, instances } = makeCapturingRelay({ respond: (subId) => [['EOSE', subId]] });
        const queryImpl = createNostrRelayQueryClient({ webSocketImpl: FakeSocket });
        const filter = { kinds: [1], '#t': ['forkbuild-demo'], limit: 20 };

        await queryImpl('wss://relay.example', filter);

        const frames = sentFrames(instances[0]);
        const reqFrame = frames.find((frame) => frame[0] === 'REQ');
        assert(reqFrame !== undefined, '13. a REQ frame was sent');
        assert(JSON.stringify(reqFrame[2]) === JSON.stringify(filter), '14. the REQ frame carries the given filter unchanged');
        const closeFrame = frames.find((frame) => frame[0] === 'CLOSE');
        assert(closeFrame !== undefined && closeFrame[1] === reqFrame[1], '15. a CLOSE frame naming the same subscription id follows EOSE');

        console.log('✓ Section G: the outgoing REQ carries the given relayUrl/filter, and CLOSE follows EOSE');
    }

    // ---------------------------------------------------------------
    // Section H — concurrent calls use distinct subscription ids.
    // ---------------------------------------------------------------
    {
        const seenSubscriptionIds = new Set();
        const { FakeSocket } = makeCapturingRelay({
            respond: (subId) => { seenSubscriptionIds.add(subId); return [['EOSE', subId]]; }
        });
        const queryImpl = createNostrRelayQueryClient({ webSocketImpl: FakeSocket });

        await Promise.all([
            queryImpl('wss://relay.example', {}),
            queryImpl('wss://relay.example', {}),
            queryImpl('wss://relay.example', {})
        ]);
        assert(seenSubscriptionIds.size === 3, '16. three concurrent calls use three distinct subscription ids, never colliding');

        console.log('✓ Section H: concurrent calls use distinct subscription ids, never cross-contaminating');
    }

    // ---------------------------------------------------------------
    // Section I — no usable WebSocket implementation degrades to
    // undefined, never a function that could only throw.
    // ---------------------------------------------------------------
    {
        assert(createNostrRelayQueryClient({ webSocketImpl: 'not-a-function' }) === undefined, '17. a non-function webSocketImpl degrades to undefined');

        const originalWebSocket = globalThis.WebSocket;
        globalThis.WebSocket = undefined;
        try {
            assert(createNostrRelayQueryClient({}) === undefined, '18. no webSocketImpl and no ambient global WebSocket degrades to undefined, never a throw');
            assert(createNostrRelayQueryClient() === undefined, '19. calling with no argument at all also degrades to undefined');
        } finally {
            globalThis.WebSocket = originalWebSocket;
        }

        console.log('✓ Section I: no usable WebSocket implementation degrades to undefined, never a throwing function');
    }

    // ---------------------------------------------------------------
    // Section J — FLAGSHIP: the real, unmodified NostrDiscoveryQueryService
    // discovers a Publication lead through this client alone.
    // ---------------------------------------------------------------
    {
        const envelope = describeDecentralizedDiscoveryEnvelope({
            protocol: DECENTRALIZED_DISCOVERY_ENVELOPE_PROTOCOL,
            version: DECENTRALIZED_DISCOVERY_ENVELOPE_VERSION,
            kind: WorldEncounterKind.PUBLICATION,
            objectId: 'pub-flagship-1',
            uri: 'ar://flagship-tx'
        });
        const { FakeSocket, instances } = makeCapturingRelay({
            respond: (subId) => [
                ['EVENT', subId, { id: 'evt-1', kind: 1, tags: [['t', 'forkbuild-flagship']], content: JSON.stringify(envelope) }],
                ['EOSE', subId]
            ]
        });
        const queryImpl = createNostrRelayQueryClient({ webSocketImpl: FakeSocket });

        const service = new NostrDiscoveryQueryService({ relayUrl: 'wss://relay.example', queryImpl });
        const candidates = await service.search('forkbuild-flagship');

        assert(candidates.length === 1, '20. FLAGSHIP — a real (fake-transport-backed) relay exchange, run entirely through this client, reaches the real, unmodified NostrDiscoveryQueryService and produces a candidate');
        assert(candidates[0].uri === 'ar://flagship-tx' && candidates[0].storage === 'ar', '21. FLAGSHIP — the discovered candidate carries the envelope\'s own uri, parsed entirely by NostrDiscoveryQueryService itself');
        const reqFilter = sentFrames(instances[0]).find((frame) => frame[0] === 'REQ')[2];
        assert(Array.isArray(reqFilter['#t']) && reqFilter['#t'][0] === 'forkbuild-flagship', '22. FLAGSHIP — the discovery tag NostrDiscoveryQueryService built reached the relay unchanged, entirely through this client\'s own transport');

        console.log('✓ Section J: FLAGSHIP — NostrDiscoveryQueryService discovers a Publication lead through this client alone');
    }

    // ---------------------------------------------------------------
    // Section K — FLAGSHIP: the real, unmodified
    // NostrSnapshotDiscoveryQueryService discovers a Snapshot candidate
    // through the SAME client — one implementation, two dormant seams.
    // ---------------------------------------------------------------
    {
        const envelope = describeSnapshotDiscoveryEnvelope({
            protocol: SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL,
            version: SNAPSHOT_DISCOVERY_ENVELOPE_VERSION,
            contentHash: 'hash-flagship-1',
            locator: 'ar://snapshot-flagship-tx',
            storage: 'ar'
        });
        const { FakeSocket } = makeCapturingRelay({
            respond: (subId) => [
                ['EVENT', subId, { id: 'evt-2', kind: 1, tags: [['t', 'forkbuild-snapshot-flagship']], content: JSON.stringify(envelope) }],
                ['EOSE', subId]
            ]
        });
        // A fresh client instance — production wiring shares ONE instance
        // across both composition roots (see ui/main.js); this test only
        // needs to prove the SAME createNostrRelayQueryClient() output is
        // usable by both query services, unmodified.
        const queryImpl = createNostrRelayQueryClient({ webSocketImpl: FakeSocket });

        const service = new NostrSnapshotDiscoveryQueryService({ relayUrl: 'wss://relay.example', queryImpl });
        const locator = await service.resolveLocator('forkbuild-snapshot-flagship', 'hash-flagship-1');

        assert(locator === 'ar://snapshot-flagship-tx', '23. FLAGSHIP — the SAME client architecture also carries the real, unmodified NostrSnapshotDiscoveryQueryService to a resolved locator — one shared transport, two dormant discovery seams');

        console.log('✓ Section K: FLAGSHIP — NostrSnapshotDiscoveryQueryService discovers a Snapshot candidate through the same client architecture');
    }

    // ---------------------------------------------------------------
    // Section L — architectural regression.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../nostr/NostrRelayQueryClient.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!/DecentralizedDiscoveryEnvelope|SnapshotDiscoveryEnvelope|NostrDiscoveryQueryService|NostrSnapshotDiscoveryQueryService|DecentralizedWorldDiscoveryLead|Publication\b/.test(codeOnly),
            '24. never imports or references any discovery-semantic vocabulary — a pure transport producer');
        assert(!codeOnly.includes("from '../ui/") && !codeOnly.includes('from "../ui/'), '25. no UI import of any kind');
        assert(!/\bimport\s/.test(codeOnly), '26. no import statement at all — zero external or internal dependencies');
        assert((codeOnly.match(/\bexport\s+function\b/g) || []).length === 1, '27. exports exactly one public function');
        assert(!codeOnly.includes('localStorage'), '28. no persistence of any kind');
        assert(!/privateKey|mnemonic|\bseed\b|walletPassword|signEvent|getPublicKey/i.test(codeOnly), '29. no signing/identity capability of any kind — a read-only transport, never the write-side publisher');
        assert(!/relayUrl2|secondRelay|fallbackRelay/i.test(codeOnly), '30. no multi-relay fan-out vocabulary of any kind');

        console.log('✓ Section L: architectural regression — a pure transport producer, no discovery-semantic knowledge, no dependency of any kind');
    }

    console.log('\nAll NostrRelayQueryClient tests passed.');
}

run().catch((error) => {
    console.error('NostrRelayQueryClient.test.js FAILED:', error);
    process.exitCode = 1;
});
