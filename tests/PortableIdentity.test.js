import { LocalIdentity } from '../identity/LocalIdentity.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { VaultLockState } from '../identity/VaultLock.js';
import * as IdentityImport from '../identity/IdentityImport.js';
import * as IdentityRecovery from '../identity/IdentityRecovery.js';
import { IdentityPackageError } from '../identity/IdentityImport.js';
import { IdentityConflictError } from '../identity/IdentityRecovery.js';
import { IncorrectPassphraseError } from '../identity/KeyEncryption.js';
import * as Ed25519 from '../identity/Ed25519.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { Signature, SignatureType } from '../core/Signature.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.2.48 — Portable Identity, Export, Import & Recovery.
//
// 0.2.46 gave a LocalIdentity a durable, inspectable existence on ONE
// device. 0.2.47 protected its private key at rest, but named — not
// closed — the gap that the key still only ever existed on the device
// that generated it. This milestone closes that gap: exportLocalIdentity/
// importLocalIdentity move an identity's PRIVATE key to a second device
// as a protected, versioned package, preserving the identity itself —
// same identityId, same publicKey, same signing capability — not merely
// its display name. The central proof, exercised end to end below: a
// signature produced on a second, completely independent identity store
// after import verifies exactly like one produced on the first.

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

function assertThrows(fn, expectedType, message) {
    try {
        fn();
        assert(false, message);
    } catch (e) {
        if (expectedType && !(e instanceof expectedType)) {
            assert(false, `${message}: expected ${expectedType.name}, got ${e.constructor.name} (${e.message})`);
        }
    }
}

function descriptorFor(id) {
    return { type: SignatureType.PLACEMENT_RECORD, id, revision: 1, payload: { a: 1 } };
}

// ---------------------------------------------------------------------
// 1. FLAGSHIP — export from one device, import on a completely
//    independent second identity store, and prove the imported identity
//    is the SAME cryptographic identity, not a lookalike: same
//    identityId, same publicKey, a signature from the ORIGINAL device
//    verifies with the IMPORTED identity's public key and vice versa,
//    and the imported copy starts LOCKED regardless of the source
//    identity's own lock state at export time.
// ---------------------------------------------------------------------
{
    // Device A
    const deviceA = new LocalIdentityProvider(new InMemoryStorageProvider(), { pbkdf2Iterations: TEST_ITERATIONS });
    const alice = deviceA.createLocalIdentity('Alice', 'hunter2');
    deviceA.authenticate(alice.identityId, 'hunter2');
    const signatureFromA = deviceA.signCanonical(descriptorFor('p1'));
    assert(signatureFromA.signer === alice.identityId, 'Device A signs as Alice before export');

    const pkg = deviceA.exportLocalIdentity(alice.identityId, 'hunter2');
    assert(pkg.formatVersion === 1, 'export package carries a format version');
    assert(pkg.identityId === alice.identityId, 'export package carries the exact identityId');
    assert(pkg.publicKey === alice.publicKey, 'export package carries the exact publicKey');
    assert(!('seed' in pkg), 'the package never carries a plaintext seed field');
    assert(pkg.encryptedPrivateKey && pkg.encryptedPrivateKey.ciphertext, 'the portable secret is an encrypted record, never a plaintext seed');

    // Device B — a totally independent identity store.
    const deviceB = new LocalIdentityProvider(new InMemoryStorageProvider(), { pbkdf2Iterations: TEST_ITERATIONS });
    assert(deviceB.listLocalIdentities().length === 0, 'Device B starts with no identities at all');

    const importResult = deviceB.importLocalIdentity(pkg, 'hunter2');
    assert(importResult.status === 'IMPORTED', 'a genuinely new identity reports IMPORTED');
    const importedAlice = importResult.identity;
    assert(importedAlice instanceof LocalIdentity, 'importLocalIdentity returns a real LocalIdentity');
    assert(importedAlice.identityId === alice.identityId, 'same identityId survives the trip');
    assert(importedAlice.publicKey === alice.publicKey, 'same publicKey survives the trip');

    assert(deviceB.vaultLock(alice.identityId).state === VaultLockState.LOCKED,
        'the imported identity starts LOCKED, unconditionally');
    assertThrows(() => deviceB.authenticate(alice.identityId), Error,
        'authenticating the freshly-imported identity with no passphrase is refused');

    const verifier = new LocalAuthorizationVerifier();
    const resultA = verifier.verifyDescriptor(descriptorFor('p1'), signatureFromA, deviceA.getSigningIdentity().toJSON());
    assert(resultA.valid === true, 'the signature produced on Device A still verifies on its own terms');

    deviceB.authenticate(alice.identityId, 'hunter2');
    const signatureFromB = deviceB.signCanonical(descriptorFor('p2'));
    assert(signatureFromB.signer === alice.identityId, 'Device B signs as the SAME identityId after unlocking');

    const resultB = verifier.verifyDescriptor(descriptorFor('p2'), signatureFromB, deviceB.getSigningIdentity().toJSON());
    assert(resultB.valid === true, 'a signature produced on Device B (after import) verifies exactly like one from Device A');
    assert(deviceB.getSigningIdentity().id === deviceA.getSigningIdentity().id,
        'both devices resolve to the identical SigningIdentity — the import preserved the identity, not just its name');

    deviceB.lock(alice.identityId);
    assertThrows(() => deviceB.signCanonical(descriptorFor('p3')), Error,
        'locking the imported identity again makes signing impossible, same as any protected identity');

    console.log('✓ FLAGSHIP: export -> import on an independent device -> same identityId/publicKey, cross-device signature verification, imported LOCKED');
}

// ---------------------------------------------------------------------
// 2. Exporting requires the passphrase again, even while the vault is
//    currently unlocked — it never reads the in-memory vault cache.
// ---------------------------------------------------------------------
{
    const device = new LocalIdentityProvider(new InMemoryStorageProvider(), { pbkdf2Iterations: TEST_ITERATIONS });
    const bob = device.createLocalIdentity('Bob', 'bobs-secret');
    device.authenticate(bob.identityId, 'bobs-secret');
    assert(device.isUnlocked(bob.identityId) === true, 'Bob is unlocked after authenticating');

    assertThrows(() => device.exportLocalIdentity(bob.identityId, 'wrong-pass'), IncorrectPassphraseError,
        'exporting with the wrong passphrase fails even though the vault is currently unlocked');
    assertThrows(() => device.exportLocalIdentity(bob.identityId, null), Error,
        'exporting with no passphrase at all is refused outright');

    const pkg = device.exportLocalIdentity(bob.identityId, 'bobs-secret');
    assert(pkg.identityId === bob.identityId, 'the correct passphrase, re-entered, succeeds');
    console.log('✓ export re-demands the passphrase; an unlocked vault grants no shortcut');
}

// ---------------------------------------------------------------------
// 3. An UNPROTECTED identity can still be exported — the export
//    passphrase protects the portable copy for transit even though the
//    source was never protected at rest — and the imported copy is
//    ALWAYS protected on the receiving device.
// ---------------------------------------------------------------------
{
    const deviceA = new LocalIdentityProvider(new InMemoryStorageProvider(), { pbkdf2Iterations: TEST_ITERATIONS });
    const carol = deviceA.createLocalIdentity('Carol'); // no passphrase
    assert(carol.isProtected === false, 'Carol is unprotected on Device A');

    const pkg = deviceA.exportLocalIdentity(carol.identityId, 'fresh-export-pass');
    const deviceB = new LocalIdentityProvider(new InMemoryStorageProvider(), { pbkdf2Iterations: TEST_ITERATIONS });
    const { identity: importedCarol } = deviceB.importLocalIdentity(pkg, 'fresh-export-pass');
    assert(importedCarol.isProtected === true,
        'the imported copy is ALWAYS protected on the new device, even though the source was unprotected');
    assert(deviceB.vaultLock(carol.identityId).state === VaultLockState.LOCKED, 'and starts LOCKED like any protected identity');
    console.log('✓ unprotected identities export/import too; the imported copy is always protected and locked');
}

// ---------------------------------------------------------------------
// 4. Duplicate import: the identical identity already exists -> a pure
//    no-op that reports ALREADY_EXISTS, never creates a second copy,
//    and doesn't even require the correct passphrase.
// ---------------------------------------------------------------------
{
    const deviceA = new LocalIdentityProvider(new InMemoryStorageProvider(), { pbkdf2Iterations: TEST_ITERATIONS });
    const dave = deviceA.createLocalIdentity('Dave', 'dave-pass');
    const pkg = deviceA.exportLocalIdentity(dave.identityId, 'dave-pass');

    const deviceB = new LocalIdentityProvider(new InMemoryStorageProvider(), { pbkdf2Iterations: TEST_ITERATIONS });
    const first = deviceB.importLocalIdentity(pkg, 'dave-pass', { label: 'Dave' });
    assert(first.status === 'IMPORTED', 'first import creates the identity');
    assert(deviceB.listLocalIdentities().length === 1, 'exactly one identity after the first import');

    const second = deviceB.importLocalIdentity(pkg, 'dave-pass');
    assert(second.status === 'ALREADY_EXISTS', 'importing the same package again reports ALREADY_EXISTS');
    assert(deviceB.listLocalIdentities().length === 1, 'duplicate import never creates a second copy');

    const withWrongPassphrase = deviceB.importLocalIdentity(pkg, 'totally-wrong-passphrase');
    assert(withWrongPassphrase.status === 'ALREADY_EXISTS',
        'ALREADY_EXISTS is decided before decryption is even attempted — a wrong passphrase does not block a no-op');
    assert(deviceB.listLocalIdentities().length === 1, 'still exactly one identity');
    console.log('✓ duplicate import: identical identity is a pure no-op, never clones, never needs the passphrase');
}

// ---------------------------------------------------------------------
// 5. Conflicting identity data — same identityId, different key
//    material — is rejected outright and never overwrites the existing
//    entry. Unreachable via two honestly-generated packages (did:key is
//    a bijective encoding of the public key), so this exercises
//    IdentityRecovery.recoverIdentity directly with a synthetic
//    existing-identities list, the way the module's own comment says
//    it's meant as a defensive floor.
// ---------------------------------------------------------------------
{
    const device = new LocalIdentityProvider(new InMemoryStorageProvider(), { pbkdf2Iterations: TEST_ITERATIONS });
    const eve = device.createLocalIdentity('Eve', 'eve-pass');
    const pkg = device.exportLocalIdentity(eve.identityId, 'eve-pass');

    const conflictingEntry = {
        identityId: pkg.identityId,
        publicKey: '00'.repeat(32),
        algorithm: 'Ed25519',
        label: 'Someone Else',
        createdAt: new Date().toISOString(),
        protected: true
    };
    assertThrows(
        () => IdentityRecovery.recoverIdentity({ package: pkg, passphrase: 'eve-pass', existingIdentities: [conflictingEntry] }),
        IdentityConflictError,
        'same identityId, different publicKey -> rejected as a conflict, never silently resolved either way'
    );
    console.log('✓ conflicting identity data is rejected, never overwritten (defensive floor)');
}

// ---------------------------------------------------------------------
// 6. Malformed / tampered packages are rejected by validation BEFORE
//    any decryption is attempted, and no partial identity is ever left
//    behind on this or any other failure path.
// ---------------------------------------------------------------------
{
    const device = new LocalIdentityProvider(new InMemoryStorageProvider(), { pbkdf2Iterations: TEST_ITERATIONS });
    const frank = device.createLocalIdentity('Frank', 'frank-pass');
    const goodPkg = device.exportLocalIdentity(frank.identityId, 'frank-pass');

    const importer = new LocalIdentityProvider(new InMemoryStorageProvider(), { pbkdf2Iterations: TEST_ITERATIONS });

    assertThrows(() => importer.importLocalIdentity(null, 'frank-pass'), IdentityPackageError, 'null package rejected');
    assertThrows(() => importer.importLocalIdentity({ ...goodPkg, formatVersion: 99 }, 'frank-pass'), IdentityPackageError,
        'unknown format version rejected');
    assertThrows(() => importer.importLocalIdentity({ ...goodPkg, identityId: 'did:key:zNotReal' }, 'frank-pass'), IdentityPackageError,
        'identityId not matching publicKey is rejected — tamper detected without needing the passphrase at all');
    assertThrows(() => importer.importLocalIdentity({ ...goodPkg, publicKey: 'not-hex' }, 'frank-pass'), IdentityPackageError,
        'malformed publicKey rejected');
    assertThrows(() => importer.importLocalIdentity({ ...goodPkg, algorithm: 'RSA' }, 'frank-pass'), IdentityPackageError,
        'unsupported algorithm rejected');
    assertThrows(() => importer.importLocalIdentity({ ...goodPkg, encryptedPrivateKey: { ...goodPkg.encryptedPrivateKey, tag: undefined } }, 'frank-pass'),
        IdentityPackageError, 'malformed encryptedPrivateKey rejected');
    assertThrows(() => importer.importLocalIdentity({ ...goodPkg, createdAt: 'not-a-date' }, 'frank-pass'), IdentityPackageError,
        'invalid createdAt rejected');

    const tamperedCiphertext = {
        ...goodPkg,
        encryptedPrivateKey: {
            ...goodPkg.encryptedPrivateKey,
            ciphertext: goodPkg.encryptedPrivateKey.ciphertext.slice(0, -2)
                + (goodPkg.encryptedPrivateKey.ciphertext.slice(-2) === '00' ? '11' : '00')
        }
    };
    assertThrows(() => importer.importLocalIdentity(tamperedCiphertext, 'frank-pass'), IncorrectPassphraseError,
        'a tampered ciphertext is caught by the MAC, reported the same as a wrong passphrase, never silently accepted');

    assertThrows(() => importer.importLocalIdentity(goodPkg, 'definitely-wrong'), IncorrectPassphraseError,
        'a wrong passphrase on an otherwise well-formed package is refused');

    assert(importer.listLocalIdentities().length === 0,
        'not one of the failures above left ANY identity behind — every failure path persists nothing');

    // And the well-formed package with the right passphrase still works.
    const ok = importer.importLocalIdentity(goodPkg, 'frank-pass');
    assert(ok.status === 'IMPORTED' && importer.listLocalIdentities().length === 1,
        'the same package succeeds once given its real passphrase, proving the failures above were about the input, not the pipeline');
    console.log('✓ malformed/tampered packages and wrong passphrases are all rejected, never leaving a partial identity');
}

// ---------------------------------------------------------------------
// 7. IdentityImport.validatePackage is usable standalone, with no
//    passphrase and no provider at all — pure structural + public-key
//    consistency validation.
// ---------------------------------------------------------------------
{
    const device = new LocalIdentityProvider(new InMemoryStorageProvider(), { pbkdf2Iterations: TEST_ITERATIONS });
    const grace = device.createLocalIdentity('Grace', 'grace-pass');
    const pkg = device.exportLocalIdentity(grace.identityId, 'grace-pass');

    IdentityImport.validatePackage(pkg); // does not throw
    assertThrows(() => IdentityImport.validatePackage({ ...pkg, publicKey: Ed25519.bytesToHex(Ed25519.randomSeed()) }),
        IdentityPackageError, 'a publicKey swapped for an unrelated one fails the identityId <-> publicKey check');
    console.log('✓ IdentityImport.validatePackage: pure, passphrase-free structural and cryptographic validation');
}

// ---------------------------------------------------------------------
// 8. Byte-identical preservation: unrelated persisted state (this
//    device's OTHER identity, and a completely unrelated storage key
//    standing in for world/document state) is untouched by every
//    export/import operation above, success or failure alike.
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    storage.save('world-state:demo', { buildings: [{ id: 'b1', bricks: [1, 2, 3] }], revision: 7 });
    const worldStateBefore = storage.load('world-state:demo');

    const device = new LocalIdentityProvider(storage, { pbkdf2Iterations: TEST_ITERATIONS });
    const henry = device.createLocalIdentity('Henry', 'henry-pass');
    const untouchedBystander = device.createLocalIdentity('Bystander', 'bystander-pass');
    const bystanderSnapshotBefore = JSON.stringify(storage.load('local-identity-key:' + untouchedBystander.identityId));

    const pkg = device.exportLocalIdentity(henry.identityId, 'henry-pass');

    // A grab-bag of operations, several deliberately failing.
    try { device.importLocalIdentity({ ...pkg, formatVersion: 0 }, 'henry-pass'); } catch (e) { /* expected */ }
    try { device.importLocalIdentity(pkg, 'wrong-passphrase'); } catch (e) { /* expected */ }
    device.importLocalIdentity(pkg, 'henry-pass'); // ALREADY_EXISTS on the SAME device — Henry is already here

    const worldStateAfter = storage.load('world-state:demo');
    assert(JSON.stringify(worldStateAfter) === JSON.stringify(worldStateBefore),
        'unrelated world state is byte-identical after a mix of successful and failed export/import operations');

    const bystanderSnapshotAfter = JSON.stringify(storage.load('local-identity-key:' + untouchedBystander.identityId));
    assert(bystanderSnapshotAfter === bystanderSnapshotBefore,
        'a completely unrelated identity on the same device is byte-identical, untouched by another identity\'s export/import');

    assert(device.listLocalIdentities().length === 2, 'still exactly Henry + Bystander — no phantom entries from the failed attempts');
    console.log('✓ unrelated world state and unrelated identities remain byte-identical across export/import, success or failure');
}

console.log('\nAll portable identity export/import/recovery tests passed.');
