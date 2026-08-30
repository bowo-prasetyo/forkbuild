import { LeaderboardClaimRecord } from './LeaderboardClaimRecord.js';
import { describePublisherLeaderboardClaimSnapshotAssociation } from './PublisherLeaderboardClaimSnapshotAssociationView.js';

// 0.8.139 — Historical Claim-to-Snapshot Correspondence Projection.
//
// 0.8.137 proved a single stored claim could be associated with a single
// EXPLICITLY SUPPLIED historical snapshot, along three independent
// structural facts. 0.8.138 proved a caller-supplied SEQUENCE of already-
// paired `{ claimRecord, snapshot }` pairs could be narrated the identical
// way, one call to 0.8.137 per pair, never discovering the pairing itself.
// Both of those milestones deliberately left one question unanswered —
// 0.8.137's own "Most important design decision" and 0.8.138's own "A
// history of explicitly supplied pairs" each name it and decline it in the
// same breath: given a whole claim history and an explicitly supplied
// snapshot sequence, WHICH snapshots correspond to WHICH claims? This file
// is that question, finally answered — not by inventing a fourth
// comparison mechanism, but by calling 0.8.137 once per (claim, snapshot)
// combination and keeping only the combinations where the two artifacts'
// complete identities genuinely agree:
//
//   claimHistory                      snapshots
//   (LeaderboardClaimRecord[],        (PublisherLeaderboardSnapshot[],
//    0.8.123, UNCHANGED)               EXPLICITLY SUPPLIED, 0.8.119,
//        │                             UNCHANGED — never reconstructed,
//        │  deduplicated by            never searched for)
//        │  claim.id (0.8.132's               │
//        │  own restraint)                    │
//        ▼                                    │
//   distinct claims                           │
//        │                                    │
//        └──────────────┬─────────────────────┘
//                        ▼
//         one describePublisherLeaderboardClaimSnapshotAssociation()
//         call (0.8.137, UNCHANGED) per (claim, snapshot) pair
//                        │
//                        ▼
//   describePublisherLeaderboardClaimSnapshotCorrespondence()
//                        │
//                        ▼
//   { claimCount, distinctClaimIdCount, snapshotCount, correspondenceCount,
//     correspondences: [{ claimId, signerIdentityId, claimCreatedAt,
//       matchingSnapshotCount, snapshotMatches: [{ snapshotIndex,
//       evidenceFingerprintMatches, policyVersionMatches,
//       snapshotFingerprintMatches }, ...] }, ...] }
//
// THIS IS DISCOVERY, NEVER PAIRING — THE ONE GENUINE DIFFERENCE FROM
// 0.8.138. 0.8.138's caller already knows which claim goes with which
// snapshot before calling it; this file's caller does not, and hands over
// two independently-supplied collections instead — the exact "two separate
// arrays this file would then have to combine" 0.8.138's own header
// declined to build. This file exists to build exactly that, and nothing
// more: for every distinct stored claim, it tries every supplied snapshot
// and keeps the ones whose complete identity agrees.
//
// THE COMPLETE `snapshotFingerprint` IS THE CORRESPONDENCE KEY — NEVER
// `evidenceFingerprint` OR `policyVersion` ALONE. A claim's own
// `evidenceFingerprint`/`policyVersion`/`snapshotFingerprint` are three
// independently observable relationships (0.8.137's own header, "Three
// independent facts, never collapsed into a matches verdict") — but
// "discovery" and "association" are different questions. Two snapshots can
// share identical evidence and an identical policy version while differing
// in their complete leaderboard representation; 0.8.121's own
// `snapshotFingerprint` exists precisely to distinguish that case, being a
// hash over the evidence fingerprint, the policy, AND the leaderboard
// together (`core/PublisherLeaderboardSnapshotClaim.js`'s own header, "Two
// Kinds Of 'Snapshot Identity'"). A snapshot is kept as a correspondence
// for a claim exactly when `describePublisherLeaderboardClaimSnapshotAssociation()`'s
// own `snapshotFingerprintMatches` reads `true` for that pair — never when
// only `evidenceFingerprintMatches` or only `policyVersionMatches` reads
// `true`. Same evidence plus same policy version is not treated as "close
// enough" to be the same historical snapshot.
//
// EVERY KEPT MATCH STILL CARRIES ALL THREE FACTS, NEVER COLLAPSED — A
// CLAIM CAN CORRESPOND TO A SNAPSHOT BY FINGERPRINT WHILE ITS OWN ASSERTED
// FIELDS DISAGREE WITH THAT SAME SNAPSHOT. `snapshotFingerprintMatches` on
// a kept `snapshotMatches[]` entry is therefore always `true` by
// construction — but `evidenceFingerprintMatches`/`policyVersionMatches`
// are NOT guaranteed `true` alongside it, because a claim's
// `evidenceFingerprint`/`policyVersion` fields are independently asserted
// by its signer at signing time (`core/PublisherLeaderboardSnapshotClaim.js`,
// UNCHANGED) and never re-derived from `snapshotFingerprint`. A claim whose
// own asserted evidence/policy fields do not describe the very snapshot its
// `snapshotFingerprint` names (0.8.137's/0.8.138's own "Claim C," which
// asserts `evidenceFingerprint: E1, policyVersion: 1` yet carries
// `snapshotFingerprint` computed over an E2/P2 snapshot) still corresponds,
// by this file's own discovery key, to that E2/P2 snapshot — and the kept
// entry honestly reports `evidenceFingerprintMatches: false`,
// `policyVersionMatches: false` right alongside `snapshotFingerprintMatches:
// true`, rather than a bare boolean that would hide the inconsistency. This
// is why every kept entry embeds 0.8.137's own three facts in full instead
// of a single `matched: true`.
//
// EVERY DISCOVERED CORRESPONDENCE IS KEPT — NO ARBITRARY SELECTION, EVER.
// A claim can correspond to zero, one, or several supplied snapshots
// (two distinct snapshots can share an identical `snapshotFingerprint`,
// exactly like two distinct receipts can carry the identical claim), and
// this file reports every one of them, in the order `snapshots` was
// supplied — never the first, never the latest, never the "closest," and
// never a count collapsed down to one. A caller who wants "the identical
// snapshot fingerprint, supplied more than once" to read as a single
// correspondence already has 0.8.134's own snapshot-vs-snapshot difference
// to prove the two supplied entries are semantically identical; that
// remains their own separate, explicit step — this file never performs it
// on a caller's behalf. See this file's own FLAGSHIP test, where the
// identical snapshot is supplied twice and both positions are kept.
//
// A CLAIM WITH NO CORRESPONDING SNAPSHOT IS KEPT, WITH AN EMPTY
// `snapshotMatches` — NEVER DISCARDED. Absence of a supplied matching
// snapshot is itself a fact worth reporting, exactly the same restraint
// `application/PublisherLeaderboardClaimHistoryDifference.js`'s own
// "missing" entries already hold for a claim entirely absent from a peer's
// history. `correspondences` always carries exactly one entry per distinct
// stored claim, whether or not any supplied snapshot corresponded to it.
//
// CLAIM IDENTITY, NEVER RECEIPT IDENTITY — REUSING, NEVER RE-DERIVING,
// 0.8.128'S/0.8.132'S OWN DISTINCTION. `claimCount` below counts RECEIPTS,
// exactly as 0.8.128's and 0.8.132's own `claimCount` already do — every
// stored `LeaderboardClaimRecord`, duplicates included (0.8.123's own
// multiplicity rule, UNCHANGED). But correspondence is fundamentally about
// CLAIMS, not receipt instances: `correspondences` is computed over
// DISTINCT claims, deduplicated by `claim.id`, exactly as `distinctClaimIdCount`
// already counts them and exactly as 0.8.132's own "the first receipt of
// each distinct claim id supplies that claim's fields" already holds. The
// first receipt of a repeated claim id, in `claimHistory`'s own order,
// supplies the `LeaderboardClaimRecord` this file hands to 0.8.137; every
// later receipt of the identical claim id folds into `claimCount` alone and
// never produces a second entry in `correspondences`.
//
// SNAPSHOT POSITION, NEVER SNAPSHOT IDENTITY, IS THE HANDLE A CALLER GETS
// BACK. `snapshotIndex` on a kept match names the SUPPLIED `snapshots`
// array position — never a fingerprint, never an object reference — the
// identical restraint 0.8.136's own snapshot-timeline projection already
// holds for its own sequence. Two distinct positions sharing an identical
// fingerprint are reported as two distinct `snapshotIndex` values, never
// merged into one.
//
// CORRESPONDENCES ARE ORDERED BY FIRST APPEARANCE IN `claimHistory`, NEVER
// SORTED — THE IDENTICAL DISCIPLINE 0.8.128'S/0.8.132'S OWN GROUPINGS
// ALREADY HOLD. `snapshotMatches` within one correspondence is ordered by
// the position `snapshots` was actually supplied in — never sorted by
// fingerprint, evidence, policy version, or match count.
//
// EACH (CLAIM, SNAPSHOT) COMBINATION IS DELEGATED TO 0.8.137, UNCHANGED,
// NEVER RE-IMPLEMENTED. This file performs no independent fingerprint
// comparison of its own — every `evidenceFingerprintMatches`/
// `policyVersionMatches`/`snapshotFingerprintMatches` fact is
// `describePublisherLeaderboardClaimSnapshotAssociation()`'s (0.8.137,
// UNCHANGED) own result for that one combination. This file's only
// original work is the double loop — one distinct claim times one supplied
// snapshot — and the keep/discard decision over `snapshotFingerprintMatches`.
//
// SIGNATURE INDEPENDENCE CARRIES THROUGH UNCHANGED. Because every kept
// entry's three facts come from 0.8.137's own unmodified result, and 0.8.137
// checks no signature, correspondence discovery never depends on whether a
// claim's signature is genuine or tampered — a claim's own asserted fields
// alone decide what it corresponds to.
//
// ARCHITECTURAL BOUNDARY — IMPORTS 0.8.137 (AND 0.8.123'S OWN RECORD CLASS)
// ONLY. This file imports nothing from
// `application/PublisherLeaderboardSnapshotClaimVerification.js`,
// `application/PublisherLeaderboardHistoricalClaimVerification.js`, any
// signing or identity module, any archive module, any ranking module, or
// `application/PublisherLeaderboardSnapshotTimelineView.js` — grep it and
// none of that vocabulary appears. The dependency direction stays a single
// line: 0.8.137 → 0.8.139, never a second, parallel association engine.
//
// MALFORMED INPUT TOLERANCE. A non-array `claimHistory`, or elements inside
// it that are not genuine `LeaderboardClaimRecord` instances, are silently
// excluded — the identical tolerance 0.8.132's own
// `describePublisherLeaderboardClaimAgreement()` already holds. A non-array
// `snapshots` degrades to an empty sequence. A malformed individual snapshot
// element is never filtered out of `snapshots` — it is handed to 0.8.137
// exactly as supplied, which degrades it to 0.8.119's own well-defined
// empty snapshot (0.8.137's own tolerance, UNCHANGED) and simply never
// matches anything real; its own position in `snapshots` is preserved for
// every other claim's own discovery pass.
//
// SYNCHRONOUS, PURE, DETERMINISTIC, SELF-CONTAINED: NO CLOCK, NO STORAGE,
// NO NETWORK, NO MUTATION. Reads no clock, mutates neither `claimHistory`
// nor `snapshots` nor any element inside either. Calling this function
// twice with equivalent arguments — even reached by two entirely
// independent code paths — returns a byte-identical result.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Cryptographic signature verification.** See "Signature independence
//   carries through unchanged," above — this file imports no verifier and
//   checks no signature, exactly like 0.8.137/0.8.138.
// - **Trust/reputation judgments, a "valid claim" status, a collapsed
//   verdict.** The identical vocabulary boundary 0.8.120/0.8.121/0.8.124/
//   0.8.132/0.8.134/0.8.135/0.8.137/0.8.138 already hold — no `trusted`,
//   `authoritative`, `matches`, `score`, `rank`, or `confidence` field
//   anywhere.
// - **Automatic snapshot reconstruction, archive access.** `snapshots` is
//   always an explicitly supplied array; this file reconstructs nothing
//   from an archive and imports no archive module.
// - **"Best snapshot" selection, chronological proximity heuristics.** See
//   "Every discovered correspondence is kept," above — ambiguity is
//   reported, never resolved.
// - **Claim modification, snapshot modification, persistence.** Neither
//   argument is ever mutated, and this file introduces no durable
//   "correspondence" store of its own.
// - **Ranking recomputation of any kind.**
// - **Synchronization of any kind.**
export function describePublisherLeaderboardClaimSnapshotCorrespondence(claimHistory, snapshots) {
    const records = (Array.isArray(claimHistory) ? claimHistory : []).filter((record) => record instanceof LeaderboardClaimRecord);
    const rawSnapshots = Array.isArray(snapshots) ? snapshots : [];

    const distinctRecords = [];
    const seenClaimIds = new Set();
    for (const record of records) {
        const claimId = record.claim.id;
        if (seenClaimIds.has(claimId)) continue;
        seenClaimIds.add(claimId);
        distinctRecords.push(record);
    }

    const correspondences = distinctRecords.map((record) => {
        const snapshotMatches = [];
        rawSnapshots.forEach((snapshot, snapshotIndex) => {
            const association = describePublisherLeaderboardClaimSnapshotAssociation(record, snapshot);
            if (!association.snapshotFingerprintMatches) return;
            snapshotMatches.push(Object.freeze({
                snapshotIndex,
                evidenceFingerprintMatches: association.evidenceFingerprintMatches,
                policyVersionMatches: association.policyVersionMatches,
                snapshotFingerprintMatches: association.snapshotFingerprintMatches
            }));
        });

        return Object.freeze({
            claimId: record.claim.id,
            signerIdentityId: record.claim.signerIdentityId,
            claimCreatedAt: record.claim.createdAt,
            matchingSnapshotCount: snapshotMatches.length,
            snapshotMatches: Object.freeze(snapshotMatches)
        });
    });

    return Object.freeze({
        claimCount: records.length,
        distinctClaimIdCount: distinctRecords.length,
        snapshotCount: rawSnapshots.length,
        correspondenceCount: correspondences.length,
        correspondences: Object.freeze(correspondences)
    });
}
