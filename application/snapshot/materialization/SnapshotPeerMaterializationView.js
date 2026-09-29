import { PeerSnapshotMaterializationOutcome } from './PeerSnapshotMaterializationOutcome.js';
import { SnapshotPeerMaterializationUiState } from './SnapshotPeerMaterializationUiState.js';
import { message } from '../../../core/Message.js';

// 0.8.37 — Explicit Peer Snapshot Content Transfer.
//
// application/snapshot/placement/SnapshotPlacementMaterializationView.js (0.8.35) turns an
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
            label: message('peerMaterialization.requesting'), message: null, contentReference: null, publicationId: null, contentHash: null
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
            label: message('peerMaterialization.snapshotWasNotObtained'),
            message: attempt.error,
            contentReference: null, publicationId: null, contentHash: null
        };
    }

    switch (attempt.outcome) {
        case PeerSnapshotMaterializationOutcome.STORED:
            return {
                state: SnapshotPeerMaterializationUiState.STORED,
                requesting: false,
                label: message('peerMaterialization.obtained'),
                message: attempt.publicationKnown
                    ? message('peerMaterialization.snapshotWasObtainedFromThe')
                    : message('peerMaterialization.snapshotObtainedFromTheSelected'),
                contentReference: attempt.contentReference, publicationId: attempt.publicationId, contentHash: attempt.contentHash
            };
        case PeerSnapshotMaterializationOutcome.ALREADY_AVAILABLE:
            return {
                state: SnapshotPeerMaterializationUiState.ALREADY_AVAILABLE,
                requesting: false,
                label: message('peerMaterialization.alreadyAvailable'),
                message: attempt.publicationKnown
                    ? message('peerMaterialization.theSnapshotIsAlreadyPresent')
                    : message('peerMaterialization.theSnapshotIsAlreadyPresent2'),
                contentReference: attempt.contentReference, publicationId: attempt.publicationId, contentHash: attempt.contentHash
            };
        case PeerSnapshotMaterializationOutcome.UNAVAILABLE:
            return {
                state: SnapshotPeerMaterializationUiState.UNAVAILABLE,
                requesting: false,
                label: message('peerMaterialization.notAvailableRightNow'),
                message: attempt.reason || message('peerMaterialization.noVerifiedContent'),
                contentReference: null, publicationId: attempt.publicationId, contentHash: attempt.contentHash
            };
        case PeerSnapshotMaterializationOutcome.HASH_MISMATCH:
            return {
                state: SnapshotPeerMaterializationUiState.HASH_MISMATCH,
                requesting: false,
                label: message('peerMaterialization.rejected'),
                message: message('peerMaterialization.theSelectedPeerSBytes'),
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
    if (requesting) return message('peerMaterialization.requesting');
    return materialized ? message('peerMaterialization.getSnapshotFromPeerAgain') : message('peerMaterialization.getSnapshotFromPeer');
}
