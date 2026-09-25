import {
    splitIntoParts, isValidTransferPart, sendInParts, PartAssembler, OutstandingRequests,
    MAX_PART_JSON_LENGTH, MAX_TRANSFER_LENGTH, SEND_BUFFER_HIGH_WATER_MARK
} from '../application/peer/ChunkedPeerTransfer.js';
import { PeerContentMessageKind, isValidPeerContentMessage, toContentResponsePartMessage } from '../application/peer/PeerContentProtocol.js';
import { PeerSnapshotContentMessageKind, isValidPeerSnapshotContentMessage } from '../application/snapshot/materialization/PeerSnapshotContentProtocol.js';
import { PeerContentExchange } from '../application/peer/PeerContentExchange.js';
import { PeerContentRetrievalCoordinator } from '../application/peer/PeerContentRetrievalCoordinator.js';
import { PublicationSnapshotContentPeerExchange } from '../application/snapshot/materialization/PublicationSnapshotContentPeerExchange.js';
import { MaterializeSnapshotFromPeerUseCase } from '../application/snapshot/materialization/MaterializeSnapshotFromPeerUseCase.js';
import { executeSnapshotDistributionCommand } from '../application/snapshot/SnapshotDistributionCommand.js';
import { sanitizeDistributionErrorMessage } from '../application/publication/distribution/DistributionErrorMessageSanitizer.js';
import { ContentStore, ContentTooLargeError } from '../content/ContentStore.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { ArweaveGatewayFailoverContentStore } from '../content/ArweaveGatewayFailoverContentStore.js';
import { uploadTimeoutMs } from '../utils/uploadTimeout.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { LocalPublicationCatalog } from '../application/publication/LocalPublicationCatalog.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/peer/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { MAX_PEER_MESSAGE_BYTES } from '../peer/PeerMessage.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Content larger than one peer message moves as parts
// (application/peer/ChunkedPeerTransfer.js): splitting under the message
// limit, reassembly with bounds, the two content protocols' RESPONSE_PART
// messages over a real authenticated connection, waiting callers that keep
// waiting while parts arrive, and snapshot distribution refusing Arweave
// storage for a build larger than it takes.

const wait = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

// A document-like JSON text of roughly `targetLength` characters, heavy in
// quotes like a serialized World.
function documentText(targetLength) {
    const bricks = [];
    let length = 0;
    for (let i = 0; length < targetLength; i++) {
        const brick = { id: `brick-${i}-${'x'.repeat(28)}`, definitionId: 'core:cube', position: { x: i % 233, y: 0.5, z: Math.floor(i / 233) }, rotation: 0, color: null };
        bricks.push(brick);
        length += JSON.stringify(brick).length + 1;
    }
    return JSON.stringify({ world: { bricks } });
}

// splitIntoParts(): every part fits a message once JSON-escaped, the parts
// join back to the original, and surrogate pairs are never split.
{
    const text = documentText(500 * 1024);
    const parts = splitIntoParts(text);
    assert(parts.length > 1 && parts.join('') === text, 'a large document splits into parts that join back exactly');
    assert(parts.every((part) => JSON.stringify(part).length <= MAX_PART_JSON_LENGTH), 'every part fits the part budget once escaped');

    const escapeHeavy = '"\n\\\u0001'.repeat(40000);
    const heavyParts = splitIntoParts(escapeHeavy);
    assert(heavyParts.join('') === escapeHeavy && heavyParts.every((part) => JSON.stringify(part).length <= MAX_PART_JSON_LENGTH),
        'text that escapes to several times its length still fits');

    const emoji = '😀'.repeat(50000);
    const emojiParts = splitIntoParts(emoji, 1001);
    assert(emojiParts.join('') === emoji && emojiParts.every((part) => !/[\ud800-\udbff]$/.test(part)), 'no part ends between the halves of a surrogate pair');
    assert(splitIntoParts('small').length === 1 && splitIntoParts('').length === 0, 'small text is one part; empty text is none');

    const message = { messageId: 'x'.repeat(36), protocol: 'forkbuild:snapshot-content-transfer', version: 1, payload: toContentResponsePartMessage('ab12', { transferId: 'id', index: 0, count: parts.length, totalLength: text.length, part: parts[0] }) };
    assert(JSON.stringify(message).length <= MAX_PEER_MESSAGE_BYTES, 'a part message, envelope included, fits MAX_PEER_MESSAGE_BYTES');
    console.log('✓ content splits into parts that fit one message each');
}

// Part messages are validated structurally, in both protocols.
{
    const fields = { transferId: 'abc', index: 1, count: 3, totalLength: 10, part: 'abc' };
    assert(isValidTransferPart(fields), 'well-formed part fields are valid');
    assert(!isValidTransferPart({ ...fields, index: 3 }) && !isValidTransferPart({ ...fields, count: 0 }), 'an index outside the count is invalid');
    assert(!isValidTransferPart({ ...fields, totalLength: MAX_TRANSFER_LENGTH + 1 }), 'a transfer over MAX_TRANSFER_LENGTH is invalid');
    assert(!isValidTransferPart({ ...fields, part: '' }) && !isValidTransferPart({ ...fields, part: 'x'.repeat(11) }), 'an empty part, or one longer than the whole, is invalid');
    assert(!isValidTransferPart({ ...fields, transferId: 'bad id!' }), 'a transfer id outside [A-Za-z0-9_-] is invalid');
    assert(isValidPeerContentMessage({ kind: PeerContentMessageKind.RESPONSE_PART, hash: 'ab12', ...fields }), 'content RESPONSE_PART is valid');
    assert(!isValidPeerContentMessage({ kind: PeerContentMessageKind.RESPONSE_PART, hash: 'not hex', ...fields }), '...with a valid hash only');
    assert(isValidPeerSnapshotContentMessage({ kind: PeerSnapshotContentMessageKind.RESPONSE_PART, publicationId: 'pub', contentHash: 'ab12', ...fields }), 'snapshot RESPONSE_PART is valid');
    assert(!isValidPeerSnapshotContentMessage({ kind: PeerSnapshotContentMessageKind.RESPONSE_PART, publicationId: '', contentHash: 'ab12', ...fields }), '...with a publication id only');
    console.log('✓ part messages are validated');
}

// PartAssembler: any order, duplicates ignored, inconsistent or oversized
// transfers dropped, bounded concurrency, idle transfers expire.
{
    let clock = 0;
    const assembler = new PartAssembler({ maxTransferLength: 100, maxConcurrentTransfers: 2, idleTimeoutMs: 1000, now: () => clock });
    const part = (transferId, index, text, count = 3, totalLength = 9) => ({ transferId, index, count, totalLength, part: text });
    assert(assembler.accept('peer', part('t', 2, 'ghi')).status === 'progress', 'the last part may come first');
    const dup = assembler.accept('peer', part('t', 2, 'ghi'));
    assert(dup.status === 'progress' && dup.receivedLength === 3, 'a duplicate part is not counted twice');
    assembler.accept('peer', part('t', 0, 'abc'));
    const done = assembler.accept('peer', part('t', 1, 'def'));
    assert(done.status === 'complete' && done.text === 'abcdefghi' && assembler.activeTransferCount === 0, 'the parts join in index order');

    assembler.accept('peer', part('u', 0, 'abc'));
    assert(assembler.accept('peer', part('u', 1, 'def', 4)).status === 'rejected' && assembler.activeTransferCount === 0, 'a part disagreeing on the count drops the transfer');
    assembler.accept('peer', part('v', 0, 'abcdef'));
    assert(assembler.accept('peer', part('v', 1, 'defg')).status === 'rejected', 'parts adding up to more than the declared length drop the transfer');
    assert(assembler.accept('peer', part('w', 0, 'x', 2, 101)).status === 'rejected', 'a transfer over the assembler\'s limit is refused');
    const short = new PartAssembler();
    short.accept('p', part('s', 0, 'ab', 2, 9));
    assert(short.accept('p', part('s', 1, 'cd', 2, 9)).status === 'rejected', 'complete parts shorter than the declared length are refused');

    assembler.accept('a', part('1', 0, 'abc'));
    assembler.accept('b', part('1', 0, 'abc'));
    assert(assembler.accept('c', part('1', 0, 'abc')).status === 'rejected', 'no more than maxConcurrentTransfers at once');
    clock = 1001;
    assert(assembler.accept('c', part('1', 0, 'abc')).status === 'progress' && assembler.activeTransferCount === 1, 'idle transfers expire and free their slots');

    let now = 0;
    const outstanding = new OutstandingRequests({ ttlMs: 100, now: () => now });
    outstanding.add('h');
    assert(outstanding.has('h') && !outstanding.has('other'), 'a request is outstanding until...');
    now = 101;
    assert(!outstanding.has('h'), '...it expires');
    console.log('✓ PartAssembler bounds what a peer can make this side hold');
}

// sendInParts() waits while the connection's send buffer is full, and
// stops if the peer goes away.
{
    const sent = [];
    const connection = { bufferedAmount: SEND_BUFFER_HIGH_WATER_MARK * 2 };
    let state = PeerLifecycleState.AUTHENTICATED;
    const peer = { connection, getLifecycleState: () => state };
    const bus = { send: (p, protocol, payload) => sent.push(payload) };
    const text = documentText(200 * 1024);
    const sending = sendInParts(bus, peer, 'proto', text, (fields) => fields);
    await wait(40);
    assert(sent.length === 0, 'nothing is sent while the buffer is above the high-water mark');
    connection.bufferedAmount = 0;
    assert(await sending === true && sent.length > 1 && sent.map((m) => m.part).join('') === text, 'once it drains, every part is sent');
    assert(new Set(sent.map((m) => m.transferId)).size === 1 && sent.every((m, i) => m.index === i && m.count === sent.length), 'parts share one transfer id and are numbered');

    connection.bufferedAmount = SEND_BUFFER_HIGH_WATER_MARK * 2;
    const stalled = sendInParts(bus, peer, 'proto', text, (fields) => fields);
    state = PeerLifecycleState.CLOSED;
    assert(await stalled === false, 'a peer that disconnects stops the transfer');
    console.log('✓ sendInParts() respects the send buffer');
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(label);
    return provider;
}

async function connectedPair(names) {
    const network = new LocalPeerNetwork();
    const alice = makeIdentity('Alice');
    const bob = makeIdentity('Bob');
    const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: new LocalPeerConnectionProvider(names[0], network), identityProvider: alice });
    aliceConnect.listen();
    const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: new LocalPeerConnectionProvider(names[1], network), identityProvider: bob });
    const bobPeer = bobConnect.connect({ candidateEndpoint: names[0] });
    await wait(20);
    assert(bobPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'setup: the peers authenticate');
    return { alice, bob, aliceConnect, bobConnect, bobPeer, alicePeer: aliceConnect.registry.list()[0] };
}

async function catalogPublication(identity, catalog, contentStore, text) {
    const contentReference = await contentStore.put(text);
    let publication = new DecentralizedPublication({ contentKind: 'forkbuild.document', contentReference, publisherIdentity: identity.getSigningIdentity().toJSON() });
    publication = publication.withSignature(identity.signCanonical(publication.getSigningDescriptor()));
    catalog.add(publication);
    return publication;
}

// forkbuild:content — a large content moves in parts over a real
// authenticated connection, is verified and stored; a waiting caller keeps
// waiting while parts arrive.
{
    const { alice, aliceConnect, bobConnect, bobPeer, alicePeer } = await connectedPair(['alice-large', 'bob-large']);
    const aliceStore = new LocalContentStore(new InMemoryStorageProvider());
    const bobStore = new LocalContentStore(new InMemoryStorageProvider());
    const aliceCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
    const bobCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
    const text = documentText(1024 * 1024);
    const publication = await catalogPublication(alice, aliceCatalog, aliceStore, text);
    bobCatalog.add(publication);
    const aliceBus = new PeerMessageBus();
    const bobBus = new PeerMessageBus();
    const aliceExchange = new PeerContentExchange(aliceStore, aliceBus, aliceConnect.registry, aliceCatalog);
    const bobExchange = new PeerContentExchange(bobStore, bobBus, bobConnect.registry, bobCatalog);
    const progress = [];
    bobExchange.onTransferProgress((event) => progress.push(event));

    // Unsolicited parts (nothing requested) are ignored.
    const hash = publication.contentReference.hash;
    aliceBus.send(alicePeer, 'forkbuild:content', toContentResponsePartMessage(hash, { transferId: 'push', index: 0, count: 2, totalLength: text.length, part: text.slice(0, 1000) }));
    await wait(10);
    assert(progress.length === 0, 'parts nobody asked for are ignored');

    const coordinator = new PeerContentRetrievalCoordinator(bobExchange);
    const result = await coordinator.retrieve(hash, [bobPeer], { timeoutMs: 2000 });
    assert(result.retrieved === true, 'a 1 MB content is retrieved from a peer');
    assert(await bobStore.get(publication.contentReference) === text, '...verified against its hash and stored');
    assert(progress.length > 10 && progress[progress.length - 1].totalLength === text.length, 'progress is reported part by part');

    // A part whose bytes do not hash to the content is never stored.
    const otherStore = new LocalContentStore(new InMemoryStorageProvider());
    const otherCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
    otherCatalog.add(publication);
    const stub = { attach() {}, subscribe: (p, handler) => { stub.handler = handler; return () => {}; }, send() {} };
    const otherExchange = new PeerContentExchange(otherStore, stub, { list: () => [], onChange: () => () => {} }, otherCatalog);
    otherExchange.request({ connectionId: 'c', getLifecycleState: () => PeerLifecycleState.AUTHENTICATED }, hash);
    const received = [];
    otherExchange.onContentReceived((event) => received.push(event));
    const forged = 'y'.repeat(text.length);
    const halves = [forged.slice(0, text.length / 2), forged.slice(text.length / 2)];
    halves.forEach((half, index) => stub.handler({ kind: 'RESPONSE_PART', hash, transferId: 't', index, count: 2, totalLength: text.length, part: half }, { connectedPeer: { connectionId: 'c' } }));
    await wait(10);
    assert(received.length === 0 && !(await otherStore.has(publication.contentReference)), 'content that fails the hash check is not stored');
    stub.handler({ kind: 'RESPONSE_PART', hash, transferId: 'u', index: 0, count: 2, totalLength: text.length + 5, part: 'abc' }, { connectedPeer: { connectionId: 'c' } });
    assert(otherExchange._assembler.activeTransferCount === 0, 'a declared length that differs from the catalog\'s size is refused');

    aliceExchange.dispose();
    bobExchange.dispose();
    console.log('✓ forkbuild:content moves large content in parts, verified');
}

// A small content still goes as one RESPONSE, readable by older peers.
{
    const sent = [];
    const bus = { attach() {}, subscribe: (p, handler) => { bus.handler = handler; return () => {}; }, send: (peer, protocol, payload) => sent.push(payload) };
    const store = new LocalContentStore(new InMemoryStorageProvider());
    const catalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
    const publication = await catalogPublication(makeIdentity('Carol'), catalog, store, '{"small":true}');
    new PeerContentExchange(store, bus, { list: () => [], onChange: () => () => {} }, catalog);
    bus.handler({ kind: 'REQUEST', hash: publication.contentReference.hash }, { connectedPeer: { connectionId: 'x', getLifecycleState: () => PeerLifecycleState.AUTHENTICATED } });
    await wait(10);
    assert(sent.length === 1 && sent[0].kind === 'RESPONSE' && sent[0].bytes === '{"small":true}', 'content that fits is one RESPONSE, as before');

    // A peer repeating a REQUEST for large content gets one transfer, not two.
    sent.length = 0;
    const large = await catalogPublication(makeIdentity('Dave'), catalog, store, documentText(200 * 1024));
    const requester = { connectionId: 'y', connection: { bufferedAmount: SEND_BUFFER_HIGH_WATER_MARK * 2 }, getLifecycleState: () => PeerLifecycleState.AUTHENTICATED };
    bus.handler({ kind: 'REQUEST', hash: large.contentReference.hash }, { connectedPeer: requester });
    bus.handler({ kind: 'REQUEST', hash: large.contentReference.hash }, { connectedPeer: requester });
    await wait(20);
    requester.connection.bufferedAmount = 0;
    await wait(40);
    const transfers = new Set(sent.map((m) => m.transferId));
    assert(sent.length > 1 && transfers.size === 1, 'a repeated REQUEST during a transfer does not start a second one');
    console.log('✓ small content is unchanged on the wire');
}

// forkbuild:snapshot-content-transfer — a large snapshot is materialized
// from a peer in parts.
{
    const { aliceConnect, bobConnect, bobPeer } = await connectedPair(['alice-snap', 'bob-snap']);
    const aliceStore = new LocalContentStore(new InMemoryStorageProvider());
    const bobStore = new LocalContentStore(new InMemoryStorageProvider());
    const text = documentText(600 * 1024);
    const reference = await aliceStore.put(text);
    const aliceExchange = new PublicationSnapshotContentPeerExchange(aliceStore, new PeerMessageBus(), aliceConnect.registry);
    const bobExchange = new PublicationSnapshotContentPeerExchange(bobStore, new PeerMessageBus(), bobConnect.registry);
    const received = [];
    bobExchange.onContentReceived((event) => received.push(event));
    bobExchange.request(bobPeer, { publicationId: 'pub-1', contentHash: reference.hash });
    for (let i = 0; i < 50 && received.length === 0; i++) await wait(10);
    assert(received.length === 1 && received[0].bytes === text && received[0].contentHash === reference.hash && received[0].publicationId === 'pub-1',
        'a 600 KB snapshot arrives whole');
    aliceExchange.dispose();
    bobExchange.dispose();
    console.log('✓ forkbuild:snapshot-content-transfer moves large snapshots in parts');
}

// Waiting callers keep waiting while parts arrive: the timeout bounds
// silence, not the whole transfer.
{
    function slowExchange(eventNames) {
        const listeners = { received: new Set(), progress: new Set() };
        return {
            listeners,
            onContentReceived: (cb) => { listeners.received.add(cb); return () => listeners.received.delete(cb); },
            onTransferProgress: (cb) => { listeners.progress.add(cb); return () => listeners.progress.delete(cb); },
            request() {
                // Six parts, 30 ms apart: 180 ms in all, longer than the 80 ms timeout.
                for (let i = 1; i <= 6; i++) {
                    setTimeout(() => {
                        const event = { [eventNames.hash]: 'ab12', receivedLength: i, totalLength: 6, bytes: 'content' };
                        for (const cb of (i < 6 ? listeners.progress : listeners.received)) cb(event);
                    }, i * 30);
                }
            }
        };
    }
    const coordinator = new PeerContentRetrievalCoordinator(slowExchange({ hash: 'hash' }));
    const retrieved = await coordinator.retrieve('ab12', [{}], { timeoutMs: 80 });
    assert(retrieved.retrieved === true, 'content retrieval waits through a transfer longer than its timeout');
    const silent = new PeerContentRetrievalCoordinator({ onContentReceived: () => () => {}, onTransferProgress: () => () => {}, request() {} });
    assert((await silent.retrieve('ab12', [{}], { timeoutMs: 30 })).retrieved === false, '...but still gives up on silence');

    const exchange = slowExchange({ hash: 'contentHash' });
    const materialize = new MaterializeSnapshotFromPeerUseCase(exchange, { execute: () => ({}) }, { get: () => null }, { timeoutMs: 80 });
    const bytes = await materialize._requestAndWait({}, 'pub', 'ab12');
    assert(bytes === 'content', 'snapshot materialization waits through a transfer longer than its timeout');
    console.log('✓ waiting callers restart their timeout on each part');
}

// Snapshot distribution refuses a build larger than the storage takes,
// before signing or uploading anything, with a message pointing to IPFS.
{
    class FakeStore extends ContentStore {
        constructor(storage, maxContentBytes) { super(); this._storage = storage; this._max = maxContentBytes; this.puts = 0; }
        get storage() { return this._storage; }
        get maxContentBytes() { return this._max; }
        async put(bytes) { this.puts++; return { hash: 'ab12', uri: `${this._storage}://x`, storage: this._storage }; }
    }
    const publisher = { discoveryTag: 'forkbuild-snapshot', publish: async () => ({ published: true }) };
    const big = documentText(300 * 1024);
    const arweave = new FakeStore('ar', 256 * 1024);
    let thrown = null;
    try { await executeSnapshotDistributionCommand({ bytes: big, contentStore: arweave, discoveryPublisher: publisher }); } catch (error) { thrown = error; }
    assert(thrown instanceof ContentTooLargeError && arweave.puts === 0, 'Arweave storage refuses a build over its limit without uploading');
    const shown = sanitizeDistributionErrorMessage(thrown);
    assert(/KB/.test(shown) && /more than the 256 KB Arweave storage accepts/.test(shown) && /Choose IPFS storage/.test(shown), `the user sees why and what to do: "${shown}"`);
    const ipfs = new FakeStore('ipfs', Infinity);
    const result = await executeSnapshotDistributionCommand({ bytes: big, contentStore: ipfs, discoveryPublisher: publisher });
    assert(ipfs.puts === 1 && result.contentReference.storage === 'ipfs', 'IPFS storage takes it');
    const small = await executeSnapshotDistributionCommand({ bytes: '{"small":true}', contentStore: arweave, discoveryPublisher: publisher });
    assert(arweave.puts === 1 && small.contentReference, 'a build within the limit still goes to Arweave');
    console.log('✓ snapshot distribution routes large builds away from Arweave');
}

// Store limits and upload timeouts.
{
    const signer = { sign: async () => ({}), maxDataBytes: 256 * 1024 };
    const fetchImpl = async () => ({ ok: true });
    assert(new ArweaveContentStore({ signer, fetchImpl }).maxContentBytes === 256 * 1024, 'the Arweave store takes its limit from the signer');
    assert(new ArweaveContentStore({ signer: { sign: async () => ({}) }, fetchImpl }).maxContentBytes === Infinity, 'a signer without a limit sets none');
    assert(new ArweaveGatewayFailoverContentStore({ gatewayUrls: ['https://a.example', 'https://b.example'], signer, fetchImpl }).maxContentBytes === 256 * 1024, 'the failover store uses its first gateway\'s limit');
    assert(new LocalContentStore(new InMemoryStorageProvider()).maxContentBytes === Infinity, 'other stores set no limit');
    assert(uploadTimeoutMs(5000, 10 * 1024) === 5000 && uploadTimeoutMs(5000, 7.4 * 1024 * 1024) === 5000 + 59000, 'uploads get one more second per 128 KiB');
    console.log('✓ stores report their limits; upload timeouts grow with size');
}
