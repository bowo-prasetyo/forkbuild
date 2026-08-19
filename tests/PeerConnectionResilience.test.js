import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerRelationshipUseCase } from '../application/PeerRelationshipUseCase.js';
import { PeerReconnectionUseCase } from '../application/PeerReconnectionUseCase.js';

// 0.2.62 — Peer Connection Resilience & Reconnection.
//
// "A persistent peer relationship should survive a transient connection
// failure, while the connection itself remains ephemeral." This file
// proves the two new pieces that make that true without ever weakening
// 0.2.49's own authentication guarantee:
//
//   application/ConnectToPeerUseCase.js — an optional `expectedIdentityId`
//   on connect()/attach(), checked ONLY after a connection genuinely
//   reaches AUTHENTICATED, that closes and reports (never silently
//   accepts) a connection that proves the wrong identity.
//
//   application/PeerReconnectionUseCase.js — the UI-facing "Reconnect"
//   gesture on a Known Peer: a fresh invitation, a fresh WebRTC
//   connection, a fresh handshake — application/PeerSessionManager.js
//   unmodified — tagged with the remembered identity this attempt
//   expects, and finally wiring 0.2.56's own long-dormant
//   noteAuthenticated() to the moment it was actually built for.
//
// Built over peer/LocalPeerConnectionProvider.js, the same real,
// in-process, bidirectional transport tests/PeerChat.test.js and
// tests/FriendshipRevocationAndBlocking.test.js already trust for this
// purpose; application/PeerSessionManager.js's own real-WebRTC
// createInvitation()/acceptInvitation() plumbing is already proven end
// to end by tests/PeerConnectionsUI.test.js and is untouched here beyond
// threading `expectedIdentityId` straight through — this file instead
// stands in a minimal, honestly-labeled fake PeerSessionManager over the
// SAME real ConnectToPeerUseCase/LocalPeerConnectionProvider pair, so
// application/PeerReconnectionUseCase.js's own real logic runs against
// real authentication, not a mock pretending to authenticate.

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

function makeDevice(label) {
    const storage = new InMemoryStorageProvider();
    const provider = new LocalIdentityProvider(storage);
    provider.login(label);
    return { storage, provider };
}

// Builds N fully independent devices sharing one LocalPeerNetwork, each
// with its own ConnectToPeerUseCase registry — the same harness
// tests/PeerChat.test.js's own connectDevices() already established.
function connectDevices(labels) {
    const network = new LocalPeerNetwork();
    const devices = {};
    for (const label of labels) {
        const { storage, provider } = makeDevice(label);
        const transport = new LocalPeerConnectionProvider(label, network);
        const connect = new ConnectToPeerUseCase({ peerConnectionProvider: transport, identityProvider: provider });
        devices[label] = { storage, identityProvider: provider, transport, connect, id: provider.getSigningIdentity().id };
    }
    return devices;
}

async function authenticate(a, b, options = {}) {
    const stopListening = b.connect.listen();
    const peerFromA = a.connect.connect({ candidateEndpoint: b.transport.address }, options);
    await wait(30);
    assert(peerFromA.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, `setup: ${a.identityProvider.currentUser().username}-${b.identityProvider.currentUser().username} authenticates`);
    const peerFromB = b.connect.registry.list().find((p) => p.remoteIdentity && p.remoteIdentity.identityId === a.id);
    return { stopListening, peerFromA, peerFromB };
}

// A minimal, honestly-labeled stand-in for application/
// PeerSessionManager.js's own createInvitation()/acceptInvitation()
// surface — the only two methods (plus onIdentityMismatch)
// application/PeerReconnectionUseCase.js ever calls on it. Unlike real
// WebRTC's asymmetric offer/answer handoff, peer/
// LocalPeerConnectionProvider.js's connect() is a single, synchronous,
// symmetric dial — so both fake methods below just dial the SAME
// pre-known target address. That asymmetry is exactly what
// tests/PeerConnectionsUI.test.js already exercises for real, over
// real WebRTC, unmodified by 0.2.62 beyond threading expectedIdentityId
// through; this fake exists only to drive PeerReconnectionUseCase's OWN
// logic against genuine authentication.
function makeFakeSessionManager(connect, targetAddress) {
    return {
        async createInvitation({ expectedIdentityId } = {}) {
            const connectedPeer = connect.connect({ candidateEndpoint: targetAddress }, { expectedIdentityId });
            return { invitation: { toJSON: () => ({ fake: true }), expiresAt: new Date(Date.now() + 60000) }, connectedPeer };
        },
        async acceptInvitation(_invitationInput, { expectedIdentityId } = {}) {
            const connectedPeer = connect.connect({ candidateEndpoint: targetAddress }, { expectedIdentityId });
            return { connectedPeer, reply: 'fake-reply' };
        },
        onIdentityMismatch(callback) { return connect.onIdentityMismatch(callback); }
    };
}

async function runTests() {

// ---------------------------------------------------------------------
// FLAGSHIP: a remembered relationship survives a disconnect; Reconnect
// re-authenticates from nothing, over a brand-new connection, and only
// THEN is treated as the same person again.
// ---------------------------------------------------------------------
{
    const { Alice, Bob } = connectDevices(['Alice', 'Bob']);
    const setup = await authenticate(Alice, Bob);
    const aliceBobIdentityId = Bob.id;

    const aliceRelationships = new PeerRelationshipUseCase(Alice.storage, Alice.identityProvider);
    const remembered = aliceRelationships.rememberPeer(setup.peerFromA.remoteIdentity, { alias: 'Bob' });
    const firstAuthenticatedAt = remembered.lastAuthenticatedAt;

    const originalConnectionId = setup.peerFromA.connectionId;
    setup.peerFromA.close();
    await wait(20);
    assert(Alice.connect.registry.get(originalConnectionId) === null, 'a closed connection disappears from the live registry');
    assert(Alice.connect.registry.list().length === 0, 'My Peers is empty once the only connection closes');

    const stillKnown = aliceRelationships.getRelationship(aliceBobIdentityId);
    assert(stillKnown !== null, 'the persistent relationship survives the disconnect untouched');
    assert(stillKnown.lastAuthenticatedAt.getTime() === firstAuthenticatedAt.getTime(), 'a disconnect alone never bumps lastAuthenticatedAt');
    console.log('✓ FLAGSHIP part 1: a closed connection disappears live, while the remembered relationship survives it');

    let mismatchCount = 0;
    const fakeSessionManager = makeFakeSessionManager(Alice.connect, Bob.transport.address);
    const reconnection = new PeerReconnectionUseCase({ peerSessionManager: fakeSessionManager, peerRelationshipUseCase: aliceRelationships });
    reconnection.onReconnectRejected(() => { mismatchCount += 1; });

    const { connectedPeer } = await reconnection.reconnectAsInviter(aliceBobIdentityId);
    await wait(30);

    assert(connectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'Reconnect re-authenticates a genuinely matching identity');
    assert(connectedPeer.remoteIdentity.identityId === aliceBobIdentityId, 'the fresh handshake proves the exact identity this device expected');
    assert(connectedPeer.connectionId !== originalConnectionId, 'Reconnect always opens a brand-new connection — a new connectionId, never a resurrected old one');
    assert(connectedPeer.alias === 'Bob', 'the pending/live connection is labeled with the remembered relationship\'s own local alias');
    assert(mismatchCount === 0, 'a genuinely matching reconnect never fires onReconnectRejected');

    const bumped = aliceRelationships.getRelationship(aliceBobIdentityId);
    assert(bumped.lastAuthenticatedAt.getTime() >= firstAuthenticatedAt.getTime(), 'a MATCHED reconnect finally wires 0.2.56\'s own noteAuthenticated() to bump lastAuthenticatedAt');
    assert(bumped.alias === 'Bob', 'noteAuthenticated never touches the alias');

    // Stale-incarnation regression: a late, duplicate close() on the OLD,
    // already-torn-down connection object must never be able to touch the
    // NEW connection's registry entry — application/
    // ConnectedPeerRegistry.js keys strictly by connectionId, and
    // peer/PeerAuthenticationSession.js's own HELLO/PROOF sessionNonce is
    // that exact same id, so an old connection's identity is structurally
    // incapable of referring to a new one.
    setup.peerFromA.connection.close();
    await wait(10);
    assert(Alice.connect.registry.get(connectedPeer.connectionId) === connectedPeer, 'a stale close() on an already-dead OLD connection never removes the NEW, live one');
    assert(connectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'the new connection stays AUTHENTICATED, unaffected by the old connection\'s own belated teardown');
    console.log('✓ FLAGSHIP part 2: Reconnect re-authenticates over a fresh connectionId, immune to stale events from the old one');

    setup.stopListening();
}

// ---------------------------------------------------------------------
// SECURITY FLAGSHIP: a valid invitation belonging to someone else must
// never be accepted as a reconnect to the identity this device actually
// remembers — even though the connection genuinely, honestly
// authenticates as exactly who it claims to be.
// ---------------------------------------------------------------------
{
    const three = connectDevices(['Alice2', 'Bob2', 'Charlie2']);
    const { Alice2: Alice, Bob2: Bob, Charlie2: Charlie } = three;
    const setup = await authenticate(Alice, Bob);
    Charlie.connect.listen();

    const relationships = new PeerRelationshipUseCase(Alice.storage, Alice.identityProvider);
    relationships.rememberPeer(setup.peerFromA.remoteIdentity, { alias: 'Bob' });
    const before = relationships.getRelationship(Bob.id);

    const rejected = [];
    const fakeSessionManagerToCharlie = makeFakeSessionManager(Alice.connect, Charlie.transport.address);
    const reconnection = new PeerReconnectionUseCase({ peerSessionManager: fakeSessionManagerToCharlie, peerRelationshipUseCase: relationships });
    reconnection.onReconnectRejected((detail) => rejected.push(detail));

    // Alice believes she is reconnecting to Bob (his remembered
    // identityId is what she asks for) — but the invitation actually in
    // hand leads to Charlie, an entirely real, honest identity that was
    // simply never who this attempt was for.
    const { connectedPeer } = await reconnection.reconnectAsInviter(Bob.id);
    await wait(30);

    assert(connectedPeer.getLifecycleState() === PeerLifecycleState.CLOSED, 'a connection that authenticates as the WRONG identity is closed, never left AUTHENTICATED');
    assert(rejected.length === 1, 'onReconnectRejected fires exactly once for the rejected attempt');
    assert(rejected[0].expectedIdentityId === Bob.id, 'the rejection reports who this device actually expected');
    assert(rejected[0].actualIdentityId === Charlie.id, 'the rejection reports who genuinely authenticated instead');
    assert(rejected[0].relationship.identityId === Bob.id, 'the rejection is attributed to the correct remembered relationship');
    assert(Alice.connect.registry.get(connectedPeer.connectionId) === null, 'the rejected connection never lingers in the live registry');
    assert(Charlie.connect.registry.list().length === 0, 'the far side (the honest, unrelated identity) also sees the connection close, not linger');

    const after = relationships.getRelationship(Bob.id);
    assert(after.lastAuthenticatedAt.getTime() === before.lastAuthenticatedAt.getTime(), 'a REJECTED reconnect never bumps the remembered relationship it was never actually for');
    assert(after.alias === 'Bob', 'a rejected reconnect leaves the remembered relationship completely untouched');
    console.log('✓ SECURITY FLAGSHIP: a valid invitation belonging to someone else authenticates honestly, and is still rejected as a reconnect to the identity this device actually remembers');

    // dispose() stops forwarding — a second identical mismatch after
    // dispose() must not reach the (now-torn-down) subscriber.
    reconnection.dispose();
    const { connectedPeer: secondAttempt } = await reconnection.reconnectAsInviter(Bob.id);
    await wait(30);
    assert(secondAttempt.getLifecycleState() === PeerLifecycleState.CLOSED, 'the underlying application/ConnectToPeerUseCase.js gate keeps working even after PeerReconnectionUseCase.dispose()');
    assert(rejected.length === 1, 'dispose() stops this PeerReconnectionUseCase from forwarding any further mismatch as its own onReconnectRejected event');
    console.log('✓ dispose() unsubscribes cleanly — no further onReconnectRejected after disposal');

    setup.stopListening();
}

// ---------------------------------------------------------------------
// An ORDINARY, first-time connection (no expectedIdentityId at all)
// is completely unaffected — the mismatch gate is strictly additive.
// ---------------------------------------------------------------------
{
    const { Dora, Eve } = connectDevices(['Dora', 'Eve']);
    let mismatchFired = false;
    Dora.connect.onIdentityMismatch(() => { mismatchFired = true; });
    const setup = await authenticate(Dora, Eve);
    assert(setup.peerFromA.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'a first-time connection authenticates normally');
    await wait(20);
    assert(mismatchFired === false, 'onIdentityMismatch never fires for a connection that never supplied an expectedIdentityId');
    setup.stopListening();
    console.log('✓ an ordinary first-time connection (no expectedIdentityId) is completely unaffected by 0.2.62\'s new gate');
}

// ---------------------------------------------------------------------
// PeerReconnectionUseCase refuses to reconnect to an identity this
// device never chose to remember in the first place.
// ---------------------------------------------------------------------
{
    const { Frank } = connectDevices(['Frank']);
    const relationships = new PeerRelationshipUseCase(Frank.storage, Frank.identityProvider);
    const reconnection = new PeerReconnectionUseCase({
        peerSessionManager: makeFakeSessionManager(Frank.connect, 'nowhere'),
        peerRelationshipUseCase: relationships
    });
    let threw = false;
    try {
        await reconnection.reconnectAsInviter('did:key:zNeverRemembered');
    } catch (e) {
        threw = true;
        assert(/no known peer/.test(e.message), 'the error explains there is nothing recorded to reconnect to');
    }
    assert(threw, 'reconnecting to an identity this device never "Remembered" throws rather than silently dialing nothing');
    console.log('✓ Reconnect refuses an identity this device was never asked to remember');
}

console.log('\nAll Peer Connection Resilience & Reconnection (0.2.62) tests passed.');
}

await runTests();
