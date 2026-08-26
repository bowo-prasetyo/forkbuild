import { ContentReference } from '../core/ContentReference.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { CheckLocalSnapshotContentAvailabilityUseCase } from '../application/CheckLocalSnapshotContentAvailabilityUseCase.js';
import { LocalSnapshotContentAvailabilityOutcome } from '../application/LocalSnapshotContentAvailabilityOutcome.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';

import {
    PeerSnapshotPossessionMessageKind,
    PeerSnapshotPossessionWireState,
    isValidContentHash,
    toSnapshotPossessionRequestMessage,
    toSnapshotPossessionResponseMessage,
    isValidPeerSnapshotPossessionMessage
} from '../application/PeerSnapshotPossessionProtocol.js';
import { PublicationSnapshotPossessionPeerExchange } from '../application/PublicationSnapshotPossessionPeerExchange.js';
import { SnapshotPeerPossessionState } from '../application/SnapshotPeerPossessionState.js';
import { toSnapshotPeerPossessionObservation, isPeerSnapshotPossessed } from '../application/SnapshotPeerPossessionObservation.js';
import { ObservePeerSnapshotPossessionUseCase } from '../application/ObservePeerSnapshotPossessionUseCase.js';
import { SnapshotPeerPossessionCoordinator } from '../application/SnapshotPeerPossessionCoordinator.js';
import { SnapshotPeerPossessionUiState } from '../application/SnapshotPeerPossessionUiState.js';
import { describePeerPossessionAttempt, describePeerPossessionButtonLabel } from '../application/SnapshotPeerPossessionView.js';

// Also exercises "Get Snapshot from Peer" (0.8.37) for the flagship's own
// "knowing is not possessing" step.
import { MaterializeSnapshotFromPeerUseCase } from '../application/MaterializeSnapshotFromPeerUseCase.js';
import { StoreSnapshotContentUseCase } from '../application/StoreSnapshotContentUseCase.js';
import { PublicationSnapshotContentPeerExchange } from '../application/PublicationSnapshotContentPeerExchange.js';
import { PeerSnapshotMaterializationOutcome } from '../application/PeerSnapshotMaterializationOutcome.js';

// 0.8.40 — Snapshot Possession Observation Exchange.
//
//   Section A: PeerSnapshotPossessionProtocol — REQUEST/RESPONSE wire
//              shapes; unlike application/PeerSnapshotContentProtocol.js
//              (0.8.37), there is no third, silence-shaped outcome — a
//              RESPONSE always carries an explicit AVAILABLE or
//              NOT_AVAILABLE, never a CONTENT_HASH_MISMATCH-shaped value.
//   Section B: PublicationSnapshotPossessionPeerExchange — routing/gating
//              against a stub PeerMessageBus + ConnectedPeerRegistry: the
//              responding side ALWAYS answers (both when it holds the
//              bytes and when it does not — never silence, the one
//              structural difference from application/
//              PublicationSnapshotContentPeerExchange.js), reuses
//              application/CheckLocalSnapshotContentAvailabilityUseCase.js
//              UNCHANGED, collapses CONTENT_HASH_MISMATCH to NOT_AVAILABLE
//              on the wire, and reports the answering peer's own
//              connectionId as `peerId`; dispose() stops both directions.
//   Section C: ObservePeerSnapshotPossessionUseCase + coordinator + views,
//              against a scriptable fake exchange — AVAILABLE,
//              NOT_AVAILABLE, UNAVAILABLE (timeout), constructor
//              validation, and the observation shape itself.
//   Section D: FLAGSHIP — a real, live, authenticated connection. Alice and
//              Carol both possess a snapshot's bytes; Bob does not. Bob
//              asks Alice, then Carol — both report AVAILABLE — while
//              Bob's OWN local possession stays NOT_AVAILABLE throughout,
//              and no application/PublicationSnapshotPlacement.js is ever
//              created as a side effect of either answer. Only once Bob
//              explicitly runs "Get Snapshot from Peer" (0.8.37) against
//              Alice does he actually come to possess the bytes — proving
//              knowing a peer possesses content is not itself possessing
//              it. A final test proves an observation is a frozen fact
//              about the past: Alice's own possession changes AFTER Bob's
//              first observation, and that first observation's own `state`
//              never changes to match.
//
// See docs/Principles.md, "Peer Possession Responses Are Observations, Not
// Placement Claims (0.8.40)."

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

// A minimal fake application/PublicationSnapshotPossessionPeerExchange.js
// for Section C, so ObservePeerSnapshotPossessionUseCase's own
// timing/mapping logic can be tested deterministically without a real
// transport.
class FakeExchange {
    constructor() {
        this._listeners = new Set();
        this.requests = [];
    }
    requestPossession(peer, { publicationId, contentHash }) {
        this.requests.push({ peer, publicationId, contentHash });
    }
    onPossessionReceived(callback) {
        this._listeners.add(callback);
        return () => this._listeners.delete(callback);
    }
    deliver(event) {
        for (const listener of Array.from(this._listeners)) listener(event);
    }
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — PeerSnapshotPossessionProtocol
    // ---------------------------------------------------------------
    {
        assert(isValidContentHash('abc123'), '1. a plain hex hash is valid');
        assert(!isValidContentHash(''), '2. an empty hash is invalid');

        const request = toSnapshotPossessionRequestMessage('pub-1', 'abc123');
        assert(request.kind === PeerSnapshotPossessionMessageKind.REQUEST
            && request.publicationId === 'pub-1' && request.contentHash === 'abc123',
            '3. toSnapshotPossessionRequestMessage() builds a REQUEST carrying both fields');
        expectThrows(() => toSnapshotPossessionRequestMessage('', 'abc123'), '4. rejects a missing publicationId');
        expectThrows(() => toSnapshotPossessionRequestMessage('pub-1', ''), '5. rejects a missing contentHash');

        const available = toSnapshotPossessionResponseMessage('pub-1', 'abc123', PeerSnapshotPossessionWireState.AVAILABLE);
        assert(available.kind === PeerSnapshotPossessionMessageKind.RESPONSE && available.possession === PeerSnapshotPossessionWireState.AVAILABLE,
            '6. toSnapshotPossessionResponseMessage() builds an AVAILABLE RESPONSE');
        const notAvailable = toSnapshotPossessionResponseMessage('pub-1', 'abc123', PeerSnapshotPossessionWireState.NOT_AVAILABLE);
        assert(notAvailable.possession === PeerSnapshotPossessionWireState.NOT_AVAILABLE, '7. and a NOT_AVAILABLE RESPONSE');
        expectThrows(() => toSnapshotPossessionResponseMessage('pub-1', 'abc123', 'content-hash-mismatch'),
            '8. there is no third wire value — a CONTENT_HASH_MISMATCH-shaped possession is rejected outright');
        expectThrows(() => toSnapshotPossessionResponseMessage('pub-1', 'abc123', null), '9. rejects a missing possession value');

        assert(isValidPeerSnapshotPossessionMessage(request), '10. a freshly built REQUEST validates');
        assert(isValidPeerSnapshotPossessionMessage(available), '11. a freshly built RESPONSE validates');
        assert(!isValidPeerSnapshotPossessionMessage(null), '12. null is not a valid message');
        assert(!isValidPeerSnapshotPossessionMessage({ kind: 'RESPONSE', publicationId: 'pub-1', contentHash: 'abc123', possession: 'content-hash-mismatch' }),
            '13. a hand-crafted RESPONSE carrying a third possession value is rejected, bypassing the sending-side check entirely');
        assert(!isValidPeerSnapshotPossessionMessage({ kind: 'ANNOUNCE', publicationId: 'pub-1', contentHash: 'abc123' }),
            '14. there is no ANNOUNCE kind — an unknown kind is rejected');
    }
    console.log('✓ Section A: PeerSnapshotPossessionProtocol — REQUEST/RESPONSE wire shapes, exactly two possession values, no ANNOUNCE/NOT_FOUND kind');

    // ---------------------------------------------------------------
    // Section B — PublicationSnapshotPossessionPeerExchange, stub transport
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const contentStore = new LocalContentStore(storageProvider);
        const checkLocalPossession = new CheckLocalSnapshotContentAvailabilityUseCase(contentStore);

        expectThrows(() => new PublicationSnapshotPossessionPeerExchange(null, new StubPeerMessageBus(), new StubConnectedPeerRegistry()),
            '1. constructor requires a CheckLocalSnapshotContentAvailabilityUseCase');
        expectThrows(() => new PublicationSnapshotPossessionPeerExchange(checkLocalPossession, null, new StubConnectedPeerRegistry()),
            '2. constructor requires a PeerMessageBus');
        expectThrows(() => new PublicationSnapshotPossessionPeerExchange(checkLocalPossession, new StubPeerMessageBus(), null),
            '3. constructor requires a ConnectedPeerRegistry');

        const authenticatedPeer = stubPeer('conn-authenticated', PeerLifecycleState.AUTHENTICATED);
        const bus = new StubPeerMessageBus();
        const registry = new StubConnectedPeerRegistry([authenticatedPeer]);
        const exchange = new PublicationSnapshotPossessionPeerExchange(checkLocalPossession, bus, registry);

        assert(bus.attached.has('conn-authenticated'), '4. every peer already in the registry is attached on construction');

        // --- requestPossession() carries both fields ---
        exchange.requestPossession(authenticatedPeer, { publicationId: 'pub-1', contentHash: 'abc123' });
        assert(bus.sent.length === 1 && bus.sent[0].protocol === PublicationSnapshotPossessionPeerExchange.DEFAULT_PROTOCOL,
            '5. requestPossession() sends under this class\'s own namespaced protocol');
        assert(bus.sent[0].payload.kind === PeerSnapshotPossessionMessageKind.REQUEST
            && bus.sent[0].payload.publicationId === 'pub-1' && bus.sent[0].payload.contentHash === 'abc123',
            '6. requestPossession() sends a REQUEST for exactly the given publicationId + contentHash');

        // --- responding side ALWAYS answers, never silence ---
        const reference = await contentStore.put('{"blueprint":"farmstead"}');
        const responderBus = new StubPeerMessageBus();
        const responderExchange = new PublicationSnapshotPossessionPeerExchange(checkLocalPossession, responderBus, new StubConnectedPeerRegistry([]));
        const requestingPeer = stubPeer('conn-requester', PeerLifecycleState.AUTHENTICATED);

        responderBus.deliver(PublicationSnapshotPossessionPeerExchange.DEFAULT_PROTOCOL,
            { kind: 'REQUEST', publicationId: 'unknown-pub', contentHash: 'deadbeef00' }, { connectedPeer: requestingPeer });
        await wait(5);
        assert(responderBus.sent.length === 1 && responderBus.sent[0].payload.possession === PeerSnapshotPossessionWireState.NOT_AVAILABLE,
            '7. a REQUEST for a hash not in the local ContentStore is still answered — NOT_AVAILABLE, never silence');

        responderBus.deliver(PublicationSnapshotPossessionPeerExchange.DEFAULT_PROTOCOL,
            { kind: 'REQUEST', publicationId: 'some-publication-nobody-cataloged', contentHash: reference.hash }, { connectedPeer: requestingPeer });
        await wait(5);
        assert(responderBus.sent.length === 2 && responderBus.sent[1].payload.possession === PeerSnapshotPossessionWireState.AVAILABLE,
            '8. a REQUEST for a hash this replica actually HOLDS is answered AVAILABLE, even for a publicationId no catalog anywhere knows');
        assert(responderBus.sent[1].payload.publicationId === 'some-publication-nobody-cataloged' && responderBus.sent[1].payload.contentHash === reference.hash,
            '9. the RESPONSE echoes publicationId/contentHash for correlation only');
        assert(responderBus.sent[1].peer === requestingPeer, '10. the RESPONSE is sent back to exactly the requester, never broadcast');

        // --- CONTENT_HASH_MISMATCH collapses to NOT_AVAILABLE on the wire ---
        storageProvider.save('content:deadbeef01', 'these bytes do not hash to deadbeef01');
        const localOutcome = await checkLocalPossession.execute({ id: 'p', contentReference: new ContentReference({ hash: 'deadbeef01' }) });
        assert(localOutcome.outcome === LocalSnapshotContentAvailabilityOutcome.CONTENT_HASH_MISMATCH,
            '11. setup: the local check itself genuinely reports CONTENT_HASH_MISMATCH for this hash');
        responderBus.deliver(PublicationSnapshotPossessionPeerExchange.DEFAULT_PROTOCOL,
            { kind: 'REQUEST', publicationId: 'pub-1', contentHash: 'deadbeef01' }, { connectedPeer: requestingPeer });
        await wait(5);
        assert(responderBus.sent.length === 3 && responderBus.sent[2].payload.possession === PeerSnapshotPossessionWireState.NOT_AVAILABLE,
            '12. a hash this replica holds bytes for, but that fails its own integrity check, is answered NOT_AVAILABLE — never a third wire value');

        // --- receiving side: onPossessionReceived() reports peerId + state ---
        const bobBus = new StubPeerMessageBus();
        const bobExchange = new PublicationSnapshotPossessionPeerExchange(checkLocalPossession, bobBus, new StubConnectedPeerRegistry([]));
        const received = [];
        bobExchange.onPossessionReceived((event) => received.push(event));

        bobBus.deliver(PublicationSnapshotPossessionPeerExchange.DEFAULT_PROTOCOL, { kind: 'SOMETHING_ELSE', publicationId: 'p', contentHash: 'h' });
        assert(received.length === 0, '13. a malformed message is silently dropped, never crashes, never fires');

        const answeringPeer = stubPeer('conn-answerer', PeerLifecycleState.AUTHENTICATED);
        bobBus.deliver(PublicationSnapshotPossessionPeerExchange.DEFAULT_PROTOCOL,
            toSnapshotPossessionResponseMessage('pub-1', 'cafef00d', PeerSnapshotPossessionWireState.AVAILABLE),
            { connectedPeer: answeringPeer });
        assert(received.length === 1 && received[0].peerId === 'conn-answerer' && received[0].contentHash === 'cafef00d'
            && received[0].state === PeerSnapshotPossessionWireState.AVAILABLE,
            '14. onPossessionReceived() fires with the answering peer\'s own connectionId and the raw wire state');

        // dispose()
        const disposalBus = new StubPeerMessageBus();
        const disposalExchange = new PublicationSnapshotPossessionPeerExchange(checkLocalPossession, disposalBus, new StubConnectedPeerRegistry([]));
        const disposalReceived = [];
        disposalExchange.onPossessionReceived((r) => disposalReceived.push(r));
        disposalExchange.dispose();
        disposalBus.deliver(PublicationSnapshotPossessionPeerExchange.DEFAULT_PROTOCOL,
            toSnapshotPossessionResponseMessage('pub-1', 'abc123', PeerSnapshotPossessionWireState.AVAILABLE), { connectedPeer: answeringPeer });
        assert(disposalReceived.length === 0, '15. dispose() unsubscribes from the bus — no further deliveries are handled');
    }
    console.log('✓ Section B: PublicationSnapshotPossessionPeerExchange — ALWAYS answers a REQUEST (never silence), reuses CheckLocalSnapshotContentAvailabilityUseCase unchanged, CONTENT_HASH_MISMATCH collapses to NOT_AVAILABLE, onPossessionReceived() reports peerId, dispose()');

    // ---------------------------------------------------------------
    // Section C — ObservePeerSnapshotPossessionUseCase + coordinator +
    // views, against a scriptable fake exchange
    // ---------------------------------------------------------------
    {
        const exchange = new FakeExchange();

        expectThrows(() => new ObservePeerSnapshotPossessionUseCase(null), '1. constructor requires an exchange');

        const useCase = new ObservePeerSnapshotPossessionUseCase(exchange, { timeoutMs: 100 });
        const coordinator = new SnapshotPeerPossessionCoordinator(useCase);
        expectThrows(() => new SnapshotPeerPossessionCoordinator(null), '2. coordinator constructor requires a use case');
        const peer = stubPeer('conn-peer', PeerLifecycleState.AUTHENTICATED);

        await expectRejects(coordinator.observe({ publicationId: 'pub-1', contentHash: 'abc' }), '3. execute() throws without a peer');
        await expectRejects(coordinator.observe({ peer, contentHash: 'abc' }), '4. execute() throws without a publicationId');
        await expectRejects(coordinator.observe({ peer, publicationId: 'pub-1' }), '5. execute() throws without a contentHash');

        // AVAILABLE
        {
            const pending = coordinator.observe({ peer, publicationId: 'pub-1', contentHash: 'hash-a' });
            await wait(5);
            assert(exchange.requests.length === 1 && exchange.requests[0].contentHash === 'hash-a',
                '6. observe() sends exactly one request, for exactly the given contentHash');
            exchange.deliver({ peerId: 'conn-peer', publicationId: 'pub-1', contentHash: 'hash-a', state: PeerSnapshotPossessionWireState.AVAILABLE });
            const observation = await pending;
            assert(observation.state === SnapshotPeerPossessionState.AVAILABLE, '7. a wire AVAILABLE resolves to SnapshotPeerPossessionState.AVAILABLE');
            assert(observation.peerId === 'conn-peer' && observation.publicationId === 'pub-1' && observation.contentHash === 'hash-a',
                '8. the observation carries peerId/publicationId/contentHash');
            assert(observation.observedAt instanceof Date, '9. the observation is stamped with this replica\'s own local clock');
            assert(isPeerSnapshotPossessed(observation), '10. isPeerSnapshotPossessed() is true for AVAILABLE');
            assert(Object.isFrozen(observation), '11. the observation is frozen');
        }

        // NOT_AVAILABLE
        {
            const pending = coordinator.observe({ peer, publicationId: 'pub-1', contentHash: 'hash-b' });
            await wait(5);
            exchange.deliver({ peerId: 'conn-peer', publicationId: 'pub-1', contentHash: 'hash-b', state: PeerSnapshotPossessionWireState.NOT_AVAILABLE });
            const observation = await pending;
            assert(observation.state === SnapshotPeerPossessionState.NOT_AVAILABLE, '12. a wire NOT_AVAILABLE resolves to SnapshotPeerPossessionState.NOT_AVAILABLE');
            assert(!isPeerSnapshotPossessed(observation), '13. isPeerSnapshotPossessed() is false for NOT_AVAILABLE');
        }

        // A response for a DIFFERENT peer/hash in flight never resolves this one.
        {
            const otherPeer = stubPeer('conn-other', PeerLifecycleState.AUTHENTICATED);
            const pending = coordinator.observe({ peer, publicationId: 'pub-1', contentHash: 'hash-c' });
            await wait(5);
            exchange.deliver({ peerId: 'conn-other', publicationId: 'pub-1', contentHash: 'hash-c', state: PeerSnapshotPossessionWireState.AVAILABLE });
            exchange.deliver({ peerId: 'conn-peer', publicationId: 'pub-1', contentHash: 'a-different-hash', state: PeerSnapshotPossessionWireState.AVAILABLE });
            exchange.deliver({ peerId: 'conn-peer', publicationId: 'pub-1', contentHash: 'hash-c', state: PeerSnapshotPossessionWireState.NOT_AVAILABLE });
            const observation = await pending;
            assert(observation.state === SnapshotPeerPossessionState.NOT_AVAILABLE,
                '14. only a RESPONSE matching BOTH the selected peer and the requested contentHash resolves this specific request');
            void otherPeer;
        }

        // UNAVAILABLE — nothing ever arrives before the timeout.
        {
            const pending = coordinator.observe({ peer, publicationId: 'pub-1', contentHash: 'a-hash-nobody-answers' });
            const observation = await pending;
            assert(observation.state === SnapshotPeerPossessionState.UNAVAILABLE, '15. a request nobody answers times out to UNAVAILABLE');
            assert(!isPeerSnapshotPossessed(observation), '16. isPeerSnapshotPossessed() is false for UNAVAILABLE');
        }

        // toSnapshotPeerPossessionObservation() validation
        expectThrows(() => toSnapshotPeerPossessionObservation({ contentHash: 'h', state: SnapshotPeerPossessionState.AVAILABLE }), '17. a publicationId is required');
        expectThrows(() => toSnapshotPeerPossessionObservation({ publicationId: 'p', state: SnapshotPeerPossessionState.AVAILABLE }), '18. a contentHash is required');
        expectThrows(() => toSnapshotPeerPossessionObservation({ publicationId: 'p', contentHash: 'h', state: 'not-a-real-state' }), '19. a valid state is required');

        // Views / UI state.
        assert(describePeerPossessionAttempt(null).state === SnapshotPeerPossessionUiState.IDLE, '20. no attempt yet reads IDLE');
        assert(describePeerPossessionAttempt({ checking: true }).state === SnapshotPeerPossessionUiState.CHECKING, '21. an in-flight attempt reads CHECKING');
        assert(describePeerPossessionAttempt({ state: SnapshotPeerPossessionState.AVAILABLE }).label === 'Peer reports snapshot available',
            '22. an AVAILABLE attempt reads exactly "Peer reports snapshot available" — a report, never a verdict');
        assert(describePeerPossessionAttempt({ state: SnapshotPeerPossessionState.NOT_AVAILABLE }).label === 'Peer reports snapshot not available',
            '23. a NOT_AVAILABLE attempt reads exactly "Peer reports snapshot not available"');
        assert(describePeerPossessionAttempt({ state: SnapshotPeerPossessionState.UNAVAILABLE }).state === SnapshotPeerPossessionUiState.UNAVAILABLE,
            '24. an UNAVAILABLE attempt reads UNAVAILABLE');
        assert(describePeerPossessionButtonLabel({}) === 'Check with Peer', '25. the initial button label is "Check with Peer"');
        assert(describePeerPossessionButtonLabel({ checked: true }) === 'Check with Peer Again', '26. after a completed attempt the label invites checking again');
        assert(describePeerPossessionButtonLabel({ checking: true }) === 'Checking…', '27. while in flight the label reads "Checking…"');
    }
    console.log('✓ Section C: ObservePeerSnapshotPossessionUseCase — single-peer request/timeout shape, AVAILABLE/NOT_AVAILABLE/UNAVAILABLE, peer+hash-scoped matching, frozen observation shape, coordinator pass-through, views');

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP: a real, live, authenticated connection.
    // ---------------------------------------------------------------
    {
        const network = new LocalPeerNetwork();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carol = makeIdentity('Carol');

        // --- Bob <-> Alice ---
        const aliceTransport = new LocalPeerConnectionProvider('alice-possession', network);
        const bobToAliceTransport = new LocalPeerConnectionProvider('bob-to-alice-possession', network);
        const aliceListen = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        const stopAliceListening = aliceListen.listen();
        const bobToAliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobToAliceTransport, identityProvider: bob });
        const bobToAlicePeer = bobToAliceConnect.connect({ candidateEndpoint: 'alice-possession' });
        await wait(20);
        assert(bobToAlicePeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '1. setup: Bob authenticates to Alice');

        // --- Bob <-> Carol ---
        const carolTransport = new LocalPeerConnectionProvider('carol-possession', network);
        const bobToCarolTransport = new LocalPeerConnectionProvider('bob-to-carol-possession', network);
        const carolListen = new ConnectToPeerUseCase({ peerConnectionProvider: carolTransport, identityProvider: carol });
        const stopCarolListening = carolListen.listen();
        const bobToCarolConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobToCarolTransport, identityProvider: bob });
        const bobToCarolPeer = bobToCarolConnect.connect({ candidateEndpoint: 'carol-possession' });
        await wait(20);
        assert(bobToCarolPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '2. setup: Bob authenticates to Carol');

        const aliceStorage = new InMemoryStorageProvider();
        const aliceContentStore = new LocalContentStore(aliceStorage);
        const carolContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const bobContentStore = new LocalContentStore(new InMemoryStorageProvider());

        const bobCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        // Alice publishes and holds the bytes; Carol independently obtains
        // and holds the identical bytes too. Bob knows the publication (it
        // names the correct contentHash) but holds nothing.
        const publication = await publishAndCatalog(alice, bobCatalog, aliceContentStore, '{"snapshot":"town-square"}');
        await carolContentStore.put('{"snapshot":"town-square"}');

        const aliceBus = new PeerMessageBus();
        const carolBus = new PeerMessageBus();
        const bobToAliceBus = new PeerMessageBus();
        const bobToCarolBus = new PeerMessageBus();

        const aliceCheckPossession = new CheckLocalSnapshotContentAvailabilityUseCase(aliceContentStore);
        const carolCheckPossession = new CheckLocalSnapshotContentAvailabilityUseCase(carolContentStore);
        const bobCheckPossession = new CheckLocalSnapshotContentAvailabilityUseCase(bobContentStore);

        const aliceExchange = new PublicationSnapshotPossessionPeerExchange(aliceCheckPossession, aliceBus, aliceListen.registry);
        const carolExchange = new PublicationSnapshotPossessionPeerExchange(carolCheckPossession, carolBus, carolListen.registry);
        const bobToAliceExchange = new PublicationSnapshotPossessionPeerExchange(bobCheckPossession, bobToAliceBus, bobToAliceConnect.registry);
        const bobToCarolExchange = new PublicationSnapshotPossessionPeerExchange(bobCheckPossession, bobToCarolBus, bobToCarolConnect.registry);

        // A real placement catalog, shared across this entire flagship
        // scenario, never touched by anything below — proving the "no
        // automatic placement creation" invariant concretely rather than
        // merely by the exchange class's own constructor signature.
        const sharedPlacementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        assert(sharedPlacementCatalog.list().length === 0, '3. setup: the shared placement catalog starts empty');

        // --- Bob asks Alice: AVAILABLE ---
        const bobToAliceUseCase = new ObservePeerSnapshotPossessionUseCase(bobToAliceExchange, { timeoutMs: 2000 });
        const aliceObservation = await bobToAliceUseCase.execute({ peer: bobToAlicePeer, publicationId: publication.id, contentHash: publication.contentReference.hash });
        assert(aliceObservation.state === SnapshotPeerPossessionState.AVAILABLE, '4. Bob asks Alice — Alice reports AVAILABLE');
        assert(aliceObservation.peerId === bobToAlicePeer.connectionId, '5. the observation names exactly the peer that answered');

        // --- Bob asks Carol: AVAILABLE ---
        const bobToCarolUseCase = new ObservePeerSnapshotPossessionUseCase(bobToCarolExchange, { timeoutMs: 2000 });
        const carolObservation = await bobToCarolUseCase.execute({ peer: bobToCarolPeer, publicationId: publication.id, contentHash: publication.contentReference.hash });
        assert(carolObservation.state === SnapshotPeerPossessionState.AVAILABLE, '6. Bob asks Carol — Carol also reports AVAILABLE');

        // --- Bob's own local possession is unaffected by either answer ---
        const bobLocalCheck = await bobCheckPossession.execute(publication);
        assert(bobLocalCheck.outcome === LocalSnapshotContentAvailabilityOutcome.NOT_AVAILABLE,
            '7. Bob\'s OWN local possession remains NOT_AVAILABLE — knowing two peers possess the content does not give Bob possession of it');

        // --- Neither answer created a placement ---
        assert(sharedPlacementCatalog.list().length === 0,
            '8. neither Alice\'s nor Carol\'s AVAILABLE answer created a PublicationSnapshotPlacement — an observation never becomes a locator/trust claim');

        // --- Bob explicitly obtains the bytes from Alice ---
        {
            const bobStoreSnapshotContentUseCase = new StoreSnapshotContentUseCase(bobContentStore);
            const bobToAliceContentBus = new PeerMessageBus();
            const bobToAliceContentExchange = new PublicationSnapshotContentPeerExchange(bobContentStore, bobToAliceContentBus, bobToAliceConnect.registry);
            const aliceContentBus = new PeerMessageBus();
            const aliceContentExchange = new PublicationSnapshotContentPeerExchange(aliceContentStore, aliceContentBus, aliceListen.registry);
            const materializeUseCase = new MaterializeSnapshotFromPeerUseCase(bobToAliceContentExchange, bobStoreSnapshotContentUseCase, bobCatalog, { timeoutMs: 2000 });
            const result = await materializeUseCase.execute({ peer: bobToAlicePeer, publicationId: publication.id, contentHash: publication.contentReference.hash });
            assert(result.outcome === PeerSnapshotMaterializationOutcome.STORED,
                '9. only this SEPARATE, explicit "Get Snapshot from Peer" action actually transfers bytes to Bob');
            const bobLocalCheckAfter = await bobCheckPossession.execute(publication);
            assert(bobLocalCheckAfter.outcome === LocalSnapshotContentAvailabilityOutcome.AVAILABLE,
                '10. only NOW does Bob\'s own local possession read AVAILABLE — proving knowing a peer possesses content and possessing it are two different facts');
            aliceContentExchange.dispose();
            bobToAliceContentExchange.dispose();
        }

        // --- Stale observations: an observation is a frozen fact about the past ---
        {
            const staleUseCase = new ObservePeerSnapshotPossessionUseCase(bobToAliceExchange, { timeoutMs: 2000 });
            const firstObservation = await staleUseCase.execute({ peer: bobToAlicePeer, publicationId: publication.id, contentHash: publication.contentReference.hash });
            assert(firstObservation.state === SnapshotPeerPossessionState.AVAILABLE, '11. setup: a fresh check still reports Alice as AVAILABLE');

            // Alice's own bytes are now gone.
            aliceStorage.remove('content:' + publication.contentReference.hash);
            assert(!(await aliceContentStore.has(publication.contentReference)), '12. setup: Alice\'s own store genuinely no longer holds the bytes');

            await wait(5); // guarantee a distinct observedAt from firstObservation's own millisecond
            const secondObservation = await staleUseCase.execute({ peer: bobToAlicePeer, publicationId: publication.id, contentHash: publication.contentReference.hash });
            assert(secondObservation.state === SnapshotPeerPossessionState.NOT_AVAILABLE, '13. a NEW check against Alice now honestly reports NOT_AVAILABLE');

            assert(firstObservation.state === SnapshotPeerPossessionState.AVAILABLE,
                '14. the FIRST observation itself never changed — it remains AVAILABLE, a frozen fact about what Alice said at T1, not a live view of Alice\'s current possession');
            assert(firstObservation.observedAt.getTime() < secondObservation.observedAt.getTime(),
                '15. the two observations carry two distinct, chronologically ordered observedAt timestamps');
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
    console.log('✓ Section D: FLAGSHIP — Bob asks Alice and Carol (both AVAILABLE) over real live connections while his own local possession stays NOT_AVAILABLE and no placement is ever created; only an explicit "Get Snapshot from Peer" click turns knowledge into possession; a stale observation never updates itself after Alice\'s own possession later changes');

    console.log('\nAll Snapshot Possession Observation Exchange tests passed.');
}

run().catch((error) => {
    console.error('PublicationSnapshotPossessionExchange.test.js FAILED:', error);
    process.exitCode = 1;
});
