import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentity } from './PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentityView.js';

// 0.8.162 — Historical Decision Revalidation Observation Record.
//
// 0.8.145 records a caller's own DECISION about a candidate — an explicit
// disposition (`OBSERVE`/`DEFER`), made once, against whatever plan existed
// at that moment. 0.8.161 answers a completely different question: given
// that SAME historical decision and a caller-supplied, EXPLICIT plan, what
// are the revalidation facts, together with a durable statement of exactly
// which plan they were computed against? This file answers neither of
// those questions again — it asks the one question 0.8.161 does not: given
// that 0.8.161 has already been asked, and answered, WAS a revalidation
// against this exact plan explicitly observed, and when?
//
//   decisionRecord            plan             observedAt
//   (a genuine 0.8.145        (0.8.143's own    (EXPLICITLY
//    record, EXPLICITLY        result,           SUPPLIED —
//    SUPPLIED)                 EXPLICITLY        see "No clock,"
//        │                     SUPPLIED)          below)
//        │                          │                  │
//        └─────────────┬────────────┘                  │
//                       ▼                               │
//   describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentity(
//       [decisionRecord], plan
//   )                                                    │
//                       │                                │
//                       └───────────────┬────────────────┘
//                                       ▼
//   describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation()
//                                       │
//                                       ▼
//   { observed: true, decision, planIdentity, candidatePresent,
//     candidateType, candidateMatchesPlan, observedAt }
//   or
//   { observed: false, outcome: 'INVALID_OBSERVATION' }
//
// A RECORD OF WHAT WAS EXPLICITLY OBSERVED, NEVER A NEW DECISION — THE ONE
// ARCHITECTURAL LINE THIS MILESTONE EXISTS TO HOLD. 0.8.145's own decision
// vocabulary (`OBSERVE`/`DEFER`) records what a caller chose to DO about a
// candidate; this file's own `observed`/`observedAt` record what a caller
// chose to CHECK — whether that same candidate still occurs in an
// explicitly supplied plan — and when they checked it. The two remain
// permanently separate: this file never reads, writes, or interprets
// `decisionRecord.decision` beyond echoing it unchanged inside the embedded
// `decision` field, and it introduces no disposition, verdict, or action of
// its own. `observed: true` means exactly one thing — "a caller explicitly
// asked, at `observedAt`, whether this decision's own candidate occurs in
// this exact plan, and 0.8.161 answered" — never "the decision was right,"
// never "the plan is current," and never "something should now happen."
//
// A THIN COMPOSITION OVER 0.8.161, CALLED EXACTLY ONCE, NEVER A SECOND
// COMPARISON ENGINE. This file computes nothing about candidate identity,
// plan membership, or plan fingerprinting that 0.8.161 does not already
// compute. It calls
// `describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentity()`
// exactly once, wrapping the single `decisionRecord` in a one-element array
// — because 0.8.161 itself operates over a decision HISTORY, and a single
// explicit observation is a history of exactly one entry, never a
// second, parallel single-decision code path reinvented here. Its
// `planIdentity` is embedded whole; its lone `revalidations` entry supplies
// `candidatePresent`, `candidateType`, and `candidateMatchesPlan`, each read
// off that entry unchanged.
//
// THE FORBIDDEN VOCABULARY — NEVER PRESENT IN THIS FILE'S OWN RESULT, IN
// ANY FIELD, UNDER ANY NAME. This record never carries `correct`,
// `incorrect`, `valid`, `invalid` (beyond the one, generic
// `INVALID_OBSERVATION` outcome literal reserved for a malformed INPUT, never
// a verdict about a candidate or a plan), `stale`, `current`, `resolved`,
// `superseded`, `accepted`, or `rejected`, as a field name, a field value,
// or any word describing what the observation MEANS. Even
// `candidateMatchesPlan: false` remains exactly what it already meant in
// 0.8.157/0.8.158/0.8.161: the candidate this decision named was not found
// in the explicitly supplied plan — nothing about whether the decision, or
// the plan, is therefore wrong, obsolete, or in need of revisiting.
//
// WHY `planIdentity` MATTERS — THE REASON THIS MILESTONE EXISTS AT ALL.
// Without a durable plan identity, two observations of the identical
// decision, made against two different plans, would be indistinguishable
// once the plan objects themselves are gone: both would read
// `candidateMatchesPlan: true` or `false` with no way to say AGAINST WHICH
// PLAN. Because this file embeds 0.8.160's own `planFingerprint` (via
// 0.8.161, unchanged), the two observations remain permanently
// distinguishable even after the plan objects themselves are discarded:
//
//   D1 + Plan A -> { candidateMatchesPlan: true,  planIdentity: { planFingerprint: A } }
//   D1 + Plan B -> { candidateMatchesPlan: false, planIdentity: { planFingerprint: B } }
//
// Two structurally different plans, the identical historical decision D1,
// two permanently distinguishable observation records — neither one telling
// the other it is wrong.
//
// `observedAt` IS AN EXPLICIT, CALLER-SUPPLIED FACT — THIS FILE NEVER READS
// A CLOCK. Mirrors 0.8.145's own `decidedAt` restraint exactly, for the
// identical reason: every other file in the 0.8.157-0.8.161 revalidation
// family is synchronous, pure, and deterministic, and reads no clock of its
// own; an OBSERVATION record carries a "when" fact by nature, so rather
// than default silently to "now," `observedAt` is required as an explicit
// third argument. A valid `observedAt` (a `Date`, or any value a `Date` can
// be constructed from — 0.8.145's own tolerance, reused unchanged) is
// serialized into the record as an ISO 8601 string, never embedded as a
// live, mutable `Date` object a caller could later mutate out from under an
// already-frozen record.
//
// VALIDATION IS AN EXPLICIT, NON-THROWING OUTCOME — NEVER A THROW, AND
// NEVER A SECOND COPY OF 0.8.144'S/0.8.160'S OWN TOLERANCE. This file
// rejects exactly three things, each producing the identical
// `{ observed: false, outcome: 'INVALID_OBSERVATION' }`:
//   - `decisionRecord` is not a genuine `{ decided: true, candidate,
//     decision, decidedAt }` record (0.8.153's/0.8.156's/0.8.157's/0.8.158's
//     own duplicated `isGenuineDecision()` rule, applied here once more for
//     the identical reason those files each duplicate it);
//   - `plan` is not itself a genuine, non-null OBJECT — a narrower gate than
//     0.8.144's/0.8.160's own tolerance, and deliberately so: those files
//     already treat a plan whose relevant LIST is missing, or is not a
//     genuine array, as a valid, empty plan (zero candidates) rather than a
//     malformed one, and this file does not re-litigate that — a `plan`
//     that is at least a genuine object, however empty or list-malformed
//     internally, is handed straight through to 0.8.161 exactly as always
//     and simply degrades to `candidatePresent: false`/`candidateCount: 0`,
//     never `INVALID_OBSERVATION`. Only a `plan` that is not even a genuine
//     object at all (`null`, `undefined`, a string, a number, an array, a
//     boolean) is rejected here, because unlike the revalidation family's
//     own describeXxx() functions — which always have SOMETHING to report,
//     even about a degraded plan — an OBSERVATION is a caller's explicit
//     claim to have checked one exact, real plan, and no such plan was ever
//     supplied;
//   - `observedAt` is missing, `null`, or not a value a `Date` can be
//     constructed from (0.8.145's own `decidedAt` rule, reused unchanged).
// No combination of malformed arguments ever throws.
//
// THE SUCCESSFUL RECORD IS COMPLETELY FROZEN. `Object.freeze()` is applied
// to the top-level result; `planIdentity` and the embedded `decision` are
// already frozen by 0.8.161/0.8.145 respectively, and are embedded here
// exactly as received — never rebuilt, never re-frozen, never mutated.
//
// SYNCHRONOUS, PURE, NO STORAGE, NO NETWORK. Neither `decisionRecord` nor
// `plan` (nor any object inside either) is ever mutated. Calling this
// function twice with equivalent arguments — including an equivalent
// `observedAt` — returns a byte-identical result.
//
// ARCHITECTURAL BOUNDARY — EXACTLY ONE IMPORT, 0.8.161'S OWN COMBINED
// REVALIDATION-PLUS-PLAN-IDENTITY PROJECTION, NOTHING ELSE. This file
// imports nothing from `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidationView.js`
// (0.8.157), `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationView.js`
// (0.8.158), `application/PublisherLeaderboardClaimSnapshotReconciliationPlanIdentity.js`
// (0.8.160 — 0.8.161 already composes it), `application/PublisherLeaderboardClaimSnapshotReconciliation.js`
// (0.8.144's own candidate-selection boundary), `application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js`,
// any decision-history module, any correspondence/verification/signature
// module, or any archive module — it trusts nothing about how
// `decisionRecord` or `plan` was produced beyond their own documented
// shapes, performs no candidate selection, matching, or fingerprinting of
// its own, and calls 0.8.161 exactly once.
//
// NO PERSISTENCE, NO `PublicationObservationArchive` INTEGRATION, NO
// `reconstructXxx()` ENTRY POINT — DELIBERATELY, NOT THIS MILESTONE. This
// file produces exactly one, in-memory, frozen record from exactly one
// call; it introduces no durable observation store of its own, reads no
// archive, and writes to no archive. Integrating this record into
// `PublicationObservationArchive` — so an observation, once made, can be
// kept and later listed alongside other archived facts — is separate,
// later work (0.8.163/0.8.164, per this milestone's own request), never
// built here. `plan` also remains, exactly as every file in this family
// already establishes, an explicitly supplied, in-memory artifact the
// archive has never persisted; this file invents no way to reconstruct one.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Recomputing anything 0.8.161 (or anything it composes) already
//   computes.** This file calls 0.8.161 exactly once and reports exactly
//   what its lone revalidation entry, plus its `planIdentity`, already say.
// - **A new decision, disposition, or action vocabulary of any kind.** See
//   "A record of what was explicitly observed, never a new decision,"
//   above.
// - **`correct`/`incorrect`/`valid`/`invalid`/`stale`/`current`/`resolved`/
//   `superseded`/`accepted`/`rejected`, or any other interpretation of what
//   the observation means.** See "The forbidden vocabulary," above.
// - **A history of observations, or any projection over many observations
//   at once.** This file produces exactly one record from exactly one
//   call; a caller who calls it twice holds two independent frozen records
//   — keeping, listing, or comparing them is separate, later work
//   (0.8.163, per this milestone's own request), never built here.
// - **Persisting the record into `PublicationObservationArchive`, or any
//   other durable store.** See "No persistence," above.
// - **Modifying `decisionRecord` or `plan`.** Neither argument, nor any
//   object inside either, is ever mutated.
// - **Reading the current archive to manufacture a plan, or reading a
//   clock to manufacture `observedAt`.** See "`observedAt` is an explicit,
//   caller-supplied fact," above.
// - **Automatic, periodic, or background computation of any kind.** This
//   function runs only when a caller explicitly calls it.
export function describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation(decisionRecord, plan, observedAt) {
    if (!isGenuineDecision(decisionRecord)) {
        return Object.freeze({ observed: false, outcome: 'INVALID_OBSERVATION' });
    }
    if (plan === null || typeof plan !== 'object' || Array.isArray(plan)) {
        return Object.freeze({ observed: false, outcome: 'INVALID_OBSERVATION' });
    }
    if (observedAt === null || observedAt === undefined) {
        return Object.freeze({ observed: false, outcome: 'INVALID_OBSERVATION' });
    }
    const observedAtDate = observedAt instanceof Date ? observedAt : new Date(observedAt);
    if (Number.isNaN(observedAtDate.getTime())) {
        return Object.freeze({ observed: false, outcome: 'INVALID_OBSERVATION' });
    }

    const revalidationPlanIdentity = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentity([decisionRecord], plan);
    const revalidation = revalidationPlanIdentity.revalidations[0];

    return Object.freeze({
        observed: true,
        decision: revalidation.decision,
        planIdentity: revalidationPlanIdentity.planIdentity,
        candidatePresent: revalidation.candidatePresent,
        candidateType: revalidation.candidateType,
        candidateMatchesPlan: revalidation.candidateMatchesPlan,
        observedAt: observedAtDate.toISOString()
    });
}

// A genuine 0.8.145 decision record — duplicated from 0.8.153's/0.8.156's/
// 0.8.157's/0.8.158's own private `isGenuineDecision()` for the identical
// reason those files each duplicate it: this file must apply the exact
// same genuineness rule without importing a module that itself carries
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
