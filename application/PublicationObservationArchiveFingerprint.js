import { PublicationObservationArchive } from './PublicationObservationArchive.js';

// 0.8.84 — Durable Publication Archive Fingerprint.
//
// 0.8.82 made a `PublicationObservationArchive` portable — it can leave one
// browser and re-enter another. 0.8.83 taught that portable archive to say
// WHERE each fact it holds entered it. Neither ever answered a third,
// simpler question a person asks the moment an archive becomes portable:
// once this archive has left the browser, how does a person tell whether
// what came back is the SAME durable archive?
//
//   PublicationObservationArchive
//        │  toJSON()                                (0.8.75, unchanged)
//        ▼
//   { ...six factual collections, six provenance collections,
//     archiveImportEvents }
//        │
//        │  THIS FILE — strip archiveImportEvents, canonicalize, hash
//        ▼
//   fingerprintPublicationObservationArchive()
//        │
//        ▼
//   a 64-character lowercase SHA-256 hex digest
//
// AN ARCHIVE FINGERPRINT IDENTIFIES THE EXACT DURABLE FACTS REPRESENTED BY
// AN ARCHIVE; IT DOES NOT AUTHENTICATE THEIR ORIGIN OR ESTABLISH THEIR
// TRUTH — THE FLAGSHIP INVARIANT, restated everywhere this module is used.
// Two archives fingerprint identically if and only if their canonical
// content is byte-identical. That is ALL a matching fingerprint means. It
// is never described as "verified," "authentic," or "trusted" anywhere in
// this codebase — see docs/Principles.md, "The UI Displays Observations;
// It Does Not Turn Them Into A Verdict (0.8.57)," held here once more, one
// layer over an entire archive's own identity rather than over a single
// observation. A matching fingerprint says two replicas hold the same
// bytes; it says nothing about whether either replica's own facts are
// correct.
//
// REUSES `toJSON()`'S OWN CANONICAL SERIALIZATION — NO SECOND SCHEMA. This
// file invents no `toFingerprintJSON()`, no competing field order, no
// second notion of "the archive's own shape." `PublicationObservationArchive.js`'s
// own `toJSON()` already serializes deterministically — identical facts,
// identical field order, identical output, every time (see that method's
// own header) — so this file's only job is to hash exactly that output,
// minus one field (below).
//
// EXCLUDES `archiveImportEvents` — INGESTION METADATA, NOT FACTUAL
// CONTENT. `archiveImportEvents` records WHEN this replica happened to
// import an archive (see application/PublicationObservationArchive.js's
// own header, 0.8.83) — a fact about this replica's own history with the
// archive, not about the durable publication facts the archive
// represents. Two replicas holding the identical facts and identical
// provenance, but that imported them at different moments (or a different
// number of times), would otherwise fingerprint differently for a reason
// that has nothing to do with what either replica actually knows. Every
// other field `toJSON()` produces — all six factual collections AND all
// six parallel provenance collections — participates in the fingerprint
// unchanged. Provenance is deliberately INCLUDED: 0.8.83 made provenance
// itself durable archive data, and an archive whose facts are IMPORTED is
// not the SAME durable archive as one whose identical-looking facts are
// LOCAL — see this file's own flagship test for the demonstration.
//
// SYNCHRONOUS, PURE, DETERMINISTIC, SELF-CONTAINED. `fingerprintPublicationObservationArchive()`
// reads no clock, touches no storage, and performs no network operation —
// calling it twice on byte-identical input produces a byte-identical
// digest. SHA-256 is implemented from first principles, right here,
// rather than through the browser's own `crypto.subtle.digest()` — that
// API is Promise-only, and a fingerprint computed for display alongside
// every other synchronous `describeXxx()` projection in this codebase has
// no honest use for an asynchronous one. This mirrors anchoring/
// BitcoinAnchorSignedPsbtFinalizer.js's own from-scratch SHA-256 exactly,
// and is DELIBERATELY DUPLICATED here rather than imported from that
// unrelated domain — the identical self-containment every anchoring/ class
// already holds one directory over (see that file's own "Byte-level
// primitives — deliberately duplicated, not imported" header).
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No signing, no public/private
// keys, no "trusted archive" vocabulary, no remote notarization, no
// blockchain anchoring of the fingerprint itself, no automatic
// publication or comparison of a fingerprint, no automatic
// synchronization, no archive merging. A fingerprint answers exactly one
// question — "what exact durable archive state does this replica
// currently represent?" — with a deterministic hash, and stops there.
// Comparing two fingerprints (pasted, or against a second imported
// archive) is explicitly left for a later, separately sized milestone —
// see docs/Roadmap.md, 0.8.84, "Deliberately excluded."
export const PublicationObservationArchiveFingerprintAlgorithm = 'SHA-256';

// `archive` must be a real `PublicationObservationArchive` instance — this
// function performs no duck-typing, mirroring application/
// PublicationObservationArchiveExport.js's own `exportPublicationObservationArchive()`
// contract exactly. Returns a 64-character lowercase hex SHA-256 digest of
// the archive's own canonical content (every field `toJSON()` produces,
// except `archiveImportEvents`). Never throws for a well-formed archive;
// never mutates it.
export function fingerprintPublicationObservationArchive(archive) {
    if (!(archive instanceof PublicationObservationArchive)) {
        throw new Error('fingerprintPublicationObservationArchive() requires a PublicationObservationArchive');
    }
    const canonicalContent = canonicalArchiveFingerprintContent(archive);
    return bytesToHex(sha256(new TextEncoder().encode(canonicalContent)));
}

// The exact string this module hashes — exposed for nothing outside this
// file; kept as its own function only so `fingerprintPublicationObservationArchive()`
// itself stays a one-line "canonicalize, then hash."
function canonicalArchiveFingerprintContent(archive) {
    const { archiveImportEvents, ...factualAndProvenanceContent } = archive.toJSON();
    return JSON.stringify(factualAndProvenanceContent);
}

// ---------------------------------------------------------------------
// SHA-256, implemented from first principles — deliberately duplicated
// from, not imported from, anchoring/BitcoinAnchorSignedPsbtFinalizer.js.
// See this file's own header for why.
// ---------------------------------------------------------------------

function rotr32(x, n) { return ((x >>> n) | (x << (32 - n))) >>> 0; }

const SHA256_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function sha256(bytes) {
    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

    const msgLen = bytes.length;
    let totalLen = msgLen + 1;
    while (totalLen % 64 !== 56) totalLen++;
    totalLen += 8;
    const padded = new Uint8Array(totalLen);
    padded.set(bytes);
    padded[msgLen] = 0x80;
    new DataView(padded.buffer).setBigUint64(totalLen - 8, BigInt(msgLen) * 8n, false);

    const w = new Uint32Array(64);
    for (let offset = 0; offset < padded.length; offset += 64) {
        for (let i = 0; i < 16; i++) {
            w[i] = ((padded[offset + i * 4] << 24) | (padded[offset + i * 4 + 1] << 16) | (padded[offset + i * 4 + 2] << 8) | padded[offset + i * 4 + 3]) >>> 0;
        }
        for (let i = 16; i < 64; i++) {
            const s0 = rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3);
            const s1 = rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
        }
        let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
        for (let i = 0; i < 64; i++) {
            const S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
            const ch = (e & f) ^ (~e & g);
            const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
            const S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const temp2 = (S0 + maj) >>> 0;
            h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
        }
        h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
        h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
    }
    const out = new Uint8Array(32);
    const dv = new DataView(out.buffer);
    [h0, h1, h2, h3, h4, h5, h6, h7].forEach((h, i) => dv.setUint32(i * 4, h));
    return out;
}

function bytesToHex(bytes) {
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
        hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
}
