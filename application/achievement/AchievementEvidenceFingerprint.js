import { PublicationObservationArchive } from '../publication/observationArchive/PublicationObservationArchive.js';
import { BitcoinAnchorPublicationRecord } from '../anchoring/bitcoin/BitcoinAnchorPublicationRecord.js';
import { BaseAnchorPublicationRecord } from '../anchoring/base/BaseAnchorPublicationRecord.js';
import { PublicationReferenceRecord } from '../publication/PublicationReferenceRecord.js';
import { PublisherPublicationAssociationRecord } from '../publisher/PublisherPublicationAssociationRecord.js';
import { sha256Hex } from '../../core/Sha256.js';

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
//     position (application/achievement/AchievementEvent.js,
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
// `application/publication/observationArchive/PublicationObservationArchiveFingerprint.js`'s own 0.8.84
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
// Sorting is not deduplication: `application/publication/PublicationReferenceRecord.js`'s
// and `application/publisher/PublisherPublicationAssociationRecord.js`'s own headers
// already establish that exact-duplicate relationship records are
// deliberately allowed to coexist within one archive ("NEVER
// DEDUPLICATED") — two structurally identical records sort adjacent to
// each other and BOTH remain in the canonical text, so a collection
// holding a legitimate duplicate fingerprints differently from the
// otherwise-identical collection holding only one copy. See this file's
// own "Section D — multiplicity" test for the concrete proof.
//
// EACH COLLECTION IS A SEPARATE, NAMED SLOT — NEVER ONE FLAT POOL OF
// RECORDS. `application/anchoring/bitcoin/BitcoinAnchorPublicationRecord.js`'s and
// `application/anchoring/base/BaseAnchorPublicationRecord.js`'s own headers already
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
// SYNCHRONOUS, PURE, DETERMINISTIC. SHA-256 comes from core/Sha256.js
// rather than `crypto.subtle.digest()`, which is Promise-only and has no
// honest use where a fingerprint is computed for display alongside every
// other synchronous `describeXxx()`/`reconstructXxx()` projection.
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
// word for word application/achievement/AchievementEvent.js's own `toChainEntries()`
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
// order, and the identical set, application/achievement/AchievementEvidenceExport.js's
// own `TOP_LEVEL_FIELDS` and application/achievement/AchievementEvidenceMerge.js's own
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
// archive-reading entry point, mirroring application/achievement/AchievementEvent.js's
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
