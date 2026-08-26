// 0.8.36 — Unified Explicit Snapshot Materialization Sources.
//
// Names WHICH explicit mechanism supplied the bytes behind one completed
// application/StoreSnapshotContentUseCase.js call — never HOW a replica
// learned a claim exists (that is acquisition provenance — application/
// AcquisitionKind.js (0.8.17), PEER/PACKAGE/LOCAL — a completely
// different axis this file does not touch or extend). A placement's own
// acquisition provenance answers "how did this replica come to KNOW this
// placement?"; this vocabulary answers a strictly later question: "which
// explicit action actually put bytes on disk, THIS time?"
//
//   PACKAGE    — application/
//                ImportPublicationSnapshotTransferPackageUseCase.js
//                (0.8.32) — an explicitly SUPPLIED Publication Snapshot
//                Transfer Package, a file or pasted JSON a person chose.
//   PLACEMENT  — application/MaterializeSnapshotFromPlacementUseCase.js
//                (0.8.35) — an explicitly CHOSEN, already-resolved
//                PublicationSnapshotPlacement, one specific placement card
//                a person clicked "Materialize Snapshot" on.
//
// DELIBERATELY UNORDERED. No PREFERRED, no BEST, no TRUSTED, no PRIMARY or
// SECONDARY — see application/StoreSnapshotContentUseCase.js's own header
// and docs/Principles.md, "A Shared Storage Boundary Does Not Merge The
// Sources That Feed It (0.8.36)." Two values sitting in one frozen object,
// neither one ranked above the other; a person's own explicit click is
// what decided which of the two ran, and this file exists only to name
// that choice afterward, never to justify or re-weigh it.
//
// NEVER PERSISTED. This value lives only inside an ephemeral application/
// SnapshotMaterializationAttempt.js record — never written onto a
// publication, an anchor, a placement, or any catalog. See that file's
// own header.
export const SnapshotMaterializationSourceKind = Object.freeze({
    PACKAGE: 'package',
    PLACEMENT: 'placement'
});
