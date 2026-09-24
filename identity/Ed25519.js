// Ed25519 signatures (RFC 8032) and SHA-512 for the trust layer, plus the
// byte and did:key encodings identities use. The cryptography itself is the
// audited noble-curves / noble-hashes code in vendor/ (copied from npm by
// scripts/vendor-noble.mjs); nothing in this file implements a primitive.
// Signing stays synchronous, so signCanonical() callers are unchanged.
//
// This is the cryptographic floor of the project: content hashes
// establish WHAT an object is; these primitives establish WHO
// authorized it.
import { ed25519 } from '../vendor/noble-curves/ed25519.js';
import { sha512 as nobleSha512 } from '../vendor/noble-hashes/sha2.js';

const SEED_LENGTH = 32;
const PUBLIC_KEY_LENGTH = 32;
const SIGNATURE_LENGTH = 64;

export function sha512(message) {
    return nobleSha512(message);
}

export function seedToKeyPair(seedBytes) {
    return { publicKey: ed25519.getPublicKey(seedBytes) };
}

export function sign(seedBytes, messageBytes) {
    return ed25519.sign(messageBytes, seedBytes);
}

// Strict RFC 8032 verification, not the more permissive ZIP-215 rules:
// non-canonical encodings and small-order public keys are rejected, the
// same set WebCrypto's Ed25519 accepts. Malformed input returns false.
export function verify(publicKeyBytes, messageBytes, signatureBytes) {
    if (!(publicKeyBytes instanceof Uint8Array) || publicKeyBytes.length !== PUBLIC_KEY_LENGTH) {
        return false;
    }
    if (!(signatureBytes instanceof Uint8Array) || signatureBytes.length !== SIGNATURE_LENGTH) {
        return false;
    }
    try {
        return ed25519.verify(signatureBytes, messageBytes, publicKeyBytes, { zip215: false });
    } catch {
        return false;
    }
}

// ------------------------------------------------------------------
// Byte helpers
// ------------------------------------------------------------------
export function hexToBytes(hex) {
    if (typeof hex !== 'string' || hex.length % 2 !== 0) {
        throw new Error('Ed25519: invalid hex string');
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        const value = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        if (Number.isNaN(value)) {
            throw new Error('Ed25519: invalid hex string');
        }
        bytes[i] = value;
    }
    return bytes;
}

export function bytesToHex(bytes) {
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
        hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
}

export function utf8ToBytes(text) {
    return new TextEncoder().encode(text);
}

export function concatBytes(...arrays) {
    const total = arrays.reduce((sum, a) => sum + a.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const a of arrays) {
        out.set(a, offset);
        offset += a.length;
    }
    return out;
}

// A new private key. There is deliberately no fallback: without a secure
// random source a key must not be created at all.
export function randomSeed() {
    const cryptoApi = globalThis.crypto;
    if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
        throw new Error('Ed25519: no secure random number generator (crypto.getRandomValues) is available');
    }
    return cryptoApi.getRandomValues(new Uint8Array(SEED_LENGTH));
}

// ------------------------------------------------------------------
// did:key encoding (multicodec ed25519-pub 0xed01 + base58btc)
// ------------------------------------------------------------------
const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(bytes) {
    let num = 0n;
    for (const b of bytes) {
        num = num * 256n + BigInt(b);
    }
    let str = '';
    while (num > 0n) {
        str = B58_ALPHABET[Number(num % 58n)] + str;
        num /= 58n;
    }
    for (const b of bytes) {
        if (b === 0) {
            str = '1' + str;
        } else {
            break;
        }
    }
    return str;
}

function base58Decode(str) {
    let num = 0n;
    for (const ch of str) {
        const idx = B58_ALPHABET.indexOf(ch);
        if (idx === -1) {
            return null;
        }
        num = num * 58n + BigInt(idx);
    }
    const bytes = [];
    while (num > 0n) {
        bytes.unshift(Number(num % 256n));
        num /= 256n;
    }
    for (const ch of str) {
        if (ch === '1') {
            bytes.unshift(0);
        } else {
            break;
        }
    }
    return new Uint8Array(bytes);
}

export function publicKeyToDidKey(publicKeyBytes) {
    return 'did:key:z' + base58Encode(concatBytes(new Uint8Array([0xed, 0x01]), publicKeyBytes));
}

// Recovers the raw public key from a did:key id — this is what lets a
// bare signature (signer did only) be verified for objects that carry
// no separate identity payload, such as the SpatialIndexRoot.
export function didKeyToPublicKey(did) {
    if (typeof did !== 'string' || !did.startsWith('did:key:z')) {
        return null;
    }
    const bytes = base58Decode(did.slice('did:key:z'.length));
    if (!bytes || bytes.length !== 34 || bytes[0] !== 0xed || bytes[1] !== 0x01) {
        return null;
    }
    return bytes.slice(2);
}
