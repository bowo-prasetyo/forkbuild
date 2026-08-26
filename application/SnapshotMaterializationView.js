import { SnapshotMaterializationSourceKind } from './SnapshotMaterializationSourceKind.js';
import { StoreSnapshotContentOutcome } from './StoreSnapshotContentOutcome.js';

// 0.8.36 — Unified Explicit Snapshot Materialization Sources.
//
// application/SnapshotContentMaterializationView.js (0.8.34) and
// application/SnapshotPlacementMaterializationView.js (0.8.35) each turn
// an already-computed attempt into their OWN action-specific label,
// message, and button text — "Import Snapshot"/"Imported" for one,
// "Materialize Snapshot"/"Materialized" for the other. THIS file builds
// neither of those. It answers the one question the "Local Snapshot"
// summary itself asks, above and independent of either action: once
// bytes are locally possessed, which explicit mechanism most recently put
// them there? Pure and read-only, exactly like its two siblings — this
// file never imports application/StoreSnapshotContentUseCase.js, application/
// SnapshotContentMaterializationCoordinator.js, or application/
// SnapshotPlacementMaterializationCoordinator.js, and never itself stores
// a byte.
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE: the two sources are named,
// never ranked. `describeSnapshotMaterializationSourceLabel()` returns
// "Transfer package" or "Placement" with no adjective in front of
// either — never "recommended," "preferred," or "verified via." A
// publication whose bytes arrived through a placement is exactly as
// locally possessed as one whose bytes arrived through a package; this
// file's only job is to say which one actually happened, so a person
// reading "Local Snapshot" can see the fact without either sentence
// implying the other route would have been worse. See application/
// SnapshotMaterializationSourceKind.js's own header and docs/
// Principles.md, "A Shared Storage Boundary Does Not Merge The Sources
// That Feed It (0.8.36)."
export function describeSnapshotMaterializationSourceLabel(kind) {
    switch (kind) {
        case SnapshotMaterializationSourceKind.PACKAGE: return 'Transfer package';
        case SnapshotMaterializationSourceKind.PLACEMENT: return 'Placement';
        default: return null;
    }
}

// `attempt`: an application/SnapshotMaterializationAttempt.js record (or
// null — no attempt has completed for this entry, in this browsing
// session). Returns `{ possessed, sourceLabel }`:
//   possessed   — true only when `attempt.outcome` is application/
//                 StoreSnapshotContentOutcome.js's own STORED or
//                 ALREADY_AVAILABLE — the two outcomes that mean this
//                 replica now holds the bytes. A HASH_MISMATCH attempt (or
//                 no attempt at all) reports `possessed: false` — this
//                 function never claims possession a rejected or absent
//                 attempt did not actually establish.
//   sourceLabel — `describeSnapshotMaterializationSourceLabel(attempt.source.kind)`
//                 when `possessed`, otherwise null.
//
// Deliberately does NOT itself decide whether bytes are CURRENTLY
// available — that remains application/
// CheckLocalSnapshotContentAvailabilityUseCase.js's own job (0.8.33),
// unchanged and re-checkable independently of any attempt recorded here.
// A caller composes both: `describeAvailabilityOutcomeMessage()`'s own
// AVAILABLE sentence says WHETHER bytes are present now; this function's
// `sourceLabel`, shown alongside it, says which explicit action most
// recently supplied them — two independently true facts, never merged
// into one.
export function describeLocalSnapshotMaterializationSource(attempt = null) {
    const possessed = Boolean(attempt
        && (attempt.outcome === StoreSnapshotContentOutcome.STORED || attempt.outcome === StoreSnapshotContentOutcome.ALREADY_AVAILABLE));
    return {
        possessed,
        sourceLabel: possessed ? describeSnapshotMaterializationSourceLabel(attempt.source.kind) : null
    };
}
