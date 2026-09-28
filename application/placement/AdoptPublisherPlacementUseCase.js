import { PlacementRecord } from '../../core/PlacementRecord.js';
import { evaluatePlacementPermission } from '../../core/PlacementPolicy.js';
import * as Ed25519 from '../../identity/Ed25519.js';

export const PublisherPlacementAdoption = Object.freeze({
    ADOPTED: 'adopted',
    // This device already holds this revision, or a later one.
    ALREADY_CURRENT: 'already-current',
    // The Publication isn't known here yet, so there is no publisher to check
    // the signer against. Try again once it is (Verify, a share, an encounter).
    PUBLICATION_UNKNOWN: 'publication-unknown',
    // Signed by someone other than the Publication's publisher.
    NOT_PUBLISHER: 'not-publisher',
    // Not a signed PlacementRecord, or it failed integrity or signature checks.
    INVALID: 'invalid'
});

// Takes the publisher's own signed PlacementRecord, announced beside a
// Snapshot, into this device's placement registry, so World View shows the
// build where its publisher put it instead of at a stand-in position.
//
// Anyone can announce a position; only the publisher can sign one that passes
// here. The signature is checked against the key of the Publication this
// device already knows, never against the key the record carries about
// itself, and that key must be the one its did:key names. A later revision
// (the publisher moved it) replaces an earlier one; an older one arriving
// late never does.
//
// Deliberately not the retired peer-replication merge (ReplicaMergeService;
// see tests/HistoricalPlacementReplicationBoundaryAudit.test.js): a single
// signer's revisions of one placement need no vector-clock conflict handling.
export class AdoptPublisherPlacementUseCase {
    constructor({ placementRegistry, verifier, findPublicationById }) {
        if (!placementRegistry || typeof placementRegistry.get !== 'function') {
            throw new Error('AdoptPublisherPlacementUseCase: a placementRegistry is required');
        }
        if (!verifier || typeof verifier.verifyDescriptor !== 'function') {
            throw new Error('AdoptPublisherPlacementUseCase: a verifier is required');
        }
        if (typeof findPublicationById !== 'function') {
            throw new Error('AdoptPublisherPlacementUseCase: findPublicationById is required');
        }
        this._placementRegistry = placementRegistry;
        this._verifier = verifier;
        this._findPublicationById = findPublicationById;
    }

    execute(recordJson) {
        let record;
        try {
            record = recordJson instanceof PlacementRecord ? recordJson : PlacementRecord.fromJSON(recordJson);
        } catch (err) {
            return { outcome: PublisherPlacementAdoption.INVALID };
        }
        if (!record || !record.signature || !record.ownerIdentity || !record.publicationId || !record.placementId) {
            return { outcome: PublisherPlacementAdoption.INVALID };
        }
        const publicationId = record.publicationId;
        const publication = this._findPublicationById(publicationId);
        if (!publication) {
            return { outcome: PublisherPlacementAdoption.PUBLICATION_UNKNOWN, publicationId };
        }
        const publisher = publication.publisherIdentity;
        if (!publisher || !publisher.id || record.ownerIdentity.id !== publisher.id
            || record.ownerIdentity.publicKey !== publisher.publicKey) {
            return { outcome: PublisherPlacementAdoption.NOT_PUBLISHER, publicationId };
        }
        if (!keyMatchesDid(publisher) || !record.verifyIntegrity()
            || !this._verifier.verifyDescriptor(record.getSigningDescriptor(), record.signature, publisher).valid
            || !evaluatePlacementPermission(publication, { identityId: publisher.id }).allowed) {
            return { outcome: PublisherPlacementAdoption.INVALID, publicationId };
        }

        const current = this._placementRegistry.get(record.placementId);
        if (current) {
            if (!current.ownerIdentity || current.ownerIdentity.id !== publisher.id) {
                // A placement id this device holds for someone else: never overwritten.
                return { outcome: PublisherPlacementAdoption.INVALID, publicationId };
            }
            if (current.contentHash === record.contentHash || record.revision <= current.revision) {
                return { outcome: PublisherPlacementAdoption.ALREADY_CURRENT, publicationId };
            }
            this._placementRegistry.update(record);
        } else {
            this._placementRegistry.add(record);
        }
        return { outcome: PublisherPlacementAdoption.ADOPTED, publicationId, placementId: record.placementId };
    }
}

function keyMatchesDid(identity) {
    try {
        const bytes = Ed25519.didKeyToPublicKey(identity.id);
        return !!bytes && Ed25519.bytesToHex(bytes) === String(identity.publicKey).toLowerCase();
    } catch (err) {
        return false;
    }
}
