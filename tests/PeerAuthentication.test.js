import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { PeerConnectionState } from '../peer/PeerConnectionState.js';
import { PeerAuthenticationState } from '../peer/PeerAuthenticationState.js';
import { PeerAuthenticationSession } from '../peer/PeerAuthenticationSession.js';
import { PeerIdentity } from '../peer/PeerIdentity.js';
import { toProofMessage, getPeerAuthenticationSigningDescriptor } from '../core/PeerAuthenticationEnvelope.js';
import { getAvatarPresenceSigningDescriptor } from '../core/AvatarPresenceAdvertisement.js';

// 0.2.49 — Authenticated Peer Connection Model.
//
// "Once Alice has a connection to something claiming to be Bob, how
// does Alice cryptographically establish who Bob is?" — deliberately
// independent of avatars, presence, profiles, and world documents.
//
// The flagship test (block 3) drives two genuinely independent
// LocalIdentityProvider instances — standing in for two separate
// devices, exactly like tests/PortableIdentity.test.js's own
// two-device setup — across a real in-process peer connection
// (peer/LocalPeerConnectionProvider.js) to a full mutual
// authentication, then through close/reconnect.
//
// The forged-message tests (blocks 7-9) deliberately do NOT drive two
// live sessions across a real transport — they use a minimal
// `fakeConnection()` stand-in that only records what gets sent, so
// each test can construct an exact, cryptographically genuine artifact
// (a real signature from a real identity, over a real challenge) and
// then mutate exactly one field before feeding it to the session under
// test via `handleIncomingMessage()`. That isolates each rejection to
// the one thing being tested rather than to incidental transport
// timing.
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

// One authenticated LocalIdentityProvider, standing in for one device
// holding one unlocked key.
function makeDevice(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(label);
    return provider;
}

// A minimal PeerConnection stand-in, matching peer/PeerConnection.js's
// interface exactly, that records every message a session sends
// through it rather than delivering it anywhere. Used only by the
// forged-message tests below, which need to observe the exact
// challenge a session issued so they can sign genuinely over it before
// mutating something else.
function fakeConnection(connectionId) {
    const sent = [];
    return {
        connectionId,
        transportState: PeerConnectionState.CONNECTED,
        sentMessages: sent,
        onMessage: () => () => {},
        onStateChange: () => () => {},
        send: (message) => { sent.push(message); }
    };
}

async function runTests() {

// ---------------------------------------------------------------------
// 1. PeerIdentity — pure data, validated construction (mirrors
//    LocalIdentity's own invariant: the did:key IS the public key)
// ---------------------------------------------------------------------
{
    const alice = makeDevice('Alice');
    const signing = alice.getSigningIdentity();

    const peerIdentity = new PeerIdentity({ identityId: signing.id, publicKey: signing.publicKey });
    assert(peerIdentity.identityId === signing.id, 'PeerIdentity carries the identityId');
    assert(PeerIdentity.fromJSON(peerIdentity.toJSON()).identityId === signing.id, 'round-trips through toJSON/fromJSON');

    let threw = false;
    try {
        new PeerIdentity({ identityId: signing.id, publicKey: 'deadbeef' });
    } catch (e) {
        threw = e.message.includes('identityId does not match publicKey');
    }
    assert(threw, 'a forged identityId/publicKey pairing is rejected, exactly like LocalIdentity');
    console.log('✓ PeerIdentity: validated pure data, round-trips');
}

// ---------------------------------------------------------------------
// 2. LocalPeerConnectionProvider — a real in-process transport: two
//    endpoints, one shared connectionId, bidirectional delivery
// ---------------------------------------------------------------------
{
    const network = new LocalPeerNetwork();
    const aliceTransport = new LocalPeerConnectionProvider('alice', network);
    const bobTransport = new LocalPeerConnectionProvider('bob', network);

    let incoming = null;
    bobTransport.onIncomingConnection((connection) => { incoming = connection; });

    const aliceConnection = aliceTransport.connect('bob');
    assert(aliceConnection.transportState === PeerConnectionState.CONNECTED, 'connect() yields a CONNECTED transport');
    await wait();
    assert(incoming, 'the remote endpoint receives the incoming connection');
    assert(incoming.connectionId === aliceConnection.connectionId, 'both ends share exactly one connectionId');

    let received = null;
    incoming.onMessage((message) => { received = message; });
    aliceConnection.send({ hello: 'world' });
    await wait();
    assert(received && received.hello === 'world', 'a message sent on one end is delivered on the other');

    aliceConnection.close();
    assert(aliceConnection.transportState === PeerConnectionState.CLOSED, 'closing propagates to the local end');
    assert(incoming.transportState === PeerConnectionState.CLOSED, 'closing propagates to the remote end too');

    aliceTransport.dispose();
    bobTransport.dispose();
    console.log('✓ LocalPeerConnectionProvider: real bidirectional in-process transport');
}

// ---------------------------------------------------------------------
// 3. FLAGSHIP — mutual authentication between two independent devices,
//    then: close discards it, reconnect requires a fresh handshake
// ---------------------------------------------------------------------
{
    const network = new LocalPeerNetwork();
    const alice = makeDevice('Alice');
    const bob = makeDevice('Bob');
    const aliceSigning = alice.getSigningIdentity();
    const bobSigning = bob.getSigningIdentity();

    const aliceTransport = new LocalPeerConnectionProvider('alice-address', network);
    const bobTransport = new LocalPeerConnectionProvider('bob-address', network);

    let bobIncomingConnection = null;
    bobTransport.onIncomingConnection((connection) => { bobIncomingConnection = connection; });

    const aliceConnection = aliceTransport.connect('bob-address');
    await wait();
    assert(bobIncomingConnection, "bob receives alice's connection attempt");

    const aliceSession = new PeerAuthenticationSession({ connection: aliceConnection, identityProvider: alice });
    const bobSession = new PeerAuthenticationSession({ connection: bobIncomingConnection, identityProvider: bob });

    assert(aliceSession.authenticationState === PeerAuthenticationState.IDLE, 'a fresh session starts IDLE');
    assert(bobSession.authenticationState === PeerAuthenticationState.IDLE, 'a fresh session starts IDLE');

    aliceSession.start();
    bobSession.start();
    await wait(10);

    assert(aliceSession.authenticationState === PeerAuthenticationState.AUTHENTICATED, 'alice reaches AUTHENTICATED');
    assert(bobSession.authenticationState === PeerAuthenticationState.AUTHENTICATED, 'bob reaches AUTHENTICATED');
    assert(aliceSession.remoteIdentity instanceof PeerIdentity, 'alice records a real PeerIdentity for bob');
    assert(aliceSession.remoteIdentity.identityId === bobSigning.id, "alice's remoteIdentity IS bob");
    assert(bobSession.remoteIdentity.identityId === aliceSigning.id, "bob's remoteIdentity IS alice");
    console.log('✓ FLAGSHIP: two independent devices mutually authenticate over a real peer connection');

    // -------------------------------------------------------------
    // Close the connection -> authenticated state disappears, on
    // BOTH ends (close is symmetric at the transport layer)
    // -------------------------------------------------------------
    aliceConnection.close();
    assert(aliceSession.authenticationState === PeerAuthenticationState.IDLE, 'closing discards authentication state on the closing side');
    assert(aliceSession.remoteIdentity === null, 'remoteIdentity is gone once the connection closes');
    assert(bobSession.authenticationState === PeerAuthenticationState.IDLE, 'closing discards authentication state on the OTHER side too');
    assert(bobSession.remoteIdentity === null, "bob's remoteIdentity is gone too");
    console.log('✓ closing the connection discards authenticated state on both ends');

    // -------------------------------------------------------------
    // Reconnect -> a fresh connectionId and a fresh session are
    // required; nothing about the old handshake carries over
    // -------------------------------------------------------------
    let secondIncoming = null;
    const unsubscribe = bobTransport.onIncomingConnection((connection) => { secondIncoming = connection; });
    const secondAliceConnection = aliceTransport.connect('bob-address');
    await wait();
    unsubscribe();
    assert(secondAliceConnection.connectionId !== aliceConnection.connectionId, 'reconnecting gets a brand-new connectionId');

    const freshAliceSession = new PeerAuthenticationSession({ connection: secondAliceConnection, identityProvider: alice });
    const freshBobSession = new PeerAuthenticationSession({ connection: secondIncoming, identityProvider: bob });
    assert(freshAliceSession.authenticationState === PeerAuthenticationState.IDLE, 'a reconnected session starts fully unauthenticated');
    freshAliceSession.start();
    freshBobSession.start();
    await wait(10);
    assert(freshAliceSession.isAuthenticated && freshBobSession.isAuthenticated, 'the fresh session re-authenticates from nothing, over the new connection');
    console.log('✓ reconnecting requires a fresh authentication session, proven by re-running the handshake');

    aliceTransport.dispose();
    bobTransport.dispose();
}

// ---------------------------------------------------------------------
// 4. Replay a captured, entirely genuine handshake message into a
//    FRESH session -> reject (a different connection has a different
//    sessionNonce, so the signature no longer verifies against it)
// ---------------------------------------------------------------------
{
    const network = new LocalPeerNetwork();
    const alice = makeDevice('Alice');
    const bob = makeDevice('Bob');

    const aliceTransport = new LocalPeerConnectionProvider('alice', network);
    const bobTransport = new LocalPeerConnectionProvider('bob', network);
    let bobIncoming = null;
    bobTransport.onIncomingConnection((c) => { bobIncoming = c; });
    const aliceConnection = aliceTransport.connect('bob');
    await wait();

    let capturedBobProof = null;
    aliceConnection.onMessage((message) => {
        if (message && message.type === 'PROOF' && !capturedBobProof) capturedBobProof = message;
    });

    const aliceSession = new PeerAuthenticationSession({ connection: aliceConnection, identityProvider: alice });
    const bobSession = new PeerAuthenticationSession({ connection: bobIncoming, identityProvider: bob });
    aliceSession.start();
    bobSession.start();
    await wait(10);
    assert(aliceSession.isAuthenticated, 'setup: the original handshake succeeds');
    assert(capturedBobProof, "setup: bob's real PROOF message was captured off the wire");

    // A brand-new connection — a brand-new sessionNonce.
    const freshAliceConnection = aliceTransport.connect('bob');
    await wait();
    const freshAliceSession = new PeerAuthenticationSession({ connection: freshAliceConnection, identityProvider: alice });
    freshAliceSession.start();
    await wait();

    // Replay bob's OLD, entirely genuine PROOF straight into the NEW
    // session, completely unmodified.
    freshAliceSession.handleIncomingMessage(capturedBobProof);
    assert(freshAliceSession.authenticationState === PeerAuthenticationState.FAILED, 'a replayed handshake is rejected on a fresh connection');
    assert(freshAliceSession.remoteIdentity === null, 'no remoteIdentity is ever recorded from a replay');
    assert(freshAliceSession.failureReason.includes('sessionNonce'), `rejected specifically for sessionNonce, got: ${freshAliceSession.failureReason}`);
    console.log('✓ replaying a captured handshake into a fresh session is rejected (sessionNonce scoping)');

    aliceTransport.dispose();
    bobTransport.dispose();
}

// ---------------------------------------------------------------------
// 5. Modify the challenge in an otherwise-genuine PROOF -> reject
// ---------------------------------------------------------------------
{
    const alice = makeDevice('Alice');
    const bob = makeDevice('Bob');
    const bobSigning = bob.getSigningIdentity();

    const connection = fakeConnection('conn-modify-challenge');
    const aliceSession = new PeerAuthenticationSession({ connection, identityProvider: alice });
    aliceSession.start();
    const aliceHello = connection.sentMessages[0];
    assert(aliceHello && aliceHello.type === 'HELLO', "alice's real HELLO (and its real challenge) was sent");

    // Bob genuinely signs the REAL challenge alice issued.
    const descriptor = getPeerAuthenticationSigningDescriptor({
        sessionNonce: connection.connectionId, identityId: bobSigning.id, publicKey: bobSigning.publicKey, challenge: aliceHello.challenge
    });
    const signature = bob.signCanonical(descriptor);
    const genuineProof = toProofMessage({
        sessionNonce: connection.connectionId, identityId: bobSigning.id, publicKey: bobSigning.publicKey,
        challenge: aliceHello.challenge, signature: signature.toJSON()
    });

    const tampered = { ...genuineProof, challenge: aliceHello.challenge.split('').reverse().join('') };
    aliceSession.handleIncomingMessage(tampered);
    assert(aliceSession.authenticationState === PeerAuthenticationState.FAILED, 'a PROOF with a modified challenge is rejected');
    assert(aliceSession.remoteIdentity === null, 'no remoteIdentity is recorded from a tampered challenge');
    console.log('✓ modifying the challenge in an otherwise-genuine PROOF is rejected');
}

// ---------------------------------------------------------------------
// 6. Replace the public key in an otherwise-genuine PROOF -> reject,
//    both as a bare mismatch and as a full impersonation attempt
// ---------------------------------------------------------------------
{
    const alice = makeDevice('Alice');
    const bob = makeDevice('Bob');
    const mallory = makeDevice('Mallory');
    const bobSigning = bob.getSigningIdentity();
    const mallorySigning = mallory.getSigningIdentity();

    function genuineBobProof(connection) {
        const hello = connection.sentMessages[0];
        const descriptor = getPeerAuthenticationSigningDescriptor({
            sessionNonce: connection.connectionId, identityId: bobSigning.id, publicKey: bobSigning.publicKey, challenge: hello.challenge
        });
        const signature = bob.signCanonical(descriptor);
        return toProofMessage({
            sessionNonce: connection.connectionId, identityId: bobSigning.id, publicKey: bobSigning.publicKey,
            challenge: hello.challenge, signature: signature.toJSON()
        });
    }

    // Variant A: swap in an unrelated publicKey, keeping bob's real
    // identityId and bob's real signature — an internally inconsistent
    // identityId/publicKey pairing, the same check LocalIdentity's own
    // constructor already makes.
    const connectionA = fakeConnection('conn-swap-key-a');
    const sessionA = new PeerAuthenticationSession({ connection: connectionA, identityProvider: alice });
    sessionA.start();
    const proofA = genuineBobProof(connectionA);
    sessionA.handleIncomingMessage({ ...proofA, publicKey: mallorySigning.publicKey });
    assert(sessionA.authenticationState === PeerAuthenticationState.FAILED, 'swapping in a publicKey mismatched with identityId is rejected');
    assert(sessionA.failureReason.includes('identityId does not match publicKey'), `rejected for the right reason, got: ${sessionA.failureReason}`);

    // Variant B: swap identityId AND publicKey consistently to
    // Mallory's OWN real pair, keeping bob's original signature.
    // Self-consistent as a claim, but the signature was never produced
    // for Mallory's identity, so it must still fail.
    const connectionB = fakeConnection('conn-swap-key-b');
    const sessionB = new PeerAuthenticationSession({ connection: connectionB, identityProvider: alice });
    sessionB.start();
    const proofB = genuineBobProof(connectionB);
    sessionB.handleIncomingMessage({ ...proofB, identityId: mallorySigning.id, publicKey: mallorySigning.publicKey });
    assert(sessionB.authenticationState === PeerAuthenticationState.FAILED, 'a self-consistent but substituted identity/key pair still fails signature verification');
    assert(sessionB.failureReason.includes('signature invalid'), `rejected for signature invalidity, got: ${sessionB.failureReason}`);
    console.log('✓ replacing the public key in a PROOF is rejected, both as a mismatch and as a full impersonation attempt');
}

// ---------------------------------------------------------------------
// 7. Reuse Alice's VALID signature (produced for one real challenge)
//    against a DIFFERENT challenge -> reject, purely on cryptographic
//    grounds — even when sessionNonce and challenge are both relabeled
//    to match the target connection exactly.
// ---------------------------------------------------------------------
{
    const alice = makeDevice('Alice');
    const bob = makeDevice('Bob');
    const aliceSigning = alice.getSigningIdentity();

    // Connection 1: bob issues challenge X1; alice genuinely signs it.
    const connection1 = fakeConnection('conn-reuse-1');
    const bobSession1 = new PeerAuthenticationSession({ connection: connection1, identityProvider: bob });
    bobSession1.start();
    const bobHello1 = connection1.sentMessages[0];
    const descriptor1 = getPeerAuthenticationSigningDescriptor({
        sessionNonce: connection1.connectionId, identityId: aliceSigning.id, publicKey: aliceSigning.publicKey, challenge: bobHello1.challenge
    });
    const aliceSignatureOverX1 = alice.signCanonical(descriptor1);

    // Connection 2: bob issues a genuinely DIFFERENT challenge X2.
    const connection2 = fakeConnection('conn-reuse-2');
    const bobSession2 = new PeerAuthenticationSession({ connection: connection2, identityProvider: bob });
    bobSession2.start();
    const bobHello2 = connection2.sentMessages[0];
    assert(bobHello2.challenge !== bobHello1.challenge, 'setup: the two challenges are genuinely different');

    // Forge a PROOF for connection 2 that claims to answer X2 with
    // alice's real identityId/publicKey, but carries the SIGNATURE she
    // actually produced for X1 on a DIFFERENT connection — relabeling
    // sessionNonce/challenge to match connection 2 exactly, so only
    // the signature's own cryptographic binding can catch this.
    const forged = toProofMessage({
        sessionNonce: connection2.connectionId, identityId: aliceSigning.id, publicKey: aliceSigning.publicKey,
        challenge: bobHello2.challenge, signature: aliceSignatureOverX1.toJSON()
    });
    bobSession2.handleIncomingMessage(forged);
    assert(bobSession2.authenticationState === PeerAuthenticationState.FAILED, "reusing alice's valid signature against a different challenge is rejected");
    assert(bobSession2.remoteIdentity === null, 'bob never records alice as authenticated from the forged reuse');
    assert(bobSession2.failureReason.includes('signature invalid'), `rejected on cryptographic grounds specifically, got: ${bobSession2.failureReason}`);
    console.log("✓ reusing alice's valid signature against a different challenge is rejected (signature/challenge binding)");
}

// ---------------------------------------------------------------------
// 8. Existing systems are untouched: presence signing still works
//    exactly as before, and the two SignatureTypes never cross-verify
// ---------------------------------------------------------------------
{
    const alice = makeDevice('Alice');
    const aliceSigning = alice.getSigningIdentity();
    const verifier = new LocalAuthorizationVerifier();

    const presenceAdvertisement = {
        avatarId: 'avatar-1', ownerIdentity: aliceSigning.id,
        position: { x: 1, y: 2, z: 3 }, rotation: { x: 0, y: 0, z: 0 },
        animation: 'IDLE', sequence: 1
    };
    const presenceDescriptor = getAvatarPresenceSigningDescriptor(presenceAdvertisement);
    const presenceSignature = alice.signCanonical(presenceDescriptor);
    const presenceResult = verifier.verifyDescriptor(presenceDescriptor, presenceSignature, {
        id: aliceSigning.id, algorithm: 'Ed25519', publicKey: aliceSigning.publicKey
    });
    assert(presenceResult.valid, 'avatar presence signing/verification is completely unaffected by 0.2.49');

    // The same signature can never be mistaken for a peer-authentication
    // PROOF — different SignatureType, different signed domain string.
    const peerDescriptor = getPeerAuthenticationSigningDescriptor({
        sessionNonce: 'some-connection', identityId: aliceSigning.id,
        publicKey: aliceSigning.publicKey, challenge: 'some-challenge'
    });
    const crossDomainResult = verifier.verifyDescriptor(peerDescriptor, presenceSignature, {
        id: aliceSigning.id, algorithm: 'Ed25519', publicKey: aliceSigning.publicKey
    });
    assert(!crossDomainResult.valid, 'a presence signature is never accepted as a peer-authentication proof');
    assert(crossDomainResult.reason === 'signature domain mismatch', `rejected specifically on domain, got: ${crossDomainResult.reason}`);
    console.log('✓ AvatarPresence signing is untouched, and peer-authentication signatures are domain-separated from it');
}

console.log('\nAll peer authentication tests passed.');
}

await runTests();
