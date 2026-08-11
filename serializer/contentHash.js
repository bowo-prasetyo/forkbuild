// Deterministic content hash for serialized documents. FNV-1a 32-bit:
// simple, synchronous, collision-resistant enough for local integrity
// checking. A future server-backed milestone can upgrade to SHA-256
// without changing the interface — callers only see a hex string.
//
// The hash is computed over the CANONICAL JSON string, so equivalent
// documents always produce the same hash. This is what makes the
// published-snapshot integrity check meaningful.
export function computeContentHash(text) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}
