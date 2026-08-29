import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { reconstructPublisherLeaderboardSnapshot } from './PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotClaimVerification } from './PublisherLeaderboardSnapshotClaimVerification.js';
import { LeaderboardClaimRecord } from './LeaderboardClaimRecord.js';

// 0.8.124 — Claim Verification Projection.
//
// 0.8.123 gave a replica a durable place to keep a received signed claim
// — a receipt, explicitly never a verdict. It left the verdict-shaped
// question exactly where 0.8.121 already answers it: run
// `verifyPublisherLeaderboardSnapshotClaim()` yourself, separately,
// whenever you choose to ask. This file is that "whenever you choose to
// ask," made concrete for the one durable unit 0.8.123 actually stores —
// a `LeaderboardClaimRecord` — rather than a bare claim:
//
//   LeaderboardClaimRecord                    reconstructPublisherLeaderboardSnapshot()
//   (0.8.123, UNCHANGED — claim + receivedAt)   (0.8.119, UNCHANGED — THIS replica's
//              │                                 own current evidence)
//              │                                            │
//              ├── record.claim  ──────────────┐            │
//              │                                ▼            ▼
//              │                   describePublisherLeaderboardSnapshotClaimVerification()
//              │                          (0.8.121, UNCHANGED — signature +
//              │                           three independent semantic facts)
//              │                                │
//              └──────────────┬─────────────────┘
//                              ▼
//               describePublisherLeaderboardClaimVerification()
//                              │
//                              ▼
//    { signerIdentityId, claimCreatedAt, receivedAt,
//      signatureValid,
//      evidenceFingerprintMatches, policyVersionMatches, snapshotFingerprintMatches,
//      matches }
//
// A PROJECTION, NEVER A NEW VERIFIER — THIS FILE COMPUTES NOTHING 0.8.121
// DOES NOT ALREADY COMPUTE. Every one of `signatureValid`,
// `evidenceFingerprintMatches`, `policyVersionMatches`,
// `snapshotFingerprintMatches`, and `matches` below is `application/
// PublisherLeaderboardSnapshotClaimVerification.js#describePublisherLeaderboardSnapshotClaimVerification()`'s
// (0.8.121, UNCHANGED) own result, carried through byte for byte. This
// file adds exactly three fields on top — `signerIdentityId`,
// `claimCreatedAt`, `receivedAt` — read straight off the record and its
// own claim, the identical "carried through unchanged, never re-derived"
// restraint `application/PublisherLeaderboardClaimHistoryView.js`'s own
// header already holds. There is no second verification taxonomy here:
// no `trusted`, `valid`, `current`, `authoritative`, `verified`, `score`,
// or `rank` field, and the five 0.8.120/0.8.121 comparison names are
// reused exactly, never renamed, reordered in meaning, or redefined.
//
// A SIGNED CLAIM IS NOT A PERMANENTLY VALID ASSERTION ABOUT THE CURRENT
// STATE — THE ONE DISTINCTION THIS MILESTONE EXISTS TO MAKE EXPLICIT.
// `record.claim` never changes shape once signed (0.8.123's own rule,
// unchanged, unrepeated here). `localSnapshot` — or, through
// `reconstructPublisherLeaderboardClaimVerification()`, the archive it is
// reconstructed from — can change from one call to the next as new
// evidence arrives. Calling this file's own function twice, once before
// and once after that evidence changes, is expected to return two
// genuinely different results for the IDENTICAL stored record:
//
//   Day 1:  matches === true    (this replica's evidence still agrees)
//   Day 2:  matches === false   (new evidence arrived; the claim did not
//                                 change — the replica's own reality did)
//
// See this file's own flagship test for the concrete proof. This is
// exactly analogous to `application/PublisherAchievementProfileView.js`'s
// own distinction between durable evidence and a derived, recomputed
// achievement — held here once more, one relationship up, over a signed
// conclusion instead of a raw fact.
//
// THREE SITUATIONS, ALL EXPLICITLY TESTABLE, NONE COLLAPSED INTO ANOTHER:
//
//   1. Signed and matching        — signatureValid && evidenceFingerprintMatches
//                                    && policyVersionMatches && snapshotFingerprintMatches
//                                    && matches, all true. The signer
//                                    signed the snapshot, and this replica
//                                    independently reconstructs the same one.
//   2. Signed but different       — signatureValid true, matches false.
//      from this replica            NOT evidence of fraud — the signer's
//                                    replica may simply hold different
//                                    evidence. See 0.8.121's own header,
//                                    "A valid signature means 'the signer
//                                    genuinely signed this' — never 'this
//                                    claim is true.'"
//   3. Cryptographically invalid  — signatureValid false. The three
//                                    semantic comparison facts are STILL
//                                    computed independently — never left
//                                    unset, never implicitly forced false
//                                    by `signatureValid` alone — because
//                                    0.8.121's own function they are
//                                    carried through from already refuses
//                                    to short-circuit them (see that
//                                    file's own header, "even when one
//                                    already reads false").
//
// DOES NOT PERSIST THE VERIFICATION RESULT — THE MOST IMPORTANT DESIGN
// CONSTRAINT THIS FILE HOLDS. Neither function below writes anything —
// not to `record`, not to `LeaderboardClaimRecord`, not to
// `LeaderboardClaimHistory`, not to any archive. `record` is read, never
// mutated (it is frozen already — see `application/
// LeaderboardClaimRecord.js`'s own header, "Immutable"), and this file
// invents no sibling `LeaderboardClaimVerificationRecord` to store a
// result in either. Every call recomputes fresh, from whatever
// `localSnapshot`/`archive` is handed to it at that moment — the identical
// "computed fresh, every time, never persisted" restraint 0.8.120's own
// header already holds for a bare snapshot comparison, held here once
// more over a signed one.
//
// ONE CLAIM/RECORD IS THE FUNDAMENTAL UNIT — NOT THE WHOLE HISTORY. This
// file deliberately stops at a single `LeaderboardClaimRecord`, exactly as
// `docs/Roadmap.md`'s own sequencing for this milestone requires. It never
// takes a `LeaderboardClaimHistory` array, never loops over one, and never
// produces a `{ verificationCount, verifications: [...] }`-shaped
// collection projection — that composition is real, separately sized,
// later work ("0.8.125 — Publisher Claim Verification History View"),
// built ON TOP of this file's own two functions rather than folded into
// them now.
//
// TWO LAYERS, MIRRORING 0.8.120/0.8.121's OWN SPLIT EXACTLY.
// `describePublisherLeaderboardClaimVerification()` is the pure
// projection — no archive, no clock, no network, deterministic on
// identical input. `reconstructPublisherLeaderboardClaimVerification()`
// is the ONE, thin, archive-reading convenience boundary: it pulls THIS
// replica's own current snapshot straight out of
// `reconstructPublisherLeaderboardSnapshot()` (0.8.119, UNCHANGED) and
// hands it to the pure function above — the identical
// `verifyPublisherLeaderboardSnapshotClaim()` (0.8.121, UNCHANGED)
// naming/shape convention, one relationship up.
//
// A MALFORMED/ABSENT RECORD PROJECTS TO `null`, NEVER A THROW, AND NEVER A
// FABRICATED VERDICT — THE IDENTICAL TOLERANCE `application/
// PublisherLeaderboardClaimHistoryView.js#describePublisherLeaderboardClaimHistoryEntry()`
// ALREADY HOLDS. Unlike 0.8.121's own claim-shaped tolerance (a malformed
// bare claim degrades to `matches: false` because a claim's only
// meaningful content is its signer and signature), a malformed
// `LeaderboardClaimRecord` here has no `receivedAt` to honestly report at
// all — there is no receipt to project a comparison onto in the first
// place — so this file returns `null` rather than inventing one. A caller
// wanting a bare claim's verification facts alone, with no receipt
// metadata, already has 0.8.121's own function for exactly that.
export function describePublisherLeaderboardClaimVerification(claimRecord, localSnapshot, verifier) {
    if (!(claimRecord instanceof LeaderboardClaimRecord)) return null;

    const verification = describePublisherLeaderboardSnapshotClaimVerification(localSnapshot, claimRecord.claim, verifier);

    return Object.freeze({
        signerIdentityId: claimRecord.claim.signerIdentityId,
        claimCreatedAt: claimRecord.claim.createdAt,
        receivedAt: claimRecord.receivedAt,

        signatureValid: verification.signatureValid,

        evidenceFingerprintMatches: verification.evidenceFingerprintMatches,
        policyVersionMatches: verification.policyVersionMatches,
        snapshotFingerprintMatches: verification.snapshotFingerprintMatches,

        matches: verification.matches
    });
}

// reconstructPublisherLeaderboardClaimVerification() — the ONE, thin,
// archive-reading entry point, mirroring 0.8.121's own
// `verifyPublisherLeaderboardSnapshotClaim()` exactly. It pulls THIS
// replica's own current snapshot straight out of
// `reconstructPublisherLeaderboardSnapshot()` (0.8.119, UNCHANGED) and
// hands it, together with the externally supplied `claimRecord` and
// `verifier`, to the pure function above. An invalid/missing `archive`
// degrades to `PublicationObservationArchive.empty()` — the identical
// tolerance every other `reconstructXxx()`/`verifyXxx()` entry point in
// this family already holds.
export function reconstructPublisherLeaderboardClaimVerification(claimRecord, archive, verifier) {
    const safeArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();
    const localSnapshot = reconstructPublisherLeaderboardSnapshot(safeArchive);
    return describePublisherLeaderboardClaimVerification(claimRecord, localSnapshot, verifier);
}
