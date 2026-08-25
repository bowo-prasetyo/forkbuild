import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';
import { ContentReference } from '../core/ContentReference.js';
import { validatePublicationSnapshotPlacement } from './PublicationSnapshotPlacementValidator.js';
import { SnapshotPlacementResolutionOutcome } from './SnapshotPlacementResolutionOutcome.js';

// 0.8.18 — Decentralized Snapshot Placement Foundation.
//
// The one place this codebase checks a core/
// PublicationSnapshotPlacement.js record AND actually retrieves the
// bytes it claims are available. Mirrors application/
// ExternalAnchorVerifier.js's discipline for the signature/envelope
// half, and application/PublicationResolver.js's own retrieve-then-
// verify-bytes steps for the content half — narrowed to what a
// placement actually is: a locator for EXISTING content, never new
// content of its own to validate/construct/verify a second time (a
// PublicationSnapshotPlacement wraps no domain object the way a
// DecentralizedPublication's `kindPlugin` does; the placement itself IS
// the entire claim).
//
//   1. validate envelope   — is this even a well-formed
//                             PublicationSnapshotPlacement?
//   2. construct envelope  — a real instance, never trusted as-is
//   3. verify signature    — did the claimed placerIdentity really sign
//                             exactly this publicationId/contentHash/
//                             storage/locator tuple?
//   4. resolve a store     — an explicit `contentStore` (the caller's
//                             own) or a lookup in a caller-supplied
//                             `storeRegistry` (application/
//                             SnapshotPlacementStoreRegistry.js) for
//                             this placement's own `storage` — never a
//                             store this class or anything it imports
//                             hard-codes
//   5. retrieve bytes       — from that store, addressed by an AD-HOC
//                             core/ContentReference.js this class builds
//                             from the placement's own contentHash/
//                             locator/storage — never the store's put()
//                             called a second time, and never anything
//                             the ORIGINAL publisher/Publication.js's own
//                             contentReference carries, which this class
//                             never reads at all
//   6. verify bytes         — do the retrieved bytes actually hash to
//                             what the placement claims?
//
// Never: retrieve -> trust. A placement that fails any step is rejected
// with a specific reason; `bytes` is set only on RESOLVED.
//
// This class never decides whether the retrieved bytes are the
// AUTHENTIC snapshot for their publication, never cross-checks them
// against a locally known publisher/Publication.js record, and never
// fetches from a network by itself — content/ContentStore.js already
// owns "how do bytes actually move." A caller that wants the FULL
// discipline application/PublicationResolver.js already applies to a
// DecentralizedPublication (steps 6-10: parse/validate/construct/verify
// the wrapped content) runs that separately once it has these bytes —
// this class only ever answers "can the locator this placement claims
// actually produce the exact bytes it says it can," nothing more.
export class SnapshotPlacementResolver {
    constructor(verifier) {
        if (!verifier || typeof verifier.verifyPublicationSnapshotPlacement !== 'function') {
            throw new Error('SnapshotPlacementResolver: an authorization verifier is required');
        }
        this._verifier = verifier;
    }

    // Resolves to `{ outcome, bytes, placement, reason }` — `outcome`
    // always one of application/SnapshotPlacementResolutionOutcome.js's
    // own values, `placement` the constructed PublicationSnapshotPlacement
    // once the envelope itself parsed (even on later failure, so a
    // caller can log or retry against a specific placement id), `bytes`
    // set only when `outcome === RESOLVED`, `reason` a human-readable
    // string on any other outcome. Never throws for anything about the
    // placement, its store, or the network — only for a contract
    // violation by the CALLER (see the constructor above).
    //
    // `contentStore` (explicit) always wins over a lookup in
    // `storeRegistry` — a caller that passed both meant the explicit one.
    async resolve(placementJson, { contentStore = null, storeRegistry = null } = {}) {
        // 1-2. validate + construct the envelope.
        let placement;
        try {
            validatePublicationSnapshotPlacement(placementJson);
            placement = PublicationSnapshotPlacement.fromJSON(placementJson);
        } catch (error) {
            return this._failure(SnapshotPlacementResolutionOutcome.INVALID_ENVELOPE, error.message);
        }

        // 3. verify the placement's own signature.
        const signatureResult = this._verifier.verifyPublicationSnapshotPlacement(placementJson);
        if (!signatureResult.valid) {
            return this._failure(SnapshotPlacementResolutionOutcome.INVALID_SIGNATURE, signatureResult.reason, placement);
        }

        // 4. resolve which store to retrieve from.
        const resolvedStore = contentStore || (storeRegistry ? storeRegistry.get(placement.storage) : null);
        if (!resolvedStore) {
            return this._failure(SnapshotPlacementResolutionOutcome.STORE_UNAVAILABLE, `no content store available for storage '${placement.storage}'`, placement);
        }

        // 5. retrieve the referenced bytes via an ad-hoc reference built
        // from the placement's OWN claims — never the placement's own
        // publication's contentReference, which this class never reads.
        const reference = new ContentReference({
            hash: placement.contentHash,
            storage: placement.storage,
            uri: placement.locator
        });
        let bytes;
        try {
            bytes = await resolvedStore.get(reference);
        } catch (error) {
            return this._failure(SnapshotPlacementResolutionOutcome.CONTENT_UNAVAILABLE, error.message, placement);
        }
        if (bytes === null || bytes === undefined) {
            return this._failure(SnapshotPlacementResolutionOutcome.CONTENT_UNAVAILABLE, 'the referenced content is not available from this content store', placement);
        }

        // 6. verify the retrieved bytes actually match what was placed.
        if (!reference.verify(bytes)) {
            return this._failure(SnapshotPlacementResolutionOutcome.CONTENT_HASH_MISMATCH, 'retrieved content does not match this placement\'s own contentHash', placement);
        }

        return { outcome: SnapshotPlacementResolutionOutcome.RESOLVED, bytes, placement, reason: null };
    }

    _failure(outcome, reason, placement = null) {
        return { outcome, bytes: null, placement, reason };
    }
}
