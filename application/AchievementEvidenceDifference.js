import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { BitcoinAnchorPublicationRecord } from './BitcoinAnchorPublicationRecord.js';
import { BaseAnchorPublicationRecord } from './BaseAnchorPublicationRecord.js';
import { PublicationReferenceRecord } from './PublicationReferenceRecord.js';
import { PublisherPublicationAssociationRecord } from './PublisherPublicationAssociationRecord.js';
import { describeAchievementEvidenceFingerprint } from './AchievementEvidenceFingerprint.js';

// 0.8.117 — Achievement Evidence Difference Projection.
//
// 0.8.116 gave two replicas a fast, cheap way to learn THAT their
// achievement evidence differs — compare two fingerprints. It deliberately
// never answered the question a replica actually has the moment that
// comparison comes back different:
//
//   Alice's archive                         Bob's archive
//        │  reconstructAchievementEvidenceFingerprint()   │
//        ▼                                                 ▼
//   { fingerprint: X }                       { fingerprint: Y }
//                    │                                 │
//                    └──────────── X !== Y ─────────────┘
//                              "something differs" —
//                              but WHAT?
//
// This file answers exactly that, over the identical four evidence
// collections 0.8.114 already named as "the achievement evidence" —
// `bitcoinAnchorPublicationRecords`, `baseAnchorPublicationRecords`,
// `publicationReferenceRecords`, `publisherPublicationAssociationRecords`
// — and nothing else. It builds on application/
// PublicationObservationArchiveDifference.js's own 0.8.87 shape (per
// collection: source-only facts, target-only facts, explicit counts) —
// reused as a NAMING AND RESULT-SHAPE convention, not as a second,
// competing comparison engine imported wholesale. That file's own
// position-by-position walk assumes the two archives being compared share
// one common, append-only history (0.8.86's "inspect the archive I already
// hold, at a later moment, against itself"). Two independent replicas'
// achievement evidence carries no such assumption — Alice's own
// `bitcoinAnchorPublicationRecords[0]` and Bob's own
// `bitcoinAnchorPublicationRecords[0]` are two entirely unrelated facts
// that merely happen to occupy the same array index — so this file
// compares by CONTENT, the identical multiset discipline 0.8.116's own
// fingerprint already established for this exact evidence, never by
// array position. See "Multiset difference, never a positional walk,"
// below.
//
//   fingerprint
//       │
//       ▼
//   fast indication ("different")
//       │
//       ▼
//   explicit evidence difference ("here is exactly what's missing, on
//                                  each side")
//
// THE CRUCIAL DISTINCTION: THE FINGERPRINT IS NEVER AUTHORITATIVE FOR
// THIS FILE'S OWN EQUALITY QUESTION. This is a DELIBERATE reversal of
// application/PublicationObservationArchiveDifference.js's own 0.8.87
// choice, made for a different reason than that file had. There, `same`
// is computed directly from the fingerprint comparison because a
// SHA-256 digest is cheaper to trust than re-walking ten collections, and
// that file already had a settled, authoritative whole-archive fingerprint
// to lean on (0.8.84). Here, this file's own `sameEvidence` is computed
// from the ACTUAL per-collection multiset comparison below — never from
// `sourceFingerprint === targetFingerprint` — precisely so the
// cryptographic fingerprint never quietly becomes this codebase's
// authentication or trust mechanism for evidence equality. A fingerprint
// stays exactly what 0.8.116's own header already declared it: an
// identity for an evidence SET, nothing more. `sourceFingerprint`/
// `targetFingerprint` are exposed on this file's own result purely for a
// caller's convenience (0.8.116, reused unchanged, never recomputed with a
// second hashing scheme) — and `tests/AchievementEvidenceDifference.test.js`'s
// own "fingerprint agrees with difference result" section demonstrates,
// rather than assumes, that the two independently-computed answers always
// agree: `sourceFingerprint === targetFingerprint` if and only if
// `sameEvidence` — because both are, by construction, two different ways
// of asking whether the same four multisets hold the same content.
//
// MULTISET DIFFERENCE, NEVER A POSITIONAL WALK, AND NEVER A SET
// DIFFERENCE EITHER. `[A, A, B]` compared against `[A, B]` reports exactly
// one `A` as source-only — the second `A` has no counterpart left once the
// first has been matched — never zero (a naive `Set`-based "is A present
// in target?" check) and never two (comparing without ever consuming a
// match). This is the identical restraint 0.8.116's own fingerprint
// already holds for the same evidence ("a multiset fingerprint, not a set
// fingerprint") and 0.8.115's own merge already holds for the same reason
// (`application/PublicationReferenceRecord.js`'s and `application/
// PublisherPublicationAssociationRecord.js`'s own "NEVER DEDUPLICATED"
// headers). See `extractUnmatched()` below for the concrete algorithm: for
// each collection, every one of `target`'s own records cancels out AT MOST
// ONE occurrence in `source` (matched by content, never merely "exists
// somewhere"), and whatever remains unmatched on either side is that
// side's own exclusive evidence.
//
// IDENTITY IS EXACT STRUCTURAL EQUALITY — THE IDENTICAL RULE 0.8.115'S OWN
// MERGE ALREADY ESTABLISHED, REUSED HERE RATHER THAN RE-DERIVED. Two
// records are "the same evidence" only when every field their own
// `toJSON()` output carries is identical — never a narrower key like
// `anchorId` or `txid` alone, which would silently treat two records this
// codebase's own record classes explicitly keep distinct (see
// `application/BitcoinAnchorPublicationRecord.js`'s own header, "never
// replaces a previous record for the same `anchorId`") as though they were
// one fact. A record differing in even one field — including `createdAt`
// — is genuinely distinct evidence, reported as exclusive to whichever
// side holds it, never silently matched away. See `canonicalRecordKey()`
// below — word for word the same function `application/
// AchievementEvidenceMerge.js`'s own `canonicalRecordKey()` already
// computes, deliberately duplicated here rather than imported, in keeping
// with this codebase's own "small, self-contained helper, duplicated
// rather than coupling two unrelated files" discipline (see e.g.
// `application/AchievementEvidenceFingerprint.js`'s own SHA-256, versus
// `application/PublicationObservationArchiveFingerprint.js`'s own).
//
// EACH COLLECTION IS A SEPARATE, NAMED SLOT — THE IDENTICAL STRUCTURAL
// SEPARATION 0.8.116'S OWN FINGERPRINT ALREADY HOLDS, FOR THE IDENTICAL
// REASON. A Bitcoin publication and a Base publication are never the same
// identity even sharing a `contentHash` and an identical-looking chain
// reference (`application/BitcoinAnchorPublicationRecord.js`'s and
// `application/BaseAnchorPublicationRecord.js`'s own headers). This file
// diffs the two collections entirely independently, under two fixed,
// differently-named slots — a Bitcoin-only record can never appear as
// "missing" from the Base collection's own difference, or vice versa.
//
// THE RESULT NAMES EVIDENCE, NEVER GIVES ORDERS. `sourceOnly`/`targetOnly`
// are the plain, canonical `toJSON()` shape each record class already
// produces for persistence, export, and merge — reused a fourth time,
// never reinvented — so a caller can hand either array straight to a
// future evidence-exchange payload (0.8.118) without any further
// transformation. This file computes no "should merge," no "send this to
// the other replica," and performs no merge, export, or import of its own
// — see "Deliberately excluded," below.
//
// AN EVIDENCE DIFFERENCE DESCRIBES ABSENCE, NEVER TRUTH — THE FLAGSHIP
// INVARIANT EVERY COMPARISON FILE IN THIS CODEBASE ALREADY HOLDS, RESTATED
// HERE ONE LAYER NARROWER. An evidence difference describes what records
// are absent from one replica relative to another; it does NOT establish
// that either replica is truthful, authentic, authoritative, or complete.
// Someone can still manufacture evidence — a fabricated
// `BitcoinAnchorPublicationRecord` reporting a `txid` that was never
// broadcast diffs exactly like a genuine one, because this file (like
// 0.8.116's own fingerprint, and 0.8.115's own merge before it) has no
// concept of "verified" to begin with. See docs/Principles.md, "The UI
// Displays Observations; It Does Not Turn Them Into A Verdict (0.8.57),"
// held here once more.
//
// `describeAchievementEvidenceDifference()`/`reconstructAchievementEvidenceDifference()`
// — THE IDENTICAL SPLIT EVERY OTHER FILE IN THE ACHIEVEMENT FAMILY ALREADY
// HOLDS. `describeAchievementEvidenceDifference()` is the pure
// computation: it receives plain, already-extracted evidence arrays for
// BOTH sides (source, then target, each in the identical fixed field order
// 0.8.116's own `EVIDENCE_COLLECTION_SPECS` already uses) and returns a
// difference — the identical shape `describeAchievementEvidenceFingerprint(...)`
// already holds for one side alone, doubled. `reconstructAchievementEvidenceDifference()`
// is the ONE, thin, archive-reading entry point: an invalid/missing
// archive on either side degrades to `PublicationObservationArchive.empty()`
// — never an error — exactly like `reconstructAchievementEvidenceFingerprint()`
// already does for a single archive. Neither function ever throws,
// mutates either input, or performs any I/O.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO CAPABILITY OF
// ANY KIND. Reads no clock. Calling either function twice with
// byte-identical arguments returns a byte-identical result. Never mutates
// either archive, or any record either archive holds.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No merge, export, or import
// of any kind — `sourceOnly`/`targetOnly` are read-only facts about the
// difference, and folding either side's exclusive evidence into the other
// archive is `application/AchievementEvidenceMerge.js`'s own, already-built
// job, one call away, entirely untouched by this file. No achievement
// event, badge, statistic, rank, or leaderboard vocabulary of any kind —
// this file imports none of `application/AchievementEvent.js`,
// `PublisherAchievementStatisticsView.js`, `PublisherRankingPolicy.js`, or
// `PublisherLeaderboardView.js`. No trust, authenticity, freshness, or
// "which replica is correct" determination — see "An evidence difference
// describes absence, never truth," above. No signing, no peer discovery,
// no transport mechanism, no automatic comparison of any kind — this
// function runs only when a caller explicitly calls it. That full protocol
// — "I have fingerprint X. You differ. Here is the evidence I lack. Merge
// it. Recompute." — is 0.8.118's own, separately sized question.
export const AchievementEvidenceDifferenceCollectionOrder = Object.freeze([
    'bitcoinAnchorPublicationRecords',
    'baseAnchorPublicationRecords',
    'publicationReferenceRecords',
    'publisherPublicationAssociationRecords'
]);

// The four evidence collections this module diffs, paired with the record
// class that makes an array entry genuine — the identical set, and the
// identical fixed order, `application/AchievementEvidenceFingerprint.js`'s
// own `EVIDENCE_COLLECTION_SPECS` already uses (deliberately duplicated
// here rather than imported — see this file's own header).
const EVIDENCE_COLLECTION_SPECS = Object.freeze([
    Object.freeze({ key: 'bitcoinAnchorPublicationRecords', RecordClass: BitcoinAnchorPublicationRecord }),
    Object.freeze({ key: 'baseAnchorPublicationRecords', RecordClass: BaseAnchorPublicationRecord }),
    Object.freeze({ key: 'publicationReferenceRecords', RecordClass: PublicationReferenceRecord }),
    Object.freeze({ key: 'publisherPublicationAssociationRecords', RecordClass: PublisherPublicationAssociationRecord })
]);

// The pure computation. Receives the same four evidence collections
// `describeAchievementEvidenceFingerprint()` already treats as one
// replica's own achievement evidence — plain arrays, tolerated exactly
// like every other `describeXxx()` in this file's own family (a
// non-array collection is treated as empty; an entry that is not a
// genuine instance of the expected record class is silently excluded) —
// for BOTH a `source` side and a `target` side. Returns a frozen:
//
//   {
//       sourceFingerprint: <64-char lowercase hex, 0.8.116, reused unchanged>,
//       targetFingerprint: <64-char lowercase hex, 0.8.116, reused unchanged>,
//       sameEvidence: <boolean — computed from the actual comparison below,
//                       never from sourceFingerprint === targetFingerprint;
//                       see this file's own header>,
//       bitcoinAnchorPublicationRecords: {
//           sourceCount, targetCount, sourceOnlyCount, targetOnlyCount,
//           sourceOnly: [ <toJSON() shape>, ... ],
//           targetOnly: [ <toJSON() shape>, ... ]
//       },
//       baseAnchorPublicationRecords:              { ...identical shape... },
//       publicationReferenceRecords:                { ...identical shape... },
//       publisherPublicationAssociationRecords:     { ...identical shape... },
//       sourceOnlyCount: <sum of all four collections' own sourceOnlyCount>,
//       targetOnlyCount: <sum of all four collections' own targetOnlyCount>
//   }
//
// Never throws. Never mutates any input. Reads no clock, no storage, no
// network. Calling this twice with equivalent evidence — even reordered,
// even reached by two entirely independent code paths — returns a
// byte-identical result.
export function describeAchievementEvidenceDifference(
    sourceBitcoinAnchorPublicationRecords = [],
    sourceBaseAnchorPublicationRecords = [],
    sourcePublicationReferenceRecords = [],
    sourcePublisherPublicationAssociationRecords = [],
    targetBitcoinAnchorPublicationRecords = [],
    targetBaseAnchorPublicationRecords = [],
    targetPublicationReferenceRecords = [],
    targetPublisherPublicationAssociationRecords = []
) {
    const sourceByKey = {
        bitcoinAnchorPublicationRecords: sourceBitcoinAnchorPublicationRecords,
        baseAnchorPublicationRecords: sourceBaseAnchorPublicationRecords,
        publicationReferenceRecords: sourcePublicationReferenceRecords,
        publisherPublicationAssociationRecords: sourcePublisherPublicationAssociationRecords
    };
    const targetByKey = {
        bitcoinAnchorPublicationRecords: targetBitcoinAnchorPublicationRecords,
        baseAnchorPublicationRecords: targetBaseAnchorPublicationRecords,
        publicationReferenceRecords: targetPublicationReferenceRecords,
        publisherPublicationAssociationRecords: targetPublisherPublicationAssociationRecords
    };

    const collections = {};
    let sourceOnlyCount = 0;
    let targetOnlyCount = 0;
    for (const { key, RecordClass } of EVIDENCE_COLLECTION_SPECS) {
        const collection = diffEvidenceCollection(sourceByKey[key], targetByKey[key], RecordClass);
        collections[key] = collection;
        sourceOnlyCount += collection.sourceOnlyCount;
        targetOnlyCount += collection.targetOnlyCount;
    }

    // Reused unchanged from 0.8.116 — never a second, competing hashing
    // scheme. See this file's own header, "The crucial distinction."
    const sourceFingerprint = describeAchievementEvidenceFingerprint(
        sourceBitcoinAnchorPublicationRecords, sourceBaseAnchorPublicationRecords,
        sourcePublicationReferenceRecords, sourcePublisherPublicationAssociationRecords
    ).fingerprint;
    const targetFingerprint = describeAchievementEvidenceFingerprint(
        targetBitcoinAnchorPublicationRecords, targetBaseAnchorPublicationRecords,
        targetPublicationReferenceRecords, targetPublisherPublicationAssociationRecords
    ).fingerprint;

    return Object.freeze({
        sourceFingerprint,
        targetFingerprint,

        // Computed from the actual per-collection comparison — NEVER from
        // `sourceFingerprint === targetFingerprint`. See this file's own
        // header, "The crucial distinction."
        sameEvidence: sourceOnlyCount === 0 && targetOnlyCount === 0,

        ...collections,

        sourceOnlyCount,
        targetOnlyCount
    });
}

// reconstructAchievementEvidenceDifference() — the ONE, thin,
// archive-reading entry point, mirroring `application/
// AchievementEvidenceFingerprint.js`'s own `reconstructAchievementEvidenceFingerprint()`
// exactly, doubled over two archives. Pulls each replica's own four
// evidence collections straight off its own archive, unchanged, and hands
// them to the pure function above. An invalid/missing archive on either
// side is treated as `PublicationObservationArchive.empty()` — never an
// error.
export function reconstructAchievementEvidenceDifference(sourceArchive, targetArchive) {
    const safeSource = sourceArchive instanceof PublicationObservationArchive ? sourceArchive : PublicationObservationArchive.empty();
    const safeTarget = targetArchive instanceof PublicationObservationArchive ? targetArchive : PublicationObservationArchive.empty();
    return describeAchievementEvidenceDifference(
        safeSource.bitcoinAnchorPublicationRecords, safeSource.baseAnchorPublicationRecords,
        safeSource.publicationReferenceRecords, safeSource.publisherPublicationAssociationRecords,
        safeTarget.bitcoinAnchorPublicationRecords, safeTarget.baseAnchorPublicationRecords,
        safeTarget.publicationReferenceRecords, safeTarget.publisherPublicationAssociationRecords
    );
}

// One collection's own multiset difference — see this file's own header,
// "Multiset difference, never a positional walk." Malformed/absent
// `sourceRecords`/`targetRecords`, or an entry that is not a genuine
// instance of `RecordClass`, is tolerated exactly like every other entry
// point in this codebase's achievement family: the offending entries are
// silently excluded, never thrown on.
function diffEvidenceCollection(sourceRecords, targetRecords, RecordClass) {
    const source = (Array.isArray(sourceRecords) ? sourceRecords : []).filter((record) => record instanceof RecordClass);
    const target = (Array.isArray(targetRecords) ? targetRecords : []).filter((record) => record instanceof RecordClass);

    const sourceOnly = extractUnmatched(source, target);
    const targetOnly = extractUnmatched(target, source);

    return Object.freeze({
        sourceCount: source.length,
        targetCount: target.length,
        sourceOnlyCount: sourceOnly.length,
        targetOnlyCount: targetOnly.length,
        sourceOnly: Object.freeze(sourceOnly),
        targetOnly: Object.freeze(targetOnly)
    });
}

// The multiset (bag) subtraction `from - against`, preserving
// multiplicity: `[A, A, B]` minus `[A, B]` leaves exactly one `A`, never
// zero. Each record in `against` cancels out AT MOST ONE occurrence in
// `from`, matched by exact structural equality (`canonicalRecordKey()`
// below) — never by a narrower per-kind key. Returns the unmatched
// records' own canonical `toJSON()` shape, each frozen, in `from`'s own
// original order.
function extractUnmatched(from, against) {
    const remaining = new Map();
    for (const record of against) {
        const key = canonicalRecordKey(record);
        remaining.set(key, (remaining.get(key) || 0) + 1);
    }

    const unmatched = [];
    for (const record of from) {
        const key = canonicalRecordKey(record);
        const count = remaining.get(key) || 0;
        if (count > 0) {
            remaining.set(key, count - 1);
        } else {
            unmatched.push(Object.freeze(record.toJSON()));
        }
    }
    return unmatched;
}

// Exact structural equality of a record's own canonical `toJSON()` output
// — word for word `application/AchievementEvidenceMerge.js`'s own
// `canonicalRecordKey()`, deliberately duplicated rather than imported.
// See this file's own header, "Identity is exact structural equality."
function canonicalRecordKey(record) {
    return JSON.stringify(record.toJSON());
}
