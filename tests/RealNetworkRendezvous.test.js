import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { PeerInvitation } from '../peer/PeerInvitation.js';
import { RendezvousPublication } from '../peer/RendezvousPublication.js';
import { signRendezvousPublication } from '../peer/RendezvousPublicationSigning.js';
import { WebSocketRendezvousTransport } from '../peer/WebSocketRendezvousTransport.js';
import { RendezvousDiscoveryProvider } from '../peer/RendezvousDiscoveryProvider.js';
import { DiscoveryBootstrap } from '../peer/DiscoveryBootstrap.js';
import { WebRtcPeerConnectionProvider } from '../peer/WebRtcPeerConnectionProvider.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { PeerSessionManager } from '../application/PeerSessionManager.js';
import { FindPeerUseCase } from '../application/FindPeerUseCase.js';

// 0.2.66 — Real Network Rendezvous & NAT Traversal.
//
// tests/DistributedPeerRendezvous.test.js already proved peer/
// RendezvousDiscoveryProvider.js and peer/DiscoveryBootstrap.js against
// an in-memory peer/LocalRendezvousNetwork.js. This file proves the piece
// 0.2.65 deliberately left as a named, deferred TODO: peer/
// WebSocketRendezvousTransport.js, a REAL (if simulated — see FakeWebSocket
// below) network transport speaking the actual wire protocol described in
// that file's own header, plus the two things layered on top of it this
// milestone adds — optional publication signing (peer/
// RendezvousPublicationSigning.js, identity/LocalAuthorizationVerifier.js#
// verifyRendezvousPublication) and the live application wiring
// (application/PeerSessionManager.js#publishSelf/stopPublishing,
// application/FindPeerUseCase.js) that makes a rendezvous network
// something the running app can actually use.
//
// The FLAGSHIP (final block) is the scenario this milestone exists for:
// two independent application/PeerSessionManager.js instances, each with
// its own peer/WebRtcPeerConnectionProvider.js (a REAL RTCPeerConnection
// pair, exactly like tests/WebRtcPeerTransport.test.js's own flagship —
// no shared in-process registry), discover each other ONLY through a
// simulated real network rendezvous round trip — never a directly shared
// object reference — and the central invariant from 0.2.64/0.2.65 still
// holds over this genuinely new transport: RENDEZVOUS DISTRIBUTES
// CANDIDATES; AUTHENTICATION ESTABLISHES IDENTITY. A malicious publication
// pointing bob's identityId at charlie's own, completely real endpoint
// costs the attacker nothing — charlie authenticates honestly as
// himself, and is rejected for not being bob.

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function wait(ms = 30) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForState(subject, targetStates, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const current = subject.getLifecycleState();
        if (targetStates.includes(current)) { resolve(current); return; }
        const timeout = setTimeout(() => {
            unsubscribe();
            reject(new Error(`timed out waiting for state in [${targetStates.join(', ')}], last state was ${subject.getLifecycleState()}`));
        }, timeoutMs);
        const unsubscribe = subject.onStateChange((state) => {
            if (targetStates.includes(state)) {
                clearTimeout(timeout);
                unsubscribe();
                resolve(state);
            }
        });
    });
}

function makeDevice(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(label);
    return provider;
}

// ---------------------------------------------------------------------
// FakeWebSocket — a real EventTarget-based WebSocket STAND-IN, exercising
// peer/WebSocketRendezvousTransport.js's actual client code (open/message/
// error/close events, JSON frames, requestId correlation) against a fake
// SERVER rather than a real one, the same "real working code against a
// simulated network boundary" technique tests/WebRtcPeerTransport.test.js
// applies to signaling (`relay()`, there) and tests/
// DistributedPeerRendezvous.test.js applies to a whole transport (its own
// `malformedTransport`/`nodeC`). Every state transition (CONNECTING ->
// OPEN -> CLOSED, async send/receive) happens on a real macrotask
// (setTimeout), never synchronously — a transport that only worked
// against an implementation answering instantly would prove nothing about
// a genuinely asynchronous network.
// ---------------------------------------------------------------------
class FakeWebSocket extends EventTarget {
    constructor(url, server) {
        super();
        this.url = url;
        this.readyState = FakeWebSocket.CONNECTING;
        this._server = server;
        setTimeout(() => this._attemptOpen(), 0);
    }

    _attemptOpen() {
        if (this.readyState !== FakeWebSocket.CONNECTING) return;
        if (!this._server || this._server.offline) {
            this.readyState = FakeWebSocket.CLOSED;
            this.dispatchEvent(new Event('error'));
            this.dispatchEvent(new Event('close'));
            return;
        }
        this.readyState = FakeWebSocket.OPEN;
        this._server._addClient(this);
        this.dispatchEvent(new Event('open'));
    }

    send(data) {
        if (this.readyState !== FakeWebSocket.OPEN) {
            throw new Error('FakeWebSocket: cannot send while not open');
        }
        setTimeout(() => this._server && this._server._handleMessage(this, data), 0);
    }

    close() {
        if (this.readyState === FakeWebSocket.CLOSED) return;
        this.readyState = FakeWebSocket.CLOSED;
        if (this._server) this._server._removeClient(this);
        this.dispatchEvent(new Event('close'));
    }

    // Server -> client delivery. Named distinctly from dispatchEvent so
    // it reads as "the server pushed me a frame," never confused with a
    // client-initiated action.
    _receive(data) {
        if (this.readyState !== FakeWebSocket.OPEN) return;
        const event = new Event('message');
        event.data = data;
        this.dispatchEvent(event);
    }
}
FakeWebSocket.CONNECTING = 0;
FakeWebSocket.OPEN = 1;
FakeWebSocket.CLOSING = 2;
FakeWebSocket.CLOSED = 3;

// A WebSocketImpl bound to one fake server — peer/WebSocketRendezvousTransport.js
// only ever calls `new this._WebSocketImpl(url)`, so this factory closes
// over `server` the same way any real deployment would close over an
// actual server address instead.
function fakeWebSocketImplFor(server) {
    return class extends FakeWebSocket {
        constructor(url) { super(url, server); }
    };
}

// ---------------------------------------------------------------------
// FakeRendezvousServer — the "intentionally stupid" server peer/
// WebSocketRendezvousTransport.js's own header describes: identityId ->
// one current publication, expiring on its own, nothing else. Implements
// exactly the wire protocol that file documents (PUBLISH/LOOKUP/REMOVE,
// requestId-correlated OK/ERROR responses) so this file's tests exercise
// the REAL client-side protocol code, never a shortcut around it.
// ---------------------------------------------------------------------
class FakeRendezvousServer {
    constructor() {
        this._publications = new Map(); // identityHint -> publication JSON
        this._clients = new Set();
        this.offline = false; // simulate "server refuses the connection outright"
        this.silent = false;  // simulate "server accepts the connection but never answers" (exercises request timeouts)
        this.extraGarbage = new Map(); // identityId -> extra malformed entries to mix into LOOKUP responses
    }

    _addClient(client) { this._clients.add(client); }
    _removeClient(client) { this._clients.delete(client); }

    _handleMessage(client, data) {
        if (this.silent) return;
        let message;
        try { message = JSON.parse(data); } catch { return; }
        if (!message || typeof message !== 'object' || !message.requestId || !message.type) return;
        this._pruneExpired();
        if (message.type === 'PUBLISH') {
            const publication = message.publication;
            const identityHint = publication && publication.invitation && publication.invitation.identityHint;
            if (!identityHint) {
                client._receive(JSON.stringify({ v: 1, type: 'ERROR', requestId: message.requestId, message: 'invalid publication' }));
                return;
            }
            this._publications.set(identityHint, publication);
            client._receive(JSON.stringify({ v: 1, type: 'OK', requestId: message.requestId, result: publication }));
        } else if (message.type === 'LOOKUP') {
            const found = this._publications.get(message.identityId);
            const result = found ? [found] : [];
            const garbage = this.extraGarbage.get(message.identityId) || [];
            client._receive(JSON.stringify({ v: 1, type: 'OK', requestId: message.requestId, result: [...result, ...garbage] }));
        } else if (message.type === 'REMOVE') {
            let removed = false;
            for (const [key, publication] of this._publications) {
                if (publication.publicationId === message.publicationId) {
                    this._publications.delete(key);
                    removed = true;
                    break;
                }
            }
            client._receive(JSON.stringify({ v: 1, type: 'OK', requestId: message.requestId, result: removed }));
        } else {
            client._receive(JSON.stringify({ v: 1, type: 'ERROR', requestId: message.requestId, message: 'unknown request type' }));
        }
    }

    _pruneExpired(now = new Date()) {
        for (const [key, publication] of this._publications) {
            if (publication.expiresAt && new Date(publication.expiresAt).getTime() <= now.getTime()) {
                this._publications.delete(key);
            }
        }
    }

    // Direct seed, bypassing PUBLISH entirely — the same "poke a fake
    // network boundary from the outside" technique tests/
    // DistributedPeerRendezvous.test.js's own flagship uses to model a
    // malicious rendezvous entry nobody had to actually PUBLISH honestly.
    seed(publicationJSON) {
        this._publications.set(publicationJSON.invitation.identityHint, publicationJSON);
    }
}

async function runTests() {

// ---------------------------------------------------------------------
// 1. WebSocketRendezvousTransport — a genuine PUBLISH/LOOKUP/REMOVE round
//    trip over real (fake) WebSocket open/send/message events, correlated
//    by requestId, never a shortcut around the wire protocol.
// ---------------------------------------------------------------------
{
    const server = new FakeRendezvousServer();
    const transport = new WebSocketRendezvousTransport({ url: 'wss://fake/rendezvous', WebSocketImpl: fakeWebSocketImplFor(server) });
    const publication = RendezvousPublication.create({ invitation: PeerInvitation.create({ endpoint: 'bob-address', identityHint: 'did:key:bob' }) });

    const stored = await transport.publish(publication);
    assert(stored instanceof RendezvousPublication && stored.endpoint === 'bob-address', 'publish() resolves to the stored publication after a real (fake) WebSocket round trip');

    const found = await transport.lookup('did:key:bob');
    assert(found.length === 1 && found[0].endpoint === 'bob-address', 'lookup() resolves to the published publication over the wire');

    const removed = await transport.remove(stored.publicationId);
    assert(removed === true, 'remove() resolves true once withdrawn');
    assert((await transport.lookup('did:key:bob')).length === 0, 'a removed publication is gone from a fresh lookup');

    transport.dispose();
    console.log('✓ WebSocketRendezvousTransport: PUBLISH/LOOKUP/REMOVE round-trip over a real WebSocket client, correlated by requestId');
}

// ---------------------------------------------------------------------
// 2. A malformed entry mixed into a LOOKUP response is skipped at the
//    transport layer itself.
// ---------------------------------------------------------------------
{
    const server = new FakeRendezvousServer();
    server.extraGarbage.set('did:key:bob', [{ garbage: 'not a real publication' }]);
    const transport = new WebSocketRendezvousTransport({ url: 'wss://fake/rendezvous', WebSocketImpl: fakeWebSocketImplFor(server) });
    await transport.publish(RendezvousPublication.create({ invitation: PeerInvitation.create({ endpoint: 'bob-address', identityHint: 'did:key:bob' }) }));

    const found = await transport.lookup('did:key:bob');
    assert(found.length === 1 && found[0].endpoint === 'bob-address', 'a malformed entry mixed into the wire response is skipped, never surfaced as a usable publication');
    transport.dispose();
    console.log('✓ WebSocketRendezvousTransport: a malformed entry in a LOOKUP response is skipped, never crashes lookup()');
}

// ---------------------------------------------------------------------
// 3. A request the server never answers rejects on its own timeout,
//    rather than hanging forever.
// ---------------------------------------------------------------------
{
    const server = new FakeRendezvousServer();
    server.silent = true;
    const transport = new WebSocketRendezvousTransport({ url: 'wss://fake/rendezvous', WebSocketImpl: fakeWebSocketImplFor(server), requestTimeoutMs: 50 });

    let threw = false;
    try {
        await transport.lookup('did:key:bob');
    } catch (e) {
        threw = e.message.includes('timed out');
    }
    assert(threw, 'a request the server never answers rejects with a timeout error');
    transport.dispose();
    console.log('✓ WebSocketRendezvousTransport: an unanswered request rejects on its own timeout, never hangs forever');
}

// ---------------------------------------------------------------------
// 4. A rendezvous server that refuses the connection outright still
//    degrades RendezvousDiscoveryProvider#discover() — never throws.
// ---------------------------------------------------------------------
{
    const server = new FakeRendezvousServer();
    server.offline = true;
    const transport = new WebSocketRendezvousTransport({ url: 'wss://fake/rendezvous', WebSocketImpl: fakeWebSocketImplFor(server), connectTimeoutMs: 200 });
    const provider = new RendezvousDiscoveryProvider({ transport });

    let threw = false;
    let result;
    try {
        result = await provider.discover('did:key:bob');
    } catch {
        threw = true;
    }
    assert(threw === false, 'an unreachable rendezvous server never makes discover() throw — see peer/RendezvousDiscoveryProvider.js\'s own header');
    assert(result.length === 0, 'nothing was ever cached, so discover() resolves to nothing — but it still resolves cleanly');
    console.log('✓ WebSocketRendezvousTransport + RendezvousDiscoveryProvider: a server that refuses the connection outright still degrades discover(), never throws');
}

// ---------------------------------------------------------------------
// 5. DiscoveryBootstrap over real WebSocketRendezvousTransports — one
//    unreachable node never blocks a healthy one queried concurrently.
// ---------------------------------------------------------------------
{
    const goodServer = new FakeRendezvousServer();
    const deadServer = new FakeRendezvousServer();
    deadServer.offline = true;
    const goodProvider = new RendezvousDiscoveryProvider({ transport: new WebSocketRendezvousTransport({ url: 'wss://good', WebSocketImpl: fakeWebSocketImplFor(goodServer) }) });
    const deadProvider = new RendezvousDiscoveryProvider({ transport: new WebSocketRendezvousTransport({ url: 'wss://dead', WebSocketImpl: fakeWebSocketImplFor(deadServer), connectTimeoutMs: 200 }) });
    const bootstrap = new DiscoveryBootstrap({ bootstrapProviders: [goodProvider, deadProvider] });

    await goodProvider.publish(PeerInvitation.create({ endpoint: 'bob-address', identityHint: 'did:key:bob' }));
    const found = await bootstrap.discover('did:key:bob');
    assert(found.length === 1 && found[0].candidateEndpoint === 'bob-address', 'an unreachable bootstrap node never blocks a healthy one queried concurrently alongside it');
    console.log('✓ DiscoveryBootstrap over real WebSocketRendezvousTransports: an unreachable node is queried concurrently with a healthy one, and never blocks it');
}

// ---------------------------------------------------------------------
// 6. RendezvousPublication signing — optional, self-refusing to sign
//    someone else's identityHint, tamper-evident once signed.
// ---------------------------------------------------------------------
{
    const bob = makeDevice('BobSigner6');
    const bobId = bob.getSigningIdentity().id;
    const eve = makeDevice('EveSigner6');
    const verifier = new LocalAuthorizationVerifier();

    const unsigned = RendezvousPublication.create({ invitation: PeerInvitation.create({ endpoint: 'bob-address', identityHint: bobId }) });
    const unsignedResult = verifier.verifyRendezvousPublication(unsigned);
    assert(unsignedResult.valid === true && unsignedResult.signed === false, 'an unsigned publication is tolerated — signing stays optional');

    const signed = signRendezvousPublication(unsigned, bob);
    assert(signed.signature !== null, 'signRendezvousPublication() attaches a real signature when the identityProvider matches identityHint');
    const signedResult = verifier.verifyRendezvousPublication(signed);
    assert(signedResult.valid === true && signedResult.signed === true, 'a publication signed by the identity it claims to be verifies');

    const forgedAttempt = signRendezvousPublication(
        RendezvousPublication.create({ invitation: PeerInvitation.create({ endpoint: 'eve-address', identityHint: bobId }) }),
        eve
    );
    assert(forgedAttempt.signature === null, 'this device refuses to sign a publication claiming an identityHint that is not its own — it degrades to unsigned rather than producing a misleading signature');

    // Tampered in transit: bob's own genuine signature, but the endpoint
    // it was signed over has been swapped afterward.
    const tampered = new RendezvousPublication({
        publicationId: signed.publicationId,
        invitation: PeerInvitation.create({ endpoint: 'attacker-address', identityHint: bobId, now: signed.publishedAt, ttlMs: signed.expiresAt.getTime() - signed.publishedAt.getTime() }),
        publishedAt: signed.publishedAt,
        expiresAt: signed.expiresAt,
        signature: signed.signature
    });
    const tamperedResult = verifier.verifyRendezvousPublication(tampered);
    assert(tamperedResult.valid === false, 'a publication whose payload was altered after signing fails verification, even with a syntactically well-formed signature attached');

    console.log('✓ RendezvousPublication signing: optional, refuses to sign an identity that is not this device\'s own, and tamper-evident once signed');
}

// ---------------------------------------------------------------------
// 7. RendezvousDiscoveryProvider discards a tampered-but-signed
//    publication end-to-end, over a real WebSocketRendezvousTransport —
//    never surfaced as a candidate at all, one full layer before peer/
//    PeerAuthenticationSession.js would ever run.
// ---------------------------------------------------------------------
{
    const server = new FakeRendezvousServer();
    const bob = makeDevice('BobPublisher7');
    const bobId = bob.getSigningIdentity().id;

    const genuine = signRendezvousPublication(
        RendezvousPublication.create({ invitation: PeerInvitation.create({ endpoint: 'bob-genuine-address', identityHint: bobId }) }),
        bob
    );
    assert(genuine.signature !== null, 'setup: genuinely signed by bob');

    const tampered = new RendezvousPublication({
        publicationId: genuine.publicationId,
        invitation: PeerInvitation.create({ endpoint: 'attacker-address', identityHint: bobId, now: genuine.publishedAt, ttlMs: genuine.expiresAt.getTime() - genuine.publishedAt.getTime() }),
        publishedAt: genuine.publishedAt,
        expiresAt: genuine.expiresAt,
        signature: genuine.signature
    });
    server.seed(tampered.toJSON());

    const alice = new RendezvousDiscoveryProvider({ transport: new WebSocketRendezvousTransport({ url: 'wss://good', WebSocketImpl: fakeWebSocketImplFor(server) }) });
    const found = await alice.discover(bobId);
    assert(found.length === 0, 'a tampered-but-signed publication never becomes a candidate at all');
    console.log('✓ RendezvousDiscoveryProvider: a signed publication tampered with after signing is discarded during discover(), never surfaced as a candidate');
}

// ---------------------------------------------------------------------
// 8. FLAGSHIP — two independent application/PeerSessionManager.js
//    instances, each with its own REAL RTCPeerConnection pair, discover
//    each other ONLY through a simulated real network rendezvous round
//    trip. A malicious publication points bob's identityId at charlie's
//    own, completely genuine endpoint; charlie authenticates honestly as
//    himself and is rejected. Bob's own genuine publication, on a
//    DIFFERENT (simulated) rendezvous node, authenticates successfully.
//
//        Alice's DiscoveryBootstrap
//              │
//     ┌────────┴────────┐
//     ▼                 ▼
//  node A            node B
//  (charlie's        (bob's
//   real offer,        real offer,
//   labeled "bob")     labeled "bob")
//     │                 │
//     ▼                 ▼
//  REJECTED          AUTHENTICATED
//  (charlie, not     (genuinely bob)
//   bob)
// ---------------------------------------------------------------------
{
    const alice = makeDevice('AliceFlagship8');
    const bob = makeDevice('BobFlagship8');
    const charlie = makeDevice('CharlieFlagship8');
    const bobId = bob.getSigningIdentity().id;
    const charlieId = charlie.getSigningIdentity().id;

    const nodeA = new FakeRendezvousServer(); // where charlie's malicious entry lives
    const nodeB = new FakeRendezvousServer(); // where bob's genuine entry lives

    function makeSession(identityProvider, servers) {
        const bootstrap = new DiscoveryBootstrap({
            bootstrapProviders: servers.map((server, i) => new RendezvousDiscoveryProvider({
                transport: new WebSocketRendezvousTransport({ url: `wss://node-${i}`, WebSocketImpl: fakeWebSocketImplFor(server) }),
                identityProvider
            }))
        });
        return new PeerSessionManager({
            identityProvider,
            peerConnectionProvider: new WebRtcPeerConnectionProvider(),
            discoveryProvider: bootstrap
        });
    }

    const aliceSession = makeSession(alice, [nodeA, nodeB]);
    const bobSession = makeSession(bob, [nodeB]);
    const charlieSession = makeSession(charlie, [nodeA]);

    // Bob publishes himself, genuinely, to node B. bobSession's own
    // discoveryProvider is a peer/DiscoveryBootstrap.js with exactly ONE
    // configured bootstrap node, so publishSelf() resolves to a
    // one-element ARRAY — see application/PeerSessionManager.js#publishSelf's
    // own header on the three possible return shapes.
    const bobPublications = await bobSession.publishSelf();
    assert(Array.isArray(bobPublications) && bobPublications.length === 1, "bob's publishSelf() actually reaches its one configured rendezvous node");
    const bobPublication = bobPublications[0];

    // Charlie creates a genuinely real WebRTC offer under his OWN
    // identity, exactly like publishSelf() would — but instead of
    // publishing it under his own id, this device (standing in for a
    // malicious or merely confused rendezvous participant — see peer/
    // RendezvousTransport.js's own header: nobody is ever authenticated
    // to PUBLISH) republishes that same genuine endpoint straight to
    // node A, mislabeled as BOB's.
    const { invitation: charlieInvitation } = await charlieSession.createInvitation();
    const impersonation = RendezvousPublication.create({
        invitation: new PeerInvitation({
            formatVersion: charlieInvitation.formatVersion,
            invitationId: charlieInvitation.invitationId,
            endpoint: charlieInvitation.endpoint,
            identityHint: bobId,
            createdAt: charlieInvitation.createdAt.toISOString(),
            expiresAt: charlieInvitation.expiresAt.toISOString()
        })
    });
    nodeA.seed(impersonation.toJSON());

    const findPeerUseCase = new FindPeerUseCase({ peerSessionManager: aliceSession });
    const candidates = await findPeerUseCase.search(bobId);
    const endpoints = candidates.map((c) => c.candidateEndpoint);
    assert(endpoints.length === 2, "alice's search for bob finds BOTH candidates — one from each independently-queried rendezvous node — neither collapsing the other");
    assert(endpoints.includes(charlieInvitation.endpoint) && endpoints.includes(bobPublication.endpoint), 'both the malicious and the genuine candidate are present');

    let rejected = null;
    const unsubscribeRejected = findPeerUseCase.onCandidateRejected((detail) => { rejected = detail; });

    // Alice tries the malicious candidate first.
    const charlieCandidate = candidates.find((c) => c.candidateEndpoint === charlieInvitation.endpoint);
    const { connectedPeer: charlieAttempt, reply: charlieReply } = await findPeerUseCase.connect(charlieCandidate, bobId);
    // Relaying the reply back to charlie's own pending offer is the same
    // out-of-band step ui/views/PeerConnectionsView.js's own "Complete
    // Connection" performs by hand — over a real rendezvous flow, THIS is
    // the one leg a rendezvous network still cannot do for either side
    // (see application/PeerSessionManager.js#publishSelf's own header on
    // why one publication answers at most one connection attempt); a
    // future signaling relay could automate exactly this step without
    // changing anything above application/PeerSessionManager.js.
    await charlieSession.completeConnection(charlieAttempt.connectionId, charlieReply);
    await waitForState(charlieAttempt, [PeerLifecycleState.CLOSED, PeerLifecycleState.FAILED]);

    assert(rejected !== null && rejected.expectedIdentityId === bobId && rejected.actualIdentityId === charlieId,
        'charlie authenticates completely honestly, as himself, and is rejected for not being bob');
    assert(charlieAttempt.getLifecycleState() === PeerLifecycleState.CLOSED, 'the rejected connection is closed, never left sitting around as if it were bob');

    // Alice tries bob's genuine candidate next.
    const bobCandidate = candidates.find((c) => c.candidateEndpoint === bobPublication.endpoint);
    const { connectedPeer: bobAttempt, reply: bobReply } = await findPeerUseCase.connect(bobCandidate, bobId);
    await bobSession.completeConnection(bobAttempt.connectionId, bobReply);
    await waitForState(bobAttempt, [PeerLifecycleState.AUTHENTICATED, PeerLifecycleState.FAILED]);

    assert(bobAttempt.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, "bob's genuine candidate, discovered over the SAME simulated real network, authenticates successfully");
    assert(bobAttempt.remoteIdentity && bobAttempt.remoteIdentity.identityId === bobId, 'the proven identity is genuinely bob');

    unsubscribeRejected();
    findPeerUseCase.dispose();
    aliceSession.dispose();
    bobSession.dispose();
    charlieSession.dispose();
    await wait(100); // let the real RTCPeerConnections finish tearing down
    console.log('✓ FLAGSHIP: two independent PeerSessionManagers, each with a real RTCPeerConnection pair, discover each other only through a simulated real-network rendezvous round trip; a malicious publication authenticates honestly as itself and is rejected, and only bob\'s genuine, independently-published candidate ever authenticates as bob');
}

console.log('\nAll real network rendezvous tests passed.');
}

await runTests();
