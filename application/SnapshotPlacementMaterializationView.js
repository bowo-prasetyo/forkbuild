import { SnapshotPlacementMaterializationOutcome } from './SnapshotPlacementMaterializationOutcome.js';
import { SnapshotPlacementMaterializationUiState } from './SnapshotPlacementMaterializationUiState.js';

// 0.8.35 — Explicit Placement-Backed Snapshot Materialization.
//
// application/SnapshotContentMaterializationView.js (0.8.34) turns an
// already-computed offline-package import attempt into a flat, UI-ready
// shape without ever calling its own coordinator. This file is the
// identical idea applied to a PLACEMENT-backed attempt — whatever
// ui/views/DecentralizedPublicationsView.js's own click handler obtained
// from application/SnapshotPlacementMaterializationCoordinator.js#
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
// application/SnapshotContentMaterializationView.js's own header already
// holds one axis over, for the identical reason: this sentence describes
// bytes that were retrieved from a locator and matched the hash that
// locator's own signed claim named, never a judgment about the
// publication itself being trustworthy.
//
// `publicationKnown` — carried through unchanged from application/
// MaterializeSnapshotFromPlacementUseCase.js's own result — decides which
// of two equally true sentences is shown for a successful materialization,
// never whether the materialization itself succeeds, mirroring the
// identical invariant application/SnapshotContentMaterializationView.js
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
            label: 'Materializing…', message: null, contentReference: null, placementId: null, publicationId: null
        };
    }

    // A caller contract violation (a non-placement argument) made
    // application/SnapshotPlacementMaterializationCoordinator.js#
    // materialize() itself throw — no placement was ever asked about.
    // Shares UNAVAILABLE's state and coloring, exactly mirroring
    // application/SnapshotContentMaterializationView.js's own identical
    // treatment of a local error one axis over.
    if (attempt.error) {
        return {
            state: SnapshotPlacementMaterializationUiState.UNAVAILABLE,
            materializing: false,
            label: 'Snapshot was not materialized',
            message: attempt.error,
            contentReference: null, placementId: null, publicationId: null
        };
    }

    switch (attempt.outcome) {
        case SnapshotPlacementMaterializationOutcome.STORED:
            return {
                state: SnapshotPlacementMaterializationUiState.STORED,
                materializing: false,
                label: 'Materialized',
                message: attempt.publicationKnown
                    ? 'Snapshot was materialized from this placement and matches its own claimed content hash.'
                    : 'Snapshot materialized from this placement. The publication is not currently known locally.',
                contentReference: attempt.contentReference, placementId: attempt.placementId, publicationId: attempt.publicationId
            };
        case SnapshotPlacementMaterializationOutcome.ALREADY_AVAILABLE:
            return {
                state: SnapshotPlacementMaterializationUiState.ALREADY_AVAILABLE,
                materializing: false,
                label: 'Already available',
                message: attempt.publicationKnown
                    ? 'The snapshot is already present locally.'
                    : 'The snapshot is already present locally. The publication is not currently known locally.',
                contentReference: attempt.contentReference, placementId: attempt.placementId, publicationId: attempt.publicationId
            };
        case SnapshotPlacementMaterializationOutcome.UNAVAILABLE:
            return {
                state: SnapshotPlacementMaterializationUiState.UNAVAILABLE,
                materializing: false,
                label: 'Not available right now',
                message: attempt.reason || 'This placement could not presently be resolved; nothing was materialized.',
                contentReference: null, placementId: attempt.placementId, publicationId: attempt.publicationId
            };
        case SnapshotPlacementMaterializationOutcome.HASH_MISMATCH:
            return {
                state: SnapshotPlacementMaterializationUiState.HASH_MISMATCH,
                materializing: false,
                label: 'Rejected',
                message: "The retrieved bytes do not match this placement's own claimed content hash. Nothing was stored.",
                contentReference: null, placementId: attempt.placementId, publicationId: attempt.publicationId
            };
        case SnapshotPlacementMaterializationOutcome.INVALID_PLACEMENT:
            return {
                state: SnapshotPlacementMaterializationUiState.INVALID_PLACEMENT,
                materializing: false,
                label: 'Invalid placement',
                message: attempt.reason || 'This placement is not a validly signed claim; nothing was materialized.',
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
    if (materializing) return 'Materializing…';
    return materialized ? 'Materialize Again' : 'Materialize Snapshot';
}
