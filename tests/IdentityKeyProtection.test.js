import { LocalIdentity } from '../identity/LocalIdentity.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { VaultLockState } from '../identity/VaultLock.js';
import { isVaultExpired } from '../identity/VaultTimeoutPolicy.js';
import * as KeyEncryption from '../identity/KeyEncryption.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { Signature, SignatureType } from '../core/Signature.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.2.47 — Identity Security & Key Protection.
//
// 0.2.46 gave every LocalIdentity a durable, inspectable existence and
// separated it from whether a session is currently authenticated onto
// it — but named, rather than solved, the gap that a LocalIdentity's
// private key sat on disk in plain hex regardless. This milestone closes
// that gap for identities that opt in, and proves a FOURTH concept —
// identity/VaultLock.js, "is this identity's key decrypted in memory
// right now?" — is genuinely independent of both LocalIdentity
// (durable) and AuthenticationSession (persisted): a protected
// identity's vault always starts LOCKED on a fresh page load even when
// its AuthenticationSession is still AUTHENTICATED from before.

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

function assertThrows(fn, expectedMessage, message) {
    try {
        fn();
        assert(false, message);
    } catch (e) {
        assert(e.message.includes(expectedMessage), `${message}: ${e.message}`);
    }
}

// ---------------------------------------------------------------------
// 1. KeyEncryption — round-trips, rejects wrong passphrases and
//    tampered records, never returns wrong-but-plausible bytes.
// ---------------------------------------------------------------------
{
    const seed = new Uint8Array(32);
    for (let i = 0; i < 32; i++) seed[i] = i * 7 % 256;

    const record = KeyEncryption.encrypt(seed, 'correct horse battery staple', { iterations: TEST_ITERATIONS });
    const decrypted = KeyEncryption.decrypt(record, 'correct horse battery staple');
    assert(Array.from(decrypted).every((b, i) => b === seed[i]), 'encrypt/decrypt round-trips the exact seed bytes');

    assertThrows(() => KeyEncryption.decrypt(record, 'wrong passphrase'),
        'incorrect passphrase', 'a wrong passphrase is rejected, never silently decrypted to garbage');

    const tampered = { ...record, ciphertext: record.ciphertext.slice(0, -2) + (record.ciphertext.slice(-2) === '00' ? '11' : '00') };
    assertThrows(() => KeyEncryption.decrypt(tampered, 'correct horse battery staple'),
        'incorrect passphrase', 'a tampered ciphertext is rejected by the MAC before decryption is trusted');

    const record2 = KeyEncryption.encrypt(seed, 'correct horse battery staple', { iterations: TEST_ITERATIONS });
    assert(record.salt !== record2.salt && record.nonce !== record2.nonce,
        'encrypting the same seed twice never reuses salt or nonce');
    console.log('✓ KeyEncryption: round-trips, rejects wrong passphrase and tampering, never reuses salt/nonce');
}

// ---------------------------------------------------------------------
// 2. LocalIdentity — backward-compatible with pre-0.2.47 entries that
//    never had a `protected` field at all.
// ---------------------------------------------------------------------
{
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider(), { pbkdf2Iterations: TEST_ITERATIONS });
    const unprotected = provider.createLocalIdentity('Alice');
    assert(unprotected.isProtected === false, 'an identity created with no passphrase is unprotected');

    const { protected: _drop, ...legacyShape } = unprotected.toJSON();
    const legacy = LocalIdentity.fromJSON(legacyShape);
    assert(legacy.isProtected === false, 'a pre-0.2.47 stored entry with no protected field deserializes as unprotected');
    console.log('✓ LocalIdentity: isProtected defaults false, pre-0.2.47 entries load unchanged');
}

// ---------------------------------------------------------------------
// 3. Creating a protected identity never writes the plaintext seed to
//    storage at all.
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const provider = new LocalIdentityProvider(storage, { pbkdf2Iterations: TEST_ITERATIONS });
    const alice = provider.createLocalIdentity('Alice', 'hunter2');

    assert(alice.isProtected === true, 'createLocalIdentity(label, passphrase) creates a protected identity');
    const stored = storage.load('local-identity-key:' + alice.identityId);
    assert(!('seed' in stored), 'the plaintext seed is never written to storage for a protected identity');
    assert(stored.encryption && stored.encryption.ciphertext, 'the encrypted record is what gets stored instead');
    assert(provider.vaultLock(alice.identityId).state === VaultLockState.LOCKED,
        'a freshly created protected identity starts LOCKED — creating it does not also unlock it');
    console.log('✓ createLocalIdentity: protected identity never persists a plaintext seed, starts LOCKED');
}

// ---------------------------------------------------------------------
// 4. Signing is impossible while locked, and the refusal reason
//    distinguishes "not authenticated" from "locked."
// ---------------------------------------------------------------------
{
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider(), { pbkdf2Iterations: TEST_ITERATIONS });
    const alice = provider.createLocalIdentity('Alice', 'hunter2');
    const descriptor = { type: SignatureType.PLACEMENT_RECORD, id: 'p1', revision: 1, payload: { a: 1 } };

    assertThrows(() => provider.signCanonical(descriptor), 'no active authentication session',
        'signing before any authentication fails with the session reason, not a lock reason');

    assertThrows(() => provider.authenticate(alice.identityId), 'a passphrase is required',
        'authenticating a protected identity with no passphrase is refused');

    assertThrows(() => provider.authenticate(alice.identityId, 'wrong-pass'), 'incorrect passphrase',
        'authenticating with the wrong passphrase is refused');

    provider.authenticate(alice.identityId, 'hunter2');
    const signature = provider.signCanonical(descriptor);
    assert(signature instanceof Signature && signature.signer === alice.identityId,
        'authenticating with the correct passphrase unlocks the vault and signing succeeds');

    const verifier = new LocalAuthorizationVerifier();
    const result = verifier.verifyDescriptor(descriptor, signature, provider.getSigningIdentity().toJSON());
    assert(result.valid === true, 'a signature produced by a protected identity verifies exactly like an unprotected one');

    provider.lock(alice.identityId);
    assert(provider.isAuthenticated() === true, 'lock() does not end the authentication session');
    assert(provider.currentUser().username === 'Alice', 'the app still shows Alice as logged in while locked');
    assertThrows(() => provider.signCanonical(descriptor), 'identity is locked',
        'signing is refused with a LOCK-specific reason once the vault is locked, even though the session is still authenticated');

    provider.unlock(alice.identityId, 'hunter2');
    const signature2 = provider.signCanonical(descriptor);
    assert(signature2.signer === alice.identityId, 're-unlocking with the correct passphrase restores signing, same identity');
    console.log('✓ signing gated distinctly by session vs. lock state; verifies end-to-end through LocalAuthorizationVerifier');
}

// ---------------------------------------------------------------------
// 5. Failed-unlock handling: attempts are tracked, exhausting them
//    starts a cooldown, and success resets the counter.
// ---------------------------------------------------------------------
{
    let fakeNow = new Date('2026-01-01T00:00:00Z');
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider(), {
        pbkdf2Iterations: TEST_ITERATIONS, maxUnlockAttempts: 3, unlockCooldownMs: 5000, now: () => fakeNow
    });
    const alice = provider.createLocalIdentity('Alice', 'hunter2');

    assertThrows(() => provider.unlock(alice.identityId, 'x'), '2 attempt(s) remaining', 'first failure reports remaining attempts');
    assertThrows(() => provider.unlock(alice.identityId, 'x'), '1 attempt(s) remaining', 'second failure reports remaining attempts');
    assertThrows(() => provider.unlock(alice.identityId, 'x'), 'temporarily locked out', 'third failure trips the cooldown');
    assertThrows(() => provider.unlock(alice.identityId, 'hunter2'), 'too many failed unlock attempts',
        'the CORRECT passphrase is still refused during the cooldown window — the lockout is time-based, not passphrase-based');

    fakeNow = new Date(fakeNow.getTime() + 6000);
    const lock = provider.unlock(alice.identityId, 'hunter2');
    assert(lock.isUnlocked === true, 'after the cooldown elapses, the correct passphrase succeeds again');

    provider.lock(alice.identityId);
    assertThrows(() => provider.unlock(alice.identityId, 'x'), '2 attempt(s) remaining',
        'a successful unlock resets the failure counter back to zero');
    console.log('✓ FailedUnlockTracker: attempts counted, cooldown enforced by time not passphrase, success resets it');
}

// ---------------------------------------------------------------------
// 6. Automatic vault expiration: derived from (unlockedAt, now,
//    timeout), never a stored flag, and never ends the
//    AuthenticationSession by itself.
// ---------------------------------------------------------------------
{
    let fakeNow = new Date('2026-01-01T00:00:00Z');
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider(), {
        pbkdf2Iterations: TEST_ITERATIONS, vaultTimeoutMs: 1000, now: () => fakeNow
    });
    const alice = provider.createLocalIdentity('Alice', 'hunter2');
    provider.authenticate(alice.identityId, 'hunter2');
    assert(provider.isUnlocked(alice.identityId) === true, 'unlocked immediately after authenticating');

    fakeNow = new Date(fakeNow.getTime() + 500);
    assert(provider.isUnlocked(alice.identityId) === true, 'still unlocked before the timeout elapses');

    fakeNow = new Date(fakeNow.getTime() + 600); // total 1100ms > 1000ms timeout
    assert(provider.isUnlocked(alice.identityId) === false, 'the vault lazily re-locks itself once the timeout elapses');
    assert(provider.isAuthenticated() === true, 'vault expiry does not end the AuthenticationSession — a separate fact');
    assertThrows(() => provider.signCanonical({ type: SignatureType.PLACEMENT_RECORD, id: 'x', revision: 1, payload: {} }),
        'identity is locked', 'signing fails once the vault has idle-expired');

    const provider2 = new LocalIdentityProvider(new InMemoryStorageProvider(), { pbkdf2Iterations: TEST_ITERATIONS });
    const bob = provider2.createLocalIdentity('Bob'); // unprotected
    provider2.authenticate(bob.identityId);
    assert(provider2.isUnlocked(bob.identityId) === true, 'an unprotected identity is unaffected by vault timeout — nothing to expire');
    console.log('✓ VaultTimeoutPolicy: lazily computed expiry locks the vault without touching the session');
}

// ---------------------------------------------------------------------
// 7. isVaultExpired — pure function invariants.
// ---------------------------------------------------------------------
{
    const t0 = new Date('2026-01-01T00:00:00Z');
    assert(isVaultExpired(null, t0, 1000) === false, 'no unlockedAt at all is never expired');
    assert(isVaultExpired(t0, new Date(t0.getTime() + 999), 1000) === false, 'just under the timeout is not expired');
    assert(isVaultExpired(t0, new Date(t0.getTime() + 1000), 1000) === true, 'exactly at the timeout counts as expired');
    console.log('✓ isVaultExpired: pure function boundary behavior');
}

// ---------------------------------------------------------------------
// 8. Migration: protecting an existing unprotected identity happens in
//    place, non-destructively, and only when explicitly requested.
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const provider = new LocalIdentityProvider(storage, { pbkdf2Iterations: TEST_ITERATIONS });
    const bob = provider.createLocalIdentity('Bob');
    provider.authenticate(bob.identityId);
    const signatureBefore = provider.signCanonical({ type: SignatureType.PLACEMENT_RECORD, id: 'b1', revision: 1, payload: {} });
    const keyBefore = signatureBefore.signer;

    const protectedBob = provider.protectIdentity(bob.identityId, 'bobs-secret');
    assert(protectedBob.isProtected === true, 'protectIdentity flips the identity to protected');
    assert(provider.listLocalIdentities().length === 1, 'protecting migrates in place — it never creates a second identity');
    assert(!('seed' in storage.load('local-identity-key:' + bob.identityId)),
        'after protecting, the plaintext seed is no longer present in storage');
    assert(provider.vaultLock(bob.identityId).state === VaultLockState.LOCKED,
        'the identity is LOCKED immediately after being protected, even though its session is still authenticated');

    assertThrows(() => provider.signCanonical({ type: SignatureType.PLACEMENT_RECORD, id: 'b2', revision: 1, payload: {} }),
        'identity is locked', 'signing is refused right after migration until the new passphrase unlocks it');

    provider.unlock(bob.identityId, 'bobs-secret');
    const signatureAfter = provider.signCanonical({ type: SignatureType.PLACEMENT_RECORD, id: 'b3', revision: 1, payload: {} });
    assert(signatureAfter.signer === keyBefore, 'migration preserves the exact same cryptographic identity — same did:key, same key');

    assertThrows(() => provider.protectIdentity(bob.identityId, 'again'), 'already protected',
        'an already-protected identity cannot be protected a second time');
    console.log('✓ protectIdentity: in-place, non-destructive migration preserving the same key, starts LOCKED');
}

// ---------------------------------------------------------------------
// 9. The three-state distinction survives a simulated page reload:
//    identity exists / vault unlocked / session authenticated are
//    genuinely independent, and only the vault forgets on reload.
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const provider = new LocalIdentityProvider(storage, { pbkdf2Iterations: TEST_ITERATIONS });
    const alice = provider.createLocalIdentity('Alice', 'hunter2');
    provider.authenticate(alice.identityId, 'hunter2');
    assert(provider.isUnlocked(alice.identityId) === true, 'unlocked right after authenticating');

    // A brand-new provider instance reading the SAME storage simulates a
    // page reload: the persisted index and session survive; the
    // in-memory-only vault cache cannot.
    const reloaded = new LocalIdentityProvider(storage, { pbkdf2Iterations: TEST_ITERATIONS });
    assert(reloaded.getLocalIdentity(alice.identityId) !== null, 'identity existence survives reload (durable, on disk)');
    assert(reloaded.isAuthenticated() === true && reloaded.currentUser().username === 'Alice',
        'the authentication session survives reload (persisted)');
    assert(reloaded.isUnlocked(alice.identityId) === false,
        'the vault does NOT survive reload — a decrypted seed is never persisted, by design');
    assertThrows(() => reloaded.signCanonical({ type: SignatureType.PLACEMENT_RECORD, id: 'r1', revision: 1, payload: {} }),
        'identity is locked', 'signing after a reload requires the passphrase again despite the session still being authenticated');
    console.log('✓ identity/session/vault: three independent facts, only the vault resets on reload');
}

// ---------------------------------------------------------------------
// 10. endSession() evicts the vault cache; logging back in requires the
//     passphrase again, never silently reuses a stale unlock.
// ---------------------------------------------------------------------
{
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider(), { pbkdf2Iterations: TEST_ITERATIONS });
    const alice = provider.createLocalIdentity('Alice', 'hunter2');
    provider.authenticate(alice.identityId, 'hunter2');
    assert(provider.isUnlocked(alice.identityId) === true, 'unlocked after authenticating');

    provider.endSession();
    assert(provider.isAuthenticated() === false, 'endSession() ends the session, exactly as 0.2.46 established');
    assert(provider.isUnlocked(alice.identityId) === false, 'endSession() also evicts the vault — no orphaned unlocked key with no active session');
    assertThrows(() => provider.authenticate(alice.identityId), 'a passphrase is required',
        'logging back in after logout requires the passphrase again, not a leftover unlock');
    console.log('✓ endSession(): ends the session AND locks the vault, never leaves an orphaned unlock');
}

// ---------------------------------------------------------------------
// 11. A device holding both a protected and an unprotected identity:
//     independent lock states, neither affects the other.
// ---------------------------------------------------------------------
{
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider(), { pbkdf2Iterations: TEST_ITERATIONS });
    const alice = provider.createLocalIdentity('Alice', 'hunter2');
    const bob = provider.createLocalIdentity('Bob'); // unprotected

    assert(provider.vaultLock(bob.identityId).isUnlocked === true, 'an unprotected identity is always unlocked');
    assert(provider.vaultLock(alice.identityId).isUnlocked === false, 'a protected identity starts locked, independent of any other identity on the device');

    provider.authenticate(bob.identityId);
    provider.signCanonical({ type: SignatureType.PLACEMENT_RECORD, id: 'bob1', revision: 1, payload: {} });
    assert(provider.vaultLock(alice.identityId).isUnlocked === false,
        'authenticating and signing as Bob never touches Alice\'s independent lock state');

    assertThrows(() => provider.lock(bob.identityId), 'nothing to lock',
        'attempting to lock an unprotected identity is refused — there is no passphrase-guarded vault to lock');
    console.log('✓ multi-identity device: protected and unprotected identities carry fully independent lock states');
}

console.log('\nAll identity key protection tests passed.');
