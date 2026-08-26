// 0.8.46 — Unified Snapshot State Inspection.
//
// Four independent files already answer four independent questions about
// one snapshot:
//
//   application/PublicationSnapshotPossessionView.js        (0.8.39) —
//     does THIS replica's own storage presently hold valid bytes?
//   application/PublicationSnapshotAcquisitionView.js       (0.8.43) —
//     current possession, alongside plain counts over every explicit
//     "Import Snapshot"/"Materialize Snapshot"/"Get Snapshot from Peer"
//     attempt this replica has recorded.
//   application/PublicationSnapshotPlacementConvergenceView.js (0.8.23) —
//     how many known placements, across how many storage backends and
//     locators, and whether their own contentHash claims agree.
//   application/SnapshotPeerPossessionComparisonView.js     (0.8.41) —
//     what a chosen set of peers most recently reported when asked.
//
// Until now, a caller wanting all four side by side had to call each one
// separately and hold four results apart itself. This file is the
// smallest possible COMPOSITION of all four, sitting beside every one of
// them rather than replacing any of them:
//
//   describePublicationSnapshotPossession()                (0.8.39, UNCHANGED)
//   describePublicationSnapshotAcquisition()                (0.8.43, UNCHANGED)
//   publicationSnapshotPlacementConvergenceView()           (0.8.23, UNCHANGED)
//   describeSnapshotPeerPossessionComparison()              (0.8.41, UNCHANGED)
//              │
//              ▼
//   describeSnapshotStateInspection()                            (THIS FILE)
//              │
//              ▼
//     { publicationId, contentHash,
//       possession: { state },
//       acquisition: { attemptCount, storedCount, alreadyAvailableCount,
//                       hashMismatchCount, sources } | null,
//       placements: { placementCount, storageTypeCount, locatorCount,
//                      relationship, hasConflict } | null,
//       peerObservations: { peerCount, availableCount, notAvailableCount,
//                            unavailableCount } | null }
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE: a snapshot can have many
// independently observed facts, and the unified view exposes them SIDE
// BY SIDE without deciding what they mean together. It is entirely
// ordinary, valid output for this function to report local possession
// AVAILABLE, a placement relationship of CONFLICT, two peers reporting
// AVAILABLE and one reporting NOT_AVAILABLE, and an acquisition history
// of three stored attempts, ALL AT ONCE — this file never resolves that
// combination into "healthy," "unhealthy," "mostly decentralized," or any
// other fifth state a person did not directly observe. See
// docs/Principles.md, "A Snapshot's Independently Observed Facts Are
// Exposed Side By Side, Never Collapsed Into One Verdict (0.8.46)."
//
// NO SCORE, NO VERDICT, NO RANKING, and NO NEW STATE MACHINE — this file
// computes nothing a caller could not already compute itself by calling
// all four composed functions separately and reading their results side
// by side; it exists only to save every caller from repeating that same
// small composition by hand, and to give it one small, testable shape.
// There is no `snapshotHealth`, `snapshotConfidence`, `snapshotScore`,
// `recommendedSource`, `bestPeer`, `preferredPlacement`, or
// `availabilityPercentage` anywhere in this file, and none should ever be
// added to it.
//
// EACH DIMENSION IS REPORTED EXACTLY AS ITS OWN ALREADY-COMPUTED VIEW WAS
// GIVEN — this file never reaches into one composed view to read or
// correct another. `acquisitionView` is read only for its own
// `acquisition` counts, never for the `possession` field it also happens
// to carry (`possessionView`, supplied separately, is the one and only
// source for the `possession` field below) — the identical "independent
// facts, never cross-checked" discipline application/
// PublicationSnapshotAcquisitionView.js's own header already applies one
// layer down, extended here across a fourth and fifth dimension.
//
// `possessionView`: application/PublicationSnapshotPossessionView.js#
// describePublicationSnapshotPossession()'s own result, or null/absent
// (reported as `possession.state: null` — "not yet observed," never
// "known to be missing"). `acquisitionView`: application/
// PublicationSnapshotAcquisitionView.js#describePublicationSnapshotAcquisition()'s
// own result, or null/absent (reported as `acquisition: null` — no
// acquisition composition has ever been computed for this entry, THIS
// session — distinct from `acquisition.attemptCount === 0`, which means a
// composition WAS computed and found zero recorded attempts).
// `placementConvergenceView`: application/
// PublicationSnapshotPlacementConvergenceView.js#
// publicationSnapshotPlacementConvergenceView()'s own result, or
// null/absent (reported as `placements: null` — placements have never
// been loaded for this entry THIS session, distinct from `placementCount
// === 0`, which means placements WERE loaded and none were found).
// `peerPossessionComparisonView`: application/
// SnapshotPeerPossessionComparisonView.js#describeSnapshotPeerPossessionComparison()'s
// own result, or null/absent (reported as `peerObservations: null` —
// distinct from `peerCount === 0`, an empty but computed comparison).
//
// Pure and stateless: no constructor, no injected dependency, no
// caching, no store, no network, no catalog, no coordinator. Calling this
// twice with byte-identical arguments returns a byte-identical result.
export function describeSnapshotStateInspection({
    publicationId = null,
    contentHash = null,
    possessionView = null,
    acquisitionView = null,
    placementConvergenceView = null,
    peerPossessionComparisonView = null
} = {}) {
    const acquisition = (acquisitionView && acquisitionView.acquisition)
        ? Object.freeze({
            attemptCount: acquisitionView.acquisition.attemptCount,
            storedCount: acquisitionView.acquisition.storedCount,
            alreadyAvailableCount: acquisitionView.acquisition.alreadyAvailableCount,
            hashMismatchCount: acquisitionView.acquisition.hashMismatchCount,
            sources: Object.freeze({ ...acquisitionView.acquisition.sources })
        })
        : null;

    const placements = placementConvergenceView
        ? Object.freeze({
            placementCount: placementConvergenceView.placementCount || 0,
            storageTypeCount: placementConvergenceView.storageTypeCount || 0,
            locatorCount: placementConvergenceView.locatorCount || 0,
            relationship: placementConvergenceView.relationship || null,
            hasConflict: Boolean(placementConvergenceView.hasConflict)
        })
        : null;

    const peerObservations = peerPossessionComparisonView
        ? Object.freeze({
            peerCount: Array.isArray(peerPossessionComparisonView.peers) ? peerPossessionComparisonView.peers.length : 0,
            availableCount: peerPossessionComparisonView.availableCount || 0,
            notAvailableCount: peerPossessionComparisonView.notAvailableCount || 0,
            unavailableCount: peerPossessionComparisonView.unavailableCount || 0
        })
        : null;

    return Object.freeze({
        publicationId,
        contentHash,
        possession: Object.freeze({
            state: (possessionView && possessionView.possession) ? possessionView.possession.state : null
        }),
        acquisition,
        placements,
        peerObservations
    });
}
