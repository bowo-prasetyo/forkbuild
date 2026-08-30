import { PublicationObservationArchive } from './PublicationObservationArchive.js';

// 0.8.150 — Durable Reconciliation Decision History Archive Integration:
// the ONE reconstruction seam.
//
// 0.8.146 built `PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory`
// as a plain, in-memory array of 0.8.145's own decision records, deliberately
// never touching `application/PublicationObservationArchive.js` at all (see
// that file's own header, "Architectural boundary — no imports at all").
// 0.8.150 gave the archive itself a durable home for exactly that array —
// `reconciliationDecisionRecords`. This file is the single seam between the
// two, mirroring `application/PublisherLeaderboardClaimHistoryView.js`'s own
// 0.8.130 `reconstructPublisherLeaderboardClaimHistory()` exactly, one
// subsystem over:
//
//   PublicationObservationArchive
//        │  .reconciliationDecisionRecords
//        ▼
//   reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory(archive)
//        │
//        ▼
//   the exact array every downstream projection in this family
//   (PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatisticsView.js,
//    ...TimelineView.js, ...Difference.js) already expects
//
// DELIBERATELY RETURNS THE RAW ARRAY, UNCHANGED — NEVER A NARRATED OR
// RECOMPUTED SHAPE. This function reads `archive.reconciliationDecisionRecords`
// and hands it back exactly as the archive holds it; it computes no
// statistics, timeline, or difference of its own — those stay exactly where
// 0.8.147/0.8.148/0.8.149 already put them, now simply composed on top of
// this one seam instead of reading a caller-held array directly.
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
// nothing from `application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js`,
// or any other module in this family — it trusts nothing about how a
// decision record was produced beyond what the archive's own strict
// `fromJSON()` already validated (see that file's own
// `validateReconciliationDecisionRecord()`), and never calls 0.8.146,
// 0.8.145, or 0.8.144 to re-derive or double-check anything.
export function reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory(archive) {
    const safeArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();
    return safeArchive.reconciliationDecisionRecords;
}
