import { SnapshotPeerPossessionState } from './SnapshotPeerPossessionState.js';
import { SnapshotPeerPossessionUiState } from './SnapshotPeerPossessionUiState.js';
import { message } from '../../../core/Message.js';

// 0.8.40 — Snapshot Possession Observation Exchange.
//
// application/snapshot/materialization/SnapshotPeerMaterializationView.js (0.8.37) turns an
// already-computed peer-materialization attempt into a flat, UI-ready
// shape without ever calling its own coordinator. This file is the
// identical idea applied to a possession OBSERVATION: pure, read-only,
// synchronous. Never imports application/
// SnapshotPeerPossessionCoordinator.js or application/
// ObservePeerSnapshotPossessionUseCase.js, and never itself sends a
// message.
//
// THE STRONGEST STATEMENT THIS FILE EVER MAKES: "Peer reports snapshot
// available." Never "Peer has a verified copy," never "Peer is a reliable
// source," never "verified," "trusted," or "authentic" — the wording is
// deliberately a REPORT about what the peer SAID, at the moment it was
// asked, never a judgment about the peer, and never a promise that a
// subsequent "Get Snapshot from Peer" against the same peer will succeed.
// See docs/Principles.md, "Peer Possession Responses Are Observations, Not
// Placement Claims (0.8.40)."
export function describePeerPossessionAttempt(attempt = null) {
    if (!attempt || (!attempt.checking && !attempt.state && !attempt.error)) {
        return {
            state: SnapshotPeerPossessionUiState.IDLE,
            checking: false,
            label: null, message: null, peerId: null, publicationId: null, contentHash: null, observedAt: null
        };
    }

    if (attempt.checking) {
        return {
            state: SnapshotPeerPossessionUiState.CHECKING,
            checking: true,
            label: message('snapshotPossession.checking'), message: null, peerId: null, publicationId: null, contentHash: null, observedAt: null
        };
    }

    // A caller contract violation (no peer selected) made application/
    // SnapshotPeerPossessionCoordinator.js#observe() itself throw — no peer
    // was ever asked. Shares UNAVAILABLE's state and coloring, exactly
    // mirroring every sibling *MaterializationView.js's own identical
    // treatment of a local error.
    if (attempt.error) {
        return {
            state: SnapshotPeerPossessionUiState.UNAVAILABLE,
            checking: false,
            label: message('snapshotPossession.noAnswerFromPeer'),
            message: attempt.error,
            peerId: null, publicationId: null, contentHash: null, observedAt: null
        };
    }

    switch (attempt.state) {
        case SnapshotPeerPossessionState.AVAILABLE:
            return {
                state: SnapshotPeerPossessionUiState.AVAILABLE,
                checking: false,
                label: message('snapshotPossession.peerReportsSnapshotAvailable'),
                message: message('snapshotPossession.theSelectedPeerAnsweredThat'),
                peerId: attempt.peerId, publicationId: attempt.publicationId, contentHash: attempt.contentHash, observedAt: attempt.observedAt
            };
        case SnapshotPeerPossessionState.NOT_AVAILABLE:
            return {
                state: SnapshotPeerPossessionUiState.NOT_AVAILABLE,
                checking: false,
                label: message('snapshotPossession.peerReportsSnapshotNotAvailable'),
                message: message('snapshotPossession.theSelectedPeerAnsweredThat2'),
                peerId: attempt.peerId, publicationId: attempt.publicationId, contentHash: attempt.contentHash, observedAt: attempt.observedAt
            };
        case SnapshotPeerPossessionState.UNAVAILABLE:
            return {
                state: SnapshotPeerPossessionUiState.UNAVAILABLE,
                checking: false,
                label: message('snapshotPossession.noAnswerFromPeer'),
                message: message('snapshotPossession.theSelectedPeerDidNot'),
                peerId: attempt.peerId, publicationId: attempt.publicationId, contentHash: attempt.contentHash, observedAt: attempt.observedAt
            };
        default:
            return {
                state: SnapshotPeerPossessionUiState.IDLE,
                checking: false,
                label: null, message: null, peerId: null, publicationId: null, contentHash: null, observedAt: null
            };
    }
}

// A short label for the button itself — deliberately separate from
// `describePeerPossessionAttempt()`'s own `label`/`message`, which describe
// the RESULT of the most recent attempt, not the action a person is about
// to take. A peer's own present possession can change between checks, so a
// second click meaningfully means "ask again."
export function describePeerPossessionButtonLabel({ checking = false, checked = false } = {}) {
    if (checking) return message('snapshotPossession.checking');
    return checked ? message('snapshotPossession.checkWithPeerAgain') : message('snapshotPossession.checkWithPeer');
}
