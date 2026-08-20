import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { PeerAuthenticationSession } from '../peer/PeerAuthenticationSession.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { ConnectedPeer } from '../application/ConnectedPeer.js';
import { ConnectedPeerRegistry } from '../application/ConnectedPeerRegistry.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { DeviceAuthorizationPropagationUseCase } from '../application/DeviceAuthorizationPropagationUseCase.js';
import { PeerRelationshipUseCase } from '../application/PeerRelationshipUseCase.js';
import { FriendRelationshipUseCase } from '../application/FriendRelationshipUseCase.js';
import { ConversationStore } from '../application/ConversationStore.js';
import { ChatOutbox } from '../application/ChatOutbox.js';
import { ConversationReadTracker } from '../application/ConversationReadTracker.js';
import { PeerPresenceUseCase } from '../application/PeerPresenceUseCase.js';

// 0.2.85 — Multi-Device Presence Semantics.
//
// 0.2.78/0.2.79 taught friendship/chat/voice to resolve a live
// connection to its SOCIAL identity (a parent identity's own key, or an
// authorized DEVICE speaking for it) instead of matching a connection's
// raw key. application/PeerPresenceUseCase.js was the one 0.2.79-era
// social surface left behind — it still matched raw keys only, so "is
// Alice online" could not see a connection from her Phone or Laptop at
// all, only one whose own key happened to equal her parent identity's.
//
// This file proves the fix, using the IDENTICAL harness
// tests/MultiDeviceSocialSemantics.test.js already established (real
// LocalIdentityProvider instances standing in for physically distinct
// devices, real peer/PeerAuthenticationSession.js handshakes over
// peer/LocalPeerConnectionProvider.js, a real
// DeviceAuthorizationPropagationUseCase whose resolveConnectionIdentity()
// is wired straight into PeerPresenceUseCase's own new
// `resolveSocialIdentity` collaborator) — extended with the one thing
// that file didn't need: a full presence stack.
//
//   Section A: aggregation — two of Alice's devices online at once is
//              ONE identity presence, not two; a stale disconnect on
//              one of several live connections never flips the other
//   Section B: SECURITY FLAGSHIP — revoking a device mid-session
//              rejects ITS presence contribution while the other
//              device, untouched, keeps Alice online
//   Section C: multiple simultaneous connections from the SAME device
//              never inflate the device count, and closing one of them
//              never drops presence while the other survives
//   Section D: without a real resolveSocialIdentity injected (the
//              default), presence behaves exactly as it always did —
//              DIRECT-only, byte-identical to pre-0.2.85

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

// Mirrors tests/MultiDeviceSocialSemantics.test.js's own makeDevice()
// exactly — one independent LocalIdentityProvider instance standing in
// for one physically distinct device.
function makeDevice(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return { provider, identity };
}

// Mirrors tests/MultiDeviceSocialSemantics.test.js's own
// connectAndAuthenticate() exactly.
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

// One device's own full presence stack — the SAME
// DeviceAuthorizationPropagationUseCase#resolveConnectionIdentity()
// wiring tests/MultiDeviceSocialSemantics.test.js's own makeSocialStack()
// already established, extended with the collaborators
// application/PeerPresenceUseCase.js itself requires. `resolveSocialIdentity`
// is optional so Section D can build a stack that deliberately omits it.
function makePresenceStack(device, { withDeviceResolution = true } = {}) {
    const peerMessageBus = new PeerMessageBus();
    const connectedPeerRegistry = new ConnectedPeerRegistry();
    const deviceAuth = new DeviceAuthorizationPropagationUseCase(new InMemoryStorageProvider(), device.provider, {
        peerMessageBus, connectedPeerRegistry
    });
    const resolveSocialIdentity = withDeviceResolution
        ? (connectedPeer) => deviceAuth.resolveConnectionIdentity(connectedPeer)
        : undefined;
    const peerRelationshipUseCase = new PeerRelationshipUseCase(new InMemoryStorageProvider(), device.provider);
    const friendRelationshipUseCase = new FriendRelationshipUseCase(new InMemoryStorageProvider(), device.provider, {
        peerMessageBus, connectedPeerRegistry, resolveSocialIdentity
    });
    const conversationStore = new ConversationStore(new InMemoryStorageProvider(), device.provider);
    const chatOutbox = new ChatOutbox(new InMemoryStorageProvider(), device.provider);
    const conversationReadTracker = new ConversationReadTracker(new InMemoryStorageProvider(), device.provider);
    const presence = new PeerPresenceUseCase({
        connectedPeerRegistry,
        peerRelationshipUseCase,
        friendRelationshipUseCase,
        conversationStore,
        chatOutbox,
        conversationReadTracker,
        resolveSocialIdentity
    });
    return { device, connectedPeerRegistry, deviceAuth, presence };
}

async function runTests() {

// ---------------------------------------------------------------------
// Section A: aggregation, disconnect tolerance, reconnection
// ---------------------------------------------------------------------
{
    const network = new LocalPeerNetwork();
    const alice = makeDevice('Alice');
    const phone = makeDevice('Alice-Phone');
    const laptop = makeDevice('Alice-Laptop');
    const bob = makeDevice('Bob');

    const grantPhone = alice.provider.authorizeDevice(alice.identity.identityId, phone.identity.identityId, phone.identity.publicKey, { deviceLabel: 'Phone' });
    const grantLaptop = alice.provider.authorizeDevice(alice.identity.identityId, laptop.identity.identityId, laptop.identity.publicKey, { deviceLabel: 'Laptop' });

    const bobStack = makePresenceStack(bob);
    const aliceStack = makePresenceStack(alice);

    // Alice's own primary identity connects to Bob directly and
    // broadcasts both signed grants, exactly like
    // tests/MultiDeviceSocialSemantics.test.js's own setup.
    const { peerA: aliceToBob, peerB: bobFromAlice } = await connectAndAuthenticate(network, 'alice', alice, 'bob-for-alice', bob);
    aliceStack.connectedPeerRegistry.add(aliceToBob);
    bobStack.connectedPeerRegistry.add(bobFromAlice);
    aliceStack.deviceAuth.broadcastAuthorization(grantPhone);
    aliceStack.deviceAuth.broadcastAuthorization(grantLaptop);
    await wait(100);
    assert(bobStack.deviceAuth.getDeviceAuthority(alice.identity.identityId, phone.identity.identityId).isAuthorized, 'setup: Bob independently verified the Phone\'s authorization');
    assert(bobStack.deviceAuth.getDeviceAuthority(alice.identity.identityId, laptop.identity.identityId).isAuthorized, 'setup: Bob independently verified the Laptop\'s authorization');

    let summary = bobStack.presence.getSummary(alice.identity.identityId);
    assert(summary.isConnectedNow === true, 'Alice\'s own primary connection already counts as one live device');
    assert(summary.connectedDeviceCount === 1, 'exactly one device (Alice\'s own primary identity) is live so far');

    // Alice's Phone connects to Bob on an entirely separate connection.
    const { peerB: bobFromPhone } = await connectAndAuthenticate(network, 'phone', phone, 'bob-for-phone', bob);
    bobStack.connectedPeerRegistry.add(bobFromPhone);
    summary = bobStack.presence.getSummary(alice.identity.identityId);
    assert(summary.isConnectedNow === true, 'Phone Presence: identity presence stays true');
    assert(summary.connectedDeviceCount === 2, 'Phone Presence: connectedDeviceCount grows to 2 (primary + Phone), never a per-connection count of raw peers');
    assert(summary.connectedDeviceIdentityIds.includes(phone.identity.identityId), 'the Phone\'s own raw key is named in connectedDeviceIdentityIds');

    // Alice's Laptop connects too — a THIRD independent connection.
    const { peerB: bobFromLaptop } = await connectAndAuthenticate(network, 'laptop', laptop, 'bob-for-laptop', bob);
    bobStack.connectedPeerRegistry.add(bobFromLaptop);
    summary = bobStack.presence.getSummary(alice.identity.identityId);
    assert(summary.connectedDeviceCount === 3, 'Laptop Presence: all three of Alice\'s live devices (primary, Phone, Laptop) are counted');
    console.log('✓ Section A.1: two authorized devices plus Alice\'s own primary connection all aggregate into ONE identity presence');

    // Alice's own primary connection drops — a stale disconnect on ONE
    // of several live connections must never flip presence to offline.
    bobFromAlice.close();
    summary = bobStack.presence.getSummary(alice.identity.identityId);
    assert(summary.isConnectedNow === true, 'stale disconnect: Alice\'s primary connection dropping does NOT make her offline — Phone and Laptop are still live');
    assert(summary.connectedDeviceCount === 2, 'stale disconnect: connectedDeviceCount correctly drops to 2 (Phone + Laptop)');

    // The Phone disconnects too.
    bobFromPhone.close();
    summary = bobStack.presence.getSummary(alice.identity.identityId);
    assert(summary.isConnectedNow === true, 'Phone disconnecting still leaves the Laptop online — Alice remains ONLINE');
    assert(summary.connectedDeviceCount === 1, 'connectedDeviceCount correctly drops to 1 (Laptop only)');
    assert(summary.connectedDeviceIdentityIds[0] === laptop.identity.identityId, 'the one remaining live device is named as the Laptop');
    console.log('✓ Section A.2: disconnecting one of several live devices never flips identity presence offline — only the LAST one does');

    // The Laptop disconnects — now genuinely nobody of Alice's is live.
    bobFromLaptop.close();
    summary = bobStack.presence.getSummary(alice.identity.identityId);
    assert(summary.isConnectedNow === false, 'every one of Alice\'s devices disconnected — Alice is OFFLINE');
    assert(summary.connectedDeviceCount === 0, 'connectedDeviceCount is 0 once nothing is live');
    assert(summary.lifecycleState === null, 'lifecycleState reads null, never a fabricated DISCONNECTED value');
    console.log('✓ Section A.3: the LAST device disconnecting is what actually flips identity presence offline');

    // The Laptop reconnects on a brand-new connection.
    const { peerB: bobFromLaptopAgain } = await connectAndAuthenticate(network, 'laptop-again', laptop, 'bob-for-laptop-again', bob);
    bobStack.connectedPeerRegistry.add(bobFromLaptopAgain);
    summary = bobStack.presence.getSummary(alice.identity.identityId);
    assert(summary.isConnectedNow === true, 'reconnecting the Laptop brings Alice back ONLINE');
    assert(summary.connectedDeviceCount === 1, 'connectedDeviceCount reflects exactly the one reconnected device');
    assert(bobStack.presence.findConnectedPeer(alice.identity.identityId) === bobFromLaptopAgain, 'findConnectedPeer() resolves to the live Laptop connection');
    console.log('✓ Section A.4: reconnection brings identity presence back online, tracked through the SAME resolved-identity lookup');
}

// ---------------------------------------------------------------------
// Section B: SECURITY FLAGSHIP — revocation mid-session
// ---------------------------------------------------------------------
{
    const network = new LocalPeerNetwork();
    const alice = makeDevice('Alice');
    const phone = makeDevice('Alice-Phone');
    const laptop = makeDevice('Alice-Laptop');
    const bob = makeDevice('Bob');

    const grantPhone = alice.provider.authorizeDevice(alice.identity.identityId, phone.identity.identityId, phone.identity.publicKey, { deviceLabel: 'Phone' });
    const grantLaptop = alice.provider.authorizeDevice(alice.identity.identityId, laptop.identity.identityId, laptop.identity.publicKey, { deviceLabel: 'Laptop' });

    const bobStack = makePresenceStack(bob);
    const aliceStack = makePresenceStack(alice);
    const { peerA: aliceToBob, peerB: bobFromAlice } = await connectAndAuthenticate(network, 'alice', alice, 'bob-for-alice', bob);
    aliceStack.connectedPeerRegistry.add(aliceToBob);
    bobStack.connectedPeerRegistry.add(bobFromAlice);
    aliceStack.deviceAuth.broadcastAuthorization(grantPhone);
    aliceStack.deviceAuth.broadcastAuthorization(grantLaptop);
    await wait(100);

    const { peerB: bobFromPhone } = await connectAndAuthenticate(network, 'phone', phone, 'bob-for-phone', bob);
    bobStack.connectedPeerRegistry.add(bobFromPhone);
    const { peerB: bobFromLaptop } = await connectAndAuthenticate(network, 'laptop', laptop, 'bob-for-laptop', bob);
    bobStack.connectedPeerRegistry.add(bobFromLaptop);

    let aliceSummary = bobStack.presence.getSummary(alice.identity.identityId);
    assert(aliceSummary.connectedDeviceCount === 3, 'setup: Alice\'s primary + Phone + Laptop are all live');

    // Alice revokes the Laptop mid-session — its raw connection stays
    // fully, genuinely AUTHENTICATED throughout (revocation never
    // touches key possession, exactly like 0.2.78/0.2.79's own security
    // flagships) but its presence contribution to ALICE must stop the
    // instant Bob learns of the revocation.
    const revocation = alice.provider.revokeDeviceAuthorization(alice.identity.identityId, laptop.identity.identityId);
    aliceStack.deviceAuth.broadcastRevocation(revocation);
    await wait(100);
    assert(!bobStack.deviceAuth.resolvePeerAuthority(bobFromLaptop, alice.identity.identityId).authorized, 'sanity: Bob has learned of the revocation');

    aliceSummary = bobStack.presence.getSummary(alice.identity.identityId);
    assert(aliceSummary.isConnectedNow === true, 'SECURITY FLAGSHIP: Alice remains ONLINE — her primary connection and Phone are untouched by revoking the Laptop');
    assert(aliceSummary.connectedDeviceCount === 2, 'SECURITY FLAGSHIP: connectedDeviceCount drops to 2 the instant the Laptop\'s authorization is revoked — its connection no longer contributes to Alice\'s presence at all');
    assert(!aliceSummary.connectedDeviceIdentityIds.includes(laptop.identity.identityId), 'the revoked Laptop\'s raw key no longer appears among Alice\'s live devices');

    // The connection itself never died — it now resolves as its own
    // bare, un-authorized identity, exactly the way
    // tests/MultiDeviceSocialSemantics.test.js's own security flagship
    // already proved for chat.
    assert(bobFromLaptop.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'the Laptop\'s connection is still genuinely authenticated — revocation never touches key possession');
    const laptopOwnSummary = bobStack.presence.getSummary(laptop.identity.identityId);
    assert(laptopOwnSummary.isConnectedNow === true, 'the Laptop\'s connection now presents as ITS OWN bare identity, still genuinely online — revocation is a social-authority fact, never a connection-liveness fact');
    console.log('✓ Section B: SECURITY FLAGSHIP — revoking one device rejects its presence contribution to the parent identity instantly, while the OTHER device, untouched, keeps Alice online; the revoked device\'s own connection stays honestly, separately online as itself');
}

// ---------------------------------------------------------------------
// Section C: multiple simultaneous connections from the SAME device
// ---------------------------------------------------------------------
{
    const network = new LocalPeerNetwork();
    const phone = makeDevice('Alice-Phone');
    const bob = makeDevice('Bob');

    const bobStack = makePresenceStack(bob);

    // The SAME device (one LocalIdentityProvider, one key) opens TWO
    // independent connections to Bob — a realistic "the app reconnected
    // before the old socket actually died" scenario.
    const { peerB: connectionA } = await connectAndAuthenticate(network, 'phone-a', phone, 'bob-for-phone-a', bob);
    bobStack.connectedPeerRegistry.add(connectionA);
    const { peerB: connectionB } = await connectAndAuthenticate(network, 'phone-b', phone, 'bob-for-phone-b', bob);
    bobStack.connectedPeerRegistry.add(connectionB);

    let summary = bobStack.presence.getSummary(phone.identity.identityId);
    assert(summary.isConnectedNow === true, 'two connections from the same device: online');
    assert(summary.connectedDeviceCount === 1, 'two RAW connections from the SAME device count as exactly ONE live device, never two');

    connectionA.close();
    summary = bobStack.presence.getSummary(phone.identity.identityId);
    assert(summary.isConnectedNow === true, 'closing one of two connections from the same device: still online via the other');
    assert(summary.connectedDeviceCount === 1, 'connectedDeviceCount stays 1 — this is still the same one device, seen through its remaining connection');

    connectionB.close();
    summary = bobStack.presence.getSummary(phone.identity.identityId);
    assert(summary.isConnectedNow === false, 'closing the LAST connection from the device: now genuinely offline');
    console.log('✓ Section C: multiple simultaneous connections from one physical device never inflate the device count, and a stale one closing never flips presence while a live one remains');
}

// ---------------------------------------------------------------------
// Section D: omitting resolveSocialIdentity preserves pre-0.2.85 behavior
// ---------------------------------------------------------------------
{
    const network = new LocalPeerNetwork();
    const alice = makeDevice('Alice');
    const phone = makeDevice('Alice-Phone');
    const bob = makeDevice('Bob');

    alice.provider.authorizeDevice(alice.identity.identityId, phone.identity.identityId, phone.identity.publicKey, { deviceLabel: 'Phone' });

    // Bob's presence stack deliberately omits resolveSocialIdentity —
    // the default (application/SocialIdentityResolver.js#resolveDirectSocialIdentity)
    // never resolves a device to its parent, exactly matching every
    // caller's behavior before this milestone.
    const bobStack = makePresenceStack(bob, { withDeviceResolution: false });

    const { peerB: bobFromPhone } = await connectAndAuthenticate(network, 'phone', phone, 'bob-for-phone', bob);
    bobStack.connectedPeerRegistry.add(bobFromPhone);

    const aliceSummary = bobStack.presence.getSummary(alice.identity.identityId);
    assert(aliceSummary.isConnectedNow === false, 'without a real resolver, a connection from an authorized DEVICE never counts toward the PARENT identity\'s presence — pre-0.2.85 behavior, unchanged');

    const phoneSummary = bobStack.presence.getSummary(phone.identity.identityId);
    assert(phoneSummary.isConnectedNow === true, 'the connection still counts toward its own raw, literally-authenticated key, exactly as it always did');
    console.log('✓ Section D: omitting resolveSocialIdentity keeps PeerPresenceUseCase byte-identical to its pre-0.2.85 behavior');
}

console.log('\nAll multi-device presence semantics tests passed.');
}

await runTests();
