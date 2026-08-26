import { SnapshotMaterializationSourceKind } from './SnapshotMaterializationSourceKind.js';

// 0.8.36 — Unified Explicit Snapshot Materialization Sources.
//
// application/SnapshotPlacementResolutionObservation.js (0.8.20) names the
// FACT that one resolution call happened, at a particular time, for a
// particular placement. This file is the identical idea one layer over,
// for a MATERIALIZATION call — one explicit "Import Snapshot" or
// "Materialize Snapshot" click that reached application/
// StoreSnapshotContentUseCase.js:
//
//   { source: { kind }, outcome, contentReference, publicationId,
//     contentHash }
//
// `source.kind` — one of application/SnapshotMaterializationSourceKind.js's
// two values, naming WHICH explicit action produced this attempt.
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
// That Feed It (0.8.36)."
export function createSnapshotMaterializationAttempt({
    sourceKind, outcome, contentReference = null, publicationId = null, contentHash = null
} = {}) {
    if (!sourceKind || !Object.values(SnapshotMaterializationSourceKind).includes(sourceKind)) {
        throw new Error('createSnapshotMaterializationAttempt: a valid SnapshotMaterializationSourceKind is required');
    }
    if (!outcome || typeof outcome !== 'string') {
        throw new Error('createSnapshotMaterializationAttempt: an outcome is required');
    }
    return Object.freeze({
        source: Object.freeze({ kind: sourceKind }),
        outcome,
        contentReference: contentReference || null,
        publicationId: publicationId || null,
        contentHash: contentHash || null
    });
}
