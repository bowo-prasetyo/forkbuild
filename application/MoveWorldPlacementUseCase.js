import { PlacementRecord } from '../core/PlacementRecord.js';
import { CausalStamp } from '../core/CausalStamp.js';
import { RevisionReference } from '../core/RevisionReference.js';

// Moves a placement to a new global position.
//
// As of 0.2.10 this creates a new revision of the PlacementRecord.
// As of 0.2.15 the revision is published as immutable index content.
// As of 0.2.16 the new revision is SIGNED: moving a placement is an
// act of authorization, and the new immutable revision carries the
// signer's signature. The previous revision's signature stays valid
// for the previous revision — signatures never move between revisions.
//
// As of 0.2.18 the new revision also advances the record's causal
// history: the signer's did:key gets its vector-clock component
// incremented, and the new revision records the exact prior revision
// (by content hash) as its parent. This is what lets a replica that
// later receives a DIFFERENT revision — created independently from the
// same parent, e.g. by another node acting for the same owner while
// disconnected — recognize a genuine CONCURRENT edit instead of
// assuming whichever one it saw first (or whichever has the higher
// revision number) is correct (replication/ReplicaMergeService.js).
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
                let prepared = existingRecord.withPosition(newPosition);

                // 0.2.16: sign the new revision. Ownership stays with
                // the original ownerIdentity when one exists; a record
                // signed by anyone else fails authorization later —
                // exactly the invariant this milestone establishes.
                if (this._identityProvider
                    && typeof this._identityProvider.signCanonical === 'function'
                    && this._identityProvider.currentUser()) {
                    const signingIdentity = this._identityProvider.getSigningIdentity();
                    if (!prepared.ownerIdentity) {
                        prepared = prepared.withOwnerIdentity(signingIdentity.toJSON());
                    }

                    // 0.2.18: advance causal history from the revision
                    // this move actually started from. A record with no
                    // prior causal stamp (legacy, or never causally
                    // initialized) starts a fresh vector clock rather
                    // than failing — its first causally-stamped
                    // revision simply has no causal ancestor to compare
                    // against yet.
                    const priorStamp = existingRecord.causalStamp || new CausalStamp();
                    const parent = new RevisionReference({
                        placementId: existingRecord.placementId,
                        revision: existingRecord.revision,
                        contentReference: { hash: existingRecord.contentHash }
                    });
                    prepared = prepared.withCausalHistory(
                        priorStamp.advance(signingIdentity.id),
                        [parent]
                    );

                    prepared = prepared.withContentHash(prepared.computeContentHash());
                    prepared = prepared.withSignature(
                        this._identityProvider.signCanonical(prepared.getSigningDescriptor())
                    );
                } else {
                    prepared = prepared.withContentHash(prepared.computeContentHash());
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
