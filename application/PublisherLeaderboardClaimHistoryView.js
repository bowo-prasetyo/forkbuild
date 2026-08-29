import { LeaderboardClaimRecord } from './LeaderboardClaimRecord.js';
import { PublicationObservationArchive } from './PublicationObservationArchive.js';

// 0.8.123 — Signed Leaderboard Claim Archive: the narration layer.
//
// The presentation counterpart of `application/LeaderboardClaimHistory.js`
// — mirroring `application/PublicationReferenceRecordHistoryView.js`
// (0.8.104) exactly, one relationship over:
//
//   describePublisherLeaderboardClaimHistoryEntry(record)
//     -> { id, signerIdentityId, evidenceFingerprint, policyVersion,
//          snapshotFingerprint, createdAt, receivedAt, origin }
//
//   describePublisherLeaderboardClaimHistory(history)
//     -> { claimCount, claims: [...] }, in the SAME order `history` itself
//        holds them — oldest received first, never sorted, grouped, or
//        ranked.
//
// INTENTIONALLY FACTUAL — THE ONE RULE THIS FILE EXISTS TO ENFORCE. No
// `trusted`, `valid`, `current`, `authoritative`, `verified`, `score`,
// `rank`, `matches`, or any other conclusion is persisted or presented by
// this layer — see `application/LeaderboardClaimRecord.js`'s own header,
// "A Receipt, Never A Verdict." `application/PublisherLeaderboardSnapshotClaimVerification.js`
// (0.8.121, UNCHANGED) remains the ONLY authority for the question it was
// designed to answer — whether a signature is valid, and whether a
// claim's fingerprints agree with a particular replica's own reconstructed
// snapshot — and this file never computes, caches, or narrates that
// answer on its behalf. A view built on top of this one that wants to
// show verification results runs 0.8.121's own function itself, per
// claim, as its own separate step; this file supplies the raw material
// for that, never the verdict.
//
// EVERY FIELD IS CARRIED THROUGH UNCHANGED FROM THE RECORD AND ITS OWN
// CLAIM — NEVER RE-DERIVED. `signerIdentityId`, `evidenceFingerprint`,
// `policyVersion`, `snapshotFingerprint`, and `createdAt` are exactly
// `record.claim`'s own getters; `receivedAt` and `origin` are exactly
// `record`'s own getters — the identical "identity, narrated, never
// scored" restraint `application/PublicationReferenceRecordHistoryView.js`'s
// own header already holds, held here again one relationship over. `id`
// is the claim's own `id` (never a synthetic record identifier of this
// file's own invention), included so a caller can tell two records
// carrying otherwise-identical fingerprints apart, or recognize the
// SAME claim arriving a second time — without this file drawing any
// conclusion about what a repeat arrival means.
//
// PURE AND STATELESS. No constructor, no injected collaborator, no
// network access, no read of `application/PublicationObservationArchive.js`
// or any other archive. Calling either function twice with byte-identical
// arguments returns a byte-identical result.
export function describePublisherLeaderboardClaimHistoryEntry(record) {
    if (!(record instanceof LeaderboardClaimRecord)) return null;
    const claim = record.claim;
    return Object.freeze({
        id: claim.id,
        signerIdentityId: claim.signerIdentityId,
        evidenceFingerprint: claim.evidenceFingerprint,
        policyVersion: claim.policyVersion,
        snapshotFingerprint: claim.snapshotFingerprint,
        createdAt: claim.createdAt,
        receivedAt: record.receivedAt,
        origin: record.origin
    });
}

export function describePublisherLeaderboardClaimHistory(history) {
    const claims = (Array.isArray(history) ? history : [])
        .map((record) => describePublisherLeaderboardClaimHistoryEntry(record))
        .filter((entry) => entry !== null);
    return Object.freeze({ claimCount: claims.length, claims: Object.freeze(claims) });
}

// 0.8.130 — reconstructPublisherLeaderboardClaimHistory(): THE ONE,
// archive-reading extraction boundary. `LeaderboardClaimHistory` (0.8.123)
// is, and remains, exactly what every file in this family already calls it
// — "the plain, in-memory array of `LeaderboardClaimRecord`." Before this
// milestone it was a caller-held array with nowhere durable to live; now
// application/PublicationObservationArchive.js's own `leaderboardClaimRecords`
// collection (0.8.130) IS that durable home. This function is the single
// seam between the two: it reads `archive.leaderboardClaimRecords` and
// returns it UNCHANGED — the exact array every downstream projection in
// this family (`PublisherLeaderboardClaimHistoryDifference.js`,
// `PublisherLeaderboardClaimHistoryStatisticsView.js`,
// `PublisherLeaderboardClaimHistoryTimelineView.js`) already expects, so
// composing further from it requires no second extraction anywhere else —
// see this codebase's own diagram, "only the first function needs to
// understand the archive collection."
//
// DELIBERATELY RETURNS THE RAW ARRAY, NEVER THIS FILE'S OWN NARRATED
// `{ claimCount, claims }` SHAPE. `describePublisherLeaderboardClaimHistory()`
// above is a presentation projection over a `LeaderboardClaimHistory`; this
// function reconstructs the `LeaderboardClaimHistory` itself, one layer
// below that projection — the identical distinction application/
// PublisherLeaderboardSnapshot.js's own `reconstructPublisherLeaderboardSnapshot()`
// already draws relative to whatever narrates a snapshot. A caller wanting
// the narrated view of an archive's own claim history still calls
// `describePublisherLeaderboardClaimHistory(reconstructPublisherLeaderboardClaimHistory(archive))`
// itself, explicitly, exactly as every other reconstruct/describe pair in
// this codebase already composes.
//
// AN INVALID/MISSING `archive` DEGRADES TO AN EMPTY HISTORY, NEVER A
// THROW — the identical tolerance every other `reconstructXxx()` entry
// point in this family already holds.
export function reconstructPublisherLeaderboardClaimHistory(archive) {
    const safeArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();
    return safeArchive.leaderboardClaimRecords;
}
