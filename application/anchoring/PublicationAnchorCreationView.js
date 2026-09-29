import { ExternalAnchorCreationOutcome } from './ExternalAnchorCreationOutcome.js';
import { ExternalAnchorCreationUiState } from './ExternalAnchorCreationUiState.js';
import { RoleProviderResolutionStatus } from '../settings/RoleAwareProviderResolver.js';
import { message } from '../../core/Message.js';

// 0.8.11 — Explicit External Anchoring UX.
//
// application/publication/evidence/PublicationEvidenceView.js (0.8.3) turns already-computed
// verification results into a flat, UI-ready shape without ever calling
// a verifier itself. This file is the identical idea applied to
// CREATION: it turns an already-computed attempt — whatever ui/views/
// DecentralizedPublicationsView.js's own `create()` click handler
// obtained from application/anchoring/PublicationAnchorCreationCoordinator.js#
// create(), or the fact that no attempt has been made yet — into one
// flat, precise, presentation-only shape. Pure and read-only: this file
// never imports application/anchoring/PublicationAnchorCreationCoordinator.js,
// application/anchoring/CreateExternalPublicationAnchorUseCase.js, or any
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
            label: message('anchorCreation.creating'), message: null, anchor: null, reason: null
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
            label: message('anchorCreation.noAnchorWasCreated'),
            message: message('anchorCreation.thisAnchorCouldNotBe'),
            anchor: null, reason: attempt.error
        };
    }

    switch (attempt.outcome) {
        case ExternalAnchorCreationOutcome.CREATED:
            return {
                state: ExternalAnchorCreationUiState.CREATED,
                label: message('anchorCreation.anchorCreated'),
                message: message('anchorCreation.anchorRecorded', { anchorType: attempt.anchor.anchorType }),
                anchor: attempt.anchor, reason: null
            };
        case ExternalAnchorCreationOutcome.PUBLISH_REJECTED:
            return {
                state: ExternalAnchorCreationUiState.REJECTED,
                label: message('anchorCreation.recordingRejected'),
                message: message('anchorCreation.theExternalSystemRejectedThe'),
                anchor: null, reason: attempt.reason
            };
        case ExternalAnchorCreationOutcome.PUBLISH_UNAVAILABLE:
            return {
                state: ExternalAnchorCreationUiState.UNAVAILABLE,
                label: message('anchorCreation.noAnchorWasCreated'),
                message: message('anchorCreation.theExternalSystemCouldNot'),
                anchor: null, reason: attempt.reason
            };
        // Preferred Proof & Anchoring Provider Creation Integration. A
        // preference IS configured, but names an anchorType nothing on this
        // replica is registered under. Distinct from UNAVAILABLE above: no
        // publisher was ever resolved, let alone reached, so this never
        // shares UNAVAILABLE's own UI state or wording — a person is told
        // WHAT was configured, not merely that "the external system could
        // not currently be reached." Mirrors application/
        // SnapshotPlacementCreationView.js's own identical case (0.9.301),
        // one role over.
        case RoleProviderResolutionStatus.PROVIDER_NOT_FOUND:
            return {
                state: ExternalAnchorCreationUiState.PROVIDER_NOT_FOUND,
                label: message('anchorCreation.preferredProviderNotFound'),
                message: attempt.preference
                    ? message('anchorCreation.preferredProviderMissing', { providerKey: attempt.preference.providerKey })
                    : message('anchorCreation.yourPreferredProofAnchoringProvider'),
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
    if (creating) return message('anchorCreation.creating');
    return hasExisting
        ? message('anchorCreation.createAnother', { anchorType: anchorTypeLabel })
        : message('anchorCreation.create', { anchorType: anchorTypeLabel });
}
