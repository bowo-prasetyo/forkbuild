import { WorldPlacement } from '../core/WorldPlacement.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { CausalStamp } from '../core/CausalStamp.js';

// Creates a WorldPlacement and a PlacementRecord for a published document.
//
// As of 0.2.16 the placement revision is also SIGNED: the current
// user's SigningIdentity becomes the record's ownerIdentity, and the
// canonical signing envelope receives a real Ed25519 signature before
// the record enters the registry. "Publication ownership" and
// "placement authorization" remain distinct authorities — this
// milestone's rule is simply: the placement creator signs the
// placement revision. Delegation is 0.2.17.
//
// As of 0.2.18 a signed placement also starts its causal history: its
// CausalStamp is advanced for the signer's did:key, giving revision 1
// a real (not merely integer) causal position — { <did:key>: 1 } — so
// a concurrent revision 1 created independently by a different signer
// (two nodes placing the "same" publication without knowing about each
// other) is recognized as CONCURRENT, not silently overwritten, once
// the two replicas exchange revisions. It has no parents: revision 1
// is the genesis of a placement's causal history.
export class PlacePublicationUseCase {
    constructor(
        spatialIndexProvider,
        discoveryProvider,
        loadDocumentUseCase,
        brickRegistry,
        placementRegistry = null,
		identityProvider = null,
		spatialIndexBuilder = null // FIX: Add builder parameter
    ) {
        this._spatialIndexProvider = spatialIndexProvider;
        this._discoveryProvider = discoveryProvider;
        this._loadDocumentUseCase = loadDocumentUseCase;
        this._brickRegistry = brickRegistry;
        this._placementRegistry = placementRegistry;
        this._identityProvider = identityProvider;
		this._spatialIndexBuilder = spatialIndexBuilder; // FIX: Store builder
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

            // 0.2.16: owner identity. 0.2.18: causal genesis. Both are
            // metadata the contentHash formula deliberately excludes, so
            // setting them before computing the hash vs. after makes no
            // difference to the hash itself — this order just avoids
            // computing it twice.
            if (currentUser && this._identityProvider
                && typeof this._identityProvider.signCanonical === 'function') {
                const signingIdentity = this._identityProvider.getSigningIdentity();
                record = record.withOwnerIdentity(signingIdentity.toJSON());
                record = record.withCausalHistory(new CausalStamp().advance(signingIdentity.id), []);
            }

            record = record.withContentHash(record.computeContentHash());

            // 0.2.16: signature, now covering the causal genesis too.
            if (currentUser && this._identityProvider
                && typeof this._identityProvider.signCanonical === 'function') {
                record = record.withSignature(
                    this._identityProvider.signCanonical(record.getSigningDescriptor())
                );
            }
            this._placementRegistry.add(record);
			// FIX: Update the decentralized spatial index
			if (this._spatialIndexBuilder) {
				this._spatialIndexBuilder.addOrUpdatePlacement(record);
			}
        }
        return placement;
    }
}
