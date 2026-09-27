import { AnnouncementIndex } from '../application/announcementIndex/AnnouncementIndex.js';
import { AnnouncementKind } from '../application/announcementIndex/AnnouncementKinds.js';
import { AnnouncementIndexPeerExchange } from '../application/announcementIndex/AnnouncementIndexPeerExchange.js';
import {
    ANNOUNCEMENT_INDEX_PEER_PROTOCOL,
    AnnouncementIndexPeerMessageKind,
    isValidAnnouncementIndexPeerMessage,
    toAnnouncementIndexResponseMessages,
    MAX_RESPONSE_PAYLOAD_BYTES
} from '../application/announcementIndex/AnnouncementIndexPeerProtocol.js';
import { derivePlaceNamingDiscoveryTag } from '../core/PlaceNamingDiscoveryEnvelope.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/peer/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { makeIdentity } from './support/TestIdentity.js';
import { assert } from './support/Assert.js';

// Announcement Index, Phase 5 (docs/AnnouncementIndex.md): connected peers
// share their indexes, so one connection gives a new device everything its
// peer has seen, within limits a peer cannot talk its way past.

const SNAPSHOT_TAG = 'forkbuild-snapshot';
const PLACE_TAG = derivePlaceNamingDiscoveryTag('world-1', 'region-1');

const wait = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
const snapshot = (n) => ({ contentHash: `hash-${n}`, locator: `ar://tx-${n}`, storage: 'ar' });
function claim(id, author = 'did:key:zAlice') {
    return {
        protocol: 'forkbuild-place-naming-discovery', version: 1, worldId: 'world-1', regionId: 'region-1',
        claim: { id, worldId: 'world-1', regionId: 'region-1', name: 'Old Oak', authorIdentityId: author, createdAt: '2026-01-01T00:00:00.000Z',
            signature: { algorithm: 'ed25519', signer: author, signature: `sig-${id}`, signedHash: 'h', domain: 'forkbuild.place-naming-claim' } }
    };
}

function device(name, network, options = {}) {
    const identity = makeIdentity(name);
    const transport = new LocalPeerConnectionProvider(`${name}-endpoint`, network);
    const connect = new ConnectToPeerUseCase({ peerConnectionProvider: transport, identityProvider: identity });
    connect.listen();
    const index = new AnnouncementIndex({ storage: new InMemoryStorageProvider() });
    const received = [];
    const exchange = new AnnouncementIndexPeerExchange({
        index, peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: connect.registry,
        onRecordsReceived: (event) => received.push(event), ...options
    });
    return { identity, connect, index, exchange, received, endpoint: `${name}-endpoint` };
}

async function run() {
    // Section A: a new device fills its index from one peer.
    {
        const network = new LocalPeerNetwork();
        const alice = device('alice', network);
        const carol = device('carol', network);
        alice.index.record(AnnouncementKind.SNAPSHOT, SNAPSHOT_TAG, [snapshot(1), snapshot(2), snapshot(3)], 'nostr');
        alice.index.record(AnnouncementKind.PLACE_NAMING, PLACE_TAG, [claim('c1')], 'arweave');
        alice.index.record(AnnouncementKind.PUBLICATION, 'pub-tag', [{ uri: 'ar://p' }], 'dweb:nostr:relay');
        carol.index.record(AnnouncementKind.SNAPSHOT, SNAPSHOT_TAG, [snapshot(9)], 'steem');

        const carolToAlice = carol.connect.connect({ candidateEndpoint: alice.endpoint });
        await wait(60);
        assert(carolToAlice.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'A0. setup: Carol and Alice are connected');

        const carolSnapshots = carol.index.list(AnnouncementKind.SNAPSHOT, SNAPSHOT_TAG).map((c) => c.contentHash).sort();
        assert(JSON.stringify(carolSnapshots) === JSON.stringify(['hash-1', 'hash-2', 'hash-3', 'hash-9']), 'A1. Carol receives every Snapshot Alice had seen');
        assert(carol.index.list(AnnouncementKind.PLACE_NAMING, PLACE_TAG)[0].claim.id === 'c1', 'A2. and Alice\'s Place Naming claims');
        assert(carol.index.list(AnnouncementKind.PUBLICATION, 'pub-tag').length === 0, 'A3. Publication leads are never shared');
        assert(alice.index.list(AnnouncementKind.SNAPSHOT, SNAPSHOT_TAG).some((c) => c.contentHash === 'hash-9'), 'A4. the exchange runs both ways');

        const fromAlice = carol.index.list(AnnouncementKind.SNAPSHOT, SNAPSHOT_TAG, { origin: `peer:${carolToAlice.remoteIdentity.identityId}` });
        assert(fromAlice.length === 3, 'A5. received records name the peer they came from');
        assert(carol.received.length > 0, 'A6. onRecordsReceived reports what was added');
        console.log('✓ Section A: one connection shares both indexes');
    }

    // Section B: nothing is re-sent when both sides already hold the same records.
    {
        const network = new LocalPeerNetwork();
        const sent = [];
        const bus = new PeerMessageBus();
        const originalSend = bus.send.bind(bus);
        bus.send = (peer, protocol, payload) => { if (protocol === ANNOUNCEMENT_INDEX_PEER_PROTOCOL) sent.push(payload.kind); return originalSend(peer, protocol, payload); };
        const alice = device('alice2', network);
        const bobIdentity = makeIdentity('bob2');
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: new LocalPeerConnectionProvider('bob2-endpoint', network), identityProvider: bobIdentity });
        bobConnect.listen();
        const bobIndex = new AnnouncementIndex({ storage: new InMemoryStorageProvider() });
        new AnnouncementIndexPeerExchange({ index: bobIndex, peerMessageBus: bus, connectedPeerRegistry: bobConnect.registry });
        for (const index of [alice.index, bobIndex]) index.record(AnnouncementKind.SNAPSHOT, SNAPSHOT_TAG, [snapshot(1), snapshot(2)], 'nostr');

        bobConnect.connect({ candidateEndpoint: alice.endpoint });
        await wait(60);
        assert(JSON.stringify(sent) === JSON.stringify([AnnouncementIndexPeerMessageKind.SUMMARY]), 'B1. equal digests: only the summary is sent, no request');
        console.log('✓ Section B: identical indexes exchange only summaries');
    }

    // Section C: limits against a misbehaving peer.
    {
        const index = new AnnouncementIndex({ storage: new InMemoryStorageProvider() });
        const handlers = [];
        const sent = [];
        const bus = {
            attach() {},
            subscribe: (_protocol, handler) => { handlers.push(handler); return () => {}; },
            send: (_peer, _protocol, payload) => sent.push(payload)
        };
        const peer = {
            connectionId: 'conn-mallory',
            getLifecycleState: () => PeerLifecycleState.AUTHENTICATED,
            remoteIdentity: { identityId: 'did:key:zMallory' }
        };
        const registry = { list: () => [peer], onChange: () => () => {} };
        let clock = 0;
        new AnnouncementIndexPeerExchange({
            index, peerMessageBus: bus, connectedPeerRegistry: registry, now: () => clock,
            maxRecordsPerPeerPerHour: 5, maxClaimsPerAuthorPerTag: 2
        });
        const deliver = (payload) => handlers.forEach((handler) => handler(payload, { connectedPeer: peer }));
        const response = (recordKind, tag, payloads) => ({ kind: AnnouncementIndexPeerMessageKind.RESPONSE, recordKind, tag, payloads });

        deliver(response(AnnouncementKind.SNAPSHOT, SNAPSHOT_TAG, [snapshot(1)]));
        assert(index.list(AnnouncementKind.SNAPSHOT, SNAPSHOT_TAG).length === 0, 'C1. an unrequested RESPONSE is ignored');

        deliver({ kind: AnnouncementIndexPeerMessageKind.SUMMARY, entries: [
            { kind: AnnouncementKind.SNAPSHOT, tag: SNAPSHOT_TAG, count: 10, digest: 'x' },
            { kind: AnnouncementKind.PLACE_NAMING, tag: PLACE_TAG, count: 10, digest: 'y' },
            { kind: AnnouncementKind.PUBLICATION, tag: 'pub', count: 10, digest: 'z' },
            { kind: 'junk' }
        ] });
        assert(sent.filter((m) => m.kind === AnnouncementIndexPeerMessageKind.REQUEST).length === 2, 'C2. only shared kinds are requested');

        deliver(response(AnnouncementKind.PLACE_NAMING, PLACE_TAG, [claim('m1', 'did:key:zM'), claim('m2', 'did:key:zM'), claim('m3', 'did:key:zM'), claim('other', 'did:key:zO')]));
        const claims = index.list(AnnouncementKind.PLACE_NAMING, PLACE_TAG).map((e) => e.claim.id).sort();
        assert(JSON.stringify(claims) === JSON.stringify(['m1', 'm2', 'other']), 'C3. one author cannot fill a region past the per-author cap');

        deliver(response(AnnouncementKind.SNAPSHOT, SNAPSHOT_TAG, [1, 2, 3, 4, 5].map(snapshot)));
        assert(index.list(AnnouncementKind.SNAPSHOT, SNAPSHOT_TAG).length === 2, 'C4. the hourly per-peer cap applies across responses (3 claims + 2 snapshots)');

        clock += 6 * 60 * 1000;
        deliver({ kind: AnnouncementIndexPeerMessageKind.SUMMARY, entries: [{ kind: AnnouncementKind.SNAPSHOT, tag: 'late', count: 1, digest: 'x' }] });
        clock += 6 * 60 * 1000;
        deliver(response(AnnouncementKind.SNAPSHOT, 'late', [snapshot(7)]));
        assert(index.list(AnnouncementKind.SNAPSHOT, 'late').length === 0, 'C5. a RESPONSE arriving after the request expired is ignored');

        assert(!isValidAnnouncementIndexPeerMessage({ kind: 'response', recordKind: 'publication', tag: 't', payloads: [] }), 'C6. a publication RESPONSE is not even a valid message');
        console.log('✓ Section C: unsolicited, over-cap and expired records are refused');
    }

    // Section D: responses are split to fit peer messages.
    {
        const payloads = Array.from({ length: 400 }, (_, n) => ({ ...snapshot(n), locator: `ar://${'x'.repeat(200)}${n}` }));
        const messages = toAnnouncementIndexResponseMessages(AnnouncementKind.SNAPSHOT, SNAPSHOT_TAG, payloads);
        assert(messages.length > 1, 'D1. a large tag is sent as several messages');
        assert(messages.every((m) => JSON.stringify(m).length < MAX_RESPONSE_PAYLOAD_BYTES + 1024), 'D2. each fits one peer message');
        assert(messages.reduce((sum, m) => sum + m.payloads.length, 0) === 400, 'D3. nothing is lost in the split');
        console.log('✓ Section D: responses are split to fit');
    }

    console.log('\nAll AnnouncementIndexPeerExchange tests passed.');
}

run().catch((error) => {
    console.error('AnnouncementIndexPeerExchange.test.js FAILED:', error);
    process.exitCode = 1;
});
