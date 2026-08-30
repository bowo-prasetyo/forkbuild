import { describePublisherLeaderboardClaimSnapshotCorrespondenceVerification } from './PublisherLeaderboardClaimSnapshotCorrespondenceVerificationView.js';

// 0.8.142 — Historical Claim/Snapshot Divergence Projection.
//
// 0.8.140 answered "given a whole claim history and an explicitly supplied
// snapshot sequence, which snapshots correspond to which claims, and does
// each corresponding pair verify?" — for every (claim, snapshot) pair it
// discovered, it reports 0.8.139's own three structural `association` facts
// side by side with 0.8.135's own five `verification` facts, never
// collapsing either into the other. What it deliberately does not do is
// name, on the pair itself, WHICH of those independently-observable facts
// disagree — a caller wanting that has to read three `verification.*`
// booleans and mentally negate them, once per pair, across a whole
// historical world. This file is that one remaining step, finally taken —
// not a fourth comparison engine, but 0.8.140's own per-pair result,
// flattened across every claim, with three already-known facts read once
// each and restated as their own negation:
//
//   claimHistory                      snapshots        verifier
//   (LeaderboardClaimRecord[],        (PublisherLeaderboardSnapshot[],
//    0.8.123, UNCHANGED)               EXPLICITLY SUPPLIED, 0.8.119)
//        │                                    │              │
//        └──────────────────┬─────────────────┴──────────────┘
//                            ▼
//         describePublisherLeaderboardClaimSnapshotCorrespondenceVerification()
//                (0.8.140, UNCHANGED — embeds 0.8.139's own
//                 correspondence discovery and 0.8.135's own historical
//                 verification, one call over the whole world)
//                            │
//                            │  one flattened divergences[] entry per
//                            │  kept snapshotMatches[] entry, across
//                            │  every correspondence
//                            ▼
//         describePublisherLeaderboardClaimSnapshotDivergence()
//                            │
//                            ▼
//   { claimCount, distinctClaimIdCount, snapshotCount, correspondenceCount,
//     divergenceCount,
//     divergences: [{ claimId, snapshotIndex,
//       association: { evidenceFingerprintMatches, policyVersionMatches,
//         snapshotFingerprintMatches },
//       verification: { signatureValid, evidenceFingerprintMatches,
//         policyVersionMatches, snapshotFingerprintMatches, matches },
//       divergence: { evidenceFingerprintDiffers, policyVersionDiffers,
//         snapshotFingerprintDiffers }
//     }, ...] }
//
// "DIVERGENCE" NAMES THE COLLECTION, NOT A FILTER — EVERY DISCOVERED
// CORRESPONDENCE IS PROJECTED, WHETHER OR NOT ANY OF ITS THREE FIELDS
// ACTUALLY DISAGREE. A pair whose claim and snapshot agree on everything
// (every `verification.*Matches` true, `signatureValid` true) still gets
// its own `divergences[]` entry — with `divergence.evidenceFingerprintDiffers:
// false`, `policyVersionDiffers: false`, `snapshotFingerprintDiffers: false`
// sitting right there as an equally honest fact. This file's own name
// describes the PROJECTION's subject — "does this corresponding pair
// diverge, and where?" — never a pre-filtered "only the disagreeing ones"
// view. A caller wanting only the pairs that actually disagree already has
// everything needed to filter `divergences` down to
// `divergence.evidenceFingerprintDiffers || divergence.policyVersionDiffers
// || divergence.snapshotFingerprintDiffers` themselves; this file performs
// no such filtering on their behalf, because "corresponds and agrees" is
// exactly as much a fact worth keeping visible as "corresponds and
// disagrees."
//
// ABSENCE OF CORRESPONDENCE NEVER APPEARS IN `divergences` — THE ONE RULE
// THIS MILESTONE EXISTS TO GUARANTEE ACROSS A WHOLE COLLECTION. A claim
// with no corresponding supplied snapshot at all (0.8.139's own
// `matchingSnapshotCount: 0`, carried through 0.8.140 unchanged) contributes
// ZERO entries to `divergences` — never an entry with fabricated `false`
// booleans standing in for "nothing to compare," and never an entry with
// some invented `noCorrespondence: true` marker either. 0.8.139's own
// restraint — "absence of a supplied matching snapshot is itself a fact
// worth reporting" — is honored one layer up by simply not inventing a
// divergence fact for a comparison that never happened. See this file's own
// FLAGSHIP test's fourth case: a claim naming no supplied snapshot at all
// occupies its own `correspondences` entry one layer down (reachable by
// calling 0.8.140 directly), and precisely zero `divergences[]` entries
// here. Absence ≠ failure ≠ divergence — 0.8.140's own header names the
// first two links in that chain; this file is the third.
//
// THREE FIELDS, NEVER COLLAPSED INTO ONE — THE IDENTICAL DISCIPLINE
// 0.8.134'S OWN FOUR-FACT `Changed` RESULT AND 0.8.137'S/0.8.139'S/0.8.140'S
// OWN THREE-FACT `Matches` RESULTS ALREADY HOLD, NOW NEGATED ONE LAYER UP.
// `divergence.evidenceFingerprintDiffers`, `policyVersionDiffers`, and
// `snapshotFingerprintDiffers` are three INDEPENDENT booleans — each the
// plain negation of the identically-named `verification.*Matches` fact on
// the very same entry, computed once, never re-derived by a second
// comparison. A pair can diverge on exactly one of the three (this file's
// own FLAGSHIP Case B: `evidenceFingerprintDiffers: true` alone, the other
// two `false`) — the identical "self-inconsistency, not hidden by an
// agreeing composite fingerprint" case 0.8.139's own header already
// describes for `association`, restated here as its own explicit `differs`
// fact instead of a `matches` fact a reader has to mentally invert.
//
// SIGNATURE VALIDITY IS NEVER PART OF `divergence` — IT ALREADY HAS ITS OWN
// INDEPENDENT FACT, `verification.signatureValid`, CARRIED THROUGH
// UNTOUCHED. This file adds no `signatureDiffers` or `signatureInvalid`
// field inside `divergence` — a tampered or forged signature is not a
// "divergence" between a claim's own asserted fields and a snapshot's; it
// is a separate cryptographic fact, already reported as
// `verification.signatureValid`, sitting right beside `divergence` on the
// identical entry rather than folded into it. See this file's own FLAGSHIP
// Case C: `verification.signatureValid: false` alongside
// `divergence.evidenceFingerprintDiffers: false`,
// `divergence.policyVersionDiffers: false`,
// `divergence.snapshotFingerprintDiffers: false` — every one of a claim's
// own asserted fields genuinely agrees with the snapshot it corresponds to,
// while its signature is independently, separately invalid. Collapsing
// those two facts into one would silently discard exactly the distinction
// 0.8.140's own header calls out as "a perfectly representable factual
// result."
//
// REUSES 0.8.140 WHOLE — NO SECOND CORRESPONDENCE OR VERIFICATION ENGINE,
// AND NO CALL INTO 0.8.139 OR 0.8.135 OF ITS OWN. Every `claimId`/
// `snapshotIndex`/`association.*`/`verification.*` fact below is
// `describePublisherLeaderboardClaimSnapshotCorrespondenceVerification()`'s
// (0.8.140, UNCHANGED) own result for that pair, embedded by reference —
// this file calls 0.8.140 exactly ONCE, over the whole `claimHistory`/
// `snapshots`/`verifier`, and performs no independent fingerprint
// comparison, no independent signature check, and no second discovery pass
// of its own. Its only original work is flattening 0.8.140's own
// claim-then-snapshotMatches nesting into one flat list, and computing three
// negations per entry.
//
// A NOTE ON 0.8.134 — CITED AS THE PATTERN, NEVER IMPORTED AS A FUNCTION.
// 0.8.134's own `describePublisherLeaderboardSnapshotDifference()` pioneers
// the exact shape this file reuses — a `Changed`/`Differs` fact reported as
// the plain negation of an already-computed `Matches` fact, never a second,
// independent comparison — and this file's header credits it for that
// discipline. But 0.8.134 compares two WHOLE snapshots (`policy` and
// `leaderboard` objects included), and a claim is not a snapshot: a claim
// carries exactly three SCALAR assertions (`evidenceFingerprint`,
// `policyVersion`, `snapshotFingerprint`) about a snapshot, never a
// `policy` or `leaderboard` of its own to hand 0.8.134's own comparison.
// Calling 0.8.134 here would require synthesizing a fake "claim's own
// snapshot" out of thin air — exactly the kind of invented data this whole
// family's own headers refuse. The claim-vs-snapshot scalar comparison this
// file needs is already 0.8.137's/0.8.135's own job, reached through
// 0.8.140; this file imports 0.8.134 from nowhere, and grepping it finds no
// such import.
//
// EVERY DIVERGENCE ENTRY IS ORDERED EXACTLY AS 0.8.140 ALREADY ORDERS ITS
// OWN NESTING — NEVER RESORTED, NEVER GROUPED BY WHICH FIELDS DISAGREE.
// `divergences` walks `correspondences` in 0.8.140's own first-appearance
// order, and within one claim walks `snapshotMatches` in 0.8.140's own
// supplied-`snapshots`-position order — the identical two-level ordering
// 0.8.139's/0.8.140's own headers already hold, merely flattened rather
// than resorted. This file introduces no sort of its own anywhere — never
// by divergence count, never by "most divergent first," never by claim id.
//
// NO COLLAPSED VERDICT, NO SEVERITY, NO CONFIDENCE, NO TRUST OR FRAUD
// VOCABULARY. A mismatch is a mismatch. This file's own result carries no
// `fraud`, `invalidClaim`, `conflict`, `regression`, `severity`,
// `confidence`, `trust`, `reputation`, `score`, or `rank` field anywhere —
// the identical vocabulary boundary every file in this family already
// holds, held here again over a per-field `differs` fact instead of a
// per-field `matches` fact.
//
// ARCHITECTURAL BOUNDARY — IMPORTS 0.8.140 ONLY. This file imports nothing
// from `application/LeaderboardClaimRecord.js` (0.8.140's own single call
// already performs every record filter this file would otherwise need),
// `application/PublisherLeaderboardClaimSnapshotCorrespondenceView.js`,
// `application/PublisherLeaderboardHistoricalClaimVerification.js`,
// `application/PublisherLeaderboardClaimSnapshotAssociationView.js`,
// `application/PublisherLeaderboardSnapshotDifference.js`, any signing or
// identity module, any archive module, any ranking module, or
// `application/PublisherLeaderboardSnapshotTimelineView.js` — grep it and
// none of that vocabulary appears. The dependency direction stays a single
// line: 0.8.140 → 0.8.142, never a parallel engine duplicating it.
//
// MALFORMED INPUT TOLERANCE MATCHES 0.8.140'S OWN, UNCHANGED. `claimHistory`/
// `snapshots`/`verifier` are handed straight to 0.8.140's own single call,
// exactly as supplied; every one of 0.8.139's/0.8.140's own tolerances for
// non-array or malformed input applies here unchanged, and this file never
// throws on malformed input by itself.
//
// A VERIFIER IS REQUIRED EXACTLY WHEN 0.8.140 ITSELF REQUIRES ONE — NEVER
// EAGERLY, NEVER RE-VALIDATED HERE. `verifier` is handed straight to
// 0.8.140's own single call; this file performs no validation of `verifier`
// itself and calls no verifier method directly. A `claimHistory`/`snapshots`
// combination with zero eligible pairs never touches `verifier` at all and
// never throws — exactly 0.8.140's own tolerance, unchanged.
//
// SYNCHRONOUS, PURE, DETERMINISTIC, SELF-CONTAINED (GIVEN A DETERMINISTIC
// VERIFIER): NO CLOCK, NO STORAGE, NO NETWORK, NO MUTATION. Reads no clock,
// mutates neither `claimHistory` nor `snapshots` nor any element inside
// either. Calling this function twice with equivalent arguments — even
// reached by two entirely independent code paths — returns a
// byte-identical result.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Automatic pairing, automatic snapshot selection.** Every
//   correspondence 0.8.140 discovered is projected; ambiguity is reported,
//   never resolved — 0.8.139's/0.8.140's own restraint, carried through.
// - **Trust/reputation judgments, fraud detection, a collapsed "valid
//   claim" verdict.** See "No collapsed verdict," above.
// - **Improvement/regression judgments, severity scoring, confidence.** A
//   divergence is reported and nothing is concluded from it — this file
//   carries no `improved`/`regressed`/`severity`/`confidence` field
//   anywhere, individually or combined.
// - **Remediation, reconciliation, or any "what should change" projection.**
//   That is 0.8.143's own, separately sized, later question — this file
//   only names WHERE a divergence exists, never what ought to be done about
//   it.
// - **Synchronization or persistence of any kind.** Neither argument is
//   ever mutated, and this file introduces no durable "divergence" store of
//   its own.
// - **New cryptographic operations.** `verifier` is handed to 0.8.140
//   exactly as supplied; this file calls no verifier method itself and
//   computes no fingerprint itself.
// - **A second correspondence, verification, or snapshot-difference
//   algorithm.** See "Reuses 0.8.140 whole" and "A note on 0.8.134," above.
// - **Automatic, periodic, or background computation of any kind.** This
//   function runs only when a caller explicitly calls it.
export function describePublisherLeaderboardClaimSnapshotDivergence(claimHistory, snapshots, verifier) {
    const correspondenceVerification = describePublisherLeaderboardClaimSnapshotCorrespondenceVerification(claimHistory, snapshots, verifier);

    const divergences = [];
    for (const entry of correspondenceVerification.correspondences) {
        for (const match of entry.snapshotMatches) {
            divergences.push(Object.freeze({
                claimId: entry.claimId,
                snapshotIndex: match.snapshotIndex,
                association: match.association,
                verification: match.verification,
                divergence: Object.freeze({
                    evidenceFingerprintDiffers: !match.verification.evidenceFingerprintMatches,
                    policyVersionDiffers: !match.verification.policyVersionMatches,
                    snapshotFingerprintDiffers: !match.verification.snapshotFingerprintMatches
                })
            }));
        }
    }

    return Object.freeze({
        claimCount: correspondenceVerification.claimCount,
        distinctClaimIdCount: correspondenceVerification.distinctClaimIdCount,
        snapshotCount: correspondenceVerification.snapshotCount,
        correspondenceCount: correspondenceVerification.correspondenceCount,
        divergenceCount: divergences.length,
        divergences: Object.freeze(divergences)
    });
}
