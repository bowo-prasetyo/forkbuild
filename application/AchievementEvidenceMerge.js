import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { PublicationObservationArchiveProvenanceOrigin } from './PublicationObservationArchiveProvenance.js';
import {
    AchievementEvidenceImportOutcome,
    importAchievementEvidence
} from './AchievementEvidenceExport.js';

// 0.8.115 — Explicit Achievement Evidence Merge.
//
// 0.8.114 gave a second replica exactly one way to acquire evidence it
// never held: `importAchievementEvidence()`, which builds an ISOLATED,
// standalone `PublicationObservationArchive` out of a payload — and
// explicitly, deliberately, never merges that evidence into an archive the
// caller already holds. That restraint was correct for what 0.8.114 was
// proving (can evidence be portable at ALL) — but it left the actually
// decentralized shape of this problem unbuilt:
//
//   Alice's evidence ──┐
//                      ├──► Bob's EXISTING archive, holding Bob's own,
//   Carol's evidence ──┤    already-durable facts
//                      │
//   Bob's own evidence ┘
//
// `importAchievementEvidence()` cannot answer this — it only ever
// constructs a bare replica holding nothing but the payload it was given.
// This file is the missing primitive: incorporating portable evidence INTO
// an archive that already has its own history, without destroying any of
// it.
//
//   import  — replacement-style: payload  →  a brand new, isolated archive
//   merge   — additive-style:    payload  +  an existing archive  →  a
//                                 richer archive holding the union of both
//
// Both stay exactly as narrow as their own name promises. Neither is a
// special case of the other, and this file changes nothing about
// `importAchievementEvidence()` — it is reused here UNCHANGED, one layer
// down (see below).
//
// MERGE FACTS, NEVER CONCLUSIONS — THE IDENTICAL RESTRAINT 0.8.114'S OWN
// HEADER ALREADY HOLDS, EXTENDED FROM "IMPORT" TO "MERGE." `mergeAchievementEvidence()`
// accepts only the same payload shape `importAchievementEvidence()`
// already accepts — the same four evidence collections
// (`bitcoinAnchorPublicationRecords`, `baseAnchorPublicationRecords`,
// `publicationReferenceRecords`, `publisherPublicationAssociationRecords`),
// validated to the identical strictness, by literally calling that
// function rather than a second, independently-drifting copy of its own
// validation. There is no vocabulary in this payload shape for an
// achievement event, a badge, a statistic, a rank, or a leaderboard
// position — merging evidence can change what a later, SEPARATE call to
// `reconstructAchievementEvents()`/`reconstructPublisherAchievementStatistics()`/
// `reconstructPublisherRanking()`/`reconstructPublisherLeaderboard()`
// concludes, but it can never hand a conclusion to either replica
// directly. See docs/Principles.md, "Evidence May Be Merged; Conclusions
// Must Be Recomputed (0.8.115)."
//
// MERGE IS BORING, ON PURPOSE. `mergeAchievementEvidence()` validates the
// incoming payload, folds newly-seen records into the archive it was
// given, and returns a genuine `PublicationObservationArchive` — nothing
// more. It never imports, calls, or references `application/
// AchievementEvent.js`, `application/PublisherAchievementStatisticsView.js`,
// `application/PublisherRankingPolicy.js`, or `application/
// PublisherLeaderboardView.js` — grep this file and it is simply not
// there. Recomputing achievements, statistics, ranking, or the leaderboard
// over the merged archive is the caller's own, separate, explicit next
// step:
//
//   mergeAchievementEvidence()
//        │
//        ▼
//   reconstructAchievementEvents()                (0.8.102/0.8.106, UNCHANGED)
//        │
//        ▼
//   reconstructPublisherAchievementStatistics()    (0.8.111, UNCHANGED)
//        │
//        ▼
//   reconstructPublisherRanking()                  (0.8.112, UNCHANGED)
//        │
//        ▼
//   reconstructPublisherLeaderboard()               (0.8.113, UNCHANGED)
//
// DEDUPLICATION IS AN EXPLICIT, DOCUMENTED IDENTITY — NEVER AN ACCIDENTAL
// CONSEQUENCE OF `concat()` OR A `Set`. Two replicas that already share
// some evidence (Bob re-merges Alice's export a second time; Alice and Bob
// each independently recorded the identical publication identity record)
// must not have that shared evidence silently DOUBLE in Bob's own archive
// merely because it arrived twice. But this codebase has *also*
// deliberately allowed exact-duplicate relationship records to coexist
// within a single archive before now — see `application/
// PublicationReferenceRecord.js`'s and `application/
// PublisherPublicationAssociationRecord.js`'s own headers, "NEVER
// DEDUPLICATED" — so this file draws the identity line at the ONLY place
// that does not contradict either restraint: a record is treated as
// "the same evidence already held" by MERGE only when it is identical in
// EVERY field it carries — never a narrower key like `anchorId` or
// `txid` alone, which would silently collapse two records this codebase's
// own record classes explicitly forbid collapsing (see e.g. `application/
// BitcoinAnchorPublicationRecord.js`'s own header, "Never deduplicates,
// never merges by `contentHash` or `txid`... never replaces a previous
// record for the same `anchorId`"). Two records differing in even one
// field — including `createdAt` — are always genuinely distinct evidence
// and are both kept.
//
//   Evidence                Merge identity (every field the record itself carries)
//   ───────────────────     ──────────────────────────────────────────────────────
//   Bitcoin publication      anchorId + contentHash + txid + network + createdAt
//   Base publication         contentHash + txid + network + createdAt
//   Reference                sourcePublicationIdentity + referencedPublicationIdentity + createdAt
//   Publisher association    publisherIdentity + publicationIdentity + createdAt
//
// Concretely, this is exact structural equality of each record's own
// `toJSON()` output (`canonicalRecordKey()` below) — the same canonical
// shape every record class already produces for persistence and export,
// reused rather than reinvented a third time. This is why an ordinary
// live re-assertion (a person explicitly associating the same publisher
// with the same publication a second time, minting a fresh `createdAt`)
// is untouched by this restraint: it is a genuinely new record the moment
// its own `createdAt` differs, exactly as `application/
// PublisherPublicationAssociationRecord.js`'s own header already
// promises — merge does not — and could not — tell that apart from any
// other distinct fact.
//
// THIS MAKES MERGE IDEMPOTENT, COMMUTATIVE ON WHAT IT ADDS, AND A NO-OP
// WHEN THERE IS NOTHING NEW. `archive.merge(evidence); archive.merge(evidence)`
// (called twice, with the byte-identical payload) leaves the archive
// after the second call holding exactly what it held after the first —
// every record the second call would have added already exists, so
// nothing is appended, and `mergeAchievementEvidence()` returns the exact
// same archive object it was given (`archive === result.archive`), not
// merely an equal one. See tests/AchievementEvidenceMerge.test.js's own
// flagship for the concrete proof.
//
// PROVENANCE FOLLOWS 0.8.114'S OWN RULE EXACTLY, ONE LAYER OVER A
// NON-EMPTY ARCHIVE. Every record this archive already held keeps
// whatever provenance it already had — merge never rewrites an existing
// fact's own `LOCAL`/`IMPORTED` tag. Every record newly incorporated by
// THIS merge call is stamped `IMPORTED`, unconditionally — regardless of
// whether it was `LOCAL` or `IMPORTED` in the archive it was merged FROM
// (see `application/AchievementEvidenceExport.js`'s own header:
// provenance describes an archive's own ingestion history, and is never
// exported in the first place — `importAchievementEvidence()`'s own
// result already carries no trace of Alice's own provenance for this
// file to preserve or discard). This is reached by reusing `application/
// PublicationObservationArchive.js`'s own, pre-existing `appendXxx(record,
// origin)` methods — EVERY ONE of which already accepted an optional
// trailing `origin` argument since 0.8.83 for exactly this purpose — with
// `origin` explicitly set to `IMPORTED`, never by constructing a second,
// competing archive-assembly path of this file's own.
//
// MERGE REUSES THE ONE DURABLE WRITE PATH EACH RECORD KIND ALREADY HAS —
// NEVER A SECOND ONE. Every newly-incorporated record is folded in by
// calling `archive.appendBitcoinAnchorPublicationRecord()` /
// `appendBaseAnchorPublicationRecord()` / `appendPublicationReferenceRecord()`
// / `appendPublisherPublicationAssociationRecord()` — the SAME four
// methods every other durable write in this codebase already goes
// through, each already documented as "the ONE durable write path" for
// its own record kind. This file invents no new archive field, no new
// collection, and no bypass of `PublicationObservationArchive`'s own
// append-only, immutable-instance discipline: like every `appendXxx()`
// call, folding in evidence returns a BRAND NEW archive, and the archive
// this function was given is never mutated.
//
// MALFORMED INPUT IS `INVALID_EVIDENCE`, REUSED VERBATIM FROM 0.8.114 —
// NEVER A SECOND VALIDATION PATH. `mergeAchievementEvidence()` and
// `describeAchievementEvidenceMerge()` both validate `payload` by calling
// `importAchievementEvidence()` itself and inspecting its own outcome —
// never a second, independently-maintained copy of "what a genuine
// evidence payload looks like." A payload that `importAchievementEvidence()`
// itself would reject is `INVALID_EVIDENCE` here too, for the identical
// reason, and this file's own `archive` argument is never touched when
// that happens.
//
// `describeAchievementEvidenceMerge()` IS A REVIEW, NEVER A RECONCILIATION
// — THE IDENTICAL RESTRAINT `application/
// PublicationObservationArchiveReplacementReview.js`'s own header already
// holds for a whole-archive replacement decision, held here once more for
// a narrower, evidence-only one. It answers "what would merging this
// payload change?" — per-collection existing/incoming/new/duplicate
// counts — and computes nothing that recommends, scores, or validates
// whether merging SHOULD happen. Calling it never merges anything, never
// mutates `archive`, and its own `outcome` is exactly the `outcome`
// `mergeAchievementEvidence()` itself would return for the identical
// arguments — read, not guessed at separately.
//
// SYNCHRONOUS, PURE, NO STORAGE, NO NETWORK, NO CAPABILITY OF ANY KIND.
// Neither function reads a clock, touches storage, or performs any I/O.
// Calling either twice with byte-identical arguments returns a
// byte-identical result.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No conflict resolution
// beyond identity-based deduplication — there is no such thing as two
// evidence records "disagreeing" here, because every field is part of
// each record's own identity; two records that differ at all are simply
// two distinct facts, both kept, exactly as `application/
// PublicationObservationArchive.js` already treats them everywhere else.
// No automatic recomputation of achievement events, statistics, ranking,
// or the leaderboard — see "Merge is boring, on purpose," above. No
// durable "an evidence merge happened" event — mirroring 0.8.114's own
// identical exclusion of a durable "evidence import happened" event, for
// the identical reason: this payload versions itself independently of
// `PublicationObservationArchive.js`'s own `archiveImportEvents`
// vocabulary, which describes a whole-archive import only. No merge UI.
// No federated exchange, peer discovery, or transport mechanism — a
// caller still moves `payload` by whatever means it already has.
export const AchievementEvidenceMergeOutcome = Object.freeze({
    MERGED: 'merged',
    INVALID_EVIDENCE: 'invalid-evidence'
});

// `archive` must be a real `PublicationObservationArchive` instance —
// mirrors `exportAchievementEvidence()`'s/`describePublicationObservationArchiveReplacementReview()`'s
// own identical, duck-typing-free contract. `payload` may be either the
// parsed JSON value itself or raw text, exactly like
// `importAchievementEvidence()`'s own `payload` argument (this function
// hands it there unchanged). Returns a frozen `{ outcome, archive }`:
//
//   MERGED           — `archive` is a NEW `PublicationObservationArchive`
//                       holding every record the caller's own archive
//                       already held, UNCHANGED, plus every record
//                       `payload` named that was not already present
//                       under this file's own identity rule above, each
//                       newly-incorporated record stamped `IMPORTED`. If
//                       `payload` named nothing new, `archive` is the
//                       EXACT SAME instance the caller passed in.
//   INVALID_EVIDENCE — `archive` is `null`. `payload` failed
//                       `importAchievementEvidence()`'s own validation —
//                       see that function's own header for the complete
//                       list of what that covers.
//
// Never throws for a well-formed `archive` and any `payload`. Never
// mutates `archive`. Never merges anything into `archive` beyond these
// four evidence collections — every other collection `archive` already
// holds (IPFS records, observations, `archiveImportEvents`, and so on)
// passes through completely untouched, because every `appendXxx()` call
// this function makes preserves every field it did not itself touch.
export function mergeAchievementEvidence(archive, payload) {
    const plan = planAchievementEvidenceMerge(archive, payload);
    if (!plan.valid) {
        return Object.freeze({ outcome: AchievementEvidenceMergeOutcome.INVALID_EVIDENCE, archive: null });
    }

    let merged = archive;
    for (const record of plan.bitcoinAnchorPublicationRecords.newRecords) {
        merged = merged.appendBitcoinAnchorPublicationRecord(record, PublicationObservationArchiveProvenanceOrigin.IMPORTED);
    }
    for (const record of plan.baseAnchorPublicationRecords.newRecords) {
        merged = merged.appendBaseAnchorPublicationRecord(record, PublicationObservationArchiveProvenanceOrigin.IMPORTED);
    }
    for (const record of plan.publicationReferenceRecords.newRecords) {
        merged = merged.appendPublicationReferenceRecord(record, PublicationObservationArchiveProvenanceOrigin.IMPORTED);
    }
    for (const record of plan.publisherPublicationAssociationRecords.newRecords) {
        merged = merged.appendPublisherPublicationAssociationRecord(record, PublicationObservationArchiveProvenanceOrigin.IMPORTED);
    }

    return Object.freeze({ outcome: AchievementEvidenceMergeOutcome.MERGED, archive: merged });
}

// A pure preview of what `mergeAchievementEvidence(archive, payload)`
// would do, without doing it — see this file's own header, "A review,
// never a reconciliation." `outcome` is exactly the outcome that call
// would return. When `INVALID_EVIDENCE`, every count field is omitted —
// there is nothing this function can honestly report about a payload it
// could not validate. When `MERGED`, each of the four evidence
// collections gets its own `{ existingCount, incomingCount, newCount,
// duplicateCount }` — `existingCount` is how many `archive` already
// holds, `incomingCount` is how many `payload` named, `newCount` is how
// many of those are not already present under this file's own identity
// rule (and so would actually be appended), and `duplicateCount` is
// `incomingCount - newCount`. `totalExistingCount`/`totalIncomingCount`/
// `totalNewCount`/`totalDuplicateCount` sum those four across all four
// collections. No field here recommends, scores, or judges whether
// merging should happen.
export function describeAchievementEvidenceMerge(archive, payload) {
    const plan = planAchievementEvidenceMerge(archive, payload);
    if (!plan.valid) {
        return Object.freeze({ outcome: AchievementEvidenceMergeOutcome.INVALID_EVIDENCE });
    }

    const collectionKeys = [
        'bitcoinAnchorPublicationRecords',
        'baseAnchorPublicationRecords',
        'publicationReferenceRecords',
        'publisherPublicationAssociationRecords'
    ];

    const perCollection = {};
    let totalExistingCount = 0;
    let totalIncomingCount = 0;
    let totalNewCount = 0;
    let totalDuplicateCount = 0;
    for (const key of collectionKeys) {
        const { existingCount, incomingCount, newCount, duplicateCount } = plan[key];
        perCollection[key] = Object.freeze({ existingCount, incomingCount, newCount, duplicateCount });
        totalExistingCount += existingCount;
        totalIncomingCount += incomingCount;
        totalNewCount += newCount;
        totalDuplicateCount += duplicateCount;
    }

    return Object.freeze({
        outcome: AchievementEvidenceMergeOutcome.MERGED,
        ...perCollection,
        totalExistingCount,
        totalIncomingCount,
        totalNewCount,
        totalDuplicateCount
    });
}

// Shared core behind both public functions — validates `payload` by
// reusing `importAchievementEvidence()` UNCHANGED (see this file's own
// header, "Malformed input is INVALID_EVIDENCE, reused verbatim"), then
// computes, per collection, exactly which of the incoming records are not
// already present in `archive` under this file's own identity rule.
// Throws for a non-`PublicationObservationArchive` `archive`, mirroring
// `exportAchievementEvidence()`'s own identical contract; never throws for
// any `payload`.
function planAchievementEvidenceMerge(archive, payload) {
    if (!(archive instanceof PublicationObservationArchive)) {
        throw new Error('requires a PublicationObservationArchive as archive');
    }

    const importResult = importAchievementEvidence(payload);
    if (importResult.outcome !== AchievementEvidenceImportOutcome.IMPORTED) {
        return { valid: false };
    }
    const incoming = importResult.archive;

    return {
        valid: true,
        bitcoinAnchorPublicationRecords: planCollectionMerge(archive.bitcoinAnchorPublicationRecords, incoming.bitcoinAnchorPublicationRecords),
        baseAnchorPublicationRecords: planCollectionMerge(archive.baseAnchorPublicationRecords, incoming.baseAnchorPublicationRecords),
        publicationReferenceRecords: planCollectionMerge(archive.publicationReferenceRecords, incoming.publicationReferenceRecords),
        publisherPublicationAssociationRecords: planCollectionMerge(archive.publisherPublicationAssociationRecords, incoming.publisherPublicationAssociationRecords)
    };
}

// One collection's own merge plan — `existingRecords`/`incomingRecords`
// are read-only arrays of the SAME record class; two records are "the
// same evidence" only when their own `toJSON()` output is structurally
// identical (`canonicalRecordKey()` below) — see this file's own header
// table for why this, and not any narrower per-kind key, is the one
// identity rule used uniformly across all four collections. A record
// repeated more than once WITHIN `incomingRecords` itself collapses to a
// single addition too — `payload` cannot inflate `archive` by naming the
// identical fact twice in one call, any more than calling this function
// twice can.
function planCollectionMerge(existingRecords, incomingRecords) {
    const seenKeys = new Set(existingRecords.map(canonicalRecordKey));
    const newRecords = [];
    let duplicateCount = 0;
    for (const record of incomingRecords) {
        const key = canonicalRecordKey(record);
        if (seenKeys.has(key)) {
            duplicateCount += 1;
            continue;
        }
        seenKeys.add(key);
        newRecords.push(record);
    }
    return {
        existingCount: existingRecords.length,
        incomingCount: incomingRecords.length,
        newCount: newRecords.length,
        duplicateCount,
        newRecords
    };
}

function canonicalRecordKey(record) {
    return JSON.stringify(record.toJSON());
}
