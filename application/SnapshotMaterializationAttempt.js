import { SnapshotMaterializationSourceKind } from './SnapshotMaterializationSourceKind.js';

// 0.8.36 — Unified Explicit Snapshot Materialization Sources.
// 0.8.38 — Snapshot Materialization History & Source Inspection: adds
// `observedAt`, so a SEQUENCE of these records can be told apart by when
// each happened — see this file's own update below. Nothing about the
// four fields 0.8.36 already established changes.
//
// application/SnapshotPlacementResolutionObservation.js (0.8.20) names the
// FACT that one resolution call happened, at a particular time, for a
// particular placement. This file is the identical idea one layer over,
// for a MATERIALIZATION call — one explicit "Import Snapshot",
// "Materialize Snapshot", or "Get Snapshot from Peer" click that reached
// application/StoreSnapshotContentUseCase.js:
//
//   { source: { kind }, outcome, contentReference, publicationId,
//     contentHash, observedAt }
//
// `source.kind` — one of application/SnapshotMaterializationSourceKind.js's
// three values, naming WHICH explicit action produced this attempt.
// `outcome` — one of application/StoreSnapshotContentOutcome.js's three
// values, copied verbatim from whatever application/
// StoreSnapshotContentUseCase.js#execute() resolved to (or, for a
// HASH_MISMATCH/UNAVAILABLE/INVALID_PLACEMENT-shaped failure the shared
// boundary never even reached, whatever the caller's own outer outcome
// maps onto that shared vocabulary — see application/
// ImportPublicationSnapshotTransferPackageUseCase.js and application/
// MaterializeSnapshotFromPlacementUseCase.js, each of which already builds
// one of these before returning). This file never re-derives, re-checks,
// or re-verifies anything either of those already decided.
// `observedAt` — THIS REPLICA's own local clock at the moment this record
// was created, mirroring application/
// SnapshotPlacementResolutionObservation.js's own `observedAt` field
// exactly. Never anything a package, a placement, or a peer reported —
// see that file's own header on why an acquisition-side timestamp is
// always a purely local fact.
//
// NEVER PERSISTED, NEVER SHARED — the identical restraint application/
// SnapshotPlacementResolutionObservation.js's own header already holds one
// axis over. This record is never written onto a core/
// DecentralizedPublication.js, a core/PublicationSnapshotPlacement.js, an
// application/LocalPlacementKnowledgeStore.js entry, a convergence result,
// a replica synchronization, or an application/PublicationReplicaPackage.js
// — it lives only in whatever ephemeral component state ui/views/
// DecentralizedPublicationsView.js keeps for the lifetime of the page,
// exactly like `entry.materializationAttempt` (0.8.34) and
// `entry.materializations` (0.8.35) before it. Two replicas that
// materialize the identical bytes through two different sources each hold
// their own, entirely separate attempt record — this file has no notion
// of one attempt being more authoritative than another. See docs/
// Principles.md, "A Shared Storage Boundary Does Not Merge The Sources
// That Feed It (0.8.36)" and "Materialization History Describes Byte
// Acquisition, Not Source Trust (0.8.38)."
export function createSnapshotMaterializationAttempt({
    sourceKind, outcome, contentReference = null, publicationId = null, contentHash = null, observedAt = new Date()
} = {}) {
    if (!sourceKind || !Object.values(SnapshotMaterializationSourceKind).includes(sourceKind)) {
        throw new Error('createSnapshotMaterializationAttempt: a valid SnapshotMaterializationSourceKind is required');
    }
    if (!outcome || typeof outcome !== 'string') {
        throw new Error('createSnapshotMaterializationAttempt: an outcome is required');
    }
    const observedAtDate = observedAt instanceof Date ? observedAt : new Date(observedAt);
    if (Number.isNaN(observedAtDate.getTime())) {
        throw new Error('createSnapshotMaterializationAttempt: observedAt must be a valid date');
    }
    return Object.freeze({
        source: Object.freeze({ kind: sourceKind }),
        outcome,
        contentReference: contentReference || null,
        publicationId: publicationId || null,
        contentHash: contentHash || null,
        observedAt: observedAtDate
    });
}
