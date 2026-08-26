import { SnapshotContentTransferOutcome } from './SnapshotContentTransferOutcome.js';
import { SnapshotContentMaterializationUiState } from './SnapshotContentMaterializationUiState.js';

// 0.8.34 — Explicit Snapshot Materialization UX.
//
// application/PublicationAnchorCreationView.js (0.8.11) and application/
// SnapshotPlacementCreationView.js (0.8.25) each turn an already-computed
// creation attempt into a flat, UI-ready shape without ever calling their
// own coordinator. This file is the identical idea applied to
// MATERIALIZATION: it turns an already-computed attempt — whatever
// ui/views/DecentralizedPublicationsView.js's own `importSnapshotContent()`
// click handler obtained from application/
// SnapshotContentMaterializationCoordinator.js#import(), or the fact that
// no attempt has been made yet — into one flat, precise, presentation-only
// shape. Pure and read-only: this file never imports application/
// SnapshotContentMaterializationCoordinator.js or application/
// ImportPublicationSnapshotTransferPackageUseCase.js, and never itself
// stores a byte.
//
// THE STRONGEST STATEMENT THIS FILE EVER MAKES: "Snapshot was imported and
// matches the publication's content hash." Never "verified," "trusted,"
// "authentic," "permanent," or "canonical" — this milestone's own design
// conversation named those exact words as ones the UI must never use here,
// for the identical reason application/
// LocalSnapshotContentAvailabilityView.js's own header already gives one
// layer over: this sentence describes bytes matching a hash the
// publication's own envelope already claimed, at some earlier point,
// through some earlier milestone — never a judgment about the publication
// itself being trustworthy.
//
// `publicationKnown` — carried through unchanged from application/
// ImportPublicationSnapshotTransferPackageUseCase.js's own result — decides
// which of two equally true sentences is shown for a successful import,
// never whether the import itself succeeds: 0.8.32 established that
// `publicationKnown` never gates storage, and this view preserves that
// invariant by describing it as a separate, additional fact rather than a
// precondition. See docs/Principles.md, "Snapshot Materialization Is An
// Explicit User Action, Distinct From Every Other Way A Replica Learns
// About Content (0.8.34)."
export function describeMaterializationAttempt(attempt = null) {
    if (!attempt || (!attempt.importing && !attempt.outcome && !attempt.error)) {
        return {
            state: SnapshotContentMaterializationUiState.IDLE,
            importing: false,
            label: null, message: null, contentReference: null, publicationId: null
        };
    }

    if (attempt.importing) {
        return {
            state: SnapshotContentMaterializationUiState.IMPORTING,
            importing: true,
            label: 'Importing…', message: null, contentReference: null, publicationId: null
        };
    }

    // The supplied input was never even a well-formed Publication
    // Snapshot Transfer Package (invalid JSON, wrong `kind`, a missing
    // field — application/PublicationSnapshotTransferPackageValidator.js's
    // own PublicationSnapshotTransferPackageError), or application/
    // SnapshotContentMaterializationCoordinator.js#import() itself threw
    // for some other local reason. To a person looking at the button,
    // that reads identically to "nothing was imported" — no transfer was
    // ever attempted either way — so it shares UNAVAILABLE's state and
    // coloring, while `message` still carries the real, specific cause
    // rather than a generic one. See application/
    // SnapshotContentMaterializationUiState.js's own header.
    if (attempt.error) {
        return {
            state: SnapshotContentMaterializationUiState.UNAVAILABLE,
            importing: false,
            label: 'Snapshot was not imported',
            message: attempt.error,
            contentReference: null, publicationId: null
        };
    }

    switch (attempt.outcome) {
        case SnapshotContentTransferOutcome.STORED:
            return {
                state: SnapshotContentMaterializationUiState.IMPORTED,
                importing: false,
                label: 'Imported',
                message: attempt.publicationKnown
                    ? "Snapshot was imported and matches the publication's content hash."
                    : 'Snapshot imported. The publication is not currently known locally.',
                contentReference: attempt.contentReference, publicationId: attempt.publicationId
            };
        case SnapshotContentTransferOutcome.ALREADY_STORED:
            return {
                state: SnapshotContentMaterializationUiState.ALREADY_AVAILABLE,
                importing: false,
                label: 'Already available',
                message: attempt.publicationKnown
                    ? 'The snapshot is already present locally.'
                    : 'The snapshot is already present locally. The publication is not currently known locally.',
                contentReference: attempt.contentReference, publicationId: attempt.publicationId
            };
        case SnapshotContentTransferOutcome.CONTENT_HASH_MISMATCH:
            return {
                state: SnapshotContentMaterializationUiState.REJECTED,
                importing: false,
                label: 'Import rejected',
                message: "The imported bytes do not match this package's own claimed content hash. Nothing was stored.",
                contentReference: null, publicationId: attempt.publicationId
            };
        default:
            return {
                state: SnapshotContentMaterializationUiState.IDLE,
                importing: false,
                label: null, message: null, contentReference: null, publicationId: null
            };
    }
}

// A short label for the button itself — deliberately separate from
// `describeMaterializationAttempt()`'s own `label`/`message`, which
// describe the RESULT of the most recent attempt, not the action a person
// is about to take. Unlike application/PublicationAnchorCreationView.js's
// own `describeCreationButtonLabel()`, there is no "Import Another" — a
// second import is not a new artifact the way a second anchor or
// placement is; it is always simply "Import Snapshot" again, exactly as
// meaningful whether it turns out STORED, ALREADY_STORED, or rejected.
export function describeMaterializationButtonLabel({ importing = false } = {}) {
    return importing ? 'Importing…' : 'Import Snapshot';
}
