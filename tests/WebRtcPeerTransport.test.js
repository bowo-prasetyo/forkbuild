import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { WebRtcPeerConnectionProvider } from '../peer/WebRtcPeerConnectionProvider.js';
import { PeerConnectionOffer } from '../peer/PeerConnectionOffer.js';
import { PeerConnectionAnswer } from '../peer/PeerConnectionAnswer.js';
import { PeerConnectionState } from '../peer/PeerConnectionState.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerDiscoveryProvider } from '../peer/LocalPeerDiscoveryProvider.js';
import { DiscoverPeersUseCase } from '../application/DiscoverPeersUseCase.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';

// 0.2.51 — Real WebRTC Peer Transport & Signaling Handoff.
//
// Every test in this file that reaches CONNECTED or AUTHENTICATED does so
// over a REAL RTCPeerConnection/RTCDataChannel pair — two genuinely
// separate objects, signaling handed between them only as portable,
// JSON-round-tripped payloads (exactly as if copy/pasted between two
// browser tabs), never through any shared in-process registry the way
// peer/LocalPeerConnectionProvider.js's own tests get to rely on. The
// flagship (block 5) proves the whole chain the design doc asked for:
// Offer -> portable payload -> Answer -> portable payload -> DataChannel ->
// completely unmodified 0.2.49 mutual authentication -> proven
// PeerIdentity, on BOTH ends.
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

function makeDevice(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(label);
    return provider;
}

function waitForLocalSignal(connection, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('timed out waiting for localSignal (ICE gathering never completed)')), timeoutMs);
        connection.onLocalSignalReady((signal) => {
            clearTimeout(timeout);
            resolve(signal);
        });
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

// Simulates the "copy/paste, QR, or another deliberate out-of-band
// mechanism" the design doc asked for: a signaling payload never travels
// as a live object between these two providers, only as plain JSON text
// that has round-tripped through JSON.stringify/JSON.parse, exactly as if
// it had actually left the process.
function relay(signal) {
    return JSON.parse(JSON.stringify(signal.toJSON()));
}

async function runTests() {

// ---------------------------------------------------------------------
// 1. PeerConnectionOffer / PeerConnectionAnswer — pure data, validated
//    construction, expiry, round-trip. No RTCPeerConnection involved yet.
// ---------------------------------------------------------------------
{
    const now = new Date('2026-01-01T00:00:00Z');
    const offer = PeerConnectionOffer.create({ sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n', iceCandidates: [{ candidate: 'x' }], ttlMs: 60000, now });
    assert(typeof offer.connectionId === 'string' && offer.connectionId.length > 0, 'create() mints a connectionId');
    assert(offer.sdp.startsWith('v=0'), 'carries the sdp');
    assert(offer.iceCandidates.length === 1, 'carries ice candidates');
    assert(!offer.isExpired(new Date(now.getTime() + 1000)), 'not yet expired well within its ttl');
    assert(offer.isExpired(new Date(now.getTime() + 61000)), 'expired once past its own expiresAt');

    const roundTripped = PeerConnectionOffer.fromJSON(offer.toJSON());
    assert(roundTripped.connectionId === offer.connectionId, 'offer round-trips through toJSON/fromJSON');
    assert(roundTripped.sdp === offer.sdp, 'round-trips sdp');

    const answer = PeerConnectionAnswer.create({ connectionId: offer.connectionId, sdp: 'v=0\r\no=- 2 1 IN IP4 127.0.0.1\r\n', now });
    assert(answer.connectionId === offer.connectionId, "an answer's connectionId echoes the offer's, never minting its own");

    let threw = false;
    try {
        PeerConnectionOffer.fromJSON({ connectionId: 'x', sdp: 'v=0', createdAt: now.toISOString(), expiresAt: now.toISOString() });
    } catch (e) {
        threw = e.message.includes('expiresAt must be after createdAt');
    }
    assert(threw, 'an offer whose expiresAt does not follow createdAt is rejected');
    console.log('✓ PeerConnectionOffer/PeerConnectionAnswer: validated pure data, round-trip, expiry is real');
}

// ---------------------------------------------------------------------
// 2. A real WebRTC DataChannel opens between two independent providers,
//    signaling relayed only as portable JSON — no shared registry.
// ---------------------------------------------------------------------
{
    const aliceTransport = new WebRtcPeerConnectionProvider();
    const bobTransport = new WebRtcPeerConnectionProvider();

    const aliceConnection = aliceTransport.createOffer();
    assert(aliceConnection.role === 'offerer', 'createOffer() produces the offerer role');
    assert(aliceConnection.transportState === PeerConnectionState.CONNECTING, 'a brand-new WebRTC connection starts CONNECTING, never instantly CONNECTED');

    const offer = await waitForLocalSignal(aliceConnection);
    assert(offer instanceof PeerConnectionOffer, "the offerer's localSignal is a PeerConnectionOffer");

    const bobConnection = bobTransport.connect(JSON.stringify(relay(offer)));
    assert(bobConnection.role === 'answerer', 'connect() against a serialized offer produces the answerer role');
    assert(bobConnection.connectionId === aliceConnection.connectionId, "both sides land on the SAME connectionId — the offer's own nonce, never independently generated");

    const answer = await waitForLocalSignal(bobConnection);
    assert(answer instanceof PeerConnectionAnswer, "the answerer's localSignal is a PeerConnectionAnswer");
    assert(answer.connectionId === offer.connectionId, "the answer echoes the offer's connectionId");

    await aliceConnection.acceptRemoteAnswer(relay(answer));

    await Promise.all([
        waitForState(aliceConnection, [PeerConnectionState.CONNECTED]),
        waitForState(bobConnection, [PeerConnectionState.CONNECTED])
    ]);

    let received = null;
    bobConnection.onMessage((message) => { received = message; });
    aliceConnection.send({ hello: 'world' });
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert(received && received.hello === 'world', 'a message sent over the real DataChannel actually arrives on the other real connection');

    aliceConnection.close();
    await waitForState(bobConnection, [PeerConnectionState.CLOSED]);
    assert(bobConnection.transportState === PeerConnectionState.CLOSED, "closing one real connection propagates to the other's transportState too — a real network fact, not an instant mirrored one");

    aliceTransport.dispose();
    bobTransport.dispose();
    console.log('✓ a real RTCPeerConnection/RTCDataChannel pair opens from nothing but relayed, portable JSON signaling payloads, carries a real message, and close() propagates');
}

// ---------------------------------------------------------------------
// 3. An expired offer is refused before any RTCPeerConnection work begins
// ---------------------------------------------------------------------
{
    const now = new Date('2026-01-01T00:00:00Z');
    const staleOffer = PeerConnectionOffer.create({ sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n', ttlMs: 1000, now });
    const bobTransport = new WebRtcPeerConnectionProvider();

    let threw = false;
    try {
        // connect() checks expiry against the real clock, and the offer
        // above already expired relative to `now` above (long past).
        bobTransport.connect(JSON.stringify(staleOffer.toJSON()));
    } catch (e) {
        threw = e.message.includes('expired');
    }
    assert(threw, 'a stale/replayed offer is rejected outright by connect(), before any signaling exchange is attempted');
    bobTransport.dispose();
    console.log('✓ an expired PeerConnectionOffer is rejected by connect() before any RTCPeerConnection work begins');
}

// ---------------------------------------------------------------------
// 4. A mismatched or forged answer is rejected — possessing an answer
//    payload proves nothing by itself.
// ---------------------------------------------------------------------
{
    const aliceTransport = new WebRtcPeerConnectionProvider();
    const aliceConnection = aliceTransport.createOffer();
    await waitForLocalSignal(aliceConnection);

    const forgedAnswer = PeerConnectionAnswer.create({ connectionId: 'not-this-connection', sdp: 'v=0\r\no=- 9 1 IN IP4 127.0.0.1\r\n' });
    let threw = false;
    try {
        await aliceConnection.acceptRemoteAnswer(forgedAnswer.toJSON());
    } catch (e) {
        threw = e.message.includes('connectionId does not match');
    }
    assert(threw, "an answer for a DIFFERENT connectionId is rejected, never silently applied to this one");
    assert(aliceConnection.transportState === PeerConnectionState.CONNECTING, 'the connection is left exactly as it was — still CONNECTING, not corrupted into some half-applied state');

    aliceConnection.close();
    aliceTransport.dispose();
    console.log('✓ acceptRemoteAnswer() rejects an answer whose connectionId does not match this connection');
}

// ---------------------------------------------------------------------
// 5. FLAGSHIP — Offer -> portable payload -> Answer -> portable payload ->
//    real DataChannel -> completely unmodified 0.2.49 mutual
//    authentication -> proven PeerIdentity, on BOTH ends. Discovery is
//    0.2.50's OWN PeerInvitation/LocalPeerDiscoveryProvider, completely
//    unmodified — the offer travels as the invitation's own `endpoint`.
// ---------------------------------------------------------------------
let flagshipCleanup;
{
    const alice = makeDevice('Alice');
    const bob = makeDevice('Bob');
    const aliceSigning = alice.getSigningIdentity();
    const bobSigning = bob.getSigningIdentity();

    const aliceTransport = new WebRtcPeerConnectionProvider();
    const bobTransport = new WebRtcPeerConnectionProvider();

    const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
    const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });

    // Alice opens a WebRTC offer and attaches it to 0.2.49 authentication
    // + the registry immediately — before Bob has even seen it, let alone
    // answered it. Authentication does not actually START until the
    // connection reaches CONNECTED; see application/ConnectToPeerUseCase.js.
    const aliceConnection = aliceTransport.createOffer();
    const aliceConnectedPeer = aliceConnect.attach(aliceConnection);
    const offer = await waitForLocalSignal(aliceConnection);

    // The offer becomes a completely ordinary 0.2.50 PeerInvitation's
    // endpoint — discovery itself never changes shape or knows a real
    // transport is involved.
    const aliceDiscovery = new DiscoverPeersUseCase(new LocalPeerDiscoveryProvider());
    const invitation = aliceDiscovery.createInvitation({ endpoint: JSON.stringify(relay(offer)), identityProvider: alice, ttlMs: 60000 });
    assert(invitation.identityHint === aliceSigning.id, "the invitation's identityHint is alice's own id, as an untrusted courtesy hint — unchanged from 0.2.50");

    const bobDiscovery = new DiscoverPeersUseCase(new LocalPeerDiscoveryProvider());
    const record = bobDiscovery.importInvitation(invitation);

    // Bob connects through the UNMODIFIED ConnectToPeerUseCase.connect()
    // path — this is exactly the 0.2.50 call, now driving a real
    // transport instead of an in-process one.
    const bobConnectedPeer = bobConnect.connect(record);
    assert(bobConnectedPeer.remoteIdentity === null, 'no identity is known yet — only signaling has happened so far');

    const answer = await waitForLocalSignal(bobConnectedPeer.connection);
    await aliceConnection.acceptRemoteAnswer(relay(answer));

    await Promise.all([
        waitForState(aliceConnectedPeer, [PeerLifecycleState.AUTHENTICATED]),
        waitForState(bobConnectedPeer, [PeerLifecycleState.AUTHENTICATED])
    ]);

    assert(bobConnectedPeer.remoteIdentity && bobConnectedPeer.remoteIdentity.identityId === aliceSigning.id,
        "bob's ConnectedPeer records alice's REAL, proven identity over a REAL WebRTC channel");
    assert(aliceConnectedPeer.remoteIdentity && aliceConnectedPeer.remoteIdentity.identityId === bobSigning.id,
        "alice's own side independently proves bob's identity too — the handshake is mutual, unchanged from 0.2.49");
    console.log('✓ FLAGSHIP: WebRTC offer -> portable payload -> answer -> portable payload -> real DataChannel -> unmodified 0.2.49 mutual authentication -> proven PeerIdentity, both directions');

    flagshipCleanup = { alice, bob, aliceTransport, bobTransport, aliceConnect, bobConnect, bobDiscovery, aliceConnectedPeer, bobConnectedPeer, aliceSigning, bobSigning, invitation };
}

// ---------------------------------------------------------------------
// 6. Closing the real connection removes the peer from BOTH registries
// ---------------------------------------------------------------------
{
    const { aliceConnect, bobConnect, aliceConnectedPeer, bobConnectedPeer } = flagshipCleanup;
    assert(bobConnect.registry.list().some((p) => p.connectionId === bobConnectedPeer.connectionId), 'setup: still present before closing');

    bobConnectedPeer.close();

    await Promise.all([
        waitForState(aliceConnectedPeer, [PeerLifecycleState.CLOSED]),
        waitForState(bobConnectedPeer, [PeerLifecycleState.CLOSED])
    ]);

    assert(!bobConnect.registry.list().some((p) => p.connectionId === bobConnectedPeer.connectionId), "closing removes bob's own entry");
    assert(!aliceConnect.registry.list().some((p) => p.connectionId === aliceConnectedPeer.connectionId), "closing removes alice's entry too — a real network close, not merely an in-process one");
    console.log('✓ closing a real WebRTC connection removes the peer from both sides\' registries');
}

// ---------------------------------------------------------------------
// 7. Reconnect -> a fresh WebRTC connection, fresh connectionId, fresh
//    0.2.49 authentication from nothing, nothing carried over.
// ---------------------------------------------------------------------
{
    const { alice, bob, aliceTransport, bobTransport, aliceConnect, bobConnect, aliceSigning } = flagshipCleanup;

    const newAliceConnection = aliceTransport.createOffer();
    const newAliceConnectedPeer = aliceConnect.attach(newAliceConnection);
    const offer = await waitForLocalSignal(newAliceConnection);

    const newBobConnectedPeer = bobConnect.connect({ candidateEndpoint: JSON.stringify(relay(offer)) });
    const answer = await waitForLocalSignal(newBobConnectedPeer.connection);
    await newAliceConnection.acceptRemoteAnswer(relay(answer));

    await Promise.all([
        waitForState(newAliceConnectedPeer, [PeerLifecycleState.AUTHENTICATED]),
        waitForState(newBobConnectedPeer, [PeerLifecycleState.AUTHENTICATED])
    ]);

    assert(newBobConnectedPeer.remoteIdentity.identityId === aliceSigning.id, "it's genuinely alice again, proven again over a brand-new WebRTC connection");
    assert(newBobConnectedPeer.alias === null, 'a brand-new ConnectedPeer carries no alias from any prior connection');

    newBobConnectedPeer.close();
    await new Promise((resolve) => setTimeout(resolve, 300));

    aliceTransport.dispose();
    bobTransport.dispose();
    console.log('✓ reconnecting opens a brand-new WebRTC connection and re-authenticates from nothing');
}

console.log('\nAll WebRTC peer transport tests passed.');
}

await runTests();
