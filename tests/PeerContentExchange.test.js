import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { ContentReference } from '../core/ContentReference.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { PublicationExchange } from '../application/PublicationExchange.js';
import { PublicationResolver } from '../application/PublicationResolver.js';
import { PublicationResolutionOutcome } from '../application/PublicationResolutionOutcome.js';
import { PublicationPeerExchange } from '../application/PublicationPeerExchange.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { BlueprintAttribution, BLUEPRINT_ATTRIBUTION_KIND } from '../core/BlueprintAttribution.js';
import { LocalBlueprintAttributionStore } from '../application/LocalBlueprintAttributionStore.js';
import { createBlueprintAttributionPublicationKind } from '../application/BlueprintAttributionPublicationKind.js';
import {
    PeerContentMessageKind,
    MAX_CONTENT_BYTES,
    isValidContentHash,
    toContentRequestMessage,
    toContentResponseMessage,
    isValidPeerContentMessage
} from '../application/PeerContentProtocol.js';
import { PeerContentExchange } from '../application/PeerContentExchange.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';

// 0.7.4 — Peer Content Retrieval.
//
//   Section A: PeerContentProtocol — REQUEST/RESPONSE wire shapes, hash
//              format validation, MAX_CONTENT_BYTES enforced on both the
//              sending and the receiving side
//   Section B: PeerContentExchange — routing/gating against a stub
//              PeerMessageBus + ConnectedPeerRegistry: request() and
//              _handleRequest() both refuse a hash the local catalog
//              does not know; a malformed/oversized/unsolicited/
//              hash-mismatched RESPONSE is dropped silently and never
//              crashes the bus; a duplicate or concurrently-sourced
//              RESPONSE for the same hash converges harmlessly; dispose()
//              stops both directions
//   Section C: FLAGSHIP — a real, live, authenticated connection carries
//              BOTH a PublicationPeerExchange (0.7.3, unmodified) and a
//              PeerContentExchange multiplexed over the SAME
//              peer/PeerMessageBus.js instance per side. Bob catalogs
//              Alice's publication live, resolves CONTENT_UNAVAILABLE,
//              asks Alice for the bytes by hash, and resolves RESOLVED —
//              with no file, no clipboard, and no change to
//              PublicationPeerExchange or PublicationResolver.
//
// See docs/Principles.md, "Content Delivery Is Not Content Authority
// (0.7.4)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
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

// Publishes real bytes into `contentStore` and returns a signed
// DecentralizedPublication + catalog entry for them, mirroring what
// application/PublicationResolver.js#publish() + LocalPublicationCatalog#
// add() actually do — this file's own tests need a REAL, retrievable
// content hash, never a fabricated one, since PeerContentExchange only
// ever authorizes a hash the catalog genuinely knows.
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

// A minimal stand-in for peer/PeerMessageBus.js, mirroring tests/
// PublicationPeerExchange.test.js's own StubPeerMessageBus exactly —
// real enough to exercise application/PeerContentExchange.js's own
// routing/gating logic deterministically, without a real handshake.
// Section C below runs the identical class against the REAL bus.
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

async function run() {
    // ---------------------------------------------------------------
    // Section A — PeerContentProtocol
    // ---------------------------------------------------------------
    {
        assert(isValidContentHash('abc123'), '1. a plain hex hash is valid');
        assert(!isValidContentHash(''), '2. an empty hash is invalid');
        assert(!isValidContentHash(null), '3. a non-string hash is invalid');
        assert(!isValidContentHash('not-hex!'), '4. a hash with non-hex characters is invalid');
        assert(!isValidContentHash('a'.repeat(200)), '5. an absurdly long hash is invalid');

        const request = toContentRequestMessage('abc123');
        assert(request.kind === PeerContentMessageKind.REQUEST && request.hash === 'abc123', '6. toContentRequestMessage() builds a REQUEST');
        expectThrows(() => toContentRequestMessage(''), '7. toContentRequestMessage() rejects an invalid hash');

        const response = toContentResponseMessage('abc123', '{"x":1}');
        assert(response.kind === PeerContentMessageKind.RESPONSE && response.bytes === '{"x":1}', '8. toContentResponseMessage() builds a RESPONSE');
        expectThrows(() => toContentResponseMessage('abc123', ''), '9. toContentResponseMessage() rejects empty bytes');
        expectThrows(() => toContentResponseMessage('abc123', 'x'.repeat(MAX_CONTENT_BYTES + 1)), '10. toContentResponseMessage() rejects bytes over MAX_CONTENT_BYTES');

        assert(isValidPeerContentMessage(request), '11. a freshly built REQUEST validates');
        assert(isValidPeerContentMessage(response), '12. a freshly built RESPONSE validates');
        assert(!isValidPeerContentMessage(null), '13. null is not a valid message');
        assert(!isValidPeerContentMessage({ kind: 'REQUEST', hash: '' }), '14. a REQUEST with an invalid hash is rejected');
        assert(!isValidPeerContentMessage({ kind: 'RESPONSE', hash: 'abc123', bytes: '' }), '15. a RESPONSE with empty bytes is rejected');
        assert(!isValidPeerContentMessage({ kind: 'RESPONSE', hash: 'abc123', bytes: 'x'.repeat(MAX_CONTENT_BYTES + 1) }), '16. a hand-crafted oversized RESPONSE is rejected, bypassing the sending-side check entirely');
        assert(!isValidPeerContentMessage({ kind: 'SOMETHING_ELSE', hash: 'abc123' }), '17. an unknown kind is rejected');
    }
    console.log('✓ Section A: PeerContentProtocol — REQUEST/RESPONSE wire shapes, hash + size validation on both sides');

    // ---------------------------------------------------------------
    // Section B — PeerContentExchange, against a stub transport
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const catalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const contentStore = new LocalContentStore(new InMemoryStorageProvider());

        expectThrows(() => new PeerContentExchange(null, new StubPeerMessageBus(), new StubConnectedPeerRegistry(), catalog),
            '1. constructor requires a ContentStore');
        expectThrows(() => new PeerContentExchange(contentStore, null, new StubConnectedPeerRegistry(), catalog),
            '2. constructor requires a PeerMessageBus');
        expectThrows(() => new PeerContentExchange(contentStore, new StubPeerMessageBus(), null, catalog),
            '3. constructor requires a ConnectedPeerRegistry');
        expectThrows(() => new PeerContentExchange(contentStore, new StubPeerMessageBus(), new StubConnectedPeerRegistry(), null),
            '4. constructor requires a PublicationCatalog');

        const authenticatedPeer = stubPeer('conn-authenticated', PeerLifecycleState.AUTHENTICATED);
        const bus = new StubPeerMessageBus();
        const registry = new StubConnectedPeerRegistry([authenticatedPeer]);
        const exchange = new PeerContentExchange(contentStore, bus, registry, catalog);

        assert(bus.attached.has('conn-authenticated'), '5. every peer already in the registry is attached on construction');

        const newPeer = stubPeer('conn-new', PeerLifecycleState.AUTHENTICATED);
        registry._peers = [...registry._peers, newPeer];
        registry.fireChange();
        assert(bus.attached.has('conn-new'), '6. a peer added later (registry onChange) is attached automatically too');

        // --- request() authorization boundary ---
        expectThrows(() => exchange.request(authenticatedPeer, 'unknown-hash'),
            '7. request() refuses a hash with no known publication in the catalog');

        const publication = await publishAndCatalog(alice, catalog, contentStore, '{"blueprint":"farmstead"}');
        const hash = publication.contentReference.hash;

        exchange.request(authenticatedPeer, hash);
        assert(bus.sent.length === 1 && bus.sent[0].protocol === PeerContentExchange.DEFAULT_PROTOCOL, '8. request() sends under this class\'s own namespaced protocol');
        assert(bus.sent[0].payload.kind === PeerContentMessageKind.REQUEST && bus.sent[0].payload.hash === hash, '9. request() sends a REQUEST for exactly the requested hash');

        // --- responding side: _handleRequest() ---
        const responderBus = new StubPeerMessageBus();
        const responderRegistry = new StubConnectedPeerRegistry([]);
        const responderExchange = new PeerContentExchange(contentStore, responderBus, responderRegistry, catalog);
        const requestingPeer = stubPeer('conn-requester', PeerLifecycleState.AUTHENTICATED);

        responderBus.deliver(PeerContentExchange.DEFAULT_PROTOCOL, { kind: 'REQUEST', hash: 'unknown-hash' }, { connectedPeer: requestingPeer });
        await wait(5);
        assert(responderBus.sent.length === 0, '10. a REQUEST for a hash the responder\'s catalog does not know goes unanswered');

        responderBus.deliver(PeerContentExchange.DEFAULT_PROTOCOL, { kind: 'REQUEST', hash }, { connectedPeer: requestingPeer });
        await wait(5);
        assert(responderBus.sent.length === 1, '11. a REQUEST for a known, locally-available hash is answered');
        assert(responderBus.sent[0].payload.kind === PeerContentMessageKind.RESPONSE
            && responderBus.sent[0].payload.hash === hash
            && responderBus.sent[0].payload.bytes === '{"blueprint":"farmstead"}',
            '12. the RESPONSE carries the correct hash and bytes');
        assert(responderBus.sent[0].peer === requestingPeer, '13. the RESPONSE is sent back to exactly the requester, never broadcast');

        // A hash the responder's catalog knows about, but whose bytes are
        // not (or no longer) in its own ContentStore.
        const emptyStore = new LocalContentStore(new InMemoryStorageProvider());
        const sparseExchange = new PeerContentExchange(emptyStore, new StubPeerMessageBus(), new StubConnectedPeerRegistry([]), catalog);
        const sparseBus = sparseExchange._bus;
        sparseBus.deliver(PeerContentExchange.DEFAULT_PROTOCOL, { kind: 'REQUEST', hash }, { connectedPeer: requestingPeer });
        await wait(5);
        assert(sparseBus.sent.length === 0, '14. a REQUEST for a cataloged hash the responder cannot actually retrieve goes unanswered too');

        // --- receiving side: _handleResponse() ---
        const bobCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        bobCatalog.add(publication);
        const bobContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const bobBus = new StubPeerMessageBus();
        const bobExchange = new PeerContentExchange(bobContentStore, bobBus, new StubConnectedPeerRegistry([]), bobCatalog);
        const received = [];
        bobExchange.onContentReceived((event) => received.push(event));

        bobBus.deliver(PeerContentExchange.DEFAULT_PROTOCOL, { kind: 'SOMETHING_ELSE', hash });
        assert(received.length === 0 && !bobContentStore.has(new ContentReference({ hash })), '15. a malformed message is silently dropped, never crashes, never stores');

        bobBus.deliver(PeerContentExchange.DEFAULT_PROTOCOL, { kind: 'RESPONSE', hash: 'never-cataloged-hash', bytes: 'anything' });
        assert(received.length === 0, '16. an unsolicited RESPONSE for a hash never cataloged by this replica is dropped');

        bobBus.deliver(PeerContentExchange.DEFAULT_PROTOCOL, toContentResponseMessage(hash, '{"tampered":true}'));
        assert(received.length === 0 && !bobContentStore.has(new ContentReference({ hash })),
            '17. a RESPONSE whose bytes do not hash to the claimed hash is rejected — never trusted merely because a peer sent it');

        bobBus.deliver(PeerContentExchange.DEFAULT_PROTOCOL, toContentResponseMessage(hash, '{"blueprint":"farmstead"}'));
        await wait(5);
        assert(received.length === 1 && received[0].hash === hash, '18. a genuine, hash-verified RESPONSE is accepted and fires onContentReceived');
        assert(bobContentStore.has(new ContentReference({ hash })), '19. the verified bytes are actually stored');
        assert(await bobContentStore.get(new ContentReference({ hash })) === '{"blueprint":"farmstead"}', '20. the stored bytes are exactly what was received');

        // Duplicate delivery — harmless, converges to one stored entry.
        bobBus.deliver(PeerContentExchange.DEFAULT_PROTOCOL, toContentResponseMessage(hash, '{"blueprint":"farmstead"}'));
        await wait(5);
        assert(received.length === 2, '21. re-delivering the identical RESPONSE fires the event again, but causes no error');
        assert(await bobContentStore.get(new ContentReference({ hash })) === '{"blueprint":"farmstead"}', '22. the store still holds exactly the one correct entry, not a duplicate or a corruption');

        // Concurrent-style: two independent "peers" both answering the
        // same REQUEST with identical bytes converge to the same entry.
        const charlieResponse = toContentResponseMessage(hash, '{"blueprint":"farmstead"}');
        bobBus.deliver(PeerContentExchange.DEFAULT_PROTOCOL, charlieResponse);
        await wait(5);
        assert(await bobContentStore.get(new ContentReference({ hash })) === '{"blueprint":"farmstead"}',
            '23. two sources answering with identical bytes for the same hash still converge to one entry');

        // dispose()
        const disposalBus = new StubPeerMessageBus();
        const disposalCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        disposalCatalog.add(publication);
        const disposalExchange = new PeerContentExchange(new LocalContentStore(new InMemoryStorageProvider()), disposalBus, new StubConnectedPeerRegistry([]), disposalCatalog);
        const disposalReceived = [];
        disposalExchange.onContentReceived((r) => disposalReceived.push(r));
        disposalExchange.dispose();
        disposalBus.deliver(PeerContentExchange.DEFAULT_PROTOCOL, toContentResponseMessage(hash, '{"blueprint":"farmstead"}'));
        assert(disposalReceived.length === 0, '24. dispose() unsubscribes from the bus — no further deliveries are handled');
    }
    console.log('✓ Section B: PeerContentExchange — catalog-gated request()/​_handleRequest(), hash-verified _handleResponse(), malformed/oversized/unsolicited/tampered drops, duplicate + concurrent convergence, dispose()');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP: a real, live, authenticated connection,
    // carrying BOTH PublicationPeerExchange AND PeerContentExchange
    // multiplexed over the same peer/PeerMessageBus.js instance per side
    // ---------------------------------------------------------------
    {
        const network = new LocalPeerNetwork();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');

        const aliceTransport = new LocalPeerConnectionProvider('alice-content', network);
        const bobTransport = new LocalPeerConnectionProvider('bob-content', network);

        const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        const stopListening = aliceConnect.listen();
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const bobConnectedPeer = bobConnect.connect({ candidateEndpoint: 'alice-content' });

        await wait(20);
        assert(bobConnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '1. setup: Bob authenticates over a real live connection');
        assert(aliceConnect.registry.list()[0]?.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, "2. setup: Alice's own side authenticates too");

        const verifier = new LocalAuthorizationVerifier();

        const aliceContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const bobContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const aliceResolver = new PublicationResolver(aliceContentStore, verifier);
        const bobResolver = new PublicationResolver(bobContentStore, verifier);

        const aliceCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const aliceExchange = new PublicationExchange(aliceCatalog, verifier);
        const bobCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const bobExchange = new PublicationExchange(bobCatalog, verifier);
        const bobAttributionStore = new LocalBlueprintAttributionStore(new InMemoryStorageProvider());

        // ONE PeerMessageBus per side, shared by both protocols — proves
        // application/PublicationPeerExchange.js and application/
        // PeerContentExchange.js genuinely multiplex over the same
        // authenticated connection, exactly as peer/PeerMessageBus.js's
        // own header always promised.
        const aliceBus = new PeerMessageBus();
        const bobBus = new PeerMessageBus();

        const alicePublicationPeerExchange = new PublicationPeerExchange(aliceExchange, aliceBus, aliceConnect.registry);
        const bobPublicationPeerExchange = new PublicationPeerExchange(bobExchange, bobBus, bobConnect.registry);
        const aliceContentExchange = new PeerContentExchange(aliceContentStore, aliceBus, aliceConnect.registry, aliceCatalog);
        const bobContentExchange = new PeerContentExchange(bobContentStore, bobBus, bobConnect.registry, bobCatalog);

        const received = [];
        bobPublicationPeerExchange.onPublicationReceived((result) => received.push(result));
        const contentReceived = [];
        bobContentExchange.onContentReceived((event) => contentReceived.push(event));

        const attribution = new BlueprintAttribution({
            fingerprint: 'bp:farmstead-1',
            authorIdentityId: alice.getSigningIdentity().id
        });
        const signedAttribution = attribution.withSignature(alice.signCanonical(attribution.getSigningDescriptor()));

        const publication = await aliceResolver.publish({
            content: signedAttribution,
            contentKind: BLUEPRINT_ATTRIBUTION_KIND,
            identityProvider: alice
        });
        aliceCatalog.add(publication);

        assert(bobCatalog.has(publication.id) === false, '3. Bob has not seen the publication before it is announced');

        alicePublicationPeerExchange.announce(publication);
        await wait(20);

        assert(bobCatalog.has(publication.id), '4. Bob catalogs the publication the instant it arrives over the live connection');
        assert(received.length === 1 && received[0].isNew === true, "5. Bob's onPublicationReceived fires for the live announcement");

        const bobKindPlugin = createBlueprintAttributionPublicationKind({ verifier, store: bobAttributionStore });
        const envelope = publication.toJSON();

        const beforeResult = await bobResolver.resolve(envelope, bobKindPlugin);
        assert(beforeResult.outcome === PublicationResolutionOutcome.CONTENT_UNAVAILABLE,
            '6. before requesting content, resolving still reports CONTENT_UNAVAILABLE — discovery is still not resolution');

        // Bob now asks Alice, over the SAME live connection, for the
        // bytes his own catalog already knows a publication points at.
        const hash = publication.contentReference.hash;
        bobContentExchange.request(bobConnectedPeer, hash);
        await wait(20);

        assert(contentReceived.length === 1 && contentReceived[0].hash === hash, '7. Bob receives and verifies the RESPONSE');
        assert(bobContentStore.has(publication.contentReference), '8. the bytes are now in Bob\'s own ContentStore');

        const afterResult = await bobResolver.resolve(envelope, bobKindPlugin);
        assert(afterResult.outcome === PublicationResolutionOutcome.RESOLVED,
            '9. the identical publication now resolves once its bytes were pulled from a peer, with no file and no second exchange');
        assert(afterResult.content.attribution.fingerprint === 'bp:farmstead-1', '10. the resolved content is the correct attribution');
        assert(bobCatalog.list().length === 1, '11. resolving never adds a second catalog entry');

        // Requesting again (e.g. a retry, or another caller in the same
        // replica) is harmless — content-addressing makes it idempotent.
        bobContentExchange.request(bobConnectedPeer, hash);
        await wait(20);
        assert(contentReceived.length === 2, '12. a repeated request still succeeds, harmlessly');
        assert(await bobContentStore.get(publication.contentReference) === await aliceContentStore.get(publication.contentReference),
            '13. the store still holds exactly the correct bytes, unchanged by the repeat');

        alicePublicationPeerExchange.dispose();
        bobPublicationPeerExchange.dispose();
        aliceContentExchange.dispose();
        bobContentExchange.dispose();
        stopListening();
        aliceTransport.dispose();
        bobTransport.dispose();
    }
    console.log('✓ Section C: FLAGSHIP — PublicationPeerExchange and PeerContentExchange multiplexed live over one real authenticated connection; CONTENT_UNAVAILABLE → peer content retrieval → RESOLVED, with no file and no second exchange');

    console.log('\nAll Peer Content Retrieval tests passed.');
}

run().catch((error) => {
    console.error('PeerContentExchange.test.js FAILED:', error);
    process.exitCode = 1;
});
