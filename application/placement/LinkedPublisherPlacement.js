import { LocalPlacementRegistry } from '../../placement/LocalPlacementRegistry.js';
import { LocalSpatialIndexProvider } from '../../spatial/LocalSpatialIndexProvider.js';
import { LocalAuthorizationVerifier } from '../../identity/LocalAuthorizationVerifier.js';
import { AdoptPublisherPlacementUseCase } from './AdoptPublisherPlacementUseCase.js';
import { latestPublisherPlacementRecord } from './PublisherPlacementClaim.js';

// A publisher's signed placement for a Publication opened from a link
// (application/publication/OpenPublicationLink.js), outside World View:
// written to this device's placement registry and spatial index, the same
// storage World View reads when it opens, so the build stands where its
// publisher put it rather than at a stand-in position.
//
//   has(publication)  whether this device already holds a placement signed
//                     by the Publication's publisher;
//   adopt(record)     AdoptPublisherPlacementUseCase's checks and outcome:
//                     only the publisher's signature, newest revision wins.
export function createLinkedPublisherPlacement({ storageProvider, findPublicationById }) {
    const placementRegistry = new LocalPlacementRegistry(storageProvider, new LocalSpatialIndexProvider(storageProvider));
    const adoptPublisherPlacementUseCase = new AdoptPublisherPlacementUseCase({
        placementRegistry,
        verifier: new LocalAuthorizationVerifier(),
        findPublicationById
    });
    return Object.freeze({
        has(publication) {
            const publisherId = publication && publication.publisherIdentity ? publication.publisherIdentity.id : null;
            return latestPublisherPlacementRecord(placementRegistry.findByPublicationId(publication.id), publisherId) !== null;
        },
        adopt(record) {
            return adoptPublisherPlacementUseCase.execute(record);
        }
    });
}
