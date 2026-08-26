import { PeerSnapshotMaterializationOutcome } from './PeerSnapshotMaterializationOutcome.js';
import { SnapshotPeerMaterializationUiState } from './SnapshotPeerMaterializationUiState.js';

// 0.8.37 — Explicit Peer Snapshot Content Transfer.
//
// application/SnapshotPlacementMaterializationView.js (0.8.35) turns an
// already-computed placement-backed attempt into a flat, UI-ready shape
// without ever calling its own coordinator. This file is the identical
// idea applied to a PEER-backed attempt: pure, read-only, synchronous.
// This file never imports application/
// SnapshotPeerMaterializationCoordinator.js or application/
// MaterializeSnapshotFromPeerUseCase.js, and never itself stores a byte.
//
// THE STRONGEST STATEMENT THIS FILE EVER MAKES: "Snapshot was obtained
// from this peer." Never "verified," "trusted," "authentic," "permanent,"
// or "canonical" — the identical restraint every sibling
// *MaterializationView.js already holds: this sentence describes bytes
// that were requested from one peer and matched the hash this replica
// itself asked for, never a judgment about the peer or the publication
// being trustworthy.
export function describePeerMaterializationAttempt(attempt = null) {
    if (!attempt || (!attempt.requesting && !attempt.outcome && !attempt.error)) {
        return {
            state: SnapshotPeerMaterializationUiState.IDLE,
            requesting: false,
            label: null, message: null, contentReference: null, publicationId: null, contentHash: null
        };
    }

    if (attempt.requesting) {
        return {
            state: SnapshotPeerMaterializationUiState.REQUESTING,
            requesting: true,
            label: 'Requesting…', message: null, contentReference: null, publicationId: null, contentHash: null
        };
    }

    // A caller contract violation (no peer selected) made application/
    // SnapshotPeerMaterializationCoordinator.js#materialize() itself
    // throw — no peer was ever asked. Shares UNAVAILABLE's state and
    // coloring, exactly mirroring every sibling *MaterializationView.js's
    // own identical treatment of a local error.
    if (attempt.error) {
        return {
            state: SnapshotPeerMaterializationUiState.UNAVAILABLE,
            requesting: false,
            label: 'Snapshot was not obtained',
            message: attempt.error,
            contentReference: null, publicationId: null, contentHash: null
        };
    }

    switch (attempt.outcome) {
        case PeerSnapshotMaterializationOutcome.STORED:
            return {
                state: SnapshotPeerMaterializationUiState.STORED,
                requesting: false,
                label: 'Obtained',
                message: attempt.publicationKnown
                    ? 'Snapshot was obtained from the selected peer and matches its own claimed content hash.'
                    : 'Snapshot obtained from the selected peer. The publication is not currently known locally.',
                contentReference: attempt.contentReference, publicationId: attempt.publicationId, contentHash: attempt.contentHash
            };
        case PeerSnapshotMaterializationOutcome.ALREADY_AVAILABLE:
            return {
                state: SnapshotPeerMaterializationUiState.ALREADY_AVAILABLE,
                requesting: false,
                label: 'Already available',
                message: attempt.publicationKnown
                    ? 'The snapshot is already present locally.'
                    : 'The snapshot is already present locally. The publication is not currently known locally.',
                contentReference: attempt.contentReference, publicationId: attempt.publicationId, contentHash: attempt.contentHash
            };
        case PeerSnapshotMaterializationOutcome.UNAVAILABLE:
            return {
                state: SnapshotPeerMaterializationUiState.UNAVAILABLE,
                requesting: false,
                label: 'Not available right now',
                message: attempt.reason || 'The selected peer did not respond with verified content; nothing was obtained.',
                contentReference: null, publicationId: attempt.publicationId, contentHash: attempt.contentHash
            };
        case PeerSnapshotMaterializationOutcome.HASH_MISMATCH:
            return {
                state: SnapshotPeerMaterializationUiState.HASH_MISMATCH,
                requesting: false,
                label: 'Rejected',
                message: "The selected peer's bytes do not match this snapshot's own claimed content hash. Nothing was stored.",
                contentReference: null, publicationId: attempt.publicationId, contentHash: attempt.contentHash
            };
        default:
            return {
                state: SnapshotPeerMaterializationUiState.IDLE,
                requesting: false,
                label: null, message: null, contentReference: null, publicationId: null, contentHash: null
            };
    }
}

// A short label for the button itself — deliberately separate from
// `describePeerMaterializationAttempt()`'s own `label`/`message`, which
// describe the RESULT of the most recent attempt, not the action a person
// is about to take. Mirrors application/
// SnapshotPlacementMaterializationView.js#describePlacementMaterializationButtonLabel()'s
// own "Materialize"/"Materialize Again" shape: a peer's own present
// possession can change between attempts, so a second click meaningfully
// means "ask again, and keep the bytes this time if it works."
export function describePeerMaterializationButtonLabel({ requesting = false, materialized = false } = {}) {
    if (requesting) return 'Requesting…';
    return materialized ? 'Get Snapshot from Peer Again' : 'Get Snapshot from Peer';
}
