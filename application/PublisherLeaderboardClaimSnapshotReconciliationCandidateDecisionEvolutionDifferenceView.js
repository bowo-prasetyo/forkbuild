import {
    describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference
} from './PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution } from './PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionView.js';

// 0.8.155 — Reconciliation Candidate Decision Evolution Difference
// Projection.
//
// 0.8.149 answered "which decision records exist on one replica's history
// but not the other's?" by a pure multiset difference over DECISION
// identity. 0.8.154 answered "how did the recorded decisions concerning
// each candidate evolve over time?" by grouping a single history's own
// decisions by CANDIDATE identity. Neither one answers the question this
// milestone exists for — the decision-history analogue of
// `application/PublisherLeaderboardClaimEvolutionView.js` meeting
// `application/PublisherLeaderboardSnapshotDifference.js` one layer up —
// stated plainly in this milestone's own request:
//
//   Given two replicas' decision histories, which candidate-specific
//   decision events exist on one replica but not the other?
//
//   describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifference(sourceHistory, targetHistory)
//     -> { sourceDecisionCount, targetDecisionCount,
//          sourceOnlyDecisionCount, targetOnlyDecisionCount,
//          sourceOnly, targetOnly,
//          sourceOnlyDistinctCandidateCount, targetOnlyDistinctCandidateCount,
//          sourceOnlyCandidateEvolutions, targetOnlyCandidateEvolutions,
//          sameHistory }
//
// DECISION EVENTS ARE THE ATOMIC DIFFERENCE UNIT — 0.8.149'S EXACT DECISION
// IDENTITY, REUSED UNCHANGED, NEVER CANDIDATE IDENTITY. A decision record's
// identity for the purpose of "does the other replica have this too?"
// remains its complete structural content — candidate + decision +
// decidedAt, exactly as 0.8.149 already established:
//
//   decisionIdentity = structural identity of (candidate, decision, decidedAt)
//
// This file therefore does NOT diff at the candidate level (a "does this
// replica have any decision about candidate C1?" comparison would conflate
// `OBSERVE(C1, t1)` on one side with `DEFER(C1, t2)` on the other into "same
// candidate, no difference" — precisely the loss of information this
// milestone's own request calls out by name). It diffs at the decision
// level, via 0.8.149 unchanged, and only THEN groups the resulting
// exclusive decisions by the candidate they concern, via 0.8.154 unchanged:
//
//   Source history ──┐
//                    ├─→ 0.8.149 decision-level difference ─→ sourceOnly, targetOnly
//   Target history ──┘                                              │
//                                                                    ▼
//                                              0.8.154, applied independently
//                                              to sourceOnly and to targetOnly
//                                                                    │
//                                                                    ▼
//                                    sourceOnlyCandidateEvolutions, targetOnlyCandidateEvolutions
//
// THIS FILE DOES NOT "BLINDLY COMPOSE" 0.8.149 AND 0.8.154 — THE ONE DESIGN
// DECISION THIS MILESTONE'S OWN REQUEST NAMES EXPLICITLY. The unsound
// composition this file deliberately avoids would run 0.8.154 independently
// over the WHOLE source history and the WHOLE target history, producing two
// complete candidate-evolution results, and then attempt to diff THOSE —
// which either loses decision-level granularity (comparing candidate
// groups as opaque units) or silently reintroduces a candidate-identity
// comparison through the back door. Instead, 0.8.149 runs first, exactly
// once, over the two whole histories; 0.8.154 then runs exactly twice,
// each time over one already-computed EXCLUSIVE-DECISION array
// (`difference.sourceOnly`/`difference.targetOnly`) — each of which is
// already a valid decision-history array of genuine 0.8.145 records, the
// exact shape 0.8.154's own `describeXxx()` already accepts. 0.8.154 is
// never asked to group anything but decisions already known to be
// exclusive to one side.
//
// TWO LEVELS OF INFORMATION, NEITHER ONE COLLAPSED INTO THE OTHER — THE
// RECURRING ARCHITECTURAL DISTINCTION THIS MILESTONE'S OWN REQUEST NAMES
// EXPLICITLY ("candidate identity != decision identity"). `sourceOnly`/
// `targetOnly` are 0.8.149's own raw exclusive-decision arrays, carried
// through byte-for-byte, unchanged, exactly as 0.8.149 produced them — no
// information is ever lost by grouping. `sourceOnlyCandidateEvolutions`/
// `targetOnlyCandidateEvolutions` are the SAME exclusive decisions, viewed
// through 0.8.154's own candidate lens, exposing the fact this milestone's
// own flagship scenario exists to make observable: a candidate that exists
// on both replicas' full histories can still have decisions that are
// exclusive to one side. Concretely, for Alice's `OBSERVE(C1,t1)`/
// `DEFER(C1,t2)` compared against Bob's `OBSERVE(C1,t1)`/`DEFER(C1,t4)`:
// `sourceOnly` names exactly one record, `DEFER(C1,t2)`, and
// `sourceOnlyCandidateEvolutions` groups it under one candidate evolution
// for C1 carrying that single decision — never merged with Bob's own
// exclusive `DEFER(C1,t4)`, which appears only in `targetOnly`/
// `targetOnlyCandidateEvolutions`.
//
// NO COMPARISON, RANKING, OR RECONCILIATION BETWEEN `sourceOnly` AND
// `targetOnly` OF ANY KIND — THE IDENTICAL RESTRAINT 0.8.149'S OWN HEADER
// ALREADY HOLDS, HELD HERE AGAIN OVER THE CANDIDATE-GROUPED VIEW. This file
// never states that a source-only decision "supersedes," "conflicts with,"
// or "corrects" a target-only decision concerning the same candidate, never
// picks a preferred disposition, and never infers that the replicas
// disagree — only that each side's own history contains decision records
// the other side's history does not. `sameHistory` is 0.8.149's own field,
// carried through unchanged, never recomputed.
//
// NO ORDERING OR GROUPING BEYOND WHAT 0.8.149 AND 0.8.154 ALREADY PROVIDE.
// `sourceOnly`/`targetOnly` remain in 0.8.149's own order (each side's own
// original history order). `sourceOnlyCandidateEvolutions`/
// `targetOnlyCandidateEvolutions` remain in 0.8.154's own order
// (first-appearance among the exclusive decisions, with each candidate's
// own `decisions` sorted by `decidedAt` ascending, `decisionIndex` as the
// tie-break) — this file performs no re-sorting, re-grouping, or
// re-counting of its own beyond forwarding each already-computed result.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK. Reads no clock.
// Never mutates either input history or any record either one holds.
// Calling either function twice with equivalent arguments returns a
// byte-identical result.
//
// `describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifference()`/
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifference()`
// — THE IDENTICAL SPLIT EVERY PROJECTION IN THIS FAMILY SINCE 0.8.147
// ALREADY HOLDS. `describeXxx()` is the pure computation, over two plain,
// in-memory decision-history arrays (0.8.146's own shape) — it calls
// 0.8.149's own `describeXxx()` exactly once, then 0.8.154's own
// `describeXxx()` exactly twice (over `sourceOnly`, then over `targetOnly`),
// touching no archive. `reconstructXxx()` below calls 0.8.149's own
// `reconstructXxx()` exactly once — the ONE seam that reads an archive
// (which itself delegates to 0.8.150's own reconstruction of each side's
// history) — obtaining 0.8.149's own difference result directly, then hands
// that result's own `sourceOnly`/`targetOnly` arrays to 0.8.154's own
// `describeXxx()`, exactly as `describeXxx()` above does. 0.8.149 is
// therefore called exactly once, and 0.8.154 exactly twice, for the entire
// comparison, whichever entry point a caller uses.
//
// MALFORMED INPUT DEGRADES TO AN EMPTY RESULT — NEVER THROWS. Both
// `sourceHistory` and `targetHistory` tolerate `null`, `undefined`, a
// non-array, or an array containing non-genuine entries exactly as 0.8.149
// already tolerates them (0.8.149 itself performs the exclusion; this file
// never re-implements it). Two empty/malformed histories degrade to
// `sourceDecisionCount: 0`, `targetDecisionCount: 0`, empty `sourceOnly`/
// `targetOnly` arrays, empty `sourceOnlyCandidateEvolutions`/
// `targetOnlyCandidateEvolutions` arrays, and `sameHistory: true`.
//
// ARCHITECTURAL BOUNDARY — NO IMPORTS FROM THE RECONCILIATION FAMILY BEYOND
// 0.8.149 AND 0.8.154 THEMSELVES. This file imports nothing from
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliation.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliationPlanView.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryView.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondenceView.js`,
// or any other module naming a plan, a candidate-selection boundary, a
// divergence, a verification, a claim, or a snapshot — it trusts nothing
// about how either `history` argument was produced beyond 0.8.149's and
// 0.8.154's own already-documented result shapes, and never calls 0.8.144
// through 0.8.153 itself to re-derive or double-check anything. This file
// never verifies a signature, reconstructs a snapshot, reconstructs a
// reconciliation plan, determines whether a decision was correct, compares
// current state, infers a conflict, chooses one replica's decision, or
// synchronizes or modifies either archive — see 0.8.149's own header,
// "No interpretation of the difference," and 0.8.154's own header, "This is
// a narration, never a state machine," both held here again unchanged.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any interpretation of a source-only/target-only decision as a
//   conflict, inconsistency, correction, or need for resolution.** See
//   "No comparison, ranking, or reconciliation," above.
// - **Any export, import, application, or synchronization of the exclusive
//   decisions found.** `sourceOnly`/`targetOnly` (and their candidate
//   groupings) are read-only facts about the difference; folding either
//   side's exclusive decisions into the other history remains 0.8.151's/
//   0.8.152's own, already-answered, separately sized question — this file
//   never calls either of them.
// - **Deduplication of any kind.** 0.8.149's own multiset discipline is
//   inherited unchanged: `[D1, D1, D2]` compared against `[D1, D2]` reports
//   exactly one exclusive `D1`, never zero and never two, and no result
//   field here collapses two independently recorded, byte-identical
//   decisions into one.
// - **Comparing, merging, or cross-referencing `sourceOnlyCandidateEvolutions`
//   against `targetOnlyCandidateEvolutions`.** Each is an independent
//   candidate-grouped view of one side's own exclusive decisions; this file
//   never states that a candidate group on one side "relates to," "differs
//   from," or "should be reconciled with" the same candidate's group on the
//   other side, beyond both simply being able to name the identical
//   candidate.
// - **Plan reconstruction, candidate selection, correspondence discovery,
//   divergence detection, or signature verification.** This file reads only
//   0.8.149's own and 0.8.154's own already-computed results, never a
//   freshly computed plan or a freshly rediscovered candidate.
// - **Persistence or synchronization of any kind.** Each history is an
//   in-memory array handed in and read, exactly like every other projection
//   in this family; `reconstructXxx()` only reads.
// - **Automatic, periodic, or background computation of any kind.** These
//   functions run only when a caller explicitly calls them.
export function describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifference(sourceHistory = [], targetHistory = []) {
    const difference = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference(sourceHistory, targetHistory);
    return buildEvolutionDifference(difference);
}

// reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifference()
// — see this file's own header, "The identical split," above. Calls
// 0.8.149's own `reconstructXxx()` exactly once, obtaining that
// milestone's own difference result directly from both archives without
// this file touching either archive itself a second time. An invalid/
// missing archive on either side degrades to `PublicationObservationArchive.empty()`
// on that side, by way of the reconstruction seam 0.8.149 itself calls —
// never a throw.
export function reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifference(sourceArchive, targetArchive) {
    const difference = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference(sourceArchive, targetArchive);
    return buildEvolutionDifference(difference);
}

// The one composition both entry points share — see this file's own
// header, "This file does not blindly compose 0.8.149 and 0.8.154," above.
// Groups each side's own already-computed exclusive-decision array by
// candidate, via 0.8.154's own `describeXxx()`, called once per side.
function buildEvolutionDifference(difference) {
    const sourceOnlyEvolution = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution(difference.sourceOnly);
    const targetOnlyEvolution = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution(difference.targetOnly);

    return Object.freeze({
        sourceDecisionCount: difference.sourceCount,
        targetDecisionCount: difference.targetCount,
        sourceOnlyDecisionCount: difference.sourceOnlyCount,
        targetOnlyDecisionCount: difference.targetOnlyCount,
        sourceOnly: difference.sourceOnly,
        targetOnly: difference.targetOnly,
        sourceOnlyDistinctCandidateCount: sourceOnlyEvolution.distinctCandidateCount,
        targetOnlyDistinctCandidateCount: targetOnlyEvolution.distinctCandidateCount,
        sourceOnlyCandidateEvolutions: sourceOnlyEvolution.candidateEvolutions,
        targetOnlyCandidateEvolutions: targetOnlyEvolution.candidateEvolutions,
        sameHistory: difference.sameHistory
    });
}
