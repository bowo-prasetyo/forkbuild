import { LeaderboardClaimRecord } from './LeaderboardClaimRecord.js';
import { reconstructPublisherLeaderboardClaimHistory } from './PublisherLeaderboardClaimHistoryView.js';

// 0.8.132 — Claim Agreement & Divergence Projection.
//
// 0.8.127 through 0.8.129 each answered a question about a SINGLE
// replica's own stored claim history in isolation — what's missing between
// two histories (difference), what measurable facts exist in one history
// (statistics), and in what order those facts arrived (timeline). None of
// them ever asked a question that only makes sense once a history holds
// MORE THAN ONE claim: what factual relationships hold AMONG the claims
// themselves?
//
//   LeaderboardClaimHistory (0.8.123, UNCHANGED)
//          │
//          │  describePublisherLeaderboardClaimAgreement()  (THIS MILESTONE)
//          ▼
//   { claimCount, distinctClaimIdCount,
//     sharedSnapshotGroups, sharedEvidenceGroups, signerClaimGroups,
//     differingSnapshotPairs }
//
// THE QUESTION IS "WHAT DO THESE CLAIMS HAVE IN COMMON, OR NOT, WITH ONE
// ANOTHER?" — NEVER "WHICH CLAIM IS RIGHT?" THIS IS THE ONE BOUNDARY THIS
// WHOLE MILESTONE EXISTS TO HOLD. A claim signed by Alice and a claim
// signed by Bob that name the identical `snapshotFingerprint` are related
// by a plain, observable fact — two independent signers each attest to the
// exact same reproducible conclusion. That fact is real and worth
// surfacing on its own. It is NOT evidence that either signer is
// trustworthy, NOT a step toward resolving a "conflict," and NOT a vote —
// this file counts relationships, never verdicts. See
// `docs/Principles.md`, "An Achievement Describes An Attributable Fact,
// Not A Person's Worth (0.8.102)," held here again over a claim's own
// relationships to its peers.
//
// "AGREEMENT" AND "DIVERGENCE" NAME THE MILESTONE; THEY NEVER NAME A
// FIELD. The milestone title borrows the ordinary English words a reader
// reaches for first, but neither word appears anywhere in this file's own
// data model — grep it and neither string occurs outside this header
// comment. `sharedSnapshotGroups`/`sharedEvidenceGroups`/
// `signerClaimGroups`/`differingSnapshotPairs` each name an observable
// STRUCTURAL fact ("these claim ids name the same snapshot fingerprint,"
// "these two claim ids name the same evidence fingerprint but different
// snapshot fingerprints") rather than a judgment ("these claims agree,"
// "these claims conflict"). A reader is free to attach whichever verdict
// they like on top; this file supplies only the underlying relationship.
//
// CLAIM IDENTITY, NEVER RECEIPT IDENTITY, GOVERNS EVERY GROUP AND PAIR —
// REUSING, NEVER RE-DERIVING, 0.8.128'S OWN DISTINCTION. `claimCount`
// below counts RECEIPTS, exactly as 0.8.128's own `claimCount` already
// does — every stored `LeaderboardClaimRecord`, including every duplicate
// arrival of the identical claim (0.8.123's own multiplicity rule,
// UNCHANGED). But a relationship between "the same claim received twice"
// is not a relationship at all — it is one claim, observed twice — so
// every group and every pair below is computed over DISTINCT CLAIMS,
// deduplicated by `claim.id`, exactly as `distinctClaimIdCount` already
// counts them. The first receipt of each distinct claim id, in `history`'s
// own order, supplies that claim's fields; every later receipt of the
// identical claim id is folded in for `claimCount` alone and never
// produces a second entry in any group or pair.
//
// THREE SHARED-FIELD GROUPINGS, EACH INDEPENDENT OF THE OTHER TWO.
//
//   sharedSnapshotGroups   — distinct claims sharing one `snapshotFingerprint`.
//                            The strongest relationship this file
//                            expresses: identical snapshot content, per
//                            0.8.121's own fingerprint (a hash of the full
//                            evidence fingerprint, policy, and leaderboard
//                            together) — independent signers can still
//                            each sign the identical conclusion.
//
//   sharedEvidenceGroups   — distinct claims sharing one `evidenceFingerprint`,
//                            regardless of policy version or snapshot.
//                            Weaker than a shared snapshot — see
//                            "A Common Evidence Fingerprint Does Not Imply
//                            A Common Snapshot," below.
//
//   signerClaimGroups      — distinct claims sharing one `signerIdentityId`.
//                            Orthogonal to both fingerprints above: the
//                            SAME signer can sign claims about genuinely
//                            different snapshots over time, and claims
//                            about the identical snapshot can come from
//                            genuinely different signers.
//
// Each grouping is computed independently, over the identical distinct-
// claim set, and none is derived from another.
//
// ONLY GENUINE RELATIONSHIPS APPEAR — A GROUP OF ONE IS NOT A
// RELATIONSHIP, AND IS NEVER REPORTED. Unlike 0.8.128's own count maps
// (which report every distinct value, including one occurring exactly
// once), a group here exists only to describe a relationship AMONG two or
// more distinct claims — so a `snapshotFingerprint`/`evidenceFingerprint`/
// `signerIdentityId` value named by exactly one distinct claim produces no
// entry at all in the corresponding group list. A caller wanting the
// complete tally, singletons included, already has
// `application/PublisherLeaderboardClaimHistoryStatisticsView.js` (0.8.128,
// UNCHANGED) for exactly that — this file is deliberately narrower,
// answering only "which claims share something with at least one other
// claim," never "how many claims exist for each value."
//
// A COMMON EVIDENCE FINGERPRINT DOES NOT IMPLY A COMMON SNAPSHOT — THE ONE
// DISTINCTION THIS MILESTONE EXISTS TO MAKE OBSERVABLE, VIA
// `differingSnapshotPairs`. Two claims can share an `evidenceFingerprint`
// (the same underlying achievement facts) while naming two different
// `snapshotFingerprint`s — most plausibly because they were signed under
// two different ranking policy versions, but this file draws no such
// inference and states only the two fingerprints observed. For every pair
// of distinct claims that share an evidence fingerprint yet name different
// snapshot fingerprints, this file reports one entry:
//
//   { evidenceFingerprint, claimIdA, claimIdB,
//     snapshotFingerprintA, snapshotFingerprintB }
//
// — one entry per unordered pair (never claim A paired against itself,
// never both orderings of the same pair reported twice). A pair whose two
// claims name the SAME snapshot fingerprint is not divergence and never
// appears here — that relationship is exactly what `sharedSnapshotGroups`
// already reports, on the other side of this same distinction. Concretely,
// given:
//
//   Claim A — Alice — evidence E1, policy 1, snapshot S1
//   Claim B — Alice — evidence E1, policy 2, snapshot S3
//   Claim C — Bob   — evidence E1, policy 1, snapshot S1
//   Claim D — Carol — evidence E2, policy 1, snapshot S4
//
//   sharedSnapshotGroups   = [{ snapshotFingerprint: S1, claimIds: [A, C] }]
//   sharedEvidenceGroups   = [{ evidenceFingerprint: E1, claimIds: [A, B, C] }]
//   signerClaimGroups      = [{ signerIdentityId: Alice, claimIds: [A, B] }]
//   differingSnapshotPairs = [{ evidenceFingerprint: E1, claimIdA: A, claimIdB: B,
//                                snapshotFingerprintA: S1, snapshotFingerprintB: S3 },
//                              { evidenceFingerprint: E1, claimIdA: B, claimIdB: C,
//                                snapshotFingerprintA: S3, snapshotFingerprintB: S1 }]
//
// A and C: same evidence, same snapshot, different signer. A and B: same
// evidence, same signer, different snapshot. B and C: same evidence,
// different signer, different snapshot — EVERY pair drawn from a shared-
// evidence group whose two snapshot fingerprints differ is reported, not
// only the first; (A, C) is the one pair from this group that is absent
// from `differingSnapshotPairs`, because their snapshot fingerprints
// genuinely match. A and D: nothing shared at all — D's evidence
// fingerprint never joins A's `sharedEvidenceGroups` entry, and no pair
// naming D appears in `differingSnapshotPairs` (that list only ever pairs
// claims that DO share an evidence fingerprint). See this file's own
// FLAGSHIP test for this exact scenario, worked through in full.
//
// GROUPS AND PAIRS ARE ORDERED BY FIRST APPEARANCE, NEVER SORTED — THE
// IDENTICAL DISCIPLINE 0.8.128'S OWN COUNT MAPS ALREADY HOLD. Each group
// list is ordered by when its shared value first appears while scanning
// the distinct-claim list in its own order (oldest-received claim first);
// each group's own `claimIds` are ordered the identical way. `differingSnapshotPairs`
// is ordered by its evidence-fingerprint group's own first appearance,
// then by the pair's two claims' own first-appearance order within that
// group.
//
// ARCHITECTURAL BOUNDARY: STRUCTURAL FACTS ABOUT STORED CLAIMS, NEVER A
// VERIFICATION, TRUST, OR RANKING DETERMINATION OF ANY KIND — THE
// IDENTICAL BOUNDARY 0.8.127/0.8.128/0.8.129 ALREADY HOLD, HELD HERE AGAIN
// OVER RELATIONSHIPS INSTEAD OF DIFFERENCE, COUNTS, OR CHRONOLOGY. This
// file imports nothing from
// `application/PublisherLeaderboardSnapshotClaimVerification.js`,
// `application/PublisherLeaderboardClaimVerificationView.js`, or
// `application/PublisherLeaderboardClaimVerificationHistoryView.js`
// (0.8.120/0.8.124/0.8.125) — grep it and none of that vocabulary appears.
// Two signers sharing a snapshot fingerprint are reported as sharing a
// snapshot fingerprint, in that order, full stop — never as "corroborating
// one another," never as "more likely to be correct," and this file never
// consults either replica's own CURRENT evidence to decide whether the
// shared conclusion still holds. See `application/
// PublisherLeaderboardClaimHistoryStatisticsView.js`'s own header,
// "Compares Stored Receipts, Never Verification Results" — the identical
// restraint, held here a fourth time for relationships instead of
// counting, differencing, or narrating chronology.
//
// NO SEMANTIC INTERPRETATION, NO SCORE, NO RANK, NO "CONFLICT." This file
// carries no `valid`, `verified`, `trusted`, `trust`, `confidence`,
// `score`, `rank`, `reputation`, `conflict`, or `agree`/`agreement`/
// `diverge`/`divergence` field, individually or combined, anywhere in its
// result. It reports only which claim ids share which fingerprint or
// signer, and which claim ids share an evidence fingerprint while naming
// different snapshot fingerprints.
//
// `describePublisherLeaderboardClaimAgreement()`/
// `reconstructPublisherLeaderboardClaimAgreement()` — THE IDENTICAL SPLIT
// EVERY OTHER FILE IN THE CLAIM-HISTORY FAMILY ALREADY HOLDS.
// `describePublisherLeaderboardClaimAgreement()` is the pure computation,
// over one plain `LeaderboardClaimHistory` array.
// `reconstructPublisherLeaderboardClaimAgreement()` below pulls a
// replica's own stored `LeaderboardClaimHistory` straight out of an
// archive via `application/PublisherLeaderboardClaimHistoryView.js`'s own
// `reconstructPublisherLeaderboardClaimHistory()` (0.8.130, UNCHANGED),
// then hands it, unchanged, to the pure computation — word for word
// `application/PublisherLeaderboardClaimHistoryTimelineView.js`'s own
// `reconstructPublisherLeaderboardClaimHistoryTimeline()` reasoning, held
// here again.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK. Reads no clock.
// Never mutates the input history or any record/claim it holds. Returns
// frozen objects and frozen arrays throughout. Calling either function
// twice with a byte-identical argument returns a byte-identical result.
//
// MALFORMED INPUT DEGRADES TO AN EMPTY RESULT — NEVER THROWS. `null`,
// `undefined`, a non-array, or an array containing entries that are not
// genuine `LeaderboardClaimRecord` instances are all tolerated exactly as
// `application/PublisherLeaderboardClaimHistoryStatisticsView.js`'s own
// `describePublisherLeaderboardClaimHistoryStatistics()` already tolerates
// its own history argument: non-`LeaderboardClaimRecord` entries are
// silently excluded, and an entirely malformed/absent history produces
// every count at zero and every array empty.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No verification, trust, or
// "which claim is currently valid" determination of any kind — see
// "Architectural Boundary," above. No resolution, merge, or "which claim
// wins" mechanism of any kind — a shared or differing fingerprint is
// reported and nothing is done about it. No ranking, scoring, or "best
// signer" determination — see 0.8.112's own, already-built, explicitly
// evaluative `PublisherRankingPolicy.js` for where that concern lives. No
// temporal narration of how a signer's claims changed over successive
// snapshots — that is a genuinely different, separately sized, later
// question, over the SAME underlying facts this file exposes. No
// integration with anything beyond `PublicationObservationArchive`'s
// already-built claim history. No automatic, periodic, or background
// computation of any kind — this function runs only when a caller
// explicitly calls it.
export function describePublisherLeaderboardClaimAgreement(history) {
    const records = (Array.isArray(history) ? history : []).filter((record) => record instanceof LeaderboardClaimRecord);

    const distinctClaims = [];
    const seenClaimIds = new Set();
    for (const record of records) {
        const claimId = record.claim.id;
        if (seenClaimIds.has(claimId)) continue;
        seenClaimIds.add(claimId);
        distinctClaims.push(record.claim);
    }

    const sharedSnapshotGroups = groupSharedClaims(distinctClaims, 'snapshotFingerprint', (claim) => claim.snapshotFingerprint);
    const sharedEvidenceGroups = groupSharedClaims(distinctClaims, 'evidenceFingerprint', (claim) => claim.evidenceFingerprint);
    const signerClaimGroups = groupSharedClaims(distinctClaims, 'signerIdentityId', (claim) => claim.signerIdentityId);
    const differingSnapshotPairs = findDifferingSnapshotPairs(distinctClaims);

    return Object.freeze({
        claimCount: records.length,
        distinctClaimIdCount: distinctClaims.length,
        sharedSnapshotGroups: Object.freeze(sharedSnapshotGroups),
        sharedEvidenceGroups: Object.freeze(sharedEvidenceGroups),
        signerClaimGroups: Object.freeze(signerClaimGroups),
        differingSnapshotPairs: Object.freeze(differingSnapshotPairs)
    });
}

// reconstructPublisherLeaderboardClaimAgreement() — this replica's own
// archive-reading entry point, mirroring every other `reconstructXxx()` in
// the claim-history family exactly: it pulls this replica's own stored
// `LeaderboardClaimHistory` straight out of `archive` via
// application/PublisherLeaderboardClaimHistoryView.js's own
// `reconstructPublisherLeaderboardClaimHistory()` (0.8.130, UNCHANGED),
// then hands it, unchanged, to the pure computation above. An
// invalid/missing `archive` degrades to `PublicationObservationArchive.empty()`
// (via that same function), never a throw.
export function reconstructPublisherLeaderboardClaimAgreement(archive) {
    return describePublisherLeaderboardClaimAgreement(reconstructPublisherLeaderboardClaimHistory(archive));
}

// The one, uniform "shared value" grouping this file uses for all three
// grouping fields — every DISTINCT claim in `distinctClaims` (never a raw
// receipt) keyed by whatever string `keyOf()` extracts from it, in the
// order each distinct value is first seen while scanning `distinctClaims`
// in its own existing order. Only values shared by two or more distinct
// claims produce an entry — see this file's own header, "Only Genuine
// Relationships Appear." `fieldName` names the property carrying the
// shared value on each returned entry, alongside its own `claimIds` (each
// claim's own `id`, in the identical first-appearance order). A claim
// whose extracted value is not a non-empty string is silently excluded
// from the grouping — the identical tolerance
// `application/PublisherLeaderboardClaimHistoryStatisticsView.js`'s own
// `tallyFirstAppearance()` already holds for a garbage entry.
function groupSharedClaims(distinctClaims, fieldName, keyOf) {
    const claimIdsByValue = new Map();
    const order = [];
    for (const claim of distinctClaims) {
        const value = keyOf(claim);
        if (typeof value !== 'string' || value.length === 0) continue;
        let claimIds = claimIdsByValue.get(value);
        if (!claimIds) {
            claimIds = [];
            claimIdsByValue.set(value, claimIds);
            order.push(value);
        }
        claimIds.push(claim.id);
    }

    const groups = [];
    for (const value of order) {
        const claimIds = claimIdsByValue.get(value);
        if (claimIds.length < 2) continue;
        groups.push(Object.freeze({ [fieldName]: value, claimIds: Object.freeze(claimIds) }));
    }
    return groups;
}

// Every unordered pair of DISTINCT claims that share an
// `evidenceFingerprint` yet name different `snapshotFingerprint`s — see
// this file's own header, "A Common Evidence Fingerprint Does Not Imply A
// Common Snapshot." Claims are first bucketed by `evidenceFingerprint`
// (first-appearance order, mirroring `groupSharedClaims()` above), then
// every pair within a bucket is considered exactly once — `(A, B)` never
// also reported as `(B, A)`, and a claim never paired against itself.
function findDifferingSnapshotPairs(distinctClaims) {
    const claimsByEvidence = new Map();
    for (const claim of distinctClaims) {
        const evidenceFingerprint = claim.evidenceFingerprint;
        if (typeof evidenceFingerprint !== 'string' || evidenceFingerprint.length === 0) continue;
        let claims = claimsByEvidence.get(evidenceFingerprint);
        if (!claims) {
            claims = [];
            claimsByEvidence.set(evidenceFingerprint, claims);
        }
        claims.push(claim);
    }

    const pairs = [];
    for (const [evidenceFingerprint, claims] of claimsByEvidence) {
        for (let i = 0; i < claims.length; i++) {
            for (let j = i + 1; j < claims.length; j++) {
                const claimA = claims[i];
                const claimB = claims[j];
                if (claimA.snapshotFingerprint === claimB.snapshotFingerprint) continue;
                pairs.push(Object.freeze({
                    evidenceFingerprint,
                    claimIdA: claimA.id,
                    claimIdB: claimB.id,
                    snapshotFingerprintA: claimA.snapshotFingerprint,
                    snapshotFingerprintB: claimB.snapshotFingerprint
                }));
            }
        }
    }
    return pairs;
}
