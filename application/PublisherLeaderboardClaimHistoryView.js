import { LeaderboardClaimRecord } from './LeaderboardClaimRecord.js';

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
