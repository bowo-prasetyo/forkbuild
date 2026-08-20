import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { PeerAuthenticationSession } from '../peer/PeerAuthenticationSession.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { ConnectedPeer } from '../application/ConnectedPeer.js';
import { ConnectedPeerRegistry } from '../application/ConnectedPeerRegistry.js';
import { DeviceAuthorizationPropagationUseCase } from '../application/DeviceAuthorizationPropagationUseCase.js';
import { DeviceAuthority } from '../core/DeviceAuthority.js';
import {
    toDeviceAuthorizationGrant,
    isValidDeviceAuthorizationGrant,
    getDeviceAuthorizationGrantSigningDescriptor,
    toDeviceAuthorizationRevocation,
    isValidDeviceAuthorizationRevocation,
    getDeviceAuthorizationRevocationSigningDescriptor
} from '../core/DeviceAuthorizationEnvelope.js';
import {
    DeviceAuthorizationGossipKind,
    toDeviceAuthorizationGossipMessage,
    isValidDeviceAuthorizationGossipMessage
} from '../core/DeviceAuthorizationGossip.js';

// 0.2.78 — Multi-Device Identity Semantics.
//
// 0.2.67 through 0.2.71 each named, and each deliberately left open, the
// same question: "is an identity a person, a device, or a key?" This
// file proves the answer this milestone commits to — an identity stays
// exactly one keypair, unchanged since 0.2.16/0.2.46; a DEVICE is just
// ANOTHER keypair; and what's new is a signed, revocable AUTHORIZATION
// LINK between a parent identity and a device's key
// (identity/LocalIdentityProvider.js#authorizeDevice()/
// revokeDeviceAuthorization()), propagated to peers exactly like 0.2.68
// already propagates identity revocation/succession (application/
// DeviceAuthorizationPropagationUseCase.js).
//
// The central architectural invariant this file's flagship exists to
// prove: peer/PeerAuthenticationSession.js's ordinary handshake proves
// possession of A key — completely unmodified by this milestone, not
// one line of peer/ touched — and says NOTHING about whether that key
// is currently authorized to act for some OTHER identity. Authorization
// is an entirely separate, independently revocable fact, verified one
// layer above the connection, never folded into it.
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

function assertThrows(fn, message) {
    try {
        fn();
        assert(false, message);
    } catch (e) {
        if (e.message === `ASSERT FAILED: ${message}`) throw e;
    }
}

function wait(ms = 0) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// One independent LocalIdentityProvider instance, standing in for one
// physically distinct device holding one unlocked local identity —
// mirrors tests/PeerAuthentication.test.js's own makeDevice() exactly.
function makeDevice(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return { provider, identity };
}

// Drives one real, in-process peer/PeerAuthenticationSession.js
// handshake to completion between two devices over a fresh
// peer/LocalPeerConnectionProvider.js connection, then wraps both ends
// as application/ConnectedPeer.js — exactly the "raw transport +
// PeerAuthenticationSession, no PeerSessionManager/invitation layer"
// pattern tests/PeerAuthentication.test.js's own flagship already uses.
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
        transportA,
        transportB,
        peerA: new ConnectedPeer({ connection: connectionA, authenticationSession: sessionA }),
        peerB: new ConnectedPeer({ connection: incomingB, authenticationSession: sessionB })
    };
}

async function runTests() {

// ---------------------------------------------------------------------
// 1. core/DeviceAuthorizationEnvelope.js — wire shape, validation,
//    signing descriptors covering every field.
// ---------------------------------------------------------------------
{
    const grant = toDeviceAuthorizationGrant({
        identityId: 'did:key:zAlice',
        deviceIdentityId: 'did:key:zDeviceA',
        devicePublicKey: 'aa'.repeat(32),
        deviceLabel: 'Alice’s Phone'
    });
    assert(isValidDeviceAuthorizationGrant(grant), 'a well-formed grant passes shape validation');
    assert(!isValidDeviceAuthorizationGrant({ ...grant, deviceIdentityId: grant.identityId }), 'a device cannot equal its own parent identityId');
    assert(!isValidDeviceAuthorizationGrant(null), 'null is rejected');
    assert(!isValidDeviceAuthorizationGrant({ ...grant, authorizedAt: 'not-a-date' }), 'a malformed authorizedAt is rejected');

    const descriptor = getDeviceAuthorizationGrantSigningDescriptor(grant);
    assert(descriptor.id === grant.identityId, 'signing descriptor id is the PARENT identity — who this claim is about');
    assert(descriptor.revision === grant.authorizedAt, 'signing descriptor revision is authorizedAt');
    assert(descriptor.payload.deviceIdentityId === grant.deviceIdentityId, 'signing descriptor payload covers deviceIdentityId');
    assert(descriptor.payload.deviceLabel === grant.deviceLabel, 'signing descriptor payload covers deviceLabel — never a narrower subset');

    const revocation = toDeviceAuthorizationRevocation({ identityId: 'did:key:zAlice', deviceIdentityId: 'did:key:zDeviceA' });
    assert(isValidDeviceAuthorizationRevocation(revocation), 'a well-formed revocation passes shape validation');
    assert(!isValidDeviceAuthorizationRevocation({ identityId: 'did:key:zAlice' }), 'a revocation missing deviceIdentityId is rejected');
    const revocationDescriptor = getDeviceAuthorizationRevocationSigningDescriptor(revocation);
    assert(revocationDescriptor.id === revocation.identityId && revocationDescriptor.revision === revocation.revokedAt, 'revocation signing descriptor shape');

    const gossipMessage = toDeviceAuthorizationGossipMessage(DeviceAuthorizationGossipKind.GRANT, grant);
    assert(isValidDeviceAuthorizationGossipMessage(gossipMessage), 'a structurally well-formed grant passes gossip shape validation regardless of signature — signing is the verifier\'s job');
    assert(!isValidDeviceAuthorizationGossipMessage({ kind: 'NOT-A-KIND', record: grant }), 'an unknown gossip kind is rejected');
    console.log('✓ core/DeviceAuthorizationEnvelope.js + core/DeviceAuthorizationGossip.js: wire shape, validation, signing descriptors');
}

// ---------------------------------------------------------------------
// 2. core/DeviceAuthority.js — immutability and the timestamp-compare
//    isAuthorized rule (never a permanent one-way latch, unlike identity
//    revocation itself — see this class's own header).
// ---------------------------------------------------------------------
{
    const base = new DeviceAuthority({ identityId: 'did:key:zAlice', deviceIdentityId: 'did:key:zDeviceA' });
    assert(!base.isAuthorized, 'no grant on file at all -> not authorized');

    const grant1 = { identityId: 'did:key:zAlice', deviceIdentityId: 'did:key:zDeviceA', authorizedAt: '2026-01-01T00:00:00.000Z' };
    const withGrant = base.withGrant(grant1);
    assert(withGrant.isAuthorized, 'a grant with no revocation on file -> authorized');
    assert(!base.isAuthorized, 'withGrant returns a NEW instance — the original is untouched');

    const revocationOlder = { identityId: 'did:key:zAlice', deviceIdentityId: 'did:key:zDeviceA', revokedAt: '2025-06-01T00:00:00.000Z' };
    const withOlderRevocation = withGrant.withRevocation(revocationOlder);
    assert(withOlderRevocation.isAuthorized, 'a revocation that PREDATES the current grant does not defeat it — the grant is newer');

    const revocationNewer = { identityId: 'did:key:zAlice', deviceIdentityId: 'did:key:zDeviceA', revokedAt: '2026-02-01T00:00:00.000Z' };
    const withNewerRevocation = withGrant.withRevocation(revocationNewer);
    assert(!withNewerRevocation.isAuthorized, 'a revocation strictly newer than the grant defeats it');

    const grant2 = { identityId: 'did:key:zAlice', deviceIdentityId: 'did:key:zDeviceA', authorizedAt: '2026-03-01T00:00:00.000Z' };
    const reAuthorized = withNewerRevocation.withGrant(grant2);
    assert(reAuthorized.isAuthorized, 'a strictly newer grant re-authorizes a device previously revoked — never a permanent latch');

    const roundTripped = DeviceAuthority.fromJSON(reAuthorized.toJSON());
    assert(roundTripped.isAuthorized && roundTripped.deviceIdentityId === 'did:key:zDeviceA', 'round-trips through toJSON/fromJSON');
    assertThrows(() => new DeviceAuthority({ identityId: 'did:key:zAlice' }), 'deviceIdentityId is required');
    console.log('✓ core/DeviceAuthority.js: immutability, timestamp-compare isAuthorized, re-authorization after revocation');
}

// ---------------------------------------------------------------------
// 3. identity/LocalIdentityProvider.js — device authorization authoring:
//    grant, list, query, revoke, re-authorize, and structural refusals.
// ---------------------------------------------------------------------
{
    const alice = makeDevice('Alice');
    const deviceA = makeDevice('Alice-Phone');

    assert(alice.provider.listDeviceAuthorizations(alice.identity.identityId).length === 0, 'a fresh identity has authorized no devices');
    assert(!alice.provider.isDeviceAuthorized(alice.identity.identityId, deviceA.identity.identityId), 'not authorized before any grant exists');

    assertThrows(
        () => alice.provider.authorizeDevice(alice.identity.identityId, alice.identity.identityId, alice.identity.publicKey),
        'an identity cannot authorize itself as its own device'
    );
    assertThrows(
        () => alice.provider.authorizeDevice(alice.identity.identityId, deviceA.identity.identityId, 'deadbeef'),
        'deviceIdentityId must match devicePublicKey'
    );

    const grant = alice.provider.authorizeDevice(alice.identity.identityId, deviceA.identity.identityId, deviceA.identity.publicKey, { deviceLabel: 'Phone' });
    assert(grant.signature, 'authorizeDevice produces a signed record');
    assert(alice.provider.isDeviceAuthorized(alice.identity.identityId, deviceA.identity.identityId), 'authorized immediately after a grant');
    assert(alice.provider.listDeviceAuthorizations(alice.identity.identityId).length === 1, 'listDeviceAuthorizations reflects the new grant');
    assert(alice.provider.getDeviceAuthorization(alice.identity.identityId, deviceA.identity.identityId).deviceLabel === 'Phone', 'the stored view carries the device label');

    assertThrows(
        () => alice.provider.revokeDeviceAuthorization(alice.identity.identityId, 'did:key:zNeverAuthorized'),
        'revoking a device that was never authorized is refused'
    );

    const revocation = alice.provider.revokeDeviceAuthorization(alice.identity.identityId, deviceA.identity.identityId);
    assert(revocation.signature, 'revokeDeviceAuthorization produces a signed record');
    assert(!alice.provider.isDeviceAuthorized(alice.identity.identityId, deviceA.identity.identityId), 'no longer authorized after revocation');

    await wait(5);
    alice.provider.authorizeDevice(alice.identity.identityId, deviceA.identity.identityId, deviceA.identity.publicKey, { deviceLabel: 'Phone (re-added)' });
    assert(alice.provider.isDeviceAuthorized(alice.identity.identityId, deviceA.identity.identityId), 're-authorizing after a revocation works, and is never a permanent latch');

    // Revocation is a signing gate everywhere else in this codebase
    // (0.2.67) — a revoked PARENT identity can no longer vouch for any
    // of its devices either.
    const bob = makeDevice('Bob');
    bob.provider.authorizeDevice(bob.identity.identityId, deviceA.identity.identityId, deviceA.identity.publicKey);
    bob.provider.revokeIdentity(bob.identity.identityId);
    assert(!bob.provider.isDeviceAuthorized(bob.identity.identityId, deviceA.identity.identityId), 'a revoked identity can no longer vouch for any device, even one it genuinely authorized earlier');
    console.log('✓ identity/LocalIdentityProvider.js: authorizeDevice/revokeDeviceAuthorization/listDeviceAuthorizations/isDeviceAuthorized');
}

// ---------------------------------------------------------------------
// 4. identity/LocalAuthorizationVerifier.js — REQUIRED-signature
//    discipline, matching verifyIdentityRevocation()/verifyIdentitySuccession().
// ---------------------------------------------------------------------
{
    const verifier = new LocalAuthorizationVerifier();
    const alice = makeDevice('Alice');
    const deviceA = makeDevice('Alice-Phone');
    const charlie = makeDevice('Charlie');

    const grant = alice.provider.authorizeDevice(alice.identity.identityId, deviceA.identity.identityId, deviceA.identity.publicKey);
    assert(verifier.verifyDeviceAuthorizationGrant(grant).valid, 'a genuine grant verifies');
    assert(!verifier.verifyDeviceAuthorizationGrant({ ...grant, deviceLabel: 'tampered' }).valid, 'tampering with any signed field invalidates the signature');
    assert(!verifier.verifyDeviceAuthorizationGrant({ ...grant, signature: null }).valid, 'an unsigned grant is refused outright — never tolerated the way AVATAR_*/RENDEZVOUS_PUBLICATION are');

    // Charlie cannot manufacture a grant for Alice — the closest a
    // forgery gets is Charlie's own, genuinely valid signature stapled
    // onto a claim naming Alice as the authorizing identityId.
    const forgedPayload = toDeviceAuthorizationGrant({
        identityId: alice.identity.identityId,
        deviceIdentityId: charlie.identity.identityId,
        devicePublicKey: charlie.identity.publicKey
    });
    const forgedSignature = charlie.provider.signCanonical(getDeviceAuthorizationGrantSigningDescriptor(forgedPayload));
    const forgedGrant = { ...forgedPayload, signature: forgedSignature.toJSON() };
    assert(!verifier.verifyDeviceAuthorizationGrant(forgedGrant).valid, "Charlie's own genuine signature cannot vouch for a claim naming Alice as the authorizing identity");

    const revocation = alice.provider.revokeDeviceAuthorization(alice.identity.identityId, deviceA.identity.identityId);
    assert(verifier.verifyDeviceAuthorizationRevocation(revocation).valid, 'a genuine revocation verifies');
    assert(!verifier.verifyDeviceAuthorizationRevocation({ ...revocation, deviceIdentityId: 'did:key:zSomeoneElse' }).valid, 'tampering with a revocation invalidates its signature');
    console.log('✓ identity/LocalAuthorizationVerifier.js: verifyDeviceAuthorizationGrant/Revocation — required signature, tamper-evident, unforgeable');
}

// ---------------------------------------------------------------------
// 5. DeviceAuthorizationPropagationUseCase — local wiring sanity, no
//    network.
// ---------------------------------------------------------------------
{
    const alice = makeDevice('Alice');
    const useCase = new DeviceAuthorizationPropagationUseCase(new InMemoryStorageProvider(), alice.provider, {
        peerMessageBus: new PeerMessageBus(),
        connectedPeerRegistry: new ConnectedPeerRegistry()
    });
    assert(useCase.listDeviceAuthorities(alice.identity.identityId).length === 0, 'a fresh device has learned nothing');
    assert(useCase.getDeviceAuthority('did:key:zNobody', 'did:key:zNobodyElse') === null, 'an unknown pair returns null, never throws');
    assert(useCase.resolvePeerAuthority(null, alice.identity.identityId).authorized === false, 'resolvePeerAuthority tolerates a null connectedPeer');

    const deviceA = makeDevice('Alice-Phone');
    const grant = alice.provider.authorizeDevice(alice.identity.identityId, deviceA.identity.identityId, deviceA.identity.publicKey);
    assert(useCase.broadcastAuthorization(grant) === 0, 'broadcasting with zero AUTHENTICATED peers reaches zero peers — never an error');
    assertThrows(() => useCase.broadcastAuthorization({ not: 'a real record' }), 'a malformed grant is refused before ever reaching the transport');
    assertThrows(() => useCase.broadcastRevocation({ not: 'a real record' }), 'a malformed revocation is refused before ever reaching the transport');
    console.log('✓ DeviceAuthorizationPropagationUseCase: local wiring, zero-peer broadcast, malformed-record refusal');
}

// ---------------------------------------------------------------------
// 6. FLAGSHIP — real in-process peer connections, three physically
//    distinct "devices" (Alice's own, plus Device A and Device B, each
//    an entirely independent LocalIdentityProvider/keypair), an
//    unrelated third party (Charlie), and Bob resolving who each live
//    connection actually represents.
// ---------------------------------------------------------------------
{
    const network = new LocalPeerNetwork();
    const alice = makeDevice('Alice');
    const deviceA = makeDevice('Alice-Phone');
    const deviceB = makeDevice('Alice-Laptop');
    const charlie = makeDevice('Charlie');
    const bob = makeDevice('Bob');

    // Alice already knows both devices' public identities (exactly the
    // "Alice can name a successor she hasn't finished setting up yet"
    // property declareSuccessor() established, extended here to
    // devices) and authorizes both, entirely locally, before either
    // device ever connects to anyone.
    const grantA = alice.provider.authorizeDevice(alice.identity.identityId, deviceA.identity.identityId, deviceA.identity.publicKey, { deviceLabel: 'Phone' });
    const grantB = alice.provider.authorizeDevice(alice.identity.identityId, deviceB.identity.identityId, deviceB.identity.publicKey, { deviceLabel: 'Laptop' });

    const bobRegistry = new ConnectedPeerRegistry();
    const bobDeviceAuth = new DeviceAuthorizationPropagationUseCase(new InMemoryStorageProvider(), bob.provider, {
        peerMessageBus: new PeerMessageBus(),
        connectedPeerRegistry: bobRegistry
    });

    // Alice connects to Bob directly (DIRECT mode — her own key,
    // exactly how every peer connection has worked since 0.2.49) and
    // broadcasts both signed grants to him.
    const aliceRegistry = new ConnectedPeerRegistry();
    const aliceDeviceAuth = new DeviceAuthorizationPropagationUseCase(new InMemoryStorageProvider(), alice.provider, {
        peerMessageBus: new PeerMessageBus(),
        connectedPeerRegistry: aliceRegistry
    });
    const { peerA: aliceToBob, peerB: bobFromAlice } = await connectAndAuthenticate(network, 'alice', alice, 'bob-for-alice', bob);
    aliceRegistry.add(aliceToBob);
    bobRegistry.add(bobFromAlice);

    assert(bobDeviceAuth.resolvePeerAuthority(bobFromAlice, alice.identity.identityId).mode === 'DIRECT', "Bob resolves Alice's own direct connection as DIRECT");

    assert(aliceDeviceAuth.broadcastAuthorization(grantA) === 1, 'Alice broadcasts device A\'s grant to her one connected peer, Bob');
    assert(aliceDeviceAuth.broadcastAuthorization(grantB) === 1, 'and device B\'s grant too');
    await wait(200);
    assert(bobDeviceAuth.getDeviceAuthority(alice.identity.identityId, deviceA.identity.identityId).isAuthorized, "Bob independently verified and stored device A's authorization");
    assert(bobDeviceAuth.getDeviceAuthority(alice.identity.identityId, deviceB.identity.identityId).isAuthorized, "Bob independently verified and stored device B's authorization too");
    console.log('✓ FLAGSHIP: Alice authorizes two devices and broadcasts both signed grants; Bob independently verifies and stores both');

    // Device A now connects to Bob on an ENTIRELY SEPARATE connection —
    // an ordinary peer/PeerAuthenticationSession.js handshake, proving
    // ONLY that this connection holds device A's own key. Nothing about
    // that handshake mentions Alice at all.
    const { peerB: bobFromDeviceA } = await connectAndAuthenticate(network, 'device-a', deviceA, 'bob-for-device-a', bob);
    bobRegistry.add(bobFromDeviceA);
    assert(bobFromDeviceA.remoteIdentity.identityId === deviceA.identity.identityId, "the connection's own proven key IS device A's key — nothing more, nothing less");

    const resolvedA = bobDeviceAuth.resolvePeerAuthority(bobFromDeviceA, alice.identity.identityId);
    assert(resolvedA.authorized && resolvedA.mode === 'DEVICE' && resolvedA.deviceIdentityId === deviceA.identity.identityId,
        'Bob resolves device A\'s live connection as authorized to act for Alice, in DEVICE mode — a distinct fact from device A\'s own proven identity');
    console.log('✓ FLAGSHIP: device A\'s live connection resolves as an authorized DEVICE acting for Alice — PeerIdentity + DeviceAuthorization -> parent Identity');

    const { peerB: bobFromDeviceB } = await connectAndAuthenticate(network, 'device-b', deviceB, 'bob-for-device-b', bob);
    bobRegistry.add(bobFromDeviceB);
    assert(bobDeviceAuth.resolvePeerAuthority(bobFromDeviceB, alice.identity.identityId).authorized, "device B's live connection resolves as authorized too");
    console.log('✓ FLAGSHIP: device B resolves as an authorized DEVICE too — one identity, two simultaneously live, independently authorized devices');

    // -------------------------------------------------------------
    // SECURITY FLAGSHIP A — Charlie has his own, perfectly genuine
    // cryptographic identity. He connects to Bob; authentication
    // succeeds completely honestly (he really does hold his own key).
    // He was never authorized by Alice for anything. Bob must never
    // treat Charlie's connection as representing Alice.
    // -------------------------------------------------------------
    const { peerB: bobFromCharlie } = await connectAndAuthenticate(network, 'charlie', charlie, 'bob-for-charlie', bob);
    bobRegistry.add(bobFromCharlie);
    assert(bobFromCharlie.remoteIdentity.identityId === charlie.identity.identityId, "Charlie's connection genuinely, honestly authenticates as Charlie's own key");
    const resolvedCharlie = bobDeviceAuth.resolvePeerAuthority(bobFromCharlie, alice.identity.identityId);
    assert(!resolvedCharlie.authorized && resolvedCharlie.mode === null,
        "SECURITY FLAGSHIP A: Charlie's connection, though genuinely authenticated as himself, is REJECTED as a representative of Alice — identity authentication proves a key, never permission to act for someone else's identity");
    console.log('✓ SECURITY FLAGSHIP A: an unauthorized (but genuinely authenticated) identity is rejected as an impersonation attempt — REJECT');

    // -------------------------------------------------------------
    // SECURITY FLAGSHIP B — Alice revokes device B. Device B's own
    // key is completely untouched — it can still complete an entirely
    // ordinary, successful peer/PeerAuthenticationSession.js handshake,
    // because authentication only ever proves key possession. But Bob,
    // once he learns of the revocation, must no longer treat device B
    // as authorized to act for Alice.
    // -------------------------------------------------------------
    await wait(5);
    const revocationB = alice.provider.revokeDeviceAuthorization(alice.identity.identityId, deviceB.identity.identityId);
    assert(aliceDeviceAuth.broadcastRevocation(revocationB) === 1, 'Alice broadcasts the revocation to Bob');
    await wait(200);
    assert(!bobDeviceAuth.resolvePeerAuthority(bobFromDeviceB, alice.identity.identityId).authorized,
        "SECURITY FLAGSHIP B: Bob no longer treats device B's still-open, still-live connection as authorized once he learns of the revocation");

    // Proof that device B's KEY itself is entirely untouched: a fresh
    // reconnect attempt authenticates completely normally.
    const { peerB: bobFromDeviceBAgain } = await connectAndAuthenticate(network, 'device-b-again', deviceB, 'bob-for-device-b-again', bob);
    assert(bobFromDeviceBAgain.remoteIdentity.identityId === deviceB.identity.identityId,
        "device B can still authenticate perfectly normally — revocation never touches key possession, only authorization");
    assert(!bobDeviceAuth.resolvePeerAuthority(bobFromDeviceBAgain, alice.identity.identityId).authorized,
        "yet this fresh, genuinely successful connection still does not resolve as authorized to act for Alice");
    console.log('✓ SECURITY FLAGSHIP B: a revoked device authenticates as successfully as ever (its KEY is untouched) but is REJECTED as authorized to act for the identity — authentication and authorization are independent facts');

    // Device A, never revoked, is completely unaffected by device B's
    // revocation — the two are independent facts about independent
    // devices, never a shared "is Alice's devices" boolean.
    assert(bobDeviceAuth.resolvePeerAuthority(bobFromDeviceA, alice.identity.identityId).authorized,
        "device A remains authorized throughout — one device's revocation never affects another device's own, independent authorization");
    console.log('✓ device A remains authorized throughout device B\'s entire revocation — devices are authorized/revoked independently of one another');
}

// ---------------------------------------------------------------------
// 7. Relevance gate — a genuinely, validly signed device authorization
//    about an identity this device has never known is dropped, exactly
//    like application/IdentityLifecyclePropagationUseCase.js's own gate.
// ---------------------------------------------------------------------
{
    const network = new LocalPeerNetwork();
    const dana = makeDevice('Dana');
    const deviceD = makeDevice('Dana-Tablet');
    const bob = makeDevice('Bob');

    const bobRegistry = new ConnectedPeerRegistry();
    const bobDeviceAuth = new DeviceAuthorizationPropagationUseCase(new InMemoryStorageProvider(), bob.provider, {
        peerMessageBus: new PeerMessageBus(),
        connectedPeerRegistry: bobRegistry,
        knowsIdentity: () => false // Bob has never remembered Dana as a known peer at all
    });
    const danaRegistry = new ConnectedPeerRegistry();
    const danaDeviceAuth = new DeviceAuthorizationPropagationUseCase(new InMemoryStorageProvider(), dana.provider, {
        peerMessageBus: new PeerMessageBus(),
        connectedPeerRegistry: danaRegistry
    });
    const { peerA: danaToBob, peerB: bobFromDana } = await connectAndAuthenticate(network, 'dana', dana, 'bob-for-dana', bob);
    danaRegistry.add(danaToBob);
    bobRegistry.add(bobFromDana);

    const grant = dana.provider.authorizeDevice(dana.identity.identityId, deviceD.identity.identityId, deviceD.identity.publicKey);
    assert(new LocalAuthorizationVerifier().verifyDeviceAuthorizationGrant(grant).valid, 'sanity check: the grant is genuinely, validly signed');
    danaDeviceAuth.broadcastAuthorization(grant);
    await wait(200);
    assert(bobDeviceAuth.getDeviceAuthority(dana.identity.identityId, deviceD.identity.identityId) === null,
        "a valid grant about an identity Bob has never known is dropped by the relevance gate, never stored as an unbounded gossip cache");
    console.log('✓ relevance gate: a genuinely valid device authorization about an unknown identity is dropped, not cached');
}

console.log('\nAll multi-device identity semantics tests passed.');
console.log('Note (deliberately not solved here, see docs/Roadmap.md 0.2.78): resolvePeerAuthority() is defined and');
console.log('proven correct, but is not wired into application/ChatUseCase.js, application/VoiceUseCase.js,');
console.log('application/PeerRelationshipUseCase.js, or any presence/profile sync — teaching those existing');
console.log('features to actually consult it is real, substantial, deliberately deferred future work.');
}

await runTests();
