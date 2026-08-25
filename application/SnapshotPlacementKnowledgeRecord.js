import { PlacementAcquisitionKind, isValidPlacementAcquisitionKind } from './PlacementAcquisitionKind.js';

// 0.8.24 — Snapshot Placement Provenance & Observation Boundary.
//
// application/AnchorKnowledgeRecord.js's own shape (0.8.17), applied to a
// placement instead of an anchor — "how did THIS replica come to know
// about the placement's CLAIM at all, and when did it first learn it,"
// deliberately DURABLE (see application/LocalPlacementKnowledgeStore.js),
// because unlike a resolution outcome (application/
// SnapshotPlacementResolutionObservation.js, 0.8.20 — which can change
// every time this replica re-checks the locator), how a replica first
// learned a claim is a fact about this replica's own history that never
// changes once established.
//
//   { placementId, firstSeenAt, acquisition: { kind } }
//
// NOT PART OF THE PLACEMENT. core/PublicationSnapshotPlacement.js's own
// signed payload is untouched by this file — a
// SnapshotPlacementKnowledgeRecord is never attached to a
// PublicationSnapshotPlacement instance, never serialized inside one, and
// never carried across application/
// PublicationSnapshotPlacementExchange.js's own export/import boundary
// (see application/LocalPlacementKnowledgeStore.js's own header on why
// this stays strictly local, per-replica bookkeeping). Two replicas that
// hold the identical, identically-signed placement may each hold a
// completely different SnapshotPlacementKnowledgeRecord for it — replicas
// can agree on a claim while having different histories of how they
// learned it, exactly as application/AnchorKnowledgeRecord.js's own
// header already establishes for anchors.
//
// NOT A TRUST OR AVAILABILITY SIGNAL. `acquisition.kind` is one of
// application/PlacementAcquisitionKind.js's three values, and nothing
// about this record — not the kind, not how early `firstSeenAt` is — may
// ever be read as "more trustworthy," "more available," or "preferred."
// See that file's own header.
export function createSnapshotPlacementKnowledgeRecord({ placementId, acquisitionKind, firstSeenAt = new Date() } = {}) {
    if (!placementId || typeof placementId !== 'string' || !placementId.trim()) {
        throw new Error('createSnapshotPlacementKnowledgeRecord: a placementId is required');
    }
    if (!isValidPlacementAcquisitionKind(acquisitionKind)) {
        throw new Error('createSnapshotPlacementKnowledgeRecord: a valid PlacementAcquisitionKind is required');
    }
    const firstSeenAtDate = firstSeenAt instanceof Date ? firstSeenAt : new Date(firstSeenAt);
    if (Number.isNaN(firstSeenAtDate.getTime())) {
        throw new Error('createSnapshotPlacementKnowledgeRecord: firstSeenAt must be a valid date');
    }
    return Object.freeze({
        placementId,
        firstSeenAt: firstSeenAtDate,
        acquisition: Object.freeze({ kind: acquisitionKind })
    });
}

// Turns a stored, plain-JSON envelope (application/
// LocalPlacementKnowledgeStore.js's own on-disk shape) back into a real,
// frozen record. Never validates whether `placementId` names a real,
// cataloged placement — this file has no catalog reference at all,
// exactly as application/AnchorKnowledgeRecord.js's own factory never
// checks one either.
export function snapshotPlacementKnowledgeRecordFromJSON(json) {
    if (!json || typeof json !== 'object') {
        throw new Error('snapshotPlacementKnowledgeRecordFromJSON: a record is required');
    }
    return createSnapshotPlacementKnowledgeRecord({
        placementId: json.placementId,
        acquisitionKind: json.acquisition ? json.acquisition.kind : undefined,
        firstSeenAt: json.firstSeenAt
    });
}

export function snapshotPlacementKnowledgeRecordToJSON(record) {
    return {
        placementId: record.placementId,
        firstSeenAt: record.firstSeenAt.toISOString(),
        acquisition: { kind: record.acquisition.kind }
    };
}

// Re-exported so a caller that only imports this file still has the
// vocabulary to construct one — mirrors application/
// AnchorKnowledgeRecord.js's own re-export of AnchorAcquisitionKind.
export { PlacementAcquisitionKind };
