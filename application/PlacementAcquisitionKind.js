// 0.8.24 — Snapshot Placement Provenance & Observation Boundary.
//
// application/AnchorAcquisitionKind.js's own vocabulary (0.8.17), applied
// to a placement instead of an anchor. The smallest possible vocabulary
// for "how did THIS replica come to know about this placement" — three
// values, deliberately never more:
//
//   LOCAL    — this replica itself created and signed the placement
//              (application/CreatePublicationSnapshotPlacementUseCase.js).
//   PACKAGE  — the placement arrived bundled inside a Blueprint Package
//              (application/ImportPackageSnapshotPlacementsUseCase.js).
//   PEER     — the placement arrived over a live peer connection, whether
//              an unsolicited ANNOUNCE or a REQUEST/RESPONSE synchronize
//              (application/PublicationSnapshotPlacementPeerExchange.js).
//              The two transports are deliberately NOT distinguished —
//              see application/AnchorAcquisitionKind.js's own header on
//              why PEER_ANNOUNCEMENT/PEER_DISCOVERY would be unnecessary
//              taxonomy: both mean exactly the same thing, "another
//              authenticated replica supplied a signed placement claim."
//
// Deliberately excludes RESTORED, for the identical reason application/
// AnchorAcquisitionKind.js already excludes it: surviving a restart is
// not a new way a replica learned a placement. application/
// RestorePublicationSnapshotPlacementCatalogUseCase.js (0.8.21) re-earns
// trust in a placement already on file, and application/
// LocalPlacementKnowledgeStore.js's own first-seen-wins persistence means
// the ORIGINAL acquisition kind is still exactly what a restarted replica
// reports; see that file's own header.
//
// THIS IS NOT A RANKING. No value here is more or less authoritative,
// more retrievable, or more available than another, and no caller may
// ever compare two of these values to decide which placement to prefer,
// resolve first, or display first. See docs/Principles.md, "Acquisition
// Provenance Is Not Placement Rank (0.8.24)."
export const PlacementAcquisitionKind = Object.freeze({
    LOCAL: 'local',
    PACKAGE: 'package',
    PEER: 'peer'
});

export function isValidPlacementAcquisitionKind(value) {
    return Object.values(PlacementAcquisitionKind).includes(value);
}
