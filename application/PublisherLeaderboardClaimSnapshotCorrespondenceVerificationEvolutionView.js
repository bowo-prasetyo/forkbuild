import { describePublisherLeaderboardClaimEvolution } from './PublisherLeaderboardClaimEvolutionView.js';
import { describePublisherLeaderboardClaimSnapshotCorrespondenceVerification } from './PublisherLeaderboardClaimSnapshotCorrespondenceVerificationView.js';

// 0.8.141 — Historical Claim Verification Evolution Projection.
//
// 0.8.133 answered "how does one signer's own sequence of claims look?" —
// grouped by `signerIdentityId`, ordered by the signer's own declared
// `claimCreatedAt`, deduplicated to distinct claims — but it imports
// nothing from the correspondence/verification family and says nothing
// about how any one claim in that sequence relates to a historical
// snapshot. 0.8.140 answered a genuinely different question — "given a
// whole claim history and an explicitly supplied snapshot sequence, which
// snapshots correspond to which claims, and does each corresponding pair
// verify?" — but it reports every distinct claim in `claimHistory`'s own
// first-appearance order, with no notion of "this signer's Nth claim."
// Both files' own boundaries name the gap between them: 0.8.133 excludes
// "no verification, trust, or 'which claim is currently valid'
// determination of any kind"; 0.8.140 excludes "a temporal projection
// across a sequence of claim histories or snapshot timelines... a later
// 'how did a signer's claims verify against their corresponding
// historical snapshots over time' projection is genuinely separate, later
// work." This file is that composition, finally built — not a third
// comparison or verification engine, but 0.8.140's own per-claim result
// attached onto 0.8.133's own per-signer sequence:
//
//   claimHistory                      snapshots        verifier
//   (LeaderboardClaimRecord[],        (PublisherLeaderboardSnapshot[],
//    0.8.123, UNCHANGED)               EXPLICITLY SUPPLIED, 0.8.119)
//        │                                    │              │
//        ▼                                    │              │
//   describePublisherLeaderboardClaimEvolution()             │
//          (0.8.133, UNCHANGED — signer → distinct           │
//           claims, ordered by claimCreatedAt)                │
//        │                                    │              │
//        │                                    ▼              ▼
//        │           describePublisherLeaderboardClaimSnapshotCorrespondenceVerification()
//        │                  (0.8.140, UNCHANGED — claimId → association +
//        │                   verification facts, over EVERY distinct claim)
//        │                                    │
//        └──────────────────┬─────────────────┘
//                            ▼
//         describePublisherLeaderboardClaimSnapshotCorrespondenceVerificationEvolution()
//                            │
//                            ▼
//   { signerCount, claimCount, distinctClaimIdCount, snapshotCount,
//     signerEvolutions: [{ signerIdentityId, claimCount,
//       claims: [{ claimId, claimCreatedAt, receivedAt, evidenceFingerprint,
//         policyVersion, snapshotFingerprint, origin, matchingSnapshotCount,
//         snapshotMatches: [{ snapshotIndex,
//           association: { evidenceFingerprintMatches, policyVersionMatches,
//             snapshotFingerprintMatches },
//           verification: { signatureValid, evidenceFingerprintMatches,
//             policyVersionMatches, snapshotFingerprintMatches, matches }
//         }, ...] }, ...] }, ...] }
//
// THIS IS A NARRATIVE PROJECTION, NEVER AN EVALUATION ENGINE — THE ONE
// DESIGN DECISION THIS MILESTONE EXISTS TO MAKE EXPLICIT. Given a signer's
// successive claims — say Claim A fully verifies, Claim B corresponds but
// disagrees on one asserted field, Claim C corresponds structurally but
// carries a tampered signature — this file states exactly those facts, in
// claim order, and draws no conclusion about whether the sequence is
// "improving," "declining," "trending," or "trustworthy." This file
// carries no `improved`, `regressed`, `upgraded`, `downgraded`, `progress`,
// `trajectory`, `trend`, `declining`, `maturity`, `quality`, `trust`,
// `confidence`, or `reputation` field, individually or combined, anywhere
// in its result or its own source. Holding this restraint over a
// SEQUENCE, rather than a single fact, is precisely why this milestone is
// separately sized from 0.8.140 — see 0.8.133's own header, "Evidence/
// Snapshot Change Is Observed, Never Interpreted," held here again over
// verification facts instead of raw claim metadata.
//
// NO SECOND EVOLUTION ALGORITHM, NO SECOND CORRESPONDENCE/VERIFICATION
// ALGORITHM — BOTH INPUTS ARE REUSED WHOLE. `signerIdentityId`/`claimCount`/
// every per-claim field other than `matchingSnapshotCount`/`snapshotMatches`
// is 0.8.133's own result (`describePublisherLeaderboardClaimEvolution()`),
// carried through byte for byte — the grouping, the distinct-claim
// deduplication, and the `claimCreatedAt` ordering are 0.8.133's decisions,
// never repeated here. Every `matchingSnapshotCount`/`snapshotMatches`/
// `association.*`/`verification.*` fact is 0.8.140's own result
// (`describePublisherLeaderboardClaimSnapshotCorrespondenceVerification()`),
// called exactly ONCE over the whole `claimHistory`/`snapshots`/`verifier`
// — never once per signer, never once per claim — and embedded whole and
// unmodified. This file's only original work is a single pass building
// `claimId → 0.8.140's own correspondence entry`, then reading that map
// once per claim while walking 0.8.133's own `signerEvolutions` — the
// identical "bridging is wiring, not a second discovery algorithm"
// restraint 0.8.140's own header already holds for its own `claimId →
// record` pass, held here again one layer up.
//
// BOTH INPUTS DEDUPLICATE BY THE IDENTICAL `claim.id`, SO EVERY CLAIM
// 0.8.133 LISTS HAS EXACTLY ONE 0.8.140 ENTRY TO ATTACH. 0.8.133's own
// distinct-claim list and 0.8.140's own `correspondences` are each built
// by scanning the SAME `claimHistory` argument and keeping the first
// receipt of each distinct `claim.id` (0.8.128's/0.8.132's own
// restraint, reused identically by both files) — so the `claimId → entry`
// map built from 0.8.140's result is guaranteed to have an entry for
// every `claimId` 0.8.133 reports, and this file performs no existence
// check before reading it, exactly as 0.8.140's own `recordsByClaimId.get()`
// trusts the identical invariant one layer down.
//
// DUPLICATE RECEIPTS NEVER CREATE DUPLICATE EVOLUTION ENTRIES OR INFLATE A
// SIGNER'S OWN CLAIM COUNT — REUSING, NEVER RE-DERIVING, 0.8.133'S OWN
// RESTRAINT. Top-level `claimCount` counts RECEIPTS, exactly as 0.8.133's/
// 0.8.140's own `claimCount` already does — every stored
// `LeaderboardClaimRecord`, duplicates included. But `signerEvolutions[*]
// .claimCount` and `signerEvolutions[*].claims` are 0.8.133's own DISTINCT
// count and DISTINCT list — the same claim id received twice contributes
// one entry, not two, to a signer's own sequence, and the identical claim
// received twice is verified against `snapshots` exactly once, its
// `matchingSnapshotCount`/`snapshotMatches` computed for that one distinct
// claim id, never duplicated alongside it.
//
// A CLAIM WITH ZERO CORRESPONDING SNAPSHOTS REMAINS `snapshotMatches: []`
// IN ITS OWN SEQUENCE POSITION — NEVER `verificationFailed: true`, NEVER
// DROPPED FROM THE SEQUENCE. Reusing, never re-deriving, 0.8.139's/
// 0.8.140's own restraint: "absence of correspondence is not verification
// failure." A signer's fourth claim naming a snapshot nobody supplied
// still occupies its own claim-order position in `claims`, with
// `matchingSnapshotCount: 0` and an empty `snapshotMatches` — exactly
// 0.8.140's own entry for that claim, attached unchanged. This distinction
// matters MORE in a sequence than it did for a single claim, because a
// reader scanning a signer's history could otherwise mistake "no
// snapshot was ever supplied for this claim" for "this claim failed to
// verify" — this file's own FLAGSHIP test proves the two remain visibly
// distinct across all four claims in one signer's own sequence.
//
// ORDERING IS 0.8.133'S OWN, NEVER RESORTED BY THIS FILE.
// `signerEvolutions` is ordered by each signer's own first appearance in
// `claimHistory` (0.8.133's own discipline); within one signer,
// `claims` is ordered by `claimCreatedAt` ascending with first-receipt
// position as the tie-break (0.8.133's own discipline). `snapshotMatches`
// within one claim is ordered by the position `snapshots` was supplied in
// (0.8.139's/0.8.140's own discipline, carried through unchanged). This
// file introduces no sort of its own anywhere.
//
// A VERIFIER IS REQUIRED EXACTLY WHEN 0.8.140 ITSELF REQUIRES ONE — NEVER
// EAGERLY, NEVER SILENTLY TOLERATED, NEVER RE-VALIDATED HERE. `verifier`
// is handed straight to 0.8.140's own single call; this file performs no
// validation of `verifier` itself and calls no verifier method directly.
// A `claimHistory`/`snapshots` combination with zero eligible pairs never
// touches `verifier` at all and never throws — exactly 0.8.140's own
// tolerance, unchanged.
//
// ARCHITECTURAL BOUNDARY — IMPORTS 0.8.133 AND 0.8.140 ONLY. This file
// imports nothing from `application/LeaderboardClaimRecord.js` (it
// performs no independent record filtering of its own — both 0.8.133 and
// 0.8.140 already do that, identically, over the same argument),
// `application/PublisherLeaderboardClaimSnapshotCorrespondenceView.js`,
// `application/PublisherLeaderboardHistoricalClaimVerification.js`,
// `application/PublisherLeaderboardClaimSnapshotAssociationView.js`,
// `application/PublisherLeaderboardClaimAgreementView.js`, any signing or
// identity module, any archive module, any ranking module, or
// `application/PublisherLeaderboardSnapshotTimelineView.js` — grep it and
// none of that vocabulary appears. The dependency direction stays a
// straight line: 0.8.133 → 0.8.141 ← 0.8.140, never a third, parallel
// engine duplicating either.
//
// MALFORMED INPUT TOLERANCE MATCHES 0.8.133'S AND 0.8.140'S OWN, UNCHANGED.
// `claimHistory`/`snapshots`/`verifier` are handed straight to both
// sub-functions exactly as supplied; a non-array `claimHistory`, a
// non-array `snapshots`, or history entries that are not genuine
// `LeaderboardClaimRecord` instances all degrade exactly as 0.8.133's and
// 0.8.140's own tolerances already degrade them, and never throw here.
//
// SYNCHRONOUS, PURE, DETERMINISTIC, SELF-CONTAINED (GIVEN A DETERMINISTIC
// VERIFIER): NO CLOCK, NO STORAGE, NO NETWORK, NO MUTATION. Reads no
// clock, mutates neither `claimHistory` nor `snapshots` nor any element
// inside either. Calling this function twice with equivalent arguments
// returns a byte-identical result.
//
// NO RECONSTRUCT VARIANT — MATCHING 0.8.139's/0.8.140's OWN CHOICE, NOT
// 0.8.133's. `snapshots` and `verifier` are always explicitly supplied by
// a caller, exactly as 0.8.139 and 0.8.140 already require; there is no
// archive that stores "the corresponding historical snapshots" for this
// file to reconstruct on a caller's behalf, so — like 0.8.139 and 0.8.140,
// and unlike 0.8.133's own `reconstructPublisherLeaderboardClaimEvolution()`
// — this file exposes only the pure, caller-supplied computation.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Improvement/regression/trend judgments of any kind.** See "This is
//   a narrative projection, never an evaluation engine," above.
// - **Trust/reputation judgments, confidence scores, a collapsed verdict
//   beyond 0.8.140's own `matches`.** The identical vocabulary boundary
//   0.8.133/0.8.139/0.8.140 already hold, held here again.
// - **A second evolution algorithm or a second correspondence/verification
//   algorithm.** See "No second evolution algorithm," above — both 0.8.133
//   and 0.8.140 are called, neither is re-implemented.
// - **Automatic snapshot selection, "best matching" snapshot selection.**
//   Ambiguity is reported, never resolved — 0.8.139's/0.8.140's own
//   restraint, carried through unchanged.
// - **Automatic snapshot reconstruction, archive access.** `snapshots` is
//   always an explicitly supplied array; see "No reconstruct variant,"
//   above.
// - **Cross-signer comparison of two signers' own verification sequences.**
//   Genuinely separate, later work composing this file's own per-signer
//   results, exactly as 0.8.133's own header excludes the identical
//   composition for its own per-signer sequences.
// - **"Difference between two of a signer's own successive claims."**
//   0.8.134's own, separately sized question, over two whole snapshots.
// - **New cryptographic primitives, new fingerprint computation, new
//   signature verification.** `verifier` is handed to 0.8.140 exactly as
//   supplied; this file calls no verifier method itself.
// - **Persistence of verification results, synchronization of any kind.**
//   Neither argument is ever mutated, and this file introduces no durable
//   store of its own.
// - **Automatic, periodic, or background computation of any kind.** This
//   function runs only when a caller explicitly calls it.
export function describePublisherLeaderboardClaimSnapshotCorrespondenceVerificationEvolution(claimHistory, snapshots, verifier) {
    const evolution = describePublisherLeaderboardClaimEvolution(claimHistory);
    const correspondenceVerification = describePublisherLeaderboardClaimSnapshotCorrespondenceVerification(claimHistory, snapshots, verifier);

    const correspondenceByClaimId = new Map();
    for (const entry of correspondenceVerification.correspondences) {
        correspondenceByClaimId.set(entry.claimId, entry);
    }

    const signerEvolutions = evolution.signerEvolutions.map((signerEvolution) => {
        const claims = signerEvolution.claims.map((claim) => {
            const correspondence = correspondenceByClaimId.get(claim.claimId);

            return Object.freeze({
                ...claim,
                matchingSnapshotCount: correspondence.matchingSnapshotCount,
                snapshotMatches: correspondence.snapshotMatches
            });
        });

        return Object.freeze({
            signerIdentityId: signerEvolution.signerIdentityId,
            claimCount: signerEvolution.claimCount,
            claims: Object.freeze(claims)
        });
    });

    return Object.freeze({
        signerCount: evolution.signerCount,
        claimCount: evolution.claimCount,
        distinctClaimIdCount: correspondenceVerification.distinctClaimIdCount,
        snapshotCount: correspondenceVerification.snapshotCount,
        signerEvolutions: Object.freeze(signerEvolutions)
    });
}
