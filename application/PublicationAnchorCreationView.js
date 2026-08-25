import { ExternalAnchorCreationOutcome } from './ExternalAnchorCreationOutcome.js';
import { ExternalAnchorCreationUiState } from './ExternalAnchorCreationUiState.js';

// 0.8.11 — Explicit External Anchoring UX.
//
// application/PublicationEvidenceView.js (0.8.3) turns already-computed
// verification results into a flat, UI-ready shape without ever calling
// a verifier itself. This file is the identical idea applied to
// CREATION: it turns an already-computed attempt — whatever ui/views/
// DecentralizedPublicationsView.js's own `create()` click handler
// obtained from application/PublicationAnchorCreationCoordinator.js#
// create(), or the fact that no attempt has been made yet — into one
// flat, precise, presentation-only shape. Pure and read-only: this file
// never imports application/PublicationAnchorCreationCoordinator.js,
// application/CreateExternalPublicationAnchorUseCase.js, or any
// publisher, and never itself triggers an external recording.
//
// THE STRONGEST STATEMENT THIS FILE EVER MAKES: "<Anchor type> evidence
// was recorded for this content hash." Never "verified," "confirmed," or
// "trusted" — this milestone's own design conversation named those
// exact words as ones the UI must never use for a freshly created
// anchor, since broadcast acceptance is not confirmation (see anchoring/
// BitcoinAnchorPublisher.js's own header, 0.8.9) and creating a claim is
// not independently verifying one (see application/
// CreatePublicationAnchorUseCase.js's own header, 0.8.8). Only an
// explicit, separate "Verify Evidence" click — application/
// PublicationEvidenceCoordinator.js#verify(), completely unchanged by
// this milestone — can ever produce a stronger statement than this file
// makes.
export function describeCreationAttempt(attempt = null) {
    if (!attempt || (!attempt.creating && !attempt.outcome && !attempt.error)) {
        return {
            state: ExternalAnchorCreationUiState.IDLE,
            label: null, message: null, anchor: null, reason: null
        };
    }

    if (attempt.creating) {
        return {
            state: ExternalAnchorCreationUiState.CREATING,
            label: 'Creating…', message: null, anchor: null, reason: null
        };
    }

    // A local precondition failure (application/
    // PublicationAnchorCreationCoordinator.js#create() threw — e.g.
    // nobody is signed in) never reached a publisher at all. To a person
    // looking at the button, that reads identically to "the external
    // system could not currently be reached" — no external recording was
    // ever attempted either way — so it shares UNAVAILABLE's UI state
    // and coloring, while `reason` still carries the real, specific
    // cause rather than a generic message. See application/
    // ExternalAnchorCreationUiState.js's own header.
    if (attempt.error) {
        return {
            state: ExternalAnchorCreationUiState.UNAVAILABLE,
            label: 'No anchor was created',
            message: 'This anchor could not be created.',
            anchor: null, reason: attempt.error
        };
    }

    switch (attempt.outcome) {
        case ExternalAnchorCreationOutcome.CREATED:
            return {
                state: ExternalAnchorCreationUiState.CREATED,
                label: 'Anchor created',
                message: `${attempt.anchor.anchorType} evidence was recorded for this content hash.`,
                anchor: attempt.anchor, reason: null
            };
        case ExternalAnchorCreationOutcome.PUBLISH_REJECTED:
            return {
                state: ExternalAnchorCreationUiState.REJECTED,
                label: 'Recording rejected',
                message: 'The external system rejected the recording request. No anchor was created.',
                anchor: null, reason: attempt.reason
            };
        case ExternalAnchorCreationOutcome.PUBLISH_UNAVAILABLE:
            return {
                state: ExternalAnchorCreationUiState.UNAVAILABLE,
                label: 'No anchor was created',
                message: 'The external system could not currently be reached. No anchor was created.',
                anchor: null, reason: attempt.reason
            };
        default:
            return {
                state: ExternalAnchorCreationUiState.IDLE,
                label: null, message: null, anchor: null, reason: null
            };
    }
}

// A short label for the button itself — deliberately separate from
// `describeCreationAttempt()`'s own `label`/`message`, which describe
// the RESULT of the most recent attempt, not the action a person is
// about to take. `hasExisting` is whether this publication already has
// at least one cataloged anchor of this anchorType (from application/
// PublicationEvidenceView.js's own discovered list) — "Create Another"
// makes it visually obvious that a second, independent anchor is what
// clicking again produces, never a replacement of the first. See
// docs/Principles.md, "External Anchoring Is An Explicit User Action
// (0.8.11)."
export function describeCreationButtonLabel(anchorTypeLabel, { creating = false, hasExisting = false } = {}) {
    if (creating) return 'Creating…';
    return hasExisting ? `Create Another ${anchorTypeLabel} Anchor` : `Create ${anchorTypeLabel} Anchor`;
}
