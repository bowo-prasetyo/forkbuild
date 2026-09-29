import { PublicationKnowledgeSynchronizationUiState } from './PublicationKnowledgeSynchronizationUiState.js';
import { message } from '../../../core/Message.js';

// 0.8.30 — Explicit Replica Knowledge Synchronization.
//
// application/publication/evidence/PublicationEvidenceDiscoveryView.js#
// describeEvidenceDiscoveryAttempt() (0.8.16) turns an already-computed
// discovery attempt into one flat, presentation-only shape without ever
// triggering discovery itself. This file is the identical idea applied
// to application/publication/evidence/PublicationKnowledgeSynchronizationCoordinator.js#
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
            label: message('knowledgeSync.askingPeers'), message: null,
            newAnchorCount: null, alreadyKnownAnchorCount: null,
            newPlacementCount: null, alreadyKnownPlacementCount: null
        };
    }

    // A thrown error (a local precondition failure — never something
    // this file can distinguish from "nothing could be asked") reads to
    // a person exactly like "the operation could not complete" — see
    // application/publication/evidence/PublicationKnowledgeSynchronizationUiState.js's own
    // header on why UNAVAILABLE is never confused with "no claims
    // exist."
    if (attempt.error) {
        return {
            state: PublicationKnowledgeSynchronizationUiState.UNAVAILABLE,
            label: message('knowledgeSync.synchronizationUnavailable'),
            message: message('knowledgeSync.theRequestedPeerSynchronizationCould'),
            newAnchorCount: null, alreadyKnownAnchorCount: null,
            newPlacementCount: null, alreadyKnownPlacementCount: null
        };
    }

    const { attemptedPeers, anchors, placements } = attempt.result;
    if (!attemptedPeers || attemptedPeers.length === 0) {
        return {
            state: PublicationKnowledgeSynchronizationUiState.UNAVAILABLE,
            label: message('knowledgeSync.synchronizationUnavailable'),
            message: message('knowledgeSync.noAuthenticatedPeerWasAvailable'),
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
            label: message('knowledgeSync.newClaimsReceived'),
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
        label: message('knowledgeSync.noNewClaims'),
        message: message('knowledgeSync.noNewClaimsKnown', { count: totalAlreadyKnownCount }),
        newAnchorCount: 0, alreadyKnownAnchorCount, newPlacementCount: 0, alreadyKnownPlacementCount
    };
}

// One whole message per combination, so each language words "and" its own way.
function describeNewClaimsMessage(newAnchorCount, newPlacementCount) {
    const anchors = message('knowledgeSync.newAnchors', { count: newAnchorCount });
    const placements = message('knowledgeSync.newPlacements', { count: newPlacementCount });
    if (newAnchorCount > 0 && newPlacementCount > 0) {
        return message('knowledgeSync.receivedBoth', { anchors, placements });
    }
    return message('knowledgeSync.received', { claims: newAnchorCount > 0 ? anchors : placements });
}

// A short label for the button itself — deliberately separate from
// describeSynchronizationAttempt()'s own `message`, which describes the
// RESULT of the most recent attempt, not the action a person is about to
// take. Mirrors application/publication/evidence/PublicationEvidenceDiscoveryView.js#
// describeDiscoveryButtonLabel()'s own shape exactly.
export function describeSynchronizationButtonLabel({ synchronizing = false, hasSynchronized = false } = {}) {
    if (synchronizing) return message('knowledgeSync.askingPeers2');
    return hasSynchronized ? message('knowledgeSync.synchronizeAgain') : message('knowledgeSync.synchronizeWithPeers');
}
