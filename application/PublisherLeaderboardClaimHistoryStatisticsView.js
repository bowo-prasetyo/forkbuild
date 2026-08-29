import { LeaderboardClaimRecord } from './LeaderboardClaimRecord.js';

// 0.8.128 — Claim History Statistics Projection.
//
// 0.8.127 answered "what, exactly, does each replica have that the other
// one lacks?" — a receipt-by-receipt difference over two claim histories.
// It deliberately never answered a narrower, single-replica question that
// difference isn't shaped to answer either: "what measurable facts exist
// in THIS replica's own stored claim history, on its own?" This file is
// that projection, and nothing more — the claim-history analogue of
// `application/PublisherAchievementStatisticsView.js` (0.8.111), one
// subject over: where that file tallies a publisher's own achievements and
// badges into plain counts, this file tallies a replica's own
// `LeaderboardClaimHistory` (0.8.123's plain, ordered array of
// `LeaderboardClaimRecord`) — the RECEIPTS a replica has recorded, never
// the evidence beneath them and never any verification computed over
// them:
//
//   describePublisherLeaderboardClaimHistoryStatistics(history)
//     -> { claimCount, distinctClaimIdCount,
//          distinctSignerIdentityIdCount, distinctSnapshotFingerprintCount,
//          distinctEvidenceFingerprintCount, signerIdentityCounts,
//          snapshotFingerprintCounts, evidenceFingerprintCounts }
//
// THE QUESTION IS "WHAT MEASURABLE FACTS EXIST?" — NEVER "WHICH CLAIMS ARE
// TRUSTWORTHY?", "WHICH SIGNER IS BETTER?", OR "WHICH CLAIM IS CURRENTLY
// VALID?" THIS IS THE ONE BOUNDARY THIS WHOLE MILESTONE EXISTS TO HOLD.
// Every field below answers a plain, closed, factual question about the
// history a caller already holds — "how many," "how many distinct," "how
// many of each" — and none of them orders signers against one another,
// weighs one claim above another, or determines whether any claim on file
// still agrees with a replica's own current evidence. See
// `docs/Principles.md`, "An Achievement Describes An Attributable Fact,
// Not A Person's Worth (0.8.102)," held here again over a claim history's
// own statistical summary. A ranking POLICY built on these exact facts is
// real, separately sized, later work — this file supplies the raw
// material, never the verdict, exactly as `application/
// PublisherLeaderboardClaimHistoryView.js`'s own header already draws that
// line one layer below.
//
// RECEIPT IDENTITY IS NOT CLAIM IDENTITY — THE ONE DISTINCTION THIS
// MILESTONE EXISTS TO MAKE OBSERVABLE, REUSING THE VOCABULARY 0.8.126/
// 0.8.127 ALREADY ESTABLISHED FOR EXCHANGE AND DIFFERENCE. A single signed
// claim can arrive at a replica more than once — the SAME claim, received
// directly and again relayed through a peer (0.8.123's own multiplicity
// rule, UNCHANGED) — and each arrival is its own, independent
// `LeaderboardClaimRecord`, i.e. its own receipt. `claimCount` below
// counts RECEIPTS — every stored record, exactly as `history.length`
// itself would, including every duplicate arrival of the identical claim.
// `distinctClaimIdCount` counts CLAIMS — `claim.id` (the claim's own
// durable identifier, `core/PublisherLeaderboardSnapshotClaim.js`'s own
// field, UNCHANGED), each counted once no matter how many times received.
// Concretely, given:
//
//   Claim A / Alice / snapshot X / evidence E   (received at T1, LOCAL)
//   Claim A / Alice / snapshot X / evidence E   (received at T2, IMPORTED)
//   Claim B / Alice / snapshot X / evidence E
//   Claim C / Bob   / snapshot Y / evidence F
//
//   claimCount                        = 4
//   distinctClaimIdCount              = 3
//   distinctSignerIdentityIdCount     = 2
//   distinctSnapshotFingerprintCount  = 2
//   distinctEvidenceFingerprintCount  = 2
//
// The two receipts of claim A never collapse `claimCount`, and never
// collapse into a single entry anywhere else in this result either — see
// "No Deduplication Of History," below.
//
// NO DEDUPLICATION OF HISTORY — ONLY THE EXPLICITLY NAMED `distinct*`
// COUNTS DEDUPLICATE, AND NOTHING ELSE DOES. `signerIdentityCounts`,
// `snapshotFingerprintCounts`, and `evidenceFingerprintCounts` each tally
// EVERY stored receipt — a signer who has three receipts on file, whether
// for one claim received three times or three distinct claims, is
// reported with `count: 3` either way. The input history itself remains a
// sequence/multiset throughout; this file never reduces it to a `Set`
// before counting anything other than the four `distinct*` fields, which
// exist for exactly that purpose and no other.
//
// COUNT MAPS PRESERVE FIRST-APPEARANCE ORDER — NEVER ALPHABETICAL, NEVER
// SORTED BY COUNT. Mirroring `application/PublisherAchievementStatisticsView.js`'s
// own `achievementKindCounts` convention exactly: each of
// `signerIdentityCounts`/`snapshotFingerprintCounts`/`evidenceFingerprintCounts`
// lists only the values that actually occur in `history` (never the full
// space of possible identities or fingerprints), each entry's own `count`
// stating exactly how many stored receipts carry that value, ordered by
// when that value FIRST appears while scanning `history` in its own
// existing order — oldest received first, never re-sorted by name or by
// count.
//
// COMPARES STORED RECEIPTS, NEVER VERIFICATION RESULTS — THE IDENTICAL
// ARCHITECTURAL BOUNDARY 0.8.127 ALREADY HOLDS, HELD HERE AGAIN OVER
// STATISTICS INSTEAD OF DIFFERENCE. This file imports nothing from
// `application/PublisherLeaderboardSnapshotClaimVerification.js`,
// `application/PublisherLeaderboardClaimVerificationView.js`, or
// `application/PublisherLeaderboardClaimVerificationHistoryView.js`
// (0.8.120/0.8.124/0.8.125) — grep it and none of that vocabulary
// appears. A replica's own statistics over its stored claim history never
// change merely because its own current evidence changes and a claim's
// verification outcome flips — the receipts on file, and the facts this
// file counts about them, are unaffected. See `application/
// PublisherLeaderboardClaimHistoryDifference.js`'s own header, "Compares
// Stored Receipts, Never Verification Results," and `application/
// PublisherLeaderboardClaimHistoryExchange.js`'s own header, "This
// transports receipts, never conclusions" — the identical restraint, held
// here a third time for tallying instead of comparing or transporting.
//
// NO SEMANTIC INTERPRETATION, NO SCORE, NO RANK. This file carries no
// `valid`, `verified`, `trusted`, `trust`, `confidence`, `score`, `rank`,
// or `reputation` field, individually or combined, and computes no single
// number that weighs one signer, snapshot, or evidence set above another.
// Every field is a plain, independently meaningful count.
//
// `describePublisherLeaderboardClaimHistoryStatistics()`/
// `reconstructPublisherLeaderboardClaimHistoryStatistics()` — THE
// IDENTICAL SPLIT EVERY OTHER FILE IN THE CLAIM-HISTORY FAMILY ALREADY
// HOLDS, EVEN THOUGH THERE IS STILL NO ARCHIVE TO RECONSTRUCT FROM.
// `describePublisherLeaderboardClaimHistoryStatistics()` is the pure
// computation, over one plain `LeaderboardClaimHistory` array.
// `reconstructPublisherLeaderboardClaimHistoryStatistics()` below is
// presently a thin, identity wrapper around it — word for word
// `application/PublisherLeaderboardClaimHistoryDifference.js`'s own
// `reconstructPublisherLeaderboardClaimHistoryDifference()` reasoning,
// held here again: `LeaderboardClaimHistory` is already the plain,
// in-memory collection a caller holds directly, never something wrapped
// inside a `PublicationObservationArchive` that would need extraction
// first. The two names are kept distinct anyway so a future milestone
// that integrates claim history into `PublicationObservationArchive`
// (0.8.130) can teach the reconstruction to accept an archive without
// disturbing this file's own pure computation or any caller already using
// it directly.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK. Reads no clock.
// Never mutates the input history or any record it holds. Returns frozen
// objects and frozen arrays throughout. Calling either function twice with
// a byte-identical argument returns a byte-identical result.
//
// MALFORMED INPUT DEGRADES TO AN EMPTY STATISTICS RESULT — NEVER THROWS.
// `null`, `undefined`, a non-array, or an array containing entries that
// are not genuine `LeaderboardClaimRecord` instances are all tolerated
// exactly as `application/PublisherLeaderboardClaimHistoryDifference.js`'s
// own `describePublisherLeaderboardClaimHistoryDifference()` already
// tolerates its two history arguments: non-`LeaderboardClaimRecord`
// entries are silently excluded, and an entirely malformed/absent history
// produces every count at zero and every array empty.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No verification, trust, or
// "which claim is currently valid" determination of any kind — see
// "Compares Stored Receipts, Never Verification Results," above. No
// historical claim timeline or chronological narration — that is
// 0.8.129's own, separately sized question ("Historical Claim Timeline").
// No integration with `PublicationObservationArchive` — that is 0.8.130's
// own, separately sized question. No ranking, scoring, or "best signer"
// determination of any kind — see 0.8.112's own, already-built, explicitly
// evaluative `PublisherRankingPolicy.js` for where that concern lives, and
// this file's own header, "No Semantic Interpretation, No Score, No
// Rank," for why it is never folded back in here.
export function describePublisherLeaderboardClaimHistoryStatistics(history) {
    const records = (Array.isArray(history) ? history : []).filter((record) => record instanceof LeaderboardClaimRecord);

    const distinctClaimIds = new Set();
    const signerIdentityCounts = tallyFirstAppearance(records, 'signerIdentityId', (record) => record.claim.signerIdentityId);
    const snapshotFingerprintCounts = tallyFirstAppearance(records, 'snapshotFingerprint', (record) => record.claim.snapshotFingerprint);
    const evidenceFingerprintCounts = tallyFirstAppearance(records, 'evidenceFingerprint', (record) => record.claim.evidenceFingerprint);

    for (const record of records) {
        distinctClaimIds.add(record.claim.id);
    }

    return Object.freeze({
        claimCount: records.length,
        distinctClaimIdCount: distinctClaimIds.size,
        distinctSignerIdentityIdCount: signerIdentityCounts.length,
        distinctSnapshotFingerprintCount: snapshotFingerprintCounts.length,
        distinctEvidenceFingerprintCount: evidenceFingerprintCounts.length,
        signerIdentityCounts: Object.freeze(signerIdentityCounts),
        snapshotFingerprintCounts: Object.freeze(snapshotFingerprintCounts),
        evidenceFingerprintCounts: Object.freeze(evidenceFingerprintCounts)
    });
}

// reconstructPublisherLeaderboardClaimHistoryStatistics() — presently a
// thin, identity wrapper around `describePublisherLeaderboardClaimHistoryStatistics()`.
// See this file's own header, "The identical split... even though there
// is still no archive to reconstruct from."
export function reconstructPublisherLeaderboardClaimHistoryStatistics(history) {
    return describePublisherLeaderboardClaimHistoryStatistics(history);
}

// The one, uniform first-appearance tally this file uses for all three
// count maps — every stored receipt in `records` (never deduplicated)
// tallied by whatever string `keyOf()` extracts from its claim, in the
// order each distinct value is first seen while scanning `records` in its
// own existing order. `fieldName` names the property on each returned
// entry (`signerIdentityId`/`snapshotFingerprint`/`evidenceFingerprint`),
// alongside its own `count`. A record whose extracted value is not a
// non-empty string is silently excluded from the tally — the identical
// tolerance `application/PublisherAchievementStatisticsView.js`'s own
// `achievementKindCounts` already holds for a garbage entry.
function tallyFirstAppearance(records, fieldName, keyOf) {
    const entries = [];
    const entryByValue = new Map();
    for (const record of records) {
        const value = keyOf(record);
        if (typeof value !== 'string' || value.length === 0) continue;
        const existingEntry = entryByValue.get(value);
        if (existingEntry) {
            existingEntry.count += 1;
        } else {
            const entry = { [fieldName]: value, count: 1 };
            entryByValue.set(value, entry);
            entries.push(entry);
        }
    }
    return entries.map((entry) => Object.freeze(entry));
}
