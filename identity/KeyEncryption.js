// Passphrase protection for a LocalIdentity's private key seed, using the
// platform's WebCrypto (browsers and Node share the same API). Everything
// here is asynchronous because WebCrypto is.
//
// Current records: PBKDF2-HMAC-SHA-256 stretches the passphrase into an
// AES-256-GCM key. 600,000 iterations is OWASP's recommendation for
// PBKDF2-SHA-256; WebCrypto's native implementation keeps an unlock to a
// fraction of a second. GCM authenticates the ciphertext, so a wrong
// passphrase or a tampered record is rejected outright instead of
// decrypting to garbage that would silently become an invalid key.
//
// Legacy records (kdf "PBKDF2-HMAC-SHA512", written before this format,
// with 600 iterations and a SHA-512 keystream plus HMAC-SHA-512 tag) still
// decrypt, so existing protected identities and exported files keep
// working. needsUpgrade() tells callers to re-encrypt them.
export const KDF = 'PBKDF2-SHA256';
export const CIPHER = 'AES-256-GCM';
export const FORMAT_VERSION = 2;
export const DEFAULT_ITERATIONS = 600000;
// A record states its own iteration count. Above this bound it is refused
// rather than run, so a crafted file cannot make an unlock hang.
export const MAX_ITERATIONS = 10000000;

const LEGACY_KDF = 'PBKDF2-HMAC-SHA512';
const SALT_LENGTH = 16;
const GCM_NONCE_LENGTH = 12;
const ADDITIONAL_DATA = new TextEncoder().encode('forkbuild-identity-key/v2');

export class IncorrectPassphraseError extends Error {
    constructor() {
        super('KeyEncryption: incorrect passphrase or corrupted record');
        this.name = 'IncorrectPassphraseError';
    }
}

function subtle() {
    const api = globalThis.crypto && globalThis.crypto.subtle;
    if (!api) {
        throw new Error('KeyEncryption: WebCrypto (crypto.subtle) is not available in this environment');
    }
    return api;
}

function randomBytes(length) {
    return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

function utf8(text) {
    return new TextEncoder().encode(text);
}

function toHex(bytes) {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
    if (typeof hex !== 'string' || hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) {
        throw new IncorrectPassphraseError();
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

function requirePassphrase(passphrase, operation) {
    if (!passphrase || typeof passphrase !== 'string') {
        throw new Error(`KeyEncryption.${operation}: passphrase is required`);
    }
}

function checkIterations(iterations) {
    if (!Number.isInteger(iterations) || iterations < 1 || iterations > MAX_ITERATIONS) {
        throw new IncorrectPassphraseError();
    }
}

async function pbkdf2(passphrase, salt, iterations, hash, bits) {
    const material = await subtle().importKey('raw', utf8(passphrase), 'PBKDF2', false, ['deriveBits']);
    return new Uint8Array(await subtle().deriveBits({ name: 'PBKDF2', hash, salt, iterations }, material, bits));
}

// Encrypts seedBytes under passphrase. Returns a plain, JSON-safe record
// meant to be stored verbatim; every call uses a fresh salt and nonce.
export async function encrypt(seedBytes, passphrase, { iterations = DEFAULT_ITERATIONS } = {}) {
    requirePassphrase(passphrase, 'encrypt');
    if (!Number.isInteger(iterations) || iterations < 1 || iterations > MAX_ITERATIONS) {
        throw new Error('KeyEncryption.encrypt: iterations must be a whole number between 1 and ' + MAX_ITERATIONS);
    }
    const salt = randomBytes(SALT_LENGTH);
    const nonce = randomBytes(GCM_NONCE_LENGTH);
    const keyBytes = await pbkdf2(passphrase, salt, iterations, 'SHA-256', 256);
    const key = await subtle().importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
    const ciphertext = new Uint8Array(await subtle().encrypt(
        { name: 'AES-GCM', iv: nonce, additionalData: ADDITIONAL_DATA }, key, seedBytes
    ));
    return {
        version: FORMAT_VERSION,
        kdf: KDF,
        iterations,
        cipher: CIPHER,
        salt: toHex(salt),
        nonce: toHex(nonce),
        ciphertext: toHex(ciphertext)
    };
}

// Decrypts a record produced by encrypt() (or a legacy record). Rejects
// with IncorrectPassphraseError, never with wrong-but-plausible bytes,
// whenever the passphrase is wrong or the record was tampered with.
export async function decrypt(record, passphrase) {
    if (!record || typeof record !== 'object') {
        throw new Error('KeyEncryption.decrypt: record is required');
    }
    requirePassphrase(passphrase, 'decrypt');
    if (record.kdf === LEGACY_KDF) {
        return decryptLegacy(record, passphrase);
    }
    if (record.kdf !== KDF || record.cipher !== CIPHER) {
        throw new IncorrectPassphraseError();
    }
    checkIterations(record.iterations);
    const keyBytes = await pbkdf2(passphrase, fromHex(record.salt), record.iterations, 'SHA-256', 256);
    const key = await subtle().importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
    try {
        return new Uint8Array(await subtle().decrypt(
            { name: 'AES-GCM', iv: fromHex(record.nonce), additionalData: ADDITIONAL_DATA }, key, fromHex(record.ciphertext)
        ));
    } catch {
        throw new IncorrectPassphraseError();
    }
}

// True when a record should be re-encrypted: it uses an older format, or
// fewer iterations than the caller now uses.
export function needsUpgrade(record, { iterations = DEFAULT_ITERATIONS } = {}) {
    return !record || record.kdf !== KDF || record.cipher !== CIPHER || !(record.iterations >= iterations);
}

// ------------------------------------------------------------------
// Legacy format, decrypt only.
// ------------------------------------------------------------------
async function hmacSha512(keyBytes, messageBytes) {
    const key = await subtle().importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
    return new Uint8Array(await subtle().sign('HMAC', key, messageBytes));
}

function concat(...arrays) {
    const out = new Uint8Array(arrays.reduce((sum, a) => sum + a.length, 0));
    let offset = 0;
    for (const a of arrays) {
        out.set(a, offset);
        offset += a.length;
    }
    return out;
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

async function decryptLegacy(record, passphrase) {
    checkIterations(record.iterations);
    const salt = fromHex(record.salt);
    const nonce = fromHex(record.nonce);
    const ciphertext = fromHex(record.ciphertext);
    const master = await pbkdf2(passphrase, salt, record.iterations, 'SHA-512', 512);
    const encKey = (await hmacSha512(master, utf8('forkbuild-identity/enc'))).slice(0, 32);
    const macKey = (await hmacSha512(master, utf8('forkbuild-identity/mac'))).slice(0, 32);
    const tag = (await hmacSha512(macKey, concat(nonce, ciphertext))).slice(0, 32);
    if (!constantTimeEqual(tag, fromHex(record.tag))) {
        throw new IncorrectPassphraseError();
    }
    // Keystream block i is SHA-512(encKey || nonce || i as 4 big-endian bytes).
    const output = new Uint8Array(ciphertext.length);
    for (let offset = 0, counter = 0; offset < ciphertext.length; offset += 64, counter += 1) {
        const counterBytes = new Uint8Array([counter >>> 24, (counter >>> 16) & 0xff, (counter >>> 8) & 0xff, counter & 0xff]);
        const block = new Uint8Array(await subtle().digest('SHA-512', concat(encKey, nonce, counterBytes)));
        for (let i = 0; i < 64 && offset + i < ciphertext.length; i++) {
            output[offset + i] = ciphertext[offset + i] ^ block[i];
        }
    }
    return output;
}
