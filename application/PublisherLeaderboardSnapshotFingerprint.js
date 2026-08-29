import { describePublisherLeaderboardSnapshot } from './PublisherLeaderboardSnapshot.js';

// 0.8.121 — Leaderboard Snapshot Fingerprint (the cryptographic claim
// digest, NOT a replacement for 0.8.119's own semantic snapshot identity).
//
//   PublisherLeaderboardSnapshot                (0.8.119, UNCHANGED)
//     { evidenceFingerprint, policy, leaderboard }
//              │
//              │  describePublisherLeaderboardSnapshotFingerprint()
//              ▼
//   { algorithm: 'SHA-256', fingerprint: <64-char lowercase hex> }
//
// 0.8.119's own header DECLINED a snapshot hash, deliberately — its own
// words: "a second, leaderboard-scoped hash would add no information a
// caller does not already have, while inventing a second, competing
// notion of 'the snapshot's true identity' alongside the pair that
// already serves that purpose." That restraint is UNCHANGED and this file
// does not undo it — `application/PublisherLeaderboardSnapshot.js` itself
// is not touched by this milestone, gains no new field, and no new
// export. This file exists BESIDE it, for a narrower purpose 0.8.119
// never needed to serve: giving a SIGNATURE (see
// core/PublisherLeaderboardSnapshotClaim.js) something to authenticate
// that is exact BYTES, not a semantic equivalence class.
//
// WHY A SIGNATURE NEEDS A DIFFERENT KIND OF FINGERPRINT THAN "IDENTITY"
// DOES. 0.8.119's `(evidenceFingerprint, policy.version)` pair answers
// "would two replicas compute the same leaderboard?" — and under correct,
// unmodified computation, the answer is always consistent with the full
// snapshot content, because a snapshot is a pure, deterministic function
// of exactly those two inputs (see 0.8.119's own "Leaderboard projection
// purity"). A signature's job is different: it authorizes EXACT bytes a
// signer looked at and attested to, the same posture `core/Signature.js`'s
// own canonical-envelope discipline already takes for every other signed
// object in this codebase ("ForkBuild NEVER signs arbitrary serialized
// JSON"). `snapshotFingerprint` is that exact-bytes digest — computed over
// the COMPLETE snapshot (evidence fingerprint, full policy, full
// leaderboard, every entry, every rank), never merely the two-field
// semantic pair — so a claim's signature is never weaker than what it
// visibly appears to authenticate.
//
// TWO FINGERPRINTS, NEVER CONFUSED FOR ONE ANOTHER.
//
//   application/AchievementEvidenceFingerprint.js  (0.8.116)
//     — fingerprints EVIDENCE. Two replicas' RAW FACTS.
//
//   THIS FILE (0.8.121)
//     — fingerprints a SNAPSHOT — evidence fingerprint, policy, AND the
//       computed leaderboard, together. Two replicas' CONCLUSION.
//
// A caller who wants to know "do two replicas hold the same facts?" reads
// 0.8.116's own fingerprint; a caller who wants to know "does this exact
// signed conclusion match byte-for-byte?" reads this one. Neither is ever
// substituted for the other anywhere in this codebase.
//
// REUSES 0.8.119's OWN NORMALIZATION — NO SECOND TOLERANCE SCHEME. Before
// hashing, the input is routed through `describePublisherLeaderboardSnapshot()`
// (0.8.119, UNCHANGED) exactly the way `application/
// PublisherLeaderboardSnapshotVerification.js`'s own `normalizeSnapshot()`
// already does (0.8.120) — a genuine `{ evidenceFingerprint, leaderboard }`
// shape passes through unchanged, and anything malformed or absent
// degrades to the identical well-defined empty snapshot 0.8.119 already
// defines. This file invents no new fallback rule.
//
// CANONICALIZATION IS PLAIN `JSON.stringify()` OVER THE NORMALIZED
// SNAPSHOT — NO SORTING, NO FIELD-BY-FIELD RECURSION. Unlike 0.8.116's own
// multi-collection, order-independent canonicalization (built for
// collections that can legitimately arrive in different ingestion order
// on different replicas), a `PublisherLeaderboardSnapshot` has exactly one
// well-defined shape and field order — `describePublisherLeaderboardSnapshot()`
// itself always produces `{ evidenceFingerprint, policy, leaderboard }` in
// that fixed order, and every nested object beneath it (a ranking policy,
// a leaderboard entry) is likewise always built in one fixed field order
// by the single `describeXxx()` that produces it. `JSON.stringify()`
// over that already-canonical shape is therefore already deterministic —
// reusing it here is not a shortcut, it is the correct amount of work.
//
// SYNCHRONOUS, PURE, DETERMINISTIC, SELF-CONTAINED — SHA-256 IMPLEMENTED
// FROM FIRST PRINCIPLES, DELIBERATELY DUPLICATED, NOT IMPORTED. Identical
// restraint, and identical reasoning, to application/
// AchievementEvidenceFingerprint.js's own header (0.8.116):
// `crypto.subtle.digest()` is Promise-only and has no honest use here,
// where a fingerprint is computed synchronously alongside every other
// `describeXxx()` projection in this codebase. This file re-implements
// the identical algorithm rather than importing it from any of the other
// sites it already lives — the same "byte-level primitives, deliberately
// duplicated" discipline every self-contained hashing site in this
// codebase already holds.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No comparison of two
// fingerprints — a caller already has everything needed with `===`. No
// signing, no public/private keys — see core/PublisherLeaderboardSnapshotClaim.js
// for where signing actually happens, one layer up. No persistence — this
// file computes fresh, every time, exactly like every fingerprint it sits
// beside.
export const PublisherLeaderboardSnapshotFingerprintAlgorithm = 'SHA-256';

// The pure computation. Accepts anything shaped like — or claiming to be
// — a 0.8.119 PublisherLeaderboardSnapshot and returns a frozen
// `{ algorithm, fingerprint }`. Never throws, never mutates its input,
// reads no clock, no storage, no network.
export function describePublisherLeaderboardSnapshotFingerprint(snapshot) {
    const source = (snapshot && typeof snapshot === 'object') ? snapshot : {};
    const normalized = describePublisherLeaderboardSnapshot(source.evidenceFingerprint, source.leaderboard);
    return Object.freeze({
        algorithm: PublisherLeaderboardSnapshotFingerprintAlgorithm,
        fingerprint: sha256Hex(JSON.stringify(normalized))
    });
}

function sha256Hex(text) {
    return bytesToHex(sha256(new TextEncoder().encode(text)));
}

// ---------------------------------------------------------------------
// SHA-256, implemented from first principles — deliberately duplicated
// from, not imported from, application/AchievementEvidenceFingerprint.js,
// application/PublicationObservationArchiveFingerprint.js, and
// anchoring/BitcoinAnchorSignedPsbtFinalizer.js. See this file's own
// header for why.
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
    const view = new DataView(out.buffer);
    view.setUint32(0, h0, false); view.setUint32(4, h1, false); view.setUint32(8, h2, false); view.setUint32(12, h3, false);
    view.setUint32(16, h4, false); view.setUint32(20, h5, false); view.setUint32(24, h6, false); view.setUint32(28, h7, false);
    return out;
}

function bytesToHex(bytes) {
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
        hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
}
