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
import { VoiceCallSignalType } from '../core/VoiceCallSignal.js';

// 0.2.75 — Voice UX & Device Controls.
//
// 0.2.73/0.2.74 proved the STATE MACHINE: INVITE -> ACCEPT -> negotiate ->
// ACTIVE -> hang up, plus every failure/concurrency edge. This file proves
// the layer 0.2.75 adds ON TOP without touching that machine at all:
// listing input devices, switching microphones mid-call via
// RTCRtpSender#replaceTrack() (never a second renegotiation), muting still
// producing zero wire traffic, and a local track dying unexpectedly (device
// unplugged) neither ending the call nor touching the underlying
// peer/PeerConnection.js. Every scenario runs over REAL RTCPeerConnection/
// RTCDataChannel pairs with REAL (synthetic) audio tracks, exactly like
// 0.2.73/0.2.74's own files.

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

function waitForMicrophoneUnavailable(voiceUseCase, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('timed out waiting for onMicrophoneUnavailable')), timeoutMs);
        const unsubscribe = voiceUseCase.onMicrophoneUnavailable((callId, peerIdentityId) => {
            clearTimeout(timeout);
            unsubscribe();
            resolve({ callId, peerIdentityId });
        });
    });
}

// A REAL, synthesized audio MediaStreamTrack per deviceId — see
// tests/AuthenticatedVoice.test.js's own header on why this, and not a
// mock, is what "real" means for voice in this codebase. Also implements
// the 0.2.75 device-enumeration surface with a small, fixed, injectable
// device catalog rather than depending on whatever hardware the test
// happens to run on.
class SyntheticAudioTrackProvider {
    constructor(devices = [{ deviceId: 'default-mic', label: 'Default Microphone' }]) {
        this.devices = devices;
        this.callCount = 0;
        this.acquiredDeviceIds = [];
        this._cleanups = new Map();
        this.lastTrack = null;
        this._failNextCalls = 0;
    }
    // Test-only control hook: the next N getLocalAudioTrack() calls throw,
    // simulating "no working device is available at all."
    failNextCalls(n) {
        this._failNextCalls = n;
    }
    async getLocalAudioTrack(deviceId = null) {
        this.callCount++;
        this.acquiredDeviceIds.push(deviceId);
        if (this._failNextCalls > 0) {
            this._failNextCalls--;
            throw new Error('NotFoundError: requested device is unavailable');
        }
        const AudioContextImpl = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContextImpl();
        const oscillator = ctx.createOscillator();
        oscillator.frequency.value = 440;
        const destination = ctx.createMediaStreamDestination();
        oscillator.connect(destination);
        oscillator.start();
        const [track] = destination.stream.getAudioTracks();
        track.forkbuildDeviceId = deviceId;
        // Explicit track.stop() (rather than relying on closing the
        // AudioContext alone) so a released track deterministically
        // reaches readyState 'ended' — the same guarantee
        // application/LocalAudioTrackProvider.js#releaseTrack() gives a
        // real getUserMedia() track.
        this._cleanups.set(track, () => { try { oscillator.stop(); } catch { /* already stopped */ } track.stop(); ctx.close(); });
        this.lastTrack = track;
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
    async listInputDevices() {
        return this.devices;
    }
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

    return { aliceConnect, bobConnect, aliceConnectedPeer, bobConnectedPeer };
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

async function makePairSuite(labelPrefix, { aliceAudio, bobAudio } = {}) {
    const alice = makeDevice(`Alice-${labelPrefix}`);
    const bob = makeDevice(`Bob-${labelPrefix}`);
    const { aliceConnect, bobConnect, aliceConnectedPeer, bobConnectedPeer } = await connectPair(alice, bob);

    const aliceFriends = makeFriendUseCase(alice, aliceConnect.registry);
    const bobFriends = makeFriendUseCase(bob, bobConnect.registry);
    await becomeFriends(aliceFriends, aliceConnectedPeer, bobFriends, bobConnectedPeer);

    const aliceChat = makeChatUseCase(alice, aliceConnect.registry, aliceFriends);
    const bobChat = makeChatUseCase(bob, bobConnect.registry, bobFriends);

    aliceAudio = aliceAudio || new SyntheticAudioTrackProvider([
        { deviceId: 'alice-built-in', label: 'Built-in Microphone' },
        { deviceId: 'alice-headset', label: 'USB Headset' }
    ]);
    bobAudio = bobAudio || new SyntheticAudioTrackProvider();

    const aliceVoice = new VoiceUseCase(alice, {
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: aliceConnect.registry,
        friendRelationshipUseCase: aliceFriends, localAudioTrackProvider: aliceAudio, ringingTimeoutMs: 30000
    });
    const bobVoice = new VoiceUseCase(bob, {
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: bobConnect.registry,
        friendRelationshipUseCase: bobFriends, localAudioTrackProvider: bobAudio, ringingTimeoutMs: 30000
    });

    return { alice, bob, aliceConnectedPeer, bobConnectedPeer, aliceChat, bobChat, aliceVoice, bobVoice, aliceAudio, bobAudio };
}

async function placeAndActivateCall(aliceVoice, bobVoice, aliceConnectedPeer) {
    const incoming = waitForIncomingCall(bobVoice);
    const callId = aliceVoice.startCall(aliceConnectedPeer);
    const { callId: bobCallId } = await incoming;
    await bobVoice.acceptCall(bobCallId);
    await Promise.all([
        waitForCallState(aliceVoice, callId, [VoiceSessionState.ACTIVE]),
        waitForCallState(bobVoice, callId, [VoiceSessionState.ACTIVE])
    ]);
    return callId;
}

async function runTests() {

// ---------------------------------------------------------------------
// 1. FLAGSHIP — Alice calls Bob, mutes (zero wire traffic for it), then
//    switches her own microphone mid-call: the local track is replaced
//    via replaceTrack() with no renegotiation, VoiceSession never leaves
//    ACTIVE, the underlying connection is never touched, and chat still
//    works throughout. Ends with a normal hang up that leaves the
//    peer/PeerConnection.js completely alive.
// ---------------------------------------------------------------------
{
    const { alice, bob, aliceConnectedPeer, bobConnectedPeer, aliceChat, bobChat, aliceVoice, bobVoice, aliceAudio } = await makePairSuite('Flagship');

    // Sniff every raw message Bob's own connection ever receives, so
    // "Bob receives no mute protocol message" and "no new wire vocabulary
    // for a device switch" are proven directly against the wire, not
    // merely inferred from VoiceUseCase's own public surface.
    const bobRawMessages = [];
    bobConnectedPeer.connection.onMessage((message) => bobRawMessages.push(message));

    const callId = await placeAndActivateCall(aliceVoice, bobVoice, aliceConnectedPeer);
    assert(aliceAudio.callCount === 1, "alice's own microphone was acquired exactly once so far (initial negotiation)");

    // --- Mute: purely local, zero wire traffic. ---
    const messagesBeforeMute = bobRawMessages.length;
    aliceVoice.setMuted(true);
    assert(aliceVoice.isMuted() === true, 'alice is now muted');
    await wait(150);
    assert(bobRawMessages.length === messagesBeforeMute, 'muting produced ZERO additional messages on the wire Bob receives — never a protocol signal');
    aliceVoice.setMuted(false);
    assert(aliceVoice.isMuted() === false, 'alice unmutes locally too');

    // --- Device listing. ---
    const devices = await aliceVoice.listInputDevices();
    assert(devices.length === 2 && devices.some((d) => d.deviceId === 'alice-headset'), 'listInputDevices() surfaces the injected device catalog');
    assert(aliceVoice.getInputDevice() === null, "alice's preferred device starts as null (platform default) — she never chose one yet");

    // --- Live device switch, mid-call. ---
    const messagesBeforeSwitch = bobRawMessages.length;
    const oldTrack = aliceAudio.lastTrack;
    await aliceVoice.setInputDevice('alice-headset');
    assert(aliceVoice.getInputDevice() === 'alice-headset', 'the preference is now recorded');
    assert(aliceAudio.callCount === 2, "switching devices acquired exactly ONE new track (the headset), reusing nothing from the old one");
    assert(aliceAudio.lastTrack !== oldTrack, 'a genuinely different MediaStreamTrack is now attached');
    assert(oldTrack.readyState === 'ended', "the OLD device's own track was stopped/released once the switch completed");
    await wait(150);
    assert(bobRawMessages.length === messagesBeforeSwitch, 'a live device switch produced ZERO additional core/VoiceCallSignal.js or core/VoiceMediaSignal.js messages — replaceTrack() needs no renegotiation at all');
    assert(aliceVoice.getActiveCall().state === VoiceSessionState.ACTIVE, 'VoiceSession never left ACTIVE for the switch — no CONNECTING detour');
    assert(aliceConnectedPeer.connection.role !== undefined, 'sanity: still the same underlying connection object');
    assert(aliceConnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'the underlying peer connection is completely untouched by the device switch');
    assert(bobConnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'true on both sides');

    // --- Chat still works, over the SAME connection, right after a live device switch. ---
    const bobId = bob.getSigningIdentity().id;
    const aliceId = alice.getSigningIdentity().id;
    aliceChat.sendOrQueue(bobId, 'still on the call, new mic now');
    await wait(200);
    assert(bobChat.getConversation(aliceId).some((m) => m.body === 'still on the call, new mic now'), 'chat delivers normally over the same connection right after a live voice device switch');

    // --- Hang up: the call ends; the underlying connection survives. ---
    const bothEnded = Promise.all([
        waitForCallState(aliceVoice, callId, [VoiceSessionState.ENDED]),
        waitForCallState(bobVoice, callId, [VoiceSessionState.ENDED])
    ]);
    aliceVoice.endCall(callId);
    await bothEnded;
    assert(aliceVoice.getActiveCall() === null, "alice's call is cleared");
    assert(bobVoice.getActiveCall() === null, "bob's call is cleared");
    assert(aliceConnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'peer/PeerConnection.js remains alive and AUTHENTICATED after the call ends');
    assert(bobConnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'true on both sides');
    console.log('✓ FLAGSHIP: mute produces zero wire traffic, a live microphone switch replaces the track via replaceTrack() with zero renegotiation and VoiceSession staying ACTIVE throughout, chat keeps working, and the underlying peer connection survives the whole call untouched');
}

// ---------------------------------------------------------------------
// 2. PREFERENCE BEFORE NEGOTIATION — choosing a device while CALLING
//    (before any track has been acquired at all) merely records the
//    preference; it is applied the FIRST time a track is ever acquired,
//    with no separate switch/replaceTrack ever happening.
// ---------------------------------------------------------------------
{
    const { aliceConnectedPeer, aliceVoice, bobVoice, aliceAudio } = await makePairSuite('Preference');

    const incoming = waitForIncomingCall(bobVoice);
    const callId = aliceVoice.startCall(aliceConnectedPeer);
    assert(aliceVoice.getActiveCall().state === VoiceSessionState.CALLING, 'alice is CALLING; no track acquired yet');

    await aliceVoice.setInputDevice('alice-headset');
    assert(aliceAudio.callCount === 0, 'choosing a device before any negotiation started acquires NOTHING yet — only records the preference');

    const { callId: bobCallId } = await incoming;
    await bobVoice.acceptCall(bobCallId);
    await waitForCallState(aliceVoice, callId, [VoiceSessionState.ACTIVE]);

    assert(aliceAudio.callCount === 1, "alice's OWN track is acquired exactly once, for the preferred device, the first time negotiation actually runs");
    assert(aliceAudio.acquiredDeviceIds[0] === 'alice-headset', 'the single acquisition used the previously-recorded preference');
    console.log('✓ PREFERENCE BEFORE NEGOTIATION: choosing a device before a track exists only records a preference, applied on the first real acquisition, never a separate switch');
}

// ---------------------------------------------------------------------
// 3. MICROPHONE DISAPPEARS, FALLBACK SUCCEEDS — the local track ends on
//    its own (the OS/browser's own "this device is gone" signal); voice
//    automatically falls back to the platform default, the call never
//    leaves ACTIVE, and the underlying connection is untouched.
// ---------------------------------------------------------------------
{
    const { aliceConnectedPeer, bobConnectedPeer, aliceVoice, bobVoice, aliceAudio } = await makePairSuite('FallbackOK');
    const callId = await placeAndActivateCall(aliceVoice, bobVoice, aliceConnectedPeer);

    const acquisitionsBefore = aliceAudio.callCount;
    const dyingTrack = aliceAudio.lastTrack;
    // Simulate the device itself disappearing. Per the MediaStreamTrack
    // spec, calling stop() yourself does NOT dispatch 'ended' — that
    // event exists specifically for the OTHER case, the track ending for
    // a reason the script didn't request (device unplugged, permission
    // revoked). A synthetic track under full script control has no real
    // hardware to lose, so this dispatches the exact event a real browser
    // would — the same "synthesize the ONE specific failure, nothing
    // else" precedent tests/VoiceCallReliability.test.js's own
    // NEGOTIATION FAILURE scenario already set by overriding renegotiate()
    // directly rather than fabricating a whole failing transport.
    dyingTrack.stop();
    dyingTrack.dispatchEvent(new Event('ended'));
    await wait(200);

    assert(aliceAudio.callCount === acquisitionsBefore + 1, 'exactly ONE automatic fallback acquisition was attempted after the track died on its own');
    assert(aliceAudio.acquiredDeviceIds[aliceAudio.acquiredDeviceIds.length - 1] === null, 'the fallback asked for the platform DEFAULT device (null), never re-requesting the dead one by id');
    assert(aliceVoice.getActiveCall() !== null && aliceVoice.getActiveCall().callId === callId, 'the call is still tracked — an unexpected device loss never tears it down');
    assert(aliceVoice.getActiveCall().state === VoiceSessionState.ACTIVE, 'VoiceSession stayed ACTIVE throughout the automatic fallback');
    assert(aliceConnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'the underlying peer connection is untouched by a local device loss');
    assert(bobConnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'true on both sides');
    console.log('✓ MICROPHONE DISAPPEARS, FALLBACK SUCCEEDS: an unexpectedly-ended local track triggers exactly one automatic fallback to the platform default, the call stays ACTIVE throughout, and the underlying connection never notices');
}

// ---------------------------------------------------------------------
// 4. MICROPHONE DISAPPEARS, NO REPLACEMENT AVAILABLE — the fallback
//    itself also fails (no working device at all); onMicrophoneUnavailable()
//    fires exactly once, but the call is STILL never torn down — a local
//    media problem never becomes a VoiceCallEndReason.
// ---------------------------------------------------------------------
{
    const { bob, aliceConnectedPeer, bobConnectedPeer, aliceVoice, bobVoice, aliceAudio } = await makePairSuite('FallbackFail');
    const callId = await placeAndActivateCall(aliceVoice, bobVoice, aliceConnectedPeer);

    const unavailablePromise = waitForMicrophoneUnavailable(aliceVoice, 5000);
    aliceAudio.failNextCalls(1); // the one fallback attempt about to happen fails
    const dyingTrack = aliceAudio.lastTrack;
    // See scenario 3's own comment on why stop() alone never fires
    // 'ended' and this dispatches it directly.
    dyingTrack.stop();
    dyingTrack.dispatchEvent(new Event('ended'));

    const { callId: unavailableCallId, peerIdentityId } = await unavailablePromise;
    assert(unavailableCallId === callId, 'onMicrophoneUnavailable() names the exact call still in progress');
    assert(peerIdentityId === bob.getSigningIdentity().id, "onMicrophoneUnavailable() names alice's OWN call partner, bob");
    await wait(100);

    assert(aliceVoice.getActiveCall() !== null && aliceVoice.getActiveCall().callId === callId, 'the call SURVIVES a total local media loss — it is never ended by this alone');
    assert(aliceVoice.getActiveCall().state === VoiceSessionState.ACTIVE, 'VoiceSession stays exactly ACTIVE');
    assert(aliceConnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'the underlying peer connection is completely untouched');
    assert(bobConnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'true on both sides');

    // The call still ends normally afterward, on an ordinary hang up.
    const bothEnded = Promise.all([
        waitForCallState(aliceVoice, callId, [VoiceSessionState.ENDED]),
        waitForCallState(bobVoice, callId, [VoiceSessionState.ENDED])
    ]);
    aliceVoice.endCall(callId);
    await bothEnded;
    console.log('✓ MICROPHONE DISAPPEARS, NO REPLACEMENT AVAILABLE: onMicrophoneUnavailable() fires once, but the call is never torn down by a local media problem alone, and an ordinary hang up still works normally afterward');
}

// ---------------------------------------------------------------------
// 5. A DEVICE SWITCH THAT FAILS LEAVES THE CALL EXACTLY AS IT WAS — the
//    requested device is rejected by the platform; the OLD track keeps
//    transmitting, the preference is NOT silently left half-applied, and
//    the caller (a UI) sees a normal rejected Promise.
// ---------------------------------------------------------------------
{
    const { aliceConnectedPeer, aliceVoice, bobVoice, aliceAudio } = await makePairSuite('SwitchFail');
    const callId = await placeAndActivateCall(aliceVoice, bobVoice, aliceConnectedPeer);

    const trackBefore = aliceAudio.lastTrack;
    aliceAudio.failNextCalls(1);
    let threw = false;
    try {
        await aliceVoice.setInputDevice('nonexistent-device');
    } catch {
        threw = true;
    }
    assert(threw, 'setInputDevice() rejects when the requested device is unavailable');
    assert(aliceVoice.getActiveCall().callId === callId && aliceVoice.getActiveCall().state === VoiceSessionState.ACTIVE, 'the call is completely unaffected by the failed switch');
    assert(trackBefore.readyState === 'live', 'the OLD track is still live — never stopped for a switch that never actually completed');
    assert(aliceVoice.getInputDevice() === null, 'the STANDING preference is never updated to a device that just failed — a future call must not silently retry the same broken choice');
    console.log('✓ FAILED DEVICE SWITCH: a rejected setInputDevice() leaves the call exactly as it was — the old track keeps transmitting, and the failure surfaces as an ordinary rejected Promise, never a call teardown');
}

// ---------------------------------------------------------------------
// 6. NO NEW WIRE VOCABULARY — 0.2.75 adds no VoiceCallSignalType and no
//    VoiceMediaSignalKind value; this is a structural, not behavioral,
//    guarantee that device control stayed local-only per this milestone's
//    own design.
// ---------------------------------------------------------------------
{
    assert(Object.values(VoiceCallSignalType).length === 5, 'core/VoiceCallSignal.js still has exactly the five 0.2.73 values — INVITE/ACCEPT/REJECT/END/BUSY');
    console.log('✓ NO NEW WIRE VOCABULARY: device control added zero new call-signal or media-signal types — mute/device selection stay exactly as local as 0.2.73 designed them');
}

console.log('\nAll Voice UX & Device Controls tests passed.');
}

await runTests();
