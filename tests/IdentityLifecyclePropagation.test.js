import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { PeerIdentity } from '../peer/PeerIdentity.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { ConnectedPeerRegistry } from '../application/ConnectedPeerRegistry.js';
import { PeerSessionManager } from '../application/PeerSessionManager.js';
import { PeerRelationshipUseCase } from '../application/PeerRelationshipUseCase.js';
import { IdentityLifecyclePropagationUseCase } from '../application/IdentityLifecyclePropagationUseCase.js';
import { RemoteIdentityLifecycle } from '../core/RemoteIdentityLifecycle.js';
import {
    IdentityLifecycleGossipKind,
    toIdentityLifecycleGossipMessage,
    isValidIdentityLifecycleGossipMessage
} from '../core/IdentityLifecycleGossip.js';
import { toIdentitySuccessionRecord, getIdentitySuccessionSigningDescriptor } from '../core/IdentitySuccessionEnvelope.js';
import { toIdentityRevocationRecord } from '../core/IdentityRevocationEnvelope.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.2.68 — Identity Lifecycle Propagation.
//
// 0.2.67 gave an identity owner a signed, durable, LOCAL way to rotate
// or revoke a key, and named the gap it deliberately left open: none of
// it traveled to any other device or peer. This file proves the
// answer: a namespaced peer/PeerMessageBus.js protocol
// ('forkbuild:identity-lifecycle') that relays the EXACT SAME signed
// records 0.2.67 already produces, verified by the EXACT SAME
// identity/LocalAuthorizationVerifier.js methods 0.2.67 already wrote —
// no new signature type, no new authority, and — the property the
// flagship goes out of its way to prove — no automatic authority over
// anything ELSE this device has on record: PeerRelationship(A) and
// PeerRelationship(B) stay two distinct entries even after Alice
// rotates A -> B and everyone involved has verified it.
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

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForState(peer, targetStates, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const current = peer.getLifecycleState();
        if (targetStates.includes(current)) { resolve(current); return; }
        const timeout = setTimeout(() => {
            unsubscribe();
            reject(new Error(`timed out waiting for state in [${targetStates.join(', ')}], last state was ${peer.getLifecycleState()}`));
        }, timeoutMs);
        const unsubscribe = peer.onStateChange((state) => {
            if (targetStates.includes(state)) {
                clearTimeout(timeout);
                unsubscribe();
                resolve(state);
            }
        });
    });
}

async function connectPeers(inviterSessions, accepterSessions) {
    const { invitation, connectedPeer: inviterPeer } = await inviterSessions.createInvitation();
    const { connectedPeer: accepterPeer, reply } = await accepterSessions.acceptInvitation(JSON.stringify(invitation.toJSON()));
    await inviterSessions.completeConnection(inviterPeer.connectionId, reply);
    await Promise.all([
        waitForState(inviterPeer, [PeerLifecycleState.AUTHENTICATED]),
        waitForState(accepterPeer, [PeerLifecycleState.AUTHENTICATED])
    ]);
    return { inviterPeer, accepterPeer };
}

function makeDevice() {
    return new LocalIdentityProvider(new InMemoryStorageProvider());
}

async function runTests() {

// ---------------------------------------------------------------------
// 1. core/RemoteIdentityLifecycle.js + core/IdentityLifecycleGossip.js —
//    construction, immutability, and wire-shape validation.
// ---------------------------------------------------------------------
{
    const record = new RemoteIdentityLifecycle({ identityId: 'did:key:zAlice' });
    assert(!record.isRevoked, 'a fresh record is not revoked');
    assert(record.successorIdentityId === null, 'no successor by default');

    const revocation = { identityId: 'did:key:zAlice', successorIdentityId: 'did:key:zBob' };
    const withRevocation = record.withRevocation(revocation);
    assert(withRevocation.isRevoked, 'withRevocation marks the record revoked');
    assert(withRevocation.successorIdentityId === 'did:key:zBob', 'successorIdentityId falls back to the revocation\'s own bundled successor');
    assert(!record.isRevoked, 'withRevocation returns a NEW instance — the original is untouched');

    const succession = { predecessorIdentityId: 'did:key:zAlice', successorIdentityId: 'did:key:zCharlie', declaredAt: new Date().toISOString() };
    const withSuccession = withRevocation.withSuccession(succession);
    assert(withSuccession.successorIdentityId === 'did:key:zCharlie', 'a dedicated succession record is preferred over the revocation\'s own bundled successor');
    assert(withSuccession.isRevoked, 'withSuccession never touches an existing revocation');

    const roundTripped = RemoteIdentityLifecycle.fromJSON(withSuccession.toJSON());
    assert(roundTripped.identityId === withSuccession.identityId && roundTripped.isRevoked && roundTripped.successorIdentityId === 'did:key:zCharlie', 'round-trips through toJSON/fromJSON');

    assertThrows(() => new RemoteIdentityLifecycle({}), 'identityId is required');

    // isValidIdentityLifecycleGossipMessage is a STRUCTURAL check only —
    // exactly like peer/PeerMessage.js's own isValidPeerMessageEnvelope()
    // — never a signature check. A structurally well-formed but UNSIGNED
    // record passes here; whether it is a REQUIRED-signature envelope is
    // identity/LocalAuthorizationVerifier.js's own job, one layer up in
    // application/IdentityLifecyclePropagationUseCase.js's ingestion
    // boundary (verifyIdentityRevocation()/verifyIdentitySuccession()
    // both explicitly refuse an unsigned record — see their own headers).
    const unsignedRevocationMessage = toIdentityLifecycleGossipMessage(IdentityLifecycleGossipKind.REVOCATION,
        toIdentityRevocationRecord({ identityId: 'did:key:zAlice', publicKey: '00'.repeat(32) }));
    assert(isValidIdentityLifecycleGossipMessage(unsignedRevocationMessage), 'a structurally well-formed revocation record passes shape validation regardless of signature — signing is the verifier\'s job, not the wire shape\'s');
    assert(!isValidIdentityLifecycleGossipMessage({ kind: 'NOT-A-KIND', record: {} }), 'an unknown kind is rejected');
    assert(!isValidIdentityLifecycleGossipMessage(null), 'null is rejected');
    assert(!isValidIdentityLifecycleGossipMessage({ kind: IdentityLifecycleGossipKind.REVOCATION, record: { not: 'a real record' } }), 'a structurally malformed record is rejected even with a recognized kind');
    console.log('✓ core/RemoteIdentityLifecycle.js + core/IdentityLifecycleGossip.js: construction, immutability, wire-shape validation');
}

// ---------------------------------------------------------------------
// 2. IdentityLifecyclePropagationUseCase — local wiring sanity, no
//    network: broadcasting to zero connected peers is a well-defined
//    no-op, and malformed/unsigned records are refused before ever
//    reaching the transport.
// ---------------------------------------------------------------------
{
    const device = makeDevice();
    device.login('Alice');
    const useCase = new IdentityLifecyclePropagationUseCase(new InMemoryStorageProvider(), device, {
        peerMessageBus: new PeerMessageBus(),
        connectedPeerRegistry: new ConnectedPeerRegistry()
    });
    assert(useCase.listRemoteLifecycle().length === 0, 'a fresh device has learned nothing');
    assert(useCase.getRemoteLifecycle('did:key:zNobody') === null, 'an unknown identityId returns null, never throws');

    const alice = device.listLocalIdentities()[0];
    const revocation = device.revokeIdentity(alice.identityId);
    assert(useCase.broadcastRevocation(revocation) === 0, 'broadcasting with zero AUTHENTICATED peers reaches zero peers — never an error');

    assertThrows(() => useCase.broadcastRevocation({ not: 'a real record' }), 'a malformed revocation record is refused before ever reaching the transport');
    assertThrows(() => useCase.broadcastSuccession({ not: 'a real record' }), 'a malformed succession record is refused before ever reaching the transport');
    console.log('✓ IdentityLifecyclePropagationUseCase: local wiring, zero-peer broadcast, malformed-record refusal');
}

// ---------------------------------------------------------------------
// 3. FLAGSHIP — real WebRTC. Alice, connected to Bob and Charlie,
//    declares a successor and revokes herself; both peers independently
//    verify and remember both facts; a fresh connection attempt using
//    her revoked identity fails cleanly; the identity she rotated TO
//    authenticates completely independently; and — the property this
//    milestone cares most about — PeerRelationship(A) and
//    PeerRelationship(B) remain two distinct records on Bob's device,
//    never silently merged just because a verified succession link
//    exists between them.
// ---------------------------------------------------------------------
{
    const aliceDevice = makeDevice();
    const bobDevice = makeDevice();
    const charlieDevice = makeDevice();
    const alice = aliceDevice.createLocalIdentity('Alice');
    bobDevice.createLocalIdentity('Bob');
    charlieDevice.createLocalIdentity('Charlie');
    aliceDevice.authenticate(alice.identityId);
    bobDevice.authenticate(bobDevice.listLocalIdentities()[0].identityId);
    charlieDevice.authenticate(charlieDevice.listLocalIdentities()[0].identityId);

    const aliceSessions = new PeerSessionManager({ identityProvider: aliceDevice });
    const bobSessions = new PeerSessionManager({ identityProvider: bobDevice });
    const charlieSessions = new PeerSessionManager({ identityProvider: charlieDevice });

    const { inviterPeer: aliceBobPeer, accepterPeer: bobPeer } = await connectPeers(aliceSessions, bobSessions);
    const { inviterPeer: aliceCharliePeer, accepterPeer: charliePeer } = await connectPeers(aliceSessions, charlieSessions);

    // Bob and Charlie both deliberately choose to remember Alice — see
    // application/PeerRelationshipUseCase.js's own header, "Remembering
    // A Peer Is A Deliberate Act." Propagation's own relevance gate
    // (application/CreateIdentityLifecyclePropagationUseCase.js's
    // `knowsIdentity`) is wired against exactly this store.
    const bobStorage = new InMemoryStorageProvider();
    const charlieStorage = new InMemoryStorageProvider();
    const bobRelationships = new PeerRelationshipUseCase(bobStorage, bobDevice);
    const charlieRelationships = new PeerRelationshipUseCase(charlieStorage, charlieDevice);
    bobRelationships.rememberPeer(aliceBobPeer.remoteIdentity);
    charlieRelationships.rememberPeer(aliceCharliePeer.remoteIdentity);

    const aliceLifecycle = new IdentityLifecyclePropagationUseCase(new InMemoryStorageProvider(), aliceDevice, {
        peerMessageBus: new PeerMessageBus(),
        connectedPeerRegistry: aliceSessions.registry
    });
    const bobLifecycle = new IdentityLifecyclePropagationUseCase(bobStorage, bobDevice, {
        peerMessageBus: new PeerMessageBus(),
        connectedPeerRegistry: bobSessions.registry,
        knowsIdentity: (id) => bobRelationships.isKnown(id)
    });
    const charlieLifecycle = new IdentityLifecyclePropagationUseCase(charlieStorage, charlieDevice, {
        peerMessageBus: new PeerMessageBus(),
        connectedPeerRegistry: charlieSessions.registry,
        knowsIdentity: (id) => charlieRelationships.isKnown(id)
    });

    // 1. Alice declares a successor (a brand-new, independent identity)
    //    and broadcasts it to whoever is authenticated right now.
    const aliceNewDevice = makeDevice();
    const aliceNew = aliceNewDevice.createLocalIdentity('Alice (rotated)');
    const successionRecord = aliceDevice.declareSuccessor(alice.identityId, aliceNew.identityId);
    const sentTo = aliceLifecycle.broadcastSuccession(successionRecord);
    assert(sentTo === 2, `broadcastSuccession reaches every currently-AUTHENTICATED peer, got ${sentTo}`);
    console.log('✓ FLAGSHIP: Alice declares a successor and broadcasts the signed record to Bob and Charlie');

    await wait(300);

    assert(bobLifecycle.getRemoteLifecycle(alice.identityId).successorIdentityId === aliceNew.identityId, "Bob independently verified and stored Alice's successor declaration");
    assert(charlieLifecycle.getRemoteLifecycle(alice.identityId).successorIdentityId === aliceNew.identityId, "Charlie independently verified and stored it too");
    assert(!bobLifecycle.getRemoteLifecycle(alice.identityId).isRevoked, 'declaring a successor alone does not revoke anything — Bob does not treat it as one');
    console.log('✓ FLAGSHIP: Bob and Charlie both cryptographically verify the successor declaration');

    // 2. Alice revokes her old identity and broadcasts THAT.
    const revocationRecord = aliceDevice.revokeIdentity(alice.identityId, { reason: 'planned rotation' });
    const sentTo2 = aliceLifecycle.broadcastRevocation(revocationRecord);
    assert(sentTo2 === 2, 'broadcastRevocation also reaches both currently-connected peers');

    await wait(300);

    assert(bobLifecycle.getRemoteLifecycle(alice.identityId).isRevoked, "Bob's device now knows, cryptographically, that Alice's old identity is revoked");
    assert(charlieLifecycle.getRemoteLifecycle(alice.identityId).isRevoked, 'so does Charlie');
    console.log('✓ FLAGSHIP: Bob and Charlie both cryptographically verify the revocation');

    // Re-broadcasting the exact same, already-accepted revocation is a
    // harmless no-op — revocation is permanent, never re-derived.
    aliceLifecycle.broadcastRevocation(revocationRecord);
    await wait(200);
    assert(bobLifecycle.listRemoteLifecycle().filter((r) => r.identityId === alice.identityId).length === 1, 'a duplicate revocation broadcast never creates a second entry');

    // 3. A fresh connection attempt with the now-revoked identity fails
    //    cleanly on Alice's own side, before Bob or Charlie are ever
    //    involved — she has no way to even produce a HELLO (see
    //    identity/LocalIdentityProvider.js#_requireAuthenticatedIdentity(),
    //    unchanged since 0.2.67).
    let revokedAttemptThrew = false;
    try {
        await aliceSessions.createInvitation();
    } catch (e) {
        revokedAttemptThrew = true;
        assert(e.message.includes('revoked'), `failure names the revocation, got: ${e.message}`);
    }
    assert(revokedAttemptThrew, "Alice's revoked identity cannot even start a new connection attempt");
    console.log('✓ FLAGSHIP: a fresh connection attempt using the revoked identity is rejected before it can even begin');

    // 4. The identity Alice rotated TO is completely independent —
    //    authenticates fresh, connects to Bob normally, and Bob's
    //    decision to remember it is entirely his own, separate act.
    aliceNewDevice.authenticate(aliceNew.identityId);
    const aliceNewSessions = new PeerSessionManager({ identityProvider: aliceNewDevice });
    const { inviterPeer: aliceNewPeer, accepterPeer: bobPeerForNew } = await connectPeers(aliceNewSessions, bobSessions);
    assert(aliceNewPeer.remoteIdentity === undefined || bobPeerForNew.remoteIdentity.identityId === aliceNew.identityId, "Bob authenticates the successor identity independently, on its own merits");
    bobRelationships.rememberPeer(bobPeerForNew.remoteIdentity);

    const bobsKnownPeers = bobRelationships.getRelationships();
    assert(bobsKnownPeers.some((r) => r.identityId === alice.identityId), "Bob's OLD PeerRelationship with Alice's original identity still exists, untouched");
    assert(bobsKnownPeers.some((r) => r.identityId === aliceNew.identityId), "Bob now ALSO has a separate PeerRelationship with the successor identity");
    assert(bobsKnownPeers.length === 2, 'PeerRelationship(A) and PeerRelationship(B) are two distinct records — a verified succession link never auto-merges them, even though Bob knows about it');
    console.log('✓ FLAGSHIP: the successor identity authenticates fully independently; PeerRelationship(A) and PeerRelationship(B) remain distinct, never auto-merged');

    aliceSessions.dispose();
    bobSessions.dispose();
    charlieSessions.dispose();
    aliceNewSessions.dispose();
}

// ---------------------------------------------------------------------
// 4/5/6 — security: a fabricated claim is rejected; a GENUINE record
//    relayed by a party who is neither the subject nor its owner is
//    still accepted (the deliberate, documented opposite of
//    application/FriendRelationshipUseCase.js's actor-must-match-
//    connection rule — see application/
//    IdentityLifecyclePropagationUseCase.js's own header); and a
//    genuinely, validly signed record about an identity this device
//    has never remembered is dropped by the relevance gate regardless.
// ---------------------------------------------------------------------
{
    const bobDevice = makeDevice();
    const charlieDevice = makeDevice();
    bobDevice.createLocalIdentity('Bob');
    charlieDevice.createLocalIdentity('Charlie');
    bobDevice.authenticate(bobDevice.listLocalIdentities()[0].identityId);
    const charlie = charlieDevice.listLocalIdentities()[0];
    charlieDevice.authenticate(charlie.identityId);

    const bobSessions = new PeerSessionManager({ identityProvider: bobDevice });
    const charlieSessions = new PeerSessionManager({ identityProvider: charlieDevice });
    const { inviterPeer: charliePeer } = await connectPeers(charlieSessions, bobSessions);

    const bobStorage = new InMemoryStorageProvider();
    const bobRelationships = new PeerRelationshipUseCase(bobStorage, bobDevice);
    const bobLifecycle = new IdentityLifecyclePropagationUseCase(bobStorage, bobDevice, {
        peerMessageBus: new PeerMessageBus(),
        connectedPeerRegistry: bobSessions.registry,
        knowsIdentity: (id) => bobRelationships.isKnown(id)
    });

    const charlieBus = new PeerMessageBus();
    charlieBus.attach(charliePeer);

    // A device Alice generated but Bob independently already knows
    // about (e.g. from some earlier, unrelated occasion) — constructed
    // directly as a verified PeerIdentity, mirroring
    // tests/FriendRelationships.test.js's own test-1 pattern, so this
    // block needs no separate live Alice connection at all.
    const aliceDevice = makeDevice();
    const alice = aliceDevice.createLocalIdentity('Alice');
    aliceDevice.authenticate(alice.identityId);
    bobRelationships.rememberPeer(new PeerIdentity({ identityId: alice.identityId, publicKey: alice.publicKey }));

    // 4. Attack: Charlie cannot manufacture a succession record for
    //    Alice — he does not hold, and cannot produce, her signature.
    //    The closest a forgery gets is Charlie's own, genuinely valid
    //    signature stapled onto a claim about a DIFFERENT identityId.
    const forgedPayload = toIdentitySuccessionRecord({
        predecessorIdentityId: alice.identityId,
        predecessorPublicKey: alice.publicKey,
        successorIdentityId: charlie.identityId,
        successorPublicKey: charlie.publicKey
    });
    const forgedSignature = charlieDevice.signCanonical(getIdentitySuccessionSigningDescriptor(forgedPayload));
    const forgedRecord = { ...forgedPayload, signature: forgedSignature.toJSON() };
    assert(!new LocalAuthorizationVerifier().verifyIdentitySuccession(forgedRecord).valid, 'sanity check: the forged record does not verify on its own');

    charlieBus.send(charliePeer, IdentityLifecyclePropagationUseCase.DEFAULT_PROTOCOL, toIdentityLifecycleGossipMessage(IdentityLifecycleGossipKind.SUCCESSION, forgedRecord));
    await wait(300);
    assert(bobLifecycle.getRemoteLifecycle(alice.identityId) === null, "Charlie's fabricated 'Alice -> Charlie' succession claim is rejected outright — Bob stores nothing for Alice");
    console.log('✓ SECURITY: Charlie cannot manufacture a succession claim for an identity whose key he does not hold');

    // 5. Legitimate relay: Alice genuinely revokes herself — entirely
    //    on her own device, with no connection to Bob at all — and
    //    Charlie, who merely happens to also be connected to Bob right
    //    now, relays the resulting GENUINE signed record. Bob accepts
    //    it: what makes it trustworthy is the record's OWN signature,
    //    never who handed it to him. This is the deliberate, documented
    //    opposite of application/FriendRelationshipUseCase.js's own
    //    actor-must-match-connection replay defense — see application/
    //    IdentityLifecyclePropagationUseCase.js's own header.
    const genuineRevocation = aliceDevice.revokeIdentity(alice.identityId, { reason: 'compromised, relayed via a third party' });
    charlieBus.send(charliePeer, IdentityLifecyclePropagationUseCase.DEFAULT_PROTOCOL, toIdentityLifecycleGossipMessage(IdentityLifecycleGossipKind.REVOCATION, genuineRevocation));
    await wait(300);
    assert(bobLifecycle.getRemoteLifecycle(alice.identityId).isRevoked, "Bob accepts Alice's genuine revocation even though Charlie — who is neither Alice nor her successor — relayed it, never having been directly connected to her at all");
    console.log('✓ SECURITY: a GENUINE, validly-signed record is accepted no matter who relays it — propagation trusts the signature, never the relaying connection');

    // 6. Relevance gate: Dana is a real, genuinely-revoked identity, but
    //    Bob has never remembered her as a Known Peer or a Friend.
    //    Charlie relays her perfectly valid revocation anyway — Bob
    //    still drops it, on relevance, not on any cryptographic defect.
    const danaDevice = makeDevice();
    const dana = danaDevice.createLocalIdentity('Dana');
    danaDevice.authenticate(dana.identityId);
    const danaRevocation = danaDevice.revokeIdentity(dana.identityId);
    assert(new LocalAuthorizationVerifier().verifyIdentityRevocation(danaRevocation).valid, 'sanity check: Dana\'s revocation is genuinely, validly signed');
    assert(!bobRelationships.isKnown(dana.identityId), "sanity check: Bob has never remembered Dana");

    charlieBus.send(charliePeer, IdentityLifecyclePropagationUseCase.DEFAULT_PROTOCOL, toIdentityLifecycleGossipMessage(IdentityLifecycleGossipKind.REVOCATION, danaRevocation));
    await wait(300);
    assert(bobLifecycle.getRemoteLifecycle(dana.identityId) === null, 'a genuinely, validly signed revocation about an identity Bob has never known is dropped — propagation reaches identities this device already knows, never an open revocation directory');
    console.log('✓ SECURITY: a valid record about an identity this device has never known is dropped by the relevance gate, not stored as an unbounded gossip cache');

    bobSessions.dispose();
    charlieSessions.dispose();
}

console.log('\nAll identity lifecycle propagation tests passed.');
console.log('Note (deliberately not solved here, see docs/Roadmap.md 0.2.68): propagation is direct-broadcast-to-');
console.log('currently-connected-peers only — no durable retry to a peer who is offline right now (unlike');
console.log('application/ChatOutbox.js\'s own reliable-delivery model), and no multi-hop relay beyond a device\'s');
console.log('own directly-connected peers. Both are real, deliberately deferred future work.');
}

await runTests();
