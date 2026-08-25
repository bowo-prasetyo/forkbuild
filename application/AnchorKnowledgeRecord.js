import { AnchorAcquisitionKind, isValidAnchorAcquisitionKind } from './AnchorAcquisitionKind.js';

// 0.8.17 — Evidence Provenance & Observation Boundary.
//
// application/PublicationAnchorVerificationObservation.js's own shape
// (0.8.12), applied to a different question. That file names "what did
// THIS replica establish about an anchor's external proof, and when" —
// deliberately ephemeral, never persisted, never shared. This file names
// "how did THIS replica come to know about the anchor's CLAIM at all,
// and when did it first learn it" — deliberately DURABLE (see
// application/LocalAnchorKnowledgeStore.js), because unlike a
// verification outcome (which can change every time the external world
// is re-checked), how a replica first learned a claim is a fact about
// this replica's own history that never changes once established.
//
//   { anchorId, firstSeenAt, acquisition: { kind } }
//
// NOT PART OF THE ANCHOR. core/PublicationAnchor.js's own signed payload
// is untouched by this file — an AnchorKnowledgeRecord is never attached
// to a PublicationAnchor instance, never serialized inside one, and
// never carried across application/PublicationAnchorExchange.js's own
// export/import boundary (see application/
// LocalAnchorKnowledgeStore.js's own header on why this stays strictly
// local, per-replica bookkeeping). Two replicas that hold the identical,
// identically-signed anchor may each hold a completely different
// AnchorKnowledgeRecord for it — see this milestone's own docs/
// Roadmap.md entry, "Replicas can agree on a claim while having
// different histories of how they learned it."
//
// NOT A TRUST SIGNAL. `acquisition.kind` is one of application/
// AnchorAcquisitionKind.js's three values, and nothing about this record
// — not the kind, not how early `firstSeenAt` is — may ever be read as
// "more trustworthy," "more authoritative," or "preferred." See that
// file's own header.
export function createAnchorKnowledgeRecord({ anchorId, acquisitionKind, firstSeenAt = new Date() } = {}) {
    if (!anchorId || typeof anchorId !== 'string' || !anchorId.trim()) {
        throw new Error('createAnchorKnowledgeRecord: an anchorId is required');
    }
    if (!isValidAnchorAcquisitionKind(acquisitionKind)) {
        throw new Error('createAnchorKnowledgeRecord: a valid AnchorAcquisitionKind is required');
    }
    const firstSeenAtDate = firstSeenAt instanceof Date ? firstSeenAt : new Date(firstSeenAt);
    if (Number.isNaN(firstSeenAtDate.getTime())) {
        throw new Error('createAnchorKnowledgeRecord: firstSeenAt must be a valid date');
    }
    return Object.freeze({
        anchorId,
        firstSeenAt: firstSeenAtDate,
        acquisition: Object.freeze({ kind: acquisitionKind })
    });
}

// Turns a stored, plain-JSON envelope (application/
// LocalAnchorKnowledgeStore.js's own on-disk shape) back into a real,
// frozen record. Never validates whether `anchorId` names a real,
// cataloged anchor — this file has no catalog reference at all, exactly
// as application/PublicationAnchorVerificationObservation.js's own
// factory never checks one either.
export function anchorKnowledgeRecordFromJSON(json) {
    if (!json || typeof json !== 'object') {
        throw new Error('anchorKnowledgeRecordFromJSON: a record is required');
    }
    return createAnchorKnowledgeRecord({
        anchorId: json.anchorId,
        acquisitionKind: json.acquisition ? json.acquisition.kind : undefined,
        firstSeenAt: json.firstSeenAt
    });
}

export function anchorKnowledgeRecordToJSON(record) {
    return {
        anchorId: record.anchorId,
        firstSeenAt: record.firstSeenAt.toISOString(),
        acquisition: { kind: record.acquisition.kind }
    };
}

// Re-exported so a caller that only imports this file still has the
// vocabulary to construct one — mirrors application/
// PublicationAnchorVerificationObservation.js's own sibling,
// application/AnchorVerificationOutcome.js, being imported separately by
// every caller instead.
export { AnchorAcquisitionKind };
