import { SnapshotPlacementCreationOutcome } from './SnapshotPlacementCreationOutcome.js';
import { SnapshotPlacementCreationUiState } from './SnapshotPlacementCreationUiState.js';
import { RoleProviderResolutionStatus } from './RoleAwareProviderResolver.js';

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
//
// 0.9.301 — Preferred Content Provider Placement Trigger. `attempt.outcome`
// can now also be `RoleProviderResolutionStatus.PROVIDER_NOT_FOUND`
// (application/RoleAwareProviderResolver.js, 0.9.295) — the ONE outcome
// application/PreferredSnapshotPlacementCreationCoordinator.js's own
// `create()` (0.9.299) can produce that `SnapshotPlacementCreationOutcome`
// itself does not define. 0.9.300's own reachability audit named the
// pre-existing `switch` below silently collapsing that string to IDLE — no
// label, no message, no reason — as a real display gap; this milestone
// closes it with its own dedicated `case`, never by widening what CREATED
// or PLACEMENT_UNAVAILABLE already mean. `attempt.preference` — the raw
// `RoleProviderPreference` the coordinator's own PROVIDER_NOT_FOUND result
// already carries — is read here only to name WHAT was configured; this
// function still never resolves, retries, or substitutes a provider on its
// own behalf, exactly as it never did for any other outcome.
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
        // 0.9.301 — a preference IS configured, but names a storage
        // nothing on this replica is registered under. Distinct from
        // UNAVAILABLE above: no store was ever resolved, let alone
        // reached, so this never shares UNAVAILABLE's own UI state or
        // wording — a person is told WHAT was configured, not merely that
        // "the storage backend could not currently be reached."
        case RoleProviderResolutionStatus.PROVIDER_NOT_FOUND:
            return {
                state: SnapshotPlacementCreationUiState.PROVIDER_NOT_FOUND,
                label: 'Preferred provider not found',
                message: attempt.preference
                    ? `Your preferred content provider ('${attempt.preference.providerKey}') is not currently registered on this replica. No placement was created.`
                    : 'Your preferred content provider is not currently registered on this replica. No placement was created.',
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
