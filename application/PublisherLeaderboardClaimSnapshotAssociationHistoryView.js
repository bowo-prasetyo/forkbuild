import { describePublisherLeaderboardClaimSnapshotAssociation } from './PublisherLeaderboardClaimSnapshotAssociationView.js';

// 0.8.138 — Historical Claim-to-Snapshot Association History Projection.
//
// 0.8.137 proved a single stored claim could be associated with a single
// explicitly supplied historical snapshot, along three independent
// structural facts, never touching a signature. That primitive answers
// exactly one relationship at a time. The moment a caller holds more than
// one claim-and-snapshot pair worth narrating — a signer's claim history
// checked against several historical snapshots it might describe — a new,
// purely structural question appears:
//
//   "Across these EXPLICITLY SUPPLIED claim/snapshot pairs, what
//    structural relationships exist?"
//
// This file answers that question by doing nothing more than calling
// 0.8.137's own primitive once per supplied pair:
//
//   [{ claimRecord, snapshot }, { claimRecord, snapshot }, ...]
//                        │
//                        ▼   (one call per element, in order)
//     describePublisherLeaderboardClaimSnapshotAssociation()
//                        │            (0.8.137, UNCHANGED)
//                        ▼
//   describePublisherLeaderboardClaimSnapshotAssociationHistory()
//                        │
//                        ▼
//   { associationCount, associations: [{ claimId, signerIdentityId,
//     claimCreatedAt, snapshotFingerprint, evidenceFingerprint,
//     policyVersion, evidenceFingerprintMatches, policyVersionMatches,
//     snapshotFingerprintMatches }, ...] }
//
// A HISTORY OF EXPLICITLY SUPPLIED PAIRS, NEVER A MATCHING ALGORITHM. The
// single argument is `associations`, a caller-supplied list of
// `{ claimRecord, snapshot }` pairs — never two independent
// `claims`/`snapshots` arrays this file would then have to combine.
// Accepting two separate arrays immediately raises the exact question
// 0.8.137's own "Most important design decision" already declined to
// answer: what counts as "the" associated snapshot for a given claim?
// Exact fingerprint? Evidence only? Policy version too? First match?
// Every match? Closest in time? This file asks none of those questions
// because it never receives two arrays to correlate — the caller has
// already decided, pair by pair, which claim goes with which snapshot,
// and handed over that decision directly. Grep this file's own code and
// there is no Cartesian product, no `.filter(`, and no lookup of any
// kind — only a single pass over an already-paired list.
//
// EACH PAIR IS DELEGATED TO 0.8.137, UNCHANGED, NEVER RE-IMPLEMENTED. This
// file performs no independent fingerprint comparison of its own — every
// `evidenceFingerprintMatches`/`policyVersionMatches`/
// `snapshotFingerprintMatches` fact, and every other field on an entry in
// `associations`, is `describePublisherLeaderboardClaimSnapshotAssociation()`'s
// (0.8.137, UNCHANGED) own result for that one pair, embedded whole and
// unmodified. This file's only original work is the loop itself.
//
// PRESERVE SUPPLIED ORDER — NEVER SORTED BY CLAIM CREATION TIME, SNAPSHOT
// IDENTITY, SIGNER, FINGERPRINT, OR MATCH COUNT. The identical restraint
// 0.8.136's own "the caller supplies the order" already holds for a
// sequence of snapshots is held here again for a sequence of pairs:
// `associations[i]` in the result is always the association for
// `associations[i]` in the input, in that exact position — this file
// contains no `.sort(` anywhere. A caller who supplies pairs out of
// chronological order receives a history narrated in the order they
// actually supplied, honestly reported as such.
//
// NO DEDUPLICATION — REPEATED PAIRS PRODUCE REPEATED ENTRIES. Supplying
// the identical `{ claimRecord, snapshot }` pair three times in a row
// produces three identical entries in the result, each in its own
// position — this is an association PROJECTION, narrating exactly the
// sequence it was handed, never a set-building operation that collapses
// "the same fact stated twice" into one. Grep this file's own code and
// there is no `Set`, no `Map` keyed by claim or snapshot identity, and no
// filtering of any kind.
//
// SIGNATURE INDEPENDENCE CARRIES THROUGH UNCHANGED. Because every entry
// is 0.8.137's own unmodified result, the identical claim associated with
// the identical snapshot produces a byte-identical entry regardless of
// whether that claim's signature is genuine or has been tampered with —
// 0.8.137 already proves this for one pair; supplying the same pair twice
// here, once behind a genuine signature and once behind a tampered one,
// proves it again at the history level, entry for entry.
//
// A SINGLE PRIMITIVE ONLY — NO AUTOMATIC CORRESPONDENCE, NO MATCHING
// SUBSYSTEM. This milestone deliberately ships only the pair-history
// projection above. Given a whole claim history and an explicitly
// supplied snapshot timeline, automatically discovering which snapshot
// each claim corresponds to is a genuinely separate, later question —
// left unbuilt here exactly as 0.8.137's own "most important design
// decision" already declines it for a single pair.
//
// ARCHITECTURAL BOUNDARY — IMPORTS 0.8.137 ONLY. This file imports
// nothing from `application/PublisherLeaderboardSnapshotClaimVerification.js`,
// `application/PublisherLeaderboardHistoricalClaimVerification.js`, any
// signing or identity module, any archive module, or any ranking module —
// grep it and none of that vocabulary appears. The dependency direction
// stays a single line: 0.8.137 → 0.8.138, never a second, parallel
// association/verification engine.
//
// MALFORMED INPUT TOLERANCE. A non-array `associations` argument, or any
// element inside it that is not a plain object, degrades to
// `{ claimRecord: undefined, snapshot: undefined }` before being handed to
// 0.8.137 — the identical tolerance 0.8.137 already applies to a missing
// `claimRecord`/`snapshot` (projecting to `null` for a malformed
// `claimRecord`, or an empty snapshot for a malformed `snapshot`). This
// file never throws, and a malformed element's own POSITION in the
// sequence is preserved, never skipped.
//
// SYNCHRONOUS, PURE, DETERMINISTIC, SELF-CONTAINED: NO CLOCK, NO STORAGE,
// NO NETWORK, NO MUTATION. `describePublisherLeaderboardClaimSnapshotAssociationHistory()`
// reads no clock and mutates neither the supplied array nor any element
// inside it. Calling it twice with equivalent arguments — even reached by
// two entirely independent code paths — returns a byte-identical result.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Automatic claim-to-snapshot matching, a Cartesian product over
//   independent `claims[]`/`snapshots[]` arrays.** See "A history of
//   explicitly supplied pairs," above.
// - **Deduplication of repeated pairs.** See "No deduplication," above.
// - **Sorting by claim creation time, snapshot identity, signer,
//   fingerprint, or match count.** See "Preserve supplied order," above.
// - **Claim verification, signature validation.** Delegated entirely to
//   0.8.137, which itself imports no verifier and checks no signature.
// - **Trust/reputation judgments, a "valid claim" status, a collapsed
//   verdict.** 0.8.137's own vocabulary boundary, held again here — no
//   `trusted`, `authoritative`, `matches`, `score`, `rank`, or
//   `confidence` field anywhere.
// - **Persistence of the history itself.** Computed fresh, every time,
//   exactly like every other pure `describeXxx()` in this family.
// - **Ranking recomputation of any kind.**
export function describePublisherLeaderboardClaimSnapshotAssociationHistory(associations) {
    const rawAssociations = Array.isArray(associations) ? associations : [];

    const entries = rawAssociations.map((rawAssociation) => {
        const source = (rawAssociation && typeof rawAssociation === 'object') ? rawAssociation : {};
        return describePublisherLeaderboardClaimSnapshotAssociation(source.claimRecord, source.snapshot);
    });

    return Object.freeze({
        associationCount: entries.length,
        associations: Object.freeze(entries)
    });
}
