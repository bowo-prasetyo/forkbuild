import { SnapshotMaterializationSourceKind } from './SnapshotMaterializationSourceKind.js';

// 0.8.42 — Explicit Snapshot Source Selection & Materialization UX.
//
// application/SnapshotMaterializationSourceKind.js (0.8.36) already names
// the three explicit mechanisms that can ever put bytes on disk — PACKAGE,
// PLACEMENT, PEER — and already forbids ranking them against one another.
// What that file does NOT do, on purpose, is carry the PAYLOAD one of
// those three choices needs to actually run: a package needs `pkg`, a
// placement action needs the `placement` itself, a peer action needs the
// `peer` plus the `publicationId`/`contentHash` being asked about. This
// file is that missing, deliberately tiny carrier — a single frozen record
// naming WHICH kind a person chose and exactly the payload that choice
// requires, nothing more:
//
//   { kind: 'package',   pkg }
//   { kind: 'placement', placement }
//   { kind: 'peer',      peer, publicationId, contentHash }
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE: a source selection is a
// PERSON'S OWN ACTION, never an application recommendation. This file
// never discovers a package, a placement, or a peer on its own — every
// payload field is supplied by the caller, already in hand, exactly the
// same restraint application/MaterializeSnapshotFromPlacementUseCase.js
// and application/MaterializeSnapshotFromPeerUseCase.js's own headers
// already hold one layer down. `createSnapshotMaterializationSourceSelection()`
// validates that the payload matching the chosen `kind` is actually
// present — a missing `peer` on a PEER selection is a genuine caller
// contract violation, not a silent fallback to a different source — and
// otherwise makes no decision at all. See docs/Principles.md, "A Source
// Selection Is A Person's Own Action, Never An Application Recommendation
// (0.8.42)."
//
// NEVER PERSISTED, exactly like application/SnapshotMaterializationAttempt.js
// (0.8.36) one layer downstream — a selection lives only as long as the one
// `application/SnapshotMaterializationSelectionCoordinator.js#materialize()`
// call it is built for, never written onto a publication, an anchor, a
// placement, or any catalog.
export function createSnapshotMaterializationSourceSelection({
    kind, pkg = null, placement = null, peer = null, publicationId = null, contentHash = null
} = {}) {
    if (!kind || !Object.values(SnapshotMaterializationSourceKind).includes(kind)) {
        throw new Error('createSnapshotMaterializationSourceSelection: a valid SnapshotMaterializationSourceKind is required');
    }

    switch (kind) {
        case SnapshotMaterializationSourceKind.PACKAGE:
            if (!pkg) {
                throw new Error('createSnapshotMaterializationSourceSelection: a PACKAGE selection requires pkg');
            }
            return Object.freeze({ kind, pkg });

        case SnapshotMaterializationSourceKind.PLACEMENT:
            if (!placement) {
                throw new Error('createSnapshotMaterializationSourceSelection: a PLACEMENT selection requires placement');
            }
            return Object.freeze({ kind, placement });

        case SnapshotMaterializationSourceKind.PEER:
            if (!peer) {
                throw new Error('createSnapshotMaterializationSourceSelection: a PEER selection requires peer');
            }
            if (!publicationId || typeof publicationId !== 'string') {
                throw new Error('createSnapshotMaterializationSourceSelection: a PEER selection requires publicationId');
            }
            if (!contentHash || typeof contentHash !== 'string') {
                throw new Error('createSnapshotMaterializationSourceSelection: a PEER selection requires contentHash');
            }
            return Object.freeze({ kind, peer, publicationId, contentHash });

        default:
            // Unreachable: the Object.values() check above already
            // restricts `kind` to one of the three cases handled.
            throw new Error('createSnapshotMaterializationSourceSelection: unhandled kind');
    }
}
