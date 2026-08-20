import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { WebRtcPeerConnectionProvider } from '../peer/WebRtcPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { DeviceAuthorizationPropagationUseCase } from '../application/DeviceAuthorizationPropagationUseCase.js';
import { FriendRelationshipUseCase } from '../application/FriendRelationshipUseCase.js';
import { FriendshipRecord } from '../core/FriendshipRecord.js';
import { VoiceUseCase } from '../application/VoiceUseCase.js';
import { VoiceSessionState } from '../core/VoiceSessionState.js';
import { VoiceCallEndReason } from '../core/VoiceCallEndReason.js';

// 0.2.86 — Multi-Device Voice Ringing.
//
// The first test file in this codebase to combine BOTH established
// multi-device harnesses at once: `tests/VoiceCallReliability.test.js`'s
// REAL `WebRtcPeerConnectionProvider` pairs (voice needs genuine media-
// capable connections — `application/VoiceUseCase.js#supportsVoice()`
// is false for anything else) and `tests/MultiDevicePresenceSemantics.test.js`'s
// real `DeviceAuthorizationPropagationUseCase`/`resolveSocialIdentity`
// wiring (an identity-targeted call needs to discover MULTIPLE of Alice's
// own authorized devices, not just her own literal key).
//
// Runs the design conversation's own scripted scenario, continuously,
// exactly like Alice/Phone/Laptop/Tablet/Bob/Charlie are introduced one
// at a time in the design doc itself:
//   1. Fan-out             — Bob calls Alice's identity; Phone and Laptop
//                             both ring; the still-offline Tablet does not.
//   2. First acceptance wins — the Laptop accepts; the call goes ACTIVE
//                             there; the Phone's own ringing call
//                             independently ends (a real cancellation
//                             arrives, not merely "was never chosen").
//   3. One identity, at most one call — with the Laptop ACTIVE, Charlie
//                             calls Alice and receives BUSY; the Laptop's
//                             existing call is completely undisturbed, and
//                             the Phone settles back to idle.
//   4. Revocation mid-ring  — a NEW call rings Phone and Laptop; Alice
//                             revokes the Laptop while both are still
//                             ringing; the Laptop's own ACCEPT is silently
//                             ignored on Bob's side (never reaches ACTIVE)
//                             while the Phone can still answer normally.
//   5. Disconnect tolerance — the (until now offline) Tablet comes online,
//                             authorized all along; a fresh call rings
//                             Phone and Tablet; the Tablet disconnects
//                             mid-ring and only ITS OWN ringing attempt
//                             disappears — the Phone keeps ringing.
//   6. No resurrection      — the Tablet reconnects on a brand-new
//                             connection and is confirmed idle, never
//                             rejoining the call it was cut out of.
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

function wait(ms = 0) {
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
        this._cleanups = new Map();
    }
    async getLocalAudioTrack() {
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

// Mirrors tests/MultiDevicePresenceSemantics.test.js's own makeDevice()
// exactly — one independent LocalIdentityProvider instance standing in
// for one physically distinct device.
function makeDevice(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return { provider, identity };
}

// Pairs an existing "device" ConnectToPeerUseCase with an existing "hub"
// ConnectToPeerUseCase over a REAL RTCPeerConnection — mirrors
// tests/VoiceCallReliability.test.js's own connectPair()/reconnectPair(),
// generalized so any number of devices can each independently pair with
// the SAME hub, accumulating in the hub's own registry exactly like a
// real multi-device topology would.
async function pairDeviceWithHub(deviceConnect, hubConnect) {
    const deviceTransport = new WebRtcPeerConnectionProvider();
    const deviceConnection = deviceTransport.createOffer();
    const deviceConnectedPeer = deviceConnect.attach(deviceConnection);
    const offer = await waitForLocalSignal(deviceConnection);

    const hubConnectedPeer = hubConnect.connect({ candidateEndpoint: JSON.stringify(relay(offer)) });
    const answer = await waitForLocalSignal(hubConnectedPeer.connection);
    await deviceConnection.acceptRemoteAnswer(relay(answer));

    await Promise.all([
        waitForState(deviceConnectedPeer, [PeerLifecycleState.AUTHENTICATED]),
        waitForState(hubConnectedPeer, [PeerLifecycleState.AUTHENTICATED])
    ]);
    return { deviceConnectedPeer, hubConnectedPeer };
}

// One device's own full voice-capable social stack: device-authorization
// gossip (application/DeviceAuthorizationPropagationUseCase.js), friendship
// resolved through it, and VoiceUseCase itself — the exact same
// resolveConnectionIdentity() wiring tests/MultiDeviceSocialSemantics.test.js/
// tests/MultiDevicePresenceSemantics.test.js already established, extended
// with application/VoiceUseCase.js.
function makeVoiceStack(device, registry, { ringingTimeoutMs = 8000, audio = new SyntheticAudioTrackProvider() } = {}) {
    const peerMessageBus = new PeerMessageBus();
    const deviceAuth = new DeviceAuthorizationPropagationUseCase(new InMemoryStorageProvider(), device.provider, {
        peerMessageBus, connectedPeerRegistry: registry
    });
    const resolveSocialIdentity = (connectedPeer) => deviceAuth.resolveConnectionIdentity(connectedPeer);
    const friendsStorage = new InMemoryStorageProvider();
    const friends = new FriendRelationshipUseCase(friendsStorage, device.provider, {
        peerMessageBus, connectedPeerRegistry: registry, resolveSocialIdentity
    });
    const voice = new VoiceUseCase(device.provider, {
        peerMessageBus, connectedPeerRegistry: registry, friendRelationshipUseCase: friends,
        localAudioTrackProvider: audio, ringingTimeoutMs, resolveSocialIdentity
    });
    return { device, registry, deviceAuth, friends, friendsStorage, voice };
}

async function becomeFriends(requesterFriends, requesterToTarget, targetFriends, targetFromRequester) {
    requesterFriends.sendFriendRequest(requesterToTarget);
    await wait(50);
    targetFriends.acceptFriendRequest(targetFromRequester);
    await wait(50);
}

// Each of Alice's devices is a fully independent LocalIdentityProvider
// with its OWN separate, unsynchronized FriendRelationshipUseCase store —
// see SETUP's own note. `application/FriendRelationshipUseCase.js`'s
// REQUEST/ACCEPT wire protocol is built around exactly ONE completed
// handshake per resolved identity — a genuinely real, pre-existing
// limitation this milestone did not introduce and is not in scope to fix
// (see docs/Roadmap.md, 0.2.86, "Deliberately not in 0.2.86"): once Bob
// is already FRIEND with Alice's parent identity (via the Phone's own
// completed handshake), his own `acceptFriendRequest()` structurally
// cannot answer a SECOND, independent REQUEST from the Laptop — there is
// only one FriendshipRecord per resolved identity, and Bob has already
// used its one outgoingAction slot. So for every device AFTER the first,
// this fixture seeds an already-FRIEND record directly into that
// device's own storage — exactly what a real "these two identities
// already trust each other" precondition looks like at rest, without
// replaying a protocol handshake that has no way to complete twice for
// the same counterpart.
function seedFriendship(storageProvider, ownerLabel, remoteIdentity) {
    const record = FriendshipRecord.fromPeerIdentity(remoteIdentity)
        .withOutgoingAction({ action: 'ACCEPT' })
        .withIncomingAction({ action: 'REQUEST' });
    const key = 'friend-relationships:' + ownerLabel;
    const existing = (storageProvider.load(key) || []).filter((r) => r.identityId !== remoteIdentity.identityId);
    storageProvider.save(key, [...existing, record.toJSON()]);
}

async function runTests() {

// ---------------------------------------------------------------------
// SETUP — Alice's Phone and Laptop connect and authorize; her Tablet
// stays deliberately offline (unauthorized-vs-offline is exactly the
// distinction the design conversation itself drew: the Tablet IS
// authorized from the very start, it simply has no live connection yet).
// Bob and Charlie each independently befriend Alice's PARENT identity
// through the Phone's own connection — mirroring
// tests/MultiDeviceSocialSemantics.test.js's own flagship precedent that
// a device never needs its own separate friend request.
// ---------------------------------------------------------------------
const alice = makeDevice('Alice');
const phone = makeDevice('Alice-Phone');
const laptop = makeDevice('Alice-Laptop');
const tablet = makeDevice('Alice-Tablet');
const bob = makeDevice('Bob');
const charlie = makeDevice('Charlie');

const grantPhone = alice.provider.authorizeDevice(alice.identity.identityId, phone.identity.identityId, phone.identity.publicKey, { deviceLabel: 'Phone' });
const grantLaptop = alice.provider.authorizeDevice(alice.identity.identityId, laptop.identity.identityId, laptop.identity.publicKey, { deviceLabel: 'Laptop' });
const grantTablet = alice.provider.authorizeDevice(alice.identity.identityId, tablet.identity.identityId, tablet.identity.publicKey, { deviceLabel: 'Tablet' });

const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: new WebRtcPeerConnectionProvider(), identityProvider: alice.provider });
const phoneConnect = new ConnectToPeerUseCase({ peerConnectionProvider: new WebRtcPeerConnectionProvider(), identityProvider: phone.provider });
const laptopConnect = new ConnectToPeerUseCase({ peerConnectionProvider: new WebRtcPeerConnectionProvider(), identityProvider: laptop.provider });
const tabletConnect = new ConnectToPeerUseCase({ peerConnectionProvider: new WebRtcPeerConnectionProvider(), identityProvider: tablet.provider });
const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: new WebRtcPeerConnectionProvider(), identityProvider: bob.provider });
const charlieConnect = new ConnectToPeerUseCase({ peerConnectionProvider: new WebRtcPeerConnectionProvider(), identityProvider: charlie.provider });

const { deviceConnectedPeer: phoneToBob, hubConnectedPeer: bobFromPhone } = await pairDeviceWithHub(phoneConnect, bobConnect);
const { deviceConnectedPeer: phoneToCharlie, hubConnectedPeer: charlieFromPhone } = await pairDeviceWithHub(phoneConnect, charlieConnect);
const { deviceConnectedPeer: laptopToBob, hubConnectedPeer: bobFromLaptop } = await pairDeviceWithHub(laptopConnect, bobConnect);
const { deviceConnectedPeer: laptopToCharlie, hubConnectedPeer: charlieFromLaptop } = await pairDeviceWithHub(laptopConnect, charlieConnect);

const bobStack = makeVoiceStack(bob, bobConnect.registry);
const charlieStack = makeVoiceStack(charlie, charlieConnect.registry);
const phoneStack = makeVoiceStack(phone, phoneConnect.registry);
const laptopStack = makeVoiceStack(laptop, laptopConnect.registry);
// Not created yet — the Tablet stays deliberately offline until Section 5.

// Alice's own primary identity briefly connects to Bob and Charlie purely
// to gossip her signed device grants, then disconnects — her PRIMARY
// identity itself is never a ringing candidate, exactly matching the
// design conversation's own example (Phone/Laptop/Tablet, no separate
// fourth "Alice-primary" device).
async function gossipFromAlice(action) {
    const aliceStack = makeVoiceStack(alice, aliceConnect.registry);
    const { deviceConnectedPeer: aliceToBob } = await pairDeviceWithHub(aliceConnect, bobConnect);
    const { deviceConnectedPeer: aliceToCharlie } = await pairDeviceWithHub(aliceConnect, charlieConnect);
    action(aliceStack);
    await wait(150);
    aliceToBob.close();
    aliceToCharlie.close();
    await wait(50);
}

await gossipFromAlice((aliceStack) => {
    aliceStack.deviceAuth.broadcastAuthorization(grantPhone);
    aliceStack.deviceAuth.broadcastAuthorization(grantLaptop);
    aliceStack.deviceAuth.broadcastAuthorization(grantTablet);
});
assert(bobStack.deviceAuth.getDeviceAuthority(alice.identity.identityId, phone.identity.identityId).isAuthorized, 'setup: Bob independently verified the Phone');
assert(bobStack.deviceAuth.getDeviceAuthority(alice.identity.identityId, laptop.identity.identityId).isAuthorized, 'setup: Bob independently verified the Laptop');
assert(bobStack.deviceAuth.getDeviceAuthority(alice.identity.identityId, tablet.identity.identityId).isAuthorized, 'setup: Bob independently verified the (still offline) Tablet');
assert(charlieStack.deviceAuth.getDeviceAuthority(alice.identity.identityId, phone.identity.identityId).isAuthorized, 'setup: Charlie independently verified the Phone');
assert(charlieStack.deviceAuth.getDeviceAuthority(alice.identity.identityId, laptop.identity.identityId).isAuthorized, 'setup: Charlie independently verified the Laptop');

// 0.2.79's own precedent ("the Laptop, never having friended Bob itself,
// is ALREADY recognized as an authorized device of an existing friend")
// is about the RECEIVING side's aggregation — Bob's own FriendshipRecord,
// keyed to Alice's parent identity, already covers every device of hers
// he talks to. It says nothing about Alice's OWN devices sharing state
// with EACH OTHER — they don't; each is an independent LocalIdentityProvider
// with its own separate, unsynchronized storage (see docs/Roadmap.md,
// 0.2.85, "no presence gossip or synchronization between Alice's own
// devices"). So the Phone and the Laptop each need their OWN local
// friendship with whichever caller might reach THEM directly — otherwise
// that caller's INVITE is silently dropped by `_handleInvite()`'s own
// eligibility check, evaluated against the RECEIVING device's own store.
await becomeFriends(phoneStack.friends, phoneToBob, bobStack.friends, bobFromPhone);
await becomeFriends(phoneStack.friends, phoneToCharlie, charlieStack.friends, charlieFromPhone);
// The Phone's own handshake above is the ONE genuine, real, wire-driven
// REQUEST/ACCEPT exchange this file runs — proving the ordinary path
// still works exactly as 0.2.57–0.2.79 always intended. Bob and Charlie
// are now each already FRIEND with Alice's resolved parent identity, so
// their own `acceptFriendRequest()` has no second response left to give
// — see `seedFriendship()`'s own header for why the Laptop's matching
// local record is seeded directly rather than replayed through a
// handshake that cannot complete twice for the same counterpart.
seedFriendship(laptopStack.friendsStorage, 'Alice-Laptop', bob.identity);
seedFriendship(laptopStack.friendsStorage, 'Alice-Laptop', charlie.identity);
assert(bobStack.friends.getState(alice.identity.identityId) === 'FRIEND', 'setup: Bob is friends with Alice\'s PARENT identity');
assert(charlieStack.friends.getState(alice.identity.identityId) === 'FRIEND', 'setup: Charlie is friends with Alice\'s PARENT identity');
console.log('✓ SETUP: Phone and Laptop are online, authorized, and Bob/Charlie are friends with Alice\'s identity; the Tablet is authorized but stays offline');

// ---------------------------------------------------------------------
// Section 1: FAN-OUT — Bob calls Alice's identity; Phone and Laptop both
// ring, sharing one callId; the offline Tablet plays no part at all.
// ---------------------------------------------------------------------
{
    assert(bobStack.voice.canCallIdentity(alice.identity.identityId), 'Bob can place an identity-targeted call to Alice');

    const phoneIncoming = waitForIncomingCall(phoneStack.voice);
    const laptopIncoming = waitForIncomingCall(laptopStack.voice);
    const callId = bobStack.voice.startCallToIdentity(alice.identity.identityId);
    assert(bobStack.voice.getActiveCall().callId === callId && bobStack.voice.getActiveCall().state === VoiceSessionState.CALLING,
        'Bob\'s own call record is CALLING immediately, sharing one callId across the whole fan-out');

    const [phoneEvent, laptopEvent] = await Promise.all([phoneIncoming, laptopIncoming]);
    assert(phoneEvent.callId === callId && laptopEvent.callId === callId, 'the SAME callId rings both of Alice\'s devices');
    assert(phoneStack.voice.getActiveCall().state === VoiceSessionState.RINGING, 'the Phone is RINGING');
    assert(laptopStack.voice.getActiveCall().state === VoiceSessionState.RINGING, 'the Laptop is RINGING');
    console.log('✓ Section 1: FAN-OUT — one identity-targeted call rings both of Alice\'s reachable, authorized devices at once, sharing one callId — there is still only one call');

    // ---------------------------------------------------------------------
    // Section 2: FIRST ACCEPTANCE WINS — the Laptop accepts; the call goes
    // ACTIVE there; the Phone's own ringing call independently, genuinely
    // ends (a real cancellation reaches it), never merely "was not chosen."
    // ---------------------------------------------------------------------
    const bobActive = waitForCallState(bobStack.voice, callId, [VoiceSessionState.ACTIVE]);
    const phoneEnded = waitForCallEnded(phoneStack.voice, callId);
    await laptopStack.voice.acceptCall(callId);
    await Promise.all([bobActive, waitForCallState(laptopStack.voice, callId, [VoiceSessionState.ACTIVE])]);
    const phoneEndReason = await phoneEnded;

    assert(bobStack.voice.getActiveCall().state === VoiceSessionState.ACTIVE, 'Bob\'s call is ACTIVE, connected to the Laptop');
    assert(laptopStack.voice.getActiveCall().state === VoiceSessionState.ACTIVE, 'the Laptop\'s own call is ACTIVE');
    assert(phoneStack.voice.getActiveCall() === null, 'the Phone\'s ringing call is fully cleared — it lost the race');
    assert(phoneEndReason === VoiceCallEndReason.REMOTE_HANGUP, 'the Phone\'s own call ends as REMOTE_HANGUP — the caller\'s cancellation, not a local decision');
    console.log('✓ Section 2: FIRST ACCEPTANCE WINS — the Laptop\'s accept locks the call; the Phone\'s losing ringing attempt is genuinely cancelled, not merely ignored');
}

// ---------------------------------------------------------------------
// Section 3: ONE IDENTITY, AT MOST ONE ACTIVE CALL — with the Laptop
// ACTIVE on a call with Bob, Charlie calls Alice's identity too. Charlie
// must receive BUSY, the Laptop's existing call with Bob must be
// completely undisturbed, and the Phone (idle, not itself busy) must
// settle back to idle rather than being left ringing forever.
// ---------------------------------------------------------------------
let bobLaptopCallId;
{
    bobLaptopCallId = bobStack.voice.getActiveCall().callId;
    assert(charlieStack.voice.canCallIdentity(alice.identity.identityId), 'Charlie can still attempt to call Alice\'s identity');

    const charlieCallId = charlieStack.voice.startCallToIdentity(alice.identity.identityId);
    const charlieReason = await waitForCallEnded(charlieStack.voice, charlieCallId);
    assert(charlieReason === VoiceCallEndReason.BUSY, `Charlie's call to a busy Alice ends with BUSY, got ${charlieReason}`);
    assert(charlieStack.voice.getActiveCall() === null, "Charlie's call record is cleared after BUSY");

    await wait(150);
    assert(phoneStack.voice.getActiveCall() === null, 'the Phone (never itself busy) settles back to idle rather than being left ringing forever');
    assert(bobStack.voice.getActiveCall() && bobStack.voice.getActiveCall().callId === bobLaptopCallId && bobStack.voice.getActiveCall().state === VoiceSessionState.ACTIVE,
        "Bob's ORIGINAL call with the Laptop is completely untouched by Charlie's refused call");
    assert(laptopStack.voice.getActiveCall() && laptopStack.voice.getActiveCall().state === VoiceSessionState.ACTIVE,
        "the Laptop's own side of the original call is untouched too");
    console.log('✓ Section 3: ONE IDENTITY, AT MOST ONE ACTIVE CALL — Charlie receives BUSY without disturbing the Laptop\'s existing call; the idle Phone settles back to IDLE, never left stuck ringing');
}

// Hang up the Laptop<->Bob call so every device is idle again.
{
    const laptopEnded = waitForCallEnded(laptopStack.voice, bobLaptopCallId);
    bobStack.voice.endCall(bobLaptopCallId);
    await laptopEnded;
    await wait(50);
    assert(bobStack.voice.getActiveCall() === null && laptopStack.voice.getActiveCall() === null, 'both sides of the original call are cleanly idle again');
}

// ---------------------------------------------------------------------
// Section 4: REVOCATION MID-RING — Bob calls Alice fresh; Phone and
// Laptop both ring. Alice revokes the Laptop while it is STILL ringing.
// The Laptop's own ACCEPT must never reach ACTIVE as Alice; the Phone
// must still be able to answer normally.
// ---------------------------------------------------------------------
let revokedCallId;
{
    const phoneIncoming = waitForIncomingCall(phoneStack.voice);
    const laptopIncoming = waitForIncomingCall(laptopStack.voice);
    revokedCallId = bobStack.voice.startCallToIdentity(alice.identity.identityId);
    await Promise.all([phoneIncoming, laptopIncoming]);
    assert(phoneStack.voice.getActiveCall().state === VoiceSessionState.RINGING, 'setup: Phone RINGING');
    assert(laptopStack.voice.getActiveCall().state === VoiceSessionState.RINGING, 'setup: Laptop RINGING');

    await gossipFromAlice((aliceStack) => {
        const revocation = alice.provider.revokeDeviceAuthorization(alice.identity.identityId, laptop.identity.identityId);
        aliceStack.deviceAuth.broadcastRevocation(revocation);
    });
    assert(!bobStack.deviceAuth.resolvePeerAuthority(bobFromLaptop, alice.identity.identityId).authorized, 'sanity: Bob has learned of the Laptop\'s revocation');

    // The Laptop itself has no idea it was just revoked — it tries to
    // accept exactly as it always would. Bob's own side must silently
    // refuse to treat this as Alice answering.
    await laptopStack.voice.acceptCall(revokedCallId);
    await wait(200);
    assert(bobStack.voice.getActiveCall() && bobStack.voice.getActiveCall().state === VoiceSessionState.CALLING,
        'REVOCATION: the revoked Laptop\'s ACCEPT never locks Bob\'s call — it stays CALLING, waiting on the still-legitimate Phone');

    // The still-authorized Phone answers normally — this also cancels the
    // Laptop's now-orphaned CONNECTING attempt as a side effect of locking
    // onto the Phone instead.
    const bobActive = waitForCallState(bobStack.voice, revokedCallId, [VoiceSessionState.ACTIVE]);
    const phoneActive = waitForCallState(phoneStack.voice, revokedCallId, [VoiceSessionState.ACTIVE]);
    const laptopEnded = waitForCallEnded(laptopStack.voice, revokedCallId);
    await phoneStack.voice.acceptCall(revokedCallId);
    await Promise.all([bobActive, phoneActive]);
    const laptopReason = await laptopEnded;

    assert(bobStack.voice.getActiveCall().state === VoiceSessionState.ACTIVE, 'Bob\'s call is ACTIVE, connected to the Phone');
    assert(phoneStack.voice.getActiveCall().state === VoiceSessionState.ACTIVE, "the Phone's own call is ACTIVE — still-authorized devices are unaffected by the Laptop's revocation");
    assert(laptopStack.voice.getActiveCall() === null, "the revoked Laptop never reached ACTIVE as Alice");
    assert(laptopReason === VoiceCallEndReason.REMOTE_HANGUP, "the Laptop's own stuck attempt is cleanly cancelled once Bob locks onto the Phone");
    console.log('✓ Section 4: REVOCATION MID-RING — the revoked Laptop\'s ACCEPT is silently ignored and never becomes the call; the still-authorized Phone answers normally, with zero new revocation-checking code');

    const phoneEnded2 = waitForCallEnded(phoneStack.voice, revokedCallId);
    bobStack.voice.endCall(revokedCallId);
    await phoneEnded2;
    await wait(50);
}

// ---------------------------------------------------------------------
// Section 5: DISCONNECT TOLERANCE — the Tablet finally comes online
// (authorized the whole time, per SETUP). A fresh call rings the Phone
// and the Tablet; the Tablet disconnects mid-ring, and only ITS OWN
// ringing attempt disappears — the Phone keeps ringing, untouched.
// ---------------------------------------------------------------------
let tabletToBob;
let disconnectCallId;
{
    const paired = await pairDeviceWithHub(tabletConnect, bobConnect);
    tabletToBob = paired.deviceConnectedPeer;
    const tabletStack = makeVoiceStack(tablet, tabletConnect.registry);
    // The Tablet is a brand-new device, connecting for the very first
    // time — like the Laptop before it, it needs its OWN local friendship
    // with Bob before Bob's INVITE will pass its eligibility check; see
    // `seedFriendship()`'s own header on why this is seeded rather than
    // replayed through a handshake that cannot complete twice for Bob.
    seedFriendship(tabletStack.friendsStorage, 'Alice-Tablet', bob.identity);

    const phoneIncoming = waitForIncomingCall(phoneStack.voice);
    const tabletIncoming = waitForIncomingCall(tabletStack.voice);
    disconnectCallId = bobStack.voice.startCallToIdentity(alice.identity.identityId);
    await Promise.all([phoneIncoming, tabletIncoming]);
    assert(phoneStack.voice.getActiveCall().state === VoiceSessionState.RINGING, 'setup: Phone RINGING');
    assert(tabletStack.voice.getActiveCall().state === VoiceSessionState.RINGING, 'setup: Tablet RINGING (now online for the first time)');

    const tabletEnded = waitForCallEnded(tabletStack.voice, disconnectCallId);
    tabletToBob.close();
    const tabletReason = await tabletEnded;
    assert(tabletReason === VoiceCallEndReason.PEER_DISCONNECTED, "the Tablet's own ringing call ends as PEER_DISCONNECTED, not a hangup");

    await wait(100);
    assert(bobStack.voice.getActiveCall() && bobStack.voice.getActiveCall().state === VoiceSessionState.CALLING,
        "Bob's call survives the Tablet's disconnect — the Phone is still a live candidate");
    assert(phoneStack.voice.getActiveCall() && phoneStack.voice.getActiveCall().state === VoiceSessionState.RINGING,
        "the Phone's own ringing call is completely untouched by the Tablet disconnecting");
    console.log('✓ Section 5: DISCONNECT TOLERANCE — one candidate disconnecting mid-ring removes only its OWN ringing attempt; the other candidate keeps ringing');

    // ---------------------------------------------------------------------
    // Section 6: NO RESURRECTION ON RECONNECT — the Tablet reconnects on a
    // brand-new connection and must be confirmed idle, never rejoining the
    // call it was cut out of.
    // ---------------------------------------------------------------------
    const reconnected = await pairDeviceWithHub(tabletConnect, bobConnect);
    await wait(50);
    assert(tabletStack.voice.getActiveCall() === null, 'NO RESURRECTION: the reconnected Tablet is IDLE — its new connection carries no memory of the call it was disconnected from');
    console.log('✓ Section 6: NO RESURRECTION — a reconnected candidate starts genuinely fresh, never rejoining an old call');

    reconnected.deviceConnectedPeer.close();
}

// Clean up the still-ringing Phone so the suite ends with everything idle.
{
    const bobEnded = waitForCallEnded(bobStack.voice, disconnectCallId);
    const phoneEnded = waitForCallEnded(phoneStack.voice, disconnectCallId);
    bobStack.voice.endCall(disconnectCallId);
    await Promise.all([bobEnded, phoneEnded]);
    assert(bobStack.voice.getActiveCall() === null && phoneStack.voice.getActiveCall() === null && laptopStack.voice.getActiveCall() === null,
        'FINAL: every device is cleanly idle at the end of the flagship scenario');
}

console.log('\nAll multi-device voice ringing tests passed.');
}

await runTests();
