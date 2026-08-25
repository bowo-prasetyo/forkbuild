import { PublicationEvidenceDiscoveryUiState } from './PublicationEvidenceDiscoveryUiState.js';

// 0.8.16 — Evidence Synchronization UX & Explicit Historical Discovery.
//
// application/PublicationAnchorCreationView.js#describeCreationAttempt()
// (0.8.11) turns an already-computed creation attempt into one flat,
// presentation-only shape without ever triggering a creation itself.
// This file is the identical idea applied to discovery: it turns an
// already-computed attempt — whatever ui/views/
// DecentralizedPublicationsView.js's own `discoverFromPeers()` click
// handler obtained from application/
// PublicationEvidenceDiscoveryCoordinator.js#discover(), or the fact
// that no attempt has been made yet — into one flat, precise shape. Pure
// and read-only: this file never imports application/
// PublicationEvidenceDiscoveryCoordinator.js and never itself contacts a
// peer.
//
// `attempt` is `null`/absent (IDLE), `{ discovering: true }` (in
// flight), `{ error }` (the discover() call itself threw), or
// `{ result }` — application/PublicationEvidenceDiscoveryCoordinator.js#
// discover()'s own resolved shape — once one has completed.
export function describeEvidenceDiscoveryAttempt(attempt = null) {
    if (!attempt || (!attempt.discovering && !attempt.result && !attempt.error)) {
        return {
            state: PublicationEvidenceDiscoveryUiState.IDLE,
            label: null, message: null, newlyImportedCount: null, alreadyKnownCount: null
        };
    }

    if (attempt.discovering) {
        return {
            state: PublicationEvidenceDiscoveryUiState.DISCOVERING,
            label: 'Asking peers…', message: null, newlyImportedCount: null, alreadyKnownCount: null
        };
    }

    // A thrown error (a local precondition failure — never something this
    // file can distinguish from "nothing could be asked") reads to a
    // person exactly like "the operation could not complete" — see
    // application/PublicationEvidenceDiscoveryUiState.js's own header on
    // why UNAVAILABLE is never confused with "no evidence exists."
    if (attempt.error) {
        return {
            state: PublicationEvidenceDiscoveryUiState.UNAVAILABLE,
            label: 'Discovery unavailable',
            message: 'The requested peer discovery operation could not complete.',
            newlyImportedCount: null, alreadyKnownCount: null
        };
    }

    const { attemptedPeers, newlyImportedCount, alreadyKnownCount } = attempt.result;
    if (!attemptedPeers || attemptedPeers.length === 0) {
        return {
            state: PublicationEvidenceDiscoveryUiState.UNAVAILABLE,
            label: 'Discovery unavailable',
            message: 'No authenticated peer was available to ask.',
            newlyImportedCount: 0, alreadyKnownCount: 0
        };
    }

    if (newlyImportedCount > 0) {
        return {
            state: PublicationEvidenceDiscoveryUiState.DISCOVERED,
            label: 'New evidence discovered',
            message: `${newlyImportedCount} new evidence claim${newlyImportedCount === 1 ? '' : 's'} discovered from peers.`,
            newlyImportedCount, alreadyKnownCount
        };
    }

    // Deliberately worded as "no NEW evidence claims" — never "no
    // evidence exists." Peers were asked, and answered, but offered
    // nothing this replica did not already have; that says nothing about
    // whether more evidence exists somewhere this replica did not ask.
    return {
        state: PublicationEvidenceDiscoveryUiState.NO_NEW_EVIDENCE,
        label: 'No new evidence',
        message: 'No new evidence claims discovered from peers.',
        newlyImportedCount: 0, alreadyKnownCount
    };
}

// A short label for the button itself — deliberately separate from
// describeEvidenceDiscoveryAttempt()'s own `message`, which describes
// the RESULT of the most recent attempt, not the action a person is
// about to take. Mirrors application/PublicationAnchorCreationView.js#
// describeCreationButtonLabel()'s own shape exactly.
export function describeDiscoveryButtonLabel({ discovering = false, hasDiscovered = false } = {}) {
    if (discovering) return 'Asking Peers…';
    return hasDiscovered ? 'Discover Again' : 'Discover from Peers';
}
