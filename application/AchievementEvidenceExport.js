import {
    PublicationObservationArchive,
    validateBitcoinAnchorPublicationRecord,
    validateBaseAnchorPublicationRecord,
    validatePublicationReferenceRecord,
    validatePublisherPublicationAssociationRecord,
    validateArray
} from './PublicationObservationArchive.js';
import { PublicationObservationArchiveProvenanceOrigin } from './PublicationObservationArchiveProvenance.js';
import { BitcoinAnchorPublicationRecord } from './BitcoinAnchorPublicationRecord.js';
import { BaseAnchorPublicationRecord } from './BaseAnchorPublicationRecord.js';
import { PublicationReferenceRecord } from './PublicationReferenceRecord.js';
import { PublisherPublicationAssociationRecord } from './PublisherPublicationAssociationRecord.js';

const SCHEMA_VERSION = 1;

// 0.8.114 — Portable Achievement & Leaderboard Evidence Export.
//
// Every layer this codebase has built since 0.8.102 forms one strict
// pipeline, each stage computed FRESH from the stage below it, never
// persisted on its own:
//
//   Durable evidence   (application/PublicationObservationArchive.js)
//        │
//        ▼
//   Achievement events        (application/AchievementEvent.js,        0.8.102/0.8.106)
//        │
//        ▼
//   Achievement badges        (application/AchievementBadgeView.js,    0.8.103)
//        │
//        ▼
//   Publisher statistics      (application/PublisherAchievementStatisticsView.js, 0.8.111)
//        │
//        ▼
//   Ranking policy            (application/PublisherRankingPolicy.js,  0.8.112)
//        │
//        ▼
//   Leaderboard                (application/PublisherLeaderboardView.js, 0.8.113)
//
// Until this milestone, that entire pipeline only ever ran over ONE
// replica's own archive. This file asks the question that pipeline was
// always implicitly making possible: can a SECOND replica, given only the
// first replica's own durable EVIDENCE — never its computed conclusions —
// independently walk the identical pipeline and arrive at the identical
// achievements, statistics, ranking, and leaderboard?
//
//   Alice's replica                       Bob's replica
//
//   Evidence                              (the SAME evidence,
//      │  exportAchievementEvidence()      transported as plain JSON)
//      ▼                                        │
//   a JSON payload  ────────────────────────────▶  importAchievementEvidence()
//                                                        │
//                                                        ▼
//                                                  Evidence
//                                                        │
//                                                        ▼  (UNCHANGED —
//                                                  Achievement events    application/
//                                                        │               AchievementEvent.js,
//                                                        ▼               PublisherAchievementStatisticsView.js,
//                                                  Statistics            PublisherRankingPolicy.js,
//                                                        │               PublisherLeaderboardView.js —
//                                                        ▼               every one of them, verbatim)
//                                                  Ranking
//                                                        │
//                                                        ▼
//                                                  Leaderboard
//
// If Bob's own, independently recomputed leaderboard is byte-identical to
// Alice's, the result is independently reproducible — Bob never had to
// trust Alice's own arithmetic, only the durable facts she handed him.
// See tests/AchievementEvidenceExport.test.js's own FLAGSHIP for the
// concrete proof.
//
// WE EXPORT EVIDENCE, NEVER CONCLUSIONS — THIS IS THE ONE RULE THE WHOLE
// FILE EXISTS TO ENFORCE. `exportAchievementEvidence()`'s result carries
// NOTHING resembling an achievement event, a badge, a statistic, a rank,
// or a leaderboard position — no `achievementKind`, no `badgeCount`, no
// `rank`, no `score`, no `points`, no `leaderboard`. Every one of those is
// a DERIVED fact, reconstructed fresh by whichever replica holds the
// evidence — this file is not a second, competing place that computation
// could happen, and it is not a shortcut around it. A malicious or
// mistaken exporter who hand-edits a payload to add `"rank": 1` gets that
// field silently discarded: `importAchievementEvidence()` validates the
// payload against an EXACT, closed field list (see `TOP_LEVEL_FIELDS`
// below) and rejects anything carrying an extra key at all, exactly like
// application/PublicationObservationArchive.js's own `fromJSON()` already
// does one layer down — see this file's own "Section — no conclusion
// vocabulary anywhere" test for the concrete proof that no such field can
// even round-trip.
//
// THE MINIMUM DURABLE SOURCE COLLECTIONS NECESSARY, AND NOT ONE MORE.
// `application/PublicationObservationArchive.js` holds TEN factual
// collections. This file exports exactly FOUR of them:
//
//   bitcoinAnchorPublicationRecords          (0.8.80)
//   baseAnchorPublicationRecords              (0.8.99)
//   publicationReferenceRecords               (0.8.104)
//   publisherPublicationAssociationRecords    (0.8.108)
//
// This is not an arbitrary trim — it is the EXACT set the achievement
// pipeline actually reads. `application/AchievementEvent.js`'s own
// `reconstructAchievementEvents()` reads only the first three, verbatim,
// off the archive it is given; `application/PublisherAssociationView.js`'s
// own `reconstructDistinctPublisherIdentifiers()` reads only the fourth.
// Every later stage — badges, statistics, ranking, the leaderboard —
// composes those two functions and nothing else. `application/
// PublicationObservationArchive.js`'s other six collections —
// `ipfsPublicationRecords`, every observation-by-key collection
// (`ipfsContentVerificationObservationsByRecordIndex`,
// `bitcoinConfirmationObservationsByAnchorId`,
// `bitcoinContentProofObservationsByAnchorId`,
// `baseTransactionInclusionObservationsByTransactionHash`),
// `bitcoinBroadcastRecords`, and `archiveImportEvents` — feed NOTHING the
// achievement pipeline reads; grep this codebase's own `application/`
// directory for any achievement/badge/statistics/ranking/leaderboard file
// touching `archive.ipfsPublicationRecords` or any observation-by-key
// collection and it comes back empty. Exporting them here would not make
// Bob's reconstruction any more complete — it would just be a second,
// unjustified copy of application/PublicationObservationArchiveExport.js's
// own, already-existing, WHOLE-archive export, sized instead by guesswork.
// The proposal that named this milestone floated "relevant observation
// histories" as a fifth category worth exporting; tracing the actual
// pipeline shows there are none — every achievement/badge/statistic/rank/
// leaderboard fact in this codebase is computed from publication IDENTITY
// records and explicit relationship records alone, never from a
// confirmation count, a content-proof outcome, or an inclusion
// observation. See `docs/Roadmap.md`, 0.8.114, "The Minimum Durable
// Source Collections Necessary, Traced From The Actual Pipeline — Not
// Guessed," for the fuller trace.
//
// PROVENANCE IS NEVER EXPORTED — IT DESCRIBES ALICE'S OWN ARCHIVE, NOT A
// FACT ABOUT THE PUBLICATION. `application/
// PublicationObservationArchiveProvenance.js`'s own header already
// establishes the rule this file leans on: "Provenance describes where a
// fact entered THIS archive, not the fact's own history one replica
// removed." Whether a record was `LOCAL` or `IMPORTED` in Alice's own
// archive says something about ALICE's own ingestion history — it says
// nothing about the publication itself, and it is meaningless to Bob, who
// is about to stamp every one of these facts `IMPORTED` in his own
// archive regardless of what Alice's copy said (see
// `importAchievementEvidence()` below) — exactly the discipline
// application/PublicationObservationArchiveExport.js's own
// `importPublicationObservationArchive()` already holds for a whole-archive
// import, one layer up. This file's own payload therefore carries no
// provenance field at all, for any of its four collections — smaller, and
// honest about what a receiving replica can and cannot know about a fact's
// history before it arrived.
//
// NO ENVELOPE, NO EXPORT-TIME TIMESTAMP — THE IDENTICAL RESTRAINT
// application/PublicationObservationArchiveExport.js'S OWN HEADER ALREADY
// HOLDS, ONE LAYER OVER A NARROWER PAYLOAD. `exportAchievementEvidence()`
// inserts no `exportedAt`, no `exportedBy`, no nonce — two replicas
// holding identical evidence export byte-identical JSON, and the same
// replica exporting the same evidence twice produces byte-identical
// output. Exporting is not itself an observation of anything; see
// docs/Principles.md, "The UI Displays Observations; It Does Not Turn Them
// Into A Verdict (0.8.57)," held here once more.
//
// IMPORT NEVER MERGES, AND CONSTRUCTS A STANDALONE ARCHIVE — NEVER A
// SECOND, RICHER "PARTIAL ARCHIVE" TYPE. `importAchievementEvidence()`
// returns a genuine `PublicationObservationArchive` instance (the SAME
// class every other file in this codebase already reconstructs achievement
// facts from) holding ONLY these four collections populated — every other
// collection stays exactly at its own `PublicationObservationArchive`
// default (empty). This is not a special or degraded archive; it is an
// entirely ordinary instance of the one archive class this codebase has,
// no different in kind from a real replica that happens to have never
// received an IPFS publication or a Bitcoin confirmation observation.
// Handing it straight to `reconstructAchievementEvents()`,
// `reconstructPublisherAchievementStatistics()`, `reconstructPublisherRanking()`,
// or `reconstructPublisherLeaderboard()` — all four UNCHANGED — is exactly
// how a real caller is expected to use it. Exactly like
// `importPublicationObservationArchive()` one layer up, this function
// NEVER merges the imported evidence into an archive the caller already
// holds — blending imported evidence with a replica's own pre-existing
// facts (duplicate records, conflicting provenance, "did I already import
// this from someone else") is a genuinely harder question this milestone
// deliberately leaves unbuilt; see docs/Roadmap.md, 0.8.114, "Deliberately
// excluded."
//
// EVERY IMPORTED FACT IS STAMPED `IMPORTED`, UNCONDITIONALLY. There is no
// provenance in the payload to preserve or discard (see above) — this
// function simply stamps all four collections' own parallel provenance
// arrays `IMPORTED`, the only honest label for a fact that just entered
// this archive through this exact function.
//
// MALFORMED INPUT IS `INVALID_EVIDENCE`, NEVER A SILENT EMPTY ARCHIVE —
// THE IDENTICAL RESTRAINT application/PublicationObservationArchiveExport.js's
// OWN `importPublicationObservationArchive()` ALREADY HOLDS, reused here
// rather than re-invented: this file's own `TOP_LEVEL_FIELDS`, and the four
// per-record validators it imports UNCHANGED from application/
// PublicationObservationArchive.js (`validateBitcoinAnchorPublicationRecord()`,
// `validateBaseAnchorPublicationRecord()`, `validatePublicationReferenceRecord()`,
// `validatePublisherPublicationAssociationRecord()`), are held to the
// identical "reject the whole payload the moment any part fails" contract
// that file's own `validateArchiveJSON()` already holds — never a second,
// independently-drifting copy of what a genuine record looks like.
export const AchievementEvidenceImportOutcome = Object.freeze({
    IMPORTED: 'imported',
    INVALID_EVIDENCE: 'invalid-evidence'
});

// `archive` must be a real `PublicationObservationArchive` instance —
// mirrors `exportPublicationObservationArchive()`'s own identical,
// duck-typing-free contract exactly. Returns a plain, JSON-safe object a
// caller may `JSON.stringify()` for a file, a clipboard, or a transfer to
// another replica. Never throws for a well-formed archive; never mutates
// it; never reads or exports any of the archive's other six collections.
export function exportAchievementEvidence(archive) {
    if (!(archive instanceof PublicationObservationArchive)) {
        throw new Error('exportAchievementEvidence() requires a PublicationObservationArchive');
    }
    return {
        schemaVersion: SCHEMA_VERSION,
        bitcoinAnchorPublicationRecords: archive.bitcoinAnchorPublicationRecords.map((record) => record.toJSON()),
        baseAnchorPublicationRecords: archive.baseAnchorPublicationRecords.map((record) => record.toJSON()),
        publicationReferenceRecords: archive.publicationReferenceRecords.map((record) => record.toJSON()),
        publisherPublicationAssociationRecords: archive.publisherPublicationAssociationRecords.map((record) => record.toJSON())
    };
}

const TOP_LEVEL_FIELDS = [
    'schemaVersion',
    'bitcoinAnchorPublicationRecords',
    'baseAnchorPublicationRecords',
    'publicationReferenceRecords',
    'publisherPublicationAssociationRecords'
];

// `payload` may be either the parsed JSON value itself, or the raw text of
// a file/clipboard paste a caller has not yet parsed — a string that fails
// to parse as JSON is `INVALID_EVIDENCE`, exactly like a string that
// parses but fails this payload's own strict field-level contract.
// Returns a frozen `{ outcome, archive }`:
//
//   IMPORTED         — `archive` is a genuine, freshly constructed
//                       `PublicationObservationArchive`, holding ONLY the
//                       four evidence collections this payload named,
//                       every fact stamped `IMPORTED`.
//   INVALID_EVIDENCE — `archive` is `null`. The payload was not valid
//                       JSON, or did not satisfy this file's own strict
//                       contract (wrong/missing `schemaVersion`, a missing
//                       collection, an unexpected extra field, a record
//                       missing a required field, or a timestamp that does
//                       not parse).
//
// Never throws. Never merges with any archive the caller already holds —
// see this file's own header. Never touches any storage, network, wallet,
// or credential of any kind.
export function importAchievementEvidence(payload) {
    const json = typeof payload === 'string' ? parseJSONOrNull(payload) : payload;
    const validated = validateAchievementEvidenceJSON(json);
    if (!validated) {
        return Object.freeze({ outcome: AchievementEvidenceImportOutcome.INVALID_EVIDENCE, archive: null });
    }

    const bitcoinAnchorPublicationRecords = validated.bitcoinAnchorPublicationRecords.map((record) => BitcoinAnchorPublicationRecord.fromJSON(record));
    const baseAnchorPublicationRecords = validated.baseAnchorPublicationRecords.map((record) => BaseAnchorPublicationRecord.fromJSON(record));
    const publicationReferenceRecords = validated.publicationReferenceRecords.map((record) => PublicationReferenceRecord.fromJSON(record));
    const publisherPublicationAssociationRecords = validated.publisherPublicationAssociationRecords.map((record) => PublisherPublicationAssociationRecord.fromJSON(record));

    const archive = new PublicationObservationArchive({
        bitcoinAnchorPublicationRecords,
        bitcoinAnchorPublicationRecordProvenance: stampImported(bitcoinAnchorPublicationRecords),
        baseAnchorPublicationRecords,
        baseAnchorPublicationRecordProvenance: stampImported(baseAnchorPublicationRecords),
        publicationReferenceRecords,
        publicationReferenceRecordProvenance: stampImported(publicationReferenceRecords),
        publisherPublicationAssociationRecords,
        publisherPublicationAssociationRecordProvenance: stampImported(publisherPublicationAssociationRecords)
    });
    return Object.freeze({ outcome: AchievementEvidenceImportOutcome.IMPORTED, archive });
}

function stampImported(records) {
    return Object.freeze(records.map(() => PublicationObservationArchiveProvenanceOrigin.IMPORTED));
}

function parseJSONOrNull(text) {
    try {
        return JSON.parse(text);
    } catch (error) {
        return null;
    }
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value, allowedKeys) {
    return Object.keys(value).every((key) => allowedKeys.includes(key));
}

// Strict, whole-payload validation — returns the validated collections or
// `null` the moment ANY part fails, mirroring application/
// PublicationObservationArchive.js's own `validateArchiveJSON()` "never a
// partial result" contract exactly. Reuses that file's own four
// record-level validators UNCHANGED (see this file's own header for why),
// so a genuine record here and a genuine record inside a full archive
// export are held to the identical strictness by construction, not by two
// separately maintained copies agreeing to stay in sync.
function validateAchievementEvidenceJSON(json) {
    if (!isPlainObject(json) || !hasOnlyKeys(json, TOP_LEVEL_FIELDS)) return null;
    if (!TOP_LEVEL_FIELDS.every((key) => key in json)) return null;
    if (json.schemaVersion !== SCHEMA_VERSION) return null;

    const bitcoinAnchorPublicationRecords = validateArray(json.bitcoinAnchorPublicationRecords, validateBitcoinAnchorPublicationRecord);
    if (!bitcoinAnchorPublicationRecords) return null;

    const baseAnchorPublicationRecords = validateArray(json.baseAnchorPublicationRecords, validateBaseAnchorPublicationRecord);
    if (!baseAnchorPublicationRecords) return null;

    const publicationReferenceRecords = validateArray(json.publicationReferenceRecords, validatePublicationReferenceRecord);
    if (!publicationReferenceRecords) return null;

    const publisherPublicationAssociationRecords = validateArray(json.publisherPublicationAssociationRecords, validatePublisherPublicationAssociationRecord);
    if (!publisherPublicationAssociationRecords) return null;

    return {
        bitcoinAnchorPublicationRecords,
        baseAnchorPublicationRecords,
        publicationReferenceRecords,
        publisherPublicationAssociationRecords
    };
}
