import { readFileSync } from 'node:fs';
import * as Ed25519 from '../identity/Ed25519.js';
import * as KeyEncryption from '../identity/KeyEncryption.js';
import { LocalIdentityProvider, MIN_PASSPHRASE_LENGTH } from '../identity/LocalIdentityProvider.js';
import { IdentityUseCase } from '../application/identity/IdentityUseCase.js';
import { evaluateNewPassphrase } from '../application/identity/NewPassphrasePolicy.js';
import { vendorDifferences } from '../scripts/vendor-noble.mjs';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// The identity cryptography: audited Ed25519 signing, WebCrypto key
// encryption, compatibility with keys and export files written by the
// earlier format, and the rules for choosing a passphrase.

const legacy = JSON.parse(readFileSync(new URL('./fixtures/legacy-identity-key-encryption.json', import.meta.url), 'utf8'));
const TEST_ITERATIONS = 1000;

async function rejects(fn, pattern) {
    try {
        await fn();
    } catch (error) {
        return pattern.test(error.message);
    }
    return false;
}

function throws(fn, pattern) {
    try {
        fn();
    } catch (error) {
        return pattern.test(error.message);
    }
    return false;
}

// The vendored noble code is exactly what the pinned npm packages contain.
{
    const differences = vendorDifferences();
    assert(differences.length === 0, `vendor/ matches the pinned @noble packages (run node scripts/vendor-noble.mjs):\n  ${differences.join('\n  ')}`);
    console.log('✓ vendor/ matches the pinned @noble/curves and @noble/hashes packages');
}

// RFC 8032 test vector 1, and strict verification.
{
    const seed = Ed25519.hexToBytes('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60');
    const publicKey = Ed25519.seedToKeyPair(seed).publicKey;
    assert(Ed25519.bytesToHex(publicKey) === 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a', 'RFC 8032 vector 1 public key');
    const signature = Ed25519.sign(seed, new Uint8Array(0));
    assert(Ed25519.bytesToHex(signature) === 'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b',
        'RFC 8032 vector 1 signature');
    assert(Ed25519.verify(publicKey, new Uint8Array(0), signature), 'the vector verifies');

    const message = Ed25519.utf8ToBytes('hello');
    const good = Ed25519.sign(seed, message);
    assert(!Ed25519.verify(publicKey, Ed25519.utf8ToBytes('hellO'), good), 'a changed message does not verify');

    // S + L is the same scalar mod L; strict verification refuses it.
    const L = (1n << 252n) + 27742317777372353535851937790883648493n;
    let s = 0n;
    for (let i = 31; i >= 0; i--) s = (s << 8n) + BigInt(good[32 + i]);
    const malleable = new Uint8Array(good);
    let sPlusL = s + L;
    for (let i = 0; i < 32; i++) {
        malleable[32 + i] = Number(sPlusL & 0xffn);
        sPlusL >>= 8n;
    }
    assert(!Ed25519.verify(publicKey, message, malleable), 'a non-canonical S (S + L) is rejected');

    const smallOrderKey = new Uint8Array(32);
    smallOrderKey[0] = 1; // the neutral point
    assert(!Ed25519.verify(smallOrderKey, message, good), 'a small-order public key is rejected');
    assert(!Ed25519.verify(publicKey, message, good.slice(0, 63)) && !Ed25519.verify(publicKey.slice(0, 31), message, good),
        'wrong-length signatures and keys return false instead of throwing');
    console.log('✓ Ed25519: RFC 8032 vector, strict verification');
}

// Signatures interoperate with the platform's own Ed25519 in both directions.
{
    const { subtle } = globalThis.crypto;
    const pair = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    const platformPublic = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
    const message = Ed25519.utf8ToBytes('interop');
    const platformSignature = new Uint8Array(await subtle.sign('Ed25519', pair.privateKey, message));
    assert(Ed25519.verify(platformPublic, message, platformSignature), 'a WebCrypto signature verifies here');

    const seed = Ed25519.randomSeed();
    const ourPublic = Ed25519.seedToKeyPair(seed).publicKey;
    const ourSignature = Ed25519.sign(seed, message);
    const imported = await subtle.importKey('raw', ourPublic, { name: 'Ed25519' }, false, ['verify']);
    assert(await subtle.verify('Ed25519', imported, ourSignature, message), 'a signature made here verifies with WebCrypto');
    console.log('✓ Ed25519: interoperates with WebCrypto Ed25519');
}

// No key is ever made without a secure random source.
{
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
        assert(throws(() => Ed25519.randomSeed(), /no secure random number generator/), 'randomSeed() refuses to run without crypto.getRandomValues');
    } finally {
        Object.defineProperty(globalThis, 'crypto', original);
    }
    const a = Ed25519.randomSeed();
    const b = Ed25519.randomSeed();
    assert(a.length === 32 && Ed25519.bytesToHex(a) !== Ed25519.bytesToHex(b), 'with crypto available, seeds are 32 fresh bytes');
    console.log('✓ randomSeed: no insecure fallback');
}

// Current key encryption format.
{
    const seed = Ed25519.hexToBytes(legacy.seedHex);
    const record = await KeyEncryption.encrypt(seed, 'a strong passphrase', { iterations: TEST_ITERATIONS });
    assert(record.kdf === 'PBKDF2-SHA256' && record.cipher === 'AES-256-GCM' && record.version === 2, 'records name their KDF, cipher and version');
    assert(record.salt.length === 32 && record.nonce.length === 24, '16-byte salt and 12-byte GCM nonce');
    assert(!('tag' in record) && record.ciphertext.length === (32 + 16) * 2, 'the GCM tag travels inside the ciphertext');
    assert(Ed25519.bytesToHex(await KeyEncryption.decrypt(record, 'a strong passphrase')) === legacy.seedHex, 'round-trips the seed');
    assert(await rejects(() => KeyEncryption.decrypt(record, 'a wrong passphrase'), /incorrect passphrase/), 'a wrong passphrase is rejected');
    const flipped = { ...record, ciphertext: record.ciphertext.slice(0, 10) + (record.ciphertext[10] === '0' ? '1' : '0') + record.ciphertext.slice(11) };
    assert(await rejects(() => KeyEncryption.decrypt(flipped, 'a strong passphrase'), /incorrect passphrase/), 'tampering is rejected');
    assert(await rejects(() => KeyEncryption.decrypt({ ...record, iterations: KeyEncryption.MAX_ITERATIONS + 1 }, 'a strong passphrase'), /incorrect passphrase/),
        'a record asking for more than MAX_ITERATIONS is refused without running it');
    assert(KeyEncryption.DEFAULT_ITERATIONS === 600000, 'the default is 600,000 iterations');
    assert(KeyEncryption.needsUpgrade(record) === true && KeyEncryption.needsUpgrade(record, { iterations: TEST_ITERATIONS }) === false,
        'needsUpgrade compares against the iterations the caller uses');
    console.log('✓ KeyEncryption: PBKDF2-SHA256 + AES-256-GCM records');
}

// Keys and export files written by the earlier format still open.
{
    assert(Ed25519.bytesToHex(await KeyEncryption.decrypt(legacy.storedRecord, legacy.passphrase)) === legacy.seedHex, 'a legacy stored record decrypts');
    assert(await rejects(() => KeyEncryption.decrypt(legacy.storedRecord, 'not the passphrase'), /incorrect passphrase/), 'with its own wrong-passphrase check');
    assert(KeyEncryption.needsUpgrade(legacy.storedRecord), 'and is marked for upgrade');

    // A device that stored Alice's key in the old format.
    const storage = new InMemoryStorageProvider();
    storage.save('local-identities', [{
        identityId: legacy.identityId, publicKey: legacy.publicKey, algorithm: 'Ed25519', label: 'Legacy Alice',
        createdAt: '2026-09-01T00:00:00.000Z', protected: true
    }]);
    storage.save('local-identity-key:' + legacy.identityId, {
        protected: true, publicKey: legacy.publicKey, algorithm: 'Ed25519', createdAt: '2026-09-01T00:00:00.000Z', encryption: legacy.storedRecord
    });
    const provider = new LocalIdentityProvider(storage, { pbkdf2Iterations: TEST_ITERATIONS });
    await provider.unlock(legacy.identityId, legacy.passphrase);
    provider.authenticate(legacy.identityId);
    assert(provider.getSigningIdentity().id === legacy.identityId, 'the legacy identity unlocks and signs as itself');
    const upgraded = storage.load('local-identity-key:' + legacy.identityId).encryption;
    assert(upgraded.kdf === 'PBKDF2-SHA256' && upgraded.cipher === 'AES-256-GCM', 'unlocking re-encrypted the stored key in the current format');
    const reloaded = new LocalIdentityProvider(storage, { pbkdf2Iterations: TEST_ITERATIONS });
    await reloaded.unlock(legacy.identityId, legacy.passphrase);
    assert(reloaded.isUnlocked(legacy.identityId), 'the same passphrase still unlocks the upgraded key');

    const importer = new LocalIdentityProvider(new InMemoryStorageProvider(), { pbkdf2Iterations: TEST_ITERATIONS });
    const result = await importer.importLocalIdentity(legacy.exportPackage, legacy.passphrase);
    assert(result.status === 'IMPORTED' && result.identity.identityId === legacy.identityId, 'a version 1 export file still imports');
    console.log('✓ legacy keys and export files open, and stored keys upgrade on unlock');
}

// The provider never silently stores a key unprotected when a passphrase
// was meant, and enforces a minimum length for new passphrases.
{
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider(), { pbkdf2Iterations: TEST_ITERATIONS });
    assert(throws(() => provider.createLocalIdentity('Alice', 'a strong passphrase'), /createProtectedLocalIdentity/),
        'createLocalIdentity() refuses a passphrase instead of dropping it');
    assert(throws(() => provider.login('Alice', 'a strong passphrase'), /does not take a passphrase/), 'login() refuses a passphrase too');
    assert(await rejects(() => provider.createProtectedLocalIdentity('Alice', 'short'), /at least 8 characters/), 'short passphrases are refused');
    const bob = provider.createLocalIdentity('Bob');
    assert(await rejects(() => provider.exportLocalIdentity(bob.identityId, 'short'), /at least 8 characters/),
        'a new export passphrase for an unprotected identity has the same minimum');
    assert(MIN_PASSPHRASE_LENGTH === 8, 'the minimum is 8 characters');
    console.log('✓ provider: passphrases are never silently dropped, and have a minimum length');
}

// IdentityUseCase: the UI-facing flow.
{
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider(), { pbkdf2Iterations: TEST_ITERATIONS });
    const identityUseCase = new IdentityUseCase(provider);
    const alice = await identityUseCase.createIdentity('Alice', 'a strong passphrase');
    assert(alice.isProtected && !provider.isUnlocked(alice.identityId), 'with a passphrase, createIdentity() makes a protected, locked identity');
    assert(await rejects(() => identityUseCase.authenticate(alice.identityId), /enter its passphrase/), 'authenticating it needs the passphrase');
    await identityUseCase.authenticate(alice.identityId, 'a strong passphrase');
    assert(provider.isAuthenticated() && provider.isUnlocked(alice.identityId), 'with the passphrase it unlocks and authenticates');
    const bob = await identityUseCase.createIdentity('Bob');
    assert(!bob.isProtected, 'without one, an unprotected identity');
    await identityUseCase.protectIdentity(bob.identityId, 'another strong one');
    assert(provider.getLocalIdentity(bob.identityId).isProtected, 'protectIdentity() protects an existing identity');
    console.log('✓ IdentityUseCase: create, authenticate and protect with passphrases');
}

// The new-passphrase form rules.
{
    assert(!evaluateNewPassphrase({}).ok, 'a blank passphrase is not accepted by default');
    assert(evaluateNewPassphrase({ allowUnprotected: true }).ok && !evaluateNewPassphrase({ allowUnprotected: true }).protect,
        'unless the user explicitly chose an unprotected identity');
    assert(!evaluateNewPassphrase({ allowUnprotected: true, offerUnprotected: false }).ok, 'forms that protect an identity never allow blank');
    assert(/at least 8/.test(evaluateNewPassphrase({ passphrase: 'short', confirmation: 'short' }).message), 'too short');
    assert(/don't match/.test(evaluateNewPassphrase({ passphrase: 'long enough', confirmation: 'long enougj' }).message), 'mismatch');
    const good = evaluateNewPassphrase({ passphrase: 'long enough', confirmation: 'long enough' });
    assert(good.ok && good.protect && good.message === null, 'a matching passphrase of 8+ characters is accepted');
    console.log('✓ NewPassphrasePolicy: passphrase by default, explicit opt-out, length and confirmation');
}

console.log('\n✅ All IdentityCryptography tests passed.');
