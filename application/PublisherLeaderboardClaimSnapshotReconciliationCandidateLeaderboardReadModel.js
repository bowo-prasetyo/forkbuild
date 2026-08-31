import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement
} from './PublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreementView.js';

// 0.8.177 — Reconciliation Candidate Leaderboard Read Model.
//
// 0.8.176 answers, for two replicas at once, "what CANDIDATE EVIDENCE — of
// either kind — is shared, and what evidence exists exclusively on each
// side?" Nothing yet exists to hand that answer to the page a reader will
// eventually look at. This file is that hand-off, and nothing more:
//
//   describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel(evidenceAgreement)
//     -> { candidateCount,
//          candidates: [{ candidate,
//                          decisionEvidence: { sharedCount, sourceOnlyCount, targetOnlyCount },
//                          observationEvidence: { sharedCount, sourceOnlyCount, targetOnlyCount } }] }
//
// THIS IS A READ MODEL, NOT A COMPARISON ENGINE. Every fact this file
// reports is 0.8.176's own fact, read verbatim off its own already-computed
// `candidates` array and renamed for a leaderboard row's own vocabulary —
// `sharedDecisionCount`/`sourceOnlyDecisionCount`/`targetOnlyDecisionCount`
// become `decisionEvidence.sharedCount`/`sourceOnlyCount`/`targetOnlyCount`;
// `sharedObservationCount`/`sourceOnlyObservationCount`/
// `targetOnlyObservationCount` become `observationEvidence.sharedCount`/
// `sourceOnlyCount`/`targetOnlyCount`. No count is added, dropped, combined,
// or recomputed. See `docs/Principles.md`, "A Candidate's Decision History
// Is A Narration, Not A State Machine" (0.8.154) — held here again at the
// boundary of the domain, one step before the UI itself.
//
// THIS FILE ACCEPTS 0.8.176'S OWN RESULT DIRECTLY — NEVER RAW HISTORIES. The
// dependency direction is deliberately explicit:
//
//   raw histories -> historical projections -> agreement projections
//     -> 0.8.176 Candidate Evidence Agreement -> 0.8.177 Leaderboard Read Model
//
// `describeXxx()` below takes 0.8.176's own already-computed
// `evidenceAgreement` result as its one argument and performs a pure,
// structural transform of it — exactly the shape 0.8.112's own
// `PublisherRanking` result already hands to `describePublisherLeaderboard()`
// (0.8.113, UNCHANGED). It never touches a decision history, an observation
// history, or either archive itself; those remain 0.8.176's own — and, one
// layer further down, 0.8.156's and 0.8.174's own — concern. This prevents
// 0.8.177 from quietly becoming a second comparison engine: there is no
// history argument here for a second, subtly different multiset-subtraction
// to drift out of sync with 0.8.156's/0.8.174's own already-tested ones.
//
// NO RANKING SEMANTICS OF ANY KIND. `candidates` below is 0.8.176's own
// `candidates` array, mapped one entry to one row, IN 0.8.176'S OWN ORDER,
// UNCHANGED — never re-sorted by candidate type, evidence count, or any
// notion of "how well the two replicas agree." No row carries a `score`, a
// `rank`, a `winner`, a `correct`/`valid`/`preferred` flag, a `status`, or a
// `confidence` — those would each require interpreting what 0.8.176 only
// reports as fact, and interpretation is explicitly not this milestone's
// job. See "Deliberately excluded," below.
//
// CANDIDATE IDENTITY REMAINS STRUCTURAL. `candidate` on every row is
// 0.8.144's own three-value candidate, read verbatim off 0.8.176's own
// entry — `DIVERGENT_CORRESPONDENCE`, `CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT`,
// `SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM`. No fourth category is introduced
// merely because a page is now the eventual audience.
//
// `decisionEvidence` AND `observationEvidence` ARE KEPT SEPARATE ON EVERY
// ROW, NEVER MERGED — 0.8.176's own flagship principle, held here again one
// layer up. A candidate can carry `decisionEvidence.sharedCount > 0`
// alongside `observationEvidence.sharedCount === 0`, or the reverse; this
// file never averages, sums across the two, or produces a single combined
// per-candidate figure.
//
// EVERY COUNT ALWAYS AGREES WITH 0.8.176'S OWN COUNT FOR THE SAME
// CANDIDATE, SAME DIMENSION. `decisionEvidence.sharedCount` is always
// exactly the source entry's own `decisionAgreement.sharedDecisionCount`;
// likewise for every other one of the six counts on a row. This file
// performs no arithmetic of its own beyond the field-by-field copy.
//
// THIS FILE CARRIES NO EVIDENCE LISTS — ONLY COUNTS. 0.8.176's own
// `sharedDecisions`/`sourceOnly`/`targetOnly` and `sharedObservations`/
// `sourceOnly`/`targetOnly` arrays are deliberately NOT forwarded onto a
// row. A caller that needs the underlying decision or observation records
// themselves already has 0.8.176's own result for that; this read model
// exists to answer only the question a leaderboard row itself needs
// answered — "how much evidence of each kind, and how is it split?" — never
// to duplicate 0.8.176's own, already-complete, evidence-detail contract.
//
// TOP-LEVEL AGGREGATE COUNTS (`sourceDecisionCount`, `sharedObservationCount`,
// `sameDecisionHistory`, AND EVERY OTHER 0.8.176 TOP-LEVEL FIELD) ARE
// DELIBERATELY NOT FORWARDED. This read model's own top level answers
// exactly one question — "how many candidate rows, and what are they?" — via
// `candidateCount` and `candidates`. A caller that needs a cross-replica
// aggregate (e.g. "how many decisions were shared overall?") already has
// 0.8.176's own result for that; duplicating it here would let this file's
// own top level quietly drift out of sync with 0.8.176's own, if the two
// were ever computed from different inputs by mistake.
//
// NO MUTATION OF THE SUPPLIED `evidenceAgreement`, AND NO MUTATION OF ANY
// VALUE IT HOLDS. Every object and array this file returns is newly frozen;
// `candidate` on each row is 0.8.176's own already-frozen candidate object,
// referenced (never copied) unchanged.
//
// `describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel()`/
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel()`
// — THE IDENTICAL SPLIT EVERY PROJECTION IN THIS FAMILY ALREADY HOLDS, ADAPTED
// TO THIS MILESTONE'S OWN "TAKE THE PRIOR RESULT, NOT RAW HISTORIES" DESIGN.
// `describeXxx()` takes 0.8.176's own already-computed `evidenceAgreement`
// result directly and performs the pure transform documented above.
// `reconstructXxx()` below takes `sourceArchive`/`targetArchive` and calls
// 0.8.176's own `reconstructXxx()` exactly once — the one seam that reads
// both archives' own `reconciliationDecisionRecords` and
// `revalidationObservationRecords` collections, by way of 0.8.156's and
// 0.8.174's own seams — obtaining the already-computed evidence agreement
// directly, then hands it, unchanged, to `describeXxx()` above. This file
// never reads either archive itself.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK. Reads no clock.
// Returns frozen objects and frozen arrays throughout. Calling either
// function twice with byte-identical arguments returns a byte-identical
// result.
//
// MALFORMED INPUT DEGRADES TO AN EMPTY RESULT — NEVER THROWS. An
// `evidenceAgreement` that is `null`, `undefined`, or missing a genuine
// `candidates` array degrades to `candidateCount: 0` and an empty, frozen
// `candidates` array — this file performs its own defensive check here
// because, unlike every other projection in this family, its one argument
// is not itself produced by a seam that already guarantees a well-formed
// shape (a caller may hand `describeXxx()` anything). `reconstructXxx()`'s
// own archive tolerance is entirely inherited from 0.8.176's own
// `reconstructXxx()` — an invalid/missing archive on either side degrades to
// `PublicationObservationArchive.empty()`'s own empty evidence on that side,
// by way of that seam, never a throw.
//
// ARCHITECTURAL BOUNDARY — THIS FILE IMPORTS EXACTLY ONE MODULE, 0.8.176,
// AND NOTHING ELSE. No import from 0.8.156/0.8.174 (either agreement view
// 0.8.176 already composes), 0.8.153/0.8.171 (either candidate
// correspondence), 0.8.154/0.8.172 (either candidate evolution), 0.8.175
// (the single-replica evidence summary — a different composition this
// milestone does not need), any raw history/difference module, either
// archive-reading seam directly, or any plan/discovery/verification module
// in this family. One import, one describeXxx/reconstructXxx pair — this
// file trusts nothing about how the evidence agreement was produced beyond
// 0.8.176's own already-documented result shape.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A score, rank, ordering by evidence weight, or any comparison between
//   two candidates' own evidence.** See "No ranking semantics of any kind,"
//   above — the whole point of this file's name notwithstanding.
// - **A `winner`, `correct`/`incorrect`, `valid`, `preferred`, `status`, or
//   `confidence` field of any kind.** See the same, above.
// - **Any interpretation of agreement or difference as a conflict,
//   inconsistency, correction, or need for resolution.** Inherited
//   unchanged from 0.8.176's own boundary.
// - **A fourth candidate category.** See "Candidate identity remains
//   structural," above.
// - **Re-deriving, re-deriving, or re-computing any of 0.8.176's own
//   counts.** See "Every count always agrees with 0.8.176's own count,"
//   above.
// - **Forwarding 0.8.176's own evidence-record lists or top-level aggregate
//   fields onto this read model.** See both fields above.
// - **The Leaderboard view model or the Leaderboard UI itself.** This
//   remains a data contract for the domain boundary, not the page; 0.8.178
//   converts this read model into the exact sections/columns/cards a page
//   needs, and 0.8.179 builds the page.
// - **Persistence or synchronization of any kind.** `evidenceAgreement` (or
//   both archives) is handed in and read; `reconstructXxx()` only reads.
// - **Automatic, periodic, or background computation of any kind.** These
//   functions run only when a caller explicitly calls them.
export function describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel(evidenceAgreement) {
    const sourceEntries = evidenceAgreement && Array.isArray(evidenceAgreement.candidates)
        ? evidenceAgreement.candidates
        : [];

    const candidates = sourceEntries.map((entry) => Object.freeze({
        candidate: entry.candidate,
        decisionEvidence: Object.freeze({
            sharedCount: entry.decisionAgreement.sharedDecisionCount,
            sourceOnlyCount: entry.decisionAgreement.sourceOnlyDecisionCount,
            targetOnlyCount: entry.decisionAgreement.targetOnlyDecisionCount
        }),
        observationEvidence: Object.freeze({
            sharedCount: entry.observationAgreement.sharedObservationCount,
            sourceOnlyCount: entry.observationAgreement.sourceOnlyObservationCount,
            targetOnlyCount: entry.observationAgreement.targetOnlyObservationCount
        })
    }));

    return Object.freeze({
        candidateCount: candidates.length,
        candidates: Object.freeze(candidates)
    });
}

// reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel()
// — see this file's own header, "The identical split," above. Calls
// 0.8.176's own `reconstructXxx()` exactly once, obtaining its
// already-computed evidence agreement directly from `sourceArchive`/
// `targetArchive` without this file touching either archive itself, then
// hands that result, unchanged, to `describeXxx()` above.
export function reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel(sourceArchive, targetArchive) {
    const evidenceAgreement = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement(sourceArchive, targetArchive);
    return describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel(evidenceAgreement);
}
