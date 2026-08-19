import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { WebRtcPeerConnectionProvider } from '../peer/WebRtcPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { FriendRelationshipUseCase } from '../application/FriendRelationshipUseCase.js';
import { PeerBlockUseCase } from '../application/PeerBlockUseCase.js';
import { VoiceUseCase } from '../application/VoiceUseCase.js';
import { VoiceSessionState } from '../core/VoiceSessionState.js';
import {
    VoiceCallSignalType,
    toVoiceCallSignal,
    isValidVoiceCallSignal,
    MAX_VOICE_CALL_ID_LENGTH
} from '../core/VoiceCallSignal.js';
import {
    VoiceMediaSignalKind,
    toVoiceMediaSignal,
    isValidVoiceMediaSignal
} from '../core/VoiceMediaSignal.js';

// 0.2.73 — Authenticated Voice / Audio.
//
// "Voice is a media capability attached to an already-authenticated peer
// session, never a second, independent communication architecture." This
// file proves that end to end over REAL RTCPeerConnection/RTCDataChannel
// pairs (exactly like tests/WebRtcPeerTransport.test.js) with REAL
// (synthetic, oscillator-driven) audio tracks flowing over them — never a
// mock of WebRTC itself — plus the two security properties the design
// doc asked for: an expected-identity mismatch means a call is never even
// possible (0.2.73 inherits this for free from 0.2.62, no new enforcement
// code), and blocking a peer mid-call terminates that call immediately
// while leaving the underlying peer connection, friendship, and every
// other durable fact this codebase tracks completely untouched.

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

// A REAL audio MediaStreamTrack, synthesized from a silent-to-the-room
// Web Audio oscillator — genuinely flows over a real RTCPeerConnection
// exactly like a real microphone track would, without needing OS
// microphone permission or hardware in a headless browser. Injected as
// application/VoiceUseCase.js's own `localAudioTrackProvider`
// collaborator — see application/LocalAudioTrackProvider.js's own header
// on why that boundary exists.
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

function makeDevice(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(label);
    return provider;
}

// Real WebRTC offer/answer relayed only as portable JSON — see
// tests/WebRtcPeerTransport.test.js's own header for why this, and not
// any shared in-process registry, is what "real" means in this file too.
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

async function runTests() {

// ---------------------------------------------------------------------
// 1. core/VoiceCallSignal.js — structural validation of the call-
//    lifecycle wire vocabulary. No network involved.
// ---------------------------------------------------------------------
{
    const signal = toVoiceCallSignal({ callId: 'call-1', type: VoiceCallSignalType.INVITE, callerIdentity: 'alice', calleeIdentity: 'bob' });
    assert(isValidVoiceCallSignal(signal), 'a freshly-built INVITE validates');
    assert(signal.type === VoiceCallSignalType.INVITE, 'carries the requested type');
    assert(Number.isFinite(signal.sentAt), 'sentAt defaults to a finite timestamp');

    assert(!isValidVoiceCallSignal(null), 'null is invalid');
    assert(!isValidVoiceCallSignal({ ...signal, callId: '' }), 'empty callId is invalid');
    assert(!isValidVoiceCallSignal({ ...signal, type: 'RING' }), 'type is a closed vocabulary');
    assert(!isValidVoiceCallSignal({ ...signal, callerIdentity: '' }), 'empty callerIdentity is invalid');
    assert(!isValidVoiceCallSignal({ ...signal, calleeIdentity: '' }), 'empty calleeIdentity is invalid');
    assert(!isValidVoiceCallSignal({ ...signal, callId: 'x'.repeat(MAX_VOICE_CALL_ID_LENGTH + 1) }), 'callId beyond MAX_VOICE_CALL_ID_LENGTH is invalid');

    let threw = false;
    try { toVoiceCallSignal({ callId: 'call-1', type: 'BOGUS', callerIdentity: 'alice', calleeIdentity: 'bob' }); } catch { threw = true; }
    assert(threw, 'toVoiceCallSignal refuses an unrecognized type');
    console.log('✓ core/VoiceCallSignal.js: wire vocabulary is structurally validated and bounded');
}

// ---------------------------------------------------------------------
// 2. core/VoiceMediaSignal.js — structural validation of the SDP-
//    carrying wire vocabulary.
// ---------------------------------------------------------------------
{
    const signal = toVoiceMediaSignal({ callId: 'call-1', kind: VoiceMediaSignalKind.OFFER, sdp: 'v=0\r\n', senderIdentity: 'alice' });
    assert(isValidVoiceMediaSignal(signal), 'a freshly-built offer signal validates');
    assert(!isValidVoiceMediaSignal({ ...signal, kind: 'pranswer' }), 'kind is a closed vocabulary (offer/answer only)');
    assert(!isValidVoiceMediaSignal({ ...signal, sdp: '' }), 'empty sdp is invalid');
    assert(!isValidVoiceMediaSignal({ ...signal, senderIdentity: '' }), 'empty senderIdentity is invalid');

    let threw = false;
    try { toVoiceMediaSignal({ callId: 'call-1', kind: 'garbage', sdp: 'v=0', senderIdentity: 'alice' }); } catch { threw = true; }
    assert(threw, 'toVoiceMediaSignal refuses an unrecognized kind');
    console.log('✓ core/VoiceMediaSignal.js: wire vocabulary is structurally validated');
}

// ---------------------------------------------------------------------
// 3. core/VoiceSessionState.js — a closed, six-value vocabulary.
// ---------------------------------------------------------------------
{
    const values = Object.values(VoiceSessionState);
    assert(values.length === 6, 'exactly six states');
    for (const v of ['IDLE', 'CALLING', 'RINGING', 'CONNECTING', 'ACTIVE', 'ENDED']) {
        assert(values.includes(v), `includes ${v}`);
    }
    console.log('✓ core/VoiceSessionState.js: closed vocabulary');
}

// ---------------------------------------------------------------------
// 4. FLAGSHIP — a real WebRTC data-channel connection, real 0.2.49
//    mutual authentication, real mutual friendship, then a full voice
//    call: INVITE -> RINGING -> ACCEPT -> in-band SDP renegotiation
//    over the SAME RTCPeerConnection -> a REAL remote audio track
//    arrives on BOTH sides -> hang up -> both back to IDLE -> the
//    underlying peer connection is untouched throughout (still
//    AUTHENTICATED after the call ends).
// ---------------------------------------------------------------------
let flagshipCleanup;
{
    const alice = makeDevice('Alice-Voice');
    const bob = makeDevice('Bob-Voice');
    const { aliceConnect, bobConnect, aliceConnectedPeer, bobConnectedPeer } = await connectPair(alice, bob);

    const aliceFriends = makeFriendUseCase(alice, aliceConnect.registry);
    const bobFriends = makeFriendUseCase(bob, bobConnect.registry);
    await becomeFriends(aliceFriends, aliceConnectedPeer, bobFriends, bobConnectedPeer);

    const aliceAudio = new SyntheticAudioTrackProvider(440);
    const bobAudio = new SyntheticAudioTrackProvider(880);
    const aliceVoice = new VoiceUseCase(alice, {
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: aliceConnect.registry,
        friendRelationshipUseCase: aliceFriends, localAudioTrackProvider: aliceAudio
    });
    const bobVoice = new VoiceUseCase(bob, {
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: bobConnect.registry,
        friendRelationshipUseCase: bobFriends, localAudioTrackProvider: bobAudio
    });

    assert(aliceVoice.supportsVoice(aliceConnectedPeer), 'a real WebRtcPeerConnection reports voice-capable');
    assert(aliceVoice.canCall(bob.getSigningIdentity().id), 'friends are eligible to call');
    assert(aliceVoice.getActiveCall() === null, 'no call is active before anything happens');

    const incoming = waitForIncomingCall(bobVoice);
    const callId = aliceVoice.startCall(aliceConnectedPeer);
    assert(aliceVoice.getActiveCall().state === VoiceSessionState.CALLING, "alice's own call is immediately CALLING");

    const { peerIdentityId: ringingFrom, callId: bobCallId } = await incoming;
    assert(bobCallId === callId, "bob's own incoming call carries alice's exact callId");
    assert(ringingFrom === alice.getSigningIdentity().id, "bob's incoming call correctly names alice as the caller");
    assert(bobVoice.getActiveCall().state === VoiceSessionState.RINGING, "bob's own call is RINGING");
    assert(aliceAudio.callCount === 0, 'alice has NOT touched the microphone merely by placing the call — only once accepted');
    assert(bobAudio.callCount === 0, 'bob has NOT touched the microphone merely by ringing — only once he accepts');

    await bobVoice.acceptCall(callId);
    assert(bobAudio.callCount === 1, "accepting requests bob's own local audio track exactly once");

    await Promise.all([
        waitForCallState(aliceVoice, callId, [VoiceSessionState.ACTIVE]),
        waitForCallState(bobVoice, callId, [VoiceSessionState.ACTIVE])
    ]);
    assert(aliceAudio.callCount === 1, "alice's own local audio track was requested exactly once, at negotiation time");

    const aliceRemoteStream = aliceVoice.getRemoteStream(callId);
    const bobRemoteStream = bobVoice.getRemoteStream(callId);
    assert(aliceRemoteStream && aliceRemoteStream.getAudioTracks().length === 1, "alice receives BOB's real remote audio track");
    assert(bobRemoteStream && bobRemoteStream.getAudioTracks().length === 1, "bob receives ALICE's real remote audio track");
    assert(aliceRemoteStream.getAudioTracks()[0].kind === 'audio', "the remote track is genuinely an audio track");
    assert(aliceRemoteStream.getAudioTracks()[0].readyState === 'live', "the remote track is live, not ended");

    assert(!aliceVoice.isMuted(), 'a fresh call starts unmuted');
    aliceVoice.setMuted(true);
    assert(aliceVoice.isMuted(), 'setMuted(true) mutes locally');
    assert(bobVoice.isMuted() === false, "muting alice's own outgoing audio never affects bob's own local mute state — purely local, never transmitted");
    aliceVoice.setMuted(false);

    aliceVoice.endCall(callId);
    await Promise.all([
        waitForCallState(aliceVoice, callId, [VoiceSessionState.ENDED]),
        waitForCallState(bobVoice, callId, [VoiceSessionState.ENDED])
    ]);
    await wait(50);
    assert(aliceVoice.getActiveCall() === null, "alice's own call resets to IDLE (no active call) after ENDED");
    assert(bobVoice.getActiveCall() === null, "bob's own call resets to IDLE (no active call) after ENDED");
    assert(aliceConnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, "ending the call leaves the underlying peer connection AUTHENTICATED — voice lifecycle is independent of peer lifecycle");
    assert(bobConnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'true on both sides');
    console.log('✓ FLAGSHIP: INVITE -> RINGING -> ACCEPT -> in-band SDP renegotiation over the SAME RTCPeerConnection -> real bidirectional audio -> hang up -> the peer connection survives, completely unaffected');

    flagshipCleanup = { alice, bob, aliceConnect, bobConnect, aliceConnectedPeer, bobConnectedPeer, aliceFriends, bobFriends, aliceVoice, bobVoice, aliceAudio, bobAudio };
}

// ---------------------------------------------------------------------
// 5. Rejecting a call never touches the microphone at all, on either
//    side, and cleanly returns both devices to IDLE.
// ---------------------------------------------------------------------
{
    const { aliceConnectedPeer, aliceVoice, bobVoice, aliceAudio, bobAudio } = flagshipCleanup;
    const beforeAlice = aliceAudio.callCount;
    const beforeBob = bobAudio.callCount;

    const incoming = waitForIncomingCall(bobVoice);
    const callId = aliceVoice.startCall(aliceConnectedPeer);
    const { callId: bobCallId } = await incoming;
    assert(bobCallId === callId, 'bob rings for the correct call');

    bobVoice.rejectCall(callId);
    await waitForCallState(aliceVoice, callId, [VoiceSessionState.ENDED]);
    await wait(50);

    assert(aliceVoice.getActiveCall() === null, "alice's call ends the instant bob rejects");
    assert(bobVoice.getActiveCall() === null, "bob's own call record is also cleared");
    assert(aliceAudio.callCount === beforeAlice, 'a rejected call never touches the caller\'s own microphone');
    assert(bobAudio.callCount === beforeBob, "a rejected call never touches the callee's own microphone either — rejecting requires no media at all");
    console.log('✓ rejecting an incoming call requests no local media on either side and cleanly resets both devices to IDLE');
}

// ---------------------------------------------------------------------
// 6. Voice is gated by the SAME friendship/blocking eligibility chat
//    already uses — a connected-but-not-yet-friend peer cannot place a
//    call, and a forged INVITE from a non-friend is silently ignored.
// ---------------------------------------------------------------------
{
    const alice = flagshipCleanup.alice;
    const charlie = makeDevice('Charlie-Voice');
    const { aliceConnect, aliceConnectedPeer: aliceToCharlie, bobConnectedPeer: charlieToAlice } = await connectPair(alice, charlie);
    // Deliberately never friended.
    const aliceFriendsShared = flagshipCleanup.aliceFriends;
    const aliceVoiceShared = flagshipCleanup.aliceVoice;

    let threw = false;
    try { aliceVoiceShared.startCall(aliceToCharlie); } catch (e) { threw = e.message.includes('mutual friendship'); }
    assert(threw, 'startCall() refuses a connected-but-not-friend identity');

    // Charlie forges an INVITE directly over a bus his own connection is
    // genuinely, honestly authenticated on — proving the RECEIVER-side
    // gate (never merely the sender-side refusal above) also holds. A
    // fresh, dedicated VoiceUseCase for Alice, wired to THIS connection's
    // own registry/bus, is what actually receives it — reusing
    // `aliceVoiceShared` here would prove nothing, since its own bus was
    // never attached to this connection at all.
    const aliceBus = new PeerMessageBus();
    const aliceVoiceForCharlie = new VoiceUseCase(alice, {
        peerMessageBus: aliceBus, connectedPeerRegistry: aliceConnect.registry, friendRelationshipUseCase: aliceFriendsShared
    });
    const charlieBus = new PeerMessageBus();
    charlieBus.attach(charlieToAlice);
    let aliceRang = false;
    const unsubscribe = aliceVoiceForCharlie.onIncomingCall(() => { aliceRang = true; });
    charlieBus.send(charlieToAlice, VoiceUseCase.CALL_PROTOCOL, toVoiceCallSignal({
        callId: 'forged-call', type: VoiceCallSignalType.INVITE,
        callerIdentity: charlie.getSigningIdentity().id, calleeIdentity: alice.getSigningIdentity().id
    }));
    await wait(200);
    unsubscribe();
    assert(!aliceRang, "an INVITE from an authenticated-but-not-friend identity never rings — the receiver's own eligibility gate holds independent of the sender's");
    assert(aliceVoiceForCharlie.getActiveCall() === null, 'no call record was created from the forged/ineligible INVITE');

    aliceToCharlie.close();
    await wait(100);
    console.log('✓ voice reuses chat\'s own friendship/blocking eligibility gate, enforced independently on both the sending and receiving side');
}

// ---------------------------------------------------------------------
// 7. SECURITY FLAGSHIP A — an expected-identity mismatch (0.2.62) means
//    a call to "Bob" is never even possible, with ZERO new enforcement
//    code: Alice never gets an AUTHENTICATED ConnectedPeer for Bob at
//    all if the connection she opened actually authenticates as Charlie.
// ---------------------------------------------------------------------
{
    const alice = makeDevice('Alice-VoiceSecurity');
    const bob = makeDevice('Bob-VoiceSecurity');
    const charlie = makeDevice('Charlie-VoiceSecurity');
    const bobId = bob.getSigningIdentity().id;

    const aliceTransport = new WebRtcPeerConnectionProvider();
    const charlieTransport = new WebRtcPeerConnectionProvider();
    const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
    const charlieConnect = new ConnectToPeerUseCase({ peerConnectionProvider: charlieTransport, identityProvider: charlie });

    const aliceConnection = aliceTransport.createOffer();
    // Alice believes this offer's endpoint leads to Bob (e.g. from a
    // stale or spoofed rendezvous record) and says so explicitly via
    // expectedIdentityId — exactly application/FindPeerUseCase.js's own
    // "searched for Bob" precedent.
    const aliceConnectedPeer = aliceConnect.attach(aliceConnection, null, { expectedIdentityId: bobId });
    const offer = await waitForLocalSignal(aliceConnection);

    // But the endpoint actually answers as Charlie, honestly authenticating
    // as himself — never forging Bob's key, just genuinely not being him.
    const charlieConnectedPeer = charlieConnect.connect({ candidateEndpoint: JSON.stringify(relay(offer)) });
    const answer = await waitForLocalSignal(charlieConnectedPeer.connection);
    await aliceConnection.acceptRemoteAnswer(relay(answer));

    await waitForState(aliceConnectedPeer, [PeerLifecycleState.CLOSED]);
    assert(aliceConnectedPeer.remoteIdentity === null, "alice's connection never records ANY identity as Bob — it is closed the instant the mismatch is detected");

    const aliceFriends = makeFriendUseCase(alice, aliceConnect.registry);
    const aliceVoice = new VoiceUseCase(alice, {
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: aliceConnect.registry, friendRelationshipUseCase: aliceFriends
    });
    assert(!aliceConnect.registry.list().some((p) => p.remoteIdentity && p.remoteIdentity.identityId === bobId),
        "alice's registry never contains an AUTHENTICATED peer for Bob's identity at all");
    let threw = false;
    try { aliceVoice.startCall(aliceConnectedPeer); } catch (e) { threw = e.message.includes('authenticated connection'); }
    assert(threw, 'startCall() against the rejected, CLOSED connection is refused outright — there is structurally no way to reach "Bob" through it');
    console.log('✓ SECURITY FLAGSHIP: an expected-identity mismatch means a voice call is never possible — inherited entirely from 0.2.62\'s existing guard, zero new enforcement code needed');
}

// ---------------------------------------------------------------------
// 8. SECURITY FLAGSHIP B — blocking a peer mid-call terminates that
//    call immediately (never waiting for the call to end on its own),
//    a fresh call attempt is refused afterward, and the underlying peer
//    connection is left completely untouched.
// ---------------------------------------------------------------------
{
    const alice = makeDevice('Alice-VoiceBlock');
    const bob = makeDevice('Bob-VoiceBlock');
    const { aliceConnect, bobConnect, aliceConnectedPeer, bobConnectedPeer } = await connectPair(alice, bob);
    const aliceFriends = makeFriendUseCase(alice, aliceConnect.registry);
    const bobFriends = makeFriendUseCase(bob, bobConnect.registry);
    await becomeFriends(aliceFriends, aliceConnectedPeer, bobFriends, bobConnectedPeer);

    const alicePeerBlock = new PeerBlockUseCase(new InMemoryStorageProvider(), alice);
    const aliceVoice = new VoiceUseCase(alice, {
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: aliceConnect.registry,
        friendRelationshipUseCase: aliceFriends, peerBlockUseCase: alicePeerBlock, localAudioTrackProvider: new SyntheticAudioTrackProvider(440)
    });
    const bobVoice = new VoiceUseCase(bob, {
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: bobConnect.registry,
        friendRelationshipUseCase: bobFriends, localAudioTrackProvider: new SyntheticAudioTrackProvider(880)
    });

    const incoming = waitForIncomingCall(bobVoice);
    const callId = aliceVoice.startCall(aliceConnectedPeer);
    const { callId: bobCallId } = await incoming;
    await bobVoice.acceptCall(bobCallId);
    await Promise.all([
        waitForCallState(aliceVoice, callId, [VoiceSessionState.ACTIVE]),
        waitForCallState(bobVoice, callId, [VoiceSessionState.ACTIVE])
    ]);
    assert(aliceVoice.getActiveCall().state === VoiceSessionState.ACTIVE, 'setup: the call is genuinely active before the block');

    alicePeerBlock.block(aliceConnectedPeer.remoteIdentity);
    await Promise.all([
        waitForCallState(aliceVoice, callId, [VoiceSessionState.ENDED]),
        waitForCallState(bobVoice, callId, [VoiceSessionState.ENDED])
    ]);
    await wait(50);
    assert(aliceVoice.getActiveCall() === null, "blocking bob mid-call terminates alice's own call IMMEDIATELY — never waiting for bob to hang up or for the connection to drop");
    assert(bobVoice.getActiveCall() === null, "bob's own call is torn down too, via the SAME reliable END control signal every ordinary hangup uses");

    assert(aliceConnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'the underlying peer connection is left completely untouched by the block — still AUTHENTICATED');
    assert(bobConnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'true on both sides');

    let threw = false;
    try { aliceVoice.startCall(aliceConnectedPeer); } catch (e) { threw = e.message.includes('blocked'); }
    assert(threw, 'a fresh call attempt against a now-blocked identity is refused outright');
    console.log('✓ SECURITY FLAGSHIP: blocking a peer mid-call terminates the active call immediately, refuses any new call attempt, and never touches the underlying peer connection');
}

console.log('\nAll Authenticated Voice / Audio tests passed.');
}

await runTests();
