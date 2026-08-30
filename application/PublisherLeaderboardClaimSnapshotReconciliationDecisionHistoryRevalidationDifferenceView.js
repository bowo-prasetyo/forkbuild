import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation } from './PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationView.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference } from './PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference.js';

// 0.8.159 — Reconciliation Decision History Revalidation Difference
// Projection.
//
// 0.8.149 answered "which decision records exist on one replica's history
// but not the other's?" for two decision histories alone — no plan enters
// into it. 0.8.158 answered "which of THIS ONE history's own recorded
// decisions still name a candidate present in THIS explicitly supplied
// plan?" for exactly one history at a time — no second replica enters into
// it. This file asks the question neither one asks alone: given TWO decision
// histories and ONE explicitly supplied reconciliation plan, which
// revalidation facts are exclusive to each history, and which are shared?
//
//   sourceHistory ──┐
//                   ├── 0.8.158 ── sourceRevalidation ──┐
//   plan ───────────┘                                    │
//                   ┌── 0.8.158 ── targetRevalidation ──┤
//   targetHistory ──┘                                    │
//                                                         │
//   sourceHistory ──┐                                     │
//                   ├── 0.8.149 ── sourceOnly/targetOnly ─┤
//   targetHistory ──┘         (decision-level difference)  │
//                                                          ▼
//                                          revalidation difference
//
//   describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationDifference(sourceHistory, targetHistory, plan)
//     -> { sourceDecisionCount, targetDecisionCount,
//          sharedDecisionCount, sourceOnlyDecisionCount, targetOnlyDecisionCount,
//          sharedRevalidations, sourceOnly, targetOnly,
//          sourcePresentCandidateCount, sourceAbsentCandidateCount,
//          targetPresentCandidateCount, targetAbsentCandidateCount,
//          sameRevalidation }
//
// THIS IS DELIBERATELY NOT 0.8.149 RUN TWICE, AND NOT A NEW COMPARISON
// ENGINE — THE ONE ARCHITECTURAL CHOICE THIS MILESTONE EXISTS TO HOLD.
// `0.8.149(sourceHistory, targetHistory)` answers "decision history A vs.
// decision history B" — a comparison entirely indifferent to any plan.
// `revalidation(A, P)` vs. `revalidation(B, P)` is a different comparison:
// two historical decisions can be identical (same candidate, same
// disposition, same `decidedAt`) yet, once `P` is introduced, both simply
// read `candidatePresent: false` together — that is still SHARED history,
// never "conflict," and this file states it as such (see "The important
// test case," below). This file therefore never independently re-runs
// candidate matching of its own: every `candidatePresent`/`candidateType`/
// `candidateMatchesPlan` fact in this result comes from 0.8.158, called
// exactly twice — once over `sourceHistory`, once over `targetHistory`,
// the SAME `plan` argument unchanged both times — and 0.8.149 is called
// exactly once, purely to obtain the decision-level partition (which
// decisions are exclusive to which side), never to compute a second,
// independent candidate comparison of its own.
//
//   sourceHistory ──┐
//                   ├── 0.8.158 ── sourceRevalidation
//   plan ───────────┘       │
//                           │
//                    same explicit plan
//                           │
//                           ▼
//                 revalidation difference
//
// DECISION IDENTITY AND PLAN MEMBERSHIP ARE INDEPENDENT DIMENSIONS — HELD
// HERE ACROSS TWO REPLICAS, THE IDENTICAL DISCIPLINE 0.8.157'S/0.8.158'S OWN
// HEADERS ALREADY HOLD FOR ONE. Suppose both replicas contain decisions
// concerning C1:
//
//   Alice:  D1(C1/S1, OBSERVE)     D2(C2, DEFER)
//   Bob:    D1(C1/S1, OBSERVE)     D3(C3, OBSERVE)
//
// against a plan naming only C1/S1 and C2. D1 (identical structural content
// on both replicas) is a SHARED decision, and `candidatePresent: true` for
// both — a fact this file's own `sharedRevalidations` states once. D2 is
// SOURCE-ONLY and present in the plan; D3 is TARGET-ONLY and absent from
// the plan. Neither exclusivity nor plan membership is inferred from the
// other: `sourceOnly`/`targetOnly` (decision-level exclusivity, from 0.8.149)
// and `candidatePresent` (plan membership, from 0.8.158) are computed
// completely independently and merely reported side by side on the same
// entry.
//
// THE IMPORTANT TEST CASE — A DECISION REMAINS SHARED EVEN WHEN BOTH SIDES
// INDEPENDENTLY REVALIDATE IT AS ABSENT. Given `D1(C1/S1, OBSERVE)` on both
// Alice and Bob, and a plan that no longer contains C1/S1: both sides
// independently produce `candidatePresent: false` for their own copy of D1.
// D1 is still reported in `sharedRevalidations`, still `sharedDecisionCount:
// 1`, never demoted to `sourceOnly`/`targetOnly` and never described as a
// "conflict" merely because its own candidate happens to be absent from the
// supplied plan. Absence from `plan` is never reinterpreted as
// disagreement between the two histories.
//
// ANOTHER IMPORTANT CASE — THE IDENTICAL CANDIDATE, DIFFERENT DECISIONS, IS
// NEVER COLLAPSED TO A CANDIDATE-LEVEL COMPARISON. Given `C1/S1 + OBSERVE +
// T1` on Alice and `C1/S1 + DEFER + T2` on Bob, with C1/S1 present in the
// plan on both sides: both revalidate to `candidatePresent: true`, yet the
// two decision RECORDS are structurally distinct (0.8.149's own decision
// identity — candidate + decision + decidedAt), so Alice's own record lands
// in `sourceOnly` and Bob's own lands in `targetOnly`, each carrying its own
// `candidatePresent: true`. This file never groups by candidate identity
// alone to decide sharedness — decision identity, exactly as 0.8.149
// already establishes it, governs `sharedRevalidations`/`sourceOnly`/
// `targetOnly`; `candidatePresent` is a wholly separate fact layered on top
// of whichever partition a decision already falls into.
//
// EVERY EXCLUSIVE/SHARED ENTRY IS A REVALIDATION ENTRY, NEVER A BARE
// DECISION RECORD — SO A CALLER SEES BOTH FACTS IN ONE ARTIFACT.
// `sharedRevalidations`/`sourceOnly`/`targetOnly` each hold 0.8.158's own
// entry shape unchanged — `{ decisionIndex, decision, candidatePresent,
// candidateType, candidateMatchesPlan }` — never a reconstructed copy and
// never the bare `decision` alone: a caller reading one entry sees both the
// historical decision AND its own `candidatePresent`/`candidateMatchesPlan`
// fact together, without a second lookup. `sourceOnly`/`targetOnly` are each
// drawn from that SIDE's own 0.8.158 call (`sourceRevalidation.revalidations`/
// `targetRevalidation.revalidations` respectively) — never the other side's
// — so `decisionIndex` always reflects the entry's own position within its
// own side's full, genuine-filtered history, exactly as 0.8.158 itself
// defines it. `sharedRevalidations` reports the SOURCE's own copy of each
// matched entry — an arbitrary but deterministic and documented choice,
// mirroring 0.8.156's own identical choice for `sharedDecisions` ("source's
// own copy, never target's, and never a reconstructed merge of the two");
// because a shared decision's content is structurally identical on both
// sides and `plan` is the one argument supplied once, the target's own
// matching entry always carries an identical `candidatePresent`/
// `candidateType`/`candidateMatchesPlan` — only `decisionIndex` (the
// entry's own position within EACH side's own history) can legitimately
// differ, which is exactly why only one side's copy is ever reported.
//
// THE DECISION-LEVEL PARTITION ITSELF IS 0.8.149'S OWN, NEVER RECOMPUTED.
// This file calls 0.8.149's own `describeXxx()` exactly once to obtain
// `sourceOnly`/`targetOnly` — the exact decision RECORDS 0.8.149 already
// identifies as exclusive, using ITS OWN multiset difference over decision
// identity (candidate + decision + decidedAt). This file then partitions
// each side's own 0.8.158 `revalidations` array into "exclusive" (an entry
// whose own `decision` matches one of 0.8.149's own exclusive records, by
// the identical structural-identity key, consumed with the identical
// multiset discipline — see `partitionRevalidations()`, below) and "shared"
// (everything left over on that side). Because each side's own
// `revalidations` array is 0.8.158's own one-to-one projection of that
// side's own genuine-filtered history, in that history's own original
// order, this partition reproduces 0.8.149's own partition exactly —
// merely carrying each entry's own revalidation facts along with it. No
// second candidate-matching engine, and no second decision-comparison
// engine, is ever built here.
//
// CANDIDATE-LEVEL PRESENCE COUNTS ARE PER-SIDE, OVER EACH SIDE'S OWN FULL
// HISTORY — NEVER OVER `sourceOnly`/`targetOnly`/`sharedRevalidations`
// ALONE. `sourcePresentCandidateCount`/`sourceAbsentCandidateCount` are read
// straight off `sourceRevalidation` (0.8.158's own tally over the WHOLE
// `sourceHistory`); `targetPresentCandidateCount`/`targetAbsentCandidateCount`
// straight off `targetRevalidation` over the whole `targetHistory`. A
// candidate represented by both a shared decision and a source-exclusive
// decision is still tallied once in `sourcePresentCandidateCount` — this
// file introduces no additional candidate-level grouping of its own beyond
// what 0.8.158 already computes.
//
// NO SINGLE "AGREEMENT" OR "CONFLICT" VERDICT — THE IDENTICAL RESTRAINT
// 0.8.149'S, 0.8.156'S, AND 0.8.158'S OWN HEADERS ALREADY HOLD, HELD HERE
// AGAIN ACROSS TWO REPLICAS AND A PLAN AT ONCE. This result carries no
// `conflict`, `preferred`, `authoritative`, `stale`, `obsolete`,
// `superseded`, `resolved`, `correct`, or `incorrect` field or verb
// anywhere. Two replicas disagreeing about a candidate's disposition is
// stated plainly as two exclusive revalidation entries, one on each side;
// a candidate absent from `plan` on both replicas is stated plainly as
// `candidatePresent: false` on a shared entry. This file draws no
// conclusion about which side is right, whether the plan should be
// trusted, or what happens next.
//
// `sameRevalidation` IS 0.8.149'S OWN `sameHistory`, RENAMED FOR THIS
// MILESTONE'S OWN VOCABULARY, NEVER RECOMPUTED DIFFERENTLY. Because a
// shared decision's `candidatePresent` is always identical on both sides
// (it depends only on that decision's own candidate and the one `plan`
// supplied), `sourceOnly`/`targetOnly` being empty is exactly equivalent to
// the two histories being multiset-identical — 0.8.149's own `sameHistory`
// already states this fact precisely; this file merely reports it under a
// name that fits a projection about revalidation rather than raw history.
// `sameRevalidation: true` never implies `sourcePresentCandidateCount ===
// targetPresentCandidateCount` must hold trivially by coincidence — it
// holds by construction, since identical histories against the identical
// plan produce identical per-side tallies.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO CLOCK. Neither
// `sourceHistory`, `targetHistory` (nor any entry either holds), nor `plan`
// (nor any object inside it) is ever mutated. Calling this function twice
// with equivalent arguments returns a byte-identical result.
//
// AN EMPTY OR ENTIRELY MALFORMED `sourceHistory`/`targetHistory`/`plan` IS
// AN EXPLICIT, EMPTY OUTCOME, NEVER A THROW — INHERITED WHOLE FROM 0.8.149
// AND 0.8.158, NEVER RE-VALIDATED HERE. `null`, `undefined`, a non-array
// history, or a history containing only non-genuine entries degrades on
// that side to `0` for every count and `[]` for every array, exactly as
// 0.8.149's/0.8.158's own tolerance already establishes; a malformed `plan`
// is handed straight through, unchanged, to both 0.8.158 calls, exactly as
// 0.8.158 itself hands it straight through to 0.8.157. This file adds no
// validation of its own beyond what 0.8.149 and 0.8.158 already perform.
//
// ARCHITECTURAL BOUNDARY — EXACTLY TWO IMPORTS, 0.8.158'S OWN HISTORY-
// REVALIDATION PROJECTION AND 0.8.149'S OWN HISTORY-DIFFERENCE PROJECTION,
// NOTHING ELSE. This file imports nothing from
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidationView.js`
// (0.8.157 — 0.8.158 already composes it), `application/
// PublisherLeaderboardClaimSnapshotReconciliationPlanView.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryView.js`
// (0.8.150's own archive-reading seam), `application/
// PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionView.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreementView.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliation.js`, any
// correspondence/verification/signature module, or any archive module — it
// trusts nothing about how either history or `plan` was produced beyond
// their own documented shapes, never calls 0.8.144 to make a new selection,
// never calls 0.8.145 to record a new decision, and never interprets
// `OBSERVE`/`DEFER` in any way.
//
// NO `reconstructXxx()` ENTRY POINT — DELIBERATELY, FOR THE IDENTICAL REASON
// 0.8.157/0.8.158 SHIP WITHOUT ONE. `plan` remains an explicitly supplied,
// in-memory artifact; the archive stores decision history (0.8.150's own
// seam) on each replica, but it stores no reconciliation PLAN of any kind. A
// caller who genuinely wants an archive-backed comparison composes this
// file's own `describeXxx()` with 0.8.150's own
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory()`
// (run once per side) themselves; inventing a plan to pair it with is not
// this file's job, any more than it was 0.8.157's or 0.8.158's.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Rediscovering candidates, or reconstructing a plan.** This file calls
//   0.8.158 once per side and 0.8.149 once, and reports exactly what they
//   return.
// - **Re-running 0.8.144, or recomputing any decision.** No new selection or
//   decision is ever created here.
// - **Interpreting `OBSERVE`/`DEFER`, comparing `decidedAt` timestamps, or
//   determining whether a decision is "stale."** See "No single 'agreement'
//   or 'conflict' verdict," above.
// - **`conflict`/`preferred`/`authoritative`/`stale`/`obsolete`/
//   `superseded`/`resolved`/`correct`/`incorrect`/any state-machine verdict
//   about a decision, a candidate, or a replica.** See "No single
//   'agreement' or 'conflict' verdict," above.
// - **Modifying either decision history or the plan.** Neither argument, nor
//   any object inside any of them, is ever mutated.
// - **Deduplicating decisions or candidates within any array in the
//   result.** Multiset multiplicity is preserved throughout, exactly as
//   0.8.149 and 0.8.158 already establish independently.
// - **Reading the current archive to manufacture a plan.** See "No
//   `reconstructXxx()` entry point," above.
// - **Merging, folding, or exporting `sourceOnly`/`targetOnly` into either
//   history.** Every array here is a read-only fact about the comparison.
// - **Persistence, synchronization, or any automatic/background/periodic
//   computation of any kind.** This function runs only when a caller
//   explicitly calls it.
export function describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationDifference(sourceHistory, targetHistory, plan) {
    const sourceRevalidation = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation(sourceHistory, plan);
    const targetRevalidation = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation(targetHistory, plan);
    const difference = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference(sourceHistory, targetHistory);

    const sourcePartition = partitionRevalidations(sourceRevalidation.revalidations, difference.sourceOnly);
    const targetPartition = partitionRevalidations(targetRevalidation.revalidations, difference.targetOnly);

    return Object.freeze({
        sourceDecisionCount: sourceRevalidation.decisionCount,
        targetDecisionCount: targetRevalidation.decisionCount,

        sharedDecisionCount: sourcePartition.shared.length,
        sourceOnlyDecisionCount: sourcePartition.exclusive.length,
        targetOnlyDecisionCount: targetPartition.exclusive.length,

        sharedRevalidations: Object.freeze(sourcePartition.shared),
        sourceOnly: Object.freeze(sourcePartition.exclusive),
        targetOnly: Object.freeze(targetPartition.exclusive),

        sourcePresentCandidateCount: sourceRevalidation.presentCandidateCount,
        sourceAbsentCandidateCount: sourceRevalidation.absentCandidateCount,
        targetPresentCandidateCount: targetRevalidation.presentCandidateCount,
        targetAbsentCandidateCount: targetRevalidation.absentCandidateCount,

        sameRevalidation: difference.sameHistory
    });
}

// Splits ONE side's own 0.8.158 `revalidations` array into the entries
// whose own `decision` matches one of `exclusiveDecisions` (0.8.149's own
// exclusive records for this side, e.g. `difference.sourceOnly`) and the
// entries that do not — reproducing 0.8.149's own multiset partition
// exactly, over revalidation entries instead of bare decision records. See
// this file's own header, "The decision-level partition itself is 0.8.149's
// own, never recomputed." Each `exclusiveDecisions` record cancels out AT
// MOST ONE occurrence in `revalidations`, matched by exact decision
// identity (`canonicalDecisionKey()`, below) — the identical multiset
// discipline 0.8.149's own `extractUnmatched()` already holds. Both
// returned arrays preserve `revalidations`' own original order.
function partitionRevalidations(revalidations, exclusiveDecisions) {
    const remaining = new Map();
    for (const record of exclusiveDecisions) {
        const key = canonicalDecisionKey(record);
        remaining.set(key, (remaining.get(key) || 0) + 1);
    }

    const exclusive = [];
    const shared = [];
    for (const revalidation of revalidations) {
        const key = canonicalDecisionKey(revalidation.decision);
        const count = remaining.get(key) || 0;
        if (count > 0) {
            remaining.set(key, count - 1);
            exclusive.push(revalidation);
        } else {
            shared.push(revalidation);
        }
    }
    return { exclusive, shared };
}

// The one, uniform decision identity 0.8.149 already established — exact
// structural equality of `candidate` + `decision` + `decidedAt` — duplicated
// here for the identical reason 0.8.156's own `canonicalDecisionKey()` is
// duplicated: 0.8.149 keeps it private, and this file's own partition must
// apply the exact same key it used internally to produce
// `difference.sourceOnly`/`difference.targetOnly`, or the two multisets
// would not line up.
function canonicalDecisionKey(record) {
    return JSON.stringify({ candidate: record.candidate, decision: record.decision, decidedAt: record.decidedAt });
}
