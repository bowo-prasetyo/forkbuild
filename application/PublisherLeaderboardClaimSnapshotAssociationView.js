import { describePublisherLeaderboardSnapshot } from './PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from './PublisherLeaderboardSnapshotFingerprint.js';
import { LeaderboardClaimRecord } from './LeaderboardClaimRecord.js';

// 0.8.137 — Historical Claim-to-Snapshot Association Projection.
//
// 0.8.135 answered "does this stored claim's signature check out, and does
// it semantically agree with a caller-supplied historical snapshot?" — four
// facts, one of them (`signatureValid`) cryptographic, three of them
// (`evidenceFingerprintMatches`/`policyVersionMatches`/`snapshotFingerprintMatches`)
// structural, all four collapsed into one `matches` verdict. That file's own
// "Deliberately excluded" list named a narrower, genuinely different
// question it never answers: "which historical snapshot does this stored
// claim CORRESPOND TO?" — asked without touching a signature at all, and
// without collapsing anything into a verdict. This file is that question:
//
//   LeaderboardClaimRecord              PublisherLeaderboardSnapshot
//   (0.8.123, UNCHANGED — claim +        (0.8.119, UNCHANGED — an
//    receivedAt)                          EXPLICITLY SUPPLIED artifact,
//              │                          NEVER reconstructed from an
//              │                          archive, NEVER searched for)
//              │                                     │
//              ├── claim.evidenceFingerprint          │
//              ├── claim.policyVersion                │
//              ├── claim.snapshotFingerprint           │
//              │                          ▼            ▼
//              │           three independent === comparisons, no verifier
//              │                          │
//              └───────────┬──────────────┘
//                           ▼
//        describePublisherLeaderboardClaimSnapshotAssociation()
//                           │
//                           ▼
//   { claimId, signerIdentityId, claimCreatedAt,
//     snapshotFingerprint, evidenceFingerprint, policyVersion,
//     evidenceFingerprintMatches, policyVersionMatches, snapshotFingerprintMatches }
//
// ASSOCIATION ANSWERS "DOES THIS CLAIM DESCRIBE THIS SNAPSHOT?"; VERIFICATION
// ANSWERS "IS THE CLAIM'S SIGNATURE VALID?" — THE ONE DISTINCTION THIS
// MILESTONE EXISTS TO MAKE EXPLICIT. This file computes no cryptographic
// check of any kind — it accepts no `verifier` argument, calls nothing on
// `identity/LocalAuthorizationVerifier.js`, and carries no `signatureValid`
// field. A claim may be cryptographically signed and structurally
// associated with a snapshot; cryptographically signed but associated with
// a DIFFERENT snapshot; or cryptographically invalid yet still
// structurally associated with a snapshot — this file reports the same
// three association facts in every one of those cases, because a forged or
// corrupted signature never changes what a claim's own
// `evidenceFingerprint`/`policyVersion`/`snapshotFingerprint` fields
// assert. See this file's own flagship test's second half, "signature
// independence," for the concrete proof: two claims sharing the identical
// asserted identifiers, one genuinely signed and one deliberately
// tampered, produce byte-identical association facts.
//
// THREE INDEPENDENT FACTS, NEVER COLLAPSED INTO A `matches` VERDICT — A
// DELIBERATE DEPARTURE FROM 0.8.135's OWN SHAPE. 0.8.121's/0.8.135's own
// `matches` answers "is everything about this claim, cryptography
// included, in agreement?" — a fair question for a VERIFICATION file to
// answer. This file is not a verification file: it never asks whether a
// claim should be trusted, only whether it structurally corresponds to a
// particular snapshot, along three genuinely independent dimensions. A
// caller who wants a single collapsed boolean already has 0.8.135's own
// `matches` (once a verifier is available); folding these three facts into
// a fourth one here would silently smuggle a verdict back into a file
// whose entire purpose is to keep this relationship legible instead.
//
// THE ASSOCIATION BASIS — CLAIM FIELDS VERSUS SNAPSHOT FIELDS, COMPARED
// WITH `===`, NOTHING MORE. `claim.evidenceFingerprint`, `claim.policyVersion`,
// and `claim.snapshotFingerprint` (core/PublisherLeaderboardSnapshotClaim.js,
// 0.8.121, UNCHANGED) are the claim's own asserted identifiers — set once,
// at signing time, and carried unchanged ever after. The supplied
// `snapshot`'s own identity is read the identical way 0.8.135's own
// `historicalEvidenceFingerprint`/`historicalPolicyVersion`/
// `historicalSnapshotFingerprint` already read it: `evidenceFingerprint`
// and `policyVersion` straight off `describePublisherLeaderboardSnapshot()`'s
// (0.8.119, UNCHANGED) own normalized result, `snapshotFingerprint` computed
// by `describePublisherLeaderboardSnapshotFingerprint()` (0.8.121,
// UNCHANGED) over that identical normalized snapshot. Each of the three
// `*Matches` facts is one `===` comparison between a claim field and its
// snapshot counterpart — no derivation of one fact from another, no
// short-circuiting, every fact computed even when an earlier one already
// reads false.
//
// THE SUPPLIED SNAPSHOT'S OWN IDENTITY IS ECHOED, NEVER RE-DERIVED BY THE
// CALLER — THE IDENTICAL PATTERN 0.8.135's OWN HEADER ALREADY ESTABLISHES,
// UNPREFIXED HERE BECAUSE THERE IS ONLY EVER ONE SNAPSHOT IN PLAY. 0.8.135
// prefixes its echoed fields `historicalXxx` to distinguish them from "this
// replica's own current" snapshot elsewhere in that family. This file has
// no such second snapshot to distinguish from — the caller supplies
// exactly one snapshot, explicitly, and `evidenceFingerprint`/
// `policyVersion`/`snapshotFingerprint` on the result name that one
// snapshot's own identity, plainly. They say nothing about whether that
// snapshot is "current," "correct," or "authoritative" — the identical
// restraint 0.8.134's/0.8.135's own headers already hold.
//
// MOST IMPORTANT DESIGN DECISION — DO NOT AUTOMATICALLY SEARCH A SNAPSHOT
// TIMELINE. The caller always supplies exactly `claimRecord` +
// `snapshot`, one specific historical artifact at a time — never
// `claimRecord` + a whole `snapshotTimeline` with this file picking "the
// best matching snapshot" out of it. The latter immediately raises
// ambiguity, tie-breaking, closest-timestamp, and duplicate-snapshot
// questions this codebase has deliberately declined to answer at every
// prior layer (0.8.135's own "Most important design decision," held once
// more here). Grep this file and there is no loop over an array of
// snapshots, no lookup by proximity, no "best" or "closest" anywhere in
// it — this file's own two functions never accept more than one snapshot.
//
// A RECORD, NEVER A BARE CLAIM — THE IDENTICAL "ONE DURABLE UNIT" CHOICE
// 0.8.124's/0.8.135's OWN HEADERS ALREADY MAKE. `claimRecord` must be a
// genuine `LeaderboardClaimRecord` (0.8.123, UNCHANGED); a bare
// `PublisherLeaderboardSnapshotClaim` or plain claim JSON is not a genuine
// candidate here and projects to `null`, exactly like 0.8.124's/0.8.135's
// own tolerance.
//
// NORMALIZATION REUSES 0.8.119's OWN TOLERANCE FOR THE SUPPLIED SNAPSHOT —
// THE IDENTICAL RESTRAINT 0.8.120's/0.8.134's/0.8.135's OWN
// `normalizeSnapshot()` ALREADY HOLDS. A well-formed historical snapshot
// passes through unchanged; anything missing, `null`, or shaped like
// garbage normalizes to the identical well-defined empty snapshot 0.8.119
// already defines — never a thrown error, never a second definition of
// "empty."
//
// A SINGLE PRIMITIVE ONLY — NO SEQUENCE-WIDE PROJECTION YET. This
// milestone deliberately ships only
// `describePublisherLeaderboardClaimSnapshotAssociation()`, the
// single-claim/single-snapshot association primitive. A collection-level
// projection — given a whole claim history and an explicitly supplied
// snapshot timeline, report every claim-to-snapshot relationship without
// selecting or judging any of them — is genuinely separate, later work
// this file deliberately leaves unbuilt; see "What's left," in
// `docs/Roadmap.md`.
//
// DOES NOT PERSIST ANYTHING. The function below writes nothing — not to
// `claimRecord`, not to `snapshot`, not to any archive, and this file
// introduces no durable "association" store of its own. `claimRecord` is
// read, never mutated (it is frozen already — 0.8.123's own rule,
// unchanged), and `snapshot` is read, never mutated either.
//
// SYNCHRONOUS, PURE, DETERMINISTIC, SELF-CONTAINED: NO CLOCK, NO STORAGE,
// NO NETWORK, NO MUTATION. `claimCreatedAt` is read off an already-stamped
// field, never freshly stamped here. Calling this function twice with
// equivalent arguments — even reached by two entirely independent code
// paths — returns a byte-identical result.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Automatic snapshot selection.** See "Most important design
//   decision," above.
// - **Claim verification, signature validation.** See "Association
//   answers... verification answers...," above — this file imports no
//   verifier and checks no signature.
// - **Trust/reputation judgments, a "valid claim" status.** The identical
//   vocabulary boundary 0.8.120/0.8.121/0.8.124/0.8.134/0.8.135 already
//   hold — no `trusted`, `authoritative`, `matches`, `score`, `rank`, or
//   `confidence` field anywhere.
// - **Historical ordering, archive reconstruction.** This file accepts a
//   snapshot a caller already holds; it reconstructs nothing from an
//   archive and orders nothing — grep this file and there is no
//   `PublicationObservationArchive` import anywhere.
// - **Persistence, claim modification, snapshot modification.** See "Does
//   not persist anything," above.
// - **Ranking recomputation.** This file reads `policy.version` off the
//   normalized snapshot; it never re-ranks, re-sorts, or re-derives a
//   leaderboard.
// - **Sequence-wide association.** See "A single primitive only," above —
//   left for a later milestone, composing this one rather than
//   duplicating it.
export function describePublisherLeaderboardClaimSnapshotAssociation(claimRecord, snapshot) {
    if (!(claimRecord instanceof LeaderboardClaimRecord)) return null;

    const normalizedSnapshot = normalizeSnapshot(snapshot);
    const snapshotFingerprint = describePublisherLeaderboardSnapshotFingerprint(normalizedSnapshot).fingerprint;
    const claim = claimRecord.claim;

    const evidenceFingerprintMatches = claim.evidenceFingerprint === normalizedSnapshot.evidenceFingerprint;
    const policyVersionMatches = claim.policyVersion === normalizedSnapshot.policy.version;
    const snapshotFingerprintMatches = claim.snapshotFingerprint === snapshotFingerprint;

    return Object.freeze({
        claimId: claim.id,
        signerIdentityId: claim.signerIdentityId,
        claimCreatedAt: claim.createdAt,

        snapshotFingerprint,
        evidenceFingerprint: normalizedSnapshot.evidenceFingerprint,
        policyVersion: normalizedSnapshot.policy.version,

        evidenceFingerprintMatches,
        policyVersionMatches,
        snapshotFingerprintMatches
    });
}

// Routes any value through 0.8.119's own `describePublisherLeaderboardSnapshot()`
// tolerance — see this file's own header, "Normalization reuses 0.8.119's
// own tolerance."
function normalizeSnapshot(snapshot) {
    const source = (snapshot && typeof snapshot === 'object') ? snapshot : {};
    return describePublisherLeaderboardSnapshot(source.evidenceFingerprint, source.leaderboard);
}
