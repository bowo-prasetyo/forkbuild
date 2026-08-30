import { describePublisherLeaderboardClaimSnapshotReconciliationCandidate } from './PublisherLeaderboardClaimSnapshotReconciliation.js';

// 0.8.157 — Historical Reconciliation Decision-to-Plan Candidate
// Revalidation Projection.
//
// 0.8.153 answered "which candidate does this historical decision refer
// to?" — read straight off the decision record's own embedded `candidate`,
// never rediscovered. That file's own header draws the line this milestone
// exists to sit on the other side of: "the underlying claims, snapshots, or
// archive may have changed in every way since a decision was recorded...
// NONE of that has any bearing here. A historical decision remains a
// historical record." This file asks the one question 0.8.153 deliberately
// never asks: given that SAME historical decision, and a caller-supplied,
// EXPLICIT reconciliation plan — which may be a fresh 0.8.143 result, an
// old one kept on purpose, or another replica's own plan — does the
// decision's own embedded candidate still occur in THAT plan?
//
//   decisionRecord                    plan
//   (a genuine 0.8.145 record,        (0.8.143's own result,
//    EXPLICITLY SUPPLIED)              EXPLICITLY SUPPLIED)
//        │                                    │
//        └──────────────────┬─────────────────┘
//                            ▼
//   describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation()
//                            │
//                            ▼
//   { decision, candidatePresent, candidateType, candidateMatchesPlan }
//
// TWO SEPARATE ARTIFACTS, NEITHER ONE OVERWRITING THE OTHER — THE FLAGSHIP
// ARCHITECTURAL PRINCIPLE THIS MILESTONE EXISTS TO HOLD. `decisionRecord`
// describes what a caller decided, once, against whatever plan existed at
// that moment; `plan` describes what a caller now asserts to be true,
// explicitly supplied, possibly the very same plan, possibly a different
// one entirely, possibly a plan derived from a claim history and snapshot
// sequence that have moved on since. This file never conflates the two: it
// echoes `decisionRecord` in its result completely unchanged, and reports
// `candidatePresent`/`candidateMatchesPlan` as fresh, independent facts
// about `plan` alone. Neither field is ever written back onto
// `decisionRecord`, and `decisionRecord` itself is never mutated.
//
// "PRESENT IN THE SUPPLIED PLAN" IS NEVER "CORRECT," "STALE," "RESOLVED,"
// OR "SUPERSEDED." A `candidatePresent: false` result states exactly one
// fact — the exact candidate this decision named does not occur, by 0.8.144's
// own identity rule, anywhere in the plan the caller happened to supply. It
// does not say the historical decision was wrong, that it is now obsolete,
// that it should be revisited, or that anything should change. A caller
// who supplies the SAME plan the decision was originally recorded against
// will always see `candidatePresent: true` — this file computes no passage
// of time, no staleness, and no "as of when" fact of its own; it reports
// membership in the one plan object it was actually handed, nothing more.
//
// 0.8.144'S EXACT CANDIDATE IDENTITY SEMANTICS, REUSED, NEVER A SECOND
// MATCHER. A candidate is present in `plan` under precisely the rule
// `describePublisherLeaderboardClaimSnapshotReconciliationCandidate()`
// (0.8.144, UNCHANGED) already applies when a caller selects it: a
// `DIVERGENT_CORRESPONDENCE` candidate is looked up in
// `plan.divergentCorrespondences` by `claimId` AND `snapshotIndex` together
// (both required — a claim genuinely diverging against two snapshots names
// two distinct candidates, never one); a `CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT`
// candidate is looked up in `plan.claimsWithoutCorrespondence` by `claimId`
// alone; a `SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM` candidate is looked up in
// `plan.snapshotsWithoutCorrespondence` by `snapshotIndex` alone. This file
// calls 0.8.144 itself, passing `plan` and a `selection` built directly
// from the decision's own embedded `candidate` — it invents no second,
// parallel candidate-matching algorithm of its own. `candidateMatchesPlan`
// is exactly `candidate.selected` from that one call; `candidatePresent` is
// its own name for the identical fact, chosen because "selected" would
// wrongly suggest a caller is choosing something new here, when nothing is
// being selected — only revalidated against an explicitly supplied plan.
// (`candidatePresent` and `candidateMatchesPlan` are therefore always equal
// to one another; both are reported because a caller reading only for
// "does this still exist" reaches for the former, and a caller reading
// specifically about `plan` reaches for the latter — this file states the
// one underlying fact under both names rather than forcing every caller to
// pick which name to import.)
//
// THE THREE CANDIDATE TYPES ARE NEVER COLLAPSED — 0.8.144's OWN THREE-VALUE
// VOCABULARY, UNCHANGED. `candidateType` is read straight off the decision's
// own `candidate.type`, one of `DIVERGENT_CORRESPONDENCE`,
// `CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT`, or `SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM`
// — this file introduces no fourth category, and never treats two candidates
// as the same merely because they carry a numerically or string-wise similar
// `claimId`/`snapshotIndex` under a different `type`. `selectionFor()` below
// builds a 0.8.144 `selection` using exactly the fields that `type` carries,
// never inventing a `claimId`/`snapshotIndex` a candidate's own shape does
// not have.
//
// DECISION DISPOSITION NEVER AFFECTS CANDIDATE MATCHING. `decisionRecord.decision`
// (`'OBSERVE'` or `'DEFER'`) is carried through unchanged inside the echoed
// `decision` field and plays no role whatsoever in computing
// `candidatePresent`/`candidateMatchesPlan` — those two facts depend only on
// `decisionRecord.candidate` and `plan`. An `OBSERVE` decision and a `DEFER`
// decision naming the identical candidate against the identical plan always
// produce identical `candidatePresent`/`candidateMatchesPlan` values.
//
// AN INVALID DECISION RECORD IS AN EXPLICIT OUTCOME, NEVER A THROW. A
// `decisionRecord` that is not a genuine `{ decided: true, candidate,
// decision, decidedAt }` record (see `isGenuineDecision()` below, duplicated
// from 0.8.153's/0.8.156's own private helper for the identical reason those
// files duplicate it) produces `{ decision: null, candidatePresent: false,
// candidateType: null, candidateMatchesPlan: false }` — never an exception.
// A malformed `plan` is handed straight to 0.8.144's own call, which already
// degrades a non-object `plan`, a `plan` missing the relevant list, or a
// relevant list that is not itself a genuine array, to `INVALID_SELECTION`/
// zero candidates; this file adds no second validation layer of its own,
// and a genuine decision against such a plan simply reads
// `candidatePresent: false` — the exact candidate this decision names
// cannot be found in whatever `plan` turned out to contain. A relevant list
// that IS a genuine array of genuine, well-shaped entries but none of them
// match is likewise `candidatePresent: false`, for the identical reason —
// this file inherits 0.8.144's own entry-matching tolerance exactly as it
// stands, with no independent shape-checking of its own.
//
// NO AUTOMATIC RECONSTRUCTION OF A PLAN FROM CURRENT ARCHIVE STATE, AND NO
// `reconstructXxx()` ENTRY POINT AT ALL — DELIBERATELY, NOT AN OVERSIGHT.
// Every other file in this family pairs a pure `describeXxx()` with a thin,
// archive-reading `reconstructXxx()` that pulls THIS replica's own CURRENT
// decision history — because the archive genuinely stores decisions
// (0.8.150's own seam). The archive stores no reconciliation PLAN of any
// kind, and never has: a plan is 0.8.143's own, derived, in-memory artifact
// over a claim history and a supplied snapshot sequence, never a durable
// record this codebase persists anywhere. A `reconstructXxx()` that quietly
// rebuilt "whatever plan this replica's current claim history and some
// guessed snapshot sequence would produce right now" would invent a plan on
// the caller's behalf — exactly the automatic-selection mistake 0.8.144's
// own header already forbids, one layer up, over an entire plan instead of
// one field of one. This file therefore ships with `describeXxx()` alone,
// mirroring `application/PublisherLeaderboardSnapshotDifference.js`'s own,
// identically-reasoned choice to have no reconstruction entry point at all:
// both of THIS file's inputs are already-computed, historical/explicit
// artifacts a caller already holds — never something this file should
// silently replace with "whatever this replica currently computes." A
// caller who genuinely wants a decision-history-from-archive convenience
// wrapper composes this file's own `describeXxx()` with 0.8.150's own
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory()`
// themselves; inventing a plan to pair it with is not this file's job.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO CLOCK. Neither
// `decisionRecord` nor `plan` (nor any object inside either) is ever
// mutated. Calling this function twice with equivalent arguments — even
// reached by two entirely independent code paths — returns a byte-identical
// result.
//
// ARCHITECTURAL BOUNDARY — EXACTLY ONE IMPORT, 0.8.144'S OWN CANDIDATE-
// SELECTION BOUNDARY, NOTHING ELSE. This file imports nothing from
// `application/PublisherLeaderboardClaimSnapshotReconciliationPlanView.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryView.js`,
// `application/PublisherLeaderboardClaimSnapshotDivergenceView.js`, any
// correspondence/verification/signature module, or any archive module — it
// trusts nothing about how `decisionRecord` or `plan` was produced beyond
// their own documented shapes, and never calls 0.8.144 to make a NEW
// selection on the caller's behalf, never calls 0.8.145 to create a new
// decision, and never interprets `OBSERVE`/`DEFER` in any way.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Calling 0.8.144 to make a new selection, or 0.8.145 to record a new
//   decision.** This file only revalidates an already-recorded candidate
//   against an already-supplied plan; it creates no new decision of any
//   kind, and 0.8.144 is called here exactly once, purely as a lookup.
// - **Interpreting `OBSERVE`/`DEFER`, or changing the historical decision in
//   any way.** See "Decision disposition never affects candidate matching,"
//   above.
// - **`resolved`/`superseded`/`stale`/`valid`/`invalid`/any state-machine
//   verdict about the decision or the candidate.** See "'Present in the
//   supplied plan' is never 'correct,'" above.
// - **Modifying the plan or the decision history.** Neither argument, nor
//   any object inside either, is ever mutated; this file introduces no
//   durable revalidation store of its own.
// - **Reading the current archive to manufacture a plan.** See "No
//   automatic reconstruction of a plan," above — the whole point of this
//   file's own missing `reconstructXxx()`.
// - **Selecting a "best" candidate, comparing candidate timestamps, or
//   performing signature verification.** This file compares exactly one
//   candidate's own structural identity against one supplied plan; nothing
//   about time, trust, or cryptography enters into it.
// - **A projection over many historical decisions at once.** This file
//   revalidates exactly one decision record against exactly one plan;
//   revalidating a whole decision history against a plan is separate, later
//   work (0.8.158, per this milestone's own request).
// - **Persistence or synchronization of any kind.** `decisionRecord` and
//   `plan` are in-memory arguments handed in and read; nothing is ever
//   written anywhere.
// - **Automatic, periodic, or background computation of any kind.** This
//   function runs only when a caller explicitly calls it.
export function describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidation(decisionRecord, plan) {
    if (!isGenuineDecision(decisionRecord)) {
        return Object.freeze({
            decision: null,
            candidatePresent: false,
            candidateType: null,
            candidateMatchesPlan: false
        });
    }

    const candidate = describePublisherLeaderboardClaimSnapshotReconciliationCandidate(plan, selectionFor(decisionRecord.candidate));

    return Object.freeze({
        decision: decisionRecord,
        candidatePresent: candidate.selected,
        candidateType: decisionRecord.candidate.type,
        candidateMatchesPlan: candidate.selected
    });
}

// Builds a 0.8.144 `selection` from a decision's own embedded `candidate` —
// the identical three-shape mapping 0.8.144 itself defines, reused rather
// than reinvented. `type` plus whichever of `claimId`/`snapshotIndex` that
// type actually carries; an unrecognized `type` produces a bare
// `{ type }` selection, which 0.8.144 itself already rejects as
// `INVALID_SELECTION`, never a fabricated match.
function selectionFor(candidate) {
    if (candidate.type === 'DIVERGENT_CORRESPONDENCE') {
        return { type: 'DIVERGENT_CORRESPONDENCE', claimId: candidate.claimId, snapshotIndex: candidate.snapshotIndex };
    }
    if (candidate.type === 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT') {
        return { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: candidate.claimId };
    }
    if (candidate.type === 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM') {
        return { type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: candidate.snapshotIndex };
    }
    return { type: candidate.type };
}

// A genuine 0.8.145 decision record — duplicated from 0.8.153's/0.8.156's
// own private `isGenuineDecision()` for the identical reason those files
// duplicate it: this file must apply the exact same genuineness rule
// without importing a module that itself carries plan/discovery vocabulary.
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
