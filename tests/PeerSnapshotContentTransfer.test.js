import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { ContentReference } from '../core/ContentReference.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';

import {
    PeerSnapshotContentMessageKind,
    MAX_SNAPSHOT_CONTENT_BYTES,
    isValidContentHash,
    toSnapshotContentRequestMessage,
    toSnapshotContentResponseMessage,
    isValidPeerSnapshotContentMessage
} from '../application/PeerSnapshotContentProtocol.js';
import { PublicationSnapshotContentPeerExchange } from '../application/PublicationSnapshotContentPeerExchange.js';
import { StoreSnapshotContentUseCase } from '../application/StoreSnapshotContentUseCase.js';
import { StoreSnapshotContentOutcome } from '../application/StoreSnapshotContentOutcome.js';
import { PeerSnapshotMaterializationOutcome } from '../application/PeerSnapshotMaterializationOutcome.js';
import { MaterializeSnapshotFromPeerUseCase } from '../application/MaterializeSnapshotFromPeerUseCase.js';
import { SnapshotPeerMaterializationCoordinator } from '../application/SnapshotPeerMaterializationCoordinator.js';
import { SnapshotPeerMaterializationUiState } from '../application/SnapshotPeerMaterializationUiState.js';
import { describePeerMaterializationAttempt, describePeerMaterializationButtonLabel } from '../application/SnapshotPeerMaterializationView.js';
import { SnapshotMaterializationSourceKind } from '../application/SnapshotMaterializationSourceKind.js';
import { describeSnapshotMaterializationSourceLabel } from '../application/SnapshotMaterializationView.js';

// 0.8.37 — Explicit Peer Snapshot Content Transfer.
//
//   Section A: PeerSnapshotContentProtocol — REQUEST/RESPONSE wire shapes,
//              publicationId + contentHash validation, size ceiling
//              enforced on both the sending and the receiving side.
//   Section B: PublicationSnapshotContentPeerExchange — routing/gating
//              against a stub PeerMessageBus + ConnectedPeerRegistry: the
//              responding side answers strictly from its own local
//              ContentStore, WITHOUT consulting a catalog at all (unlike
//              application/PeerContentExchange.js, 0.7.4); a
//              malformed/oversized RESPONSE is dropped; onContentReceived()
//              fires UNVERIFIED, on purpose; dispose() stops both
//              directions.
//   Section C: MaterializeSnapshotFromPeerUseCase + SnapshotPeerMaterializationCoordinator
//              + view/UI-state functions, against a scriptable fake
//              exchange — STORED, ALREADY_AVAILABLE, HASH_MISMATCH,
//              UNAVAILABLE (timeout), constructor validation, and
//              SnapshotMaterializationSourceKind.PEER's own label.
//   Section D: FLAGSHIP — a real, live, authenticated connection. Bob
//              knows a publication and a placement he cannot resolve
//              (no bytes, no reachable store); Carol, a separate replica,
//              holds the bytes. Bob explicitly selects Carol and clicks
//              "Get Snapshot from Peer" — never a coordinator trying
//              every connected peer — and ends up possessing the bytes,
//              tagged with source PEER. A negative security test proves a
//              peer supplying the WRONG bytes under the right claimed hash
//              is rejected and the store is left unchanged, regardless of
//              the peer being authenticated. A third test proves a peer
//              that does not possess the content answers with silence,
//              never a resolved placement or a request forwarded to a
//              THIRD peer, and this replica reports the honest,
//              indistinguishable UNAVAILABLE outcome.
//
// See docs/Principles.md, "Peer Content Transfer Is Transport;
// Verification And Storage Stay Centralized (0.8.37)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, message);
}

async function expectRejects(promise, message) {
    let threw = false;
    try { await promise; } catch (e) { threw = true; }
    assert(threw, message);
}

function wait(ms = 20) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(label);
    return provider;
}

async function publishAndCatalog(identityProvider, catalog, contentStore, text) {
    const contentReference = await contentStore.put(text);
    let publication = new DecentralizedPublication({
        contentKind: 'forkbuild.test-content',
        contentReference,
        publisherIdentity: identityProvider.getSigningIdentity().toJSON()
    });
    publication = publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
    catalog.add(publication);
    return publication;
}

class StubPeerMessageBus {
    constructor() {
        this._handlers = new Map();
        this.sent = [];
        this.attached = new Set();
    }
    attach(peer) { this.attached.add(peer.connectionId); }
    send(peer, protocol, payload) {
        if (peer.getLifecycleState() !== PeerLifecycleState.AUTHENTICATED) {
            throw new Error('StubPeerMessageBus: cannot send, peer is not AUTHENTICATED');
        }
        this.sent.push({ peer, protocol, payload });
    }
    subscribe(protocol, handler) {
        if (!this._handlers.has(protocol)) this._handlers.set(protocol, new Set());
        this._handlers.get(protocol).add(handler);
        return () => this._handlers.get(protocol).delete(handler);
    }
    deliver(protocol, payload, meta = {}) {
        const handlers = this._handlers.get(protocol);
        if (!handlers) return;
        for (const handler of Array.from(handlers)) handler(payload, meta);
    }
}

class StubConnectedPeerRegistry {
    constructor(peers = []) { this._peers = peers; this._listeners = new Set(); }
    list() { return this._peers; }
    onChange(callback) { this._listeners.add(callback); return () => this._listeners.delete(callback); }
    fireChange() { for (const listener of this._listeners) listener(this._peers); }
}

function stubPeer(connectionId, state) {
    return { connectionId, getLifecycleState: () => state };
}

// A minimal fake application/PublicationSnapshotContentPeerExchange.js for
// Section C, so MaterializeSnapshotFromPeerUseCase's own timing/mapping
// logic can be tested deterministically without a real transport.
class FakeExchange {
    constructor() {
        this._listeners = new Set();
        this.requests = [];
    }
    request(peer, { publicationId, contentHash }) {
        this.requests.push({ peer, publicationId, contentHash });
    }
    onContentReceived(callback) {
        this._listeners.add(callback);
        return () => this._listeners.delete(callback);
    }
    deliver(event) {
        for (const listener of Array.from(this._listeners)) listener(event);
    }
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — PeerSnapshotContentProtocol
    // ---------------------------------------------------------------
    {
        assert(isValidContentHash('abc123'), '1. a plain hex hash is valid');
        assert(!isValidContentHash(''), '2. an empty hash is invalid');
        assert(!isValidContentHash('not-hex!'), '3. a hash with non-hex characters is invalid');

        const request = toSnapshotContentRequestMessage('pub-1', 'abc123');
        assert(request.kind === PeerSnapshotContentMessageKind.REQUEST
            && request.publicationId === 'pub-1' && request.contentHash === 'abc123',
            '4. toSnapshotContentRequestMessage() builds a REQUEST carrying both fields');
        expectThrows(() => toSnapshotContentRequestMessage('', 'abc123'), '5. rejects a missing publicationId');
        expectThrows(() => toSnapshotContentRequestMessage('pub-1', ''), '6. rejects a missing contentHash');

        const response = toSnapshotContentResponseMessage('pub-1', 'abc123', '{"x":1}');
        assert(response.kind === PeerSnapshotContentMessageKind.RESPONSE && response.content === '{"x":1}',
            '7. toSnapshotContentResponseMessage() builds a RESPONSE');
        expectThrows(() => toSnapshotContentResponseMessage('pub-1', 'abc123', ''), '8. rejects empty content');
        expectThrows(() => toSnapshotContentResponseMessage('pub-1', 'abc123', 'x'.repeat(MAX_SNAPSHOT_CONTENT_BYTES + 1)),
            '9. rejects content over MAX_SNAPSHOT_CONTENT_BYTES');

        assert(isValidPeerSnapshotContentMessage(request), '10. a freshly built REQUEST validates');
        assert(isValidPeerSnapshotContentMessage(response), '11. a freshly built RESPONSE validates');
        assert(!isValidPeerSnapshotContentMessage(null), '12. null is not a valid message');
        assert(!isValidPeerSnapshotContentMessage({ kind: 'REQUEST', publicationId: '', contentHash: 'abc123' }),
            '13. a REQUEST with a missing publicationId is rejected');
        assert(!isValidPeerSnapshotContentMessage({ kind: 'RESPONSE', publicationId: 'pub-1', contentHash: 'abc123', content: 'x'.repeat(MAX_SNAPSHOT_CONTENT_BYTES + 1) }),
            '14. a hand-crafted oversized RESPONSE is rejected, bypassing the sending-side check entirely');
        assert(!isValidPeerSnapshotContentMessage({ kind: 'NOT_FOUND', publicationId: 'pub-1', contentHash: 'abc123' }),
            '15. there is no NOT_FOUND kind — an unknown kind is rejected');
    }
    console.log('✓ Section A: PeerSnapshotContentProtocol — REQUEST/RESPONSE wire shapes, publicationId + contentHash + size validation');

    // ---------------------------------------------------------------
    // Section B — PublicationSnapshotContentPeerExchange, stub transport
    // ---------------------------------------------------------------
    {
        const contentStore = new LocalContentStore(new InMemoryStorageProvider());

        expectThrows(() => new PublicationSnapshotContentPeerExchange(null, new StubPeerMessageBus(), new StubConnectedPeerRegistry()),
            '1. constructor requires a local ContentStore');
        expectThrows(() => new PublicationSnapshotContentPeerExchange(contentStore, null, new StubConnectedPeerRegistry()),
            '2. constructor requires a PeerMessageBus');
        expectThrows(() => new PublicationSnapshotContentPeerExchange(contentStore, new StubPeerMessageBus(), null),
            '3. constructor requires a ConnectedPeerRegistry');

        const authenticatedPeer = stubPeer('conn-authenticated', PeerLifecycleState.AUTHENTICATED);
        const bus = new StubPeerMessageBus();
        const registry = new StubConnectedPeerRegistry([authenticatedPeer]);
        const exchange = new PublicationSnapshotContentPeerExchange(contentStore, bus, registry);

        assert(bus.attached.has('conn-authenticated'), '4. every peer already in the registry is attached on construction');

        // --- request() carries both fields, with NO catalog check at all ---
        exchange.request(authenticatedPeer, { publicationId: 'pub-1', contentHash: 'abc123' });
        assert(bus.sent.length === 1 && bus.sent[0].protocol === PublicationSnapshotContentPeerExchange.DEFAULT_PROTOCOL,
            '5. request() sends under this class\'s own namespaced protocol');
        assert(bus.sent[0].payload.kind === PeerSnapshotContentMessageKind.REQUEST
            && bus.sent[0].payload.publicationId === 'pub-1' && bus.sent[0].payload.contentHash === 'abc123',
            '6. request() sends a REQUEST for exactly the given publicationId + contentHash');

        // --- responding side: _handleRequest() consults ONLY the local ContentStore ---
        const reference = await contentStore.put('{"blueprint":"farmstead"}');
        const responderBus = new StubPeerMessageBus();
        const responderExchange = new PublicationSnapshotContentPeerExchange(contentStore, responderBus, new StubConnectedPeerRegistry([]));
        const requestingPeer = stubPeer('conn-requester', PeerLifecycleState.AUTHENTICATED);

        responderBus.deliver(PublicationSnapshotContentPeerExchange.DEFAULT_PROTOCOL,
            { kind: 'REQUEST', publicationId: 'unknown-pub', contentHash: 'deadbeef00' }, { connectedPeer: requestingPeer });
        await wait(5);
        assert(responderBus.sent.length === 0, '7. a REQUEST for a hash not in the local ContentStore goes unanswered — no catalog lookup ever runs');

        responderBus.deliver(PublicationSnapshotContentPeerExchange.DEFAULT_PROTOCOL,
            { kind: 'REQUEST', publicationId: 'some-publication-nobody-cataloged', contentHash: reference.hash }, { connectedPeer: requestingPeer });
        await wait(5);
        assert(responderBus.sent.length === 1, '8. a REQUEST for a hash this replica actually HOLDS is answered, even for a publicationId no catalog anywhere knows');
        assert(responderBus.sent[0].payload.kind === PeerSnapshotContentMessageKind.RESPONSE
            && responderBus.sent[0].payload.contentHash === reference.hash
            && responderBus.sent[0].payload.content === '{"blueprint":"farmstead"}'
            && responderBus.sent[0].payload.publicationId === 'some-publication-nobody-cataloged',
            '9. the RESPONSE carries the correct hash/content and echoes publicationId for correlation only');
        assert(responderBus.sent[0].peer === requestingPeer, '10. the RESPONSE is sent back to exactly the requester, never broadcast');

        // --- receiving side: onContentReceived() fires UNVERIFIED ---
        const bobBus = new StubPeerMessageBus();
        const bobExchange = new PublicationSnapshotContentPeerExchange(new LocalContentStore(new InMemoryStorageProvider()), bobBus, new StubConnectedPeerRegistry([]));
        const received = [];
        bobExchange.onContentReceived((event) => received.push(event));

        bobBus.deliver(PublicationSnapshotContentPeerExchange.DEFAULT_PROTOCOL, { kind: 'SOMETHING_ELSE', publicationId: 'p', contentHash: 'h' });
        assert(received.length === 0, '11. a malformed message is silently dropped, never crashes, never fires');

        // A RESPONSE carrying bytes that do NOT match the claimed hash
        // still fires — this class never verifies. Verification is
        // application/MaterializeSnapshotFromPeerUseCase.js's own job,
        // via application/StoreSnapshotContentUseCase.js, one layer up.
        bobBus.deliver(PublicationSnapshotContentPeerExchange.DEFAULT_PROTOCOL,
            toSnapshotContentResponseMessage('pub-1', 'cafef00d', 'these bytes do not hash to cafef00d'));
        assert(received.length === 1 && received[0].contentHash === 'cafef00d' && received[0].bytes === 'these bytes do not hash to cafef00d',
            '12. onContentReceived() fires for ANY structurally valid RESPONSE, unverified — this class never checks the hash itself');

        // dispose()
        const disposalBus = new StubPeerMessageBus();
        const disposalExchange = new PublicationSnapshotContentPeerExchange(new LocalContentStore(new InMemoryStorageProvider()), disposalBus, new StubConnectedPeerRegistry([]));
        const disposalReceived = [];
        disposalExchange.onContentReceived((r) => disposalReceived.push(r));
        disposalExchange.dispose();
        disposalBus.deliver(PublicationSnapshotContentPeerExchange.DEFAULT_PROTOCOL, toSnapshotContentResponseMessage('pub-1', 'abc123', 'x'));
        assert(disposalReceived.length === 0, '13. dispose() unsubscribes from the bus — no further deliveries are handled');
    }
    console.log('✓ Section B: PublicationSnapshotContentPeerExchange — catalog-free request()/_handleRequest() strictly against the local ContentStore, unverified onContentReceived(), dispose()');

    // ---------------------------------------------------------------
    // Section C — MaterializeSnapshotFromPeerUseCase + coordinator + views,
    // against a scriptable fake exchange
    // ---------------------------------------------------------------
    {
        const catalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const contentStore = new LocalContentStore(new InMemoryStorageProvider());
        const storeSnapshotContentUseCase = new StoreSnapshotContentUseCase(contentStore);
        const exchange = new FakeExchange();

        expectThrows(() => new MaterializeSnapshotFromPeerUseCase(null, storeSnapshotContentUseCase, catalog), '1. constructor requires an exchange');
        expectThrows(() => new MaterializeSnapshotFromPeerUseCase(exchange, null, catalog), '2. constructor requires a StoreSnapshotContentUseCase');
        expectThrows(() => new MaterializeSnapshotFromPeerUseCase(exchange, storeSnapshotContentUseCase, null), '3. constructor requires a publication catalog');

        const useCase = new MaterializeSnapshotFromPeerUseCase(exchange, storeSnapshotContentUseCase, catalog, { timeoutMs: 100 });
        const coordinator = new SnapshotPeerMaterializationCoordinator(useCase);
        const peer = stubPeer('conn-peer', PeerLifecycleState.AUTHENTICATED);

        await expectRejects(coordinator.materialize({ publicationId: 'pub-1', contentHash: 'abc' }), '4. execute() throws without a peer');
        await expectRejects(coordinator.materialize({ peer, contentHash: 'abc' }), '5. execute() throws without a publicationId');
        await expectRejects(coordinator.materialize({ peer, publicationId: 'pub-1' }), '6. execute() throws without a contentHash');

        // STORED — a verified RESPONSE arrives before the timeout.
        {
            const contentText = '{"blueprint":"windmill"}';
            const expectedReference = new ContentReference({ hash: await (async () => {
                const tempStore = new LocalContentStore(new InMemoryStorageProvider());
                return (await tempStore.put(contentText)).hash;
            })() });
            const pending = coordinator.materialize({ peer, publicationId: 'pub-1', contentHash: expectedReference.hash });
            await wait(5);
            assert(exchange.requests.length === 1 && exchange.requests[0].contentHash === expectedReference.hash,
                '7. materialize() sends exactly one request, for exactly the given contentHash');
            exchange.deliver({ publicationId: 'pub-1', contentHash: expectedReference.hash, bytes: contentText });
            const result = await pending;
            assert(result.outcome === PeerSnapshotMaterializationOutcome.STORED, '8. a verified RESPONSE resolves to STORED');
            assert(result.source.kind === SnapshotMaterializationSourceKind.PEER, '9. the result is tagged source PEER');
            assert(await contentStore.has(expectedReference), '10. the bytes are actually stored');
        }

        // ALREADY_AVAILABLE — the identical bytes, requested again.
        {
            const contentText = '{"blueprint":"windmill"}';
            const hash = (await new LocalContentStore(new InMemoryStorageProvider()).put(contentText)).hash;
            const pending = coordinator.materialize({ peer, publicationId: 'pub-1', contentHash: hash });
            await wait(5);
            exchange.deliver({ publicationId: 'pub-1', contentHash: hash, bytes: contentText });
            const result = await pending;
            assert(result.outcome === PeerSnapshotMaterializationOutcome.ALREADY_AVAILABLE, '11. re-delivering the identical bytes resolves to ALREADY_AVAILABLE, never a second STORED');
        }

        // HASH_MISMATCH — the peer answers with the wrong bytes.
        {
            const claimedHash = (await new LocalContentStore(new InMemoryStorageProvider()).put('{"real":"bytes"}')).hash;
            const pending = coordinator.materialize({ peer, publicationId: 'pub-1', contentHash: claimedHash });
            await wait(5);
            exchange.deliver({ publicationId: 'pub-1', contentHash: claimedHash, bytes: '{"tampered":true}' });
            const result = await pending;
            assert(result.outcome === PeerSnapshotMaterializationOutcome.HASH_MISMATCH, '12. bytes that do not verify resolve to HASH_MISMATCH');
            assert(result.contentReference === null, '13. nothing is reported stored on a HASH_MISMATCH');
            assert(!(await contentStore.has(new ContentReference({ hash: claimedHash }))), '14. the tampered bytes are never actually stored');
        }

        // UNAVAILABLE — nothing ever arrives before the timeout.
        {
            const pending = coordinator.materialize({ peer, publicationId: 'pub-1', contentHash: 'a-hash-nobody-answers' });
            const result = await pending;
            assert(result.outcome === PeerSnapshotMaterializationOutcome.UNAVAILABLE, '15. a request nobody answers times out to UNAVAILABLE');
            assert(typeof result.reason === 'string' && result.reason.length > 0, '16. UNAVAILABLE carries a plain-language reason');
        }

        // Views / UI state.
        assert(describeSnapshotMaterializationSourceLabel(SnapshotMaterializationSourceKind.PEER) === 'Peer',
            '17. the PEER source label is exactly "Peer" — no adjective, never "preferred," "trusted," or "verified via"');
        assert(describePeerMaterializationAttempt(null).state === SnapshotPeerMaterializationUiState.IDLE, '18. no attempt yet reads IDLE');
        assert(describePeerMaterializationAttempt({ requesting: true }).state === SnapshotPeerMaterializationUiState.REQUESTING, '19. an in-flight attempt reads REQUESTING');
        assert(describePeerMaterializationAttempt({ outcome: PeerSnapshotMaterializationOutcome.STORED, publicationKnown: true }).state === SnapshotPeerMaterializationUiState.STORED,
            '20. a STORED outcome reads STORED');
        assert(describePeerMaterializationAttempt({ outcome: PeerSnapshotMaterializationOutcome.HASH_MISMATCH }).state === SnapshotPeerMaterializationUiState.HASH_MISMATCH,
            '21. a HASH_MISMATCH outcome reads HASH_MISMATCH, never conflated with UNAVAILABLE');
        assert(describePeerMaterializationButtonLabel({}) === 'Get Snapshot from Peer', '22. the initial button label is "Get Snapshot from Peer"');
        assert(describePeerMaterializationButtonLabel({ materialized: true }) === 'Get Snapshot from Peer Again', '23. after a completed attempt the label invites trying again');
        assert(describePeerMaterializationButtonLabel({ requesting: true }) === 'Requesting…', '24. while in flight the label reads "Requesting…"');
    }
    console.log('✓ Section C: MaterializeSnapshotFromPeerUseCase — single-peer request/timeout shape, STORED/ALREADY_AVAILABLE/HASH_MISMATCH/UNAVAILABLE, source PEER, coordinator pass-through, views');

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP: a real, live, authenticated connection.
    // Bob explicitly selects Carol (never Alice, who has no bytes) and
    // gets the snapshot; a tampered response is rejected; an unanswered
    // request never escalates to a second peer automatically.
    // ---------------------------------------------------------------
    {
        const network = new LocalPeerNetwork();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carol = makeIdentity('Carol');

        // --- Bob <-> Alice: Alice knows the publication but no longer holds the bytes ---
        const aliceTransport = new LocalPeerConnectionProvider('alice-snapshot-content', network);
        const bobToAliceTransport = new LocalPeerConnectionProvider('bob-to-alice-snapshot-content', network);
        const aliceListen = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        const stopAliceListening = aliceListen.listen();
        const bobToAliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobToAliceTransport, identityProvider: bob });
        const bobToAlicePeer = bobToAliceConnect.connect({ candidateEndpoint: 'alice-snapshot-content' });
        await wait(20);
        assert(bobToAlicePeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '1. setup: Bob authenticates to Alice');

        // --- Bob <-> Carol: Carol holds the real bytes ---
        const carolTransport = new LocalPeerConnectionProvider('carol-snapshot-content', network);
        const bobToCarolTransport = new LocalPeerConnectionProvider('bob-to-carol-snapshot-content', network);
        const carolListen = new ConnectToPeerUseCase({ peerConnectionProvider: carolTransport, identityProvider: carol });
        const stopCarolListening = carolListen.listen();
        const bobToCarolConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobToCarolTransport, identityProvider: bob });
        const bobToCarolPeer = bobToCarolConnect.connect({ candidateEndpoint: 'carol-snapshot-content' });
        await wait(20);
        assert(bobToCarolPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '2. setup: Bob authenticates to Carol');

        const aliceContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const carolContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const bobContentStore = new LocalContentStore(new InMemoryStorageProvider());

        const bobCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const publication = await publishAndCatalog(alice, bobCatalog, carolContentStore, '{"snapshot":"village-hall"}');
        // Bob knows the publication (it names the correct contentHash);
        // Carol independently holds the identical bytes under that hash.
        // Alice's own store is deliberately EMPTY — she is the publisher
        // but no longer possesses the snapshot bytes, mirroring "Alice...
        // goes offline" in this milestone's own flagship scenario.

        const aliceBus = new PeerMessageBus();
        const carolBus = new PeerMessageBus();
        const bobToAliceBus = new PeerMessageBus();
        const bobToCarolBus = new PeerMessageBus();

        const aliceExchange = new PublicationSnapshotContentPeerExchange(aliceContentStore, aliceBus, aliceListen.registry);
        const carolExchange = new PublicationSnapshotContentPeerExchange(carolContentStore, carolBus, carolListen.registry);
        const bobToAliceExchange = new PublicationSnapshotContentPeerExchange(bobContentStore, bobToAliceBus, bobToAliceConnect.registry);
        const bobToCarolExchange = new PublicationSnapshotContentPeerExchange(bobContentStore, bobToCarolBus, bobToCarolConnect.registry);

        const bobStoreSnapshotContentUseCase = new StoreSnapshotContentUseCase(bobContentStore);

        // --- Test: the peer that does not possess the content answers with silence ---
        {
            const useCase = new MaterializeSnapshotFromPeerUseCase(bobToAliceExchange, bobStoreSnapshotContentUseCase, bobCatalog, { timeoutMs: 300 });
            const result = await useCase.execute({ peer: bobToAlicePeer, publicationId: publication.id, contentHash: publication.contentReference.hash });
            assert(result.outcome === PeerSnapshotMaterializationOutcome.UNAVAILABLE,
                '3. Alice, who no longer holds the bytes, answers with silence — Bob observes the honest UNAVAILABLE outcome, never a forwarded or resolved locator');
            assert(!(await bobContentStore.has(publication.contentReference)), '4. nothing was stored from the unanswered request');
        }

        // --- Test: Bob explicitly selects Carol and obtains the real bytes ---
        {
            const useCase = new MaterializeSnapshotFromPeerUseCase(bobToCarolExchange, bobStoreSnapshotContentUseCase, bobCatalog, { timeoutMs: 2000 });
            const result = await useCase.execute({ peer: bobToCarolPeer, publicationId: publication.id, contentHash: publication.contentReference.hash });
            assert(result.outcome === PeerSnapshotMaterializationOutcome.STORED,
                '5. Bob, explicitly asking Carol (never Alice, and never a coordinator trying every connected peer), obtains and stores the bytes');
            assert(result.source.kind === SnapshotMaterializationSourceKind.PEER, '6. the materialization is tagged source PEER');
            assert(await bobContentStore.get(publication.contentReference) === '{"snapshot":"village-hall"}', '7. the stored bytes are exactly what Carol held');
            assert(result.publicationKnown === true, '8. publicationKnown correctly reports Bob already cataloged this publication');
        }

        // --- Negative security test: an authenticated peer supplying the
        //     WRONG bytes under the claimed hash is rejected outright,
        //     regardless of authentication. ---
        {
            // A second, independent publication. Carol genuinely holds
            // (and genuinely answers with) the REAL bytes over the real
            // transport — the TamperingExchange below only substitutes
            // forged bytes into the event this replica's own use case
            // sees, exactly modeling "an authenticated peer's own message
            // claims bytes that do not verify," never a transport failure.
            const forgedPublication = await publishAndCatalog(carol, bobCatalog, carolContentStore, '{"snapshot":"real-blueprint"}');

            class TamperingExchange {
                constructor(realExchange) { this._real = realExchange; }
                request(peer, args) { this._real.request(peer, args); }
                onContentReceived(callback) {
                    return this._real.onContentReceived(({ publicationId, contentHash }) => {
                        // Carol is authenticated and responsive, but the
                        // bytes she supplies do not match what she claims.
                        callback({ publicationId, contentHash, bytes: '{"snapshot":"forged-blueprint"}' });
                    });
                }
            }
            const tamperingExchange = new TamperingExchange(bobToCarolExchange);
            const useCase = new MaterializeSnapshotFromPeerUseCase(tamperingExchange, bobStoreSnapshotContentUseCase, bobCatalog, { timeoutMs: 2000 });
            const result = await useCase.execute({ peer: bobToCarolPeer, publicationId: forgedPublication.id, contentHash: forgedPublication.contentReference.hash });
            assert(result.outcome === PeerSnapshotMaterializationOutcome.HASH_MISMATCH,
                '9. an authenticated peer supplying bytes that do not match the claimed hash is rejected — authentication is not content authority');
            assert(!(await bobContentStore.has(forgedPublication.contentReference)), '10. the forged bytes are never stored under the real hash');
        }

        aliceExchange.dispose();
        carolExchange.dispose();
        bobToAliceExchange.dispose();
        bobToCarolExchange.dispose();
        stopAliceListening();
        stopCarolListening();
        aliceTransport.dispose();
        bobToAliceTransport.dispose();
        carolTransport.dispose();
        bobToCarolTransport.dispose();
    }
    console.log('✓ Section D: FLAGSHIP — explicit single-peer selection over real live connections; a non-possessing peer answers with silence (UNAVAILABLE, never forwarded/resolved); an authenticated peer\'s forged bytes are rejected (HASH_MISMATCH); the correct peer\'s bytes are obtained and stored under source PEER');

    console.log('\nAll Explicit Peer Snapshot Content Transfer tests passed.');
}

run().catch((error) => {
    console.error('PeerSnapshotContentTransfer.test.js FAILED:', error);
    process.exitCode = 1;
});
