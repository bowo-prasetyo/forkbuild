import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation } from './PublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidationView.js';

// 0.8.158 — Reconciliation Decision History Revalidation Projection.
//
// 0.8.157 answered "does THIS ONE historical decision's own candidate still
// occur in THIS explicitly supplied plan?" for exactly one decision record
// at a time. This file is the sequence-level scale-up of that same
// question, never a new algorithm: given an entire decision HISTORY
// (0.8.146's own plain, ordered array of 0.8.145 decision records) and one
// explicitly supplied plan, which of that history's own recorded decisions
// still name a candidate present in that plan?
//
//   decisionHistory                   plan
//   (0.8.146's own array,             (0.8.143's own result,
//    EXPLICITLY SUPPLIED)              EXPLICITLY SUPPLIED)
//        │                                    │
//        └──────────────────┬─────────────────┘
//                            ▼
//   describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation()
//                            │
//              (0.8.157, called once per genuine decision,
//               the identical `plan` passed every time)
//                            ▼
//   { decisionCount, presentCandidateCount, absentCandidateCount,
//     revalidations: [{ decisionIndex, decision, candidatePresent,
//                        candidateType, candidateMatchesPlan }] }
//
// A THIN SEQUENCE WRAPPER OVER 0.8.157, NEVER A SECOND COMPARISON ENGINE.
// This file computes nothing about candidate identity, plan membership, or
// decision genuineness that 0.8.157 does not already compute; it exists
// only to call 0.8.157 once per genuine decision in `decisionHistory`,
// passing the SAME `plan` argument unchanged every time, and to collect the
// results in order. It invents no new matching rule, and duplicates none of
// 0.8.144's own candidate-identity logic — that logic lives in 0.8.157,
// reused here exactly as 0.8.157 itself reused it from 0.8.144.
//
// "PRESENT IN THE SUPPLIED PLAN" IS STILL NEVER "CORRECT," "STALE,"
// "RESOLVED," OR "SUPERSEDED" — 0.8.157's OWN RESTRAINT, HELD HERE AGAIN
// OVER A WHOLE HISTORY. Every `revalidations` entry states exactly the fact
// 0.8.157 already states about one decision: whether its own candidate
// occurs, by 0.8.144's own identity rule, in the one `plan` object the
// caller actually supplied. Nothing here about `OBSERVE`/`DEFER`, about how
// long ago a decision was recorded, or about whether the underlying claims
// or snapshots have since changed enters into any field of this result.
//
// EVERY GENUINE DECISION GETS ITS OWN ENTRY — NEVER DEDUPLICATED, NEVER
// REORDERED. `decisionCount` counts stored HISTORY ENTRIES, exactly as
// 0.8.147's own `decisionCount` does: `[D1, D1, D2]`, where both `D1`
// entries are genuine, produces THREE `revalidations` entries, not two —
// this is a projection of decision history, and a decision recorded twice
// was recorded twice. `decisionIndex` is each entry's own position within
// the genuine-filtered sequence (equivalently, its position within
// `revalidations` itself); a malformed entry elsewhere in `decisionHistory`
// is silently excluded (see "Malformed input," below) and never claims an
// index of its own. `revalidations` otherwise preserves `decisionHistory`'s
// own existing order — oldest recorded first, never re-sorted.
//
// CANDIDATE-LEVEL PRESENCE IS COMPUTED SEPARATELY FROM DECISION-LEVEL
// PRESENCE — REUSING 0.8.147'S OWN "DECISION COUNT vs. DISTINCT CANDIDATE
// COUNT" DISTINCTION ONE LAYER OVER. `presentCandidateCount`/
// `absentCandidateCount` tally DISTINCT CANDIDATES named anywhere in
// `decisionHistory` — the complete structural identity key 0.8.147 already
// defines (`type` + `claimId`/`snapshotIndex`, exactly as that type's own
// 0.8.144 shape carries them), each counted once no matter how many
// decisions were ever recorded against it. Because 0.8.157's own
// `candidatePresent` depends only on a candidate's own identity and `plan`
// — never on which decision named it, or on that decision's own disposition
// or `decidedAt` — every decision naming the identical candidate against
// the identical `plan` always agrees on `candidatePresent`, so grouping by
// candidate identity to produce these two counts introduces no ambiguity.
// Concretely, given this milestone's own worked example — `D1 -> C1`,
// `D2 -> C1`, `D3 -> C2`, with both `C1` and `C2` present in `plan` —
// `decisionCount` is `3` (three history entries) while
// `presentCandidateCount` is `2` (two distinct candidates, both present).
//
// FLAGSHIP: A DECISION REMAINS A HISTORICAL FACT EVEN WHEN ITS OWN
// CANDIDATE HAS SINCE DROPPED OUT OF A LATER PLAN. Given the history
// `D1(C1/S1)->OBSERVE`, `D2(C2)->DEFER`, `D3(C1/S2)->OBSERVE`,
// `D4(S3)->DEFER`, revalidated against a later plan naming only `C1/S1`,
// `C2`, and `S3`: `D1`, `D2`, and `D4` read `candidatePresent: true`, and
// `D3` reads `candidatePresent: false` — but `D3` itself is echoed in the
// result completely unchanged, still `OBSERVE`, still recorded against
// `C1/S2`. `candidatePresent: false` is never rewritten, upgraded, or
// annotated as "wrong," "superseded," or "obsolete" anywhere in this file.
// The distinction this whole milestone exists to hold:
//
//   historical fact:          "this decision was recorded"
//   current comparison fact:  "its candidate is/isn't present in this
//                               supplied plan"
//
// DECISION DISPOSITION NEVER AFFECTS CANDIDATE MATCHING — INHERITED
// UNCHANGED FROM 0.8.157. `OBSERVE` and `DEFER` entries naming the
// identical candidate against the identical `plan` always produce
// identical `candidatePresent`/`candidateMatchesPlan` values; this file
// interprets neither value in any way.
//
// AN EMPTY OR ENTIRELY MALFORMED `decisionHistory` IS AN EXPLICIT, EMPTY
// OUTCOME, NEVER A THROW. `null`, `undefined`, a non-array, or an array
// containing only entries that are not genuine `{ decided: true, candidate,
// decision, decidedAt }` records (0.8.157's/0.8.153's/0.8.156's own,
// duplicated `isGenuineDecision()` rule, applied here once more for the
// identical reason those files each duplicate it) produces
// `{ decisionCount: 0, presentCandidateCount: 0, absentCandidateCount: 0,
// revalidations: [] }`. A non-genuine entry mixed into an otherwise genuine
// `decisionHistory` is silently excluded from every count and from
// `revalidations`, mirroring 0.8.146's/0.8.147's own tolerance for
// malformed history entries exactly. A malformed `plan` is handed straight
// through, unchanged, to every 0.8.157 call — this file adds no plan
// validation of its own, exactly as 0.8.157 itself adds none beyond what
// 0.8.144 already tolerates.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO CLOCK. Neither
// `decisionHistory` (nor any entry it holds) nor `plan` (nor any object
// inside it) is ever mutated. Calling this function twice with equivalent
// arguments returns a byte-identical result.
//
// ARCHITECTURAL BOUNDARY — EXACTLY ONE IMPORT, 0.8.157'S OWN
// DECISION-TO-PLAN REVALIDATION BOUNDARY, NOTHING ELSE. This file imports
// nothing from `application/PublisherLeaderboardClaimSnapshotReconciliationPlanView.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryView.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliation.js`, any
// correspondence/verification/signature module, or any archive module — it
// trusts nothing about how `decisionHistory` or `plan` was produced beyond
// their own documented shapes, and never calls 0.8.144 to make a new
// selection, never calls 0.8.145 to record a new decision, and never
// interprets `OBSERVE`/`DEFER` in any way.
//
// NO `reconstructXxx()` ENTRY POINT — DELIBERATELY, NOT AN OVERSIGHT, FOR
// THE IDENTICAL REASON 0.8.157 SHIPS WITHOUT ONE. `plan` remains an
// explicitly supplied, in-memory artifact; the archive stores decision
// history (0.8.150's own seam), but it stores no reconciliation PLAN of any
// kind. A caller who genuinely wants an archive-backed decision history
// composes this file's own `describeXxx()` with 0.8.150's own
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory()`
// themselves; inventing a plan to pair it with is not this file's job, any
// more than it was 0.8.157's.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Rediscovering candidates, or reconstructing a plan.** This file calls
//   0.8.157 once per genuine decision and reports exactly what it returns.
// - **Re-running 0.8.144, or recomputing any decision.** No new selection
//   or decision is ever created here.
// - **Interpreting `OBSERVE`/`DEFER`, comparing `decidedAt` timestamps, or
//   determining whether a decision is "stale."** See "Flagship," above.
// - **`resolved`/`superseded`/`obsolete`/`invalid`/any state-machine
//   verdict about a decision or a candidate.** A `candidatePresent: false`
//   entry states one fact about `plan` alone; it says nothing about the
//   decision's own correctness or currency.
// - **Modifying the decision history or the plan.** Neither argument, nor
//   any object inside either, is ever mutated.
// - **Deduplicating decisions or candidates within `revalidations`.** See
//   "Every genuine decision gets its own entry," above.
// - **Reading the current archive to manufacture a plan.** See "No
//   `reconstructXxx()` entry point," above.
// - **Comparing the revalidation results of two different decision
//   histories against the same plan.** That is separate, later work
//   (0.8.159, per this milestone's own request).
// - **Persistence, synchronization, or any automatic/background/periodic
//   computation of any kind.** This function runs only when a caller
//   explicitly calls it.
export function describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation(decisionHistory, plan) {
    const entries = (Array.isArray(decisionHistory) ? decisionHistory : []).filter(isGenuineDecision);

    const revalidations = entries.map((entry, decisionIndex) => {
        const revalidation = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation(entry, plan);
        return Object.freeze({
            decisionIndex,
            decision: revalidation.decision,
            candidatePresent: revalidation.candidatePresent,
            candidateType: revalidation.candidateType,
            candidateMatchesPlan: revalidation.candidateMatchesPlan
        });
    });

    const presenceByCandidateKey = new Map();
    for (let i = 0; i < entries.length; i += 1) {
        presenceByCandidateKey.set(candidateIdentityKey(entries[i].candidate), revalidations[i].candidatePresent);
    }
    let presentCandidateCount = 0;
    let absentCandidateCount = 0;
    for (const present of presenceByCandidateKey.values()) {
        if (present) {
            presentCandidateCount += 1;
        } else {
            absentCandidateCount += 1;
        }
    }

    return Object.freeze({
        decisionCount: entries.length,
        presentCandidateCount,
        absentCandidateCount,
        revalidations: Object.freeze(revalidations)
    });
}

// A genuine 0.8.145 decision record — duplicated from 0.8.153's/0.8.156's/
// 0.8.157's own private `isGenuineDecision()` for the identical reason
// those files each duplicate it: this file must apply the exact same
// genuineness rule without importing a module that itself carries
// plan/discovery vocabulary.
function isGenuineDecision(entry) {
    return (
        entry !== null && typeof entry === 'object'
        && entry.decided === true
        && entry.candidate !== null && typeof entry.candidate === 'object'
        && typeof entry.candidate.type === 'string'
        && (entry.decision === 'OBSERVE' || entry.decision === 'DEFER')
        && typeof entry.decidedAt === 'string'
    );
}

// The complete structural candidate identity key — 0.8.147's own rule,
// duplicated here for the identical reason `isGenuineDecision()` is:
// `type` is always part of the key; `claimId`/`snapshotIndex` are included
// only when 0.8.144's own shape for that `type` actually carries them, so a
// candidate lacking a field is never coerced into matching one that
// legitimately carries `undefined`.
function candidateIdentityKey(candidate) {
    if (candidate.type === 'DIVERGENT_CORRESPONDENCE') {
        return `DIVERGENT_CORRESPONDENCE:${candidate.claimId}:${candidate.snapshotIndex}`;
    }
    if (candidate.type === 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT') {
        return `CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT:${candidate.claimId}`;
    }
    if (candidate.type === 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM') {
        return `SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM:${candidate.snapshotIndex}`;
    }
    return `UNKNOWN:${JSON.stringify(candidate)}`;
}
