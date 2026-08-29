import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { reconstructPublisherLeaderboardSnapshot } from './PublisherLeaderboardSnapshot.js';
import {
    describePublisherLeaderboardClaimVerification
} from './PublisherLeaderboardClaimVerificationView.js';

// 0.8.125 — Claim Verification History Projection.
//
// 0.8.124 answered "does THIS stored claim match this replica's current
// evidence?" for exactly one `LeaderboardClaimRecord`, and deliberately
// stopped there — see that file's own header, "ONE CLAIM/RECORD IS THE
// FUNDAMENTAL UNIT — NOT THE WHOLE HISTORY." This file is the collection
// composition 0.8.124 named and deferred, built entirely ON TOP of it:
//
//   LeaderboardClaimHistory                   reconstructPublisherLeaderboardSnapshot()
//   (0.8.123, UNCHANGED — every record         (0.8.119, UNCHANGED — THIS
//    ever received, in order)                   replica's own current evidence)
//              │                                            │
//              │  ONE reconstruction, shared by every claim │
//              └──────────────────┬─────────────────────────┘
//                                 ▼
//               for each record, unchanged, in order:
//     describePublisherLeaderboardClaimVerification(record, localSnapshot)
//                              (0.8.124, UNCHANGED)
//                                 │
//                                 ▼
//    { claimCount, verifications: [ { signerIdentityId, claimCreatedAt,
//      receivedAt, signatureValid, evidenceFingerprintMatches,
//      policyVersionMatches, snapshotFingerprintMatches, matches }, ... ] }
//
// A PROJECTION OF A PROJECTION, NEVER A NEW VERIFIER — THIS FILE COMPUTES
// NOTHING 0.8.124 DOES NOT ALREADY COMPUTE. Every entry in `verifications`
// below is exactly `describePublisherLeaderboardClaimVerification()`'s
// (0.8.124, UNCHANGED) own result for that one record, carried through
// byte for byte. This file adds nothing per-entry — no rank, no ordinal,
// no "distinct claim" flag — it only iterates and wraps, the identical
// "carried through unchanged, never re-derived" restraint 0.8.124's own
// header already holds, held here again one relationship over, exactly as
// `application/PublisherLeaderboardClaimHistoryView.js#describePublisherLeaderboardClaimHistory()`
// already does for the receipt-only view one layer below this one.
//
// HISTORY MULTIPLICITY IS PRESERVED — NEVER DEDUPLICATED. The same signed
// claim received three times is THREE entries here, in the exact order
// `LeaderboardClaimHistory` (0.8.123, UNCHANGED) already holds them —
// never collapsed into one, never counted, never averaged. This is
// `application/LeaderboardClaimHistory.js`'s own rule, unchanged, held
// here once more: "claim identity ≠ receipt identity" (see that file's
// own header, "APPENDED TO, NEVER OVERWRITTEN, NEVER MUTATED, NEVER
// REORDERED OR DEDUPLICATED"). A caller wanting to know how many DISTINCT
// claims are on file, or how many times one claim was received more than
// once, is asking a genuinely different, later question — this file
// answers neither; it only projects the history exactly as it stands.
//
// ONE SHARED SNAPSHOT, RECONSTRUCTED EXACTLY ONCE — NOT PRIMARILY FOR
// PERFORMANCE. `reconstructPublisherLeaderboardClaimVerificationHistory()`
// calls `reconstructPublisherLeaderboardSnapshot()` (0.8.119, UNCHANGED)
// ONE TIME, before looping, and hands the identical `localSnapshot`
// instance to `describePublisherLeaderboardClaimVerification()` for every
// record in turn — never once per claim inside the loop. This makes the
// architecture explicit rather than merely fast: every claim on file is
// evaluated against the SAME explicitly reconstructed state, at the same
// instant, so two entries in one call's own `verifications` array can
// never silently disagree about what "this replica's current evidence"
// even means because the archive was re-read mid-loop.
//
// A SIGNED CLAIM IS NOT A PERMANENTLY VALID ASSERTION ABOUT THE CURRENT
// STATE — HELD HERE ACROSS AN ENTIRE HISTORY, NOT JUST ONE RECORD. Calling
// this file's own function twice, once before and once after this
// replica's own evidence changes, is expected to return a genuinely
// different `verifications` array for the IDENTICAL, unmodified stored
// history — see this file's own flagship test for the concrete proof,
// exactly mirroring 0.8.124's own Day 1 / Day 2 distinction, projected
// across several claims from several signers at once instead of one.
//
// DOES NOT PERSIST ANY VERIFICATION RESULT — THE IDENTICAL, MOST IMPORTANT
// DESIGN CONSTRAINT 0.8.124's OWN HEADER HOLDS, UNCHANGED HERE. Neither
// function below writes anything — not to any record, not to
// `LeaderboardClaimHistory`, not to any archive. `claimHistory` is read,
// never mutated; every call recomputes the entire projection fresh, from
// whatever `localSnapshot`/`archive` is handed to it at that moment.
//
// TWO LAYERS, MIRRORING 0.8.124's OWN SPLIT EXACTLY, ONE RELATIONSHIP
// OVER. `describePublisherLeaderboardClaimVerificationHistory(claimRecords,
// localSnapshot)` is the pure projection — no archive, no clock, no
// network, deterministic on identical input.
// `reconstructPublisherLeaderboardClaimVerificationHistory(claimHistory,
// archive)` is the one, thin, archive-reading convenience boundary: it
// reconstructs this replica's own current snapshot exactly once, then
// hands it to the pure function above.
//
// A MALFORMED/ABSENT HISTORY PROJECTS TO AN EMPTY RESULT, NEVER A THROW.
// `claimRecords`/`claimHistory` that is not an array degrades to `[]` —
// the identical tolerance `application/
// PublisherLeaderboardClaimHistoryView.js#describePublisherLeaderboardClaimHistory()`
// already holds — and a malformed individual entry inside an otherwise
// genuine array is silently skipped rather than aborting the whole
// projection, because `describePublisherLeaderboardClaimVerification()`
// (0.8.124, UNCHANGED) already returns `null` for exactly that record; this
// file filters those `null`s out rather than inventing a fabricated entry
// for them.
export function describePublisherLeaderboardClaimVerificationHistory(claimRecords, localSnapshot, verifier) {
    const records = Array.isArray(claimRecords) ? claimRecords : [];
    const verifications = records
        .map((record) => describePublisherLeaderboardClaimVerification(record, localSnapshot, verifier))
        .filter((entry) => entry !== null);

    return Object.freeze({
        claimCount: verifications.length,
        verifications: Object.freeze(verifications)
    });
}

// reconstructPublisherLeaderboardClaimVerificationHistory() — the ONE,
// thin, archive-reading entry point, mirroring 0.8.124's own
// `reconstructPublisherLeaderboardClaimVerification()` exactly, one
// relationship over. It reconstructs THIS replica's own current snapshot
// straight out of `reconstructPublisherLeaderboardSnapshot()` (0.8.119,
// UNCHANGED) EXACTLY ONCE, then hands it, together with the externally
// supplied `claimHistory` and `verifier`, to the pure function above. An
// invalid/missing `archive` degrades to `PublicationObservationArchive.empty()`
// — the identical tolerance every other `reconstructXxx()`/`verifyXxx()`
// entry point in this family already holds.
export function reconstructPublisherLeaderboardClaimVerificationHistory(claimHistory, archive, verifier) {
    const safeArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();
    const localSnapshot = reconstructPublisherLeaderboardSnapshot(safeArchive);
    return describePublisherLeaderboardClaimVerificationHistory(claimHistory, localSnapshot, verifier);
}
