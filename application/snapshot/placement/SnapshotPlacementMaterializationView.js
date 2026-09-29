import { SnapshotPlacementMaterializationOutcome } from './SnapshotPlacementMaterializationOutcome.js';
import { SnapshotPlacementMaterializationUiState } from './SnapshotPlacementMaterializationUiState.js';
import { message } from '../../../core/Message.js';

// 0.8.35 — Explicit Placement-Backed Snapshot Materialization.
//
// application/snapshot/materialization/SnapshotContentMaterializationView.js (0.8.34) turns an
// already-computed offline-package import attempt into a flat, UI-ready
// shape without ever calling its own coordinator. This file is the
// identical idea applied to a PLACEMENT-backed attempt — whatever
// ui/views/DecentralizedPublicationsView.js's own click handler obtained
// from application/snapshot/placement/SnapshotPlacementMaterializationCoordinator.js#
// materialize(), or the fact that no attempt has been made yet for THIS
// placement — into one flat, precise, presentation-only shape. Pure and
// read-only: this file never imports application/
// SnapshotPlacementMaterializationCoordinator.js or application/
// MaterializeSnapshotFromPlacementUseCase.js, and never itself stores a
// byte.
//
// THE STRONGEST STATEMENT THIS FILE EVER MAKES: "Snapshot was
// materialized from this placement." Never "verified," "trusted,"
// "authentic," "permanent," or "canonical" — the identical restraint
// application/snapshot/materialization/SnapshotContentMaterializationView.js's own header already
// holds one axis over, for the identical reason: this sentence describes
// bytes that were retrieved from a locator and matched the hash that
// locator's own signed claim named, never a judgment about the
// publication itself being trustworthy.
//
// `publicationKnown` — carried through unchanged from application/
// MaterializeSnapshotFromPlacementUseCase.js's own result — decides which
// of two equally true sentences is shown for a successful materialization,
// never whether the materialization itself succeeds, mirroring the
// identical invariant application/snapshot/materialization/SnapshotContentMaterializationView.js
// already preserves for the offline-package path.
export function describePlacementMaterializationAttempt(attempt = null) {
    if (!attempt || (!attempt.materializing && !attempt.outcome && !attempt.error)) {
        return {
            state: SnapshotPlacementMaterializationUiState.IDLE,
            materializing: false,
            label: null, message: null, contentReference: null, placementId: null, publicationId: null
        };
    }

    if (attempt.materializing) {
        return {
            state: SnapshotPlacementMaterializationUiState.MATERIALIZING,
            materializing: true,
            label: message('placementMaterialization.materializing'), message: null, contentReference: null, placementId: null, publicationId: null
        };
    }

    // A caller contract violation (a non-placement argument) made
    // application/snapshot/placement/SnapshotPlacementMaterializationCoordinator.js#
    // materialize() itself throw — no placement was ever asked about.
    // Shares UNAVAILABLE's state and coloring, exactly mirroring
    // application/snapshot/materialization/SnapshotContentMaterializationView.js's own identical
    // treatment of a local error one axis over.
    if (attempt.error) {
        return {
            state: SnapshotPlacementMaterializationUiState.UNAVAILABLE,
            materializing: false,
            label: message('placementMaterialization.snapshotWasNotMaterialized'),
            message: attempt.error,
            contentReference: null, placementId: null, publicationId: null
        };
    }

    switch (attempt.outcome) {
        case SnapshotPlacementMaterializationOutcome.STORED:
            return {
                state: SnapshotPlacementMaterializationUiState.STORED,
                materializing: false,
                label: message('placementMaterialization.materialized'),
                message: attempt.publicationKnown
                    ? message('placementMaterialization.snapshotWasMaterializedFromThis')
                    : message('placementMaterialization.snapshotMaterializedFromThisPlacement'),
                contentReference: attempt.contentReference, placementId: attempt.placementId, publicationId: attempt.publicationId
            };
        case SnapshotPlacementMaterializationOutcome.ALREADY_AVAILABLE:
            return {
                state: SnapshotPlacementMaterializationUiState.ALREADY_AVAILABLE,
                materializing: false,
                label: message('placementMaterialization.alreadyAvailable'),
                message: attempt.publicationKnown
                    ? message('placementMaterialization.theSnapshotIsAlreadyPresent')
                    : message('placementMaterialization.theSnapshotIsAlreadyPresent2'),
                contentReference: attempt.contentReference, placementId: attempt.placementId, publicationId: attempt.publicationId
            };
        case SnapshotPlacementMaterializationOutcome.UNAVAILABLE:
            return {
                state: SnapshotPlacementMaterializationUiState.UNAVAILABLE,
                materializing: false,
                label: message('placementMaterialization.notAvailableRightNow'),
                message: attempt.reason || message('placementMaterialization.couldNotResolve'),
                contentReference: null, placementId: attempt.placementId, publicationId: attempt.publicationId
            };
        case SnapshotPlacementMaterializationOutcome.HASH_MISMATCH:
            return {
                state: SnapshotPlacementMaterializationUiState.HASH_MISMATCH,
                materializing: false,
                label: message('placementMaterialization.rejected'),
                message: message('placementMaterialization.theRetrievedBytesDoNot'),
                contentReference: null, placementId: attempt.placementId, publicationId: attempt.publicationId
            };
        case SnapshotPlacementMaterializationOutcome.INVALID_PLACEMENT:
            return {
                state: SnapshotPlacementMaterializationUiState.INVALID_PLACEMENT,
                materializing: false,
                label: message('placementMaterialization.invalidPlacement'),
                message: attempt.reason || message('placementMaterialization.notValidlySigned'),
                contentReference: null, placementId: attempt.placementId, publicationId: attempt.publicationId
            };
        default:
            return {
                state: SnapshotPlacementMaterializationUiState.IDLE,
                materializing: false,
                label: null, message: null, contentReference: null, placementId: null, publicationId: null
            };
    }
}

// A short label for the button itself — deliberately separate from
// `describePlacementMaterializationAttempt()`'s own `label`/`message`,
// which describe the RESULT of the most recent attempt, not the action a
// person is about to take. Unlike application/
// SnapshotContentMaterializationView.js#describeMaterializationButtonLabel()
// (always "Import Snapshot" again), this mirrors application/
// SnapshotPlacementView.js's own "Resolve Snapshot"/"Resolve Again" shape
// one axis over: a placement's own present availability can change
// between attempts (0.8.20/0.8.26), so a second click meaningfully means
// "check again, and keep the bytes this time if it works."
export function describePlacementMaterializationButtonLabel({ materializing = false, materialized = false } = {}) {
    if (materializing) return message('placementMaterialization.materializing');
    return materialized ? message('placementMaterialization.materializeAgain') : message('placementMaterialization.materializeSnapshot');
}
