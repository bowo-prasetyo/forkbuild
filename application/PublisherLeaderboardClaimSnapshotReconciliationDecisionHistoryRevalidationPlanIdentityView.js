import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation } from './PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationView.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity } from './PublisherLeaderboardClaimSnapshotReconciliationPlanIdentity.js';

// 0.8.161 — Reconciliation Decision History Revalidation Plan Identity
// Projection.
//
// 0.8.158 answers "which of this history's own recorded decisions still
// name a candidate present in this explicitly supplied plan?" — a set of
// revalidation facts about `plan`, but with no durable, comparable way to
// say WHICH plan produced them beyond the plan OBJECT itself. 0.8.160
// answers "what is this plan's own structural identity?" — a fingerprint,
// entirely indifferent to any decision history. This file asks the
// question neither one asks alone: given a decision history and an
// explicitly supplied plan, what are the revalidation facts, TOGETHER WITH
// a durable statement of exactly which plan they were computed against?
//
//   decisionHistory ──┐
//                     ├── 0.8.158 ── decision revalidations ──┐
//   plan ─────────────┤                                        │
//                     └── 0.8.160 ── plan identity ────────────┤
//                                                                ▼
//                                                  combined projection
//
//   describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentity(decisionHistory, plan)
//     -> { planIdentity: { algorithm, planFingerprint, candidateCount },
//          decisionCount, revalidations,
//          presentCandidateCount, absentCandidateCount }
//
// A THIN COMPOSITION OVER 0.8.158 AND 0.8.160, NEVER A THIRD COMPARISON
// ENGINE — THE ONE ARCHITECTURAL CHOICE THIS MILESTONE EXISTS TO HOLD. This
// file computes nothing about candidate identity, plan membership, or plan
// fingerprinting that 0.8.158 and 0.8.160 do not already compute; it calls
// each exactly once — 0.8.158 with `decisionHistory` and `plan`, 0.8.160
// with the identical `plan` — and embeds their complete results, unchanged,
// under `revalidations`/`decisionCount`/`presentCandidateCount`/
// `absentCandidateCount` (0.8.158's own fields, spread into the top level)
// and `planIdentity` (0.8.160's own result, embedded whole) respectively. It
// invents no new matching rule and no new fingerprint algorithm.
//
// `planFingerprint` AND `candidateMatchesPlan` REMAIN SEPARATE FACTS —
// NEVER CONFLATED, NEVER DERIVED FROM ONE ANOTHER. `planIdentity` describes
// the supplied `plan` AS A WHOLE — a structural identity that does not vary
// per decision. Each `revalidations` entry's own `candidateMatchesPlan`
// describes the relationship between ONE historical decision's own
// candidate and that same plan. The two facts sit side by side in this
// file's own result, computed by two entirely independent code paths
// (0.8.158 never reads `planIdentity`, 0.8.160 never reads
// `decisionHistory`), and neither is inferred from the other. The identical
// historical decision, revalidated against two structurally different
// plans, therefore reads two different `planFingerprint` values (this
// file's own `planIdentity.planFingerprint`, once per call) alongside
// possibly-different `candidateMatchesPlan` values — but a caller must
// never assume the two move together: a decision's candidate can remain
// present (`candidateMatchesPlan: true`) even though `planFingerprint`
// changed, whenever the plan's edit left that one candidate untouched. See
// this milestone's own flagship, below.
//
// TWO STRUCTURALLY IDENTICAL PLANS, REACHED BY TWO DIFFERENT OBJECTS,
// PRODUCE THE IDENTICAL `planFingerprint` — 0.8.160'S OWN GUARANTEE, HELD
// HERE UNCHANGED. Object identity of `plan` plays no role in either 0.8.158
// or 0.8.160; both read `plan`'s own structural content. Calling this file
// twice with two independently constructed but structurally equivalent
// `plan` arguments (and an equivalent `decisionHistory`) returns a
// byte-identical result.
//
// FLAGSHIP — THE SAME HISTORY AGAINST TWO DIFFERENT PLANS PRODUCES TWO
// DIFFERENT PLAN IDENTITIES ALONGSIDE DIFFERENT MEMBERSHIP FACTS, NEITHER
// ONE A VERDICT ABOUT THE OTHER. Given history `D1(C1)->OBSERVE`,
// `D2(C2)->DEFER`, `D3(C1)->OBSERVE` (D1 and D3 name the identical
// candidate C1), revalidated once against plan P1 (naming C1 and C2) and
// once against plan P2 (naming only C1): P1 and P2 fingerprint differently
// (`planIdentity.planFingerprint` differs), while D1/D3 read
// `candidatePresent: true` against BOTH plans and D2 reads
// `candidatePresent: true` against P1 but `candidatePresent: false` against
// P2. The decision records themselves — `D1`, `D2`, `D3` — are identical,
// byte for byte, in both calls; only the two independently-computed facts
// (`planIdentity`, `candidatePresent`) differ, and only because the
// supplied `plan` differs. Neither call says P1 or P2 is more correct,
// current, or authoritative — only that these decisions were revalidated
// against a plan of this particular identity, with these particular
// membership results.
//
// "AGAINST WHICH PLAN" IS NEVER "WHICH PLAN IS RIGHT" — 0.8.160'S OWN LINE,
// HELD HERE AGAIN. This file adds a durable identity to a set of
// revalidation facts; it does not say the plan is complete, current,
// correct, preferred, or authoritative, and it does not rank, prefer, or
// validate the plan or any decision against it in any way.
//
// AN EMPTY OR ENTIRELY MALFORMED `decisionHistory`/`plan` IS AN EXPLICIT,
// EMPTY OUTCOME, NEVER A THROW — INHERITED WHOLE FROM 0.8.158 AND 0.8.160,
// NEVER RE-VALIDATED HERE. `null`, `undefined`, a non-array
// `decisionHistory`, or one containing only non-genuine entries degrades to
// `decisionCount: 0`/`presentCandidateCount: 0`/`absentCandidateCount: 0`/
// `revalidations: []`, exactly as 0.8.158 already establishes; a malformed
// or absent `plan` degrades `planIdentity` to the identical empty-plan
// fingerprint 0.8.160 already produces for such input, and is handed
// straight through, unchanged, to the 0.8.158 call as well. This file adds
// no validation of its own beyond what 0.8.158 and 0.8.160 already perform.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO CLOCK. Neither
// `decisionHistory` (nor any entry it holds) nor `plan` (nor any object
// inside it) is ever mutated. Calling this function twice with equivalent
// arguments returns a byte-identical result.
//
// ARCHITECTURAL BOUNDARY — EXACTLY TWO IMPORTS, 0.8.158'S OWN HISTORY-
// REVALIDATION PROJECTION AND 0.8.160'S OWN PLAN-IDENTITY PROJECTION,
// NOTHING ELSE. This file imports nothing from
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidationView.js`
// (0.8.157 — 0.8.158 already composes it), `application/
// PublisherLeaderboardClaimSnapshotReconciliation.js` (0.8.144's own
// candidate-selection boundary), `application/
// PublisherLeaderboardClaimSnapshotReconciliationPlanView.js`, `application/
// PublisherLeaderboardClaimSnapshotReconciliationDecision.js`, any
// decision-history module, any correspondence/verification/signature
// module, or any archive module — it trusts nothing about how
// `decisionHistory` or `plan` was produced beyond their own documented
// shapes, performs no candidate selection or matching of its own, and
// computes no fingerprint of its own.
//
// NO `reconstructXxx()` ENTRY POINT — DELIBERATELY, FOR THE IDENTICAL REASON
// 0.8.157/0.8.158/0.8.160 SHIP WITHOUT ONE. `plan` remains an explicitly
// supplied, in-memory artifact; the archive stores decision history
// (0.8.150's own seam), but it stores no reconciliation PLAN of any kind. A
// caller who genuinely wants an archive-backed decision history composes
// this file's own `describeXxx()` with 0.8.150's own
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory()`
// themselves; inventing a plan to pair it with is not this file's job, any
// more than it was 0.8.157's, 0.8.158's, or 0.8.160's.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Rediscovering candidates, reconstructing a plan, or computing a
//   fingerprint of any kind.** This file calls 0.8.158 once and 0.8.160
//   once, and reports exactly what they return.
// - **Re-running 0.8.144, or recomputing any decision.** No new selection or
//   decision is ever created here.
// - **Interpreting `OBSERVE`/`DEFER`, `candidatePresent`, or
//   `planFingerprint` in any way.** See "'Against which plan' is never
//   'which plan is right,'" above.
// - **`resolved`/`superseded`/`stale`/`preferred`/`authoritative`/`current`/
//   `correct`/`incorrect`/any state-machine verdict about a decision, a
//   candidate, or a plan.** See "'Against which plan' is never 'which plan
//   is right,'" above.
// - **Modifying the decision history or the plan.** Neither argument, nor
//   any object inside either, is ever mutated.
// - **Deduplicating decisions or candidates anywhere in the result.**
//   Multiset multiplicity is preserved throughout, exactly as 0.8.158
//   already establishes.
// - **Reading the current archive to manufacture a plan.** See "No
//   `reconstructXxx()` entry point," above.
// - **Comparing two plan identities, or two revalidation results, against
//   one another.** A caller already has everything needed with `===` over
//   two `planFingerprint` values, mirroring 0.8.160's own identical
//   restraint; a dedicated comparison over this file's own combined result
//   is separately sized later work (0.8.162, per this milestone's own
//   request), never built here.
// - **Persistence, synchronization, or any automatic/background/periodic
//   computation of any kind.** This function runs only when a caller
//   explicitly calls it.
export function describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentity(decisionHistory, plan) {
    const revalidation = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation(decisionHistory, plan);
    const planIdentity = describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(plan);

    return Object.freeze({
        planIdentity,
        decisionCount: revalidation.decisionCount,
        revalidations: revalidation.revalidations,
        presentCandidateCount: revalidation.presentCandidateCount,
        absentCandidateCount: revalidation.absentCandidateCount
    });
}
