// 0.8.36 — Unified Explicit Snapshot Materialization Sources.
// 0.8.37 — Explicit Peer Snapshot Content Transfer: adds PEER, a THIRD
// explicit mechanism, without changing what this file's own two existing
// values mean or how they compare — see this header's own update below.
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
//   PEER       — application/MaterializeSnapshotFromPeerUseCase.js
//                (0.8.37) — an explicitly CHOSEN, already-authenticated
//                peer a person clicked "Get Snapshot from Peer" on, asked
//                directly for one content hash. Distinct from
//                `application/AcquisitionKind.js`'s own PEER value the
//                identical way PACKAGE and PLACEMENT already are: this
//                names which action put BYTES on disk, never how a
//                replica came to know a CLAIM. It is also distinct from
//                application/PeerContentExchange.js's own (0.7.4)
//                automatic, catalog-gated, multi-peer retrieval — that
//                path is not wired to application/
//                StoreSnapshotContentUseCase.js at all, and produces no
//                SnapshotMaterializationSourceKind of its own; see
//                application/PublicationSnapshotContentPeerExchange.js's
//                own header for why 0.8.37 built a second, narrower,
//                explicit-only transport rather than reusing that one.
//
// DELIBERATELY UNORDERED. No PREFERRED, no BEST, no TRUSTED, no PRIMARY or
// SECONDARY — see application/StoreSnapshotContentUseCase.js's own header
// and docs/Principles.md, "A Shared Storage Boundary Does Not Merge The
// Sources That Feed It (0.8.36)." Three values sitting in one frozen
// object, none ranked above another; a person's own explicit click is
// what decided which of the three ran, and this file exists only to name
// that choice afterward, never to justify or re-weigh it. Adding PEER in
// 0.8.37 changes nothing about how PACKAGE and PLACEMENT already compare
// to each other — see docs/Principles.md, "Peer Content Transfer Is
// Transport; Verification And Storage Stay Centralized (0.8.37)."
//
// NEVER PERSISTED. This value lives only inside an ephemeral application/
// SnapshotMaterializationAttempt.js record — never written onto a
// publication, an anchor, a placement, or any catalog. See that file's
// own header.
export const SnapshotMaterializationSourceKind = Object.freeze({
    PACKAGE: 'package',
    PLACEMENT: 'placement',
    PEER: 'peer'
});
