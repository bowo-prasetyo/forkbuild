import { describePublisherLeaderboardSnapshot } from './PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from './PublisherLeaderboardSnapshotFingerprint.js';
import { describePublisherLeaderboardSnapshotClaimVerification } from './PublisherLeaderboardSnapshotClaimVerification.js';
import { LeaderboardClaimRecord } from './LeaderboardClaimRecord.js';

// 0.8.135 — Historical Signed Leaderboard Claim Verification.
//
// 0.8.124/0.8.125 answered "does this stored claim match what THIS
// REPLICA computes RIGHT NOW?" — always reconstructing a fresh local
// snapshot from this replica's own current archive. 0.8.134's own
// "Deliberately excluded" list named the one question that answer can
// never give: "did this stored claim correspond to a particular
// HISTORICAL snapshot?" — a genuinely different question, because
// 0.8.124/0.8.125's own answer can change tomorrow, for the identical
// stored claim, the moment new evidence arrives (see
// `application/PublisherLeaderboardClaimVerificationView.js`'s own
// flagship). This file is that different question, answered against an
// immutable, caller-supplied artifact instead of a moving target:
//
//   LeaderboardClaimRecord              PublisherLeaderboardSnapshot
//   (0.8.123, UNCHANGED — claim +        (0.8.119, UNCHANGED — an
//    receivedAt)                          EXPLICITLY SUPPLIED historical
//              │                          artifact, NEVER reconstructed
//              │                          from an archive)
//              │                                     │
//              ├── record.claim  ─────────┐          │
//              │                          ▼          ▼
//              │           describePublisherLeaderboardSnapshotClaimVerification()
//              │                  (0.8.121, UNCHANGED — signature +
//              │                   three independent semantic facts)
//              │                          │
//              └───────────┬──────────────┘
//                           ▼
//        describePublisherLeaderboardHistoricalClaimVerification()
//                           │
//                           ▼
//   { signerIdentityId, claimCreatedAt, receivedAt,
//     historicalEvidenceFingerprint, historicalPolicyVersion,
//     historicalSnapshotFingerprint,
//     signatureValid,
//     evidenceFingerprintMatches, policyVersionMatches, snapshotFingerprintMatches,
//     matches }
//
// CRITICAL ARCHITECTURAL RULE — DO NOT RECONSTRUCT ANYTHING. Every other
// verification/comparison entry point in this family that reads FROM
// somewhere pulls a snapshot out of THIS replica's own current archive
// (`reconstructPublisherLeaderboardSnapshot()`, 0.8.119, UNCHANGED) —
// `verifyPublisherLeaderboardSnapshot()` (0.8.120),
// `verifyPublisherLeaderboardSnapshotClaim()` (0.8.121),
// `reconstructPublisherLeaderboardClaimVerification()` (0.8.124). This
// file has no such archive-reading entry point, and never will — grep it
// and there is no `PublicationObservationArchive` import anywhere. The
// caller supplies BOTH the stored claim AND the historical snapshot to
// check it against; this file reconstructs neither from anything:
//
//   stored claim  +  historical snapshot  →  historical verification
//   stored claim  +  current archive      →  current verification  (0.8.124, unchanged, untouched)
//
// A version of this file that accepted an archive and quietly
// reconstructed "the snapshot from back then" would not be a historical
// verifier at all — it would be 0.8.124's own current verification,
// renamed, silently discarding the very artifact this milestone exists to
// let a caller name explicitly. There is no snapshot-history persistence,
// no automatic snapshot selection, and no archive reconstruction of any
// kind anywhere in this file — a caller who wants "compare against
// whatever this replica currently computes" already has that, unchanged,
// at 0.8.124's own `reconstructPublisherLeaderboardClaimVerification()`.
//
// REUSES 0.8.121's OWN FOUR FACTS, EXACTLY — NEVER A SECOND VERIFICATION
// VOCABULARY. `signatureValid`, `evidenceFingerprintMatches`,
// `policyVersionMatches`, `snapshotFingerprintMatches`, and `matches`
// below are `describePublisherLeaderboardSnapshotClaimVerification()`'s
// (0.8.121, UNCHANGED) own result, carried through byte for byte — the
// identical "carried through unchanged, never re-derived" restraint
// 0.8.124's own header already holds, held here once more against a
// caller-supplied historical snapshot instead of a freshly reconstructed
// local one. This file computes none of those five fields itself; it
// only chooses WHAT snapshot they are computed against.
//
// SIGNATURE VALIDITY IS INTRINSIC TO THE CLAIM; SEMANTIC AGREEMENT IS
// RELATIONAL TO THE SUPPLIED SNAPSHOT — THE ONE ARCHITECTURAL PRINCIPLE
// THIS MILESTONE EXISTS TO MAKE EXPLICIT. `signatureValid` answers
// whether `claimRecord.claim.signerIdentityId` genuinely signed exactly
// this claim — a fact about the claim ALONE, unaffected by which snapshot
// it is being checked against, and therefore IDENTICAL across every call
// to this file's own function for the same stored record, no matter what
// `snapshot` is supplied. `evidenceFingerprintMatches`,
// `policyVersionMatches`, and `snapshotFingerprintMatches` answer whether
// the claim's own assertions agree with THIS PARTICULAR supplied
// snapshot — a fact about a RELATIONSHIP, expected to flip between two
// different snapshots even though the stored claim itself never changes.
// See this file's own flagship test for the concrete proof: the identical
// claim, checked against two different snapshots, reports
// `signatureValid: true` both times while the three semantic facts (and
// `matches`) flip between them.
//
// THE HISTORICAL SNAPSHOT'S OWN IDENTITY FIELDS ARE ECHOED, NEVER
// RE-DERIVED BY THE CALLER. `historicalEvidenceFingerprint`,
// `historicalPolicyVersion`, and `historicalSnapshotFingerprint` report
// exactly what the SUPPLIED `snapshot` argument's own identity was at the
// moment of this call — the first two read directly off
// `describePublisherLeaderboardSnapshot()`'s (0.8.119, UNCHANGED) own
// normalized result, the third computed by
// `describePublisherLeaderboardSnapshotFingerprint()` (0.8.121,
// UNCHANGED) over that identical normalized snapshot — so a caller never
// needs to separately re-normalize or re-fingerprint the snapshot it just
// supplied merely to explain WHY `evidenceFingerprintMatches` or
// `snapshotFingerprintMatches` reads `false`. These three fields describe
// the supplied snapshot; they say nothing about which snapshot is
// "current," "correct," or "authoritative" — the identical restraint
// 0.8.134's own header already holds for `sourceEvidenceFingerprint`/
// `targetEvidenceFingerprint`, held here once more over a single supplied
// snapshot instead of a pair.
//
// RECEIPT METADATA IS CARRIED THROUGH UNCHANGED — THE IDENTICAL RESTRAINT
// 0.8.124's OWN HEADER ALREADY HOLDS. `signerIdentityId`, `claimCreatedAt`,
// and `receivedAt` are read straight off `claimRecord` and its own
// `claim`, exactly as 0.8.124's own
// `describePublisherLeaderboardClaimVerification()` already reads them —
// this file adds no fourth metadata field and renames none of the three.
//
// A RECORD, NEVER A BARE CLAIM — THE IDENTICAL "ONE DURABLE UNIT" CHOICE
// 0.8.124's OWN HEADER ALREADY MAKES. `claimRecord` must be a genuine
// `LeaderboardClaimRecord` (0.8.123, UNCHANGED); a bare
// `PublisherLeaderboardSnapshotClaim` or plain claim JSON is not a
// genuine candidate here and projects to `null`, exactly like 0.8.124's
// own tolerance. A caller wanting the four bare-claim comparison facts
// alone, with no receipt metadata at all, already has 0.8.121's own
// `describePublisherLeaderboardSnapshotClaimVerification()` for exactly
// that — unchanged, and reused by this file rather than duplicated.
//
// NORMALIZATION REUSES 0.8.119's OWN TOLERANCE FOR THE SUPPLIED SNAPSHOT
// — THE IDENTICAL RESTRAINT 0.8.120's/0.8.134's OWN `normalizeSnapshot()`
// ALREADY HOLDS. The `snapshot` handed to this file's own functions is
// routed through `describePublisherLeaderboardSnapshot()` (0.8.119,
// UNCHANGED) before any comparison or fingerprinting — the exact same
// function, and therefore the exact same fallback, that already degrades
// a non-genuine `evidenceFingerprint` to the canonical empty-evidence
// fingerprint and a non-genuine leaderboard to
// `describePublisherLeaderboard(undefined)`. A well-formed historical
// snapshot passes through unchanged; anything missing, `null`, or shaped
// like garbage normalizes to the identical well-defined empty snapshot
// 0.8.119 already defines — never a thrown error, never a second
// definition of "empty."
//
// TWO FUNCTIONS, DELIBERATELY THE SAME SHAPE — NOT TWO LAYERS OF NEW
// COMPUTATION. Every other pair in this family (`describeXxx()` +
// `reconstructXxx()`/`verifyXxx()`) splits a pure projection from a thin
// archive-reading boundary. This milestone's own "do not reconstruct
// anything" rule leaves no archive for a second function to bridge, so
// there is no reconstruction boundary here to name. `describePublisherLeaderboardHistoricalClaimVerification()`
// is the pure projection this file exists to add.
// `verifyPublisherLeaderboardHistoricalClaim()` is a deliberately thin,
// literal alias of it — identical inputs, identical tolerance, identical
// output, added only so a caller reaches for the verb this milestone's
// own name promises ("verification") without needing to know this
// family's internal `describeXxx()` naming convention. It performs no
// additional computation, reads nothing this file's other function does
// not already read, and is not a second, competing entry point with its
// own rules.
//
// A MALFORMED/ABSENT RECORD PROJECTS TO `null`, NEVER A THROW, AND NEVER
// A FABRICATED VERDICT — THE IDENTICAL TOLERANCE 0.8.124's OWN HEADER
// ALREADY HOLDS. A malformed `LeaderboardClaimRecord` has no `receivedAt`
// to honestly report and no `claim` to check — there is no receipt to
// project a comparison onto in the first place — so both functions below
// return `null` rather than inventing one.
//
// DOES NOT PERSIST THE VERIFICATION RESULT, DOES NOT PERSIST THE
// HISTORICAL SNAPSHOT ITSELF. Neither function below writes anything —
// not to `claimRecord`, not to `snapshot`, not to any archive, and this
// file introduces no durable "historical snapshot store" of its own (see
// "Deliberately exclude," below). `claimRecord` is read, never mutated
// (it is frozen already — 0.8.123's own rule, unchanged), and `snapshot`
// is read, never mutated either. Every call recomputes fresh, from
// whatever `claimRecord`/`snapshot` are handed to it at that moment.
//
// SYNCHRONOUS, PURE, DETERMINISTIC, SELF-CONTAINED: NO CLOCK, NO STORAGE,
// NO NETWORK, NO MUTATION. Reads no clock (`receivedAt`/`claimCreatedAt`
// are read off already-stamped fields, never freshly stamped here).
// Calling either function twice with equivalent arguments — even reached
// by two entirely independent code paths — returns a byte-identical
// result.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Historical snapshot persistence.** This file accepts a snapshot a
//   caller already holds; it introduces no store, archive, or index of
//   historical snapshots of its own.
// - **Automatic selection of a snapshot.** There is no "pick the snapshot
//   from around when this claim was signed" logic anywhere in this file —
//   the caller always names the exact snapshot explicitly.
// - **Archive reconstruction of any kind.** See "Critical architectural
//   rule," above.
// - **Trust/reputation judgments, a "valid"/"invalid" collapsed status,
//   or claim ranking.** The identical vocabulary boundary
//   0.8.120/0.8.121/0.8.124/0.8.134 already hold — no `trusted`,
//   `authoritative`, `score`, `rank`, or `confidence` field anywhere.
// - **Automatic historical matching** ("which stored snapshot did this
//   claim actually match") — genuinely separate, later work, composing
//   this file's own comparison with whatever historical snapshots a
//   caller happens to hold, never folded into this pure function.
// - **Signature creation or new cryptographic algorithms.** This file
//   verifies; it never signs, and it imports no cryptographic primitive
//   `identity/LocalAuthorizationVerifier.js` does not already provide.
export function describePublisherLeaderboardHistoricalClaimVerification(claimRecord, snapshot, verifier) {
    if (!(claimRecord instanceof LeaderboardClaimRecord)) return null;

    const normalizedHistorical = normalizeSnapshot(snapshot);
    const historicalSnapshotFingerprint = describePublisherLeaderboardSnapshotFingerprint(normalizedHistorical).fingerprint;

    const verification = describePublisherLeaderboardSnapshotClaimVerification(normalizedHistorical, claimRecord.claim, verifier);

    return Object.freeze({
        signerIdentityId: claimRecord.claim.signerIdentityId,
        claimCreatedAt: claimRecord.claim.createdAt,
        receivedAt: claimRecord.receivedAt,

        historicalEvidenceFingerprint: normalizedHistorical.evidenceFingerprint,
        historicalPolicyVersion: normalizedHistorical.policy.version,
        historicalSnapshotFingerprint,

        signatureValid: verification.signatureValid,

        evidenceFingerprintMatches: verification.evidenceFingerprintMatches,
        policyVersionMatches: verification.policyVersionMatches,
        snapshotFingerprintMatches: verification.snapshotFingerprintMatches,

        matches: verification.matches
    });
}

// verifyPublisherLeaderboardHistoricalClaim() — a deliberately thin
// alias of `describePublisherLeaderboardHistoricalClaimVerification()`.
// See this file's own header, "Two functions, deliberately the same
// shape," for why this adds no computation of its own.
export function verifyPublisherLeaderboardHistoricalClaim(claimRecord, snapshot, verifier) {
    return describePublisherLeaderboardHistoricalClaimVerification(claimRecord, snapshot, verifier);
}

// Routes any value through 0.8.119's own `describePublisherLeaderboardSnapshot()`
// tolerance — see this file's own header, "Normalization reuses 0.8.119's
// own tolerance."
function normalizeSnapshot(snapshot) {
    const source = (snapshot && typeof snapshot === 'object') ? snapshot : {};
    return describePublisherLeaderboardSnapshot(source.evidenceFingerprint, source.leaderboard);
}
