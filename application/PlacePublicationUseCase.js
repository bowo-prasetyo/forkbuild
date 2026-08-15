import { WorldPlacement } from '../core/WorldPlacement.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { PlacementRecord } from '../core/PlacementRecord.js';

// Creates a WorldPlacement and a PlacementRecord for a published document.
//
// As of 0.2.16 the placement revision is also SIGNED: the current
// user's SigningIdentity becomes the record's ownerIdentity, and the
// canonical signing envelope receives a real Ed25519 signature before
// the record enters the registry. "Publication ownership" and
// "placement authorization" remain distinct authorities — this
// milestone's rule is simply: the placement creator signs the
// placement revision. Delegation is 0.2.17.
export class PlacePublicationUseCase {
    constructor(
        spatialIndexProvider,
        discoveryProvider,
        loadDocumentUseCase,
        brickRegistry,
        placementRegistry = null,
        identityProvider = null
    ) {
        this._spatialIndexProvider = spatialIndexProvider;
        this._discoveryProvider = discoveryProvider;
        this._loadDocumentUseCase = loadDocumentUseCase;
        this._brickRegistry = brickRegistry;
        this._placementRegistry = placementRegistry;
        this._identityProvider = identityProvider;
    }

    execute(publicationId, position, options = {}) {
        const publication = this._discoveryProvider.findById(publicationId);
        if (!publication) {
            throw new Error(`PlacePublicationUseCase: publication ${publicationId} not found`);
        }

        let bounds = options.bounds;
        if (!bounds) {
            try {
                const document = this._loadDocumentUseCase.execute(publicationId);
                bounds = SpatialBounds.fromWorld(document.world, this._brickRegistry);
            } catch (e) {
                bounds = new SpatialBounds({
                    min: { x: -0.5, y: 0, z: -0.5 },
                    max: { x: 0.5, y: 1, z: 0.5 }
                });
            }
        }

        // Create the WorldPlacement (existing behavior, unchanged).
        const placement = new WorldPlacement({
            publicationId,
            position,
            rotation: options.rotation || { x: 0, y: 0, z: 0 },
            scale: options.scale || { x: 1, y: 1, z: 1 },
            bounds
        });
        this._spatialIndexProvider.add(placement);

        // Create the PlacementRecord.
        if (this._placementRegistry) {
            const currentUser = this._identityProvider
                ? this._identityProvider.currentUser()
                : null;
            const owner = currentUser ? currentUser.username : null;
            let record = new PlacementRecord({
                placementId: placement.id,
                publicationId,
                owner,
                position,
                rotation: options.rotation || { x: 0, y: 0, z: 0 },
                scale: options.scale || { x: 1, y: 1, z: 1 },
                bounds,
                revision: 1
            });
            const hash = record.computeContentHash();
            record = new PlacementRecord({ ...record.toJSON(), contentHash: hash });

            // 0.2.16: owner identity + signature before registration.
            if (currentUser && this._identityProvider
                && typeof this._identityProvider.signCanonical === 'function') {
                record = record.withOwnerIdentity(this._identityProvider.getSigningIdentity().toJSON());
                record = record.withSignature(
                    this._identityProvider.signCanonical(record.getSigningDescriptor())
                );
            }
            this._placementRegistry.add(record);
        }
        return placement;
    }
}
