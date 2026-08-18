import { sha512, utf8ToBytes, concatBytes, bytesToHex, hexToBytes, randomSeed } from './Ed25519.js';

// Authenticated, passphrase-derived encryption for a LocalIdentity's
// private key material (0.2.47). Built from the exact same self-contained
// primitive Ed25519.js already establishes for the whole trust layer —
// SHA-512, pure BigInt math, no WebCrypto — rather than reaching for a
// second, differently-sourced cipher for "the one thing that's actually
// secret." Three constructions, each a standard textbook composition of
// SHA-512, never a novel cipher:
//
//   PBKDF2-HMAC-SHA512  passphrase -> key material (slow on purpose, so
//                        brute-forcing a guessed passphrase costs the
//                        attacker one KDF run per guess, not one hash)
//   SHA512-CTR           key material -> keystream, XORed against the
//                        32-byte seed (a block cipher would be the more
//                        conventional choice; a hash-based keystream is
//                        what "no dependency beyond the SHA-512 already
//                        in this codebase" actually buys)
//   HMAC-SHA512           encrypt-then-MAC: the ciphertext is tagged
//                        under a SEPARATE derived key, so a wrong
//                        passphrase or a tampered record is rejected
//                        outright rather than decrypting to garbage
//                        bytes that would silently become an invalid
//                        signing key.
//
// The iteration count is a real, named tradeoff, not an oversight: a
// production KDF (Argon2, or PBKDF2 behind WebCrypto's native
// implementation) runs orders of magnitude more iterations in the same
// wall-clock budget, because it isn't paying JavaScript BigInt overhead
// per SHA-512 compression. DEFAULT_ITERATIONS is chosen so an unlock
// stays interactive (a few hundred milliseconds) in this pure-JS engine
// — real protection against a patient offline attacker is explicitly a
// later infrastructure swap (see docs/Roadmap.md), not a claim made here.
export const DEFAULT_ITERATIONS = 600;
const SALT_LENGTH = 16;
const NONCE_LENGTH = 16;
const BLOCK_SIZE = 128; // SHA-512's block size, for HMAC key padding
const HASH_LENGTH = 64;

function hmacSha512(keyBytes, messageBytes) {
    let key = keyBytes;
    if (key.length > BLOCK_SIZE) {
        key = sha512(key);
    }
    if (key.length < BLOCK_SIZE) {
        const padded = new Uint8Array(BLOCK_SIZE);
        padded.set(key);
        key = padded;
    }
    const oKeyPad = new Uint8Array(BLOCK_SIZE);
    const iKeyPad = new Uint8Array(BLOCK_SIZE);
    for (let i = 0; i < BLOCK_SIZE; i++) {
        oKeyPad[i] = key[i] ^ 0x5c;
        iKeyPad[i] = key[i] ^ 0x36;
    }
    return sha512(concatBytes(oKeyPad, sha512(concatBytes(iKeyPad, messageBytes))));
}

function xorBytes(a, b) {
    const out = new Uint8Array(a.length);
    for (let i = 0; i < a.length; i++) {
        out[i] = a[i] ^ b[i];
    }
    return out;
}

function pbkdf2Sha512(passphraseBytes, saltBytes, iterations, keyLength) {
    const blocksNeeded = Math.ceil(keyLength / HASH_LENGTH);
    const output = new Uint8Array(blocksNeeded * HASH_LENGTH);
    for (let blockIndex = 1; blockIndex <= blocksNeeded; blockIndex++) {
        const indexBytes = new Uint8Array([
            (blockIndex >>> 24) & 0xff, (blockIndex >>> 16) & 0xff,
            (blockIndex >>> 8) & 0xff, blockIndex & 0xff
        ]);
        let u = hmacSha512(passphraseBytes, concatBytes(saltBytes, indexBytes));
        let t = u;
        for (let i = 1; i < iterations; i++) {
            u = hmacSha512(passphraseBytes, u);
            t = xorBytes(t, u);
        }
        output.set(t, (blockIndex - 1) * HASH_LENGTH);
    }
    return output.slice(0, keyLength);
}

// SHA512-CTR: block i of the keystream is sha512(key || nonce || i), a
// standard hash-based stream cipher construction. Symmetric — the same
// function encrypts and decrypts.
function ctrXor(key, nonce, data) {
    const output = new Uint8Array(data.length);
    let offset = 0;
    let counter = 0;
    while (offset < data.length) {
        const counterBytes = new Uint8Array([
            (counter >>> 24) & 0xff, (counter >>> 16) & 0xff,
            (counter >>> 8) & 0xff, counter & 0xff
        ]);
        const block = sha512(concatBytes(key, nonce, counterBytes));
        const chunkLength = Math.min(HASH_LENGTH, data.length - offset);
        for (let i = 0; i < chunkLength; i++) {
            output[offset + i] = data[offset + i] ^ block[i];
        }
        offset += chunkLength;
        counter += 1;
    }
    return output;
}

// Key separation: encryption and authentication never share a key, even
// though both derive from the same passphrase-stretched master key —
// standard practice, and cheap here since it costs one HMAC call each
// rather than a second full PBKDF2 run.
function deriveSubkeys(passphrase, saltBytes, iterations) {
    const master = pbkdf2Sha512(utf8ToBytes(passphrase), saltBytes, iterations, HASH_LENGTH);
    const encKey = hmacSha512(master, utf8ToBytes('forkbuild-identity/enc')).slice(0, 32);
    const macKey = hmacSha512(master, utf8ToBytes('forkbuild-identity/mac')).slice(0, 32);
    return { encKey, macKey };
}

function constantTimeEqual(a, b) {
    if (a.length !== b.length) {
        return false;
    }
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a[i] ^ b[i];
    }
    return diff === 0;
}

export class IncorrectPassphraseError extends Error {
    constructor() {
        super('KeyEncryption: incorrect passphrase or corrupted record');
        this.name = 'IncorrectPassphraseError';
    }
}

// Encrypts seedBytes (the raw 32-byte Ed25519 seed) under passphrase.
// Returns a plain, JSON-safe record — every field a hex string — meant
// to be stored verbatim alongside an identity's public metadata. A fresh
// random salt and nonce are generated per call, so protecting the same
// seed twice (re-protecting after a passphrase change) never reuses
// either.
export function encrypt(seedBytes, passphrase, { iterations = DEFAULT_ITERATIONS } = {}) {
    if (!passphrase || typeof passphrase !== 'string') {
        throw new Error('KeyEncryption.encrypt: passphrase is required');
    }
    const salt = randomSeed().slice(0, SALT_LENGTH);
    const nonce = randomSeed().slice(0, NONCE_LENGTH);
    const { encKey, macKey } = deriveSubkeys(passphrase, salt, iterations);
    const ciphertext = ctrXor(encKey, nonce, seedBytes);
    const tag = hmacSha512(macKey, concatBytes(nonce, ciphertext)).slice(0, 32);
    return {
        kdf: 'PBKDF2-HMAC-SHA512',
        iterations,
        salt: bytesToHex(salt),
        nonce: bytesToHex(nonce),
        ciphertext: bytesToHex(ciphertext),
        tag: bytesToHex(tag)
    };
}

// Decrypts a record produced by encrypt(). Throws IncorrectPassphraseError
// — never returns wrong-but-plausible bytes — whenever the passphrase is
// wrong OR the record has been tampered with; the MAC check runs BEFORE
// decryption is trusted, so a corrupted record can never silently become
// an invalid-but-accepted signing key.
export function decrypt(record, passphrase) {
    if (!record || typeof record !== 'object') {
        throw new Error('KeyEncryption.decrypt: record is required');
    }
    if (!passphrase || typeof passphrase !== 'string') {
        throw new Error('KeyEncryption.decrypt: passphrase is required');
    }
    const salt = hexToBytes(record.salt);
    const nonce = hexToBytes(record.nonce);
    const ciphertext = hexToBytes(record.ciphertext);
    const expectedTag = hexToBytes(record.tag);
    const { encKey, macKey } = deriveSubkeys(passphrase, salt, record.iterations);
    const actualTag = hmacSha512(macKey, concatBytes(nonce, ciphertext)).slice(0, 32);
    if (!constantTimeEqual(actualTag, expectedTag)) {
        throw new IncorrectPassphraseError();
    }
    return ctrXor(encKey, nonce, ciphertext);
}
