// What a Snapshot announcement may say about where a Publication stands: its
// publisher's own signed placement, when this device holds one. Shared by
// World View's session (getPublisherPlacementRecord) and the Publications
// page, so both announce the same record.

// The most recently updated signed placement among `records` whose owner is
// `publisherId`, or null. Only a signed record counts: an unsigned one is
// this device's own bookkeeping, not the publisher's word.
export function latestPublisherPlacementRecord(records, publisherId) {
    if (!publisherId || !Array.isArray(records)) return null;
    const signed = records.filter((record) => record.signature && record.ownerIdentity && record.ownerIdentity.id === publisherId);
    if (signed.length === 0) return null;
    return signed.reduce((latest, record) => (record.updatedAt > latest.updatedAt ? record : latest));
}

// Looks a Publication's publisher placement up in a placement registry.
export class PublisherPlacementClaimLookup {
    constructor(placementRegistry) {
        if (!placementRegistry || typeof placementRegistry.findByPublicationId !== 'function') {
            throw new Error('PublisherPlacementClaimLookup: a placement registry with findByPublicationId() is required');
        }
        this._placementRegistry = placementRegistry;
    }

    // `{ publicationId, claimedPosition, placementRecord }` for a Publication
    // its publisher placed, as executeSnapshotDistributionCommand() takes
    // them; `{}` when this device holds no such placement, since
    // publicationId and claimedPosition travel together or not at all
    // (core/SnapshotDiscoveryEnvelope.js). Never throws.
    claimFor(publication) {
        if (!publication || !publication.id) return {};
        const publisherId = publication.publisherIdentity ? publication.publisherIdentity.id : null;
        let record = null;
        try {
            record = latestPublisherPlacementRecord(this._placementRegistry.findByPublicationId(publication.id), publisherId);
        } catch {
            record = null;
        }
        if (!record) return {};
        const placementRecord = record.toJSON();
        return { publicationId: publication.id, claimedPosition: { ...placementRecord.position }, placementRecord };
    }
}
