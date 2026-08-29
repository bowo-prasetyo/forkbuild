import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { BitcoinAnchorPublicationRecord } from './BitcoinAnchorPublicationRecord.js';
import { BaseAnchorPublicationRecord } from './BaseAnchorPublicationRecord.js';
import { PublicationReferenceRecord } from './PublicationReferenceRecord.js';
import { PublisherPublicationAssociationRecord } from './PublisherPublicationAssociationRecord.js';

// 0.8.116 — Achievement Evidence Set Fingerprint.
//
// 0.8.114 made achievement evidence portable (export/import); 0.8.115 made
// it composable (merge, without destroying local history). Neither ever
// answered the question a decentralized network actually needs answered
// BEFORE it exchanges anything: two replicas that have never compared
// notes — do we already hold the same evidence, or not?
//
//   Alice's archive                         Bob's archive
//        │  reconstructAchievementEvidenceFingerprint()   │
//        ▼                                                 ▼
//   { algorithm, fingerprint,               { algorithm, fingerprint,
//     collectionFingerprints }                collectionFingerprints }
//                    │                                 │
//                    └──────────── compare ────────────┘
//                                  │
//                         same fingerprint?
//                     (byte-identical evidence)
//
// This file answers exactly that, over the identical four evidence
// collections 0.8.114 already named as "the achievement evidence" —
// `bitcoinAnchorPublicationRecords`, `baseAnchorPublicationRecords`,
// `publicationReferenceRecords`, `publisherPublicationAssociationRecords`
// — and nothing else.
//
// A FINGERPRINT IDENTIFIES AN EVIDENCE SET; IT DOES NOT AUTHENTICATE IT OR
// ESTABLISH ITS TRUTH — THE FLAGSHIP INVARIANT application/
// PublicationObservationArchiveFingerprint.js's own header already holds
// for a whole archive (0.8.84), held here once more, one layer narrower.
// Two replicas fingerprinting identically means their canonical evidence
// content is byte-identical. That is ALL it means. It is never described
// as "verified," "authentic," "trusted," or "in sync" anywhere in this
// codebase — see docs/Principles.md, "The UI Displays Observations; It
// Does Not Turn Them Into A Verdict (0.8.57)."
//
// EVIDENCE ONLY — NEVER A CONCLUSION, NEVER PROVENANCE, NEVER A CLOCK. THE
// ONE RULE THIS ENTIRE FILE EXISTS TO ENFORCE. This module reads exactly
// the four collections named above, straight off a `PublicationObservationArchive`,
// unchanged — the identical, already-justified minimum application/
// AchievementEvidenceExport.js's own header traces from the actual
// achievement pipeline (see that file's "The Minimum Durable Source
// Collections Necessary" section — reused here rather than re-derived). It
// never reads, and its result never carries a trace of:
//   - an achievement event, a badge, a statistic, a rank, or a leaderboard
//     position (application/AchievementEvent.js,
//     PublisherAchievementStatisticsView.js, PublisherRankingPolicy.js,
//     PublisherLeaderboardView.js — none of them imported here, none of
//     them called here);
//   - provenance (`LOCAL` vs `IMPORTED`) — see below;
//   - observation history of any kind (IPFS records, confirmation/
//     inclusion/content-proof observations, broadcast records,
//     `archiveImportEvents`) — every one of `PublicationObservationArchive`'s
//     other six collections is invisible to this file, exactly as it is
//     invisible to `exportAchievementEvidence()` one milestone over;
//   - UI state, network state, or any timestamp this module itself
//     generates. `reconstructAchievementEvidenceFingerprint()` reads no
//     clock — calling it twice on the byte-identical archive produces a
//     byte-identical result, forever.
// Provenance describes HOW a replica came to hold a fact
// (`PublicationObservationArchiveProvenance.js`'s own header, 0.8.83),
// never WHAT the fact is — and it is never part of any evidence record's
// own `toJSON()` shape in the first place (it lives in `archive`'s own
// parallel `*Provenance` arrays, one layer outside every record class this
// file reads). This module therefore does not need to strip provenance
// before hashing — there is nothing to strip — and a `LOCAL` record and an
// `IMPORTED` record carrying identical fields are, and can only ever be,
// the identical fingerprint input. This is a DELIBERATE DIFFERENCE from
// `application/PublicationObservationArchiveFingerprint.js`'s own 0.8.84
// choice to INCLUDE provenance in a WHOLE-archive fingerprint — that
// fingerprint answers "is this the same durable archive, ingestion history
// included?"; this one answers a narrower question a merge/sync protocol
// actually needs — "do two replicas agree on the achievement-relevant
// FACTS?" — where two replicas that reached the identical facts by
// different paths must compare equal, not differently.
//
// CANONICALIZATION: SORTED, NEVER DEDUPLICATED — A MULTISET FINGERPRINT,
// NOT A SET FINGERPRINT. Each of the four collections is canonicalized
// independently: every record's own `toJSON()` output (the same canonical
// shape every record class already produces for persistence, export, and
// merge — reused a fourth time, never reinvented) is serialized with
// `JSON.stringify()`, and the resulting strings are sorted
// lexicographically before being joined into one canonical array text.
// Sorting makes the fingerprint ORDER-INDEPENDENT — two replicas that
// ingested the identical facts in two different sequences (exactly what a
// decentralized network guarantees will happen) fingerprint identically.
// Sorting is not deduplication: `application/PublicationReferenceRecord.js`'s
// and `application/PublisherPublicationAssociationRecord.js`'s own headers
// already establish that exact-duplicate relationship records are
// deliberately allowed to coexist within one archive ("NEVER
// DEDUPLICATED") — two structurally identical records sort adjacent to
// each other and BOTH remain in the canonical text, so a collection
// holding a legitimate duplicate fingerprints differently from the
// otherwise-identical collection holding only one copy. See this file's
// own "Section D — multiplicity" test for the concrete proof.
//
// EACH COLLECTION IS A SEPARATE, NAMED SLOT — NEVER ONE FLAT POOL OF
// RECORDS. `application/BitcoinAnchorPublicationRecord.js`'s and
// `application/BaseAnchorPublicationRecord.js`'s own headers already
// establish that a Bitcoin publication and a Base publication are never
// the same identity even when they share a `contentHash` and an
// identical-looking chain reference — `blockchain` is part of what makes
// them distinct. This module holds that boundary structurally, not by
// convention: a Bitcoin record and a Base record are hashed into two
// entirely separate collection fingerprints (`bitcoinAnchorPublicationRecords`
// vs `baseAnchorPublicationRecords`), so no coincidence of field values
// could ever make one collection's content bleed into the other's digest.
//
// THE TOP-LEVEL FINGERPRINT IS THE CANONICAL FINGERPRINT OF THE FOUR
// COLLECTION FINGERPRINTS TOGETHER — A HASH OF HASHES, NEVER A SEPARATE,
// COMPETING NOTION OF "THE WHOLE EVIDENCE SET'S OWN SHAPE." Once each
// collection has its own deterministic digest, the overall evidence-set
// fingerprint is simply the SHA-256 of those four digests, arranged in the
// fixed field order below (`bitcoinAnchorPublicationRecords`,
// `baseAnchorPublicationRecords`, `publicationReferenceRecords`,
// `publisherPublicationAssociationRecords`) and JSON-serialized. This
// keeps `collectionFingerprints` genuinely USEFUL on its own — a future
// synchronization milestone (see docs/Roadmap.md, 0.8.116, "What's left")
// can compare two replicas collection-by-collection to learn WHICH kind of
// evidence differs, without this file inventing a second hashing scheme to
// make that possible.
//
// SYNCHRONOUS, PURE, DETERMINISTIC, SELF-CONTAINED — SHA-256 IMPLEMENTED
// FROM FIRST PRINCIPLES, DELIBERATELY DUPLICATED, NOT IMPORTED. Identical
// restraint, and identical reasoning, to application/
// PublicationObservationArchiveFingerprint.js's own header (0.8.84):
// `crypto.subtle.digest()` is Promise-only and has no honest use here,
// where a fingerprint is computed for display alongside every other
// synchronous `describeXxx()`/`reconstructXxx()` projection in this
// codebase. This file re-implements the identical algorithm rather than
// importing it from that file (or from anchoring/
// BitcoinAnchorSignedPsbtFinalizer.js, where it also already lives) — the
// same "byte-level primitives, deliberately duplicated" discipline every
// self-contained hashing site in this codebase already holds.
//
// `describeAchievementEvidenceFingerprint()` / `reconstructAchievementEvidenceFingerprint()`
// — THE IDENTICAL SPLIT EVERY OTHER FILE IN THE ACHIEVEMENT FAMILY ALREADY
// HOLDS, NOT A NEW ONE INVENTED HERE. `describeAchievementEvidenceFingerprint()`
// is the pure computation: it receives plain, already-extracted evidence
// arrays and returns a fingerprint, exactly the shape application/
// AchievementEvent.js's own `describeAchievementEvents()` and application/
// PublisherAchievementProfileView.js's own `describePublisherAchievementProfile()`
// already hold (`describeXxx(rawInputs...)`). `reconstructAchievementEvidenceFingerprint()`
// is the ONE, thin, archive-reading entry point, mirroring
// `reconstructAchievementEvents()`/`reconstructPublisherAchievementProfile()`
// exactly: an invalid/missing archive degrades to
// `PublicationObservationArchive.empty()` — never an error — and its own
// (empty) four collections are handed to the pure function above. Neither
// function ever throws, mutates its input, or performs any I/O.
//
// MALFORMED/ABSENT INPUT IS TOLERATED, NEVER THROWN ON — THE IDENTICAL
// RESTRAINT EVERY `describeXxx()` IN THE ACHIEVEMENT FAMILY ALREADY HOLDS.
// A non-array collection is treated as empty; an array entry that is not a
// genuine instance of the expected record class is silently excluded —
// word for word application/AchievementEvent.js's own `toChainEntries()`
// contract, reused here rather than reinvented.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No comparison of two
// fingerprints (`MATCH`/`DIFFERENT`, the way application/
// PublicationObservationArchiveFingerprintComparison.js already does one
// layer up, 0.8.85) — a caller already has everything needed to compare
// two of this file's own results with `===`, and a dedicated comparison
// entry point, if one earns its keep, is separately sized later work. No
// evidence diffing ("what does A have that B lacks") — that is 0.8.117's
// own, separately sized question, deliberately left unbuilt here exactly
// as 0.8.84 left it unbuilt for whole-archive fingerprints until 0.8.87/
// 0.8.88. No signing, no public/private keys, no "trusted evidence"
// vocabulary, no automatic comparison, publication, or synchronization of
// any kind, no peer discovery, no transport mechanism. A fingerprint
// answers exactly one question — "what exact achievement evidence set does
// this replica currently hold?" — with a deterministic hash, and stops
// there.
export const AchievementEvidenceFingerprintAlgorithm = 'SHA-256';

// The four evidence collections this module fingerprints, in the fixed
// order every fingerprint this file produces is built from — the identical
// order, and the identical set, application/AchievementEvidenceExport.js's
// own `TOP_LEVEL_FIELDS` and application/AchievementEvidenceMerge.js's own
// `collectionKeys` already use. Never reordered, never extended without a
// schema-version-style migration one layer up, exactly like those two
// files' own closed field lists.
const EVIDENCE_COLLECTION_SPECS = Object.freeze([
    Object.freeze({ key: 'bitcoinAnchorPublicationRecords', RecordClass: BitcoinAnchorPublicationRecord }),
    Object.freeze({ key: 'baseAnchorPublicationRecords', RecordClass: BaseAnchorPublicationRecord }),
    Object.freeze({ key: 'publicationReferenceRecords', RecordClass: PublicationReferenceRecord }),
    Object.freeze({ key: 'publisherPublicationAssociationRecords', RecordClass: PublisherPublicationAssociationRecord })
]);

// The pure computation. Receives the same four evidence collections
// `exportAchievementEvidence()`/`mergeAchievementEvidence()` already treat
// as this replica's own achievement evidence — plain arrays, tolerated
// exactly like every other `describeXxx()` in this file's own family (see
// this file's own header). Returns a frozen:
//
//   {
//       algorithm: 'SHA-256',
//       fingerprint: <64-char lowercase hex — the four collections together>,
//       collectionFingerprints: {
//           bitcoinAnchorPublicationRecords: <64-char lowercase hex>,
//           baseAnchorPublicationRecords: <64-char lowercase hex>,
//           publicationReferenceRecords: <64-char lowercase hex>,
//           publisherPublicationAssociationRecords: <64-char lowercase hex>
//       }
//   }
//
// Never throws. Never mutates any input. Reads no clock, no storage, no
// network. Calling this twice with equivalent evidence — even reordered,
// even reached by two entirely independent code paths — returns a
// byte-identical result.
export function describeAchievementEvidenceFingerprint(
    bitcoinAnchorPublicationRecords = [],
    baseAnchorPublicationRecords = [],
    publicationReferenceRecords = [],
    publisherPublicationAssociationRecords = []
) {
    const inputsByKey = {
        bitcoinAnchorPublicationRecords,
        baseAnchorPublicationRecords,
        publicationReferenceRecords,
        publisherPublicationAssociationRecords
    };

    const collectionFingerprints = {};
    for (const { key, RecordClass } of EVIDENCE_COLLECTION_SPECS) {
        collectionFingerprints[key] = sha256Hex(canonicalCollectionContent(inputsByKey[key], RecordClass));
    }
    Object.freeze(collectionFingerprints);

    // A hash of hashes, in the one fixed field order this module ever
    // uses — see this file's own header, "The top-level fingerprint is the
    // canonical fingerprint of the four collection fingerprints together."
    const combinedCanonicalContent = JSON.stringify(collectionFingerprints);

    return Object.freeze({
        algorithm: AchievementEvidenceFingerprintAlgorithm,
        fingerprint: sha256Hex(combinedCanonicalContent),
        collectionFingerprints
    });
}

// reconstructAchievementEvidenceFingerprint() — the ONE, thin,
// archive-reading entry point, mirroring application/AchievementEvent.js's
// own `reconstructAchievementEvents()` exactly. It pulls this replica's
// own four evidence collections straight out of `archive`, unchanged, and
// hands them to the pure function above. An invalid/missing archive is
// treated as `PublicationObservationArchive.empty()` — zero records in
// every collection, and therefore a fixed, well-defined "empty evidence"
// fingerprint — never an error.
export function reconstructAchievementEvidenceFingerprint(archive) {
    const safeArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();
    return describeAchievementEvidenceFingerprint(
        safeArchive.bitcoinAnchorPublicationRecords,
        safeArchive.baseAnchorPublicationRecords,
        safeArchive.publicationReferenceRecords,
        safeArchive.publisherPublicationAssociationRecords
    );
}

// One collection's own canonical text: every genuine record's own
// `toJSON()` output, serialized, sorted lexicographically, and joined into
// one array literal — see this file's own header, "Canonicalization:
// sorted, never deduplicated." Malformed/absent `records`, or an entry
// that is not a genuine instance of `RecordClass`, is tolerated exactly
// like every other entry point in this codebase's achievement family: the
// offending entries are silently excluded, never thrown on.
function canonicalCollectionContent(records, RecordClass) {
    const list = Array.isArray(records) ? records : [];
    const serializedRecords = list
        .filter((record) => record instanceof RecordClass)
        .map((record) => JSON.stringify(record.toJSON()));
    serializedRecords.sort();
    return `[${serializedRecords.join(',')}]`;
}

function sha256Hex(text) {
    return bytesToHex(sha256(new TextEncoder().encode(text)));
}

// ---------------------------------------------------------------------
// SHA-256, implemented from first principles — deliberately duplicated
// from, not imported from, application/PublicationObservationArchiveFingerprint.js
// and anchoring/BitcoinAnchorSignedPsbtFinalizer.js. See this file's own
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
