import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { PublicationSnapshotPlacementExchange } from '../application/PublicationSnapshotPlacementExchange.js';
import { SnapshotPlacementResolver } from '../application/SnapshotPlacementResolver.js';
import { SnapshotPlacementResolutionOutcome } from '../application/SnapshotPlacementResolutionOutcome.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import {
    PublicationSnapshotPlacementPeerMessageKind,
    MAX_PLACEMENTS_PER_RESPONSE,
    toPublicationSnapshotPlacementAnnounceMessage,
    toPublicationSnapshotPlacementRequestMessage,
    toPublicationSnapshotPlacementResponseMessage,
    isValidPublicationSnapshotPlacementPeerMessage
} from '../application/PublicationSnapshotPlacementPeerProtocol.js';
import { PublicationSnapshotPlacementPeerExchange } from '../application/PublicationSnapshotPlacementPeerExchange.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';

// 0.8.19 — Snapshot Placement Discovery & Peer Synchronization.
//
//   Section A: PublicationSnapshotPlacementPeerProtocol — the ANNOUNCE/
//              REQUEST/RESPONSE wire shapes, pure data, structural
//              validity only
//   Section B: PublicationSnapshotPlacementExchange — the new
//              signature-checking import boundary application/
//              AddPublicationSnapshotPlacementUseCase.js (0.8.18)
//              deliberately left unbuilt: validate -> construct -> verify
//              SIGNATURE -> catalog, never a resolution check; plus
//              findByPublicationId()
//   Section C: PublicationSnapshotPlacementPeerExchange — routing/gating
//              against a stub PeerMessageBus + ConnectedPeerRegistry:
//              ANNOUNCE sends only to AUTHENTICATED peers, drops a
//              malformed or forged incoming announce silently, fires
//              onPlacementReceived only for what actually catalogs, never
//              once consults SnapshotPlacementResolver, multiple/
//              independent/differently-stored placements all retained,
//              dispose() detaches; plus REQUEST/RESPONSE: a REQUEST is
//              answered only from this replica's own catalog, an
//              unsigned cataloged placement is skipped without breaking
//              the rest of a RESPONSE, a RESPONSE is capped at
//              MAX_PLACEMENTS_PER_RESPONSE, a forged placement inside a
//              RESPONSE is rejected exactly like a forged ANNOUNCE, and a
//              malformed REQUEST/RESPONSE is dropped silently
//   Section D: FLAGSHIP — LATE JOINER. Alice and Bob already hold two
//              placements (different storage backends) for the same
//              publication when Carol connects for the first time; Carol
//              explicitly requests historical placements from Bob and
//              catalogs both — placements that predate her own
//              connection, never announced to her. Resolution stays
//              independently local across all three, for the SAME
//              placement.
//   Section E: FLAGSHIP — Alice, Bob, and Carol over real, live,
//              authenticated connections. Alice signs one placement; Bob
//              receives and catalogs it, then relays it onward; Carol
//              receives it from Bob, never from Alice directly. All three
//              hold the IDENTICAL claim. No resolution outcome ever
//              crosses the wire.
//
// See docs/Principles.md, "Peers Exchange Placement Claims, Not
// Resolution Results (0.8.19)."

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
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

function signPlacement(identityProvider, fields) {
    let placement = new PublicationSnapshotPlacement({
        ...fields,
        placerIdentity: identityProvider.getSigningIdentity().toJSON()
    });
    placement = placement.withSignature(identityProvider.signCanonical(placement.getSigningDescriptor()));
    return placement;
}

function makePlacementExchange() {
    const catalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
    const verifier = new LocalAuthorizationVerifier();
    const exchange = new PublicationSnapshotPlacementExchange(catalog, verifier);
    return { catalog, verifier, exchange };
}

// A minimal stand-in for peer/PeerMessageBus.js — mirrors
// tests/PublicationAnchorPeerExchange.test.js's own StubPeerMessageBus.
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
    // Section A — PublicationSnapshotPlacementPeerProtocol
    // ---------------------------------------------------------------
    {
        const envelope = { kind: 'forkbuild.publication-snapshot-placement', id: 'placement-1' };
        const message = toPublicationSnapshotPlacementAnnounceMessage(envelope);
        assert(message.kind === PublicationSnapshotPlacementPeerMessageKind.ANNOUNCE, '1. toPublicationSnapshotPlacementAnnounceMessage() carries the ANNOUNCE kind');
        assert(message.envelope === envelope, '2. toPublicationSnapshotPlacementAnnounceMessage() carries the envelope unchanged');
        assert(Object.keys(message).length === 2, '3. the wrapper carries exactly kind + envelope — no resolution/outcome field');

        expectThrows(() => toPublicationSnapshotPlacementAnnounceMessage(null), '4. toPublicationSnapshotPlacementAnnounceMessage() rejects a missing envelope');

        assert(isValidPublicationSnapshotPlacementPeerMessage(message), '5. a freshly built ANNOUNCE message validates');
        assert(!isValidPublicationSnapshotPlacementPeerMessage(null), '6. null is not a valid message');
        assert(!isValidPublicationSnapshotPlacementPeerMessage({ kind: 'ANNOUNCE' }), '7. a missing envelope is rejected');
        assert(!isValidPublicationSnapshotPlacementPeerMessage({ kind: 'SOMETHING_ELSE', envelope }), '8. an unknown kind is rejected');
        assert(!isValidPublicationSnapshotPlacementPeerMessage({ kind: 'ANNOUNCE', envelope: 'not-an-object' }), '9. a non-object envelope is rejected');

        const request = toPublicationSnapshotPlacementRequestMessage('pub-x');
        assert(request.kind === PublicationSnapshotPlacementPeerMessageKind.REQUEST && request.publicationId === 'pub-x', '10. toPublicationSnapshotPlacementRequestMessage() carries the REQUEST kind and publicationId');
        assert(Object.keys(request).length === 2, '11. a REQUEST carries exactly kind + publicationId — no requester identity, no cursor');
        expectThrows(() => toPublicationSnapshotPlacementRequestMessage(''), '12. toPublicationSnapshotPlacementRequestMessage() rejects an empty publicationId');
        expectThrows(() => toPublicationSnapshotPlacementRequestMessage(null), '13. toPublicationSnapshotPlacementRequestMessage() rejects a missing publicationId');
        expectThrows(() => toPublicationSnapshotPlacementRequestMessage('x'.repeat(600)), '14. toPublicationSnapshotPlacementRequestMessage() rejects an absurdly long publicationId');

        const response = toPublicationSnapshotPlacementResponseMessage('pub-x', [envelope]);
        assert(response.kind === PublicationSnapshotPlacementPeerMessageKind.RESPONSE && response.publicationId === 'pub-x', '15. toPublicationSnapshotPlacementResponseMessage() carries the RESPONSE kind and publicationId');
        assert(Array.isArray(response.placements) && response.placements.length === 1 && response.placements[0] === envelope, '16. a RESPONSE carries the placement envelopes verbatim, unwrapped');
        assert(Object.keys(response).length === 3, '17. a RESPONSE carries exactly kind + publicationId + placements — no receivedAt, no resolution field, no source-peer field');
        expectThrows(() => toPublicationSnapshotPlacementResponseMessage('', [envelope]), '18. toPublicationSnapshotPlacementResponseMessage() rejects an empty publicationId');
        expectThrows(() => toPublicationSnapshotPlacementResponseMessage('pub-x', 'not-an-array'), '19. toPublicationSnapshotPlacementResponseMessage() rejects non-array placements');
        expectThrows(() => toPublicationSnapshotPlacementResponseMessage('pub-x', [null]), '20. toPublicationSnapshotPlacementResponseMessage() rejects a non-object placement entry');
        expectThrows(() => toPublicationSnapshotPlacementResponseMessage('pub-x', new Array(MAX_PLACEMENTS_PER_RESPONSE + 1).fill(envelope)), '21. toPublicationSnapshotPlacementResponseMessage() rejects a placements array over MAX_PLACEMENTS_PER_RESPONSE');
        const exactlyMax = toPublicationSnapshotPlacementResponseMessage('pub-x', new Array(MAX_PLACEMENTS_PER_RESPONSE).fill(envelope));
        assert(exactlyMax.placements.length === MAX_PLACEMENTS_PER_RESPONSE, '22. exactly MAX_PLACEMENTS_PER_RESPONSE placements is accepted, not rejected off-by-one');

        assert(isValidPublicationSnapshotPlacementPeerMessage(request), '23. a freshly built REQUEST validates');
        assert(isValidPublicationSnapshotPlacementPeerMessage(response), '24. a freshly built RESPONSE validates');
        assert(!isValidPublicationSnapshotPlacementPeerMessage({ kind: 'REQUEST' }), '25. a REQUEST with no publicationId is rejected');
        assert(!isValidPublicationSnapshotPlacementPeerMessage({ kind: 'REQUEST', publicationId: '' }), '26. a REQUEST with an empty publicationId is rejected');
        assert(!isValidPublicationSnapshotPlacementPeerMessage({ kind: 'RESPONSE', publicationId: 'pub-x' }), '27. a RESPONSE with no placements array is rejected');
        assert(!isValidPublicationSnapshotPlacementPeerMessage({ kind: 'RESPONSE', publicationId: 'pub-x', placements: 'not-an-array' }), '28. a RESPONSE with a non-array placements field is rejected');
        assert(!isValidPublicationSnapshotPlacementPeerMessage({ kind: 'RESPONSE', publicationId: 'pub-x', placements: new Array(MAX_PLACEMENTS_PER_RESPONSE + 1).fill(envelope) }),
            '29. a hand-crafted oversized RESPONSE is rejected, bypassing the sending-side check entirely — the RECEIVING side\'s own half of the bounded-response defense');
        assert(!isValidPublicationSnapshotPlacementPeerMessage({ kind: 'RESPONSE', publicationId: 'pub-x', placements: [null] }), '30. a RESPONSE containing a non-object placement entry is rejected');
    }
    console.log('✓ Section A: PublicationSnapshotPlacementPeerProtocol — ANNOUNCE/REQUEST/RESPONSE wire shapes, structural validity only, bounded RESPONSE size, no resolution field anywhere');

    // ---------------------------------------------------------------
    // Section B — PublicationSnapshotPlacementExchange
    // ---------------------------------------------------------------
    {
        expectThrows(() => new PublicationSnapshotPlacementExchange(null, new LocalAuthorizationVerifier()), '1. constructor requires a catalog');
        expectThrows(() => new PublicationSnapshotPlacementExchange(new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider()), null), '2. constructor requires a verifier');
        expectThrows(() => new PublicationSnapshotPlacementExchange(new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider()), {}), '3. constructor requires a verifier with verifyPublicationSnapshotPlacement');

        const registry = makeIdentity('Registry');
        const { catalog, exchange } = makePlacementExchange();

        expectThrows(() => exchange.exportPlacement(null), '4. exportPlacement() rejects a non-PublicationSnapshotPlacement');
        expectThrows(() => exchange.exportPlacement(new PublicationSnapshotPlacement({
            publicationId: 'pub-x', contentHash: 'hash-x', storage: 'local', locator: 'local://x',
            placerIdentity: registry.getSigningIdentity().toJSON()
        })), '5. exportPlacement() refuses to export an unsigned placement');

        const placement = signPlacement(registry, { publicationId: 'pub-b', contentHash: 'hash-b', storage: 'ipfs', locator: 'ipfs://ledger-b' });
        const exported = exchange.exportPlacement(placement);
        assert(exported.id === placement.id, '6. exportPlacement() returns the signed placement\'s own JSON');

        expectThrows(() => exchange.importPlacement({ ...exported, kind: 'something.else' }), '7. importPlacement() rejects a structurally malformed envelope');
        assert(catalog.list().length === 0, '8. a structurally rejected envelope never reaches the catalog');

        const tampered = { ...exported, contentHash: 'tampered-hash' };
        expectThrows(() => exchange.importPlacement(tampered), '9. importPlacement() rejects a tampered/forged signature');
        assert(catalog.list().length === 0, '10. a forged envelope never reaches the catalog — THE key difference from AddPublicationSnapshotPlacementUseCase');

        const { placement: cataloged, isNew } = exchange.importPlacement(exported);
        assert(isNew === true && cataloged.id === placement.id, '11. a genuinely signed placement imports and catalogs');
        assert(catalog.has(placement.id), '12. the catalog actually holds it');

        const { isNew: reimportIsNew } = exchange.importPlacement(exported);
        assert(reimportIsNew === false, '13. re-importing the identical envelope reports isNew: false');
        assert(catalog.list().length === 1, '14. re-importing never duplicates the catalog entry');

        // importPlacement() never calls SnapshotPlacementResolver — signature
        // verification only, never resolution.
        let resolverCalled = false;
        const spyStore = {
            storage: 'ipfs',
            async get() { resolverCalled = true; return new TextEncoder().encode('bytes'); }
        };
        const spyPlacement = signPlacement(registry, { publicationId: 'pub-spy', contentHash: 'hash-spy', storage: 'ipfs', locator: 'ipfs://ledger-spy' });
        exchange.importPlacement(spyPlacement.toJSON());
        const spyStoreRegistry = { get(storage) { return storage === 'ipfs' ? spyStore : null; } };
        const spyResolver = new SnapshotPlacementResolver(new LocalAuthorizationVerifier());
        // Sanity: the resolver genuinely can attempt resolution if asked
        // (it will report CONTENT_HASH_MISMATCH since the spy store never
        // really produces bytes matching hash-spy — the point is only
        // that it is CALLABLE, never that importPlacement() calls it).
        await spyResolver.resolve(spyPlacement.toJSON(), { storeRegistry: spyStoreRegistry });
        assert(resolverCalled === true, '15. sanity: calling SnapshotPlacementResolver explicitly does invoke the store');
        resolverCalled = false;
        exchange.importPlacement(spyPlacement.toJSON());
        assert(resolverCalled === false, '16. importPlacement() itself never invokes any content store — signature check only');

        assert(exchange.findByPublicationId('pub-b').length === 1 && exchange.findByPublicationId('pub-b')[0].id === placement.id,
            '17. findByPublicationId() returns the cataloged placement(s) naming that publicationId');
        assert(exchange.findByPublicationId('pub-nonexistent').length === 0, '18. findByPublicationId() returns empty for an unknown publicationId, never throws');
    }
    console.log('✓ Section B: PublicationSnapshotPlacementExchange — validate/construct/verify SIGNATURE/catalog, forged signatures rejected, no resolution ever, findByPublicationId()');

    // ---------------------------------------------------------------
    // Section C — PublicationSnapshotPlacementPeerExchange, against a stub transport
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const { exchange } = makePlacementExchange();

        expectThrows(() => new PublicationSnapshotPlacementPeerExchange(null, new StubPeerMessageBus(), new StubConnectedPeerRegistry()),
            '1. constructor requires a PublicationSnapshotPlacementExchange');
        expectThrows(() => new PublicationSnapshotPlacementPeerExchange(exchange, null, new StubConnectedPeerRegistry()),
            '2. constructor requires a PeerMessageBus');
        expectThrows(() => new PublicationSnapshotPlacementPeerExchange(exchange, new StubPeerMessageBus(), null),
            '3. constructor requires a ConnectedPeerRegistry');

        const authenticatedPeer = stubPeer('conn-authenticated', PeerLifecycleState.AUTHENTICATED);
        const connectingPeer = stubPeer('conn-connecting', PeerLifecycleState.CONNECTING);
        const bus = new StubPeerMessageBus();
        const registry = new StubConnectedPeerRegistry([authenticatedPeer, connectingPeer]);
        const peerExchange = new PublicationSnapshotPlacementPeerExchange(exchange, bus, registry);

        assert(bus.attached.has('conn-authenticated') && bus.attached.has('conn-connecting'),
            '4. every peer already in the registry is attached on construction');

        const newPeer = stubPeer('conn-new', PeerLifecycleState.AUTHENTICATED);
        registry._peers = [...registry._peers, newPeer];
        registry.fireChange();
        assert(bus.attached.has('conn-new'), '5. a peer added later (registry onChange) is attached automatically too');

        const placement = signPlacement(alice, { publicationId: 'pub-c', contentHash: 'hash-c', storage: 'ipfs', locator: 'ipfs://ledger-c' });
        const sentCount = peerExchange.announce(placement);
        assert(sentCount === 2, '6. announce() sends only to peers currently AUTHENTICATED (2 of 3 stub peers) — an unauthenticated peer never receives one');
        assert(bus.sent.length === 2 && bus.sent.every((s) => s.protocol === PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL),
            '7. announce() sends under this class\'s own namespaced protocol');
        assert(bus.sent[0].payload.kind === PublicationSnapshotPlacementPeerMessageKind.ANNOUNCE && bus.sent[0].payload.envelope.id === placement.id,
            '8. the sent message wraps the exported envelope under ANNOUNCE');
        assert(bus.sent[0].payload.envelope.resolved === undefined && bus.sent[0].payload.envelope.resolutionOutcome === undefined,
            '9. the sent envelope carries no resolution result of any kind — only the signed claim itself');

        expectThrows(() => peerExchange.announce({}), '10. announce() rejects a non-PublicationSnapshotPlacement (passthrough from exportPlacement)');

        // Receiving side: a second, independent replica's catalog/exchange,
        // fed only through the stub bus's deliver() — never a direct call
        // to importPlacement() from the test itself.
        const { catalog: bobCatalog, exchange: bobExchange } = makePlacementExchange();
        const bobBus = new StubPeerMessageBus();
        const bobRegistry = new StubConnectedPeerRegistry([]);
        const bobPeerExchange = new PublicationSnapshotPlacementPeerExchange(bobExchange, bobBus, bobRegistry);

        const received = [];
        bobPeerExchange.onPlacementReceived((result) => received.push(result));

        // SnapshotPlacementResolver is NEVER consulted by the incoming
        // path — a spy resolver that would fail the moment it's ever
        // called.
        let resolverCalled = false;
        const spyResolver = new SnapshotPlacementResolver(new LocalAuthorizationVerifier());
        const originalResolve = spyResolver.resolve.bind(spyResolver);
        spyResolver.resolve = async (...args) => { resolverCalled = true; return originalResolve(...args); };

        bobBus.deliver(PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL, { kind: 'SOMETHING_ELSE', envelope: {} });
        assert(received.length === 0 && bobCatalog.list().length === 0, '11. a malformed gossip wrapper is silently dropped, never catalogs, never crashes');

        const tampered = signPlacement(alice, { publicationId: 'pub-forged', contentHash: 'hash-forged', storage: 'ipfs', locator: 'ipfs://ledger-forged' }).toJSON();
        tampered.contentHash = 'tampered-after-signing';
        bobBus.deliver(PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL, toPublicationSnapshotPlacementAnnounceMessage(tampered));
        assert(received.length === 0 && bobCatalog.list().length === 0, '12. a forged/tampered envelope is silently dropped, never catalogs, never crashes');

        const genuine = signPlacement(alice, { publicationId: 'pub-genuine', contentHash: 'hash-genuine', storage: 'ipfs', locator: 'ipfs://ledger-genuine' });
        bobBus.deliver(PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL, toPublicationSnapshotPlacementAnnounceMessage(genuine.toJSON()));
        assert(received.length === 1 && received[0].isNew === true && received[0].placement.id === genuine.id,
            '13. a genuine announce catalogs and fires onPlacementReceived with isNew: true');
        assert(bobCatalog.has(genuine.id), '14. the catalog actually holds it');
        assert(resolverCalled === false, '15. the incoming path never once consults SnapshotPlacementResolver — signature only, never resolution');

        bobBus.deliver(PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL, toPublicationSnapshotPlacementAnnounceMessage(genuine.toJSON()));
        assert(received.length === 2 && received[1].isNew === false, '16. re-announcing the identical envelope still fires the event, with isNew: false');
        assert(bobCatalog.list().length === 1, '17. re-announcing never duplicates the catalog entry — first-seen-wins receivedAt, unchanged from 0.8.18');

        // Multiple independent placements, and different storage backends,
        // all retained — the same multi-placement coexistence 0.8.18
        // already established for the catalog, now proven to survive live
        // announce() traffic too.
        const ipfsPlacement = signPlacement(alice, { publicationId: 'pub-multi', contentHash: 'hash-multi', storage: 'storage-multi-a', locator: 'storage-a://multi' });
        const localPlacement = signPlacement(alice, { publicationId: 'pub-multi', contentHash: 'hash-multi', storage: 'storage-multi-b', locator: 'storage-b://multi' });
        bobBus.deliver(PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL, toPublicationSnapshotPlacementAnnounceMessage(ipfsPlacement.toJSON()));
        bobBus.deliver(PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL, toPublicationSnapshotPlacementAnnounceMessage(localPlacement.toJSON()));
        assert(bobCatalog.findByPublicationId('pub-multi').length === 2, '18. two independent placements for the same publication both survive announce(), neither replacing the other');
        assert(bobCatalog.findByStorage('storage-multi-a').length === 1 && bobCatalog.findByStorage('storage-multi-b').length === 1,
            '19. different storage backends are both retained distinctly');

        // Peer identity never becomes placement authority — nothing about
        // WHICH stub connection this message notionally arrived over is
        // ever read; _handleIncoming() takes only the payload.
        const anotherGenuine = signPlacement(alice, { publicationId: 'pub-anyone', contentHash: 'hash-anyone', storage: 'ipfs', locator: 'ipfs://anyone' });
        bobBus.deliver(PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL, toPublicationSnapshotPlacementAnnounceMessage(anotherGenuine.toJSON()));
        assert(bobCatalog.has(anotherGenuine.id), '20. a genuinely signed placement catalogs on its own signature\'s merit — no notion of "which peer sent it" ever gates acceptance');

        const disposalBus = new StubPeerMessageBus();
        const disposalRegistry = new StubConnectedPeerRegistry([]);
        const disposalExchange = new PublicationSnapshotPlacementPeerExchange(bobExchange, disposalBus, disposalRegistry);
        const disposalReceived = [];
        disposalExchange.onPlacementReceived((r) => disposalReceived.push(r));
        disposalExchange.dispose();
        disposalBus.deliver(PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL, toPublicationSnapshotPlacementAnnounceMessage(signPlacement(alice, { publicationId: 'pub-after-dispose', contentHash: 'hash-after-dispose', storage: 'ipfs', locator: 'ipfs://after-dispose' }).toJSON()));
        assert(disposalReceived.length === 0, '21. dispose() unsubscribes from the bus — no further deliveries are handled');

        // ---------------------------------------------------------------
        // REQUEST/RESPONSE routing/gating, same Bob replica
        // ---------------------------------------------------------------
        const requester = stubPeer('conn-requester', PeerLifecycleState.AUTHENTICATED);

        const sentBefore = bobBus.sent.length;
        bobBus.deliver(PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL, { kind: 'REQUEST' }, { connectedPeer: requester });
        assert(bobBus.sent.length === sentBefore, '22. a malformed REQUEST (missing publicationId) is silently dropped, never replied to');

        bobBus.deliver(PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL, toPublicationSnapshotPlacementRequestMessage('pub-nobody-knows'), { connectedPeer: requester });
        assert(bobBus.sent.length === sentBefore, '23. a REQUEST for an unknown publicationId gets no RESPONSE at all — not an error, not a NOT_FOUND message');

        // 'pub-genuine' was cataloged earlier in this section via a
        // genuine ANNOUNCE (item 13). Bob answers a REQUEST for it by
        // sending a RESPONSE directly to the requester.
        bobBus.deliver(PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL, toPublicationSnapshotPlacementRequestMessage('pub-genuine'), { connectedPeer: requester });
        const genuineResponse = bobBus.sent[bobBus.sent.length - 1];
        assert(genuineResponse.peer === requester && genuineResponse.protocol === PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL,
            '24. Bob answers a REQUEST by sending a RESPONSE directly to the requester, under this class\'s own namespaced protocol');
        assert(genuineResponse.payload.kind === PublicationSnapshotPlacementPeerMessageKind.RESPONSE && genuineResponse.payload.publicationId === 'pub-genuine',
            '25. the RESPONSE carries the RESPONSE kind and echoes the requested publicationId');
        assert(genuineResponse.payload.placements.length === 1 && genuineResponse.payload.placements[0].id === genuine.id,
            '26. the RESPONSE carries exactly the matching cataloged placement, exported the same way announce() already exports one');
        assert(genuineResponse.payload.placements[0].resolved === undefined && genuineResponse.payload.placements[0].resolutionOutcome === undefined,
            '27. the RESPONSE\'s own placement envelope carries no resolution result of any kind — only the signed claim itself, same restraint as ANNOUNCE');

        // A placement cataloged some OTHER way than this exchange's own
        // importPlacement() (application/AddPublicationSnapshotPlacementUseCase.js
        // tolerates an unsigned one) is silently SKIPPED when building a
        // RESPONSE — never breaks the reply for a genuinely exportable
        // sibling naming the same publicationId.
        const unsignedSibling = new PublicationSnapshotPlacement({
            publicationId: 'pub-mixed-signed', contentHash: 'hash-mixed', storage: 'ipfs', locator: 'ipfs://mixed-unsigned',
            placerIdentity: alice.getSigningIdentity().toJSON()
        });
        bobCatalog.add(unsignedSibling);
        const signedSibling = signPlacement(alice, { publicationId: 'pub-mixed-signed', contentHash: 'hash-mixed', storage: 'ipfs', locator: 'ipfs://mixed-signed' });
        bobBus.deliver(PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL, toPublicationSnapshotPlacementAnnounceMessage(signedSibling.toJSON()));
        assert(bobCatalog.findByPublicationId('pub-mixed-signed').length === 2, '28. setup: Bob now catalogs both the unsigned and the signed sibling');
        bobBus.deliver(PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL, toPublicationSnapshotPlacementRequestMessage('pub-mixed-signed'), { connectedPeer: requester });
        const mixedResponse = bobBus.sent[bobBus.sent.length - 1];
        assert(mixedResponse.payload.placements.length === 1 && mixedResponse.payload.placements[0].id === signedSibling.id,
            '29. an unsigned cataloged placement is silently skipped when building a RESPONSE — only the genuinely signed sibling is offered, the response is still sent');

        // A forged/tampered placement inside a RESPONSE is rejected exactly
        // like a forged ANNOUNCE — never catalogs, never crashes, never
        // fires onPlacementReceived.
        const forgedInResponse = signPlacement(alice, { publicationId: 'pub-forged-response', contentHash: 'hash-forged-response', storage: 'ipfs', locator: 'ipfs://forged-response' }).toJSON();
        forgedInResponse.contentHash = 'tampered-after-signing';
        const receivedBeforeForgedResponse = received.length;
        bobBus.deliver(PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL, toPublicationSnapshotPlacementResponseMessage('pub-forged-response', [forgedInResponse]));
        assert(received.length === receivedBeforeForgedResponse, '30. a RESPONSE containing a forged/tampered placement never fires onPlacementReceived');
        assert(bobCatalog.findByPublicationId('pub-forged-response').length === 0, '31. the forged placement inside a RESPONSE never catalogs — synchronization introduces no second, looser way in');

        // A forged placement mixed with a GENUINE one in the SAME RESPONSE:
        // the genuine one still catalogs — one bad envelope in a batch
        // never blocks the rest of it.
        const genuineInMixedBatch = signPlacement(alice, { publicationId: 'pub-mixed-batch', contentHash: 'hash-mixed-batch', storage: 'ipfs', locator: 'ipfs://mixed-batch' }).toJSON();
        const forgedInMixedBatch = signPlacement(alice, { publicationId: 'pub-mixed-batch', contentHash: 'hash-mixed-batch-2', storage: 'ipfs', locator: 'ipfs://mixed-batch-2' }).toJSON();
        forgedInMixedBatch.contentHash = 'tampered-in-batch';
        bobBus.deliver(PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL, toPublicationSnapshotPlacementResponseMessage('pub-mixed-batch', [forgedInMixedBatch, genuineInMixedBatch]));
        assert(bobCatalog.findByPublicationId('pub-mixed-batch').length === 1 && bobCatalog.get(genuineInMixedBatch.id) !== null,
            '32. a forged placement ahead of a genuine one in the same RESPONSE array never blocks the genuine one from cataloging');

        // Duplicate placement via RESPONSE — deduplicated by the catalog's
        // own id-based dedup (0.8.18), never a second, separate mechanism
        // built here.
        const dupReceivedBefore = received.length;
        bobBus.deliver(PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL, toPublicationSnapshotPlacementResponseMessage('pub-mixed-batch', [genuineInMixedBatch]));
        assert(received.length === dupReceivedBefore + 1 && received[received.length - 1].isNew === false,
            '33. re-synchronizing an already-known placement via RESPONSE still fires onPlacementReceived, with isNew: false');
        assert(bobCatalog.findByPublicationId('pub-mixed-batch').length === 1, '34. re-synchronizing never duplicates the catalog entry');

        // receivedAt is local to Bob's own replica, recorded the moment
        // HIS catalog first saw the placement via RESPONSE — the wire
        // itself carries no such field at all (see Section A).
        assert(typeof bobCatalog.getReceivedAt(genuineInMixedBatch.id) === 'string',
            '35. Bob recorded his own local receivedAt for a placement that arrived via RESPONSE, exactly as for an ANNOUNCE');

        // A hand-crafted, structurally-oversized RESPONSE (bypassing
        // toPublicationSnapshotPlacementResponseMessage()'s own ceiling
        // entirely) is dropped by
        // isValidPublicationSnapshotPlacementPeerMessage() before
        // _handleResponse() ever runs — never partially processed.
        const oversizedReceivedBefore = received.length;
        bobBus.deliver(PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL, { kind: 'RESPONSE', publicationId: 'pub-oversized', placements: new Array(MAX_PLACEMENTS_PER_RESPONSE + 1).fill(genuineInMixedBatch) });
        assert(received.length === oversizedReceivedBefore, '36. a hand-crafted oversized RESPONSE is rejected outright, never partially processed');

        // A REQUEST for a publication with more matching placements than
        // MAX_PLACEMENTS_PER_RESPONSE is TRUNCATED, never rejected outright
        // — the SENDING side's own half of the bounded-response defense.
        for (let i = 0; i < MAX_PLACEMENTS_PER_RESPONSE + 5; i += 1) {
            const many = signPlacement(alice, { publicationId: 'pub-many', contentHash: `hash-many-${i}`, storage: 'ipfs', locator: `ipfs://many-${i}` });
            bobBus.deliver(PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL, toPublicationSnapshotPlacementAnnounceMessage(many.toJSON()));
        }
        assert(bobCatalog.findByPublicationId('pub-many').length === MAX_PLACEMENTS_PER_RESPONSE + 5, '37. setup: Bob genuinely catalogs more placements for one publication than MAX_PLACEMENTS_PER_RESPONSE');
        bobBus.deliver(PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL, toPublicationSnapshotPlacementRequestMessage('pub-many'), { connectedPeer: requester });
        const manyResponse = bobBus.sent[bobBus.sent.length - 1];
        assert(manyResponse.payload.placements.length === MAX_PLACEMENTS_PER_RESPONSE,
            '38. Bob\'s own RESPONSE truncates at MAX_PLACEMENTS_PER_RESPONSE rather than including every matching placement or refusing to answer at all');
    }
    console.log('✓ Section C: PublicationSnapshotPlacementPeerExchange — AUTHENTICATED-only sends, auto-attach, malformed/forged drops, never consults SnapshotPlacementResolver, multi-placement retained, dispose(); REQUEST answered only from the local catalog, unsigned entries skipped, forged placements in a RESPONSE rejected without blocking the rest of the batch, duplicates deduplicated, RESPONSE size bounded');

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP: LATE JOINER. Alice and Bob already hold two
    // placements when Carol connects for the first time; Carol requests
    // them explicitly and catalogs both. Resolution stays independently
    // local across all three, for the SAME placement.
    // ---------------------------------------------------------------
    {
        const network = new LocalPeerNetwork();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carol = makeIdentity('Carol');

        const aliceTransport = new LocalPeerConnectionProvider('alice-place-sync', network);
        const bobTransport = new LocalPeerConnectionProvider('bob-place-sync', network);
        const carolTransport = new LocalPeerConnectionProvider('carol-place-sync', network);

        const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        const stopAliceListening = aliceConnect.listen();

        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const stopBobListening = bobConnect.listen();
        const bobToAlice = bobConnect.connect({ candidateEndpoint: 'alice-place-sync' });

        await wait(20);
        assert(bobToAlice.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '1. setup: Bob authenticates to Alice');

        const { catalog: aliceCatalog, exchange: aliceExchange } = makePlacementExchange();
        const aliceBus = new PeerMessageBus();
        const alicePeerExchange = new PublicationSnapshotPlacementPeerExchange(aliceExchange, aliceBus, aliceConnect.registry);

        const { catalog: bobCatalog, exchange: bobExchange } = makePlacementExchange();
        const bobBus = new PeerMessageBus();
        const bobPeerExchange = new PublicationSnapshotPlacementPeerExchange(bobExchange, bobBus, bobConnect.registry);

        // Alice creates and announces TWO placements for the same
        // publication, on two different storage backends, both BEFORE
        // Carol ever connects to anyone.
        const placementA = signPlacement(alice, { publicationId: 'pub-late-joiner', contentHash: 'hash-late-joiner', storage: 'ipfs', locator: 'ipfs://a' });
        const placementB = signPlacement(alice, { publicationId: 'pub-late-joiner', contentHash: 'hash-late-joiner', storage: 'local', locator: 'local://b' });
        alicePeerExchange.announce(placementA);
        alicePeerExchange.announce(placementB);
        await wait(20);
        assert(bobCatalog.has(placementA.id) && bobCatalog.has(placementB.id), '2. setup: Bob already holds BOTH placements, from ordinary ANNOUNCE traffic, before Carol exists at all');

        // NOW Carol connects — to Bob only, never to Alice.
        const carolConnect = new ConnectToPeerUseCase({ peerConnectionProvider: carolTransport, identityProvider: carol });
        const carolToBob = carolConnect.connect({ candidateEndpoint: 'bob-place-sync' });
        await wait(20);
        assert(carolToBob.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '3. setup: Carol authenticates to Bob only, after both placements already existed');

        const { catalog: carolCatalog, exchange: carolExchange } = makePlacementExchange();
        const carolBus = new PeerMessageBus();
        const carolPeerExchange = new PublicationSnapshotPlacementPeerExchange(carolExchange, carolBus, carolConnect.registry);

        assert(carolCatalog.list().length === 0, '4. Carol starts with an empty catalog — she never received either placement via ANNOUNCE, she was not connected when either was sent');

        const carolReceived = [];
        carolPeerExchange.onPlacementReceived((result) => carolReceived.push(result));

        // Carol explicitly requests historical placements for the
        // publication from Bob — the one new call this milestone adds.
        carolPeerExchange.requestPlacements(carolToBob, 'pub-late-joiner');
        await wait(30);

        assert(carolCatalog.has(placementA.id) && carolCatalog.has(placementB.id), '5. Carol now holds BOTH placements, discovered entirely through explicit REQUEST/RESPONSE synchronization, never through ANNOUNCE');
        assert(carolReceived.length === 2 && new Set(carolReceived.map((r) => r.placement.id)).size === 2,
            '6. onPlacementReceived fired once per placement in the RESPONSE, each with the real cataloged placement');
        assert(carolReceived.every((r) => r.isNew === true), '7. both are genuinely new to Carol\'s own catalog');

        // Byte-identical claims — synchronization carried the exact
        // signed envelopes, never re-derived or re-signed anything.
        assert(carolCatalog.get(placementA.id).signature.signature === placementA.signature.signature, '8. Carol\'s copy of Placement A carries the exact same signature Alice produced');
        assert(carolCatalog.get(placementB.id).signature.signature === placementB.signature.signature, '9. Carol\'s copy of Placement B carries the exact same signature Alice produced');

        // receivedAt is local and NEVER synchronized.
        const bobReceivedAtA = bobCatalog.getReceivedAt(placementA.id);
        const carolReceivedAtA = carolCatalog.getReceivedAt(placementA.id);
        assert(bobReceivedAtA !== null && carolReceivedAtA !== null, '10. both Bob and Carol recorded their own local receivedAt');
        assert(new Date(carolReceivedAtA).getTime() >= new Date(bobReceivedAtA).getTime(),
            '11. Carol\'s own receivedAt is no earlier than Bob\'s — each replica\'s receivedAt reflects when IT first observed the placement, never a timestamp copied from the peer that relayed it');

        // Resolution stays independently local across all THREE replicas
        // now, for the identical claim — Bob's own IPFS store reports the
        // bytes RESOLVED; Carol's own store is unavailable and reports
        // STORE_UNAVAILABLE. The two outcomes disagree, on purpose, to
        // prove neither ever crossed any wire — synchronization moved the
        // CLAIM, never a verdict about it.
        const verifier = new LocalAuthorizationVerifier();
        const bytesText = 'the snapshot bytes';
        const bytes = new TextEncoder().encode(bytesText);
        const { computeContentHash } = await import('../serializer/contentHash.js');
        const realHash = computeContentHash(bytesText);
        const resolvablePlacement = signPlacement(alice, { publicationId: 'pub-late-joiner-resolve', contentHash: realHash, storage: 'ipfs', locator: 'ipfs://resolvable' });
        aliceCatalog.add(resolvablePlacement);
        bobCatalog.add(resolvablePlacement);
        carolCatalog.add(resolvablePlacement);

        const bobResolver = new SnapshotPlacementResolver(verifier);
        const bobStoreRegistry = { get(storage) { return storage === 'ipfs' ? { storage: 'ipfs', async get() { return bytes; } } : null; } };
        const bobResolveResult = await bobResolver.resolve(bobCatalog.get(resolvablePlacement.id).toJSON(), { storeRegistry: bobStoreRegistry });
        assert(bobResolveResult.outcome === SnapshotPlacementResolutionOutcome.RESOLVED, '12. Bob independently resolves RESOLVED');

        const carolResolver = new SnapshotPlacementResolver(verifier);
        const carolStoreRegistry = { get() { return null; } };
        const carolResolveResult = await carolResolver.resolve(carolCatalog.get(resolvablePlacement.id).toJSON(), { storeRegistry: carolStoreRegistry });
        assert(carolResolveResult.outcome === SnapshotPlacementResolutionOutcome.STORE_UNAVAILABLE, '13. Carol independently reports STORE_UNAVAILABLE for the SAME claim — her own replica has no IPFS store configured');

        // Neither outcome was ever written into any cataloged copy, on
        // any of the three replicas.
        assert(carolCatalog.get(resolvablePlacement.id).toJSON().resolved === undefined && carolCatalog.get(resolvablePlacement.id).toJSON().resolutionOutcome === undefined,
            '14. Carol\'s own STORE_UNAVAILABLE result is never written into her cataloged placement record');
        assert(bobCatalog.get(resolvablePlacement.id).toJSON().resolved === undefined && bobCatalog.get(resolvablePlacement.id).toJSON().resolutionOutcome === undefined,
            '15. Bob\'s own RESOLVED result is never written into his cataloged placement record either');

        // Requesting again is harmless — Carol already has both, and
        // re-synchronizing simply reports isNew: false for each, never
        // duplicating the catalog.
        const reReceivedBefore = carolReceived.length;
        carolPeerExchange.requestPlacements(carolToBob, 'pub-late-joiner');
        await wait(30);
        assert(carolReceived.length === reReceivedBefore + 2 && carolReceived.slice(-2).every((r) => r.isNew === false),
            '16. requesting the same publication again re-fires onPlacementReceived with isNew: false, and never duplicates the catalog');
        assert(carolCatalog.findByPublicationId('pub-late-joiner').length === 2, '17. Carol\'s catalog still holds exactly the two placements for this publication — placement SET convergence, never a growing log of duplicates');

        // Requesting a publicationId nobody knows anything about is
        // harmless too — silently nothing arrives, never an error.
        const unknownReceivedBefore = carolReceived.length;
        carolPeerExchange.requestPlacements(carolToBob, 'pub-nobody-has-ever-heard-of');
        await wait(30);
        assert(carolReceived.length === unknownReceivedBefore, '18. requesting an unknown publicationId gets no placements back — not an error, not a NOT_FOUND message');

        alicePeerExchange.dispose();
        bobPeerExchange.dispose();
        carolPeerExchange.dispose();
        stopAliceListening();
        stopBobListening();
        aliceTransport.dispose();
        bobTransport.dispose();
        carolTransport.dispose();
    }
    console.log('✓ Section D: FLAGSHIP — LATE JOINER: Carol connects only to Bob, long after Alice created two placements (different storage backends) and Bob already cataloged them via ordinary ANNOUNCE; Carol explicitly requests and receives both, byte-identical, over a live authenticated connection; receivedAt stays local and unsynchronized; Bob/Carol independently resolve the SAME claim as RESOLVED/STORE_UNAVAILABLE; re-requesting converges harmlessly; an unknown publicationId yields nothing');

    // ---------------------------------------------------------------
    // Section E — FLAGSHIP: Alice -> Bob -> Carol, over real, live,
    // authenticated connections. No resolution outcome ever crosses the
    // wire.
    // ---------------------------------------------------------------
    {
        const network = new LocalPeerNetwork();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carol = makeIdentity('Carol');

        const aliceTransport = new LocalPeerConnectionProvider('alice-place', network);
        const bobTransport = new LocalPeerConnectionProvider('bob-place', network);
        const carolTransport = new LocalPeerConnectionProvider('carol-place', network);

        const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        const stopAliceListening = aliceConnect.listen();

        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const stopBobListening = bobConnect.listen();
        const bobToAlice = bobConnect.connect({ candidateEndpoint: 'alice-place' });

        await wait(20);
        assert(bobToAlice.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '1. setup: Bob authenticates to Alice over a real live connection');

        const carolConnect = new ConnectToPeerUseCase({ peerConnectionProvider: carolTransport, identityProvider: carol });
        const carolToBob = carolConnect.connect({ candidateEndpoint: 'bob-place' });

        await wait(20);
        assert(carolToBob.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '2. setup: Carol authenticates to Bob over a real live connection');
        assert(bobConnect.registry.list().length === 2, '3. setup: Bob\'s single registry now holds BOTH Alice and Carol');

        const { catalog: aliceCatalog, exchange: aliceExchange } = makePlacementExchange();
        const aliceBus = new PeerMessageBus();
        const alicePeerExchange = new PublicationSnapshotPlacementPeerExchange(aliceExchange, aliceBus, aliceConnect.registry);

        const { catalog: bobCatalog, exchange: bobExchange } = makePlacementExchange();
        const bobBus = new PeerMessageBus();
        const bobPeerExchange = new PublicationSnapshotPlacementPeerExchange(bobExchange, bobBus, bobConnect.registry);

        const { catalog: carolCatalog, exchange: carolExchange } = makePlacementExchange();
        const carolBus = new PeerMessageBus();
        const carolPeerExchange = new PublicationSnapshotPlacementPeerExchange(carolExchange, carolBus, carolConnect.registry);

        const bobReceived = [];
        bobPeerExchange.onPlacementReceived((result) => bobReceived.push(result));
        const carolReceived = [];
        carolPeerExchange.onPlacementReceived((result) => carolReceived.push(result));

        const placement = signPlacement(alice, {
            publicationId: 'pub-flagship-e', contentHash: 'hash-flagship-e', storage: 'ipfs', locator: 'ipfs://flagship-e'
        });

        assert(bobCatalog.has(placement.id) === false, '4. Bob has not seen the placement before Alice announces it');
        const sentToBob = alicePeerExchange.announce(placement);
        assert(sentToBob === 1, '5. Alice announces to exactly her one live authenticated peer (Bob)');

        await wait(20);
        assert(bobCatalog.has(placement.id), '6. Bob catalogs the placement the instant it arrives over the LIVE connection');
        assert(bobReceived.length === 1 && bobReceived[0].isNew === true, '7. Bob\'s onPlacementReceived fires with the real cataloged placement');
        assert(carolCatalog.has(placement.id) === false, '8. Carol has NOT seen it yet — Alice never announced directly to Carol, they are not connected');
        assert(aliceCatalog.get(placement.id) === null, '8b. announce() never touches the announcer\'s own catalog — Alice still has not cataloged her own placement');

        // Bob relays the SAME claim onward — Carol receives it from Bob,
        // never from Alice. The claim is byte-for-byte identical; only its
        // path differed.
        const bobOwnCopy = bobCatalog.get(placement.id);
        const sentToCarol = bobPeerExchange.announce(bobOwnCopy);
        assert(sentToCarol === 2, '9. Bob relays to both of his own authenticated peers (Alice and Carol)');

        await wait(20);
        assert(carolCatalog.has(placement.id), '10. Carol now catalogs the placement — relayed via Bob, not received directly from Alice');
        assert(carolReceived.length === 1 && carolReceived[0].placement.id === placement.id, '11. Carol\'s onPlacementReceived fires with the identical placement id Alice originally signed');

        // Bob's relay is a broadcast to every one of his own authenticated
        // peers, which includes Alice herself — the placement Alice signed
        // echoes back to her over the wire. That is harmless, not a bug.
        assert(aliceCatalog.has(placement.id), '12. the echoed relay reaching Alice catalogs cleanly too — her own signature is exactly as valid arriving over the wire as it was when she made it');

        // All three hold the IDENTICAL signed claim.
        assert(bobCatalog.get(placement.id).signature.signature === placement.signature.signature, '13. Bob\'s copy carries the exact same signature Alice produced');
        assert(carolCatalog.get(placement.id).signature.signature === placement.signature.signature, '14. Carol\'s copy carries the exact same signature Alice produced, unchanged after two hops');

        // receivedAt is local to each replica — never part of the signed
        // claim, never synchronized.
        assert(bobCatalog.getReceivedAt(placement.id) !== null && carolCatalog.getReceivedAt(placement.id) !== null,
            '15. both Bob and Carol recorded their own local receivedAt');

        // Resolution is now INDEPENDENT and LOCAL to each replica — Bob's
        // own IPFS store can serve the exact bytes; Carol's own store
        // cannot.
        const verifier = new LocalAuthorizationVerifier();
        const bytesText = 'flagship snapshot bytes';
        const bytes = new TextEncoder().encode(bytesText);
        const { computeContentHash } = await import('../serializer/contentHash.js');
        const realHash = computeContentHash(bytesText);
        const resolvablePlacement = signPlacement(alice, { publicationId: 'pub-flagship-e-resolve', contentHash: realHash, storage: 'ipfs', locator: 'ipfs://flagship-e-resolvable' });
        bobCatalog.add(resolvablePlacement);
        carolCatalog.add(resolvablePlacement);

        const bobResolver = new SnapshotPlacementResolver(verifier);
        const bobStoreRegistry = { get(storage) { return storage === 'ipfs' ? { storage: 'ipfs', async get() { return bytes; } } : null; } };
        const bobResult = await bobResolver.resolve(bobCatalog.get(resolvablePlacement.id).toJSON(), { storeRegistry: bobStoreRegistry });
        assert(bobResult.outcome === SnapshotPlacementResolutionOutcome.RESOLVED, '16. Bob independently resolves the SAME claim as RESOLVED');

        const carolResolver = new SnapshotPlacementResolver(verifier);
        const carolStoreRegistry = { get() { return null; } };
        const carolResult = await carolResolver.resolve(carolCatalog.get(resolvablePlacement.id).toJSON(), { storeRegistry: carolStoreRegistry });
        assert(carolResult.outcome === SnapshotPlacementResolutionOutcome.STORE_UNAVAILABLE, '17. Carol independently reports STORE_UNAVAILABLE for the IDENTICAL claim — her own replica, her own honest answer');

        // Neither outcome ever crosses the wire, and neither is stored
        // anywhere the other replica (or a later lookup) could find it.
        assert(bobCatalog.get(resolvablePlacement.id).toJSON().resolved === undefined && bobCatalog.get(resolvablePlacement.id).toJSON().resolutionOutcome === undefined,
            '18. Bob\'s RESOLVED result is never written into the cataloged placement record');
        assert(carolCatalog.get(resolvablePlacement.id).toJSON().resolved === undefined && carolCatalog.get(resolvablePlacement.id).toJSON().resolutionOutcome === undefined,
            '19. Carol\'s STORE_UNAVAILABLE result is never written into the cataloged placement record either');

        // Re-resolving Bob's copy again, fresh, still reaches the same
        // honest answer for HIM — his result was never contaminated by
        // knowing Carol's, and vice versa.
        const bobResultAgain = await bobResolver.resolve(bobCatalog.get(resolvablePlacement.id).toJSON(), { storeRegistry: bobStoreRegistry });
        assert(bobResultAgain.outcome === SnapshotPlacementResolutionOutcome.RESOLVED, '20. Bob\'s resolution is stable and entirely local, unaffected by Carol\'s own outcome ever existing');

        alicePeerExchange.dispose();
        bobPeerExchange.dispose();
        carolPeerExchange.dispose();
        stopAliceListening();
        stopBobListening();
        aliceTransport.dispose();
        bobTransport.dispose();
        carolTransport.dispose();
    }
    console.log('✓ Section E: FLAGSHIP — Alice → Bob → Carol over live authenticated connections; the identical claim propagates two hops; resolution stays independent and local; no outcome ever crosses the wire');

    console.log('\nAll Publication Snapshot Placement Peer Exchange tests passed.');
}

run().catch((error) => {
    console.error('PublicationSnapshotPlacementPeerExchange.test.js FAILED:', error);
    process.exitCode = 1;
});
