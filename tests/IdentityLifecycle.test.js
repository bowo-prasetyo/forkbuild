import { LocalIdentity } from '../identity/LocalIdentity.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { IdentityLifecycleState } from '../core/IdentityLifecycleState.js';
import { isValidIdentityRevocationRecord, toIdentityRevocationRecord } from '../core/IdentityRevocationEnvelope.js';
import { isValidIdentitySuccessionRecord } from '../core/IdentitySuccessionEnvelope.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { IncorrectPassphraseError } from '../identity/KeyEncryption.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { PeerAuthenticationSession } from '../peer/PeerAuthenticationSession.js';
import { PeerAuthenticationState } from '../peer/PeerAuthenticationState.js';
import * as Ed25519 from '../identity/Ed25519.js';

// 0.2.67 — Identity Lifecycle Hardening.
//
// 0.2.46 through 0.2.48 gave a LocalIdentity a durable local existence,
// protected its key at rest, and made it portable between devices — but
// none of them ever answered what happens when the owner wants to
// change, rotate, revoke, or recover it. This is that milestone: three
// new signed/local operations layered on identity/LocalIdentityProvider.js
// (changePassphrase, declareSuccessor, revokeIdentity), and exactly ONE
// new gate enforced at the one place every signature in this codebase
// already passes through (_requireAuthenticatedIdentity) — which is
// also, with zero lines touched under peer/, what stops a revoked
// identity from completing any NEW peer authentication handshake.
//
// The flagship (block 8) runs the milestone's own scripted scenario:
// Alice authenticates, connects to Bob, changes her passphrase (Bob
// notices nothing — same identity), declares a successor, revokes
// herself in favor of it, and a fresh connection attempt using her old
// identity fails cleanly rather than throwing through the transport.
// The final block is explicit about the one thing this milestone
// deliberately does NOT build: revocation is a durable LOCAL fact, not
// yet a fact that propagates to any other device or peer on its own.

const TEST_ITERATIONS = 25; // fast, deliberately weak KDF cost for tests

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

function makeDevice() {
    return new LocalIdentityProvider(new InMemoryStorageProvider(), { pbkdf2Iterations: TEST_ITERATIONS });
}

async function runTests() {

// ---------------------------------------------------------------------
// 1. LocalIdentity: lifecycleState/successorIdentityId, and backward
//    compatibility with every pre-0.2.67 stored entry that never had
//    either field.
// ---------------------------------------------------------------------
{
    const device = makeDevice();
    const alice = device.createLocalIdentity('Alice');
    assert(alice.lifecycleState === IdentityLifecycleState.ACTIVE, 'a freshly-created identity is ACTIVE by default');
    assert(!alice.isRevoked, 'isRevoked is false for an ACTIVE identity');
    assert(alice.successorIdentityId === null, 'no successor by default');

    // A pre-0.2.67 stored entry never had lifecycleState/successorIdentityId
    // at all — exactly like a pre-0.2.47 entry never had `protected`.
    const legacyEntry = { identityId: alice.identityId, publicKey: alice.publicKey, algorithm: 'Ed25519', label: 'Alice', createdAt: alice.createdAt.toISOString() };
    const legacyIdentity = LocalIdentity.fromJSON(legacyEntry);
    assert(legacyIdentity.lifecycleState === IdentityLifecycleState.ACTIVE, 'a legacy entry with no lifecycleState field deserializes as ACTIVE, no migration required');

    assertThrows(() => new LocalIdentity({ ...legacyEntry, lifecycleState: 'DELETED' }), 'an invalid lifecycleState is rejected');
    assertThrows(() => new LocalIdentity({ ...legacyEntry, successorIdentityId: alice.identityId }), 'an identity cannot be its own successor');
    console.log('✓ LocalIdentity: lifecycleState/successorIdentityId default correctly and stay backward-compatible');
}

// ---------------------------------------------------------------------
// 2. changePassphrase: the identity is untouched — same identityId,
//    same public key, every prior signature remains valid — only the
//    encryption protecting the key changes.
// ---------------------------------------------------------------------
{
    const device = makeDevice();
    const alice = device.createLocalIdentity('Alice', 'old-pass');
    device.authenticate(alice.identityId, 'old-pass');
    const signatureBefore = device.signCanonical({ type: 'test', id: 'x', revision: 1, payload: {} });

    const updated = device.changePassphrase(alice.identityId, 'old-pass', 'new-pass');
    assert(updated.identityId === alice.identityId, 'changePassphrase never changes identityId');
    assert(updated.publicKey === alice.publicKey, 'changePassphrase never changes the public key');
    assert(updated.label === alice.label, 'changePassphrase never changes the label');
    assert(!device.isUnlocked(alice.identityId), 'the vault is forced LOCKED after a passphrase change, like protectIdentity()');

    assertThrows(() => device.unlock(alice.identityId, 'old-pass'), 'the old passphrase no longer unlocks the vault');
    device.unlock(alice.identityId, 'new-pass');
    assert(device.isUnlocked(alice.identityId), 'the new passphrase unlocks it');

    device.authenticate(alice.identityId, 'new-pass');
    const signatureAfter = device.signCanonical({ type: 'test', id: 'x', revision: 1, payload: {} });
    assert(signatureBefore.signer === signatureAfter.signer, 'a signature produced before and after a passphrase change share the exact same signer identity');
    assert(signatureBefore.signature === signatureAfter.signature, 'signing the identical descriptor before/after produces the identical signature (same key, deterministic Ed25519)');

    assertThrows(() => device.changePassphrase(alice.identityId, 'wrong', 'whatever'), 'the wrong current passphrase is rejected');
    assertThrows(() => {
        const unprotected = device.createLocalIdentity('Bob');
        device.changePassphrase(unprotected.identityId, 'anything', 'new');
    }, 'changePassphrase refuses an identity that was never protected');
    console.log('✓ changePassphrase: re-protects the same key under a new passphrase, identity and its signatures are untouched');
}

// ---------------------------------------------------------------------
// 3. declareSuccessor: a signed, verifiable statement — never a
//    revocation, never requires holding the successor's own key.
// ---------------------------------------------------------------------
{
    const device = makeDevice();
    const alice = device.createLocalIdentity('Alice');
    device.authenticate(alice.identityId);

    // Bob's key is generated on a completely separate device — Alice
    // never holds it, and never needs to.
    const bobDevice = makeDevice();
    const bob = bobDevice.createLocalIdentity('Bob');

    const record = device.declareSuccessor(alice.identityId, bob.identityId);
    assert(isValidIdentitySuccessionRecord(record), 'the produced record is well-formed');
    assert(record.predecessorIdentityId === alice.identityId, 'predecessor is Alice');
    assert(record.successorIdentityId === bob.identityId, 'successor is Bob');
    assert(record.successorPublicKey === bob.publicKey, "the successor's public key is correctly recovered from their did:key alone");

    const verifier = new LocalAuthorizationVerifier();
    const result = verifier.verifyIdentitySuccession(record);
    assert(result.valid && result.signed, 'the succession record verifies — signed by the PREDECESSOR only');

    assert(!device.isRevoked(alice.identityId), 'declaring a successor does NOT revoke the predecessor');
    assert(device.getLocalIdentity(alice.identityId).successorIdentityId === bob.identityId, 'the successor pointer is recorded locally');

    assertThrows(() => device.declareSuccessor(alice.identityId, alice.identityId), 'an identity cannot declare itself as its own successor');
    assertThrows(() => device.declareSuccessor(alice.identityId, 'did:key:znotreal'), 'a malformed did:key is rejected as a successor');
    console.log('✓ declareSuccessor: signed by the predecessor alone, verifiable, never itself a revocation');
}

// ---------------------------------------------------------------------
// 4. revokeIdentity: durable, permanent, and closes exactly one gate —
//    signCanonical()/getSigningIdentity() — while leaving the
//    AuthenticationSession and VaultLock completely independent.
// ---------------------------------------------------------------------
{
    const device = makeDevice();
    const alice = device.createLocalIdentity('Alice');
    device.authenticate(alice.identityId);

    const record = device.revokeIdentity(alice.identityId, { reason: 'testing' });
    assert(isValidIdentityRevocationRecord(record), 'the produced record is well-formed');
    assert(record.reason === 'testing', 'the reason is carried through');

    const verifier = new LocalAuthorizationVerifier();
    const verifyResult = verifier.verifyIdentityRevocation(record);
    assert(verifyResult.valid && verifyResult.signed, 'the revocation record verifies — self-signed by identityId itself');

    assert(device.isRevoked(alice.identityId), 'the identity is now REVOKED');
    assert(device.getLocalIdentity(alice.identityId).lifecycleState === IdentityLifecycleState.REVOKED, 'lifecycleState reflects it durably');

    // VAULT LOCKED ≠ AUTHENTICATION INACTIVE ≠ IDENTITY REVOKED — all
    // three stay independent facts.
    assert(device.isAuthenticated(), 'revocation does NOT end the AuthenticationSession — the owner can still inspect the revoked identity');
    assert(device.currentUser() !== null, 'currentUser() is unaffected by revocation');

    assertThrows(() => device.signCanonical({ type: 'test', id: 'x', revision: 1, payload: {} }), 'signCanonical refuses a revoked identity');
    assertThrows(() => device.getSigningIdentity(), 'getSigningIdentity refuses a revoked identity');
    assertThrows(() => device.revokeIdentity(alice.identityId), 'an already-revoked identity cannot be revoked a second time');

    // A tampered/forged revocation record is rejected exactly like every
    // other REQUIRED-signature envelope in this codebase.
    const bobDevice = makeDevice();
    const bob = bobDevice.createLocalIdentity('Bob');
    bobDevice.authenticate(bob.identityId);
    const forgedPayload = toIdentityRevocationRecord({ identityId: alice.identityId, publicKey: alice.publicKey, algorithm: 'Ed25519' });
    // Bob cannot produce a genuine signature over Alice's identityId at
    // all — signCanonical() always signs as the currently-authenticated
    // identity — so the closest a forgery gets is Bob's OWN, genuinely
    // valid signature stapled onto a record that claims to be Alice's.
    const bobsRevocationOfHimself = bobDevice.revokeIdentity(bob.identityId);
    const forgedRecord = { ...forgedPayload, signature: bobsRevocationOfHimself.signature };
    const forgedResult = verifier.verifyIdentityRevocation(forgedRecord);
    assert(!forgedResult.valid, 'a revocation record signed by a DIFFERENT identity than the one it claims to revoke is rejected');
    assert(forgedResult.reason === 'signer does not match the revoked identityId', `rejected specifically on signer mismatch, got: ${forgedResult.reason}`);

    assert(!verifier.verifyIdentityRevocation({ ...record, signature: null }).valid, 'an unsigned revocation record is never tolerated (unlike AVATAR_*/RENDEZVOUS_PUBLICATION)');
    console.log('✓ revokeIdentity: permanent, self-attested, closes signing while leaving session/vault independent');
}

// ---------------------------------------------------------------------
// 5. revokeIdentity with a bundled successorIdentityId — the common
//    "rotate right now" gesture as one signed user action.
// ---------------------------------------------------------------------
{
    const device = makeDevice();
    const alice = device.createLocalIdentity('Alice');
    device.authenticate(alice.identityId);
    const successorDevice = makeDevice();
    const aliceNew = successorDevice.createLocalIdentity('Alice (new key)');

    const revocation = device.revokeIdentity(alice.identityId, { successorIdentityId: aliceNew.identityId });
    assert(revocation.successorIdentityId === aliceNew.identityId, 'the revocation itself names the successor');

    const successionRecord = device.getSuccessionRecord(alice.identityId);
    assert(successionRecord, 'revokeIdentity ALSO produced and stored a succession record in the same call');
    assert(successionRecord.successorIdentityId === aliceNew.identityId, 'pointing at the same successor');

    const verifier = new LocalAuthorizationVerifier();
    assert(verifier.verifyIdentitySuccession(successionRecord).valid, 'the bundled succession record verifies independently');
    assert(verifier.verifyIdentityRevocation(revocation).valid, 'the revocation record verifies independently');
    assert(device.getLocalIdentity(alice.identityId).successorIdentityId === aliceNew.identityId, 'the local index records the successor pointer too');
    console.log('✓ revokeIdentity({ successorIdentityId }): rotation and revocation as one signed act, still two independent records');
}

// ---------------------------------------------------------------------
// 6. Protected identities: revoking/rotating requires the passphrase
//    exactly like every other lifecycle-mutating operation, and never
//    leaves a decrypted seed sitting in memory afterward.
// ---------------------------------------------------------------------
{
    const device = makeDevice();
    const alice = device.createLocalIdentity('Alice', 'alice-pass');

    assertThrows(() => device.revokeIdentity(alice.identityId), 'revoking a locked, protected identity without a passphrase is refused');
    const record = device.revokeIdentity(alice.identityId, { passphrase: 'alice-pass' });
    assert(record.signature, 'the passphrase-gated revocation still produces a real, signed record');
    assert(!device.isUnlocked(alice.identityId), 'the vault is evicted again immediately after producing the revocation signature');
    console.log('✓ protected identities: revoke()/declareSuccessor() are gated by the same passphrase discipline as unlock()');
}

// ---------------------------------------------------------------------
// 7. Composition with 0.2.48 recovery: export/import still moves the
//    KEY between devices unmodified; lifecycle state is explicitly a
//    separate, LOCAL fact that recovery alone does not carry — the one
//    honestly-named gap this milestone leaves (see block 8's own note).
// ---------------------------------------------------------------------
{
    const originDevice = makeDevice();
    const alice = originDevice.createLocalIdentity('Alice', 'backup-pass');
    const backupPackage = originDevice.exportLocalIdentity(alice.identityId, 'backup-pass');

    // Alice's ORIGIN device is later compromised; she revokes it there.
    originDevice.revokeIdentity(alice.identityId, { passphrase: 'backup-pass', reason: 'device compromised' });
    assert(originDevice.isRevoked(alice.identityId), 'the origin device now marks Alice REVOKED');

    // Recovery, from the backup made BEFORE the compromise, onto a brand
    // new device — 0.2.48's pipeline, completely unmodified.
    const recoveryDevice = makeDevice();
    const { status, identity: recovered } = recoveryDevice.importLocalIdentity(backupPackage, 'backup-pass');
    assert(status === 'IMPORTED', 'recovery succeeds — the exported package plus its passphrase is all it ever required');
    assert(recovered.identityId === alice.identityId, 'the SAME identity is recovered, not a new one');
    assert(!recoveryDevice.isRevoked(alice.identityId), 'lifecycle state does not travel inside an export package — the recovered copy starts ACTIVE on its own device, an explicit, named limitation, not an oversight');

    // Alice, now holding the key again, can revoke it herself on THIS
    // device too — revocation is self-service, tied to key possession,
    // never to any one specific device.
    recoveryDevice.unlock(alice.identityId, 'backup-pass');
    recoveryDevice.authenticate(alice.identityId, 'backup-pass');
    recoveryDevice.revokeIdentity(alice.identityId, { passphrase: 'backup-pass' });
    assert(recoveryDevice.isRevoked(alice.identityId), 'the recovered copy can independently be revoked once its owner knows about the compromise');
    console.log('✓ recovery (0.2.48) composes with revocation (0.2.67): the key travels, lifecycle state stays local until separately re-declared');
}

// ---------------------------------------------------------------------
// 8. FLAGSHIP — the milestone's own scripted scenario, over a REAL
//    peer connection: authenticate, connect, change passphrase, declare
//    a successor, revoke, and watch a fresh connection attempt using
//    the revoked identity fail cleanly rather than crash the transport.
// ---------------------------------------------------------------------
{
    const network = new LocalPeerNetwork();
    const aliceDevice = makeDevice();
    const bobDevice = makeDevice();
    const alice = aliceDevice.createLocalIdentity('Alice', 'alice-pass');
    bobDevice.createLocalIdentity('Bob');
    aliceDevice.authenticate(alice.identityId, 'alice-pass');
    bobDevice.authenticate(bobDevice.listLocalIdentities()[0].identityId);

    let connectionRound = 0;
    async function connectAndAuthenticate() {
        connectionRound += 1;
        const aliceAddress = 'alice-' + connectionRound;
        const bobAddress = 'bob-' + connectionRound;
        const aliceTransport = new LocalPeerConnectionProvider(aliceAddress, network);
        const bobTransport = new LocalPeerConnectionProvider(bobAddress, network);
        let bobConnection = null;
        bobTransport.onIncomingConnection((connection) => { bobConnection = connection; });
        const aliceConnection = aliceTransport.connect(bobAddress);
        await wait();
        const aliceSession = new PeerAuthenticationSession({ connection: aliceConnection, identityProvider: aliceDevice });
        const bobSession = new PeerAuthenticationSession({ connection: bobConnection, identityProvider: bobDevice });
        aliceSession.start();
        bobSession.start();
        await wait(20);
        return { aliceSession, bobSession, aliceConnection };
    }

    // Step 1: Alice authenticates and successfully connects to Bob —
    // both sides reach a real, mutually-proven AUTHENTICATED state.
    const first = await connectAndAuthenticate();
    assert(first.aliceSession.authenticationState === PeerAuthenticationState.AUTHENTICATED, 'Alice authenticates to Bob before anything else happens');
    assert(first.bobSession.authenticationState === PeerAuthenticationState.AUTHENTICATED, 'Bob authenticates Alice, mutually');
    assert(first.bobSession.remoteIdentity.identityId === alice.identityId, "Bob's proven remoteIdentity is Alice's real identityId");
    first.aliceConnection.close();

    // Step 2: Alice changes her vault passphrase. Nothing about her
    // identity changed, so nothing downstream needs to know or care.
    aliceDevice.changePassphrase(alice.identityId, 'alice-pass', 'alice-pass-2');
    aliceDevice.unlock(alice.identityId, 'alice-pass-2');
    aliceDevice.authenticate(alice.identityId, 'alice-pass-2');
    const second = await connectAndAuthenticate();
    assert(second.bobSession.authenticationState === PeerAuthenticationState.AUTHENTICATED, 'after a passphrase change, Bob still recognizes and authenticates the SAME identityId with zero special-casing');
    assert(second.bobSession.remoteIdentity.identityId === alice.identityId, "it is still, provably, Alice's identity");
    second.aliceConnection.close();

    // Step 3: Alice rotates to a successor and revokes her old identity
    // in the same signed act.
    const aliceNewDevice = makeDevice();
    const aliceNew = aliceNewDevice.createLocalIdentity('Alice (rotated)');
    aliceDevice.revokeIdentity(alice.identityId, { passphrase: 'alice-pass-2', reason: 'planned rotation', successorIdentityId: aliceNew.identityId });
    assert(aliceDevice.isRevoked(alice.identityId), 'Alice is now REVOKED on her own device');

    const verifier = new LocalAuthorizationVerifier();
    assert(verifier.verifyIdentityRevocation(aliceDevice.getRevocationRecord(alice.identityId)).valid, "Alice's revocation record verifies");
    assert(verifier.verifyIdentitySuccession(aliceDevice.getSuccessionRecord(alice.identityId)).valid, "Alice's successor declaration verifies");

    // Step 4: a NEW connection attempt using the revoked identity is
    // rejected — not by any change to peer/, but because there is no
    // longer any way for her old identity to produce a valid PROOF.
    aliceDevice.unlock(alice.identityId, 'alice-pass-2');
    // authenticate() itself still succeeds — a revoked identity can
    // still be the app's "logged in" identity, exactly as designed.
    aliceDevice.authenticate(alice.identityId, 'alice-pass-2');
    const third = await connectAndAuthenticate();
    assert(third.aliceSession.authenticationState === PeerAuthenticationState.FAILED, "Alice's OWN side fails to even start — no signing identity available");
    assert(third.aliceSession.failureReason.includes('revoked'), `failure reason names revocation, got: ${third.aliceSession.failureReason}`);
    assert(third.bobSession.authenticationState !== PeerAuthenticationState.AUTHENTICATED, 'Bob never reaches AUTHENTICATED against a revoked identity that cannot produce a HELLO at all');
    third.aliceConnection.close();

    // Step 5: the identity Alice rotated TO is a completely independent,
    // fully functional identity — rotation never contaminates the new
    // key with the old one's revoked status.
    aliceNewDevice.authenticate(aliceNew.identityId);
    assert(!aliceNewDevice.isRevoked(aliceNew.identityId), 'the successor identity is unaffected — ACTIVE from its own first moment');
    const rotatedSignature = aliceNewDevice.signCanonical({ type: 'test', id: 'x', revision: 1, payload: {} });
    assert(rotatedSignature.signer === aliceNew.identityId, 'the successor identity signs normally, as itself');

    console.log('✓ FLAGSHIP: authenticate -> connect -> change passphrase (unaffected) -> rotate + revoke -> new connection REJECTED -> successor unaffected');
}

console.log('\nAll identity lifecycle tests passed.');
console.log('Note (deliberately not solved here, see docs/Roadmap.md 0.2.67): a revocation is a durable fact on the');
console.log('revoking device only. Propagating "identity A is revoked, trust B instead" to every device or peer that');
console.log('still holds/knows A is left to a future milestone, over the same decentralized infrastructure this');
console.log('codebase already has — never a central revocation server.');
}

await runTests();
