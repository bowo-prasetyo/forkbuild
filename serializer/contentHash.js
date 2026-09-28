import { sha256 } from '../vendor/noble-hashes/sha2.js';
import { bytesToHex } from '../vendor/noble-hashes/utils.js';

// Content hashes identify published bytes, and a signed record (a
// Publication, a placement) commits to them by hash, so the hash must be
// collision-resistant: SHA-256 over the text's UTF-8 bytes, as 64
// lowercase hex characters.
//
// Content published before this was hashed with 32-bit FNV-1a (8 hex
// characters), which anyone can collide in milliseconds. The two are told
// apart by length. An FNV-1a hash is accepted only where the caller says
// the bytes came from this device (`allowLegacy`), never from a peer,
// gateway or announcement, because there it binds nothing.
export const CONTENT_HASH_ALGORITHM = 'sha256';
export const LEGACY_CONTENT_HASH_ALGORITHM = 'fnv1a-32';

const SHA256_HASH_PATTERN = /^[0-9a-f]{64}$/;
const LEGACY_HASH_PATTERN = /^[0-9a-f]{8}$/;
// A lone surrogate encodes to the same UTF-8 as U+FFFD, so two different
// strings would share a hash; such text is never accepted as content.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

const encoder = new TextEncoder();

export function computeContentHash(text) {
    return bytesToHex(sha256(encoder.encode(text)));
}

// 32-bit FNV-1a over UTF-16 code units. Not collision-resistant: use it
// only to check legacy hashes, or where a stable, cheap number is wanted
// and nobody gains by choosing a collision (deterministic layout, a
// redundant check beside a real signature).
export function computeFnv1a32(text) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}

// 'sha256', 'fnv1a-32', or null for anything that is neither.
export function contentHashAlgorithm(hash) {
    if (typeof hash !== 'string') return null;
    if (SHA256_HASH_PATTERN.test(hash)) return CONTENT_HASH_ALGORITHM;
    if (LEGACY_HASH_PATTERN.test(hash)) return LEGACY_CONTENT_HASH_ALGORITHM;
    return null;
}

export function isLegacyContentHash(hash) {
    return contentHashAlgorithm(hash) === LEGACY_CONTENT_HASH_ALGORITHM;
}

// Whether `text` is the content `expectedHash` names.
export function contentHashMatches(text, expectedHash, { allowLegacy = false } = {}) {
    if (typeof text !== 'string' || LONE_SURROGATE.test(text)) return false;
    const algorithm = contentHashAlgorithm(expectedHash);
    if (algorithm === CONTENT_HASH_ALGORITHM) return computeContentHash(text) === expectedHash;
    if (algorithm === LEGACY_CONTENT_HASH_ALGORITHM && allowLegacy) return computeFnv1a32(text) === expectedHash;
    return false;
}

export const LEGACY_HASH_REASON = 'it was published with an old, insecure content hash (FNV-1a) that can\'t be checked; its author needs to publish it again';

// Why content failed its hash check, for an error message.
export function describeContentHashMismatch(expectedHash) {
    return isLegacyContentHash(expectedHash) ? LEGACY_HASH_REASON : 'hash mismatch';
}
