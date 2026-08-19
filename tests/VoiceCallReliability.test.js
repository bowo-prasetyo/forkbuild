import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { WebRtcPeerConnectionProvider } from '../peer/WebRtcPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { FriendRelationshipUseCase } from '../application/FriendRelationshipUseCase.js';
import { ChatUseCase } from '../application/ChatUseCase.js';
import { VoiceUseCase } from '../application/VoiceUseCase.js';
import { VoiceSessionState } from '../core/VoiceSessionState.js';
import { VoiceCallEndReason } from '../core/VoiceCallEndReason.js';

// 0.2.74 — Voice Call Reliability & Lifecycle.
//
// 0.2.73's own tests/AuthenticatedVoice.test.js proves the HAPPY PATH:
// INVITE -> RINGING -> ACCEPT -> renegotiation -> ACTIVE -> hang up. This
// file proves everything the design doc asked 0.2.74 to make explicit
// about every OTHER transition: a bounded ringing timeout distinct from an
// explicit REJECT, BUSY concurrency with a call already in progress, a
// local microphone failure that never looks like the peer rejecting, an
// SDP renegotiation failure that never looks like a dead connection (the
// underlying peer/PeerConnection.js and application/ChatUseCase.js both
// stay completely unaffected in every failure scenario below), and a
// disconnect that neither leaves a stale call behind nor resurrects one on
// reconnect. Every scenario runs over REAL RTCPeerConnection/RTCDataChannel
// pairs with REAL (synthetic) audio tracks, exactly like 0.2.73's own file.

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

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
    const getState = () => subject.getLifecycleState();
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

function waitForCallState(voiceUseCase, callId, targetStates, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const current = voiceUseCase.getActiveCall();
        if (current && current.callId === callId && targetStates.includes(current.state)) { resolve(current.state); return; }
        const timeout = setTimeout(() => {
            unsubscribe();
            reject(new Error(`timed out waiting for call state in [${targetStates.join(', ')}]`));
        }, timeoutMs);
        const unsubscribe = voiceUseCase.onCallStateChanged((cid, state) => {
            if (cid === callId && targetStates.includes(state)) {
                clearTimeout(timeout);
                unsubscribe();
                resolve(state);
            }
        });
    });
}

// Resolves with the `VoiceCallEndReason` this device's OWN call ended
// with — see core/VoiceCallEndReason.js's own header on why this is
// always a LOCAL judgment, never something read off the wire.
function waitForCallEnded(voiceUseCase, callId, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            unsubscribe();
            reject(new Error('timed out waiting for the call to end'));
        }, timeoutMs);
        const unsubscribe = voiceUseCase.onCallStateChanged((cid, state, info) => {
            if (cid === callId && state === VoiceSessionState.ENDED) {
                clearTimeout(timeout);
                unsubscribe();
                resolve(info.reason);
            }
        });
    });
}

function waitForIncomingCall(voiceUseCase, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('timed out waiting for an incoming call')), timeoutMs);
        const unsubscribe = voiceUseCase.onIncomingCall((peerIdentityId, callId) => {
            clearTimeout(timeout);
            unsubscribe();
            resolve({ peerIdentityId, callId });
        });
    });
}

// A REAL, synthesized audio MediaStreamTrack — see
// tests/AuthenticatedVoice.test.js's own header on why this, and not a
// mock, is what "real" means for voice in this codebase.
class SyntheticAudioTrackProvider {
    constructor(frequency = 440) {
        this._frequency = frequency;
        this.callCount = 0;
        this._cleanups = new Map();
    }
    async getLocalAudioTrack() {
        this.callCount++;
        const AudioContextImpl = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContextImpl();
        const oscillator = ctx.createOscillator();
        oscillator.frequency.value = this._frequency;
        const destination = ctx.createMediaStreamDestination();
        oscillator.connect(destination);
        oscillator.start();
        const [track] = destination.stream.getAudioTracks();
        this._cleanups.set(track, () => { try { oscillator.stop(); } catch { /* already stopped */ } ctx.close(); });
        return track;
    }
    releaseTrack(track) {
        const cleanup = track && this._cleanups.get(track);
        if (cleanup) {
            cleanup();
            this._cleanups.delete(track);
        } else if (track) {
            track.stop();
        }
    }
}

// application/LocalAudioTrackProvider.js's own header documents exactly
// this failure mode — "no microphone access ... Throws (never silently
// returns null)" — a permission-denied/no-hardware environment. Never a
// mock of WebRTC itself, only of the ONE boundary 0.2.73 already
// deliberately isolated for this exact purpose.
class FailingAudioTrackProvider {
    constructor(message = 'Permission denied') {
        this.callCount = 0;
        this._message = message;
    }
    async getLocalAudioTrack() {
        this.callCount++;
        throw new Error(this._message);
    }
    releaseTrack() { /* never acquired anything to release */ }
}

function makeDevice(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(label);
    return provider;
}

async function connectPair(aliceIdentityProvider, bobIdentityProvider) {
    const aliceTransport = new WebRtcPeerConnectionProvider();
    const bobTransport = new WebRtcPeerConnectionProvider();
    const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: aliceIdentityProvider });
    const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bobIdentityProvider });

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

    return { aliceTransport, bobTransport, aliceConnect, bobConnect, aliceConnectedPeer, bobConnectedPeer };
}

// 0.2.74 — reconnects the SAME two devices over a BRAND NEW transport,
// but through the SAME already-injected `aliceConnect`/`bobConnect`
// (and therefore the same application/ConnectedPeerRegistry.js) as an
// earlier connectPair() — exactly what a real reconnect after a dropped
// connection looks like, and the ONLY way to prove a pre-existing
// application/VoiceUseCase.js (already subscribed to that SAME registry's
// onChange()) picks up the new connection on its own rather than needing
// to be told about it.
async function reconnectPair(aliceConnect, bobConnect) {
    const aliceTransport = new WebRtcPeerConnectionProvider();
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
    return { aliceConnectedPeer, bobConnectedPeer };
}

async function becomeFriends(aliceFriends, aliceConnectedPeer, bobFriends, bobConnectedPeer) {
    aliceFriends.sendFriendRequest(aliceConnectedPeer);
    await wait(50);
    bobFriends.acceptFriendRequest(bobConnectedPeer);
    await wait(50);
}

function makeFriendUseCase(identityProvider, registry) {
    return new FriendRelationshipUseCase(new InMemoryStorageProvider(), identityProvider, {
        peerMessageBus: new PeerMessageBus(),
        connectedPeerRegistry: registry
    });
}

function makeChatUseCase(identityProvider, registry, friends) {
    return new ChatUseCase(identityProvider, {
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: registry, friendRelationshipUseCase: friends
    });
}

// A fully-wired Alice/Bob pair — connected, friended, each with their own
// VoiceUseCase (short `ringingTimeoutMs` by default so nothing in this
// file waits 45 real seconds) and ChatUseCase riding the SAME registry.
async function makePairSuite(labelPrefix, { ringingTimeoutMs = 300, aliceAudio = new SyntheticAudioTrackProvider(440), bobAudio = new SyntheticAudioTrackProvider(880) } = {}) {
    const alice = makeDevice(`Alice-${labelPrefix}`);
    const bob = makeDevice(`Bob-${labelPrefix}`);
    const { aliceConnect, bobConnect, aliceConnectedPeer, bobConnectedPeer } = await connectPair(alice, bob);

    const aliceFriends = makeFriendUseCase(alice, aliceConnect.registry);
    const bobFriends = makeFriendUseCase(bob, bobConnect.registry);
    await becomeFriends(aliceFriends, aliceConnectedPeer, bobFriends, bobConnectedPeer);

    const aliceChat = makeChatUseCase(alice, aliceConnect.registry, aliceFriends);
    const bobChat = makeChatUseCase(bob, bobConnect.registry, bobFriends);

    const aliceVoice = new VoiceUseCase(alice, {
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: aliceConnect.registry,
        friendRelationshipUseCase: aliceFriends, localAudioTrackProvider: aliceAudio, ringingTimeoutMs
    });
    const bobVoice = new VoiceUseCase(bob, {
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: bobConnect.registry,
        friendRelationshipUseCase: bobFriends, localAudioTrackProvider: bobAudio, ringingTimeoutMs
    });

    return { alice, bob, aliceConnect, bobConnect, aliceConnectedPeer, bobConnectedPeer, aliceFriends, bobFriends, aliceChat, bobChat, aliceVoice, bobVoice, aliceAudio, bobAudio };
}

async function runTests() {

// ---------------------------------------------------------------------
// 1. core/VoiceCallEndReason.js — a closed, ten-value vocabulary, never
//    serialized onto the wire (structural only).
// ---------------------------------------------------------------------
{
    const values = Object.values(VoiceCallEndReason);
    assert(values.length === 10, 'exactly ten reasons');
    for (const v of ['REJECTED', 'BUSY', 'TIMEOUT', 'MEDIA_FAILED', 'NEGOTIATION_FAILED', 'PEER_DISCONNECTED', 'BLOCKED', 'UNFRIENDED', 'LOCAL_HANGUP', 'REMOTE_HANGUP']) {
        assert(values.includes(v), `includes ${v}`);
    }
    assert(Object.isFrozen(VoiceCallEndReason), 'the vocabulary is frozen');
    console.log('✓ core/VoiceCallEndReason.js: closed, frozen, ten-value vocabulary');
}

// ---------------------------------------------------------------------
// 2. RINGING TIMEOUT — Bob never answers; Alice's own local ringing
//    timer (never the network) ends the call as TIMEOUT, distinct from
//    an explicit REJECT, and neither side ever touches a microphone.
//    The underlying peer connection survives completely untouched.
// ---------------------------------------------------------------------
{
    const { aliceConnectedPeer, bobConnectedPeer, aliceVoice, bobVoice, aliceAudio, bobAudio } = await makePairSuite('Timeout', { ringingTimeoutMs: 300 });

    const incoming = waitForIncomingCall(bobVoice);
    const callId = aliceVoice.startCall(aliceConnectedPeer);
    assert(aliceVoice.getActiveCall().state === VoiceSessionState.CALLING, "alice's call starts CALLING");
    // Armed immediately, BEFORE awaiting anything else — alice's own
    // ringing timer is already running the instant startCall() returns
    // (see application/VoiceUseCase.js#_createCallRecord()), so this MUST
    // subscribe before any other await gives it a chance to fire unheard.
    const aliceEndedPromise = waitForCallEnded(aliceVoice, callId, 5000);
    const { callId: bobCallId } = await incoming;
    assert(bobCallId === callId, "bob's own incoming call carries alice's exact callId");
    assert(bobVoice.getActiveCall().state === VoiceSessionState.RINGING, "bob's call is RINGING");
    // Likewise armed immediately, before Bob deliberately never calls
    // acceptCall()/rejectCall() — his own app is simply left open,
    // unanswered — and before alice's own (earlier-armed) timer's
    // best-effort END notification has any chance to reach him first.
    const bobEndedPromise = waitForCallEnded(bobVoice, callId, 5000);

    const aliceReason = await aliceEndedPromise;
    assert(aliceReason === VoiceCallEndReason.TIMEOUT, `alice's own call ends with TIMEOUT (her own local timer), got ${aliceReason}`);

    await bobEndedPromise;
    await wait(50);

    assert(aliceVoice.getActiveCall() === null, "alice's call is fully cleared");
    assert(bobVoice.getActiveCall() === null, "bob's call is fully cleared");
    assert(aliceAudio.callCount === 0, 'a timed-out call never touches the CALLER\'s own microphone');
    assert(bobAudio.callCount === 0, 'a timed-out call never touches the CALLEE\'s own microphone either — nobody ever accepted');
    assert(aliceConnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, "a ringing timeout never touches the underlying peer connection — still AUTHENTICATED");
    assert(bobConnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'true on both sides');
    console.log('✓ RINGING TIMEOUT: an unanswered call ends itself locally as TIMEOUT (never REJECTED), touches no microphone, and leaves the peer connection completely untouched');
}

// ---------------------------------------------------------------------
// 3. BUSY CONCURRENCY — a device already in a call refuses a second one
//    in BOTH directions (placing one itself, and receiving one), and
//    the call already in progress is left completely untouched either
//    way. This is exactly the "one device, at most one VoiceSession"
//    invariant the design doc asked for a dedicated test on.
// ---------------------------------------------------------------------
{
    const { aliceConnect, bobConnect, aliceConnectedPeer, aliceFriends, bobFriends, aliceVoice, bobVoice, bobConnectedPeer } = await makePairSuite('Busy');

    // Get Alice and Bob into a genuine ACTIVE call first.
    const incoming = waitForIncomingCall(bobVoice);
    const callId = aliceVoice.startCall(aliceConnectedPeer);
    const { callId: bobCallId } = await incoming;
    await bobVoice.acceptCall(bobCallId);
    await Promise.all([
        waitForCallState(aliceVoice, callId, [VoiceSessionState.ACTIVE]),
        waitForCallState(bobVoice, callId, [VoiceSessionState.ACTIVE])
    ]);

    // Charlie is friends with BOTH Alice and Bob, each over its own
    // SEPARATE connection reusing `aliceConnect`/`bobConnect` (and
    // therefore the SAME registries `aliceVoice`/`bobVoice` are already
    // subscribed to) — exactly the real "a second friend is in the
    // picture while I'm on a call" scenario, not a fabricated one.
    const charlie = makeDevice('Charlie-Busy');
    const charlieToAliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: new WebRtcPeerConnectionProvider(), identityProvider: charlie });
    const { aliceConnectedPeer: aliceToCharlie, bobConnectedPeer: charlieToAlice } = await reconnectPair(aliceConnect, charlieToAliceConnect);
    const charlieToBobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: new WebRtcPeerConnectionProvider(), identityProvider: charlie, registry: charlieToAliceConnect.registry });
    const { aliceConnectedPeer: bobToCharlie, bobConnectedPeer: charlieToBob } = await reconnectPair(bobConnect, charlieToBobConnect);
    const charlieFriends = makeFriendUseCase(charlie, charlieToAliceConnect.registry);
    await becomeFriends(aliceFriends, aliceToCharlie, charlieFriends, charlieToAlice);
    await becomeFriends(bobFriends, bobToCharlie, charlieFriends, charlieToBob);
    const charlieVoice = new VoiceUseCase(charlie, {
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: charlieToAliceConnect.registry, friendRelationshipUseCase: charlieFriends
    });

    // Charlie's own startCall() succeeds — HE is not busy, so nothing on
    // his own side refuses it; ALICE's own `_handleInvite()` is what
    // answers BUSY, since SHE is the one already occupied.
    const charlieCallId = charlieVoice.startCall(charlieToAlice);
    const charlieReason = await waitForCallEnded(charlieVoice, charlieCallId, 5000);
    assert(charlieReason === VoiceCallEndReason.BUSY, `charlie's own call to a busy Alice ends with BUSY, got ${charlieReason}`);
    assert(charlieVoice.getActiveCall() === null, "charlie's call record is cleared after BUSY");

    assert(aliceVoice.getActiveCall() && aliceVoice.getActiveCall().callId === callId && aliceVoice.getActiveCall().state === VoiceSessionState.ACTIVE,
        "alice's ORIGINAL call with bob is completely untouched by charlie's refused call attempt");
    assert(bobVoice.getActiveCall() && bobVoice.getActiveCall().callId === callId && bobVoice.getActiveCall().state === VoiceSessionState.ACTIVE,
        "bob's own side of the original call is untouched too");

    // The reverse direction: BOB is the one already in a call (with
    // Alice) and tries to place a SECOND, outgoing call to Charlie —
    // refused locally, before any wire message is even sent, per
    // `_requireIdle()`.
    let threw = false;
    try { bobVoice.startCall(bobToCharlie); } catch (e) { threw = e.message.includes('already in a call'); }
    assert(threw, "a device already in a call refuses to PLACE a second one, before ever sending an INVITE");
    assert(aliceVoice.getActiveCall().state === VoiceSessionState.ACTIVE, "alice/bob's call survives bob's own refused second-call attempt too");
    assert(bobVoice.getActiveCall().state === VoiceSessionState.ACTIVE, 'true on both sides');

    assert(aliceConnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'the original connection is untouched throughout');
    assert(bobConnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'true on both sides');
    console.log('✓ BUSY CONCURRENCY: a device already in a call refuses a second one in BOTH directions (placing one itself, or receiving one), and the call already in progress is left completely untouched either way');
}

// ---------------------------------------------------------------------
// 4. MEDIA FAILURE — Bob's own microphone access fails (permission
//    denied) the moment he accepts. This is never confused with Alice
//    rejecting the call: Bob's own side reports MEDIA_FAILED, Alice's
//    side learns only that the call ended (REMOTE_HANGUP — see core/
//    VoiceCallEndReason.js's own header on why she never learns WHY).
//    The underlying peer connection AND chat both survive completely.
// ---------------------------------------------------------------------
{
    const bobAudio = new FailingAudioTrackProvider('NotAllowedError: Permission denied');
    const { alice, bob, aliceConnectedPeer, bobConnectedPeer, aliceVoice, bobVoice, aliceChat, bobChat } = await makePairSuite('MediaFail', { bobAudio });

    const incoming = waitForIncomingCall(bobVoice);
    const callId = aliceVoice.startCall(aliceConnectedPeer);
    const { callId: bobCallId } = await incoming;

    // Subscribed BEFORE acceptCall() runs — its own failure path
    // publishes ENDED synchronously inside the rejected promise's catch,
    // before acceptCall()'s rejection ever reaches this test.
    const bobEnded = waitForCallEnded(bobVoice, callId, 5000);
    const aliceEnded = waitForCallEnded(aliceVoice, callId, 5000);

    let threw = false;
    try {
        await bobVoice.acceptCall(bobCallId);
    } catch (e) {
        threw = true;
    }
    assert(threw, "acceptCall() itself rejects when the local microphone is unavailable");
    assert(bobAudio.callCount === 1, "bob's own acceptCall() genuinely tried to acquire a microphone exactly once");

    const bobReason = await bobEnded;
    assert(bobReason === VoiceCallEndReason.MEDIA_FAILED, `bob's own call ends with MEDIA_FAILED — his own microphone, not alice's behavior — got ${bobReason}`);
    const aliceReason = await aliceEnded;
    assert(aliceReason === VoiceCallEndReason.REMOTE_HANGUP, `alice never learns bob's own local reason, only that the call ended — got ${aliceReason}`);

    assert(aliceVoice.getActiveCall() === null, "alice's call is cleared");
    assert(bobVoice.getActiveCall() === null, "bob's call is cleared");
    assert(aliceConnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, "a local microphone failure never touches the underlying peer connection");
    assert(bobConnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'true on both sides');

    // Proves the DataChannel/application/ChatUseCase.js itself was never
    // affected by the failed voice negotiation — the SAME already-
    // authenticated connection still carries chat perfectly normally
    // afterward.
    const bobId = bob.getSigningIdentity().id;
    const aliceId = alice.getSigningIdentity().id;
    aliceChat.sendOrQueue(bobId, 'still here after the failed call');
    await wait(200);
    const bobConversation = bobChat.getConversation(aliceId);
    assert(bobConversation.some((m) => m.body === 'still here after the failed call'), 'chat still delivers over the same connection right after a voice media failure');
    console.log('✓ MEDIA FAILURE: a local microphone failure reports MEDIA_FAILED on the failing side and REMOTE_HANGUP (never a fabricated reason) on the other, leaves the peer connection AUTHENTICATED, and chat keeps working');
}

// ---------------------------------------------------------------------
// 5. NEGOTIATION FAILURE — the SDP renegotiation itself fails (never the
//    local microphone) AFTER both sides already committed to the call.
//    peer/WebRtcPeerConnection.js#role fixes WHICHEVER side ever calls
//    renegotiate() forever, at the original DataChannel handshake,
//    completely independent of who places THIS particular voice call —
//    see application/VoiceUseCase.js's own header, "No Glare, By
//    Construction." connectPair() always makes Alice's own connection
//    the offerer, so her own renegotiate() is what this test breaks.
// ---------------------------------------------------------------------
{
    const { alice, bob, aliceConnectedPeer, bobConnectedPeer, aliceVoice, bobVoice, aliceChat, bobChat } = await makePairSuite('NegotiationFail');

    assert(aliceConnectedPeer.connection.role === 'offerer', 'setup: alice is the DataChannel offerer, per connectPair()');
    const originalRenegotiate = aliceConnectedPeer.connection.renegotiate.bind(aliceConnectedPeer.connection);
    aliceConnectedPeer.connection.renegotiate = () => Promise.reject(new Error('synthetic SDP renegotiation failure'));

    const incoming = waitForIncomingCall(bobVoice);
    const callId = aliceVoice.startCall(aliceConnectedPeer);
    const { callId: bobCallId } = await incoming;

    const aliceEnded = waitForCallEnded(aliceVoice, callId, 5000);
    const bobEnded = waitForCallEnded(bobVoice, callId, 5000);

    // Bob's own acceptCall() succeeds — HIS OWN media negotiation (just
    // acquiring and attaching his own track, since he is the answerer)
    // never touches renegotiate() at all; only ALICE's own
    // `_handleAccept()` reaction to his ACCEPT does, and that is where
    // the synthetic failure above actually bites.
    await bobVoice.acceptCall(bobCallId);

    const aliceReason = await aliceEnded;
    assert(aliceReason === VoiceCallEndReason.NEGOTIATION_FAILED, `alice's own renegotiate() failure reports NEGOTIATION_FAILED, got ${aliceReason}`);
    const bobReason = await bobEnded;
    assert(bobReason === VoiceCallEndReason.REMOTE_HANGUP, `bob never learns alice's own local reason, only that the call ended — got ${bobReason}`);

    assert(aliceVoice.getActiveCall() === null, "alice's call is cleared");
    assert(bobVoice.getActiveCall() === null, "bob's call is cleared");
    assert(aliceConnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, "an SDP renegotiation failure never touches the underlying peer connection — never confused with a peer/connection failure");
    assert(bobConnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'true on both sides');

    aliceConnectedPeer.connection.renegotiate = originalRenegotiate;
    const bobId = bob.getSigningIdentity().id;
    const aliceId = alice.getSigningIdentity().id;
    bobChat.sendOrQueue(aliceId, 'the connection never noticed');
    await wait(200);
    assert(aliceChat.getConversation(bobId).some((m) => m.body === 'the connection never noticed'), 'chat still delivers over the same connection right after a voice negotiation failure');
    console.log('✓ NEGOTIATION FAILURE: a failed SDP renegotiation reports NEGOTIATION_FAILED on the failing side, REMOTE_HANGUP on the other, and the underlying peer connection — and chat riding it — stay completely unaffected');
}

// ---------------------------------------------------------------------
// 6. DISCONNECT CLEANUP & NO RESURRECTION — the underlying connection
//    dying mid-call ends the call as PEER_DISCONNECTED on both sides
//    (never a stale "call in progress"), and a FRESH reconnection
//    between the same two identities begins with VoiceSession IDLE —
//    never resurrecting the call that was in progress when the old
//    connection died — before working completely normally for a brand
//    new call.
// ---------------------------------------------------------------------
{
    const { aliceConnect, bobConnect, aliceConnectedPeer, bobConnectedPeer, aliceVoice, bobVoice } = await makePairSuite('Disconnect');

    const incoming = waitForIncomingCall(bobVoice);
    const callId = aliceVoice.startCall(aliceConnectedPeer);
    const { callId: bobCallId } = await incoming;
    await bobVoice.acceptCall(bobCallId);
    await Promise.all([
        waitForCallState(aliceVoice, callId, [VoiceSessionState.ACTIVE]),
        waitForCallState(bobVoice, callId, [VoiceSessionState.ACTIVE])
    ]);

    const aliceEnded = waitForCallEnded(aliceVoice, callId, 5000);
    const bobEnded = waitForCallEnded(bobVoice, callId, 5000);
    aliceConnectedPeer.close();
    await Promise.all([
        waitForState(aliceConnectedPeer, [PeerLifecycleState.CLOSED]),
        waitForState(bobConnectedPeer, [PeerLifecycleState.CLOSED])
    ]);

    assert(await aliceEnded === VoiceCallEndReason.PEER_DISCONNECTED, "alice's own call ends as PEER_DISCONNECTED — a CONSEQUENCE of the connection dying, never voice's own decision");
    assert(await bobEnded === VoiceCallEndReason.PEER_DISCONNECTED, 'true on both sides');
    assert(aliceVoice.getActiveCall() === null, "no stale call survives the disconnect on alice's side");
    assert(bobVoice.getActiveCall() === null, 'true on both sides');

    // A FRESH connection between the SAME two identities, reusing the
    // SAME already-subscribed aliceVoice/bobVoice — proves VoiceSession
    // begins IDLE, never resurrecting the call that was active when the
    // old connection died.
    const { aliceConnectedPeer: aliceConnectedPeer2, bobConnectedPeer: bobConnectedPeer2 } = await reconnectPair(aliceConnect, bobConnect);
    assert(aliceVoice.getActiveCall() === null, "a brand new connection begins with VoiceSession IDLE, before any new call is placed");
    assert(bobVoice.getActiveCall() === null, 'true on both sides');

    // And the whole pipeline still works completely normally afterward.
    const incoming2 = waitForIncomingCall(bobVoice);
    const callId2 = aliceVoice.startCall(aliceConnectedPeer2);
    const { callId: bobCallId2 } = await incoming2;
    await bobVoice.acceptCall(bobCallId2);
    await Promise.all([
        waitForCallState(aliceVoice, callId2, [VoiceSessionState.ACTIVE]),
        waitForCallState(bobVoice, callId2, [VoiceSessionState.ACTIVE])
    ]);
    assert(callId2 !== callId, 'the new call has a genuinely fresh callId, never reusing the dead one');
    // Subscribed BEFORE endCall() — endCall() tears down and publishes
    // ENDED fully synchronously (no network round trip needed for the
    // LOCAL hangup gesture itself), so waiting on it must be armed first,
    // exactly like every other end-of-call wait in this file.
    const secondCallEnded = Promise.all([
        waitForCallState(aliceVoice, callId2, [VoiceSessionState.ENDED]),
        waitForCallState(bobVoice, callId2, [VoiceSessionState.ENDED])
    ]);
    aliceVoice.endCall(callId2);
    await secondCallEnded;
    console.log('✓ DISCONNECT CLEANUP & NO RESURRECTION: a dying connection ends the call as PEER_DISCONNECTED on both sides with no stale survivor, and a fresh reconnection begins with VoiceSession IDLE and works normally for a brand new call');
}

console.log('\nAll Voice Call Reliability & Lifecycle tests passed.');
}

await runTests();
