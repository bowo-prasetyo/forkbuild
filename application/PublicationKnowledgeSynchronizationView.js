import { PublicationKnowledgeSynchronizationUiState } from './PublicationKnowledgeSynchronizationUiState.js';

// 0.8.30 — Explicit Replica Knowledge Synchronization.
//
// application/PublicationEvidenceDiscoveryView.js#
// describeEvidenceDiscoveryAttempt() (0.8.16) turns an already-computed
// discovery attempt into one flat, presentation-only shape without ever
// triggering discovery itself. This file is the identical idea applied
// to application/PublicationKnowledgeSynchronizationCoordinator.js#
// synchronize()'s own two-dimensional result. Pure and read-only: this
// file never imports that coordinator and never itself contacts a peer.
//
// `attempt` is `null`/absent (IDLE), `{ synchronizing: true }` (in
// flight), `{ error }` (the synchronize() call itself threw), or
// `{ result }` — application/
// PublicationKnowledgeSynchronizationCoordinator.js#synchronize()'s own
// resolved shape — once one has completed.
export function describeSynchronizationAttempt(attempt = null) {
    if (!attempt || (!attempt.synchronizing && !attempt.result && !attempt.error)) {
        return {
            state: PublicationKnowledgeSynchronizationUiState.IDLE,
            label: null, message: null,
            newAnchorCount: null, alreadyKnownAnchorCount: null,
            newPlacementCount: null, alreadyKnownPlacementCount: null
        };
    }

    if (attempt.synchronizing) {
        return {
            state: PublicationKnowledgeSynchronizationUiState.SYNCHRONIZING,
            label: 'Asking peers…', message: null,
            newAnchorCount: null, alreadyKnownAnchorCount: null,
            newPlacementCount: null, alreadyKnownPlacementCount: null
        };
    }

    // A thrown error (a local precondition failure — never something
    // this file can distinguish from "nothing could be asked") reads to
    // a person exactly like "the operation could not complete" — see
    // application/PublicationKnowledgeSynchronizationUiState.js's own
    // header on why UNAVAILABLE is never confused with "no claims
    // exist."
    if (attempt.error) {
        return {
            state: PublicationKnowledgeSynchronizationUiState.UNAVAILABLE,
            label: 'Synchronization unavailable',
            message: 'The requested peer synchronization could not complete.',
            newAnchorCount: null, alreadyKnownAnchorCount: null,
            newPlacementCount: null, alreadyKnownPlacementCount: null
        };
    }

    const { attemptedPeers, anchors, placements } = attempt.result;
    if (!attemptedPeers || attemptedPeers.length === 0) {
        return {
            state: PublicationKnowledgeSynchronizationUiState.UNAVAILABLE,
            label: 'Synchronization unavailable',
            message: 'No authenticated peer was available to ask.',
            newAnchorCount: 0, alreadyKnownAnchorCount: 0,
            newPlacementCount: 0, alreadyKnownPlacementCount: 0
        };
    }

    const newAnchorCount = anchors.newlyImportedCount;
    const alreadyKnownAnchorCount = anchors.alreadyKnownCount;
    const newPlacementCount = placements.newlyImportedCount;
    const alreadyKnownPlacementCount = placements.alreadyKnownCount;
    const totalNewCount = newAnchorCount + newPlacementCount;
    const totalAlreadyKnownCount = alreadyKnownAnchorCount + alreadyKnownPlacementCount;

    if (totalNewCount > 0) {
        return {
            state: PublicationKnowledgeSynchronizationUiState.SYNCHRONIZED,
            label: 'New claims received',
            message: describeNewClaimsMessage(newAnchorCount, newPlacementCount),
            newAnchorCount, alreadyKnownAnchorCount, newPlacementCount, alreadyKnownPlacementCount
        };
    }

    // Deliberately worded as "no NEW claims" — never "no claims exist."
    // Peers were asked, and answered, but offered nothing this replica
    // did not already have; that says nothing about whether more
    // anchors or placements exist somewhere this replica did not ask.
    return {
        state: PublicationKnowledgeSynchronizationUiState.NO_NEW_CLAIMS,
        label: 'No new claims',
        message: `No new claims received from peers (${totalAlreadyKnownCount} already known).`,
        newAnchorCount: 0, alreadyKnownAnchorCount, newPlacementCount: 0, alreadyKnownPlacementCount
    };
}

function describeNewClaimsMessage(newAnchorCount, newPlacementCount) {
    const parts = [];
    if (newAnchorCount > 0) {
        parts.push(`${newAnchorCount} new anchor${newAnchorCount === 1 ? '' : 's'}`);
    }
    if (newPlacementCount > 0) {
        parts.push(`${newPlacementCount} new placement${newPlacementCount === 1 ? '' : 's'}`);
    }
    return `${parts.join(' and ')} received from peers.`;
}

// A short label for the button itself — deliberately separate from
// describeSynchronizationAttempt()'s own `message`, which describes the
// RESULT of the most recent attempt, not the action a person is about to
// take. Mirrors application/PublicationEvidenceDiscoveryView.js#
// describeDiscoveryButtonLabel()'s own shape exactly.
export function describeSynchronizationButtonLabel({ synchronizing = false, hasSynchronized = false } = {}) {
    if (synchronizing) return 'Asking Peers…';
    return hasSynchronized ? 'Synchronize Again' : 'Synchronize with Peers';
}
