// 0.8.144 — Explicit Claim/Snapshot Reconciliation Decision Boundary.
//
// 0.8.143 answered "given a whole claim history and an explicitly supplied
// snapshot sequence, what relationships would be relevant to reconcile?" —
// three separate lists (`divergentCorrespondences`, `claimsWithoutCorrespondence`,
// `snapshotsWithoutCorrespondence`), never merged, never acted on. Nothing in
// this whole family has ever picked one relationship out of a plan and said
// "this one" — every projection from 0.8.139 through 0.8.143 answers "what
// exists?", never "what does the caller mean to do about it?" This file is
// the first to answer that second question, and it answers only that much:
// given 0.8.143's own plan and an explicit selection naming exactly one
// relationship in it, does that relationship genuinely exist?
//
//   plan                               selection
//   (0.8.143's own result,             ({ type, claimId, snapshotIndex },
//    EXPLICITLY SUPPLIED)               EXPLICITLY SUPPLIED BY THE CALLER)
//        │                                    │
//        └──────────────────┬─────────────────┘
//                            ▼
//   describePublisherLeaderboardClaimSnapshotReconciliationCandidate()
//                            │
//                            ▼
//   { selected: true, type, claimId?, snapshotIndex?,
//     evidenceFingerprintDiffers?, policyVersionDiffers?,
//     snapshotFingerprintDiffers? }
//   or
//   { selected: false, outcome: 'INVALID_SELECTION' }
//
// A LOOKUP, NEVER A SECOND PLAN. This file does not call 0.8.143, does not
// call 0.8.142, does not accept `claimHistory`/`snapshots`/`verifier`, and
// imports nothing — it takes 0.8.143's own already-computed `plan` exactly
// as supplied and asks one question of it: "does the caller's own explicit
// `selection` name a relationship that genuinely appears in this plan?" A
// caller who wants a fresh plan calls 0.8.143 themselves, first; this file
// never reconstructs one on their behalf.
//
// THREE SELECTION TYPES, EACH NAMING EXACTLY ONE OF 0.8.143'S OWN THREE
// LISTS — NEVER A FOURTH, NEVER A MERGE OF THE THREE. `selection.type` must
// read `'DIVERGENT_CORRESPONDENCE'` (naming one `plan.divergentCorrespondences`
// entry by its own `claimId` AND `snapshotIndex` together — a claim can
// diverge against more than one supplied snapshot, so both are required to
// name one entry unambiguously), `'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT'`
// (naming one `plan.claimsWithoutCorrespondence` entry by `claimId` alone),
// or `'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM'` (naming one
// `plan.snapshotsWithoutCorrespondence` entry by `snapshotIndex` alone). Any
// other value — a typo, a made-up fourth type, `undefined` — is
// `INVALID_SELECTION`, never silently treated as one of the three.
//
// THE CRITICAL RULE: NO AUTOMATIC SELECTION, EVER. Given a claim B that
// diverges against both S2 and S3, this file never picks one on the
// caller's behalf, never picks "the first," never picks "the most recent,"
// and never picks "the one with more differences." A `selection` naming
// `claimId: B` alone, with no `snapshotIndex`, does not fall back to
// guessing — `DIVERGENT_CORRESPONDENCE` always requires both fields, so an
// incomplete selection simply never matches anything in
// `plan.divergentCorrespondences` and reads `INVALID_SELECTION`. The
// caller must name the exact pair themselves. This is 0.8.139's own
// ambiguity restraint ("a claim naming more than one matching supplied
// snapshot is reported, never resolved") held one layer up, over a
// caller's own act of choosing rather than over correspondence discovery
// itself.
//
// A GENUINE MATCH, NEVER A FUZZY ONE. A selection matches a plan entry only
// when every field the selection's own type requires is `===` equal to
// that entry's own field — `claimId` is compared as supplied, `snapshotIndex`
// as supplied, no coercion, no partial match, no case-insensitive string
// comparison. A `plan` that does not carry a genuine array in the relevant
// list position (a malformed or partial plan, not a fresh 0.8.143 result)
// degrades to zero candidates for that type, exactly like an empty list —
// never a thrown error, and never a fabricated match.
//
// FIELDS THAT DON'T EXIST ARE NEVER INVENTED — THE ONE SHAPE RULE THIS
// MILESTONE HOLDS ACROSS ITS THREE OUTCOME SHAPES. A `CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT`
// candidate carries `type` and `claimId` only — no `snapshotIndex`, no
// `evidenceFingerprintDiffers`, no `policyVersionDiffers`, no
// `snapshotFingerprintDiffers`, because none of those facts exist for a
// claim with no corresponding snapshot at all. Symmetrically, a
// `SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM` candidate carries `type` and
// `snapshotIndex` only. Only a `DIVERGENT_CORRESPONDENCE` candidate carries
// all three `*Differs` facts, because only a genuine correspondence has
// asserted fields to compare — and those three facts are 0.8.143's own
// `divergence.*` facts (in turn 0.8.142's own facts) embedded through by
// value, never re-derived.
//
// A TAMPERED OR INVALID SIGNATURE IS NEVER, BY ITSELF, A RECONCILIATION
// CANDIDATE — 0.8.142'S/0.8.143'S OWN BOUNDARY, HELD HERE ONE LAYER UP
// WITHOUT ANY ADDITIONAL CODE OF ITS OWN. A claim that genuinely
// corresponds to a snapshot, agrees on every asserted field, but carries a
// forged signature (0.8.143's own FLAGSHIP Claim C) already appears in
// neither `plan.divergentCorrespondences` nor `plan.claimsWithoutCorrespondence`
// — this file performs no signature check, no `verification.signatureValid`
// read, and no special-case exclusion of its own; selecting that claim
// under either type simply finds no matching plan entry, and reads
// `INVALID_SELECTION` for exactly the same reason any other non-existent
// relationship would. The exclusion is 0.8.143's own, inherited for free by
// looking nowhere else.
//
// AN INVALID SELECTION IS AN EXPLICIT OUTCOME, NEVER A THROW AND NEVER A
// SILENT FALLBACK. A missing `selection`, a non-object `selection`, an
// unrecognized `type`, an incomplete selection for its own type, or a
// selection naming a relationship absent from `plan` all produce the
// identical `{ selected: false, outcome: 'INVALID_SELECTION' }` — never an
// exception, and never a candidate for some other relationship the caller
// did not name.
//
// NO ACTION VOCABULARY, NO POLICY ENGINE, NO WORD "RESOLVE" ANYWHERE —
// THE IDENTICAL BOUNDARY 0.8.143'S OWN HEADER ALREADY HOLDS, HELD HERE
// AGAIN OVER A SELECTED RELATIONSHIP INSTEAD OF A PLAN. This file's own
// result carries no `repair`, `replace`, `accept`, `reject`, `merge`,
// `delete`, `trust`, `resolve`, `apply`, `remediate`, `winner`, or
// `authoritative` field or verb anywhere. This file states that a named
// relationship WAS EXPLICITLY SELECTED and GENUINELY EXISTS — nothing about
// what should happen to it. Applying any reconciliation is 0.8.145's own,
// separately sized, later question.
//
// NO COLLAPSED VERDICT, NO SEVERITY, NO CONFIDENCE, NO TRUST OR FRAUD
// VOCABULARY — THE IDENTICAL BOUNDARY EVERY FILE IN THIS FAMILY ALREADY
// HOLDS. This file's own result carries no `fraud`, `invalidClaim`,
// `conflict`, `regression`, `severity`, `confidence`, `trust`,
// `reputation`, `score`, or `rank` field anywhere.
//
// SYNCHRONOUS, PURE, DETERMINISTIC, SELF-CONTAINED. Reads no clock, touches
// no network, no storage, no verifier, and mutates neither `plan` nor
// `selection` nor anything inside either. Calling this function twice with
// equivalent arguments — even reached by two entirely independent code
// paths — returns a byte-identical result.
//
// ARCHITECTURAL BOUNDARY — NO IMPORTS AT ALL. This file imports nothing
// from `application/PublisherLeaderboardClaimSnapshotReconciliationPlanView.js`,
// `application/PublisherLeaderboardClaimSnapshotDivergenceView.js`, or any
// other module in this family — it trusts nothing about how `plan` was
// produced beyond its own documented shape, and never calls 0.8.143 a
// second time to re-derive or double-check it.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any reconciliation ACTION, or applying anything.** See "No action
//   vocabulary," above — that is 0.8.145's own, separately sized, later
//   question.
// - **Automatic selection of any kind.** See "The critical rule," above —
//   this file never picks a relationship the caller did not explicitly
//   name, and never breaks a tie among more than one matching entry.
// - **Recomputing or refreshing the plan.** `plan` is used exactly as
//   supplied; a stale or hand-built plan is never detected as such.
// - **Trust/reputation judgments, fraud detection, a collapsed "valid
//   claim" verdict, severity, or confidence.** See "No collapsed verdict,"
//   above.
// - **Cryptographic verification of anything.** This file reads no
//   `verification.*` field and calls no verifier of any kind.
// - **Persistence or synchronization of any kind.** Neither argument is
//   ever mutated, and this file introduces no durable "selection" store of
//   its own.
// - **Automatic, periodic, or background computation of any kind.** This
//   function runs only when a caller explicitly calls it.
export function describePublisherLeaderboardClaimSnapshotReconciliationCandidate(plan, selection) {
    const invalid = Object.freeze({ selected: false, outcome: 'INVALID_SELECTION' });

    if (plan === null || typeof plan !== 'object') return invalid;
    if (selection === null || typeof selection !== 'object') return invalid;

    if (selection.type === 'DIVERGENT_CORRESPONDENCE') {
        const list = Array.isArray(plan.divergentCorrespondences) ? plan.divergentCorrespondences : [];
        const match = list.find((entry) => (
            entry.claimId === selection.claimId && entry.snapshotIndex === selection.snapshotIndex
        ));
        if (!match) return invalid;
        return Object.freeze({
            selected: true,
            type: 'DIVERGENT_CORRESPONDENCE',
            claimId: match.claimId,
            snapshotIndex: match.snapshotIndex,
            evidenceFingerprintDiffers: match.divergence.evidenceFingerprintDiffers,
            policyVersionDiffers: match.divergence.policyVersionDiffers,
            snapshotFingerprintDiffers: match.divergence.snapshotFingerprintDiffers
        });
    }

    if (selection.type === 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT') {
        const list = Array.isArray(plan.claimsWithoutCorrespondence) ? plan.claimsWithoutCorrespondence : [];
        const match = list.find((entry) => entry.claimId === selection.claimId);
        if (!match) return invalid;
        return Object.freeze({
            selected: true,
            type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT',
            claimId: match.claimId
        });
    }

    if (selection.type === 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM') {
        const list = Array.isArray(plan.snapshotsWithoutCorrespondence) ? plan.snapshotsWithoutCorrespondence : [];
        const match = list.find((entry) => entry.snapshotIndex === selection.snapshotIndex);
        if (!match) return invalid;
        return Object.freeze({
            selected: true,
            type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM',
            snapshotIndex: match.snapshotIndex
        });
    }

    return invalid;
}
