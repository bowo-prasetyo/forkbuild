import { SnapshotMaterializationSourceKind } from './SnapshotMaterializationSourceKind.js';

// 0.8.42 — Explicit Snapshot Source Selection & Materialization UX.
//
// Three explicit materialization mechanisms already exist, each behind
// its own deliberately thin pass-through coordinator: application/
// SnapshotContentMaterializationCoordinator.js (0.8.34, PACKAGE),
// application/SnapshotPlacementMaterializationCoordinator.js (0.8.35,
// PLACEMENT), and application/SnapshotPeerMaterializationCoordinator.js
// (0.8.37, PEER). Until now, a caller wanting to turn a person's already-
// made choice into a materialization attempt had to know, itself, which of
// the three coordinators to call and how to shape the call for that one
// kind — three call sites, one per source, each spelled out separately.
// This class is the missing, deliberately boring dispatcher that closes
// that gap: given one application/SnapshotMaterializationSourceSelection.js
// record, it calls the ONE already-existing coordinator that selection
// names, unchanged, and returns its result exactly as received.
//
//   materialize(selection)
//           │
//           ├── PACKAGE   → packageCoordinator.import(selection.pkg)
//           ├── PLACEMENT → placementCoordinator.materialize(selection.placement)
//           └── PEER      → peerCoordinator.materialize({ peer, publicationId, contentHash })
//
// COMPOSITION, NOT A FOURTH MATERIALIZATION IMPLEMENTATION. This class
// contains no hash verification, no storage call, no signature check —
// every one of those already lives exactly once, inside application/
// StoreSnapshotContentUseCase.js and the three use cases that already feed
// it. This class never imports application/StoreSnapshotContentUseCase.js,
// application/ImportPublicationSnapshotTransferPackageUseCase.js,
// application/MaterializeSnapshotFromPlacementUseCase.js, or application/
// MaterializeSnapshotFromPeerUseCase.js — only the three coordinators
// already sitting in front of them. See docs/Principles.md, "A Shared
// Storage Boundary Does Not Merge The Sources That Feed It (0.8.36)," which
// this class extends rather than replaces.
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE: this class does not discover
// sources, does not compare sources, does not select a source, does not
// rank sources, does not retry, does not fall back, does not ask a
// different peer, does not resolve a placement unless the selected source
// IS a placement, and does not automatically choose an AVAILABLE peer. The
// ENTIRE decision of which kind, and which specific package/placement/peer,
// was already made before `materialize()` is ever called — by
// application/SnapshotMaterializationSourceSelection.js#createSnapshotMaterializationSourceSelection(),
// which itself only ever wraps a caller-supplied choice, never invents
// one. See docs/Principles.md, "A Source Selection Is A Person's Own
// Action, Never An Application Recommendation (0.8.42)."
export class SnapshotMaterializationSelectionCoordinator {
    // Each of the three coordinators is OPTIONAL, independently, mirroring
    // the identical degrade-gracefully posture ui/views/
    // DecentralizedPublicationsView.js's own `inject('...', null)` calls
    // already hold for each of them on its own — an environment wiring
    // only some of the three sources still gets a working dispatcher for
    // the ones it did wire, and an honest, immediate error for the ones it
    // did not, rather than this class silently requiring all three just to
    // exist at all.
    constructor({ packageCoordinator = null, placementCoordinator = null, peerCoordinator = null } = {}) {
        this._packageCoordinator = packageCoordinator;
        this._placementCoordinator = placementCoordinator;
        this._peerCoordinator = peerCoordinator;
    }

    // Triggers exactly ONE explicit materialization attempt for whichever
    // source `selection.kind` names, handing that source's own payload to
    // the ONE existing coordinator already responsible for it. Resolves to
    // that coordinator's own result completely unchanged — never
    // reinterpreted, never caught, never turned into a different shape,
    // exactly as every one of the three underlying coordinators already
    // declines to reinterpret its own use case's result. Throws straight
    // through for a caller contract violation: a `selection` that is not
    // an application/SnapshotMaterializationSourceSelection.js record, or
    // one naming a kind whose coordinator was never wired for this
    // instance — genuine programming errors this class does not catch.
    async materialize(selection) {
        if (!selection || !selection.kind) {
            throw new Error('SnapshotMaterializationSelectionCoordinator: materialize() requires a SnapshotMaterializationSourceSelection');
        }

        switch (selection.kind) {
            case SnapshotMaterializationSourceKind.PACKAGE:
                if (!this._packageCoordinator) {
                    throw new Error('SnapshotMaterializationSelectionCoordinator: no package coordinator was wired');
                }
                return this._packageCoordinator.import(selection.pkg);

            case SnapshotMaterializationSourceKind.PLACEMENT:
                if (!this._placementCoordinator) {
                    throw new Error('SnapshotMaterializationSelectionCoordinator: no placement coordinator was wired');
                }
                return this._placementCoordinator.materialize(selection.placement);

            case SnapshotMaterializationSourceKind.PEER:
                if (!this._peerCoordinator) {
                    throw new Error('SnapshotMaterializationSelectionCoordinator: no peer coordinator was wired');
                }
                return this._peerCoordinator.materialize({
                    peer: selection.peer, publicationId: selection.publicationId, contentHash: selection.contentHash
                });

            default:
                throw new Error(`SnapshotMaterializationSelectionCoordinator: unrecognized source kind "${selection.kind}"`);
        }
    }
}
