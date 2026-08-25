// 0.8.20 — Snapshot Placement Inspection & Explicit Resolution UX.
//
// application/SnapshotPlacementResolutionOutcome.js (0.8.18) names what
// one application/SnapshotPlacementResolver.js#resolve() call concluded.
// This file names the FACT that a call happened at all, at a particular
// time, for a particular placement — the placement-side sibling of
// application/PublicationAnchorVerificationObservation.js (0.8.12),
// applied here one milestone earlier in this subsystem's own life,
// since resolution had no UI caller at all before this milestone gave it
// one.
//
// A `SnapshotPlacementResolutionObservation` is a plain, frozen record
// of ONE such call:
//
//   { placementId, outcome, reason, observedAt }
//
// `outcome`/`reason` are copied verbatim from whatever application/
// SnapshotPlacementResolver.js#resolve() resolved to — this file never
// re-derives or re-checks either. `observedAt` is THIS REPLICA's own
// local clock at the moment the observation was created, never anything
// the storage backend reported (a placement has no external system to
// report a time at all — see core/PublicationSnapshotPlacement.js's own
// header on why `placedAt` is honestly just "when the placing identity
// says it did this").
//
// NEVER PERSISTED, NEVER SHARED. This class is created and consumed
// entirely within one replica's own ephemeral UI/session state — it is
// never written to application/
// LocalPublicationSnapshotPlacementCatalog.js, never attached to a
// core/PublicationSnapshotPlacement.js instance, and never carried over
// application/PublicationSnapshotPlacementPeerExchange.js. Two replicas
// that resolve the identical placement at the identical moment, and even
// reach the identical outcome, each hold their own, entirely separate
// observation — this file has no notion of "whose" observation is
// authoritative, because none of them ever is. See docs/Principles.md,
// "Resolving A Placement Observes Present Availability; It Does Not
// Rewrite The Placement Claim (0.8.20)."
export function createResolutionObservation({ placementId, outcome, reason = null, observedAt = new Date() } = {}) {
    if (!placementId || typeof placementId !== 'string' || !placementId.trim()) {
        throw new Error('createResolutionObservation: a placementId is required');
    }
    if (!outcome || typeof outcome !== 'string') {
        throw new Error('createResolutionObservation: an outcome is required');
    }
    const observedAtDate = observedAt instanceof Date ? observedAt : new Date(observedAt);
    if (Number.isNaN(observedAtDate.getTime())) {
        throw new Error('createResolutionObservation: observedAt must be a valid date');
    }
    return Object.freeze({ placementId, outcome, reason: reason || null, observedAt: observedAtDate });
}
