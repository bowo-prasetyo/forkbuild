import { PublicationObservationArchive } from './PublicationObservationArchive.js';

// 0.8.167 — Durable Revalidation Observation History Archive Integration:
// the ONE reconstruction seam.
//
// 0.8.163 built `PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory`
// as a plain, in-memory array of 0.8.162's own observation records,
// deliberately never touching `application/PublicationObservationArchive.js`
// at all (see that file's own header, "Architectural boundary — no imports
// at all"). 0.8.167 gave the archive itself a durable home for exactly that
// array — `revalidationObservationRecords`. This file is the single seam
// between the two, mirroring `application/
// PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryView.js`'s
// own 0.8.150 `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory()`
// exactly, one subject over:
//
//   PublicationObservationArchive
//        │  .revalidationObservationRecords
//        ▼
//   reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory(archive)
//        │
//        ▼
//   the exact array every downstream projection in this family
//   (PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplicationView.js,
//    ...HistoryTimelineView.js, ...HistoryDifference.js) already expects
//
// DELIBERATELY RETURNS THE RAW ARRAY, UNCHANGED — NEVER A NARRATED OR
// RECOMPUTED SHAPE. This function reads `archive.revalidationObservationRecords`
// and hands it back exactly as the archive holds it; it computes no
// deduplication, timeline, or difference of its own — those stay exactly
// where 0.8.164/0.8.165/0.8.166 already put them, now simply composed on
// top of this one seam instead of reading a caller-held array directly.
//
// AN INVALID/MISSING `archive` DEGRADES TO AN EMPTY HISTORY, NEVER A
// THROW — the identical tolerance every other `reconstructXxx()` entry
// point in this codebase already holds.
//
// PURE AND STATELESS. No constructor, no injected collaborator, no network
// access. Calling this function twice with a byte-identical argument
// returns a byte-identical result.
//
// ARCHITECTURAL BOUNDARY — EXACTLY ONE IMPORT,
// `application/PublicationObservationArchive.js` ITSELF. This file imports
// nothing from `application/
// PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js`,
// `application/
// PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js`,
// or any other module in this family — it trusts nothing about how an
// observation record was produced beyond what the archive's own strict
// `fromJSON()` already validated (see that file's own
// `validateRevalidationObservationRecord()`), and never calls 0.8.163,
// 0.8.162, or anything earlier to re-derive or double-check anything.
export function reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory(archive) {
    const safeArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();
    return safeArchive.revalidationObservationRecords;
}
