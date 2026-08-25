import { SnapshotPlacementCreationOutcome } from './SnapshotPlacementCreationOutcome.js';
import { SnapshotPlacementCreationUiState } from './SnapshotPlacementCreationUiState.js';

// 0.8.25 — Explicit Snapshot Placement Creation UX.
//
// The placement-side counterpart of application/
// PublicationAnchorCreationView.js (0.8.11), mirrored deliberately — pure
// and read-only, exactly like that file's own header describes: it turns
// an already-computed attempt (whatever ui/views/
// DecentralizedPublicationsView.js's own `createPlacement()` click
// handler obtained from application/
// SnapshotPlacementCreationCoordinator.js#create(), or the fact that no
// attempt has been made yet) into one flat, precise, presentation-only
// shape. This file never imports application/
// SnapshotPlacementCreationCoordinator.js, application/
// CreateExternalSnapshotPlacementUseCase.js, or any content/ContentStore
// .js, and never itself triggers a placement.
//
// THE STRONGEST STATEMENT THIS FILE EVER MAKES: "A snapshot placement was
// recorded for <storage>." Never "decentralized," "permanent,"
// "verified," "confirmed," or "available everywhere" — a created
// placement is a signed claim that a storage backend accepted these
// bytes just now, nothing about whether it can still serve them later.
// Only an explicit, separate "Resolve Snapshot" click (application/
// SnapshotPlacementResolutionCoordinator.js#resolve(), 0.8.20, completely
// unchanged by this milestone) can ever produce a stronger statement than
// this file makes.
export function describeCreationAttempt(attempt = null) {
    if (!attempt || (!attempt.creating && !attempt.outcome && !attempt.error)) {
        return {
            state: SnapshotPlacementCreationUiState.IDLE,
            label: null, message: null, placement: null, reason: null
        };
    }

    if (attempt.creating) {
        return {
            state: SnapshotPlacementCreationUiState.CREATING,
            label: 'Creating…', message: null, placement: null, reason: null
        };
    }

    // A local precondition failure (application/
    // SnapshotPlacementCreationCoordinator.js#create() threw — e.g.
    // nobody is signed in, or the publication has no local content to
    // place) never reached a store at all. To a person looking at the
    // button, that reads identically to "the storage backend could not
    // currently be reached" — no placement was ever attempted either way
    // — so it shares UNAVAILABLE's UI state and coloring, while `reason`
    // still carries the real, specific cause rather than a generic
    // message. See application/SnapshotPlacementCreationUiState.js's own
    // header.
    if (attempt.error) {
        return {
            state: SnapshotPlacementCreationUiState.UNAVAILABLE,
            label: 'No placement was created',
            message: 'This snapshot placement could not be created.',
            placement: null, reason: attempt.error
        };
    }

    switch (attempt.outcome) {
        case SnapshotPlacementCreationOutcome.CREATED:
            return {
                state: SnapshotPlacementCreationUiState.CREATED,
                label: 'Placement created',
                message: `A snapshot placement was recorded for ${attempt.placement.storage}.`,
                placement: attempt.placement, reason: null
            };
        case SnapshotPlacementCreationOutcome.PLACEMENT_UNAVAILABLE:
            return {
                state: SnapshotPlacementCreationUiState.UNAVAILABLE,
                label: 'No placement was created',
                message: 'The storage backend could not currently be reached. No placement was created.',
                placement: null, reason: attempt.reason
            };
        default:
            return {
                state: SnapshotPlacementCreationUiState.IDLE,
                label: null, message: null, placement: null, reason: null
            };
    }
}

// A short label for the button itself — deliberately separate from
// `describeCreationAttempt()`'s own `label`/`message`, which describe the
// RESULT of the most recent attempt, not the action a person is about to
// take. `hasExisting` is whether this publication already has at least
// one cataloged placement on this storage type (from application/
// SnapshotPlacementView.js's own discovered list) — "Create Another"
// makes it visually obvious that a second, independent placement is what
// clicking again produces, never a replacement of the first. Mirrors
// application/PublicationAnchorCreationView.js#describeCreationButtonLabel()
// exactly, one axis over.
export function describeCreationButtonLabel(storageLabel, { creating = false, hasExisting = false } = {}) {
    if (creating) return 'Creating…';
    return hasExisting ? `Create Another ${storageLabel} Placement` : `Create ${storageLabel} Placement`;
}
