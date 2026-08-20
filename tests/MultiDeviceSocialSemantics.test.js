import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { PeerAuthenticationSession } from '../peer/PeerAuthenticationSession.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { ConnectedPeer } from '../application/ConnectedPeer.js';
import { ConnectedPeerRegistry } from '../application/ConnectedPeerRegistry.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { DeviceAuthorizationPropagationUseCase } from '../application/DeviceAuthorizationPropagationUseCase.js';
import { FriendRelationshipUseCase } from '../application/FriendRelationshipUseCase.js';
import { FriendshipState } from '../core/FriendshipState.js';
import { ChatUseCase } from '../application/ChatUseCase.js';

// 0.2.79 — Multi-Device Social State Semantics.
//
// 0.2.78 proved the CRYPTOGRAPHIC model: a device is just another
// LocalIdentity, and a signed, revocable authorization link lets a
// receiver resolve a live connection as DIRECT or DEVICE
// (application/DeviceAuthorizationPropagationUseCase.js#resolvePeerAuthority()).
// It deliberately went no further — that resolution was proven correct
// in isolation but consulted by nothing else in this codebase.
//
// This file proves the SOCIAL consequence the design doc asked for:
// "Device authorization changes peer authority, NOT social identity."
// Friendship, chat eligibility, and conversation history now key off the
// RESOLVED social identity of a connected peer
// (application/DeviceAuthorizationPropagationUseCase.js#resolveConnectionIdentity(),
// this milestone's own new query) rather than the raw, literally-
// authenticated key — see application/FriendRelationshipUseCase.js's and
// application/ChatUseCase.js's own 0.2.79 headers.
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

// Mirrors tests/MultiDeviceIdentity.test.js's own makeDevice() exactly —
// one independent LocalIdentityProvider instance standing in for one
// physically distinct device.
function makeDevice(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return { provider, identity };
}

// Mirrors tests/MultiDeviceIdentity.test.js's own connectAndAuthenticate()
// exactly — a real, in-process peer/PeerAuthenticationSession.js
// handshake over a fresh peer/LocalPeerConnectionProvider.js connection.
async function connectAndAuthenticate(network, addressA, deviceA, addressB, deviceB) {
    const transportA = new LocalPeerConnectionProvider(addressA, network);
    const transportB = new LocalPeerConnectionProvider(addressB, network);
    let incomingB = null;
    const unsubscribe = transportB.onIncomingConnection((connection) => { incomingB = connection; });
    const connectionA = transportA.connect(addressB);
    await wait();
    unsubscribe();
    assert(incomingB, `connectAndAuthenticate: ${addressB} never saw an incoming connection from ${addressA}`);

    const sessionA = new PeerAuthenticationSession({ connection: connectionA, identityProvider: deviceA.provider });
    const sessionB = new PeerAuthenticationSession({ connection: incomingB, identityProvider: deviceB.provider });
    sessionA.start();
    sessionB.start();
    await wait(10);
    assert(sessionA.isAuthenticated && sessionB.isAuthenticated, `connectAndAuthenticate: ${addressA} <-> ${addressB} did not reach AUTHENTICATED`);

    return {
        peerA: new ConnectedPeer({ connection: connectionA, authenticationSession: sessionA }),
        peerB: new ConnectedPeer({ connection: incomingB, authenticationSession: sessionB })
    };
}

// One device's own full social stack, wired the IDENTICAL way ui/main.js
// wires the real app: a DeviceAuthorizationPropagationUseCase whose
// resolveConnectionIdentity() is bound straight into
// FriendRelationshipUseCase/ChatUseCase's own `resolveSocialIdentity`
// collaborator — see this file's own header, and each of those classes'
// own 0.2.79 header.
function makeSocialStack(device) {
    const peerMessageBus = new PeerMessageBus();
    const connectedPeerRegistry = new ConnectedPeerRegistry();
    const deviceAuth = new DeviceAuthorizationPropagationUseCase(new InMemoryStorageProvider(), device.provider, {
        peerMessageBus, connectedPeerRegistry
    });
    const resolveSocialIdentity = (connectedPeer) => deviceAuth.resolveConnectionIdentity(connectedPeer);
    const friends = new FriendRelationshipUseCase(new InMemoryStorageProvider(), device.provider, {
        peerMessageBus, connectedPeerRegistry, resolveSocialIdentity
    });
    const chat = new ChatUseCase(device.provider, {
        peerMessageBus, connectedPeerRegistry, friendRelationshipUseCase: friends, resolveSocialIdentity
    });
    return { device, peerMessageBus, connectedPeerRegistry, deviceAuth, friends, chat };
}

async function runTests() {

// ---------------------------------------------------------------------
// FLAGSHIP — Alice authorizes two devices (Phone, Laptop). Bob befriends
// Alice via one of her devices; his resulting FriendshipRecord is keyed
// to ALICE'S OWN PARENT identity, never the device's raw key — so the
// OTHER device, never having sent a friend request of its own, is
// ALREADY recognized as speaking for an existing friend. Chat messages
// from either device land in ONE shared conversation, each still
// carrying its own true device provenance. Revoking one device rejects
// it outright while the other, untouched, keeps working.
// ---------------------------------------------------------------------
{
    const network = new LocalPeerNetwork();
    const alice = makeDevice('Alice');
    const phone = makeDevice('Alice-Phone');
    const laptop = makeDevice('Alice-Laptop');
    const bob = makeDevice('Bob');

    // Alice authorizes both devices entirely locally, before either ever
    // connects to Bob — mirrors tests/MultiDeviceIdentity.test.js's own
    // flagship setup exactly.
    const grantPhone = alice.provider.authorizeDevice(alice.identity.identityId, phone.identity.identityId, phone.identity.publicKey, { deviceLabel: 'Phone' });
    const grantLaptop = alice.provider.authorizeDevice(alice.identity.identityId, laptop.identity.identityId, laptop.identity.publicKey, { deviceLabel: 'Laptop' });

    const bobStack = makeSocialStack(bob);
    const aliceStack = makeSocialStack(alice);

    // Alice's own PRIMARY identity connects to Bob directly (DIRECT mode)
    // and broadcasts both signed grants — the exact propagation path
    // tests/MultiDeviceIdentity.test.js's own flagship already proves in
    // isolation; reused here purely as setup.
    const { peerA: aliceToBob, peerB: bobFromAlice } = await connectAndAuthenticate(network, 'alice', alice, 'bob-for-alice', bob);
    aliceStack.connectedPeerRegistry.add(aliceToBob);
    bobStack.connectedPeerRegistry.add(bobFromAlice);
    aliceStack.deviceAuth.broadcastAuthorization(grantPhone);
    aliceStack.deviceAuth.broadcastAuthorization(grantLaptop);
    await wait(100);
    assert(bobStack.deviceAuth.getDeviceAuthority(alice.identity.identityId, phone.identity.identityId).isAuthorized, "Bob independently verified and stored the Phone's authorization");
    assert(bobStack.deviceAuth.getDeviceAuthority(alice.identity.identityId, laptop.identity.identityId).isAuthorized, "Bob independently verified and stored the Laptop's authorization");
    console.log('✓ setup: Bob has independently learned and verified both of Alice\'s device authorizations');

    // Alice's Phone connects to Bob on an ENTIRELY SEPARATE connection —
    // an ordinary peer/PeerAuthenticationSession.js handshake proving
    // only possession of the Phone's OWN key, nothing more — and sends
    // Bob a friend request exactly like any brand-new identity would.
    const phoneStack = makeSocialStack(phone);
    const { peerA: phoneToBob, peerB: bobFromPhone } = await connectAndAuthenticate(network, 'phone', phone, 'bob-for-phone', bob);
    phoneStack.connectedPeerRegistry.add(phoneToBob);
    bobStack.connectedPeerRegistry.add(bobFromPhone);

    phoneStack.friends.sendFriendRequest(phoneToBob);
    await wait(50);
    assert(bobStack.friends.getState(alice.identity.identityId) === FriendshipState.REQUESTED,
        "Bob's INCOMING request, sent from the Phone's own raw key, is already recorded against ALICE'S OWN PARENT identity — not the Phone's key");
    bobStack.friends.acceptFriendRequest(bobFromPhone);
    await wait(50);

    assert(bobStack.friends.getState(alice.identity.identityId) === FriendshipState.FRIEND,
        "Bob's friendship, formed over the PHONE's connection, resolves under ALICE'S OWN PARENT identity — 'Conversation(Alice, Bob)', never 'Conversation(AlicePhone, Bob)'");
    assert(bobStack.friends.getRelationships().length === 1, 'exactly ONE FriendshipRecord exists on Bob\'s side, never one per device');
    assert(phoneStack.friends.getState(bob.identity.identityId) === FriendshipState.FRIEND, "the Phone's OWN local record (from ITS OWN raw-key perspective — Bob has no devices) also reached FRIEND");
    console.log('✓ FLAGSHIP: Alice\'s Phone friends Bob; Bob\'s resulting FriendshipRecord is keyed to ALICE\'S PARENT identity, never the Phone\'s own raw key');

    // Alice's Laptop now connects to Bob on a THIRD, independent
    // connection. It has NEVER sent Bob a friend request of its own —
    // yet Bob's own eligibility check, resolving THIS connection through
    // the SAME device-authorization knowledge, already sees a FRIEND.
    const laptopStack = makeSocialStack(laptop);
    const { peerB: bobFromLaptop } = await connectAndAuthenticate(network, 'laptop', laptop, 'bob-for-laptop', bob);
    bobStack.connectedPeerRegistry.add(bobFromLaptop);
    assert(bobStack.chat.canChat(bobStack.deviceAuth.resolveConnectionIdentity(bobFromLaptop).identityId),
        "Bob already considers the Laptop's resolved identity (Alice's own parent) a friend — no second, per-device friend request was ever needed");
    console.log('✓ FLAGSHIP: the Laptop, never having friended Bob itself, is ALREADY recognized as an authorized device of an existing friend — "we should NOT create Alice Laptop <-> Bob = friendship #2"');

    // ---- CHAT: messages from either direction land in ONE conversation ----
    phoneStack.chat.sendMessage(phoneToBob, 'hi from my phone');
    await wait(50);
    // Bob replies — addressed to whichever live connection he has for
    // "Alice" (here, explicitly the Laptop's) — authorized purely by the
    // ALREADY-established parent-identity friendship, with zero action
    // required from the Laptop itself.
    bobStack.chat.sendMessage(bobFromLaptop, 'got your message, Alice');
    await wait(50);

    const bobsConversation = bobStack.chat.getConversation(alice.identity.identityId);
    assert(bobsConversation.length === 2, 'both directions of traffic — one from each of Alice\'s devices\' connections — landed in ONE conversation, bucketed under Alice\'s own parent identity');
    assert(bobsConversation[0].direction === 'incoming' && bobsConversation[0].senderIdentity === phone.identity.identityId,
        'the incoming message still carries its own true DEVICE PROVENANCE — literally the Phone\'s own raw, authenticated key — even though it is filed under Alice, with zero schema changes');
    assert(bobStack.chat.getConversations().length === 1, 'Bob has exactly ONE conversation with Alice, never a second one per device');
    console.log('✓ FLAGSHIP: "Conversation(Alice, Bob)," never "Conversation(AlicePhone, Bob)" — device provenance survives per-message, with no new field required');

    // ---- SECURITY FLAGSHIP: revoke the Phone; it is REJECTED, the Laptop is NOT ----
    await wait(5);
    const revocation = alice.provider.revokeDeviceAuthorization(alice.identity.identityId, phone.identity.identityId);
    aliceStack.deviceAuth.broadcastRevocation(revocation);
    await wait(100);
    assert(!bobStack.deviceAuth.resolvePeerAuthority(bobFromPhone, alice.identity.identityId).authorized, 'sanity: Bob has learned of the revocation');

    // The Phone's own local eligibility (its OWN completed friendship
    // with Bob's raw key) is untouched by a PARENT-level revocation it
    // has no way to know about — see application/ChatUseCase.js's own
    // 0.2.79 header, "authentication and social identity are resolved
    // independently on each side." The send is attempted and reaches the
    // wire; the real security boundary is Bob's own RECEIVING side.
    phoneStack.chat.sendMessage(phoneToBob, 'can you still hear me?');
    await wait(50);
    assert(bobStack.chat.getConversation(alice.identity.identityId).length === 2,
        "SECURITY FLAGSHIP: once revoked, the Phone's connection resolves to its OWN bare, un-friended raw key on Bob's RECEIVING side — REJECTED. Bob's conversation with Alice is unchanged");

    // The Laptop, never revoked, remains fully authorized throughout —
    // one device's revocation never touches another's, independently
    // authorized standing.
    bobStack.chat.sendMessage(bobFromLaptop, 'still there, Alice?');
    await wait(50);
    assert(bobStack.chat.getConversation(alice.identity.identityId).length === 3,
        'the Laptop, never revoked, remains authorized throughout — ACCEPTED, landing in the SAME Alice/Bob conversation as before');
    console.log('✓ SECURITY FLAGSHIP: revoking one device REJECTS its future traffic while the OTHER device, never revoked, is completely unaffected — device revocation ≠ social block, social block ≠ device revocation');

    // Proof the Phone's KEY itself is entirely untouched — only its
    // PARENT authorization is gone — mirrors tests/MultiDeviceIdentity
    // .test.js's own SECURITY FLAGSHIP B.
    assert(phoneToBob.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, "the Phone's connection is still, and remains, genuinely authenticated — revocation never touches key possession");
    console.log('✓ the Phone still authenticates perfectly normally throughout — authentication and social authority remain independent facts, exactly as 0.2.78 established');
}

console.log('\nAll multi-device social semantics tests passed.');
console.log('Note (deliberately not solved here, see docs/Roadmap.md 0.2.79): a device that never');
console.log('independently completes its OWN friend-request/accept cycle cannot pass its OWN local');
console.log('sendMessage() eligibility check on its OWN account — application/FriendRelationshipUseCase.js');
console.log('has no verb for "additionally acknowledge a second device of an already-FRIEND parent identity"');
console.log('once the first device\'s ACCEPT is already recorded. Receivers correctly recognize an unacknowledged');
console.log('device (this file\'s own Laptop, receiving and being sent to, never sending itself); a device');
console.log('independently INITIATING chat still needs its own completed handshake. Full cross-device');
console.log('friendship acknowledgment is real, substantial, deliberately deferred future work.');
}

await runTests();
