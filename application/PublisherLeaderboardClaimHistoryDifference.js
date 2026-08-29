import { LeaderboardClaimRecord } from './LeaderboardClaimRecord.js';

// 0.8.127 — Claim History Difference Projection.
//
// 0.8.126 gave two replicas a way to LEARN that their claim histories
// differ and to converge them — export, import, apply. It deliberately
// never answered the question a replica actually has the moment it wants
// to converge deliberately rather than blindly re-exchanging everything it
// already holds:
//
//   Alice's history                          Bob's history
//        │  exportPublisherLeaderboardClaimHistory()  │
//        ▼                                              ▼
//   { claims: [...] }                         { claims: [...] }
//                    │                                 │
//                    └──── "these differ somehow" ──────┘
//                              — but WHAT, exactly,
//                                does each side have that
//                                the other one lacks?
//
// This file answers exactly that — the claim-history analogue of
// `application/AchievementEvidenceDifference.js` (0.8.117), one layer up:
// where that file diffs a replica's four EVIDENCE collections, this file
// diffs a replica's own `LeaderboardClaimHistory` (0.8.123's plain, ordered
// array of `LeaderboardClaimRecord`) — the RECEIPTS a replica has recorded,
// never the evidence beneath them and never any verification computed over
// them. See "Compares stored receipts, never verification results," below.
//
//   difference                    → "here is exactly what's missing, on
//                                     each side" (THIS MILESTONE)
//        │
//        ▼
//   exportPublisherLeaderboardClaimHistory(missing) + applyPublisherLeaderboardClaimHistoryExchange()
//        │                                             (0.8.126, UNCHANGED —
//        ▼                                              this file performs
//   converged histories                                 neither step itself)
//
// RECEIPT IDENTITY, NOT CLAIM IDENTITY, GOVERNS THE COMPARISON — THE
// IDENTICAL RULE 0.8.126 ALREADY ESTABLISHED FOR DEDUPLICATION, REUSED HERE
// UNCHANGED FOR DIFFERENCING:
//
//   receiptIdentity = structural identity of (claim, receivedAt, origin)
//
// — exact structural equality of a record's own complete `toJSON()` output,
// mirroring `application/AchievementEvidenceMerge.js`'s own
// `canonicalRecordKey()` and 0.8.126's own `canonicalReceiptKey()`
// (deliberately duplicated here rather than imported — see 0.8.117's own
// header, "small, self-contained helper, duplicated rather than coupling
// two unrelated files"). Concretely:
//
//   same claim + same receivedAt + same origin   → the SAME receipt
//   same claim + different receivedAt              → a DISTINCT receipt
//   same claim + different origin                   → a DISTINCT receipt
//   different claim, even by one signed field       → always DISTINCT
//
// Two separately constructed `LeaderboardClaimRecord` instances carrying
// exactly the same serialized fields are the SAME receipt for this file's
// own purposes — comparison is by CONTENT, never by object identity or
// array position.
//
// MULTISET DIFFERENCE, NEVER A SET DIFFERENCE — THE IDENTICAL DISCIPLINE
// 0.8.117'S OWN `extractUnmatched()` ALREADY HOLDS FOR ACHIEVEMENT
// EVIDENCE, HELD HERE AGAIN OVER RECEIPTS. `[A, A, B]` compared against
// `[A, B]` reports exactly one `A` as source-only — the second `A` has no
// counterpart left once the first has been matched — never zero (a naive
// "is A present in target?" check) and never two (a comparison that never
// consumes a match). This matters concretely for claim history: the SAME
// claim received twice by one replica (0.8.123's own multiplicity rule,
// UNCHANGED) is two distinct historical entries, and a replica that has
// received it twice while its peer has received it only once genuinely
// has one exclusive receipt, not zero.
//
// EACH RESULT ELEMENT IS THE ORIGINAL, FROZEN `LeaderboardClaimRecord`
// INSTANCE — NEVER A RECONSTRUCTED COPY OR A `toJSON()` PROJECTION. This is
// a deliberate departure from 0.8.117's own `sourceOnly`/`targetOnly`
// shape (plain `toJSON()` objects), made because a `LeaderboardClaimRecord`
// is already the exact unit `exportPublisherLeaderboardClaimHistory()` and
// `appendLeaderboardClaimHistoryEntry()` (0.8.123/0.8.126, UNCHANGED) both
// consume directly — a caller wanting to reconcile two replicas hands
// either array straight to `exportPublisherLeaderboardClaimHistory()`
// (which itself filters for genuine `LeaderboardClaimRecord` instances)
// without any further transformation. See `tests/
// PublisherLeaderboardClaimHistoryDifference.test.js`'s own FLAGSHIP
// section for exactly this: difference → export → apply → difference again
// → `sameHistory === true`, entirely without this file performing the
// exchange itself.
//
// COMPARES STORED RECEIPTS, NEVER VERIFICATION RESULTS — THE ARCHITECTURAL
// BOUNDARY THIS MILESTONE EXISTS TO HOLD. This file imports nothing from
// `application/PublisherLeaderboardSnapshotClaimVerification.js`,
// `application/PublisherLeaderboardClaimVerificationView.js`, or
// `application/PublisherLeaderboardClaimVerificationHistoryView.js`
// (0.8.120/0.8.124/0.8.125) — grep it and none of that vocabulary appears.
// Two replicas holding the byte-identical receipt for claim X report NO
// difference for that receipt, even when one replica's own CURRENT
// evidence makes that claim verify successfully and the other replica's
// own current evidence makes it fail — `signatureValid`/
// `evidenceFingerprintMatches`/`matches` are projections computed fresh,
// per replica, against evidence that keeps changing; a claim-history
// difference is a fact about which DURABLE RECEIPTS each replica holds on
// file, and that fact does not change just because two replicas currently
// disagree about what those receipts mean. See `application/
// PublisherLeaderboardClaimHistoryExchange.js`'s own header, "This
// transports receipts, never conclusions" — the identical restraint, held
// here again for comparison instead of transport.
//
// `describePublisherLeaderboardClaimHistoryDifference()`/
// `reconstructPublisherLeaderboardClaimHistoryDifference()` — THE IDENTICAL
// SPLIT EVERY OTHER FILE IN THE ACHIEVEMENT/LEADERBOARD FAMILY ALREADY
// HOLDS, EVEN THOUGH THERE IS NO ARCHIVE TO RECONSTRUCT FROM YET.
// `describePublisherLeaderboardClaimHistoryDifference()` is the pure
// computation, over two plain `LeaderboardClaimHistory` arrays.
// `reconstructPublisherLeaderboardClaimHistoryDifference()` is presently a
// thin, identity wrapper around it — `LeaderboardClaimHistory` (0.8.123) is
// already the plain, in-memory collection a caller holds directly, never
// something wrapped inside a `PublicationObservationArchive` that would
// need extraction first, the same reasoning 0.8.126's own
// `exportPublisherLeaderboardClaimHistory()` already holds for export. The
// two names are kept distinct anyway, matching 0.8.117's own convention,
// so a future milestone that integrates claim history into
// `PublicationObservationArchive` (0.8.130) can teach
// `reconstructPublisherLeaderboardClaimHistoryDifference()` to accept an
// archive on each side without disturbing this file's own pure
// computation or any caller already using it directly.
//
// NO ORDERING, NO GROUPING, NO STATISTICS. `sourceOnly`/`targetOnly` are
// reported in each side's own original history order — oldest received
// first — never sorted, grouped by signer, or reduced to a count of
// distinct claims versus distinct receipts. That is 0.8.128's own,
// separately sized question ("Claim History Statistics Projection").
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK. Reads no clock.
// Never mutates either input history or any record either one holds.
// Calling either function twice with byte-identical arguments returns a
// byte-identical result.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No merge, export, or import
// of any kind — `sourceOnly`/`targetOnly` are read-only facts about the
// difference; folding either side's exclusive receipts into the other
// history is `application/PublisherLeaderboardClaimHistoryExchange.js`'s
// own, already-built job (0.8.126), one `exportPublisherLeaderboardClaimHistory()`
// + `applyPublisherLeaderboardClaimHistoryExchange()` call away, entirely
// untouched by this file. No claim identity/multiplicity statistics
// ("0.8.128"), no historical claim timeline ("0.8.129"), no integration
// with `PublicationObservationArchive` ("0.8.130"). No verification, no
// trust, no "which replica is correct" determination — see "Compares
// stored receipts, never verification results," above. No automatic,
// periodic, or background comparison of any kind — this function runs only
// when a caller explicitly calls it.
export function describePublisherLeaderboardClaimHistoryDifference(sourceHistory = [], targetHistory = []) {
    const source = (Array.isArray(sourceHistory) ? sourceHistory : []).filter((record) => record instanceof LeaderboardClaimRecord);
    const target = (Array.isArray(targetHistory) ? targetHistory : []).filter((record) => record instanceof LeaderboardClaimRecord);

    const sourceOnly = extractUnmatched(source, target);
    const targetOnly = extractUnmatched(target, source);

    return Object.freeze({
        sourceCount: source.length,
        targetCount: target.length,
        sourceOnlyCount: sourceOnly.length,
        targetOnlyCount: targetOnly.length,
        sourceOnly: Object.freeze(sourceOnly),
        targetOnly: Object.freeze(targetOnly),
        sameHistory: sourceOnly.length === 0 && targetOnly.length === 0
    });
}

// reconstructPublisherLeaderboardClaimHistoryDifference() — presently a
// thin, identity wrapper around `describePublisherLeaderboardClaimHistoryDifference()`.
// See this file's own header, "The identical split... even though there is
// no archive to reconstruct from yet."
export function reconstructPublisherLeaderboardClaimHistoryDifference(sourceHistory, targetHistory) {
    return describePublisherLeaderboardClaimHistoryDifference(sourceHistory, targetHistory);
}

// The multiset (bag) subtraction `from - against`, preserving
// multiplicity — see this file's own header, "Multiset difference, never a
// set difference." Each record in `against` cancels out AT MOST ONE
// occurrence in `from`, matched by exact receipt identity
// (`canonicalReceiptKey()`, below) — never by a narrower per-claim key.
// Returns the unmatched records themselves — the original, frozen
// `LeaderboardClaimRecord` instances, never a reconstructed copy — in
// `from`'s own original order.
function extractUnmatched(from, against) {
    const remaining = new Map();
    for (const record of against) {
        const key = canonicalReceiptKey(record);
        remaining.set(key, (remaining.get(key) || 0) + 1);
    }

    const unmatched = [];
    for (const record of from) {
        const key = canonicalReceiptKey(record);
        const count = remaining.get(key) || 0;
        if (count > 0) {
            remaining.set(key, count - 1);
        } else {
            unmatched.push(record);
        }
    }
    return unmatched;
}

// The one, uniform receipt identity this file uses for comparison —
// exact structural equality of a record's own complete `toJSON()` output.
// Word for word `application/PublisherLeaderboardClaimHistoryExchange.js`'s
// own `canonicalReceiptKey()`, deliberately duplicated rather than
// imported — see this file's own header.
function canonicalReceiptKey(record) {
    return JSON.stringify(record.toJSON());
}
