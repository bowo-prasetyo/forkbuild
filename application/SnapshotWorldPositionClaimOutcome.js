// 0.9.172 — Decentralized Snapshot Position Claim Consumption.
//
// Names the three outcomes `application/SnapshotWorldPositionClaim.js#resolveSnapshotWorldPositionClaim()`
// can produce — the identical "as small as possible, name the difference
// structurally" restraint `application/SnapshotWorldPlacementOutcome.js`
// (0.9.159) and `application/SnapshotPublicationAttributionOutcome.js`
// (0.9.143) already hold, one seam over: a self-declared position claim
// (`core/SnapshotDiscoveryEnvelope.js`'s own optional `publicationId`/
// `claimedPosition`, 0.9.171) is either absent, bound to a DIFFERENT
// Publication than the one being placed, or genuinely bound to THIS one.
export const SnapshotWorldPositionClaimOutcome = Object.freeze({
    // The selected candidate carried a `publicationId`/`claimedPosition`
    // pair, AND `candidate.publicationId` equals the target Publication's
    // own `id` — the one condition under which a claim may be considered
    // for that Publication. `resolveSnapshotWorldPositionClaim()`'s own
    // `position` field is populated only here.
    CLAIMED: 'claimed',
    // The selected candidate carried neither `publicationId` nor
    // `claimedPosition` at all — every announcement made before 0.9.171,
    // and every one that still omits a position claim. Never treated as an
    // error: the absence of a claim means only "no decentralized position
    // was supplied," nothing more — see application/
    // SnapshotWorldPositionClaim.js's own header.
    ABSENT: 'absent',
    // The selected candidate carried a `publicationId`/`claimedPosition`
    // pair, but `candidate.publicationId` names a DIFFERENT Publication
    // than the one being placed — the exact ambiguity a shared contentHash
    // across two Publications (0.9.163's own collision) would otherwise
    // create. The claim is never consumed; `position` is `null`, exactly
    // as on ABSENT.
    MISMATCHED: 'mismatched'
});
