import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { WebRtcPeerConnectionProvider } from '../peer/WebRtcPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import {
    createPeerMessage,
    isValidPeerMessageEnvelope,
    exceedsMaxPeerMessageSize,
    MAX_PEER_MESSAGE_BYTES
} from '../peer/PeerMessage.js';
import { toHelloMessage } from '../core/PeerAuthenticationEnvelope.js';

// 0.2.52 — Authenticated Peer Messaging & Protocol Multiplexing.
//
// "Once Alice and Bob have an authenticated peer connection, how do
// different decentralized application protocols safely share that
// connection?" Blocks 1-5 exercise peer/PeerMessage.js's envelope and
// peer/PeerMessageBus.js's gating/routing logic directly, against
// minimal stand-ins that let each security property (delivery gated on
// AUTHENTICATED, protocol isolation, malformed/oversized/duplicate
// rejection, auto-detach) be tested deterministically, the same
// `fakeConnection()` spirit tests/PeerAuthentication.test.js's own
// forged-message blocks already established.
//
// The flagship (`runFlagship`) then runs the identical application-level
// scenario — mutual authentication, then Alice sends test.alpha/
// test.beta/test.unknown, Bob (subscribed only to alpha/beta) receives
// exactly those two — over BOTH `peer/LocalPeerConnectionProvider.js`
// and `peer/WebRtcPeerConnectionProvider.js`, unmodified, to prove the
// multiplexing layer is transport-agnostic rather than an interface with
// one implementation underneath. The WebRTC half only runs where a real
// `RTCPeerConnection` exists (a browser via tests.html); it is skipped,
// not failed, under a plain Node.js run.
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

function wait(ms = 10) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeDevice(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(label);
    return provider;
}

function relay(signal) {
    return JSON.parse(JSON.stringify(signal.toJSON()));
}

function waitForLocalSignal(connection, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('timed out waiting for localSignal')), timeoutMs);
        connection.onLocalSignalReady((signal) => { clearTimeout(timeout); resolve(signal); });
    });
}

function waitForState(subject, targetStates, timeoutMs = 15000) {
    const getState = () => (typeof subject.getLifecycleState === 'function' ? subject.getLifecycleState() : subject.transportState);
    return new Promise((resolve, reject) => {
        const current = getState();
        if (targetStates.includes(current)) { resolve(current); return; }
        const timeout = setTimeout(() => {
            unsubscribe();
            reject(new Error(`timed out waiting for state in [${targetStates.join(', ')}], last state was ${getState()}`));
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

async function runTests() {

// ---------------------------------------------------------------------
// 1. PeerMessage — pure data: validated construction, and proof that a
//    peer/PeerAuthenticationSession.js HELLO/PROOF can never be mistaken
//    for a PeerMessage envelope (they share the same onMessage() stream)
// ---------------------------------------------------------------------
{
    const envelope = createPeerMessage('test.alpha', { n: 1 });
    assert(isValidPeerMessageEnvelope(envelope), 'createPeerMessage() produces a valid envelope');
    assert(envelope.protocol === 'test.alpha', 'carries the protocol');
    assert(envelope.version === 1, 'defaults to version 1');
    assert(typeof envelope.messageId === 'string' && envelope.messageId.length > 0, 'mints a messageId');
    assert(!exceedsMaxPeerMessageSize(envelope), 'a small envelope is not oversized');

    const versioned = createPeerMessage('test.alpha', { n: 1 }, { version: 3 });
    assert(versioned.version === 3, 'carries a caller-supplied version');

    assert(!isValidPeerMessageEnvelope(null), 'null is not a valid envelope');
    assert(!isValidPeerMessageEnvelope(toHelloMessage({ sessionNonce: 'x', identityId: 'did:key:z', publicKey: 'deadbeef', challenge: 'c' })),
        'a HELLO handshake message never validates as a PeerMessage envelope');
    assert(!isValidPeerMessageEnvelope({ messageId: 'x', protocol: 'p', version: 1 }), 'a missing payload is rejected');
    assert(!isValidPeerMessageEnvelope({ messageId: 'x', protocol: '', version: 1, payload: {} }), 'an empty protocol is rejected');
    assert(!isValidPeerMessageEnvelope({ messageId: '', protocol: 'p', version: 1, payload: {} }), 'an empty messageId is rejected');
    assert(!isValidPeerMessageEnvelope({ messageId: 'x', protocol: 'p', version: 0, payload: {} }), 'a version below 1 is rejected');

    const oversized = createPeerMessage('test.alpha', { blob: 'x'.repeat(MAX_PEER_MESSAGE_BYTES) });
    assert(exceedsMaxPeerMessageSize(oversized), 'a payload past MAX_PEER_MESSAGE_BYTES is flagged oversized');
    console.log('✓ PeerMessage: validated envelope construction; a HELLO/PROOF handshake message never collides with it; oversized detection works');
}

// ---------------------------------------------------------------------
// 2. PeerMessageBus.send() refuses a peer that is not, right now,
//    AUTHENTICATED — never queues, never sends anyway
// ---------------------------------------------------------------------
{
    const sent = [];
    const connection = { onMessage: () => () => {}, send: (m) => sent.push(m) };
    let state = PeerLifecycleState.CONNECTING;
    const connectedPeer = { connectionId: 'stub-send', connection, getLifecycleState: () => state, onStateChange: () => () => {} };

    const bus = new PeerMessageBus();
    let threw = false;
    try { bus.send(connectedPeer, 'test.alpha', { n: 1 }); } catch (e) { threw = e.message.includes('not AUTHENTICATED'); }
    assert(threw, 'send() refuses a peer that is not AUTHENTICATED');
    assert(sent.length === 0, 'nothing reaches the wire when send() refuses');

    state = PeerLifecycleState.AUTHENTICATED;
    const messageId = bus.send(connectedPeer, 'test.alpha', { n: 1 });
    assert(sent.length === 1 && sent[0].messageId === messageId, 'send() succeeds once AUTHENTICATED and returns the envelope messageId');
    assert(sent[0].protocol === 'test.alpha', 'the sent envelope carries the requested protocol');
    console.log('✓ PeerMessageBus.send(): refuses a non-AUTHENTICATED peer, succeeds once AUTHENTICATED');
}

// ---------------------------------------------------------------------
// 3. Incoming messages are gated on AUTHENTICATED at DELIVERY time, not
//    merely at attach() time — the design doc's own central security
//    property: a live connection that never finishes authenticating (or
//    whose authentication later fails) cannot inject anything through
//    the bus, even a perfectly well-formed envelope.
// ---------------------------------------------------------------------
{
    let messageListener = null;
    let state = PeerLifecycleState.CONNECTED; // CONNECTED, but never AUTHENTICATED
    const connection = {
        onMessage: (cb) => { messageListener = cb; return () => { messageListener = null; }; },
        send: () => {}
    };
    const connectedPeer = { connectionId: 'stub-gate', connection, getLifecycleState: () => state, onStateChange: () => () => {} };

    const bus = new PeerMessageBus();
    let received = null;
    bus.subscribe('test.alpha', (payload) => { received = payload; });
    bus.attach(connectedPeer);

    messageListener(createPeerMessage('test.alpha', { fake: true }));
    assert(received === null, 'a message arriving before AUTHENTICATED is dropped, never delivered to a subscriber');

    state = PeerLifecycleState.AUTHENTICATED;
    messageListener(createPeerMessage('test.alpha', { fake: false }));
    assert(received && received.fake === false, 'the identical mechanism delivers normally once AUTHENTICATED');

    state = PeerLifecycleState.FAILED;
    received = null;
    messageListener(createPeerMessage('test.alpha', { fake: 'after-failure' }));
    assert(received === null, 'a message arriving after authentication FAILED is dropped too');
    console.log('✓ PeerMessageBus: incoming messages are gated on AUTHENTICATED at delivery time, not merely at attach() time');
}

// ---------------------------------------------------------------------
// 4. Protocol isolation, malformed/handshake-shaped/oversized rejection,
//    bounded duplicate suppression, and unsubscribe()
// ---------------------------------------------------------------------
{
    let messageListener = null;
    const connection = { onMessage: (cb) => { messageListener = cb; return () => {}; }, send: () => {} };
    const connectedPeer = { connectionId: 'stub-hygiene', connection, getLifecycleState: () => PeerLifecycleState.AUTHENTICATED, onStateChange: () => () => {} };

    const bus = new PeerMessageBus();
    const alphaReceived = [];
    const unsubscribeAlpha = bus.subscribe('test.alpha', (payload) => alphaReceived.push(payload));
    bus.attach(connectedPeer);

    messageListener(createPeerMessage('test.unknown', { n: 1 }));
    assert(alphaReceived.length === 0, 'a message under an unsubscribed protocol never reaches an unrelated handler');

    messageListener(toHelloMessage({ sessionNonce: 'x', identityId: 'did:key:z', publicKey: 'deadbeef', challenge: 'c' }));
    messageListener({ not: 'an envelope' });
    assert(alphaReceived.length === 0, 'malformed / handshake-shaped messages never reach a protocol handler');

    const oversized = createPeerMessage('test.alpha', { blob: 'x'.repeat(MAX_PEER_MESSAGE_BYTES) });
    messageListener(oversized);
    assert(alphaReceived.length === 0, 'an oversized envelope is rejected before reaching a handler');

    const genuine = createPeerMessage('test.alpha', { n: 42 });
    messageListener(genuine);
    messageListener(genuine);
    assert(alphaReceived.length === 1 && alphaReceived[0].n === 42, 'a duplicate messageId is suppressed within the bounded window, delivered exactly once');

    messageListener(createPeerMessage('test.alpha', { n: 42 }));
    assert(alphaReceived.length === 2, 'a different messageId is never mistaken for a duplicate merely because the payload matches');

    unsubscribeAlpha();
    messageListener(createPeerMessage('test.alpha', { n: 99 }));
    assert(alphaReceived.length === 2, 'unsubscribe() stops further delivery to that handler');
    console.log('✓ PeerMessageBus: unknown protocol ignored, malformed/handshake-shaped/oversized envelopes rejected, duplicates suppressed, unsubscribe() works');
}

// ---------------------------------------------------------------------
// 5. Auto-detaches once the peer's lifecycle reaches CLOSED, mirroring
//    application/ConnectedPeerRegistry.js's own auto-removal discipline
//    — no separate cleanup call required from whatever attached it.
// ---------------------------------------------------------------------
{
    let messageListener = null;
    let stateListener = null;
    const connection = { onMessage: (cb) => { messageListener = cb; return () => { messageListener = null; }; }, send: () => {} };
    const connectedPeer = {
        connectionId: 'stub-lifecycle', connection,
        getLifecycleState: () => PeerLifecycleState.AUTHENTICATED,
        onStateChange: (cb) => { stateListener = cb; return () => { stateListener = null; }; }
    };

    const bus = new PeerMessageBus();
    let received = null;
    bus.subscribe('test.alpha', (payload) => { received = payload; });
    bus.attach(connectedPeer);

    messageListener(createPeerMessage('test.alpha', { ok: true }));
    assert(received && received.ok === true, 'setup: delivery works while attached');

    stateListener(PeerLifecycleState.CLOSED);
    assert(messageListener === null, "closing the peer unsubscribes this bus from the underlying connection's onMessage automatically");
    console.log('✓ PeerMessageBus: auto-detaches from a peer whose lifecycle reaches CLOSED, no explicit detach() required');
}

// ---------------------------------------------------------------------
// 6/7. FLAGSHIP, run identically over TWO real transports — protocol
//      multiplexing over an authenticated connection is transport-
//      agnostic, not an interface with one implementation underneath.
// ---------------------------------------------------------------------
async function runFlagship(makePair, label) {
    const { aliceSigning, aliceConnectedPeer, bobConnectedPeer, settleMs, cleanup } = await makePair();

    const aliceBus = new PeerMessageBus();
    const bobBus = new PeerMessageBus();
    aliceBus.attach(aliceConnectedPeer);
    bobBus.attach(bobConnectedPeer);

    const alphaReceived = [];
    const betaReceived = [];
    bobBus.subscribe('test.alpha', (payload, meta) => alphaReceived.push({ payload, meta }));
    bobBus.subscribe('test.beta', (payload, meta) => betaReceived.push({ payload, meta }));
    // test.unknown is deliberately never subscribed to on bob's side.

    aliceBus.send(aliceConnectedPeer, 'test.alpha', { n: 1 });
    aliceBus.send(aliceConnectedPeer, 'test.beta', { n: 2 });
    aliceBus.send(aliceConnectedPeer, 'test.unknown', { n: 3 });
    await wait(settleMs);

    assert(alphaReceived.length === 1 && alphaReceived[0].payload.n === 1, `[${label}] bob receives exactly the test.alpha message`);
    assert(betaReceived.length === 1 && betaReceived[0].payload.n === 2, `[${label}] bob receives exactly the test.beta message`);
    assert(alphaReceived[0].meta.protocol === 'test.alpha', `[${label}] delivery meta carries the protocol`);
    assert(alphaReceived[0].meta.connectedPeer.remoteIdentity && alphaReceived[0].meta.connectedPeer.remoteIdentity.identityId === aliceSigning.id,
        `[${label}] delivery meta carries the real, PROVEN sender identity — never merely a claimed one`);
    assert(alphaReceived.length === 1 && betaReceived.length === 1,
        `[${label}] the unsubscribed test.unknown protocol — a real message, over a real authenticated connection — never leaks into an unrelated handler`);

    // The bus is bidirectional over the same connection, not a one-way
    // broadcast: bob answers back through his own send().
    const aliceInbox = [];
    aliceBus.subscribe('test.alpha', (payload) => aliceInbox.push(payload));
    bobBus.send(bobConnectedPeer, 'test.alpha', { reply: true });
    await wait(settleMs);
    assert(aliceInbox.length === 1 && aliceInbox[0].reply === true, `[${label}] the bus is bidirectional: alice receives bob's reply over the same connection`);

    console.log(`✓ [${label}] FLAGSHIP: authenticated peers exchange application messages through PeerMessageBus, protocol-isolated, sender-identified, bidirectional`);
    await cleanup();
}

async function makeLocalPair() {
    const network = new LocalPeerNetwork();
    const alice = makeDevice('Alice');
    const bob = makeDevice('Bob');
    const aliceSigning = alice.getSigningIdentity();
    const bobSigning = bob.getSigningIdentity();

    const aliceTransport = new LocalPeerConnectionProvider('alice-msg', network);
    const bobTransport = new LocalPeerConnectionProvider('bob-msg', network);

    const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
    const stopListening = aliceConnect.listen();

    const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
    const bobConnectedPeer = bobConnect.connect({ candidateEndpoint: 'alice-msg' });

    await wait(20);
    assert(bobConnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'setup: bob authenticates over the local transport');
    const aliceConnectedPeer = aliceConnect.registry.list()[0];
    assert(aliceConnectedPeer && aliceConnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, "setup: alice's own side authenticates too");

    return {
        alice, bob, aliceSigning, bobSigning, aliceConnectedPeer, bobConnectedPeer, settleMs: 20,
        cleanup: async () => { stopListening(); aliceTransport.dispose(); bobTransport.dispose(); }
    };
}

async function makeWebRtcPair() {
    const alice = makeDevice('Alice');
    const bob = makeDevice('Bob');
    const aliceSigning = alice.getSigningIdentity();
    const bobSigning = bob.getSigningIdentity();

    const aliceTransport = new WebRtcPeerConnectionProvider();
    const bobTransport = new WebRtcPeerConnectionProvider();
    const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
    const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });

    const aliceConnection = aliceTransport.createOffer();
    const aliceConnectedPeer = aliceConnect.attach(aliceConnection);
    const offer = await waitForLocalSignal(aliceConnection);

    const bobConnectedPeer = bobConnect.connect({ candidateEndpoint: JSON.stringify(relay(offer)) });
    const answer = await waitForLocalSignal(bobConnectedPeer.connection);
    await aliceConnection.acceptRemoteAnswer(relay(answer));

    await Promise.all([
        waitForState(aliceConnectedPeer, [PeerLifecycleState.AUTHENTICATED]),
        waitForState(bobConnectedPeer, [PeerLifecycleState.AUTHENTICATED])
    ]);

    return {
        alice, bob, aliceSigning, bobSigning, aliceConnectedPeer, bobConnectedPeer, settleMs: 300,
        cleanup: async () => { aliceTransport.dispose(); bobTransport.dispose(); await wait(300); }
    };
}

await runFlagship(makeLocalPair, 'LocalPeerConnectionProvider');

if (typeof globalThis.RTCPeerConnection === 'function') {
    await runFlagship(makeWebRtcPair, 'WebRtcPeerConnectionProvider');
} else {
    console.log('… skipping WebRtcPeerConnectionProvider block: no RTCPeerConnection in this environment (open tests.html in a real browser to exercise it)');
}

console.log('\nAll peer messaging tests passed.');
}

await runTests();
