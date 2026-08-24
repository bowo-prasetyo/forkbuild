import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { ContentReference } from '../core/ContentReference.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { PublicationExchange } from '../application/PublicationExchange.js';
import { PublicationResolver } from '../application/PublicationResolver.js';
import { PublicationResolutionOutcome } from '../application/PublicationResolutionOutcome.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { BlueprintAttribution, BLUEPRINT_ATTRIBUTION_KIND } from '../core/BlueprintAttribution.js';
import { LocalBlueprintAttributionStore } from '../application/LocalBlueprintAttributionStore.js';
import { createBlueprintAttributionPublicationKind } from '../application/BlueprintAttributionPublicationKind.js';
import {
    PublicationPeerMessageKind,
    toPublicationAnnounceMessage,
    isValidPublicationPeerMessage
} from '../application/PublicationPeerProtocol.js';
import { PublicationPeerExchange } from '../application/PublicationPeerExchange.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';

// 0.7.3 — Peer Publication Exchange.
//
//   Section A: PublicationPeerProtocol — the ANNOUNCE wire shape, pure
//              data, structural validity only
//   Section B: PublicationPeerExchange — routing/gating against a stub
//              PeerMessageBus + ConnectedPeerRegistry: sends only to
//              AUTHENTICATED peers, drops a malformed or forged incoming
//              announce silently (never throws into the bus), fires
//              onPublicationReceived only for what actually catalogs,
//              auto-attaches newly connected peers, dispose() detaches
//   Section C: FLAGSHIP — a real, live, authenticated connection (peer/
//              LocalPeerConnectionProvider.js + application/
//              ConnectToPeerUseCase.js, unmodified) carries Alice's
//              publication to Bob with no file, no clipboard, and no
//              second call to application/PublicationExchange.js — Bob
//              catalogs it the moment it arrives, resolves
//              CONTENT_UNAVAILABLE against his own empty ContentStore,
//              then RESOLVED the instant the bytes propagate, exactly
//              mirroring 0.7.2's own flagship but over a live wire
//              instead of a hand-off file. application/
//              PublicationPeerExchange.js never once calls application/
//              PublicationResolver.js.
//
// See docs/Principles.md, "A Peer Connection Transports Publications; It
// Does Not Resolve Them (0.7.3)."

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

function publishTestEnvelope(identityProvider, { contentKind = 'forkbuild.test-content', hash = 'hash-' + Math.random() } = {}) {
    const contentReference = new ContentReference({ hash, algorithm: 'fnv1a-32', size: 1 });
    let publication = new DecentralizedPublication({
        contentKind,
        contentReference,
        publisherIdentity: identityProvider.getSigningIdentity().toJSON()
    });
    publication = publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
    return publication;
}

// A minimal stand-in for peer/PeerMessageBus.js — real enough to exercise
// application/PublicationPeerExchange.js's own routing/gating logic in
// isolation, deterministically, without a real handshake. Section C below
// runs the identical class against the REAL bus.
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
    deliver(protocol, payload) {
        const handlers = this._handlers.get(protocol);
        if (!handlers) return;
        for (const handler of Array.from(handlers)) handler(payload);
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
    // Section A — PublicationPeerProtocol
    // ---------------------------------------------------------------
    {
        const envelope = { kind: 'forkbuild.decentralized-publication', id: 'pub-1' };
        const message = toPublicationAnnounceMessage(envelope);
        assert(message.kind === PublicationPeerMessageKind.ANNOUNCE, '1. toPublicationAnnounceMessage() carries the ANNOUNCE kind');
        assert(message.envelope === envelope, '2. toPublicationAnnounceMessage() carries the envelope unchanged');

        expectThrows(() => toPublicationAnnounceMessage(null), '3. toPublicationAnnounceMessage() rejects a missing envelope');

        assert(isValidPublicationPeerMessage(message), '4. a freshly built ANNOUNCE message validates');
        assert(!isValidPublicationPeerMessage(null), '5. null is not a valid message');
        assert(!isValidPublicationPeerMessage({ kind: 'ANNOUNCE' }), '6. a missing envelope is rejected');
        assert(!isValidPublicationPeerMessage({ kind: 'SOMETHING_ELSE', envelope }), '7. an unknown kind is rejected');
        assert(!isValidPublicationPeerMessage({ kind: 'ANNOUNCE', envelope: 'not-an-object' }), '8. a non-object envelope is rejected');
    }
    console.log('✓ Section A: PublicationPeerProtocol — ANNOUNCE wire shape, structural validity only');

    // ---------------------------------------------------------------
    // Section B — PublicationPeerExchange, against a stub transport
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const catalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const verifier = new LocalAuthorizationVerifier();
        const exchange = new PublicationExchange(catalog, verifier);

        expectThrows(() => new PublicationPeerExchange(null, new StubPeerMessageBus(), new StubConnectedPeerRegistry()),
            '1. constructor requires a PublicationExchange');
        expectThrows(() => new PublicationPeerExchange(exchange, null, new StubConnectedPeerRegistry()),
            '2. constructor requires a PeerMessageBus');
        expectThrows(() => new PublicationPeerExchange(exchange, new StubPeerMessageBus(), null),
            '3. constructor requires a ConnectedPeerRegistry');

        const authenticatedPeer = stubPeer('conn-authenticated', PeerLifecycleState.AUTHENTICATED);
        const connectingPeer = stubPeer('conn-connecting', PeerLifecycleState.CONNECTING);
        const bus = new StubPeerMessageBus();
        const registry = new StubConnectedPeerRegistry([authenticatedPeer, connectingPeer]);
        const peerExchange = new PublicationPeerExchange(exchange, bus, registry);

        assert(bus.attached.has('conn-authenticated') && bus.attached.has('conn-connecting'),
            '4. every peer already in the registry is attached on construction');

        const newPeer = stubPeer('conn-new', PeerLifecycleState.AUTHENTICATED);
        registry._peers = [...registry._peers, newPeer];
        registry.fireChange();
        assert(bus.attached.has('conn-new'), '5. a peer added later (registry onChange) is attached automatically too');

        const publication = publishTestEnvelope(alice);
        const sentCount = peerExchange.announce(publication);
        assert(sentCount === 2, '6. announce() sends only to peers currently AUTHENTICATED (2 of 3 stub peers)');
        assert(bus.sent.length === 2 && bus.sent.every((s) => s.protocol === PublicationPeerExchange.DEFAULT_PROTOCOL),
            '7. announce() sends under this class\'s own namespaced protocol');
        assert(bus.sent[0].payload.kind === PublicationPeerMessageKind.ANNOUNCE && bus.sent[0].payload.envelope.id === publication.id,
            '8. the sent message wraps the exported envelope under ANNOUNCE');

        expectThrows(() => peerExchange.announce({}), '9. announce() rejects a non-DecentralizedPublication (passthrough from exportPublication)');

        // Receiving side: a second, independent replica's catalog/exchange,
        // fed only through the stub bus's deliver() — never a direct call
        // to importPublication() from the test itself.
        const bobCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const bobExchange = new PublicationExchange(bobCatalog, verifier);
        const bobBus = new StubPeerMessageBus();
        const bobRegistry = new StubConnectedPeerRegistry([]);
        const bobPeerExchange = new PublicationPeerExchange(bobExchange, bobBus, bobRegistry);

        const received = [];
        bobPeerExchange.onPublicationReceived((result) => received.push(result));

        bobBus.deliver(PublicationPeerExchange.DEFAULT_PROTOCOL, { kind: 'SOMETHING_ELSE', envelope: {} });
        assert(received.length === 0 && bobCatalog.list().length === 0, '10. a malformed gossip wrapper is silently dropped, never catalogs, never crashes');

        const tampered = publishTestEnvelope(alice).toJSON();
        tampered.contentReference = { ...tampered.contentReference, hash: 'tampered-hash' };
        bobBus.deliver(PublicationPeerExchange.DEFAULT_PROTOCOL, toPublicationAnnounceMessage(tampered));
        assert(received.length === 0 && bobCatalog.list().length === 0, '11. a forged/tampered envelope is silently dropped, never catalogs, never crashes');

        const genuine = publishTestEnvelope(alice);
        bobBus.deliver(PublicationPeerExchange.DEFAULT_PROTOCOL, toPublicationAnnounceMessage(genuine.toJSON()));
        assert(received.length === 1 && received[0].isNew === true && received[0].publication.id === genuine.id,
            '12. a genuine announce catalogs and fires onPublicationReceived with isNew: true');
        assert(bobCatalog.has(genuine.id), '13. the catalog actually holds it');

        bobBus.deliver(PublicationPeerExchange.DEFAULT_PROTOCOL, toPublicationAnnounceMessage(genuine.toJSON()));
        assert(received.length === 2 && received[1].isNew === false, '14. re-announcing the identical envelope still fires the event, with isNew: false');
        assert(bobCatalog.list().length === 1, '15. re-announcing never duplicates the catalog entry');

        const disposalBus = new StubPeerMessageBus();
        const disposalRegistry = new StubConnectedPeerRegistry([]);
        const disposalExchange = new PublicationPeerExchange(bobExchange, disposalBus, disposalRegistry);
        const disposalReceived = [];
        disposalExchange.onPublicationReceived((r) => disposalReceived.push(r));
        disposalExchange.dispose();
        disposalBus.deliver(PublicationPeerExchange.DEFAULT_PROTOCOL, toPublicationAnnounceMessage(publishTestEnvelope(alice).toJSON()));
        assert(disposalReceived.length === 0, '16. dispose() unsubscribes from the bus — no further deliveries are handled');
    }
    console.log('✓ Section B: PublicationPeerExchange — AUTHENTICATED-only sends, auto-attach, malformed/forged drops, onPublicationReceived, dispose()');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP: a real, live, authenticated connection
    // ---------------------------------------------------------------
    {
        const network = new LocalPeerNetwork();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');

        const aliceTransport = new LocalPeerConnectionProvider('alice-pub', network);
        const bobTransport = new LocalPeerConnectionProvider('bob-pub', network);

        const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        const stopListening = aliceConnect.listen();
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const bobConnectedPeer = bobConnect.connect({ candidateEndpoint: 'alice-pub' });

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
        const aliceBus = new PeerMessageBus();
        const alicePeerExchange = new PublicationPeerExchange(aliceExchange, aliceBus, aliceConnect.registry);

        const bobCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const bobExchange = new PublicationExchange(bobCatalog, verifier);
        const bobBus = new PeerMessageBus();
        const bobPeerExchange = new PublicationPeerExchange(bobExchange, bobBus, bobConnect.registry);
        const bobAttributionStore = new LocalBlueprintAttributionStore(new InMemoryStorageProvider());

        const received = [];
        bobPeerExchange.onPublicationReceived((result) => received.push(result));

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

        const sentCount = alicePeerExchange.announce(publication);
        assert(sentCount === 1, '4. Alice announces to exactly her one live authenticated peer');

        await wait(20);

        assert(bobCatalog.has(publication.id), '5. Bob catalogs the publication the instant it arrives over the LIVE connection — no file, no second exchange call');
        assert(received.length === 1 && received[0].isNew === true && received[0].publication.id === publication.id,
            "6. Bob's onPublicationReceived fires with the real cataloged publication");

        const bobKindPlugin = createBlueprintAttributionPublicationKind({ verifier, store: bobAttributionStore });
        const envelope = publication.toJSON();

        const beforeResult = await bobResolver.resolve(envelope, bobKindPlugin);
        assert(beforeResult.outcome === PublicationResolutionOutcome.CONTENT_UNAVAILABLE,
            '7. resolving the peer-delivered publication before its bytes propagate reports CONTENT_UNAVAILABLE — discovery over a live wire is still not resolution');
        assert(bobCatalog.has(publication.id), '8. a CONTENT_UNAVAILABLE resolution never evicts the catalog entry');

        const bytes = await aliceContentStore.get(publication.contentReference);
        await bobContentStore.put(bytes);

        const afterResult = await bobResolver.resolve(envelope, bobKindPlugin);
        assert(afterResult.outcome === PublicationResolutionOutcome.RESOLVED,
            '9. the identical peer-delivered publication now resolves once its bytes are locally available — with no second peer exchange');
        assert(afterResult.content.attribution.fingerprint === 'bp:farmstead-1', '10. the resolved content is the correct attribution');
        assert(bobCatalog.list().length === 1, '11. resolving never adds a second catalog entry');

        alicePeerExchange.dispose();
        bobPeerExchange.dispose();
        stopListening();
        aliceTransport.dispose();
        bobTransport.dispose();
    }
    console.log('✓ Section C: FLAGSHIP — a live, authenticated peer connection carries a publication end to end; discovery over the wire still is not resolution');

    console.log('\nAll Peer Publication Exchange tests passed.');
}

run().catch((error) => {
    console.error('PublicationPeerExchange.test.js FAILED:', error);
    process.exitCode = 1;
});
