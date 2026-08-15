import { PlacementRecord } from '../core/PlacementRecord.js';

// Moves a placement to a new global position.
//
// As of 0.2.10 this creates a new revision of the PlacementRecord.
// As of 0.2.15 the revision is published as immutable index content.
// As of 0.2.16 the new revision is SIGNED: moving a placement is an
// act of authorization, and the new immutable revision carries the
// signer's signature. The previous revision's signature stays valid
// for the previous revision — signatures never move between revisions.
export class MoveWorldPlacementUseCase {
    constructor(spatialIndexProvider, placementRegistry = null, spatialIndexBuilder = null, identityProvider = null) {
        this._spatialIndexProvider = spatialIndexProvider;
        this._placementRegistry = placementRegistry;
        this._spatialIndexBuilder = spatialIndexBuilder;
        this._identityProvider = identityProvider;
    }

    execute(placementId, newPosition) {
        const placement = this._spatialIndexProvider.get(placementId);
        if (!placement) {
            throw new Error(`MoveWorldPlacementUseCase: placement ${placementId} not found`);
        }

        // Update the WorldPlacement (existing behavior, unchanged).
        const updated = placement.withPosition(newPosition);
        this._spatialIndexProvider.update(updated);

        // Create a new revision of the PlacementRecord (0.2.10).
        if (this._placementRegistry) {
            const existingRecord = this._placementRegistry.get(placementId);
            if (existingRecord) {
                const newRecord = existingRecord.withPosition(newPosition);
                const hash = newRecord.computeContentHash();
                let prepared = new PlacementRecord({ ...newRecord.toJSON(), contentHash: hash });

                // 0.2.16: sign the new revision. Ownership stays with
                // the original ownerIdentity when one exists; a record
                // signed by anyone else fails authorization later —
                // exactly the invariant this milestone establishes.
                if (this._identityProvider
                    && typeof this._identityProvider.signCanonical === 'function'
                    && this._identityProvider.currentUser()) {
                    if (!prepared.ownerIdentity) {
                        prepared = prepared.withOwnerIdentity(
                            this._identityProvider.getSigningIdentity().toJSON()
                        );
                    }
                    prepared = prepared.withSignature(
                        this._identityProvider.signCanonical(prepared.getSigningDescriptor())
                    );
                }

                const updatedRecord = this._placementRegistry.update(prepared);

                // 0.2.15: publish the new immutable revision.
                if (this._spatialIndexBuilder) {
                    this._spatialIndexBuilder.addOrUpdatePlacement(updatedRecord);
                }
            }
        }
        return updated;
    }
}
