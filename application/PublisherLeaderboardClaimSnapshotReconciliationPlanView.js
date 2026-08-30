import { LeaderboardClaimRecord } from './LeaderboardClaimRecord.js';
import { describePublisherLeaderboardClaimSnapshotDivergence } from './PublisherLeaderboardClaimSnapshotDivergenceView.js';

// 0.8.143 — Claim/Snapshot Reconciliation Plan Projection.
//
// 0.8.142 answered "given a whole claim history and an explicitly supplied
// snapshot sequence, which corresponding pairs disagree, and on which
// fields?" — flattened, three independent `differs` facts per pair, never
// filtered down to only the disagreeing ones, and never touching a claim
// or snapshot that never corresponded to anything at all. Its own
// "Deliberately excluded" list names exactly the gap this file closes:
// "Remediation, reconciliation, or any 'what should change' projection...
// that is 0.8.143's own, separately sized, later question — this file
// only names WHERE a divergence exists, never what ought to be done about
// it." This file is that later question, answered as a PLAN rather than
// an ACTION — not a fourth comparison engine, but 0.8.142's own result,
// filtered and completed with the two facts it deliberately never reports
// on its own (a claim that corresponds to nothing, a snapshot that
// corresponds to nothing):
//
//   claimHistory                      snapshots        verifier
//   (LeaderboardClaimRecord[],        (PublisherLeaderboardSnapshot[],
//    0.8.123, UNCHANGED)               EXPLICITLY SUPPLIED, 0.8.119)
//        │                                    │              │
//        └──────────────────┬─────────────────┴──────────────┘
//                            ▼
//         describePublisherLeaderboardClaimSnapshotDivergence()
//                (0.8.142, UNCHANGED — every corresponding pair,
//                 with three independent `differs` facts each, whether
//                 or not any of them read `true`)
//                            │
//              ┌─────────────┼─────────────────────┐
//              │ kept when   │ claimId never        │ snapshotIndex
//              │ any differs │ appears above         │ never appears
//              │ fact is     │ (0.8.142's own        │ above (0.8.142's
//              │ true        │ absence-preserving    │ own absence-
//              │             │ restraint, read        │ preserving
//              │             │ one layer up)          │ restraint, read
//              │             │                        │ one layer up)
//              ▼             ▼                        ▼
//   divergentCorrespondences  claimsWithoutCorrespondence  snapshotsWithoutCorrespondence
//                            \_____________________________/
//                            describePublisherLeaderboardClaimSnapshotReconciliationPlan()
//                            │
//                            ▼
//   { claimCount, distinctClaimIdCount, snapshotCount, correspondenceCount,
//     divergentCorrespondenceCount, divergentCorrespondences: [{ claimId,
//       snapshotIndex, association, verification, divergence }, ...],
//     claimsWithoutCorrespondenceCount, claimsWithoutCorrespondence: [{
//       claimId, claimHistoryPosition, signerIdentityId, claimCreatedAt
//     }, ...],
//     snapshotsWithoutCorrespondenceCount, snapshotsWithoutCorrespondence: [{
//       snapshotIndex
//     }, ...] }
//
// THREE FUNDAMENTALLY DIFFERENT SITUATIONS, NEVER COLLAPSED INTO ONE LIST
// — THE ONE ARCHITECTURAL RULE THIS MILESTONE EXISTS TO MAKE EXPLICIT.
// "This claim and this snapshot correspond, but a field disagrees,"
// "this claim has no corresponding snapshot at all," and "this snapshot
// has no corresponding claim at all" are three separately-caused facts —
// a known relationship with a difference, versus a missing counterpart on
// one side, versus a missing counterpart on the other. 0.8.139's own
// header states the discipline this file holds one layer up: "absence ≠
// divergence." A claim naming no supplied snapshot is not a divergence
// with invented `false` fields standing in for "nothing to compare" — it
// belongs in `claimsWithoutCorrespondence`, never in
// `divergentCorrespondences`. Nothing in this file's result ever merges
// the three lists, and nothing computes a combined "total reconciliation
// item count" across them.
//
// "DIVERGENT" NAMES A FILTER, UNLIKE 0.8.142'S OWN "DIVERGENCE" — THE ONE
// GENUINE DEPARTURE FROM 0.8.142'S OWN NAMING DISCIPLINE, AND WHY. 0.8.142
// deliberately projects every corresponding pair, agreeing pairs included,
// because "corresponds and agrees" is exactly as much a fact worth
// keeping visible as "corresponds and disagrees" (0.8.142's own header).
// A PLAN is a different kind of artifact: a pair whose every asserted
// field already agrees with its corresponding snapshot has nothing left
// to reconcile, and keeping it in `divergentCorrespondences` would bury
// the pairs that do need attention under the ones that don't.
// `divergentCorrespondences` therefore keeps exactly the 0.8.142 entries
// where `divergence.evidenceFingerprintDiffers`,
// `divergence.policyVersionDiffers`, or `divergence.snapshotFingerprintDiffers`
// reads `true` — never a fourth, independently-computed disagreement
// check, purely a filter over facts 0.8.142 already computed.
//
// A TAMPERED OR INVALID SIGNATURE IS NEVER, BY ITSELF, A RECONCILIATION
// DIFFERENCE. `verification.signatureValid` is carried through, embedded
// whole, on every kept `divergentCorrespondences` entry (0.8.142's own
// `verification` object, untouched) — but this file's own filter reads
// only the three `divergence.*Differs` facts, never `signatureValid`, to
// decide what belongs in `divergentCorrespondences`. A pair whose every
// asserted field agrees with its corresponding snapshot, but whose
// signature is forged or corrupted (0.8.142's own FLAGSHIP Case C),
// therefore never appears in `divergentCorrespondences` — its signature
// problem is a separate, already-reported fact
// (`verification.signatureValid: false`), not a reconciliation difference
// this file invents a place for. See this file's own FLAGSHIP Case C for
// the concrete proof: `verification.signatureValid: false` sits on an
// entry that is genuinely a correspondence (so it is neither a claim nor
// a snapshot "without correspondence"), yet is absent from
// `divergentCorrespondences` entirely, because nothing about its own
// asserted fields differs.
//
// EVERY KEPT `divergentCorrespondences` ENTRY IS 0.8.142'S OWN ENTRY,
// EMBEDDED WHOLE — NEVER REDUCED TO A STATUS. `claimId`, `snapshotIndex`,
// `association`, `verification`, and `divergence` on a kept entry are
// 0.8.142's own frozen result object for that pair, filtered through by
// reference, never rebuilt field by field and never collapsed into a
// single `hasDivergence: true` marker. A caller wanting to know exactly
// which of the three fields disagree already has everything 0.8.142
// already reported, sitting right there.
//
// "WITHOUT CORRESPONDENCE" IS COMPUTED FROM 0.8.142'S OWN OUTPUT, NEVER BY
// CALLING 0.8.140 OR 0.8.139 A SECOND TIME. Because 0.8.142 itself
// projects exactly one `divergences[]` entry per kept `snapshotMatches[]`
// entry, across every distinct claim, the SET of `claimId` values
// appearing anywhere in `divergence.divergences` is precisely the set of
// distinct claims with at least one corresponding snapshot — and the SET
// of `snapshotIndex` values appearing there is precisely the set of
// supplied snapshot positions that correspond to at least one claim. This
// file computes both sets with one pass over `divergence.divergences`
// (already 0.8.142's own single call's own result) and never opens a
// second correspondence-discovery pass over `claimHistory`/`snapshots`
// itself — no import of `PublisherLeaderboardClaimSnapshotCorrespondenceView.js`
// or `PublisherLeaderboardClaimSnapshotCorrespondenceVerificationView.js`
// appears anywhere in this file.
//
// `claimHistoryPosition` NAMES A POSITION IN THE SUPPLIED `claimHistory`
// ARRAY, NEVER A DERIVED RANK. For each distinct claim absent from the
// matched-claimId set above, this file's own single pass over
// `claimHistory` — filtering to genuine `LeaderboardClaimRecord` instances
// and keeping the FIRST receipt of each distinct `claim.id`, the identical
// "first-received record" restraint 0.8.132's/0.8.139's/0.8.140's own
// headers already hold — records that receipt's own index in the supplied
// array, alongside `signerIdentityId` and `claimCreatedAt` read straight
// off that same claim, never re-derived or looked up through a second
// module. This is the ONLY original discovery work in this file: a single
// linear scan, no snapshot comparison, no fingerprinting, and no
// keep/discard decision beyond "is this claim's id already matched, or
// already seen."
//
// `snapshotsWithoutCorrespondence` WALKS EVERY SUPPLIED POSITION, 0 UP TO
// `snapshotCount`, NEVER ONLY THE ONES A CLAIM HAPPENED TO MENTION. A
// supplied snapshot nothing corresponds to is still a supplied artifact —
// this file reports its bare `snapshotIndex`, in ascending position order,
// for every position outside the matched-snapshotIndex set, exactly once
// each, never deduplicating or reordering by anything other than position.
//
// NO "ACTION" VOCABULARY, NO POLICY ENGINE — THE ONE BOUNDARY THIS
// MILESTONE EXISTS TO HOLD. This file's own result carries no `repair`,
// `replace`, `accept`, `reject`, `merge`, `delete`, `trust`, `resolve`,
// `apply`, or `remediate` field or verb anywhere — grepping this file's
// own source finds none. It answers "what relationship is missing or
// different?", never "what should the system decide to do about it?" —
// a plan names relationships, it does not act on them, and nothing in
// this file writes to `claimHistory`, `snapshots`, or any archive.
//
// NO COLLAPSED VERDICT, NO SEVERITY, NO CONFIDENCE, NO TRUST OR FRAUD
// VOCABULARY — THE IDENTICAL BOUNDARY EVERY FILE IN THIS FAMILY ALREADY
// HOLDS. This file's own result carries no `fraud`, `invalidClaim`,
// `conflict`, `regression`, `severity`, `confidence`, `trust`,
// `reputation`, `score`, or `rank` field anywhere.
//
// REUSES 0.8.142 WHOLE — NO SECOND DIVERGENCE, CORRESPONDENCE, OR
// VERIFICATION ENGINE. Every `association.*`/`verification.*`/
// `divergence.*` fact on a kept `divergentCorrespondences` entry is
// `describePublisherLeaderboardClaimSnapshotDivergence()`'s (0.8.142,
// UNCHANGED) own result for that pair, embedded by reference — this file
// calls 0.8.142 exactly ONCE, over the whole `claimHistory`/`snapshots`/
// `verifier`, and performs no independent fingerprint comparison, no
// independent signature check, and no second discovery pass of its own.
//
// ARCHITECTURAL BOUNDARY — IMPORTS 0.8.142 AND 0.8.123'S OWN RECORD CLASS
// ONLY. This file imports nothing from
// `application/PublisherLeaderboardClaimSnapshotCorrespondenceView.js`,
// `application/PublisherLeaderboardClaimSnapshotCorrespondenceVerificationView.js`,
// `application/PublisherLeaderboardHistoricalClaimVerification.js`,
// `application/PublisherLeaderboardClaimSnapshotAssociationView.js`,
// `application/PublisherLeaderboardSnapshotDifference.js`,
// `application/PublisherLeaderboardClaimEvolutionView.js`, any signing or
// identity module, any archive module, any ranking module, or
// `application/PublisherLeaderboardSnapshotTimelineView.js` — grep it and
// none of that vocabulary appears. The dependency direction stays a
// single line: 0.8.142 → 0.8.143, never a parallel engine duplicating it.
//
// MALFORMED INPUT TOLERANCE MATCHES 0.8.142'S OWN, UNCHANGED. `claimHistory`/
// `snapshots`/`verifier` are handed straight to 0.8.142's own single call,
// exactly as supplied; every one of 0.8.139's/0.8.140's/0.8.142's own
// tolerances for non-array or malformed input applies here unchanged, and
// this file never throws on malformed input by itself. This file's own
// additional pass over `claimHistory` reuses the identical
// `instanceof LeaderboardClaimRecord` filter 0.8.140's own bridging pass
// already holds — a non-array `claimHistory` degrades to zero entries in
// `claimsWithoutCorrespondence`, never a thrown error.
//
// A VERIFIER IS REQUIRED EXACTLY WHEN 0.8.142 ITSELF REQUIRES ONE — NEVER
// EAGERLY, NEVER RE-VALIDATED HERE. `verifier` is handed straight to
// 0.8.142's own single call; this file performs no validation of
// `verifier` itself and calls no verifier method directly. A
// `claimHistory`/`snapshots` combination with zero eligible pairs never
// touches `verifier` at all and never throws — exactly 0.8.142's own
// tolerance, unchanged.
//
// SYNCHRONOUS, PURE, DETERMINISTIC, SELF-CONTAINED (GIVEN A DETERMINISTIC
// VERIFIER): NO CLOCK, NO STORAGE, NO NETWORK, NO MUTATION. Reads no
// clock, mutates neither `claimHistory` nor `snapshots` nor any element
// inside either. Calling this function twice with equivalent arguments —
// even reached by two entirely independent code paths — returns a
// byte-identical result.
//
// ORDERING IS 0.8.142'S OWN, NEVER RESORTED. `divergentCorrespondences`
// preserves 0.8.142's own `divergences` order (first-appearance-in-
// `claimHistory`, then supplied-`snapshots`-position, merely filtered).
// `claimsWithoutCorrespondence` is ordered by first appearance in
// `claimHistory`; `snapshotsWithoutCorrespondence` is ordered by ascending
// `snapshotIndex`. This file introduces no sort of its own anywhere.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any reconciliation ACTION.** No repair, replace, accept, reject,
//   merge, delete, or trust-determination vocabulary anywhere. See "No
//   'action' vocabulary, no policy engine," above — that is 0.8.144's own,
//   separately sized, later question.
// - **Selecting an authoritative claim or snapshot.** This file never
//   decides which side of a divergence is "correct" — every
//   `divergentCorrespondences` entry reports both sides' facts, equally.
// - **Automatic synchronization, archive persistence, or any write.**
//   Neither `claimHistory` nor `snapshots` is ever mutated, and this file
//   introduces no durable "plan" store of its own.
// - **Trust/reputation judgments, fraud detection, a collapsed "valid
//   claim" verdict, severity, or confidence.** See "No collapsed verdict,"
//   above.
// - **Cryptographic verification of anything new.** `verifier` is handed
//   to 0.8.142 exactly as supplied; this file calls no verifier method
//   itself and computes no fingerprint itself.
// - **A second correspondence, verification, or divergence algorithm.**
//   See "Reuses 0.8.142 whole," above.
// - **Signer-sequence narration.** 0.8.141's own, separately sized
//   question — this file reports `signerIdentityId`/`claimCreatedAt` as
//   bare facts on a claim without a corresponding snapshot, never a
//   signer's own ordered sequence; a caller wanting that composes this
//   file's own `claimsWithoutCorrespondence` with 0.8.141 themselves.
// - **Automatic, periodic, or background computation of any kind.** This
//   function runs only when a caller explicitly calls it.
export function describePublisherLeaderboardClaimSnapshotReconciliationPlan(claimHistory, snapshots, verifier) {
    const divergence = describePublisherLeaderboardClaimSnapshotDivergence(claimHistory, snapshots, verifier);

    const divergentCorrespondences = divergence.divergences.filter((entry) => (
        entry.divergence.evidenceFingerprintDiffers ||
        entry.divergence.policyVersionDiffers ||
        entry.divergence.snapshotFingerprintDiffers
    ));

    const correspondingClaimIds = new Set(divergence.divergences.map((entry) => entry.claimId));
    const correspondingSnapshotIndexes = new Set(divergence.divergences.map((entry) => entry.snapshotIndex));

    const claimsWithoutCorrespondence = [];
    const seenClaimIds = new Set();
    (Array.isArray(claimHistory) ? claimHistory : []).forEach((record, claimHistoryPosition) => {
        if (!(record instanceof LeaderboardClaimRecord)) return;
        const claimId = record.claim.id;
        if (seenClaimIds.has(claimId)) return;
        seenClaimIds.add(claimId);
        if (correspondingClaimIds.has(claimId)) return;
        claimsWithoutCorrespondence.push(Object.freeze({
            claimId,
            claimHistoryPosition,
            signerIdentityId: record.claim.signerIdentityId,
            claimCreatedAt: record.claim.createdAt
        }));
    });

    const snapshotsWithoutCorrespondence = [];
    for (let snapshotIndex = 0; snapshotIndex < divergence.snapshotCount; snapshotIndex++) {
        if (correspondingSnapshotIndexes.has(snapshotIndex)) continue;
        snapshotsWithoutCorrespondence.push(Object.freeze({ snapshotIndex }));
    }

    return Object.freeze({
        claimCount: divergence.claimCount,
        distinctClaimIdCount: divergence.distinctClaimIdCount,
        snapshotCount: divergence.snapshotCount,
        correspondenceCount: divergence.correspondenceCount,

        divergentCorrespondenceCount: divergentCorrespondences.length,
        divergentCorrespondences: Object.freeze(divergentCorrespondences),

        claimsWithoutCorrespondenceCount: claimsWithoutCorrespondence.length,
        claimsWithoutCorrespondence: Object.freeze(claimsWithoutCorrespondence),

        snapshotsWithoutCorrespondenceCount: snapshotsWithoutCorrespondence.length,
        snapshotsWithoutCorrespondence: Object.freeze(snapshotsWithoutCorrespondence)
    });
}
