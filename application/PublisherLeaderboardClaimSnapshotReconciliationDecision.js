import { describePublisherLeaderboardClaimSnapshotReconciliationCandidate } from './PublisherLeaderboardClaimSnapshotReconciliation.js';

// 0.8.145 — Explicit Reconciliation Decision Record.
//
// 0.8.144 answered "does the caller's own explicit selection name a
// relationship that genuinely exists in the plan?" and stopped there — its
// own result says a candidate WAS SELECTED and GENUINELY EXISTS, nothing
// about what a caller means to do about it. This file is the first to
// record that second fact: given 0.8.144's own selection outcome and an
// explicit, caller-supplied disposition, does a durable, immutable DECISION
// RECORD result?
//
//   plan                    selection                decision   decidedAt
//   (0.8.143's own          ({ type, claimId,         ('OBSERVE'  (EXPLICITLY
//    result, EXPLICITLY      snapshotIndex },          | 'DEFER',  SUPPLIED —
//    SUPPLIED)                EXPLICITLY SUPPLIED)      EXPLICITLY see "No
//        │                         │                    SUPPLIED)  clock,"
//        └────────────┬────────────┘                       │       below)
//                      ▼                                    │
//   describePublisherLeaderboardClaimSnapshotReconciliationCandidate()
//                (0.8.144, UNCHANGED)                        │
//                      │                                     │
//                      └──────────────────┬──────────────────┘
//                                          ▼
//    describePublisherLeaderboardClaimSnapshotReconciliationDecision()
//                                          │
//                                          ▼
//         { decided: true, candidate, decision, decidedAt }
//         or
//         { decided: false, outcome: 'INVALID_SELECTION' | 'INVALID_DECISION' | 'INVALID_DECIDED_AT' }
//
// DELEGATES TO 0.8.144, NEVER RE-DERIVES IT. This file calls
// `describePublisherLeaderboardClaimSnapshotReconciliationCandidate(plan,
// selection)` exactly once and trusts its own answer completely — it does
// not read `plan.divergentCorrespondences`/`claimsWithoutCorrespondence`/
// `snapshotsWithoutCorrespondence` itself, does not call 0.8.143 or 0.8.142,
// and does not re-verify a signature, re-derive a fingerprint, or re-check
// a `*Differs` fact. An invalid selection (0.8.144's own `{ selected: false
// }`) produces NO decision record of any kind — `{ decided: false, outcome:
// 'INVALID_SELECTION' }` — the caller must first name a candidate that
// genuinely exists before any decision about it can be recorded.
//
// A DELIBERATELY NARROW DECISION VOCABULARY — 'OBSERVE' AND 'DEFER' ONLY,
// NEVER 'ACCEPT'/'REJECT'/'RESOLVE'/ANY WORD THAT IMPLIES AN ACTION. This
// milestone introduces no reconciliation ACTION vocabulary of any kind —
// see 0.8.143's and 0.8.144's own headers, this file holds the identical
// boundary. `'OBSERVE'` records "a caller looked at this candidate and is
// noting that fact"; `'DEFER'` records "a caller looked at this candidate
// and is explicitly postponing any further action." Neither implies the
// candidate should be repaired, replaced, trusted, or acted on in any way
// — this codebase has no defined execution semantics for a reconciliation
// yet (that is 0.8.147's own, separately sized, later question), so this
// file deliberately does not introduce `ACCEPT`/`REJECT` ahead of that
// definition existing. Any other string — a typo, `'ACCEPT'`, `undefined`
// — reads the explicit `{ decided: false, outcome: 'INVALID_DECISION' }`,
// never a thrown error and never silently coerced into one of the two.
//
// THE DECISION RECORD DOES NOT RECOMPUTE ANYTHING — THE MOST IMPORTANT
// ARCHITECTURAL RULE THIS MILESTONE HOLDS. Given a valid selection and a
// valid disposition, this file's only remaining work is to embed 0.8.144's
// own already-computed `candidate` BY VALUE alongside the caller's own
// `decision` and `decidedAt`. It does not rediscover correspondence
// (0.8.139's own question), verify a signature (0.8.140's own), reconstruct
// a snapshot (0.8.119's own), compare a fingerprint (0.8.142's own), modify
// `claimHistory` or the archive (neither argument nor any other state is
// ever touched), execute any reconciliation (there is no such execution
// anywhere in this codebase yet), or automatically choose a different
// candidate on the caller's behalf (the identical "no automatic selection"
// restraint 0.8.144's own header already holds, inherited here for free by
// never looking at `plan` directly at all). This file states only: "this
// explicitly selected candidate was given this explicitly selected
// disposition" — nothing about whether that disposition is correct, and
// nothing about what happens next.
//
// A RECONCILIATION DECISION RECORDS AN EXPLICIT CHOICE; IT DOES NOT
// ESTABLISH THAT THE CHOSEN DISPOSITION IS CORRECT, AND IT DOES NOT EXECUTE
// IT. `decided: true` means "a caller explicitly recorded this disposition
// against this genuinely-existing candidate," never "this disposition was
// validated as the right one" and never "reconciliation happened."
//
// TWO SELECTIONS OF THE SAME CLAIM AGAINST DIFFERENT SNAPSHOTS PRODUCE TWO
// DISTINCT DECISION RECORDS, NEVER ONE SHARED RECORD. A claim that
// genuinely diverges against two supplied snapshots (0.8.144's own FLAGSHIP
// Claim B against S2 and S3) requires the caller to select — and decide on
// — each one separately; deciding `DEFER` on `selection(B, S2)` carries a
// `candidate` naming `snapshotIndex: 0` and has no bearing whatsoever on
// `selection(B, S3)`, whose own decision (if any is ever recorded) is a
// completely separate record with its own `candidate` naming
// `snapshotIndex: 1`.
//
// `decidedAt` IS AN EXPLICIT, CALLER-SUPPLIED FACT — THIS FILE NEVER READS
// A CLOCK. Every other file in this family (0.8.139 through 0.8.144) reads
// no clock and is synchronous, pure, and deterministic; a decision record
// carries a "when" fact by nature, so rather than break that determinism
// with an internal `new Date()` default, `decidedAt` is required as an
// explicit fourth argument, exactly as `claimId`/`snapshotIndex` are
// required as explicit fields of `selection` rather than guessed. A
// missing, `null`, or otherwise invalid `decidedAt` (not a `Date`, not a
// value a `Date` can be constructed from) reads the explicit
// `{ decided: false, outcome: 'INVALID_DECIDED_AT' }` — never silently
// defaulted to "now." A valid `decidedAt` is serialized into the record as
// an ISO 8601 string, the identical convention
// `application/PublisherLeaderboardClaimHistoryTimelineView.js` already
// uses for `receivedAt`/`claimCreatedAt` — never embedded as a live,
// mutable `Date` object a caller could later mutate out from under an
// already-frozen record.
//
// AN INVALID SELECTION OR DECISION IS AN EXPLICIT OUTCOME, NEVER A THROW.
// A `plan`/`selection` 0.8.144 itself would reject reads `INVALID_SELECTION`
// here too, for the identical reason. A `decision` outside the two-value
// vocabulary reads `INVALID_DECISION`. A missing or invalid `decidedAt`
// reads `INVALID_DECIDED_AT`. No combination of malformed arguments ever
// throws.
//
// NO ACTION VOCABULARY, NO POLICY ENGINE — THE IDENTICAL BOUNDARY EVERY
// FILE IN THIS FAMILY ALREADY HOLDS. This file's own result carries no
// `repair`, `replace`, `accept`, `reject`, `merge`, `delete`, `trust`,
// `resolve`, `apply`, `remediate`, `winner`, or `authoritative` field or
// verb anywhere, and no collapsed verdict, severity, confidence, trust, or
// fraud vocabulary either.
//
// SYNCHRONOUS, PURE, DETERMINISTIC (GIVEN ITS OWN EXPLICIT `decidedAt`),
// SELF-CONTAINED. Reads no clock of its own, touches no network, no
// storage, no verifier, and mutates neither `plan` nor `selection` nor
// anything inside either. Calling this function twice with equivalent
// arguments — even reached by two entirely independent code paths —
// returns a byte-identical result.
//
// ARCHITECTURAL BOUNDARY — EXACTLY ONE IMPORT, 0.8.144's OWN SELECTION
// BOUNDARY, NOTHING ELSE. This file does not import
// `application/PublisherLeaderboardClaimSnapshotReconciliationPlanView.js`,
// `application/PublisherLeaderboardClaimSnapshotDivergenceView.js`, or any
// other module in this family — it trusts nothing about how `plan` was
// produced beyond what 0.8.144 itself already validates.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any reconciliation ACTION, or applying anything.** See "The decision
//   record does not recompute anything," above.
// - **`ACCEPT`/`REJECT`, or any disposition implying an action.** See "A
//   deliberately narrow decision vocabulary," above.
// - **A decision history, audit trail, or projection over many decisions.**
//   This file produces exactly one record from exactly one call; keeping,
//   listing, or querying multiple decisions is 0.8.146's own, separately
//   sized, later question.
// - **Persistence or synchronization of any kind.** No argument is ever
//   mutated, and this file introduces no durable decision store of its
//   own — the returned record is handed back to the caller, who decides
//   whether and how to keep it.
// - **Recomputing or refreshing the plan or candidate.** `plan` and
//   `selection` are used exactly as supplied, via 0.8.144 alone.
// - **Automatic, periodic, or background computation of any kind.** This
//   function runs only when a caller explicitly calls it.
export function describePublisherLeaderboardClaimSnapshotReconciliationDecision(plan, selection, decision, decidedAt) {
    const candidate = describePublisherLeaderboardClaimSnapshotReconciliationCandidate(plan, selection);
    if (!candidate.selected) {
        return Object.freeze({ decided: false, outcome: 'INVALID_SELECTION' });
    }

    if (decision !== 'OBSERVE' && decision !== 'DEFER') {
        return Object.freeze({ decided: false, outcome: 'INVALID_DECISION' });
    }

    if (decidedAt === null || decidedAt === undefined) {
        return Object.freeze({ decided: false, outcome: 'INVALID_DECIDED_AT' });
    }
    const decidedAtDate = decidedAt instanceof Date ? decidedAt : new Date(decidedAt);
    if (Number.isNaN(decidedAtDate.getTime())) {
        return Object.freeze({ decided: false, outcome: 'INVALID_DECIDED_AT' });
    }

    return Object.freeze({
        decided: true,
        candidate,
        decision,
        decidedAt: decidedAtDate.toISOString()
    });
}
