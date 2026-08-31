import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement
} from './PublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreementView.js';

// 0.8.182 — Reconciliation Candidate Evidence Detail View.
//
// 0.8.177/0.8.178/0.8.179 built the Leaderboard's own COUNTS path — "C1:
// Observation: Shared 2 / Source-only 1 / Target-only 3" — and, on purpose,
// carried nothing past a count onto a row (see 0.8.177's own header, "This
// file carries no evidence lists — only counts"). A reader who sees that
// row's own natural next question — "which observations are those?" — has
// had no answer anywhere in this codebase until now. This file is that
// answer, and nothing more:
//
//   describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail(evidenceAgreement)
//     -> { candidateCount,
//          candidates: [{ candidate,
//                          decisionDetail: { sharedCount, sourceOnlyCount, targetOnlyCount,
//                                             shared, sourceOnly, targetOnly },
//                          observationDetail: { sharedCount, sourceOnlyCount, targetOnlyCount,
//                                                shared, sourceOnly, targetOnly } }] }
//
// where every `shared`/`sourceOnly`/`targetOnly` array on `decisionDetail`
// holds actual 0.8.145 decision records (`{ decided, candidate, decision,
// decidedAt }`), and every such array on `observationDetail` holds actual
// 0.8.162 observation records, each carrying its own already-embedded
// candidate surfaced onto the record's own top level (`{ candidate, decision,
// planIdentity, candidatePresent, candidateType, candidateMatchesPlan,
// observedAt }`) — see "Candidate is surfaced, never invented," below.
//
// THIS FILE READS 0.8.176'S OWN RESULT DIRECTLY — THE IDENTICAL SOURCE THE
// COUNTS PATH ALREADY READS, NEVER THE COUNTS THEMSELVES. The whole point of
// this milestone is the invariant its own request named explicitly: THE
// NUMBER DISPLAYED IN THE TABLE AND THE RECORDS DISPLAYED IN THE DETAIL VIEW
// ORIGINATE FROM THE SAME DOMAIN RESULT, so no arithmetic is ever needed to
// establish the relationship between them.
//
//   0.8.176 Candidate Evidence Agreement
//             │
//             ├── counts ──────► 0.8.177 ─► 0.8.178 ─► 0.8.179 ─► table
//             │
//             └── evidence records ─────────────────────────────► 0.8.182 (THIS FILE) ─► detail view
//
// 0.8.176's own `candidates` entries already carry BOTH the counts
// (`decisionAgreement.sharedDecisionCount`/etc.) AND the underlying records,
// already grouped by candidate and already split into shared/source-only/
// target-only (`decisionAgreement.sharedDecisions`/`sourceOnly`/`targetOnly`,
// and `observationAgreement`'s identically-shaped observation counterparts —
// see 0.8.176's own header, "Per-candidate evidence lists are a grouping of
// 0.8.156's/0.8.174's own global arrays, never a new comparison"). This file
// never re-reads a decision or observation history, never re-groups by
// candidate, and never re-derives shared/exclusive status — it reads 0.8.176's
// own per-candidate `decisionAgreement`/`observationAgreement` fields
// directly and performs a pure rename/reshape pass, exactly the discipline
// 0.8.177 already holds one layer over on the counts alone.
//
// THIS FILE CREATES NO THIRD COMPARISON ALGORITHM — IT REUSES 0.8.176'S OWN
// ALREADY-GROUPED RESULT VERBATIM. `decisionDetail.sharedCount` is always
// exactly the candidate's own `decisionAgreement.sharedDecisionCount`;
// `decisionDetail.shared` is always exactly the candidate's own
// `decisionAgreement.sharedDecisions`, referenced (never copied or
// reordered). The six counts and six lists on `observationDetail` mirror
// `observationAgreement` the same way. Every count on this file's own result
// always agrees with its own list's own `.length` — the two are never
// allowed to drift apart, and neither is ever allowed to drift from 0.8.176's
// own count for the identical candidate and dimension.
//
// CANDIDATE IS SURFACED, NEVER INVENTED — THE ONE GENUINE RESHAPE THIS FILE
// PERFORMS. A 0.8.145 decision record already carries `candidate` on its own
// top level, so `decisionDetail`'s three lists forward 0.8.176's own decision
// records completely unchanged — not one field is added, renamed, or
// dropped. A 0.8.162 observation record does NOT carry `candidate` on its own
// top level (it lives one level down, on `decision.candidate` — exactly as
// 0.8.176's own `observationCandidateOf()` already reads it to group by
// candidate in the first place); a detail-view reader should not need to
// know that. So `observationDetail`'s three lists forward 0.8.176's own
// observation records with exactly one field ADDED — `candidate`, read off
// each record's own already-embedded `decision.candidate`, the identical
// value 0.8.176 already used to decide which candidate's list this record
// belongs to. This is a read of an already-embedded fact, never a
// fabrication: the candidate a detail row names is always the SAME candidate
// 0.8.176 already grouped that exact record under.
//
// `decision` ON AN OBSERVATION DETAIL RECORD IS THE FULL EMBEDDED 0.8.145
// DECISION RECORD, EXACTLY AS 0.8.162 ALREADY EMBEDS IT — NEVER JUST THE
// DISPOSITION STRING. `record.decision.decision` (`'OBSERVE'`/`'DEFER'`) and
// `record.decision.decidedAt` remain reachable exactly where 0.8.162 already
// put them; this file does not flatten or rename that nesting, and does not
// invent a second, shallower `decision` meaning "disposition only." A reader
// who wants the disposition reads `observation.decision.decision`, exactly
// as every other file in this family already does.
//
// `planFingerprint` SURVIVES INTO OBSERVATION DETAIL UNCHANGED — THE REASON
// THIS MILESTONE MAKES `planIdentity` FINALLY USEFUL. `planIdentity` is
// forwarded exactly as 0.8.161/0.8.162 already froze it, letting a detail
// view show a reader WHICH explicit plan an observation was checked against
// (0.8.160's own `planFingerprint`), without this file ever claiming one
// plan is authoritative over another — see 0.8.161's own boundary, unchanged.
//
// `candidateMatchesPlan` IS DISPLAYED AS A FACT, NEVER INTERPRETED. This
// file forwards `candidatePresent`/`candidateType`/`candidateMatchesPlan`
// exactly as 0.8.162 already recorded them — booleans and a type string, not
// a verdict. Nothing here (or in the UI this file feeds) renames
// `candidateMatchesPlan: false` into `stale`, `invalid`, or `needs
// attention`. See 0.8.162's own "forbidden vocabulary," held here again.
//
// DECISION EVIDENCE AND OBSERVATION EVIDENCE STAY SEPARATE ON EVERY
// CANDIDATE ENTRY, NEVER MERGED — 0.8.176's own flagship principle, held
// here again one more layer up, over detail rather than counts.
// `decisionDetail` and `observationDetail` are never summed, zipped, or
// otherwise combined into one evidence list; a candidate with rich decision
// detail and empty observation detail (or the reverse) reports exactly that.
//
// RECORD ORDER IS PRESERVED — NEVER RE-SORTED. Every list this file returns
// keeps 0.8.176's own relative order among the records naming that
// candidate; this file appends no record, drops no record, and reorders
// none. Two records that look similar (same candidate, same decision,
// different `planIdentity`; or same candidate, same plan, different
// `observedAt`) remain two distinct entries in their own list — see 0.8.176's
// own "deduplication of any kind" restraint, inherited unchanged.
//
// NO RECORD IS EVER FABRICATED FROM A COUNT. This file never looks at
// `sharedDecisionCount` (or any other count) to decide how many placeholder
// records to synthesize — every record in every list is a real record 0.8.145
// or 0.8.162 once produced, reached here only by reference through 0.8.176's
// own already-grouped arrays.
//
// CANDIDATE ORDER — 0.8.176'S OWN `candidates` ORDER, UNCHANGED. This file
// maps 0.8.176's own `candidates` array one entry to one entry, in the exact
// same order; there is no `sort()` anywhere in this file.
//
// NO MUTATION OF THE SUPPLIED `evidenceAgreement`, AND NO MUTATION OF
// ANYTHING IT HOLDS. Every object and array this file returns is newly
// frozen; every decision record and every `planIdentity`/`decision` an
// observation record embeds is 0.8.176's own already-frozen value, referenced
// unchanged. The one new object per observation detail record (the one
// carrying the added `candidate` field) is the only object this file itself
// allocates and freezes.
//
// `describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail()`/
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail()`
// — THE IDENTICAL SPLIT EVERY PROJECTION IN THIS FAMILY ALREADY HOLDS.
// `describeXxx()` takes 0.8.176's own already-computed `evidenceAgreement`
// result directly. `reconstructXxx()` below takes `sourceArchive`/
// `targetArchive` and calls 0.8.176's own `reconstructXxx()` exactly once —
// the SAME seam 0.8.177's own `reconstructXxx()` already calls for the
// counts path — obtaining the identical already-computed evidence agreement
// both paths are built from, then hands it, unchanged, to `describeXxx()`
// above. This file never reads either archive itself, and never calls
// 0.8.177/0.8.178/0.8.179 — the detail path and the counts path are two
// independent readings of the SAME 0.8.176 result, never one derived from
// the other.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK. Reads no clock.
// Returns frozen objects and frozen arrays throughout. Calling either
// function twice with byte-identical arguments returns a byte-identical
// result.
//
// MALFORMED INPUT DEGRADES TO AN EMPTY RESULT — NEVER THROWS. An
// `evidenceAgreement` that is `null`, `undefined`, or missing a genuine
// `candidates` array degrades to `candidateCount: 0` and an empty, frozen
// `candidates` array — this file performs its own defensive check here for
// the identical reason 0.8.177 does: its one argument may not have come from
// a seam that already guarantees a well-formed shape. `reconstructXxx()`'s
// own archive tolerance is entirely inherited from 0.8.176's own
// `reconstructXxx()` — an invalid/missing archive on either side degrades to
// `PublicationObservationArchive.empty()`'s own empty evidence on that side,
// never a throw.
//
// ARCHITECTURAL BOUNDARY — THIS FILE IMPORTS EXACTLY ONE MODULE, 0.8.176, AND
// NOTHING ELSE. No import from 0.8.156/0.8.174 (either agreement view 0.8.176
// already composes), 0.8.153/0.8.171 (either candidate correspondence),
// 0.8.154/0.8.172 (either candidate evolution), 0.8.175 (the single-replica
// evidence summary), 0.8.177/0.8.178/0.8.179 (the counts path — a sibling
// reading of 0.8.176, never this file's own dependency), any raw
// history/difference module, either archive-reading seam directly, or any
// plan/discovery/verification module in this family. One import, one
// describeXxx/reconstructXxx pair — this file trusts nothing about how the
// evidence agreement was produced beyond 0.8.176's own already-documented
// result shape.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A score, rank, ordering by evidence weight, or any comparison between
//   two candidates' own evidence.** Inherited unchanged from every layer
//   beneath this one.
// - **A `winner`, `correct`/`incorrect`, `valid`, `stale`, `preferred`,
//   `status`, or `confidence` field or vocabulary of any kind.** Inherited
//   unchanged, the same.
// - **Any interpretation of agreement, difference, or `candidateMatchesPlan`
//   as a conflict, inconsistency, correction, or need for resolution.** See
//   "`candidateMatchesPlan` is displayed as a fact," above.
// - **Deduplication, merging, or collapsing of any two records that "look
//   similar."** See "Record order is preserved," above — the flagship
//   regression this milestone's own test holds directly.
// - **Re-deriving, re-grouping, or re-computing anything 0.8.176 already
//   computed.** See "This file creates no third comparison algorithm,"
//   above.
// - **The counts path (0.8.177/0.8.178/0.8.179), or any dependency on it.**
//   The two paths read the identical 0.8.176 result independently; this file
//   is not built on top of the counts, and the counts are not built on top
//   of this file.
// - **The Leaderboard UI's own expand/collapse interaction, markup, or
//   styling.** This file returns plain, frozen, data; wiring it into a real,
//   archive-backed, on-screen detail panel is UI-layer work, kept out of
//   this file's reach entirely — the identical split 0.8.178/0.8.179/0.8.180
//   already hold for the counts path.
// - **Persistence or synchronization of any kind.** `evidenceAgreement` (or
//   both archives) is handed in and read; `reconstructXxx()` only reads.
// - **Automatic, periodic, or background computation of any kind.** These
//   functions run only when a caller explicitly calls them.
export function describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail(evidenceAgreement) {
    const sourceEntries = evidenceAgreement && Array.isArray(evidenceAgreement.candidates)
        ? evidenceAgreement.candidates
        : [];

    const candidates = sourceEntries.map((entry) => Object.freeze({
        candidate: entry.candidate,
        decisionDetail: buildDecisionDetail(entry.decisionAgreement),
        observationDetail: buildObservationDetail(entry.observationAgreement)
    }));

    return Object.freeze({
        candidateCount: candidates.length,
        candidates: Object.freeze(candidates)
    });
}

// reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail()
// — see this file's own header, "The identical split," above. Calls 0.8.176's
// own `reconstructXxx()` exactly once — the same seam 0.8.177's own
// `reconstructXxx()` already calls for the counts path — obtaining its
// already-computed evidence agreement directly from `sourceArchive`/
// `targetArchive` without this file touching either archive itself, then
// hands that result, unchanged, to `describeXxx()` above.
export function reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail(sourceArchive, targetArchive) {
    const evidenceAgreement = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement(sourceArchive, targetArchive);
    return describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail(evidenceAgreement);
}

// A 0.8.145 decision record already carries `candidate` on its own top
// level — forwarded completely unchanged, see "Candidate is surfaced, never
// invented," above.
function buildDecisionDetail(decisionAgreement) {
    return Object.freeze({
        sharedCount: decisionAgreement.sharedDecisionCount,
        sourceOnlyCount: decisionAgreement.sourceOnlyDecisionCount,
        targetOnlyCount: decisionAgreement.targetOnlyDecisionCount,
        shared: Object.freeze(decisionAgreement.sharedDecisions.slice()),
        sourceOnly: Object.freeze(decisionAgreement.sourceOnly.slice()),
        targetOnly: Object.freeze(decisionAgreement.targetOnly.slice())
    });
}

// A 0.8.162 observation record does not carry `candidate` on its own top
// level — this is the one field this file adds, read off each record's own
// already-embedded `decision.candidate`, see "Candidate is surfaced, never
// invented," above. Every other field is forwarded completely unchanged.
function buildObservationDetail(observationAgreement) {
    return Object.freeze({
        sharedCount: observationAgreement.sharedObservationCount,
        sourceOnlyCount: observationAgreement.sourceOnlyObservationCount,
        targetOnlyCount: observationAgreement.targetOnlyObservationCount,
        shared: Object.freeze(observationAgreement.sharedObservations.map(withSurfacedCandidate)),
        sourceOnly: Object.freeze(observationAgreement.sourceOnly.map(withSurfacedCandidate)),
        targetOnly: Object.freeze(observationAgreement.targetOnly.map(withSurfacedCandidate))
    });
}

function withSurfacedCandidate(observation) {
    return Object.freeze({
        candidate: observation.decision.candidate,
        decision: observation.decision,
        planIdentity: observation.planIdentity,
        candidatePresent: observation.candidatePresent,
        candidateType: observation.candidateType,
        candidateMatchesPlan: observation.candidateMatchesPlan,
        observedAt: observation.observedAt
    });
}
