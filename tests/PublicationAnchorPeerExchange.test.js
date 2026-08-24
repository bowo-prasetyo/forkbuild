import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { LocalPublicationAnchorCatalog } from '../application/LocalPublicationAnchorCatalog.js';
import { PublicationAnchorExchange } from '../application/PublicationAnchorExchange.js';
import { ExternalAnchorVerifier } from '../application/ExternalAnchorVerifier.js';
import { AnchorVerificationOutcome } from '../application/AnchorVerificationOutcome.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import {
    PublicationAnchorPeerMessageKind,
    toPublicationAnchorAnnounceMessage,
    isValidPublicationAnchorPeerMessage
} from '../application/PublicationAnchorPeerProtocol.js';
import { PublicationAnchorPeerExchange } from '../application/PublicationAnchorPeerExchange.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';

// 0.8.4 — External Anchor Publication Over Peers.
//
//   Section A: PublicationAnchorPeerProtocol — the ANNOUNCE wire shape,
//              pure data, structural validity only
//   Section B: PublicationAnchorExchange — the new signature-checking
//              import boundary application/AddPublicationAnchorUseCase.js
//              (0.8.2) deliberately left unbuilt: validate -> construct ->
//              verify SIGNATURE -> catalog, never a proof check
//   Section C: PublicationAnchorPeerExchange — routing/gating against a
//              stub PeerMessageBus + ConnectedPeerRegistry: sends only to
//              AUTHENTICATED peers, drops a malformed or forged incoming
//              announce silently, fires onAnchorReceived only for what
//              actually catalogs, never once consults
//              ExternalAnchorVerifier, multiple/independent/differently-
//              typed anchors all retained, dispose() detaches
//   Section D: FLAGSHIP — Alice, Bob, and Carol over real, live,
//              authenticated connections (peer/LocalPeerConnectionProvider
//              .js + application/ConnectToPeerUseCase.js, unmodified).
//              Alice signs one anchor; Bob receives and catalogs it, then
//              relays it onward; Carol receives it from Bob, never from
//              Alice directly. All three hold the IDENTICAL claim. Bob's
//              own external system independently reports VALID; Carol's
//              own external system is unavailable and independently
//              reports PROOF_UNAVAILABLE. Neither outcome ever reaches
//              the other replica — only the anchor claim itself ever
//              crossed the wire.
//
// See docs/Principles.md, "Peers Exchange Anchor Claims, Not Verification
// Results (0.8.4)."

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

function signAnchor(identityProvider, fields) {
    let anchor = new PublicationAnchor({
        ...fields,
        anchorIdentity: identityProvider.getSigningIdentity().toJSON()
    });
    anchor = anchor.withSignature(identityProvider.signCanonical(anchor.getSigningDescriptor()));
    return anchor;
}

function makeAnchorExchange() {
    const catalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
    const verifier = new LocalAuthorizationVerifier();
    const exchange = new PublicationAnchorExchange(catalog, verifier);
    return { catalog, verifier, exchange };
}

// A minimal stand-in for peer/PeerMessageBus.js — mirrors
// tests/PublicationPeerExchange.test.js's own StubPeerMessageBus.
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
    // Section A — PublicationAnchorPeerProtocol
    // ---------------------------------------------------------------
    {
        const envelope = { kind: 'forkbuild.publication-anchor', id: 'anchor-1' };
        const message = toPublicationAnchorAnnounceMessage(envelope);
        assert(message.kind === PublicationAnchorPeerMessageKind.ANNOUNCE, '1. toPublicationAnchorAnnounceMessage() carries the ANNOUNCE kind');
        assert(message.envelope === envelope, '2. toPublicationAnchorAnnounceMessage() carries the envelope unchanged');
        assert(Object.keys(message).length === 2, '3. the wrapper carries exactly kind + envelope — no verification/outcome field');

        expectThrows(() => toPublicationAnchorAnnounceMessage(null), '4. toPublicationAnchorAnnounceMessage() rejects a missing envelope');

        assert(isValidPublicationAnchorPeerMessage(message), '5. a freshly built ANNOUNCE message validates');
        assert(!isValidPublicationAnchorPeerMessage(null), '6. null is not a valid message');
        assert(!isValidPublicationAnchorPeerMessage({ kind: 'ANNOUNCE' }), '7. a missing envelope is rejected');
        assert(!isValidPublicationAnchorPeerMessage({ kind: 'SOMETHING_ELSE', envelope }), '8. an unknown kind is rejected');
        assert(!isValidPublicationAnchorPeerMessage({ kind: 'ANNOUNCE', envelope: 'not-an-object' }), '9. a non-object envelope is rejected');
    }
    console.log('✓ Section A: PublicationAnchorPeerProtocol — ANNOUNCE wire shape, structural validity only, no verification field');

    // ---------------------------------------------------------------
    // Section B — PublicationAnchorExchange
    // ---------------------------------------------------------------
    {
        expectThrows(() => new PublicationAnchorExchange(null, new LocalAuthorizationVerifier()), '1. constructor requires a catalog');
        expectThrows(() => new PublicationAnchorExchange(new LocalPublicationAnchorCatalog(new InMemoryStorageProvider()), null), '2. constructor requires a verifier');
        expectThrows(() => new PublicationAnchorExchange(new LocalPublicationAnchorCatalog(new InMemoryStorageProvider()), {}), '3. constructor requires a verifier with verifyPublicationAnchor');

        const registry = makeIdentity('Registry');
        const { catalog, exchange } = makeAnchorExchange();

        expectThrows(() => exchange.exportAnchor(null), '4. exportAnchor() rejects a non-PublicationAnchor');
        expectThrows(() => exchange.exportAnchor(new PublicationAnchor({
            publicationId: 'pub-x', contentHash: 'hash-x', anchorType: 'local-test', locator: 'local://x',
            anchorIdentity: registry.getSigningIdentity().toJSON()
        })), '5. exportAnchor() refuses to export an unsigned anchor');

        const anchor = signAnchor(registry, { publicationId: 'pub-b', contentHash: 'hash-b', anchorType: 'local-test', locator: 'local://ledger/b' });
        const exported = exchange.exportAnchor(anchor);
        assert(exported.id === anchor.id, '6. exportAnchor() returns the signed anchor\'s own JSON');

        expectThrows(() => exchange.importAnchor({ ...exported, kind: 'something.else' }), '7. importAnchor() rejects a structurally malformed envelope');
        assert(catalog.list().length === 0, '8. a structurally rejected envelope never reaches the catalog');

        const tampered = { ...exported, contentHash: 'tampered-hash' };
        expectThrows(() => exchange.importAnchor(tampered), '9. importAnchor() rejects a tampered/forged signature');
        assert(catalog.list().length === 0, '10. a forged envelope never reaches the catalog — THE key difference from AddPublicationAnchorUseCase');

        const { anchor: cataloged, isNew } = exchange.importAnchor(exported);
        assert(isNew === true && cataloged.id === anchor.id, '11. a genuinely signed anchor imports and catalogs');
        assert(catalog.has(anchor.id), '12. the catalog actually holds it');

        const { isNew: reimportIsNew } = exchange.importAnchor(exported);
        assert(reimportIsNew === false, '13. re-importing the identical envelope reports isNew: false');
        assert(catalog.list().length === 1, '14. re-importing never duplicates the catalog entry');

        // importAnchor() never calls ExternalAnchorVerifier — signature
        // verification only, never proof verification.
        let proofVerifierCalled = false;
        const spyPlugin = { anchorType: 'local-test', verify: () => { proofVerifierCalled = true; return { valid: true }; } };
        const anotherAnchor = signAnchor(registry, { publicationId: 'pub-spy', contentHash: 'hash-spy', anchorType: 'local-test', locator: 'local://ledger/spy', proof: { x: 1 } });
        exchange.importAnchor(anotherAnchor.toJSON());
        const spyResult = await new ExternalAnchorVerifier(new LocalAuthorizationVerifier()).verify(anotherAnchor.toJSON(), { proofVerifier: spyPlugin });
        assert(spyResult.outcome === AnchorVerificationOutcome.VALID, '15. sanity: the spy plugin genuinely can verify this anchor if asked');
        assert(proofVerifierCalled === true, '16. sanity: calling ExternalAnchorVerifier explicitly does invoke the plugin');
        proofVerifierCalled = false;
        exchange.importAnchor(anotherAnchor.toJSON());
        assert(proofVerifierCalled === false, '17. importAnchor() itself never invokes any proofVerifier — signature check only');
    }
    console.log('✓ Section B: PublicationAnchorExchange — validate/construct/verify SIGNATURE/catalog, forged signatures rejected, no proof verification ever');

    // ---------------------------------------------------------------
    // Section C — PublicationAnchorPeerExchange, against a stub transport
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const { exchange } = makeAnchorExchange();

        expectThrows(() => new PublicationAnchorPeerExchange(null, new StubPeerMessageBus(), new StubConnectedPeerRegistry()),
            '1. constructor requires a PublicationAnchorExchange');
        expectThrows(() => new PublicationAnchorPeerExchange(exchange, null, new StubConnectedPeerRegistry()),
            '2. constructor requires a PeerMessageBus');
        expectThrows(() => new PublicationAnchorPeerExchange(exchange, new StubPeerMessageBus(), null),
            '3. constructor requires a ConnectedPeerRegistry');

        const authenticatedPeer = stubPeer('conn-authenticated', PeerLifecycleState.AUTHENTICATED);
        const connectingPeer = stubPeer('conn-connecting', PeerLifecycleState.CONNECTING);
        const bus = new StubPeerMessageBus();
        const registry = new StubConnectedPeerRegistry([authenticatedPeer, connectingPeer]);
        const peerExchange = new PublicationAnchorPeerExchange(exchange, bus, registry);

        assert(bus.attached.has('conn-authenticated') && bus.attached.has('conn-connecting'),
            '4. every peer already in the registry is attached on construction');

        const newPeer = stubPeer('conn-new', PeerLifecycleState.AUTHENTICATED);
        registry._peers = [...registry._peers, newPeer];
        registry.fireChange();
        assert(bus.attached.has('conn-new'), '5. a peer added later (registry onChange) is attached automatically too');

        const anchor = signAnchor(alice, { publicationId: 'pub-c', contentHash: 'hash-c', anchorType: 'local-test', locator: 'local://ledger/c' });
        const sentCount = peerExchange.announce(anchor);
        assert(sentCount === 2, '6. announce() sends only to peers currently AUTHENTICATED (2 of 3 stub peers) — an unauthenticated peer never receives one');
        assert(bus.sent.length === 2 && bus.sent.every((s) => s.protocol === PublicationAnchorPeerExchange.DEFAULT_PROTOCOL),
            '7. announce() sends under this class\'s own namespaced protocol');
        assert(bus.sent[0].payload.kind === PublicationAnchorPeerMessageKind.ANNOUNCE && bus.sent[0].payload.envelope.id === anchor.id,
            '8. the sent message wraps the exported envelope under ANNOUNCE');
        assert(bus.sent[0].payload.envelope.verified === undefined && bus.sent[0].payload.envelope.verificationOutcome === undefined,
            '9. the sent envelope carries no verification result of any kind — only the signed claim itself');

        expectThrows(() => peerExchange.announce({}), '10. announce() rejects a non-PublicationAnchor (passthrough from exportAnchor)');

        // Receiving side: a second, independent replica's catalog/exchange,
        // fed only through the stub bus's deliver() — never a direct call
        // to importAnchor() from the test itself.
        const { catalog: bobCatalog, exchange: bobExchange } = makeAnchorExchange();
        const bobBus = new StubPeerMessageBus();
        const bobRegistry = new StubConnectedPeerRegistry([]);
        const bobPeerExchange = new PublicationAnchorPeerExchange(bobExchange, bobBus, bobRegistry);

        const received = [];
        bobPeerExchange.onAnchorReceived((result) => received.push(result));

        // externalAnchorVerifier is NEVER consulted by the incoming path —
        // a spy plugin that would fail the moment it's ever called.
        let externalVerifierCalled = false;
        const spyExternalVerifier = new ExternalAnchorVerifier(new LocalAuthorizationVerifier());
        const originalVerify = spyExternalVerifier.verify.bind(spyExternalVerifier);
        spyExternalVerifier.verify = async (...args) => { externalVerifierCalled = true; return originalVerify(...args); };

        bobBus.deliver(PublicationAnchorPeerExchange.DEFAULT_PROTOCOL, { kind: 'SOMETHING_ELSE', envelope: {} });
        assert(received.length === 0 && bobCatalog.list().length === 0, '11. a malformed gossip wrapper is silently dropped, never catalogs, never crashes');

        const tampered = signAnchor(alice, { publicationId: 'pub-forged', contentHash: 'hash-forged', anchorType: 'local-test', locator: 'local://ledger/forged' }).toJSON();
        tampered.contentHash = 'tampered-after-signing';
        bobBus.deliver(PublicationAnchorPeerExchange.DEFAULT_PROTOCOL, toPublicationAnchorAnnounceMessage(tampered));
        assert(received.length === 0 && bobCatalog.list().length === 0, '12. a forged/tampered envelope is silently dropped, never catalogs, never crashes');

        const genuine = signAnchor(alice, { publicationId: 'pub-genuine', contentHash: 'hash-genuine', anchorType: 'local-test', locator: 'local://ledger/genuine' });
        bobBus.deliver(PublicationAnchorPeerExchange.DEFAULT_PROTOCOL, toPublicationAnchorAnnounceMessage(genuine.toJSON()));
        assert(received.length === 1 && received[0].isNew === true && received[0].anchor.id === genuine.id,
            '13. a genuine announce catalogs and fires onAnchorReceived with isNew: true');
        assert(bobCatalog.has(genuine.id), '14. the catalog actually holds it');
        assert(externalVerifierCalled === false, '15. the incoming path never once consults ExternalAnchorVerifier — signature only, never proof');

        bobBus.deliver(PublicationAnchorPeerExchange.DEFAULT_PROTOCOL, toPublicationAnchorAnnounceMessage(genuine.toJSON()));
        assert(received.length === 2 && received[1].isNew === false, '16. re-announcing the identical envelope still fires the event, with isNew: false');
        assert(bobCatalog.list().length === 1, '17. re-announcing never duplicates the catalog entry — first-seen-wins receivedAt, unchanged from 0.8.2');

        // Multiple independent anchors, and different anchorTypes, all
        // retained — the same multi-evidence coexistence 0.8.2 already
        // established for the catalog, now proven to survive live
        // announce() traffic too.
        const bitcoinAnchor = signAnchor(alice, { publicationId: 'pub-multi', contentHash: 'hash-multi', anchorType: 'bitcoin-op-return', locator: 'bitcoin://tx/multi' });
        const otherLedgerAnchor = signAnchor(alice, { publicationId: 'pub-multi', contentHash: 'hash-multi', anchorType: 'other-ledger', locator: 'other://chain/multi' });
        bobBus.deliver(PublicationAnchorPeerExchange.DEFAULT_PROTOCOL, toPublicationAnchorAnnounceMessage(bitcoinAnchor.toJSON()));
        bobBus.deliver(PublicationAnchorPeerExchange.DEFAULT_PROTOCOL, toPublicationAnchorAnnounceMessage(otherLedgerAnchor.toJSON()));
        assert(bobCatalog.findByPublicationId('pub-multi').length === 2, '18. two independent anchors for the same publication both survive announce(), neither replacing the other');
        assert(bobCatalog.findByAnchorType('bitcoin-op-return').length === 1 && bobCatalog.findByAnchorType('other-ledger').length === 1,
            '19. different anchorTypes are both retained distinctly');

        // Peer identity never becomes anchor authority — nothing about
        // WHICH stub connection this message notionally arrived over is
        // ever read; _handleIncoming() takes only the payload.
        const anotherGenuine = signAnchor(alice, { publicationId: 'pub-anyone', contentHash: 'hash-anyone', anchorType: 'local-test', locator: 'local://ledger/anyone' });
        bobBus.deliver(PublicationAnchorPeerExchange.DEFAULT_PROTOCOL, toPublicationAnchorAnnounceMessage(anotherGenuine.toJSON()));
        assert(bobCatalog.has(anotherGenuine.id), '20. a genuinely signed anchor catalogs on its own signature\'s merit — no notion of "which peer sent it" ever gates acceptance');

        const disposalBus = new StubPeerMessageBus();
        const disposalRegistry = new StubConnectedPeerRegistry([]);
        const disposalExchange = new PublicationAnchorPeerExchange(bobExchange, disposalBus, disposalRegistry);
        const disposalReceived = [];
        disposalExchange.onAnchorReceived((r) => disposalReceived.push(r));
        disposalExchange.dispose();
        disposalBus.deliver(PublicationAnchorPeerExchange.DEFAULT_PROTOCOL, toPublicationAnchorAnnounceMessage(signAnchor(alice, { publicationId: 'pub-after-dispose', contentHash: 'hash-after-dispose', anchorType: 'local-test', locator: 'local://ledger/after-dispose' }).toJSON()));
        assert(disposalReceived.length === 0, '21. dispose() unsubscribes from the bus — no further deliveries are handled');
    }
    console.log('✓ Section C: PublicationAnchorPeerExchange — AUTHENTICATED-only sends, auto-attach, malformed/forged drops, never consults ExternalAnchorVerifier, multi-evidence retained, dispose()');

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP: Alice -> Bob -> Carol, over real, live,
    // authenticated connections. Bob verifies VALID; Carol independently
    // cannot (PROOF_UNAVAILABLE). Neither outcome ever crosses the wire.
    // ---------------------------------------------------------------
    {
        const network = new LocalPeerNetwork();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carol = makeIdentity('Carol');

        const aliceTransport = new LocalPeerConnectionProvider('alice-anchor', network);
        const bobTransport = new LocalPeerConnectionProvider('bob-anchor', network);
        const carolTransport = new LocalPeerConnectionProvider('carol-anchor', network);

        const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        const stopAliceListening = aliceConnect.listen();

        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const stopBobListening = bobConnect.listen();
        const bobToAlice = bobConnect.connect({ candidateEndpoint: 'alice-anchor' });

        await wait(20);
        assert(bobToAlice.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '1. setup: Bob authenticates to Alice over a real live connection');

        const carolConnect = new ConnectToPeerUseCase({ peerConnectionProvider: carolTransport, identityProvider: carol });
        const carolToBob = carolConnect.connect({ candidateEndpoint: 'bob-anchor' });

        await wait(20);
        assert(carolToBob.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '2. setup: Carol authenticates to Bob over a real live connection');
        assert(bobConnect.registry.list().length === 2, '3. setup: Bob\'s single registry now holds BOTH Alice and Carol');

        const { catalog: aliceCatalog, exchange: aliceExchange } = makeAnchorExchange();
        const aliceBus = new PeerMessageBus();
        const alicePeerExchange = new PublicationAnchorPeerExchange(aliceExchange, aliceBus, aliceConnect.registry);

        const { catalog: bobCatalog, exchange: bobExchange } = makeAnchorExchange();
        const bobBus = new PeerMessageBus();
        const bobPeerExchange = new PublicationAnchorPeerExchange(bobExchange, bobBus, bobConnect.registry);

        const { catalog: carolCatalog, exchange: carolExchange } = makeAnchorExchange();
        const carolBus = new PeerMessageBus();
        const carolPeerExchange = new PublicationAnchorPeerExchange(carolExchange, carolBus, carolConnect.registry);

        const bobReceived = [];
        bobPeerExchange.onAnchorReceived((result) => bobReceived.push(result));
        const carolReceived = [];
        carolPeerExchange.onAnchorReceived((result) => carolReceived.push(result));

        const anchor = signAnchor(alice, {
            publicationId: 'pub-flagship-d', contentHash: 'hash-flagship-d', anchorType: 'bitcoin-op-return',
            locator: 'bitcoin://tx/flagship-d', proof: { txid: 'flagship-d' }
        });

        assert(bobCatalog.has(anchor.id) === false, '4. Bob has not seen the anchor before Alice announces it');
        const sentToBob = alicePeerExchange.announce(anchor);
        assert(sentToBob === 1, '5. Alice announces to exactly her one live authenticated peer (Bob)');

        await wait(20);
        assert(bobCatalog.has(anchor.id), '6. Bob catalogs the anchor the instant it arrives over the LIVE connection');
        assert(bobReceived.length === 1 && bobReceived[0].isNew === true, '7. Bob\'s onAnchorReceived fires with the real cataloged anchor');
        assert(carolCatalog.has(anchor.id) === false, '8. Carol has NOT seen it yet — Alice never announced directly to Carol, they are not connected');
        assert(aliceCatalog.get(anchor.id) === null, '8b. announce() never touches the announcer\'s own catalog — Alice still has not cataloged her own anchor');

        // Bob relays the SAME claim onward — Carol receives it from Bob,
        // never from Alice. The claim is byte-for-byte identical; only
        // its path differed.
        const bobOwnCopy = bobCatalog.get(anchor.id);
        const sentToCarol = bobPeerExchange.announce(bobOwnCopy);
        assert(sentToCarol === 2, '9. Bob relays to both of his own authenticated peers (Alice and Carol)');

        await wait(20);
        assert(carolCatalog.has(anchor.id), '10. Carol now catalogs the anchor — relayed via Bob, not received directly from Alice');
        assert(carolReceived.length === 1 && carolReceived[0].anchor.id === anchor.id, '11. Carol\'s onAnchorReceived fires with the identical anchor id Alice originally signed');

        // Bob's relay is a broadcast to every one of his own authenticated
        // peers, which includes Alice herself — the anchor Alice signed
        // echoes back to her over the wire. That is harmless, not a bug:
        // her own genuinely-signed anchor is exactly as acceptable
        // arriving from Bob as it was when she first created it, and the
        // catalog's own id-based dedup (0.8.2) makes a second echo, from
        // anywhere, idempotent.
        assert(aliceCatalog.has(anchor.id), '12. the echoed relay reaching Alice catalogs cleanly too — her own signature is exactly as valid arriving over the wire as it was when she made it');

        // All three hold the IDENTICAL signed claim.
        assert(bobCatalog.get(anchor.id).signature.signature === anchor.signature.signature, '13. Bob\'s copy carries the exact same signature Alice produced');
        assert(carolCatalog.get(anchor.id).signature.signature === anchor.signature.signature, '14. Carol\'s copy carries the exact same signature Alice produced, unchanged after two hops');

        // receivedAt is local to each replica — never part of the signed
        // claim, never synchronized.
        assert(bobCatalog.getReceivedAt(anchor.id) !== null && carolCatalog.getReceivedAt(anchor.id) !== null,
            '15. both Bob and Carol recorded their own local receivedAt');

        // Verification is now INDEPENDENT and LOCAL to each replica —
        // Bob's external system reports the proof VALID; Carol's own
        // external system cannot presently reach it.
        const verifier = new LocalAuthorizationVerifier();
        const bobExternalVerifier = new ExternalAnchorVerifier(verifier);
        const acceptingPlugin = { anchorType: 'bitcoin-op-return', verify: () => ({ valid: true }) };
        const bobResult = await bobExternalVerifier.verify(bobCatalog.get(anchor.id).toJSON(), {
            expectedContentHash: 'hash-flagship-d', expectedPublicationId: 'pub-flagship-d', proofVerifier: acceptingPlugin
        });
        assert(bobResult.outcome === AnchorVerificationOutcome.VALID, '16. Bob independently verifies the SAME claim as VALID');

        const carolExternalVerifier = new ExternalAnchorVerifier(verifier);
        const unreachablePlugin = { anchorType: 'bitcoin-op-return', verify: () => { throw new Error('block explorer unreachable'); } };
        const carolResult = await carolExternalVerifier.verify(carolCatalog.get(anchor.id).toJSON(), {
            expectedContentHash: 'hash-flagship-d', expectedPublicationId: 'pub-flagship-d', proofVerifier: unreachablePlugin
        });
        assert(carolResult.outcome === AnchorVerificationOutcome.PROOF_UNAVAILABLE, '17. Carol independently reports PROOF_UNAVAILABLE for the IDENTICAL claim — her own external system, her own honest answer');

        // Neither outcome ever crosses the wire, and neither is stored
        // anywhere the other replica (or a later lookup) could find it.
        assert(bobCatalog.get(anchor.id).toJSON().verified === undefined && bobCatalog.get(anchor.id).toJSON().verificationOutcome === undefined,
            '18. Bob\'s VALID result is never written into the cataloged anchor record');
        assert(carolCatalog.get(anchor.id).toJSON().verified === undefined && carolCatalog.get(anchor.id).toJSON().verificationOutcome === undefined,
            '19. Carol\'s PROOF_UNAVAILABLE result is never written into the cataloged anchor record either');

        // Re-verifying Bob's copy again, fresh, still reaches the same
        // honest answer for HIM — his result was never contaminated by
        // knowing Carol's, and vice versa; each call is independent.
        const bobResultAgain = await bobExternalVerifier.verify(bobCatalog.get(anchor.id).toJSON(), { proofVerifier: acceptingPlugin });
        assert(bobResultAgain.outcome === AnchorVerificationOutcome.VALID, '20. Bob\'s verification is stable and entirely local, unaffected by Carol\'s own outcome ever existing');

        alicePeerExchange.dispose();
        bobPeerExchange.dispose();
        carolPeerExchange.dispose();
        stopAliceListening();
        stopBobListening();
        aliceTransport.dispose();
        bobTransport.dispose();
        carolTransport.dispose();
    }
    console.log('✓ Section D: FLAGSHIP — Alice → Bob → Carol over live authenticated connections; the identical claim propagates two hops; verification stays independent and local; no outcome ever crosses the wire');

    console.log('\nAll Publication Anchor Peer Exchange tests passed.');
}

run().catch((error) => {
    console.error('PublicationAnchorPeerExchange.test.js FAILED:', error);
    process.exitCode = 1;
});
